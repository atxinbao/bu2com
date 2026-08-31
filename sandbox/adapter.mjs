import { randomUUID } from "node:crypto";
import { ApiError } from "./domain.mjs";

export class SimulatedPaymentAdapter {
  constructor({ ledger }) {
    this.ledger = ledger;
    this.name = "bu2_simulated_provider";
  }

  execute(operation, idempotencyKey, amount) {
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
      return existing;
    }
    return this.ledger.saveAdapterOperation({
      idempotency_key: idempotencyKey,
      operation,
      provider_reference: `sim_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      amount_value: amount.value,
      currency: amount.currency,
      status: operation === "reserve" ? "reserved" : "settled",
      created_at: new Date().toISOString(),
    });
  }

  reserve(transactionId, amount) {
    return this.execute("reserve", `reserve:${transactionId}`, amount);
  }

  settle(transactionId, amount) {
    return this.execute("settle", `settle:${transactionId}`, amount);
  }
}
