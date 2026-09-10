import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const CURRENCY = "CNY";
const NETWORK = null;
const OPENING_VALUE = 100_000;

function bindTargetLedger(ledger, suffix) {
  const ledgerAccountId = `lga_fp06b_${suffix}`;
  const tenantId = `ten_fp06b_${suffix}`;
  const accountId = `acct_fp06b_${suffix}`;
  const fundingSourceId = `fund_fp06b_${suffix}`;
  ledger.registerLedgerAccount({
    id: ledgerAccountId,
    environment: "local",
    tenant_id: tenantId,
    book_id: "book_primary",
    owner_account_id: accountId,
    asset: CURRENCY,
    network: NETWORK,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local",
    requested_by: `usr_fp06b_${suffix}`,
    idempotency_key: `fp06b-bind-${suffix}`,
    tenants: [{
      tenant_id: tenantId,
      principal: { id: `usr_fp06b_${suffix}`, display_name: `FP06b ${suffix}` },
      accounts: [{ id: accountId, display_name: `FP06b ${suffix}` }],
      agents: [],
      credentials: [],
      funding_sources: [{
        id: fundingSourceId,
        account_id: accountId,
        agent_id: null,
        asset: CURRENCY,
        network: NETWORK,
        provider: "simulated",
        ledger_account_id: ledgerAccountId,
        source_reference: `wallet:fp06b-${suffix}`,
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
    initialWallet: { id: `wal_fp06b_${suffix}`, available: OPENING_VALUE, reserved: 0, currency: CURRENCY },
  });
  const checkpoint = await sandbox.createOpeningBalance({
    id: `obc_fp06b_${suffix}`,
    book_id: "book_primary",
    account_id: binding.accountId,
    owner_account_id: binding.accountId,
    funding_source_id: binding.fundingSourceId,
    environment: "local",
    asset: CURRENCY,
    network: NETWORK,
    amount: { value: OPENING_VALUE, currency: CURRENCY },
    effective_at: "2026-09-10T00:00:00.000Z",
    source_reference: `reconciled:fp06b:${suffix}`,
    reason: "FP-06b isolated local reconciled opening checkpoint",
  }, `fp06b-opening-${suffix}`);
  return { ledger, sandbox, checkpoint, ...binding };
}

async function readyContext(suffix, options = {}) {
  const context = await openingContext(suffix, options);
  const plan = await context.sandbox.prepareWalletMigrationPlan({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    history_strategy: "fully_bound",
    classifications: [],
  }, `fp06b-plan-${suffix}`);
  const projection = context.sandbox.refreshLedgerAccountProjection({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    expected_active_version: null,
    migration_plan_id: plan.id,
  });
  const assessment = await context.sandbox.prepareWalletCutoverAssessment({
    ledger_account_id: context.ledgerAccountId,
    currency: CURRENCY,
    migration_plan_id: plan.id,
  }, `fp06b-assess-${suffix}`);
  return { ...context, plan, projection, assessment };
}

function postJournal(ledger, {
  suffix,
  sourceId = `src_fp06b_${suffix}`,
  ledgerAccountId,
  createdAt = `2026-09-09T00:00:${String(Number(suffix)).padStart(2, "0")}.000Z`,
  debitAccount = "expense.fp06b_test",
  creditAccount = "liability.fp06b_test",
  amount = 10,
} = {}) {
  const eventId = `evt_fp06b_${suffix}`;
  ledger.db.prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", sourceId, "{}", createdAt);
  const ownership = ledgerAccountId === undefined ? {} : { ledger_account_id: ledgerAccountId };
  ledger.writeBalancedJournals([
    {
      id: `pst_fp06b_debit_${suffix}`,
      event_id: eventId,
      event_type: "journal.fp06b",
      source_id: sourceId,
      direction: "debit",
      account: debitAccount,
      amount_value: amount,
      currency: CURRENCY,
      created_at: createdAt,
      ...ownership,
    },
    {
      id: `pst_fp06b_credit_${suffix}`,
      event_id: eventId,
      event_type: "journal.fp06b",
      source_id: sourceId,
      direction: "credit",
      account: creditAccount,
      amount_value: amount,
      currency: CURRENCY,
      created_at: createdAt,
      ...ownership,
    },
  ], [{ id: eventId, type: "journal.fp06b", resource_id: sourceId, created_at: createdAt }]);
}

function financialFacts(ledger) {
  return {
    postings: ledger.db.prepare(`
      SELECT id, event_id, journal_id, event_type, source_id, direction, account,
             amount_value, currency, ledger_account_id, created_at
      FROM financial_postings ORDER BY id
    `).all(),
    events: ledger.listLedgerEvents(),
    state_revision: Number(ledger.db.prepare("SELECT data FROM sandbox_state WHERE key='state_revision'").get()?.data ?? 0),
  };
}

test("FP-06b assessment replay binds request terms rather than later mutable state", async () => {
  const { ledger, sandbox, ledgerAccountId, plan, assessment } = await readyContext("replay_after_change");
  try {
    await sandbox.runIdempotentAsync("fp06b/replay-state", "fp06b-replay-state-change", {}, async () => ({ observed: true }));
    const replay = await sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: ledgerAccountId, currency: CURRENCY, migration_plan_id: plan.id,
    }, "fp06b-assess-replay_after_change");
    assert.deepEqual(replay, assessment);
    await assert.rejects(
      sandbox.activateWalletReadCutover({ assessment_id: replay.id, expected_active_generation: 0, reason: "replay is not a fresh approval" }, "fp06b-replayed-activation"),
      (error) => error.code === "wallet_cutover_state_changed",
    );
    const otherPlan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: ledgerAccountId, currency: CURRENCY, history_strategy: "fully_bound",
    }, "fp06b-another-plan");
    await assert.rejects(
      sandbox.prepareWalletCutoverAssessment({ ledger_account_id: ledgerAccountId, currency: CURRENCY, migration_plan_id: otherPlan.id }, "fp06b-assess-replay_after_change"),
      (error) => error.code === "wallet_cutover_assessment_idempotency_conflict",
    );
  } finally { ledger.close(); }
});

test("FP-06b Local-only reserve guard leaves non-Local execution policy unchanged", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    for (const environment of ["sandbox", "live"]) {
      const account = ledger.registerLedgerAccount({
        id: `lga_fp06b_existing_${environment}`, environment,
        tenant_id: "ten_fp06b_existing", book_id: "book_primary", owner_account_id: "acct_fp06b_existing",
        asset: "USDC", network: environment === "sandbox" ? "eip155:84532" : "eip155:8453",
      });
      const sandbox = new Bu2Sandbox({ ledger, environmentConfig: { environment, execution_status: "execution_disabled" } });
      assert.equal(sandbox.assertWalletReadCutoverHealthy(account.id, "USD"), null);
      assert.throws(() => sandbox.getRuntimeWalletView({ ledger_account_id: account.id, currency: "USD" }),
        (error) => error.code === "wallet_cutover_environment_not_authorized");
      assert.equal(sandbox.environmentConfig.execution_status, "execution_disabled");
    }
    assert.equal(ledger.adapterOperations().length, 0);
  } finally { ledger.close(); }
});

test("FP-06b stale reader cannot report capacity or reserve after another instance commits", async () => {
  const context = await readyContext("stale_reader");
  const { ledger, sandbox, ledgerAccountId, fundingSourceId, assessment } = context;
  try {
    await sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "activate isolated reader regression" }, "fp06b-stale-reader-activate");
    const reader = new Bu2Sandbox({ ledger });
    const intent = {
      id: "pi_fp06b_stale_reader", funding_source_binding_id: fundingSourceId, funding_ledger_account_id: ledgerAccountId,
      asset: CURRENCY, network: NETWORK, amount: { value: 250, currency: CURRENCY },
      authorization: { id: "auth_fp06b_reader" }, quote_id: null, payment_mandate_id: null, payee_account_id: "acct_fp06b_reader_payee",
    };
    await sandbox.runIdempotentAsync("fp06b/stale-reader", "fp06b-stale-reader-reserve", {}, () => sandbox.reserve(intent));
    const view = reader.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(view.status, "blocked");
    assert.equal(view.read_balance, null);
    assert.ok(view.blockers.includes("wallet_domain_state_stale"));
    assert.throws(() => reader.assertWalletReadCutoverHealthy(ledgerAccountId, CURRENCY),
      (error) => error.code === "wallet_read_cutover_unhealthy");
    reader.reloadCommittedState();
    assert.equal(reader.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY }).read_balance.value, OPENING_VALUE - 250);
  } finally { ledger.close(); }
});

test("FP-06b persisted unknown or confirmed-unposted refund blocks assessment and active reads", async () => {
  const { ledger, sandbox, ledgerAccountId, plan, assessment } = await readyContext("refund_inflight");
  try {
    await sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "activate before unresolved refund regression" }, "fp06b-refund-inflight-activate");
    const attempt = ledger.prepareRefundAttempt({
      operation_key: "fp06b-unresolved-refund", refund_id: "ref_fp06b_unresolved", transaction_id: "txn_fp06b_unresolved",
      amount: { value: 10, currency: CURRENCY },
    });
    ledger.transitionRefundAttempt(attempt.operation_key, { from: "prepared", status: "provider_unknown" });
    for (const status of ["provider_unknown", "refunded"]) {
      if (status === "refunded") ledger.transitionRefundAttempt(attempt.operation_key, { from: "provider_unknown", status, provider_reference: "sim_fp06b_confirmed" });
      const blocked = await sandbox.prepareWalletCutoverAssessment({ ledger_account_id: ledgerAccountId, currency: CURRENCY, migration_plan_id: plan.id }, `fp06b-assess-refund-${status}`);
      assert.equal(blocked.status, "blocked");
      assert.ok(blocked.blockers.includes("unresolved_provider_attempts"));
      const view = sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
      assert.equal(view.status, "blocked");
      assert.equal(view.read_balance, null);
    }
    assert.equal(ledger.refundAttempts().length, 1);
    assert.equal(sandbox.wallet.available, OPENING_VALUE);
    assert.equal(ledger.adapterOperations().length, 0);
  } finally { ledger.close(); }
});

test("FP-06b failed activation rolls back its generation and retry preserves financial facts", async () => {
  const { ledger, sandbox, ledgerAccountId, assessment } = await readyContext("activation_failure");
  try {
    const before = financialFacts(ledger);
    ledger.failureInjector = (phase) => { if (phase === "after_wallet_cutover_write") throw new Error("cutover injected fault"); };
    const input = { assessment_id: assessment.id, expected_active_generation: 0, reason: "atomic activation failure regression" };
    await assert.rejects(sandbox.activateWalletReadCutover(input, "fp06b-activation-fault-key"), /cutover injected fault/);
    assert.equal(ledger.getWalletCutoverState({ ledger_account_id: ledgerAccountId, currency: CURRENCY }).generation, null);
    assert.deepEqual(financialFacts(ledger), before);
    ledger.failureInjector = null;
    const result = await sandbox.activateWalletReadCutover(input, "fp06b-activation-fault-key");
    assert.equal(result.generation, 1);
    assert.deepEqual(await sandbox.activateWalletReadCutover(input, "fp06b-activation-fault-key"), result);
    assert.deepEqual(financialFacts(ledger), before);
  } finally { ledger.close(); }
});

test("FP-06b two SQLite connections admit one generation and online backup preserves cutover", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fp06b-cas-backup-"));
  const database = join(directory, "source.sqlite");
  const backup = join(directory, "backup.sqlite");
  let first;
  let second;
  let restoredLedger;
  try {
    const context = await readyContext("cas_backup", { database });
    first = context.ledger;
    second = new SqliteLedger(database);
    const contender = new Bu2Sandbox({ ledger: second });
    const input = { assessment_id: context.assessment.id, expected_active_generation: 0, reason: "independent connection CAS" };
    const results = await Promise.allSettled([
      context.sandbox.activateWalletReadCutover(input, "fp06b-cas-backup-a"),
      contender.activateWalletReadCutover(input, "fp06b-cas-backup-b"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "wallet_cutover_generation_conflict");
    assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM wallet_cutover_generations").get().n, 1);
    const before = financialFacts(first);
    await first.backupTo(backup, { rate: 100 });
    restoredLedger = new SqliteLedger(backup);
    const restored = new Bu2Sandbox({ ledger: restoredLedger });
    const view = restored.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(view.cutover_generation, 1);
    assert.equal(view.status, "active");
    assert.equal(view.read_balance.value, OPENING_VALUE);
    assert.deepEqual(restoredLedger.databaseIntegrity(), ["ok"]);
    assert.deepEqual(financialFacts(restoredLedger), before);
    assert.equal(restoredLedger.adapterOperations().length, 0);
  } finally {
    restoredLedger?.close(); second?.close(); first?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FP-06b Schema 21 keeps migration, assessment, and cutover generations append-only", async () => {
  const { ledger, sandbox, ledgerAccountId, plan, assessment } = await readyContext("append_only");
  try {
    assert.equal(ledger.schemaVersion(), 21);
    assert.deepEqual(ledger.schemaMigrations().map(({ version }) => version), Array.from({ length: 21 }, (_, index) => index + 1));
    assert.equal(plan.status, "verified");
    assert.equal(assessment.status, "ready");
    assert.deepEqual(
      await sandbox.prepareWalletMigrationPlan({
        ledger_account_id: ledgerAccountId,
        currency: CURRENCY,
        history_strategy: "fully_bound",
        classifications: [],
      }, "fp06b-plan-append_only"),
      plan,
    );
    await assert.rejects(
      sandbox.prepareWalletMigrationPlan({
        ledger_account_id: ledgerAccountId,
        currency: CURRENCY,
        history_strategy: "scoped_exclusion",
        classifications: [],
      }, "fp06b-plan-append_only"),
      (error) => error.code === "wallet_migration_plan_idempotency_conflict",
    );
    assert.deepEqual(
      await sandbox.prepareWalletCutoverAssessment({
        ledger_account_id: ledgerAccountId,
        currency: CURRENCY,
        migration_plan_id: plan.id,
      }, "fp06b-assess-append_only"),
      assessment,
    );
    const factsBefore = financialFacts(ledger);

    const activated = await sandbox.activateWalletReadCutover({
      assessment_id: assessment.id,
      expected_active_generation: 0,
      reason: "activate isolated target wallet read path",
    }, "fp06b-activate-append-only");
    assert.equal(activated.generation, 1);
    assert.equal(activated.read_mode, "ledger_projection");
    assert.deepEqual(
      await sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "activate isolated target wallet read path" }, "fp06b-activate-append-only"),
      activated,
    );
    await assert.rejects(
      sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "second writer" }, "fp06b-activate-race"),
      (error) => error.code === "wallet_cutover_generation_conflict",
    );
    const runtime = sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(runtime.status, "active");
    assert.equal(runtime.read_mode, "ledger_projection");
    assert.deepEqual(runtime.read_balance, { value: OPENING_VALUE, currency: CURRENCY });
    assert.equal(runtime.spend_decision_source, "legacy_wallet");
    assert.equal(runtime.fallback_performed, false);

    assert.throws(() => ledger.db.prepare("UPDATE wallet_migration_plans SET status='blocked' WHERE id=?").run(plan.id), /wallet_migration_plan_immutable/);
    assert.throws(() => ledger.db.prepare("DELETE FROM wallet_cutover_assessments WHERE id=?").run(assessment.id), /wallet_cutover_assessment_immutable/);
    assert.throws(() => ledger.db.prepare("UPDATE wallet_cutover_generations SET reason='changed' WHERE id=?").run(activated.id), /wallet_cutover_generation_immutable/);

    const rolledBack = await sandbox.rollbackWalletReadCutover({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      expected_active_generation: 1,
      reason: "restore legacy read path without rewriting generation one",
    }, "fp06b-rollback-append-only");
    assert.equal(rolledBack.generation, 2);
    assert.equal(rolledBack.read_mode, "legacy_wallet");
    assert.deepEqual(
      await sandbox.rollbackWalletReadCutover({
        ledger_account_id: ledgerAccountId,
        currency: CURRENCY,
        expected_active_generation: 1,
        reason: "restore legacy read path without rewriting generation one",
      }, "fp06b-rollback-append-only"),
      rolledBack,
    );
    assert.equal(ledger.db.prepare("DELETE FROM ledger_projection_versions WHERE id=?").run(assessment.projection_id).changes, 1);
    assert.equal(ledger.getWalletCutoverAssessment(assessment.id).projection_id, assessment.projection_id);
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY }).read_mode, "legacy_wallet");
    assert.deepEqual(financialFacts(ledger), factsBefore);
  } finally {
    ledger.close();
  }
});

test("FP-06b reconciled opening classifies legacy sources without rebinding immutable postings", async () => {
  const { ledger, sandbox, ledgerAccountId, checkpoint } = await openingContext("reconciled");
  try {
    postJournal(ledger, { suffix: 11, sourceId: "legacy_fp06b_target_history" });
    postJournal(ledger, { suffix: 13, sourceId: "legacy_fp06b_other_scope" });
    const legacyBefore = ledger.db.prepare("SELECT id, ledger_account_id FROM financial_postings WHERE source_id=? ORDER BY id").all("legacy_fp06b_target_history");
    assert.ok(legacyBefore.every((posting) => posting.ledger_account_id === null));
    const plan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      history_strategy: "reconciled_opening",
      opening_balance_id: checkpoint.id,
      classifications: [{
        source_id: "legacy_fp06b_target_history",
        disposition: "covered_by_opening",
        evidence_ref: "evidence:isolated-local-opening-reconciliation",
      }, {
        source_id: "legacy_fp06b_other_scope",
        disposition: "excluded_other_scope",
        evidence_ref: "evidence:independent-other-ledger-classification",
      }],
    }, "fp06b-plan-reconciled");
    assert.equal(plan.status, "verified");
    assert.equal(plan.covered_source_count, 1);
    assert.equal(plan.excluded_source_count, 1);
    assert.equal(plan.opening_balance_fingerprint.length, 64);
    const projection = sandbox.refreshLedgerAccountProjection({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      expected_active_version: null,
      migration_plan_id: plan.id,
    });
    assert.equal(projection.status, "active");
    assert.deepEqual(
      ledger.db.prepare("SELECT id, ledger_account_id FROM financial_postings WHERE source_id=? ORDER BY id").all("legacy_fp06b_target_history"),
      legacyBefore,
    );
    postJournal(ledger, { suffix: 12, sourceId: "legacy_fp06b_new_after_plan" });
    const stale = ledger.walletMigrationPlanState(plan.id);
    assert.equal(stale.current, false);
    assert.ok(stale.blockers.includes("migration_plan_source_drift"));
    assert.throws(
      () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: ledgerAccountId, currency: CURRENCY, expected_active_version: 1, migration_plan_id: plan.id }),
      (error) => error.code === "wallet_migration_plan_stale",
    );
  } finally {
    ledger.close();
  }
});

test("FP-06b reconciled opening plan becomes stale if its persisted checkpoint content drifts", async () => {
  const { ledger, sandbox, ledgerAccountId, checkpoint } = await openingContext("opening_drift");
  try {
    postJournal(ledger, { suffix: 15, sourceId: "legacy_fp06b_opening_drift" });
    const plan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      history_strategy: "reconciled_opening",
      opening_balance_id: checkpoint.id,
      classifications: [{
        source_id: "legacy_fp06b_opening_drift",
        disposition: "covered_by_opening",
        evidence_ref: "evidence:opening-fingerprint-drift",
      }],
    }, "fp06b-plan-opening-drift");
    assert.equal(ledger.walletMigrationPlanState(plan.id).current, true);
    const row = ledger.db.prepare("SELECT data FROM resources WHERE kind='opening_balances' AND id=?").get(checkpoint.id);
    const changed = { ...JSON.parse(row.data), source_reference: "tampered:opening-reference" };
    ledger.db.prepare("UPDATE resources SET data=? WHERE kind='opening_balances' AND id=?").run(JSON.stringify(changed), checkpoint.id);
    const stale = ledger.walletMigrationPlanState(plan.id);
    assert.equal(stale.current, false);
    assert.ok(stale.blockers.includes("migration_plan_opening_drift"));
  } finally {
    ledger.close();
  }
});

test("FP-06b scoped exclusion permits an isolated target projection without rewriting unrelated legacy facts", async () => {
  const { ledger, sandbox, ledgerAccountId } = await openingContext("scoped_exclusion");
  try {
    postJournal(ledger, { suffix: 14, sourceId: "legacy_fp06b_scoped_other" });
    const legacyBefore = ledger.db.prepare("SELECT id, ledger_account_id FROM financial_postings WHERE source_id=? ORDER BY id").all("legacy_fp06b_scoped_other");
    const plan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      history_strategy: "scoped_exclusion",
      classifications: [{
        source_id: "legacy_fp06b_scoped_other",
        disposition: "excluded_other_scope",
        evidence_ref: "evidence:isolated-other-scope-review",
      }],
    }, "fp06b-plan-scoped-exclusion");
    assert.equal(plan.status, "verified");
    assert.equal(plan.covered_source_count, 0);
    assert.equal(plan.excluded_source_count, 1);
    const projection = sandbox.refreshLedgerAccountProjection({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      expected_active_version: null,
      migration_plan_id: plan.id,
    });
    assert.equal(projection.status, "active");
    assert.deepEqual(
      ledger.db.prepare("SELECT id, ledger_account_id FROM financial_postings WHERE source_id=? ORDER BY id").all("legacy_fp06b_scoped_other"),
      legacyBefore,
    );
    const assessment = await sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      migration_plan_id: plan.id,
    }, "fp06b-assess-scoped-exclusion");
    assert.equal(assessment.status, "ready");
  } finally {
    ledger.close();
  }
});

test("FP-06b persists blocked migration reports for gaps and rejects them from projection activation", async () => {
  const { ledger, sandbox, ledgerAccountId, checkpoint } = await openingContext("blocked_plan");
  try {
    postJournal(ledger, { suffix: 21, sourceId: "legacy_fp06b_before_opening" });
    postJournal(ledger, { suffix: 22, sourceId: "legacy_fp06b_after_opening", createdAt: "2026-09-10T01:00:00.000Z" });
    const plan = await sandbox.prepareWalletMigrationPlan({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      history_strategy: "reconciled_opening",
      opening_balance_id: checkpoint.id,
      classifications: [{
        source_id: "legacy_fp06b_after_opening",
        disposition: "covered_by_opening",
        evidence_ref: "evidence:invalid-after-opening",
      }],
    }, "fp06b-plan-blocked");
    assert.equal(plan.status, "blocked");
    assert.ok(plan.blockers.includes("unclassified_source:legacy_fp06b_before_opening"));
    assert.ok(plan.blockers.includes("covered_source_after_opening:legacy_fp06b_after_opening"));
    assert.throws(
      () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: ledgerAccountId, currency: CURRENCY, expected_active_version: null, migration_plan_id: plan.id }),
      (error) => error.code === "wallet_migration_plan_stale" && error.details.blockers.includes("migration_plan_blocked"),
    );
    assert.equal(ledger.getWalletMigrationPlan(plan.id).status, "blocked");
  } finally {
    ledger.close();
  }
});

test("FP-06b cutover assessment fails closed on in-flight funds, reconciliation gaps, and state drift", async () => {
  const inflight = await readyContext("assessment_inflight");
  try {
    inflight.sandbox.transactions.set("txn_fp06b_inflight", {
      id: "txn_fp06b_inflight",
      ledger_account_id: inflight.ledgerAccountId,
      status: "funds_reserved",
      reserved_amount: { value: 100, currency: CURRENCY },
    });
    const blocked = await inflight.sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: inflight.ledgerAccountId,
      currency: CURRENCY,
      migration_plan_id: inflight.plan.id,
    }, "fp06b-assess-inflight");
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.includes("funds_in_flight"));
    await assert.rejects(
      inflight.sandbox.activateWalletReadCutover({ assessment_id: blocked.id, expected_active_generation: 0, reason: "must not activate blocked assessment" }, "fp06b-activate-blocked"),
      (error) => error.code === "wallet_cutover_assessment_blocked",
    );
  } finally {
    inflight.ledger.close();
  }

  const reconciliation = await readyContext("assessment_reconciliation");
  try {
    reconciliation.sandbox.transactions.set("txn_fp06b_settled_unreconciled", {
      id: "txn_fp06b_settled_unreconciled",
      ledger_account_id: reconciliation.ledgerAccountId,
      status: "settled",
      reserved_amount: { value: 0, currency: CURRENCY },
    });
    const blocked = await reconciliation.sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: reconciliation.ledgerAccountId,
      currency: CURRENCY,
      migration_plan_id: reconciliation.plan.id,
    }, "fp06b-assess-reconciliation");
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockers.includes("reconciliation_not_matched"));

    reconciliation.sandbox.transactions.set("txn_fp06b_settled_unreconciled_second", {
      id: "txn_fp06b_settled_unreconciled_second",
      ledger_account_id: reconciliation.ledgerAccountId,
      status: "settled",
      reserved_amount: { value: 0, currency: CURRENCY },
    });
    reconciliation.sandbox.reconciliationRuns.set("rec_fp06b_partial", {
      id: "rec_fp06b_partial",
      mode: "external",
      status: "matched",
      as_of: "2026-09-10T02:00:00.000Z",
      created_at: "2026-09-10T02:00:01.000Z",
      items: [{
        source_id: "txn_fp06b_settled_unreconciled",
        status: "matched",
        expected_amount: { value: 0, currency: CURRENCY },
      }],
    });
    const partial = await reconciliation.sandbox.prepareWalletCutoverAssessment({
      ledger_account_id: reconciliation.ledgerAccountId,
      currency: CURRENCY,
      migration_plan_id: reconciliation.plan.id,
    }, "fp06b-assess-reconciliation-partial");
    assert.equal(partial.status, "blocked");
    assert.ok(partial.blockers.includes("reconciliation_incomplete"));
    assert.deepEqual(partial.snapshot.cutover_reconciliation.missing_source_ids, ["txn_fp06b_settled_unreconciled_second"]);
  } finally {
    reconciliation.ledger.close();
  }

  const drift = await readyContext("assessment_drift");
  try {
    await drift.sandbox.createQuote({
      seller_agent_id: "agt_fp06b_state_drift",
      payee_account_id: "acct_fp06b_state_drift",
      item: { name: "state drift only", delivery_type: "research_data" },
      amount: { value: 1, currency: CURRENCY },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, "fp06b-state-drift-quote");
    await assert.rejects(
      drift.sandbox.activateWalletReadCutover({ assessment_id: drift.assessment.id, expected_active_generation: 0, reason: "stale assessment must fail" }, "fp06b-activate-state-drift"),
      (error) => error.code === "wallet_cutover_state_changed",
    );
  } finally {
    drift.ledger.close();
  }
});

test("FP-06b invalidates a ready assessment when non-persisted in-flight conditions change before activation", async () => {
  const { ledger, sandbox, ledgerAccountId, assessment } = await readyContext("fresh_revalidation");
  try {
    sandbox.transactions.set("txn_fp06b_fresh_revalidation", {
      id: "txn_fp06b_fresh_revalidation",
      ledger_account_id: ledgerAccountId,
      status: "funds_reserved",
      reserved_amount: { value: 25, currency: CURRENCY },
    });
    await assert.rejects(
      sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "stale ready assessment must be invalidated" }, "fp06b-activate-fresh-revalidation"),
      (error) => error.code === "wallet_cutover_assessment_changed" && error.details.blockers.includes("funds_in_flight"),
    );
    assert.equal(ledger.getWalletCutoverState({ ledger_account_id: ledgerAccountId, currency: CURRENCY, environment: "local" }).generation, null);
  } finally {
    ledger.close();
  }
});

test("FP-06b active runtime read follows available spending capacity during a real reserved transaction", async () => {
  let adapterCalls = 0;
  const adapter = {
    async reserve() {
      adapterCalls += 1;
      return { provider_reference: "sim_fp06b_healthy_reserve" };
    },
  };
  const { ledger, sandbox, ledgerAccountId, fundingSourceId, assessment } = await readyContext("healthy_reserve", { adapter });
  try {
    await sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "activate healthy reserve read path" }, "fp06b-activate-healthy-reserve");
    const intent = {
      id: "pi_fp06b_healthy_reserve",
      funding_source_binding_id: fundingSourceId,
      funding_ledger_account_id: ledgerAccountId,
      asset: CURRENCY,
      network: NETWORK,
      amount: { value: 250, currency: CURRENCY },
      authorization: { id: "auth_fp06b_healthy_reserve" },
      payment_mandate_id: null,
      payee_account_id: "acct_fp06b_healthy_payee",
      quote_id: null,
    };
    await sandbox.runIdempotentAsync("fp06b/healthy-reserve", "fp06b-healthy-reserve-key", { intent_id: intent.id }, () => sandbox.reserve(intent));
    assert.equal(adapterCalls, 1);
    assert.equal(sandbox.wallet.available, OPENING_VALUE - 250);
    assert.equal(sandbox.wallet.reserved, 250);
    const runtime = sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(runtime.status, "active");
    assert.equal(runtime.read_balance_semantics, "available_spending_capacity");
    assert.deepEqual(runtime.read_balance, { value: OPENING_VALUE - 250, currency: CURRENCY });
    assert.equal(runtime.model.book_balance.amount.value, OPENING_VALUE);
    assert.equal(runtime.model.reserved.value, 250);
    assert.equal(runtime.spend_decision_source, "legacy_wallet");
  } finally {
    ledger.close();
  }
});

test("FP-06b active runtime read blocks when accounting capacity diverges from the legacy spend source", async () => {
  const { ledger, sandbox, ledgerAccountId, assessment, plan } = await readyContext("shadow_drift");
  try {
    await sandbox.activateWalletReadCutover({
      assessment_id: assessment.id,
      expected_active_generation: 0,
      reason: "activate shadow drift guard",
    }, "fp06b-activate-shadow-drift");
    postJournal(ledger, {
      suffix: 91,
      sourceId: "fee_fp06b_shadow_drift",
      ledgerAccountId,
      debitAccount: "expense.provider_fee:simulated",
      creditAccount: "cash.account:acct_fp06b_shadow_drift",
      amount: 3,
    });
    const active = sandbox.getActiveLedgerAccountProjection({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    sandbox.refreshLedgerAccountProjection({
      ledger_account_id: ledgerAccountId,
      currency: CURRENCY,
      expected_active_version: active.version,
      migration_plan_id: plan.id,
    });
    const runtime = sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(runtime.status, "blocked");
    assert.equal(runtime.shadow_status, "difference");
    assert.equal(runtime.read_balance, null);
    assert.ok(runtime.blockers.includes("wallet_shadow_mismatch"));
    assert.equal(runtime.fallback_performed, false);
  } finally {
    ledger.close();
  }
});

test("FP-06b cutover controls refuse Sandbox/Testnet and Live ledger scopes", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    const sandboxAccount = ledger.registerLedgerAccount({
      id: "lga_fp06b_sandbox_forbidden",
      environment: "sandbox",
      tenant_id: "ten_fp06b_sandbox_forbidden",
      book_id: "book_primary",
      owner_account_id: "acct_fp06b_sandbox_forbidden",
      asset: "USDC",
      network: "eip155:84532",
    });
    const liveAccount = ledger.registerLedgerAccount({
      id: "lga_fp06b_live_forbidden",
      environment: "live",
      tenant_id: "ten_fp06b_live_forbidden",
      book_id: "book_primary",
      owner_account_id: "acct_fp06b_live_forbidden",
      asset: "USDC",
      network: "eip155:8453",
    });
    assert.throws(
      () => ledger.walletCutoverScope({ ledger_account_id: sandboxAccount.id, currency: "USD", environment: "sandbox" }),
      (error) => error.code === "wallet_cutover_environment_not_authorized",
    );
    assert.throws(
      () => ledger.walletCutoverScope({ ledger_account_id: liveAccount.id, currency: "USD", environment: "live" }),
      (error) => error.code === "wallet_cutover_environment_not_authorized",
    );
  } finally {
    ledger.close();
  }
});

test("FP-06b wallet inspection batches large trusted source sets without SQLite parameter overflow", async () => {
  const { ledger, sandbox, ledgerAccountId } = await readyContext("source_batching");
  try {
    for (let index = 0; index < 1_200; index += 1) {
      sandbox.transactions.set(`txn_fp06b_batch_${String(index).padStart(4, "0")}`, {
        id: `txn_fp06b_batch_${String(index).padStart(4, "0")}`,
        ledger_account_id: ledgerAccountId,
        status: "created",
        reserved_amount: { value: 0, currency: CURRENCY },
      });
    }
    const model = sandbox.getWalletReadModel({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(model.completeness.status, "complete");
    assert.equal(model.completeness.unbound_posting_count, 0);
    assert.deepEqual(model.available_spending_capacity.amount, { value: OPENING_VALUE, currency: CURRENCY });
  } finally {
    ledger.close();
  }
});

test("FP-06b activation detects direct legacy wallet drift even without a state revision change", async () => {
  const { ledger, sandbox, assessment } = await readyContext("wallet_drift");
  try {
    ledger.db.prepare("UPDATE wallet_accounts SET available=available-1 WHERE id=?").run(sandbox.wallet.id);
    await assert.rejects(
      sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "direct wallet drift must fail" }, "fp06b-activate-wallet-drift"),
      (error) => error.code === "wallet_cutover_legacy_wallet_changed",
    );
  } finally {
    ledger.close();
  }
});

test("FP-06b runtime cutover survives restart and rollback appends a new generation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-fp06b-restart-"));
  const database = join(directory, "wallet-cutover.sqlite");
  let first;
  let second;
  try {
    const context = await readyContext("restart", { database });
    first = context.ledger;
    const activated = await context.sandbox.activateWalletReadCutover({
      assessment_id: context.assessment.id,
      expected_active_generation: 0,
      reason: "persist cutover generation across restart",
    }, "fp06b-activate-restart");
    assert.equal(activated.generation, 1);
    first.close();
    first = null;

    second = new SqliteLedger(database);
    const restored = new Bu2Sandbox({ ledger: second });
    const runtime = restored.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY });
    assert.equal(runtime.status, "active");
    assert.equal(runtime.cutover_generation, 1);
    assert.deepEqual(runtime.read_balance, { value: OPENING_VALUE, currency: CURRENCY });
    const rollback = await restored.rollbackWalletReadCutover({
      ledger_account_id: context.ledgerAccountId,
      currency: CURRENCY,
      expected_active_generation: 1,
      reason: "restore legacy read route after restart",
    }, "fp06b-rollback-restart");
    assert.equal(rollback.generation, 2);
    assert.equal(restored.getRuntimeWalletView({ ledger_account_id: context.ledgerAccountId, currency: CURRENCY }).read_mode, "legacy_wallet");
  } finally {
    first?.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FP-06b blocks runtime reads and new reserve before Adapter when an active cutover becomes stale", async () => {
  let adapterCalls = 0;
  const adapter = {
    async reserve() {
      adapterCalls += 1;
      return { provider_reference: "sim_fp06b_should_not_run" };
    },
  };
  const context = await readyContext("stale_guard", { adapter });
  const { ledger, sandbox, ledgerAccountId, fundingSourceId, plan, assessment } = context;
  try {
    await sandbox.activateWalletReadCutover({ assessment_id: assessment.id, expected_active_generation: 0, reason: "activate before stale test" }, "fp06b-activate-stale");
    postJournal(ledger, { suffix: 31, ledgerAccountId, sourceId: "src_fp06b_bound_drift" });
    const blocked = sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.read_balance, null);
    assert.equal(blocked.fallback_performed, false);
    assert.ok(blocked.blockers.includes("wallet_read_model_stale"));
    const walletBefore = structuredClone(sandbox.wallet);
    await assert.rejects(
      sandbox.reserve({
        id: "pi_fp06b_guard",
        funding_source_binding_id: fundingSourceId,
        funding_ledger_account_id: ledgerAccountId,
        asset: CURRENCY,
        network: NETWORK,
        amount: { value: 10, currency: CURRENCY },
        authorization: { id: "auth_fp06b_guard" },
        payment_mandate_id: null,
        payee_account_id: "acct_fp06b_guard_payee",
        quote_id: null,
      }),
      (error) => error.code === "wallet_read_cutover_unhealthy",
    );
    assert.equal(adapterCalls, 0);
    assert.deepEqual(sandbox.wallet, walletBefore);

    const rollback = await sandbox.rollbackWalletReadCutover({ ledger_account_id: ledgerAccountId, currency: CURRENCY, expected_active_generation: 1, reason: "rollback stale runtime view" }, "fp06b-rollback-stale");
    assert.equal(rollback.generation, 2);
    assert.equal(sandbox.assertWalletReadCutoverHealthy(ledgerAccountId, CURRENCY), null);
    const refreshed = sandbox.refreshLedgerAccountProjection({ ledger_account_id: ledgerAccountId, currency: CURRENCY, expected_active_version: 1, migration_plan_id: plan.id });
    assert.equal(refreshed.version, 2);
    const reassessed = await sandbox.prepareWalletCutoverAssessment({ ledger_account_id: ledgerAccountId, currency: CURRENCY, migration_plan_id: plan.id }, "fp06b-reassess-stale");
    assert.equal(reassessed.status, "ready");
    const reactivated = await sandbox.activateWalletReadCutover({ assessment_id: reassessed.id, expected_active_generation: 2, reason: "reactivate after safe projection refresh" }, "fp06b-reactivate-stale");
    assert.equal(reactivated.generation, 3);
    assert.equal(sandbox.getRuntimeWalletView({ ledger_account_id: ledgerAccountId, currency: CURRENCY }).status, "active");
  } finally {
    ledger.close();
  }
});
