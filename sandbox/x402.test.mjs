import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { SqliteLedger } from "./persistence.mjs";
import { Bu2Sandbox } from "./domain.mjs";
import { X402PaymentAdapter } from "./x402-adapter.mjs";
import { listenX402Merchant } from "./x402-merchant.mjs";

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
  const settled = await adapter.settle("txn_paid", { value: 1, currency: "USD" });
  assert.equal(settled.status, "settled");
  assert.equal(settled.provider_reference, "0xabc123");
  assert.equal(ledger.adapterOperations().length, 1);
  ledger.close();
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
  const quote = sandbox.createQuote(
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
  sandbox.submitDelivery(
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
