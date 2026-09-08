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

test("F14 HTTP exposes provider fees and reconciliation runs", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));
  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "f14-http-quote-001",
    body: {
      seller_agent_id: "agt_f14_http_seller",
      payee_account_id: "acct_f14_http_seller",
      item: { name: "F14 HTTP payment", delivery_type: "research_data" },
      amount: { value: 120, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const intent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "f14-http-intent-001",
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.body.amount,
      purpose: "F14 HTTP payment",
    },
  });
  const authorized = await request(running.url, `/v1/payment_intents/${intent.body.id}/authorization`, {
    method: "POST",
    key: "f14-http-authorize-001",
    body: { decision: "authorize" },
  });
  const transactionId = authorized.body.transaction_id;
  await request(running.url, `/v1/transactions/${transactionId}/deliveries`, {
    method: "POST",
    key: "f14-http-delivery-001",
    body: { type: "research_data", evidence_hash: "sha256:f14http" },
  });
  const settled = await request(running.url, `/v1/transactions/${transactionId}/settlements`, {
    method: "POST",
    key: "f14-http-settle-001",
    body: {},
  });
  const fee = await request(running.url, "/v1/provider_fees", {
    method: "POST",
    key: "f14-http-fee-001",
    body: {
      source_type: "payment",
      source_id: transactionId,
      provider: "bu2_simulated_provider",
      provider_reference: settled.body.transaction.settlement_provider_reference,
      amount: { value: 4, currency: "CNY" },
    },
  });
  assert.equal(fee.status, 201);
  const run = await request(running.url, "/v1/reconciliations", {
    method: "POST",
    key: "f14-http-reconcile-001",
    body: {},
  });
  assert.equal(run.status, 201);
  assert.equal(run.body.status, "matched");
  assert.equal(run.body.totals.CNY.fees, 4);
  const listed = await request(running.url, "/v1/reconciliations");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [run.body.id]);
});

