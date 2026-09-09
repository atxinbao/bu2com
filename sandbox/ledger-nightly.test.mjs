import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteLedger } from "./persistence.mjs";

const DEFAULT_SEEDS = ["ci04-alpha", "ci04-beta", "ci04-gamma", "ci04-delta"];
const PROPERTY_STEPS = 64;
const CAPACITY_JOURNALS = 1_000;
const MAX_CAPACITY_DURATION_MS = 30_000;
const MAX_DATABASE_BYTES = 32 * 1024 * 1024;

const configuredSeeds = () => {
  const seeds = (process.env.BU2_NIGHTLY_SEEDS ?? DEFAULT_SEEDS.join(","))
    .split(",")
    .map((seed) => seed.trim())
    .filter(Boolean);
  assert.ok(seeds.length >= 4, "CI-04 requires at least four reproducible property seeds");
  return seeds;
};

const amountSequence = (seed, count) =>
  Array.from({ length: count }, (_, index) => {
    const digest = createHash("sha256").update(`${seed}:${index}`).digest();
    return (digest.readUInt32BE(0) % 1_000_000) + 1;
  });

const fixture = (ledger, suffix, amount) => {
  const createdAt = "2026-09-10T00:00:00.000Z";
  const sourceId = `src_nightly_${suffix}`;
  const eventId = `evt_nightly_${suffix}`;
  ledger.db
    .prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("nightly_sources", sourceId, "{}", createdAt);
  return {
    amount,
    sourceId,
    createdAt,
    event: { id: eventId, type: "journal.nightly", resource_id: sourceId, created_at: createdAt },
  };
};

const postings = (value, creditAmount = value.amount) => [
  {
    id: `pst_${value.event.id}_debit`,
    event_id: value.event.id,
    event_type: value.event.type,
    transaction_id: null,
    budget_id: null,
    source_id: value.sourceId,
    direction: "debit",
    account: "asset.cash",
    amount_value: value.amount,
    currency: "CNY",
    created_at: value.createdAt,
  },
  {
    id: `pst_${value.event.id}_credit`,
    event_id: value.event.id,
    event_type: value.event.type,
    transaction_id: null,
    budget_id: null,
    source_id: value.sourceId,
    direction: "credit",
    account: "liability.receivable",
    amount_value: creditAmount,
    currency: "CNY",
    created_at: value.createdAt,
  },
];

for (const seed of configuredSeeds()) {
  test(`CI-04 preserves journal invariants for seed ${seed}`, (context) => {
    const ledger = new SqliteLedger(":memory:");
    const sequence = amountSequence(seed, PROPERTY_STEPS);
    context.diagnostic(`seed=${seed}`);
    context.diagnostic(`steps=${JSON.stringify(sequence)}`);
    try {
      for (const [index, amount] of sequence.entries()) {
        const value = fixture(ledger, `${seed}_${index}`, amount);
        if (index % 11 === 0) {
          ledger.db.exec("BEGIN IMMEDIATE");
          assert.throws(
            () => ledger.writeBalancedJournals(postings(value, amount + 1), [value.event]),
            (error) => error.code === "journal_unbalanced",
          );
          ledger.db.exec("ROLLBACK");
        }
        ledger.db.exec("BEGIN IMMEDIATE");
        ledger.writeBalancedJournals(postings(value), [value.event]);
        ledger.db.exec("COMMIT");
      }
      const totals = ledger.db
        .prepare(
          `SELECT journal_id,
            SUM(CASE WHEN direction='debit' THEN amount_value ELSE 0 END) AS debits,
            SUM(CASE WHEN direction='credit' THEN amount_value ELSE 0 END) AS credits
           FROM financial_postings GROUP BY journal_id`,
        )
        .all();
      assert.equal(totals.length, PROPERTY_STEPS);
      assert.ok(totals.every((row) => row.debits === row.credits));
      assert.equal(
        ledger.db.prepare("SELECT COUNT(*) AS count FROM journal_headers").get().count,
        PROPERTY_STEPS,
      );
      assert.equal(
        ledger.db.prepare("SELECT COUNT(*) AS count FROM financial_postings").get().count,
        PROPERTY_STEPS * 2,
      );
    } catch (error) {
      error.message = `${error.message}; seed=${seed}; steps=${JSON.stringify(sequence)}`;
      throw error;
    } finally {
      ledger.close();
    }
  });
}

test("CI-04 records a bounded single-writer SQLite growth baseline", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci04-capacity-"));
  const databasePath = join(directory, "capacity.sqlite");
  const backupPath = join(directory, "capacity-backup.sqlite");
  const startedAt = Date.now();
  let ledger;
  let restored;
  try {
    ledger = new SqliteLedger(databasePath);
    ledger.db.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < CAPACITY_JOURNALS; index += 1) {
      const value = fixture(ledger, `capacity_${index}`, (index % 10_000) + 1);
      ledger.writeBalancedJournals(postings(value), [value.event]);
    }
    ledger.db.exec("COMMIT");
    await ledger.backupTo(backupPath, { rate: 100 });
    ledger.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    ledger.close();
    ledger = null;

    restored = new SqliteLedger(backupPath);
    const journalCount = restored.db
      .prepare("SELECT COUNT(*) AS count FROM journal_headers")
      .get().count;
    const postingCount = restored.db
      .prepare("SELECT COUNT(*) AS count FROM financial_postings")
      .get().count;
    const durationMs = Date.now() - startedAt;
    const databaseBytes = statSync(databasePath).size;
    context.diagnostic(
      `capacity=${JSON.stringify({ journal_count: journalCount, posting_count: postingCount, duration_ms: durationMs, database_bytes: databaseBytes })}`,
    );
    assert.equal(journalCount, CAPACITY_JOURNALS);
    assert.equal(postingCount, CAPACITY_JOURNALS * 2);
    assert.deepEqual(restored.databaseIntegrity(), ["ok"]);
    assert.ok(
      durationMs <= MAX_CAPACITY_DURATION_MS,
      `capacity duration ${durationMs}ms exceeded ${MAX_CAPACITY_DURATION_MS}ms`,
    );
    assert.ok(
      databaseBytes <= MAX_DATABASE_BYTES,
      `database size ${databaseBytes} exceeded ${MAX_DATABASE_BYTES}`,
    );
  } finally {
    if (ledger) ledger.close();
    if (restored) restored.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
