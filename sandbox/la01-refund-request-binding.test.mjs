import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { SqliteLedger } from "./persistence.mjs";

async function settledTransaction(sandbox, suffix) {
  const quote = await sandbox.createQuote({
    seller_agent_id: `agt_binding_${suffix}`,
    payee_account_id: `acct_binding_${suffix}`,
    item: { name: "Refund request binding audit", delivery_type: "research_data" },
    amount: { value: 300, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }, `refund-binding-quote-${suffix}`);
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: "acct_bu2_ventures",
    buyer_agent_id: "agt_research_copilot",
    payment_mandate_id: "mdt_research_04",
    amount: quote.amount,
    purpose: "Refund request binding audit",
  }, `refund-binding-intent-${suffix}`);
  const authorized = await sandbox.decideAuthorization(intent.id, { decision: "authorize" }, `refund-binding-authorize-${suffix}`);
  await sandbox.submitDelivery(authorized.transaction_id, { type: "research_data", evidence_hash: `sha256:${"b".repeat(64)}` }, `refund-binding-delivery-${suffix}`);
  await sandbox.settle(authorized.transaction_id, {}, `refund-binding-settle-${suffix}`);
  return authorized.transaction_id;
}

function openRuntime(database, counter, { failNextRefund = false } = {}) {
  const ledger = new SqliteLedger(database);
  class BindingAuditAdapter extends SimulatedPaymentAdapter {
    refundCalls = 0;

    refund(...args) {
      this.refundCalls += 1;
      counter.calls += 1;
      if (failNextRefund) {
        failNextRefund = false;
        const error = new Error("injected provider rejection before external effect");
        error.no_external_effect = true;
        throw error;
      }
      return super.refund(...args);
    }
  }
  const adapter = new BindingAuditAdapter({ ledger });
  return { ledger, adapter, sandbox: new Bu2Sandbox({ ledger, adapter }) };
}

for (const restart of [false, true]) {
  test(`failed refund attempt binds amount before quota check; restart=${restart}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "bu2-refund-binding-"));
    const database = join(directory, "ledger.sqlite");
    const counter = { calls: 0 };
    let runtime = openRuntime(database, counter, { failNextRefund: true });
    try {
      const transactionId = await settledTransaction(runtime.sandbox, restart ? "failed-restart" : "failed-inprocess");
      const originalKey = `refund-binding-failed-${restart}`;
      await assert.rejects(
        runtime.sandbox.requestRefund(transactionId, { amount: { value: 80, currency: "CNY" }, reason: "customer_request" }, originalKey),
        /injected provider rejection before external effect/,
      );
      assert.equal(counter.calls, 1);
      const attemptBeforeRestart = runtime.ledger.refundAttempts(transactionId)[0];
      assert.equal(attemptBeforeRestart.status, "failed");
      assert.match(attemptBeforeRestart.request_fingerprint, /^[0-9a-f]{64}$/);

      if (restart) {
        runtime.ledger.close();
        runtime = openRuntime(database, counter);
      }
      const attemptAfterRestart = runtime.ledger.refundAttempts(transactionId)[0];
      assert.equal(attemptAfterRestart.request_fingerprint, attemptBeforeRestart.request_fingerprint);

      const second = await runtime.sandbox.requestRefund(
        transactionId,
        { amount: { value: 260, currency: "CNY" }, reason: "remaining_balance" },
        `refund-binding-second-${restart}`,
      );
      assert.equal(second.transaction.refunded_amount.value, 260);
      assert.equal(counter.calls, 2);

      await assert.rejects(
        runtime.sandbox.requestRefund(
          transactionId,
          { amount: { value: 1, currency: "CNY" }, reason: "customer_request" },
          originalKey,
        ),
        (error) => error.code === "refund_attempt_conflict",
      );
      assert.equal(counter.calls, 2);
      assert.equal(runtime.sandbox.getTransaction(transactionId).transaction.refunded_amount.value, 260);

      await assert.rejects(
        runtime.sandbox.requestRefund(
          transactionId,
          { amount: { value: 80, currency: "CNY" }, reason: "customer_request" },
          originalKey,
        ),
        (error) => error.code === "refund_amount_exceeded",
      );
      assert.equal(counter.calls, 2);
    } finally {
      runtime.ledger.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("confirmed unposted refund rejects changed terms before local recovery", async () => {
  let injectFailure = false;
  const counter = { calls: 0 };
  const ledger = new SqliteLedger(":memory:", {
    failureInjector(stage) {
      if (injectFailure && stage === "after_state_write") {
        injectFailure = false;
        throw new Error("injected local refund commit failure");
      }
    },
  });
  class CountingAdapter extends SimulatedPaymentAdapter {
    refundCalls = 0;

    refund(...args) {
      this.refundCalls += 1;
      counter.calls += 1;
      return super.refund(...args);
    }
  }
  const adapter = new CountingAdapter({ ledger });
  const sandbox = new Bu2Sandbox({ ledger, adapter });
  try {
    const transactionId = await settledTransaction(sandbox, "confirmed-term-drift");
    const key = "refund-binding-confirmed";
    injectFailure = true;
    await assert.rejects(
      sandbox.requestRefund(transactionId, { amount: { value: 80, currency: "CNY" }, reason: "customer_request" }, key),
      /injected local refund commit failure/,
    );
    assert.equal(counter.calls, 1);
    await assert.rejects(
      sandbox.requestRefund(transactionId, { amount: { value: 1, currency: "CNY" }, reason: "customer_request" }, key),
      (error) => error.code === "refund_attempt_conflict",
    );
    assert.equal(counter.calls, 1);
    const recovered = await sandbox.requestRefund(transactionId, { amount: { value: 80, currency: "CNY" }, reason: "customer_request" }, key);
    assert.equal(recovered.transaction.refunded_amount.value, 80);
    assert.equal(counter.calls, 1);
  } finally {
    ledger.close();
  }
});
