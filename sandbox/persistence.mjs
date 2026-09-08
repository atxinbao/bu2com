import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { ApiError } from "./domain.mjs";
import {
  credentialOnboardingBundle,
  normalizeOnboardingDocument,
} from "./identity.mjs";

const parse = (value, fallback) => (value ? JSON.parse(value) : fallback);
const nowIso = (now) => new Date(now).toISOString();
const secretFingerprint = (secret) =>
  createHash("sha256").update(secret).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const requestFingerprint = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");

function immediateTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export class SqliteLedger {
  constructor(
    path = ":memory:",
    {
      observer = null,
      failureInjector = null,
      environmentConfig = null,
      claimLegacyEnvironment = false,
    } = {},
  ) {
    const hadDatabaseContent =
      path !== ":memory:" && existsSync(path) && statSync(path).size > 0;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.observer = observer;
    this.failureInjector = failureInjector;
    this.hadDatabaseContent = hadDatabaseContent;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    try {
      if (environmentConfig) this.assertExistingEnvironment(environmentConfig);
      this.migrate();
      if (environmentConfig) {
        this.bindEnvironment(environmentConfig, { claimLegacyEnvironment });
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = new Set(
      this.db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version),
    );
    const migrations = [
      {
        version: 1,
        name: "reference_sandbox_baseline",
        apply: () => this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS sandbox_state (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS idempotency_records (
        scope_key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS webhook_outbox (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        delivered_at TEXT,
        UNIQUE(event_id, subscription_id)
      );
      CREATE TABLE IF NOT EXISTS adapter_operations (
        idempotency_key TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        provider_reference TEXT NOT NULL,
        amount_value INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
        `),
      },
      {
        version: 2,
        name: "webhook_reliability",
        apply: () => this.migrateWebhookReliability(),
      },
      {
        version: 3,
        name: "transaction_observability",
        apply: () => this.migrateTransactionObservability(),
      },
      {
        version: 4,
        name: "x402_failure_recovery",
        apply: () => this.migrateX402FailureRecovery(),
      },
      {
        version: 5,
        name: "receipt_verification_keys",
        apply: () => this.migrateReceiptVerificationKeys(),
      },
      {
        version: 6,
        name: "transaction_atomicity",
        apply: () => this.migrateTransactionAtomicity(),
      },
      {
        version: 7,
        name: "x402_trusted_execution",
        apply: () => this.migrateX402TrustedExecution(),
      },
      {
        version: 8,
        name: "environment_binding",
        apply: () => this.migrateEnvironmentBinding(),
      },
      {
        version: 9,
        name: "controlled_access",
        apply: () => this.migrateControlledAccess(),
      },
      {
        version: 10,
        name: "persistent_identity_onboarding",
        apply: () => this.migratePersistentIdentityOnboarding(),
      },
      {
        version: 11,
        name: "funding_source_receiving_target_bindings",
        apply: () => this.migrateFundingTargetBindings(),
      },
      {
        version: 12,
        name: "budget_holds_financial_postings",
        apply: () => this.migrateBudgetFinancialPosting(),
      },
      {
        version: 13,
        name: "versioned_payment_mandates_policy_decisions",
        apply: () => this.migrateVersionedPaymentMandates(),
      },
      {
        version: 14,
        name: "durable_refund_attempts",
        apply: () => this.migrateDurableRefundAttempts(),
      },
      {
        version: 15,
        name: "journal_posting_guards",
        apply: () => this.migrateJournalPostingGuards(),
      },
      {
        version: 16,
        name: "ledger_account_ownership",
        apply: () => this.migrateLedgerAccountOwnership(),
      },
    ];
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      immediateTransaction(this.db, () => {
        migration.apply();
        this.db
          .prepare(
            "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
          )
          .run(migration.version, migration.name, new Date().toISOString());
      });
    }
  }

  migrateWebhookReliability() {
    const ensureColumn = (table, column, definition) => {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((candidate) => candidate.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    ensureColumn(
      "webhook_subscriptions",
      "current_secret_version",
      "TEXT NOT NULL DEFAULT 'v1'",
    );
    ensureColumn("webhook_outbox", "dead_lettered_at", "TEXT");
    ensureColumn("webhook_outbox", "lease_expires_at", "INTEGER");
    ensureColumn("webhook_outbox", "locked_by", "TEXT");
    ensureColumn("webhook_outbox", "last_attempt_at", "TEXT");
    ensureColumn("webhook_outbox", "replay_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("webhook_outbox", "last_replayed_at", "TEXT");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_subscription_secrets (
        subscription_id TEXT NOT NULL,
        version TEXT NOT NULL,
        secret TEXT NOT NULL,
        secret_fingerprint TEXT NOT NULL,
        valid_from INTEGER NOT NULL,
        valid_until INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (subscription_id, version),
        FOREIGN KEY (subscription_id) REFERENCES webhook_subscriptions(id)
      );
      CREATE TABLE IF NOT EXISTS webhook_secret_rotations (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        previous_version TEXT NOT NULL,
        new_version TEXT NOT NULL,
        overlap_until INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (subscription_id, idempotency_key),
        UNIQUE (subscription_id, new_version),
        FOREIGN KEY (subscription_id) REFERENCES webhook_subscriptions(id)
      );
      CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        outbox_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        replay_cycle INTEGER NOT NULL,
        attempt_number INTEGER NOT NULL,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        error TEXT,
        secret_versions TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        UNIQUE (outbox_id, replay_cycle, attempt_number),
        FOREIGN KEY (outbox_id) REFERENCES webhook_outbox(id)
      );
      CREATE TABLE IF NOT EXISTS webhook_replays (
        id TEXT PRIMARY KEY,
        outbox_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        prior_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (outbox_id, idempotency_key),
        FOREIGN KEY (outbox_id) REFERENCES webhook_outbox(id)
      );
    `);
    const insertSecret = this.db.prepare(`
      INSERT OR IGNORE INTO webhook_subscription_secrets(
        subscription_id, version, secret, secret_fingerprint, valid_from, valid_until, created_at
      ) VALUES (?, 'v1', ?, ?, ?, NULL, ?)
    `);
    for (const subscription of this.db
      .prepare("SELECT id, secret, created_at FROM webhook_subscriptions")
      .all()) {
      const validFrom = Date.parse(subscription.created_at);
      insertSecret.run(
        subscription.id,
        subscription.secret,
        secretFingerprint(subscription.secret),
        Number.isFinite(validFrom) ? validFrom : 0,
        subscription.created_at,
      );
    }
  }

  migrateTransactionObservability() {
    const ensureColumn = (table, column, definition) => {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((candidate) => candidate.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    for (const table of ["ledger_events", "webhook_outbox", "adapter_operations"]) {
      ensureColumn(table, "request_id", "TEXT");
      ensureColumn(table, "trace_id", "TEXT");
      ensureColumn(table, "transaction_id", "TEXT");
    }
    ensureColumn("ledger_events", "provider_reference", "TEXT");
    ensureColumn("webhook_delivery_attempts", "request_id", "TEXT");
    ensureColumn("webhook_delivery_attempts", "trace_id", "TEXT");
    ensureColumn("webhook_delivery_attempts", "transaction_id", "TEXT");
  }

  migrateX402FailureRecovery() {
    const ensureColumn = (table, column, definition) => {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((candidate) => candidate.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    ensureColumn("adapter_operations", "last_error", "TEXT");
    ensureColumn("adapter_operations", "updated_at", "TEXT");
    ensureColumn("adapter_operations", "resolved_at", "TEXT");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS adapter_recovery_attempts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        operation_key TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_reference TEXT,
        reason_code TEXT,
        created_at TEXT NOT NULL,
        request_id TEXT,
        trace_id TEXT,
        FOREIGN KEY (operation_key) REFERENCES adapter_operations(idempotency_key)
      );
    `);
  }

  migrateReceiptVerificationKeys() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipt_verification_keys (
        key_id TEXT PRIMARY KEY,
        algorithm TEXT NOT NULL,
        public_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('trusted', 'revoked')),
        registered_at TEXT NOT NULL,
        revoked_at TEXT
      );
    `);
  }

  migrateTransactionAtomicity() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_claims (
        scope_key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('processing', 'succeeded')),
        result TEXT,
        owner_token TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (status = 'processing' AND result IS NULL AND owner_token IS NOT NULL) OR
          (status = 'succeeded' AND result IS NOT NULL AND owner_token IS NULL)
        )
      );
      CREATE TABLE IF NOT EXISTS wallet_accounts (
        id TEXT PRIMARY KEY,
        available INTEGER NOT NULL CHECK (available >= 0),
        reserved INTEGER NOT NULL CHECK (reserved >= 0),
        currency TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0)
      );
      INSERT OR IGNORE INTO idempotency_claims(
        scope_key, fingerprint, status, result, owner_token, created_at, updated_at
      )
      SELECT scope_key, fingerprint, 'succeeded', result, NULL, created_at, created_at
      FROM idempotency_records;
      INSERT OR IGNORE INTO sandbox_state(key, data) VALUES ('state_revision', '0');
    `);
    const walletState = this.db
      .prepare("SELECT data FROM sandbox_state WHERE key='wallet'")
      .get();
    if (walletState) {
      const wallet = JSON.parse(walletState.data);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO wallet_accounts(id, available, reserved, currency, version)
           VALUES (?, ?, ?, ?, 0)`,
        )
        .run(wallet.id, wallet.available, wallet.reserved, wallet.currency);
    }
  }

  migrateX402TrustedExecution() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS x402_authorizations (
        transaction_id TEXT PRIMARY KEY,
        payment_intent_id TEXT,
        quote_id TEXT,
        authorization_id TEXT,
        payment_mandate_id TEXT,
        payee_account_id TEXT,
        x402_version INTEGER NOT NULL,
        scheme TEXT NOT NULL,
        network TEXT NOT NULL,
        asset TEXT NOT NULL,
        amount_atomic TEXT NOT NULL,
        pay_to TEXT NOT NULL,
        resource_url TEXT NOT NULL,
        terms_json TEXT NOT NULL,
        terms_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY,
        operation_key TEXT UNIQUE NOT NULL,
        transaction_id TEXT NOT NULL,
        authorization_fingerprint TEXT NOT NULL,
        request_nonce TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('prepared', 'submitting', 'provider_unknown', 'settled', 'rejected')
        ),
        provider_reference TEXT,
        reason_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        request_id TEXT,
        trace_id TEXT,
        FOREIGN KEY (transaction_id) REFERENCES x402_authorizations(transaction_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_transaction
        ON payment_attempts(transaction_id, created_at);
    `);
  }

  migrateEnvironmentBinding() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS environment_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        environment_contract_version TEXT NOT NULL,
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        payment_adapter TEXT NOT NULL CHECK (payment_adapter IN ('simulated', 'x402')),
        chain_id INTEGER,
        network TEXT,
        asset TEXT,
        binding_method TEXT NOT NULL CHECK (binding_method IN ('initial', 'legacy_claim')),
        bound_at TEXT NOT NULL,
        CHECK (
          (environment = 'local' AND payment_adapter = 'simulated' AND chain_id IS NULL AND network IS NULL AND asset IS NULL)
          OR
          (environment IN ('sandbox', 'live') AND payment_adapter = 'x402' AND chain_id IS NOT NULL AND network IS NOT NULL AND asset IS NOT NULL)
        )
      );
      CREATE TRIGGER IF NOT EXISTS environment_metadata_immutable_update
      BEFORE UPDATE ON environment_metadata
      BEGIN
        SELECT RAISE(ABORT, 'environment_metadata_immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS environment_metadata_immutable_delete
      BEFORE DELETE ON environment_metadata
      BEGIN
        SELECT RAISE(ABORT, 'environment_metadata_immutable');
      END;
    `);
  }

  migrateControlledAccess() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_access_state (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        tenant_id TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS access_decisions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        credential_id TEXT,
        tenant_id TEXT,
        principal_id TEXT,
        role TEXT,
        permission TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        resource_id TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
        reason_code TEXT NOT NULL,
        request_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_access_decisions_environment_time
        ON access_decisions(environment, created_at);
      CREATE INDEX IF NOT EXISTS idx_access_decisions_tenant_time
        ON access_decisions(environment, tenant_id, created_at);
      CREATE TABLE IF NOT EXISTS tenant_access_resets (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        target_tenant_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        previous_generation INTEGER NOT NULL CHECK (previous_generation >= 1),
        new_generation INTEGER NOT NULL CHECK (new_generation > previous_generation),
        requested_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        request_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (environment, target_tenant_id, idempotency_key)
      );
    `);
  }

  migratePersistentIdentityOnboarding() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identity_principals (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('human', 'service')),
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        generation INTEGER NOT NULL CHECK (generation >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, id),
        UNIQUE (environment, tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_principals_tenant
        ON identity_principals(environment, tenant_id, status);

      CREATE TABLE IF NOT EXISTS identity_accounts (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        generation INTEGER NOT NULL CHECK (generation >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, id),
        UNIQUE (environment, tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_accounts_owner
        ON identity_accounts(environment, tenant_id, owner_principal_id, status);

      CREATE TABLE IF NOT EXISTS identity_agents (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        generation INTEGER NOT NULL CHECK (generation >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, id),
        UNIQUE (environment, tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_agents_owner
        ON identity_agents(environment, tenant_id, owner_principal_id, status);

      CREATE TABLE IF NOT EXISTS identity_credential_bindings (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        credential_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('agent', 'developer', 'operator')),
        token_sha256 TEXT NOT NULL CHECK (length(token_sha256) = 64),
        account_ids_json TEXT NOT NULL,
        agent_ids_json TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        expires_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'revoked')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, credential_id),
        UNIQUE (environment, token_sha256)
      );
      CREATE INDEX IF NOT EXISTS idx_identity_credentials_tenant
        ON identity_credential_bindings(environment, tenant_id, status);

      CREATE TABLE IF NOT EXISTS identity_onboarding_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        operation TEXT NOT NULL,
        tenant_ids_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (environment, idempotency_key)
      );
    `);
  }

  migrateFundingTargetBindings() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS funding_sources (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        agent_id TEXT,
        asset TEXT NOT NULL,
        network TEXT,
        provider TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'revoked')),
        verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'failed', 'revoked')),
        generation INTEGER NOT NULL CHECK (generation >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, id),
        UNIQUE (environment, tenant_id, source_reference, generation)
      );
      CREATE INDEX IF NOT EXISTS idx_funding_sources_owner
        ON funding_sources(environment, tenant_id, account_id, agent_id, status);

      CREATE TABLE IF NOT EXISTS receiving_targets (
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        agent_id TEXT,
        asset TEXT NOT NULL,
        network TEXT,
        provider TEXT NOT NULL,
        target_reference TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'revoked')),
        verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'failed', 'revoked')),
        generation INTEGER NOT NULL CHECK (generation >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment, id),
        UNIQUE (environment, tenant_id, target_reference, generation)
      );
      CREATE INDEX IF NOT EXISTS idx_receiving_targets_owner
        ON receiving_targets(environment, tenant_id, account_id, agent_id, status);
    `);
  }

  migrateBudgetFinancialPosting() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'project', 'account', 'agent')),
        scope_id TEXT NOT NULL,
        currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
        period TEXT NOT NULL CHECK (period IN ('lifetime', 'calendar_month', 'rolling_24h')),
        limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'exhausted', 'expired')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(scope_type, scope_id, period, currency, version)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_active_scope
        ON budgets(scope_type, scope_id, period, currency) WHERE status='active';
      CREATE TABLE IF NOT EXISTS budget_holds (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        payment_intent_id TEXT NOT NULL,
        budget_id TEXT NOT NULL,
        amount_value INTEGER NOT NULL CHECK (amount_value >= 0),
        currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
        status TEXT NOT NULL CHECK (status IN ('active', 'consumed', 'released', 'expired')),
        authorization_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        released_at TEXT,
        consumed_at TEXT,
        UNIQUE(transaction_id, budget_id),
        FOREIGN KEY (budget_id) REFERENCES budgets(id)
      );
      CREATE INDEX IF NOT EXISTS idx_budget_holds_budget_status
        ON budget_holds(budget_id, status, created_at);
      CREATE TABLE IF NOT EXISTS financial_postings (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        transaction_id TEXT,
        budget_id TEXT,
        source_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
        account TEXT NOT NULL,
        amount_value INTEGER NOT NULL CHECK (amount_value >= 0),
        currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
        created_at TEXT NOT NULL,
        UNIQUE(event_id, direction, account)
      );
      CREATE INDEX IF NOT EXISTS idx_financial_postings_transaction
        ON financial_postings(transaction_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_financial_postings_budget
        ON financial_postings(budget_id, created_at);
    `);
  }

  migrateVersionedPaymentMandates() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resources_payment_mandates
        ON resources(kind, id) WHERE kind='mandates';
      CREATE INDEX IF NOT EXISTS idx_resources_policy_decisions
        ON resources(kind, id) WHERE kind='policy_decisions';
    `);
  }

  migrateLedgerAccountOwnership() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id TEXT PRIMARY KEY,
        environment TEXT NOT NULL CHECK (environment IN ('local', 'sandbox', 'live')),
        tenant_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        asset TEXT NOT NULL,
        network TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'retired')),
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(environment, tenant_id, book_id, owner_account_id, asset, network)
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner
        ON ledger_accounts(environment, tenant_id, owner_account_id, status);
      CREATE INDEX IF NOT EXISTS idx_ledger_accounts_book_asset
        ON ledger_accounts(environment, tenant_id, book_id, asset, network, status);
    `);
  }

  migrateDurableRefundAttempts() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS refund_attempts (
        id TEXT PRIMARY KEY,
        operation_key TEXT NOT NULL UNIQUE,
        refund_id TEXT NOT NULL UNIQUE,
        transaction_id TEXT NOT NULL,
        amount_value INTEGER NOT NULL CHECK (amount_value >= 0),
        currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
        status TEXT NOT NULL CHECK (status IN ('prepared', 'submitting', 'provider_unknown', 'refunded', 'failed')),
        provider_reference TEXT,
        reason TEXT,
        reason_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_refund_attempts_transaction
        ON refund_attempts(transaction_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_refund_attempts_status
        ON refund_attempts(status, created_at);
    `);
  }

  migrateJournalPostingGuards() {
    const columns = this.db.prepare("PRAGMA table_info(financial_postings)").all();
    if (!columns.some((column) => column.name === "journal_id")) {
      this.db.exec("ALTER TABLE financial_postings ADD COLUMN journal_id TEXT");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal_headers (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
        status TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'reversed')),
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        posted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journal_headers_source
        ON journal_headers(source_id, posted_at);
    `);
    const existingRows = this.db.prepare("SELECT * FROM financial_postings ORDER BY event_id, id").all();
    const existingGroups = new Map();
    for (const row of existingRows) {
      const group = existingGroups.get(row.event_id) ?? [];
      group.push(row);
      existingGroups.set(row.event_id, group);
    }
    const existingEvents = [];
    for (const [eventId, group] of existingGroups) {
      const currencies = new Set(group.map((row) => row.currency));
      const debit = group.filter((row) => row.direction === "debit").reduce((sum, row) => sum + Number(row.amount_value), 0);
      const credit = group.filter((row) => row.direction === "credit").reduce((sum, row) => sum + Number(row.amount_value), 0);
      if (
        group.some((row) => !Number.isSafeInteger(Number(row.amount_value)) || Number(row.amount_value) < 0) ||
        !group.some((row) => row.direction === "debit") ||
        !group.some((row) => row.direction === "credit") ||
        currencies.size !== 1 ||
        !Number.isSafeInteger(debit) ||
        !Number.isSafeInteger(credit) ||
        debit !== credit
      ) {
        throw new Error(`Cannot migrate unbalanced financial postings for event ${eventId}.`);
      }
      existingEvents.push({
        event_id: eventId,
        event_type: group[0].event_type,
        source_id: group[0].source_id,
        currency: group[0].currency,
        created_at: group.map((row) => row.created_at).sort()[0],
      });
    }
    const insertHeader = this.db.prepare(`
      INSERT INTO journal_headers(
        id, event_id, event_type, source_id, currency, status,
        content_hash, created_at, posted_at
      ) VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `);
    for (const row of existingEvents) {
      insertHeader.run(
        `jrn_${row.event_id}`,
        row.event_id,
        row.event_type,
        row.source_id,
        row.currency,
        row.event_id,
        row.created_at,
        row.created_at,
      );
    }
    this.db.exec(`
      UPDATE financial_postings
      SET journal_id = 'jrn_' || event_id
      WHERE journal_id IS NULL;
      CREATE TRIGGER IF NOT EXISTS financial_postings_insert_guard
      BEFORE INSERT ON financial_postings
      WHEN typeof(NEW.amount_value) <> 'integer'
        OR NEW.amount_value < 0
        OR NEW.journal_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM journal_headers
          WHERE id = NEW.journal_id
            AND event_id = NEW.event_id
            AND status = 'draft'
            AND currency = NEW.currency
        )
        OR NOT EXISTS (
          SELECT 1 FROM journal_headers
          WHERE id = NEW.journal_id
            AND source_id = NEW.source_id
        )
      BEGIN
        SELECT RAISE(ABORT, 'financial_posting_requires_valid_posted_journal');
      END;
      CREATE TRIGGER IF NOT EXISTS financial_postings_update_guard
      BEFORE UPDATE ON financial_postings
      BEGIN
        SELECT RAISE(ABORT, 'financial_posting_is_immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS financial_postings_delete_guard
      BEFORE DELETE ON financial_postings
      BEGIN
        SELECT RAISE(ABORT, 'financial_posting_is_immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS journal_headers_update_guard
      BEFORE UPDATE ON journal_headers
      WHEN NEW.event_id <> OLD.event_id
        OR NEW.event_type <> OLD.event_type
        OR NEW.source_id <> OLD.source_id
        OR NEW.currency <> OLD.currency
        OR NEW.content_hash <> OLD.content_hash
        OR NEW.created_at <> OLD.created_at
        OR (OLD.status <> 'draft' AND NEW.posted_at <> OLD.posted_at)
      BEGIN
        SELECT RAISE(ABORT, 'posted_journal_is_immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS journal_headers_status_guard
      BEFORE UPDATE OF status ON journal_headers
      WHEN NOT (OLD.status = 'draft' AND NEW.status = 'posted')
        OR NOT EXISTS (
          SELECT 1 FROM financial_postings
          WHERE journal_id = OLD.id
          GROUP BY journal_id
          HAVING COUNT(*) >= 2
            AND SUM(CASE WHEN direction = 'debit' THEN amount_value ELSE 0 END) =
                SUM(CASE WHEN direction = 'credit' THEN amount_value ELSE 0 END)
            AND COUNT(DISTINCT currency) = 1
        )
      BEGIN
        SELECT RAISE(ABORT, 'journal_status_transition_invalid');
      END;
      CREATE TRIGGER IF NOT EXISTS journal_headers_delete_guard
      BEFORE DELETE ON journal_headers
      BEGIN
        SELECT RAISE(ABORT, 'posted_journal_is_immutable');
      END;
    `);
  }

  environmentMetadata() {
    return this.db
      .prepare(`
        SELECT environment_contract_version, environment, payment_adapter,
               chain_id, network, asset, binding_method, bound_at
        FROM environment_metadata WHERE singleton=1
      `)
      .get() ?? null;
  }

  assertExistingEnvironment(config) {
    const table = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='environment_metadata'",
      )
      .get();
    if (!table) return;
    const existing = this.environmentMetadata();
    if (!existing) return;
    const expected = {
      environment_contract_version: config.environment_contract_version,
      environment: config.environment,
      payment_adapter: config.payment_adapter,
      chain_id: config.chain_id,
      network: config.network,
      asset: config.asset,
    };
    const mismatches = Object.keys(expected).filter(
      (field) => existing[field] !== expected[field],
    );
    if (mismatches.length > 0) {
      throw new ApiError(
        503,
        "configuration_error",
        "database_environment_mismatch",
        "Database environment metadata does not match the active runtime environment.",
        { environment: config.environment, mismatches: mismatches.sort() },
      );
    }
  }

  bindEnvironment(config, { claimLegacyEnvironment = false } = {}) {
    const existing = this.environmentMetadata();
    const expected = {
      environment_contract_version: config.environment_contract_version,
      environment: config.environment,
      payment_adapter: config.payment_adapter,
      chain_id: config.chain_id,
      network: config.network,
      asset: config.asset,
    };
    if (existing) {
      this.assertExistingEnvironment(config);
      return existing;
    }
    if (this.hadDatabaseContent && !claimLegacyEnvironment) {
      throw new ApiError(
        503,
        "configuration_error",
        "legacy_database_environment_unclaimed",
        "An existing database without environment metadata requires an explicit environment claim.",
        { environment: config.environment },
      );
    }
    const bindingMethod = this.hadDatabaseContent ? "legacy_claim" : "initial";
    this.db
      .prepare(`
        INSERT INTO environment_metadata(
          singleton, environment_contract_version, environment, payment_adapter,
          chain_id, network, asset, binding_method, bound_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        expected.environment_contract_version,
        expected.environment,
        expected.payment_adapter,
        expected.chain_id,
        expected.network,
        expected.asset,
        bindingMethod,
        new Date().toISOString(),
      );
    return this.environmentMetadata();
  }

  registerLedgerAccount(record) {
    const {
      id, environment, tenant_id, book_id, owner_account_id, asset,
      network = null, status = "active", version = 1,
      created_at = new Date().toISOString(), updated_at = created_at,
    } = record ?? {};
    if (typeof id !== "string" || !/^lga_[A-Za-z0-9_-]+$/.test(id)) throw new ApiError(400, "validation_error", "invalid_ledger_account_id", "Ledger account ID is invalid.");
    if (!["local", "sandbox", "live"].includes(environment)) throw new ApiError(400, "validation_error", "invalid_ledger_account_environment", "Ledger account environment is invalid.");
    for (const [field, value] of [["tenant_id", tenant_id], ["book_id", book_id]]) {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]{2,120}$/.test(value)) throw new ApiError(400, "validation_error", "invalid_ledger_account_field", `${field} is invalid.`, { field });
    }
    if (typeof owner_account_id !== "string" || !/^acct_[A-Za-z0-9_-]+$/.test(owner_account_id)) {
      throw new ApiError(400, "validation_error", "invalid_ledger_owner_account", "owner_account_id must be a stable Account ID.");
    }
    if (typeof asset !== "string" || !/^[A-Za-z0-9._-]{2,32}$/.test(asset)) throw new ApiError(400, "validation_error", "invalid_ledger_account_asset", "Ledger account asset is invalid.");
    if (network !== null && (typeof network !== "string" || !/^[A-Za-z0-9._:-]{2,80}$/.test(network))) throw new ApiError(400, "validation_error", "invalid_ledger_account_network", "Ledger account network is invalid.");
    if (!["active", "suspended", "retired"].includes(status)) throw new ApiError(400, "validation_error", "invalid_ledger_account_status", "Ledger account status is invalid.");
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, "validation_error", "invalid_ledger_account_version", "Ledger account version must be a positive safe integer.");
    return immediateTransaction(this.db, () => {
      const existing = this.db.prepare("SELECT * FROM ledger_accounts WHERE id=?").get(id);
      if (existing) {
        const expected = { environment, tenant_id, book_id, owner_account_id, asset, network, status, version };
        const same = Object.keys(expected).every((field) => existing[field] === expected[field]);
        if (!same) throw new ApiError(409, "conflict", "ledger_account_content_conflict", "Ledger account ID already belongs to different ownership metadata.", { ledger_account_id: id });
        return existing;
      }
      const duplicate = this.db.prepare("SELECT id FROM ledger_accounts WHERE environment=? AND tenant_id=? AND book_id=? AND owner_account_id=? AND asset=? AND network IS ?").get(environment, tenant_id, book_id, owner_account_id, asset, network);
      if (duplicate) throw new ApiError(409, "conflict", "ledger_account_ownership_exists", "The ledger account ownership tuple already exists.", { ledger_account_id: duplicate.id });
      this.db.prepare("INSERT INTO ledger_accounts(id, environment, tenant_id, book_id, owner_account_id, asset, network, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, environment, tenant_id, book_id, owner_account_id, asset, network, status, version, created_at, updated_at);
      return this.getLedgerAccount(id);
    });
  }

  getLedgerAccount(id) {
    const row = this.db.prepare("SELECT * FROM ledger_accounts WHERE id=?").get(id);
    if (!row) throw new ApiError(404, "resource_not_found", "ledger_account_not_found", "Ledger account was not found.", { ledger_account_id: id });
    return row;
  }

  listLedgerAccounts({ environment = null, tenant_id = null, owner_account_id = null, status = null } = {}) {
    const clauses = [];
    const values = [];
    for (const [field, value] of [["environment", environment], ["tenant_id", tenant_id], ["owner_account_id", owner_account_id], ["status", status]]) {
      if (value !== null) { clauses.push(`${field}=?`); values.push(value); }
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM ledger_accounts ${where} ORDER BY created_at, id`).all(...values);
  }

  transitionLedgerAccount(id, { status, version, updated_at = new Date().toISOString() } = {}) {
    if (!["active", "suspended", "retired"].includes(status)) throw new ApiError(400, "validation_error", "invalid_ledger_account_status", "Ledger account status is invalid.");
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, "validation_error", "invalid_ledger_account_version", "Ledger account version must be a positive safe integer.");
    return immediateTransaction(this.db, () => {
      const existing = this.getLedgerAccount(id);
      if (existing.version !== version) throw new ApiError(409, "concurrency_conflict", "ledger_account_version_conflict", "Ledger account changed concurrently; query it before retrying.", { ledger_account_id: id, expected_version: version, actual_version: existing.version });
      if (existing.status === "retired" && status !== "retired") throw new ApiError(409, "conflict", "ledger_account_retired", "A retired ledger account cannot be reactivated.");
      if (existing.status === status) return existing;
      this.db.prepare("UPDATE ledger_accounts SET status=?, version=version+1, updated_at=? WHERE id=? AND version=? AND status=?").run(status, updated_at, id, version, existing.status);
      return this.getLedgerAccount(id);
    });
  }

  registerReceiptVerificationKey({
    key_id,
    algorithm,
    public_key,
    registered_at = new Date().toISOString(),
  }) {
    return immediateTransaction(this.db, () => {
      const existing = this.getReceiptVerificationKey(key_id);
      if (existing) {
        if (
          existing.algorithm !== algorithm ||
          existing.public_key !== public_key
        ) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "receipt_verification_key_conflict",
            "Receipt verification key ID already belongs to different key material.",
          );
        }
        return existing;
      }
      this.db
        .prepare(
          `INSERT INTO receipt_verification_keys(
            key_id, algorithm, public_key, status, registered_at, revoked_at
          ) VALUES (?, ?, ?, 'trusted', ?, NULL)`,
        )
        .run(key_id, algorithm, public_key, registered_at);
      return this.getReceiptVerificationKey(key_id);
    });
  }

  getReceiptVerificationKey(keyId) {
    return this.db
      .prepare(
        `SELECT key_id, algorithm, public_key, status, registered_at, revoked_at
         FROM receipt_verification_keys WHERE key_id=?`,
      )
      .get(keyId);
  }

  loadState() {
    const resources = {};
    for (const row of this.db.prepare("SELECT kind, id, data FROM resources").all()) {
      resources[row.kind] ??= [];
      resources[row.kind].push([row.id, JSON.parse(row.data)]);
    }
    const stateRows = Object.fromEntries(
      this.db
        .prepare("SELECT key, data FROM sandbox_state")
        .all()
        .map((row) => [row.key, JSON.parse(row.data)]),
    );
    const walletAccount = this.db
      .prepare("SELECT id, available, reserved, currency FROM wallet_accounts LIMIT 1")
      .get();
    if (walletAccount) stateRows.wallet = { ...walletAccount };
    stateRows.state_revision = Number(stateRows.state_revision ?? 0);
    const idempotency = this.db
      .prepare(
        `SELECT scope_key, fingerprint, result
         FROM idempotency_claims WHERE status='succeeded'`,
      )
      .all()
      .map((row) => [
        row.scope_key,
        { fingerprint: row.fingerprint, result: JSON.parse(row.result) },
      ]);
    const events = this.db
      .prepare("SELECT payload FROM ledger_events ORDER BY sequence")
      .all()
      .map((row) => JSON.parse(row.payload));
    const financial = {
      budgets: this.db
        .prepare("SELECT * FROM budgets ORDER BY created_at, id")
        .all()
        .map((row) => [row.id, { ...row, limit_minor: Number(row.limit_minor) }]),
      budget_holds: this.db
        .prepare("SELECT * FROM budget_holds ORDER BY created_at, id")
        .all()
        .map((row) => [row.id, { ...row, amount_value: Number(row.amount_value) }]),
      financial_postings: this.db
        .prepare("SELECT * FROM financial_postings ORDER BY created_at, id")
        .all()
        .map((row) => [row.id, { ...row, amount_value: Number(row.amount_value), journal_id: row.journal_id }]),
      refund_attempts: this.db
        .prepare("SELECT * FROM refund_attempts ORDER BY created_at, id")
        .all()
        .map((row) => [row.id, { ...row, amount_value: Number(row.amount_value) }]),
    };
    return { resources, state: stateRows, idempotency, events, financial };
  }

  claimIdempotency({ scopeKey, fingerprint, ownerToken, createdAt }) {
    return immediateTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          `SELECT fingerprint, status, result
           FROM idempotency_claims WHERE scope_key=?`,
        )
        .get(scopeKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "The same idempotency key was used with a different request body.",
          );
        }
        if (existing.status === "succeeded") {
          return { status: "succeeded", result: JSON.parse(existing.result) };
        }
        throw new ApiError(
          409,
          "outcome_unknown",
          "idempotency_outcome_unknown",
          "A previous request with this idempotency key may still be processing; query the resource before retrying.",
          { retry: "query_before_retry" },
        );
      }
      this.db
        .prepare(
          `INSERT INTO idempotency_claims(
            scope_key, fingerprint, status, result, owner_token, created_at, updated_at
          ) VALUES (?, ?, 'processing', NULL, ?, ?, ?)`,
        )
        .run(scopeKey, fingerprint, ownerToken, createdAt, createdAt);
      return { status: "processing" };
    });
  }

  releaseIdempotency(scopeKey, ownerToken) {
    return immediateTransaction(this.db, () =>
      this.db
        .prepare(
          `DELETE FROM idempotency_claims
           WHERE scope_key=? AND status='processing' AND owner_token=?`,
        )
        .run(scopeKey, ownerToken).changes,
    );
  }

  insertEventAndOutbox(event) {
    const correlation = event.correlation ?? {};
    this.db
      .prepare(
        `INSERT INTO ledger_events(
          event_id, event_type, resource_id, payload, created_at,
          request_id, trace_id, transaction_id, provider_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.type,
        event.resource_id,
        JSON.stringify(event),
        event.created_at,
        correlation.request_id ?? null,
        correlation.trace_id ?? null,
        correlation.transaction_id ?? null,
        correlation.provider_reference ?? null,
      );
    const subscriptions = this.db
      .prepare("SELECT id FROM webhook_subscriptions WHERE active = 1")
      .all();
    const enqueue = this.db.prepare(`
      INSERT INTO webhook_outbox(
        id, event_id, subscription_id, payload, status, next_attempt_at,
        request_id, trace_id, transaction_id
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `);
    for (const subscription of subscriptions) {
      enqueue.run(
        `out_${event.id}_${subscription.id}`,
        event.id,
        subscription.id,
        JSON.stringify(event),
        Date.now(),
        correlation.request_id ?? null,
        correlation.trace_id ?? null,
        correlation.transaction_id ?? null,
      );
    }
  }

  writeBalancedJournals(postings, events = []) {
    const groups = new Map();
    for (const posting of postings ?? []) {
      if (!posting.event_id || !posting.source_id || !posting.event_type) {
        throw new ApiError(422, "financial_constraint", "journal_reference_missing", "Every financial posting must reference an event, source, and event type.");
      }
      if (!Number.isSafeInteger(posting.amount_value) || posting.amount_value < 0) {
        throw new ApiError(422, "financial_constraint", "journal_amount_invalid", "Financial posting amounts must be safe non-negative integers.");
      }
      if (typeof posting.currency !== "string" || !/^[A-Z]{3}$/.test(posting.currency)) {
        throw new ApiError(422, "financial_constraint", "journal_currency_invalid", "Financial postings must use an uppercase three-letter currency.");
      }
      if (!/^[a-z][a-z0-9_.:-]{1,255}$/.test(posting.account ?? "")) {
        throw new ApiError(422, "financial_constraint", "journal_account_invalid", "Financial posting account names must use a stable namespaced format.");
      }
      const group = groups.get(posting.event_id) ?? [];
      group.push(posting);
      groups.set(posting.event_id, group);
    }
    const insertHeader = this.db.prepare(`
      INSERT INTO journal_headers(
        id, event_id, event_type, source_id, currency, status,
        content_hash, created_at, posted_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `);
    const findHeader = this.db.prepare("SELECT * FROM journal_headers WHERE event_id=?");
    const findPosting = this.db.prepare("SELECT * FROM financial_postings WHERE id=?");
    const sourceExists = this.db.prepare(`
      SELECT 1 WHERE EXISTS (SELECT 1 FROM resources WHERE id=? LIMIT 1)
        OR EXISTS (SELECT 1 FROM budget_holds WHERE id=? LIMIT 1)
        OR EXISTS (SELECT 1 FROM refund_attempts WHERE id=? LIMIT 1)
    `);
    const insertPosting = this.db.prepare(`
      INSERT INTO financial_postings(
        id, event_id, event_type, transaction_id, budget_id, source_id,
        direction, account, amount_value, currency, created_at, journal_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const postHeader = this.db.prepare("UPDATE journal_headers SET status='posted', posted_at=? WHERE id=? AND status='draft'");
    for (const [eventId, group] of groups) {
      const debit = group.filter((posting) => posting.direction === "debit");
      const credit = group.filter((posting) => posting.direction === "credit");
      if (debit.length === 0 || credit.length === 0) {
        throw new ApiError(422, "financial_constraint", "journal_unbalanced", "A posted journal must contain both debit and credit postings.", { event_id: eventId });
      }
      const currencies = new Set(group.map((posting) => posting.currency));
      const eventTypes = new Set(group.map((posting) => posting.event_type));
      const sourceIds = new Set(group.map((posting) => posting.source_id));
      if (currencies.size !== 1 || eventTypes.size !== 1 || sourceIds.size !== 1) {
        throw new ApiError(422, "financial_constraint", "journal_group_mismatch", "A journal must use one currency, event type, and source.", { event_id: eventId });
      }
      const sum = (entries) => entries.reduce((total, entry) => {
        const next = total + entry.amount_value;
        if (!Number.isSafeInteger(next)) {
          throw new ApiError(422, "financial_constraint", "journal_amount_overflow", "A journal amount exceeds the safe integer boundary.", { event_id: eventId });
        }
        return next;
      }, 0);
      if (sum(debit) !== sum(credit)) {
        throw new ApiError(422, "financial_constraint", "journal_unbalanced", "Debit and credit postings must balance for every currency.", { event_id: eventId, debit_minor: sum(debit), credit_minor: sum(credit) });
      }
      if (sourceExists.get(group[0].source_id, group[0].source_id, group[0].source_id) === undefined) {
        throw new ApiError(422, "financial_constraint", "journal_source_not_found", "A journal source must reference a persisted BU2 resource or hold.", { event_id: eventId, source_id: group[0].source_id });
      }
      const fingerprint = requestFingerprint(group.map((posting) => ({
        id: posting.id,
        event_id: posting.event_id,
        event_type: posting.event_type,
        transaction_id: posting.transaction_id ?? null,
        budget_id: posting.budget_id ?? null,
        source_id: posting.source_id,
        direction: posting.direction,
        account: posting.account,
        amount_value: posting.amount_value,
        currency: posting.currency,
        created_at: posting.created_at,
      })).sort((left, right) => left.id.localeCompare(right.id)));
      const createdAt = group.map((posting) => posting.created_at).sort()[0];
      const existingHeader = findHeader.get(eventId);
      const headerId = existingHeader?.id ?? `jrn_${eventId}`;
      if (!existingHeader) {
        const event = events.find((candidate) => candidate.id === eventId);
        if (!event) {
          throw new ApiError(422, "financial_constraint", "journal_event_not_found", "A new journal must be committed with its ledger event.", { event_id: eventId });
        }
        insertHeader.run(headerId, eventId, group[0].event_type, group[0].source_id, group[0].currency, fingerprint, createdAt, createdAt);
      } else if (existingHeader.status !== "posted" || (existingHeader.content_hash && existingHeader.content_hash !== eventId && existingHeader.content_hash !== fingerprint)) {
        throw new ApiError(409, "conflict", "journal_content_conflict", "A journal event already exists with different immutable content.", { event_id: eventId });
      }
      for (const posting of group) {
        const existingPosting = findPosting.get(posting.id);
        if (existingPosting) {
          const same = [
            [existingPosting.event_id, posting.event_id],
            [existingPosting.event_type, posting.event_type],
            [existingPosting.transaction_id ?? null, posting.transaction_id ?? null],
            [existingPosting.budget_id ?? null, posting.budget_id ?? null],
            [existingPosting.source_id, posting.source_id],
            [existingPosting.direction, posting.direction],
            [existingPosting.account, posting.account],
            [Number(existingPosting.amount_value), posting.amount_value],
            [existingPosting.currency, posting.currency],
            [existingPosting.created_at, posting.created_at],
          ].every(([left, right]) => left === right);
          if (!same || existingPosting.journal_id !== headerId) {
            throw new ApiError(409, "conflict", "financial_posting_content_conflict", "A financial posting ID cannot be reused with different content.", { posting_id: posting.id });
          }
          continue;
        }
        insertPosting.run(
          posting.id,
          posting.event_id,
          posting.event_type,
          posting.transaction_id ?? null,
          posting.budget_id ?? null,
          posting.source_id,
          posting.direction,
          posting.account,
          posting.amount_value,
          posting.currency,
          posting.created_at,
          headerId,
        );
      }
      if (!existingHeader) {
        postHeader.run(createdAt, headerId);
      }
    }
  }

  commitDomainMutation({
    snapshot,
    events,
    idempotency: { scopeKey, fingerprint, ownerToken, result },
    expectedRevision,
    expectedWallet,
  }) {
    return immediateTransaction(this.db, () => {
      const revision = this.db
        .prepare("SELECT data FROM sandbox_state WHERE key='state_revision'")
        .get();
      if (Number(revision?.data ?? 0) !== expectedRevision) {
        throw new ApiError(
          409,
          "concurrency_conflict",
          "transaction_state_conflict",
          "Transaction state changed concurrently; query the resource before retrying.",
          { retry: "query_before_retry" },
        );
      }
      const walletRow = this.db
        .prepare(
          "SELECT available, reserved, currency, version FROM wallet_accounts WHERE id=?",
        )
        .get(snapshot.wallet.id);
      if (walletRow) {
        const walletUpdate = this.db
          .prepare(
            `UPDATE wallet_accounts
             SET available=?, reserved=?, currency=?, version=version+1
             WHERE id=? AND available=? AND reserved=? AND currency=? AND version=?`,
          )
          .run(
            snapshot.wallet.available,
            snapshot.wallet.reserved,
            snapshot.wallet.currency,
            snapshot.wallet.id,
            expectedWallet.available,
            expectedWallet.reserved,
            expectedWallet.currency,
            walletRow.version,
          );
        if (walletUpdate.changes !== 1) {
          throw new ApiError(
            409,
            "concurrency_conflict",
            "wallet_state_conflict",
            "Wallet balance changed concurrently; query the wallet before retrying.",
            { retry: "query_before_retry" },
          );
        }
      } else {
        this.db
          .prepare(
            `INSERT INTO wallet_accounts(id, available, reserved, currency, version)
             VALUES (?, ?, ?, ?, 1)`,
          )
          .run(
            snapshot.wallet.id,
            snapshot.wallet.available,
            snapshot.wallet.reserved,
            snapshot.wallet.currency,
          );
      }
      this.failureInjector?.("after_wallet_write");
      const upsert = this.db.prepare(`
        INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
      `);
      const now = new Date().toISOString();
      for (const [kind, records] of Object.entries(snapshot.resources)) {
        for (const [id, value] of records) upsert.run(kind, id, JSON.stringify(value), now);
      }
      const state = this.db.prepare(`
        INSERT INTO sandbox_state(key, data) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET data=excluded.data
      `);
      state.run("wallet", JSON.stringify(snapshot.wallet));
      state.run("known_payees", JSON.stringify(snapshot.knownPayees));
      const financial = snapshot.financial ?? {};
      const budgetUpsert = this.db.prepare(`
        INSERT INTO budgets(
          id, scope_type, scope_id, currency, period, limit_minor, status,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope_type=excluded.scope_type, scope_id=excluded.scope_id,
          currency=excluded.currency, period=excluded.period,
          limit_minor=excluded.limit_minor, status=excluded.status,
          version=excluded.version, updated_at=excluded.updated_at
      `);
      for (const [, budget] of financial.budgets ?? []) {
        budgetUpsert.run(
          budget.id,
          budget.scope_type,
          budget.scope_id,
          budget.currency,
          budget.period,
          budget.limit_minor,
          budget.status,
          budget.version,
          budget.created_at,
          budget.updated_at,
        );
      }
      const holdUpsert = this.db.prepare(`
        INSERT INTO budget_holds(
          id, transaction_id, payment_intent_id, budget_id, amount_value, currency,
          status, authorization_id, idempotency_key, created_at, released_at, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status, released_at=excluded.released_at,
          consumed_at=excluded.consumed_at
      `);
      for (const [, hold] of financial.budget_holds ?? []) {
        holdUpsert.run(
          hold.id,
          hold.transaction_id,
          hold.payment_intent_id,
          hold.budget_id,
          hold.amount_value,
          hold.currency,
          hold.status,
          hold.authorization_id,
          hold.idempotency_key,
          hold.created_at,
          hold.released_at ?? null,
          hold.consumed_at ?? null,
        );
      }
      this.writeBalancedJournals(
        (financial.financial_postings ?? []).map(([, posting]) => posting),
        events,
      );
      const refundAttemptUpsert = this.db.prepare(`
        INSERT INTO refund_attempts(
          id, operation_key, refund_id, transaction_id, amount_value, currency,
          status, provider_reference, reason, reason_code, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status, provider_reference=excluded.provider_reference,
          reason=excluded.reason, reason_code=excluded.reason_code,
          updated_at=excluded.updated_at, resolved_at=excluded.resolved_at
      `);
      for (const [, attempt] of financial.refund_attempts ?? []) {
        refundAttemptUpsert.run(
          attempt.id,
          attempt.operation_key,
          attempt.refund_id,
          attempt.transaction_id,
          attempt.amount_value,
          attempt.currency,
          attempt.status,
          attempt.provider_reference ?? null,
          attempt.reason ?? null,
          attempt.reason_code ?? null,
          attempt.created_at,
          attempt.updated_at,
          attempt.resolved_at ?? null,
        );
      }
      this.failureInjector?.("after_state_write");
      for (const event of events) this.insertEventAndOutbox(event);
      this.failureInjector?.("after_outbox_write");
      const completed = this.db
        .prepare(
          `UPDATE idempotency_claims
           SET status='succeeded', result=?, owner_token=NULL, updated_at=?
           WHERE scope_key=? AND fingerprint=? AND status='processing' AND owner_token=?`,
        )
        .run(JSON.stringify(result), now, scopeKey, fingerprint, ownerToken);
      if (completed.changes !== 1) {
        throw new ApiError(
          409,
          "concurrency_conflict",
          "idempotency_claim_lost",
          "The idempotency claim is no longer owned by this request.",
          { retry: "query_before_retry" },
        );
      }
      this.db
        .prepare(
          `INSERT OR IGNORE INTO idempotency_records(scope_key, fingerprint, result, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(scopeKey, fingerprint, JSON.stringify(result), now);
      const nextRevision = expectedRevision + 1;
      const revisionUpdate = this.db
        .prepare(
          `UPDATE sandbox_state SET data=?
           WHERE key='state_revision' AND data=?`,
        )
        .run(String(nextRevision), String(expectedRevision));
      if (revisionUpdate.changes !== 1) {
        throw new ApiError(
          409,
          "concurrency_conflict",
          "transaction_state_conflict",
          "Transaction state changed concurrently; query the resource before retrying.",
          { retry: "query_before_retry" },
        );
      }
      this.failureInjector?.("before_commit");
      return nextRevision;
    });
  }

  listLedgerEvents() {
    return this.db
      .prepare("SELECT sequence, payload FROM ledger_events ORDER BY sequence")
      .all()
      .map((row) => ({ sequence: row.sequence, ...JSON.parse(row.payload) }));
  }

  addWebhookSubscription({ id, url, secret, now = Date.now() }, idempotencyKey) {
    return immediateTransaction(this.db, () => {
      const scopeKey = `webhook_subscriptions:${idempotencyKey}`;
      const fingerprint = requestFingerprint({ id, url, secret });
      const priorRequest = this.db
        .prepare(
          "SELECT fingerprint, result FROM idempotency_records WHERE scope_key=?",
        )
        .get(scopeKey);
      if (priorRequest) {
        if (priorRequest.fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "Idempotency-Key was already used with a different Webhook subscription request.",
          );
        }
        return JSON.parse(priorRequest.result);
      }
      if (
        this.db
          .prepare("SELECT id FROM webhook_subscriptions WHERE id=?")
          .get(id)
      ) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "webhook_subscription_exists",
          "Webhook subscription ID already exists; retry with the original Idempotency-Key.",
        );
      }
      const createdAt = nowIso(now);
      this.db
        .prepare(
          `INSERT INTO webhook_subscriptions(
            id, url, secret, active, created_at, current_secret_version
          ) VALUES (?, ?, ?, 1, ?, 'v1')`,
        )
        .run(id, url, secret, createdAt);
      this.db
        .prepare(
          `INSERT INTO webhook_subscription_secrets(
            subscription_id, version, secret, secret_fingerprint, valid_from, valid_until, created_at
          ) VALUES (?, 'v1', ?, ?, ?, NULL, ?)`,
        )
        .run(id, secret, secretFingerprint(secret), now, createdAt);
      const result = this.getWebhookSubscription(id);
      this.db
        .prepare(
          `INSERT INTO idempotency_records(scope_key, fingerprint, result, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(scopeKey, fingerprint, JSON.stringify(result), createdAt);
      return result;
    });
  }

  getWebhookSubscription(id) {
    const subscription = this.db
      .prepare(
        `SELECT id, url, active, current_secret_version, created_at
         FROM webhook_subscriptions WHERE id=?`,
      )
      .get(id);
    if (!subscription) {
      throw new ApiError(
        404,
        "resource_not_found",
        "webhook_subscription_not_found",
        "Webhook subscription was not found.",
      );
    }
    const secretVersions = this.db
      .prepare(
        `SELECT version, valid_from, valid_until, created_at
         FROM webhook_subscription_secrets
         WHERE subscription_id=? ORDER BY valid_from, version`,
      )
      .all(id)
      .map((secret) => ({
        ...secret,
        current: secret.version === subscription.current_secret_version,
      }));
    return {
      ...subscription,
      active: subscription.active === 1,
      secret_versions: secretVersions,
    };
  }

  getSecretRotation(id) {
    return this.db
      .prepare(
        `SELECT id, subscription_id, previous_version, new_version, overlap_until, created_at
         FROM webhook_secret_rotations WHERE id=?`,
      )
      .get(id);
  }

  rotateWebhookSecret(subscriptionId, input, idempotencyKey, now = Date.now()) {
    return immediateTransaction(this.db, () => {
      const fingerprint = requestFingerprint(input);
      const priorRequest = this.db
        .prepare(
          `SELECT id, request_fingerprint FROM webhook_secret_rotations
           WHERE subscription_id=? AND idempotency_key=?`,
        )
        .get(subscriptionId, idempotencyKey);
      if (priorRequest) {
        if (priorRequest.request_fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "Idempotency-Key was already used with a different secret rotation request.",
          );
        }
        return this.getSecretRotation(priorRequest.id);
      }
      const subscription = this.db
        .prepare(
          "SELECT id, current_secret_version FROM webhook_subscriptions WHERE id=?",
        )
        .get(subscriptionId);
      if (!subscription) {
        throw new ApiError(
          404,
          "resource_not_found",
          "webhook_subscription_not_found",
          "Webhook subscription was not found.",
        );
      }
      const existingVersion = this.db
        .prepare(
          "SELECT version FROM webhook_subscription_secrets WHERE subscription_id=? AND version=?",
        )
        .get(subscriptionId, input.version);
      if (existingVersion) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "webhook_secret_version_exists",
          "Webhook secret version already exists; retry with the original Idempotency-Key.",
        );
      }
      const overlapUntil = now + input.overlap_seconds * 1000;
      const createdAt = nowIso(now);
      this.db
        .prepare(
          `UPDATE webhook_subscription_secrets SET valid_until=?
           WHERE subscription_id=? AND version=?`,
        )
        .run(overlapUntil, subscriptionId, subscription.current_secret_version);
      this.db
        .prepare(
          `INSERT INTO webhook_subscription_secrets(
            subscription_id, version, secret, secret_fingerprint, valid_from, valid_until, created_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          subscriptionId,
          input.version,
          input.secret,
          secretFingerprint(input.secret),
          now,
          createdAt,
        );
      this.db
        .prepare(
          `UPDATE webhook_subscriptions
           SET secret=?, current_secret_version=? WHERE id=?`,
        )
        .run(input.secret, input.version, subscriptionId);
      const rotationId = `whr_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      this.db
        .prepare(
          `INSERT INTO webhook_secret_rotations(
            id, subscription_id, idempotency_key, request_fingerprint,
            previous_version, new_version, overlap_until, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          rotationId,
          subscriptionId,
          idempotencyKey,
          fingerprint,
          subscription.current_secret_version,
          input.version,
          overlapUntil,
          createdAt,
        );
      return this.getSecretRotation(rotationId);
    });
  }

  activeWebhookSecrets(subscriptionId, now = Date.now()) {
    return this.db
      .prepare(
        `SELECT ss.version, ss.secret
         FROM webhook_subscription_secrets ss
         JOIN webhook_subscriptions s ON s.id=ss.subscription_id
         WHERE ss.subscription_id=? AND ss.valid_from <= ?
           AND (ss.valid_until IS NULL OR ss.valid_until > ?)
         ORDER BY CASE WHEN ss.version=s.current_secret_version THEN 0 ELSE 1 END,
                  ss.valid_from DESC, ss.version DESC`,
      )
      .all(subscriptionId, now, now);
  }

  claimWebhookDeliveries({
    force = false,
    workerId,
    leaseMs = 30_000,
    limit = 100,
    now = Date.now(),
  }) {
    return immediateTransaction(this.db, () => {
      const query = force
        ? `SELECT o.*, s.url FROM webhook_outbox o
           JOIN webhook_subscriptions s ON s.id=o.subscription_id
           WHERE s.active=1 AND (
             o.status IN ('pending', 'retrying') OR
             (o.status='delivering' AND COALESCE(o.lease_expires_at, 0) <= ?)
           )
           ORDER BY o.next_attempt_at, o.id LIMIT ?`
        : `SELECT o.*, s.url FROM webhook_outbox o
           JOIN webhook_subscriptions s ON s.id=o.subscription_id
           WHERE s.active=1 AND (
             (o.status IN ('pending', 'retrying') AND o.next_attempt_at <= ?) OR
             (o.status='delivering' AND COALESCE(o.lease_expires_at, 0) <= ?)
           )
           ORDER BY o.next_attempt_at, o.id LIMIT ?`;
      const jobs = force
        ? this.db.prepare(query).all(now, limit)
        : this.db.prepare(query).all(now, now, limit);
      const claim = this.db.prepare(
        `UPDATE webhook_outbox
         SET status='delivering', locked_by=?, lease_expires_at=?
         WHERE id=?`,
      );
      return jobs.map((job) => {
        claim.run(workerId, now + leaseMs, job.id);
        return {
          ...job,
          status: "delivering",
          locked_by: workerId,
          lease_expires_at: now + leaseMs,
          secrets: this.activeWebhookSecrets(job.subscription_id, now),
        };
      });
    });
  }

  completeWebhookDelivery({
    outboxId,
    workerId,
    succeeded,
    httpStatus = null,
    error = null,
    delayMs = 0,
    maxAttempts,
    secretVersions,
    startedAt,
    correlation = {},
    now = Date.now(),
  }) {
    return immediateTransaction(this.db, () => {
      const row = this.db
        .prepare(
          `SELECT * FROM webhook_outbox
           WHERE id=? AND status='delivering' AND locked_by=?`,
        )
        .get(outboxId, workerId);
      if (!row) {
        throw new ApiError(
          409,
          "invalid_state_transition",
          "webhook_claim_lost",
          "Webhook delivery claim is no longer owned by this worker.",
        );
      }
      const attempts = row.attempts + 1;
      const status = succeeded
        ? "delivered"
        : attempts >= maxAttempts
          ? "dead_letter"
          : "retrying";
      const completedAt = nowIso(now);
      const safeError = error ? String(error).slice(0, 500) : null;
      this.db
        .prepare(
          `UPDATE webhook_outbox SET
            status=?, attempts=?, next_attempt_at=?, last_error=?, delivered_at=?,
            dead_lettered_at=?, lease_expires_at=NULL, locked_by=NULL, last_attempt_at=?
           WHERE id=?`,
        )
        .run(
          status,
          attempts,
          status === "retrying" ? now + delayMs : now,
          succeeded ? null : safeError,
          succeeded ? completedAt : null,
          status === "dead_letter" ? completedAt : null,
          completedAt,
          outboxId,
        );
      this.db
        .prepare(
          `INSERT INTO webhook_delivery_attempts(
            id, outbox_id, event_id, subscription_id, replay_cycle, attempt_number,
            worker_id, status, http_status, error, secret_versions, started_at, completed_at,
            request_id, trace_id, transaction_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `wha_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          row.id,
          row.event_id,
          row.subscription_id,
          row.replay_count,
          attempts,
          workerId,
          status,
          httpStatus,
          succeeded ? null : safeError,
          JSON.stringify(secretVersions),
          nowIso(startedAt),
          completedAt,
          correlation.request_id ?? null,
          correlation.trace_id ?? null,
          row.transaction_id ?? correlation.transaction_id ?? null,
        );
      return {
        id: row.id,
        event_id: row.event_id,
        status,
        attempts,
        replay_cycle: row.replay_count,
      };
    });
  }

  deadLetterRows() {
    return this.db
      .prepare(
        `SELECT * FROM webhook_outbox
         WHERE status='dead_letter' ORDER BY dead_lettered_at, id`,
      )
      .all();
  }

  getWebhookReplay(id) {
    return this.db
      .prepare(
        `SELECT id, outbox_id, event_id, subscription_id, requested_by,
                reason, prior_status, created_at
         FROM webhook_replays WHERE id=?`,
      )
      .get(id);
  }

  replayWebhook(outboxId, input, idempotencyKey, now = Date.now()) {
    return immediateTransaction(this.db, () => {
      const fingerprint = requestFingerprint(input);
      const priorRequest = this.db
        .prepare(
          `SELECT id, request_fingerprint FROM webhook_replays
           WHERE outbox_id=? AND idempotency_key=?`,
        )
        .get(outboxId, idempotencyKey);
      if (priorRequest) {
        if (priorRequest.request_fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "Idempotency-Key was already used with a different replay request.",
          );
        }
        return this.getWebhookReplay(priorRequest.id);
      }
      const outbox = this.db
        .prepare("SELECT * FROM webhook_outbox WHERE id=?")
        .get(outboxId);
      if (!outbox) {
        throw new ApiError(
          404,
          "resource_not_found",
          "webhook_outbox_not_found",
          "Webhook Outbox record was not found.",
        );
      }
      if (outbox.status !== "dead_letter") {
        throw new ApiError(
          409,
          "invalid_state_transition",
          "webhook_not_dead_letter",
          "Only a dead-lettered Webhook can be replayed.",
          { current_state: outbox.status },
        );
      }
      const replayId = `whrp_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const createdAt = nowIso(now);
      this.db
        .prepare(
          `INSERT INTO webhook_replays(
            id, outbox_id, event_id, subscription_id, idempotency_key,
            request_fingerprint, requested_by, reason, prior_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          replayId,
          outbox.id,
          outbox.event_id,
          outbox.subscription_id,
          idempotencyKey,
          fingerprint,
          input.requested_by,
          input.reason,
          outbox.status,
          createdAt,
        );
      this.db
        .prepare(
          `UPDATE webhook_outbox SET
            status='pending', attempts=0, next_attempt_at=?, last_error=NULL,
            dead_lettered_at=NULL, lease_expires_at=NULL, locked_by=NULL,
            replay_count=replay_count+1, last_replayed_at=?
           WHERE id=?`,
        )
        .run(now, createdAt, outboxId);
      return this.getWebhookReplay(replayId);
    });
  }

  webhookDeliveryAttempts(outboxId) {
    return this.db
      .prepare(
        `SELECT id, outbox_id, event_id, subscription_id, replay_cycle,
                attempt_number, worker_id, status, http_status, error,
                secret_versions, started_at, completed_at,
                request_id, trace_id, transaction_id
         FROM webhook_delivery_attempts
         WHERE outbox_id=? ORDER BY sequence`,
      )
      .all(outboxId)
      .map((attempt) => ({
        ...attempt,
        secret_versions: parse(attempt.secret_versions, []),
      }));
  }

  webhookReplayRows(outboxId) {
    return this.db
      .prepare(
        `SELECT id, outbox_id, event_id, subscription_id, requested_by,
                reason, prior_status, created_at
         FROM webhook_replays WHERE outbox_id=? ORDER BY created_at, id`,
      )
      .all(outboxId);
  }

  outboxRows() {
    return this.db.prepare("SELECT * FROM webhook_outbox ORDER BY id").all();
  }

  healthSnapshot() {
    const counts = {
      pending: 0,
      delivering: 0,
      retrying: 0,
      dead_letter: 0,
      delivered: 0,
    };
    for (const row of this.db
      .prepare("SELECT status, COUNT(*) AS count FROM webhook_outbox GROUP BY status")
      .all()) {
      if (Object.hasOwn(counts, row.status)) counts[row.status] = row.count;
    }
    const lastDelivery = this.db
      .prepare(
        "SELECT MAX(delivered_at) AS last_successful_delivery_at FROM webhook_outbox",
      )
      .get();
    const unknown = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM adapter_operations
         WHERE status IN (
           'unknown', 'provider_unknown', 'result_unknown',
           'payment_prepared', 'payment_submitting'
         )`,
      )
      .get();
    return {
      webhook_outbox: {
        ...counts,
        last_successful_delivery_at:
          lastDelivery.last_successful_delivery_at ?? null,
      },
      adapter_operations: { unknown_results: unknown.count },
    };
  }

  schemaVersion() {
    return (
      this.db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()
        .version ?? 0
    );
  }

  databaseIntegrity() {
    return this.db.prepare("PRAGMA integrity_check").all().map((row) => row.integrity_check);
  }

  recoveryFactCounts() {
    const tables = [
      "resources",
      "ledger_events",
      "payment_attempts",
      "adapter_operations",
      "webhook_outbox",
      "access_decisions",
      "budgets",
      "budget_holds",
      "financial_postings",
    ];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );
  }

  async backupTo(destination, options = {}) {
    if (this.path === ":memory:") {
      throw new ApiError(
        409,
        "state_error",
        "database_backup_requires_file",
        "A durable SQLite file is required for an environment backup.",
      );
    }
    return backup(this.db, destination, options);
  }

  tenantAccessState(environment, tenantId) {
    return (
      this.db
        .prepare(
          `SELECT environment, tenant_id, generation, status, updated_at
           FROM tenant_access_state WHERE environment=? AND tenant_id=?`,
        )
        .get(environment, tenantId) ?? {
        environment,
        tenant_id: tenantId,
        generation: 1,
        status: "active",
        updated_at: null,
      }
    );
  }

  recordAccessDecision(decision) {
    this.db
      .prepare(`
        INSERT INTO access_decisions(
          id, environment, credential_id, tenant_id, principal_id, role,
          permission, method, path, resource_id, outcome, reason_code,
          request_id, trace_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        decision.id,
        decision.environment,
        decision.credential_id,
        decision.tenant_id,
        decision.principal_id,
        decision.role,
        decision.permission,
        decision.method,
        decision.path,
        decision.resource_id,
        decision.outcome,
        decision.reason_code,
        decision.request_id,
        decision.trace_id,
        decision.created_at,
      );
    return { ...decision };
  }

  accessDecisionSummary(environment, tenantId = null) {
    const rows = tenantId
      ? this.db
          .prepare(
            `SELECT outcome, COUNT(*) AS count
             FROM access_decisions
             WHERE environment=? AND tenant_id=?
             GROUP BY outcome`,
          )
          .all(environment, tenantId)
      : this.db
          .prepare(
            `SELECT outcome, COUNT(*) AS count
             FROM access_decisions
             WHERE environment=?
             GROUP BY outcome`,
          )
          .all(environment);
    const summary = { allowed: 0, denied: 0 };
    for (const row of rows) summary[row.outcome] = row.count;
    return summary;
  }

  accessDecisionRows(environment, tenantId = null) {
    if (tenantId) {
      return this.db
        .prepare(
          `SELECT id, environment, credential_id, tenant_id, principal_id, role,
                  permission, method, path, resource_id, outcome, reason_code,
                  request_id, trace_id, created_at
           FROM access_decisions
           WHERE environment=? AND tenant_id=? ORDER BY sequence`,
        )
        .all(environment, tenantId);
    }
    return this.db
      .prepare(
        `SELECT id, environment, credential_id, tenant_id, principal_id, role,
                permission, method, path, resource_id, outcome, reason_code,
                request_id, trace_id, created_at
         FROM access_decisions WHERE environment=? ORDER BY sequence`,
      )
      .all(environment);
  }

  _assertIdentityRow(table, environment, id, expected, fields) {
    const current = this.db
      .prepare(`SELECT * FROM ${table} WHERE environment=? AND id=?`)
      .get(environment, id);
    if (!current) {
      const columns = ["environment", "id", ...fields];
      const placeholders = columns.map(() => "?").join(", ");
      this.db
        .prepare(
          `INSERT INTO ${table}(${columns.join(", ")}) VALUES (${placeholders})`,
        )
        .run(environment, id, ...fields.map((field) => expected[field]));
      return;
    }
    const conflicts = fields.filter(
      (field) =>
        !["created_at", "updated_at"].includes(field) &&
        current[field] !== expected[field],
    );
    if (conflicts.length > 0) {
      throw new ApiError(
        409,
        "authorization_error",
        "identity_binding_conflict",
        "An identity already exists with a different tenant, owner, status, or generation.",
        { environment, id, conflicts: conflicts.sort() },
      );
    }
  }

  _applyIdentityBundle(environment, tenant) {
    const createdAt = new Date().toISOString();
    const principal = {
      ...tenant.principal,
      tenant_id: tenant.tenant_id,
      created_at: tenant.principal.created_at ?? createdAt,
      updated_at: createdAt,
    };
    this._assertIdentityRow(
      "identity_principals",
      environment,
      principal.id,
      principal,
      [
        "tenant_id",
        "kind",
        "display_name",
        "status",
        "generation",
        "created_at",
        "updated_at",
      ],
    );
    for (const account of tenant.accounts) {
      const record = {
        ...account,
        tenant_id: tenant.tenant_id,
        owner_principal_id: principal.id,
        created_at: account.created_at ?? createdAt,
        updated_at: createdAt,
      };
      this._assertIdentityRow(
        "identity_accounts",
        environment,
        account.id,
        record,
        [
          "tenant_id",
          "owner_principal_id",
          "display_name",
          "status",
          "generation",
          "created_at",
          "updated_at",
        ],
      );
    }
    for (const agent of tenant.agents) {
      const record = {
        ...agent,
        tenant_id: tenant.tenant_id,
        owner_principal_id: principal.id,
        created_at: agent.created_at ?? createdAt,
        updated_at: createdAt,
      };
      this._assertIdentityRow(
        "identity_agents",
        environment,
        agent.id,
        record,
        [
          "tenant_id",
          "owner_principal_id",
          "display_name",
          "status",
          "generation",
          "created_at",
          "updated_at",
        ],
      );
      const agentPrincipal = {
        id: agent.id,
        tenant_id: tenant.tenant_id,
        kind: "service",
        display_name: agent.display_name,
        status: agent.status,
        generation: agent.generation,
        created_at: agent.created_at ?? createdAt,
        updated_at: createdAt,
      };
      this._assertIdentityRow(
        "identity_principals",
        environment,
        agent.id,
        agentPrincipal,
        [
          "tenant_id",
          "kind",
          "display_name",
          "status",
          "generation",
          "created_at",
          "updated_at",
        ],
      );
    }
    for (const credential of tenant.credentials) {
      const record = {
        ...credential,
        tenant_id: tenant.tenant_id,
        principal_id: credential.principal_id,
        account_ids_json: JSON.stringify([...credential.account_ids].sort()),
        agent_ids_json: JSON.stringify([...credential.agent_ids].sort()),
        created_at: credential.created_at ?? createdAt,
        updated_at: createdAt,
      };
      const current = this.db
        .prepare(
          `SELECT * FROM identity_credential_bindings
           WHERE environment=? AND credential_id=?`,
        )
        .get(environment, credential.id);
      if (!current) {
        this.db
          .prepare(`
            INSERT INTO identity_credential_bindings(
              environment, credential_id, tenant_id, principal_id, role,
              token_sha256, account_ids_json, agent_ids_json, generation,
              expires_at, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            environment,
            credential.id,
            record.tenant_id,
            record.principal_id,
            record.role,
            record.token_sha256,
            record.account_ids_json,
            record.agent_ids_json,
            record.generation,
            record.expires_at,
            record.status,
            record.created_at,
            record.updated_at,
          );
      } else {
        const conflicts = [
          "tenant_id",
          "principal_id",
          "role",
          "token_sha256",
          "account_ids_json",
          "agent_ids_json",
          "generation",
          "expires_at",
          "status",
        ].filter((field) => current[field] !== record[field]);
        if (conflicts.length > 0) {
          throw new ApiError(
            409,
            "authorization_error",
            "credential_binding_conflict",
            "A credential ID is already bound to different identity metadata.",
            { environment, credential_id: credential.id, conflicts: conflicts.sort() },
          );
        }
      }
    }
    this._applyBindingRows(
      "funding_sources",
      environment,
      tenant,
      tenant.funding_sources ?? [],
      "source_reference",
    );
    this._applyBindingRows(
      "receiving_targets",
      environment,
      tenant,
      tenant.receiving_targets ?? [],
      "target_reference",
    );
    this.tenantAccessState(environment, tenant.tenant_id);
    return this.identityBundle(environment, tenant.tenant_id);
  }

  _applyBindingRows(table, environment, tenant, bindings, referenceField) {
    const createdAt = new Date().toISOString();
    const environmentMetadata = this.environmentMetadata();
    for (const binding of bindings) {
      if (
        environmentMetadata &&
        ((environmentMetadata.asset && binding.asset !== environmentMetadata.asset) ||
          (environmentMetadata.network && binding.network !== environmentMetadata.network))
      ) {
        throw new ApiError(
          409,
          "configuration_error",
          "wallet_binding_environment_mismatch",
          "Wallet binding asset or network does not match the persisted service environment.",
          {
            environment,
            binding_id: binding.id,
            expected_asset: environmentMetadata.asset,
            expected_network: environmentMetadata.network,
          },
        );
      }
      const record = {
        ...binding,
        tenant_id: tenant.tenant_id,
        created_at: binding.created_at ?? createdAt,
        updated_at: createdAt,
      };
      const current = this.db
        .prepare(`SELECT * FROM ${table} WHERE environment=? AND id=?`)
        .get(environment, binding.id);
      if (!current) {
        this.db
          .prepare(`
            INSERT INTO ${table}(
              environment, id, tenant_id, account_id, agent_id, asset, network,
              provider, ${referenceField}, status, verification_status, generation,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            environment,
            record.id,
            record.tenant_id,
            record.account_id,
            record.agent_id,
            record.asset,
            record.network,
            record.provider,
            record[referenceField],
            record.status,
            record.verification_status,
            record.generation,
            record.created_at,
            record.updated_at,
          );
        continue;
      }
      const conflicts = [
        "tenant_id",
        "account_id",
        "agent_id",
        "asset",
        "network",
        "provider",
        referenceField,
        "status",
        "verification_status",
        "generation",
      ].filter((field) => current[field] !== record[field]);
      if (conflicts.length > 0) {
        throw new ApiError(
          409,
          "authorization_error",
          "identity_binding_conflict",
          "A wallet binding ID is already bound to different funding or receiving metadata.",
          { environment, id: binding.id, conflicts: conflicts.sort() },
        );
      }
    }
  }

  _bindingRows(table, environment, tenantId, accountIds = null, agentIds = null) {
    const rows = this.db
      .prepare(`SELECT * FROM ${table} WHERE environment=? AND tenant_id=? ORDER BY id`)
      .all(environment, tenantId);
    return rows
      .filter((row) => !accountIds || accountIds.includes(row.account_id))
      .filter((row) => !agentIds || row.agent_id === null || agentIds.includes(row.agent_id))
      .map((row) => {
        const {
          source_reference,
          target_reference,
          ...rest
        } = row;
        return {
          ...rest,
          ...(source_reference !== undefined ? { source_reference } : {}),
          ...(target_reference !== undefined ? { target_reference } : {}),
        };
      });
  }

  walletBindingsForActor(environment, actor) {
    if (!actor || actor.development_open || actor.platform_access) return null;
    return {
      funding_sources: this._bindingRows(
        "funding_sources",
        environment,
        actor.tenant_id,
        actor.account_ids,
        actor.agent_ids,
      ),
      receiving_targets: this._bindingRows(
        "receiving_targets",
        environment,
        actor.tenant_id,
        actor.account_ids,
        actor.agent_ids,
      ),
    };
  }

  assertWalletBinding(
    environment,
    { kind, accountId, agentId = null, asset, network = null, reference = null },
  ) {
    const table = kind === "funding_source" ? "funding_sources" : "receiving_targets";
    const referenceField = kind === "funding_source" ? "source_reference" : "target_reference";
    const rows = this.db
      .prepare(`
        SELECT * FROM ${table}
        WHERE environment=? AND account_id=? AND (agent_id IS NULL OR agent_id=?)
          AND status='active' AND verification_status='verified'
      `)
      .all(environment, accountId, agentId);
    if (rows.length === 0) return { bound: false };
    const matching = rows.filter(
      (row) =>
        row.asset === asset &&
        row.network === network &&
        (reference === null || row.id === reference || row[referenceField] === reference),
    );
    if (matching.length === 0) {
      throw new ApiError(
        409,
        "authorization_error",
        kind === "funding_source"
          ? "funding_source_binding_mismatch"
          : "receiving_target_binding_mismatch",
        `The ${kind.replace("_", " ")} does not match an active verified wallet binding.`,
        { account_id: accountId, agent_id: agentId, asset, network, reference },
      );
    }
    return { bound: true, binding: matching[0] };
  }

  assertWalletBindingById(
    environment,
    { kind, bindingId, asset, network = null },
  ) {
    const table = kind === "funding_source" ? "funding_sources" : "receiving_targets";
    const rows = this.db
      .prepare(`
        SELECT * FROM ${table}
        WHERE environment=? AND id=? AND status='active' AND verification_status='verified'
      `)
      .all(environment, bindingId);
    const matching = rows.filter((row) => row.asset === asset && row.network === network);
    if (matching.length === 0) {
      throw new ApiError(
        409,
        "authorization_error",
        kind === "funding_source"
          ? "funding_source_binding_required"
          : "receiving_target_binding_required",
        `The ${kind.replace("_", " ")} must reference an active verified wallet binding.`,
        { environment, binding_id: bindingId, asset, network },
      );
    }
    return { bound: true, binding: matching[0] };
  }

  bootstrapIdentityTenants(document) {
    const normalized = normalizeOnboardingDocument(document, document.environment);
    const fingerprint = requestFingerprint(normalized);
    return immediateTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          `SELECT request_fingerprint, result_json
           FROM identity_onboarding_events
           WHERE environment=? AND idempotency_key=?`,
        )
        .get(normalized.environment, normalized.idempotency_key);
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "The same onboarding idempotency key was used with different identity metadata.",
          );
        }
        return JSON.parse(existing.result_json);
      }
      const identities = normalized.tenants.map((tenant) =>
        this._applyIdentityBundle(normalized.environment, tenant),
      );
      const result = {
        schema_version: "1.0",
        environment: normalized.environment,
        tenant_ids: identities.map((identity) => identity.tenant_id),
        identities,
      };
      this.db
        .prepare(`
          INSERT INTO identity_onboarding_events(
            id, environment, idempotency_key, request_fingerprint,
            requested_by, operation, tenant_ids_json, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'bootstrap', ?, ?, ?)
        `)
        .run(
          `ion_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          normalized.environment,
          normalized.idempotency_key,
          fingerprint,
          normalized.requested_by,
          JSON.stringify(result.tenant_ids),
          JSON.stringify(result),
          new Date().toISOString(),
        );
      return result;
    });
  }

  reconcileAccessCredential(credential, environment) {
    const bundle = credentialOnboardingBundle(credential, environment);
    const document = {
      environment,
      requested_by: "usr_runtime_configuration",
      idempotency_key: `runtime_${credential.id}_${credential.token_sha256}`,
      tenants: [bundle],
    };
    const normalized = normalizeOnboardingDocument(document, environment);
    const fingerprint = requestFingerprint(normalized);
    return immediateTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          `SELECT request_fingerprint, result_json
           FROM identity_onboarding_events
           WHERE environment=? AND idempotency_key=?`,
        )
        .get(environment, document.idempotency_key);
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new ApiError(
            503,
            "configuration_error",
            "credential_identity_conflict",
            "Configured credential metadata conflicts with the persisted identity binding.",
          );
        }
        return JSON.parse(existing.result_json);
      }
      const identity = this._applyIdentityBundle(environment, normalized.tenants[0]);
      const result = {
        schema_version: "1.0",
        environment,
        tenant_ids: [identity.tenant_id],
        identities: [identity],
      };
      this.db
        .prepare(`
          INSERT INTO identity_onboarding_events(
            id, environment, idempotency_key, request_fingerprint,
            requested_by, operation, tenant_ids_json, result_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'configuration_reconcile', ?, ?, ?)
        `)
        .run(
          `ion_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          environment,
          document.idempotency_key,
          fingerprint,
          document.requested_by,
          JSON.stringify(result.tenant_ids),
          JSON.stringify(result),
          new Date().toISOString(),
        );
      return result;
    });
  }

  identityCredentialBinding(environment, credentialId) {
    const row = this.db
      .prepare(
        `SELECT environment, credential_id, tenant_id, principal_id, role,
                token_sha256, account_ids_json, agent_ids_json, generation,
                expires_at, status, created_at, updated_at
         FROM identity_credential_bindings
         WHERE environment=? AND credential_id=?`,
      )
      .get(environment, credentialId);
    if (!row) return null;
    return {
      ...row,
      account_ids: JSON.parse(row.account_ids_json),
      agent_ids: JSON.parse(row.agent_ids_json),
    };
  }

  identityBundle(environment, tenantId, principalId = null) {
    const principal = principalId
      ? this.db
          .prepare(
            `SELECT environment, id, tenant_id, kind, display_name, status, generation,
                    created_at, updated_at
             FROM identity_principals
             WHERE environment=? AND tenant_id=? AND id=?`,
          )
          .get(environment, tenantId, principalId)
      : this.db
          .prepare(
            `SELECT environment, id, tenant_id, kind, display_name, status, generation,
                    created_at, updated_at
             FROM identity_principals
             WHERE environment=? AND tenant_id=?
             ORDER BY CASE kind WHEN 'human' THEN 0 ELSE 1 END, id LIMIT 1`,
          )
          .get(environment, tenantId);
    const normalizedPrincipal = principal ? { ...principal } : null;
    const ownershipClause = principalId ? " AND owner_principal_id=?" : "";
    const ownerParameters = principalId
      ? [environment, tenantId, principalId]
      : [environment, tenantId];
    const accounts = this.db
      .prepare(
        `SELECT environment, id, tenant_id, owner_principal_id, display_name,
                status, generation, created_at, updated_at
         FROM identity_accounts
         WHERE environment=? AND tenant_id=?${ownershipClause}
         ORDER BY id`,
      )
      .all(...ownerParameters)
      .map((row) => ({ ...row }));
    const agents = this.db
      .prepare(
        `SELECT environment, id, tenant_id, owner_principal_id, display_name,
                status, generation, created_at, updated_at
         FROM identity_agents
         WHERE environment=? AND tenant_id=?${ownershipClause}
         ORDER BY id`,
      )
      .all(...ownerParameters)
      .map((row) => ({ ...row }));
    const credentials = this.db
      .prepare(
        `SELECT environment, credential_id, tenant_id, principal_id, role,
                generation, expires_at, status, created_at, updated_at,
                account_ids_json, agent_ids_json
         FROM identity_credential_bindings
         WHERE environment=? AND tenant_id=?${principalId ? " AND principal_id=?" : ""}
         ORDER BY credential_id`,
      )
      .all(...ownerParameters)
      .map((row) => ({
        environment: row.environment,
        credential_id: row.credential_id,
        tenant_id: row.tenant_id,
        principal_id: row.principal_id,
        role: row.role,
        generation: row.generation,
        expires_at: row.expires_at,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_ids: JSON.parse(row.account_ids_json),
        agent_ids: JSON.parse(row.agent_ids_json),
      }));
    return {
      environment,
      tenant_id: tenantId,
      principal: normalizedPrincipal,
      accounts,
      agents,
      credentials,
      funding_sources: this._bindingRows("funding_sources", environment, tenantId),
      receiving_targets: this._bindingRows("receiving_targets", environment, tenantId),
    };
  }

  identityTenants(environment) {
    return this.db
      .prepare(
        `SELECT DISTINCT tenant_id
         FROM identity_principals
         WHERE environment=?
         ORDER BY tenant_id`,
      )
      .all(environment)
      .map(({ tenant_id }) => this.identityBundle(environment, tenant_id));
  }

  identityBundleForActor(environment, actor) {
    if (!actor || actor.development_open) return null;
    const bundle = this.identityBundle(environment, actor.tenant_id);
    const principal = this.db
      .prepare(
        `SELECT environment, id, tenant_id, kind, display_name, status, generation,
                created_at, updated_at
         FROM identity_principals
         WHERE environment=? AND tenant_id=? AND id=?`,
      )
      .get(environment, actor.tenant_id, actor.principal_id);
    return {
      environment: bundle.environment,
      tenant_id: bundle.tenant_id,
      principal: principal ? { ...principal } : null,
      accounts: bundle.accounts.filter((account) => actor.account_ids.includes(account.id)),
      agents: bundle.agents.filter((agent) => actor.agent_ids.includes(agent.id)),
      funding_sources: this._bindingRows(
        "funding_sources",
        environment,
        actor.tenant_id,
        actor.account_ids,
        actor.agent_ids,
      ),
      receiving_targets: this._bindingRows(
        "receiving_targets",
        environment,
        actor.tenant_id,
        actor.account_ids,
        actor.agent_ids,
      ),
    };
  }

  assertIdentityClaims(environment, actor, { accountIds = [], agentIds = [] } = {}) {
    if (!actor || actor.platform_access) return;
    const missingAccounts = accountIds.filter((accountId) => {
      const row = this.db
        .prepare(
          `SELECT id FROM identity_accounts
           WHERE environment=? AND tenant_id=? AND id=? AND status='active'`,
        )
        .get(environment, actor.tenant_id, accountId);
      return !row;
    });
    const missingAgents = agentIds.filter((agentId) => {
      const row = this.db
        .prepare(
          `SELECT id FROM identity_agents
           WHERE environment=? AND tenant_id=? AND id=? AND status='active'`,
        )
        .get(environment, actor.tenant_id, agentId);
      return !row;
    });
    if (missingAccounts.length > 0 || missingAgents.length > 0) {
      throw new ApiError(
        403,
        "authorization_error",
        "resource_scope_denied",
        "The requested account or Agent identity is not active in the caller tenant.",
        {
          account_ids: missingAccounts.sort(),
          agent_ids: missingAgents.sort(),
        },
      );
    }
  }

  resetTenantAccess({
    environment,
    target_tenant_id,
    idempotency_key,
    requested_by,
    reason,
    request_id,
    trace_id,
    created_at = new Date().toISOString(),
  }) {
    const fingerprint = requestFingerprint({ target_tenant_id, requested_by, reason });
    return immediateTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          `SELECT id, environment, target_tenant_id, previous_generation,
                  new_generation, requested_by, reason, request_id, trace_id, created_at,
                  request_fingerprint
           FROM tenant_access_resets
           WHERE environment=? AND target_tenant_id=? AND idempotency_key=?`,
        )
        .get(environment, target_tenant_id, idempotency_key);
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "idempotency_key_reused",
            "The same tenant reset idempotency key was used with different input.",
          );
        }
        const { request_fingerprint: _fingerprint, ...result } = existing;
        return result;
      }
      const state = this.tenantAccessState(environment, target_tenant_id);
      const newGeneration = state.generation + 1;
      this.db
        .prepare(`
          INSERT INTO tenant_access_state(environment, tenant_id, generation, status, updated_at)
          VALUES (?, ?, ?, 'active', ?)
          ON CONFLICT(environment, tenant_id) DO UPDATE SET
            generation=excluded.generation,
            status='active',
            updated_at=excluded.updated_at
        `)
        .run(environment, target_tenant_id, newGeneration, created_at);
      const reset = {
        id: `tar_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
        environment,
        target_tenant_id,
        previous_generation: state.generation,
        new_generation: newGeneration,
        requested_by,
        reason,
        request_id,
        trace_id,
        created_at,
      };
      this.db
        .prepare(`
          INSERT INTO tenant_access_resets(
            id, environment, target_tenant_id, idempotency_key,
            request_fingerprint, previous_generation, new_generation,
            requested_by, reason, request_id, trace_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          reset.id,
          reset.environment,
          reset.target_tenant_id,
          idempotency_key,
          fingerprint,
          reset.previous_generation,
          reset.new_generation,
          reset.requested_by,
          reset.reason,
          reset.request_id,
          reset.trace_id,
          reset.created_at,
        );
      return reset;
    });
  }

  schemaMigrations() {
    return this.db
      .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version")
      .all();
  }

  getAdapterOperation(key) {
    const row = this.db
      .prepare("SELECT * FROM adapter_operations WHERE idempotency_key=?")
      .get(key);
    return row ? { ...row } : null;
  }

  saveAdapterOperation(operation) {
    const correlation = this.observer?.context({
      transaction_id: operation.transaction_id,
    }) ?? { transaction_id: operation.transaction_id };
    this.db
      .prepare(`
      INSERT INTO adapter_operations(
        idempotency_key, operation, provider_reference, amount_value, currency,
        status, created_at, request_id, trace_id, transaction_id,
        last_error, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        operation.idempotency_key,
        operation.operation,
        operation.provider_reference,
        operation.amount_value,
        operation.currency,
        operation.status,
        operation.created_at,
        correlation.request_id ?? null,
        correlation.trace_id ?? null,
        correlation.transaction_id ?? null,
        operation.last_error ?? null,
        operation.updated_at ?? operation.created_at,
        operation.resolved_at ?? null,
      );
    return {
      ...operation,
      request_id: correlation.request_id ?? null,
      trace_id: correlation.trace_id ?? null,
      transaction_id: correlation.transaction_id ?? null,
    };
  }

  adapterOperations() {
    return this.db.prepare("SELECT * FROM adapter_operations ORDER BY created_at").all();
  }

  getRefundAttempt(operationKey) {
    const row = this.db
      .prepare("SELECT * FROM refund_attempts WHERE operation_key=?")
      .get(operationKey);
    return row ? { ...row, amount_value: Number(row.amount_value) } : null;
  }

  getRefundAttemptByRefundId(refundId) {
    const row = this.db
      .prepare("SELECT * FROM refund_attempts WHERE refund_id=?")
      .get(refundId);
    return row ? { ...row, amount_value: Number(row.amount_value) } : null;
  }

  refundAttempts(transactionId = null) {
    const rows = transactionId
      ? this.db
          .prepare("SELECT * FROM refund_attempts WHERE transaction_id=? ORDER BY created_at, id")
          .all(transactionId)
      : this.db.prepare("SELECT * FROM refund_attempts ORDER BY created_at, id").all();
    return rows.map((row) => ({ ...row, amount_value: Number(row.amount_value) }));
  }

  prepareRefundAttempt({
    operation_key,
    refund_id,
    transaction_id,
    amount,
    reason = null,
    created_at = new Date().toISOString(),
  }) {
    return immediateTransaction(this.db, () => {
      const existing = this.getRefundAttempt(operation_key);
      if (existing) {
        if (
          existing.refund_id !== refund_id ||
          existing.transaction_id !== transaction_id ||
          existing.amount_value !== amount.value ||
          existing.currency !== amount.currency
        ) {
          throw new ApiError(
            409,
            "idempotency_conflict",
            "refund_attempt_conflict",
            "Refund attempt details changed for an existing operation key.",
          );
        }
        return existing;
      }
      const id = `rat_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      this.db
        .prepare(`
          INSERT INTO refund_attempts(
            id, operation_key, refund_id, transaction_id, amount_value, currency,
            status, provider_reference, reason, reason_code, created_at, updated_at, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'prepared', NULL, ?, NULL, ?, ?, NULL)
        `)
        .run(
          id,
          operation_key,
          refund_id,
          transaction_id,
          amount.value,
          amount.currency,
          reason,
          created_at,
          created_at,
        );
      return this.getRefundAttempt(operation_key);
    });
  }

  transitionRefundAttempt(
    operationKey,
    { from, status, provider_reference = null, reason_code = null, updated_at = new Date().toISOString() },
  ) {
    return immediateTransaction(this.db, () => {
      const current = this.getRefundAttempt(operationKey);
      if (!current) {
        throw new ApiError(404, "resource_not_found", "refund_attempt_not_found", "Refund attempt was not found.");
      }
      const allowedFrom = Array.isArray(from) ? from : [from];
      if (!allowedFrom.includes(current.status)) {
        throw new ApiError(
          409,
          "invalid_state_transition",
          "refund_attempt_transition_conflict",
          "Refund attempt is no longer in the expected state.",
          { expected: allowedFrom, current: current.status },
        );
      }
      const resolvedAt = ["refunded", "provider_unknown", "failed"].includes(status)
        ? updated_at
        : null;
      this.db
        .prepare(`
          UPDATE refund_attempts
          SET status=?, provider_reference=?, reason_code=?, updated_at=?, resolved_at=?
          WHERE operation_key=?
        `)
        .run(status, provider_reference, reason_code, updated_at, resolvedAt, operationKey);
      return this.getRefundAttempt(operationKey);
    });
  }

  saveX402Authorization(authorization) {
    const existing = this.getX402Authorization(authorization.transaction_id);
    if (existing) {
      if (existing.terms_fingerprint !== authorization.terms_fingerprint) {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "x402_authorization_conflict",
          "The x402 authorization terms changed for this transaction.",
        );
      }
      return existing;
    }
    this.db
      .prepare(`
        INSERT INTO x402_authorizations(
          transaction_id, payment_intent_id, quote_id, authorization_id,
          payment_mandate_id, payee_account_id, x402_version, scheme, network,
          asset, amount_atomic, pay_to, resource_url, terms_json,
          terms_fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        authorization.transaction_id,
        authorization.payment_intent_id ?? null,
        authorization.quote_id ?? null,
        authorization.authorization_id ?? null,
        authorization.payment_mandate_id ?? null,
        authorization.payee_account_id ?? null,
        authorization.x402_version,
        authorization.scheme,
        authorization.network,
        authorization.asset,
        authorization.amount_atomic,
        authorization.pay_to,
        authorization.resource_url,
        authorization.terms_json,
        authorization.terms_fingerprint,
        authorization.created_at,
      );
    return this.getX402Authorization(authorization.transaction_id);
  }

  getX402Authorization(transactionId) {
    const row = this.db
      .prepare("SELECT * FROM x402_authorizations WHERE transaction_id=?")
      .get(transactionId);
    return row ? { ...row } : null;
  }

  prepareX402PaymentAttempt({
    operation_key,
    transaction_id,
    authorization_fingerprint,
    amount_value,
    currency,
    provider_reference,
    created_at = new Date().toISOString(),
  }) {
    const correlation = this.observer?.context({ transaction_id }) ?? {
      transaction_id,
    };
    return immediateTransaction(this.db, () => {
      const existing = this.getPaymentAttempt(operation_key);
      if (existing) return existing;
      const id = `pat_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const requestNonce = randomUUID();
      this.db
        .prepare(`
          INSERT INTO adapter_operations(
            idempotency_key, operation, provider_reference, amount_value,
            currency, status, created_at, request_id, trace_id, transaction_id,
            last_error, updated_at, resolved_at
          ) VALUES (?, 'settle', ?, ?, ?, 'payment_prepared', ?, ?, ?, ?, NULL, ?, NULL)
        `)
        .run(
          operation_key,
          provider_reference,
          amount_value,
          currency,
          created_at,
          correlation.request_id ?? null,
          correlation.trace_id ?? null,
          transaction_id,
          created_at,
        );
      this.db
        .prepare(`
          INSERT INTO payment_attempts(
            id, operation_key, transaction_id, authorization_fingerprint,
            request_nonce, status, provider_reference, reason_code, created_at,
            updated_at, request_id, trace_id
          ) VALUES (?, ?, ?, ?, ?, 'prepared', NULL, NULL, ?, ?, ?, ?)
        `)
        .run(
          id,
          operation_key,
          transaction_id,
          authorization_fingerprint,
          requestNonce,
          created_at,
          created_at,
          correlation.request_id ?? null,
          correlation.trace_id ?? null,
        );
      return this.getPaymentAttempt(operation_key);
    });
  }

  getPaymentAttempt(operationKey) {
    const row = this.db
      .prepare("SELECT * FROM payment_attempts WHERE operation_key=?")
      .get(operationKey);
    return row ? { ...row } : null;
  }

  paymentAttempts(transactionId = null) {
    if (transactionId) {
      return this.db
        .prepare("SELECT * FROM payment_attempts WHERE transaction_id=? ORDER BY created_at")
        .all(transactionId);
    }
    return this.db.prepare("SELECT * FROM payment_attempts ORDER BY created_at").all();
  }

  transitionX402PaymentAttempt(
    operationKey,
    { from, status, provider_reference = null, reason_code = null },
  ) {
    const updatedAt = new Date().toISOString();
    return immediateTransaction(this.db, () => {
      const result = this.db
        .prepare(`
          UPDATE payment_attempts
          SET status=?, provider_reference=?, reason_code=?, updated_at=?
          WHERE operation_key=? AND status=?
        `)
        .run(status, provider_reference, reason_code, updatedAt, operationKey, from);
      if (result.changes !== 1) {
        const current = this.getPaymentAttempt(operationKey);
        throw new ApiError(
          409,
          "invalid_state_transition",
          "x402_payment_attempt_transition_conflict",
          "The x402 payment attempt is no longer in the expected state.",
          { expected: from, current: current?.status ?? null },
        );
      }
      const adapterStatus =
        status === "prepared" ? "payment_prepared" : status === "submitting" ? "payment_submitting" : status;
      const adapterResult = this.db
        .prepare(`
          UPDATE adapter_operations
          SET status=?, provider_reference=COALESCE(?, provider_reference),
              last_error=?, updated_at=?, resolved_at=?
          WHERE idempotency_key=?
        `)
        .run(
          adapterStatus,
          provider_reference,
          reason_code,
          updatedAt,
          status === "settled" || status === "rejected" ? updatedAt : null,
          operationKey,
        );
      if (adapterResult.changes !== 1) {
        throw new ApiError(
          500,
          "internal_error",
          "x402_adapter_operation_missing",
          "The x402 Adapter operation is missing for the persisted payment attempt.",
        );
      }
      return {
        attempt: this.getPaymentAttempt(operationKey),
        operation: this.getAdapterOperation(operationKey),
      };
    });
  }

  recordAdapterRecovery({
    operation_key,
    transaction_id,
    status,
    provider_reference = null,
    reason_code = null,
    created_at = new Date().toISOString(),
  }) {
    const correlation = this.observer?.context({ transaction_id }) ?? {
      transaction_id,
    };
    return immediateTransaction(this.db, () => {
      const operation = this.db
        .prepare("SELECT * FROM adapter_operations WHERE idempotency_key=?")
        .get(operation_key);
      if (!operation) {
        throw new ApiError(
          404,
          "resource_not_found",
          "adapter_operation_not_found",
          "Adapter operation was not found.",
        );
      }
      const attempt = {
        id: `arv_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
        operation_key,
        transaction_id,
        status,
        provider_reference,
        reason_code,
        created_at,
        request_id: correlation.request_id ?? null,
        trace_id: correlation.trace_id ?? null,
      };
      this.db
        .prepare(`
          INSERT INTO adapter_recovery_attempts(
            id, operation_key, transaction_id, status, provider_reference,
            reason_code, created_at, request_id, trace_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          attempt.id,
          attempt.operation_key,
          attempt.transaction_id,
          attempt.status,
          attempt.provider_reference,
          attempt.reason_code,
          attempt.created_at,
          attempt.request_id,
          attempt.trace_id,
        );
      if (status === "settled") {
        if (!provider_reference) {
          throw new ApiError(
            502,
            "provider_error",
            "x402_recovery_reference_missing",
            "A settled recovery result must include a provider reference.",
          );
        }
        this.db
          .prepare(`
            UPDATE adapter_operations
            SET status='settled', provider_reference=?, last_error=NULL,
                updated_at=?, resolved_at=?
            WHERE idempotency_key=?
              AND status IN ('payment_prepared', 'payment_submitting', 'provider_unknown')
          `)
          .run(provider_reference, created_at, created_at, operation_key);
        this.db
          .prepare(`
            UPDATE payment_attempts
            SET status='settled', provider_reference=?, reason_code=NULL, updated_at=?
            WHERE operation_key=? AND status IN ('prepared', 'submitting', 'provider_unknown')
          `)
          .run(provider_reference, created_at, operation_key);
      } else {
        this.db
          .prepare(`
            UPDATE adapter_operations
            SET status='provider_unknown', last_error=?, updated_at=?
            WHERE idempotency_key=?
              AND status IN ('payment_prepared', 'payment_submitting', 'provider_unknown')
          `)
          .run(reason_code, created_at, operation_key);
        this.db
          .prepare(`
            UPDATE payment_attempts
            SET status='provider_unknown', reason_code=?, updated_at=?
            WHERE operation_key=? AND status IN ('prepared', 'submitting', 'provider_unknown')
          `)
          .run(reason_code, created_at, operation_key);
      }
      const updatedOperation = this.db
        .prepare("SELECT * FROM adapter_operations WHERE idempotency_key=?")
        .get(operation_key);
      return { attempt, operation: { ...updatedOperation } };
    });
  }

  adapterRecoveryAttempts(transactionId) {
    return this.db
      .prepare(`
        SELECT * FROM adapter_recovery_attempts
        WHERE transaction_id=? ORDER BY sequence
      `)
      .all(transactionId);
  }

  close() {
    this.db.close();
  }
}
