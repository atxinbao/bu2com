import assert from "node:assert/strict";
import test from "node:test";
import { listen } from "../../../sandbox/server.mjs";
import {
  Bu2ApiError,
  Bu2Client,
  Bu2ConfigurationError,
  Bu2EnvironmentError,
  Bu2TransportError,
} from "../dist/index.js";

function environmentResponse(environment = "sandbox", executionStatus = "execution_enabled") {
  const sandbox = environment === "sandbox";
  return Response.json({
    service: "bu2-reference-server",
    environment,
    environment_contract_version: "1.0",
    chain_id: sandbox ? 84532 : null,
    network: sandbox ? "eip155:84532" : null,
    execution_backend: sandbox ? "x402" : "simulated",
    api_contract_version: "0.2.0",
    mcp_contract_versions: ["0.2.0"],
    receipt_schema_versions: ["0.2", "0.3"],
    execution_status: executionStatus,
    public_capabilities: ["transactions:read", "receipts:verify"],
    receipt_issuer: {
      issuer_id: `bu2-reference-server:${environment}`,
      environment,
      verification_key_id: "key_sdk_test",
      signature_algorithm: "Ed25519",
      public_key: "sdk-test-public-key",
    },
  });
}

const quoteInput = (name = "SDK dataset") => ({
  seller_agent_id: "agt_sdk_seller",
  payee_account_id: "acct_sdk_seller",
  item: { name, delivery_type: "dataset_access" },
  amount: { value: 3900, currency: "CNY" },
  expires_at: "2026-09-12T08:00:00Z",
});

async function sdkServer(context) {
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
  return {
    running,
    client: new Bu2Client({
      baseUrl: `${running.url}/v1`,
      environment: "local",
      localDevelopment: true,
    }),
  };
}

test("SDK configuration requires an explicit Phase 0 environment and /v1 base URL", () => {
  assert.throws(
    () =>
      new Bu2Client({
        baseUrl: "not-a-url",
        environment: "local",
        localDevelopment: true,
      }),
    Bu2ConfigurationError,
  );
  assert.throws(
    () =>
      new Bu2Client({
        baseUrl: "http://127.0.0.1:3100",
        environment: "local",
        localDevelopment: true,
      }),
    /end in \/v1/,
  );
  assert.throws(
    () =>
      new Bu2Client({
        baseUrl: "http://127.0.0.1:3100/v1",
        environment: "simulation",
      }),
    /local, sandbox, or live/,
  );
  assert.throws(
    () => new Bu2Client({ baseUrl: "http://127.0.0.1:3100/v1", environment: "local" }),
    /localDevelopment/,
  );
});

test("typed SDK completes one local simulated transaction and verifies Receipt v0.3", async (context) => {
  const { client } = await sdkServer(context);
  const quote = await client.createQuote(quoteInput(), { idempotencyKey: "sdk-quote-full" });
  const intent = await client.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_sdk_buyer",
      buyer_agent_id: "agt_sdk_buyer",
      payment_mandate_id: "mdt_sdk_buyer",
      amount: quote.amount,
      purpose: "SDK end-to-end verification",
      external_context: { type: "agent_run", id: "run_sdk_full" },
    },
    { idempotencyKey: "sdk-intent-full", traceId: "trc_sdk_full_flow" },
  );
  assert.equal(intent.status, "requires_authorization");
  assert.equal((await client.getPaymentIntent(intent.id)).id, intent.id);

  const authorized = await client.decideAuthorization(
    intent.id,
    { decision: "authorize", reason: "SDK test owner approval" },
    { idempotencyKey: "sdk-authorize-full" },
  );
  assert.equal(authorized.status, "funds_reserved");
  assert.ok(authorized.transaction_id);

  const delivery = await client.submitDelivery(
    authorized.transaction_id,
    {
      type: "dataset_access",
      evidence_hash: "sha256:sdkfullflow",
      summary: "SDK test delivery",
    },
    { idempotencyKey: "sdk-delivery-full" },
  );
  assert.equal(delivery.transaction.status, "delivery_submitted");

  const settlement = await client.settleTransaction(authorized.transaction_id, {
    idempotencyKey: "sdk-settlement-full",
  });
  assert.equal(settlement.transaction.status, "settled");

  const receipt = await client.getReceipt(settlement.receipt.id);
  const verification = await client.verifyReceipt(receipt.id);
  const detail = await client.getTransaction(authorized.transaction_id);
  const transactions = await client.listTransactions({ limit: 1 });

  assert.equal(verification.valid, true);
  assert.equal(detail.receipt?.id, receipt.id);
  assert.equal(transactions.data[0]?.transaction.id, authorized.transaction_id);
  assert.equal(receipt.schema_version, "0.3");
  assert.equal(receipt.environment, "local");
  assert.equal(verification.environment_valid, true);
  assert.equal(client.environment, "local");
});

test("SDK preserves stable API errors, correlation ids, and recovery action", async (context) => {
  const { client } = await sdkServer(context);
  const original = await client.createQuote(quoteInput("Original"), {
    idempotencyKey: "sdk-conflict-key",
  });
  const replay = await client.createQuote(quoteInput("Original"), {
    idempotencyKey: "sdk-conflict-key",
  });
  assert.equal(replay.id, original.id);

  await assert.rejects(
    client.createQuote(quoteInput("Conflicting"), { idempotencyKey: "sdk-conflict-key" }),
    (error) => {
      assert.ok(error instanceof Bu2ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.type, "idempotency_conflict");
      assert.equal(error.code, "idempotency_key_reused");
      assert.equal(error.recovery, "query_before_retry");
      assert.match(error.requestId, /^req_/);
      assert.match(error.traceId, /^trc_/);
      return true;
    },
  );

  await assert.rejects(client.createQuote(quoteInput("Missing key"), undefined), (error) => {
    assert.ok(error instanceof Bu2ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "missing_idempotency_key");
    assert.equal(error.recovery, "fix_request");
    return true;
  });

  await assert.rejects(
    client.createQuote(
      { ...quoteInput("Invalid amount"), amount: { value: 3.5, currency: "CNY" } },
      { idempotencyKey: "sdk-invalid-amount" },
    ),
    (error) => {
      assert.ok(error instanceof Bu2ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "invalid_request_body");
      assert.equal(error.recovery, "fix_request");
      return true;
    },
  );
});

test("settlement recovery maps to the frozen endpoint with an explicit idempotency key", async () => {
  let requestSeen;
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    fetch: async (request) => {
      if (request.url.endsWith("/environment")) {
        return environmentResponse("sandbox", "execution_disabled");
      }
      requestSeen = request;
      return new Response(
        JSON.stringify({
          transaction: {
            id: "txn_sdk_recovery",
            payment_intent_id: "pi_sdk_recovery",
            status: "delivery_submitted",
            authorized_amount: { value: 100, currency: "USD" },
            reserved_amount: { value: 100, currency: "USD" },
            settled_amount: { value: 0, currency: "USD" },
            refunded_amount: { value: 0, currency: "USD" },
          },
          receipt: null,
          recovery: {
            status: "provider_unknown",
            reason_code: "x402_recovery_unavailable",
            attempt_id: "arv_sdk_recovery",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.recoverTransactionSettlement("txn_sdk_recovery", {
    idempotencyKey: "sdk-recovery-query",
  });

  assert.equal(result.recovery.status, "provider_unknown");
  assert.equal(requestSeen.method, "POST");
  assert.equal(
    requestSeen.url,
    "http://127.0.0.1:3999/v1/transactions/txn_sdk_recovery/settlement_recoveries",
  );
  assert.equal(requestSeen.headers.get("idempotency-key"), "sdk-recovery-query");
});

test("read transport failures are retry-safe and never retried automatically", async () => {
  let calls = 0;
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "local",
    localDevelopment: true,
    fetch: async () => {
      calls += 1;
      throw new TypeError("offline");
    },
  });

  await assert.rejects(client.listTransactions(), (error) => {
    assert.ok(error instanceof Bu2TransportError);
    assert.equal(error.code, "network_error");
    assert.equal(error.recovery, "retry_safe");
    assert.equal(error.operation, "listTransactions");
    return true;
  });
  assert.equal(calls, 1);
});

test("write transport failures require querying state before retry", async () => {
  let calls = 0;
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    fetch: async (request) => {
      calls += 1;
      if (request.url.endsWith("/environment")) return environmentResponse();
      throw new TypeError("connection reset");
    },
  });

  await assert.rejects(
    client.createQuote(quoteInput(), {
      idempotencyKey: "sdk-write-network",
      traceId: "trc_sdk_network_write",
    }),
    (error) => {
      assert.ok(error instanceof Bu2TransportError);
      assert.equal(error.code, "network_error");
      assert.equal(error.recovery, "query_before_retry");
      assert.equal(error.traceId, "trc_sdk_network_write");
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("write timeout is classified as unknown outcome without an automatic replay", async () => {
  let calls = 0;
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    defaultTimeoutMs: 5,
    fetch: async (request) => {
      calls += 1;
      if (request.url.endsWith("/environment")) return environmentResponse();
      return new Promise((resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), {
          once: true,
        });
      });
    },
  });

  await assert.rejects(
    client.createQuote(quoteInput(), { idempotencyKey: "sdk-write-timeout" }),
    (error) => {
      assert.ok(error instanceof Bu2TransportError);
      assert.equal(error.code, "request_timed_out");
      assert.equal(error.recovery, "query_before_retry");
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("HTTP 5xx on a write preserves server ids and requires reconciliation", async () => {
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    fetch: async (request) =>
      request.url.endsWith("/environment")
        ? environmentResponse()
        : new Response(
            JSON.stringify({
              error: {
                type: "provider_error",
                code: "provider_unavailable",
                message: "Provider result is unavailable.",
                request_id: "req_sdk_5xx",
                trace_id: "trc_sdk_5xx_test",
                details: {},
              },
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          ),
  });

  await assert.rejects(
    client.createQuote(quoteInput(), { idempotencyKey: "sdk-write-5xx" }),
    (error) => {
      assert.ok(error instanceof Bu2ApiError);
      assert.equal(error.status, 500);
      assert.equal(error.code, "provider_unavailable");
      assert.equal(error.requestId, "req_sdk_5xx");
      assert.equal(error.recovery, "query_before_retry");
      return true;
    },
  );
});

test("SDK rejects wrong environment and issuer contracts before sending a mutation", async () => {
  let calls = 0;
  const client = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    fetch: async () => {
      calls += 1;
      return environmentResponse("local");
    },
  });

  await assert.rejects(
    client.createQuote(quoteInput(), { idempotencyKey: "sdk-wrong-environment" }),
    (error) => {
      assert.ok(error instanceof Bu2EnvironmentError);
      assert.equal(error.code, "environment_contract_mismatch");
      return true;
    },
  );
  assert.equal(calls, 1);

  const issuerClient = new Bu2Client({
    baseUrl: "http://127.0.0.1:3999/v1",
    environment: "sandbox",
    fetch: async () => {
      calls += 1;
      const response = await environmentResponse("sandbox").json();
      return Response.json({
        ...response,
        receipt_issuer: { ...response.receipt_issuer, signature_algorithm: "unknown" },
      });
    },
  });
  await assert.rejects(
    issuerClient.createQuote(quoteInput(), { idempotencyKey: "sdk-wrong-issuer" }),
    (error) => {
      assert.ok(error instanceof Bu2EnvironmentError);
      assert.equal(error.code, "environment_contract_mismatch");
      assert.deepEqual(error.details.mismatches, ["receipt_issuer.signature_algorithm"]);
      return true;
    },
  );
  assert.equal(calls, 2);
});
