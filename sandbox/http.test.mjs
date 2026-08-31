import assert from "node:assert/strict";
import test from "node:test";
import { listen } from "./server.mjs";

async function request(base, path, { method = "GET", body, key } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("HTTP reference server completes one signed agent payment", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );

  const health = await request(running.url, "/health");
  assert.equal(health.status, 200);

  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "http-quote-key",
    body: {
      seller_agent_id: "agt_market_data",
      payee_account_id: "acct_atlas_data",
      item: { name: "Dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: "2026-09-02T08:00:00Z",
    },
  });
  assert.equal(quote.status, 201);

  const intent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "http-intent-key",
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 3900, currency: "CNY" },
      purpose: "Dataset",
    },
  });
  assert.equal(intent.body.status, "requires_authorization");

  const authorization = await request(
    running.url,
    `/v1/payment_intents/${intent.body.id}/authorization`,
    {
      method: "POST",
      key: "http-auth-key",
      body: { decision: "authorize" },
    },
  );
  assert.equal(authorization.body.status, "funds_reserved");

  const earlySettlement = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/settlements`,
    {
      method: "POST",
      key: "http-early-settle",
      body: {},
    },
  );
  assert.equal(earlySettlement.status, 409);
  assert.equal(earlySettlement.body.error.code, "transaction_not_delivered");

  const delivery = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/deliveries`,
    {
      method: "POST",
      key: "http-delivery-key",
      body: { type: "dataset_access", evidence_hash: "sha256:httpdemo" },
    },
  );
  assert.equal(delivery.body.transaction.status, "delivery_submitted");

  const settlement = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/settlements`,
    {
      method: "POST",
      key: "http-settle-key",
      body: {},
    },
  );
  assert.equal(settlement.body.transaction.status, "settled");

  const verification = await request(
    running.url,
    `/v1/receipts/${settlement.body.receipt.id}/verify`,
  );
  assert.equal(verification.body.valid, true);

  const transactionList = await request(running.url, "/v1/transactions");
  assert.equal(transactionList.status, 200);
  assert.equal(transactionList.body.data.length, 1);
  assert.equal(
    transactionList.body.data[0].transaction.id,
    authorization.body.transaction_id,
  );
  assert.equal(transactionList.body.data[0].receipt.valid, true);

  const transactionDetail = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}`,
  );
  assert.equal(transactionDetail.status, 200);
  assert.equal(transactionDetail.body.quote.item.name, "Dataset");
  assert.equal(transactionDetail.body.delivery.evidence_hash, "sha256:httpdemo");
  assert.equal(transactionDetail.body.payment_channel, "bu2_simulated_provider");

  const events = await request(running.url, "/v1/events");
  assert.ok(events.body.data.some((event) => event.type === "receipt.issued"));
});

test("HTTP server exposes an explicit x402 adapter mode without a signer", async (context) => {
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    adapterMode: "x402",
    x402ResourceUrl: "http://127.0.0.1:4021/premium-data",
  });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );
  const health = await request(running.url, "/health");
  assert.equal(health.body.version, "0.3.0");
  assert.equal(health.body.adapter, "x402_exact_base_sepolia");
  assert.equal(running.sandbox.wallet.currency, "USD");
});
