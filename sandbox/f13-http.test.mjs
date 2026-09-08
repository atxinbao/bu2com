import assert from "node:assert/strict";
import test from "node:test";
import { listen } from "./server.mjs";

async function request(base, path, { method = "GET", body, key } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function createReserved(base, suffix) {
  const quote = await request(base, "/v1/quotes", {
    method: "POST",
    key: `f13-http-quote-${suffix}`,
    body: {
      seller_agent_id: `agt_http_f13_${suffix}`,
      payee_account_id: `acct_http_f13_${suffix}`,
      item: { name: "F13 HTTP payment", delivery_type: "research_data" },
      amount: { value: 120, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const intent = await request(base, "/v1/payment_intents", {
    method: "POST",
    key: `f13-http-intent-${suffix}`,
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.body.amount,
      purpose: "F13 HTTP payment",
    },
  });
  const authorized = await request(base, `/v1/payment_intents/${intent.body.id}/authorization`, {
    method: "POST",
    key: `f13-http-authorize-${suffix}`,
    body: { decision: "authorize" },
  });
  return authorized.body.transaction_id;
}

test("F13 HTTP exposes cancellation, refund and refund listing", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));
  const canceledTransactionId = await createReserved(running.url, "cancel");
  const canceled = await request(running.url, `/v1/transactions/${canceledTransactionId}/cancellations`, {
    method: "POST",
    key: "f13-http-cancel-001",
    body: { reason: "test" },
  });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.transaction.status, "canceled");

  const settledTransactionId = await createReserved(running.url, "refund");
  const delivery = await request(running.url, `/v1/transactions/${settledTransactionId}/deliveries`, {
    method: "POST",
    key: "f13-http-delivery-001",
    body: { type: "research_data", evidence_hash: "sha256:f13http" },
  });
  assert.equal(delivery.status, 201);
  const settled = await request(running.url, `/v1/transactions/${settledTransactionId}/settlements`, {
    method: "POST",
    key: "f13-http-settle-001",
    body: {},
  });
  assert.equal(settled.status, 201);
  const refund = await request(running.url, `/v1/transactions/${settledTransactionId}/refunds`, {
    method: "POST",
    key: "f13-http-refund-001",
    body: { amount: { value: 120, currency: "CNY" }, reason: "test" },
  });
  assert.equal(refund.status, 200);
  assert.equal(refund.body.transaction.status, "refunded");
  assert.equal(refund.body.refund.status, "refunded");
  const listed = await request(running.url, "/v1/refunds");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [refund.body.refund.id]);
});
