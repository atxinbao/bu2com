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
const refundRequestFingerprint = (transactionId, amount, reason) =>
  createHash("sha256")
    .update(JSON.stringify({
      transaction_id: transactionId,
      amount_value: amount.value,
      currency: amount.currency,
      reason: reason ?? null,
    }))
    .digest("hex");
const accountToken = (value) => String(value ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "unknown";
const validateLedgerAccount = (value, field) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.:-]{1,255}$/.test(value)) {
    throw new ApiError(400, "validation_error", "invalid_ledger_account", `${field} must be a stable namespaced ledger account.`, { field });
  }
};

const budgetScopeTypes = new Set(["workspace", "project", "account", "agent"]);
const budgetPeriods = new Set(["lifetime", "calendar_month", "rolling_24h"]);
const mandateStatuses = new Set(["draft", "active", "suspended", "revoked", "expired"]);
const mandateActions = new Set(["activate", "suspend", "revoke", "expire"]);
const executionSessionActions = new Set(["activate", "pause", "complete", "revoke", "expire"]);
const MAX_INTERNAL_SESSION_MS = 15 * 60 * 1000;
const receivableStatuses = new Set(["issued", "pending", "paid", "expired", "cancelled"]);
const accessGrantStatuses = new Set(["active", "expired", "revoked"]);
const reconciliationFeeSources = new Set(["payment", "collection", "refund"]);
const reconciliationObservationKinds = new Set(["payment", "collection", "refund", "fee"]);
const reconciliationObservationStatuses = new Set(["verified", "pending", "unknown"]);
const replayableLedgerEventTypes = new Set([
  "ledger.opening_balance_posted",
  "ledger.correction_posted",
  "transaction.settled",
  "receivable.payment_posted",
  "receivable.payment_posted_late",
  "transaction.refunded",
  "reconciliation.fee_recorded",
]);
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
  if (!Number.isSafeInteger(value) || value < 0) {
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
  if (!Number.isSafeInteger(amount.value) || amount.value < 0) {
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

function validateReconciliationObservation(observation) {
  requireFields(observation ?? {}, ["kind", "provider", "provider_reference", "amount"]);
  if (!reconciliationObservationKinds.has(observation.kind)) {
    throw new ApiError(400, "validation_error", "invalid_reconciliation_observation_kind", "Reconciliation observation kind is invalid.");
  }
  if (typeof observation.provider !== "string" || observation.provider.length === 0 || observation.provider.length > 120) {
    throw new ApiError(400, "validation_error", "invalid_reconciliation_observation_provider", "Reconciliation observation provider is invalid.");
  }
  if (typeof observation.provider_reference !== "string" || observation.provider_reference.length === 0 || observation.provider_reference.length > 255) {
    throw new ApiError(400, "validation_error", "invalid_reconciliation_observation_reference", "Reconciliation observation provider reference is invalid.");
  }
  validateAmount(observation.amount);
  if (observation.status !== undefined && !reconciliationObservationStatuses.has(observation.status)) {
    throw new ApiError(400, "validation_error", "invalid_reconciliation_observation_status", "Reconciliation observation status is invalid.");
  }
  if (observation.source_id !== undefined && (typeof observation.source_id !== "string" || observation.source_id.length === 0 || observation.source_id.length > 255)) {
    throw new ApiError(400, "validation_error", "invalid_reconciliation_observation_source", "Reconciliation observation source_id is invalid.");
  }
  if (observation.observed_at !== undefined) validateDate(observation.observed_at, "observed_at");
}

function postingProjection(postings, currency = null) {
  const balances = new Map();
  const journals = new Map();
  for (const posting of postings) {
    if (currency !== null && posting.currency !== currency) continue;
    const ledgerAccountId = posting.ledger_account_id ?? null;
    const key = `${ledgerAccountId ?? "legacy"}:${posting.currency}:${posting.account}`;
    const current = balances.get(key) ?? {
      account: posting.account,
      currency: posting.currency,
      balance_minor: 0,
      posting_count: 0,
    };
    if (ledgerAccountId !== null) current.ledger_account_id = ledgerAccountId;
    const signedAmount = posting.direction === "debit" ? posting.amount_value : -posting.amount_value;
    const nextBalance = current.balance_minor + signedAmount;
    if (!Number.isSafeInteger(nextBalance)) {
      throw new ApiError(422, "financial_constraint", "projection_amount_overflow", "Ledger projection exceeds the safe integer boundary.", { account: posting.account, currency: posting.currency });
    }
    current.balance_minor = nextBalance;
    current.posting_count += 1;
    balances.set(key, current);
    const journal = journals.get(posting.event_id) ?? { event_id: posting.event_id, currency: posting.currency, debit_minor: 0, credit_minor: 0, posting_count: 0 };
    if (posting.direction === "debit") journal.debit_minor += posting.amount_value;
    if (posting.direction === "credit") journal.credit_minor += posting.amount_value;
    journal.posting_count += 1;
    journals.set(posting.event_id, journal);
  }
  const journalRows = [...journals.values()].map((journal) => ({
    ...journal,
    balanced: journal.debit_minor === journal.credit_minor,
  }));
  return {
    posting_count: [...balances.values()].reduce((total, account) => total + account.posting_count, 0),
    journal_count: journalRows.length,
    unbalanced_journal_count: journalRows.filter((journal) => !journal.balanced).length,
    accounts: [...balances.values()]
      .sort((left, right) =>
        (left.ledger_account_id ?? "").localeCompare(right.ledger_account_id ?? "")
        || left.currency.localeCompare(right.currency)
        || left.account.localeCompare(right.account),
      )
      .map((account) => clone(account)),
    journals: journalRows.sort((left, right) => left.event_id.localeCompare(right.event_id)).map((journal) => clone(journal)),
  };
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
    this.collectionVerificationAttempts = new Map(restored.resources.collection_verification_attempts ?? []);
    this.accessGrants = new Map(restored.resources.access_grants ?? []);
    this.intents = new Map(restored.resources.intents ?? []);
    this.transactions = new Map(restored.resources.transactions ?? []);
    this.deliveries = new Map(restored.resources.deliveries ?? []);
    this.receipts = new Map(restored.resources.receipts ?? []);
    this.mandates = new Map(restored.resources.mandates ?? []);
    this.policyDecisions = new Map(restored.resources.policy_decisions ?? []);
    this.executionSessions = new Map(restored.resources.execution_sessions ?? []);
    this.refunds = new Map(restored.resources.refunds ?? []);
    this.providerFees = new Map(restored.resources.provider_fees ?? []);
    this.reconciliationRuns = new Map(restored.resources.reconciliation_runs ?? []);
    this.openingBalances = new Map(restored.resources.opening_balances ?? []);
    this.ledgerCorrections = new Map(restored.resources.ledger_corrections ?? []);
    this.idempotency = new Map(restored.idempotency ?? []);
    this.events = restored.events ?? [];
    const financial = restored.financial ?? {};
    this.budgets = new Map(financial.budgets ?? []);
    this.budgetHolds = new Map(financial.budget_holds ?? []);
    this.financialPostings = new Map(financial.financial_postings ?? []);
    this.refundAttempts = new Map(financial.refund_attempts ?? []);
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
        collection_verification_attempts: [...this.collectionVerificationAttempts.entries()].map(([id, value]) => [id, clone(value)]),
        access_grants: [...this.accessGrants.entries()].map(([id, value]) => [id, clone(value)]),
        intents: [...this.intents.entries()].map(([id, value]) => [id, clone(value)]),
        transactions: [...this.transactions.entries()].map(([id, value]) => [id, clone(value)]),
        deliveries: [...this.deliveries.entries()].map(([id, value]) => [id, clone(value)]),
        mandates: [...this.mandates.entries()].map(([id, value]) => [id, clone(value)]),
        policy_decisions: [...this.policyDecisions.entries()].map(([id, value]) => [id, clone(value)]),
        execution_sessions: [...this.executionSessions.entries()].map(([id, value]) => [id, clone(value)]),
        refunds: [...this.refunds.entries()].map(([id, value]) => [id, clone(value)]),
        provider_fees: [...this.providerFees.entries()].map(([id, value]) => [id, clone(value)]),
        reconciliation_runs: [...this.reconciliationRuns.entries()].map(([id, value]) => [id, clone(value)]),
        opening_balances: [...this.openingBalances.entries()].map(([id, value]) => [id, clone(value)]),
        ledger_corrections: [...this.ledgerCorrections.entries()].map(([id, value]) => [id, clone(value)]),
        receipts: [...this.receipts.entries()].map(([id, value]) => [id, clone(value)]),
      },
      wallet: clone(this.wallet),
      knownPayees: [...this.knownPayees],
      financial: {
        budgets: [...this.budgets.entries()].map(([id, value]) => [id, clone(value)]),
        budget_holds: [...this.budgetHolds.entries()].map(([id, value]) => [id, clone(value)]),
        financial_postings: [...this.financialPostings.entries()].map(([id, value]) => [id, clone(value)]),
        refund_attempts: [...this.refundAttempts.entries()].map(([id, value]) => [id, clone(value)]),
      },
    };
  }

  restoreState(snapshot) {
    this.quotes = new Map(snapshot.resources.quotes ?? []);
    this.receivables = new Map(snapshot.resources.receivables ?? []);
    this.collections = new Map(snapshot.resources.collections ?? []);
    this.collectionVerificationAttempts = new Map(snapshot.resources.collection_verification_attempts ?? []);
    this.accessGrants = new Map(snapshot.resources.access_grants ?? []);
    this.intents = new Map(snapshot.resources.intents ?? []);
    this.transactions = new Map(snapshot.resources.transactions ?? []);
    this.deliveries = new Map(snapshot.resources.deliveries ?? []);
    this.receipts = new Map(snapshot.resources.receipts ?? []);
    this.mandates = new Map(snapshot.resources.mandates ?? []);
    this.policyDecisions = new Map(snapshot.resources.policy_decisions ?? []);
    this.executionSessions = new Map(snapshot.resources.execution_sessions ?? []);
    this.refunds = new Map(snapshot.resources.refunds ?? []);
    this.providerFees = new Map(snapshot.resources.provider_fees ?? []);
    this.reconciliationRuns = new Map(snapshot.resources.reconciliation_runs ?? []);
    this.openingBalances = new Map(snapshot.resources.opening_balances ?? []);
    this.ledgerCorrections = new Map(snapshot.resources.ledger_corrections ?? []);
    this.wallet = clone(snapshot.wallet);
    this.knownPayees = new Set(snapshot.knownPayees ?? []);
    const financial = snapshot.financial ?? {};
    this.budgets = new Map(financial.budgets ?? []);
    this.budgetHolds = new Map(financial.budget_holds ?? []);
    this.financialPostings = new Map(financial.financial_postings ?? []);
    this.refundAttempts = new Map(financial.refund_attempts ?? []);
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
      .map((collection) => this.collectionView(collection));
  }

  getCollection(id) {
    const collection = this.collections.get(id);
    if (!collection) {
      throw new ApiError(404, "resource_not_found", "collection_not_found", "Collection was not found.");
    }
    return this.collectionView(collection);
  }

  collectionView(collection) {
    const verificationAttempts = (collection.verification_attempt_ids ?? [])
      .map((attemptId) => this.collectionVerificationAttempts.get(attemptId))
      .filter(Boolean)
      .sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.id.localeCompare(right.id))
      .map((attempt) => clone(attempt));
    return {
      ...clone(collection),
      verification_attempts: verificationAttempts,
    };
  }

  recordCollectionVerificationAttempt(collection, verification, observedAt) {
    const attempt = {
      id: prefix("cva"),
      collection_id: collection.id,
      receivable_id: collection.receivable_id,
      provider: verification.provider ?? collection.provider,
      provider_reference: verification.provider_reference,
      status: verification.status,
      amount: clone(verification.amount),
      asset: verification.asset ?? null,
      network: verification.network ?? null,
      payer_account_id: verification.payer_account_id ?? null,
      payer_agent_id: verification.payer_agent_id ?? null,
      verification_mode: verification.verification_mode ?? collection.verification_mode,
      observed_at: observedAt,
      created_at: observedAt,
    };
    this.collectionVerificationAttempts.set(attempt.id, attempt);
    collection.verification_attempt_ids ??= [];
    collection.verification_attempt_ids.push(attempt.id);
    return attempt;
  }

  listAccessGrants() {
    return [...this.accessGrants.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((grant) => this.accessGrantView(grant));
  }

  getAccessGrant(id) {
    const grant = this.accessGrants.get(id);
    if (!grant) {
      throw new ApiError(404, "resource_not_found", "access_grant_not_found", "Access grant was not found.");
    }
    return this.accessGrantView(grant);
  }

  accessGrantView(grant) {
    const collection = this.collections.get(grant.collection_id) ?? null;
    return {
      ...clone(grant),
      collection_status: collection?.status ?? null,
      collection_verification_status: collection?.verification_status ?? null,
    };
  }

  assertPostedCollection(collectionId) {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new ApiError(404, "resource_not_found", "collection_not_found", "Collection was not found.");
    }
    if (collection.status !== "posted" || collection.verification_status !== "verified") {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "collection_not_paid",
        "Access can only be granted from a verified posted Collection.",
        { current_state: collection.status, verification_status: collection.verification_status },
      );
    }
    if (collection.fulfillment_eligible === false) {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "collection_not_fulfillable",
        "A late Collection is recorded for reconciliation but cannot grant paid access.",
        { current_state: collection.status, late: true },
      );
    }
    return collection;
  }

  async createAccessGrant(collectionId, input, key) {
    return this.runIdempotentAsync(
      `collections/${collectionId}/access_grants`,
      key,
      input,
      async () => {
        validateIdentifier(collectionId, "cpay", "collection_id");
        requireFields(input, ["access_type", "access_reference"]);
        const collection = this.assertPostedCollection(collectionId);
        if (typeof input.access_type !== "string" || input.access_type.length > 100) {
          throw new ApiError(400, "validation_error", "invalid_access_type", "access_type must be a short string.");
        }
        if (typeof input.access_reference !== "string" || input.access_reference.length > 255) {
          throw new ApiError(400, "validation_error", "invalid_access_reference", "access_reference must be a string up to 255 characters.");
        }
        validateDate(input.expires_at ?? null, "expires_at", { allowNull: true });
        if (input.expires_at && Date.parse(input.expires_at) <= Date.now()) {
          throw new ApiError(400, "validation_error", "access_grant_expired_at_creation", "expires_at must be in the future.");
        }
        const prior = [...this.accessGrants.values()].find(
          (grant) => grant.collection_id === collection.id && grant.access_reference === input.access_reference,
        );
        if (prior) {
          if (prior.access_type !== input.access_type || prior.expires_at !== (input.expires_at ?? null)) {
            throw new ApiError(
              409,
              "conflict",
              "access_grant_source_conflict",
              "The Collection already has an access grant with different terms.",
            );
          }
          return this.accessGrantView(prior);
        }
        const now = new Date().toISOString();
        const grant = {
          id: input.id ?? prefix("agr"),
          collection_id: collection.id,
          receivable_id: collection.receivable_id,
          account_id: collection.account_id,
          agent_id: collection.agent_id,
          access_type: input.access_type,
          access_reference: input.access_reference,
          status: "active",
          source_type: "collection",
          source_id: collection.id,
          expires_at: input.expires_at ?? null,
          metadata: clone(input.metadata ?? {}),
          version: 1,
          granted_at: now,
          recovered_at: null,
          created_at: now,
          updated_at: now,
        };
        validateIdentifier(grant.id, "agr", "access_grant_id");
        if (!accessGrantStatuses.has(grant.status)) {
          throw new ApiError(500, "internal_error", "invalid_access_grant_status", "Access grant status is invalid.");
        }
        if (this.accessGrants.has(grant.id)) {
          throw new ApiError(409, "conflict", "access_grant_id_exists", "Access grant ID already exists.");
        }
        this.accessGrants.set(grant.id, grant);
        this.event("access_grant.created", grant);
        return this.accessGrantView(grant);
      },
    );
  }

  async recoverAccessGrant(id, input, key) {
    return this.runIdempotentAsync(`access_grants/${id}/recoveries`, key, input, async () => {
      validateIdentifier(id, "agr", "access_grant_id");
      const grant = this.accessGrants.get(id);
      if (!grant) {
        throw new ApiError(404, "resource_not_found", "access_grant_not_found", "Access grant was not found.");
      }
      this.assertPostedCollection(grant.collection_id);
      if (grant.status === "revoked") {
        throw new ApiError(409, "invalid_state_transition", "access_grant_revoked", "A revoked access grant cannot be recovered.");
      }
      if (grant.status === "active") return this.accessGrantView(grant);
      if (grant.status !== "expired") {
        throw new ApiError(409, "invalid_state_transition", "access_grant_not_recoverable", "Only an expired access grant can be recovered.", { current_state: grant.status });
      }
      if (grant.expires_at && Date.parse(grant.expires_at) <= Date.now()) {
        throw new ApiError(409, "invalid_state_transition", "access_grant_expired", "An expired access grant cannot be recovered after its expiry.");
      }
      grant.status = "active";
      grant.recovered_at = new Date().toISOString();
      grant.version += 1;
      grant.updated_at = grant.recovered_at;
      this.event("access_grant.recovered", grant);
      return this.accessGrantView(grant);
    });
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

  addSettlementPostings(event, transaction, intent) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: transaction.id,
        budget_id: null,
        source_id: transaction.id,
        direction: "debit",
        account: `payable.payee:${accountToken(intent.payee_account_id)}`,
        amount_value: transaction.settled_amount.value,
        currency: transaction.settled_amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: transaction.id,
        budget_id: null,
        source_id: transaction.id,
        direction: "credit",
        account: `cash.wallet:${accountToken(intent.payer_account_id)}`,
        amount_value: transaction.settled_amount.value,
        currency: transaction.settled_amount.currency,
        created_at: event.created_at,
      },
    ];
    for (const posting of postings) this.financialPostings.set(posting.id, posting);
    return postings;
  }

  addRefundPostings(event, transaction, refund, intent) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: transaction.id,
        budget_id: null,
        source_id: refund.id,
        direction: "debit",
        account: `cash.wallet:${accountToken(intent.payer_account_id)}`,
        amount_value: refund.amount.value,
        currency: refund.amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: transaction.id,
        budget_id: null,
        source_id: refund.id,
        direction: "credit",
        account: `payable.payee:${accountToken(intent.payee_account_id)}`,
        amount_value: refund.amount.value,
        currency: refund.amount.currency,
        created_at: event.created_at,
      },
    ];
    for (const posting of postings) this.financialPostings.set(posting.id, posting);
    return postings;
  }

  addProviderFeePostings(event, fee) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: fee.source_type === "payment" || fee.source_type === "refund" ? fee.source_id : null,
        budget_id: null,
        source_id: fee.id,
        direction: "debit",
        account: `expense.provider_fee:${accountToken(fee.provider)}`,
        amount_value: fee.amount.value,
        currency: fee.amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: fee.source_type === "payment" || fee.source_type === "refund" ? fee.source_id : null,
        budget_id: null,
        source_id: fee.id,
        direction: "credit",
        account: `cash.account:${accountToken(fee.account_id)}`,
        amount_value: fee.amount.value,
        currency: fee.amount.currency,
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
        let collection = [...this.collections.values()].find(
          (collection) => collection.provider_reference === input.provider_reference,
        );
        if (collection) {
          if (collection.receivable_id !== receivableId || collection.collection_reference !== input.collection_reference) {
            throw new ApiError(
              409,
              "conflict",
              "provider_reference_reused",
              "The provider reference is already attached to another collection.",
            );
          }
          if (collection.status === "posted" && collection.verification_status === "verified") {
            return { collection: this.collectionView(collection), receivable: clone(receivable) };
          }
        }
        if (!collection && receivable.status === "paid") {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "receivable_already_paid",
            "The Receivable has already been paid.",
            { current_state: receivable.status },
          );
        }
        if (!collection && !["issued", "pending", "expired"].includes(receivable.status)) {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "receivable_not_collectible",
            "Only an issued or pending Receivable can accept an inbound payment.",
            { current_state: receivable.status },
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
          (candidate) => candidate.provider_reference === verification.provider_reference && candidate.id !== collection?.id,
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
        const late = collection?.late ?? Date.parse(receivable.expires_at) <= Date.now();
        if (!collection) {
          collection = {
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
            last_observed_at: now,
            late,
            fulfillment_eligible: !late,
            verification_attempt_ids: [],
            created_at: now,
            updated_at: now,
          };
          this.collections.set(collection.id, collection);
        } else {
          collection.provider = verification.provider ?? collection.provider;
          collection.verification_status = verification.status;
          collection.status = verification.status === "verified" ? "posted" : "pending";
          collection.verification_mode = verification.verification_mode ?? collection.verification_mode;
          collection.verified_at = verification.verified_at ?? collection.verified_at ?? now;
          collection.last_observed_at = now;
          collection.late ??= late;
          collection.fulfillment_eligible ??= !late;
          collection.updated_at = now;
          collection.payer_account_id ??= verification.payer_account_id ?? null;
          collection.payer_agent_id ??= verification.payer_agent_id ?? null;
        }
        this.recordCollectionVerificationAttempt(collection, verification, now);
        receivable.collection_id = collection.id;
        receivable.version += 1;
        receivable.updated_at = now;
        if (collection.status === "posted") {
          if (receivable.status !== "expired") receivable.status = "paid";
          receivable.paid_at ??= now;
          const hasPosting = [...this.financialPostings.values()].some(
            (posting) => posting.source_id === collection.id && posting.event_type === "receivable.payment_posted",
          );
          if (!hasPosting) {
            const event = this.event(late ? "receivable.payment_posted_late" : "receivable.payment_posted", collection);
            this.addCollectionPostings(event, collection);
          }
        } else {
          if (receivable.status !== "expired") receivable.status = "pending";
          this.event("receivable.payment_pending", collection);
        }
        return { collection: this.collectionView(collection), receivable: clone(receivable) };
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
      if (!Number.isSafeInteger(input.limit_minor) || input.limit_minor < 0) {
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

  rebuildLedgerProjection({ currency = null } = {}) {
    const projection = postingProjection([...this.financialPostings.values()], currency);
    return {
      generated_at: new Date().toISOString(),
      currency,
      ...projection,
    };
  }

  rebuildLedgerAccountProjection({ ledger_account_id, currency = null } = {}) {
    validateIdentifier(ledger_account_id, "lga", "ledger_account_id");
    this.ledger?.assertLedgerAccountBinding(ledger_account_id, {
      environment: this.environmentConfig.environment,
    });
    const postings = [...this.financialPostings.values()].filter(
      (posting) => posting.ledger_account_id === ledger_account_id,
    );
    const projection = postingProjection(postings, currency);
    return {
      generated_at: new Date().toISOString(),
      ledger_account_id,
      currency,
      ...projection,
    };
  }

  exportLedgerReplayEvidence({ as_of = null } = {}) {
    if (as_of !== null) validateDate(as_of, "as_of");
    const cutoff = as_of === null ? null : Date.parse(as_of);
    const withinCutoff = (value) => cutoff === null || Date.parse(value) <= cutoff;
    const openingCheckpoints = new Map([...this.openingBalances.values()].map((checkpoint) => [checkpoint.id, checkpoint]));
    const events = this.events
      .filter((event) => {
        if (!replayableLedgerEventTypes.has(event.type)) return false;
        if (event.type !== "ledger.opening_balance_posted") return withinCutoff(event.created_at);
        const checkpoint = openingCheckpoints.get(event.resource_id);
        // 已知 checkpoint 的开账事件与分录共享 effective_at；孤立事件仍按
        // created_at 保留，以便回放明确报告历史缺口。
        return checkpoint ? withinCutoff(checkpoint.effective_at) : withinCutoff(event.created_at);
      })
      .map((event, index) => ({ sequence: index + 1, ...clone(event) }));
    // 开账分录代表 checkpoint 的生效时点；即使迁移时实际写入时间晚于
    // as_of，也必须随该 checkpoint 纳入历史重放，否则合法的开账余额会丢失。
    const eligibleOpeningEventIds = new Set(
      [...this.openingBalances.values()]
        .filter((checkpoint) => withinCutoff(checkpoint.effective_at))
        .map((checkpoint) => this.events.find((event) => event.type === "ledger.opening_balance_posted" && event.resource_id === checkpoint.id)?.id)
        .filter(Boolean),
    );
    const openingEventIds = new Set(
      this.events
        .filter((event) => event.type === "ledger.opening_balance_posted")
        .map((event) => event.id),
    );
    const postings = [...this.financialPostings.values()]
      .filter((posting) => openingEventIds.has(posting.event_id)
        ? eligibleOpeningEventIds.has(posting.event_id)
        : withinCutoff(posting.created_at))
      .map((posting) => {
        const { journal_id: _journalId, ...immutablePosting } = clone(posting);
        return { ...immutablePosting, ledger_account_id: posting.ledger_account_id ?? null };
      })
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
    const opening_balances = [...this.openingBalances.values()]
      .filter((checkpoint) => withinCutoff(checkpoint.effective_at))
      .map((checkpoint) => clone(checkpoint))
      .sort((left, right) => left.effective_at.localeCompare(right.effective_at) || left.id.localeCompare(right.id));
    return {
      schema_version: "la05b.v1",
      as_of: as_of ?? null,
      events,
      postings,
      opening_balances,
    };
  }

  replayLedgerHistory({ as_of = null, currency = null } = {}) {
    if (as_of !== null) validateDate(as_of, "as_of");
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
      throw new ApiError(400, "validation_error", "invalid_currency", "currency must be an uppercase three-letter code.");
    }
    const evidence = this.exportLedgerReplayEvidence({ as_of });
    const eventIds = new Set(evidence.events.map((event) => event.id));
    const postingEventIds = new Set(evidence.postings.map((posting) => posting.event_id));
    const eventCurrency = (event) => event.amount?.currency ?? event.currency ?? null;
    const relevantEvents = evidence.events.filter((event) => currency === null || eventCurrency(event) === null || eventCurrency(event) === currency);
    const gaps = [];
    const checkpoints = evidence.opening_balances.filter((checkpoint) => currency === null || checkpoint.amount.currency === currency);
    if ((relevantEvents.length > 0 || evidence.postings.length > 0) && checkpoints.length === 0) {
      gaps.push({ code: "opening_checkpoint_missing", message: "No reconciled opening checkpoint covers the replay window." });
    }
    for (const event of relevantEvents) {
      if (!postingEventIds.has(event.id)) {
        gaps.push({ code: "financial_event_without_posting", event_id: event.id, event_type: event.type, created_at: event.created_at });
      }
    }
    for (const posting of evidence.postings) {
      if (!eventIds.has(posting.event_id)) {
        gaps.push({ code: "posting_without_event", posting_id: posting.id, event_id: posting.event_id });
      }
    }
    const projection = postingProjection(evidence.postings, currency);
    return {
      schema_version: "la05b.v1",
      source: "immutable_postings",
      as_of: as_of ?? null,
      currency,
      status: gaps.length === 0 ? "complete" : "incomplete",
      automatic_provider_replay: false,
      checkpoint_count: checkpoints.length,
      event_count: relevantEvents.length,
      replayed_event_count: relevantEvents.filter((event) => postingEventIds.has(event.id)).length,
      gap_count: gaps.length,
      gaps,
      ...projection,
    };
  }

  catchUpLedgerFromBackup({ baseline, as_of = null, currency = null } = {}) {
    if (!baseline || baseline.schema_version !== "la05b.v1" || !Array.isArray(baseline.events) || !Array.isArray(baseline.postings) || !Array.isArray(baseline.opening_balances)) {
      throw new ApiError(400, "validation_error", "invalid_replay_baseline", "A LA-05b replay baseline must contain versioned events, postings, and opening balances.");
    }
    const current = this.exportLedgerReplayEvidence({ as_of });
    const conflicts = [];
    const baselineEvents = new Map(baseline.events.map((event) => [event.id, event]));
    const baselinePostings = new Map(baseline.postings.map((posting) => [posting.id, posting]));
    const baselineCheckpoints = new Map(baseline.opening_balances.map((checkpoint) => [checkpoint.id, checkpoint]));
    for (const event of baseline.events) {
      const currentEvent = current.events.find((candidate) => candidate.id === event.id);
      if (!currentEvent) conflicts.push({ code: "baseline_event_missing", event_id: event.id });
      else if (hash(currentEvent) !== hash(event)) conflicts.push({ code: "baseline_event_changed", event_id: event.id });
    }
    for (const posting of baseline.postings) {
      const currentPosting = current.postings.find((candidate) => candidate.id === posting.id);
      if (!currentPosting) conflicts.push({ code: "baseline_posting_missing", posting_id: posting.id });
      else if (hash(currentPosting) !== hash(posting)) conflicts.push({ code: "baseline_posting_changed", posting_id: posting.id });
    }
    for (const checkpoint of baseline.opening_balances) {
      const currentCheckpoint = current.opening_balances.find((candidate) => candidate.id === checkpoint.id);
      if (!currentCheckpoint) conflicts.push({ code: "baseline_checkpoint_missing", checkpoint_id: checkpoint.id });
      else if (hash(currentCheckpoint) !== hash(checkpoint)) conflicts.push({ code: "baseline_checkpoint_changed", checkpoint_id: checkpoint.id });
    }
    const append_events = current.events.filter((event) => !baselineEvents.has(event.id));
    const append_postings = current.postings.filter((posting) => !baselinePostings.has(posting.id));
    const append_opening_balances = current.opening_balances.filter((checkpoint) => !baselineCheckpoints.has(checkpoint.id));
    const replay = this.replayLedgerHistory({ as_of, currency });
    return {
      schema_version: "la05b.v1",
      as_of: as_of ?? null,
      status: conflicts.length > 0 ? "blocked" : append_events.length > 0 || append_postings.length > 0 ? "catch_up_required" : "caught_up",
      automatic_provider_replay: false,
      conflicts,
      append_event_count: append_events.length,
      append_posting_count: append_postings.length,
      append_opening_balance_count: append_opening_balances.length,
      append_events,
      append_postings,
      append_opening_balances,
      replay,
    };
  }

  listOpeningBalances() {
    return [...this.openingBalances.values()]
      .sort((left, right) => right.effective_at.localeCompare(left.effective_at) || right.id.localeCompare(left.id))
      .map((checkpoint) => clone(checkpoint));
  }

  getOpeningBalance(id) {
    const checkpoint = this.openingBalances.get(id);
    if (!checkpoint) throw new ApiError(404, "resource_not_found", "opening_balance_not_found", "Opening balance checkpoint was not found.");
    return clone(checkpoint);
  }

  listLedgerCorrections() {
    return [...this.ledgerCorrections.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((correction) => clone(correction));
  }

  getLedgerCorrection(id) {
    const correction = this.ledgerCorrections.get(id);
    if (!correction) throw new ApiError(404, "resource_not_found", "ledger_correction_not_found", "Ledger correction was not found.");
    return clone(correction);
  }

  addOpeningBalancePostings(event, checkpoint) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: null,
        budget_id: null,
        source_id: checkpoint.id,
        direction: "debit",
        account: `asset.cash:${accountToken(checkpoint.account_id)}`,
        amount_value: checkpoint.amount.value,
        currency: checkpoint.amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: null,
        budget_id: null,
        source_id: checkpoint.id,
        direction: "credit",
        account: `equity.opening_balance:${accountToken(checkpoint.id)}`,
        amount_value: checkpoint.amount.value,
        currency: checkpoint.amount.currency,
        created_at: event.created_at,
      },
    ];
    for (const posting of postings) this.financialPostings.set(posting.id, posting);
    return postings;
  }

  addCorrectionPostings(event, correction) {
    const postings = [
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: correction.transaction_id ?? null,
        budget_id: null,
        source_id: correction.id,
        direction: correction.debit_direction,
        account: correction.debit_account,
        amount_value: correction.amount.value,
        currency: correction.amount.currency,
        created_at: event.created_at,
      },
      {
        id: prefix("pst"),
        event_id: event.id,
        event_type: event.type,
        transaction_id: correction.transaction_id ?? null,
        budget_id: null,
        source_id: correction.id,
        direction: correction.credit_direction,
        account: correction.credit_account,
        amount_value: correction.amount.value,
        currency: correction.amount.currency,
        created_at: event.created_at,
      },
    ];
    for (const posting of postings) this.financialPostings.set(posting.id, posting);
    return postings;
  }

  async createOpeningBalance(input, key) {
    return this.runIdempotentAsync("opening_balances", key, input, async () => {
      requireFields(input, ["book_id", "account_id", "owner_account_id", "funding_source_id", "environment", "asset", "network", "amount", "effective_at", "source_reference", "reason"]);
      validateIdentifier(input.account_id, "acct", "account_id");
      validateIdentifier(input.owner_account_id, "acct", "owner_account_id");
      validateIdentifier(input.funding_source_id, "fund", "funding_source_id");
      if (!/^[A-Za-z0-9_-]{2,120}$/.test(input.book_id)) throw new ApiError(400, "validation_error", "invalid_book_id", "book_id is invalid.");
      if (input.environment !== this.environmentConfig.environment) throw new ApiError(409, "environment_error", "opening_balance_environment_mismatch", "Opening balance environment must match the active runtime.");
      if (typeof input.asset !== "string" || !/^[A-Za-z0-9._-]{2,32}$/.test(input.asset)) throw new ApiError(400, "validation_error", "invalid_asset", "asset is invalid.");
      if (typeof input.network !== "string" || !/^[A-Za-z0-9._:-]{2,80}$/.test(input.network)) throw new ApiError(400, "validation_error", "invalid_network", "network is invalid.");
      validateAmount(input.amount);
      validateDate(input.effective_at, "effective_at");
      const checkpoint = {
        id: input.id ?? prefix("obc"),
        book_id: input.book_id,
        account_id: input.account_id,
        owner_account_id: input.owner_account_id,
        funding_source_id: input.funding_source_id,
        environment: input.environment,
        asset: input.asset,
        network: input.network,
        amount: clone(input.amount),
        effective_at: input.effective_at,
        source_reference: input.source_reference,
        reason: input.reason,
        status: "posted",
        created_at: new Date().toISOString(),
      };
      validateIdentifier(checkpoint.id, "obc", "opening_balance_id");
      if (this.openingBalances.has(checkpoint.id)) throw new ApiError(409, "conflict", "opening_balance_id_exists", "Opening balance checkpoint ID already exists.");
      this.openingBalances.set(checkpoint.id, checkpoint);
      const event = this.event("ledger.opening_balance_posted", checkpoint);
      this.addOpeningBalancePostings(event, checkpoint);
      return clone(checkpoint);
    });
  }

  async postLedgerCorrection(input, key) {
    return this.runIdempotentAsync("ledger_corrections", key, input, async () => {
      requireFields(input, ["original_event_id", "book_id", "environment", "amount", "debit_account", "credit_account", "reason"]);
      const original = this.events.find((event) => event.id === input.original_event_id);
      if (!original) throw new ApiError(404, "resource_not_found", "original_event_not_found", "The original ledger event was not found.");
      if (input.environment !== this.environmentConfig.environment) throw new ApiError(409, "environment_error", "correction_environment_mismatch", "Ledger correction environment must match the active runtime.");
      if (!/^[A-Za-z0-9_-]{2,120}$/.test(input.book_id)) throw new ApiError(400, "validation_error", "invalid_book_id", "book_id is invalid.");
      validateAmount(input.amount);
      validateLedgerAccount(input.debit_account, "debit_account");
      validateLedgerAccount(input.credit_account, "credit_account");
      if (input.debit_account === input.credit_account) throw new ApiError(400, "validation_error", "correction_accounts_identical", "Correction debit and credit accounts must differ.");
      if (input.transaction_id !== undefined && input.transaction_id !== null) validateIdentifier(input.transaction_id, "txn", "transaction_id");
      const correction = {
        id: input.id ?? prefix("cor"),
        original_event_id: input.original_event_id,
        book_id: input.book_id,
        environment: input.environment,
        transaction_id: input.transaction_id ?? null,
        amount: clone(input.amount),
        debit_account: input.debit_account,
        credit_account: input.credit_account,
        debit_direction: "debit",
        credit_direction: "credit",
        reason: input.reason,
        status: "posted",
        created_at: new Date().toISOString(),
      };
      validateIdentifier(correction.id, "cor", "correction_id");
      if (this.ledgerCorrections.has(correction.id)) throw new ApiError(409, "conflict", "correction_id_exists", "Ledger correction ID already exists.");
      this.ledgerCorrections.set(correction.id, correction);
      const event = this.event("ledger.correction_posted", correction);
      this.addCorrectionPostings(event, correction);
      return clone(correction);
    });
  }

  providerFeeView(fee) {
    return clone(fee);
  }

  listProviderFees() {
    return [...this.providerFees.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((fee) => this.providerFeeView(fee));
  }

  getProviderFee(id) {
    const fee = this.providerFees.get(id);
    if (!fee) throw new ApiError(404, "resource_not_found", "provider_fee_not_found", "Provider fee was not found.");
    return this.providerFeeView(fee);
  }

  reconciliationRunView(run) {
    return clone(run);
  }

  listReconciliationRuns() {
    return [...this.reconciliationRuns.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((run) => this.reconciliationRunView(run));
  }

  getReconciliationRun(id) {
    const run = this.reconciliationRuns.get(id);
    if (!run) throw new ApiError(404, "resource_not_found", "reconciliation_run_not_found", "Reconciliation run was not found.");
    return this.reconciliationRunView(run);
  }

  reconciliationSource(sourceType, sourceId) {
    if (sourceType === "payment") {
      const transaction = this.transactions.get(sourceId);
      if (!transaction) throw new ApiError(404, "resource_not_found", "transaction_not_found", "Payment transaction was not found.");
      if (!["settled", "refunded"].includes(transaction.status)) {
        throw new ApiError(409, "invalid_state_transition", "payment_not_reconcilable", "Only a settled payment can record a provider fee.", { current_state: transaction.status });
      }
      return {
        source_id: transaction.id,
        provider_reference: transaction.settlement_provider_reference ?? null,
        amount: transaction.settled_amount,
        account_id: this.intents.get(transaction.payment_intent_id)?.payer_account_id ?? null,
        agent_id: this.intents.get(transaction.payment_intent_id)?.buyer_agent_id ?? null,
      };
    }
    if (sourceType === "collection") {
      const collection = this.collections.get(sourceId);
      if (!collection) throw new ApiError(404, "resource_not_found", "collection_not_found", "Collection was not found.");
      if (collection.status !== "posted") {
        throw new ApiError(409, "invalid_state_transition", "collection_not_reconcilable", "Only a posted collection can record a provider fee.", { current_state: collection.status });
      }
      return {
        source_id: collection.id,
        provider_reference: collection.provider_reference,
        amount: collection.amount,
        account_id: collection.account_id,
        agent_id: collection.agent_id,
      };
    }
    if (sourceType === "refund") {
      const refund = this.refunds.get(sourceId);
      if (!refund) throw new ApiError(404, "resource_not_found", "refund_not_found", "Refund was not found.");
      if (refund.status !== "refunded") {
        throw new ApiError(409, "invalid_state_transition", "refund_not_reconcilable", "Only a confirmed refund can record a provider fee.", { current_state: refund.status });
      }
      const transaction = this.transactions.get(refund.transaction_id);
      return {
        source_id: refund.id,
        provider_reference: refund.provider_reference,
        amount: refund.amount,
        account_id: this.intents.get(transaction?.payment_intent_id)?.payer_account_id ?? null,
        agent_id: this.intents.get(transaction?.payment_intent_id)?.buyer_agent_id ?? null,
      };
    }
    throw new ApiError(400, "validation_error", "invalid_reconciliation_source", "Provider fee source type is invalid.");
  }

  async recordProviderFee(input, key) {
    return this.runIdempotentAsync("provider_fees", key, input, async () => {
      requireFields(input, ["source_type", "source_id", "provider", "provider_reference", "amount"]);
      if (!reconciliationFeeSources.has(input.source_type)) {
        throw new ApiError(400, "validation_error", "invalid_reconciliation_source", "Provider fee source type is invalid.");
      }
      validateIdentifier(input.source_id, input.source_type === "payment" ? "txn" : input.source_type === "collection" ? "cpay" : "ref", "source_id");
      validateAmount(input.amount);
      if (input.amount.value <= 0) {
        throw new ApiError(400, "validation_error", "invalid_fee_amount", "Provider fee amount must be positive.");
      }
      if (typeof input.provider !== "string" || input.provider.length === 0 || input.provider.length > 120) {
        throw new ApiError(400, "validation_error", "invalid_provider", "Provider must be a non-empty string up to 120 characters.");
      }
      if (typeof input.provider_reference !== "string" || input.provider_reference.length === 0 || input.provider_reference.length > 255) {
        throw new ApiError(400, "validation_error", "invalid_provider_reference", "Provider reference must be a non-empty string up to 255 characters.");
      }
      const source = this.reconciliationSource(input.source_type, input.source_id);
      if (source.provider_reference !== input.provider_reference) {
        throw new ApiError(409, "provider_error", "provider_reference_mismatch", "Provider fee reference does not match the source fact.", { expected: source.provider_reference });
      }
      if (source.amount.currency !== input.amount.currency) {
        throw new ApiError(409, "provider_error", "fee_currency_mismatch", "Provider fee currency must match the source fact currency.");
      }
      if (input.amount.value > source.amount.value) {
        throw new ApiError(409, "financial_constraint", "fee_amount_exceeded", "Provider fee cannot exceed the source fact amount.", { source_amount: source.amount });
      }
      const duplicate = [...this.providerFees.values()].find(
        (fee) => fee.source_type === input.source_type && fee.source_id === input.source_id && fee.provider_reference === input.provider_reference,
      );
      if (duplicate) {
        if (duplicate.amount.value !== input.amount.value || duplicate.amount.currency !== input.amount.currency || duplicate.provider !== input.provider) {
          throw new ApiError(409, "conflict", "provider_fee_conflict", "A provider fee already exists for this source with different terms.");
        }
        return this.providerFeeView(duplicate);
      }
      const now = new Date().toISOString();
      const fee = {
        id: input.id ?? prefix("fee"),
        source_type: input.source_type,
        source_id: input.source_id,
        provider: input.provider,
        provider_reference: input.provider_reference,
        amount: clone(input.amount),
        account_id: source.account_id,
        agent_id: source.agent_id,
        status: "reported",
        observed_at: input.observed_at ?? now,
        metadata: clone(input.metadata ?? {}),
        created_at: now,
      };
      validateIdentifier(fee.id, "fee", "provider_fee_id");
      if (this.providerFees.has(fee.id)) throw new ApiError(409, "conflict", "provider_fee_id_exists", "Provider fee ID already exists.");
      validateDate(fee.observed_at, "observed_at");
      this.providerFees.set(fee.id, fee);
      const event = this.event("reconciliation.fee_recorded", fee);
      this.addProviderFeePostings(event, fee);
      return this.providerFeeView(fee);
    });
  }

  reconciliationItems(asOf = null, observations = undefined) {
    const cutoff = asOf ? Date.parse(asOf) : null;
    const withinCutoff = (value) => cutoff === null || Date.parse(value) <= cutoff;
    const items = [];
    for (const transaction of this.transactions.values()) {
      if (!["delivery_submitted", "settled", "refunded"].includes(transaction.status)) continue;
      if (!withinCutoff(transaction.created_at)) continue;
      const operation = this.ledger?.getAdapterOperation(`settle:${transaction.id}`) ?? null;
      const expected = ["settled", "refunded"].includes(transaction.status)
        ? transaction.settled_amount
        : transaction.reserved_amount;
      const issues = [];
      let status = "matched";
      if (!operation || operation.status !== "settled") {
        status = "unknown";
        issues.push("payment_provider_result_unknown");
      } else if (operation.amount_value !== expected.value || operation.currency !== expected.currency || operation.provider_reference !== transaction.settlement_provider_reference) {
        status = "exception";
        issues.push("payment_provider_amount_or_reference_mismatch");
      }
      items.push({
        kind: "payment",
        source_id: transaction.id,
        provider_reference: transaction.settlement_provider_reference ?? null,
        expected_amount: clone(expected),
        observed_amount: operation ? { value: Number(operation.amount_value), currency: operation.currency } : null,
        status,
        issues,
      });
    }
    for (const collection of this.collections.values()) {
      if (!["posted", "pending"].includes(collection.status)) continue;
      if (!withinCutoff(collection.created_at)) continue;
      const status = collection.status === "posted" && collection.provider_reference ? "matched" : "unknown";
      items.push({
        kind: "collection",
        source_id: collection.id,
        provider_reference: collection.provider_reference ?? null,
        expected_amount: clone(collection.amount),
        observed_amount: collection.status === "posted" ? clone(collection.amount) : null,
        status,
        issues: status === "matched" ? [] : ["collection_not_posted"],
      });
    }
    for (const refund of this.refunds.values()) {
      if (!["refunded", "processing", "provider_unknown"].includes(refund.status)) continue;
      if (!withinCutoff(refund.created_at)) continue;
      const status = refund.status === "refunded" && refund.provider_reference ? "matched" : "unknown";
      items.push({
        kind: "refund",
        source_id: refund.id,
        provider_reference: refund.provider_reference ?? null,
        expected_amount: clone(refund.amount),
        observed_amount: status === "matched" ? clone(refund.amount) : null,
        status,
        issues: status === "matched" ? [] : ["refund_result_unknown"],
      });
    }
    for (const fee of this.providerFees.values()) {
      if (!withinCutoff(fee.observed_at ?? fee.created_at)) continue;
      items.push({
        kind: "fee",
        source_id: fee.id,
        provider_reference: fee.provider_reference,
        expected_amount: clone(fee.amount),
        observed_amount: clone(fee.amount),
        status: "matched",
        issues: [],
      });
    }
    if (observations === undefined) return items.sort((left, right) => left.source_id.localeCompare(right.source_id));
    if (!Array.isArray(observations) || observations.length > 1_000) {
      throw new ApiError(400, "validation_error", "invalid_reconciliation_observations", "Reconciliation observations must be an array with at most 1000 entries.");
    }
    observations.forEach(validateReconciliationObservation);
    const consumed = new Set();
    for (const item of items) {
      const index = observations.findIndex((observation, candidateIndex) => {
        if (consumed.has(candidateIndex) || observation.kind !== item.kind) return false;
        if (observation.source_id) return observation.source_id === item.source_id;
        return observation.provider_reference === item.provider_reference;
      });
      if (index < 0) {
        item.status = "unknown";
        item.observed_amount = null;
        item.issues = [...new Set([...item.issues, "external_observation_missing"])];
        continue;
      }
      const observation = observations[index];
      consumed.add(index);
      item.observation = clone(observation);
      item.observed_amount = clone(observation.amount);
      if ((observation.status ?? "verified") !== "verified") {
        item.status = "unknown";
        item.issues = [...new Set([...item.issues, "external_observation_unknown"])];
      }
      if (
        observation.amount.value !== item.expected_amount.value ||
        observation.amount.currency !== item.expected_amount.currency ||
        (item.provider_reference !== null && observation.provider_reference !== item.provider_reference)
      ) {
        item.status = "exception";
        item.issues = [...new Set([...item.issues, "external_observation_mismatch"])];
      }
      if (item.status === "unknown" && (observation.status ?? "verified") === "verified") {
        item.issues = [...new Set([...item.issues, "local_fact_unknown"])];
      }
    }
    observations.forEach((observation, index) => {
      if (consumed.has(index)) return;
      items.push({
        kind: "external",
        source_id: `external:${observation.provider}:${observation.provider_reference}`,
        provider_reference: observation.provider_reference,
        expected_amount: clone(observation.amount),
        observed_amount: clone(observation.amount),
        observation: clone(observation),
        status: "unknown",
        issues: ["external_fact_unmatched"],
      });
    });
    return items.sort((left, right) => left.source_id.localeCompare(right.source_id));
  }

  async createReconciliation(input, key) {
    return this.runIdempotentAsync("reconciliations", key, input ?? {}, async () => {
      const asOf = input?.as_of ?? new Date().toISOString();
      validateDate(asOf, "as_of");
      const items = this.reconciliationItems(asOf, input?.observations);
      const totals = {};
      for (const item of items) {
        if (!["payment", "collection", "refund", "fee"].includes(item.kind)) continue;
        const currency = item.expected_amount.currency;
        totals[currency] ??= { payments: 0, collections: 0, refunds: 0, fees: 0 };
        const bucket = totals[currency];
        if (item.kind === "payment") bucket.payments += item.expected_amount.value;
        if (item.kind === "collection") bucket.collections += item.expected_amount.value;
        if (item.kind === "refund") bucket.refunds += item.expected_amount.value;
        if (item.kind === "fee") bucket.fees += item.expected_amount.value;
      }
      const hasException = items.some((item) => item.status === "exception");
      const hasUnknown = items.some((item) => item.status === "unknown");
      const status = hasException ? "exception" : hasUnknown ? "unknown" : "matched";
      const run = {
        id: input?.id ?? prefix("rec"),
        as_of: asOf,
        mode: input?.observations === undefined ? "internal" : "external",
        status,
        item_count: items.length,
        exception_count: items.filter((item) => item.status === "exception").length,
        unknown_count: items.filter((item) => item.status === "unknown").length,
        totals,
        items,
        created_at: new Date().toISOString(),
      };
      validateIdentifier(run.id, "rec", "reconciliation_run_id");
      if (this.reconciliationRuns.has(run.id)) throw new ApiError(409, "conflict", "reconciliation_run_id_exists", "Reconciliation run ID already exists.");
      this.reconciliationRuns.set(run.id, run);
      this.event("reconciliation.completed", run);
      return this.reconciliationRunView(run);
    });
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

  executionSessionView(session) {
    const view = clone(session);
    if (["requested", "active", "paused"].includes(view.status) && Date.parse(view.expires_at) <= Date.now()) {
      view.status = "expired";
    }
    view.remaining_spend = {
      value: Math.max(0, view.max_spend.value - view.reserved_spend_minor - view.committed_spend_minor),
      currency: view.max_spend.currency,
    };
    return view;
  }

  async createExecutionSession(input, key) {
    return this.runIdempotentAsync("execution_sessions", key, input, async () => {
      requireFields(input, [
        "tenant_id",
        "account_id",
        "agent_id",
        "environment",
        "purpose",
        "max_spend",
        "starts_at",
        "expires_at",
      ]);
      validateIdentifier(input.tenant_id, "ten", "tenant_id");
      validateIdentifier(input.account_id, "acct", "account_id");
      validateIdentifier(input.agent_id, "agt", "agent_id");
      if (input.environment !== this.environmentConfig.environment) {
        throw new ApiError(409, "policy_error", "session_environment_mismatch", "Execution session environment must match the active runtime environment.");
      }
      if (input.environment === "live") {
        throw new ApiError(403, "authorization_error", "live_session_forbidden", "Internal execution sessions cannot be created for Live.");
      }
      validateAmount(input.max_spend);
      if (input.max_spend.value <= 0) {
        throw new ApiError(400, "validation_error", "invalid_session_spend", "max_spend must be positive.");
      }
      if (typeof input.purpose !== "string" || input.purpose.trim().length === 0 || input.purpose.length > 500) {
        throw new ApiError(400, "validation_error", "invalid_session_purpose", "purpose must be a non-empty string up to 500 characters.");
      }
      validateDate(input.starts_at, "starts_at");
      validateDate(input.expires_at, "expires_at");
      const startsAt = Date.parse(input.starts_at);
      const expiresAt = Date.parse(input.expires_at);
      if (expiresAt <= startsAt || expiresAt - startsAt > MAX_INTERNAL_SESSION_MS) {
        throw new ApiError(400, "validation_error", "invalid_session_window", "Execution session must end after it starts and last no longer than 15 minutes.");
      }
      const session = {
        id: input.id ?? prefix("ses"),
        tenant_id: input.tenant_id,
        account_id: input.account_id,
        agent_id: input.agent_id,
        environment: input.environment,
        purpose: input.purpose.trim(),
        max_spend: clone(input.max_spend),
        reserved_spend_minor: 0,
        committed_spend_minor: 0,
        status: "requested",
        activation_status: "pending",
        activation_id: null,
        activation_reviewer: null,
        activation_reason: null,
        starts_at: input.starts_at,
        expires_at: input.expires_at,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      validateIdentifier(session.id, "ses", "execution_session_id");
      if (this.executionSessions.has(session.id)) {
        throw new ApiError(409, "conflict", "execution_session_id_exists", "Execution session ID already exists.");
      }
      this.executionSessions.set(session.id, session);
      this.event("execution_session.created", session);
      return this.executionSessionView(session);
    });
  }

  listExecutionSessions() {
    return [...this.executionSessions.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((session) => this.executionSessionView(session));
  }

  getExecutionSession(id) {
    validateIdentifier(id, "ses", "execution_session_id");
    const session = this.executionSessions.get(id);
    if (!session) throw new ApiError(404, "resource_not_found", "execution_session_not_found", "Execution session was not found.");
    return this.executionSessionView(session);
  }

  async transitionExecutionSession(id, action, input, key) {
    return this.runIdempotentAsync(`execution_sessions/${id}/${action}`, key, input, async () => {
      validateIdentifier(id, "ses", "execution_session_id");
      if (!executionSessionActions.has(action)) {
        throw new ApiError(400, "validation_error", "invalid_session_action", "Execution session action is invalid.");
      }
      const session = this.executionSessions.get(id);
      if (!session) throw new ApiError(404, "resource_not_found", "execution_session_not_found", "Execution session was not found.");
      if (input.version !== session.version) {
        throw new ApiError(409, "concurrency_conflict", "execution_session_version_conflict", "Execution session version changed; query before retrying.", { current_version: session.version });
      }
      const now = Date.now();
      if (["requested", "active", "paused"].includes(session.status) && Date.parse(session.expires_at) <= now && action !== "expire") {
        session.status = "expired";
        session.activation_status = session.activation_status === "active" ? "expired" : session.activation_status;
        session.version += 1;
        session.updated_at = new Date().toISOString();
        this.event("execution_session.expired", session);
        throw new ApiError(409, "invalid_state_transition", "execution_session_expired", "Execution session has expired.");
      }
      if (action === "activate") {
        requireFields(input, ["activation_id", "approved_by"]);
        if (!/^act_[A-Za-z0-9_-]+$/.test(input.activation_id) || typeof input.approved_by !== "string" || input.approved_by.trim().length < 3) {
          throw new ApiError(400, "validation_error", "invalid_session_activation", "Activation requires a valid activation_id and reviewer.");
        }
      }
      const transitions = {
        activate: { requested: "active", paused: "active" },
        pause: { active: "paused" },
        complete: { active: "completed", paused: "completed" },
        revoke: { requested: "revoked", active: "revoked", paused: "revoked" },
        expire: { requested: "expired", active: "expired", paused: "expired" },
      };
      const next = transitions[action]?.[session.status];
      if (!next) throw new ApiError(409, "invalid_state_transition", "execution_session_not_transitionable", "Execution session cannot perform this state transition.", { current_state: session.status, action });
      if (action === "activate") {
        if (this.environmentConfig.execution_status !== "execution_enabled") {
          throw new ApiError(503, "policy_error", "environment_execution_disabled", "Payment execution is disabled for this environment.", { environment: this.environmentConfig.environment });
        }
        session.activation_status = "active";
        session.activation_id = input.activation_id;
        session.activation_reviewer = input.approved_by;
        session.activation_reason = input.reason ?? null;
        session.activated_at = new Date().toISOString();
      } else if (action === "revoke") {
        session.activation_status = "revoked";
        session.revoked_at = new Date().toISOString();
      } else if (action === "expire") {
        session.activation_status = "expired";
      }
      session.status = next;
      session.version += 1;
      session.updated_at = new Date().toISOString();
      this.event(`execution_session.${next}`, session);
      return this.executionSessionView(session);
    });
  }

  assertExecutionSessionForIntent(input) {
    if (!input.execution_session_id) return null;
    validateIdentifier(input.execution_session_id, "ses", "execution_session_id");
    const session = this.executionSessions.get(input.execution_session_id);
    if (!session) throw new ApiError(404, "resource_not_found", "execution_session_not_found", "Execution session was not found.");
    if (session.environment !== this.environmentConfig.environment || session.account_id !== input.payer_account_id || session.agent_id !== input.buyer_agent_id) {
      throw new ApiError(409, "authorization_error", "execution_session_binding_mismatch", "Execution session must belong to the payment account, Agent and environment.");
    }
    if (session.status !== "active" || session.activation_status !== "active" || Date.parse(session.expires_at) <= Date.now()) {
      throw new ApiError(409, "authorization_error", "execution_session_not_active", "Payment requires an active, separately approved execution session.", { session_id: session.id, status: session.status });
    }
    if (session.max_spend.currency !== input.amount.currency) {
      throw new ApiError(409, "financial_constraint", "execution_session_currency_mismatch", "Execution session currency must match the payment amount.");
    }
    return session;
  }

  reserveExecutionSession(intent) {
    const session = intent.execution_session_id ? this.executionSessions.get(intent.execution_session_id) : null;
    if (!session) return null;
    this.assertExecutionSessionForIntent(intent);
    const remaining = session.max_spend.value - session.reserved_spend_minor - session.committed_spend_minor;
    if (remaining < intent.amount.value) {
      throw new ApiError(409, "financial_constraint", "execution_session_limit_exceeded", "Execution session has insufficient remaining spend.", { session_id: session.id, remaining_minor: remaining, requested_minor: intent.amount.value });
    }
    session.reserved_spend_minor += intent.amount.value;
    session.updated_at = new Date().toISOString();
    this.event("execution_session.spend_reserved", session);
    return session;
  }

  commitExecutionSession(transaction) {
    const intent = this.intents.get(transaction.payment_intent_id);
    const session = intent?.execution_session_id ? this.executionSessions.get(intent.execution_session_id) : null;
    if (!session) return;
    const value = transaction.settled_amount.value;
    session.reserved_spend_minor = Math.max(0, session.reserved_spend_minor - value);
    session.committed_spend_minor += value;
    session.updated_at = new Date().toISOString();
    this.event("execution_session.spend_committed", session);
  }

  releaseExecutionSession(transaction) {
    const intent = this.intents.get(transaction.payment_intent_id);
    const session = intent?.execution_session_id ? this.executionSessions.get(intent.execution_session_id) : null;
    if (!session) return;
    session.reserved_spend_minor = Math.max(0, session.reserved_spend_minor - transaction.reserved_amount.value);
    session.updated_at = new Date().toISOString();
    this.event("execution_session.spend_released", session);
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

  releaseBudgetHold(transaction) {
    if (!transaction.budget_hold_id) return;
    const hold = this.budgetHolds.get(transaction.budget_hold_id);
    if (!hold) {
      throw new ApiError(409, "financial_constraint", "budget_hold_not_found", "Transaction budget hold was not found.");
    }
    if (hold.status === "released") return;
    if (hold.status !== "active") {
      throw new ApiError(409, "invalid_state_transition", "budget_hold_not_releasable", "Only an active budget hold can be released.", { current_state: hold.status });
    }
    hold.status = "released";
    hold.released_at = new Date().toISOString();
    const event = this.event("budget_hold_released", hold);
    this.addBudgetPosting(event, hold, "debit", "budget.reserved");
    this.addBudgetPosting(event, hold, "credit", "budget.available");
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
      this.assertExecutionSessionForIntent(input);
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
    const executionSession = intent?.execution_session_id
      ? (this.executionSessions.get(intent.execution_session_id) ?? null)
      : null;
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
      execution_session: executionSession ? this.executionSessionView(executionSession) : null,
      quote: quote ? clone(quote) : null,
      delivery: delivery ? clone(delivery) : null,
      receipt: receiptView,
      refunds: this.listRefunds(transaction.id),
      cancellation: transaction.status === "canceled"
        ? {
            status: transaction.status,
            reason: transaction.cancel_reason ?? null,
            provider_reference: transaction.cancel_provider_reference ?? null,
            canceled_at: transaction.canceled_at ?? null,
          }
        : null,
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
    this.reserveExecutionSession(intent);
    const zero = { value: 0, currency: intent.amount.currency };
      const transaction = {
        id: prefix("txn"),
        payment_intent_id: intent.id,
        execution_session_id: intent.execution_session_id ?? null,
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

  async cancelTransaction(transactionId, input, key) {
    return this.runIdempotentAsync(
      `transactions/${transactionId}/cancellations`,
      key,
      input,
      async () => {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
          throw new ApiError(404, "resource_not_found", "transaction_not_found", "Transaction was not found.");
        }
        if (transaction.status !== "funds_reserved") {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "transaction_not_cancellable",
            "Only a funds_reserved transaction can be canceled.",
            { current_state: transaction.status },
          );
        }
        if (typeof this.adapter?.cancel !== "function") {
          throw new ApiError(
            409,
            "invalid_state_transition",
            "cancellation_unsupported",
            "The active payment adapter does not support cancellation.",
          );
        }
        const provider = await this.executeAdapter("cancel", transaction.id, transaction.reserved_amount);
        transaction.status = "canceled";
        transaction.canceled_at = new Date().toISOString();
        transaction.cancel_reason = input?.reason ?? null;
        transaction.cancel_provider_reference = provider?.provider_reference ?? null;
        this.wallet.reserved -= transaction.reserved_amount.value;
        this.wallet.available += transaction.reserved_amount.value;
        this.releaseExecutionSession(transaction);
        this.releaseBudgetHold(transaction);
        const intent = this.intents.get(transaction.payment_intent_id);
        if (intent) intent.status = "canceled";
        this.event("transaction.canceled", transaction);
        return { transaction: clone(transaction), cancellation: {
          status: "canceled",
          provider_reference: transaction.cancel_provider_reference,
          reason: transaction.cancel_reason,
        } };
      },
    );
  }

  refundView(refund) {
    return clone(refund);
  }

  listRefunds(transactionId = null) {
    return [...this.refunds.values()]
      .filter((refund) => transactionId === null || refund.transaction_id === transactionId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .map((refund) => this.refundView(refund));
  }

  getRefund(id) {
    const refund = this.refunds.get(id);
    if (!refund) throw new ApiError(404, "resource_not_found", "refund_not_found", "Refund was not found.");
    return this.refundView(refund);
  }

  refundAttemptFor(operationKey) {
    const persisted = this.ledger?.getRefundAttempt(operationKey);
    return persisted ?? this.refundAttempts.get(operationKey) ?? null;
  }

  refundAttemptById(refundId) {
    const persisted = this.ledger?.getRefundAttemptByRefundId(refundId);
    if (persisted) return persisted;
    return [...this.refundAttempts.values()].find((attempt) => attempt.refund_id === refundId) ?? null;
  }

  refundAttemptRequestFingerprint(attempt) {
    return attempt.request_fingerprint ?? refundRequestFingerprint(
      attempt.transaction_id,
      { value: attempt.amount_value, currency: attempt.currency },
      attempt.reason,
    );
  }

  assertRefundAttemptTerms(attempt, transactionId, amount, reason) {
    if (!attempt) return;
    const requestFingerprint = refundRequestFingerprint(transactionId, amount, reason);
    if (this.refundAttemptRequestFingerprint(attempt) !== requestFingerprint) {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "refund_attempt_conflict",
        "Refund request terms changed for an existing refund attempt.",
        { refund_id: attempt.refund_id, operation_key: attempt.operation_key },
      );
    }
  }

  syncRefundAttempt(attempt) {
    this.refundAttempts.set(attempt.operation_key, clone(attempt));
    return attempt;
  }

  transitionRefundAttempt(operationKey, transition) {
    const current = this.refundAttemptFor(operationKey);
    if (!current) {
      throw new ApiError(404, "resource_not_found", "refund_attempt_not_found", "Refund attempt was not found.");
    }
    const allowedFrom = Array.isArray(transition.from) ? transition.from : [transition.from];
    if (!allowedFrom.includes(current.status)) {
      throw new ApiError(
        409,
        "invalid_state_transition",
        "refund_attempt_transition_conflict",
        "Refund attempt is no longer in the expected state.",
        { expected: allowedFrom, current: current.status },
      );
    }
    const next = {
      ...current,
      status: transition.status,
      provider_reference: transition.provider_reference ?? current.provider_reference ?? null,
      reason_code: transition.reason_code ?? null,
      updated_at: transition.updated_at ?? new Date().toISOString(),
      resolved_at: ["refunded", "provider_unknown", "failed"].includes(transition.status)
        ? transition.updated_at ?? new Date().toISOString()
        : null,
    };
    const persisted = this.ledger?.transitionRefundAttempt(operationKey, transition);
    return this.syncRefundAttempt(persisted ?? next);
  }

  refundReservation(transactionId, excludeRefundId = null) {
    const knownRefundIds = new Set();
    let reserved = 0;
    for (const refund of this.refunds.values()) {
      if (refund.transaction_id !== transactionId) continue;
      knownRefundIds.add(refund.id);
      if (refund.id === excludeRefundId) continue;
      if (["processing", "provider_unknown"].includes(refund.status)) {
        reserved += refund.amount.value;
      }
    }
    const attempts = this.ledger?.refundAttempts(transactionId) ?? [...this.refundAttempts.values()];
    for (const attempt of attempts) {
      if (
        attempt.transaction_id === transactionId &&
        attempt.refund_id !== excludeRefundId &&
        !knownRefundIds.has(attempt.refund_id) &&
        // Provider 已确认但业务事实尚未提交时，仍占用可退额度；
        // 原请求补记时通过 excludeRefundId 避免对同一 Attempt 重复计数。
        ["prepared", "submitting", "provider_unknown", "refunded"].includes(attempt.status)
      ) {
        reserved += attempt.amount_value;
      }
    }
    return reserved;
  }

  refundFromAttempt(attempt, reason = null) {
    const existing = this.refunds.get(attempt.refund_id);
    if (existing) return existing;
    const refund = {
      id: attempt.refund_id,
      transaction_id: attempt.transaction_id,
      payment_intent_id: this.transactions.get(attempt.transaction_id)?.payment_intent_id ?? null,
      amount: { value: attempt.amount_value, currency: attempt.currency },
      status: attempt.status === "provider_unknown" ? "provider_unknown" : "processing",
      reason: reason ?? attempt.reason ?? null,
      provider_reference: attempt.provider_reference ?? null,
      created_at: attempt.created_at,
      refunded_at: attempt.status === "refunded" ? attempt.resolved_at : null,
      recovery_required: attempt.status === "provider_unknown",
      ...(attempt.reason_code ? { failure_reason: attempt.reason_code } : {}),
    };
    this.refunds.set(refund.id, refund);
    return refund;
  }

  validateRefundProvider(provider, refund) {
    if (provider?.status === "provider_unknown") {
      throw new ApiError(
        503,
        "provider_unknown",
        provider.reason_code ?? "refund_result_unknown",
        "Refund result is unknown and must be recovered before another refund.",
        { recovery_required: true, refund_id: refund.id },
      );
    }
    if (
      provider?.status !== "refunded" ||
      typeof provider.provider_reference !== "string" ||
      provider.provider_reference.length === 0 ||
      (provider.amount_value !== undefined && provider.amount_value !== refund.amount.value) ||
      (provider.currency !== undefined && provider.currency !== refund.amount.currency)
    ) {
      throw new ApiError(
        502,
        "provider_error",
        "refund_result_invalid",
        "Provider refund result must confirm the exact amount, currency, and reference.",
        { refund_id: refund.id },
      );
    }
    return provider;
  }

  applyRefund(transaction, refund, provider) {
    if (refund.status === "refunded") return;
    this.validateRefundProvider(provider, refund);
    const remaining = transaction.settled_amount.value - transaction.refunded_amount.value;
    if (refund.amount.value > remaining) {
      throw new ApiError(409, "financial_constraint", "refund_amount_exceeded", "Refund amount exceeds the remaining refundable amount.", { remaining_amount: { value: remaining, currency: transaction.settled_amount.currency } });
    }
    transaction.refunded_amount = {
      value: transaction.refunded_amount.value + refund.amount.value,
      currency: transaction.settled_amount.currency,
    };
    transaction.status = transaction.refunded_amount.value === transaction.settled_amount.value ? "refunded" : "settled";
    transaction.last_refunded_at = new Date().toISOString();
    transaction.last_refund_provider_reference = provider?.provider_reference ?? refund.provider_reference ?? null;
    this.wallet.available += refund.amount.value;
    refund.status = "refunded";
    refund.provider_reference = transaction.last_refund_provider_reference;
    refund.refunded_at = transaction.last_refunded_at;
    const intent = this.intents.get(transaction.payment_intent_id);
    if (intent && transaction.status === "refunded") intent.status = "refunded";
    const event = this.event("transaction.refunded", { ...transaction, refund_id: refund.id, refund_amount: refund.amount });
    this.addRefundPostings(event, transaction, refund, intent);
  }

  async requestRefund(transactionId, input, key) {
    return this.runIdempotentAsync(
      `transactions/${transactionId}/refunds`,
      key,
      input,
      async () => {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) throw new ApiError(404, "resource_not_found", "transaction_not_found", "Transaction was not found.");
        if (!['settled', 'refunded'].includes(transaction.status)) {
          throw new ApiError(409, "invalid_state_transition", "transaction_not_refundable", "Only a settled transaction can be refunded.", { current_state: transaction.status });
        }
        validateAmount(input?.amount);
        if (input.amount.currency !== transaction.settled_amount.currency || input.amount.value <= 0) {
          throw new ApiError(400, "validation_error", "invalid_refund_amount", "Refund amount must be positive and use the settlement currency.");
        }
        if (typeof this.adapter?.refund !== "function") {
          throw new ApiError(409, "invalid_state_transition", "refund_unsupported", "The active payment adapter does not support refunds.");
        }
        const operationKey = `refund:${transaction.id}:${hash(key)}`;
        const existingAttempt = this.refundAttemptFor(operationKey);
        const reason = input.reason ?? null;
        const requestFingerprint = refundRequestFingerprint(transaction.id, input.amount, reason);
        // processing Claim 释放后仍保留 RefundAttempt；任何重试必须先校验不可变条款，
        // 再进行额度计算、状态转换或 Provider 调用，避免校验金额与实际执行金额分离。
        this.assertRefundAttemptTerms(existingAttempt, transaction.id, input.amount, reason);
        const remaining =
          transaction.settled_amount.value -
          transaction.refunded_amount.value -
          this.refundReservation(transaction.id, existingAttempt?.refund_id ?? null);
        if (input.amount.value > remaining) {
          throw new ApiError(409, "financial_constraint", "refund_amount_exceeded", "Refund amount exceeds the remaining refundable amount.", { remaining_amount: { value: remaining, currency: transaction.settled_amount.currency } });
        }
        const refundId = existingAttempt?.refund_id ?? prefix("ref");
        const prepared = existingAttempt ?? (this.ledger
          ? this.ledger.prepareRefundAttempt({
              operation_key: operationKey,
              refund_id: refundId,
              transaction_id: transaction.id,
              amount: input.amount,
              reason,
              request_fingerprint: requestFingerprint,
            })
          : {
              id: prefix("rat"),
              operation_key: operationKey,
              refund_id: refundId,
              transaction_id: transaction.id,
              amount_value: input.amount.value,
              currency: input.amount.currency,
              status: "prepared",
              provider_reference: null,
              request_fingerprint: requestFingerprint,
              reason,
              reason_code: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              resolved_at: null,
            });
        this.syncRefundAttempt(prepared);
        const refund = this.refundFromAttempt(prepared, reason);
        if (prepared.status === "refunded") {
          if (refund.status !== "refunded") {
            this.applyRefund(transaction, refund, {
              status: "refunded",
              provider_reference: prepared.provider_reference,
            });
          }
          return { transaction: clone(transaction), refund: clone(refund) };
        }
        if (prepared.status === "provider_unknown") {
          refund.status = "provider_unknown";
          refund.recovery_required = true;
          refund.failure_reason = prepared.reason_code ?? "refund_result_unknown";
          return { transaction: clone(transaction), refund: clone(refund) };
        }
        this.transitionRefundAttempt(operationKey, {
          from: ["prepared", "failed"],
          status: "submitting",
        });
        refund.status = "processing";
        try {
          const provider = await this.executeAdapter("refund", transaction.id, refund.amount, { refund_id: refund.id, settlement_provider_reference: transaction.settlement_provider_reference ?? null });
          const confirmed = this.validateRefundProvider(provider, refund);
          this.transitionRefundAttempt(operationKey, {
            from: "submitting",
            status: "refunded",
            provider_reference: confirmed.provider_reference,
          });
          this.applyRefund(transaction, refund, provider);
          return { transaction: clone(transaction), refund: clone(refund) };
        } catch (error) {
          // 只有 Adapter 明确声明未越过外部执行边界时才可确定失败；其余异常
          // （包括超时、AbortError 和响应解析失败）都必须保留额度并进入未知态。
          if (error?.no_external_effect === true) {
            this.transitionRefundAttempt(operationKey, {
              from: "submitting",
              status: "failed",
              reason_code: error?.code ?? "refund_failed",
            });
            throw error;
          }
          this.transitionRefundAttempt(operationKey, {
            from: "submitting",
            status: "provider_unknown",
            reason_code: error?.code ?? "refund_result_unknown",
          });
          refund.status = "provider_unknown";
          refund.recovery_required = true;
          refund.failure_reason = error?.code ?? "refund_result_unknown";
          this.event("refund.provider_unknown", refund);
          return { transaction: clone(transaction), refund: clone(refund) };
        }
      },
    );
  }

  async recoverRefund(refundId, input, key) {
    return this.runIdempotentAsync(
      `refunds/${refundId}/recoveries`,
      key,
      input,
      async () => {
        const refund = this.refunds.get(refundId) ?? (() => {
          const attempt = this.refundAttemptById(refundId);
          if (!attempt) return null;
          return this.refundFromAttempt(attempt);
        })();
        if (!refund) throw new ApiError(404, "resource_not_found", "refund_not_found", "Refund was not found.");
        const transaction = this.transactions.get(refund.transaction_id);
        if (!transaction) throw new ApiError(404, "resource_not_found", "transaction_not_found", "Transaction was not found.");
        if (refund.status === "refunded") return { transaction: clone(this.transactions.get(refund.transaction_id)), refund: clone(refund), recovery: { status: "refunded" } };
        if (refund.status !== "provider_unknown") throw new ApiError(409, "invalid_state_transition", "refund_not_recoverable", "Only a provider_unknown refund can be recovered.", { current_state: refund.status });
        const persistedAttempt = this.refundAttemptById(refund.id);
        if (persistedAttempt?.status === "refunded") {
          // Provider 已确认且 Attempt 已持久化时，只补记本地事实；不得再次查询
          // 通道或重复执行终态转换。
          this.applyRefund(transaction, refund, {
            status: "refunded",
            provider_reference: persistedAttempt.provider_reference,
          });
          return { transaction: clone(transaction), refund: clone(refund), recovery: { status: "refunded" } };
        }
        if (typeof this.adapter?.recoverRefund !== "function") throw new ApiError(409, "invalid_state_transition", "refund_recovery_unsupported", "The active payment adapter does not support refund recovery.");
        const provider = await this.executeAdapter("recoverRefund", transaction.id, refund.amount, { refund_id: refund.id });
        if (provider?.status !== "refunded") {
          const attempt = this.refundAttemptById(refund.id);
          if (attempt) {
            this.transitionRefundAttempt(attempt.operation_key, {
              from: ["provider_unknown", "submitting"],
              status: "provider_unknown",
              reason_code: provider?.reason_code ?? "refund_recovery_result_unknown",
            });
          }
          refund.recovery_required = true;
          refund.failure_reason = provider?.reason_code ?? "refund_recovery_result_unknown";
          this.event("refund.recovery_unknown", refund);
          return { transaction: clone(transaction), refund: clone(refund), recovery: { status: "provider_unknown", reason_code: refund.failure_reason } };
        }
        const confirmed = this.validateRefundProvider(provider, refund);
        const attempt = this.refundAttemptById(refund.id);
        if (attempt) {
          this.transitionRefundAttempt(attempt.operation_key, {
            from: ["provider_unknown", "submitting"],
            status: "refunded",
            provider_reference: confirmed.provider_reference,
          });
        }
        this.applyRefund(transaction, refund, provider);
        return { transaction: clone(transaction), refund: clone(refund), recovery: { status: "refunded" } };
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
    this.commitExecutionSession(transaction);
    this.wallet.reserved -= transaction.settled_amount.value;
    const intent = this.intents.get(transaction.payment_intent_id);
    intent.status = "settled";
    const quote = this.quotes.get(intent.quote_id);
    quote.status = "accepted";
    const settlementEvent = this.event("transaction.settled", transaction);
    this.addSettlementPostings(settlementEvent, transaction, intent);
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
        ["settled", "refunded"].includes(transaction.status) &&
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
