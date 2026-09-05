import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { classifyOperationalError } from "./observability.mjs";

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
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
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
  } = {}) {
    this.ledger = ledger;
    this.adapter = adapter;
    this.observer = observer;
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
    this.wallet =
      restored.state.wallet ??
      initialWallet ?? {
        id: "wal_demo_buyer",
        available: 100_000,
        reserved: 0,
        currency: "CNY",
      };
    this.knownPayees = new Set(restored.state.known_payees ?? []);
    const keys = generateKeyPairSync("ed25519");
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
  }

  runIdempotent(scope, key, body, operation) {
    if (!key || key.length < 8) {
      throw new ApiError(
        400,
        "validation_error",
        "missing_idempotency_key",
        "Idempotency-Key must contain at least 8 characters.",
      );
    }
    const storeKey = `${scope}:${key}`;
    const fingerprint = hash(body);
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
    const result = operation();
    this.idempotency.set(storeKey, { fingerprint, result: clone(result) });
    this.persist();
    return clone(result);
  }

  async runIdempotentAsync(scope, key, body, operation) {
    if (!key || key.length < 8) {
      throw new ApiError(
        400,
        "validation_error",
        "missing_idempotency_key",
        "Idempotency-Key must contain at least 8 characters.",
      );
    }
    const storeKey = `${scope}:${key}`;
    const fingerprint = hash(body);
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
    const result = await operation();
    this.idempotency.set(storeKey, { fingerprint, result: clone(result) });
    this.persist();
    return clone(result);
  }

  persist() {
    this.ledger?.saveSnapshot({
      resources: {
        quotes: [...this.quotes.entries()],
        intents: [...this.intents.entries()],
        transactions: [...this.transactions.entries()],
        deliveries: [...this.deliveries.entries()],
        receipts: [...this.receipts.entries()],
      },
      wallet: this.wallet,
      knownPayees: [...this.knownPayees],
      idempotency: [...this.idempotency.entries()],
    });
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
    this.events.push(event);
    this.ledger?.appendEvent(event);
    this.observer?.record("state", "transaction.event.appended", {
      event_type: type,
      resource_id: resource.id,
      ...event.correlation,
    });
    return event;
  }

  async executeAdapter(operation, transactionId, amount) {
    try {
      return await this.adapter?.[operation](transactionId, amount);
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

  createQuote(input, key) {
    return this.runIdempotent("quotes", key, input, () => {
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
    return {
      transaction: clone(transaction),
      payment_intent: intent ? clone(intent) : null,
      quote: quote ? clone(quote) : null,
      delivery: delivery ? clone(delivery) : null,
      receipt: receipt
        ? { ...clone(receipt), valid: this.verifyReceipt(receipt.id).valid }
        : null,
      payment_channel: this.adapter?.name ?? "none",
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

  submitDelivery(transactionId, input, key) {
    return this.runIdempotent(`transactions/${transactionId}/deliveries`, key, input, () => {
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
    });
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
      transaction.status = "settled";
      transaction.settled_amount = settledAmount;
      transaction.settlement_id = prefix("stl");
      transaction.settled_at = new Date().toISOString();
      if (provider) transaction.settlement_provider_reference = provider.provider_reference;
      this.wallet.reserved -= transaction.settled_amount.value;
      const intent = this.intents.get(transaction.payment_intent_id);
      intent.status = "settled";
      const quote = this.quotes.get(intent.quote_id);
      quote.status = "accepted";
      this.event("transaction.settled", transaction);
      const receiptPayload = {
        version: "0.1",
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
        issued_at: new Date().toISOString(),
      };
      const signature = sign(
        null,
        Buffer.from(canonical(receiptPayload)),
        this.privateKey,
      ).toString("base64");
      const receipt = {
        id: prefix("rcpt"),
        ...receiptPayload,
        signature_algorithm: "Ed25519",
        verification_key_id: "key_bu2_sandbox_01",
        signature,
        public_key: this.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      };
      this.receipts.set(receipt.id, receipt);
      transaction.receipt_id = receipt.id;
      this.event("receipt.issued", receipt);
        return { transaction: clone(transaction), receipt: clone(receipt) };
      },
    );
  }

  getReceipt(id) {
    const receipt = this.receipts.get(id);
    if (!receipt)
      throw new ApiError(404, "resource_not_found", "receipt_not_found", "Receipt was not found.");
    return clone(receipt);
  }

  verifyReceipt(id) {
    const receipt = this.getReceipt(id);
    const {
      id: _id,
      signature,
      signature_algorithm: _algorithm,
      verification_key_id: _keyId,
      public_key: _publicKey,
      ...payload
    } = receipt;
    const receiptPublicKey = createPublicKey({
      key: Buffer.from(receipt.public_key, "base64"),
      type: "spki",
      format: "der",
    });
    const result = {
      receipt_id: id,
      valid: verify(
        null,
        Buffer.from(canonical(payload)),
        receiptPublicKey,
        Buffer.from(signature, "base64"),
      ),
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
}
