import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import test from "node:test";
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
  const quote = sandbox.createQuote(quoteInput, "persistent-quote-key");
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
  sandbox.submitDelivery(
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
    const eventCount = first.ledger.listLedgerEvents().length;
    assert.equal(eventCount, 7);
    first.ledger.close();

    const restored = stack(path);
    assert.equal(restored.sandbox.getPaymentIntent(payment.intent.id).status, "settled");
    assert.equal(restored.sandbox.verifyReceipt(payment.result.receipt.id).valid, true);
    assert.equal(restored.sandbox.wallet.available, 96_100);
    assert.equal(restored.sandbox.wallet.reserved, 0);
    assert.equal(restored.ledger.listLedgerEvents().length, eventCount);
    const replayedQuote = restored.sandbox.createQuote(quoteInput, "persistent-quote-key");
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
  });
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  sandbox.createQuote(quoteInput, "webhook-quote-key");
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
  });
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  sandbox.createQuote(quoteInput, "real-http-webhook");
  const dispatcher = new WebhookDispatcher({ ledger, baseDelayMs: 1 });
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "retrying");
  assert.equal((await dispatcher.flush({ force: true }))[0].status, "delivered");
  assert.equal(webhookIds.length, 2);
  assert.equal(webhookIds[0], webhookIds[1]);
  assert.equal(ledger.outboxRows()[0].status, "delivered");
});
