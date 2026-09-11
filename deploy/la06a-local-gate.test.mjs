import assert from "node:assert/strict";
import test from "node:test";
import { runLa06aLocalGate, validateLa06aEvidence } from "./la06a-local-gate.mjs";

const evidence = {
  schema_version: "la06a.v1",
  gate: "ledger_assurance_local_foundation",
  status: "passed",
  environment: "local",
  execution_status: "execution_disabled",
  checks: Array.from({ length: 7 }, (_, index) => ({
    id: `check_${index}`,
    status: "passed",
  })),
  external_sandbox_bilateral: {
    status: "not_executed",
    accepted: false,
  },
  authorization: {
    payment_execution_attempted: false,
    live_enabled: false,
  },
};

test("LA-06a evidence accepts local regression and rejects external settlement claims", () => {
  assert.equal(validateLa06aEvidence(evidence), true);
  assert.equal(
    validateLa06aEvidence({
      ...evidence,
      external_sandbox_bilateral: { status: "accepted", accepted: true },
    }),
    false,
  );
});

test("LA-06a evidence rejects an incomplete local check set", () => {
  assert.equal(validateLa06aEvidence({ ...evidence, checks: evidence.checks.slice(0, 5) }), false);
  assert.equal(
    validateLa06aEvidence({
      ...evidence,
      checks: evidence.checks.map((check, index) =>
        index === 3 ? { ...check, status: "failed" } : check,
      ),
    }),
    false,
  );
});

test("LA-06a runs every check and truthfully records failures", () => {
  let calls = 0;
  const result = runLa06aLocalGate({
    cwd: process.cwd(),
    env: { BU2_SOURCE_COMMIT: "a".repeat(40) },
    execute: (_program, args) => {
      calls += 1;
      const failed = args.includes("test:la06a");
      return {
        status: failed ? 1 : 0,
        stdout: "ℹ tests 2\nℹ pass 2\nℹ fail 0\n",
        stderr: failed ? "recorded failure\n" : "",
      };
    },
  });
  assert.equal(calls, 7);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.observation, {
    admission_required: false,
    failed_check_ids: ["la06a_targeted_boundary_tests"],
  });
  assert.equal(result.checks.length, 7);
  assert.equal(validateLa06aEvidence(result), false);
});
