import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bu2Sandbox } from "./domain.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const checkpointInput = {
  id: "obc_la05b_opening",
  book_id: "book_la05b",
  account_id: "acct_la05b_owner",
  owner_account_id: "acct_la05b_owner",
  funding_source_id: "fund_la05b_source",
  environment: "local",
  asset: "CNY",
  network: null,
  amount: { value: 1_000, currency: "CNY" },
  effective_at: "2026-01-01T00:00:00.000Z",
  source_reference: "migration-la05b-opening-001",
  reason: "Reconciled local replay baseline",
};

async function createCheckpoint(sandbox) {
  return sandbox.createOpeningBalance(checkpointInput, "la05b-opening-key");
}

function bindCheckpointLedger(ledger) {
  ledger.registerLedgerAccount({ id: "lga_la05b_owner", environment: "local", tenant_id: "ten_la05b_owner", book_id: checkpointInput.book_id, owner_account_id: checkpointInput.owner_account_id, asset: checkpointInput.asset, network: checkpointInput.network });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local", requested_by: "usr_la05b_operator", idempotency_key: "la05b-opening-binding",
    tenants: [{ tenant_id: "ten_la05b_owner", principal: { id: "usr_la05b_owner", display_name: "LA05b Owner" }, accounts: [{ id: checkpointInput.account_id, display_name: "LA05b Owner" }], agents: [], credentials: [], funding_sources: [{ id: checkpointInput.funding_source_id, account_id: checkpointInput.account_id, agent_id: null, asset: checkpointInput.asset, network: checkpointInput.network, provider: "simulated", ledger_account_id: "lga_la05b_owner", source_reference: "wallet:la05b-opening" }], receiving_targets: [] }],
  }, "local"));
}

test("LA-05b replays an opening checkpoint and immutable correction at a historical time", async () => {
  const sandbox = new Bu2Sandbox();
  const checkpoint = await createCheckpoint(sandbox);
  const openingEvent = sandbox.events.find((event) => event.type === "ledger.opening_balance_posted");
  const beforeCorrection = sandbox.replayLedgerHistory({ as_of: "2026-09-09T00:00:00.000Z" });
  assert.equal(beforeCorrection.status, "complete");
  assert.equal(beforeCorrection.checkpoint_count, 1);
  assert.equal(beforeCorrection.gap_count, 0);
  assert.equal(beforeCorrection.posting_count, 2);

  const correction = await sandbox.postLedgerCorrection(
    {
      id: "cor_la05b_adjustment",
      original_event_id: openingEvent.id,
      book_id: checkpoint.book_id,
      environment: "local",
      amount: { value: 125, currency: "CNY" },
      debit_account: "asset.cash:acct_la05b_owner",
      credit_account: "expense.replay_adjustment",
      reason: "Append-only replay adjustment",
    },
    "la05b-correction-key",
  );
  assert.equal(correction.status, "posted");
  const afterCorrection = sandbox.replayLedgerHistory();
  assert.equal(afterCorrection.status, "complete");
  assert.equal(afterCorrection.posting_count, 4);
  assert.equal(afterCorrection.gap_count, 0);
});

test("LA-05b reports missing financial history instead of inventing postings", async () => {
  const sandbox = new Bu2Sandbox();
  await createCheckpoint(sandbox);
  sandbox.events.push({
    id: "evt_la05b_missing_posting",
    type: "transaction.settled",
    resource_id: "txn_la05b_missing_posting",
    created_at: "2026-02-01T00:00:00.000Z",
  });
  const replay = sandbox.replayLedgerHistory({ as_of: "2026-09-09T00:00:00.000Z" });
  assert.equal(replay.status, "incomplete");
  assert.ok(replay.gaps.some((gap) => gap.code === "financial_event_without_posting"));
  assert.equal(replay.posting_count, 2);
});

test("LA-05b excludes opening balances that are not effective at the replay cutoff", async () => {
  const sandbox = new Bu2Sandbox();
  await sandbox.createOpeningBalance(checkpointInput, "la05b-effective-opening");
  await sandbox.createOpeningBalance({
    ...checkpointInput,
    id: "obc_la05b_future",
    amount: { value: 900, currency: "CNY" },
    effective_at: "2026-09-10T00:00:00.000Z",
    source_reference: "migration-la05b-future-001",
  }, "la05b-future-opening");
  const replay = sandbox.replayLedgerHistory({ as_of: "2026-09-09T13:00:00.000Z" });
  assert.equal(replay.status, "complete");
  assert.equal(replay.checkpoint_count, 1);
  assert.equal(replay.posting_count, 2);
  assert.equal(replay.accounts.find((balance) => balance.account === "asset.cash:acct_la05b_owner").balance_minor, 1000);
});

test("LA-05b uses effective time for an opening event written before the cutoff", async () => {
  const sandbox = new Bu2Sandbox();
  await sandbox.createOpeningBalance(checkpointInput, "la05b-window-effective");
  await sandbox.createOpeningBalance({
    ...checkpointInput,
    id: "obc_la05b_future_written_early",
    amount: { value: 900, currency: "CNY" },
    effective_at: "2026-09-10T00:00:00.000Z",
    source_reference: "migration-la05b-future-early-001",
  }, "la05b-future-written-early");
  const futureEvent = sandbox.events.find((event) => event.resource_id === "obc_la05b_future_written_early");
  futureEvent.created_at = "2026-09-09T12:00:00.000Z";
  const replay = sandbox.replayLedgerHistory({ as_of: "2026-09-09T13:00:00.000Z" });
  assert.equal(replay.status, "complete");
  assert.equal(replay.event_count, 1);
  assert.equal(replay.posting_count, 2);
  assert.equal(replay.gap_count, 0);
});

test("LA-05b produces append-only catch-up evidence after a validated SQLite backup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la05b-backup-catchup-"));
  const sourcePath = join(directory, "source.sqlite");
  const backupPath = join(directory, "backup.sqlite");
  try {
    const sourceLedger = new SqliteLedger(sourcePath);
    bindCheckpointLedger(sourceLedger);
    const source = new Bu2Sandbox({ ledger: sourceLedger });
    await createCheckpoint(source);
    await sourceLedger.backupTo(backupPath, { rate: 100 });
    const backupLedger = new SqliteLedger(backupPath);
    const backup = new Bu2Sandbox({ ledger: backupLedger });
    const baseline = backup.exportLedgerReplayEvidence();
    backupLedger.close();

    const openingEvent = source.events.find((event) => event.type === "ledger.opening_balance_posted");
    await source.postLedgerCorrection(
      {
        id: "cor_la05b_backup_catchup",
        original_event_id: openingEvent.id,
        book_id: checkpointInput.book_id,
        environment: "local",
        amount: { value: 75, currency: "CNY" },
        debit_account: "asset.cash:acct_la05b_owner",
        credit_account: "expense.replay_adjustment",
        reason: "Backup catch-up append fact",
      },
      "la05b-backup-catchup-key",
    );
    const catchUp = source.catchUpLedgerFromBackup({ baseline });
    assert.equal(catchUp.status, "catch_up_required");
    assert.equal(catchUp.automatic_provider_replay, false);
    assert.equal(catchUp.append_event_count, 1);
    assert.equal(catchUp.append_posting_count, 2);
    assert.equal(catchUp.append_opening_balance_count, 0);
    assert.equal(catchUp.replay.status, "complete");

    const tampered = structuredClone(baseline);
    tampered.postings[0].amount_value += 1;
    const blocked = source.catchUpLedgerFromBackup({ baseline: tampered });
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.conflicts.some((conflict) => conflict.code === "baseline_posting_changed"));
    sourceLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-05b replay survives SQLite restart without replaying a provider", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la05b-restart-"));
  const database = join(directory, "replay.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    bindCheckpointLedger(firstLedger);
    const first = new Bu2Sandbox({ ledger: firstLedger });
    await createCheckpoint(first);
    const before = first.replayLedgerHistory();
    firstLedger.close();
    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger });
    const after = second.replayLedgerHistory();
    assert.equal(after.status, "complete");
    assert.equal(after.posting_count, before.posting_count);
    assert.equal(after.automatic_provider_replay, false);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
