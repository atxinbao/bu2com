import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { validateEvidence } from "./validate-evidence.mjs";

const ids = ["sandbox_full_regression", "la06a_targeted_boundary_tests", "deployment_and_hosted_contracts", "contract_validation", "typescript_sdk", "prototype_lint", "prototype_build"];
const testIds = new Set(ids.filter((id) => !["contract_validation", "prototype_lint", "prototype_build"].includes(id)));

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "bu2-ci-evidence-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q");
  git("config", "user.email", "ci-fixture@example.invalid");
  git("config", "user.name", "BU2 CI fixture");
  writeFileSync(join(root, "tracked.txt"), "fixture\n");
  git("add", "tracked.txt");
  git("commit", "-qm", "Synthetic CI evidence fixture");
  const sha = git("rev-parse", "HEAD");
  const foundation = {
    schema_version: "la06a.v1",
    gate: "ledger_assurance_local_foundation",
    status: "passed",
    source_commit: sha,
    workflow_run: { id: "101", attempt: "1", job: "foundation" },
    environment: "local",
    execution_status: "execution_disabled",
    checks: ids.map((id) => ({
      id,
      command: "fixture command",
      status: "passed",
      exit_code: 0,
      test_summary: testIds.has(id)
        ? { tests: 2, passed: 2, failed: 0 }
        : { tests: null, passed: null, failed: null },
    })),
    external_sandbox_bilateral: { status: "not_executed", accepted: false },
    authorization: { payment_execution_attempted: false, live_enabled: false },
  };
  const runtime = {
    schema_version: "rt01.v1",
    status: "passed",
    source_commit: sha,
    workflow_run: { id: "101", attempt: "1", job: "runtime" },
    authorization: { payment_execution_attempted: false, signer_loaded: false, live_enabled: false },
  };
  const options = {
    cwd: root,
    foundationPath: join(root, "foundation.json"),
    runtimePath: join(root, "runtime.json"),
    foundationLogPath: join(root, "foundation.stderr"),
    runtimeLogPath: join(root, "runtime.stderr"),
    env: { GITHUB_SHA: sha, GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1" },
  };
  writeFileSync(
    options.foundationLogPath,
    ids.map((id) => `===== BU2 LA-06a CHECK ${id} STDOUT =====\nfixture\n===== BU2 LA-06a CHECK ${id} STDERR =====\n===== BU2 LA-06a CHECK ${id} END =====`).join("\n"),
  );
  writeFileSync(options.runtimeLogPath, "raw runtime fixture\n");
  const run = () => {
    writeFileSync(options.foundationPath, JSON.stringify(foundation));
    writeFileSync(options.runtimePath, JSON.stringify(runtime));
    return validateEvidence(options);
  };
  return {
    root,
    sha,
    foundation,
    runtime,
    options,
    run,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
};

const scenario = (name, fn) => test(name, () => {
  const value = fixture();
  try {
    fn(value);
  } finally {
    value.close();
  }
});

scenario("CI-02 accepts same-source evidence and generated untracked artifacts", (value) => {
  const result = value.run();
  assert.equal(result.schema_version, "bu2.ci.v1");
  assert.equal(result.source.commit, value.sha);
  assert.deepEqual(result.checks.map((check) => check.id), ids);
});

scenario("CI-02 rejects stale or missing foundation source_commit", (value) => {
  value.foundation.source_commit = "0".repeat(40);
  assert.throws(value.run, /source_commit|commit/i);
  delete value.foundation.source_commit;
  assert.throws(value.run, /source_commit|commit/i);
});

scenario("CI-02 rejects stale runtime source_commit", (value) => {
  value.runtime.source_commit = "0".repeat(40);
  assert.throws(value.run, /source_commit|commit/i);
});

scenario("CI-02 rejects workflow run or attempt drift", (value) => {
  value.foundation.workflow_run.attempt = "2";
  assert.throws(value.run, /RUN_ATTEMPT|attempt/i);
  value.foundation.workflow_run.attempt = "1";
  value.runtime.workflow_run.id = "102";
  assert.throws(value.run, /RUN_ID|run/i);
});

scenario("CI-02 rejects null, failed, incomplete, or zero mandatory test summaries", (value) => {
  const summary = value.foundation.checks[0].test_summary;
  value.foundation.checks[0].test_summary = { tests: null, passed: null, failed: null };
  assert.throws(value.run, /test|summary/i);
  value.foundation.checks[0].test_summary = { tests: 2, passed: 1, failed: 1 };
  assert.throws(value.run, /test|summary/i);
  value.foundation.checks[0].test_summary = { tests: 2, passed: 1, failed: 0 };
  assert.throws(value.run, /test|summary/i);
  value.foundation.checks[0].test_summary = { tests: 0, passed: 0, failed: 0 };
  assert.throws(value.run, /test/i);
  value.foundation.checks[0].test_summary = summary;
});

scenario("CI-02 accepts null summaries for command-only checks", (value) => {
  assert.equal(value.run().checks.find((check) => check.id === "contract_validation").test_summary.tests, null);
});

scenario("CI-02 rejects absent required log files", (value) => {
  rmSync(value.options.foundationLogPath);
  assert.throws(value.run, /log/i);
});

scenario("CI-02 rejects incomplete foundation raw logs", (value) => {
  writeFileSync(value.options.foundationLogPath, "===== BU2 LA-06a CHECK sandbox_full_regression STDOUT =====\n");
  assert.throws(value.run, /raw log|boundary|check/i);
});

scenario("CI-02 rejects modified tracked source", (value) => {
  writeFileSync(join(value.root, "tracked.txt"), "modified\n");
  assert.throws(value.run, /dirty|tracked|source/i);
});

scenario("CI-02 rejects contradictory external execution claims", (value) => {
  value.foundation.external_sandbox_bilateral = { status: "accepted", accepted: true };
  assert.throws(value.run, /boundary|external/i);
});

scenario("CI-02 retains duplicate or unknown check rejection", (value) => {
  value.foundation.checks[1] = { ...value.foundation.checks[0] };
  assert.throws(value.run, /incomplete|duplicated|unknown/);
});
