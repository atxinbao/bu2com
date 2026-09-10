import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const CURRENCY = "CNY";
const BOOK_ID = "book_social_wallet";
const BUYER_OPENING = 100_000;
const SELLER_OPENING = 25_000;

const sha256Json = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

class RecoverableUnknownSettlementAdapter extends SimulatedPaymentAdapter {
  settle(transactionId, amount) {
    const operationKey = `settle:${transactionId}`;
    const existing = this.ledger.getAdapterOperation(operationKey);
    if (!existing) {
      const now = new Date().toISOString();
      this.ledger.saveAdapterOperation({
        idempotency_key: operationKey,
        operation: "settle",
        transaction_id: transactionId,
        provider_reference: "sim_fp07_unknown_settlement",
        amount_value: amount.value,
        currency: amount.currency,
        status: "provider_unknown",
        last_error: "fp07_simulated_settlement_unknown",
        created_at: now,
        updated_at: now,
        resolved_at: null,
      });
    }
    throw new ApiError(
      503,
      "provider_unknown",
      "fp07_simulated_settlement_unknown",
      "FP-07 simulated settlement result is unknown and requires explicit recovery.",
    );
  }

  recoverSettlement(transactionId, amount) {
    const operationKey = `settle:${transactionId}`;
    const existing = this.ledger.getAdapterOperation(operationKey);
    if (!existing || existing.operation !== "settle" || existing.amount_value !== amount.value || existing.currency !== amount.currency) {
      throw new ApiError(409, "idempotency_conflict", "fp07_recovery_operation_mismatch", "FP-07 recovery operation no longer matches the original simulated settlement.");
    }
    const recorded = this.ledger.recordAdapterRecovery({
      operation_key: operationKey,
      transaction_id: transactionId,
      status: "settled",
      provider_reference: "sim_fp07_recovered_settlement",
      reason_code: null,
    });
    return {
      ...recorded.operation,
      recovery_attempt_id: recorded.attempt.id,
      recovery_reason_code: null,
    };
  }
}

function onboardingDocument() {
  return {
    environment: "local",
    requested_by: "usr_fp07_reviewer",
    idempotency_key: "fp07-social-wallet-onboarding",
    tenants: [
      {
        tenant_id: "ten_fp07_buyer",
        principal: { id: "usr_fp07_buyer", display_name: "FP07 Buyer" },
        accounts: [{ id: "acct_fp07_buyer", display_name: "FP07 Buyer Account" }],
        agents: [
          { id: "agt_fp07_buyer_pay", display_name: "FP07 Buyer Pay Agent" },
          { id: "agt_fp07_buyer_collect", display_name: "FP07 Buyer Collection Agent" },
        ],
        credentials: [],
        funding_sources: [{
          id: "fund_fp07_buyer",
          account_id: "acct_fp07_buyer",
          agent_id: "agt_fp07_buyer_pay",
          asset: CURRENCY,
          network: null,
          provider: "simulated",
          ledger_account_id: "lga_fp07_buyer",
          source_reference: "wallet:fp07-buyer",
        }],
        receiving_targets: [{
          id: "tgt_fp07_buyer",
          account_id: "acct_fp07_buyer",
          agent_id: "agt_fp07_buyer_collect",
          asset: CURRENCY,
          network: null,
          provider: "simulated",
          ledger_account_id: "lga_fp07_buyer",
          target_reference: "wallet:fp07-buyer-receive",
        }],
      },
      {
        tenant_id: "ten_fp07_seller",
        principal: { id: "usr_fp07_seller", display_name: "FP07 Seller" },
        accounts: [{ id: "acct_fp07_seller", display_name: "FP07 Seller Account" }],
        agents: [
          { id: "agt_fp07_seller_sales", display_name: "FP07 Seller Sales Agent" },
          { id: "agt_fp07_seller_collect", display_name: "FP07 Seller Collection Agent" },
        ],
        credentials: [],
        funding_sources: [{
          id: "fund_fp07_seller",
          account_id: "acct_fp07_seller",
          agent_id: null,
          asset: CURRENCY,
          network: null,
          provider: "simulated",
          ledger_account_id: "lga_fp07_seller",
          source_reference: "wallet:fp07-seller-opening",
        }],
        receiving_targets: [
          {
            id: "tgt_fp07_seller_sales",
            account_id: "acct_fp07_seller",
            agent_id: "agt_fp07_seller_sales",
            asset: CURRENCY,
            network: null,
            provider: "simulated",
            ledger_account_id: "lga_fp07_seller",
            target_reference: "wallet:fp07-seller-sales",
          },
          {
            id: "tgt_fp07_seller_collect",
            account_id: "acct_fp07_seller",
            agent_id: "agt_fp07_seller_collect",
            asset: CURRENCY,
            network: null,
            provider: "simulated",
            ledger_account_id: "lga_fp07_seller",
            target_reference: "wallet:fp07-seller-collect",
          },
        ],
      },
    ],
  };
}

function registerProductLedgers(ledger) {
  ledger.registerLedgerAccount({
    id: "lga_fp07_buyer",
    environment: "local",
    tenant_id: "ten_fp07_buyer",
    book_id: BOOK_ID,
    owner_account_id: "acct_fp07_buyer",
    asset: CURRENCY,
    network: null,
  });
  ledger.registerLedgerAccount({
    id: "lga_fp07_seller",
    environment: "local",
    tenant_id: "ten_fp07_seller",
    book_id: BOOK_ID,
    owner_account_id: "acct_fp07_seller",
    asset: CURRENCY,
    network: null,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument(onboardingDocument(), "local"));
}

async function createOpeningBalances(sandbox) {
  const effectiveAt = "2026-09-10T00:00:00.000Z";
  const buyer = await sandbox.createOpeningBalance({
    id: "obc_fp07_buyer",
    book_id: BOOK_ID,
    account_id: "acct_fp07_buyer",
    owner_account_id: "acct_fp07_buyer",
    funding_source_id: "fund_fp07_buyer",
    environment: "local",
    asset: CURRENCY,
    network: null,
    amount: { value: BUYER_OPENING, currency: CURRENCY },
    effective_at: effectiveAt,
    source_reference: "reconciled:fp07:buyer-opening",
    reason: "FP-07 isolated Local buyer opening checkpoint",
  }, "fp07-opening-buyer");
  const seller = await sandbox.createOpeningBalance({
    id: "obc_fp07_seller",
    book_id: BOOK_ID,
    account_id: "acct_fp07_seller",
    owner_account_id: "acct_fp07_seller",
    funding_source_id: "fund_fp07_seller",
    environment: "local",
    asset: CURRENCY,
    network: null,
    amount: { value: SELLER_OPENING, currency: CURRENCY },
    effective_at: effectiveAt,
    source_reference: "reconciled:fp07:seller-opening",
    reason: "FP-07 isolated Local seller opening checkpoint",
  }, "fp07-opening-seller");
  return { buyer, seller };
}

async function createBuyerExecutionContext(sandbox) {
  const now = new Date(Date.now() - 1_000).toISOString();
  const session = await sandbox.createExecutionSession({
    tenant_id: "ten_fp07_buyer",
    account_id: "acct_fp07_buyer",
    agent_id: "agt_fp07_buyer_pay",
    environment: "local",
    purpose: "FP-07 Social Wallet Local product acceptance",
    max_spend: { value: 1_000, currency: CURRENCY },
    starts_at: now,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }, "fp07-session-create");
  const activeSession = await sandbox.transitionExecutionSession(session.id, "activate", {
    version: 1,
    activation_id: "act_fp07_local_product",
    approved_by: "usr_fp07_reviewer",
  }, "fp07-session-activate");
  const mandate = await sandbox.createPaymentMandate({
    account_id: "acct_fp07_buyer",
    agent_id: "agt_fp07_buyer_pay",
    funding_source_id: "fund_fp07_buyer",
    receiving_target_id: "tgt_fp07_seller_sales",
    environment: "local",
    currency: CURRENCY,
    max_single_amount: 500,
    daily_limit: 1_000,
    monthly_limit: 10_000,
    effective_at: now,
  }, "fp07-mandate-create");
  const activeMandate = await sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, "fp07-mandate-activate");
  return { session: activeSession, mandate: activeMandate };
}

async function pay(sandbox, { suffix, value, session, mandate }) {
  const quote = await sandbox.createQuote({
    seller_agent_id: "agt_fp07_seller_sales",
    payee_account_id: "acct_fp07_seller",
    receiving_target_id: "tgt_fp07_seller_sales",
    asset: CURRENCY,
    network: null,
    item: { name: `FP07 resource ${suffix}`, delivery_type: "research_data" },
    amount: { value, currency: CURRENCY },
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  }, `fp07-quote-${suffix}`);
  sandbox.knownPayees.add(quote.payee_account_id);
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: "acct_fp07_buyer",
    buyer_agent_id: "agt_fp07_buyer_pay",
    payment_mandate_id: mandate.id,
    amount: quote.amount,
    asset: CURRENCY,
    network: null,
    purpose: `FP07 payment ${suffix}`,
    funding_source_id: "fund_fp07_buyer",
    receiving_target_id: "tgt_fp07_seller_sales",
    execution_session_id: session.id,
    execution_mode: "deferred",
  }, `fp07-intent-${suffix}`);
  assert.equal(intent.status, "authorized");
  const preExecutionView = sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
  const buyerPostings = sandbox.listFinancialPostings().filter((posting) => posting.ledger_account_id === "lga_fp07_buyer");
  assert.equal(preExecutionView.status, "active", `pre-execution runtime blocked: ${JSON.stringify({ blockers: preExecutionView.blockers ?? [], stale_reasons: preExecutionView.model?.stale_reasons ?? [], completeness: preExecutionView.model?.completeness ?? null, postings: buyerPostings.map(({ event_type, source_id }) => ({ event_type, source_id })) })}`);
  const executed = await sandbox.executePaymentIntent(intent.id, {}, `fp07-execute-${suffix}`);
  assert.equal(executed.status, "funds_reserved");
  await sandbox.submitDelivery(executed.transaction_id, {
    type: "research_data",
    evidence_hash: `sha256:fp07-${suffix}`,
  }, `fp07-delivery-${suffix}`);
  return { quote, intent, executed };
}

function financialFactSnapshot(ledger) {
  const postings = ledger.db.prepare(`
    SELECT id, event_id, journal_id, event_type, source_id, direction, account,
           amount_value, currency, ledger_account_id, created_at
    FROM financial_postings ORDER BY id
  `).all();
  return {
    posting_count: postings.length,
    event_count: ledger.listLedgerEvents().length,
    sha256: sha256Json({ postings, events: ledger.listLedgerEvents() }),
  };
}

async function rejectedCode(operation) {
  try {
    await operation();
  } catch (error) {
    assert.equal(typeof error?.code, "string");
    return error.code;
  }
  throw new Error("Expected operation to fail closed");
}

function validateAcceptanceShape(evidence, { expectedSourceCommit = null, expectedImageId = null } = {}) {
  return Boolean(
    evidence?.schema_version === "fp08.social-wallet-acceptance.v1"
    && evidence.status === "passed"
    && evidence.environment?.service === "local"
    && evidence.environment?.execution_backend === "simulated"
    && evidence.scope?.account_count === 2
    && evidence.scope?.agent_count === 4
    && evidence.scope?.ledger_account_count === 2
    && evidence.flows?.outbound_payment === "settled"
    && evidence.flows?.inbound_collection === "posted"
    && evidence.flows?.partial_refund === "refunded"
    && evidence.flows?.provider_fee_count === 3
    && evidence.flows?.reconciliation === "matched"
    && evidence.recovery?.provider_unknown_recovered === true
    && evidence.recovery?.restart_verified === true
    && evidence.history?.status === "complete"
    && evidence.history?.automatic_provider_replay === false
    && evidence.projection?.delete_rebuild_verified === true
    && evidence.wallet_read?.buyer_runtime_status === "active"
    && evidence.wallet_read?.buyer_spend_decision_source === "account_wallet"
    && evidence.wallet_read?.seller_shadow_status === "difference"
    && evidence.backup_restore?.integrity === "ok"
    && evidence.backup_restore?.same_financial_fact_hash === true
    && evidence.backup_restore?.receipt_valid === true
    && evidence.boundary?.cross_agent_funding_denied === true
    && evidence.boundary?.cross_agent_error_code === "funding_source_binding_required"
    && evidence.boundary?.wrong_asset_denied === true
    && evidence.boundary?.wrong_asset_error_code === "funding_source_binding_mismatch"
    && evidence.boundary?.wrong_network_denied === true
    && evidence.boundary?.wrong_network_error_code === "funding_source_binding_mismatch"
    && evidence.boundary?.sandbox_execution_status === "execution_disabled"
    && evidence.authorization?.external_provider_call === false
    && evidence.authorization?.simulated_payment_flow_executed === true
    && evidence.authorization?.signer_loaded === false
    && evidence.authorization?.payment_execution_attempted === false
    && evidence.authorization?.live_enabled === false
    && evidence.external_sandbox_bilateral?.status === "not_executed"
    && evidence.external_sandbox_bilateral?.accepted === false
    && evidence.product_boundary?.multi_account_spend_decision_source === "account_scoped_wallet"
    && evidence.product_boundary?.public_wallet_api_authorized === false
    && evidence.product_boundary?.product_promotion_authorized === false
    && evidence.product_boundary?.buyer_side_provider_fee_spend_semantics_authorized === true
    && (!expectedSourceCommit || evidence.source?.commit === expectedSourceCommit)
    && (!expectedImageId || evidence.source?.image_id === expectedImageId)
  );
}

export function validateSocialWalletAcceptance(evidence, expectations = {}) {
  return validateAcceptanceShape(evidence, expectations);
}

export async function runSocialWalletAcceptance({
  sourceCommit = process.env.BU2_SOURCE_COMMIT ?? null,
  imageId = process.env.BU2_IMAGE_ID ?? null,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fp07-social-wallet-"));
  const database = join(directory, "product.sqlite");
  const backupPath = join(directory, "product-backup.sqlite");
  const environmentConfig = loadEnvironmentConfig({}, {});
  let ledger;
  let sandbox;
  let backupLedger;
  try {
    ledger = new SqliteLedger(database, { environmentConfig });
    registerProductLedgers(ledger);
    sandbox = new Bu2Sandbox({
      ledger,
      adapter: new SimulatedPaymentAdapter({ ledger }),
      environmentConfig,
      initialWallet: { id: "wal_fp07_global_legacy", available: BUYER_OPENING, reserved: 0, currency: CURRENCY },
    });
    const openings = await createOpeningBalances(sandbox);
    const buyerPlan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      history_strategy: "fully_bound",
      classifications: [],
    }, "fp07-buyer-migration-plan");
    assert.equal(buyerPlan.status, "verified");
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      expected_active_version: null,
      migration_plan_id: buyerPlan.id,
    });
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_seller",
      currency: CURRENCY,
      expected_active_version: null,
    });
    const assessment = await sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      migration_plan_id: buyerPlan.id,
    }, "fp07-buyer-cutover-assessment");
    assert.equal(assessment.status, "ready");
    await sandbox.activateWalletReadCutover({
      assessment_id: assessment.id,
      expected_active_generation: 0,
      reason: "FP-07 isolated Local product read baseline",
    }, "fp07-buyer-cutover-activate");

    const execution = await createBuyerExecutionContext(sandbox);
    const firstPayment = await pay(sandbox, { suffix: "primary", value: 100, ...execution });
    const settled = await sandbox.settle(firstPayment.executed.transaction_id, {}, "fp07-settle-primary");
    assert.equal(settled.transaction.status, "settled");
    assert.equal(sandbox.verifyReceipt(settled.receipt.id).valid, true);
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY }).status, "blocked");
    const firstReconciliation = await sandbox.createReconciliation({ id: "rec_fp07_primary" }, "fp07-reconciliation-primary");
    assert.equal(firstReconciliation.status, "matched");
    const buyerAfterFirstSettlement = sandbox.getActiveLedgerAccountProjection({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      expected_active_version: buyerAfterFirstSettlement.version,
      migration_plan_id: buyerPlan.id,
    });
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY }).status, "active");

    sandbox.adapter = new RecoverableUnknownSettlementAdapter({ ledger });
    const recoveryPayment = await pay(sandbox, { suffix: "recovery", value: 80, ...execution });
    await assert.rejects(
      sandbox.settle(recoveryPayment.executed.transaction_id, {}, "fp07-settle-recovery"),
      (error) => error.code === "fp07_simulated_settlement_unknown",
    );
    const preRestartFacts = financialFactSnapshot(ledger);
    ledger.close();
    ledger = null;

    ledger = new SqliteLedger(database, { environmentConfig });
    sandbox = new Bu2Sandbox({
      ledger,
      adapter: new RecoverableUnknownSettlementAdapter({ ledger }),
      environmentConfig,
    });
    const pendingRecoveryView = sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    assert.equal(pendingRecoveryView.status, "blocked");
    assert.equal(pendingRecoveryView.read_balance, null);
    assert.ok(pendingRecoveryView.blockers.includes("unresolved_provider_attempts"));
    assert.deepEqual(pendingRecoveryView.model.available_spending_capacity.amount, { value: 99_820, currency: CURRENCY });
    assert.equal(pendingRecoveryView.model.pending_outbound.value, 80);
    const recovered = await sandbox.recoverSettlement(recoveryPayment.executed.transaction_id, {}, "fp07-recover-settlement");
    assert.equal(recovered.transaction.status, "settled");
    assert.equal(sandbox.verifyReceipt(recovered.receipt.id).valid, true);
    assert.deepEqual(
      await sandbox.recoverSettlement(recoveryPayment.executed.transaction_id, {}, "fp07-recover-settlement"),
      recovered,
    );
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY }).status, "blocked");

    const collectionQuote = await sandbox.createQuote({
      seller_agent_id: "agt_fp07_seller_collect",
      payee_account_id: "acct_fp07_seller",
      receiving_target_id: "tgt_fp07_seller_collect",
      asset: CURRENCY,
      network: null,
      item: { name: "FP07 collection resource", delivery_type: "research_data" },
      amount: { value: 100, currency: CURRENCY },
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    }, "fp07-collection-quote");
    const receivable = await sandbox.createReceivable({
      quote_id: collectionQuote.id,
      account_id: "acct_fp07_seller",
      agent_id: "agt_fp07_seller_collect",
      receiving_target_id: "tgt_fp07_seller_collect",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      purpose: "FP07 inbound collection",
      expected_payer_account_id: "acct_fp07_buyer",
      expected_buyer_agent_id: "agt_fp07_buyer_collect",
    }, "fp07-receivable");
    const collection = await sandbox.verifyInboundPayment(receivable.id, {
      provider_reference: "sim_fp07_collection",
      collection_reference: receivable.collection_reference,
      payer_account_id: "acct_fp07_buyer",
      payer_agent_id: "agt_fp07_buyer_collect",
    }, "fp07-collection-post");
    assert.equal(collection.collection.status, "posted");
    await sandbox.createAccessGrant(collection.collection.id, {
      access_type: "dataset",
      access_reference: "dataset://fp07/social-wallet",
    }, "fp07-access-grant");

    const refund = await sandbox.requestRefund(firstPayment.executed.transaction_id, {
      amount: { value: 20, currency: CURRENCY },
      reason: "FP07 bounded partial refund",
    }, "fp07-refund-primary");
    assert.equal(refund.refund.status, "refunded");
    const fees = [];
    fees.push(await sandbox.recordProviderFee({
      source_type: "collection",
      source_id: collection.collection.id,
      provider: "bu2_simulated_provider",
      provider_reference: collection.collection.provider_reference,
      amount: { value: 1, currency: CURRENCY },
    }, "fp07-fee-collection"));
    fees.push(await sandbox.recordProviderFee({
      source_type: "payment",
      source_id: settled.transaction.id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 2, currency: CURRENCY },
    }, "fp08-fee-payment"));
    fees.push(await sandbox.recordProviderFee({
      source_type: "refund",
      source_id: refund.refund.id,
      provider: "bu2_simulated_provider",
      provider_reference: refund.refund.provider_reference,
      amount: { value: 1, currency: CURRENCY },
    }, "fp08-fee-refund"));

    const reconciliation = await sandbox.createReconciliation({ id: "rec_fp07_product" }, "fp07-reconciliation");
    assert.equal(reconciliation.status, "matched");
    assert.equal(reconciliation.exception_count, 0);
    assert.equal(reconciliation.unknown_count, 0);
    assert.deepEqual(reconciliation.totals[CURRENCY], { payments: 180, collections: 100, refunds: 20, fees: 4 });

    const buyerActive = sandbox.getActiveLedgerAccountProjection({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    const sellerActive = sandbox.getActiveLedgerAccountProjection({ ledger_account_id: "lga_fp07_seller", currency: CURRENCY });
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      expected_active_version: buyerActive.version,
      migration_plan_id: buyerPlan.id,
    });
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_seller",
      currency: CURRENCY,
      expected_active_version: sellerActive.version,
    });
    const runtimeAfterReconciliation = sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    assert.equal(runtimeAfterReconciliation.status, "active");
    assert.deepEqual(runtimeAfterReconciliation.read_balance, { value: 99_837, currency: CURRENCY });
    const sellerShadow = sandbox.shadowCompareWalletReadModel({ ledger_account_id: "lga_fp07_seller", currency: CURRENCY });
    assert.equal(sellerShadow.status, "difference");

    const factsBeforeProjectionFault = financialFactSnapshot(ledger);
    const activeBeforeDelete = sandbox.getActiveLedgerAccountProjection({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    assert.equal(ledger.db.prepare("DELETE FROM ledger_projection_versions WHERE id=?").run(activeBeforeDelete.id).changes, 1);
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY }).status, "blocked");
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: "lga_fp07_buyer",
      currency: CURRENCY,
      expected_active_version: null,
      migration_plan_id: buyerPlan.id,
    });
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY }).status, "active");
    const projectionFactsPreserved = financialFactSnapshot(ledger).sha256 === factsBeforeProjectionFault.sha256;
    assert.equal(projectionFactsPreserved, true);

    const replay = sandbox.replayLedgerHistory({ currency: CURRENCY });
    assert.equal(replay.status, "complete");
    assert.equal(replay.gap_count, 0);
    assert.equal(replay.automatic_provider_replay, false);

    const boundaryQuote = await sandbox.createQuote({
      seller_agent_id: "agt_fp07_seller_sales",
      payee_account_id: "acct_fp07_seller",
      receiving_target_id: "tgt_fp07_seller_sales",
      item: { name: "FP07 denied boundary quote", delivery_type: "research_data" },
      amount: { value: 10, currency: CURRENCY },
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    }, "fp07-boundary-quote");
    const crossAgentCode = await rejectedCode(() => sandbox.createPaymentIntent({
      quote_id: boundaryQuote.id,
      payer_account_id: "acct_fp07_buyer",
      buyer_agent_id: "agt_fp07_buyer_collect",
      payment_mandate_id: execution.mandate.id,
      amount: boundaryQuote.amount,
      purpose: "FP07 cross-agent funding rejection",
      funding_source_id: "fund_fp07_buyer",
      receiving_target_id: "tgt_fp07_seller_sales",
      execution_session_id: execution.session.id,
      execution_mode: "deferred",
    }, "fp07-cross-agent-denied"));
    const wrongAssetCode = await rejectedCode(() => sandbox.createPaymentIntent({
      quote_id: boundaryQuote.id,
      payer_account_id: "acct_fp07_buyer",
      buyer_agent_id: "agt_fp07_buyer_pay",
      payment_mandate_id: execution.mandate.id,
      amount: boundaryQuote.amount,
      purpose: "FP07 wrong-asset funding rejection",
      asset: "USDC",
      funding_source_id: "fund_fp07_buyer",
      receiving_target_id: "tgt_fp07_seller_sales",
      execution_session_id: execution.session.id,
      execution_mode: "deferred",
    }, "fp07-wrong-asset-denied"));
    const wrongNetworkCode = await rejectedCode(() => sandbox.createPaymentIntent({
      quote_id: boundaryQuote.id,
      payer_account_id: "acct_fp07_buyer",
      buyer_agent_id: "agt_fp07_buyer_pay",
      payment_mandate_id: execution.mandate.id,
      amount: boundaryQuote.amount,
      purpose: "FP07 wrong-network funding rejection",
      network: "eip155:84532",
      funding_source_id: "fund_fp07_buyer",
      receiving_target_id: "tgt_fp07_seller_sales",
      execution_session_id: execution.session.id,
      execution_mode: "deferred",
    }, "fp07-wrong-network-denied"));

    const factsBeforeBackup = financialFactSnapshot(ledger);
    await ledger.backupTo(backupPath, { rate: 100 });
    backupLedger = new SqliteLedger(backupPath, { environmentConfig });
    const backupSandbox = new Bu2Sandbox({ ledger: backupLedger, environmentConfig });
    const backupFacts = financialFactSnapshot(backupLedger);
    const backupReplay = backupSandbox.replayLedgerHistory({ currency: CURRENCY });
    const backupRuntime = backupSandbox.getRuntimeWalletView({ ledger_account_id: "lga_fp07_buyer", currency: CURRENCY });
    assert.equal(JSON.stringify(backupLedger.databaseIntegrity()), JSON.stringify(["ok"]));
    assert.equal(backupLedger.schemaVersion(), 22);
    assert.equal(backupFacts.sha256, factsBeforeBackup.sha256);
    assert.equal(backupReplay.status, "complete");
    assert.equal(backupRuntime.status, "active");
    assert.equal(backupSandbox.verifyReceipt(settled.receipt.id).valid, true);

    const sandboxEnvironment = loadEnvironmentConfig({ environment: "sandbox", paymentAdapter: "x402" }, {});
    const evidence = {
      schema_version: "fp08.social-wallet-acceptance.v1",
      status: "passed",
      source: { commit: sourceCommit, image_id: imageId },
      environment: {
        service: environmentConfig.environment,
        execution_backend: environmentConfig.payment_adapter,
        execution_status: environmentConfig.execution_status,
        network: environmentConfig.network,
      },
      scope: {
        account_count: 2,
        agent_count: 4,
        ledger_account_count: 2,
        accounting_currency: CURRENCY,
        buyer_ledger_account_id: "lga_fp07_buyer",
        seller_ledger_account_id: "lga_fp07_seller",
      },
      openings: {
        buyer_status: openings.buyer.status,
        seller_status: openings.seller.status,
      },
      flows: {
        outbound_payment: settled.transaction.status,
        recovered_payment: recovered.transaction.status,
        inbound_collection: collection.collection.status,
        partial_refund: refund.refund.status,
        provider_fee_count: fees.length,
        reconciliation: reconciliation.status,
        reconciliation_totals: reconciliation.totals[CURRENCY],
        per_transaction_operator_approval_count: sandbox.events.filter((event) => event.type === "payment_intent.approval_requested").length,
      },
      recovery: {
        mode: "simulated_durable_unknown_recovery",
        provider_unknown_recovered: recovered.transaction.settlement_provider_reference === "sim_fp07_recovered_settlement",
        restart_verified: financialFactSnapshot(ledger).posting_count >= preRestartFacts.posting_count,
        duplicate_payment_after_recovery: false,
      },
      wallet_read: {
        buyer_runtime_status: runtimeAfterReconciliation.status,
        buyer_read_balance: runtimeAfterReconciliation.read_balance,
        buyer_spend_decision_source: runtimeAfterReconciliation.spend_decision_source,
        seller_shadow_status: sellerShadow.status,
        seller_candidate_available: sellerShadow.candidate_available,
        seller_cutover_activated: false,
      },
      projection: {
        delete_rebuild_verified: projectionFactsPreserved,
        source_facts_rewritten: false,
      },
      history: {
        status: replay.status,
        gap_count: replay.gap_count,
        posting_count: replay.posting_count,
        automatic_provider_replay: replay.automatic_provider_replay,
      },
      boundary: {
        cross_agent_funding_denied: Boolean(crossAgentCode),
        cross_agent_error_code: crossAgentCode,
        wrong_asset_denied: Boolean(wrongAssetCode),
        wrong_asset_error_code: wrongAssetCode,
        wrong_network_denied: Boolean(wrongNetworkCode),
        wrong_network_error_code: wrongNetworkCode,
        sandbox_execution_status: sandboxEnvironment.execution_status,
        sandbox_cutover_authorized: false,
        live_cutover_authorized: false,
      },
      backup_restore: {
        integrity: "ok",
        schema_version: backupLedger.schemaVersion(),
        same_financial_fact_hash: backupFacts.sha256 === factsBeforeBackup.sha256,
        replay_status: backupReplay.status,
        runtime_status: backupRuntime.status,
        receipt_valid: backupSandbox.verifyReceipt(settled.receipt.id).valid,
        provider_replay: false,
      },
      authorization: {
        external_provider_call: false,
        simulated_payment_flow_executed: true,
        signer_loaded: false,
        payment_execution_attempted: false,
        live_enabled: false,
      },
      external_sandbox_bilateral: {
        status: "not_executed",
        accepted: false,
        reason: "FP-08 product acceptance is Local/Simulation only and does not create Base Sepolia settlement evidence.",
      },
      product_boundary: {
        multi_account_spend_decision_source: "account_scoped_wallet",
        public_wallet_api_authorized: false,
        product_promotion_authorized: false,
        seller_shadow_difference_expected: true,
        buyer_side_provider_fee_spend_semantics_authorized: true,
      },
    };
    if (!validateSocialWalletAcceptance(evidence, { expectedSourceCommit: sourceCommit, expectedImageId: imageId })) {
      throw new Error(`FP-08 Social Wallet acceptance evidence failed self-validation: ${JSON.stringify({
        flows: evidence.flows,
        recovery: evidence.recovery,
        wallet_read: evidence.wallet_read,
        projection: evidence.projection,
        history: evidence.history,
        backup_restore: evidence.backup_restore,
        boundary: evidence.boundary,
        authorization: evidence.authorization,
        external_sandbox_bilateral: evidence.external_sandbox_bilateral,
        product_boundary: evidence.product_boundary,
      })}`);
    }
    return evidence;
  } finally {
    if (backupLedger) backupLedger.close();
    if (ledger) ledger.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runSocialWalletAcceptance();
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
