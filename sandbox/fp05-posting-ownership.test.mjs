import assert from "node:assert/strict";
import test from "node:test";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const now = () => new Date(Date.now() - 1_000).toISOString();

function setup(suffix) {
  const ledger = new SqliteLedger(":memory:");
  const buyerLedgerId = `lga_fp05_buyer_${suffix}`;
  const sellerLedgerId = `lga_fp05_seller_${suffix}`;
  ledger.registerLedgerAccount({
    id: buyerLedgerId,
    environment: "local",
    tenant_id: `ten_fp05_buyer_${suffix}`,
    book_id: "book_primary",
    owner_account_id: `acct_fp05_buyer_${suffix}`,
    asset: "CNY",
    network: null,
  });
  ledger.registerLedgerAccount({
    id: sellerLedgerId,
    environment: "local",
    tenant_id: `ten_fp05_seller_${suffix}`,
    book_id: "book_primary",
    owner_account_id: `acct_fp05_seller_${suffix}`,
    asset: "CNY",
    network: null,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local",
    requested_by: "usr_fp05_operator",
    idempotency_key: `fp05-bindings-${suffix}`,
    tenants: [
      {
        tenant_id: `ten_fp05_buyer_${suffix}`,
        principal: { id: `usr_fp05_buyer_${suffix}`, display_name: "FP05 Buyer" },
        accounts: [{ id: `acct_fp05_buyer_${suffix}`, display_name: "FP05 Buyer" }],
        agents: [{ id: `agt_fp05_buyer_${suffix}`, display_name: "FP05 Buyer Agent" }],
        credentials: [],
        funding_sources: [{
          id: `fund_fp05_buyer_${suffix}`,
          account_id: `acct_fp05_buyer_${suffix}`,
          agent_id: `agt_fp05_buyer_${suffix}`,
          asset: "CNY",
          network: null,
          provider: "simulated",
          ledger_account_id: buyerLedgerId,
          source_reference: `wallet:fp05-buyer-${suffix}`,
        }],
        receiving_targets: [],
      },
      {
        tenant_id: `ten_fp05_seller_${suffix}`,
        principal: { id: `usr_fp05_seller_${suffix}`, display_name: "FP05 Seller" },
        accounts: [{ id: `acct_fp05_seller_${suffix}`, display_name: "FP05 Seller" }],
        agents: [{ id: `agt_fp05_seller_${suffix}`, display_name: "FP05 Seller Agent" }],
        credentials: [],
        funding_sources: [],
        receiving_targets: [{
          id: `tgt_fp05_seller_${suffix}`,
          account_id: `acct_fp05_seller_${suffix}`,
          agent_id: `agt_fp05_seller_${suffix}`,
          asset: "CNY",
          network: null,
          provider: "simulated",
          ledger_account_id: sellerLedgerId,
          target_reference: `wallet:fp05-seller-${suffix}`,
        }],
      },
    ],
  }, "local"));
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  return { sandbox, ledger, buyerLedgerId, sellerLedgerId };
}

async function createMandate(sandbox, suffix) {
  const mandate = await sandbox.createPaymentMandate({
    account_id: `acct_fp05_buyer_${suffix}`,
    agent_id: `agt_fp05_buyer_${suffix}`,
    funding_source_id: `fund_fp05_buyer_${suffix}`,
    receiving_target_id: `tgt_fp05_seller_${suffix}`,
    environment: "local",
    currency: "CNY",
    max_single_amount: 1_000,
    daily_limit: 5_000,
    monthly_limit: 10_000,
    effective_at: now(),
  }, `fp05-mandate-create-${suffix}`);
  return sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, `fp05-mandate-activate-${suffix}`);
}

async function reservePayment(sandbox, suffix) {
  const mandate = await createMandate(sandbox, suffix);
  const quote = await sandbox.createQuote({
    seller_agent_id: `agt_fp05_seller_${suffix}`,
    payee_account_id: `acct_fp05_seller_${suffix}`,
    receiving_target_id: `tgt_fp05_seller_${suffix}`,
    item: { name: "FP05 business posting", delivery_type: "research_data" },
    amount: { value: 300, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }, `fp05-quote-${suffix}`);
  assert.equal(Object.hasOwn(quote, "receiving_ledger_account_id"), false);
  assert.equal(sandbox.quotes.get(quote.id).receiving_ledger_account_id, `lga_fp05_seller_${suffix}`);
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: `acct_fp05_buyer_${suffix}`,
    buyer_agent_id: `agt_fp05_buyer_${suffix}`,
    payment_mandate_id: mandate.id,
    amount: quote.amount,
    purpose: "FP05 ownership flow",
    funding_source_id: `fund_fp05_buyer_${suffix}`,
    receiving_target_id: `tgt_fp05_seller_${suffix}`,
  }, `fp05-intent-${suffix}`);
  assert.equal(Object.hasOwn(intent, "funding_ledger_account_id"), false);
  assert.equal(Object.hasOwn(intent, "receiving_ledger_account_id"), false);
  assert.equal(sandbox.intents.get(intent.id).funding_ledger_account_id, `lga_fp05_buyer_${suffix}`);
  const reserved = await sandbox.decideAuthorization(intent.id, { decision: "authorize" }, `fp05-authorize-${suffix}`);
  assert.equal(Object.hasOwn(reserved, "funding_ledger_account_id"), false);
  return reserved;
}

test("FP-05 binds settlement, refund, fee and correction to the trusted funding ledger account", async () => {
  const { sandbox, ledger, buyerLedgerId } = setup("outbound");
  try {
    const reserved = await reservePayment(sandbox, "outbound");
    const transaction = sandbox.transactions.get(reserved.transaction_id);
    assert.equal(transaction.ledger_account_id, buyerLedgerId);

    ledger.transitionLedgerAccount(buyerLedgerId, { status: "suspended", version: 1 });
    await sandbox.submitDelivery(transaction.id, { type: "research_data", evidence_hash: "sha256:fp05-outbound" }, "fp05-delivery-outbound");
    const settled = await sandbox.settle(transaction.id, {}, "fp05-settle-outbound");
    assert.equal(Object.hasOwn(settled.transaction, "ledger_account_id"), false);
    const settlementPostings = sandbox.listFinancialPostings(transaction.id).filter((posting) => posting.event_type === "transaction.settled");
    assert.equal(settlementPostings.length, 2);
    assert.ok(settlementPostings.every((posting) => posting.ledger_account_id === buyerLedgerId));

    const refund = await sandbox.requestRefund(transaction.id, { amount: { value: 50, currency: "CNY" }, reason: "FP05 partial" }, "fp05-refund-outbound");
    assert.equal(refund.refund.status, "refunded");
    const refundPostings = sandbox.listFinancialPostings(transaction.id).filter((posting) => posting.event_type === "transaction.refunded");
    assert.equal(refundPostings.length, 2);
    assert.ok(refundPostings.every((posting) => posting.ledger_account_id === buyerLedgerId));

    const fee = await sandbox.recordProviderFee({
      source_type: "payment",
      source_id: transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 7, currency: "CNY" },
    }, "fp05-fee-outbound");
    assert.equal(Object.hasOwn(fee, "ledger_account_id"), false);
    const feePostings = sandbox.listFinancialPostings().filter((posting) => posting.source_id === fee.id);
    assert.ok(feePostings.every((posting) => posting.ledger_account_id === buyerLedgerId));

    const settlementEvent = sandbox.events.find((event) => event.type === "transaction.settled" && event.resource_id === transaction.id);
    const correction = await sandbox.postLedgerCorrection({
      original_event_id: settlementEvent.id,
      book_id: "book_primary",
      environment: "local",
      amount: { value: 1, currency: "CNY" },
      debit_account: "expense.reconciliation_adjustment",
      credit_account: "equity.reconciliation_adjustment",
      reason: "FP05 append-only correction",
    }, "fp05-correction-outbound");
    assert.equal(Object.hasOwn(correction, "ledger_account_id"), false);
    assert.ok(sandbox.listFinancialPostings().filter((posting) => posting.source_id === correction.id).every((posting) => posting.ledger_account_id === buyerLedgerId));

    assert.equal(sandbox.rebuildLedgerAccountProjection({ ledger_account_id: buyerLedgerId, currency: "CNY" }).unbalanced_journal_count, 0);
    assert.throws(
      () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: buyerLedgerId, currency: "CNY", expected_active_version: null }),
      (error) => error.code === "ledger_account_not_active",
    );

    const secondQuote = await sandbox.createQuote({
      seller_agent_id: "agt_fp05_seller_outbound",
      payee_account_id: "acct_fp05_seller_outbound",
      receiving_target_id: "tgt_fp05_seller_outbound",
      item: { name: "Blocked new spend", delivery_type: "research_data" },
      amount: { value: 10, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }, "fp05-quote-blocked");
    await assert.rejects(
      sandbox.createPaymentIntent({
        quote_id: secondQuote.id,
        payer_account_id: "acct_fp05_buyer_outbound",
        buyer_agent_id: "agt_fp05_buyer_outbound",
        payment_mandate_id: reserved.payment_mandate_id,
        amount: secondQuote.amount,
        purpose: "must fail while suspended",
        funding_source_id: "fund_fp05_buyer_outbound",
        receiving_target_id: "tgt_fp05_seller_outbound",
      }, "fp05-intent-blocked"),
      (error) => error.code === "ledger_account_not_active",
    );
  } finally {
    ledger.close();
  }
});

test("FP-05 binds a confirmed inbound collection to the trusted receiving ledger account after suspension", async () => {
  const { sandbox, ledger, sellerLedgerId } = setup("inbound");
  try {
    const quote = await sandbox.createQuote({
      seller_agent_id: "agt_fp05_seller_inbound",
      payee_account_id: "acct_fp05_seller_inbound",
      receiving_target_id: "tgt_fp05_seller_inbound",
      item: { name: "FP05 inbound", delivery_type: "research_data" },
      amount: { value: 250, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }, "fp05-inbound-quote");
    assert.equal(Object.hasOwn(quote, "receiving_ledger_account_id"), false);
    const receivable = await sandbox.createReceivable({
      quote_id: quote.id,
      account_id: "acct_fp05_seller_inbound",
      agent_id: "agt_fp05_seller_inbound",
      receiving_target_id: "tgt_fp05_seller_inbound",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "FP05 inbound collection",
    }, "fp05-inbound-receivable");
    assert.equal(Object.hasOwn(receivable, "receiving_ledger_account_id"), false);
    assert.equal(sandbox.receivables.get(receivable.id).receiving_ledger_account_id, sellerLedgerId);
    ledger.transitionLedgerAccount(sellerLedgerId, { status: "suspended", version: 1 });
    const result = await sandbox.verifyInboundPayment(receivable.id, {
      provider_reference: "sim_fp05_inbound_001",
      collection_reference: receivable.collection_reference,
    }, "fp05-inbound-verify");
    assert.equal(result.collection.status, "posted");
    assert.equal(Object.hasOwn(result.collection, "ledger_account_id"), false);
    assert.equal(sandbox.collections.get(result.collection.id).ledger_account_id, sellerLedgerId);
    const postings = sandbox.listFinancialPostings().filter((posting) => posting.source_id === result.collection.id);
    assert.equal(postings.length, 2);
    assert.ok(postings.every((posting) => posting.ledger_account_id === sellerLedgerId));
    assert.equal(sandbox.rebuildLedgerAccountProjection({ ledger_account_id: sellerLedgerId, currency: "CNY" }).unbalanced_journal_count, 0);
  } finally {
    ledger.close();
  }
});

test("FP-05 rejects wallet onboarding when ledger ownership does not match the trusted account", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    ledger.registerLedgerAccount({ id: "lga_fp05_wrong_owner", environment: "local", tenant_id: "ten_fp05_owner", book_id: "book_primary", owner_account_id: "acct_fp05_owner", asset: "CNY", network: null });
    assert.throws(
      () => ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
        environment: "local",
        requested_by: "usr_fp05_operator",
        idempotency_key: "fp05-wrong-owner",
        tenants: [{
          tenant_id: "ten_fp05_other",
          principal: { id: "usr_fp05_other", display_name: "Other" },
          accounts: [{ id: "acct_fp05_other", display_name: "Other" }],
          agents: [],
          credentials: [],
          funding_sources: [{ id: "fund_fp05_other", account_id: "acct_fp05_other", agent_id: null, asset: "CNY", network: null, provider: "simulated", ledger_account_id: "lga_fp05_wrong_owner", source_reference: "wallet:wrong" }],
          receiving_targets: [],
        }],
      }, "local")),
      (error) => error.code === "ledger_account_ownership_mismatch",
    );
  } finally {
    ledger.close();
  }
});

test("FP-05 keeps trusted wallet ownership immutable at the SQLite boundary", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    ledger.registerLedgerAccount({
      id: "lga_fp05_immutable_primary",
      environment: "local",
      tenant_id: "ten_fp05_immutable",
      book_id: "book_primary",
      owner_account_id: "acct_fp05_immutable",
      asset: "CNY",
      network: null,
    });
    ledger.registerLedgerAccount({
      id: "lga_fp05_immutable_secondary",
      environment: "local",
      tenant_id: "ten_fp05_immutable",
      book_id: "book_secondary",
      owner_account_id: "acct_fp05_immutable",
      asset: "CNY",
      network: null,
    });
    ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
      environment: "local",
      requested_by: "usr_fp05_reviewer",
      idempotency_key: "fp05-immutable-binding",
      tenants: [{
        tenant_id: "ten_fp05_immutable",
        principal: { id: "usr_fp05_immutable", display_name: "FP05 immutable owner" },
        accounts: [{ id: "acct_fp05_immutable", display_name: "FP05 immutable account" }],
        agents: [{ id: "agt_fp05_immutable", display_name: "FP05 immutable agent" }],
        credentials: [],
        funding_sources: [{
          id: "fund_fp05_immutable",
          account_id: "acct_fp05_immutable",
          agent_id: "agt_fp05_immutable",
          asset: "CNY",
          network: null,
          provider: "simulated",
          ledger_account_id: "lga_fp05_immutable_primary",
          source_reference: "wallet:fp05-immutable",
        }],
        receiving_targets: [],
      }],
    }, "local"));

    assert.throws(
      () => ledger.db.prepare("UPDATE funding_sources SET ledger_account_id=? WHERE environment='local' AND id='fund_fp05_immutable'").run("lga_fp05_immutable_secondary"),
      /funding_source_ownership_immutable/,
    );
    assert.equal(
      ledger.assertWalletBindingById("local", {
        kind: "funding_source",
        bindingId: "fund_fp05_immutable",
        asset: "CNY",
        network: null,
      }).ledger_account.id,
      "lga_fp05_immutable_primary",
    );
  } finally {
    ledger.close();
  }
});

test("FP-05 leaves historical null ledger bindings readable but blocks new financial use", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    ledger.db.prepare(`
      INSERT INTO funding_sources(
        environment, id, tenant_id, account_id, agent_id, asset, network,
        provider, source_reference, status, verification_status, generation,
        created_at, updated_at, ledger_account_id
      ) VALUES ('local', 'fund_fp05_legacy', 'ten_fp05_legacy', 'acct_fp05_legacy', NULL,
        'CNY', NULL, 'simulated', 'wallet:fp05-legacy', 'active', 'verified', 1,
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', NULL)
    `).run();
    const rows = ledger._bindingRows("funding_sources", "local", "ten_fp05_legacy");
    assert.equal(rows[0].ledger_account_id, null);
    assert.throws(
      () => ledger.assertWalletBinding("local", {
        kind: "funding_source",
        accountId: "acct_fp05_legacy",
        asset: "CNY",
        network: null,
        reference: "fund_fp05_legacy",
      }),
      (error) => error.code === "wallet_binding_ledger_account_required",
    );
  } finally {
    ledger.close();
  }
});

test("FP-05 rejects ambiguous trusted bindings instead of selecting the first row", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    ledger.registerLedgerAccount({
      id: "lga_fp05_ambiguous",
      environment: "local",
      tenant_id: "ten_fp05_ambiguous",
      book_id: "book_primary",
      owner_account_id: "acct_fp05_ambiguous",
      asset: "CNY",
      network: null,
    });
    ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
      environment: "local",
      requested_by: "usr_fp05_reviewer",
      idempotency_key: "fp05-ambiguous-bindings",
      tenants: [{
        tenant_id: "ten_fp05_ambiguous",
        principal: { id: "usr_fp05_ambiguous", display_name: "FP05 ambiguous owner" },
        accounts: [{ id: "acct_fp05_ambiguous", display_name: "FP05 ambiguous account" }],
        agents: [{ id: "agt_fp05_ambiguous", display_name: "FP05 ambiguous agent" }],
        credentials: [],
        funding_sources: [
          {
            id: "fund_fp05_ambiguous_a",
            account_id: "acct_fp05_ambiguous",
            agent_id: "agt_fp05_ambiguous",
            asset: "CNY",
            network: null,
            provider: "simulated",
            ledger_account_id: "lga_fp05_ambiguous",
            source_reference: "wallet:fp05-ambiguous-a",
          },
          {
            id: "fund_fp05_ambiguous_b",
            account_id: "acct_fp05_ambiguous",
            agent_id: "agt_fp05_ambiguous",
            asset: "CNY",
            network: null,
            provider: "simulated",
            ledger_account_id: "lga_fp05_ambiguous",
            source_reference: "wallet:fp05-ambiguous-b",
          },
        ],
        receiving_targets: [],
      }],
    }, "local"));

    assert.throws(
      () => ledger.assertWalletBinding("local", {
        kind: "funding_source",
        accountId: "acct_fp05_ambiguous",
        agentId: "agt_fp05_ambiguous",
        asset: "CNY",
        network: null,
      }),
      (error) => error.code === "funding_source_binding_ambiguous",
    );
    assert.equal(
      ledger.assertWalletBinding("local", {
        kind: "funding_source",
        accountId: "acct_fp05_ambiguous",
        agentId: "agt_fp05_ambiguous",
        asset: "CNY",
        network: null,
        reference: "fund_fp05_ambiguous_b",
      }).binding.id,
      "fund_fp05_ambiguous_b",
    );
  } finally {
    ledger.close();
  }
});
