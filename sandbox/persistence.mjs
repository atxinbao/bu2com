import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const parse = (value, fallback) => (value ? JSON.parse(value) : fallback);

export class SqliteLedger {
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
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
    `);
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
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ledger_events(event_id, event_type, resource_id, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.type, event.resource_id, JSON.stringify(event), event.created_at);
    const subscriptions = this.db
      .prepare("SELECT id FROM webhook_subscriptions WHERE active = 1")
      .all();
    const enqueue = this.db.prepare(`
      INSERT OR IGNORE INTO webhook_outbox(id, event_id, subscription_id, payload, status, next_attempt_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);
    for (const subscription of subscriptions) {
      enqueue.run(
        `out_${event.id}_${subscription.id}`,
        event.id,
        subscription.id,
        JSON.stringify(event),
        Date.now(),
      );
    }
  }

  listLedgerEvents() {
    return this.db
      .prepare("SELECT sequence, payload FROM ledger_events ORDER BY sequence")
      .all()
      .map((row) => ({ sequence: row.sequence, ...JSON.parse(row.payload) }));
  }

  addWebhookSubscription({ id, url, secret }) {
    this.db
      .prepare(
        `INSERT INTO webhook_subscriptions(id, url, secret, active, created_at) VALUES (?, ?, ?, 1, ?)`,
      )
      .run(id, url, secret, new Date().toISOString());
    return { id, url, active: true };
  }

  listDueOutbox({ force = false } = {}) {
    const sql = `
      SELECT o.*, s.url, s.secret FROM webhook_outbox o
      JOIN webhook_subscriptions s ON s.id = o.subscription_id
      WHERE o.status != 'delivered' AND s.active = 1 ${force ? "" : "AND o.next_attempt_at <= ?"}
      ORDER BY o.next_attempt_at, o.id
    `;
    return force ? this.db.prepare(sql).all() : this.db.prepare(sql).all(Date.now());
  }

  markDelivered(id) {
    this.db
      .prepare(
        `UPDATE webhook_outbox SET status='delivered', attempts=attempts+1, delivered_at=?, last_error=NULL WHERE id=?`,
      )
      .run(new Date().toISOString(), id);
  }

  markWebhookFailed(id, message, delayMs) {
    this.db
      .prepare(
        `UPDATE webhook_outbox SET status='retrying', attempts=attempts+1, next_attempt_at=?, last_error=? WHERE id=?`,
      )
      .run(Date.now() + delayMs, message.slice(0, 500), id);
  }

  outboxRows() {
    return this.db.prepare("SELECT * FROM webhook_outbox ORDER BY id").all();
  }

  getAdapterOperation(key) {
    const row = this.db
      .prepare("SELECT * FROM adapter_operations WHERE idempotency_key=?")
      .get(key);
    return row ? { ...row } : null;
  }

  saveAdapterOperation(operation) {
    this.db
      .prepare(`
      INSERT INTO adapter_operations(idempotency_key, operation, provider_reference, amount_value, currency, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        operation.idempotency_key,
        operation.operation,
        operation.provider_reference,
        operation.amount_value,
        operation.currency,
        operation.status,
        operation.created_at,
      );
    return operation;
  }

  adapterOperations() {
    return this.db.prepare("SELECT * FROM adapter_operations ORDER BY created_at").all();
  }

  close() {
    this.db.close();
  }
}
