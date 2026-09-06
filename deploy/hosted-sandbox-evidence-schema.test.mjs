import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "../sandbox/node_modules/ajv/dist/2020.js";
import test from "node:test";

const schema = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../docs/03-technical/hosted-sandbox-evidence.schema.json", import.meta.url)),
    "utf8",
  ),
);

const transaction = (direction) => ({
  direction,
  environment: "sandbox",
  chain_id: 84532,
  status: "settled",
  provider_reference: `0x${"a".repeat(64)}`,
  receipt_verification: {
    signature_valid: true,
    issuer_trusted: true,
    settlement_confirmed: true,
    environment: "sandbox",
  },
});

const evidence = () => ({
  schema_version: "1.0",
  record_type: "hosted_sandbox_evidence",
  candidate_sha256: "a".repeat(64),
  api_origin: "https://api.sandbox.bu2.com",
  environment_document: {
    environment: "sandbox",
    chain_id: 84532,
    network: "eip155:84532",
    execution_backend: "x402",
    execution_status: "execution_enabled",
    access_mode: "authenticated",
    receipt_issuer: { id: "issuer_sandbox" },
  },
  edge_machine_auth: {
    status_code: 200,
    interactive_challenge: false,
    redirect_count: 0,
  },
  failure_recovery: {
    duplicate_submission: { duplicate_funds: false, converged: true },
    lost_response: { duplicate_funds: false, outcome: "reconciled" },
  },
  transactions: [transaction("buyer_to_seller"), transaction("seller_to_buyer")],
  live: { included: false, execution_status: "execution_disabled" },
});

test("Hosted Sandbox Evidence Schema accepts the bounded bilateral contract", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(evidence()), true, JSON.stringify(validate.errors));
});

test("Hosted Sandbox Evidence Schema rejects Live, missing direction, and raw payload fields", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const invalid = evidence();
  invalid.live.included = true;
  invalid.transactions.pop();
  invalid.raw_request_payload = { prompt: "must not be shared" };
  assert.equal(validate(invalid), false);
  assert.equal(validate.errors.some((error) => error.keyword === "const"), true);
  assert.equal(validate.errors.some((error) => error.keyword === "minItems"), true);
  assert.equal(validate.errors.some((error) => error.keyword === "additionalProperties"), true);
});
