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

function quoteBody(name, value) {
  return {
    seller_agent_id: "agt_f09a_http_seller",
    payee_account_id: "acct_f09a_http_seller",
    item: { name, delivery_type: "research_data" },
    amount: { value, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

test("F09a HTTP execution runs an approved deferred intent without re-approval", async (context) => {
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

  const firstQuote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "f09a-http-quote-1",
    body: quoteBody("F09a first resource", 100),
  });
  assert.equal(firstQuote.status, 201);

  const firstIntent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "f09a-http-intent-1",
    body: {
      quote_id: firstQuote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: firstQuote.body.amount,
      purpose: "F09a first resource",
    },
  });
  assert.equal(firstIntent.body.status, "requires_authorization");

  const approval = await request(
    running.url,
    `/v1/payment_intents/${firstIntent.body.id}/authorization`,
    {
      method: "POST",
      key: "f09a-http-approval-1",
      body: { decision: "authorize" },
    },
  );
  assert.equal(approval.status, 200);
  assert.equal(approval.body.status, "funds_reserved");

  const secondQuote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "f09a-http-quote-2",
    body: quoteBody("F09a deferred resource", 125),
  });
  const deferred = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "f09a-http-intent-2",
    body: {
      quote_id: secondQuote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: secondQuote.body.amount,
      purpose: "F09a deferred resource",
      execution_mode: "deferred",
    },
  });
  assert.equal(deferred.status, 201);
  assert.equal(deferred.body.status, "authorized");
  assert.equal(deferred.body.transaction_id, null);

  const executed = await request(
    running.url,
    `/v1/payment_intents/${deferred.body.id}/execution`,
    { method: "POST", key: "f09a-http-execution-2", body: {} },
  );
  assert.equal(executed.status, 200, JSON.stringify(executed.body));
  assert.equal(executed.body.status, "funds_reserved");
  assert.ok(executed.body.transaction_id);

  const replay = await request(
    running.url,
    `/v1/payment_intents/${deferred.body.id}/execution`,
    { method: "POST", key: "f09a-http-execution-2", body: {} },
  );
  assert.deepEqual(replay.body, executed.body);
});
