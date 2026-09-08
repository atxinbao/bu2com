import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

function sourceAndEvent(ledger, eventId = "evt_la03d_posting") {
  const createdAt = new Date().toISOString();
  ledger.db
    .prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", `src_${eventId}`, "{}", createdAt);
  return {
    event: { id: eventId, type: "journal.la03d", resource_id: `src_${eventId}`, created_at: createdAt },
    source_id: `src_${eventId}`,
    created_at: createdAt,
  };
}

function postings(fixture, ledgerAccountId, suffix = "") {
  return [
    {
      id: `pst_la03d_debit${suffix}`,
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      source_id: fixture.source_id,
      direction: "debit",
      account: "asset.cash",
      amount_value: 100,
      currency: "CNY",
      created_at: fixture.created_at,
      ledger_account_id: ledgerAccountId,
    },
    {
      id: `pst_la03d_credit${suffix}`,
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      source_id: fixture.source_id,
      direction: "credit",
      account: "liability.receivable",
      amount_value: 100,
      currency: "CNY",
      created_at: fixture.created_at,
      ledger_account_id: ledgerAccountId,
    },
  ];
}

function registerAccount(ledger, overrides = {}) {
  return ledger.registerLedgerAccount({
    id: "lga_la03d_buyer",
    environment: "local",
    tenant_id: "ten_buyer",
    book_id: "book_primary",
    owner_account_id: "acct_buyer",
    asset: "CNY",
    network: null,
    ...overrides,
  });
}

test("LA-03d binds postings and rebuilds a ledger-account-scoped projection", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger);
  const fixture = sourceAndEvent(ledger);
  ledger.writeBalancedJournals(postings(fixture, account.id), [fixture.event]);

  const sandbox = new Bu2Sandbox({ ledger });
  const state = ledger.loadState();
  assert.ok(state.financial.financial_postings.every(([, posting]) => posting.ledger_account_id === account.id));
  const projection = sandbox.rebuildLedgerAccountProjection({ ledger_account_id: account.id });
  assert.equal(Number.isFinite(Date.parse(projection.generated_at)), true);
  assert.deepEqual({ ...projection, generated_at: undefined }, {
    generated_at: undefined,
    ledger_account_id: account.id,
    currency: null,
    posting_count: 2,
    journal_count: 1,
    unbalanced_journal_count: 0,
    accounts: [
      { account: "asset.cash", balance_minor: 100, currency: "CNY", ledger_account_id: account.id, posting_count: 1 },
      { account: "liability.receivable", balance_minor: -100, currency: "CNY", ledger_account_id: account.id, posting_count: 1 },
    ],
    journals: [{ event_id: fixture.event.id, currency: "CNY", debit_minor: 100, credit_minor: 100, posting_count: 2, balanced: true }],
  });
  ledger.close();
});

test("LA-03d rejects inactive, unknown, and cross-environment posting bindings", () => {
  const ledger = new SqliteLedger(":memory:");
  const account = registerAccount(ledger);
  const fixture = sourceAndEvent(ledger, "evt_la03d_rejected");
  ledger.transitionLedgerAccount(account.id, { status: "suspended", version: 1 });
  assert.throws(
    () => ledger.writeBalancedJournals(postings(fixture, account.id), [fixture.event]),
    (error) => error.code === "ledger_account_not_active",
  );
  assert.throws(
    () => ledger.writeBalancedJournals(postings(fixture, "lga_missing"), [fixture.event]),
    (error) => error.code === "ledger_account_not_found",
  );
  ledger.transitionLedgerAccount(account.id, { status: "active", version: 2 });
  assert.throws(
    () => ledger.assertLedgerAccountBinding(account.id, { environment: "sandbox" }),
    (error) => error.code === "ledger_account_environment_mismatch",
  );
  assert.throws(
    () => ledger.writeBalancedJournals(postings(fixture, account.id), [fixture.event], { environment: "sandbox" }),
    (error) => error.code === "ledger_account_environment_mismatch",
  );
  ledger.close();
});

test("LA-03d projection separates ledger accounts while preserving legacy postings", () => {
  const ledger = new SqliteLedger(":memory:");
  const first = registerAccount(ledger);
  const second = registerAccount(ledger, {
    id: "lga_la03d_other",
    tenant_id: "ten_other",
    owner_account_id: "acct_other",
  });
  const firstFixture = sourceAndEvent(ledger, "evt_la03d_first");
  const secondFixture = sourceAndEvent(ledger, "evt_la03d_second");
  ledger.writeBalancedJournals(postings(firstFixture, first.id, "_first"), [firstFixture.event]);
  ledger.writeBalancedJournals(postings(secondFixture, second.id, "_second"), [secondFixture.event]);
  const sandbox = new Bu2Sandbox({ ledger });
  assert.equal(sandbox.rebuildLedgerAccountProjection({ ledger_account_id: first.id }).posting_count, 2);
  assert.equal(sandbox.rebuildLedgerAccountProjection({ ledger_account_id: second.id }).posting_count, 2);
  assert.equal(sandbox.rebuildLedgerProjection().accounts.length, 4);
  ledger.close();
});
