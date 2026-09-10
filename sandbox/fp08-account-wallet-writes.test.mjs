import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const CURRENCY = "CNY";
const OPENING = 1_000;

function registerBindings(ledger, suffix) {
  const ids = {
    buyerLedgerId: `lga_fp08_buyer_${suffix}`,
    sellerLedgerId: `lga_fp08_seller_${suffix}`,
    buyerAccountId: `acct_fp08_buyer_${suffix}`,
    sellerAccountId: `acct_fp08_seller_${suffix}`,
    buyerAgentId: `agt_fp08_buyer_${suffix}`,
    sellerAgentId: `agt_fp08_seller_${suffix}`,
    fundingSourceId: `fund_fp08_buyer_${suffix}`,
    sellerFundingSourceId: `fund_fp08_seller_${suffix}`,
    receivingTargetId: `tgt_fp08_seller_${suffix}`,
  };
  ledger.registerLedgerAccount({
    id: ids.buyerLedgerId, environment: "local", tenant_id: `ten_fp08_buyer_${suffix}`,
    book_id: "book_primary", owner_account_id: ids.buyerAccountId, asset: CURRENCY, network: null,
  });
  ledger.registerLedgerAccount({
    id: ids.sellerLedgerId, environment: "local", tenant_id: `ten_fp08_seller_${suffix}`,
    book_id: "book_primary", owner_account_id: ids.sellerAccountId, asset: CURRENCY, network: null,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local",
    requested_by: "usr_fp08_operator",
    idempotency_key: `fp08-bindings-${suffix}`,
    tenants: [
      {
        tenant_id: `ten_fp08_buyer_${suffix}`,
        principal: { id: `usr_fp08_buyer_${suffix}`, display_name: "FP08 Buyer" },
        accounts: [{ id: ids.buyerAccountId, display_name: "FP08 Buyer" }],
        agents: [{ id: ids.buyerAgentId, display_name: "FP08 Buyer Agent" }],
        credentials: [],
        funding_sources: [{
          id: ids.fundingSourceId, account_id: ids.buyerAccountId, agent_id: ids.buyerAgentId,
          asset: CURRENCY, network: null, provider: "simulated",
          ledger_account_id: ids.buyerLedgerId, source_reference: `wallet:fp08-${suffix}`,
        }],
        receiving_targets: [],
      },
      {
        tenant_id: `ten_fp08_seller_${suffix}`,
        principal: { id: `usr_fp08_seller_${suffix}`, display_name: "FP08 Seller" },
        accounts: [{ id: ids.sellerAccountId, display_name: "FP08 Seller" }],
        agents: [{ id: ids.sellerAgentId, display_name: "FP08 Seller Agent" }],
        credentials: [],
        funding_sources: [{
          id: ids.sellerFundingSourceId, account_id: ids.sellerAccountId, agent_id: ids.sellerAgentId,
          asset: CURRENCY, network: null, provider: "simulated",
          ledger_account_id: ids.sellerLedgerId, source_reference: `wallet:fp08-seller-${suffix}`,
        }],
        receiving_targets: [{
          id: ids.receivingTargetId, account_id: ids.sellerAccountId, agent_id: ids.sellerAgentId,
          asset: CURRENCY, network: null, provider: "simulated",
          ledger_account_id: ids.sellerLedgerId, target_reference: `wallet:fp08-${suffix}`,
        }],
      },
    ],
  }, "local"));
  return ids;
}

async function activateAccountWallet(sandbox, {
  ledgerAccountId,
  accountId,
  fundingSourceId,
  suffix,
}) {
  await sandbox.createOpeningBalance({
    id: `obc_fp08_${suffix}`, book_id: "book_primary",
    account_id: accountId, owner_account_id: accountId,
    funding_source_id: fundingSourceId, environment: "local", asset: CURRENCY, network: null,
    amount: { value: OPENING, currency: CURRENCY }, effective_at: "2026-09-10T00:00:00.000Z",
    source_reference: `reconciled:fp08:${suffix}`, reason: "FP-08 account wallet opening",
  }, `fp08-opening-${suffix}`);
  const plan = await sandbox.prepareWalletMigrationPlan({
    ledger_account_id: ledgerAccountId, currency: CURRENCY,
    history_strategy: "fully_bound", classifications: [],
  }, `fp08-plan-${suffix}`);
  sandbox.refreshLedgerAccountProjection({
    ledger_account_id: ledgerAccountId, currency: CURRENCY,
    expected_active_version: null, migration_plan_id: plan.id,
  });
  const assessment = await sandbox.prepareWalletCutoverAssessment({
    ledger_account_id: ledgerAccountId, currency: CURRENCY, migration_plan_id: plan.id,
  }, `fp08-assessment-${suffix}`);
  await sandbox.activateWalletReadCutover({
    assessment_id: assessment.id, expected_active_generation: 0,
    reason: "activate FP-08 account wallet write source",
  }, `fp08-activate-${suffix}`);
}

async function createReservedPayment(sandbox, ids, suffix, value) {
  const mandate = await sandbox.createPaymentMandate({
    account_id: ids.buyerAccountId, agent_id: ids.buyerAgentId,
    funding_source_id: ids.fundingSourceId, receiving_target_id: ids.receivingTargetId,
    environment: "local", currency: CURRENCY, max_single_amount: OPENING,
    daily_limit: OPENING * 10, monthly_limit: OPENING * 20,
    effective_at: new Date(Date.now() - 1_000).toISOString(),
  }, `fp08-mandate-create-${suffix}`);
  await sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, `fp08-mandate-activate-${suffix}`);
  const quote = await sandbox.createQuote({
    seller_agent_id: ids.sellerAgentId, payee_account_id: ids.sellerAccountId,
    receiving_target_id: ids.receivingTargetId,
    item: { name: `FP08 ${suffix}`, delivery_type: "research_data" },
    amount: { value, currency: CURRENCY }, expires_at: new Date(Date.now() + 60_000).toISOString(),
  }, `fp08-quote-${suffix}`);
  sandbox.knownPayees.add(ids.sellerAccountId);
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id, payer_account_id: ids.buyerAccountId, buyer_agent_id: ids.buyerAgentId,
    payment_mandate_id: mandate.id, amount: quote.amount, purpose: `FP08 ${suffix}`,
    funding_source_id: ids.fundingSourceId, receiving_target_id: ids.receivingTargetId,
    execution_mode: "deferred",
  }, `fp08-intent-${suffix}`);
  return sandbox.executePaymentIntent(intent.id, {}, `fp08-execute-${suffix}`);
}

async function settlePayment(sandbox, ids, suffix, value) {
  const reserved = await createReservedPayment(sandbox, ids, suffix, value);
  await sandbox.submitDelivery(reserved.transaction_id, {
    type: "research_data", evidence_hash: `sha256:fp08-${suffix}`,
  }, `fp08-delivery-${suffix}`);
  return sandbox.settle(reserved.transaction_id, {}, `fp08-settle-${suffix}`);
}

async function setup(suffix, { database = ":memory:", failureInjector = null } = {}) {
  const ledger = new SqliteLedger(database, { failureInjector });
  const ids = registerBindings(ledger, suffix);
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter: new SimulatedPaymentAdapter({ ledger }),
    initialWallet: { id: `wal_fp08_legacy_${suffix}`, available: OPENING, reserved: 0, currency: CURRENCY },
  });
  await activateAccountWallet(sandbox, {
    ledgerAccountId: ids.buyerLedgerId,
    accountId: ids.buyerAccountId,
    fundingSourceId: ids.fundingSourceId,
    suffix,
  });
  return { ledger, sandbox, ids };
}

test("FP-08 routes a cut-over payment lifecycle to one account wallet and survives restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fp08-lifecycle-"));
  const database = join(directory, "ledger.sqlite");
  const context = await setup("lifecycle", { database });
  try {
    assert.equal(context.ledger.schemaVersion(), 22);
    assert.deepEqual(context.sandbox.accountWalletState(context.ids.buyerLedgerId, CURRENCY), {
      ledger_account_id: context.ids.buyerLedgerId, currency: CURRENCY, available: OPENING, reserved: 0,
    });
    const reserved = await createReservedPayment(context.sandbox, context.ids, "lifecycle_cancel", 300);
    assert.equal(context.sandbox.transactions.get(reserved.transaction_id).wallet_write_source, "account_wallet");
    assert.deepEqual(context.sandbox.accountWalletState(context.ids.buyerLedgerId, CURRENCY), {
      ledger_account_id: context.ids.buyerLedgerId, currency: CURRENCY, available: 700, reserved: 300,
    });
    assert.deepEqual(context.sandbox.wallet, { id: "wal_fp08_legacy_lifecycle", available: OPENING, reserved: 0, currency: CURRENCY });
    await assert.rejects(
      context.sandbox.rollbackWalletReadCutover({
        ledger_account_id: context.ids.buyerLedgerId, currency: CURRENCY,
        expected_active_generation: 1, reason: "must reject diverged write source",
      }, "fp08-rollback-diverged"),
      (error) => error.code === "wallet_cutover_account_wallet_diverged",
    );
    await context.sandbox.cancelTransaction(reserved.transaction_id, { reason: "coverage" }, "fp08-cancel-lifecycle");
    assert.equal(context.sandbox.accountWalletState(context.ids.buyerLedgerId, CURRENCY).available, OPENING);

    await activateAccountWallet(context.sandbox, {
      ledgerAccountId: context.ids.sellerLedgerId,
      accountId: context.ids.sellerAccountId,
      fundingSourceId: context.ids.sellerFundingSourceId,
      suffix: "lifecycle_seller",
    });
    const sellerBefore = context.sandbox.accountWalletState(context.ids.sellerLedgerId, CURRENCY);

    const settled = await settlePayment(context.sandbox, context.ids, "lifecycle_settle", 200);
    assert.deepEqual(context.sandbox.accountWalletState(context.ids.buyerLedgerId, CURRENCY), {
      ledger_account_id: context.ids.buyerLedgerId, currency: CURRENCY, available: 800, reserved: 0,
    });
    await context.sandbox.requestRefund(settled.transaction.id, {
      amount: { value: 50, currency: CURRENCY }, reason: "FP08 partial",
    }, "fp08-refund-lifecycle");
    assert.equal(context.sandbox.accountWalletState(context.ids.buyerLedgerId, CURRENCY).available, 850);
    assert.deepEqual(context.sandbox.accountWalletState(context.ids.sellerLedgerId, CURRENCY), sellerBefore);
    context.ledger.close();

    const restoredLedger = new SqliteLedger(database);
    try {
      const restored = new Bu2Sandbox({ ledger: restoredLedger, adapter: new SimulatedPaymentAdapter({ ledger: restoredLedger }) });
      assert.equal(restored.accountWalletState(context.ids.buyerLedgerId, CURRENCY).available, 850);
      assert.equal(restored.wallet.available, OPENING);
    } finally {
      restoredLedger.close();
    }
  } finally {
    try { context.ledger.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FP-08 charges buyer Payment and Refund fees once, including after account suspension", async () => {
  const { ledger, sandbox, ids } = await setup("fees");
  try {
    const settled = await settlePayment(sandbox, ids, "fees", 300);
    const refundResult = await sandbox.requestRefund(settled.transaction.id, {
      amount: { value: 80, currency: CURRENCY }, reason: "FP08 fee source",
    }, "fp08-refund-fees");
    ledger.transitionLedgerAccount(ids.buyerLedgerId, { status: "suspended", version: 1 });
    const paymentFeeInput = {
      source_type: "payment", source_id: settled.transaction.id,
      provider: "bu2_simulated_provider", provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 7, currency: CURRENCY },
    };
    await sandbox.recordProviderFee(paymentFeeInput, "fp08-payment-fee");
    await sandbox.recordProviderFee(paymentFeeInput, "fp08-payment-fee-new-key");
    await sandbox.recordProviderFee({
      source_type: "refund", source_id: refundResult.refund.id,
      provider: "bu2_simulated_provider", provider_reference: refundResult.refund.provider_reference,
      amount: { value: 3, currency: CURRENCY },
    }, "fp08-refund-fee");
    assert.equal(sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY).available, 770);
    assert.equal(sandbox.listProviderFees().length, 2);
    assert.equal(sandbox.wallet.available, OPENING);
  } finally {
    ledger.close();
  }
});

test("FP-08 records an observed fee into negative availability and blocks a new reserve before Provider access", async () => {
  const { ledger, sandbox, ids } = await setup("negative_fee");
  try {
    const settled = await settlePayment(sandbox, ids, "negative_fee", 600);
    await sandbox.recordProviderFee({
      source_type: "payment",
      source_id: settled.transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 600, currency: CURRENCY },
    }, "fp08-negative-payment-fee");

    assert.equal(sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY).available, -200);
    const adapterOperationCount = ledger.adapterOperations().length;
    await assert.rejects(
      createReservedPayment(sandbox, ids, "negative_fee_blocked", 1),
      (error) => error.code === "wallet_read_cutover_unhealthy"
        && error.details.blockers.includes("candidate_capacity_unavailable"),
    );
    assert.equal(ledger.adapterOperations().length, adapterOperationCount);
    assert.equal(sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY).available, -200);
  } finally {
    ledger.close();
  }
});

test("FP-08 only permits cutover activation to initialize an account wallet", async () => {
  const { ledger, sandbox, ids } = await setup("initialization_owner");
  try {
    const scopeKey = JSON.stringify([ids.sellerLedgerId, CURRENCY]);
    await assert.rejects(
      sandbox.runIdempotentAsync("fp08/forged-wallet", "fp08-forged-wallet", {}, async () => {
        sandbox.accountWallets.set(scopeKey, {
          ledger_account_id: ids.sellerLedgerId,
          currency: CURRENCY,
          available: OPENING,
          reserved: 0,
        });
        return { status: "forged" };
      }),
      (error) => error.code === "account_wallet_initialization_required",
    );
    assert.equal(sandbox.accountWalletState(ids.sellerLedgerId, CURRENCY), null);
    assert.equal(ledger.db.prepare(`
      SELECT COUNT(*) AS count FROM account_wallet_balances WHERE ledger_account_id=? AND currency=?
    `).get(ids.sellerLedgerId, CURRENCY).count, 0);
  } finally {
    ledger.close();
  }
});

test("FP-08 protects account wallet scope, safe integers, reserved funds, and deletion in SQLite", async () => {
  const { ledger, ids } = await setup("sqlite_constraints");
  try {
    const scope = [ids.buyerLedgerId, CURRENCY];
    assert.throws(
      () => ledger.db.prepare("UPDATE account_wallet_balances SET currency='USD' WHERE ledger_account_id=? AND currency=?").run(...scope),
      /account_wallet_scope_immutable/,
    );
    assert.throws(
      () => ledger.db.prepare("UPDATE account_wallet_balances SET reserved=-1 WHERE ledger_account_id=? AND currency=?").run(...scope),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => ledger.db.prepare("UPDATE account_wallet_balances SET available=9007199254740992 WHERE ledger_account_id=? AND currency=?").run(...scope),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => ledger.db.prepare("DELETE FROM account_wallet_balances WHERE ledger_account_id=? AND currency=?").run(...scope),
      /account_wallet_delete_forbidden/,
    );
  } finally {
    ledger.close();
  }
});

test("FP-08 rolls account wallet and fee facts back together after an injected failure", async () => {
  let fail = false;
  const { ledger, sandbox, ids } = await setup("atomic", {
    failureInjector(stage) {
      if (fail && stage === "after_account_wallet_write") throw new Error("fp08 injected failure");
    },
  });
  try {
    const settled = await settlePayment(sandbox, ids, "atomic", 200);
    const before = sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY);
    const feeInput = {
      source_type: "payment", source_id: settled.transaction.id,
      provider: "bu2_simulated_provider", provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 5, currency: CURRENCY },
    };
    fail = true;
    await assert.rejects(sandbox.recordProviderFee(feeInput, "fp08-atomic-fee"), /fp08 injected failure/);
    assert.deepEqual(sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY), before);
    assert.equal(sandbox.listProviderFees().length, 0);
    assert.equal(sandbox.listFinancialPostings().filter((posting) => posting.event_type === "reconciliation.fee_recorded").length, 0);
    fail = false;
    await sandbox.recordProviderFee(feeInput, "fp08-atomic-fee");
    assert.equal(sandbox.accountWalletState(ids.buyerLedgerId, CURRENCY).available, before.available - 5);
  } finally {
    ledger.close();
  }
});

test("FP-08 rejects a stale concurrent fee commit and converges by idempotent business replay", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fp08-concurrency-"));
  const database = join(directory, "ledger.sqlite");
  const context = await setup("concurrency", { database });
  try {
    const settled = await settlePayment(context.sandbox, context.ids, "concurrency", 200);
    const otherLedger = new SqliteLedger(database);
    try {
      const other = new Bu2Sandbox({ ledger: otherLedger, adapter: new SimulatedPaymentAdapter({ ledger: otherLedger }) });
      const feeInput = {
        source_type: "payment", source_id: settled.transaction.id,
        provider: "bu2_simulated_provider", provider_reference: settled.transaction.settlement_provider_reference,
        amount: { value: 5, currency: CURRENCY },
      };
      const results = await Promise.allSettled([
        context.sandbox.recordProviderFee(feeInput, "fp08-concurrent-fee-a"),
        other.recordProviderFee(feeInput, "fp08-concurrent-fee-b"),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "transaction_state_conflict").length, 1);
      const replay = await other.recordProviderFee(feeInput, "fp08-concurrent-fee-replay");
      assert.equal(replay.amount.value, 5);
      const restored = new Bu2Sandbox({ ledger: otherLedger });
      assert.equal(restored.listProviderFees().length, 1);
      assert.equal(restored.accountWalletState(context.ids.buyerLedgerId, CURRENCY).available, 795);
    } finally {
      otherLedger.close();
    }
  } finally {
    context.ledger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
