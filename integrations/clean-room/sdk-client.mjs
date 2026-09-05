import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Bu2Client } from "@bu2/sdk";

const endpoint = process.env.BU2_ENDPOINT;
const runId = process.env.BU2_RUN_ID ?? randomUUID().replaceAll("-", "").slice(0, 12);

if (!endpoint) throw new Error("BU2_ENDPOINT is required.");

const bu2 = new Bu2Client({
  baseUrl: new URL("/v1", `${endpoint}/`).toString(),
  environment: "simulation",
});
const steps = [];

async function step(name, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    steps.push({ name, status: "passed", duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    steps.push({
      name,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      error_code: error?.code ?? "client_step_failed",
    });
    throw error;
  }
}

const startedAt = Date.now();
const quote = await step("create_quote", () =>
  bu2.createQuote(
    {
      seller_agent_id: "agt_clean_sdk_seller",
      payee_account_id: "acct_clean_sdk_seller",
      item: { name: "Clean-room SDK dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    { idempotencyKey: `clean-sdk-quote-${runId}` },
  ),
);

let intent = await step("create_payment_intent", () =>
  bu2.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_clean_sdk_buyer",
      buyer_agent_id: "agt_clean_sdk_buyer",
      payment_mandate_id: "mdt_clean_sdk",
      amount: quote.amount,
      purpose: "Clean-room SDK acceptance",
      external_context: { type: "agent_run", id: `run_clean_sdk_${runId}` },
    },
    { idempotencyKey: `clean-sdk-intent-${runId}` },
  ),
);

if (intent.status === "requires_authorization") {
  intent = await step("authorize", () =>
    bu2.decideAuthorization(
      intent.id,
      { decision: "authorize", reason: "Explicit local Simulation acceptance" },
      { idempotencyKey: `clean-sdk-authorize-${runId}` },
    ),
  );
}

await step("submit_delivery", () =>
  bu2.submitDelivery(
    intent.transaction_id,
    {
      type: "dataset_access",
      evidence_hash: `sha256:cleansdk${runId}`,
      summary: "Clean-room SDK delivery",
    },
    { idempotencyKey: `clean-sdk-delivery-${runId}` },
  ),
);

const settlement = await step("settle", () =>
  bu2.settleTransaction(intent.transaction_id, {
    idempotencyKey: `clean-sdk-settle-${runId}`,
  }),
);
const receipt = await step("get_receipt", () => bu2.getReceipt(settlement.receipt.id));
const verification = await step("verify_receipt", () => bu2.verifyReceipt(receipt.id));

assert.equal(settlement.transaction.status, "settled");
assert.equal(verification.valid, true);

console.log(
  JSON.stringify({
    path: "sdk",
    environment: "simulation",
    transaction_status: settlement.transaction.status,
    receipt_id: receipt.id,
    receipt_valid: verification.valid,
    execution_ms: Date.now() - startedAt,
    steps,
  }),
);
