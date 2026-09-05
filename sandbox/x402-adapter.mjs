import { createHash } from "node:crypto";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { ApiError } from "./domain.mjs";

export const X402_BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const expectedAtomicUsdc = (amount) => {
  if (amount.currency !== "USD") {
    throw new ApiError(
      400,
      "validation_error",
      "x402_currency_not_supported",
      "The x402 Base Sepolia adapter currently accepts USD amounts only.",
    );
  }
  return String(amount.value * 10_000);
};

const reference = (prefix, value) =>
  `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

export class X402PaymentAdapter {
  constructor({
    ledger,
    observer = null,
    resourceUrl,
    paidFetch = null,
    fetchImpl = fetch,
    network = "eip155:84532",
    asset = X402_BASE_SEPOLIA_USDC,
    recoveryQuery = null,
  }) {
    this.ledger = ledger;
    this.observer = observer;
    this.resourceUrl = resourceUrl;
    this.paidFetch = paidFetch;
    this.fetchImpl = fetchImpl;
    this.network = network;
    this.asset = asset;
    this.recoveryQuery = recoveryQuery;
    this.inFlightSettlements = new Map();
    this.name = "x402_exact_base_sepolia";
  }

  existing(key, operation, amount) {
    const row = this.ledger.getAdapterOperation(key);
    if (!row) return null;
    if (
      row.operation !== operation ||
      row.amount_value !== amount.value ||
      row.currency !== amount.currency
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
      transaction_id: key.split(":", 2)[1],
      provider_reference: row.provider_reference,
      status: row.status,
    });
    if (operation === "settle" && row.status === "provider_unknown") {
      throw new ApiError(
        503,
        "provider_unknown",
        "x402_settlement_unknown",
        "The previous x402 payment may have been submitted and must be recovered before another payment attempt.",
        {
          transaction_id: row.transaction_id,
          recovery_required: true,
        },
      );
    }
    return row;
  }

  save({ key, operation, amount, providerReference, status, lastError = null }) {
    const transactionId = key.split(":", 2)[1];
    const result = this.ledger.saveAdapterOperation({
      idempotency_key: key,
      operation,
      transaction_id: transactionId,
      provider_reference: providerReference,
      amount_value: amount.value,
      currency: amount.currency,
      status,
      last_error: lastError,
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

  async reserve(transactionId, amount) {
    const key = `reserve:${transactionId}`;
    const replay = this.existing(key, "reserve", amount);
    if (replay) return replay;

    const response = await this.fetchImpl(this.resourceUrl, {
      headers: { accept: "application/json" },
    });
    const encoded = response.headers.get("payment-required");
    if (response.status !== 402 || !encoded) {
      throw new ApiError(
        502,
        "provider_error",
        "x402_challenge_missing",
        "The x402 merchant did not return a valid payment challenge.",
      );
    }
    const challenge = decodePaymentRequiredHeader(encoded);
    const exactRequirements = challenge.accepts?.filter(
      (candidate) => candidate.scheme === "exact",
    ) ?? [];
    if (exactRequirements.length === 0) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_scheme_mismatch",
        "The merchant challenge does not contain the exact payment scheme.",
      );
    }
    const requirement = exactRequirements.find(
      (candidate) => candidate.network === this.network,
    );
    if (!requirement) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_network_mismatch",
        "The merchant challenge does not contain the configured payment network.",
        {
          expected: this.network,
          received: exactRequirements.map((candidate) => candidate.network),
        },
      );
    }
    if (String(requirement.asset).toLowerCase() !== this.asset.toLowerCase()) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_asset_mismatch",
        "The merchant challenge asset does not match the configured payment asset.",
        { expected: this.asset, received: String(requirement.asset) },
      );
    }
    if (String(requirement.amount) !== expectedAtomicUsdc(amount)) {
      throw new ApiError(
        409,
        "provider_error",
        "x402_amount_mismatch",
        "The x402 challenge amount does not match the BU2 authorized amount.",
        { expected: expectedAtomicUsdc(amount), received: String(requirement.amount) },
      );
    }
    return this.save({
      key,
      operation: "reserve",
      amount,
      providerReference: reference("x402_req", encoded),
      status: "payment_required",
    });
  }

  async settle(transactionId, amount) {
    const key = `settle:${transactionId}`;
    const replay = this.existing(key, "settle", amount);
    if (replay) return replay;
    const inFlight = this.inFlightSettlements.get(key);
    if (inFlight) return inFlight;
    const settlement = this.settleOnce(transactionId, amount, key);
    this.inFlightSettlements.set(key, settlement);
    try {
      return await settlement;
    } finally {
      this.inFlightSettlements.delete(key);
    }
  }

  markSettlementUnknown(key, amount, reasonCode) {
    const operation = this.save({
      key,
      operation: "settle",
      amount,
      providerReference: reference("x402_unknown", key),
      status: "provider_unknown",
      lastError: reasonCode,
    });
    throw new ApiError(
      503,
      "provider_unknown",
      "x402_settlement_unknown",
      "The x402 payment result is unknown and must be recovered before another payment attempt.",
      {
        transaction_id: operation.transaction_id,
        reason_code: reasonCode,
        recovery_required: true,
      },
    );
  }

  async settleOnce(transactionId, amount, key) {
    if (!this.paidFetch) {
      throw new ApiError(
        503,
        "provider_unavailable",
        "x402_signer_unavailable",
        "A funded Base Sepolia buyer signer is required for x402 settlement.",
      );
    }
    let response;
    try {
      response = await this.paidFetch(this.resourceUrl, {
        headers: { accept: "application/json" },
      });
    } catch (error) {
      return this.markSettlementUnknown(
        key,
        amount,
        error?.name === "AbortError" || error?.name === "FacilitatorTimeoutError"
          ? "x402_facilitator_timeout"
          : "x402_paid_request_interrupted",
      );
    }
    const encoded = response.headers.get("payment-response");
    if (response.status >= 500 || (response.ok && !encoded)) {
      return this.markSettlementUnknown(
        key,
        amount,
        response.status >= 500
          ? "x402_facilitator_unavailable"
          : "x402_payment_response_missing",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        502,
        "provider_error",
        "x402_settlement_failed",
        "The x402 paid request did not return a successful settlement response.",
        { status: response.status },
      );
    }
    let settlement;
    try {
      settlement = decodePaymentResponseHeader(encoded);
    } catch {
      return this.markSettlementUnknown(
        key,
        amount,
        "x402_payment_response_invalid",
      );
    }
    if (settlement.success !== true) {
      throw new ApiError(
        502,
        "provider_error",
        "x402_settlement_failed",
        "The x402 provider reported that settlement failed.",
        { reason: settlement.errorReason ?? null },
      );
    }
    if (settlement.network !== this.network) {
      return this.markSettlementUnknown(
        key,
        amount,
        "x402_payment_response_network_mismatch",
      );
    }
    const providerReference =
      settlement.transaction || settlement.txHash || reference("x402_stl", encoded);
    return this.save({
      key,
      operation: "settle",
      amount,
      providerReference,
      status: "settled",
    });
  }

  async recoverSettlement(transactionId, amount) {
    const key = `settle:${transactionId}`;
    const operation = this.ledger.getAdapterOperation(key);
    if (!operation) {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "x402_unknown_settlement_missing",
        "No unknown x402 settlement exists for this transaction.",
      );
    }
    if (
      operation.operation !== "settle" ||
      operation.amount_value !== amount.value ||
      operation.currency !== amount.currency
    ) {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "adapter_idempotency_conflict",
        "Adapter operation does not match the transaction settlement details.",
      );
    }
    if (operation.status === "settled") {
      const recorded = this.ledger.recordAdapterRecovery({
        operation_key: key,
        transaction_id: transactionId,
        status: "settled",
        provider_reference: operation.provider_reference,
        reason_code: "x402_operation_already_settled",
      });
      return {
        ...recorded.operation,
        recovery_attempt_id: recorded.attempt.id,
        recovery_reason_code: null,
      };
    }
    if (operation.status !== "provider_unknown") {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "x402_settlement_not_recoverable",
        "Only a provider_unknown x402 settlement can be recovered.",
        { current_state: operation.status },
      );
    }

    let result = {
      status: "provider_unknown",
      reason_code: "x402_recovery_unavailable",
    };
    if (this.recoveryQuery) {
      try {
        const candidate = await this.recoveryQuery({
          transaction_id: transactionId,
          operation_key: key,
          provider_reference: operation.provider_reference,
          resource_url: this.resourceUrl,
          network: this.network,
          asset: this.asset,
        });
        if (candidate?.status === "settled" && candidate.provider_reference) {
          result = {
            status: "settled",
            provider_reference: candidate.provider_reference,
            reason_code: null,
          };
        } else {
          result = {
            status: "provider_unknown",
            reason_code:
              candidate?.reason_code ?? "x402_recovery_result_unknown",
          };
        }
      } catch {
        result = {
          status: "provider_unknown",
          reason_code: "x402_recovery_query_failed",
        };
      }
    }
    const recorded = this.ledger.recordAdapterRecovery({
      operation_key: key,
      transaction_id: transactionId,
      status: result.status,
      provider_reference: result.provider_reference ?? null,
      reason_code: result.reason_code,
    });
    this.observer?.record(
      result.status === "settled" ? "adapter" : "unknown_result",
      "adapter.settlement.recovery_completed",
      {
        adapter: this.name,
        transaction_id: transactionId,
        status: result.status,
        reason_code: result.reason_code,
        provider_reference: result.provider_reference,
        recovery_attempt_id: recorded.attempt.id,
      },
    );
    return {
      ...recorded.operation,
      recovery_attempt_id: recorded.attempt.id,
      recovery_reason_code: result.reason_code,
    };
  }
}
