import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";

const now = new Date(Date.now() - 1_000).toISOString();

function quoteInput(suffix = "f09a") {
  return {
    seller_agent_id: `agt_seller_${suffix}`,
    payee_account_id: `acct_seller_${suffix}`,
    item: { name: "F09a authorized resource", delivery_type: "research_data" },
    amount: { value: 100, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function mandateInput(suffix = "f09a") {
  return {
    account_id: `acct_buyer_${suffix}`,
    agent_id: `agt_buyer_${suffix}`,
    funding_source_id: `fund_buyer_${suffix}`,
    receiving_target_id: `tgt_seller_${suffix}`,
    environment: "local",
    currency: "CNY",
    max_single_amount: 500,
    daily_limit: 1_000,
    monthly_limit: 10_000,
    effective_at: now,
  };
}

async function activeMandate(sandbox, suffix) {
  const mandate = await sandbox.createPaymentMandate(mandateInput(suffix), `f09a-create-${suffix}`);
  return sandbox.transitionPaymentMandate(
    mandate.id,
    "activate",
    { version: 1 },
    `f09a-activate-${suffix}`,
  );
}

test("F09a executes a deferred approved intent without operator approval", async () => {
  const sandbox = new Bu2Sandbox();
  const suffix = "approved";
  const mandate = await activeMandate(sandbox, suffix);
  const quote = await sandbox.createQuote(quoteInput(suffix), "f09a-quote-approved");
  sandbox.knownPayees.add(quote.payee_account_id);

  const pending = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: mandate.account_id,
      buyer_agent_id: mandate.agent_id,
      payment_mandate_id: mandate.id,
      amount: quote.amount,
      purpose: "F09a approved resource",
      funding_source_id: mandate.funding_source_id,
      receiving_target_id: mandate.receiving_target_id,
      execution_mode: "deferred",
    },
    "f09a-intent-approved",
  );
  assert.equal(pending.status, "authorized");
  assert.equal(pending.authorization.decision, "allowed");
  assert.equal(pending.transaction_id, null);

  const executed = await sandbox.executePaymentIntent(
    pending.id,
    {},
    "f09a-execute-approved",
  );
  assert.equal(executed.status, "funds_reserved");
  assert.ok(executed.transaction_id);
  assert.equal(sandbox.wallet.reserved, 100);

  const replay = await sandbox.executePaymentIntent(
    pending.id,
    {},
    "f09a-execute-approved",
  );
  assert.deepEqual(replay, executed);
  assert.equal(sandbox.wallet.reserved, 100);
});

test("F09a cannot turn a review-required intent into autonomous execution", async () => {
  const sandbox = new Bu2Sandbox();
  const suffix = "review";
  const mandate = await activeMandate(sandbox, suffix);
  const quote = await sandbox.createQuote(quoteInput(suffix), "f09a-quote-review");
  const pending = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: mandate.account_id,
      buyer_agent_id: mandate.agent_id,
      payment_mandate_id: mandate.id,
      amount: quote.amount,
      purpose: "F09a first-time resource",
      funding_source_id: mandate.funding_source_id,
      receiving_target_id: mandate.receiving_target_id,
      execution_mode: "deferred",
    },
    "f09a-intent-review",
  );
  assert.equal(pending.status, "requires_authorization");
  await assert.rejects(
    sandbox.executePaymentIntent(pending.id, {}, "f09a-execute-review"),
    (error) => error.code === "operator_approval_required",
  );
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(sandbox.getPaymentIntent(pending.id).transaction_id, null);
});

test("F09a fails closed when an approved deferred intent loses its mandate", async () => {
  const sandbox = new Bu2Sandbox();
  const suffix = "suspended";
  const mandate = await activeMandate(sandbox, suffix);
  const quote = await sandbox.createQuote(quoteInput(suffix), "f09a-quote-suspended");
  sandbox.knownPayees.add(quote.payee_account_id);
  const pending = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: mandate.account_id,
      buyer_agent_id: mandate.agent_id,
      payment_mandate_id: mandate.id,
      amount: quote.amount,
      purpose: "F09a suspended resource",
      funding_source_id: mandate.funding_source_id,
      receiving_target_id: mandate.receiving_target_id,
      execution_mode: "deferred",
    },
    "f09a-intent-suspended",
  );
  await sandbox.transitionPaymentMandate(
    mandate.id,
    "suspend",
    { version: 1 },
    "f09a-suspend-suspended",
  );
  await assert.rejects(
    sandbox.executePaymentIntent(pending.id, {}, "f09a-execute-suspended"),
    (error) => error.code === "mandate_not_active",
  );
  assert.equal(sandbox.wallet.reserved, 0);
});
