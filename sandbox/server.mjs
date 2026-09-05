import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import {
  Observability,
  classifyOperationalError,
  createTraceId,
  isTraceId,
} from "./observability.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { WebhookDispatcher } from "./webhooks.mjs";
import { X402PaymentAdapter } from "./x402-adapter.mjs";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import {
  paginateTransactions,
  validateBody,
  validateIdempotencyKey,
  validateNoQueryParameters,
  validateResourceId,
} from "./api-contract.mjs";

const requestId = () => `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const MAX_JSON_BODY_BYTES = 1_048_576;

async function readJson(request) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "validation_error",
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new ApiError(
        413,
        "validation_error",
        "request_body_too_large",
        "Request body must not exceed 1 MiB.",
      );
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "validation_error", "invalid_json", "Request body must be valid JSON.");
  }
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body, null, 2));
}

function errorBody(error, id, traceId) {
  const known = error instanceof ApiError;
  return {
    status: known ? error.status : 500,
    body: {
      error: {
        type: known ? error.type : "internal_error",
        code: known ? error.code : "unexpected_error",
        message: known ? error.message : "Unexpected sandbox error.",
        request_id: id,
        trace_id: traceId,
        details: known ? error.details : {},
      },
    },
  };
}

export function buildPaymentAdapter({
  ledger,
  observer,
  mode = "simulated",
  resourceUrl,
  buyerPrivateKey,
  paidFetch = null,
  recoveryQuery = null,
} = {}) {
  if (mode === "simulated") return new SimulatedPaymentAdapter({ ledger, observer });
  if (mode !== "x402") {
    throw new ApiError(400, "validation_error", "adapter_mode_invalid", `Unknown adapter: ${mode}`);
  }
  const activePaidFetch =
    paidFetch ??
    (buyerPrivateKey
      ? wrapFetchWithPaymentFromConfig(fetch, {
          schemes: [
            {
              network: "eip155:84532",
              client: new ExactEvmScheme(privateKeyToAccount(buyerPrivateKey)),
            },
          ],
        })
      : null);
  return new X402PaymentAdapter({
    ledger,
    observer,
    resourceUrl: resourceUrl ?? "http://127.0.0.1:4021/premium-data",
    paidFetch: activePaidFetch,
    recoveryQuery,
  });
}

export function createBu2Server({
  sandbox,
  ledger,
  dispatcher,
  adapter,
  initialWallet,
  observer = new Observability(),
} = {}) {
  const activeLedger = ledger ?? sandbox?.ledger ?? new SqliteLedger(":memory:");
  activeLedger.observer = observer;
  const activeAdapter =
    adapter ??
    sandbox?.adapter ??
    new SimulatedPaymentAdapter({ ledger: activeLedger, observer });
  activeAdapter.observer = observer;
  const activeSandbox =
    sandbox ??
    new Bu2Sandbox({
      ledger: activeLedger,
      adapter: activeAdapter,
      initialWallet,
      observer,
    });
  activeSandbox.observer = observer;
  if (activeSandbox.adapter) activeSandbox.adapter.observer = observer;
  const activeDispatcher =
    dispatcher ?? new WebhookDispatcher({ ledger: activeLedger, observer });
  activeDispatcher.observer = observer;
  const server = createServer(async (request, response) => {
    const id = requestId();
    const requestedTraceId = request.headers["x-trace-id"];
    const traceId = isTraceId(requestedTraceId) ? requestedTraceId : createTraceId();
    response.setHeader("x-request-id", id);
    response.setHeader("x-trace-id", traceId);
    response.setHeader(
      "access-control-expose-headers",
      "x-request-id, x-trace-id",
    );
    const url = new URL(request.url, "http://127.0.0.1");
    const segments = url.pathname.split("/").filter(Boolean);
    const key = request.headers["idempotency-key"];
    return observer.run({ request_id: id, trace_id: traceId }, async () => {
      const startedAt = Date.now();
      observer.record("request", "http.request.started", {
        method: request.method,
        path: url.pathname,
      });
      try {
      if (requestedTraceId !== undefined && !isTraceId(requestedTraceId)) {
        throw new ApiError(
          400,
          "validation_error",
          "invalid_trace_id",
          "X-Trace-Id must use the trc_ prefix and contain 8 to 251 identifier characters.",
        );
      }
      if (url.pathname.startsWith("/v1/") && url.pathname !== "/v1/transactions") {
        validateNoQueryParameters(url.searchParams);
      }
      if (request.method === "OPTIONS") return send(response, 204, {});
      if (request.method === "GET" && url.pathname === "/health") {
        const snapshot = activeLedger.healthSnapshot();
        return send(response, 200, {
          status: "ok",
          operational_status:
            snapshot.webhook_outbox.dead_letter > 0 ||
            snapshot.adapter_operations.unknown_results > 0
              ? "attention_required"
              : "healthy",
          service: "bu2-reference-server",
          version: "0.8.0",
          persistence: activeLedger.path,
          adapter: activeSandbox.adapter?.name ?? "none",
          ledger_events: activeLedger.listLedgerEvents().length,
          ...snapshot,
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/events") {
        return send(response, 200, { data: activeLedger.listLedgerEvents() });
      }
      if (request.method === "GET" && url.pathname === "/v1/ledger") {
        return send(response, 200, { data: activeLedger.listLedgerEvents() });
      }
      if (request.method === "GET" && url.pathname === "/v1/transactions") {
        return send(
          response,
          200,
          paginateTransactions(activeSandbox.listTransactions(), url.searchParams),
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/webhook_outbox") {
        return send(response, 200, { data: activeLedger.outboxRows() });
      }
      if (request.method === "GET" && url.pathname === "/v1/webhook_dead_letters") {
        return send(response, 200, { data: activeLedger.deadLetterRows() });
      }
      if (request.method === "POST" && url.pathname === "/v1/webhook_subscriptions") {
        const body = validateBody("webhookSubscription", await readJson(request));
        return send(
          response,
          201,
          activeLedger.addWebhookSubscription(body, validateIdempotencyKey(key)),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/webhooks/dispatch") {
        return send(response, 200, { data: await activeDispatcher.flush({ force: true }) });
      }
      if (request.method === "POST" && url.pathname === "/v1/quotes") {
        const body = validateBody("createQuote", await readJson(request));
        return send(response, 201, activeSandbox.createQuote(body, validateIdempotencyKey(key)));
      }
      if (request.method === "POST" && url.pathname === "/v1/payment_intents") {
        const body = validateBody("createPaymentIntent", await readJson(request));
        return send(
          response,
          201,
          await activeSandbox.createPaymentIntent(body, validateIdempotencyKey(key)),
        );
      }
      if (segments[0] === "v1" && segments[1] === "webhook_subscriptions" && segments[2]) {
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "secret_rotations"
        ) {
          const subscriptionId = validateResourceId(
            segments[2],
            "whsub",
            "subscription_id",
          );
          const body = validateBody("webhookSecretRotation", await readJson(request));
          return send(
            response,
            201,
            activeLedger.rotateWebhookSecret(
              subscriptionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "webhook_outbox" && segments[2]) {
        const outboxId = validateResourceId(segments[2], "out", "outbox_id");
        if (
          request.method === "GET" &&
          segments.length === 4 &&
          segments[3] === "attempts"
        ) {
          return send(response, 200, {
            data: activeLedger.webhookDeliveryAttempts(outboxId),
          });
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "replays"
        ) {
          const body = validateBody("webhookReplay", await readJson(request));
          return send(
            response,
            201,
            activeLedger.replayWebhook(
              outboxId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "payment_intents" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const paymentIntentId = validateResourceId(
            segments[2],
            "pi",
            "payment_intent_id",
          );
          return send(response, 200, activeSandbox.getPaymentIntent(paymentIntentId));
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "authorization"
        ) {
          const paymentIntentId = validateResourceId(
            segments[2],
            "pi",
            "payment_intent_id",
          );
          const body = validateBody("authorizationDecision", await readJson(request));
          return send(
            response,
            200,
            await activeSandbox.decideAuthorization(
              paymentIntentId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "transactions" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          return send(response, 200, activeSandbox.getTransaction(transactionId));
        }
        if (request.method === "POST" && segments.length === 4 && segments[3] === "deliveries") {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const body = validateBody("deliveryEvidence", await readJson(request));
          return send(
            response,
            201,
            activeSandbox.submitDelivery(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "settlements"
        ) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const body = validateBody("settlement", await readJson(request));
          return send(
            response,
            201,
            await activeSandbox.settle(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "settlement_recoveries"
        ) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const body = validateBody("settlementRecovery", await readJson(request));
          return send(
            response,
            200,
            await activeSandbox.recoverSettlement(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (
        request.method === "GET" &&
        segments[0] === "v1" &&
        segments[1] === "receipts" &&
        segments[2]
      ) {
        const receiptId = validateResourceId(segments[2], "rcpt", "receipt_id");
        if (segments.length === 4 && segments[3] === "verify")
          return send(response, 200, activeSandbox.verifyReceipt(receiptId));
        if (segments.length === 3)
          return send(response, 200, activeSandbox.getReceipt(receiptId));
      }
      throw new ApiError(404, "resource_not_found", "route_not_found", "Route was not found.");
      } catch (error) {
        observer.record(
          classifyOperationalError(error),
          "http.request.failed",
          {
            method: request.method,
            path: url.pathname,
            error_type: error.type ?? "internal_error",
            error_code: error.code ?? "unexpected_error",
            status: error.status ?? 500,
          },
        );
        const result = errorBody(error, id, traceId);
        send(response, result.status, result.body);
      } finally {
        observer.record("request", "http.request.completed", {
          method: request.method,
          path: url.pathname,
          status: response.statusCode,
          duration_ms: Date.now() - startedAt,
        });
      }
    });
  });
  return {
    server,
    sandbox: activeSandbox,
    ledger: activeLedger,
    dispatcher: activeDispatcher,
    observer,
  };
}

export async function listen({
  port = Number(process.env.BU2_SANDBOX_PORT ?? 3100),
  host = "127.0.0.1",
  dbPath = process.env.BU2_SANDBOX_DB ??
    fileURLToPath(new URL("./data/bu2-sandbox.sqlite", import.meta.url)),
  ledger,
  dispatcher,
  observer,
  logSink = null,
  adapterMode = process.env.BU2_PAYMENT_ADAPTER ?? "simulated",
  x402ResourceUrl = process.env.X402_RESOURCE_URL,
  x402BuyerPrivateKey = process.env.X402_BUYER_PRIVATE_KEY,
  x402PaidFetch = null,
  x402RecoveryQuery = null,
} = {}) {
  const activeObserver = observer ?? new Observability({ sink: logSink });
  const activeLedger = ledger ?? new SqliteLedger(dbPath, { observer: activeObserver });
  activeLedger.observer = activeObserver;
  const adapter = buildPaymentAdapter({
    ledger: activeLedger,
    observer: activeObserver,
    mode: adapterMode,
    resourceUrl: x402ResourceUrl,
    buyerPrivateKey: x402BuyerPrivateKey,
    paidFetch: x402PaidFetch,
    recoveryQuery: x402RecoveryQuery,
  });
  const initialWallet =
    adapterMode === "x402"
      ? { id: "wal_x402_buyer", available: 10_000, reserved: 0, currency: "USD" }
      : undefined;
  const instance = createBu2Server({
    ledger: activeLedger,
    dispatcher,
    adapter,
    initialWallet,
    observer: activeObserver,
  });
  await new Promise((resolve, reject) => {
    instance.server.once("error", reject);
    instance.server.listen(port, host, resolve);
  });
  const address = instance.server.address();
  return { ...instance, url: `http://${host}:${address.port}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await listen({ logSink: (line) => console.log(line) });
  console.log(`BU2 Reference Server v0.8 listening on ${running.url}`);
}
