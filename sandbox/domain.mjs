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

const budgetScopeTypes = new Set(["workspace", "project", "account", "agent"]);
const budgetPeriods = new Set(["lifetime", "calendar_month", "rolling_24h"]);
const mandateStatuses = new Set(["draft", "active", "suspended", "revoked", "expired"]);
const mandateActions = new Set(["activate", "suspend", "revoke", "expire"]);
const receivableStatuses = new Set(["issued", "pending", "paid", "expired", "cancelled"]);
const legacyMandatePattern = /^mdt_(research_04|x402_test|doctor_buyer|env05_buyer|mcp_buyer|sdk_buyer|external_local|attacker|atomic_[A-Za-z0-9_-]+)$/;

function validateIdentifier(value, prefixValue, field) {
  if (typeof value !== "string" || !new RegExp(`^${prefixValue}_[A-Za-z0-9_-]+$`).test(value)) {
    throw new ApiError(400, "validation_error", "invalid_resource_id", `${field} is invalid.`, { field });
  }
}

function validateDate(value, field, { allowNull = false } = {}) {
  if (allowNull && value === null) return;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ApiError(400, "validation_error", "invalid_date", `${field} must be an ISO-8601 date-time.`, { field });
  }
}

function validateNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(400, "validation_error", "invalid_amount", `${field} must be a non-negative integer.`, { field });
  }
}

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
    this.receivables = new Map(restored.resources.receivables ?? []);
    this.collections = new Map(restored.resources.collections ?? []);
    this.intents = new Map(restored.resources.intents ?? []);
    this.transactions = new Map(restored.resources.transactions ?? []);
    this.deliveries = new Map(restored.resources.deliveries ?? []);
    this.receipts = new Map(restored.resources.receipts ?? []);
    this.mandates = new Map(restored.resources.mandates ?? []);
    this.policyDecisions = new Map(restored.resources.policy_decisions ?? []);
    this.idempotency = new Map(restored.idempotency ?? []);
    this.events = restored.events ?? [];
    const financial = restored.financial ?? {};
    this.budgets = new Map(financial.budgets ?? []);
    this.budgetHolds = new Map(financial.budget_holds ?? []);
    this.financialPostings = new Map(financial.financial_postings ?? []);
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
        receivables: [...this.receivables.entries()].map(([id, value]) => [id, clone(value)]),
        collections: [...this.collections.entries()].map(([id, value]) => [id, clone(value)]),
        intents: [...this.intents.entries()].map(([id, value]) => [id, clone(value)]),
        transactions: [...this.transactions.entries()].map(([id, value]) => [id, clone(value)]),
        deliveries: [...this.deliveries.entries()].map(([id, value]) => [id, clone(value)]),
        mandates: [...this.mandates.entries()].map(([id, value]) => [id, clone(value)]),
        policy_decisions: [...this.policyDecisions.entries()].map(([id, value]) => [id, clone(value)]),
      receipts: [...this.receipts.entries()].map(([id, value]) => [id, clone(value)]),
      },
      wallet: clone(this.wallet),
      knownPayees: [...this.knownPayees],
      financial: {
        budgets: [...this.budgets.entries()].map(([id, value]) => [id, clone(value)]),
        budget_holds: [...this.budgetHolds.entries()].map(([id, value]) => [id, clone(value)]),
        financial_postings: [...this.financialPostings.entries()].map(([id, value]) => [id, clone(value)]),
      },
    };
  }

  restoreState(snapshot) {
    this.quotes = new Map(snapshot.resources.quotes ?? []);
    this.receivables = new Map(snapshot.resources.receivables ?? []);
    this.collections = new Map(snapshot.resources.collections ?? []);
    this.intents = new Map(snapshot.resources.intents ?? []);
    this.transactions = new Map(snapshot.resources.transactions ?? []);
    this.deliveries = new Map(snapshot.resources.deliveries ?? []);
    this.receipts = new Map(snapshot.resources.receipts ?? []);
    this.mandates = new Map(snapshot.resources.mandates ?? []);
    this.policyDecisions = new Map(snapshot.resources.policy_decisions ?? []);
    this.wallet = clone(snapshot.wallet);
    this.knownPayees = new Set(snapshot.knownPayees ?? []);
    const financial = snapshot.financial ?? {};
    this.budgets = new Map(financial.budgets ?? []);
    this.budgetHolds = new Map(financial.budget_holds ?? []);
    this.financialPostings = new Map(financial.financial_postings ?? []);
  }

  reloadCommittedState() {
    if (!this.ledger) return;
    const restored = this.ledger.loadState();
    this.restoreState({
      resources: restored.resources,
      wallet: restored.state.wallet ?? this.wallet,
      knownPayees: restored.state.known_payees ?? [],
      financial: restored.financial,
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
      const targetBinding = this.ledger?.assertWalletBinding(this.environmentConfig.environment, {
        kind: "receiving_target",
        accountId: input.payee_account_id,
        agentId: input.seller_agent_id,
        asset: input.asset ?? this.environmentConfig.asset ?? input.amount.currency,
        network: input.network ?? this.environmentConfig.network ?? null,
        reference: input.receiving_target_id ?? null,
      });
      const quote = {
        id: prefix("quo"),
        ...clone(input),
        receiving_target_binding_id: targetBinding?.binding?.id ?? null,
        status: "active",
        created_at: new Date().toISOString(),
      };
      this.quotes.set(quote.id, quote);
      this.event("quote.created", quote);
      return quote;
    });
  }

  async createReceivable(input, key) {
    return this.runIdempotentAsync("receivables", key, input, async () => {
      requireFields(input, [
        "quote_id",
        "account_id",
        "agent_id",
        "receiving_target_id",
        "expires_at",
        "purpose",
      ]);
      validateIdentifier(input.quote_id, "quo", "quote_id");
      validateIdentifier(input.account_id, "acct", "account_id");
      validateIdentifier(input.agent_id, "agt", "agent_id");
      validateIdentifier(input.receiving_target_id, "tgt", "receiving_target_id");
      const quote = this.quotes.get(input.quote_id);
      if (!quote) {
        throw new ApiError(404, "resource_not_found", "quote_not_found", "Quote was not found.");
      }
      if (quote.status !== "active") {
        throw new ApiError(409, "invalid_state_transition", "quote_not_collectible", "Only an active quote can create a receivable.", { current_state: quote.status });
      }
      if (quote.payee_account_id !== input.account_id || quote.seller_agent_id !== input.agent_id) {
        throw new ApiError(409, "authorization_error", "receivable_owner_mismatch", "Receivable owner must match the quote payee account and seller Agent.");
      }
      if (quote.receiving_target_id && quote.receiving_target_id !== input.receiving_target_id) {
        throw new ApiError(409, "authorization_error", "receiving_target_mismatch", "Receivable target must match the quote receiving target.");
      }
      validateDate(input.expires_at, "expires_at");
      const expiresAt = Date.parse(input.expires_at);
      const now = Date.now();
      if (expiresAt <= now) {
        throw new ApiError(400, "validation_error", "receivable_expired_at_creation", "Receivable expiry must be in the future.");
      }
      if (Date.parse(quote.expires_at) < expiresAt) {
        throw new ApiError(400, "validation_error", "receivable_expiry_after_quote", "Receivable expiry cannot exceed quote expiry.");
      }
      for (const [field, prefixValue] of [["expected_payer_account_id", "acct"], ["expected_buyer_agent_id", "agt"]]) {
        if (input[field] !== undefined && input[field] !== null) validateIdentifier(input[field], prefixValue, field);
      }
      if ((input.expected_payer_account_id === undefined) !== (input.expected_buyer_agent_id === undefined)) {
        throw new ApiError(400, "validation_error", "incomplete_payer_binding", "Expected payer account and buyer Agent must be provided together.");
      }
      const targetBinding = this.ledger?.assertWalletBinding(this.environmentConfig.environment, {
        kind: "receiving_target",
        accountId: input.account_id,
        agentId: input.agent_id,
        asset: quote.asset ?? this.environmentConfig.asset ?? quote.amount.currency,
        network: quote.network ?? this.environmentConfig.network ?? null,
        reference: input.receiving_target_id,
      });
      const receivable = {
        id: input.id ?? prefix("rcv"),
        quote_id: quote.id,
        account_id: input.account_id,
        agent_id: input.agent_id,
        receiving_target_id: input.receiving_target_id,
        receiving_target_binding_id: targetBinding?.binding?.id ?? quote.receiving_target_binding_id ?? null,
        amount: clone(quote.amount),
        asset: quote.asset ?? null,
        network: quote.network ?? null,
        purpose: input.purpose,
        expected_payer_account_id: input.expected_payer_account_id ?? null,
        expected_buyer_agent_id: input.expected_buyer_agent_id ?? null,
        metadata: clone(input.metadata ?? {}),
        collection_reference: prefix("col"),
        status: "issued",
        version: 1,
        expires_at: input.expires_at,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!receivableStatuses.has(receivable.status)) {
        throw new ApiError(500, "internal_error", "invalid_receivable_status", "Receivable status is invalid.");
      }
      if (this.receivables.has(receivable.id)) {
        throw new ApiError(409, "conflict", "receivable_id_exists", "Receivable ID already exists.");
      }
      this.receivables.set(receivable.id, receivable);
      this.event("receivable.created", receivable);
      return clone(receivable);
    });
  }

  listReceivables() {
    return [...this.receivables.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((receivable) => clone(receivable));
  }

  getReceivable(id) {
    const receivable = this.receivables.get(id);
    if (!receivable) {
      throw new ApiError(404, "resource_not_found", "receivable_not_found", "Receivable was not found.");
    }
    return clone(receivable);
  }

  listCollections() {
    return [...this.collections.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((collection) => clone(collection));
  }

  getCollection(id) {
    const collection = this.collections.get(id);
    if (!collection) {
      throw new ApiError(404, "resource_not_found", "collection_not_found", "Collection was not found.");
    }
    return clone(collection);
  }

  addCollectionPostings(event, collection) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: null,
        budget_id: null,
        source_id: collection.id,
        direction: "debit",
        account: `cash.receiving_target:${collection.receiving_target_id}`,
        amount_value: collection.amount.value,
        currency: collection.amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: null,
        budget_id: null,
        source_id: collection.id,
        direction: "credit",
        account: `receivable:${collection.receivable_id}`,
        amount_value: collection.amount.value,
        currency: collection.amount.currency,
        created_at: event.created_at,
      },
    ];
    for (const posting of postings) this.financialPostings.set(posting.id, posting);
    return postings;
  }

  async verifyInboundPayment(receivableId, input, key) {
    return this.runIdempotentAsync(
      `receivables/${receivableId}/collections`,
      key,
      input,
      async () => {
        validateIdentifier(receivableId, "rcv", "receivable_id");
        requireFields(input, ["provider_reference", "collection_reference"]);
        const receivable = this.receivables.get(receivableId);
        if (!receivable) {
          throw new ApiError(404, "resource_not_found", "receivable_not_found", "Receivable was not found.");
        }
        const prior = [...this.collections.values()].find(
          (collection) => collection.provider_reference === input.provider_reference,
        );
        if (prior) {
          if (prior.receivable_id !== receivableId || prior.collection_reference !== input.collection_reference) {
            throw new ApiError(
              409,
              "conflict",
              "provider_reference_reused",
              "The provider reference is already attached to another collection.",
            );
          }
          return { collection: clone(prior), receivable: clone(receivable) };
        }
        if (receivable.status === "paid") {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "receivable_already_paid",
            "The Receivable has already been paid.",
            { current_state: receivable.status },
          );
        }
        if (!["issued", "pending"].includes(receivable.status)) {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "receivable_not_collectible",
            "Only an issued or pending Receivable can accept an inbound payment.",
            { current_state: receivable.status },
          );
        }
        if (Date.parse(receivable.expires_at) <= Date.now()) {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "receivable_expired",
            "The Receivable has expired and cannot accept an inbound payment.",
          );
        }
        if (typeof this.adapter?.verifyInboundPayment !== "function") {
          throw new ApiError(
            503,
            "provider_unavailable",
            "inbound_verification_unsupported",
            "The active payment adapter does not support inbound payment verification.",
          );
        }
        const verification = await this.adapter.verifyInboundPayment({ receivable: clone(receivable), input: clone(input) });
        if (!["verified", "pending"].includes(verification?.status)) {
          throw new ApiError(
            422,
            "provider_error",
            "inbound_payment_unverified",
            "The provider did not return a verified or pending inbound payment.",
          );
        }
        if (typeof verification.provider_reference !== "string" || verification.provider_reference.length === 0) {
          throw new ApiError(
            422,
            "provider_error",
            "inbound_provider_reference_missing",
            "The provider did not return a stable payment reference.",
          );
        }
        if (verification.provider_reference !== input.provider_reference) {
          throw new ApiError(
            409,
            "provider_error",
            "inbound_provider_reference_mismatch",
            "The provider reference does not match the requested verification reference.",
          );
        }
        const verifiedReferenceOwner = [...this.collections.values()].find(
          (collection) => collection.provider_reference === verification.provider_reference,
        );
        if (verifiedReferenceOwner) {
          throw new ApiError(
            409,
            "conflict",
            "provider_reference_reused",
            "The provider reference is already attached to another collection.",
          );
        }
        if (verification.collection_reference !== receivable.collection_reference) {
          throw new ApiError(
            409,
            "provider_error",
            "collection_reference_mismatch",
            "The verified payment does not match the Receivable collection reference.",
          );
        }
        validateAmount(verification.amount);
        if (
          verification.amount.value !== receivable.amount.value ||
          verification.amount.currency !== receivable.amount.currency
        ) {
          throw new ApiError(
            409,
            "provider_error",
            "inbound_amount_mismatch",
            "The verified payment amount does not match the Receivable amount.",
            { expected: receivable.amount, received: verification.amount },
          );
        }
        if (receivable.asset !== null && verification.asset !== receivable.asset) {
          throw new ApiError(
            409,
            "provider_error",
            "inbound_asset_mismatch",
            "The verified payment asset does not match the Receivable asset.",
          );
        }
        if (receivable.network !== null && verification.network !== receivable.network) {
          throw new ApiError(
            409,
            "provider_error",
            "inbound_network_mismatch",
            "The verified payment network does not match the Receivable network.",
          );
        }
        if (
          receivable.expected_payer_account_id &&
          verification.payer_account_id !== receivable.expected_payer_account_id
        ) {
          throw new ApiError(
            403,
            "authorization_error",
            "inbound_payer_mismatch",
            "The verified payment payer does not match the expected payer account.",
          );
        }
        if (
          receivable.expected_buyer_agent_id &&
          verification.payer_agent_id !== receivable.expected_buyer_agent_id
        ) {
          throw new ApiError(
            403,
            "authorization_error",
            "inbound_payer_agent_mismatch",
            "The verified payment payer does not match the expected buyer Agent.",
          );
        }
        const now = new Date().toISOString();
        const collection = {
          id: prefix("cpay"),
          receivable_id: receivable.id,
          account_id: receivable.account_id,
          agent_id: receivable.agent_id,
          receiving_target_id: receivable.receiving_target_id,
          collection_reference: receivable.collection_reference,
          provider: verification.provider ?? this.adapter.name ?? "unknown",
          provider_reference: verification.provider_reference,
          amount: clone(verification.amount),
          asset: verification.asset ?? null,
          network: verification.network ?? null,
          payer_account_id: verification.payer_account_id ?? null,
          payer_agent_id: verification.payer_agent_id ?? null,
          verification_status: verification.status,
          status: verification.status === "verified" ? "posted" : "pending",
          verification_mode: verification.verification_mode ?? "provider",
          verified_at: verification.verified_at ?? now,
          created_at: now,
          updated_at: now,
        };
        this.collections.set(collection.id, collection);
        receivable.status = collection.status === "posted" ? "paid" : "pending";
        receivable.version += 1;
        receivable.collection_id = collection.id;
        receivable.updated_at = now;
        if (collection.status === "posted") {
          receivable.paid_at = now;
          const event = this.event("receivable.payment_posted", collection);
          this.addCollectionPostings(event, collection);
        } else {
          this.event("receivable.payment_pending", collection);
        }
        return { collection: clone(collection), receivable: clone(receivable) };
      },
    );
  }

  async createBudget(input, key) {
    return this.runIdempotentAsync("budgets", key, input, async () => {
      requireFields(input, ["scope_type", "scope_id", "currency", "period", "limit_minor"]);
      if (!budgetScopeTypes.has(input.scope_type)) {
        throw new ApiError(400, "validation_error", "invalid_budget_scope", "Budget scope type is invalid.");
      }
      if (!budgetPeriods.has(input.period)) {
        throw new ApiError(400, "validation_error", "invalid_budget_period", "Budget period is invalid.");
      }
      if (!/^[A-Z]{3}$/.test(input.currency)) {
        throw new ApiError(400, "validation_error", "invalid_currency", "Currency must be an ISO 4217 uppercase code.");
      }
      if (!Number.isInteger(input.limit_minor) || input.limit_minor < 0) {
        throw new ApiError(400, "validation_error", "invalid_budget_limit", "Budget limit must be a non-negative integer in minor units.");
      }
      const existing = [...this.budgets.values()].find(
        (budget) =>
          budget.scope_type === input.scope_type &&
          budget.scope_id === input.scope_id &&
          budget.currency === input.currency &&
          budget.period === input.period &&
          budget.status === "active",
      );
      if (existing) {
        throw new ApiError(
          409,
          "conflict",
          "active_budget_exists",
          "An active budget already exists for this scope, period, and currency.",
          { budget_id: existing.id },
        );
      }
      const now = new Date().toISOString();
      const budget = {
        id: input.id ?? prefix("bud"),
        scope_type: input.scope_type,
        scope_id: input.scope_id,
        currency: input.currency,
        period: input.period,
        limit_minor: input.limit_minor,
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now,
      };
      this.budgets.set(budget.id, budget);
      this.event("budget.created", budget);
      return clone(budget);
    });
  }

  getBudget(id) {
    const budget = this.budgets.get(id);
    if (!budget) {
      throw new ApiError(404, "resource_not_found", "budget_not_found", "Budget was not found.");
    }
    return clone(budget);
  }

  listBudgets() {
    return [...this.budgets.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((budget) => this.budgetView(budget));
  }

  budgetView(budget) {
    const holds = [...this.budgetHolds.values()].filter((hold) => hold.budget_id === budget.id);
    const activeHoldTotal = holds
      .filter((hold) => hold.status === "active")
      .reduce((total, hold) => total + hold.amount_value, 0);
    const consumedTotal = holds
      .filter((hold) => hold.status === "consumed")
      .reduce((total, hold) => total + hold.amount_value, 0);
    return {
      ...clone(budget),
      active_hold_total: activeHoldTotal,
      consumed_total: consumedTotal,
      available_minor: Math.max(0, budget.limit_minor - activeHoldTotal - consumedTotal),
      hold_count: holds.length,
    };
  }

  listBudgetHolds(budgetId = null) {
    return [...this.budgetHolds.values()]
      .filter((hold) => budgetId === null || hold.budget_id === budgetId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((hold) => clone(hold));
  }

  listFinancialPostings(transactionId = null) {
    return [...this.financialPostings.values()]
      .filter((posting) => transactionId === null || posting.transaction_id === transactionId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((posting) => clone(posting));
  }

  getBudgetHold(id) {
    const hold = this.budgetHolds.get(id);
    if (!hold) {
      throw new ApiError(404, "resource_not_found", "budget_hold_not_found", "Budget hold was not found.");
    }
    return clone(hold);
  }

  addBudgetPosting(event, hold, direction, account) {
    const posting = {
      id: prefix("pst"),
      event_id: event.id,
      event_type: event.type,
      transaction_id: hold.transaction_id,
      budget_id: hold.budget_id,
      source_id: hold.id,
      direction,
      account,
      amount_value: hold.amount_value,
      currency: hold.currency,
      created_at: event.created_at,
    };
    this.financialPostings.set(posting.id, posting);
    return posting;
  }

  mandateView(mandate) {
    return clone(mandate);
  }

  async createPaymentMandate(input, key) {
    return this.runIdempotentAsync("payment_mandates", key, input, async () => {
      requireFields(input, [
        "account_id",
        "agent_id",
        "funding_source_id",
        "receiving_target_id",
        "environment",
        "currency",
        "max_single_amount",
        "daily_limit",
        "monthly_limit",
        "effective_at",
      ]);
      validateIdentifier(input.account_id, "acct", "account_id");
      validateIdentifier(input.agent_id, "agt", "agent_id");
      validateIdentifier(input.funding_source_id, "fund", "funding_source_id");
      validateIdentifier(input.receiving_target_id, "tgt", "receiving_target_id");
      if (input.environment !== this.environmentConfig.environment) {
        throw new ApiError(409, "policy_error", "mandate_environment_mismatch", "Mandate environment must match the active runtime environment.");
      }
      if (!/^[A-Z]{3}$/.test(input.currency)) {
        throw new ApiError(400, "validation_error", "invalid_currency", "Currency must be an ISO 4217 uppercase code.");
      }
      for (const field of ["max_single_amount", "daily_limit", "monthly_limit"]) {
        validateNonNegativeInteger(input[field], field);
      }
      validateDate(input.effective_at, "effective_at");
      validateDate(input.expires_at ?? null, "expires_at", { allowNull: true });
      if (input.expires_at && Date.parse(input.expires_at) <= Date.parse(input.effective_at)) {
        throw new ApiError(400, "validation_error", "invalid_mandate_window", "expires_at must be later than effective_at.");
      }
      const supersedes = input.supersedes_mandate_id ?? null;
      let previous = null;
      if (supersedes) {
        validateIdentifier(supersedes, "mdt", "supersedes_mandate_id");
        previous = this.mandates.get(supersedes);
        if (!previous) throw new ApiError(404, "resource_not_found", "mandate_not_found", "Superseded mandate was not found.");
        if (previous.account_id !== input.account_id || previous.agent_id !== input.agent_id) {
          throw new ApiError(409, "policy_error", "mandate_binding_conflict", "A replacement mandate must retain the account and Agent binding.");
        }
      }
      const mandate = {
        id: input.id ?? prefix("mdt"),
        account_id: input.account_id,
        agent_id: input.agent_id,
        funding_source_id: input.funding_source_id,
        receiving_target_id: input.receiving_target_id,
        version: previous ? previous.version + 1 : 1,
        status: "draft",
        environment: input.environment,
        currency: input.currency,
        max_single_amount: input.max_single_amount,
        daily_limit: input.daily_limit,
        monthly_limit: input.monthly_limit,
        merchant_allowlist: [...new Set(input.merchant_allowlist ?? [])],
        merchant_denylist: [...new Set(input.merchant_denylist ?? [])],
        category_allowlist: [...new Set(input.category_allowlist ?? [])],
        purpose_constraints: clone(input.purpose_constraints ?? {}),
        resource_constraints: clone(input.resource_constraints ?? {}),
        effective_at: input.effective_at,
        expires_at: input.expires_at ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: input.created_by ?? null,
        supersedes_mandate_id: supersedes,
      };
      if (this.mandates.has(mandate.id)) {
        throw new ApiError(409, "conflict", "mandate_id_exists", "Mandate ID already exists.");
      }
      this.mandates.set(mandate.id, mandate);
      this.event("mandate.created", mandate);
      return mandate;
    });
  }

  listPaymentMandates() {
    return [...this.mandates.values()]
      .filter((mandate) => !mandate.legacy)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((mandate) => this.mandateView(mandate));
  }

  getPaymentMandate(id) {
    const mandate = this.mandates.get(id);
    if (!mandate || mandate.legacy) {
      throw new ApiError(404, "resource_not_found", "mandate_not_found", "Payment mandate was not found.");
    }
    return this.mandateView(mandate);
  }

  async transitionPaymentMandate(id, action, input, key) {
    return this.runIdempotentAsync(`payment_mandates/${id}/${action}`, key, input, async () => {
      if (!mandateActions.has(action)) {
        throw new ApiError(400, "validation_error", "invalid_mandate_action", "Mandate action is invalid.");
      }
      const mandate = this.mandates.get(id);
      if (!mandate || mandate.legacy) throw new ApiError(404, "resource_not_found", "mandate_not_found", "Payment mandate was not found.");
      if (input.version !== mandate.version) {
        throw new ApiError(409, "concurrency_conflict", "mandate_version_conflict", "Mandate version changed; query before retrying.", { current_version: mandate.version });
      }
      const transitions = {
        activate: { draft: "active", suspended: "active" },
        suspend: { active: "suspended" },
        revoke: { active: "revoked", suspended: "revoked", draft: "revoked" },
        expire: { active: "expired", suspended: "expired" },
      };
      const next = transitions[action]?.[mandate.status];
      if (!next) throw new ApiError(409, "invalid_state_transition", "mandate_not_transitionable", "Mandate cannot perform this state transition.", { current_state: mandate.status, action });
      if (action === "activate") {
        const now = Date.now();
        if (Date.parse(mandate.effective_at) > now || (mandate.expires_at && Date.parse(mandate.expires_at) <= now)) {
          throw new ApiError(409, "policy_error", "mandate_outside_effective_window", "Mandate is outside its effective window.");
        }
        if (this.ledger) {
          const asset = this.environmentConfig.asset ?? mandate.currency;
          const network = this.environmentConfig.network ?? null;
          const fundingBinding = this.ledger.assertWalletBinding(this.environmentConfig.environment, {
            kind: "funding_source",
            accountId: mandate.account_id,
            agentId: mandate.agent_id,
            asset,
            network,
            reference: mandate.funding_source_id,
          });
          if (!fundingBinding.bound) {
            throw new ApiError(
              409,
              "authorization_error",
              "funding_source_binding_required",
              "The funding source must reference an active verified wallet binding.",
            );
          }
          this.ledger.assertWalletBindingById(this.environmentConfig.environment, {
            kind: "receiving_target",
            bindingId: mandate.receiving_target_id,
            asset,
            network,
          });
        }
      }
      mandate.status = next;
      mandate.updated_at = new Date().toISOString();
      mandate.transition_reason = input.reason ?? null;
      this.event(`mandate.${next === "active" ? "activated" : next}`, mandate);
      return clone(mandate);
    });
  }

  legacyMandateFor(input, quote) {
    if (!legacyMandatePattern.test(input.payment_mandate_id)) return null;
    return {
      id: input.payment_mandate_id,
      version: 0,
      status: "active",
      legacy: true,
      account_id: input.payer_account_id,
      agent_id: input.buyer_agent_id,
      funding_source_id: input.funding_source_id ?? null,
      receiving_target_id: input.receiving_target_id ?? quote.receiving_target_id ?? null,
      environment: this.environmentConfig.environment,
      currency: input.amount.currency,
      max_single_amount: 5000,
      daily_limit: Number.MAX_SAFE_INTEGER,
      monthly_limit: Number.MAX_SAFE_INTEGER,
      merchant_allowlist: [],
      merchant_denylist: [],
      category_allowlist: [],
      purpose_constraints: {},
      resource_constraints: {},
      effective_at: "1970-01-01T00:00:00.000Z",
      expires_at: null,
    };
  }

  spendTotal(mandate, since) {
    return [...this.intents.values()]
      .filter((intent) => intent.payment_mandate_id === mandate.id && intent.payer_account_id === mandate.account_id && intent.buyer_agent_id === mandate.agent_id)
      .filter((intent) => Date.parse(intent.created_at) >= since && !["declined", "expired"].includes(intent.status))
      .reduce((total, intent) => total + intent.amount.value, 0);
  }

  evaluatePaymentMandate(input, quote) {
    const mandate = this.mandates.get(input.payment_mandate_id) ?? this.legacyMandateFor(input, quote);
    if (!mandate) throw new ApiError(409, "mandate_denied", "mandate_not_found", "Payment intent references an unknown mandate.");
    const now = Date.now();
    const reasons = [];
    const rules = [];
    const fail = (code, rule) => { reasons.push(code); rules.push(rule); };
    if (mandate.environment !== this.environmentConfig.environment) fail("mandate_environment_mismatch", "environment:match");
    if (mandate.status !== "active") fail("mandate_not_active", `status:${mandate.status}`);
    if (Date.parse(mandate.effective_at) > now) fail("mandate_not_effective", "effective_at");
    if (mandate.expires_at && Date.parse(mandate.expires_at) <= now) fail("mandate_expired", "expires_at");
    if (mandate.account_id !== input.payer_account_id || mandate.agent_id !== input.buyer_agent_id) fail("mandate_binding_mismatch", "binding:account_agent");
    if (!mandate.legacy && input.funding_source_id !== mandate.funding_source_id) fail("funding_source_mismatch", "binding:funding_source");
    if (!mandate.legacy && (input.receiving_target_id ?? quote.receiving_target_id) !== mandate.receiving_target_id) fail("receiving_target_mismatch", "binding:receiving_target");
    if (mandate.currency !== input.amount.currency) fail("mandate_currency_mismatch", "currency");
    if (input.amount.value > mandate.max_single_amount) fail("amount_above_mandate", `amount_lte:${mandate.max_single_amount}`);
    const merchant = input.merchant ?? quote.payee_account_id;
    const category = input.category ?? quote.item.delivery_type;
    if (mandate.merchant_denylist.includes(merchant)) fail("merchant_denied", "merchant:denylist");
    if (mandate.merchant_allowlist.length && !mandate.merchant_allowlist.includes(merchant)) fail("merchant_not_allowed", "merchant:allowlist");
    if (mandate.category_allowlist.length && !mandate.category_allowlist.includes(category)) fail("category_not_allowed", "category:allowlist");
    const requiredTerms = mandate.purpose_constraints?.required_terms ?? [];
    if (requiredTerms.some((term) => !input.purpose.toLowerCase().includes(String(term).toLowerCase()))) fail("purpose_constraint_failed", "purpose:required_terms");
    if (this.spendTotal(mandate, now - 86_400_000) + input.amount.value > mandate.daily_limit) fail("daily_limit_exceeded", `daily_lte:${mandate.daily_limit}`);
    if (this.spendTotal(mandate, now - 31 * 86_400_000) + input.amount.value > mandate.monthly_limit) fail("monthly_limit_exceeded", `monthly_lte:${mandate.monthly_limit}`);
    if (reasons.length) return { mandate, decision: "denied", reason_code: reasons[0], matched_rules: rules };
    if (!this.knownPayees.has(quote.payee_account_id)) return { mandate, decision: "review_required", reason_code: "first_time_payee", matched_rules: [...rules, "payee:first_use"] };
    return { mandate, decision: "approved", reason_code: "mandate_match", matched_rules: [...rules, `amount_lte:${mandate.max_single_amount}`] };
  }

  createBudgetHold(transaction, intent) {
    if (!intent.budget_id) return null;
    const budget = this.budgets.get(intent.budget_id);
    if (!budget) {
      throw new ApiError(409, "financial_constraint", "budget_not_found", "Payment intent references an unknown budget.");
    }
    if (budget.status !== "active") {
      throw new ApiError(409, "financial_constraint", "budget_not_active", "Budget is not active.", { status: budget.status });
    }
    if (budget.currency !== intent.amount.currency) {
      throw new ApiError(409, "financial_constraint", "budget_currency_mismatch", "Budget currency must match the payment intent currency.");
    }
    const view = this.budgetView(budget);
    if (view.available_minor < intent.amount.value) {
      throw new ApiError(409, "insufficient_funds", "budget_limit_exceeded", "Budget has insufficient available funds.", {
        budget_id: budget.id,
        available_minor: view.available_minor,
        requested_minor: intent.amount.value,
      });
    }
    const hold = {
      id: prefix("hold"),
      transaction_id: transaction.id,
      payment_intent_id: intent.id,
      budget_id: budget.id,
      amount_value: intent.amount.value,
      currency: intent.amount.currency,
      status: "active",
      authorization_id: intent.authorization.id,
      idempotency_key: `budget-holds:${transaction.id}:${budget.id}`,
      created_at: new Date().toISOString(),
      released_at: null,
      consumed_at: null,
    };
    this.budgetHolds.set(hold.id, hold);
    const event = this.event("budget_hold_created", hold);
    this.addBudgetPosting(event, hold, "debit", "budget.available");
    this.addBudgetPosting(event, hold, "credit", "budget.reserved");
    return hold;
  }

  consumeBudgetHold(transaction) {
    if (!transaction.budget_hold_id) return;
    const hold = this.budgetHolds.get(transaction.budget_hold_id);
    if (!hold) {
      throw new ApiError(409, "financial_constraint", "budget_hold_not_found", "Transaction budget hold was not found.");
    }
    if (hold.status === "consumed") return;
    if (hold.status !== "active") {
      throw new ApiError(409, "invalid_state_transition", "budget_hold_not_active", "Only an active budget hold can be consumed.", { current_state: hold.status });
    }
    hold.status = "consumed";
    hold.consumed_at = new Date().toISOString();
    const event = this.event("budget_hold_consumed", hold);
    this.addBudgetPosting(event, hold, "debit", "budget.reserved");
    this.addBudgetPosting(event, hold, "credit", "budget.spent");
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
      const fundingBinding = this.ledger?.assertWalletBinding(this.environmentConfig.environment, {
        kind: "funding_source",
        accountId: input.payer_account_id,
        agentId: input.buyer_agent_id,
        asset: input.asset ?? this.environmentConfig.asset ?? input.amount.currency,
        network: input.network ?? this.environmentConfig.network ?? null,
        reference: input.funding_source_id ?? null,
      });
      const targetBinding = this.ledger?.assertWalletBinding(this.environmentConfig.environment, {
        kind: "receiving_target",
        accountId: quote.payee_account_id,
        agentId: quote.seller_agent_id,
        asset: quote.asset ?? this.environmentConfig.asset ?? quote.amount.currency,
        network: quote.network ?? this.environmentConfig.network ?? null,
        reference: quote.receiving_target_id ?? null,
      });
      const evaluation = this.evaluatePaymentMandate(input, quote);
      const policyDecision = {
        id: prefix("dec"),
        decision: evaluation.decision,
        mandate_id: evaluation.mandate.id,
        mandate_version: evaluation.mandate.version,
        request_fingerprint: hash(input),
        input_snapshot: clone({ ...input, quote_id: quote.id }),
        matched_rules: evaluation.matched_rules,
        reason_codes: [evaluation.reason_code],
        budget_context: input.budget_id
          ? { budget_id: input.budget_id, requested_minor: input.amount.value }
          : null,
        effective_until: evaluation.mandate.expires_at,
        idempotency_key: key,
        created_at: new Date().toISOString(),
      };
      this.policyDecisions.set(policyDecision.id, policyDecision);
      const decision = evaluation.decision === "approved" ? "allowed" : evaluation.decision;
      const reason_code = evaluation.reason_code;
      const status =
        decision === "allowed"
          ? "authorized"
          : decision === "denied"
            ? "declined"
            : "requires_authorization";
      const intent = {
        id: prefix("pi"),
        ...clone(input),
        execution_mode: input.execution_mode ?? "immediate",
        payee_account_id: quote.payee_account_id,
        seller_agent_id: quote.seller_agent_id,
        funding_source_binding_id: fundingBinding?.binding?.id ?? null,
        receiving_target_binding_id: targetBinding?.binding?.id ?? null,
        status,
        transaction_id: null,
        authorization: {
          id: prefix("auth"),
          decision,
          reason_code,
          matched_rules: evaluation.matched_rules,
          policy_decision_id: policyDecision.id,
          mandate_version: evaluation.mandate.version,
        },
        policy_decision: policyDecision,
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
      if (decision === "allowed" && intent.execution_mode === "immediate") await this.reserve(intent);
      return this.getPaymentIntent(intent.id);
    });
  }

  async executePaymentIntent(id, input, key) {
    return this.runIdempotentAsync(`payment_intents/${id}/execution`, key, input, async () => {
      const intent = this.intents.get(id);
      if (!intent) {
        throw new ApiError(404, "resource_not_found", "payment_intent_not_found", "Payment intent was not found.");
      }
      if (intent.status === "funds_reserved") return clone(intent);
      if (intent.status !== "authorized") {
        if (intent.status === "requires_authorization") {
          throw new ApiError(
            409,
            "authorization_required",
            "operator_approval_required",
            "This payment intent requires explicit approval and cannot be executed autonomously.",
          );
        }
        throw new ApiError(
          409,
          "invalid_state_transition",
          "intent_not_executable",
          "Only an authorized payment intent can be executed.",
          { current_state: intent.status },
        );
      }
      if (intent.authorization?.decision !== "allowed" || intent.policy_decision?.decision !== "approved") {
        throw new ApiError(
          403,
          "authorization_error",
          "policy_decision_not_approved",
          "Autonomous execution requires an approved PaymentMandate decision.",
        );
      }
      const mandate = this.mandates.get(intent.payment_mandate_id);
      if (mandate && !mandate.legacy) {
        if (mandate.status !== "active") {
          throw new ApiError(
            409,
            "authorization_error",
            "mandate_not_active",
            "The PaymentMandate is no longer active.",
            { mandate_id: mandate.id, mandate_version: intent.authorization.mandate_version },
          );
        }
        if (mandate.version !== intent.authorization.mandate_version) {
          throw new ApiError(
            409,
            "concurrency_conflict",
            "mandate_version_conflict",
            "PaymentMandate version changed before execution.",
            { current_version: mandate.version, expected_version: intent.authorization.mandate_version },
          );
        }
      }
      this.event("payment_intent.execution_requested", intent);
      return this.reserve(intent);
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
      budget: transaction.budget_hold_id
        ? this.budgetView(this.budgets.get(this.budgetHolds.get(transaction.budget_hold_id)?.budget_id))
        : null,
      budget_hold: transaction.budget_hold_id
        ? clone(this.budgetHolds.get(transaction.budget_hold_id) ?? null)
        : null,
      financial_postings: transaction.budget_hold_id
        ? [...this.financialPostings.values()]
            .filter((posting) => posting.transaction_id === transaction.id)
            .map((posting) => clone(posting))
        : [],
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
        const mandate = this.mandates.get(intent.payment_mandate_id);
        if (mandate && !mandate.legacy && mandate.status !== "active") {
          intent.status = "declined";
          intent.authorization.decision = "denied";
          intent.authorization.reason_code = "mandate_not_active";
          this.policyDecisions.get(intent.authorization.policy_decision_id)?.reason_codes.push("mandate_not_active");
          this.event("payment_intent.declined", intent);
          return clone(intent);
        }
        const wasKnownPayee = this.knownPayees.has(intent.payee_account_id);
        intent.status = "authorized";
        intent.authorization.decision = "allowed";
        intent.authorization.reason_code = "human_confirmation";
        const decision = this.policyDecisions.get(intent.authorization.policy_decision_id);
        if (decision) {
          decision.decision = "approved";
          decision.reason_codes = ["human_confirmation"];
        }
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
    const budgetHold = this.createBudgetHold(transaction, intent);
    if (budgetHold) transaction.budget_hold_id = budgetHold.id;
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
    this.consumeBudgetHold(transaction);
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
