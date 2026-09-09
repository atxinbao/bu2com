import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteLedger } from "./persistence.mjs";

const directory = mkdtempSync(join(tmpdir(), "bu2-runtime-image-"));
const policy = JSON.parse(readFileSync(new URL("../deploy/runtime-policy.json", import.meta.url), "utf8"));
const sourcePath = join(directory, "source.sqlite");
const backupPath = join(directory, "backup.sqlite");
let source;
let restored;
try {
  source = new SqliteLedger(sourcePath);
  const evidence = {
    schema_version: "rt01.image.v1",
    status: "passed",
    image_id: process.env.BU2_IMAGE_ID ?? null,
    source_commit: process.env.BU2_SOURCE_COMMIT ?? null,
    node_version: process.version,
    npm_version: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
    runtime_identity: {
      uid: process.getuid?.() ?? null,
      gid: process.getgid?.() ?? null,
    },
    sqlite_version: source.db.prepare("SELECT sqlite_version() AS version").get().version,
    journal_mode: source.db.prepare("PRAGMA journal_mode").get().journal_mode,
    foreign_keys: source.db.prepare("PRAGMA foreign_keys").get().foreign_keys,
    schema_version_number: source.schemaVersion(),
    migration_versions: source.schemaMigrations().map((migration) => migration.version),
  };
  if (
    evidence.node_version !== policy.node_version ||
    evidence.npm_version !== policy.npm_version ||
    evidence.sqlite_version !== policy.sqlite_version
  ) {
    throw new Error("Image runtime differs from the approved runtime policy");
  }
  if (evidence.runtime_identity.uid !== 10001 || evidence.runtime_identity.gid !== 10001) {
    throw new Error("Image probe is not running as the approved Sandbox identity");
  }
  if (evidence.schema_version_number !== policy.ledger_schema_version) throw new Error("Image ledger schema differs from the approved runtime policy");
  if (evidence.migration_versions.length !== policy.ledger_schema_version || evidence.migration_versions.some((version, index) => version !== index + 1)) {
    throw new Error("Image ledger migration sequence is not exact and continuous");
  }
  if (evidence.journal_mode !== "wal" || evidence.foreign_keys !== 1) throw new Error("SQLite runtime pragmas are not approved");
  await source.backupTo(backupPath, { rate: 100 });
  if (JSON.stringify(source.databaseIntegrity()) !== JSON.stringify(["ok"])) throw new Error("Source database integrity failed");
  source.close();
  source = null;
  restored = new SqliteLedger(backupPath);
  if (JSON.stringify(restored.databaseIntegrity()) !== JSON.stringify(["ok"])) throw new Error("Restored database integrity failed");
  if (restored.schemaVersion() !== evidence.schema_version_number) throw new Error("Backup schema differs from source schema");
  process.stdout.write(`${JSON.stringify({
    ...evidence,
    backup_restore: { integrity: "ok", same_schema: true, provider_replay: false },
    authorization: {
      signer_loaded: false,
      payment_execution_attempted: false,
      live_enabled: false,
    },
  }, null, 2)}\n`);
} finally {
  if (source) source.close();
  if (restored) restored.close();
  rmSync(directory, { recursive: true, force: true });
}
