import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

class ProgressingCollectionAdapter extends SimulatedPaymentAdapter {
  constructor(options = {}) {
    super(options);
    this.calls = options.calls ?? 0;
  }

  verifyInboundPayment(context) {
    this.calls += 1;
    const result = super.verifyInboundPayment(context);
    return {
      ...result,
      status: this.calls === 1 ? "pending" : "verified",
    };
  }
}

function quoteInput(suffix) {
  return {
    seller_agent_id: `agt_la04_seller_${suffix}`,
    payee_account_id: `acct_la04_seller_${suffix}`,
    item: { name: "LA-04 inbound evidence", delivery_type: "research_data" },
    amount: { value: 250, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function createReceivable(suffix, ledger, adapter) {
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const quote = await sandbox.createQuote(quoteInput(suffix), `la04-quote-${suffix}`);
  const receivable = await sandbox.createReceivable(
    {
      quote_id: quote.id,
      account_id: `acct_la04_seller_${suffix}`,
      agent_id: `agt_la04_seller_${suffix}`,
      receiving_target_id: `tgt_la04_seller_${suffix}`,
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "LA-04 inbound evidence",
    },
    `la04-receivable-${suffix}`,
  );
  return { sandbox, receivable };
}

function paymentInput(receivable) {
  return {
    provider_reference: "sim_la04_progressing_001",
    collection_reference: receivable.collection_reference,
  };
}

test("LA-04 converges a pending Collection and posts exactly once", async () => {
  const adapter = new ProgressingCollectionAdapter({ ledger: null });
  const { sandbox, receivable } = await createReceivable("converge", null, adapter);
  const first = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "la04-pending-001",
  );
  assert.equal(first.collection.status, "pending");
  assert.equal(first.collection.verification_status, "pending");
  assert.equal(first.collection.verification_attempts.length, 1);
  assert.equal(sandbox.listFinancialPostings().length, 0);

  const second = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "la04-verified-002",
  );
  assert.equal(second.collection.id, first.collection.id);
  assert.equal(second.collection.status, "posted");
  assert.equal(second.collection.verification_status, "verified");
  assert.equal(second.collection.verification_attempts.length, 2);
  assert.equal(second.receivable.status, "paid");
  assert.equal(sandbox.listFinancialPostings().length, 2);
  assert.equal(adapter.calls, 2);

  const replay = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "la04-posted-replay-003",
  );
  assert.deepEqual(replay, second);
  assert.equal(adapter.calls, 2);
  assert.equal(sandbox.listFinancialPostings().length, 2);
});

test("LA-04 persists verification evidence and converges after SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la04-collections-"));
  const database = join(directory, "collections.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const firstAdapter = new ProgressingCollectionAdapter({ ledger: firstLedger });
    const first = await createReceivable("restart", firstLedger, firstAdapter);
    const pending = await first.sandbox.verifyInboundPayment(
      first.receivable.id,
      paymentInput(first.receivable),
      "la04-restart-pending-001",
    );
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const secondAdapter = new ProgressingCollectionAdapter({ ledger: secondLedger, calls: 1 });
    const second = new Bu2Sandbox({ ledger: secondLedger, adapter: secondAdapter });
    const verified = await second.verifyInboundPayment(
      first.receivable.id,
      paymentInput(first.receivable),
      "la04-restart-verified-002",
    );
    assert.equal(verified.collection.id, pending.collection.id);
    assert.equal(verified.collection.verification_attempts.length, 2);
    assert.equal(second.getCollection(pending.collection.id).status, "posted");
    assert.equal(second.listFinancialPostings().length, 2);
    secondLedger.close();

    const thirdLedger = new SqliteLedger(database);
    const third = new Bu2Sandbox({ ledger: thirdLedger, adapter: new ProgressingCollectionAdapter({ ledger: thirdLedger, calls: 2 }) });
    assert.equal(third.getCollection(pending.collection.id).verification_attempts.length, 2);
    assert.equal(third.listFinancialPostings().length, 2);
    thirdLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-04 records late inbound evidence without granting expired access", async () => {
  const adapter = new SimulatedPaymentAdapter({ ledger: null });
  const { sandbox, receivable } = await createReceivable("late", null, adapter);
  sandbox.receivables.get(receivable.id).expires_at = new Date(Date.now() - 1_000).toISOString();

  const result = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "la04-late-001",
  );
  assert.equal(result.collection.status, "posted");
  assert.equal(result.collection.late, true);
  assert.equal(result.collection.fulfillment_eligible, false);
  assert.equal(sandbox.listFinancialPostings().length, 2);
  assert.equal(sandbox.events.at(-1).type, "receivable.payment_posted_late");
  await assert.rejects(
    sandbox.createAccessGrant(
      result.collection.id,
      { access_type: "research_data", access_reference: "late-access" },
      "la04-late-access-002",
    ),
    (error) => error.code === "collection_not_fulfillable",
  );
});
