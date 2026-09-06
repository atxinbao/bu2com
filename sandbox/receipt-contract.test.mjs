import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  interpretReceiptEnvironment,
  verifyReceiptSignature,
} from "./receipt-contract.mjs";

const archivedReceipt = JSON.parse(
  readFileSync(new URL("./fixtures/receipt-v0.2-simulation.json", import.meta.url), "utf8"),
);

test("E-T05 archived Receipt v0.2 keeps its original signed bytes and verifies independently", () => {
  const verification = verifyReceiptSignature(archivedReceipt);
  assert.equal(archivedReceipt.schema_version, "0.2");
  assert.equal(archivedReceipt.environment, "simulation");
  assert.equal(
    archivedReceipt.signature,
    "sR0Qgb4ZnuhcA7L/3PuoY17xOdkwaMeKUWCot/T0fuKhpR5KUWcgVntD86tr6pfmmrA0MrWhSw6uicw3doxaBQ==",
  );
  assert.equal(verification.schema_supported, true);
  assert.equal(verification.signature_valid, true);
  assert.deepEqual(interpretReceiptEnvironment(archivedReceipt), {
    source: "legacy",
    original: "simulation",
    derived: "local",
    evidence: "legacy_simulation_is_local_only",
  });
});

test("Receipt v0.2 tampering is rejected without rewriting the archived fixture", () => {
  const tampered = { ...archivedReceipt, environment: "testnet" };
  assert.equal(verifyReceiptSignature(tampered).signature_valid, false);
  assert.equal(verifyReceiptSignature(archivedReceipt).signature_valid, true);
});

test("legacy testnet Receipt is not derived as Sandbox without channel and provider evidence", () => {
  const unsupported = {
    ...archivedReceipt,
    environment: "testnet",
    payment_channel: "unknown",
    provider_reference: null,
  };
  assert.deepEqual(interpretReceiptEnvironment(unsupported), {
    source: "legacy",
    original: "testnet",
    derived: null,
    evidence: "environment_evidence_insufficient",
  });
});
