import assert from "node:assert/strict";
import test from "node:test";
import { validateLa06aEvidence } from "./la06a-local-gate.mjs";

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
