import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

function journalFixture(ledger, suffix, amount) {
  const createdAt = new Date().toISOString();
  const sourceId = `src_la06a_${suffix}`;
  const eventId = `evt_la06a_${suffix}`;
  ledger.db
    .prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", sourceId, "{}", createdAt);
  return {
    amount,
    event: {
      id: eventId,
      type: "journal.la06a",
      resource_id: sourceId,
      created_at: createdAt,
    },
    source_id: sourceId,
    created_at: createdAt,
  };
}

function balancedPostings(fixture) {
  return [
    {
      id: `pst_${fixture.event.id}_debit`,
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      transaction_id: null,
      budget_id: null,
      source_id: fixture.source_id,
      direction: "debit",
      account: "asset.cash",
      amount_value: fixture.amount,
      currency: "CNY",
      created_at: fixture.created_at,
    },
    {
      id: `pst_${fixture.event.id}_credit`,
      event_id: fixture.event.id,
      event_type: fixture.event.type,
      transaction_id: null,
      budget_id: null,
      source_id: fixture.source_id,
      direction: "credit",
      account: "liability.receivable",
      amount_value: fixture.amount,
      currency: "CNY",
      created_at: fixture.created_at,
    },
  ];
}

test("LA-06a keeps journal balance invariant across a deterministic amount matrix", () => {
  const ledger = new SqliteLedger(":memory:");
  for (const [index, amount] of [1, 2, 100, 10_000].entries()) {
    const fixture = journalFixture(ledger, index, amount);
    ledger.db.exec("BEGIN IMMEDIATE");
    ledger.writeBalancedJournals(balancedPostings(fixture), [fixture.event]);
    ledger.db.exec("COMMIT");
  }
  const rows = ledger.db
    .prepare(
      `SELECT journal_id,
        SUM(CASE WHEN direction = 'debit' THEN amount_value ELSE 0 END) AS debits,
        SUM(CASE WHEN direction = 'credit' THEN amount_value ELSE 0 END) AS credits
       FROM financial_postings GROUP BY journal_id ORDER BY journal_id`,
    )
    .all();
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.debits, row.credits);
  ledger.close();
});

test("LA-06a rejects cross-tenant credential and binding claims before persistence", () => {
  assert.throws(
    () =>
      normalizeOnboardingDocument(
        {
          environment: "sandbox",
          requested_by: "usr_la06a_operator",
          idempotency_key: "la06a-cross-tenant-claims",
          tenants: [
            {
              tenant_id: "ten_la06a_one",
              principal: { id: "usr_la06a_one", kind: "human" },
              accounts: [{ id: "acct_la06a_one" }],
              agents: [{ id: "agt_la06a_one" }],
              credentials: [
                {
                  id: "key_la06a_one",
                  principal_id: "agt_la06a_one",
                  role: "agent",
                  token_sha256: "a".repeat(64),
                  account_ids: ["acct_la06a_other"],
                  agent_ids: ["agt_la06a_one"],
                },
              ],
              funding_sources: [],
              receiving_targets: [],
            },
          ],
        },
        "sandbox",
      ),
    (error) => error.code === "identity_credential_claim_unknown",
  );
});
