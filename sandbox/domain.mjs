import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { classifyOperationalError } from "./observability.mjs";
import {
  CURRENT_RECEIPT_SCHEMA_VERSION,
  RECEIPT_CANONICALIZATION_VERSION,
  RECEIPT_SIGNATURE_ALGORITHM,
  canonicalReceiptPayload,
  interpretReceiptEnvironment,
  receiptEnvironmentMatches,
  verifyReceiptSignature,
} from "./receipt-contract.mjs";

export class ApiError extends Error {
  constructor(status, type, code, message, details = {}) {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
    this.details = details;
  }
}

const prefix = (value) => `${value}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const clone = (value) => structuredClone(value);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function requireFields(value, fields) {
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      throw new ApiError(
        400,
        "validation_error",
        "missing_field",
        `Missing required field: ${field}`,
        { field },
      );
    }
  }
}

function validateAmount(amount) {
  requireFields(amount ?? {}, ["value", "currency"]);
  if (!Number.isInteger(amount.value) || amount.value < 0) {
    throw new ApiError(
      400,
      "validation_error",
      "invalid_amount",
      "Amount value must be a non-negative integer in minor units.",
    );
  }
  if (!/^[A-Z]{3}$/.test(amount.currency)) {
    throw new ApiError(
      400,
      "validation_error",
      "invalid_currency",
      "Currency must be an ISO 4217 uppercase code.",
    );
  }
}

export class Bu2Sandbox {
  constructor({
    ledger = null,
    adapter = null,
    initialWallet = null,
    observer = null,
    environmentConfig = null,
  } = {}) {
    this.ledger = ledger;
    this.adapter = adapter;
    this.observer = observer;
    this.environmentConfig = environmentConfig ?? {
      environment_contract_version: "1.0",
      environment: "local",
      payment_adapter: "simulated",
      chain_id: null,
      network: null,
      execution_status: "execution_enabled",
    };
    const restored = ledger?.loadState() ?? {
      resources: {},
      state: {},
      idempotency: [],
      events: [],
    };
    this.quotes = new Map(restored.resources.quotes ?? []);
    this.intents = new Map(restored.resources.intents ?? []);
    this.transactions = new Map(restored.resources.transactions ?? []);
    this.deliveries = new Map(restored.resources.deliveries ?? []);
    this.receipts = new Map(restored.resources.receipts ?? []);
    this.idempotency = new Map(restored.idempotency ?? []);
    this.events = restored.events ?? [];
    this.stateRevision = Number(restored.state.state_revision ?? 0);
    this.wallet =
      restored.state.wallet ??
      initialWallet ?? {
        id: "wal_demo_buyer",
        available: 100_000,
        reserved: 0,
        currency: "CNY",
      };
    this.knownPayees = new Set(restored.state.known_payees ?? []);
    this.inFlightIdempotency = new Map();
    this.mutationQueue = Promise.resolve();
    this.mutationContext = new AsyncLocalStorage();
    const keys = generateKeyPairSync("ed25519");
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
    this.publicKeyBase64 = this.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    this.verificationKeyId = `key_bu2_${createHash("sha256")
      .update(this.publicKeyBase64)
      .digest("hex")
      .slice(0, 16)}`;
    this.trustedVerificationKeys = new Map([
      [
        this.verificationKeyId,
        {
          key_id: this.verificationKeyId,
          algorithm: RECEIPT_SIGNATURE_ALGORITHM,
          public_key: this.publicKeyBase64,
          status: "trusted",
          registered_at: new Date().toISOString(),
          revoked_at: null,
        },
      ],
    ]);
    this.ledger?.registerReceiptVerificationKey({
      key_id: this.verificationKeyId,
      algorithm: RECEIPT_SIGNATURE_ALGORITHM,
      public_key: this.publicKeyBase64,
    });
  }

  validateIdempotency(scope, key, body) {
    if (!key || key.length < 8) {
      throw new ApiError(
        400,
        "validation_error",
        "missing_idempotency_key",
        "Idempotency-Key must contain at least 8 characters.",
      );
    }
    const storeKey = `${scope}:${key}`;
    return { storeKey, fingerprint: hash(body) };
  }

  idempotencyReplay(storeKey, fingerprint) {
    const existing = this.idempotency.get(storeKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "idempotency_key_reused",
          "The same idempotency key was used with a different request body.",
        );
      }
      return clone(existing.result);
    }
    return null;
  }

  enqueueMutation(operation) {
    const execution = this.mutationQueue.then(operation, operation);
    this.mutationQueue = execution.catch(() => undefined);
    return execution;
  }

  captureState() {
    return {
      resources: {
        quotes: [...this.quotes.entries()].map(([id, value]) => [id, clone(value)]),
        intents: [...this.intents.entries()].map(([id, value]) => [id, clone(value)]),
        transactions: [...this.transactions.entries()].map(([id, value]) => [id, clone(value)]),
        deliveries: [...this.deliveries.entries()].map(([id, value]) => [id, clone(value)]),
        receipts: [...this.receipts.entries()].map(([id, value]) => [id, clone(value)]),
      },
      wallet: clone(this.wallet),
      knownPayees: [...this.knownPayees],
    };
  }

  restoreState(snapshot) {
    this.quotes = new Map(snapshot.resources.quotes ?? []);
    this.intents = new Map(snapshot.resources.intents ?? []);
    this.transactions = new Map(snapshot.resources.transactions ?? []);
    this.deliveries = new Map(snapshot.resources.deliveries ?? []);
    this.receipts = new Map(snapshot.resources.receipts ?? []);
    this.wallet = clone(snapshot.wallet);
    this.knownPayees = new Set(snapshot.knownPayees ?? []);
  }

  reloadCommittedState() {
    if (!this.ledger) return;
    const restored = this.ledger.loadState();
    this.restoreState({
      resources: restored.resources,
      wallet: restored.state.wallet ?? this.wallet,
      knownPayees: restored.state.known_payees ?? [],
    });
    this.idempotency = new Map(restored.idempotency ?? []);
    this.events = restored.events ?? [];
    this.stateRevision = Number(restored.state.state_revision ?? 0);
  }

  async runIdempotentAsync(scope, key, body, operation) {
    const { storeKey, fingerprint } = this.validateIdempotency(scope, key, body);
    const replay = this.idempotencyReplay(storeKey, fingerprint);
    if (replay) return replay;
    const inFlight = this.inFlightIdempotency.get(storeKey);
    if (inFlight) {
      if (inFlight.fingerprint !== fingerprint) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "idempotency_key_reused",
          "The same idempotency key was used with a different request body.",
        );
      }
      return clone(await inFlight.promise);
    }
    const execution = this.enqueueMutation(async () => {
      const queuedReplay = this.idempotencyReplay(storeKey, fingerprint);
      if (queuedReplay) return queuedReplay;
      const ownerToken = randomUUID();
      const createdAt = new Date().toISOString();
      const claim = this.ledger?.claimIdempotency({
        scopeKey: storeKey,
        fingerprint,
        ownerToken,
        createdAt,
      });
      if (claim?.status === "succeeded") {
        this.reloadCommittedState();
        this.idempotency.set(storeKey, {
          fingerprint,
          result: clone(claim.result),
        });
        return clone(claim.result);
      }
      const before = this.captureState();
      const expectedRevision = this.stateRevision;
      const context = { events: [] };
      try {
        const result = await this.mutationContext.run(context, operation);
        const snapshot = this.captureState();
        const nextRevision = this.ledger?.commitDomainMutation({
          snapshot,
          events: context.events,
          idempotency: {
            scopeKey: storeKey,
            fingerprint,
            ownerToken,
            result: clone(result),
          },
          expectedRevision,
          expectedWallet: before.wallet,
        });
        this.idempotency.set(storeKey, { fingerprint, result: clone(result) });
        this.events.push(...context.events);
        if (nextRevision !== undefined) this.stateRevision = nextRevision;
        for (const event of context.events) {
          this.observer?.record("state", "transaction.event.appended", {
            event_type: event.type,
            resource_id: event.resource_id,
            ...event.correlation,
          });
        }
        return clone(result);
      } catch (error) {
        if (this.ledger) {
          this.ledger.releaseIdempotency(storeKey, ownerToken);
          this.reloadCommittedState();
        } else {
          this.restoreState(before);
        }
        throw error;
      }
    });
    this.inFlightIdempotency.set(storeKey, { fingerprint, promise: execution });
    try {
      return clone(await execution);
    } finally {
      if (this.inFlightIdempotency.get(storeKey)?.promise === execution) {
        this.inFlightIdempotency.delete(storeKey);
      }
    }
  }

  event(type, resource) {
    const transactionId = resource.id?.startsWith("txn_")
      ? resource.id
      : resource.transaction_id;
    const paymentIntentId =
      resource.payment_intent_id ??
      (resource.id?.startsWith("pi_") ? resource.id : undefined);
    const providerReference =
      resource.settlement_provider_reference ??
      resource.reserve_provider_reference;
    const event = {
      id: prefix("evt"),
      type,
      resource_id: resource.id,
      created_at: new Date().toISOString(),
    };
    event.correlation = this.observer?.context({
      event_id: event.id,
      transaction_id: transactionId,
      payment_intent_id: paymentIntentId,
      provider_reference: providerReference,
    }) ?? Object.fromEntries(
      Object.entries({
        event_id: event.id,
        transaction_id: transactionId,
        payment_intent_id: paymentIntentId,
        provider_reference: providerReference,
      }).filter(([, value]) => value),
    );
    const context = this.mutationContext.getStore();
    if (!context) {
      throw new ApiError(
        500,
        "internal_error",
        "event_outside_transaction",
        "Ledger events must be recorded inside a domain transaction.",
      );
    }
    context.events.push(event);
    return event;
  }

  async executeAdapter(operation, transactionId, amount, context = undefined) {
    try {
      return await this.adapter?.[operation](transactionId, amount, context);
    } catch (error) {
      this.observer?.record(
        classifyOperationalError(error),
        "adapter.operation.failed",
        {
          operation,
          transaction_id: transactionId,
          error_type: error.type ?? "internal_error",
          error_code: error.code ?? "unexpected_error",
        },
      );
      throw error;
    }
  }

  async createQuote(input, key) {
    return this.runIdempotentAsync("quotes", key, input, async () => {
      requireFields(input, ["seller_agent_id", "payee_account_id", "item", "amount", "expires_at"]);
      requireFields(input.item, ["name", "delivery_type"]);
      validateAmount(input.amount);
      const quote = {
        id: prefix("quo"),
        ...clone(input),
        status: "active",
        created_at: new Date().toISOString(),
      };
      this.quotes.set(quote.id, quote);
      this.event("quote.created", quote);
      return quote;
    });
  }

  async createPaymentIntent(input, key) {
    return this.runIdempotentAsync("payment_intents", key, input, async () => {
      requireFields(input, [
        "quote_id",
        "payer_account_id",
        "buyer_agent_id",
        "payment_mandate_id",
        "amount",
        "purpose",
      ]);
      validateAmount(input.amount);
      const quote = this.quotes.get(input.quote_id);
      if (!quote)
        throw new ApiError(404, "resource_not_found", "quote_not_found", "Quote was not found.");
      if (quote.status !== "active")
        throw new ApiError(
          409,
          "invalid_state_transition",
          "quote_not_active",
          "Quote is not active.",
        );
      if (
        input.amount.value !== quote.amount.value ||
        input.amount.currency !== quote.amount.currency
      ) {
        throw new ApiError(
          400,
          "validation_error",
          "quote_amount_mismatch",
          "Payment amount must exactly match the quote.",
        );
      }
      let decision = "allowed";
      let reason_code = "mandate_match";
      if (input.amount.value > 5000) {
        decision = "denied";
        reason_code = "amount_above_mandate";
      } else if (!this.knownPayees.has(quote.payee_account_id)) {
        decision = "review_required";
        reason_code = "first_time_payee";
      }
      const status =
        decision === "allowed"
          ? "authorized"
          : decision === "denied"
            ? "declined"
            : "requires_authorization";
      const intent = {
        id: prefix("pi"),
        ...clone(input),
        payee_account_id: quote.payee_account_id,
        seller_agent_id: quote.seller_agent_id,
        status,
        transaction_id: null,
        authorization: {
          id: prefix("auth"),
          decision,
          reason_code,
          matched_rules: ["category:research_data", "amount_lte:5000"],
        },
        created_at: new Date().toISOString(),
      };
      this.intents.set(intent.id, intent);
      this.observer?.record("policy", "payment_mandate.evaluated", {
        payment_intent_id: intent.id,
        account_id: intent.payer_account_id,
        agent_id: intent.buyer_agent_id,
        decision,
        reason_code,
      });
      this.event(
        decision === "review_required"
          ? "payment_intent.authorization_required"
          : `payment_intent.${status}`,
        intent,
      );
      if (decision === "allowed") await this.reserve(intent);
      return this.getPaymentIntent(intent.id);
    });
  }

  getPaymentIntent(id) {
    const intent = this.intents.get(id);
    if (!intent)
      throw new ApiError(
        404,
        "resource_not_found",
        "payment_intent_not_found",
        "Payment intent was not found.",
      );
    return clone(intent);
  }

  transactionView(transaction) {
    const intent = this.intents.get(transaction.payment_intent_id) ?? null;
    const quote = intent ? (this.quotes.get(intent.quote_id) ?? null) : null;
    const delivery = transaction.delivery_id
      ? (this.deliveries.get(transaction.delivery_id) ?? null)
      : null;
    const receipt = transaction.receipt_id
      ? (this.receipts.get(transaction.receipt_id) ?? null)
      : null;
    let receiptView = null;
    if (receipt) {
      const { receipt_id: _receiptId, ...verification } = this.verifyReceipt(receipt.id);
      receiptView = { ...clone(receipt), ...verification };
    }
    const settlementOperation = this.ledger?.getAdapterOperation(
      `settle:${transaction.id}`,
    );
    return {
      transaction: clone(transaction),
      payment_intent: intent ? clone(intent) : null,
      quote: quote ? clone(quote) : null,
      delivery: delivery ? clone(delivery) : null,
      receipt: receiptView,
      payment_channel: this.adapter?.name ?? "none",
      settlement_control: settlementOperation
        ? {
            status: settlementOperation.status,
            provider_reference: settlementOperation.provider_reference,
            reason_code: settlementOperation.last_error ?? null,
            updated_at:
              settlementOperation.updated_at ?? settlementOperation.created_at,
            resolved_at: settlementOperation.resolved_at ?? null,
            recovery_attempts:
              this.ledger?.adapterRecoveryAttempts(transaction.id).length ?? 0,
          }
        : null,
    };
  }

  listTransactions() {
    return [...this.transactions.values()]
      .sort((left, right) => {
        const byCreatedAt = right.created_at.localeCompare(left.created_at);
        return byCreatedAt || right.id.localeCompare(left.id);
      })
      .map((transaction) => this.transactionView(transaction));
  }

  getTransaction(id) {
    const transaction = this.transactions.get(id);
    if (!transaction)
      throw new ApiError(
        404,
        "resource_not_found",
        "transaction_not_found",
        "Transaction was not found.",
      );
    return this.transactionView(transaction);
  }

  async decideAuthorization(id, input, key) {
    return this.runIdempotentAsync(
      `payment_intents/${id}/authorization`,
      key,
      input,
      async () => {
        requireFields(input, ["decision"]);
        const intent = this.intents.get(id);
        if (!intent)
          throw new ApiError(
            404,
            "resource_not_found",
            "payment_intent_not_found",
            "Payment intent was not found.",
          );
        if (intent.status !== "requires_authorization") {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "intent_not_reviewable",
            "Only requires_authorization intents can be decided.",
            { current_state: intent.status },
          );
        }
        if (input.decision === "decline") {
          intent.status = "declined";
          intent.authorization.decision = "denied";
          this.event("payment_intent.declined", intent);
          return clone(intent);
        }
        if (input.decision !== "authorize")
          throw new ApiError(
            400,
            "validation_error",
            "invalid_decision",
            "Decision must be authorize or decline.",
          );
        const wasKnownPayee = this.knownPayees.has(intent.payee_account_id);
        intent.status = "authorized";
        intent.authorization.decision = "allowed";
        intent.authorization.reason_code = "human_confirmation";
        this.knownPayees.add(intent.payee_account_id);
        try {
          return await this.reserve(intent, { emitAuthorization: true });
        } catch (error) {
          intent.status = "requires_authorization";
          intent.authorization.decision = "review_required";
          intent.authorization.reason_code = "first_time_payee";
          if (!wasKnownPayee) this.knownPayees.delete(intent.payee_account_id);
          throw error;
        }
      },
    );
  }

  async reserve(intent, { emitAuthorization = false } = {}) {
    if (this.wallet.currency !== intent.amount.currency)
      throw new ApiError(
        409,
        "validation_error",
        "wallet_currency_mismatch",
        "Wallet currency must match the payment intent currency.",
      );
    if (this.wallet.available < intent.amount.value)
      throw new ApiError(
        409,
        "insufficient_funds",
        "wallet_balance_too_low",
        "Wallet has insufficient available funds.",
      );
    const zero = { value: 0, currency: intent.amount.currency };
    const transaction = {
      id: prefix("txn"),
      payment_intent_id: intent.id,
      status: "funds_reserved",
      authorized_amount: clone(intent.amount),
      reserved_amount: clone(intent.amount),
      settled_amount: clone(zero),
      refunded_amount: clone(zero),
      created_at: new Date().toISOString(),
    };
    const provider = await this.executeAdapter(
      "reserve",
      transaction.id,
      intent.amount,
      {
        payment_intent_id: intent.id,
        quote_id: intent.quote_id,
        authorization_id: intent.authorization.id,
        payment_mandate_id: intent.payment_mandate_id,
        payee_account_id: intent.payee_account_id,
      },
    );
    if (provider) transaction.reserve_provider_reference = provider.provider_reference;
    if (emitAuthorization) this.event("payment_intent.authorized", intent);
    this.wallet.available -= intent.amount.value;
    this.wallet.reserved += intent.amount.value;
    this.transactions.set(transaction.id, transaction);
    intent.transaction_id = transaction.id;
    intent.status = "funds_reserved";
    this.event("transaction.funds_reserved", transaction);
    return clone(intent);
  }

  async submitDelivery(transactionId, input, key) {
    return this.runIdempotentAsync(
      `transactions/${transactionId}/deliveries`,
      key,
      input,
      async () => {
        requireFields(input, ["type", "evidence_hash"]);
        if (!/^sha256:/.test(input.evidence_hash))
          throw new ApiError(
            400,
            "validation_error",
            "invalid_evidence_hash",
            "Evidence hash must start with sha256:.",
          );
        const transaction = this.transactions.get(transactionId);
        if (!transaction)
          throw new ApiError(
            404,
            "resource_not_found",
            "transaction_not_found",
            "Transaction was not found.",
          );
        if (transaction.status !== "funds_reserved")
          throw new ApiError(
            409,
            "invalid_state_transition",
            "transaction_not_reserved",
            "Funds must be reserved before delivery.",
            { current_state: transaction.status },
          );
        const delivery = {
          id: prefix("dlv"),
          transaction_id: transactionId,
          ...clone(input),
          submitted_at: new Date().toISOString(),
        };
        this.deliveries.set(delivery.id, delivery);
        transaction.delivery_id = delivery.id;
        transaction.status = "delivery_submitted";
        this.intents.get(transaction.payment_intent_id).status = "delivery_submitted";
        this.event("transaction.delivery_submitted", transaction);
        return { transaction: clone(transaction), delivery: clone(delivery) };
      },
    );
  }

  async settle(transactionId, input, key) {
    return this.runIdempotentAsync(
      `transactions/${transactionId}/settlements`,
      key,
      input,
      async () => {
        const transaction = this.transactions.get(transactionId);
        if (!transaction)
          throw new ApiError(
            404,
            "resource_not_found",
            "transaction_not_found",
            "Transaction was not found.",
          );
        if (transaction.status === "settled") {
          return {
            transaction: clone(transaction),
            receipt: clone(this.receipts.get(transaction.receipt_id)),
          };
        }
        if (transaction.status !== "delivery_submitted")
          throw new ApiError(
            409,
            "invalid_state_transition",
            "transaction_not_delivered",
            "Transaction must be delivery_submitted before settlement.",
            { current_state: transaction.status },
          );
        const settledAmount = clone(transaction.reserved_amount);
        const provider = await this.executeAdapter(
          "settle",
          transaction.id,
          settledAmount,
        );
        return this.completeSettlement(transaction, settledAmount, provider);
      },
    );
  }

  async recoverSettlement(transactionId, input, key) {
    return this.runIdempotentAsync(
      `transactions/${transactionId}/settlement_recoveries`,
      key,
      input,
      async () => {
        const transaction = this.transactions.get(transactionId);
        if (!transaction)
          throw new ApiError(
            404,
            "resource_not_found",
            "transaction_not_found",
            "Transaction was not found.",
          );
        if (transaction.status !== "delivery_submitted")
          throw new ApiError(
            409,
            "invalid_state_transition",
            "transaction_not_recoverable",
            "Only a delivery_submitted transaction can recover an unknown settlement.",
            { current_state: transaction.status },
          );
        if (typeof this.adapter?.recoverSettlement !== "function")
          throw new ApiError(
            409,
            "invalid_state_transition",
            "settlement_recovery_unsupported",
            "The active payment adapter does not support settlement recovery.",
          );
        const settledAmount = clone(transaction.reserved_amount);
        const provider = await this.executeAdapter(
          "recoverSettlement",
          transaction.id,
          settledAmount,
        );
        if (provider.status === "settled") {
          return {
            ...this.completeSettlement(transaction, settledAmount, provider),
            recovery: {
              status: "settled",
              reason_code: null,
              attempt_id: provider.recovery_attempt_id,
            },
          };
        }
        return {
          transaction: clone(transaction),
          receipt: null,
          recovery: {
            status: "provider_unknown",
            reason_code:
              provider.recovery_reason_code ?? "x402_recovery_result_unknown",
            attempt_id: provider.recovery_attempt_id,
          },
        };
      },
    );
  }

  completeSettlement(transaction, settledAmount, provider) {
    transaction.status = "settled";
    transaction.settled_amount = settledAmount;
    transaction.settlement_id = prefix("stl");
    transaction.settled_at = new Date().toISOString();
    if (provider) {
      transaction.settlement_provider_reference = provider.provider_reference;
    }
    this.wallet.reserved -= transaction.settled_amount.value;
    const intent = this.intents.get(transaction.payment_intent_id);
    intent.status = "settled";
    const quote = this.quotes.get(intent.quote_id);
    quote.status = "accepted";
    this.event("transaction.settled", transaction);
    const signedAt = new Date().toISOString();
    const receiptIssuerId = `bu2-reference-server:${this.environmentConfig.environment}`;
    const receiptPayload = {
      version: CURRENT_RECEIPT_SCHEMA_VERSION,
      schema_version: CURRENT_RECEIPT_SCHEMA_VERSION,
      canonicalization_version: RECEIPT_CANONICALIZATION_VERSION,
      transaction_id: transaction.id,
      settlement_id: transaction.settlement_id,
      quote_id: quote.id,
      payment_intent_id: intent.id,
      payer_account_id: intent.payer_account_id,
      payee_account_id: intent.payee_account_id,
      buyer_agent_id: intent.buyer_agent_id,
      seller_agent_id: intent.seller_agent_id,
      amount: clone(transaction.settled_amount),
      authorization_id: intent.authorization.id,
      payment_mandate_id: intent.payment_mandate_id,
      delivery_id: transaction.delivery_id,
      delivery_evidence_hash: this.deliveries.get(transaction.delivery_id).evidence_hash,
      environment_contract_version: this.environmentConfig.environment_contract_version,
      environment: this.environmentConfig.environment,
      execution_backend: this.environmentConfig.payment_adapter,
      chain_id: this.environmentConfig.chain_id,
      network: this.environmentConfig.network,
      receipt_issuer_id: receiptIssuerId,
      payment_channel: this.adapter?.name ?? "none",
      provider_reference: transaction.settlement_provider_reference ?? null,
      signed_at: signedAt,
      issued_at: signedAt,
    };
    const signature = sign(
      null,
      Buffer.from(canonicalReceiptPayload(receiptPayload)),
      this.privateKey,
    ).toString("base64");
    const receipt = {
      id: prefix("rcpt"),
      ...receiptPayload,
      signature_algorithm: RECEIPT_SIGNATURE_ALGORITHM,
      verification_key_id: this.verificationKeyId,
      signature,
      public_key: this.publicKeyBase64,
    };
    this.receipts.set(receipt.id, receipt);
    transaction.receipt_id = receipt.id;
    this.event("receipt.issued", receipt);
    return { transaction: clone(transaction), receipt: clone(receipt) };
  }

  getReceipt(id) {
    const receipt = this.receipts.get(id);
    if (!receipt)
      throw new ApiError(404, "resource_not_found", "receipt_not_found", "Receipt was not found.");
    return clone(receipt);
  }

  verifyReceipt(id) {
    const receipt = this.getReceipt(id);
    const signature = verifyReceiptSignature(receipt);
    const interpretation = interpretReceiptEnvironment(receipt);
    const environmentValid = receiptEnvironmentMatches(receipt, this.environmentConfig);
    const registeredKey =
      this.ledger?.getReceiptVerificationKey(receipt.verification_key_id) ??
      this.trustedVerificationKeys.get(receipt.verification_key_id);
    const issuerTrusted = Boolean(
      registeredKey &&
        registeredKey.status === "trusted" &&
        registeredKey.algorithm === receipt.signature_algorithm &&
        registeredKey.public_key === receipt.public_key,
    );
    const transaction = this.transactions.get(receipt.transaction_id);
    const settlementConfirmed = Boolean(
      transaction &&
        transaction.status === "settled" &&
        transaction.receipt_id === receipt.id &&
        transaction.settlement_id === receipt.settlement_id &&
        (transaction.settlement_provider_reference ?? null) === receipt.provider_reference &&
        transaction.settled_amount?.value === receipt.amount?.value &&
        transaction.settled_amount?.currency === receipt.amount?.currency,
    );
    const result = {
      receipt_id: id,
      valid:
        signature.schema_supported &&
        signature.signature_valid &&
        issuerTrusted &&
        settlementConfirmed &&
        environmentValid,
      signature_valid: signature.signature_valid,
      issuer_trusted: issuerTrusted,
      settlement_confirmed: settlementConfirmed,
      environment_valid: environmentValid,
      environment_interpretation: interpretation,
      schema_version: signature.schema_version,
      canonicalization_version: signature.canonicalization_version,
    };
    this.observer?.record(
      result.valid ? "state" : "internal",
      result.valid
        ? "receipt.verification_succeeded"
        : "receipt.verification_failed",
      { receipt_id: id, transaction_id: receipt.transaction_id },
    );
    return result;
  }

  receiptIssuer() {
    return {
      issuer_id: `bu2-reference-server:${this.environmentConfig.environment}`,
      environment: this.environmentConfig.environment,
      verification_key_id: this.verificationKeyId,
      signature_algorithm: RECEIPT_SIGNATURE_ALGORITHM,
      public_key: this.publicKeyBase64,
    };
  }
}
