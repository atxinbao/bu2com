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

test("F11 HTTP verifies an inbound payment and exposes one collection", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  bindReceivingTarget(running.ledger, {
    suffix: "f11_http_seller",
    account_id: "acct_f11_http_seller",
    agent_id: "agt_f11_http_seller",
    receiving_target_id: "tgt_f11_http_seller",
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
    key: "f11-http-quote-001",
    body: {
      seller_agent_id: "agt_f11_http_seller",
      payee_account_id: "acct_f11_http_seller",
      item: { name: "F11 HTTP resource", delivery_type: "research_data" },
      amount: { value: 175, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const receivable = await request(running.url, "/v1/receivables", {
    method: "POST",
    key: "f11-http-receivable-001",
    body: {
      quote_id: quote.body.id,
      account_id: "acct_f11_http_seller",
      agent_id: "agt_f11_http_seller",
      receiving_target_id: "tgt_f11_http_seller",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F11 HTTP resource",
    },
  });
  const created = await request(
    running.url,
    `/v1/receivables/${receivable.body.id}/collections`,
    {
      method: "POST",
      key: "f11-http-collection-001",
      body: {
        provider_reference: "sim_http_inbound_001",
        collection_reference: receivable.body.collection_reference,
      },
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.collection.status, "posted");
  assert.equal(created.body.receivable.status, "paid");

  const listed = await request(running.url, "/v1/collections");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [created.body.collection.id]);
  const detail = await request(running.url, `/v1/collections/${created.body.collection.id}`);
  assert.deepEqual(detail.body, created.body.collection);
  const postings = await request(running.url, "/v1/financial_postings");
  assert.equal(postings.body.data.length, 2);
});
