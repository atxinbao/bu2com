import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Bu2Sandbox } from "./domain.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { SqliteLedger } from "./persistence.mjs";

const now = new Date(Date.now() - 1_000).toISOString();

function sessionInput(suffix = "core", overrides = {}) {
  return {
    tenant_id: `ten_f15a_${suffix}`,
    account_id: `acct_f15a_${suffix}`,
    agent_id: `agt_f15a_${suffix}`,
    environment: "local",
    purpose: "F15a bounded internal execution",
    max_spend: { value: 200, currency: "CNY" },
    starts_at: now,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function quoteInput(suffix) {
  return {
    seller_agent_id: `agt_f15a_seller_${suffix}`,
    payee_account_id: `acct_f15a_seller_${suffix}`,
    item: { name: "F15a bounded resource", delivery_type: "research_data" },
    amount: { value: 100, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function mandateInput(suffix) {
  return {
    account_id: `acct_f15a_${suffix}`,
    agent_id: `agt_f15a_${suffix}`,
    funding_source_id: `fund_f15a_${suffix}`,
    receiving_target_id: `tgt_f15a_seller_${suffix}`,
    environment: "local",
    currency: "CNY",
    max_single_amount: 200,
    daily_limit: 500,
    monthly_limit: 1_000,
    effective_at: now,
  };
}

async function activeMandate(sandbox, suffix) {
  const mandate = await sandbox.createPaymentMandate(mandateInput(suffix), `f15a-mandate-${suffix}`);
  return sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, `f15a-mandate-activate-${suffix}`);
}

test("F15a keeps session activation separate and enforces a bounded spend window", async () => {
  const sandbox = new Bu2Sandbox();
  const session = await sandbox.createExecutionSession(sessionInput("core"), "f15a-session-create-core");
  assert.equal(session.status, "requested");
  await assert.rejects(
    sandbox.transitionExecutionSession(session.id, "activate", { version: 1 }, "f15a-session-activate-missing"),
    (error) => error.code === "missing_field",
  );
  const active = await sandbox.transitionExecutionSession(
    session.id,
    "activate",
    { version: 1, activation_id: "act_f15a_core", approved_by: "usr_f15a_reviewer" },
    "f15a-session-activate-core",
  );
  assert.equal(active.status, "active");
  assert.equal(active.activation_status, "active");
  assert.equal(active.remaining_spend.value, 200);
  await assert.rejects(
    sandbox.createExecutionSession(
      sessionInput("too-long", { expires_at: new Date(Date.now() + 16 * 60_000).toISOString() }),
      "f15a-session-create-too-long",
    ),
    (error) => error.code === "invalid_session_window",
  );
});

test("F15a binds payments to the active session and commits or releases spend atomically", async () => {
  const sandbox = new Bu2Sandbox();
  const suffix = "payment";
  const session = await sandbox.createExecutionSession(sessionInput(suffix), "f15a-session-create-payment");
  await sandbox.transitionExecutionSession(
    session.id,
    "activate",
    { version: 1, activation_id: "act_f15a_payment", approved_by: "usr_f15a_reviewer" },
    "f15a-session-activate-payment",
  );
  const mandate = await activeMandate(sandbox, suffix);
  const quote = await sandbox.createQuote(quoteInput(suffix), "f15a-quote-payment");
  sandbox.knownPayees.add(quote.payee_account_id);
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: mandate.account_id,
      buyer_agent_id: mandate.agent_id,
      payment_mandate_id: mandate.id,
      amount: quote.amount,
      purpose: "F15a bounded payment",
      funding_source_id: mandate.funding_source_id,
      receiving_target_id: mandate.receiving_target_id,
      execution_session_id: session.id,
    },
    "f15a-intent-payment",
  );
  assert.equal(intent.status, "funds_reserved");
  assert.equal(sandbox.getExecutionSession(session.id).reserved_spend_minor, 100);
  const transactionId = intent.transaction_id;
  await sandbox.submitDelivery(transactionId, { type: "research_data", evidence_hash: "sha256:f15a" }, "f15a-delivery-payment");
  await sandbox.settle(transactionId, {}, "f15a-settle-payment");
  const committed = sandbox.getExecutionSession(session.id);
  assert.equal(committed.reserved_spend_minor, 0);
  assert.equal(committed.committed_spend_minor, 100);
  assert.equal(committed.remaining_spend.value, 100);
  assert.throws(
    () => sandbox.reserveExecutionSession({
        execution_session_id: session.id,
        payer_account_id: mandate.account_id,
        buyer_agent_id: mandate.agent_id,
        amount: { value: 101, currency: "CNY" },
      }),
    (error) => error.code === "execution_session_limit_exceeded",
  );
});

test("F15a rejects inactive, mismatched and over-limit sessions and persists them", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f15a-"));
  const database = join(directory, "f15a.sqlite");
  const config = loadEnvironmentConfig();
  const ledger = new SqliteLedger(database, { environmentConfig: config });
  try {
    const sandbox = new Bu2Sandbox({ ledger, environmentConfig: config });
    const session = await sandbox.createExecutionSession(sessionInput("persist"), "f15a-session-create-persist");
    const restored = new Bu2Sandbox({ ledger, environmentConfig: config });
    assert.equal(restored.getExecutionSession(session.id).status, "requested");
    await assert.rejects(
      restored.createPaymentIntent(
        {
          quote_id: "quo_missing",
          payer_account_id: session.account_id,
          buyer_agent_id: session.agent_id,
          payment_mandate_id: "mdt_missing",
          amount: { value: 100, currency: "CNY" },
          purpose: "inactive session",
          execution_session_id: session.id,
        },
        "f15a-inactive-payment",
      ),
      (error) => error.code === "quote_not_found",
    );
    await restored.transitionExecutionSession(
      session.id,
      "activate",
      { version: 1, activation_id: "act_f15a_persist", approved_by: "usr_f15a_reviewer" },
      "f15a-session-activate-persist",
    );
    assert.equal(restored.getExecutionSession(session.id).activation_id, "act_f15a_persist");
    const sandboxConfig = loadEnvironmentConfig({ environment: "sandbox", paymentAdapter: "x402" });
    const sandboxRuntime = new Bu2Sandbox({ environmentConfig: sandboxConfig });
    const sandboxSession = await sandboxRuntime.createExecutionSession(
      sessionInput("sandbox", { environment: "sandbox" }),
      "f15a-session-create-sandbox",
    );
    await assert.rejects(
      sandboxRuntime.transitionExecutionSession(
        sandboxSession.id,
        "activate",
        { version: 1, activation_id: "act_f15a_sandbox", approved_by: "usr_f15a_reviewer" },
        "f15a-session-activate-sandbox",
      ),
      (error) => error.code === "environment_execution_disabled",
    );
  } finally {
    ledger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
