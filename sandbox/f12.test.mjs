import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { bindReceivingTarget } from "./test-ledger-bindings.mjs";

async function paidCollection(suffix = "f12", ledger = null) {
  const adapter = new SimulatedPaymentAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: `agt_seller_${suffix}`,
      payee_account_id: `acct_seller_${suffix}`,
      item: { name: "F12 paid resource", delivery_type: "research_data" },
      amount: { value: 350, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    `f12-quote-${suffix}`,
  );
  const receivable = await sandbox.createReceivable(
    {
      quote_id: quote.id,
      account_id: `acct_seller_${suffix}`,
      agent_id: `agt_seller_${suffix}`,
      receiving_target_id: `tgt_seller_${suffix}`,
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F12 paid resource",
    },
    `f12-receivable-${suffix}`,
  );
  const result = await sandbox.verifyInboundPayment(
    receivable.id,
    {
      provider_reference: `sim_f12_${suffix}`,
      collection_reference: receivable.collection_reference,
    },
    `f12-collection-${suffix}`,
  );
  return { sandbox, ledger, collection: result.collection };
}

test("F12 grants paid access once and recovers it without changing collection facts", async () => {
  const { sandbox, collection } = await paidCollection();
  const grant = await sandbox.createAccessGrant(
    collection.id,
    {
      access_type: "dataset",
      access_reference: "dataset://research/f12",
      metadata: { plan: "sandbox" },
    },
    "f12-access-grant-001",
  );
  assert.equal(grant.status, "active");
  assert.equal(grant.source_type, "collection");
  assert.equal(grant.collection_status, "posted");
  assert.equal(sandbox.getCollection(collection.id).status, "posted");
  assert.equal(sandbox.listFinancialPostings().length, 2);

  const replay = await sandbox.createAccessGrant(
    collection.id,
    { access_type: "dataset", access_reference: "dataset://research/f12" },
    "f12-access-grant-002",
  );
  assert.equal(replay.id, grant.id);
  await assert.rejects(
    sandbox.createAccessGrant(
      collection.id,
      { access_type: "different", access_reference: "dataset://research/f12" },
      "f12-access-grant-drift",
    ),
    (error) => error.code === "access_grant_source_conflict",
  );

  sandbox.accessGrants.get(grant.id).status = "expired";
  const recovered = await sandbox.recoverAccessGrant(grant.id, {}, "f12-access-recover-001");
  assert.equal(recovered.id, grant.id);
  assert.equal(recovered.status, "active");
  assert.equal(recovered.version, 2);
  assert.equal(sandbox.getCollection(collection.id).updated_at, collection.updated_at);
  assert.equal(sandbox.events.filter((event) => event.type === "access_grant.created").length, 1);
  assert.equal(sandbox.events.filter((event) => event.type === "access_grant.recovered").length, 1);
});

test("F12 rejects unpaid sources and revoked grants", async () => {
  const sandbox = new Bu2Sandbox({ adapter: new SimulatedPaymentAdapter({ ledger: null }) });
  await assert.rejects(
    sandbox.createAccessGrant("cpay_missing", { access_type: "file", access_reference: "file://missing" }, "f12-missing-001"),
    (error) => error.code === "collection_not_found",
  );

  const { sandbox: paid, collection } = await paidCollection("revoked");
  const grant = await paid.createAccessGrant(
    collection.id,
    { access_type: "file", access_reference: "file://revoked" },
    "f12-revoked-grant-001",
  );
  paid.accessGrants.get(grant.id).status = "revoked";
  await assert.rejects(
    paid.recoverAccessGrant(grant.id, {}, "f12-revoked-recover-001"),
    (error) => error.code === "access_grant_revoked",
  );
});

test("F12 persists and recovers access grants across SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f12-access-"));
  const database = join(directory, "access.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    bindReceivingTarget(firstLedger, { suffix: "restart" });
    const { sandbox, collection } = await paidCollection("restart", firstLedger);
    const grant = await sandbox.createAccessGrant(
      collection.id,
      { access_type: "report", access_reference: "report://f12/restart" },
      "f12-restart-grant-001",
    );
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({
      ledger: secondLedger,
      adapter: new SimulatedPaymentAdapter({ ledger: secondLedger }),
    });
    assert.deepEqual(second.getAccessGrant(grant.id), grant);
    const recovered = await second.recoverAccessGrant(grant.id, {}, "f12-restart-recover-001");
    assert.equal(recovered.id, grant.id);
    assert.equal(recovered.version, 1);
    assert.equal(second.getCollection(collection.id).status, "posted");
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
