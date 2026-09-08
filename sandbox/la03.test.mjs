import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

async function settledPayment(sandbox, suffix) {
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: `agt_la03_seller_${suffix}`,
      payee_account_id: `acct_la03_seller_${suffix}`,
      item: { name: "LA-03 business posting", delivery_type: "research_data" },
      amount: { value: 300, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    `la03-quote-${suffix}`,
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.amount,
      purpose: "LA-03 business posting",
    },
    `la03-intent-${suffix}`,
  );
  const authorized = await sandbox.decideAuthorization(intent.id, { decision: "authorize" }, `la03-authorize-${suffix}`);
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "research_data", evidence_hash: `sha256:la03-${suffix}` },
    `la03-delivery-${suffix}`,
  );
  const settled = await sandbox.settle(authorized.transaction_id, {}, `la03-settle-${suffix}`);
  return { transaction: settled.transaction, intent: authorized };
}

test("LA-03 persists settlement postings and keeps settlement replay idempotent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la03-settlement-"));
  const database = join(directory, "settlement.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const first = new Bu2Sandbox({ ledger: firstLedger, adapter: new SimulatedPaymentAdapter({ ledger: firstLedger }) });
    const settled = await settledPayment(first, "persisted");
    const before = first.listFinancialPostings(settled.transaction.id);
    assert.equal(before.length, 2);
    assert.deepEqual(before.map((posting) => posting.direction).sort(), ["credit", "debit"]);
    assert.ok(before.every((posting) => posting.event_type === "transaction.settled"));
    const replay = await first.settle(settled.transaction.id, {}, "la03-settle-persisted");
    assert.deepEqual(replay.transaction, settled.transaction);
    assert.equal(first.listFinancialPostings(settled.transaction.id).length, 2);
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger, adapter: new SimulatedPaymentAdapter({ ledger: secondLedger }) });
    const restored = second.listFinancialPostings(settled.transaction.id);
    assert.equal(restored.length, 2);
    assert.deepEqual(restored.map((posting) => posting.source_id), [settled.transaction.id, settled.transaction.id]);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-03 posts each confirmed refund exactly once and does not post provider-unknown refunds", async () => {
  class UnknownRefundAdapter extends SimulatedPaymentAdapter {
    refund() {
      throw new ApiError(503, "provider_unknown", "refund_result_unknown", "Refund result is unknown.");
    }
  }

  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const settled = await settledPayment(sandbox, "refunds");
  const partial = await sandbox.requestRefund(
    settled.transaction.id,
    { amount: { value: 100, currency: "CNY" }, reason: "partial" },
    "la03-refund-partial",
  );
  const replay = await sandbox.requestRefund(
    settled.transaction.id,
    { amount: { value: 100, currency: "CNY" }, reason: "partial" },
    "la03-refund-partial",
  );
  assert.deepEqual(replay, partial);
  assert.equal(sandbox.listFinancialPostings(settled.transaction.id).filter((posting) => posting.event_type === "transaction.refunded").length, 2);

  const unknownLedger = new SqliteLedger(":memory:");
  const unknown = new Bu2Sandbox({ ledger: unknownLedger, adapter: new UnknownRefundAdapter({ ledger: unknownLedger }) });
  const unknownPayment = await settledPayment(unknown, "unknown");
  const pending = await unknown.requestRefund(
    unknownPayment.transaction.id,
    { amount: { value: 100, currency: "CNY" }, reason: "provider timeout" },
    "la03-refund-unknown",
  );
  assert.equal(pending.refund.status, "provider_unknown");
  assert.equal(unknown.listFinancialPostings(unknownPayment.transaction.id).filter((posting) => posting.event_type === "transaction.refunded").length, 0);
  ledger.close();
  unknownLedger.close();
});

test("LA-03 records provider fee facts as balanced postings with source-aware transaction links", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const settled = await settledPayment(sandbox, "fees");
  const fee = await sandbox.recordProviderFee(
    {
      source_type: "payment",
      source_id: settled.transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 7, currency: "CNY" },
    },
    "la03-fee-payment",
  );
  const replay = await sandbox.recordProviderFee(
    {
      source_type: "payment",
      source_id: settled.transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 7, currency: "CNY" },
    },
    "la03-fee-payment",
  );
  assert.deepEqual(replay, fee);
  const postings = sandbox.listFinancialPostings().filter((posting) => posting.source_id === fee.id);
  assert.equal(postings.length, 2);
  assert.ok(postings.every((posting) => posting.event_type === "reconciliation.fee_recorded"));
  assert.ok(postings.every((posting) => posting.transaction_id === settled.transaction.id));
  assert.deepEqual(postings.map((posting) => posting.direction).sort(), ["credit", "debit"]);
  ledger.close();
});
