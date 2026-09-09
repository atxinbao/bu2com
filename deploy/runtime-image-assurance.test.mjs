import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRuntimeImageEvidence } from "./validate-runtime-image.mjs";

test("CI-RT01 image assurance entrypoint checks the real SQLite engine", () => {
  const source = readFileSync(new URL("../sandbox/runtime-image-assurance.mjs", import.meta.url), "utf8");
  assert.match(source, /SELECT sqlite_version\(\)/);
  assert.match(source, /process\.getuid/);
  assert.match(source, /backup_restore/);
  assert.match(source, /payment_execution_attempted: false/);
});

test("CI-RT01 rejects image evidence with runtime or source drift", () => {
  const imageId = `sha256:${"a".repeat(64)}`;
  const sourceCommit = "b".repeat(40);
  const evidence = {
    schema_version: "rt01.image.v1",
    status: "passed",
    image_id: imageId,
    source_commit: sourceCommit,
    node_version: "v22.16.0",
    npm_version: "10.9.2",
    sqlite_version: "3.49.1",
    runtime_identity: { uid: 10001, gid: 10001 },
    schema_version_number: 19,
    migration_versions: Array.from({ length: 19 }, (_, index) => index + 1),
    journal_mode: "wal",
    foreign_keys: 1,
    backup_restore: { integrity: "ok", same_schema: true, provider_replay: false },
    authorization: { signer_loaded: false, payment_execution_attempted: false, live_enabled: false },
  };
  const expected = { expectedCommit: sourceCommit, expectedImageId: imageId };
  assert.equal(validateRuntimeImageEvidence(evidence, expected), true);
  assert.equal(validateRuntimeImageEvidence({ ...evidence, sqlite_version: "3.48.0" }, expected), false);
  assert.equal(validateRuntimeImageEvidence(evidence, { ...expected, expectedCommit: "c".repeat(40) }), false);
  assert.equal(validateRuntimeImageEvidence(evidence, { ...expected, expectedImageId: `sha256:${"d".repeat(64)}` }), false);
  assert.equal(validateRuntimeImageEvidence({ ...evidence, runtime_identity: { uid: 0, gid: 0 } }, expected), false);
  assert.equal(
    validateRuntimeImageEvidence({
      ...evidence,
      authorization: { ...evidence.authorization, signer_loaded: true },
    }, expected),
    false,
  );
});
