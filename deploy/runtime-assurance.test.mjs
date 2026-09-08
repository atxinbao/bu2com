import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeAssurance, validateRuntimeEvidence } from "./runtime-assurance.mjs";

test("RT-01 proves the fixed Node, WAL, migration and backup runtime contract", async () => {
  const evidence = await runRuntimeAssurance();
  assert.equal(validateRuntimeEvidence(evidence), true);
  assert.equal(evidence.sqlite.journal_mode, "wal");
  assert.equal(evidence.sqlite.foreign_keys, 1);
  assert.deepEqual(evidence.sqlite.migration_versions, Array.from({ length: 15 }, (_, index) => index + 1));
  assert.equal(evidence.backup_restore.integrity, "ok");
});

test("RT-01 evidence cannot authorize payment or pretend to be bilateral Sandbox evidence", () => {
  const evidence = {
    schema_version: "rt01.v1",
    gate: "fixed_sqlite_runtime",
    status: "passed",
    runtime: { node_version: "v22.16.0", node_floor: ">=22.16.0" },
    sqlite: {
      journal_mode: "wal",
      foreign_keys: 1,
      schema_version: 15,
      migration_versions: Array.from({ length: 15 }, (_, index) => index + 1),
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
});
