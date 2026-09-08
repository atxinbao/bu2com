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

test("F15a HTTP exposes bounded execution session lifecycle", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));
  const session = await request(running.url, "/v1/execution_sessions", {
    method: "POST",
    key: "f15a-http-create",
    body: {
      tenant_id: "ten_f15a_http",
      account_id: "acct_f15a_http",
      agent_id: "agt_f15a_http",
      environment: "local",
      purpose: "HTTP bounded session",
      max_spend: { value: 100, currency: "CNY" },
      starts_at: new Date(Date.now() - 1_000).toISOString(),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    },
  });
  assert.equal(session.status, 201);
  const activated = await request(running.url, `/v1/execution_sessions/${session.body.id}/activate`, {
    method: "POST",
    key: "f15a-http-activate",
    body: { version: 1, activation_id: "act_f15a_http", approved_by: "usr_f15a_reviewer" },
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.activation_status, "active");
  const listed = await request(running.url, "/v1/execution_sessions");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(({ id }) => id), [session.body.id]);
});
