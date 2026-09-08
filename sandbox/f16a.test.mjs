import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const now = new Date(Date.now() - 1_000).toISOString();

function bindingDocument(suffix) {
  return {
    environment: "local",
    requested_by: "usr_f16a_reviewer",
    idempotency_key: `f16a-bindings-${suffix}`,
    tenants: [
      {
        tenant_id: `ten_f16a_buyer_${suffix}`,
        principal: { id: `usr_f16a_buyer_${suffix}`, display_name: "F16a Buyer" },
        accounts: [{ id: `acct_f16a_buyer_${suffix}`, display_name: "F16a Buyer Account" }],
        agents: [{ id: `agt_f16a_buyer_${suffix}`, display_name: "F16a Buyer Agent" }],
        credentials: [],
        funding_sources: [
          {
            id: `fund_f16a_buyer_${suffix}`,
            account_id: `acct_f16a_buyer_${suffix}`,
            agent_id: `agt_f16a_buyer_${suffix}`,
            asset: "CNY",
            network: null,
            provider: "simulated",
            source_reference: `wallet:f16a-buyer-${suffix}`,
          },
        ],
        receiving_targets: [],
      },
      {
        tenant_id: `ten_f16a_seller_${suffix}`,
        principal: { id: `usr_f16a_seller_${suffix}`, display_name: "F16a Seller" },
        accounts: [{ id: `acct_f16a_seller_${suffix}`, display_name: "F16a Seller Account" }],
        agents: [{ id: `agt_f16a_seller_${suffix}`, display_name: "F16a Seller Agent" }],
        credentials: [],
        funding_sources: [],
        receiving_targets: [
          {
            id: `tgt_f16a_seller_${suffix}`,
            account_id: `acct_f16a_seller_${suffix}`,
            agent_id: `agt_f16a_seller_${suffix}`,
            asset: "CNY",
            network: null,
            provider: "simulated",
            target_reference: `wallet:f16a-seller-${suffix}`,
          },
        ],
      },
    ],
  };
}

function mandateInput(suffix) {
  return {
    account_id: `acct_f16a_buyer_${suffix}`,
    agent_id: `agt_f16a_buyer_${suffix}`,
    funding_source_id: `fund_f16a_buyer_${suffix}`,
    receiving_target_id: `tgt_f16a_seller_${suffix}`,
    environment: "local",
    currency: "CNY",
    max_single_amount: 500,
    daily_limit: 1_000,
    monthly_limit: 10_000,
    effective_at: now,
  };
}

function sessionInput(suffix) {
  return {
    tenant_id: `ten_f16a_buyer_${suffix}`,
    account_id: `acct_f16a_buyer_${suffix}`,
    agent_id: `agt_f16a_buyer_${suffix}`,
    environment: "local",
    purpose: "F16a autonomous internal beta",
    max_spend: { value: 500, currency: "CNY" },
    starts_at: now,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

function quoteInput(suffix, value = 100) {
  return {
    seller_agent_id: `agt_f16a_seller_${suffix}`,
    payee_account_id: `acct_f16a_seller_${suffix}`,
    item: { name: `F16a resource ${suffix}`, delivery_type: "research_data" },
    amount: { value, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function paymentInput(quote, mandate, session) {
  return {
    quote_id: quote.id,
    payer_account_id: mandate.account_id,
    buyer_agent_id: mandate.agent_id,
    payment_mandate_id: mandate.id,
    amount: quote.amount,
    purpose: "F16a autonomous resource purchase",
    funding_source_id: mandate.funding_source_id,
    receiving_target_id: mandate.receiving_target_id,
    execution_session_id: session.id,
    execution_mode: "deferred",
  };
}

async function createBetaContext(suffix, { ledger = new SqliteLedger(":memory:"), adapter } = {}) {
  const environmentConfig = loadEnvironmentConfig();
  ledger.bootstrapIdentityTenants(
    normalizeOnboardingDocument(bindingDocument(suffix), "local"),
  );
  const paymentAdapter = adapter ?? new SimulatedPaymentAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter: paymentAdapter, environmentConfig });
  const session = await sandbox.createExecutionSession(
    sessionInput(suffix),
    `f16a-session-create-${suffix}`,
  );
  const activeSession = await sandbox.transitionExecutionSession(
    session.id,
    "activate",
    {
      version: 1,
      activation_id: `act_f16a_${suffix}`,
      approved_by: "usr_f16a_reviewer",
    },
    `f16a-session-activate-${suffix}`,
  );
  const mandate = await sandbox.createPaymentMandate(
    mandateInput(suffix),
    `f16a-mandate-create-${suffix}`,
  );
  const activeMandate = await sandbox.transitionPaymentMandate(
    mandate.id,
    "activate",
    { version: 1 },
    `f16a-mandate-activate-${suffix}`,
  );
  return { ledger, sandbox, session: activeSession, mandate: activeMandate };
}

test("F16a completes autonomous internal pay-and-collect without per-transaction operator approval", async (context) => {
  const { ledger, sandbox, session, mandate } = await createBetaContext("bilateral");
  context.after(() => ledger.close());
  const quote = await sandbox.createQuote(
    quoteInput("bilateral", 100),
    "f16a-quote-bilateral",
  );
  sandbox.knownPayees.add(quote.payee_account_id);

  const pending = await sandbox.createPaymentIntent(
    paymentInput(quote, mandate, session),
    "f16a-intent-bilateral",
  );
  assert.equal(pending.status, "authorized");
  assert.equal(pending.authorization.decision, "allowed");
  assert.equal(pending.transaction_id, null);

  const executed = await sandbox.executePaymentIntent(
    pending.id,
    {},
    "f16a-execute-bilateral",
  );
  assert.equal(executed.status, "funds_reserved");
  assert.ok(executed.transaction_id);
  await sandbox.submitDelivery(
    executed.transaction_id,
    { type: "research_data", evidence_hash: "sha256:f16a-bilateral" },
    "f16a-delivery-bilateral",
  );
  const settled = await sandbox.settle(
    executed.transaction_id,
    {},
    "f16a-settle-bilateral",
  );
  assert.equal(settled.transaction.status, "settled");
  assert.equal(sandbox.getExecutionSession(session.id).committed_spend_minor, 100);

  const collectionQuote = await sandbox.createQuote(
    quoteInput("collection", 100),
    "f16a-quote-collection",
  );
  const receivable = await sandbox.createReceivable(
    {
      quote_id: collectionQuote.id,
      account_id: collectionQuote.payee_account_id,
      agent_id: collectionQuote.seller_agent_id,
      receiving_target_id: mandate.receiving_target_id,
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F16a autonomous collection",
      expected_payer_account_id: mandate.account_id,
      expected_buyer_agent_id: mandate.agent_id,
    },
    "f16a-receivable-bilateral",
  );
  const collection = await sandbox.verifyInboundPayment(
    receivable.id,
    {
      provider_reference: "sim_f16a_collection",
      collection_reference: receivable.collection_reference,
      payer_account_id: mandate.account_id,
      payer_agent_id: mandate.agent_id,
    },
    "f16a-collection-bilateral",
  );
  assert.equal(collection.collection.status, "posted");
  const grant = await sandbox.createAccessGrant(
    collection.collection.id,
    { access_type: "dataset", access_reference: "dataset://f16a/bilateral" },
    "f16a-grant-bilateral",
  );
  sandbox.accessGrants.get(grant.id).status = "expired";
  const recoveredGrant = await sandbox.recoverAccessGrant(
    grant.id,
    {},
    "f16a-grant-recover-bilateral",
  );
  assert.equal(recoveredGrant.status, "active");

  const refund = await sandbox.requestRefund(
    executed.transaction_id,
    { amount: { value: 20, currency: "CNY" }, reason: "beta bounded refund" },
    "f16a-refund-bilateral",
  );
  assert.equal(refund.refund.status, "refunded");
  await sandbox.recordProviderFee(
    {
      source_type: "payment",
      source_id: executed.transaction_id,
      provider: "bu2_simulated_provider",
      provider_reference: settled.transaction.settlement_provider_reference,
      amount: { value: 2, currency: "CNY" },
    },
    "f16a-fee-payment",
  );
  await sandbox.recordProviderFee(
    {
      source_type: "collection",
      source_id: collection.collection.id,
      provider: "bu2_simulated_provider",
      provider_reference: collection.collection.provider_reference,
      amount: { value: 1, currency: "CNY" },
    },
    "f16a-fee-collection",
  );
  await sandbox.recordProviderFee(
    {
      source_type: "refund",
      source_id: refund.refund.id,
      provider: "bu2_simulated_provider",
      provider_reference: refund.refund.provider_reference,
      amount: { value: 1, currency: "CNY" },
    },
    "f16a-fee-refund",
  );
  const reconciliation = await sandbox.createReconciliation({}, "f16a-reconcile-bilateral");
  assert.equal(reconciliation.status, "matched");
  assert.equal(reconciliation.exception_count, 0);
  assert.equal(reconciliation.unknown_count, 0);
  assert.deepEqual(reconciliation.totals.CNY, {
    payments: 100,
    collections: 100,
    refunds: 20,
    fees: 4,
  });
  assert.equal(
    sandbox.events.filter((event) => event.type === "payment_intent.approval_requested").length,
    0,
  );
});

test("F16a recovers an unknown settlement after restart without creating a second payment", async () => {
  class UnknownSettlementAdapter extends SimulatedPaymentAdapter {
    settle() {
      throw new ApiError(
        503,
        "provider_unknown",
        "x402_settlement_unknown",
        "Settlement result is unknown and requires recovery.",
      );
    }

    recoverSettlement() {
      return { status: "settled", provider_reference: "sim_f16a_recovered_settlement" };
    }
  }

  const directory = mkdtempSync(join(tmpdir(), "bu2-f16a-recovery-"));
  const database = join(directory, "f16a.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const adapter = new UnknownSettlementAdapter({ ledger: firstLedger });
    const first = await createBetaContext("recovery", { ledger: firstLedger, adapter });
    const quote = await first.sandbox.createQuote(
      quoteInput("recovery", 80),
      "f16a-quote-recovery",
    );
    first.sandbox.knownPayees.add(quote.payee_account_id);
    const pending = await first.sandbox.createPaymentIntent(
      paymentInput(quote, first.mandate, first.session),
      "f16a-intent-recovery",
    );
    const executed = await first.sandbox.executePaymentIntent(
      pending.id,
      {},
      "f16a-execute-recovery",
    );
    await first.sandbox.submitDelivery(
      executed.transaction_id,
      { type: "research_data", evidence_hash: "sha256:f16a-recovery" },
      "f16a-delivery-recovery",
    );
    await assert.rejects(
      first.sandbox.settle(executed.transaction_id, {}, "f16a-settle-recovery"),
      (error) => error.code === "x402_settlement_unknown",
    );
    assert.equal(first.sandbox.getTransaction(executed.transaction_id).transaction.status, "delivery_submitted");
    firstLedger.close();

    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({
      ledger: secondLedger,
      adapter: new UnknownSettlementAdapter({ ledger: secondLedger }),
    });
    const recovered = await second.recoverSettlement(
      executed.transaction_id,
      {},
      "f16a-recover-settlement",
    );
    assert.equal(recovered.transaction.status, "settled");
    assert.equal(recovered.transaction.settlement_provider_reference, "sim_f16a_recovered_settlement");
    const replay = await second.recoverSettlement(
      executed.transaction_id,
      {},
      "f16a-recover-settlement",
    );
    assert.deepEqual(replay, recovered);
    assert.equal(second.listTransactions().length, 1);
    assert.equal(second.getExecutionSession(first.session.id).committed_spend_minor, 80);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("F16a keeps unapproved merchants and Sandbox/Testnet execution closed", async () => {
  const { ledger, sandbox, session, mandate } = await createBetaContext("gates");
  const quote = await sandbox.createQuote(quoteInput("gates", 50), "f16a-quote-gates");
  const reviewRequired = await sandbox.createPaymentIntent(
    paymentInput(quote, mandate, session),
    "f16a-intent-gates",
  );
  assert.equal(reviewRequired.status, "requires_authorization");
  await assert.rejects(
    sandbox.executePaymentIntent(reviewRequired.id, {}, "f16a-execute-gates"),
    (error) => error.code === "operator_approval_required",
  );
  assert.equal(sandbox.wallet.reserved, 0);
  ledger.close();

  const sandboxConfig = loadEnvironmentConfig({ environment: "sandbox", paymentAdapter: "x402" });
  const testnet = new Bu2Sandbox({ environmentConfig: sandboxConfig });
  const testnetSession = await testnet.createExecutionSession(
    {
      ...sessionInput("testnet"),
      tenant_id: "ten_f16a_testnet",
      account_id: "acct_f16a_testnet",
      agent_id: "agt_f16a_testnet",
      environment: "sandbox",
    },
    "f16a-session-testnet",
  );
  await assert.rejects(
    testnet.transitionExecutionSession(
      testnetSession.id,
      "activate",
      { version: 1, activation_id: "act_f16a_testnet", approved_by: "usr_f16a_reviewer" },
      "f16a-activate-testnet",
    ),
    (error) => error.code === "environment_execution_disabled",
  );
  assert.equal(sandboxConfig.execution_status, "execution_disabled");
});
