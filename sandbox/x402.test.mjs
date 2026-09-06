import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  decodePaymentRequiredHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { SqliteLedger } from "./persistence.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { X402PaymentAdapter } from "./x402-adapter.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { listenX402Merchant } from "./x402-merchant.mjs";
import { buildPaymentAdapter, listen } from "./server.mjs";
import { generatePrivateKey } from "viem/accounts";

const payTo = "0x1111111111111111111111111111111111111111";
const facilitatorClient = {
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
      extensions: [],
      signers: { "eip155:*": ["0x2222222222222222222222222222222222222222"] },
    };
  },
};

async function merchant(context) {
  const running = await listenX402Merchant({
    port: 0,
    payTo,
    facilitatorClient,
  });
  context.after(() => new Promise((resolve) => running.server.close(resolve)));
  return running;
}

async function alteredChallenge(url, mutate) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const challenge = decodePaymentRequiredHeader(
    response.headers.get("payment-required"),
  );
  mutate(challenge.accepts[0]);
  return new Response(null, {
    status: 402,
    headers: {
      "payment-required": encodePaymentRequiredHeader(challenge),
    },
  });
}

async function deliveredTransaction(sandbox, suffix = "recovery") {
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_x402_seller",
      payee_account_id: `acct_x402_${suffix}`,
      item: { name: "x402 dataset", delivery_type: "dataset_access" },
      amount: { value: 1, currency: "USD" },
      expires_at: "2026-09-12T08:00:00Z",
    },
    `${suffix}-quote-key`,
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_x402_buyer",
      buyer_agent_id: "agt_x402_buyer",
      payment_mandate_id: "mdt_x402_test",
      amount: { value: 1, currency: "USD" },
      purpose: "x402 recovery test",
    },
    `${suffix}-intent-key`,
  );
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    `${suffix}-authorize-key`,
  );
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: `sha256:${suffix}` },
    `${suffix}-delivery-key`,
  );
  return authorized.transaction_id;
}

async function post(base, path, key) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: "{}",
  });
  return { status: response.status, body: await response.json() };
}

function persistAuthorization(ledger, transactionId, resourceUrl, amount = 1) {
  return ledger.saveX402Authorization({
    transaction_id: transactionId,
    x402_version: 2,
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    amount_atomic: String(amount * 10_000),
    pay_to: payTo,
    resource_url: new URL(resourceUrl).href,
    terms_json: JSON.stringify({ transaction_id: transactionId }),
    terms_fingerprint: `fingerprint_${transactionId}`,
    created_at: new Date().toISOString(),
  });
}

function paymentRequired(resourceUrl, overrides = {}) {
  return {
    x402Version: 2,
    error: "Payment Required",
    resource: {
      url: resourceUrl,
      description: "BU2 trusted execution test",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        amount: "10000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" },
        ...overrides,
      },
    ],
  };
}

async function rotatingChallengeServer(context) {
  let requests = 0;
  let url;
  const server = createServer((_request, response) => {
    requests += 1;
    const challenge = paymentRequired(url, {
      payTo:
        requests === 1
          ? payTo
          : "0x9999999999999999999999999999999999999999",
    });
    response.writeHead(402, {
      "content-type": "application/json",
      "payment-required": encodePaymentRequiredHeader(challenge),
    });
    response.end(JSON.stringify(challenge));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  url = `http://127.0.0.1:${address.port}/premium-data`;
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return { url, requests: () => requests };
}

test("official middleware emits an x402 v2 exact Base Sepolia challenge", async (context) => {
  const running = await merchant(context);
  const response = await fetch(`${running.url}/premium-data`, {
    headers: { accept: "application/json" },
  });
  assert.equal(response.status, 402);
  const challenge = decodePaymentRequiredHeader(response.headers.get("payment-required"));
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts[0].scheme, "exact");
  assert.equal(challenge.accepts[0].network, "eip155:84532");
  assert.equal(challenge.accepts[0].amount, "10000");
  assert.equal(challenge.accepts[0].payTo, payTo);
});

test("BU2 x402 adapter validates the challenge and keeps reserve idempotent", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
  });
  const first = await adapter.reserve("txn_x402", { value: 1, currency: "USD" });
  const replay = await adapter.reserve("txn_x402", { value: 1, currency: "USD" });
  assert.equal(first.status, "payment_required");
  assert.equal(replay.provider_reference, first.provider_reference);
  assert.equal(ledger.adapterOperations().length, 1);
  const authorization = ledger.getX402Authorization("txn_x402");
  assert.equal(authorization.amount_atomic, "10000");
  assert.equal(authorization.pay_to, payTo.toLowerCase());
  assert.equal(authorization.resource_url, `${running.url}/premium-data`);
});

test("official x402 signing hook rejects changed payTo before a payment is sent", async (context) => {
  const merchant = await rotatingChallengeServer(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const adapter = buildPaymentAdapter({
    ledger,
    mode: "x402",
    resourceUrl: merchant.url,
    buyerPrivateKey: generatePrivateKey(),
    environmentConfig: loadEnvironmentConfig({
      environment: "sandbox",
      paymentAdapter: "x402",
      executionStatus: "execution_enabled",
      signerEnvironment: "sandbox",
    }),
  });
  await adapter.reserve("txn_rotating_payee", { value: 1, currency: "USD" });
  await assert.rejects(
    adapter.settle("txn_rotating_payee", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_authorization_terms_changed",
  );
  assert.equal(merchant.requests(), 2);
  assert.equal(ledger.getPaymentAttempt("settle:txn_rotating_payee").status, "rejected");
  assert.equal(ledger.getAdapterOperation("settle:txn_rotating_payee").status, "rejected");
});

test("signing boundary rejects amount, asset, network, resource, and payTo drift", async (context) => {
  const cases = {
    amount: (challenge) => {
      challenge.accepts[0].amount = "20000";
    },
    asset: (challenge) => {
      challenge.accepts[0].asset = "0x8888888888888888888888888888888888888888";
    },
    network: (challenge) => {
      challenge.accepts[0].network = "eip155:1";
    },
    resource: (challenge) => {
      challenge.resource.url = "https://merchant.example/other-resource";
    },
    payTo: (challenge) => {
      challenge.accepts[0].payTo = "0x9999999999999999999999999999999999999999";
    },
  };
  for (const [field, mutate] of Object.entries(cases)) {
    await context.test(field, async () => {
      const ledger = new SqliteLedger(":memory:");
      const transactionId = `txn_drift_${field}`;
      const resourceUrl = "https://merchant.example/premium-data";
      persistAuthorization(ledger, transactionId, resourceUrl);
      let providerCalls = 0;
      const adapter = new X402PaymentAdapter({
        ledger,
        resourceUrl,
        paidFetchFactory: ({ beforePaymentCreation }) => async () => {
          const challenge = paymentRequired(resourceUrl);
          mutate(challenge);
          await beforePaymentCreation({
            paymentRequired: challenge,
            selectedRequirements: challenge.accepts[0],
          });
          providerCalls += 1;
          throw new Error("must not reach the provider");
        },
      });
      await assert.rejects(
        adapter.settle(transactionId, { value: 1, currency: "USD" }),
        (error) => error.code === "x402_authorization_terms_changed",
      );
      assert.equal(providerCalls, 0);
      assert.equal(ledger.getPaymentAttempt(`settle:${transactionId}`).status, "rejected");
      ledger.close();
    });
  }
});

test("payment attempt is durable before the provider execution boundary", async () => {
  const ledger = new SqliteLedger(":memory:");
  const transactionId = "txn_attempt_before_call";
  const resourceUrl = "https://merchant.example/premium-data";
  persistAuthorization(ledger, transactionId, resourceUrl);
  const paymentResponse = encodePaymentResponseHeader({
    success: true,
    transaction: "0xdurable-attempt",
    network: "eip155:84532",
    payer: "0x3333333333333333333333333333333333333333",
  });
  let observedAttempt;
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl,
    paidFetchFactory: ({ beforePaymentCreation, paymentAttempt }) => async () => {
      observedAttempt = ledger.getPaymentAttempt(paymentAttempt.operation_key);
      assert.equal(observedAttempt.status, "prepared");
      const challenge = paymentRequired(resourceUrl);
      await beforePaymentCreation({
        paymentRequired: challenge,
        selectedRequirements: challenge.accepts[0],
      });
      assert.equal(
        ledger.getPaymentAttempt(paymentAttempt.operation_key).status,
        "submitting",
      );
      return new Response("{}", {
        status: 200,
        headers: { "payment-response": paymentResponse },
      });
    },
  });
  const result = await adapter.settle(transactionId, { value: 1, currency: "USD" });
  assert.ok(observedAttempt.id.startsWith("pat_"));
  assert.equal(result.provider_reference, "0xdurable-attempt");
  assert.equal(ledger.getPaymentAttempt(`settle:${transactionId}`).status, "settled");
  ledger.close();
});

test("restart after preparation reconciles and never creates a second payment attempt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-x402-prepared-"));
  const path = join(directory, "sandbox.sqlite");
  const transactionId = "txn_prepared_restart";
  const operationKey = `settle:${transactionId}`;
  const resourceUrl = "https://merchant.example/premium-data";
  try {
    const first = new SqliteLedger(path);
    const authorization = persistAuthorization(first, transactionId, resourceUrl);
    first.prepareX402PaymentAttempt({
      operation_key: operationKey,
      transaction_id: transactionId,
      authorization_fingerprint: authorization.terms_fingerprint,
      amount_value: 1,
      currency: "USD",
      provider_reference: "x402_attempt_prepared_restart",
    });
    first.close();

    let paidCalls = 0;
    let recoveryCalls = 0;
    const restored = new SqliteLedger(path);
    const adapter = new X402PaymentAdapter({
      ledger: restored,
      resourceUrl,
      paidFetch: async () => {
        paidCalls += 1;
        throw new Error("must not execute");
      },
      recoveryQuery: async (query) => {
        recoveryCalls += 1;
        assert.equal(query.payment_attempt_id, restored.getPaymentAttempt(operationKey).id);
        assert.equal(query.pay_to, payTo.toLowerCase());
        return { status: "provider_unknown", reason_code: "chain_result_pending" };
      },
    });
    await assert.rejects(
      adapter.settle(transactionId, { value: 1, currency: "USD" }),
      (error) => error.code === "x402_settlement_unknown",
    );
    const recovered = await adapter.recoverSettlement(transactionId, {
      value: 1,
      currency: "USD",
    });
    assert.equal(recovered.status, "provider_unknown");
    assert.equal(paidCalls, 0);
    assert.equal(recoveryCalls, 1);
    assert.equal(restored.paymentAttempts(transactionId).length, 1);
    restored.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("adapter rejects a merchant amount that differs from BU2 authorization", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
  });
  await assert.rejects(
    adapter.reserve("txn_wrong_amount", { value: 2, currency: "USD" }),
    (error) => error.code === "x402_amount_mismatch",
  );
  assert.equal(ledger.adapterOperations().length, 0);
});

test("adapter rejects challenge network and asset mismatches with stable errors", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const networkAdapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
    fetchImpl: (url) =>
      alteredChallenge(url, (requirement) => {
        requirement.network = "eip155:1";
      }),
  });
  await assert.rejects(
    networkAdapter.reserve("txn_wrong_network", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_network_mismatch",
  );

  const assetAdapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
    fetchImpl: (url) =>
      alteredChallenge(url, (requirement) => {
        requirement.asset = "0x1111111111111111111111111111111111111111";
      }),
  });
  await assert.rejects(
    assetAdapter.reserve("txn_wrong_asset", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_asset_mismatch",
  );
  assert.equal(ledger.adapterOperations().length, 0);
});

test("adapter fails closed when no funded buyer signer is configured", async () => {
  const ledger = new SqliteLedger(":memory:");
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.invalid/premium-data",
  });
  await assert.rejects(
    adapter.settle("txn_no_signer", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_signer_unavailable",
  );
  assert.equal(ledger.adapterOperations().length, 0);
  ledger.close();
});

test("adapter maps a verified paid response to a settlement provider reference", async () => {
  const ledger = new SqliteLedger(":memory:");
  const paymentResponse = encodePaymentResponseHeader({
    success: true,
    transaction: "0xabc123",
    network: "eip155:84532",
    payer: "0x3333333333333333333333333333333333333333",
  });
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.example/premium-data",
    paidFetch: async () =>
      new Response(JSON.stringify({ delivered: true }), {
        status: 200,
        headers: { "payment-response": paymentResponse },
      }),
  });
  persistAuthorization(ledger, "txn_paid", "https://merchant.example/premium-data");
  const settled = await adapter.settle("txn_paid", { value: 1, currency: "USD" });
  assert.equal(settled.status, "settled");
  assert.equal(settled.provider_reference, "0xabc123");
  assert.equal(ledger.adapterOperations().length, 1);
  ledger.close();
});

test("timeout freezes settlement as provider_unknown and blocks repeat payment", async () => {
  const ledger = new SqliteLedger(":memory:");
  let paidCalls = 0;
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.example/premium-data",
    paidFetch: async () => {
      paidCalls += 1;
      throw new DOMException("facilitator timeout", "AbortError");
    },
  });
  persistAuthorization(ledger, "txn_timeout", "https://merchant.example/premium-data");
  await assert.rejects(
    adapter.settle("txn_timeout", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_settlement_unknown",
  );
  await assert.rejects(
    adapter.settle("txn_timeout", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_settlement_unknown",
  );
  assert.equal(paidCalls, 1);
  assert.equal(ledger.adapterOperations()[0].status, "provider_unknown");
  assert.equal(
    ledger.adapterOperations()[0].last_error,
    "x402_facilitator_timeout",
  );
  ledger.close();
});

test("successful HTTP response without PAYMENT-RESPONSE remains unknown", async () => {
  const ledger = new SqliteLedger(":memory:");
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.example/premium-data",
    paidFetch: async () => new Response("{}", { status: 200 }),
  });
  persistAuthorization(ledger, "txn_response_lost", "https://merchant.example/premium-data");
  await assert.rejects(
    adapter.settle("txn_response_lost", { value: 1, currency: "USD" }),
    (error) => error.details.reason_code === "x402_payment_response_missing",
  );
  assert.equal(ledger.healthSnapshot().adapter_operations.unknown_results, 1);
  ledger.close();
});

test("successful provider response without a real transaction reference remains unknown", async () => {
  const ledger = new SqliteLedger(":memory:");
  const transactionId = "txn_reference_missing";
  const resourceUrl = "https://merchant.example/premium-data";
  persistAuthorization(ledger, transactionId, resourceUrl);
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl,
    paidFetch: async () =>
      new Response("{}", {
        status: 200,
        headers: {
          "payment-response": encodePaymentResponseHeader({
            success: true,
            transaction: "",
            network: "eip155:84532",
            payer: "0x3333333333333333333333333333333333333333",
          }),
        },
      }),
  });
  await assert.rejects(
    adapter.settle(transactionId, { value: 1, currency: "USD" }),
    (error) => error.details.reason_code === "x402_provider_reference_missing",
  );
  assert.equal(ledger.getPaymentAttempt(`settle:${transactionId}`).status, "provider_unknown");
  ledger.close();
});

test("facilitator 5xx freezes settlement instead of retrying payment", async () => {
  const ledger = new SqliteLedger(":memory:");
  let paidCalls = 0;
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.example/premium-data",
    paidFetch: async () => {
      paidCalls += 1;
      return new Response("upstream unavailable", { status: 503 });
    },
  });
  persistAuthorization(ledger, "txn_facilitator_5xx", "https://merchant.example/premium-data");
  await assert.rejects(
    adapter.settle("txn_facilitator_5xx", { value: 1, currency: "USD" }),
    (error) => error.details.reason_code === "x402_facilitator_unavailable",
  );
  await assert.rejects(
    adapter.settle("txn_facilitator_5xx", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_settlement_unknown",
  );
  assert.equal(paidCalls, 1);
  ledger.close();
});

test("recovery without a provider query remains unknown and is audited", async () => {
  const ledger = new SqliteLedger(":memory:");
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: "https://merchant.example/premium-data",
    paidFetch: async () => {
      throw new DOMException("timeout", "AbortError");
    },
  });
  persistAuthorization(ledger, "txn_no_recovery_query", "https://merchant.example/premium-data");
  await assert.rejects(
    adapter.settle("txn_no_recovery_query", { value: 1, currency: "USD" }),
    (error) => error.code === "x402_settlement_unknown",
  );
  const result = await adapter.recoverSettlement(
    "txn_no_recovery_query",
    { value: 1, currency: "USD" },
  );
  assert.equal(result.status, "provider_unknown");
  assert.equal(result.recovery_reason_code, "x402_recovery_unavailable");
  assert.equal(ledger.adapterRecoveryAttempts("txn_no_recovery_query").length, 1);
  ledger.close();
});

test("unknown recovery preserves funds until provider confirms settlement", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  let recoveryStatus = "provider_unknown";
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
    paidFetch: async () => {
      throw new DOMException("timeout", "AbortError");
    },
    recoveryQuery: async () =>
      recoveryStatus === "settled"
        ? { status: "settled", provider_reference: "0xrecovered" }
        : { status: "provider_unknown", reason_code: "chain_result_pending" },
  });
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter,
    initialWallet: {
      id: "wal_x402_buyer",
      available: 100,
      reserved: 0,
      currency: "USD",
    },
  });
  const transactionId = await deliveredTransaction(sandbox);
  await assert.rejects(
    sandbox.settle(transactionId, {}, "recovery-settle-key"),
    (error) => error.code === "x402_settlement_unknown",
  );
  const pending = await sandbox.recoverSettlement(
    transactionId,
    {},
    "recovery-query-pending",
  );
  assert.equal(pending.recovery.status, "provider_unknown");
  assert.equal(pending.transaction.status, "delivery_submitted");
  assert.equal(pending.receipt, null);
  assert.deepEqual(sandbox.wallet, {
    id: "wal_x402_buyer",
    available: 99,
    reserved: 1,
    currency: "USD",
  });

  recoveryStatus = "settled";
  const recovered = await sandbox.recoverSettlement(
    transactionId,
    {},
    "recovery-query-settled",
  );
  assert.equal(recovered.transaction.status, "settled");
  assert.equal(recovered.transaction.settlement_provider_reference, "0xrecovered");
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(sandbox.verifyReceipt(recovered.receipt.id).valid, true);
  assert.deepEqual(
    ledger.adapterRecoveryAttempts(transactionId).map((attempt) => attempt.status),
    ["provider_unknown", "settled"],
  );
  ledger.close();
});

test("restart preserves provider_unknown and still prevents another paid request", async (context) => {
  const running = await merchant(context);
  const directory = mkdtempSync(join(tmpdir(), "bu2-x402-recovery-"));
  const path = join(directory, "sandbox.sqlite");
  let paidCalls = 0;
  try {
    const firstLedger = new SqliteLedger(path);
    const firstAdapter = new X402PaymentAdapter({
      ledger: firstLedger,
      resourceUrl: `${running.url}/premium-data`,
      paidFetch: async () => {
        paidCalls += 1;
        throw new DOMException("timeout", "AbortError");
      },
    });
    const firstSandbox = new Bu2Sandbox({
      ledger: firstLedger,
      adapter: firstAdapter,
      initialWallet: {
        id: "wal_x402_buyer",
        available: 100,
        reserved: 0,
        currency: "USD",
      },
    });
    const transactionId = await deliveredTransaction(firstSandbox, "restart");
    await assert.rejects(
      firstSandbox.settle(transactionId, {}, "restart-settle-first"),
      (error) => error.code === "x402_settlement_unknown",
    );
    firstLedger.close();

    const restoredLedger = new SqliteLedger(path);
    const restoredAdapter = new X402PaymentAdapter({
      ledger: restoredLedger,
      resourceUrl: `${running.url}/premium-data`,
      paidFetch: async () => {
        paidCalls += 1;
        return new Response("{}", { status: 200 });
      },
    });
    const restoredSandbox = new Bu2Sandbox({
      ledger: restoredLedger,
      adapter: restoredAdapter,
    });
    await assert.rejects(
      restoredSandbox.settle(transactionId, {}, "restart-settle-second"),
      (error) => error.code === "x402_settlement_unknown",
    );
    assert.equal(restoredSandbox.getTransaction(transactionId).transaction.status, "delivery_submitted");
    assert.equal(restoredSandbox.wallet.reserved, 1);
    assert.equal(paidCalls, 1);
    restoredLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP recovery endpoint is idempotent and issues one receipt after confirmation", async (context) => {
  const merchantServer = await merchant(context);
  let recoveryCalls = 0;
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    environment: "sandbox",
    adapterMode: "x402",
    executionStatus: "execution_enabled",
    signerEnvironment: "sandbox",
    x402ResourceUrl: `${merchantServer.url}/premium-data`,
    x402PaidFetch: async () => {
      throw new DOMException("timeout", "AbortError");
    },
    x402RecoveryQuery: async () => {
      recoveryCalls += 1;
      return { status: "settled", provider_reference: "0xhttp_recovered" };
    },
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
  const transactionId = await deliveredTransaction(running.sandbox, "http_recovery");
  const settlement = await post(
    running.url,
    `/v1/transactions/${transactionId}/settlements`,
    "http-recovery-settle",
  );
  assert.equal(settlement.status, 503);
  assert.equal(settlement.body.error.code, "x402_settlement_unknown");

  const recovered = await post(
    running.url,
    `/v1/transactions/${transactionId}/settlement_recoveries`,
    "http-recovery-query",
  );
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.transaction.status, "settled");
  assert.equal(recovered.body.transaction.settlement_provider_reference, "0xhttp_recovered");
  assert.equal(running.sandbox.verifyReceipt(recovered.body.receipt.id).valid, true);

  const replay = await post(
    running.url,
    `/v1/transactions/${transactionId}/settlement_recoveries`,
    "http-recovery-query",
  );
  assert.equal(replay.body.receipt.id, recovered.body.receipt.id);
  assert.equal(recoveryCalls, 1);
  assert.equal(running.ledger.adapterRecoveryAttempts(transactionId).length, 1);
});

test("concurrent settlements make one provider call and issue one receipt", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const paymentResponse = encodePaymentResponseHeader({
    success: true,
    transaction: "0xconcurrent",
    network: "eip155:84532",
    payer: "0x3333333333333333333333333333333333333333",
  });
  let paidCalls = 0;
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
    paidFetch: async () => {
      paidCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return new Response("{}", {
        status: 200,
        headers: { "payment-response": paymentResponse },
      });
    },
  });
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter,
    initialWallet: {
      id: "wal_x402_buyer",
      available: 100,
      reserved: 0,
      currency: "USD",
    },
  });
  const transactionId = await deliveredTransaction(sandbox, "concurrent");
  const [first, second] = await Promise.all([
    sandbox.settle(transactionId, {}, "concurrent-settle-a"),
    sandbox.settle(transactionId, {}, "concurrent-settle-b"),
  ]);
  assert.equal(paidCalls, 1);
  assert.equal(first.receipt.id, second.receipt.id);
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(
    ledger.listLedgerEvents().filter((event) => event.type === "receipt.issued").length,
    1,
  );
  assert.equal(ledger.paymentAttempts(transactionId).length, 1);
});

test("BU2 core objects complete an asynchronous x402 adapter transaction", async (context) => {
  const running = await merchant(context);
  const ledger = new SqliteLedger(":memory:");
  context.after(() => ledger.close());
  const paymentResponse = encodePaymentResponseHeader({
    success: true,
    transaction: "0xbu2x402settlement",
    network: "eip155:84532",
    payer: "0x3333333333333333333333333333333333333333",
  });
  const adapter = new X402PaymentAdapter({
    ledger,
    resourceUrl: `${running.url}/premium-data`,
    paidFetch: async () =>
      new Response(JSON.stringify({ dataset_id: "bu2_sandbox_market_001" }), {
        status: 200,
        headers: { "payment-response": paymentResponse },
      }),
  });
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter,
    initialWallet: { id: "wal_x402_buyer", available: 100, reserved: 0, currency: "USD" },
  });
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_x402_seller",
      payee_account_id: "acct_x402_merchant",
      item: { name: "x402 dataset", delivery_type: "dataset_access" },
      amount: { value: 1, currency: "USD" },
      expires_at: "2026-09-02T08:00:00Z",
    },
    "x402-core-quote",
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_x402_buyer",
      buyer_agent_id: "agt_x402_buyer",
      payment_mandate_id: "mdt_x402_test",
      amount: { value: 1, currency: "USD" },
      purpose: "x402 integration test",
    },
    "x402-core-intent",
  );
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "x402-core-authorize",
  );
  assert.equal(authorized.status, "funds_reserved");
  const x402Authorization = ledger.getX402Authorization(authorized.transaction_id);
  assert.equal(x402Authorization.payment_intent_id, intent.id);
  assert.equal(x402Authorization.quote_id, quote.id);
  assert.equal(x402Authorization.authorization_id, intent.authorization.id);
  assert.equal(x402Authorization.payment_mandate_id, "mdt_x402_test");
  assert.equal(x402Authorization.payee_account_id, "acct_x402_merchant");
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:x402core" },
    "x402-core-delivery",
  );
  const settled = await sandbox.settle(
    authorized.transaction_id,
    {},
    "x402-core-settlement",
  );
  assert.equal(settled.transaction.status, "settled");
  assert.equal(settled.transaction.settlement_provider_reference, "0xbu2x402settlement");
  assert.equal(sandbox.verifyReceipt(settled.receipt.id).valid, true);
  assert.equal(ledger.adapterOperations().length, 2);
});
