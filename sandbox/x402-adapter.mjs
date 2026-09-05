import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
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

const digest = (value) => createHash("sha256").update(value).digest("hex");
const reference = (prefix, value) => `${prefix}_${digest(value).slice(0, 16)}`;
const normalizedAddress = (value) => String(value ?? "").toLowerCase();
const normalizedResourceUrl = (value) => {
  try {
    return new URL(value).href;
  } catch {
    return String(value ?? "");
  }
};
const paymentResourceUrl = (paymentRequired) =>
  normalizedResourceUrl(
    typeof paymentRequired?.resource === "string"
      ? paymentRequired.resource
      : paymentRequired?.resource?.url,
  );

export class X402PaymentAdapter {
  constructor({
    ledger,
    observer = null,
    resourceUrl,
    paidFetch = null,
    paidFetchFactory = null,
    fetchImpl = fetch,
    network = "eip155:84532",
    asset = X402_BASE_SEPOLIA_USDC,
    recoveryQuery = null,
  }) {
    this.ledger = ledger;
    this.observer = observer;
    this.resourceUrl = normalizedResourceUrl(resourceUrl);
    this.paidFetch = paidFetch;
    this.paidFetchFactory = paidFetchFactory;
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
    if (
      operation === "settle" &&
      ["payment_prepared", "payment_submitting", "provider_unknown"].includes(row.status)
    ) {
      throw new ApiError(
        503,
        "provider_unknown",
        "x402_settlement_unknown",
        "The previous x402 payment may have been submitted and must be reconciled before another payment attempt.",
        {
          transaction_id: row.transaction_id,
          recovery_required: true,
          payment_attempt_status: row.status,
        },
      );
    }
    if (operation === "settle" && row.status === "rejected") {
      throw new ApiError(
        409,
        "authorization_error",
        "x402_authorization_rejected",
        "The x402 payment attempt was rejected and requires a new authorization.",
        { transaction_id: row.transaction_id },
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

  validateRequirement(paymentRequired, requirement, amount) {
    const expected = {
      x402_version: 2,
      scheme: "exact",
      network: this.network,
      asset: this.asset.toLowerCase(),
      amount_atomic: expectedAtomicUsdc(amount),
      pay_to: normalizedAddress(requirement?.payTo),
      resource_url: this.resourceUrl,
    };
    const actual = {
      x402_version: paymentRequired?.x402Version,
      scheme: requirement?.scheme,
      network: requirement?.network,
      asset: normalizedAddress(requirement?.asset),
      amount_atomic: String(requirement?.amount ?? ""),
      pay_to: normalizedAddress(requirement?.payTo),
      resource_url: paymentResourceUrl(paymentRequired),
    };
    if (actual.x402_version !== expected.x402_version || actual.scheme !== expected.scheme) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_scheme_mismatch",
        "The merchant challenge does not contain the supported x402 exact scheme.",
      );
    }
    if (actual.network !== expected.network) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_network_mismatch",
        "The merchant challenge network does not match the configured payment network.",
        { expected: expected.network, received: actual.network },
      );
    }
    if (actual.asset !== expected.asset) {
      throw new ApiError(
        422,
        "provider_error",
        "x402_asset_mismatch",
        "The merchant challenge asset does not match the configured payment asset.",
        { expected: expected.asset, received: actual.asset },
      );
    }
    if (actual.amount_atomic !== expected.amount_atomic) {
      throw new ApiError(
        409,
        "provider_error",
        "x402_amount_mismatch",
        "The x402 challenge amount does not match the BU2 authorized amount.",
        { expected: expected.amount_atomic, received: actual.amount_atomic },
      );
    }
    const changedFields = [];
    if (!actual.pay_to) changedFields.push("pay_to");
    if (actual.resource_url !== expected.resource_url) changedFields.push("resource_url");
    if (changedFields.length > 0) {
      throw new ApiError(
        409,
        "authorization_error",
        "x402_authorization_terms_changed",
        "The x402 payment terms do not match the BU2 authorization.",
        { changed_fields: [...new Set(changedFields)].sort() },
      );
    }
    return actual;
  }

  async reserve(transactionId, amount, context = {}) {
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
    const exactRequirements =
      challenge.accepts?.filter((candidate) => candidate.scheme === "exact") ?? [];
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
        { expected: this.network, received: exactRequirements.map(({ network }) => network) },
      );
    }
    const validated = this.validateRequirement(challenge, requirement, amount);
    const terms = {
      ...validated,
      transaction_id: transactionId,
      payment_intent_id: context.payment_intent_id ?? null,
      quote_id: context.quote_id ?? null,
      authorization_id: context.authorization_id ?? null,
      payment_mandate_id: context.payment_mandate_id ?? null,
      payee_account_id: context.payee_account_id ?? null,
      payment_required: challenge,
      selected_requirements: requirement,
    };
    const termsJson = canonicalize(terms);
    this.ledger.saveX402Authorization({
      ...terms,
      terms_json: termsJson,
      terms_fingerprint: digest(termsJson),
      created_at: new Date().toISOString(),
    });
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

  markSettlementUnknown(key, reasonCode) {
    const attempt = this.ledger.getPaymentAttempt(key);
    if (!attempt) {
      throw new ApiError(
        500,
        "internal_error",
        "x402_payment_attempt_missing",
        "The x402 payment attempt was not persisted before provider execution.",
      );
    }
    if (attempt.status !== "provider_unknown") {
      this.ledger.transitionX402PaymentAttempt(key, {
        from: attempt.status,
        status: "provider_unknown",
        reason_code: reasonCode,
      });
    }
    throw new ApiError(
      503,
      "provider_unknown",
      "x402_settlement_unknown",
      "The x402 payment result is unknown and must be reconciled before another payment attempt.",
      {
        transaction_id: attempt.transaction_id,
        payment_attempt_id: attempt.id,
        reason_code: reasonCode,
        recovery_required: true,
      },
    );
  }

  rejectPaymentAttempt(key, reasonCode) {
    const attempt = this.ledger.getPaymentAttempt(key);
    if (attempt && attempt.status !== "rejected") {
      this.ledger.transitionX402PaymentAttempt(key, {
        from: attempt.status,
        status: "rejected",
        reason_code: reasonCode,
      });
    }
  }

  async settleOnce(transactionId, amount, key) {
    if (!this.paidFetch && !this.paidFetchFactory) {
      throw new ApiError(
        503,
        "provider_unavailable",
        "x402_signer_unavailable",
        "A funded Base Sepolia buyer signer is required for x402 settlement.",
      );
    }
    const authorization = this.ledger.getX402Authorization(transactionId);
    if (!authorization) {
      throw new ApiError(
        409,
        "authorization_error",
        "x402_authorization_missing",
        "The transaction does not have persisted x402 authorization terms.",
      );
    }
    if (
      authorization.amount_atomic !== expectedAtomicUsdc(amount) ||
      authorization.asset !== this.asset.toLowerCase() ||
      authorization.network !== this.network ||
      authorization.resource_url !== this.resourceUrl
    ) {
      throw new ApiError(
        409,
        "authorization_error",
        "x402_authorization_context_mismatch",
        "The persisted x402 authorization no longer matches the settlement context.",
      );
    }
    const operationReference = reference(
      "x402_attempt",
      `${transactionId}:${authorization.terms_fingerprint}`,
    );
    const attempt = this.ledger.prepareX402PaymentAttempt({
      operation_key: key,
      transaction_id: transactionId,
      authorization_fingerprint: authorization.terms_fingerprint,
      amount_value: amount.value,
      currency: amount.currency,
      provider_reference: operationReference,
    });
    const beforePaymentCreation = async ({ paymentRequired, selectedRequirements }) => {
      try {
        let actual;
        try {
          actual = this.validateRequirement(paymentRequired, selectedRequirements, amount);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          const changedFieldByCode = {
            x402_scheme_mismatch: "scheme",
            x402_network_mismatch: "network",
            x402_asset_mismatch: "asset",
            x402_amount_mismatch: "amount_atomic",
          };
          throw new ApiError(
            409,
            "authorization_error",
            "x402_authorization_terms_changed",
            "The merchant changed payment terms after BU2 authorization.",
            {
              changed_fields:
                error.details.changed_fields ??
                [changedFieldByCode[error.code] ?? "payment_requirements"],
            },
          );
        }
        const authorized = {
          x402_version: authorization.x402_version,
          scheme: authorization.scheme,
          network: authorization.network,
          asset: authorization.asset,
          amount_atomic: authorization.amount_atomic,
          pay_to: authorization.pay_to,
          resource_url: authorization.resource_url,
        };
        const changedFields = Object.keys(authorized).filter(
          (field) => authorized[field] !== actual[field],
        );
        if (changedFields.length > 0) {
          throw new ApiError(
            409,
            "authorization_error",
            "x402_authorization_terms_changed",
            "The merchant changed payment terms after BU2 authorization.",
            { changed_fields: changedFields.sort() },
          );
        }
        this.ledger.transitionX402PaymentAttempt(key, {
          from: "prepared",
          status: "submitting",
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === "x402_authorization_terms_changed") {
          this.rejectPaymentAttempt(key, error.code);
        }
        throw error;
      }
    };
    const paidFetch = this.paidFetchFactory
      ? this.paidFetchFactory({ beforePaymentCreation, paymentAttempt: attempt })
      : this.paidFetch;
    if (!this.paidFetchFactory) {
      this.ledger.transitionX402PaymentAttempt(key, {
        from: "prepared",
        status: "submitting",
      });
    }
    let response;
    try {
      response = await paidFetch(this.resourceUrl, {
        headers: { accept: "application/json" },
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "x402_authorization_terms_changed") {
        throw error;
      }
      const currentAttempt = this.ledger.getPaymentAttempt(key);
      if (
        currentAttempt?.status === "rejected" &&
        currentAttempt.reason_code === "x402_authorization_terms_changed"
      ) {
        throw new ApiError(
          409,
          "authorization_error",
          "x402_authorization_terms_changed",
          "The merchant changed payment terms after BU2 authorization.",
          { changed_fields: ["payment_requirements"] },
        );
      }
      return this.markSettlementUnknown(
        key,
        error?.name === "AbortError" || error?.name === "FacilitatorTimeoutError"
          ? "x402_facilitator_timeout"
          : "x402_paid_request_interrupted",
      );
    }
    const encoded = response.headers.get("payment-response");
    if (response.status >= 500 || (response.ok && !encoded)) {
      return this.markSettlementUnknown(
        key,
        response.status >= 500
          ? "x402_facilitator_unavailable"
          : "x402_payment_response_missing",
      );
    }
    if (!response.ok) {
      this.rejectPaymentAttempt(key, "x402_settlement_failed");
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
      return this.markSettlementUnknown(key, "x402_payment_response_invalid");
    }
    if (settlement.success !== true) {
      this.rejectPaymentAttempt(key, "x402_settlement_failed");
      throw new ApiError(
        502,
        "provider_error",
        "x402_settlement_failed",
        "The x402 provider reported that settlement failed.",
        { reason: settlement.errorReason ?? null },
      );
    }
    if (settlement.network !== this.network) {
      return this.markSettlementUnknown(key, "x402_payment_response_network_mismatch");
    }
    const providerReference = settlement.transaction || settlement.txHash;
    if (!providerReference) {
      return this.markSettlementUnknown(key, "x402_provider_reference_missing");
    }
    return this.ledger.transitionX402PaymentAttempt(key, {
      from: "submitting",
      status: "settled",
      provider_reference: providerReference,
    }).operation;
  }

  async recoverSettlement(transactionId, amount) {
    const key = `settle:${transactionId}`;
    const operation = this.ledger.getAdapterOperation(key);
    const attempt = this.ledger.getPaymentAttempt(key);
    if (!operation || !attempt) {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "x402_unknown_settlement_missing",
        "No persisted x402 payment attempt exists for this transaction.",
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
    if (
      !["payment_prepared", "payment_submitting", "provider_unknown"].includes(
        operation.status,
      )
    ) {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "x402_settlement_not_recoverable",
        "Only an incomplete or provider_unknown x402 payment can be reconciled.",
        { current_state: operation.status },
      );
    }
    let result = {
      status: "provider_unknown",
      reason_code: "x402_recovery_unavailable",
    };
    if (this.recoveryQuery) {
      try {
        const authorization = this.ledger.getX402Authorization(transactionId);
        const candidate = await this.recoveryQuery({
          transaction_id: transactionId,
          operation_key: key,
          payment_attempt_id: attempt.id,
          request_nonce: attempt.request_nonce,
          provider_reference: operation.provider_reference,
          authorization_fingerprint: authorization?.terms_fingerprint ?? null,
          resource_url: authorization?.resource_url ?? this.resourceUrl,
          network: authorization?.network ?? this.network,
          asset: authorization?.asset ?? this.asset,
          pay_to: authorization?.pay_to ?? null,
          amount_atomic: authorization?.amount_atomic ?? expectedAtomicUsdc(amount),
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
            reason_code: candidate?.reason_code ?? "x402_recovery_result_unknown",
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
