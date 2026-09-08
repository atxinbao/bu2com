import { randomUUID } from "node:crypto";
import { ApiError } from "./domain.mjs";

export class SimulatedPaymentAdapter {
  constructor({ ledger, observer = null }) {
    this.ledger = ledger;
    this.observer = observer;
    this.name = "bu2_simulated_provider";
  }

  execute(operation, idempotencyKey, transactionId, amount) {
    const existing = this.ledger.getAdapterOperation(idempotencyKey);
    if (existing) {
      if (
        existing.operation !== operation ||
        existing.amount_value !== amount.value ||
        existing.currency !== amount.currency
      ) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "adapter_idempotency_conflict",
          "Adapter idempotency key was reused with different payment details.",
        );
      }
      this.observer?.record("adapter", "adapter.operation.replayed", {
        adapter: this.name,
        operation,
        transaction_id: transactionId,
        provider_reference: existing.provider_reference,
        status: existing.status,
      });
      return existing;
    }
    const result = this.ledger.saveAdapterOperation({
      idempotency_key: idempotencyKey,
      operation,
      transaction_id: transactionId,
      provider_reference: `sim_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      amount_value: amount.value,
      currency: amount.currency,
      status: operation === "reserve" ? "reserved" : "settled",
      created_at: new Date().toISOString(),
    });
    this.observer?.record("adapter", "adapter.operation.completed", {
      adapter: this.name,
      operation,
      transaction_id: transactionId,
      provider_reference: result.provider_reference,
      status: result.status,
    });
    return result;
  }

  reserve(transactionId, amount) {
    return this.execute(
      "reserve",
      `reserve:${transactionId}`,
      transactionId,
      amount,
    );
  }

  settle(transactionId, amount) {
    return this.execute(
      "settle",
      `settle:${transactionId}`,
      transactionId,
      amount,
    );
  }

  verifyInboundPayment({ receivable, input }) {
    if (input.collection_reference !== receivable.collection_reference) {
      throw new ApiError(
        409,
        "provider_error",
        "collection_reference_mismatch",
        "The simulated provider reference does not match the Receivable collection reference.",
      );
    }
    return {
      status: "verified",
      provider: this.name,
      provider_reference: input.provider_reference,
      collection_reference: input.collection_reference,
      amount: input.amount ?? receivable.amount,
      asset: input.asset ?? receivable.asset,
      network: input.network ?? receivable.network,
      payer_account_id: input.payer_account_id ?? null,
      payer_agent_id: input.payer_agent_id ?? null,
      verified_at: new Date().toISOString(),
      verification_mode: "simulation",
    };
  }
}
