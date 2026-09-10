import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const openingInput = {
  id: "obc_la03b_001",
  book_id: "book_bu2_local",
  account_id: "acct_bu2_ventures",
  owner_account_id: "acct_bu2_ventures",
  funding_source_id: "fund_la03b_primary",
  environment: "local",
  asset: "CNY",
  network: null,
  amount: { value: 100_000, currency: "CNY" },
  effective_at: "2026-09-01T00:00:00.000Z",
  source_reference: "reconciled-bank-statement-2026-09-01",
  reason: "核对后的本地迁移期初检查点",
};

function bindOpeningLedger(ledger) {
  ledger.registerLedgerAccount({ id: "lga_bu2_local", environment: "local", tenant_id: "ten_bu2_ventures", book_id: openingInput.book_id, owner_account_id: openingInput.owner_account_id, asset: openingInput.asset, network: openingInput.network });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local", requested_by: "usr_bu2_operator", idempotency_key: "la03b-opening-binding",
    tenants: [{ tenant_id: "ten_bu2_ventures", principal: { id: "usr_bu2_ventures", display_name: "BU2 Ventures" }, accounts: [{ id: openingInput.account_id, display_name: "BU2 Ventures" }], agents: [], credentials: [], funding_sources: [{ id: openingInput.funding_source_id, account_id: openingInput.account_id, agent_id: null, asset: openingInput.asset, network: openingInput.network, provider: "simulated", ledger_account_id: "lga_bu2_local", source_reference: "wallet:la03b-opening" }], receiving_targets: [] }],
  }, "local"));
}

test("LA-03b records a reconciled opening checkpoint without changing the wallet projection", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la03b-opening-"));
  const database = join(directory, "opening.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    bindOpeningLedger(firstLedger);
    const first = new Bu2Sandbox({ ledger: firstLedger });
    const initialWallet = first.wallet.available;
    const checkpoint = await first.createOpeningBalance(openingInput, "la03b-opening-001");
    assert.equal(checkpoint.status, "posted");
    assert.equal(first.wallet.available, initialWallet);
    const postings = first.listFinancialPostings().filter((posting) => posting.source_id === checkpoint.id);
    assert.equal(postings.length, 2);
    assert.deepEqual(postings.map((posting) => posting.direction).sort(), ["credit", "debit"]);
    assert.ok(postings.every((posting) => posting.event_type === "ledger.opening_balance_posted"));
    assert.deepEqual(await first.createOpeningBalance(openingInput, "la03b-opening-001"), checkpoint);
    assert.equal(first.listFinancialPostings().filter((posting) => posting.source_id === checkpoint.id).length, 2);
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger });
    assert.deepEqual(second.getOpeningBalance(checkpoint.id), checkpoint);
    assert.equal(second.listFinancialPostings().filter((posting) => posting.source_id === checkpoint.id).length, 2);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-03b appends an immutable correction against an existing event and is idempotent", async () => {
  const ledger = new SqliteLedger(":memory:");
  bindOpeningLedger(ledger);
  const sandbox = new Bu2Sandbox({ ledger });
  const checkpoint = await sandbox.createOpeningBalance(openingInput, "la03b-correction-opening");
  const original = sandbox.events.find((event) => event.resource_id === checkpoint.id);
  assert.ok(original);
  const correctionInput = {
    id: "cor_la03b_001",
    original_event_id: original.id,
    book_id: openingInput.book_id,
    environment: "local",
    amount: { value: 25, currency: "CNY" },
    debit_account: "expense.migration_adjustment",
    credit_account: "equity.opening_balance:obc_la03b_001",
    reason: "核对后发现的期初差异，追加补偿事实",
  };
  const correction = await sandbox.postLedgerCorrection(correctionInput, "la03b-correction-001");
  assert.equal(correction.status, "posted");
  assert.equal(correction.original_event_id, original.id);
  const correctionPostings = sandbox.listFinancialPostings().filter((posting) => posting.source_id === correction.id);
  assert.equal(correctionPostings.length, 2);
  assert.ok(correctionPostings.every((posting) => posting.event_type === "ledger.correction_posted"));
  assert.deepEqual(await sandbox.postLedgerCorrection(correctionInput, "la03b-correction-001"), correction);
  assert.equal(sandbox.listFinancialPostings().filter((posting) => posting.source_id === correction.id).length, 2);
  assert.equal(sandbox.getOpeningBalance(checkpoint.id).status, "posted");
  await assert.rejects(
    sandbox.postLedgerCorrection({ ...correctionInput, id: "cor_la03b_missing", original_event_id: "evt_missing" }, "la03b-correction-missing"),
    (error) => error.code === "original_event_not_found",
  );
  ledger.close();
});

test("LA-03b rejects wrong environments and correction account drift", async () => {
  const ledger = new SqliteLedger(":memory:");
  bindOpeningLedger(ledger);
  const sandbox = new Bu2Sandbox({ ledger });
  await assert.rejects(
    sandbox.createOpeningBalance({ ...openingInput, id: "obc_la03b_wrong_env", environment: "sandbox" }, "la03b-opening-wrong-env"),
    (error) => error.code === "opening_balance_environment_mismatch",
  );
  const checkpoint = await sandbox.createOpeningBalance({ ...openingInput, id: "obc_la03b_accounts" }, "la03b-opening-accounts");
  const original = sandbox.events.find((event) => event.resource_id === checkpoint.id);
  await assert.rejects(
    sandbox.postLedgerCorrection({
      original_event_id: original.id,
      book_id: openingInput.book_id,
      environment: "local",
      amount: { value: 25, currency: "CNY" },
      debit_account: "expense.migration_adjustment",
      credit_account: "expense.migration_adjustment",
      reason: "invalid correction",
    }, "la03b-correction-drift"),
    (error) => error.code === "correction_accounts_identical",
  );
  ledger.close();
});

test("LA-03c rebuilds account balances from immutable postings and survives restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la03c-projection-"));
  const database = join(directory, "projection.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    bindOpeningLedger(firstLedger);
    const first = new Bu2Sandbox({ ledger: firstLedger });
    const checkpoint = await first.createOpeningBalance({ ...openingInput, id: "obc_la03c_projection" }, "la03c-opening");
    const original = first.events.find((event) => event.resource_id === checkpoint.id);
    await first.postLedgerCorrection(
      {
        id: "cor_la03c_projection",
        original_event_id: original.id,
        book_id: openingInput.book_id,
        environment: "local",
        amount: { value: 25, currency: "CNY" },
        debit_account: "expense.migration_adjustment",
        credit_account: "equity.opening_balance:obc_la03c_projection",
        reason: "projection test correction",
      },
      "la03c-correction",
    );
    const projection = first.rebuildLedgerProjection({ currency: "CNY" });
    assert.equal(projection.posting_count, 4);
    assert.equal(projection.journal_count, 2);
    assert.equal(projection.unbalanced_journal_count, 0);
    assert.equal(projection.accounts.find((account) => account.account === "asset.cash:acct_bu2_ventures").balance_minor, 100_000);
    assert.equal(projection.accounts.find((account) => account.account === "expense.migration_adjustment").balance_minor, 25);
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger });
    const restored = second.rebuildLedgerProjection({ currency: "CNY" });
    assert.equal(restored.posting_count, 4);
    assert.equal(restored.unbalanced_journal_count, 0);
    assert.deepEqual(
      restored.accounts.map(({ account, balance_minor }) => ({ account, balance_minor })),
      projection.accounts.map(({ account, balance_minor }) => ({ account, balance_minor })),
    );
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
