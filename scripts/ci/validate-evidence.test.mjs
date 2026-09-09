import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { validateEvidence } from "./validate-evidence.mjs";

const ids = ["sandbox_full_regression", "la06a_targeted_boundary_tests", "deployment_and_hosted_contracts", "contract_validation", "typescript_sdk", "prototype_lint", "prototype_build"];
const foundation = { status: "passed", environment: "local", execution_status: "execution_disabled", checks: ids.map((id) => ({ id, status: "passed", exit_code: 0, test_summary: { tests: 1 } })) };

const fixtures = (value = foundation) => {
  const dir = mkdtempSync(join(tmpdir(), "bu2-ci-evidence-"));
  const foundationPath = join(dir, "foundation.json");
  const runtimePath = join(dir, "runtime.json");
  writeFileSync(foundationPath, JSON.stringify(value));
  writeFileSync(runtimePath, JSON.stringify({ status: "passed", authorization: { payment_execution_attempted: false, signer_loaded: false } }));
  return { foundationPath, runtimePath };
};

test("CI-02 accepts the exact seven-check evidence envelope", () => {
  const result = validateEvidence({ ...fixtures(), env: {} });
  assert.equal(result.schema_version, "bu2.ci.v1");
  assert.deepEqual(result.checks.map((check) => check.id), ids);
});

test("CI-02 rejects duplicate or unknown checks", () => {
  const result = fixtures({ ...foundation, checks: [...foundation.checks.slice(0, 6), { ...foundation.checks[0] }] });
  assert.throws(() => validateEvidence({ ...result, env: {} }), /incomplete|duplicated|unknown/);
});
