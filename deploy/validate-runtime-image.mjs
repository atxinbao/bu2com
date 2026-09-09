import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const policy = JSON.parse(readFileSync(new URL("./runtime-policy.json", import.meta.url), "utf8"));

export function validateRuntimeImageEvidence(
  evidence,
  { expectedCommit = null, expectedImageId = null } = {},
) {
  const migrations = evidence?.migration_versions ?? [];
  return (
    policy.schema_version === "rt01.policy.v1" &&
    evidence?.schema_version === "rt01.image.v1" &&
    evidence.status === "passed" &&
    /^sha256:[a-f0-9]{64}$/.test(evidence.image_id ?? "") &&
    (!expectedImageId || evidence.image_id === expectedImageId) &&
    /^[a-f0-9]{40,64}$/.test(evidence.source_commit ?? "") &&
    (!expectedCommit || evidence.source_commit === expectedCommit) &&
    evidence.node_version === policy.node_version &&
    evidence.npm_version === policy.npm_version &&
    evidence.runtime_identity?.uid === 10001 &&
    evidence.runtime_identity?.gid === 10001 &&
    evidence.sqlite_version === policy.sqlite_version &&
    evidence.schema_version_number === policy.ledger_schema_version &&
    migrations.length === policy.ledger_schema_version &&
    migrations.every((version, index) => version === index + 1) &&
    evidence.journal_mode === "wal" &&
    evidence.foreign_keys === 1 &&
    evidence.backup_restore?.integrity === "ok" &&
    evidence.backup_restore?.same_schema === true &&
    evidence.backup_restore?.provider_replay === false &&
    evidence.authorization?.signer_loaded === false &&
    evidence.authorization?.payment_execution_attempted === false &&
    evidence.authorization?.live_enabled === false
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const path = process.argv[2];
    const imageIdPath = process.argv[3];
    if (!path || !existsSync(path) || !imageIdPath || !existsSync(imageIdPath)) {
      throw new Error("Runtime image evidence or image ID is missing");
    }
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    const expectedImageId = readFileSync(imageIdPath, "utf8").trim();
    if (!validateRuntimeImageEvidence(evidence, {
      expectedCommit: process.env.GITHUB_SHA ?? null,
      expectedImageId,
    })) {
      throw new Error("Runtime image evidence does not match the approved policy, image ID, or source commit");
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
