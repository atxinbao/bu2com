import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteLedger } from "../sandbox/persistence.mjs";
import { fileURLToPath } from "node:url";

const CURRENT_SCHEMA_VERSION = 16;
const DOCKERFILE = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const SANDBOX_PACKAGE = JSON.parse(
  readFileSync(new URL("../sandbox/package.json", import.meta.url), "utf8"),
);

const parseNodeVersion = (version) => {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
};

const atLeast = (actual, expected) =>
  actual[0] > expected[0] ||
  (actual[0] === expected[0] &&
    (actual[1] > expected[1] || (actual[1] === expected[1] && actual[2] >= expected[2])));

const schemaMigrations = (ledger) =>
  ledger.schemaMigrations().map((migration) => migration.version);

export function validateRuntimeEvidence(evidence) {
  return (
    evidence?.schema_version === "rt01.v1" &&
    evidence.gate === "fixed_sqlite_runtime" &&
    evidence.status === "passed" &&
    evidence.runtime?.node_version?.startsWith("v") &&
    evidence.runtime?.node_floor === ">=22.16.0" &&
    evidence.sqlite?.journal_mode === "wal" &&
    evidence.sqlite?.foreign_keys === 1 &&
    evidence.sqlite?.schema_version >= CURRENT_SCHEMA_VERSION &&
    evidence.sqlite?.migration_versions?.length >= CURRENT_SCHEMA_VERSION &&
    evidence.backup_restore?.integrity === "ok" &&
    evidence.backup_restore?.same_schema === true &&
    evidence.authorization?.payment_execution_attempted === false &&
    evidence.authorization?.signer_loaded === false
  );
}

export async function runRuntimeAssurance({ workRoot = null } = {}) {
  const nodeVersion = parseNodeVersion(process.version);
  assert.ok(nodeVersion && atLeast(nodeVersion, [22, 16, 0]), "Node.js runtime must be >=22.16.0");
  assert.equal(SANDBOX_PACKAGE.engines?.node, ">=22.16.0");
  assert.equal((DOCKERFILE.match(/FROM node:22\.16\.0-bookworm-slim/g) ?? []).length, 2);

  const directory = workRoot ?? mkdtempSync(join(tmpdir(), "bu2-rt01-"));
  const sourcePath = join(directory, "source.sqlite");
  const backupPath = join(directory, "backup.sqlite");
  let source;
  let restored;
  try {
    source = new SqliteLedger(sourcePath);
    const journalMode = source.db.prepare("PRAGMA journal_mode").get().journal_mode;
    const foreignKeys = source.db.prepare("PRAGMA foreign_keys").get().foreign_keys;
    const migrations = schemaMigrations(source);
    assert.equal(journalMode, "wal");
    assert.equal(foreignKeys, 1);
    assert.deepEqual(migrations, Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1));
    await source.backupTo(backupPath, { rate: 100 });
    assert.deepEqual(source.databaseIntegrity(), ["ok"]);
    source.close();
    source = null;

    restored = new SqliteLedger(backupPath);
    assert.deepEqual(restored.databaseIntegrity(), ["ok"]);
    assert.equal(restored.schemaVersion(), CURRENT_SCHEMA_VERSION);
    const evidence = {
      schema_version: "rt01.v1",
      gate: "fixed_sqlite_runtime",
      status: "passed",
      runtime: {
        node_version: process.version,
        node_floor: ">=22.16.0",
        docker_base: "node:22.16.0-bookworm-slim",
      },
      sqlite: {
        journal_mode: "wal",
        foreign_keys: 1,
        schema_version: source?.schemaVersion?.() ?? restored.schemaVersion(),
        migration_versions: schemaMigrations(restored),
      },
      backup_restore: {
        integrity: "ok",
        same_schema: true,
        source_path_isolated: true,
        provider_replay: false,
      },
      authorization: {
        payment_execution_attempted: false,
        signer_loaded: false,
        live_enabled: false,
      },
      next_gate: "LA-06b still requires separately collected bilateral Sandbox/Testnet evidence.",
    };
    assert.equal(validateRuntimeEvidence(evidence), true);
    return evidence;
  } finally {
    if (source) source.close();
    if (restored) restored.close();
    if (!workRoot) rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runRuntimeAssurance(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
