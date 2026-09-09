import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CHECKS = [
  {
    id: "sandbox_full_regression",
    command: "npm --prefix sandbox test",
    program: "npm",
    args: ["--prefix", "sandbox", "test"],
    coverage: ["full_repository_sandbox_regression"],
  },
  {
    id: "la06a_targeted_boundary_tests",
    command: "npm --prefix sandbox run test:la06a",
    program: "npm",
    args: ["--prefix", "sandbox", "run", "test:la06a"],
    coverage: ["fault_injection", "property_checks", "cross_tenant"],
  },
  {
    id: "deployment_and_hosted_contracts",
    command:
      "node --test deploy/deployment-contract.test.mjs deploy/operations.test.mjs deploy/hosted-sandbox.test.mjs deploy/hosted-sandbox-deployment.test.mjs deploy/hosted-sandbox-evidence-schema.test.mjs deploy/f16b-hosted-qualification.test.mjs",
    program: "node",
    args: [
      "--test",
      "deploy/deployment-contract.test.mjs",
      "deploy/operations.test.mjs",
      "deploy/hosted-sandbox.test.mjs",
      "deploy/hosted-sandbox-deployment.test.mjs",
      "deploy/hosted-sandbox-evidence-schema.test.mjs",
      "deploy/f16b-hosted-qualification.test.mjs",
    ],
    coverage: ["deployment_boundary", "hosted_contract_boundary"],
  },
  {
    id: "contract_validation",
    command: "node docs/03-technical/validate-contract.mjs",
    program: "node",
    args: ["docs/03-technical/validate-contract.mjs"],
    coverage: ["api_and_mcp_contract"],
  },
  {
    id: "typescript_sdk",
    command: "npm --prefix packages/typescript-sdk test",
    program: "npm",
    args: ["--prefix", "packages/typescript-sdk", "test"],
    coverage: ["sdk_regression"],
  },
  {
    id: "prototype_lint",
    command: "npm --prefix prototype run lint",
    program: "npm",
    args: ["--prefix", "prototype", "run", "lint"],
    coverage: ["prototype_quality"],
  },
  {
    id: "prototype_build",
    command: "npm --prefix prototype run build",
    program: "npm",
    args: ["--prefix", "prototype", "run", "build"],
    coverage: ["prototype_build"],
  },
];

const testSummary = (output) => {
  const number = (pattern) => {
    const match = output.match(pattern);
    return match ? Number(match[1]) : null;
  };
  return {
    tests: number(/(?:#|ℹ) tests (\d+)/),
    passed: number(/(?:#|ℹ) pass (\d+)/),
    failed: number(/(?:#|ℹ) fail (\d+)/),
  };
};

const tail = (value, max = 600) => value.trim().slice(-max);

const rawCheckLog = (id, stdout, stderr) =>
  `\n===== BU2 LA-06a CHECK ${id} STDOUT =====\n${stdout ?? ""}` +
  `\n===== BU2 LA-06a CHECK ${id} STDERR =====\n${stderr ?? ""}` +
  `\n===== BU2 LA-06a CHECK ${id} END =====\n`;

const currentCommit = (cwd) => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "working-tree";
  }
};

export function validateLa06aEvidence(evidence) {
  return (
    evidence?.schema_version === "la06a.v1" &&
    evidence.gate === "ledger_assurance_local_foundation" &&
    evidence.status === "passed" &&
    evidence.environment === "local" &&
    evidence.execution_status === "execution_disabled" &&
    Array.isArray(evidence.checks) &&
    evidence.checks.length === CHECKS.length &&
    evidence.checks.every((check) => check.status === "passed") &&
    evidence.external_sandbox_bilateral?.accepted === false &&
    evidence.external_sandbox_bilateral?.status === "not_executed" &&
    evidence.authorization?.payment_execution_attempted === false &&
    evidence.authorization?.live_enabled === false
  );
}

export function runLa06aLocalGate({ cwd = root, env = process.env, writeLog = null } = {}) {
  const checks = [];
  for (const check of CHECKS) {
    const startedAt = Date.now();
    const result = spawnSync(check.program, check.args, {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (writeLog) writeLog(rawCheckLog(check.id, result.stdout, result.stderr));
    const entry = {
      id: check.id,
      command: check.command,
      status: result.status === 0 ? "passed" : "failed",
      exit_code: result.status,
      duration_ms: Date.now() - startedAt,
      coverage: check.coverage,
      test_summary: testSummary(output),
    };
    if (result.status !== 0) {
      entry.output_tail = tail(output);
      throw Object.assign(new Error(`LA-06a check failed: ${check.id}`), {
        code: "la06a_check_failed",
        evidence: { status: "failed", failed_check: entry, checks },
      });
    }
    checks.push(entry);
  }
  return {
    schema_version: "la06a.v1",
    gate: "ledger_assurance_local_foundation",
    status: "passed",
    source_commit: process.env.BU2_SOURCE_COMMIT ?? currentCommit(cwd),
    workflow_run: {
      id: env.GITHUB_RUN_ID ?? null,
      attempt: env.GITHUB_RUN_ATTEMPT ?? null,
      job: env.GITHUB_JOB ?? null,
    },
    environment: "local",
    execution_status: "execution_disabled",
    checks,
    coverage: {
      fault_injection: "covered_by_atomicity_unknown_recovery_and_operations_tests",
      property_checks: "covered_by_la06a_deterministic_amount_matrix",
      cross_tenant: "covered_by_access_control_identity_and_la06a_claim_tests",
      repository_regression: "covered_by_sandbox_deploy_contract_sdk_and_prototype_checks",
    },
    external_sandbox_bilateral: {
      status: "not_executed",
      accepted: false,
      reason:
        "No public Hosted endpoint, independent Activation, or real Base Sepolia bilateral settlement evidence is created by this local gate.",
    },
    authorization: {
      provider_call: false,
      signer_loaded: false,
      payment_execution_attempted: false,
      live_enabled: false,
    },
    next_gate: "LA-06b requires separately collected Sandbox/Testnet bilateral evidence and G-F independent review.",
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const evidence = runLa06aLocalGate({ writeLog: (value) => process.stderr.write(value) });
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (error.evidence) process.stderr.write(`${JSON.stringify(error.evidence, null, 2)}\n`);
    process.exitCode = 1;
  }
}
