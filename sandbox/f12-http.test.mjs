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

test("F12 HTTP creates and recovers access from a posted collection", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  bindReceivingTarget(running.ledger, {
    suffix: "f12_http_seller",
    account_id: "acct_f12_http_seller",
    agent_id: "agt_f12_http_seller",
    receiving_target_id: "tgt_f12_http_seller",
  });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));

  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "f12-http-quote-001",
    body: {
      seller_agent_id: "agt_f12_http_seller",
      payee_account_id: "acct_f12_http_seller",
      item: { name: "F12 HTTP resource", delivery_type: "research_data" },
      amount: { value: 175, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const receivable = await request(running.url, "/v1/receivables", {
    method: "POST",
    key: "f12-http-receivable-001",
    body: {
      quote_id: quote.body.id,
      account_id: "acct_f12_http_seller",
      agent_id: "agt_f12_http_seller",
      receiving_target_id: "tgt_f12_http_seller",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F12 HTTP resource",
    },
  });
  const collection = await request(running.url, `/v1/receivables/${receivable.body.id}/collections`, {
    method: "POST",
    key: "f12-http-collection-001",
    body: { provider_reference: "sim_f12_http_001", collection_reference: receivable.body.collection_reference },
  });
  assert.equal(collection.status, 201);

  const created = await request(running.url, `/v1/collections/${collection.body.collection.id}/access_grants`, {
    method: "POST",
    key: "f12-http-grant-001",
    body: { access_type: "dataset", access_reference: "dataset://f12/http" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "active");

  const listed = await request(running.url, "/v1/access_grants");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [created.body.id]);
  const recovered = await request(running.url, `/v1/access_grants/${created.body.id}/recover`, {
    method: "POST",
    key: "f12-http-recover-001",
    body: {},
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.id, created.body.id);
});
