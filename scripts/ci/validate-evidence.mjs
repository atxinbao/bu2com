import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REQUIRED_CHECKS = [
  "sandbox_full_regression",
  "la06a_targeted_boundary_tests",
  "deployment_and_hosted_contracts",
  "contract_validation",
  "typescript_sdk",
  "prototype_lint",
  "prototype_build",
];

const REQUIRED_TEST_CHECKS = new Set([
  "sandbox_full_regression",
  "la06a_targeted_boundary_tests",
  "deployment_and_hosted_contracts",
  "typescript_sdk",
]);

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function validateEvidence({ foundationPath, runtimePath, foundationLogPath = null, runtimeLogPath = null, cwd = process.cwd(), env = process.env } = {}) {
  if (!foundationPath || !runtimePath || !existsSync(foundationPath) || !existsSync(runtimePath)) {
    throw new Error("Required foundation/runtime evidence is missing");
  }
  let foundation;
  let runtime;
  try {
    foundation = JSON.parse(readFileSync(foundationPath, "utf8"));
    runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  } catch (error) {
    throw new Error(`Evidence JSON is invalid: ${error.message}`);
  }
  if (foundation.status !== "passed" || foundation.environment !== "local" || foundation.execution_status !== "execution_disabled") {
    throw new Error("Foundation evidence is not a passed local execution-disabled gate");
  }
  if (
    foundation.external_sandbox_bilateral?.accepted !== false ||
    foundation.external_sandbox_bilateral?.status !== "not_executed" ||
    foundation.authorization?.payment_execution_attempted !== false ||
    foundation.authorization?.live_enabled !== false
  ) {
    throw new Error("Foundation evidence has contradictory external execution boundary claims");
  }
  for (const path of [foundationLogPath, runtimeLogPath]) {
    if (!path || !existsSync(path)) throw new Error("Required evidence log file is missing");
  }
  const checks = foundation.checks ?? [];
  const ids = checks.map((check) => check.id);
  if (checks.length !== REQUIRED_CHECKS.length || new Set(ids).size !== ids.length || ids.some((id) => !REQUIRED_CHECKS.includes(id))) {
    throw new Error("Foundation evidence check set is incomplete, duplicated, or unknown");
  }
  const foundationLog = readFileSync(foundationLogPath, "utf8");
  for (const id of REQUIRED_CHECKS) {
    if (!foundationLog.includes(`===== BU2 LA-06a CHECK ${id} STDOUT =====`)) {
      throw new Error(`Foundation raw log is missing the check boundary: ${id}`);
    }
  }
  for (const check of checks) {
    if (check.status !== "passed" || check.exit_code !== 0) throw new Error(`Check did not pass: ${check.id}`);
    if (check.test_summary?.tests !== null && (!Number.isInteger(check.test_summary?.tests) || check.test_summary.tests <= 0)) {
      throw new Error(`Check has no executed tests: ${check.id}`);
    }
    if (REQUIRED_TEST_CHECKS.has(check.id)) {
      const summary = check.test_summary;
      if (
        !summary ||
        !Number.isSafeInteger(summary.tests) ||
        summary.tests <= 0 ||
        !Number.isSafeInteger(summary.passed) ||
        summary.passed !== summary.tests ||
        !Number.isSafeInteger(summary.failed) ||
        summary.failed !== 0
      ) {
        throw new Error(`Required test summary is missing, failed, or incomplete: ${check.id}`);
      }
    }
  }
  if (
    runtime.status !== "passed" ||
    runtime.authorization?.payment_execution_attempted !== false ||
    runtime.authorization?.signer_loaded !== false ||
    runtime.authorization?.live_enabled !== false
  ) {
    throw new Error("Runtime evidence failed execution-boundary validation");
  }
  const commit = git(["rev-parse", "HEAD"], cwd);
  if (foundation.source_commit !== commit || runtime.source_commit !== commit) {
    throw new Error("Foundation/runtime source_commit does not match the checked-out commit");
  }
  if (git(["status", "--porcelain", "--untracked-files=no"], cwd)) {
    throw new Error("Tracked source is dirty; evidence cannot identify an immutable candidate");
  }
  const tree = git(["rev-parse", "HEAD^{tree}"], cwd);
  const dirtyStatus = git(["status", "--porcelain"], cwd);
  if (env.GITHUB_SHA && env.GITHUB_SHA !== commit) throw new Error("Evidence commit does not match GITHUB_SHA");
  for (const [label, evidence] of [["Foundation", foundation], ["Runtime", runtime]]) {
    if (env.GITHUB_RUN_ID && evidence.workflow_run?.id !== env.GITHUB_RUN_ID) {
      throw new Error(`${label} evidence does not match GITHUB_RUN_ID`);
    }
    if (env.GITHUB_RUN_ATTEMPT && evidence.workflow_run?.attempt !== env.GITHUB_RUN_ATTEMPT) {
      throw new Error(`${label} evidence does not match GITHUB_RUN_ATTEMPT`);
    }
  }
  let pullRequest = null;
  if (env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH)) {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    if (event.pull_request) {
      pullRequest = {
        number: event.pull_request.number ?? null,
        head_sha: event.pull_request.head?.sha ?? null,
        base_sha: event.pull_request.base?.sha ?? null,
      };
    }
  }
  const artifacts = {};
  for (const [name, path] of [["foundation", foundationPath], ["runtime", runtimePath], ["foundation_log", foundationLogPath], ["runtime_log", runtimeLogPath]]) {
    if (path && existsSync(path)) artifacts[name] = hashFile(path);
  }
  return {
    schema_version: "bu2.ci.v1",
    source: {
      repository: env.GITHUB_REPOSITORY ?? null,
      commit,
      tree,
      dirty_status: dirtyStatus,
      event: env.GITHUB_EVENT_NAME ?? null,
      ref: env.GITHUB_REF ?? null,
      workflow_sha: env.GITHUB_WORKFLOW_SHA ?? null,
      pull_request: pullRequest,
    },
    run: {
      id: env.GITHUB_RUN_ID ?? null,
      attempt: env.GITHUB_RUN_ATTEMPT ?? null,
      job: env.GITHUB_JOB ?? null,
    },
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      execution_disabled: true,
      provider_call: false,
      live_enabled: false,
      la06b: "not_executed",
    },
    checks: checks.map((check) => ({ id: check.id, command: check.command, exit_code: check.exit_code, status: check.status, test_summary: check.test_summary })),
    artifacts,
  };
}

if (process.argv[1]?.endsWith("validate-evidence.mjs")) {
  try {
    const manifest = validateEvidence({ foundationPath: process.argv[2], runtimePath: process.argv[3], foundationLogPath: process.argv[4], runtimeLogPath: process.argv[5] });
    writeFileSync(process.argv[6] ?? "ci-evidence.json", `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
