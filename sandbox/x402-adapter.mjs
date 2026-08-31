import { createHash } from "node:crypto";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { ApiError } from "./domain.mjs";

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
    resourceUrl,
    paidFetch = null,
    fetchImpl = fetch,
    network = "eip155:84532",
  }) {
    this.ledger = ledger;
    this.resourceUrl = resourceUrl;
    this.paidFetch = paidFetch;
    this.fetchImpl = fetchImpl;
    this.network = network;
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
    return row;
  }

  save({ key, operation, amount, providerReference, status }) {
    return this.ledger.saveAdapterOperation({
      idempotency_key: key,
      operation,
      provider_reference: providerReference,
      amount_value: amount.value,
      currency: amount.currency,
      status,
      created_at: new Date().toISOString(),
    });
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
    const requirement = challenge.accepts?.find(
      (candidate) => candidate.scheme === "exact" && candidate.network === this.network,
    );
    if (!requirement) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_requirement_not_supported",
        "The merchant challenge does not contain the configured exact payment network.",
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
    if (!this.paidFetch) {
      throw new ApiError(
        503,
        "provider_unavailable",
        "x402_signer_unavailable",
        "A funded Base Sepolia buyer signer is required for x402 settlement.",
      );
    }
    const response = await this.paidFetch(this.resourceUrl, {
      headers: { accept: "application/json" },
    });
    const encoded = response.headers.get("payment-response");
    if (!response.ok || !encoded) {
      throw new ApiError(
        502,
        "provider_error",
        "x402_settlement_failed",
        "The x402 paid request did not return a successful settlement response.",
        { status: response.status },
      );
    }
    const settlement = decodePaymentResponseHeader(encoded);
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
}
