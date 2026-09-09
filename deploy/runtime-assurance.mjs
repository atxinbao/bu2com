import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteLedger } from "../sandbox/persistence.mjs";
import { fileURLToPath } from "node:url";

const CURRENT_SCHEMA_VERSION = 19;
const DOCKERFILE = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const SANDBOX_PACKAGE = JSON.parse(
  readFileSync(new URL("../sandbox/package.json", import.meta.url), "utf8"),
);
const RUNTIME_POLICY = JSON.parse(
  readFileSync(new URL("./runtime-policy.json", import.meta.url), "utf8"),
);

const currentCommit = (cwd = process.cwd()) =>
  execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

const parseNodeVersion = (version) => {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
};

const parseVersion = (version) => {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
};

const atLeast = (actual, expected) =>
  actual[0] > expected[0] ||
  (actual[0] === expected[0] &&
    (actual[1] > expected[1] || (actual[1] === expected[1] && actual[2] >= expected[2])));

const schemaMigrations = (ledger) =>
  ledger.schemaMigrations().map((migration) => migration.version);

export function validateRuntimeEvidence(evidence) {
  const sqliteVersion = parseVersion(evidence?.sqlite?.engine_version);
  const sqliteFixFloor = parseVersion(RUNTIME_POLICY.sqlite_wal_reset_fixed_min_version);
  return (
    evidence?.schema_version === "rt01.v1" &&
    evidence.gate === "fixed_sqlite_runtime" &&
    evidence.status === "passed" &&
    evidence.runtime?.node_version === RUNTIME_POLICY.node_version &&
    evidence.runtime?.npm_version === RUNTIME_POLICY.npm_version &&
    evidence.runtime?.node_floor === SANDBOX_PACKAGE.engines?.node &&
    evidence.runtime?.docker_base === RUNTIME_POLICY.node_image &&
    evidence.sqlite?.engine_version === RUNTIME_POLICY.sqlite_version &&
    sqliteVersion !== null &&
    sqliteFixFloor !== null &&
    atLeast(sqliteVersion, sqliteFixFloor) &&
    evidence.sqlite?.journal_mode === "wal" &&
    evidence.sqlite?.foreign_keys === 1 &&
    evidence.sqlite?.schema_version === CURRENT_SCHEMA_VERSION &&
    evidence.sqlite?.migration_versions?.length === CURRENT_SCHEMA_VERSION &&
    evidence.backup_restore?.integrity === "ok" &&
    evidence.backup_restore?.same_schema === true &&
    evidence.authorization?.payment_execution_attempted === false &&
    evidence.authorization?.signer_loaded === false
  );
}

export async function runRuntimeAssurance({ workRoot = null } = {}) {
  const nodeVersion = parseNodeVersion(process.version);
  const npmVersion = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
  assert.ok(nodeVersion, "Node.js runtime version is invalid");
  assert.equal(process.version, RUNTIME_POLICY.node_version);
  assert.equal(npmVersion, RUNTIME_POLICY.npm_version);
  assert.equal(SANDBOX_PACKAGE.engines?.node, ">=24.20.0");
  assert.equal(RUNTIME_POLICY.ledger_schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal((DOCKERFILE.match(new RegExp(`FROM ${RUNTIME_POLICY.node_image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")) ?? []).length, 2);

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
    const sqliteVersion = restored.db.prepare("SELECT sqlite_version() AS version").get().version;
    const parsedSqliteVersion = parseVersion(sqliteVersion);
    const sqliteFixFloor = parseVersion(RUNTIME_POLICY.sqlite_wal_reset_fixed_min_version);
    assert.equal(sqliteVersion, RUNTIME_POLICY.sqlite_version);
    assert.ok(parsedSqliteVersion && sqliteFixFloor && atLeast(parsedSqliteVersion, sqliteFixFloor));
    const evidence = {
      schema_version: "rt01.v1",
      gate: "fixed_sqlite_runtime",
      status: "passed",
      source_commit: process.env.BU2_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? currentCommit(),
      workflow_run: {
        id: process.env.GITHUB_RUN_ID ?? null,
        attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
        job: process.env.GITHUB_JOB ?? null,
      },
      runtime: {
        node_version: process.version,
        npm_version: npmVersion,
        node_floor: SANDBOX_PACKAGE.engines.node,
        docker_base: RUNTIME_POLICY.node_image,
      },
      sqlite: {
        engine_version: sqliteVersion,
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
