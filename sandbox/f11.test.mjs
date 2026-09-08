import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

function quoteInput(suffix = "f11") {
  return {
    seller_agent_id: `agt_seller_${suffix}`,
    payee_account_id: `acct_seller_${suffix}`,
    item: { name: "F11 inbound resource", delivery_type: "research_data" },
    amount: { value: 250, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function createReceivable(suffix = "f11", ledger = null) {
  const adapter = new SimulatedPaymentAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const quote = await sandbox.createQuote(quoteInput(suffix), `f11-quote-${suffix}`);
  const receivable = await sandbox.createReceivable(
    {
      quote_id: quote.id,
      account_id: `acct_seller_${suffix}`,
      agent_id: `agt_seller_${suffix}`,
      receiving_target_id: `tgt_seller_${suffix}`,
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F11 inbound resource",
      expected_payer_account_id: "acct_buyer_f11",
      expected_buyer_agent_id: "agt_buyer_f11",
    },
    `f11-receivable-${suffix}`,
  );
  return { sandbox, quote, receivable };
}

function paymentInput(receivable, overrides = {}) {
  return {
    provider_reference: "sim_inbound_f11_001",
    collection_reference: receivable.collection_reference,
    payer_account_id: "acct_buyer_f11",
    payer_agent_id: "agt_buyer_f11",
    ...overrides,
  };
}

test("F11 verifies an inbound payment and posts one immutable financial pair", async () => {
  const { sandbox, receivable } = await createReceivable();
  const before = { ...sandbox.wallet };
  const result = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "f11-collection-post-001",
  );
  assert.equal(result.collection.status, "posted");
  assert.equal(result.collection.verification_status, "verified");
  assert.equal(result.receivable.status, "paid");
  assert.equal(sandbox.listFinancialPostings().length, 2);
  assert.deepEqual(sandbox.wallet, before);
  assert.equal(sandbox.events.at(-1).type, "receivable.payment_posted");

  const replay = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "f11-collection-post-001",
  );
  assert.deepEqual(replay, result);
  const providerReplay = await sandbox.verifyInboundPayment(
    receivable.id,
    paymentInput(receivable),
    "f11-collection-post-002",
  );
  assert.deepEqual(providerReplay, result);
  assert.equal(sandbox.listFinancialPostings().length, 2);
});

test("F11 fails closed on amount, collection reference, and expected payer drift", async () => {
  const amountCase = await createReceivable("amount");
  await assert.rejects(
    amountCase.sandbox.verifyInboundPayment(
      amountCase.receivable.id,
      paymentInput(amountCase.receivable, { amount: { value: 251, currency: "CNY" } }),
      "f11-collection-amount-001",
    ),
    (error) => error.code === "inbound_amount_mismatch",
  );

  const referenceCase = await createReceivable("reference");
  await assert.rejects(
    referenceCase.sandbox.verifyInboundPayment(
      referenceCase.receivable.id,
      paymentInput(referenceCase.receivable, { collection_reference: "col_wrong_reference" }),
      "f11-collection-reference-001",
    ),
    (error) => error.code === "collection_reference_mismatch",
  );

  const payerCase = await createReceivable("payer");
  await assert.rejects(
    payerCase.sandbox.verifyInboundPayment(
      payerCase.receivable.id,
      paymentInput(payerCase.receivable, { payer_account_id: "acct_other" }),
      "f11-collection-payer-001",
    ),
    (error) => error.code === "inbound_payer_mismatch",
  );
  assert.equal(payerCase.sandbox.listFinancialPostings().length, 0);
});

test("F11 persists paid Receivable, collection, and postings across SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f11-collections-"));
  const database = join(directory, "collections.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const { sandbox, receivable } = await createReceivable("restart", firstLedger);
    const result = await sandbox.verifyInboundPayment(
      receivable.id,
      paymentInput(receivable),
      "f11-collection-restart-001",
    );
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({
      ledger: secondLedger,
      adapter: new SimulatedPaymentAdapter({ ledger: secondLedger }),
    });
    assert.deepEqual(second.getCollection(result.collection.id), result.collection);
    assert.equal(second.getReceivable(receivable.id).status, "paid");
    assert.equal(second.listFinancialPostings().length, 2);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
