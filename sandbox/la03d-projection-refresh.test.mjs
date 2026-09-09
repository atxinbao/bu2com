import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

function registerAccount(ledger, overrides = {}) {
  return ledger.registerLedgerAccount({
    id: "lga_projection_owner",
    environment: "local",
    tenant_id: "ten_projection",
    book_id: "book_primary",
    owner_account_id: "acct_projection",
    asset: "CNY",
    network: null,
    ...overrides,
  });
}

function postJournal(ledger, {
  suffix,
  ledgerAccountId,
  amount = 100,
  currency = "CNY",
} = {}) {
  const createdAt = `2026-09-10T00:00:${String(Number(suffix)).padStart(2, "0")}.000Z`;
  const sourceId = `src_projection_${suffix}`;
  const eventId = `evt_projection_${suffix}`;
  ledger.db.prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", sourceId, "{}", createdAt);
  const binding = ledgerAccountId === undefined ? {} : { ledger_account_id: ledgerAccountId };
  ledger.writeBalancedJournals([
    {
      id: `pst_projection_debit_${suffix}`,
      event_id: eventId,
      event_type: "journal.projection_refresh",
      source_id: sourceId,
      direction: "debit",
      account: "asset.cash",
      amount_value: amount,
      currency,
      created_at: createdAt,
      ...binding,
    },
    {
      id: `pst_projection_credit_${suffix}`,
      event_id: eventId,
      event_type: "journal.projection_refresh",
      source_id: sourceId,
      direction: "credit",
      account: "liability.receivable",
      amount_value: amount,
      currency,
      created_at: createdAt,
      ...binding,
    },
  ], [{ id: eventId, type: "journal.projection_refresh", resource_id: sourceId, created_at: createdAt }]);
}

test("LA-03d refresh creates one active version, is idempotent, and advances only for new postings", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger);
  postJournal(ledger, { suffix: 1, ledgerAccountId: account.id });
  const sandbox = new Bu2Sandbox({ ledger });
  const walletBefore = structuredClone(sandbox.wallet);
  const eventCountBefore = ledger.listLedgerEvents().length;

  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY" }),
    (error) => error.code === "expected_projection_version_required",
  );

  const first = sandbox.refreshLedgerAccountProjection({
    ledger_account_id: account.id,
    currency: "CNY",
    expected_active_version: null,
  });
  assert.equal(first.version, 1);
  assert.equal(first.status, "active");
  assert.equal(first.idempotent, false);
  assert.equal(first.content_hash.length, 64);
  assert.deepEqual(first.accounts.map(({ account: name, balance_minor }) => [name, balance_minor]), [
    ["asset.cash", 100],
    ["liability.receivable", -100],
  ]);

  const replay = sandbox.refreshLedgerAccountProjection({
    ledger_account_id: account.id,
    currency: "CNY",
    expected_active_version: 1,
  });
  assert.equal(replay.version, 1);
  assert.equal(replay.idempotent, true);
  assert.equal(ledger.listLedgerAccountProjectionVersions({ ledger_account_id: account.id, currency: "CNY" }).length, 1);

  postJournal(ledger, { suffix: 2, ledgerAccountId: account.id, amount: 25 });
  const second = sandbox.refreshLedgerAccountProjection({
    ledger_account_id: account.id,
    currency: "CNY",
    expected_active_version: 1,
  });
  assert.equal(second.version, 2);
  assert.equal(second.accounts.find((row) => row.account === "asset.cash").balance_minor, 125);
  assert.deepEqual(
    ledger.listLedgerAccountProjectionVersions({ ledger_account_id: account.id, currency: "CNY" }).map(({ version, status }) => ({ version, status })),
    [{ version: 1, status: "superseded" }, { version: 2, status: "active" }],
  );
  assert.deepEqual(sandbox.wallet, walletBefore);
  assert.equal(ledger.listLedgerEvents().length, eventCountBefore);
  assert.equal(ledger.db.prepare("SELECT COUNT(*) AS count FROM financial_postings").get().count, 4);
  ledger.close();
});

test("LA-03d rejects stale activation and rolls back every derived row on injected failure", () => {
  let failureStage = null;
  const ledger = new SqliteLedger(":memory:", {
    failureInjector(stage) {
      if (failureStage === stage) {
        failureStage = null;
        throw new Error("injected projection failure");
      }
    },
  });
  const account = registerAccount(ledger);
  postJournal(ledger, { suffix: 3, ledgerAccountId: account.id });
  const sandbox = new Bu2Sandbox({ ledger });
  sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null });
  postJournal(ledger, { suffix: 4, ledgerAccountId: account.id });

  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null }),
    (error) => error.code === "ledger_projection_version_conflict",
  );
  failureStage = "after_projection_version_write";
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: 1 }),
    /injected projection failure/,
  );
  assert.equal(sandbox.getActiveLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY" }).version, 1);
  assert.equal(ledger.listLedgerAccountProjectionVersions({ ledger_account_id: account.id, currency: "CNY" }).length, 1);
  assert.equal(ledger.db.prepare("SELECT COUNT(*) AS count FROM ledger_projection_balances").get().count, 2);
  failureStage = "after_projection_activation";
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: 1 }),
    /injected projection failure/,
  );
  assert.equal(sandbox.getActiveLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY" }).version, 1);
  assert.deepEqual(
    ledger.listLedgerAccountProjectionVersions({ ledger_account_id: account.id, currency: "CNY" }).map(({ version, status }) => ({ version, status })),
    [{ version: 1, status: "active" }],
  );
  ledger.close();
});

test("LA-03d conditional refresh admits at most one writer from the same observed version", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger);
  postJournal(ledger, { suffix: 5, ledgerAccountId: account.id });
  const sandbox = new Bu2Sandbox({ ledger });
  sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null });
  postJournal(ledger, { suffix: 6, ledgerAccountId: account.id });

  const firstWriter = sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: 1 });
  assert.equal(firstWriter.version, 2);
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: 1 }),
    (error) => error.code === "ledger_projection_version_conflict",
  );
  assert.equal(ledger.db.prepare("SELECT COUNT(*) AS count FROM ledger_projection_versions WHERE status='active'").get().count, 1);
  ledger.close();
});

test("LA-03d projection versions isolate ledger accounts and currencies", () => {
  const ledger = new SqliteLedger(":memory:");
  const first = registerAccount(ledger);
  const second = registerAccount(ledger, {
    id: "lga_projection_other",
    tenant_id: "ten_other",
    owner_account_id: "acct_other",
  });
  postJournal(ledger, { suffix: 7, ledgerAccountId: first.id, amount: 70 });
  postJournal(ledger, { suffix: 8, ledgerAccountId: first.id, amount: 80, currency: "USD" });
  postJournal(ledger, { suffix: 9, ledgerAccountId: second.id, amount: 90 });
  const sandbox = new Bu2Sandbox({ ledger });

  const firstCny = sandbox.refreshLedgerAccountProjection({ ledger_account_id: first.id, currency: "CNY", expected_active_version: null });
  const firstUsd = sandbox.refreshLedgerAccountProjection({ ledger_account_id: first.id, currency: "USD", expected_active_version: null });
  const secondCny = sandbox.refreshLedgerAccountProjection({ ledger_account_id: second.id, currency: "CNY", expected_active_version: null });
  assert.equal(firstCny.accounts[0].balance_minor, 70);
  assert.equal(firstUsd.accounts[0].balance_minor, 80);
  assert.equal(secondCny.accounts[0].balance_minor, 90);
  assert.notEqual(firstCny.content_hash, firstUsd.content_hash);
  assert.notEqual(firstCny.content_hash, secondCny.content_hash);
  ledger.close();
});

test("LA-03d refresh fails closed for inactive, cross-environment, and unbound facts", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger);
  postJournal(ledger, { suffix: 10, ledgerAccountId: account.id });
  const sandbox = new Bu2Sandbox({ ledger });
  ledger.transitionLedgerAccount(account.id, { status: "suspended", version: 1 });
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null }),
    (error) => error.code === "ledger_account_not_active",
  );
  ledger.transitionLedgerAccount(account.id, { status: "active", version: 2 });
  postJournal(ledger, { suffix: 11 });
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null }),
    (error) => error.code === "ledger_projection_unbound_postings" && error.details.unbound_posting_count === 2,
  );

  const sandboxAccount = registerAccount(ledger, {
    id: "lga_projection_sandbox",
    environment: "sandbox",
  });
  assert.throws(
    () => sandbox.refreshLedgerAccountProjection({ ledger_account_id: sandboxAccount.id, currency: "CNY", expected_active_version: null }),
    (error) => error.code === "ledger_account_environment_mismatch",
  );
  ledger.close();
});

test("LA-03d active projection survives restart and can be rebuilt after derived data deletion", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la03d-projection-"));
  const path = join(directory, "ledger.sqlite");
  try {
    const firstLedger = new SqliteLedger(path);
    const account = registerAccount(firstLedger);
    postJournal(firstLedger, { suffix: 12, ledgerAccountId: account.id, amount: 120 });
    const firstSandbox = new Bu2Sandbox({ ledger: firstLedger });
    const original = firstSandbox.refreshLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY", expected_active_version: null });
    firstLedger.close();

    const restoredLedger = new SqliteLedger(path);
    const restoredSandbox = new Bu2Sandbox({ ledger: restoredLedger });
    const restored = restoredSandbox.getActiveLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY" });
    assert.equal(restored.content_hash, original.content_hash);
    assert.deepEqual(restored.accounts, original.accounts);

    restoredLedger.db.prepare("DELETE FROM ledger_projection_balances").run();
    assert.deepEqual(restoredSandbox.getActiveLedgerAccountProjection({ ledger_account_id: account.id, currency: "CNY" }).accounts, []);
    const rebuilt = restoredSandbox.refreshLedgerAccountProjection({
      ledger_account_id: account.id,
      currency: "CNY",
      expected_active_version: 1,
    });
    assert.equal(rebuilt.version, 1);
    assert.equal(rebuilt.content_hash, original.content_hash);
    assert.deepEqual(rebuilt.accounts, original.accounts);
    restoredLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
