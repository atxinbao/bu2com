import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

function sourceAndEvent(ledger) {
  const now = new Date().toISOString();
  ledger.db
    .prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", "src_la02", "{}", now);
  return {
    event: {
      id: "evt_la02",
      type: "journal.la02",
      resource_id: "src_la02",
      created_at: now,
    },
    source_id: "src_la02",
    created_at: now,
  };
}

function balancedPostings(fixture) {
  return [
    {
      id: "pst_la02_debit",
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      transaction_id: null,
      budget_id: null,
      source_id: fixture.source_id,
      direction: "debit",
      account: "asset.cash",
      amount_value: 100,
      currency: "CNY",
      created_at: fixture.created_at,
    },
    {
      id: "pst_la02_credit",
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      transaction_id: null,
      budget_id: null,
      source_id: fixture.source_id,
      direction: "credit",
      account: "liability.receivable",
      amount_value: 100,
      currency: "CNY",
      created_at: fixture.created_at,
    },
  ];
}

test("LA-02 writes one balanced immutable journal and rejects replay drift", () => {
  const ledger = new SqliteLedger(":memory:");
  const fixture = sourceAndEvent(ledger);
  ledger.db.exec("BEGIN IMMEDIATE");
  ledger.writeBalancedJournals(balancedPostings(fixture), [fixture.event]);
  ledger.db.exec("COMMIT");
  assert.equal(ledger.loadState().financial.financial_postings.length, 2);
  assert.equal(ledger.db.prepare("SELECT COUNT(*) AS count FROM journal_headers").get().count, 1);

  ledger.db.exec("BEGIN IMMEDIATE");
  assert.throws(
    () => ledger.writeBalancedJournals(
      balancedPostings(fixture).map((posting) => posting.id === "pst_la02_debit" ? { ...posting, account: "asset.other" } : posting),
      [fixture.event],
    ),
    (error) => error.code === "journal_content_conflict",
  );
  ledger.db.exec("ROLLBACK");
  ledger.close();
});

test("LA-02 rejects unbalanced, unsafe, and orphan postings", () => {
  const ledger = new SqliteLedger(":memory:");
  const fixture = sourceAndEvent(ledger);
  const unbalanced = balancedPostings(fixture).map((posting) => posting.direction === "credit" ? { ...posting, amount_value: 99 } : posting);
  ledger.db.exec("BEGIN IMMEDIATE");
  assert.throws(
    () => ledger.writeBalancedJournals(unbalanced, [fixture.event]),
    (error) => error.code === "journal_unbalanced",
  );
  ledger.db.exec("ROLLBACK");

  ledger.db.exec("BEGIN IMMEDIATE");
  ledger.writeBalancedJournals(balancedPostings(fixture), [fixture.event]);
  ledger.db.exec("COMMIT");
  const journalId = ledger.db.prepare("SELECT journal_id FROM financial_postings LIMIT 1").get().journal_id;
  assert.throws(
    () => ledger.db.prepare(`
      INSERT INTO financial_postings(
        id, event_id, event_type, transaction_id, budget_id, source_id,
        direction, account, amount_value, currency, created_at, journal_id
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run("pst_la02_real", fixture.event.id, fixture.event.type, fixture.source_id, "debit", "asset.cash", 1.5, "CNY", fixture.created_at, journalId),
    /financial_posting_requires_valid_posted_journal/,
  );
  assert.throws(
    () => ledger.db.prepare("DELETE FROM financial_postings WHERE id=?").run("pst_la02_debit"),
    /financial_posting_is_immutable/,
  );
  assert.throws(
    () => ledger.db.prepare("UPDATE journal_headers SET source_id=? WHERE event_id=?").run("src_other", fixture.event.id),
    /posted_journal_is_immutable/,
  );
  ledger.close();
});

test("LA-02 rejects unsafe amount inputs before they reach the journal", async () => {
  const ledger = new SqliteLedger(":memory:");
  const future = new Date(Date.now() + 60_000).toISOString();
  const sandbox = new Bu2Sandbox({ ledger });
  await assert.rejects(
    sandbox.createQuote({
      seller_agent_id: "agt_la02",
      payee_account_id: "acct_la02",
      item: { name: "Unsafe", delivery_type: "data" },
      amount: { value: Number.MAX_SAFE_INTEGER + 1, currency: "CNY" },
      expires_at: future,
    }, "la02-unsafe-amount"),
    (error) => error.code === "invalid_amount",
  );
  ledger.close();
});
