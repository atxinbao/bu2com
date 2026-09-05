import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ApiError } from "./domain.mjs";

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
  constructor(path = ":memory:", { observer = null } = {}) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.observer = observer;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
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
    const idempotency = this.db
      .prepare("SELECT scope_key, fingerprint, result FROM idempotency_records")
      .all()
      .map((row) => [
        row.scope_key,
        { fingerprint: row.fingerprint, result: JSON.parse(row.result) },
      ]);
    const events = this.db
      .prepare("SELECT payload FROM ledger_events ORDER BY sequence")
      .all()
      .map((row) => JSON.parse(row.payload));
    return { resources, state: stateRows, idempotency, events };
  }

  saveSnapshot(snapshot) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
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
      const idem = this.db.prepare(`
        INSERT OR IGNORE INTO idempotency_records(scope_key, fingerprint, result, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const [scopeKey, value] of snapshot.idempotency) {
        idem.run(scopeKey, value.fingerprint, JSON.stringify(value.result), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  appendEvent(event) {
    return immediateTransaction(this.db, () => {
      const correlation = event.correlation ?? {};
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ledger_events(
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
        INSERT OR IGNORE INTO webhook_outbox(
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
         WHERE status IN ('unknown', 'provider_unknown', 'result_unknown')`,
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
            WHERE idempotency_key=? AND status='provider_unknown'
          `)
          .run(provider_reference, created_at, created_at, operation_key);
      } else {
        this.db
          .prepare(`
            UPDATE adapter_operations
            SET last_error=?, updated_at=?
            WHERE idempotency_key=? AND status='provider_unknown'
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
