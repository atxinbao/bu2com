import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

export const NIGHTLY_CHECKS = Object.freeze([
  {
    id: "ledger_fault_injection",
    program: "node",
    args: [
      "--test",
      "sandbox/atomicity.test.mjs",
      "sandbox/la01-confirmed-unposted-refunds.test.mjs",
      "sandbox/la01-refund-request-binding.test.mjs",
      "sandbox/x402.test.mjs",
    ],
  },
  {
    id: "ledger_property_and_capacity",
    program: "node",
    args: ["--test", "sandbox/ledger-nightly.test.mjs"],
  },
  {
    id: "ledger_migration_and_recovery",
    program: "node",
    args: [
      "--test",
      "sandbox/persistence.test.mjs",
      "sandbox/la05b.test.mjs",
      "deploy/runtime-assurance.test.mjs",
      "deploy/operations.test.mjs",
    ],
  },
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const gitValue = (cwd, args, fallback) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

const summaryNumber = (output, label) => {
  const match = output.match(new RegExp(`(?:#|ℹ) ${label} (\\d+)`));
  return match ? Number(match[1]) : null;
};

export function summarizeNodeTest(output) {
  return {
    tests: summaryNumber(output, "tests"),
    passed: summaryNumber(output, "pass"),
    failed: summaryNumber(output, "fail"),
    skipped: summaryNumber(output, "skipped") ?? 0,
    todo: summaryNumber(output, "todo") ?? 0,
  };
}

export function validateNightlyEvidence(evidence) {
  const expectedIds = NIGHTLY_CHECKS.map((check) => check.id);
  const actualIds = evidence?.checks?.map((check) => check.id) ?? [];
  return (
    evidence?.schema_version === "ci04.ledger-resilience.v1" &&
    evidence?.status === "passed" &&
    evidence?.source?.commit?.match(/^[0-9a-f]{40}$/) &&
    evidence?.source?.tree?.match(/^[0-9a-f]{40}$/) &&
    JSON.stringify(actualIds) === JSON.stringify(expectedIds) &&
    evidence.checks.every(
      (check) =>
        check.status === "passed" &&
        check.exit_code === 0 &&
        check.test_summary?.tests > 0 &&
        check.test_summary?.passed === check.test_summary.tests &&
        check.test_summary?.failed === 0 &&
        check.test_summary?.skipped === 0 &&
        check.test_summary?.todo === 0 &&
        /^[0-9a-f]{64}$/.test(check.logs?.stdout_sha256 ?? "") &&
        /^[0-9a-f]{64}$/.test(check.logs?.stderr_sha256 ?? ""),
    ) &&
    Array.isArray(evidence.property_seeds) &&
    evidence.property_seeds.length >= 4 &&
    evidence.boundary?.environment === "local" &&
    evidence.boundary?.execution_backend === "simulated" &&
    evidence.boundary?.provider_call === false &&
    evidence.boundary?.signer_loaded === false &&
    evidence.boundary?.payment_execution_attempted === false &&
    evidence.boundary?.live_enabled === false &&
    evidence.boundary?.la06b === "not_executed"
  );
}

export function runNightlyResilience({
  cwd = root,
  outputDirectory = join(root, "nightly-logs"),
  checks = NIGHTLY_CHECKS,
  env = process.env,
  spawn = spawnSync,
} = {}) {
  mkdirSync(outputDirectory, { recursive: true });
  const seeds = (env.BU2_NIGHTLY_SEEDS ?? "ci04-alpha,ci04-beta,ci04-gamma,ci04-delta")
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean);
  const entries = [];

  for (const check of checks) {
    const stdoutPath = join(outputDirectory, `${check.id}.stdout.log`);
    const stderrPath = join(outputDirectory, `${check.id}.stderr.log`);
    const startedAt = Date.now();
    const result = spawn(check.program, check.args, {
      cwd,
      env: { ...env, BU2_NIGHTLY_SEEDS: seeds.join(",") },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    writeFileSync(stdoutPath, stdout);
    writeFileSync(stderrPath, stderr);
    const testSummary = summarizeNodeTest(`${stdout}\n${stderr}`);
    const passed =
      result.status === 0 &&
      testSummary.tests > 0 &&
      testSummary.passed === testSummary.tests &&
      testSummary.failed === 0 &&
      testSummary.skipped === 0 &&
      testSummary.todo === 0;
    entries.push({
      id: check.id,
      command: [check.program, ...check.args].join(" "),
      status: passed ? "passed" : "failed",
      exit_code: result.status,
      signal: result.signal,
      duration_ms: Date.now() - startedAt,
      test_summary: testSummary,
      logs: {
        stdout: relative(cwd, stdoutPath),
        stdout_sha256: sha256(readFileSync(stdoutPath)),
        stderr: relative(cwd, stderrPath),
        stderr_sha256: sha256(readFileSync(stderrPath)),
      },
    });
  }

  const evidence = {
    schema_version: "ci04.ledger-resilience.v1",
    status: entries.every((entry) => entry.status === "passed") ? "passed" : "failed",
    source: {
      commit: gitValue(cwd, ["rev-parse", "HEAD"], "working-tree"),
      tree: gitValue(cwd, ["rev-parse", "HEAD^{tree}"], "working-tree"),
      dirty_status: gitValue(cwd, ["status", "--porcelain"], "unknown"),
    },
    runtime: {
      node_version: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    property_seeds: seeds,
    checks: entries,
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      provider_call: false,
      signer_loaded: false,
      payment_execution_attempted: false,
      live_enabled: false,
      la06b: "not_executed",
    },
  };
  return evidence;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const evidencePath = resolve(process.argv[2] ?? "ledger-resilience-evidence.json");
  const outputDirectory = resolve(process.argv[3] ?? "nightly-logs");
  const evidence = runNightlyResilience({ outputDirectory });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (!validateNightlyEvidence(evidence)) {
    process.stderr.write(
      `Ledger resilience checks failed; inspect ${evidencePath} and ${outputDirectory}.\n`,
    );
    process.exitCode = 1;
  }
}
