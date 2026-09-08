import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteLedger } from "../sandbox/persistence.mjs";
import { DEPLOYMENT_UNITS, validateResolvedDeployment } from "./deployment-contract.mjs";

export const OPERATIONS_CONTRACT = Object.freeze(
  JSON.parse(readFileSync(new URL("./operations-contract.json", import.meta.url), "utf8")),
);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

export class OperationsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperationsError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, message, details) => {
  throw new OperationsError(code, message, details);
};

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

export const sha256Value = (value) =>
  createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

const fileSha256 = (path) =>
  new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });

export function immutableArtifactDigest(reference) {
  const match = String(reference ?? "").match(/(?:^sha256:|@sha256:)([a-f0-9]{64})$/);
  if (!match) {
    fail(
      "artifact_reference_not_immutable",
      "Artifact reference must be a local image ID or registry SHA-256 digest.",
    );
  }
  return `sha256:${match[1]}`;
}

export const deploymentConfigurationSha256 = (resolvedCompose) =>
  sha256Value(resolvedCompose);

const environmentUnit = (environment) => {
  const unit = DEPLOYMENT_UNITS.units[environment];
  if (!unit) {
    fail(
      "operations_environment_invalid",
      "Operations are limited to the Sandbox and Live deployment units.",
      { environment },
    );
  }
  return unit;
};

const assertDisabledEnvironment = (environmentConfig) => {
  const unit = environmentUnit(environmentConfig?.environment);
  if (environmentConfig.execution_status !== "execution_disabled") {
    fail(
      "operations_execution_must_be_disabled",
      "Backup and restore operations require payment execution to remain disabled.",
      { environment: environmentConfig.environment },
    );
  }
  if (
    environmentConfig.chain_id !== unit.chain_id ||
    environmentConfig.network !== unit.network_id ||
    environmentConfig.payment_adapter !== unit.payment_adapter
  ) {
    fail(
      "operations_environment_binding_mismatch",
      "Operations configuration does not match the approved deployment unit.",
      { environment: environmentConfig.environment },
    );
  }
  return unit;
};

const requiredGateEvidence = (gateEvidence) => {
  const normalized = {};
  for (const gate of OPERATIONS_CONTRACT.artifact_promotion.required_gates) {
    if (gateEvidence?.[gate] !== "passed") {
      fail(
        "artifact_promotion_gate_incomplete",
        "Every local promotion gate must pass before a candidate manifest is created.",
        { gate },
      );
    }
    normalized[gate] = "passed";
  }
  return normalized;
};

export function createPromotionManifest({
  sourceCommit,
  artifactReference,
  resolvedCompose,
  databaseSchemaVersion,
  gateEvidence,
  createdAt = Date.now(),
}) {
  if (!COMMIT_PATTERN.test(String(sourceCommit ?? ""))) {
    fail("source_commit_invalid", "Source commit must be a full lowercase Git SHA-1.");
  }
  if (
    !Number.isSafeInteger(databaseSchemaVersion) ||
    databaseSchemaVersion < OPERATIONS_CONTRACT.backup.minimum_schema_version
  ) {
    fail(
      "database_schema_not_promotable",
      "Artifact promotion requires the current approved database schema.",
      { database_schema_version: databaseSchemaVersion },
    );
  }
  const artifactDigest = immutableArtifactDigest(artifactReference);
  const deployment = validateResolvedDeployment(resolvedCompose);
  if (!deployment.valid) {
    fail(
      "deployment_contract_invalid",
      "Resolved deployment does not satisfy the environment isolation contract.",
      { errors: deployment.errors },
    );
  }
  for (const unit of Object.values(DEPLOYMENT_UNITS.units)) {
    if (resolvedCompose.services[unit.service].image !== artifactReference) {
      fail(
        "artifact_promotion_digest_mismatch",
        "Sandbox and Live must resolve to the exact promoted artifact reference.",
      );
    }
  }

  return Object.freeze({
    schema_version: OPERATIONS_CONTRACT.schema_version,
    record_type: "artifact_promotion_candidate",
    created_at: new Date(createdAt).toISOString(),
    source_commit: sourceCommit,
    artifact_reference: artifactReference,
    artifact_digest: artifactDigest,
    deployment_configuration_sha256: deploymentConfigurationSha256(resolvedCompose),
    deployment_contract_sha256: sha256Value(DEPLOYMENT_UNITS),
    operations_contract_sha256: sha256Value(OPERATIONS_CONTRACT),
    database_schema_version: databaseSchemaVersion,
    gate_evidence: requiredGateEvidence(gateEvidence),
    targets: Object.fromEntries(
      Object.entries(DEPLOYMENT_UNITS.units).map(([environment, unit]) => [
        environment,
        {
          chain_id: unit.chain_id,
          network: unit.network_id,
          execution_status: unit.execution_status,
          deployment_authorized: false,
        },
      ]),
    ),
    authorization: {
      hosted_deployment: false,
      payment_execution: false,
      human_review_required: true,
    },
  });
}

export function verifyPromotionManifest(manifest, resolvedCompose) {
  if (manifest?.schema_version !== OPERATIONS_CONTRACT.schema_version) {
    fail("promotion_manifest_version_unsupported", "Promotion manifest version is unsupported.");
  }
  immutableArtifactDigest(manifest.artifact_reference);
  const deployment = validateResolvedDeployment(resolvedCompose);
  if (!deployment.valid) {
    fail("deployment_contract_invalid", "Resolved deployment contract is invalid.", {
      errors: deployment.errors,
    });
  }
  if (
    manifest.deployment_configuration_sha256 !==
    deploymentConfigurationSha256(resolvedCompose)
  ) {
    fail(
      "deployment_configuration_drift",
      "Resolved deployment no longer matches the promotion candidate fingerprint.",
    );
  }
  if (
    manifest.deployment_contract_sha256 !== sha256Value(DEPLOYMENT_UNITS) ||
    manifest.operations_contract_sha256 !== sha256Value(OPERATIONS_CONTRACT)
  ) {
    fail("promotion_contract_drift", "Promotion contracts changed after evidence was created.");
  }
  requiredGateEvidence(manifest.gate_evidence);
  for (const unit of Object.values(DEPLOYMENT_UNITS.units)) {
    if (resolvedCompose.services[unit.service].image !== manifest.artifact_reference) {
      fail("artifact_promotion_digest_mismatch", "Resolved artifact differs from the candidate.");
    }
  }
  if (
    manifest.authorization?.hosted_deployment !== false ||
    manifest.authorization?.payment_execution !== false ||
    manifest.targets?.live?.execution_status !== "execution_disabled"
  ) {
    fail(
      "promotion_authorization_expanded",
      "A local promotion candidate cannot authorize hosting or payment execution.",
    );
  }
  return Object.freeze({ valid: true, artifact_digest: manifest.artifact_digest });
}

const databaseEvidence = (path) => {
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA query_only = ON;");
    const integrity = db
      .prepare("PRAGMA integrity_check")
      .all()
      .map((row) => row.integrity_check);
    const environment = db
      .prepare(
        `SELECT environment_contract_version, environment, payment_adapter,
                chain_id, network, asset, binding_method, bound_at
         FROM environment_metadata WHERE singleton=1`,
      )
      .get();
    const schemaVersion =
      db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get().version ?? 0;
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
    const factCounts = Object.fromEntries(
      tables.map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );
    return { integrity, environment, schema_version: schemaVersion, fact_counts: factCounts };
  } catch (error) {
    if (error instanceof OperationsError) throw error;
    fail("database_backup_invalid", "Backup database could not be verified.", {
      reason: error.code ?? error.name,
    });
  } finally {
    db?.close();
  }
};

const manifestPath = (backupPath) =>
  `${backupPath}${OPERATIONS_CONTRACT.backup.manifest_suffix}`;

const assertConfigurationHash = (value) => {
  if (!SHA256_PATTERN.test(String(value ?? ""))) {
    fail(
      "configuration_fingerprint_invalid",
      "Configuration fingerprint must be a lowercase SHA-256 digest.",
    );
  }
};

export async function createEnvironmentBackup({
  ledger,
  destination,
  environmentConfig,
  artifactReference,
  configurationSha256,
  backupScope,
  backupId = `bkp_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
  createdAt = Date.now(),
}) {
  const unit = assertDisabledEnvironment(environmentConfig);
  const artifactDigest = immutableArtifactDigest(artifactReference);
  assertConfigurationHash(configurationSha256);
  if (backupScope !== unit.backup_scope) {
    fail("backup_scope_mismatch", "Backup scope does not match the source environment.", {
      environment: environmentConfig.environment,
    });
  }
  if (resolve(destination) === resolve(ledger.path)) {
    fail("backup_destination_is_source", "Backup destination must differ from the live database.");
  }
  const sidecar = manifestPath(destination);
  if (existsSync(destination) || existsSync(sidecar)) {
    fail("backup_destination_exists", "Backup and manifest destinations must be new files.");
  }
  const metadata = ledger.environmentMetadata();
  if (
    !metadata ||
    metadata.environment !== environmentConfig.environment ||
    metadata.chain_id !== environmentConfig.chain_id ||
    metadata.network !== environmentConfig.network
  ) {
    fail("backup_environment_mismatch", "Database metadata does not match backup configuration.");
  }

  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const pages = await ledger.backupTo(temporary, { rate: 100 });
    chmodSync(temporary, 0o600);
    const evidence = databaseEvidence(temporary);
    if (
      evidence.integrity.length !== 1 ||
      evidence.integrity[0] !== "ok" ||
      evidence.schema_version < OPERATIONS_CONTRACT.backup.minimum_schema_version
    ) {
      fail("database_backup_integrity_failed", "Backup integrity or schema verification failed.");
    }
    const fileDigest = await fileSha256(temporary);
    const manifest = {
      schema_version: OPERATIONS_CONTRACT.schema_version,
      record_type: "environment_database_backup",
      backup_id: backupId,
      created_at: new Date(createdAt).toISOString(),
      environment: environmentConfig.environment,
      chain_id: environmentConfig.chain_id,
      network: environmentConfig.network,
      execution_status: "execution_disabled",
      backup_scope: backupScope,
      artifact_reference: artifactReference,
      artifact_digest: artifactDigest,
      configuration_sha256: configurationSha256,
      database_sha256: fileDigest,
      database_size_bytes: statSync(temporary).size,
      sqlite_pages: pages,
      database: evidence,
      recovery_policy: {
        isolated_restore_only: true,
        reconciliation_required: true,
        automatic_provider_replay: false,
      },
    };
    renameSync(temporary, destination);
    try {
      writeFileSync(sidecar, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      rmSync(destination, { force: true });
      throw error;
    }
    return Object.freeze(manifest);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export async function verifyEnvironmentBackup({
  backupPath,
  expectedEnvironment,
  expectedArtifactReference,
  expectedConfigurationSha256 = null,
}) {
  environmentUnit(expectedEnvironment);
  if (!existsSync(backupPath) || !existsSync(manifestPath(backupPath))) {
    fail("backup_files_missing", "Backup database and manifest must both exist.");
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath(backupPath), "utf8"));
  } catch {
    fail("backup_manifest_invalid", "Backup manifest must be valid JSON.");
  }
  if (
    manifest.schema_version !== OPERATIONS_CONTRACT.schema_version ||
    manifest.record_type !== "environment_database_backup"
  ) {
    fail("backup_manifest_version_unsupported", "Backup manifest version is unsupported.");
  }
  if (manifest.environment !== expectedEnvironment) {
    fail("backup_environment_mismatch", "Cross-environment backup restore is forbidden.", {
      expected_environment: expectedEnvironment,
      backup_environment: manifest.environment,
    });
  }
  const unit = environmentUnit(expectedEnvironment);
  if (manifest.backup_scope !== unit.backup_scope) {
    fail("backup_scope_mismatch", "Backup scope does not match the expected environment.");
  }
  if (
    manifest.artifact_digest !== immutableArtifactDigest(expectedArtifactReference) ||
    manifest.artifact_reference !== expectedArtifactReference
  ) {
    fail("backup_artifact_mismatch", "Backup artifact binding does not match recovery input.");
  }
  if (expectedConfigurationSha256 !== null) {
    assertConfigurationHash(expectedConfigurationSha256);
    if (manifest.configuration_sha256 !== expectedConfigurationSha256) {
      fail("backup_configuration_drift", "Backup configuration fingerprint does not match.");
    }
  }
  if (manifest.execution_status !== "execution_disabled") {
    fail("backup_execution_not_disabled", "Backup evidence must preserve disabled execution.");
  }
  const digest = await fileSha256(backupPath);
  if (digest !== manifest.database_sha256) {
    fail("backup_database_digest_mismatch", "Backup database digest verification failed.");
  }
  const evidence = databaseEvidence(backupPath);
  if (evidence.integrity.length !== 1 || evidence.integrity[0] !== "ok") {
    fail("database_backup_integrity_failed", "Backup database integrity check failed.");
  }
  if (
    evidence.environment?.environment !== expectedEnvironment ||
    evidence.environment?.chain_id !== manifest.chain_id ||
    evidence.environment?.network !== manifest.network
  ) {
    fail("backup_environment_mismatch", "Backup database metadata does not match its manifest.");
  }
  if (
    evidence.schema_version !== manifest.database.schema_version ||
    canonical(evidence.fact_counts) !== canonical(manifest.database.fact_counts)
  ) {
    fail("backup_evidence_mismatch", "Backup facts do not match the recorded manifest evidence.");
  }
  return Object.freeze({ valid: true, manifest: Object.freeze(manifest), database: evidence });
}

const removeRestoreFiles = (destination) => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${destination}${suffix}`, { force: true });
};

export async function rehearseEnvironmentRestore({
  backupPath,
  destination,
  environmentConfig,
  artifactReference,
  configurationSha256,
  restoreId = `rst_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
  restoredAt = Date.now(),
}) {
  assertDisabledEnvironment(environmentConfig);
  if (existsSync(destination)) {
    fail("restore_destination_exists", "Restore rehearsal destination must be a new file.");
  }
  const verification = await verifyEnvironmentBackup({
    backupPath,
    expectedEnvironment: environmentConfig.environment,
    expectedArtifactReference: artifactReference,
    expectedConfigurationSha256: configurationSha256,
  });
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    copyFileSync(backupPath, destination);
    chmodSync(destination, 0o600);
    const restored = new SqliteLedger(destination, { environmentConfig });
    let factCounts;
    let integrity;
    let schemaVersion;
    let health;
    try {
      factCounts = restored.recoveryFactCounts();
      integrity = restored.databaseIntegrity();
      schemaVersion = restored.schemaVersion();
      health = restored.healthSnapshot();
    } finally {
      restored.close();
    }
    if (
      canonical(factCounts) !== canonical(verification.manifest.database.fact_counts) ||
      schemaVersion !== verification.manifest.database.schema_version ||
      integrity.length !== 1 ||
      integrity[0] !== "ok"
    ) {
      fail("restore_rehearsal_verification_failed", "Restored database facts failed validation.");
    }
    return Object.freeze({
      schema_version: OPERATIONS_CONTRACT.schema_version,
      record_type: "environment_restore_rehearsal",
      restore_id: restoreId,
      restored_at: new Date(restoredAt).toISOString(),
      source_backup_id: verification.manifest.backup_id,
      environment: environmentConfig.environment,
      chain_id: environmentConfig.chain_id,
      artifact_digest: immutableArtifactDigest(artifactReference),
      database_schema_version: schemaVersion,
      fact_counts: factCounts,
      operational_counts: {
        unknown_payment_results: health.adapter_operations.unknown_results,
        webhook_dead_letters: health.webhook_outbox.dead_letter,
      },
      execution_status: "execution_disabled",
      reconciliation_status: "required",
      release_status: "blocked_pending_reconciliation",
      automatic_provider_replay: false,
      payment_execution_attempted: false,
    });
  } catch (error) {
    removeRestoreFiles(destination);
    throw error;
  }
}

export function createOperationalSnapshot({
  ledger,
  environmentConfig,
  artifactReference,
  expectedConfigurationSha256,
  actualConfigurationSha256,
  backupManifest = null,
  maxBackupAgeSeconds,
  now = Date.now(),
}) {
  assertDisabledEnvironment(environmentConfig);
  immutableArtifactDigest(artifactReference);
  assertConfigurationHash(expectedConfigurationSha256);
  assertConfigurationHash(actualConfigurationSha256);
  if (!Number.isSafeInteger(maxBackupAgeSeconds) || maxBackupAgeSeconds <= 0) {
    fail("backup_age_threshold_invalid", "Backup age threshold must be a positive integer.");
  }
  const blocked = [];
  const attention = [];
  if (expectedConfigurationSha256 !== actualConfigurationSha256) {
    blocked.push("configuration_drift");
  }
  const integrity = ledger.databaseIntegrity();
  if (integrity.length !== 1 || integrity[0] !== "ok") {
    blocked.push("database_integrity_failed");
  }
  if (!backupManifest) {
    attention.push("backup_missing");
  } else if (backupManifest.environment !== environmentConfig.environment) {
    blocked.push("environment_binding_mismatch");
  } else {
    const ageSeconds = Math.max(
      0,
      Math.floor((now - Date.parse(backupManifest.created_at)) / 1000),
    );
    if (!Number.isFinite(ageSeconds) || ageSeconds > maxBackupAgeSeconds) {
      attention.push("backup_stale");
    }
  }
  const health = ledger.healthSnapshot();
  if (health.adapter_operations.unknown_results > 0) attention.push("unknown_payment_results");
  if (health.webhook_outbox.dead_letter > 0) attention.push("webhook_dead_letters");
  const operationalStatus =
    blocked.length > 0 ? "blocked" : attention.length > 0 ? "attention_required" : "healthy";
  return Object.freeze({
    schema_version: OPERATIONS_CONTRACT.schema_version,
    generated_at: new Date(now).toISOString(),
    environment: environmentConfig.environment,
    chain_id: environmentConfig.chain_id,
    execution_status: "execution_disabled",
    artifact_digest: immutableArtifactDigest(artifactReference),
    database: {
      schema_version: ledger.schemaVersion(),
      integrity: integrity[0] ?? "failed",
    },
    queues: {
      unknown_payment_results: health.adapter_operations.unknown_results,
      webhook_dead_letters: health.webhook_outbox.dead_letter,
    },
    backup: backupManifest
      ? { backup_id: backupManifest.backup_id, created_at: backupManifest.created_at }
      : { backup_id: null, created_at: null },
    configuration_drift: expectedConfigurationSha256 !== actualConfigurationSha256,
    operational_status: operationalStatus,
    blocked_conditions: Object.freeze(blocked.sort()),
    attention_conditions: Object.freeze(attention.sort()),
    payment_execution_ready: false,
    redaction: {
      applied: true,
      excluded: OPERATIONS_CONTRACT.monitoring.sensitive_fields_forbidden,
    },
  });
}
