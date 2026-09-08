import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { listen } from "./server.mjs";

function externalObservation(overrides = {}) {
  return {
    kind: "collection",
    source_id: "cpay_la05a_collection",
    provider: "simulated_external_reader",
    provider_reference: "chain_collection_la05a_001",
    amount: { value: 100, currency: "CNY" },
    status: "verified",
    ...overrides,
  };
}

function postedCollection(sandbox, overrides = {}) {
  const collection = {
    id: "cpay_la05a_collection",
    receivable_id: "rcv_la05a_receivable",
    account_id: "acct_la05a_seller",
    agent_id: "agt_la05a_seller",
    receiving_target_id: "tgt_la05a_seller",
    collection_reference: "col_la05a_001",
    provider: "bu2_simulated_provider",
    provider_reference: "sim_local_collection_la05a_001",
    amount: { value: 100, currency: "CNY" },
    asset: null,
    network: null,
    verification_status: "verified",
    status: "posted",
    verification_mode: "simulation",
    verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  sandbox.collections.set(collection.id, collection);
  return collection;
}

test("LA-05a marks an external amount mismatch as an exception", async () => {
  const sandbox = new Bu2Sandbox();
  postedCollection(sandbox, { provider_reference: "chain_collection_la05a_001" });
  const run = await sandbox.createReconciliation(
    { observations: [externalObservation({ amount: { value: 999, currency: "CNY" } })] },
    "la05a-mismatch-001",
  );
  assert.equal(run.mode, "external");
  assert.equal(run.status, "exception");
  assert.equal(run.exception_count, 1);
  assert.deepEqual(run.items[0].issues, ["external_observation_mismatch"]);
  assert.equal(run.items[0].observed_amount.value, 999);
});

test("LA-05a includes an unresolved delivery submission and external orphan", async () => {
  const sandbox = new Bu2Sandbox();
  sandbox.transactions.set("txn_la05a_unknown", {
    id: "txn_la05a_unknown",
    status: "delivery_submitted",
    reserved_amount: { value: 75, currency: "CNY" },
    settled_amount: { value: 0, currency: "CNY" },
    refunded_amount: { value: 0, currency: "CNY" },
    settlement_provider_reference: null,
    created_at: new Date().toISOString(),
  });
  const run = await sandbox.createReconciliation(
    {
      observations: [
        externalObservation({
          source_id: undefined,
          provider_reference: "chain_orphan_la05a_001",
          amount: { value: 40, currency: "CNY" },
        }),
      ],
    },
    "la05a-unresolved-002",
  );
  const unresolved = run.items.find((item) => item.source_id === "txn_la05a_unknown");
  const orphan = run.items.find((item) => item.kind === "external");
  assert.equal(unresolved.status, "unknown");
  assert.ok(unresolved.issues.includes("external_observation_missing"));
  assert.equal(unresolved.expected_amount.value, 75);
  assert.equal(orphan.status, "unknown");
  assert.ok(orphan.issues.includes("external_fact_unmatched"));
  assert.equal(run.unknown_count, 2);
});

test("LA-05a persists external reconciliation mode and evidence across SQLite restart", async () => {
  const { SqliteLedger } = await import("./persistence.mjs");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "bu2-la05a-reconciliation-"));
  const database = join(directory, "reconciliation.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const first = new Bu2Sandbox({ ledger: firstLedger });
    postedCollection(first, { provider_reference: "chain_collection_la05a_restart_001" });
    const created = await first.createReconciliation(
      { id: "rec_la05a_restart", observations: [externalObservation({ provider_reference: "chain_collection_la05a_restart_001" })] },
      "la05a-restart-003",
    );
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger });
    assert.equal(second.getReconciliationRun(created.id).mode, "external");
    assert.equal(second.getReconciliationRun(created.id).items[0].observation.provider, "simulated_external_reader");
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-05a HTTP accepts independent observations and returns external mode", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));
  const request = async (path, { method = "GET", body, key } = {}) => {
    const response = await fetch(`${running.url}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const quote = await request("/v1/quotes", {
    method: "POST",
    key: "la05a-http-quote-001",
    body: {
      seller_agent_id: "agt_la05a_http_seller",
      payee_account_id: "acct_la05a_http_seller",
      item: { name: "LA-05a HTTP payment", delivery_type: "research_data" },
      amount: { value: 100, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(quote.status, 201);
  const intent = await request("/v1/payment_intents", {
    method: "POST",
    key: "la05a-http-intent-001",
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.body.amount,
      purpose: "LA-05a HTTP payment",
    },
  });
  assert.equal(intent.status, 201);
  const authorized = await request(`/v1/payment_intents/${intent.body.id}/authorization`, {
    method: "POST",
    key: "la05a-http-authorize-001",
    body: { decision: "authorize" },
  });
  assert.equal(authorized.status, 200);
  const transactionId = authorized.body.transaction_id;
  const delivered = await request(`/v1/transactions/${transactionId}/deliveries`, {
    method: "POST",
    key: "la05a-http-delivery-001",
    body: { type: "research_data", evidence_hash: "sha256:la05ahttp" },
  });
  assert.equal(delivered.status, 201);
  const settled = await request(`/v1/transactions/${transactionId}/settlements`, {
    method: "POST",
    key: "la05a-http-settle-001",
    body: {},
  });
  assert.equal(settled.status, 201);
  const transaction = settled.body.transaction;
  const run = await request("/v1/reconciliations", {
    method: "POST",
    key: "la05a-http-reconcile-001",
    body: {
      observations: [{
        kind: "payment",
        source_id: transaction.id,
        provider: "simulated_external_reader",
        provider_reference: transaction.settlement_provider_reference,
        amount: transaction.settled_amount,
        status: "verified",
      }],
    },
  });
  assert.equal(run.status, 201);
  assert.equal(run.body.mode, "external");
  assert.equal(run.body.status, "matched");
  assert.equal(run.body.items[0].observation.provider, "simulated_external_reader");
});
