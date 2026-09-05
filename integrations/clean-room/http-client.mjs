import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.BU2_ENDPOINT;
const runId = process.env.BU2_RUN_ID ?? randomUUID().replaceAll("-", "").slice(0, 12);

if (!endpoint) throw new Error("BU2_ENDPOINT is required.");

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

async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const options = {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(new URL(path, `${endpoint}/`), options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`BU2 returned HTTP ${response.status}.`);
    error.code = payload?.error?.code ?? `http_${response.status}`;
    throw error;
  }
  return payload;
}

const startedAt = Date.now();
const quote = await step("create_quote", () =>
  request("/v1/quotes", {
    method: "POST",
    idempotencyKey: `clean-http-quote-${runId}`,
    body: {
      seller_agent_id: "agt_clean_http_seller",
      payee_account_id: "acct_clean_http_seller",
      item: { name: "Clean-room HTTP dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  }),
);

let intent = await step("create_payment_intent", () =>
  request("/v1/payment_intents", {
    method: "POST",
    idempotencyKey: `clean-http-intent-${runId}`,
    body: {
      quote_id: quote.id,
      payer_account_id: "acct_clean_http_buyer",
      buyer_agent_id: "agt_clean_http_buyer",
      payment_mandate_id: "mdt_clean_http",
      amount: quote.amount,
      purpose: "Clean-room HTTP acceptance",
      external_context: { type: "agent_run", id: `run_clean_http_${runId}` },
    },
  }),
);

if (intent.status === "requires_authorization") {
  intent = await step("authorize", () =>
    request(`/v1/payment_intents/${intent.id}/authorization`, {
      method: "POST",
      idempotencyKey: `clean-http-authorize-${runId}`,
      body: { decision: "authorize", reason: "Explicit local Simulation acceptance" },
    }),
  );
}

await step("submit_delivery", () =>
  request(`/v1/transactions/${intent.transaction_id}/deliveries`, {
    method: "POST",
    idempotencyKey: `clean-http-delivery-${runId}`,
    body: {
      type: "dataset_access",
      evidence_hash: `sha256:cleanhttp${runId}`,
      summary: "Clean-room HTTP delivery",
    },
  }),
);

const settlement = await step("settle", () =>
  request(`/v1/transactions/${intent.transaction_id}/settlements`, {
    method: "POST",
    idempotencyKey: `clean-http-settle-${runId}`,
    body: {},
  }),
);
const receipt = await step("get_receipt", () => request(`/v1/receipts/${settlement.receipt.id}`));
const verification = await step("verify_receipt", () =>
  request(`/v1/receipts/${receipt.id}/verify`),
);

assert.equal(settlement.transaction.status, "settled");
assert.equal(verification.valid, true);

console.log(
  JSON.stringify({
    path: "http",
    environment: "simulation",
    transaction_status: settlement.transaction.status,
    receipt_id: receipt.id,
    receipt_valid: verification.valid,
    execution_ms: Date.now() - startedAt,
    steps,
  }),
);
