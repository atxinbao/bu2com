import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { WebhookDispatcher } from "./webhooks.mjs";

const quoteInput = {
  seller_agent_id: "agt_market_data",
  payee_account_id: "acct_atlas_data",
  item: { name: "Persistent dataset", delivery_type: "dataset_access" },
  amount: { value: 3900, currency: "CNY" },
  expires_at: "2026-09-02T08:00:00Z",
};

function stack(path) {
  const ledger = new SqliteLedger(path);
  const adapter = new SimulatedPaymentAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  return { ledger, adapter, sandbox };
}

async function completePayment(sandbox) {
  const quote = await sandbox.createQuote(quoteInput, "persistent-quote-key");
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 3900, currency: "CNY" },
      purpose: "Persistent payment",
    },
    "persistent-intent-key",
  );
  const reserved = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "persistent-auth-key",
  );
  await sandbox.submitDelivery(
    reserved.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:persistent" },
    "persistent-delivery-key",
  );
  return {
    quote,
    intent,
    result: await sandbox.settle(reserved.transaction_id, {}, "persistent-settle-key"),
  };
}

test("SQLite restart restores resources, wallet, idempotency, ledger, and receipt verification", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ledger-"));
  const path = join(directory, "sandbox.sqlite");
  try {
    const first = stack(path);
    const payment = await completePayment(first.sandbox);
    const originalKeyId = payment.result.receipt.verification_key_id;
    const eventCount = first.ledger.listLedgerEvents().length;
    assert.equal(eventCount, 7);
    first.ledger.close();

    const restored = stack(path);
    assert.notEqual(restored.sandbox.verificationKeyId, originalKeyId);
    assert.equal(
      restored.ledger.getReceiptVerificationKey(originalKeyId).status,
      "trusted",
    );
    assert.equal(restored.sandbox.getPaymentIntent(payment.intent.id).status, "settled");
    assert.equal(restored.sandbox.verifyReceipt(payment.result.receipt.id).valid, true);
    assert.equal(restored.sandbox.wallet.available, 96_100);
    assert.equal(restored.sandbox.wallet.reserved, 0);
    assert.equal(restored.ledger.listLedgerEvents().length, eventCount);
    const replayedQuote = await restored.sandbox.createQuote(
      quoteInput,
      "persistent-quote-key",
    );
    assert.equal(replayedQuote.id, payment.quote.id);
    assert.equal(restored.ledger.listLedgerEvents().length, eventCount);
    assert.equal(restored.ledger.adapterOperations().length, 2);
    restored.ledger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("webhook outbox retries failure and delivers each event once", async () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.addWebhookSubscription({
    id: "wh_test",
    url: "https://receiver.invalid/webhook",
    secret: "test-secret",
  }, "subscription-test-key");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "webhook-quote-key");
  let calls = 0;
  const receivedIds = [];
  const dispatcher = new WebhookDispatcher({
    ledger,
    baseDelayMs: 1,
    fetchImpl: async (_url, options) => {
      calls += 1;
      receivedIds.push(options.headers["webhook-id"]);
      return { ok: calls > 1, status: calls > 1 ? 200 : 503 };
    },
  });
  const first = await dispatcher.flush({ force: true });
  assert.equal(first[0].status, "retrying");
  assert.equal(ledger.outboxRows()[0].attempts, 1);
  const second = await dispatcher.flush({ force: true });
  assert.equal(second[0].status, "delivered");
  const row = ledger.outboxRows()[0];
  assert.equal(row.attempts, 2);
  assert.equal(row.status, "delivered");
  assert.equal(receivedIds[0], receivedIds[1]);
  const third = await dispatcher.flush({ force: true });
  assert.deepEqual(third, []);
  ledger.close();
});

test("simulated adapter independently prevents duplicate provider operations", () => {
  const ledger = new SqliteLedger(":memory:");
  const adapter = new SimulatedPaymentAdapter({ ledger });
  const first = adapter.reserve("txn_repeat", { value: 3900, currency: "CNY" });
  const replay = adapter.reserve("txn_repeat", { value: 3900, currency: "CNY" });
  assert.equal(replay.provider_reference, first.provider_reference);
  assert.equal(ledger.adapterOperations().length, 1);
  ledger.saveAdapterOperation({
    idempotency_key: "settle:txn_unknown",
    operation: "settle",
    transaction_id: "txn_unknown",
    provider_reference: "provider_unknown_reference",
    amount_value: 100,
    currency: "CNY",
    status: "provider_unknown",
    created_at: new Date().toISOString(),
  });
  assert.equal(ledger.healthSnapshot().adapter_operations.unknown_results, 1);
  ledger.close();
});

test("webhook outbox retries against a real HTTP receiver and preserves event id", async (context) => {
  let attempts = 0;
  const webhookIds = [];
  const receiver = createServer((request, response) => {
    attempts += 1;
    webhookIds.push(request.headers["webhook-id"]);
    request.resume();
    response.writeHead(attempts === 1 ? 503 : 204);
    response.end();
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => receiver.close(resolve)));
  const address = receiver.address();
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  ledger.addWebhookSubscription({
    id: "wh_http",
    url: `http://127.0.0.1:${address.port}/events`,
    secret: "real-http-secret",
  }, "subscription-http-key");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "real-http-webhook");
  const dispatcher = new WebhookDispatcher({ ledger, baseDelayMs: 1 });
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "retrying");
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "delivered");
  assert.equal(webhookIds.length, 2);
  assert.equal(webhookIds[0], webhookIds[1]);
  assert.equal(ledger.outboxRows()[0].status, "delivered");
});

test("webhook reaches dead letter after bounded attempts and records every attempt", async () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.addWebhookSubscription(
    {
      id: "wh_dead_letter",
      url: "https://receiver.invalid/events",
      secret: "dead-letter-secret",
    },
    "subscription-dead-letter",
  );
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "dead-letter-quote-key");
  const eventCount = ledger.listLedgerEvents().length;
  const dispatcher = new WebhookDispatcher({
    ledger,
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 15,
    jitterRatio: 0,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(dispatcher.retryDelay(0), 10);
  assert.equal(dispatcher.retryDelay(1), 15);
  assert.equal(dispatcher.retryDelay(99), 15);

  assert.equal((await dispatcher.flush({ force: true }))[0].status, "retrying");
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "retrying");
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "dead_letter");
  assert.deepEqual(await dispatcher.flush({ force: true }), []);

  const deadLetter = ledger.deadLetterRows()[0];
  assert.equal(deadLetter.status, "dead_letter");
  assert.equal(deadLetter.attempts, 3);
  assert.ok(deadLetter.dead_lettered_at);
  const attempts = ledger.webhookDeliveryAttempts(deadLetter.id);
  assert.deepEqual(
    attempts.map((attempt) => attempt.status),
    ["retrying", "retrying", "dead_letter"],
  );
  assert.deepEqual(attempts[0].secret_versions, ["v1"]);
  assert.equal(ledger.listLedgerEvents().length, eventCount);
  ledger.close();
});

test("receiver timeout follows the bounded dead-letter path", async () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.addWebhookSubscription(
    {
      id: "wh_timeout",
      url: "https://receiver.invalid/events",
      secret: "timeout-secret-value",
    },
    "subscription-timeout-key",
  );
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "timeout-webhook-key");
  const dispatcher = new WebhookDispatcher({
    ledger,
    maxAttempts: 1,
    fetchImpl: async () => {
      throw new DOMException("Receiver timed out", "TimeoutError");
    },
  });

  const result = await dispatcher.flush({ force: true });
  assert.equal(result[0].status, "dead_letter");
  assert.equal(result[0].error, "Receiver timed out");
  assert.equal(ledger.webhookDeliveryAttempts(result[0].id)[0].error, "Receiver timed out");
  ledger.close();
});

test("audited replay preserves event identity and is idempotent", async () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.addWebhookSubscription(
    {
      id: "wh_replay",
      url: "https://receiver.invalid/events",
      secret: "replay-secret-value",
    },
    "subscription-replay-key",
  );
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "replay-quote-key");
  const eventCount = ledger.listLedgerEvents().length;
  const failed = new WebhookDispatcher({
    ledger,
    maxAttempts: 1,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal((await failed.flush({ force: true }))[0].status, "dead_letter");
  const original = ledger.deadLetterRows()[0];
  const replayInput = { requested_by: "operator_test", reason: "Receiver recovered" };
  const firstReplay = ledger.replayWebhook(
    original.id,
    replayInput,
    "replay-request-key",
  );
  const repeatedReplay = ledger.replayWebhook(
    original.id,
    replayInput,
    "replay-request-key",
  );
  assert.equal(repeatedReplay.id, firstReplay.id);
  assert.throws(
    () =>
      ledger.replayWebhook(
        original.id,
        { ...replayInput, reason: "Changed reason" },
        "replay-request-key",
      ),
    (error) => error.code === "idempotency_key_reused",
  );

  const received = [];
  const recovered = new WebhookDispatcher({
    ledger,
    fetchImpl: async (_url, options) => {
      received.push(options.headers["webhook-id"]);
      return { ok: true, status: 204 };
    },
  });
  assert.equal((await recovered.flush({ force: true }))[0].status, "delivered");
  assert.deepEqual(received, [original.event_id]);
  assert.equal(ledger.webhookReplayRows(original.id).length, 1);
  assert.deepEqual(
    ledger.webhookDeliveryAttempts(original.id).map((attempt) => attempt.replay_cycle),
    [0, 1],
  );
  assert.equal(ledger.listLedgerEvents().length, eventCount);
  ledger.close();
});

test("concurrent dispatchers claim one delivery only once", async () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.addWebhookSubscription(
    {
      id: "wh_concurrent",
      url: "https://receiver.invalid/events",
      secret: "concurrent-secret",
    },
    "subscription-concurrent",
  );
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "concurrent-webhook-key");
  let deliveries = 0;
  const fetchImpl = async () => {
    deliveries += 1;
    await Promise.resolve();
    return { ok: true, status: 204 };
  };
  const first = new WebhookDispatcher({ ledger, fetchImpl, workerId: "whw_first" });
  const second = new WebhookDispatcher({ ledger, fetchImpl, workerId: "whw_second" });
  const results = await Promise.all([
    first.flush({ force: true }),
    second.flush({ force: true }),
  ]);
  assert.equal(deliveries, 1);
  assert.equal(results.flat().length, 1);
  assert.equal(ledger.outboxRows()[0].status, "delivered");
  ledger.close();
});

test("secret rotation signs with overlapping versions and expires the old version", async () => {
  const ledger = new SqliteLedger(":memory:");
  const initialSecret = "initial-secret-0001";
  const rotatedSecret = "rotated-secret-0002";
  ledger.addWebhookSubscription(
    {
      id: "wh_rotation",
      url: "https://receiver.invalid/events",
      secret: initialSecret,
      now: 1_000,
    },
    "subscription-rotation",
  );
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  await sandbox.createQuote(quoteInput, "rotation-first-event");
  const rotationInput = {
    version: "v2",
    secret: rotatedSecret,
    overlap_seconds: 10,
  };
  const rotation = ledger.rotateWebhookSecret(
    "wh_rotation",
    rotationInput,
    "rotation-request-key",
    2_000,
  );
  assert.equal(
    ledger.rotateWebhookSecret(
      "wh_rotation",
      rotationInput,
      "rotation-request-key",
      2_500,
    ).id,
    rotation.id,
  );
  assert.throws(
    () =>
      ledger.rotateWebhookSecret(
        "wh_rotation",
        { ...rotationInput, overlap_seconds: 11 },
        "rotation-request-key",
        2_500,
      ),
    (error) => error.code === "idempotency_key_reused",
  );

  const headers = [];
  const overlapping = new WebhookDispatcher({
    ledger,
    now: () => 5_000,
    fetchImpl: async (_url, options) => {
      headers.push(options.headers);
      return { ok: true, status: 204 };
    },
  });
  await overlapping.flush({ force: true });
  assert.equal(headers[0]["webhook-secret-versions"], "v2,v1");
  const firstPayload = ledger.outboxRows()[0].payload;
  const v2Signature = createHmac("sha256", rotatedSecret)
    .update(`5.${firstPayload}`)
    .digest("hex");
  const v1Signature = createHmac("sha256", initialSecret)
    .update(`5.${firstPayload}`)
    .digest("hex");
  assert.equal(headers[0]["webhook-signature"], `v2=${v2Signature},v1=${v1Signature}`);

  await sandbox.createQuote(
    { ...quoteInput, item: { ...quoteInput.item, name: "Post-rotation dataset" } },
    "rotation-second-event",
  );
  const afterOverlap = new WebhookDispatcher({
    ledger,
    now: () => 15_000,
    fetchImpl: async (_url, options) => {
      headers.push(options.headers);
      return { ok: true, status: 204 };
    },
  });
  await afterOverlap.flush({ force: true });
  assert.equal(headers[1]["webhook-secret-versions"], "v2");
  assert.match(headers[1]["webhook-signature"], /^v2=[a-f0-9]+$/);

  const publicState = JSON.stringify({
    subscription: ledger.getWebhookSubscription("wh_rotation"),
    outbox: ledger.outboxRows(),
    attempts: ledger.webhookDeliveryAttempts(ledger.outboxRows()[0].id),
  });
  assert.equal(publicState.includes(initialSecret), false);
  assert.equal(publicState.includes(rotatedSecret), false);
  ledger.close();
});

test("additive migration restores legacy secrets and expired delivery leases", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-webhook-migration-"));
  const path = join(directory, "legacy.sqlite");
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE webhook_subscriptions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE webhook_outbox (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        delivered_at TEXT,
        UNIQUE(event_id, subscription_id)
      );
      INSERT INTO webhook_subscriptions(id, url, secret, active, created_at)
      VALUES ('wh_legacy', 'https://receiver.invalid/events', 'legacy-secret-value', 1, '1970-01-01T00:00:01.000Z');
      INSERT INTO webhook_outbox(id, event_id, subscription_id, payload, status, next_attempt_at)
      VALUES ('out_evt_legacy_wh_legacy', 'evt_legacy', 'wh_legacy', '{"id":"evt_legacy"}', 'pending', 0);
    `);
    legacy.close();

    const first = new SqliteLedger(path);
    assert.deepEqual(
      first.schemaMigrations().map((migration) => migration.version),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    const migratedOutbox = first.outboxRows()[0];
    assert.equal(migratedOutbox.request_id, null);
    assert.equal(migratedOutbox.trace_id, null);
    assert.equal(migratedOutbox.transaction_id, null);
    const claimed = first.claimWebhookDeliveries({
      force: true,
      workerId: "whw_before_restart",
      leaseMs: 100,
      now: 1_000,
    });
    assert.equal(claimed[0].secrets[0].version, "v1");
    assert.equal(claimed[0].secrets[0].secret, "legacy-secret-value");
    first.close();

    const restored = new SqliteLedger(path);
    const reclaimed = restored.claimWebhookDeliveries({
      workerId: "whw_after_restart",
      leaseMs: 100,
      now: 1_101,
    });
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0].event_id, "evt_legacy");
    assert.equal(reclaimed[0].locked_by, "whw_after_restart");
    restored.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
