import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, Bu2Sandbox } from "./domain.mjs";

const quoteInput = {
  seller_agent_id: "agt_market_data",
  payee_account_id: "acct_atlas_data",
  item: { name: "Southeast Asia commerce dataset", delivery_type: "dataset_access" },
  amount: { value: 3900, currency: "CNY" },
  expires_at: "2026-09-02T08:00:00Z",
};

async function createReviewIntent(sandbox) {
  const quote = await sandbox.createQuote(quoteInput, "quote-key-8421");
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 3900, currency: "CNY" },
      purpose: "Market dataset",
      external_context: { type: "chatgpt_conversation", id: "conv_8421" },
    },
    "intent-key-8421",
  );
  return { quote, intent };
}

test("full payment flow separates authorization, reservation, delivery, and settlement", async () => {
  const sandbox = new Bu2Sandbox();
  const { intent } = await createReviewIntent(sandbox);
  assert.equal(intent.status, "requires_authorization");
  assert.equal(intent.authorization.decision, "review_required");

  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "authorize-key-8421",
  );
  assert.equal(authorized.status, "funds_reserved");
  assert.equal(sandbox.wallet.available, 96_100);
  assert.equal(sandbox.wallet.reserved, 3900);

  const delivery = await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:9fc2a17e" },
    "delivery-key-8421",
  );
  assert.equal(delivery.transaction.status, "delivery_submitted");

  const result = await sandbox.settle(authorized.transaction_id, {}, "settle-key-8421");
  assert.equal(result.transaction.status, "settled");
  assert.equal(result.transaction.settled_amount.value, 3900);
  assert.equal(sandbox.wallet.reserved, 0);
  const verification = sandbox.verifyReceipt(result.receipt.id);
  assert.deepEqual(
    {
      valid: verification.valid,
      signature_valid: verification.signature_valid,
      issuer_trusted: verification.issuer_trusted,
      settlement_confirmed: verification.settlement_confirmed,
      environment_valid: verification.environment_valid,
      schema_version: verification.schema_version,
      canonicalization_version: verification.canonicalization_version,
    },
    {
      valid: true,
      signature_valid: true,
      issuer_trusted: true,
      settlement_confirmed: true,
      environment_valid: true,
      schema_version: "0.3",
      canonicalization_version: "RFC8785-JCS-1",
    },
  );
});

test("Receipt v0.3 rejects tampering of every signed payment, delivery, and environment binding", async () => {
  const sandbox = new Bu2Sandbox();
  const { intent } = await createReviewIntent(sandbox);
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "tamper-authorize-key",
  );
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:tamper-proof" },
    "tamper-delivery-key",
  );
  const { receipt } = await sandbox.settle(
    authorized.transaction_id,
    {},
    "tamper-settlement-key",
  );
  const original = structuredClone(receipt);
  const tamperedValues = [
    ["amount", { value: 999_999, currency: "CNY" }],
    ["amount", { value: 3900, currency: "USD" }],
    ["payee_account_id", "acct_attacker"],
    ["payment_mandate_id", "mdt_attacker"],
    ["delivery_evidence_hash", "sha256:attacker"],
    ["environment", "mainnet"],
    ["execution_backend", "x402"],
    ["chain_id", 84532],
    ["receipt_issuer_id", "bu2-reference-server:sandbox"],
    ["provider_reference", "provider_attacker"],
  ];
  for (const [field, value] of tamperedValues) {
    sandbox.receipts.set(receipt.id, { ...structuredClone(original), [field]: value });
    const verification = sandbox.verifyReceipt(receipt.id);
    assert.equal(verification.signature_valid, false, `expected ${field} tamper to fail`);
    assert.equal(verification.valid, false, `expected ${field} tamper to be invalid`);
  }
});

test("Receipt verification fails closed when the issuer is unknown", async () => {
  const sandbox = new Bu2Sandbox();
  const { intent } = await createReviewIntent(sandbox);
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "unknown-issuer-authorize-key",
  );
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:unknown-issuer" },
    "unknown-issuer-delivery-key",
  );
  const { receipt } = await sandbox.settle(
    authorized.transaction_id,
    {},
    "unknown-issuer-settlement-key",
  );
  sandbox.receipts.set(receipt.id, {
    ...receipt,
    verification_key_id: "key_unknown",
  });
  const verification = sandbox.verifyReceipt(receipt.id);
  assert.equal(verification.signature_valid, true);
  assert.equal(verification.issuer_trusted, false);
  assert.equal(verification.settlement_confirmed, true);
  assert.equal(verification.valid, false);
});

test("E-T04 Receipt verification rejects a signed Receipt from another environment", async () => {
  const sandbox = new Bu2Sandbox();
  const { intent } = await createReviewIntent(sandbox);
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "wrong-environment-authorize",
  );
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:wrong-environment" },
    "wrong-environment-delivery",
  );
  const { receipt } = await sandbox.settle(
    authorized.transaction_id,
    {},
    "wrong-environment-settle",
  );
  sandbox.environmentConfig = {
    environment_contract_version: "1.0",
    environment: "sandbox",
    payment_adapter: "x402",
    chain_id: 84532,
    network: "eip155:84532",
    execution_status: "execution_enabled",
  };
  const verification = sandbox.verifyReceipt(receipt.id);
  assert.equal(verification.signature_valid, true);
  assert.equal(verification.issuer_trusted, true);
  assert.equal(verification.settlement_confirmed, true);
  assert.equal(verification.environment_valid, false);
  assert.equal(verification.valid, false);
});

test("same idempotency key and body returns the original resource", async () => {
  const sandbox = new Bu2Sandbox();
  const first = await sandbox.createQuote(quoteInput, "same-quote-key");
  const replay = await sandbox.createQuote(quoteInput, "same-quote-key");
  assert.deepEqual(replay, first);
  assert.equal(sandbox.quotes.size, 1);
});

test("same idempotency key with a different body is rejected", async () => {
  const sandbox = new Bu2Sandbox();
  await sandbox.createQuote(quoteInput, "conflict-key");
  await assert.rejects(
    async () =>
      sandbox.createQuote(
        { ...quoteInput, amount: { value: 4000, currency: "CNY" } },
        "conflict-key",
      ),
    (error) =>
      error instanceof ApiError && error.status === 409 && error.type === "idempotency_conflict",
  );
});

test("settlement before delivery is rejected without moving money", async () => {
  const sandbox = new Bu2Sandbox();
  const { intent } = await createReviewIntent(sandbox);
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "authorize-no-delivery",
  );
  await assert.rejects(
    sandbox.settle(authorized.transaction_id, {}, "early-settlement"),
    (error) => error instanceof ApiError && error.code === "transaction_not_delivered",
  );
  assert.equal(sandbox.wallet.reserved, 3900);
});

test("payment intent cannot override the quoted amount", async () => {
  const sandbox = new Bu2Sandbox();
  const quote = await sandbox.createQuote(quoteInput, "quote-mismatch");
  await assert.rejects(
    sandbox.createPaymentIntent(
        {
          quote_id: quote.id,
          payer_account_id: "acct_bu2_ventures",
          buyer_agent_id: "agt_research_copilot",
          payment_mandate_id: "mdt_research_04",
          amount: { value: 1, currency: "CNY" },
          purpose: "Tampered price",
        },
        "intent-mismatch",
      ),
    (error) => error instanceof ApiError && error.code === "quote_amount_mismatch",
  );
});

test("amount above the mandate is denied", async () => {
  const sandbox = new Bu2Sandbox();
  const expensiveQuote = await sandbox.createQuote(
    { ...quoteInput, amount: { value: 8000, currency: "CNY" } },
    "expensive-quote",
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: expensiveQuote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: { value: 8000, currency: "CNY" },
      purpose: "Expensive dataset",
    },
    "expensive-intent",
  );
  assert.equal(intent.status, "declined");
  assert.equal(intent.authorization.reason_code, "amount_above_mandate");
  assert.equal(sandbox.transactions.size, 0);
});

test("adapter reservation failure leaves authorization, wallet, and ledger retryable", async () => {
  const adapter = {
    async reserve() {
      throw new ApiError(503, "provider_unavailable", "provider_timeout", "Provider timeout.");
    },
  };
  const sandbox = new Bu2Sandbox({ adapter });
  const { intent } = await createReviewIntent(sandbox);
  const eventCount = sandbox.events.length;
  await assert.rejects(
    sandbox.decideAuthorization(intent.id, { decision: "authorize" }, "adapter-failure-auth"),
    (error) => error.code === "provider_timeout",
  );
  assert.equal(sandbox.getPaymentIntent(intent.id).status, "requires_authorization");
  assert.equal(sandbox.wallet.available, 100_000);
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(sandbox.transactions.size, 0);
  assert.equal(sandbox.events.length, eventCount);
});

test("adapter settlement failure preserves delivery state and reserved funds", async () => {
  const adapter = {
    async reserve() {
      return { provider_reference: "reserve_ok" };
    },
    async settle() {
      throw new ApiError(503, "provider_unavailable", "provider_timeout", "Provider timeout.");
    },
  };
  const sandbox = new Bu2Sandbox({ adapter });
  const { intent } = await createReviewIntent(sandbox);
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "adapter-settle-auth",
  );
  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:adapterfailure" },
    "adapter-settle-delivery",
  );
  await assert.rejects(
    sandbox.settle(authorized.transaction_id, {}, "adapter-settle-failure"),
    (error) => error.code === "provider_timeout",
  );
  assert.equal(sandbox.transactions.get(authorized.transaction_id).status, "delivery_submitted");
  assert.equal(sandbox.wallet.reserved, 3900);
  assert.equal(sandbox.receipts.size, 0);
});
