import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

async function settledTransaction(sandbox, suffix) {
  const quote = await sandbox.createQuote({
    seller_agent_id: `agt_refund_regression_${suffix}`,
    payee_account_id: `acct_refund_regression_${suffix}`,
    item: { name: "Confirmed unposted refund regression", delivery_type: "research_data" },
    amount: { value: 300, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }, `refund-regression-quote-${suffix}`);
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: "acct_bu2_ventures",
    buyer_agent_id: "agt_research_copilot",
    payment_mandate_id: "mdt_research_04",
    amount: quote.amount,
    purpose: "Confirmed unposted refund regression",
  }, `refund-regression-intent-${suffix}`);
  const authorized = await sandbox.decideAuthorization(intent.id, { decision: "authorize" }, `refund-regression-authorize-${suffix}`);
  await sandbox.submitDelivery(authorized.transaction_id, { type: "research_data", evidence_hash: `sha256:${"a".repeat(64)}` }, `refund-regression-delivery-${suffix}`);
  await sandbox.settle(authorized.transaction_id, {}, `refund-regression-settle-${suffix}`);
  return authorized.transaction_id;
}

function openRuntime(database, counter, fault) {
  const ledger = new SqliteLedger(database, {
    failureInjector(stage) {
      if (fault.armed && stage === "after_state_write") {
        fault.armed = false;
        throw new Error("injected confirmed-refund domain commit failure");
      }
    },
  });
  class CountingAdapter extends SimulatedPaymentAdapter {
    refund(...args) {
      counter.calls += 1;
      return super.refund(...args);
    }
  }
  return { ledger, sandbox: new Bu2Sandbox({ ledger, adapter: new CountingAdapter({ ledger }) }) };
}

function assertRefundJournals(ledger, expectedRefundIds) {
  const headers = ledger.db.prepare(
    "SELECT source_id, status FROM journal_headers WHERE event_type='transaction.refunded' ORDER BY source_id",
  ).all();
  assert.deepEqual(headers.map((row) => row.source_id).sort(), [...expectedRefundIds].sort());
  for (const header of headers) {
    assert.equal(header.status, "posted");
    const rows = ledger.db.prepare("SELECT direction, amount_value FROM financial_postings WHERE journal_id=(SELECT id FROM journal_headers WHERE source_id=? AND event_type='transaction.refunded')").all(header.source_id);
    assert.equal(rows.length, 2);
    const total = (direction) => rows.filter((row) => row.direction === direction).reduce((sum, row) => sum + Number(row.amount_value), 0);
    assert.equal(total("debit"), total("credit"));
  }
}

for (const restart of [false, true]) {
  test(`confirmed unposted refund reserves capacity; restart=${restart}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "bu2-confirmed-refund-"));
    const database = join(directory, "ledger.sqlite");
    const counter = { calls: 0 };
    const fault = { armed: false };
    let runtime = openRuntime(database, counter, fault);
    try {
      const transactionId = await settledTransaction(runtime.sandbox, restart ? "restarted" : "inprocess");
      const originalKey = "refund-original-failed-domain-commit";
      const amount = { value: 80, currency: "CNY" };
      fault.armed = true;
      await assert.rejects(runtime.sandbox.requestRefund(transactionId, { amount }, originalKey), /injected confirmed-refund domain commit failure/);
      assert.equal(counter.calls, 1);
      assert.equal(runtime.sandbox.refundReservation(transactionId), 80);
      assert.equal(runtime.sandbox.listRefunds(transactionId).length, 0);
      assertRefundJournals(runtime.ledger, []);

      if (restart) {
        runtime.ledger.close();
        runtime = openRuntime(database, counter, fault);
      }
      await assert.rejects(runtime.sandbox.requestRefund(transactionId, { amount: { value: 221, currency: "CNY" } }, "refund-fresh-key-must-reject"), (error) => error.code === "refund_amount_exceeded");
      assert.equal(counter.calls, 1);
      const recovered = await runtime.sandbox.requestRefund(transactionId, { amount }, originalKey);
      assert.equal(recovered.transaction.refunded_amount.value, 80);
      assert.equal(counter.calls, 1);
      assert.equal(runtime.sandbox.refundReservation(transactionId), 0);
      assert.equal(runtime.sandbox.wallet.available, 99_780);
      assertRefundJournals(runtime.ledger, [recovered.refund.id]);

      const final = await runtime.sandbox.requestRefund(transactionId, { amount: { value: 220, currency: "CNY" } }, "refund-exact-remaining-capacity");
      assert.equal(final.transaction.refunded_amount.value, 300);
      assert.equal(counter.calls, 2);
      assert.equal(runtime.sandbox.wallet.available, 100_000);
      assertRefundJournals(runtime.ledger, [recovered.refund.id, final.refund.id]);
    } finally {
      runtime.ledger.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("new key can use the remainder before the original confirmed refund is posted", async () => {
  const counter = { calls: 0 };
  const fault = { armed: false };
  const { ledger, sandbox } = openRuntime(":memory:", counter, fault);
  try {
    const transactionId = await settledTransaction(sandbox, "interleaved");
    const originalKey = "refund-original-interleaved";
    const amount = { value: 80, currency: "CNY" };
    fault.armed = true;
    await assert.rejects(sandbox.requestRefund(transactionId, { amount }, originalKey), /injected confirmed-refund domain commit failure/);
    const second = await sandbox.requestRefund(transactionId, { amount: { value: 220, currency: "CNY" } }, "refund-use-remainder-before-replay");
    assert.equal(second.transaction.refunded_amount.value, 220);
    assert.equal(sandbox.refundReservation(transactionId), 80);
    assert.equal(counter.calls, 2);
    const recovered = await sandbox.requestRefund(transactionId, { amount }, originalKey);
    assert.equal(recovered.transaction.refunded_amount.value, 300);
    assert.equal(sandbox.refundReservation(transactionId), 0);
    assert.equal(counter.calls, 2);
    assertRefundJournals(ledger, [second.refund.id, recovered.refund.id]);
  } finally {
    ledger.close();
  }
});
