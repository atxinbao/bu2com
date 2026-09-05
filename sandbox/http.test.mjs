import assert from "node:assert/strict";
import test from "node:test";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { Observability } from "./observability.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { listen } from "./server.mjs";
import { WebhookDispatcher } from "./webhooks.mjs";

async function request(
  base,
  path,
  { method = "GET", body, key, traceId } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
      ...(traceId ? { "x-trace-id": traceId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get("x-request-id"),
    traceId: response.headers.get("x-trace-id"),
  };
}

test("HTTP reference server completes one signed agent payment", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );

  const health = await request(running.url, "/health");
  assert.equal(health.status, 200);
  assert.match(health.requestId, /^req_/);
  assert.equal(health.body.api_contract_version, "0.1.3");
  assert.equal(health.body.api_base_path, "/v1");
  assert.deepEqual(health.body.mcp_contract_versions, ["0.1.0"]);
  assert.equal(health.body.environment, "simulation");

  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "http-quote-key",
    body: {
      seller_agent_id: "agt_market_data",
      payee_account_id: "acct_atlas_data",
      item: { name: "Dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: "2026-09-02T08:00:00Z",
    },
  });
  assert.equal(quote.status, 201);

  const intent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "http-intent-key",
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 3900, currency: "CNY" },
      purpose: "Dataset",
    },
  });
  assert.equal(intent.body.status, "requires_authorization");

  const authorization = await request(
    running.url,
    `/v1/payment_intents/${intent.body.id}/authorization`,
    {
      method: "POST",
      key: "http-auth-key",
      body: { decision: "authorize" },
    },
  );
  assert.equal(authorization.body.status, "funds_reserved");

  const earlySettlement = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/settlements`,
    {
      method: "POST",
      key: "http-early-settle",
      body: {},
    },
  );
  assert.equal(earlySettlement.status, 409);
  assert.equal(earlySettlement.body.error.code, "transaction_not_delivered");

  const delivery = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/deliveries`,
    {
      method: "POST",
      key: "http-delivery-key",
      body: { type: "dataset_access", evidence_hash: "sha256:httpdemo" },
    },
  );
  assert.equal(delivery.body.transaction.status, "delivery_submitted");

  const settlement = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}/settlements`,
    {
      method: "POST",
      key: "http-settle-key",
      body: {},
    },
  );
  assert.equal(settlement.body.transaction.status, "settled");

  const verification = await request(
    running.url,
    `/v1/receipts/${settlement.body.receipt.id}/verify`,
  );
  assert.equal(verification.body.valid, true);

  const transactionList = await request(running.url, "/v1/transactions");
  assert.equal(transactionList.status, 200);
  assert.equal(transactionList.body.data.length, 1);
  assert.deepEqual(transactionList.body.page, {
    limit: 20,
    has_more: false,
    next_cursor: null,
  });
  assert.equal(
    transactionList.body.data[0].transaction.id,
    authorization.body.transaction_id,
  );
  assert.equal(transactionList.body.data[0].receipt.valid, true);

  const transactionDetail = await request(
    running.url,
    `/v1/transactions/${authorization.body.transaction_id}`,
  );
  assert.equal(transactionDetail.status, 200);
  assert.equal(transactionDetail.body.quote.item.name, "Dataset");
  assert.equal(transactionDetail.body.delivery.evidence_hash, "sha256:httpdemo");
  assert.equal(transactionDetail.body.payment_channel, "bu2_simulated_provider");

  const secondQuote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "http-quote-key-2",
    body: {
      seller_agent_id: "agt_market_data",
      payee_account_id: "acct_atlas_data",
      item: { name: "Dataset 2", delivery_type: "dataset_access" },
      amount: { value: 100, currency: "CNY" },
      expires_at: "2026-09-12T08:00:00Z",
    },
  });
  const secondIntent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "http-intent-key-2",
    body: {
      quote_id: secondQuote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 100, currency: "CNY" },
      purpose: "Dataset 2",
    },
  });
  assert.equal(secondIntent.body.status, "funds_reserved");

  const firstPage = await request(running.url, "/v1/transactions?limit=1");
  assert.equal(firstPage.body.data.length, 1);
  assert.equal(firstPage.body.page.has_more, true);
  assert.ok(firstPage.body.page.next_cursor);
  const secondPage = await request(
    running.url,
    `/v1/transactions?limit=1&cursor=${encodeURIComponent(firstPage.body.page.next_cursor)}`,
  );
  assert.equal(secondPage.body.data.length, 1);
  assert.notEqual(
    firstPage.body.data[0].transaction.id,
    secondPage.body.data[0].transaction.id,
  );
  assert.equal(secondPage.body.page.has_more, false);

  const events = await request(running.url, "/v1/events");
  assert.ok(events.body.data.some((event) => event.type === "receipt.issued"));
});

test("HTTP v1 rejects schema drift and returns a stable request id", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );

  const invalidBody = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "invalid-body-key",
    body: {
      seller_agent_id: "agt_market_data",
      payee_account_id: "acct_atlas_data",
      item: { name: "Dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: "2026-09-12T08:00:00Z",
      unexpected: true,
    },
  });
  assert.equal(invalidBody.status, 400);
  assert.equal(invalidBody.body.error.code, "invalid_request_body");
  assert.equal(invalidBody.body.error.request_id, invalidBody.requestId);

  const invalidId = await request(running.url, "/v1/transactions/not-a-transaction");
  assert.equal(invalidId.status, 400);
  assert.equal(invalidId.body.error.code, "invalid_resource_id");
  assert.equal(invalidId.body.error.request_id, invalidId.requestId);

  const invalidIdentifierCharacters = await request(running.url, "/v1/transactions/txn_%20");
  assert.equal(invalidIdentifierCharacters.status, 400);
  assert.equal(invalidIdentifierCharacters.body.error.code, "invalid_resource_id");

  const invalidLimit = await request(running.url, "/v1/transactions?limit=0");
  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidLimit.body.error.code, "invalid_limit");

  const unknownQuery = await request(running.url, "/v1/transactions?offset=1");
  assert.equal(unknownQuery.status, 400);
  assert.equal(unknownQuery.body.error.code, "invalid_query_parameters");

  const unsupportedQuery = await request(running.url, "/v1/events?after=evt_1");
  assert.equal(unsupportedQuery.status, 400);
  assert.equal(unsupportedQuery.body.error.code, "invalid_query_parameters");

  const invalidCursor = await request(running.url, "/v1/transactions?cursor=not-opaque");
  assert.equal(invalidCursor.status, 400);
  assert.equal(invalidCursor.body.error.code, "invalid_cursor");

  const unsupportedResponse = await fetch(`${running.url}/v1/quotes`, {
    method: "POST",
    headers: { "idempotency-key": "unsupported-media-key" },
    body: "{}",
  });
  const unsupportedBody = await unsupportedResponse.json();
  assert.equal(unsupportedResponse.status, 415);
  assert.equal(unsupportedBody.error.code, "unsupported_media_type");
  assert.equal(unsupportedBody.error.request_id, unsupportedResponse.headers.get("x-request-id"));

  const oversizedResponse = await fetch(`${running.url}/v1/quotes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "oversized-body-key",
    },
    body: JSON.stringify({ payload: "x".repeat(1_048_576) }),
  });
  const oversizedBody = await oversizedResponse.json();
  assert.equal(oversizedResponse.status, 413);
  assert.equal(oversizedBody.error.code, "request_body_too_large");
  assert.equal(oversizedBody.error.request_id, oversizedResponse.headers.get("x-request-id"));
});

test("HTTP server exposes an explicit x402 adapter mode without a signer", async (context) => {
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    adapterMode: "x402",
    x402ResourceUrl: "http://127.0.0.1:4021/premium-data",
  });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );
  const health = await request(running.url, "/health");
  assert.equal(health.body.version, "0.8.0");
  assert.equal(health.body.adapter, "x402_exact_base_sepolia");
  assert.equal(health.body.environment, "testnet");
  assert.equal(running.sandbox.wallet.currency, "USD");
});

test("HTTP observability correlates transaction, adapter, outbox, and webhook delivery", async (context) => {
  const observer = new Observability();
  const ledger = new SqliteLedger(":memory:", { observer });
  const deliveredHeaders = [];
  const dispatcher = new WebhookDispatcher({
    ledger,
    observer,
    fetchImpl: async (_url, options) => {
      deliveredHeaders.push(options.headers);
      return { ok: true, status: 204 };
    },
  });
  const running = await listen({ port: 0, ledger, dispatcher, observer });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          ledger.close();
          resolve();
        }),
      ),
  );

  const secret = "observability-secret-value";
  await request(running.url, "/v1/webhook_subscriptions", {
    method: "POST",
    key: "observability-subscription-key",
    traceId: "trc_subscription01",
    body: {
      id: "whsub_observability",
      url: "https://receiver.invalid/events",
      secret,
    },
  });
  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "observability-quote-key",
    traceId: "trc_quote000001",
    body: quoteInputForWebhook(),
  });
  const intent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "observability-intent-key",
    traceId: "trc_intent00001",
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 100, currency: "CNY" },
      purpose: "Webhook event",
    },
  });
  const authorization = await request(
    running.url,
    `/v1/payment_intents/${intent.body.id}/authorization`,
    {
      method: "POST",
      key: "observability-auth-key",
      traceId: "trc_authorize001",
      body: { decision: "authorize" },
    },
  );
  assert.equal(authorization.traceId, "trc_authorize001");

  const transactionId = authorization.body.transaction_id;
  const reservedEvent = ledger
    .listLedgerEvents()
    .find((event) => event.type === "transaction.funds_reserved");
  assert.equal(reservedEvent.correlation.request_id, authorization.requestId);
  assert.equal(reservedEvent.correlation.trace_id, "trc_authorize001");
  assert.equal(reservedEvent.correlation.transaction_id, transactionId);
  assert.match(reservedEvent.correlation.provider_reference, /^sim_/);

  const operation = ledger
    .adapterOperations()
    .find((candidate) => candidate.transaction_id === transactionId);
  assert.equal(operation.request_id, authorization.requestId);
  assert.equal(operation.trace_id, "trc_authorize001");
  assert.equal(
    operation.provider_reference,
    reservedEvent.correlation.provider_reference,
  );

  const outbox = ledger
    .outboxRows()
    .find((candidate) => candidate.event_id === reservedEvent.id);
  assert.equal(outbox.request_id, authorization.requestId);
  assert.equal(outbox.trace_id, "trc_authorize001");
  assert.equal(outbox.transaction_id, transactionId);

  const dispatch = await request(running.url, "/v1/webhooks/dispatch", {
    method: "POST",
    traceId: "trc_dispatch0001",
  });
  assert.equal(dispatch.status, 200);
  assert.ok(
    dispatch.body.data.every((delivery) => delivery.status === "delivered"),
  );
  assert.ok(
    deliveredHeaders.some(
      (headers) => headers["webhook-trace-id"] === "trc_authorize001",
    ),
  );
  const attempt = ledger.webhookDeliveryAttempts(outbox.id)[0];
  assert.equal(attempt.request_id, dispatch.requestId);
  assert.equal(attempt.trace_id, "trc_dispatch0001");
  assert.equal(attempt.transaction_id, transactionId);

  const health = await request(running.url, "/health");
  assert.equal(health.body.operational_status, "healthy");
  assert.equal(health.body.webhook_outbox.pending, 0);
  assert.ok(health.body.webhook_outbox.delivered > 0);
  assert.ok(health.body.webhook_outbox.last_successful_delivery_at);
  assert.equal(health.body.adapter_operations.unknown_results, 0);

  const invalidTrace = await request(running.url, "/health", {
    traceId: "invalid-trace",
  });
  assert.equal(invalidTrace.status, 400);
  assert.equal(invalidTrace.body.error.code, "invalid_trace_id");
  assert.equal(invalidTrace.body.error.trace_id, invalidTrace.traceId);
  assert.deepEqual(
    new Set(observer.records.map((record) => record.category)),
    new Set(["request", "validation", "policy", "state", "adapter", "webhook"]),
  );
  assert.equal(JSON.stringify(observer.records).includes(secret), false);
});

test("HTTP v1 exposes idempotent Webhook dead-letter, replay, and secret rotation operations", async (context) => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter: new SimulatedPaymentAdapter({ ledger }),
  });
  const dispatcher = new WebhookDispatcher({
    ledger,
    maxAttempts: 1,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const running = await listen({ port: 0, ledger, dispatcher });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          ledger.close();
          resolve();
        }),
      ),
  );

  const subscriptionBody = {
    id: "whsub_http_reliability",
    url: "https://receiver.invalid/events",
    secret: "http-secret-value-0001",
  };
  const subscription = await request(running.url, "/v1/webhook_subscriptions", {
    method: "POST",
    key: "http-subscription-key",
    body: subscriptionBody,
  });
  assert.equal(subscription.status, 201);
  assert.equal(subscription.body.current_secret_version, "v1");
  assert.equal(JSON.stringify(subscription.body).includes(subscriptionBody.secret), false);
  const repeatedSubscription = await request(
    running.url,
    "/v1/webhook_subscriptions",
    {
      method: "POST",
      key: "http-subscription-key",
      body: subscriptionBody,
    },
  );
  assert.deepEqual(repeatedSubscription.body, subscription.body);
  const conflictingSubscription = await request(
    running.url,
    "/v1/webhook_subscriptions",
    {
      method: "POST",
      key: "http-subscription-key",
      body: { ...subscriptionBody, url: "https://other.invalid/events" },
    },
  );
  assert.equal(conflictingSubscription.status, 409);
  assert.equal(conflictingSubscription.body.error.code, "idempotency_key_reused");
  const duplicateSubscriptionId = await request(
    running.url,
    "/v1/webhook_subscriptions",
    {
      method: "POST",
      key: "http-subscription-new-key",
      body: subscriptionBody,
    },
  );
  assert.equal(duplicateSubscriptionId.status, 409);
  assert.equal(
    duplicateSubscriptionId.body.error.code,
    "webhook_subscription_exists",
  );

  const quote = sandbox.createQuote(quoteInputForWebhook(), "http-webhook-event-key");
  assert.match(quote.id, /^quo_/);
  const dispatched = await request(running.url, "/v1/webhooks/dispatch", {
    method: "POST",
  });
  assert.equal(dispatched.body.data[0].status, "dead_letter");

  const deadLetters = await request(running.url, "/v1/webhook_dead_letters");
  assert.equal(deadLetters.body.data.length, 1);
  const outboxId = deadLetters.body.data[0].id;
  const attempts = await request(
    running.url,
    `/v1/webhook_outbox/${outboxId}/attempts`,
  );
  assert.equal(attempts.body.data.length, 1);
  assert.equal(attempts.body.data[0].status, "dead_letter");

  const replayBody = {
    requested_by: "operator_http",
    reason: "Receiver recovered",
  };
  const replay = await request(
    running.url,
    `/v1/webhook_outbox/${outboxId}/replays`,
    { method: "POST", key: "http-replay-key", body: replayBody },
  );
  assert.equal(replay.status, 201);
  const repeatedReplay = await request(
    running.url,
    `/v1/webhook_outbox/${outboxId}/replays`,
    { method: "POST", key: "http-replay-key", body: replayBody },
  );
  assert.equal(repeatedReplay.body.id, replay.body.id);
  assert.equal(replay.body.event_id, deadLetters.body.data[0].event_id);

  const rotationBody = {
    version: "v2",
    secret: "http-secret-value-0002",
    overlap_seconds: 300,
  };
  const rotation = await request(
    running.url,
    "/v1/webhook_subscriptions/whsub_http_reliability/secret_rotations",
    { method: "POST", key: "http-rotation-key", body: rotationBody },
  );
  assert.equal(rotation.status, 201);
  assert.equal(rotation.body.previous_version, "v1");
  assert.equal(rotation.body.new_version, "v2");
  const repeatedRotation = await request(
    running.url,
    "/v1/webhook_subscriptions/whsub_http_reliability/secret_rotations",
    { method: "POST", key: "http-rotation-key", body: rotationBody },
  );
  assert.equal(repeatedRotation.body.id, rotation.body.id);
  const publicResponses = JSON.stringify({
    subscription: subscription.body,
    deadLetters: deadLetters.body,
    attempts: attempts.body,
    replay: replay.body,
    rotation: rotation.body,
  });
  assert.equal(publicResponses.includes(subscriptionBody.secret), false);
  assert.equal(publicResponses.includes(rotationBody.secret), false);
});

function quoteInputForWebhook() {
  return {
    seller_agent_id: "agt_market_data",
    payee_account_id: "acct_atlas_data",
    item: { name: "Webhook event", delivery_type: "dataset_access" },
    amount: { value: 100, currency: "CNY" },
    expires_at: "2026-09-12T08:00:00Z",
  };
}
