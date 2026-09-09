import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

async function reservedTransaction(sandbox, suffix, budgetId = null) {
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: `agt_f13_seller_${suffix}`,
      payee_account_id: `acct_f13_seller_${suffix}`,
      item: { name: "F13 bounded payment", delivery_type: "research_data" },
      amount: { value: 300, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    `f13-quote-${suffix}`,
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.amount,
      purpose: "F13 bounded payment",
      ...(budgetId ? { budget_id: budgetId } : {}),
    },
    `f13-intent-${suffix}`,
  );
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    `f13-authorize-${suffix}`,
  );
  return { quote, intent: authorized, transactionId: authorized.transaction_id };
}

async function settledTransaction(sandbox, suffix) {
  const flow = await reservedTransaction(sandbox, suffix);
  await sandbox.submitDelivery(
    flow.transactionId,
    { type: "research_data", evidence_hash: `sha256:f13-${suffix}` },
    `f13-delivery-${suffix}`,
  );
  await sandbox.settle(flow.transactionId, {}, `f13-settle-${suffix}`);
  return flow;
}

test("F13 cancels a reserved transaction atomically and releases its budget hold", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const budget = await sandbox.createBudget(
    { id: "bud_f13_cancel", scope_type: "project", scope_id: "proj_f13", currency: "CNY", period: "calendar_month", limit_minor: 500 },
    "f13-budget-create",
  );
  const flow = await reservedTransaction(sandbox, "cancel", budget.id);
  assert.equal(sandbox.wallet.available, 99_700);
  const result = await sandbox.cancelTransaction(flow.transactionId, { reason: "user_requested" }, "f13-cancel-001");
  assert.equal(result.transaction.status, "canceled");
  assert.equal(sandbox.wallet.available, 100_000);
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(sandbox.getBudgetHold(result.transaction.budget_hold_id).status, "released");
  assert.equal(sandbox.listFinancialPostings(flow.transactionId).length, 4);
  assert.deepEqual(await sandbox.cancelTransaction(flow.transactionId, { reason: "user_requested" }, "f13-cancel-001"), result);
  await assert.rejects(
    sandbox.cancelTransaction(flow.transactionId, {}, "f13-cancel-again"),
    (error) => error.code === "transaction_not_cancellable",
  );
  ledger.close();
});

test("F13 records bounded partial and full refunds without exceeding settled value", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const flow = await settledTransaction(sandbox, "refund");
  const partial = await sandbox.requestRefund(flow.transactionId, { amount: { value: 100, currency: "CNY" }, reason: "partial" }, "f13-refund-partial");
  assert.equal(partial.refund.status, "refunded");
  assert.equal(partial.transaction.status, "settled");
  assert.deepEqual(partial.transaction.refunded_amount, { value: 100, currency: "CNY" });
  const full = await sandbox.requestRefund(flow.transactionId, { amount: { value: 200, currency: "CNY" }, reason: "full" }, "f13-refund-full");
  assert.equal(full.transaction.status, "refunded");
  assert.deepEqual(full.transaction.refunded_amount, { value: 300, currency: "CNY" });
  assert.equal(sandbox.listFinancialPostings(flow.transactionId).length, 6);
  assert.equal(sandbox.listFinancialPostings(flow.transactionId).filter((posting) => posting.event_type === "transaction.refunded").length, 4);
  assert.equal(sandbox.wallet.available, 100_000);
  assert.equal(sandbox.verifyReceipt(sandbox.getTransaction(flow.transactionId).transaction.receipt_id).valid, true);
  await assert.rejects(
    sandbox.requestRefund(flow.transactionId, { amount: { value: 1, currency: "CNY" } }, "f13-refund-excess"),
    (error) => error.code === "refund_amount_exceeded",
  );
  assert.equal(sandbox.listRefunds(flow.transactionId).length, 2);
  ledger.close();
});

test("R61-01 preserves quota when adapter fails after an external refund effect", async () => {
  const ledger = new SqliteLedger(":memory:");
  class EffectThenFailAdapter extends SimulatedPaymentAdapter {
    refund(transactionId, amount, context) {
      super.refund(transactionId, amount, context);
      throw new Error("connection closed after provider commit");
    }
  }
  const sandbox = new Bu2Sandbox({ ledger, adapter: new EffectThenFailAdapter({ ledger }) });
  const flow = await settledTransaction(sandbox, "r61-p0");
  const first = await sandbox.requestRefund(flow.transactionId, { amount: { value: 80, currency: "CNY" } }, "r61-p0-first");
  assert.equal(first.refund.status, "provider_unknown");
  assert.equal(sandbox.listRefunds(flow.transactionId)[0].status, "provider_unknown");
  assert.equal(sandbox.refundReservation(flow.transactionId), 80);
  await assert.rejects(
    sandbox.requestRefund(flow.transactionId, { amount: { value: 221, currency: "CNY" } }, "r61-p0-second"),
    (error) => error.code === "refund_amount_exceeded",
  );
  ledger.close();
});

test("R61-02 replays a confirmed attempt locally without querying the provider", async () => {
  const ledger = new SqliteLedger(":memory:");
  class RecoveryAdapter extends SimulatedPaymentAdapter {
    refund() { return { status: "provider_unknown", reason_code: "timeout" }; }
    recoverRefund() { throw new Error("provider must not be queried"); }
  }
  const adapter = new RecoveryAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const flow = await settledTransaction(sandbox, "r61-p1");
  const first = await sandbox.requestRefund(flow.transactionId, { amount: { value: 80, currency: "CNY" } }, "r61-p1-first");
  const refund = first.refund;
  refund.status = "provider_unknown";
  const attempt = sandbox.refundAttemptById(refund.id);
  ledger.transitionRefundAttempt(attempt.operation_key, { from: "provider_unknown", status: "refunded", provider_reference: "sim_refund_confirmed" });
  sandbox.syncRefundAttempt({ ...attempt, status: "refunded", provider_reference: "sim_refund_confirmed" });
  sandbox.refunds.get(refund.id).status = "provider_unknown";
  const recovered = await sandbox.recoverRefund(refund.id, {}, "r61-p1-recover");
  assert.equal(recovered.refund.status, "refunded");
  assert.equal(sandbox.getTransaction(flow.transactionId).transaction.refunded_amount.value, 80);
  ledger.close();
});

test("F13 serializes concurrent refunds against the remaining settled amount", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const flow = await settledTransaction(sandbox, "concurrent");
  const results = await Promise.allSettled([
    sandbox.requestRefund(flow.transactionId, { amount: { value: 200, currency: "CNY" } }, "f13-refund-concurrent-a"),
    sandbox.requestRefund(flow.transactionId, { amount: { value: 200, currency: "CNY" } }, "f13-refund-concurrent-b"),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.code, "refund_amount_exceeded");
  assert.equal(sandbox.getTransaction(flow.transactionId).transaction.refunded_amount.value, 200);
  assert.equal(sandbox.listRefunds(flow.transactionId).length, 1);
  ledger.close();
});

test("F13 persists provider-unknown refund and recovers it explicitly", async () => {
  class UnknownRefundAdapter extends SimulatedPaymentAdapter {
    refund() {
      throw new ApiError(503, "provider_unknown", "refund_result_unknown", "Refund result is unknown.");
    }
    recoverRefund(transactionId, amount, context) {
      return { status: "refunded", provider_reference: `recovered_${context.refund_id}` };
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "bu2-f13-refund-"));
  const database = join(directory, "refund.sqlite");
  try {
    const firstLedger = new SqliteLedger(database);
    const first = new Bu2Sandbox({ ledger: firstLedger, adapter: new UnknownRefundAdapter({ ledger: firstLedger }) });
    const flow = await settledTransaction(first, "unknown");
    const pending = await first.requestRefund(flow.transactionId, { amount: { value: 300, currency: "CNY" } }, "f13-refund-unknown");
    assert.equal(pending.refund.status, "provider_unknown");
    firstLedger.close();
    const secondLedger = new SqliteLedger(database);
    const second = new Bu2Sandbox({ ledger: secondLedger, adapter: new UnknownRefundAdapter({ ledger: secondLedger }) });
    const recovered = await second.recoverRefund(pending.refund.id, {}, "f13-refund-recover");
    assert.equal(recovered.recovery.status, "refunded");
    assert.equal(recovered.transaction.status, "refunded");
    assert.equal(second.getRefund(pending.refund.id).provider_reference, `recovered_${pending.refund.id}`);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("LA-01 keeps an unknown refund reserved and blocks a second refund", async () => {
  class UnknownRefundAdapter extends SimulatedPaymentAdapter {
    refund() {
      throw new ApiError(503, "provider_unknown", "refund_result_unknown", "Refund result is unknown.");
    }
  }
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new UnknownRefundAdapter({ ledger }) });
  const flow = await settledTransaction(sandbox, "unknown-reserved");
  const pending = await sandbox.requestRefund(
    flow.transactionId,
    { amount: { value: 200, currency: "CNY" } },
    "la01-refund-unknown",
  );
  assert.equal(pending.refund.status, "provider_unknown");
  assert.equal(ledger.getRefundAttemptByRefundId(pending.refund.id).status, "provider_unknown");
  await assert.rejects(
    sandbox.requestRefund(
      flow.transactionId,
      { amount: { value: 101, currency: "CNY" } },
      "la01-refund-second",
    ),
    (error) => error.code === "refund_amount_exceeded",
  );
  assert.equal(sandbox.getTransaction(flow.transactionId).transaction.refunded_amount.value, 0);
  ledger.close();
});

test("LA-01 rejects a provider_unknown result object instead of marking refunded", async () => {
  class UnknownObjectAdapter extends SimulatedPaymentAdapter {
    refund() {
      return { status: "provider_unknown", reason_code: "provider_timeout" };
    }
  }
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new UnknownObjectAdapter({ ledger }) });
  const flow = await settledTransaction(sandbox, "unknown-object");
  const result = await sandbox.requestRefund(
    flow.transactionId,
    { amount: { value: 50, currency: "CNY" } },
    "la01-refund-object",
  );
  assert.equal(result.refund.status, "provider_unknown");
  assert.equal(result.transaction.refunded_amount.value, 0);
  assert.equal(sandbox.wallet.available, 99_700);
  ledger.close();
});

test("LA-01 reuses a persisted confirmed refund after local commit failure", async () => {
  let injectFailure = false;
  class CountingAdapter extends SimulatedPaymentAdapter {
    refundCalls = 0;

    refund(...args) {
      this.refundCalls += 1;
      return super.refund(...args);
    }
  }
  const ledger = new SqliteLedger(":memory:", {
    failureInjector: (stage) => {
      if (injectFailure && stage === "after_state_write") {
        injectFailure = false;
        throw new Error("injected refund commit failure");
      }
    },
  });
  const adapter = new CountingAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const flow = await settledTransaction(sandbox, "commit-failure");
  injectFailure = true;
  await assert.rejects(
    sandbox.requestRefund(
      flow.transactionId,
      { amount: { value: 80, currency: "CNY" } },
      "la01-refund-commit-failure",
    ),
    /injected refund commit failure/,
  );
  assert.equal(adapter.refundCalls, 1);
  const recovered = await sandbox.requestRefund(
    flow.transactionId,
    { amount: { value: 80, currency: "CNY" } },
    "la01-refund-commit-failure",
  );
  assert.equal(recovered.refund.status, "refunded");
  assert.equal(recovered.transaction.refunded_amount.value, 80);
  assert.equal(adapter.refundCalls, 1);
  assert.equal(ledger.refundAttempts(flow.transactionId)[0].status, "refunded");
  ledger.close();
});

test("LA-01 reserves a confirmed but unposted refund for new requests", async () => {
  let injectFailure = false;
  class CountingAdapter extends SimulatedPaymentAdapter {
    refundCalls = 0;

    refund(...args) {
      this.refundCalls += 1;
      return super.refund(...args);
    }
  }
  const ledger = new SqliteLedger(":memory:", {
    failureInjector: (stage) => {
      if (injectFailure && stage === "after_state_write") {
        injectFailure = false;
        throw new Error("injected refund commit failure");
      }
    },
  });
  const adapter = new CountingAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  const flow = await settledTransaction(sandbox, "new-key-recovery");
  injectFailure = true;
  await assert.rejects(
    sandbox.requestRefund(
      flow.transactionId,
      { amount: { value: 80, currency: "CNY" } },
      "la01-refund-new-key-first",
    ),
    /injected refund commit failure/,
  );
  assert.equal(adapter.refundCalls, 1);

  await assert.rejects(
    sandbox.requestRefund(
      flow.transactionId,
      { amount: { value: 221, currency: "CNY" } },
      "la01-refund-new-key-over-capacity",
    ),
    (error) => error.code === "refund_amount_exceeded",
  );
  assert.equal(adapter.refundCalls, 1);

  const recovered = await sandbox.requestRefund(
    flow.transactionId,
    { amount: { value: 80, currency: "CNY" } },
    "la01-refund-new-key-first",
  );
  assert.equal(recovered.refund.status, "refunded");
  assert.equal(recovered.transaction.refunded_amount.value, 80);
  assert.equal(adapter.refundCalls, 1);
  assert.equal(ledger.refundAttempts(flow.transactionId)[0].status, "refunded");
  ledger.close();
});
