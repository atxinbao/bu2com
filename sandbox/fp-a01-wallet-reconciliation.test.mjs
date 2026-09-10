import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const CURRENCY = "CNY";
const OPENING_VALUE = 100_000;

function bindTargetLedger(ledger, suffix) {
  const ledgerAccountId = `lga_fpa01_${suffix}`;
  const tenantId = `ten_fpa01_${suffix}`;
  const accountId = `acct_fpa01_${suffix}`;
  const fundingSourceId = `fund_fpa01_${suffix}`;
  ledger.registerLedgerAccount({
    id: ledgerAccountId,
    environment: "local",
    tenant_id: tenantId,
    book_id: "book_primary",
    owner_account_id: accountId,
    asset: CURRENCY,
    network: null,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local",
    requested_by: `usr_fpa01_${suffix}`,
    idempotency_key: `fpa01-bind-${suffix}`,
    tenants: [{
      tenant_id: tenantId,
      principal: { id: `usr_fpa01_${suffix}`, display_name: `FP-A01 ${suffix}` },
      accounts: [{ id: accountId, display_name: `FP-A01 ${suffix}` }],
      agents: [],
      credentials: [],
      funding_sources: [{
        id: fundingSourceId,
        account_id: accountId,
        agent_id: null,
        asset: CURRENCY,
        network: null,
        provider: "simulated",
        ledger_account_id: ledgerAccountId,
        source_reference: `wallet:fpa01-${suffix}`,
      }],
      receiving_targets: [],
    }],
  }, "local"));
  return { ledgerAccountId, tenantId, accountId, fundingSourceId };
}

async function openingContext(suffix, { database = ":memory:", adapter = null } = {}) {
  const ledger = new SqliteLedger(database);
  const binding = bindTargetLedger(ledger, suffix);
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter,
    initialWallet: { id: `wal_fpa01_${suffix}`, available: OPENING_VALUE, reserved: 0, currency: CURRENCY },
  });
  await sandbox.createOpeningBalance({
    id: `obc_fpa01_${suffix}`,
    book_id: "book_primary",
    account_id: binding.accountId,
    owner_account_id: binding.accountId,
    funding_source_id: binding.fundingSourceId,
    environment: "local",
    asset: CURRENCY,
    network: null,
    amount: { value: OPENING_VALUE, currency: CURRENCY },
    effective_at: "2026-09-10T00:00:00.000Z",
    source_reference: `reconciled:fpa01:${suffix}`,
    reason: "FP-A01 isolated opening checkpoint",
  }, `fpa01-opening-${suffix}`);
  return { ledger, sandbox, ...binding };
}

function addSettledPayment(context, suffix, { currency = CURRENCY, amount = 100 } = {}) {
  const id = `txn_fpa01_${suffix}`;
  const providerReference = `sim_fpa01_${suffix}`;
  const createdAt = `2020-09-11T01:00:${String(amount % 60).padStart(2, "0")}.000Z`;
  context.sandbox.transactions.set(id, {
    id,
    ledger_account_id: context.ledgerAccountId,
    status: "settled",
    reserved_amount: { value: amount, currency },
    settled_amount: { value: amount, currency },
    settlement_provider_reference: providerReference,
    created_at: createdAt,
  });
  context.ledger.saveAdapterOperation({
    idempotency_key: `settle:${id}`,
    operation: "settle",
    transaction_id: id,
    provider_reference: providerReference,
    amount_value: amount,
    currency,
    status: "settled",
    created_at: createdAt,
  });
  return { id, providerReference, amount: { value: amount, currency } };
}

function setRun(sandbox, {
  id,
  createdAt,
  items,
  status = "matched",
} = {}) {
  sandbox.reconciliationRuns.set(id, {
    id,
    mode: "external",
    status,
    as_of: createdAt,
    created_at: createdAt,
    items,
  });
}

async function readyReconciledContext(suffix, options = {}) {
  const context = await openingContext(suffix, options);
  const payment = addSettledPayment(context, `${suffix}_payment`);
  const reconciliation = await context.sandbox.createReconciliation({}, `fpa01-reconcile-${suffix}`);
  const plan = await context.sandbox.prepareWalletMigrationPlan({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    history_strategy: "fully_bound",
    classifications: [],
  }, `fpa01-plan-${suffix}`);
  context.sandbox.refreshLedgerAccountProjection({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    expected_active_version: null,
    migration_plan_id: plan.id,
  });
  const assessment = await context.sandbox.prepareWalletCutoverAssessment({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    migration_plan_id: plan.id,
  }, `fpa01-assess-${suffix}`);
  assert.equal(reconciliation.status, "matched");
  assert.equal(assessment.status, "ready", JSON.stringify(assessment.blockers));
  return { ...context, payment, reconciliation, plan, assessment };
}

function reserveInput(context, suffix) {
  return {
    id: `pi_fpa01_${suffix}`,
    funding_source_binding_id: context.fundingSourceId,
    funding_ledger_account_id: context.ledgerAccountId,
    asset: CURRENCY,
    network: null,
    amount: { value: 10, currency: CURRENCY },
    authorization: { id: `auth_fpa01_${suffix}` },
    payment_mandate_id: null,
    payee_account_id: `acct_fpa01_payee_${suffix}`,
    quote_id: null,
  };
}

test("FP-A01 requires complete and unique reconciliation coverage in WalletReadModel", async () => {
  const context = await openingContext("coverage");
  try {
    const first = addSettledPayment(context, "coverage_one", { amount: 101 });
    const second = addSettledPayment(context, "coverage_two", { amount: 102 });
    setRun(context.sandbox, {
      id: "rec_fpa01_partial",
      createdAt: "2026-09-11T02:00:00.000Z",
      items: [{ source_id: first.id, status: "matched", expected_amount: first.amount }],
    });

    const partial = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(partial.reconciliation_status.status, "incomplete");
    assert.deepEqual(partial.reconciliation_status.missing_source_ids, [second.id]);

    setRun(context.sandbox, {
      id: "rec_fpa01_duplicate",
      createdAt: "2026-09-11T02:01:00.000Z",
      items: [
        { source_id: first.id, status: "matched", expected_amount: first.amount },
        { source_id: first.id, status: "matched", expected_amount: first.amount },
        { source_id: second.id, status: "matched", expected_amount: second.amount },
      ],
    });
    const duplicate = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(duplicate.reconciliation_status.status, "incomplete");
    assert.deepEqual(duplicate.reconciliation_status.duplicate_source_ids, [first.id]);

    setRun(context.sandbox, {
      id: "rec_fpa01_invalid_status",
      createdAt: "2026-09-11T02:02:00.000Z",
      items: [
        { source_id: first.id, status: "unexpected", expected_amount: first.amount },
        { source_id: second.id, status: "matched", expected_amount: second.amount },
      ],
    });
    const invalid = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(invalid.reconciliation_status.status, "incomplete");
    assert.deepEqual(invalid.reconciliation_status.invalid_status_source_ids, [first.id]);
  } finally {
    context.ledger.close();
  }
});

test("FP-A01 rejects wrong-currency and other-account evidence for a wallet scope", async () => {
  const target = await openingContext("scope_target");
  const other = await openingContext("scope_other");
  try {
    const first = addSettledPayment(target, "scope_one", { amount: 111 });
    const second = addSettledPayment(target, "scope_two", { amount: 112 });
    const unrelated = addSettledPayment(other, "scope_other", { amount: 113 });
    setRun(target.sandbox, {
      id: "rec_fpa01_scope",
      createdAt: "2026-09-11T03:00:00.000Z",
      items: [
        { source_id: first.id, status: "matched", expected_amount: { value: 111, currency: "USD" } },
        { source_id: unrelated.id, status: "matched", expected_amount: unrelated.amount },
      ],
    });

    const model = target.sandbox.getWalletReadModel({ ledger_account_id: target.ledgerAccountId, currency: CURRENCY });
    assert.equal(model.reconciliation_status.status, "incomplete");
    assert.deepEqual(model.reconciliation_status.currency_mismatch_source_ids, [first.id]);
    assert.deepEqual(model.reconciliation_status.missing_source_ids, [first.id, second.id]);
  } finally {
    target.ledger.close();
    other.ledger.close();
  }
});

test("FP-A01 reports not_required when a wallet has no Provider-reconcilable facts", async () => {
  const context = await openingContext("not_required");
  try {
    const model = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(model.reconciliation_status.status, "not_required");
    assert.equal(model.reconciliation_status.required_source_count, 0);
  } finally {
    context.ledger.close();
  }
});

test("FP-A01 selects the latest appended relevant run when timestamps are equal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fpa01-order-"));
  const database = join(directory, "ledger.sqlite");
  let first;
  let second;
  try {
    const context = await openingContext("order", { database });
    first = context.ledger;
    const payment = addSettledPayment(context, "order_payment", { amount: 121 });
    const createdAt = "2026-09-11T04:00:00.000Z";
    setRun(context.sandbox, {
      id: "rec_fpa01_order_matched",
      createdAt,
      items: [{ source_id: payment.id, status: "matched", expected_amount: payment.amount }],
    });
    setRun(context.sandbox, {
      id: "rec_fpa01_order_unknown",
      createdAt,
      status: "unknown",
      items: [{ source_id: payment.id, status: "unknown", expected_amount: payment.amount }],
    });
    await context.sandbox.createQuote({
      seller_agent_id: "agt_fpa01_order",
      payee_account_id: "acct_fpa01_order_payee",
      item: { name: "FP-A01 persistence boundary", delivery_type: "digital" },
      amount: { value: 1, currency: CURRENCY },
      expires_at: "2030-09-11T04:00:00.000Z",
    }, "fpa01-order-persist");

    const beforeRestart = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(beforeRestart.reconciliation_status.run_id, "rec_fpa01_order_unknown");
    assert.equal(beforeRestart.reconciliation_status.status, "unknown");
    first.close();
    first = null;

    second = new SqliteLedger(database);
    const restored = new Bu2Sandbox({ ledger: second });
    const afterRestart = restored.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(afterRestart.reconciliation_status.run_id, "rec_fpa01_order_unknown");
    assert.equal(afterRestart.reconciliation_status.status, "unknown");
  } finally {
    first?.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FP-A01 blocks active reads and reserve after an exception, then recovers without payment replay", async () => {
  let adapterCalls = 0;
  const adapter = {
    async reserve() {
      adapterCalls += 1;
      return { provider_reference: "sim_fpa01_must_not_run" };
    },
  };
  const context = await readyReconciledContext("runtime", { adapter });
  try {
    await context.sandbox.activateWalletReadCutover({
      assessment_id: context.assessment.id,
      expected_active_generation: 0,
      reason: "activate before reconciliation regression",
    }, "fpa01-activate-runtime");
    const postingCount = context.sandbox.listFinancialPostings().length;
    const before = context.sandbox.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(before.status, "active");

    const exception = await context.sandbox.createReconciliation({
      observations: [{
        kind: "payment",
        source_id: context.payment.id,
        provider: "bu2_simulated_provider",
        provider_reference: context.payment.providerReference,
        amount: { value: context.payment.amount.value + 1, currency: CURRENCY },
      }],
    }, "fpa01-runtime-exception");
    assert.equal(exception.status, "exception");
    const exceptionModel = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(exceptionModel.reconciliation_status.status, "exception", JSON.stringify(exceptionModel.reconciliation_status));

    const blocked = context.sandbox.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.read_balance, null);
    assert.ok(blocked.blockers.includes("wallet_reconciliation_exception"));
    await assert.rejects(
      context.sandbox.reserve(reserveInput(context, "runtime")),
      (error) => error.code === "wallet_read_cutover_unhealthy" && error.details.blockers.includes("wallet_reconciliation_exception"),
    );
    assert.equal(adapterCalls, 0);
    assert.equal(context.sandbox.listFinancialPostings().length, postingCount);

    const recovered = await context.sandbox.createReconciliation({}, "fpa01-runtime-recovered");
    assert.equal(recovered.status, "matched");
    const active = context.sandbox.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(active.status, "active");
    assert.deepEqual(active.read_balance, { value: OPENING_VALUE, currency: CURRENCY });
    assert.equal(adapterCalls, 0);
    assert.equal(context.sandbox.listFinancialPostings().length, postingCount);
  } finally {
    context.ledger.close();
  }
});

test("FP-A01 persists reconciliation blocking and recovery across SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fpa01-restart-"));
  const database = join(directory, "ledger.sqlite");
  let first;
  let second;
  let adapterCalls = 0;
  const adapter = {
    async reserve() {
      adapterCalls += 1;
      return { provider_reference: "sim_fpa01_restart_must_not_run" };
    },
  };
  try {
    const context = await readyReconciledContext("restart", { database, adapter });
    first = context.ledger;
    await context.sandbox.activateWalletReadCutover({
      assessment_id: context.assessment.id,
      expected_active_generation: 0,
      reason: "activate before persisted reconciliation regression",
    }, "fpa01-activate-restart");
    await context.sandbox.createReconciliation({
      observations: [{
        kind: "payment",
        source_id: context.payment.id,
        provider: "bu2_simulated_provider",
        provider_reference: context.payment.providerReference,
        amount: { value: context.payment.amount.value, currency: CURRENCY },
        status: "unknown",
      }],
    }, "fpa01-restart-unknown");
    const unknownModel = context.sandbox.getWalletReadModel({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(unknownModel.reconciliation_status.status, "unknown", JSON.stringify(unknownModel.reconciliation_status));
    first.close();
    first = null;

    second = new SqliteLedger(database);
    const restored = new Bu2Sandbox({ ledger: second, adapter });
    const blocked = restored.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.includes("wallet_reconciliation_unknown"));
    await assert.rejects(
      restored.reserve(reserveInput(context, "restart")),
      (error) => error.code === "wallet_read_cutover_unhealthy",
    );
    assert.equal(adapterCalls, 0);

    await restored.createReconciliation({}, "fpa01-restart-recovered");
    const active = restored.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(active.status, "active");
    assert.equal(adapterCalls, 0);
  } finally {
    first?.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
