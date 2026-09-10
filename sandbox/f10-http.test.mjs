import assert from "node:assert/strict";
import test from "node:test";
import { listen } from "./server.mjs";
import { bindReceivingTarget } from "./test-ledger-bindings.mjs";

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

test("F10 HTTP exposes account-owned receivables without creating a transaction", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  bindReceivingTarget(running.ledger, {
    suffix: "f10_http_seller",
    account_id: "acct_f10_http_seller",
    agent_id: "agt_f10_http_seller",
    receiving_target_id: "tgt_f10_http_seller",
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

  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "f10-http-quote-001",
    body: {
      seller_agent_id: "agt_f10_http_seller",
      payee_account_id: "acct_f10_http_seller",
      item: { name: "F10 HTTP resource", delivery_type: "research_data" },
      amount: { value: 175, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(quote.status, 201);

  const input = {
    quote_id: quote.body.id,
    account_id: "acct_f10_http_seller",
    agent_id: "agt_f10_http_seller",
    receiving_target_id: "tgt_f10_http_seller",
    expires_at: new Date(Date.now() + 43_200_000).toISOString(),
    purpose: "F10 HTTP resource",
  };
  const created = await request(running.url, "/v1/receivables", {
    method: "POST",
    key: "f10-http-receivable-001",
    body: input,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "issued");
  assert.deepEqual(created.body.amount, quote.body.amount);

  const listed = await request(running.url, "/v1/receivables");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [created.body.id]);

  const detail = await request(running.url, `/v1/receivables/${created.body.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body, created.body);
  const transactions = await request(running.url, "/v1/transactions");
  assert.deepEqual(transactions.body.data, []);
});
