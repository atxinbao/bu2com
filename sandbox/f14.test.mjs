import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

async function settledPayment(sandbox) {
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_f14_seller",
      payee_account_id: "acct_f14_seller",
      item: { name: "F14 reconciliation payment", delivery_type: "research_data" },
      amount: { value: 300, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    "f14-quote-001",
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.amount,
      purpose: "F14 reconciliation payment",
    },
    "f14-intent-001",
  );
  const authorized = await sandbox.decideAuthorization(intent.id, { decision: "authorize" }, "f14-authorize-001");
  await sandbox.submitDelivery(authorized.transaction_id, { type: "research_data", evidence_hash: "sha256:f14" }, "f14-delivery-001");
  const settled = await sandbox.settle(authorized.transaction_id, {}, "f14-settle-001");
  return { transaction: settled.transaction, intent: authorized };
}

async function postedCollection(sandbox) {
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_f14_collection_seller",
      payee_account_id: "acct_f14_collection_seller",
      item: { name: "F14 inbound collection", delivery_type: "research_data" },
      amount: { value: 200, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    "f14-collection-quote-001",
  );
  const receivable = await sandbox.createReceivable(
    {
      quote_id: quote.id,
      account_id: quote.payee_account_id,
      agent_id: quote.seller_agent_id,
      receiving_target_id: "tgt_f14_collection",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F14 inbound collection",
    },
    "f14-collection-receivable-001",
  );
  return sandbox.verifyInboundPayment(
    receivable.id,
    { provider_reference: "sim_f14_collection", collection_reference: receivable.collection_reference },
    "f14-collection-post-001",
  );
}

test("F14 records provider fees and creates a matched reconciliation run", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const payment = await settledPayment(sandbox);
  const collection = await postedCollection(sandbox);
  const refund = await sandbox.requestRefund(payment.transaction.id, { amount: { value: 100, currency: "CNY" } }, "f14-refund-001");

  const paymentFee = await sandbox.recordProviderFee(
    {
      source_type: "payment",
      source_id: payment.transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: payment.transaction.settlement_provider_reference,
      amount: { value: 5, currency: "CNY" },
    },
    "f14-fee-payment-001",
  );
  const collectionFee = await sandbox.recordProviderFee(
    {
      source_type: "collection",
      source_id: collection.collection.id,
      provider: "bu2_simulated_provider",
      provider_reference: collection.collection.provider_reference,
      amount: { value: 3, currency: "CNY" },
    },
    "f14-fee-collection-001",
  );
  await sandbox.recordProviderFee(
    {
      source_type: "refund",
      source_id: refund.refund.id,
      provider: "bu2_simulated_provider",
      provider_reference: refund.refund.provider_reference,
      amount: { value: 2, currency: "CNY" },
    },
    "f14-fee-refund-001",
  );

  const run = await sandbox.createReconciliation({}, "f14-reconcile-001");
  assert.equal(run.status, "matched");
  assert.equal(run.item_count, 6);
  assert.equal(run.exception_count, 0);
  assert.equal(run.unknown_count, 0);
  assert.deepEqual(run.totals.CNY, { payments: 300, collections: 200, refunds: 100, fees: 10 });
  assert.equal(paymentFee.status, "reported");
  assert.equal(sandbox.listFinancialPostings().length, 12);
  assert.equal(sandbox.listFinancialPostings().filter((posting) => posting.event_type === "reconciliation.fee_recorded").length, 6);
  assert.equal(sandbox.getReconciliationRun(run.id).id, run.id);
  ledger.close();
});

test("F14 fails closed on pending sources and reports them as unknown", async () => {
  const ledger = new SqliteLedger(":memory:");
  class PendingCollectionAdapter extends SimulatedPaymentAdapter {
    verifyInboundPayment({ receivable, input }) {
      return {
        status: "pending",
        provider: this.name,
        provider_reference: input.provider_reference,
        collection_reference: receivable.collection_reference,
        amount: receivable.amount,
        asset: receivable.asset,
        network: receivable.network,
      };
    }
  }
  const sandbox = new Bu2Sandbox({ ledger, adapter: new PendingCollectionAdapter({ ledger }) });
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_f14_pending_seller",
      payee_account_id: "acct_f14_pending_seller",
      item: { name: "F14 pending", delivery_type: "research_data" },
      amount: { value: 80, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    "f14-pending-quote-001",
  );
  const receivable = await sandbox.createReceivable(
    {
      quote_id: quote.id,
      account_id: quote.payee_account_id,
      agent_id: quote.seller_agent_id,
      receiving_target_id: "tgt_f14_pending",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F14 pending",
    },
    "f14-pending-receivable-001",
  );
  const pending = await sandbox.verifyInboundPayment(
    receivable.id,
    { provider_reference: "sim_f14_pending", collection_reference: receivable.collection_reference },
    "f14-pending-payment-001",
  );
  assert.equal(pending.collection.status, "pending");
  await assert.rejects(
    sandbox.recordProviderFee(
      {
        source_type: "collection",
        source_id: pending.collection.id,
        provider: "bu2_simulated_provider",
        provider_reference: "sim_f14_pending",
        amount: { value: 1, currency: "CNY" },
      },
      "f14-fee-pending-001",
    ),
    (error) => error.code === "collection_not_reconcilable",
  );
  const payment = await settledPayment(sandbox);
  await assert.rejects(
    sandbox.recordProviderFee(
      {
        source_type: "payment",
        source_id: payment.transaction.id,
        provider: "bu2_simulated_provider",
        provider_reference: payment.transaction.settlement_provider_reference,
        amount: { value: 301, currency: "CNY" },
      },
      "f14-fee-over-source-001",
    ),
    (error) => error.code === "fee_amount_exceeded",
  );
  const run = await sandbox.createReconciliation({}, "f14-reconcile-unknown-001");
  assert.equal(run.status, "unknown");
  ledger.close();
});
