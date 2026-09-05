import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

const quoteInput = (suffix, value = 80) => ({
  seller_agent_id: `agt_seller_${suffix}`,
  payee_account_id: `acct_payee_${suffix}`,
  item: { name: `Atomic dataset ${suffix}`, delivery_type: "dataset_access" },
  amount: { value, currency: "CNY" },
  expires_at: "2099-09-06T12:00:00Z",
});

const intentInput = (quote, suffix) => ({
  quote_id: quote.id,
  payer_account_id: "acct_atomic_buyer",
  buyer_agent_id: `agt_buyer_${suffix}`,
  payment_mandate_id: `mdt_atomic_${suffix}`,
  amount: structuredClone(quote.amount),
  purpose: `Atomicity test ${suffix}`,
});

function stack({ ledger = new SqliteLedger(":memory:"), wallet } = {}) {
  const adapter = new SimulatedPaymentAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter, initialWallet: wallet });
  return { ledger, adapter, sandbox };
}

test("same-key concurrent mutations share one business result", async (context) => {
  const { ledger, sandbox } = stack();
  context.after(() => ledger.close());
  const input = quoteInput("same-key");
  const [first, second] = await Promise.all([
    sandbox.createQuote(input, "atomic-same-key"),
    sandbox.createQuote(input, "atomic-same-key"),
  ]);

  assert.deepEqual(second, first);
  assert.equal(sandbox.quotes.size, 1);
  assert.equal(ledger.listLedgerEvents().length, 1);
  assert.equal(
    ledger.db
      .prepare("SELECT COUNT(*) AS count FROM idempotency_claims WHERE status='succeeded'")
      .get().count,
    1,
  );
});

test("same in-flight key with a different payload fails closed", async (context) => {
  const { ledger, sandbox } = stack();
  context.after(() => ledger.close());
  const first = sandbox.createQuote(quoteInput("original"), "atomic-conflict-key");
  await assert.rejects(
    sandbox.createQuote(quoteInput("changed"), "atomic-conflict-key"),
    (error) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === "idempotency_key_reused",
  );
  await first;
  assert.equal(sandbox.quotes.size, 1);
});

test("concurrent authorizations cannot reserve more than the wallet balance", async (context) => {
  const { ledger, sandbox } = stack({
    wallet: { id: "wal_atomic", available: 100, reserved: 0, currency: "CNY" },
  });
  context.after(() => ledger.close());
  const quoteA = await sandbox.createQuote(quoteInput("a"), "atomic-quote-a");
  const quoteB = await sandbox.createQuote(quoteInput("b"), "atomic-quote-b");
  const intentA = await sandbox.createPaymentIntent(
    intentInput(quoteA, "a"),
    "atomic-intent-a",
  );
  const intentB = await sandbox.createPaymentIntent(
    intentInput(quoteB, "b"),
    "atomic-intent-b",
  );

  const results = await Promise.allSettled([
    sandbox.decideAuthorization(
      intentA.id,
      { decision: "authorize" },
      "atomic-authorize-a",
    ),
    sandbox.decideAuthorization(
      intentB.id,
      { decision: "authorize" },
      "atomic-authorize-b",
    ),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, "wallet_balance_too_low");
  assert.deepEqual(sandbox.wallet, {
    id: "wal_atomic",
    available: 20,
    reserved: 80,
    currency: "CNY",
  });
  assert.equal(sandbox.transactions.size, 1);
  assert.equal(
    ledger.db.prepare("SELECT MIN(available) AS available FROM wallet_accounts").get()
      .available,
    20,
  );
});

test("failure injection rolls back state, event, outbox, and idempotency terminal", async (context) => {
  let injected = false;
  const ledger = new SqliteLedger(":memory:", {
    failureInjector(stage) {
      if (!injected && stage === "after_outbox_write") {
        injected = true;
        throw new Error("injected_atomic_commit_failure");
      }
    },
  });
  context.after(() => ledger.close());
  ledger.addWebhookSubscription(
    {
      id: "wh_atomic",
      url: "https://receiver.invalid/events",
      secret: "atomic-test-secret",
    },
    "atomic-subscription-key",
  );
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter: new SimulatedPaymentAdapter({ ledger }),
  });

  await assert.rejects(
    sandbox.createQuote(quoteInput("rollback"), "atomic-rollback-key"),
    /injected_atomic_commit_failure/,
  );

  const restored = ledger.loadState();
  assert.deepEqual(restored.resources, {});
  assert.equal(restored.events.length, 0);
  assert.equal(ledger.outboxRows().length, 0);
  assert.equal(restored.idempotency.length, 0);
  assert.equal(restored.state.state_revision, 0);
});

test("restart leaves a processing claim outcome unknown and never re-executes it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-atomicity-"));
  const path = join(directory, "sandbox.sqlite");
  const input = quoteInput("restart");
  const key = "atomic-restart-key";
  const scopeKey = `quotes:${key}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  try {
    const first = new SqliteLedger(path);
    first.claimIdempotency({
      scopeKey,
      fingerprint,
      ownerToken: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    first.close();

    const second = new SqliteLedger(path);
    const sandbox = new Bu2Sandbox({
      ledger: second,
      adapter: new SimulatedPaymentAdapter({ ledger: second }),
    });
    await assert.rejects(
      sandbox.createQuote(input, key),
      (error) =>
        error instanceof ApiError &&
        error.type === "outcome_unknown" &&
        error.code === "idempotency_outcome_unknown",
    );
    assert.equal(second.loadState().events.length, 0);
    assert.equal(sandbox.quotes.size, 0);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("successful mutation commits state, event, outbox, and idempotency together", async (context) => {
  const { ledger, sandbox } = stack();
  context.after(() => ledger.close());
  ledger.addWebhookSubscription(
    {
      id: "wh_atomic_success",
      url: "https://receiver.invalid/events",
      secret: "atomic-success-secret",
    },
    "atomic-success-subscription",
  );

  const quote = await sandbox.createQuote(
    quoteInput("success"),
    "atomic-success-quote",
  );
  const restored = ledger.loadState();
  assert.equal(restored.resources.quotes[0][0], quote.id);
  assert.equal(restored.events.length, 1);
  assert.equal(ledger.outboxRows().length, 1);
  assert.equal(restored.idempotency.length, 1);
  assert.equal(restored.state.state_revision, 1);
});

test("a stale writer cannot overwrite a newer committed snapshot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-state-cas-"));
  const path = join(directory, "sandbox.sqlite");
  try {
    const first = stack({ ledger: new SqliteLedger(path) });
    const second = stack({ ledger: new SqliteLedger(path) });
    const committed = await first.sandbox.createQuote(
      quoteInput("first-writer"),
      "atomic-first-writer",
    );

    await assert.rejects(
      second.sandbox.createQuote(
        quoteInput("stale-writer"),
        "atomic-stale-writer",
      ),
      (error) =>
        error instanceof ApiError &&
        error.type === "concurrency_conflict" &&
        error.code === "transaction_state_conflict",
    );
    assert.equal(second.sandbox.quotes.has(committed.id), true);
    assert.equal(second.ledger.loadState().resources.quotes.length, 1);

    const retried = await second.sandbox.createQuote(
      quoteInput("stale-writer"),
      "atomic-stale-writer",
    );
    assert.match(retried.id, /^quo_/);
    assert.equal(second.ledger.loadState().resources.quotes.length, 2);
    first.ledger.close();
    second.ledger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema v6 backfills legacy wallet and successful idempotency records", (context) => {
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const legacyWallet = {
    id: "wal_legacy",
    available: 90,
    reserved: 10,
    currency: "CNY",
  };
  ledger.db
    .prepare("INSERT INTO sandbox_state(key, data) VALUES ('wallet', ?)")
    .run(JSON.stringify(legacyWallet));
  ledger.db
    .prepare(
      `INSERT INTO idempotency_records(scope_key, fingerprint, result, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      "quotes:legacy-key",
      "legacy-fingerprint",
      JSON.stringify({ id: "quo_legacy" }),
      "2026-09-01T00:00:00.000Z",
    );

  ledger.migrateTransactionAtomicity();
  const restored = ledger.loadState();
  assert.deepEqual(restored.state.wallet, legacyWallet);
  assert.deepEqual(restored.idempotency, [
    [
      "quotes:legacy-key",
      {
        fingerprint: "legacy-fingerprint",
        result: { id: "quo_legacy" },
      },
    ],
  ]);
});
