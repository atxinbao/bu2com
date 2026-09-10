import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeAssurance, validateRuntimeEvidence } from "./runtime-assurance.mjs";

test("RT-01 proves the fixed Node, WAL, migration and backup runtime contract", async () => {
  const evidence = await runRuntimeAssurance();
  assert.equal(validateRuntimeEvidence(evidence), true);
  assert.equal(evidence.sqlite.journal_mode, "wal");
  assert.equal(evidence.sqlite.foreign_keys, 1);
  assert.equal(evidence.runtime.node_version, "v24.20.0");
  assert.equal(evidence.runtime.npm_version, "11.19.0");
  assert.equal(evidence.sqlite.engine_version, "3.53.4");
  assert.deepEqual(evidence.sqlite.migration_versions, Array.from({ length: 21 }, (_, index) => index + 1));
  assert.equal(evidence.backup_restore.integrity, "ok");
  assert.match(evidence.source_commit, /^[0-9a-f]{40}$/);
});

test("RT-01 evidence cannot authorize payment or pretend to be bilateral Sandbox evidence", () => {
  const evidence = {
    schema_version: "rt01.v1",
    gate: "fixed_sqlite_runtime",
    status: "passed",
    runtime: {
      node_version: "v24.20.0",
      npm_version: "11.19.0",
      node_floor: ">=24.20.0",
      docker_base: "node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e",
    },
    sqlite: {
      engine_version: "3.53.4",
      journal_mode: "wal",
      foreign_keys: 1,
      schema_version: 21,
      migration_versions: Array.from({ length: 21 }, (_, index) => index + 1),
    },
    backup_restore: { integrity: "ok", same_schema: true },
    authorization: { payment_execution_attempted: false, signer_loaded: false },
  };
  assert.equal(validateRuntimeEvidence(evidence), true);
  assert.equal(
    validateRuntimeEvidence({
      ...evidence,
      authorization: { payment_execution_attempted: true, signer_loaded: false },
    }),
    false,
  );
  assert.equal(
    validateRuntimeEvidence({ ...evidence, sqlite: { ...evidence.sqlite, journal_mode: "delete" } }),
    false,
  );
  assert.equal(
    validateRuntimeEvidence({ ...evidence, sqlite: { ...evidence.sqlite, engine_version: "3.51.2" } }),
    false,
  );
  assert.equal(
    validateRuntimeEvidence({ ...evidence, runtime: { ...evidence.runtime, npm_version: "11.18.0" } }),
    false,
  );
});
