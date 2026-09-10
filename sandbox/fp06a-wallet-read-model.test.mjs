import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

function registerAccount(ledger, suffix = "primary") {
  return ledger.registerLedgerAccount({
    id: `lga_fp06a_${suffix}`,
    environment: "local",
    tenant_id: `ten_fp06a_${suffix}`,
    book_id: "book_primary",
    owner_account_id: `acct_fp06a_${suffix}`,
    asset: "CNY",
    network: null,
  });
}

function postJournal(ledger, {
  suffix,
  ledgerAccountId,
  amount = 1_000,
  account = "asset.cash:acct_fp06a_primary",
  sourceId = `src_fp06a_${suffix}`,
} = {}) {
  const createdAt = `2026-09-10T01:00:${String(Number(suffix)).padStart(2, "0")}.000Z`;
  const eventId = `evt_fp06a_${suffix}`;
  ledger.db.prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", sourceId, "{}", createdAt);
  const binding = ledgerAccountId === undefined ? {} : { ledger_account_id: ledgerAccountId };
  ledger.writeBalancedJournals([
    {
      id: `pst_fp06a_debit_${suffix}`,
      event_id: eventId,
      event_type: "journal.fp06a",
      source_id: sourceId,
      direction: "debit",
      account,
      amount_value: amount,
      currency: "CNY",
      created_at: createdAt,
      ...binding,
    },
    {
      id: `pst_fp06a_credit_${suffix}`,
      event_id: eventId,
      event_type: "journal.fp06a",
      source_id: sourceId,
      direction: "credit",
      account: "equity.opening",
      amount_value: amount,
      currency: "CNY",
      created_at: createdAt,
      ...binding,
    },
  ], [{ id: eventId, type: "journal.fp06a", resource_id: sourceId, created_at: createdAt }]);
}

function snapshotReadOnlyState(ledger, sandbox) {
  return {
    wallet: structuredClone(sandbox.wallet),
    state_revision: ledger.loadState().state.state_revision,
    posting_count: Number(ledger.db.prepare("SELECT COUNT(*) AS count FROM financial_postings").get().count),
    event_count: ledger.listLedgerEvents().length,
    projection_version_count: Number(ledger.db.prepare("SELECT COUNT(*) AS count FROM ledger_projection_versions").get().count),
    projection_balance_count: Number(ledger.db.prepare("SELECT COUNT(*) AS count FROM ledger_projection_balances").get().count),
  };
}

function freshContext(suffix = "primary") {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger, suffix);
  postJournal(ledger, { suffix: 1, ledgerAccountId: account.id, account: `asset.cash:${account.owner_account_id}` });
  const sandbox = new Bu2Sandbox({
    ledger,
    initialWallet: { id: `wal_fp06a_${suffix}`, available: 850, reserved: 150, currency: "CNY" },
  });
  const projection = sandbox.refreshLedgerAccountProjection({
    ledger_account_id: account.id,
    currency: "CNY",
    expected_active_version: null,
  });
  sandbox.transactions.set(`txn_fp06a_reserved_${suffix}`, {
    id: `txn_fp06a_reserved_${suffix}`,
    ledger_account_id: account.id,
    status: "funds_reserved",
    reserved_amount: { value: 100, currency: "CNY" },
  });
  sandbox.transactions.set(`txn_fp06a_pending_${suffix}`, {
    id: `txn_fp06a_pending_${suffix}`,
    ledger_account_id: account.id,
    status: "delivery_submitted",
    reserved_amount: { value: 50, currency: "CNY" },
  });
  return { ledger, account, sandbox, projection };
}

test("FP-06a builds a complete read-only WalletReadModel and a non-authorizing shadow match", () => {
  const { ledger, account, sandbox, projection } = freshContext();
  try {
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.schema_version, "wallet-read-model.v1");
    assert.equal(model.ledger_account_id, account.id);
    assert.equal(model.owner_account_id, account.owner_account_id);
    assert.equal(model.book_balance.amount.value, 1_000);
    assert.deepEqual(model.book_balance.included_accounts, [`asset.cash:${account.owner_account_id}`]);
    assert.equal(model.reserved.value, 100);
    assert.equal(model.pending_outbound.value, 50);
    assert.deepEqual(model.available_spending_capacity.amount, { value: 850, currency: "CNY" });
    assert.equal(model.available_spending_capacity.usable_for_spend, false);
    assert.equal(model.projection_id, projection.id);
    assert.equal(model.generation, 1);
    assert.equal(model.source_sequence, 1);
    assert.equal(model.stale, false);
    assert.equal(model.completeness.status, "complete");
    assert.equal(model.provider_balance.status, "not_observed");
    assert.equal(model.provider_balance.amount, null);
    assert.deepEqual(model.supported_operations, ["read", "reconcile", "shadow_compare"]);
    assert.equal(model.decision_use, "forbidden");

    const shadow = sandbox.shadowCompareWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(shadow.schema_version, "wallet-shadow.v1");
    assert.equal(shadow.mode, "shadow_only");
    assert.equal(shadow.status, "matched");
    assert.equal(shadow.decision_use, "forbidden");
    assert.equal(shadow.writes_performed, false);
    assert.equal(shadow.legacy_scope, "global_single_wallet");
    assert.ok(shadow.warnings.includes("legacy_runtime_scope_is_global"));
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a reports source drift as stale and blocks candidate capacity without refreshing projection", () => {
  const { ledger, account, sandbox, projection } = freshContext("stale");
  try {
    postJournal(ledger, { suffix: 2, ledgerAccountId: account.id, amount: 100, account: `asset.cash:${account.owner_account_id}` });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.projection_id, projection.id);
    assert.equal(model.book_balance.amount.value, 1_000);
    assert.equal(model.source_sequence, 2);
    assert.equal(model.stale, true);
    assert.ok(model.stale_reasons.includes("source_content_changed"));
    assert.equal(model.completeness.status, "blocked");
    assert.ok(model.completeness.blockers.includes("active_projection_stale"));
    assert.equal(model.available_spending_capacity.status, "blocked");
    assert.equal(model.available_spending_capacity.amount, null);
    const shadow = sandbox.shadowCompareWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(shadow.status, "blocked");
    assert.ok(shadow.warnings.includes("candidate_projection_stale"));
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a keeps a suspended account readable but blocks the stale candidate from spending", () => {
  const { ledger, account, sandbox } = freshContext("suspended");
  try {
    ledger.transitionLedgerAccount(account.id, { status: "suspended", version: 1 });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.account_status, "suspended");
    assert.equal(model.book_balance.amount.value, 1_000);
    assert.equal(model.stale, true);
    assert.equal(model.available_spending_capacity.status, "blocked");
    assert.equal(model.decision_use, "forbidden");
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a exposes a missing or target-scoped unresolved projection as incomplete instead of zero", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger, "missing");
  try {
    const sandbox = new Bu2Sandbox({ ledger });
    sandbox.transactions.set("txn_fp06a_missing_source", {
      id: "txn_fp06a_missing_source",
      ledger_account_id: account.id,
      status: "settled",
      reserved_amount: { value: 25, currency: "CNY" },
    });
    postJournal(ledger, { suffix: 3, sourceId: "txn_fp06a_missing_source" });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.book_balance, null);
    assert.equal(model.projection_id, null);
    assert.equal(model.generation, null);
    assert.equal(model.stale, true);
    assert.ok(model.stale_reasons.includes("missing_active_projection"));
    assert.equal(model.completeness.status, "blocked");
    assert.ok(model.completeness.blockers.includes("active_projection_missing"));
    assert.ok(model.completeness.blockers.includes("unbound_postings_present"));
    assert.equal(model.completeness.unbound_posting_count, 2);
    assert.equal(model.completeness.global_unbound_posting_count, 2);
    assert.equal(model.historical_scope.status, "migration_pending");
    assert.equal(model.available_spending_capacity.amount, null);
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a isolates unrelated legacy unbound postings from target completeness while retaining migration warning", () => {
  const { ledger, account, sandbox } = freshContext("isolated_legacy");
  try {
    postJournal(ledger, { suffix: 4 });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.stale, false);
    assert.equal(model.completeness.status, "complete");
    assert.equal(model.completeness.scope, "trusted_bound_sources");
    assert.equal(model.completeness.unbound_posting_count, 0);
    assert.equal(model.completeness.global_unbound_posting_count, 2);
    assert.equal(model.historical_scope.status, "migration_pending");
    assert.equal(model.historical_scope.cutover_accepted, false);
    assert.deepEqual(model.available_spending_capacity.amount, { value: 850, currency: "CNY" });
    const shadow = sandbox.shadowCompareWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(shadow.status, "matched");
    assert.ok(shadow.warnings.includes("historical_scope_migration_pending"));
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a keeps transaction reconciliation separate from an unobserved provider account balance", () => {
  const { ledger, account, sandbox } = freshContext("reconciliation");
  try {
    const transactionId = "txn_fp06a_reserved_reconciliation";
    const transaction = sandbox.transactions.get(transactionId);
    transaction.status = "settled";
    transaction.settled_amount = { value: 100, currency: "CNY" };
    sandbox.reconciliationRuns.set("rec_fp06a_external", {
      id: "rec_fp06a_external",
      mode: "external",
      status: "matched",
      as_of: "2026-09-10T01:10:00.000Z",
      created_at: "2026-09-10T01:10:01.000Z",
      items: [{
        kind: "payment",
        source_id: transactionId,
        provider_reference: "sim_fp06a_observed",
        expected_amount: { value: 100, currency: "CNY" },
        observed_amount: { value: 100, currency: "CNY" },
        observation: {
          provider: "simulated_external_reader",
          provider_reference: "sim_fp06a_observed",
          amount: { value: 100, currency: "CNY" },
          status: "verified",
        },
        status: "matched",
        issues: [],
      }],
    });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.reconciliation_status.status, "matched");
    assert.equal(model.reconciliation_status.run_id, "rec_fp06a_external");
    assert.equal(model.provider_balance.status, "not_observed");
    assert.equal(model.provider_balance.amount, null);
    assert.deepEqual(model.provider_balance.evidence_refs, []);
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);
  } finally {
    ledger.close();
  }
});

test("FP-06a blocks candidate capacity when an unfinished same-currency transaction has no trusted ledger ownership", () => {
  const { ledger, account, sandbox } = freshContext("unbound_pending");
  try {
    sandbox.transactions.set("txn_fp06a_legacy_unbound", {
      id: "txn_fp06a_legacy_unbound",
      ledger_account_id: null,
      status: "funds_reserved",
      reserved_amount: { value: 25, currency: "CNY" },
    });
    const before = snapshotReadOnlyState(ledger, sandbox);
    const model = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(model.completeness.status, "blocked");
    assert.equal(model.completeness.unbound_pending_transaction_count, 1);
    assert.ok(model.completeness.blockers.includes("unbound_pending_transactions_present"));
    assert.equal(model.available_spending_capacity.status, "blocked");
    assert.equal(model.available_spending_capacity.amount, null);
    assert.deepEqual(snapshotReadOnlyState(ledger, sandbox), before);

    sandbox.transactions.delete("txn_fp06a_legacy_unbound");
    sandbox.transactions.set("txn_fp06a_invalid_pending", {
      id: "txn_fp06a_invalid_pending",
      ledger_account_id: account.id,
      status: "delivery_submitted",
      reserved_amount: { value: 1.5, currency: "CNY" },
    });
    const invalid = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(invalid.completeness.status, "blocked");
    assert.ok(invalid.completeness.blockers.includes("pending_transaction_amount_invalid"));
    assert.equal(invalid.available_spending_capacity.amount, null);

    sandbox.transactions.delete("txn_fp06a_invalid_pending");
    sandbox.transactions.set("txn_fp06a_unbound_unknown_currency", {
      id: "txn_fp06a_unbound_unknown_currency",
      ledger_account_id: null,
      status: "funds_reserved",
      reserved_amount: null,
    });
    const unresolved = sandbox.getWalletReadModel({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(unresolved.completeness.unbound_pending_transaction_count, 1);
    assert.ok(unresolved.completeness.blockers.includes("unbound_pending_transactions_present"));
    assert.equal(unresolved.available_spending_capacity.amount, null);
  } finally {
    ledger.close();
  }
});
