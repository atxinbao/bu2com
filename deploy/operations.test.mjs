import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadEnvironmentConfig } from "../sandbox/environment-config.mjs";
import { SqliteLedger } from "../sandbox/persistence.mjs";
import {
  createEnvironmentBackup,
  createOperationalSnapshot,
  createPromotionManifest,
  deploymentConfigurationSha256,
  rehearseEnvironmentRestore,
  verifyEnvironmentBackup,
  verifyPromotionManifest,
} from "./operations.mjs";

const artifact = `sha256:${"a".repeat(64)}`;
const configHash = "b".repeat(64);
const sourceCommit = "c".repeat(40);

const environmentConfig = (environment) =>
  loadEnvironmentConfig(
    {
      environment,
      paymentAdapter: "x402",
      executionStatus: "execution_disabled",
    },
    {},
  );

const service = (environment, image = artifact) => {
  const sandbox = environment === "sandbox";
  const data = sandbox ? "sandbox" : "live";
  return {
    image,
    user: sandbox ? "10001:10001" : "10002:10002",
    environment: {
      BU2_ENVIRONMENT: environment,
      BU2_PAYMENT_ADAPTER: "x402",
      BU2_CHAIN_ID: sandbox ? "84532" : "8453",
      BU2_NETWORK: sandbox ? "eip155:84532" : "eip155:8453",
      BU2_PROVIDER_NETWORK: sandbox ? "eip155:84532" : "eip155:8453",
      BU2_PROVIDER_SCHEME: "exact",
      BU2_EXECUTION_STATUS: "execution_disabled",
      BU2_ACCESS_MODE: "authenticated",
      BU2_SANDBOX_DB: `/var/lib/bu2/${data}/bu2.sqlite`,
    },
    labels: {
      "com.bu2.runtime-identity": sandbox ? "bu2sandbox" : "bu2live",
      "com.bu2.secret-namespace": `bu2/${data}`,
      "com.bu2.backup-scope": `bu2-${data}`,
      "com.bu2.provider-scope": `bu2-${data}`,
    },
    volumes: [`${data}-data:/var/lib/bu2/${data}`],
    networks: [`${data}-network`],
    read_only: true,
    cap_drop: ["ALL"],
    restart: "on-failure:3",
    ports: [{ host_ip: "127.0.0.1" }],
    ...(sandbox ? {} : { profiles: ["live"] }),
  };
};

const resolvedCompose = (image = artifact) => ({
  services: {
    sandbox: service("sandbox", image),
    live: service("live", image),
  },
});

const gates = {
  local_contract: "passed",
  isolated_deployment: "passed",
  backup_restore_rehearsal: "passed",
};

const recordAccessFact = (ledger, environment) =>
  ledger.recordAccessDecision({
    id: `acd_${environment}`,
    environment,
    credential_id: "key_test",
    tenant_id: "ten_test",
    principal_id: "agt_test",
    role: "agent",
    permission: "transactions:read",
    method: "GET",
    path: "/v1/transactions",
    resource_id: null,
    outcome: "allowed",
    reason_code: "authorized",
    request_id: "req_test0001",
    trace_id: "trc_test0001",
    created_at: "2026-09-06T00:00:00.000Z",
  });

test("promotion manifest binds one immutable artifact and detects configuration drift", () => {
  const compose = resolvedCompose();
  const manifest = createPromotionManifest({
    sourceCommit,
    artifactReference: artifact,
    resolvedCompose: compose,
    databaseSchemaVersion: 9,
    gateEvidence: gates,
    createdAt: 1_000,
  });
  assert.equal(manifest.targets.live.execution_status, "execution_disabled");
  assert.equal(manifest.authorization.hosted_deployment, false);
  assert.equal(manifest.authorization.payment_execution, false);
  assert.deepEqual(verifyPromotionManifest(manifest, compose), {
    valid: true,
    artifact_digest: artifact,
  });

  const drifted = structuredClone(compose);
  drifted.services.sandbox.healthcheck = { interval: "10s" };
  assert.throws(
    () => verifyPromotionManifest(manifest, drifted),
    (error) => error.code === "deployment_configuration_drift",
  );
  assert.throws(
    () =>
      createPromotionManifest({
        sourceCommit,
        artifactReference: "bu2/reference:latest",
        resolvedCompose: compose,
        databaseSchemaVersion: 9,
        gateEvidence: gates,
      }),
    (error) => error.code === "artifact_reference_not_immutable",
  );
});

test("online backup preserves WAL facts and restores only into a disarmed isolated copy", async () => {
  const work = mkdtempSync(join(tmpdir(), "bu2-env06-backup-"));
  try {
    const config = environmentConfig("sandbox");
    const source = join(work, "source", "bu2.sqlite");
    const backup = join(work, "backups", "sandbox.sqlite");
    const restored = join(work, "restore", "sandbox.sqlite");
    const ledger = new SqliteLedger(source, { environmentConfig: config });
    recordAccessFact(ledger, "sandbox");
    const manifest = await createEnvironmentBackup({
      ledger,
      destination: backup,
      environmentConfig: config,
      artifactReference: artifact,
      configurationSha256: configHash,
      backupScope: "bu2-sandbox",
      backupId: "bkp_sandbox_test",
      createdAt: 2_000,
    });
    ledger.recordAccessDecision({
      ...ledger.accessDecisionRows("sandbox")[0],
      id: "acd_after_backup",
      request_id: "req_after0001",
      trace_id: "trc_after0001",
      created_at: "2026-09-06T00:01:00.000Z",
    });
    ledger.close();

    const verified = await verifyEnvironmentBackup({
      backupPath: backup,
      expectedEnvironment: "sandbox",
      expectedArtifactReference: artifact,
      expectedConfigurationSha256: configHash,
    });
    assert.equal(verified.valid, true);
    assert.equal(verified.database.fact_counts.access_decisions, 1);
    assert.equal(manifest.database.fact_counts.access_decisions, 1);

    const rehearsal = await rehearseEnvironmentRestore({
      backupPath: backup,
      destination: restored,
      environmentConfig: config,
      artifactReference: artifact,
      configurationSha256: configHash,
      restoreId: "rst_sandbox_test",
      restoredAt: 3_000,
    });
    assert.equal(rehearsal.fact_counts.access_decisions, 1);
    assert.equal(rehearsal.execution_status, "execution_disabled");
    assert.equal(rehearsal.reconciliation_status, "required");
    assert.equal(rehearsal.automatic_provider_replay, false);
    assert.equal(rehearsal.payment_execution_attempted, false);

    assert.rejects(
      () =>
        rehearseEnvironmentRestore({
          backupPath: backup,
          destination: join(work, "restore", "live.sqlite"),
          environmentConfig: environmentConfig("live"),
          artifactReference: artifact,
          configurationSha256: configHash,
        }),
      (error) => error.code === "backup_environment_mismatch",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("backup verification rejects database and manifest tampering", async () => {
  const work = mkdtempSync(join(tmpdir(), "bu2-env06-tamper-"));
  try {
    const config = environmentConfig("live");
    const source = join(work, "source.sqlite");
    const backup = join(work, "backup.sqlite");
    const ledger = new SqliteLedger(source, { environmentConfig: config });
    await createEnvironmentBackup({
      ledger,
      destination: backup,
      environmentConfig: config,
      artifactReference: artifact,
      configurationSha256: configHash,
      backupScope: "bu2-live",
      backupId: "bkp_live_tamper",
    });
    ledger.close();

    const original = readFileSync(backup);
    writeFileSync(backup, Buffer.concat([original, Buffer.from("tamper")]));
    await assert.rejects(
      () =>
        verifyEnvironmentBackup({
          backupPath: backup,
          expectedEnvironment: "live",
          expectedArtifactReference: artifact,
        }),
      (error) => error.code === "backup_database_digest_mismatch",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("operational snapshot is redacted and separates attention from blocking drift", async () => {
  const work = mkdtempSync(join(tmpdir(), "bu2-env06-monitor-"));
  try {
    const config = environmentConfig("sandbox");
    const ledger = new SqliteLedger(join(work, "source.sqlite"), {
      environmentConfig: config,
    });
    const missing = createOperationalSnapshot({
      ledger,
      environmentConfig: config,
      artifactReference: artifact,
      expectedConfigurationSha256: configHash,
      actualConfigurationSha256: configHash,
      maxBackupAgeSeconds: 3_600,
      now: 5_000,
    });
    assert.equal(missing.operational_status, "attention_required");
    assert.deepEqual(missing.attention_conditions, ["backup_missing"]);

    const backup = join(work, "backup.sqlite");
    const manifest = await createEnvironmentBackup({
      ledger,
      destination: backup,
      environmentConfig: config,
      artifactReference: artifact,
      configurationSha256: configHash,
      backupScope: "bu2-sandbox",
      backupId: "bkp_monitor",
      createdAt: 5_000,
    });
    const healthy = createOperationalSnapshot({
      ledger,
      environmentConfig: config,
      artifactReference: artifact,
      expectedConfigurationSha256: configHash,
      actualConfigurationSha256: configHash,
      backupManifest: manifest,
      maxBackupAgeSeconds: 3_600,
      now: 6_000,
    });
    assert.equal(healthy.operational_status, "healthy");
    assert.equal(JSON.stringify(healthy).includes(ledger.path), false);

    const drifted = createOperationalSnapshot({
      ledger,
      environmentConfig: config,
      artifactReference: artifact,
      expectedConfigurationSha256: configHash,
      actualConfigurationSha256: createHash("sha256").update("drift").digest("hex"),
      backupManifest: manifest,
      maxBackupAgeSeconds: 3_600,
      now: 6_000,
    });
    assert.equal(drifted.operational_status, "blocked");
    assert.deepEqual(drifted.blocked_conditions, ["configuration_drift"]);
    assert.equal(drifted.payment_execution_ready, false);
    ledger.close();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("deployment fingerprint is deterministic", () => {
  assert.equal(
    deploymentConfigurationSha256(resolvedCompose()),
    deploymentConfigurationSha256(structuredClone(resolvedCompose())),
  );
});

test("operations CLI creates, verifies and rehearses a backup with JSON-only results", () => {
  const work = mkdtempSync(join(tmpdir(), "bu2-env06-cli-"));
  const cli = fileURLToPath(new URL("./operations-cli.mjs", import.meta.url));
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
  try {
    const database = join(work, "source.sqlite");
    const backup = join(work, "backup.sqlite");
    const restored = join(work, "restored.sqlite");
    const restoreReport = join(work, "restore-report.json");
    const ledger = new SqliteLedger(database, {
      environmentConfig: environmentConfig("sandbox"),
    });
    recordAccessFact(ledger, "sandbox");
    ledger.close();

    const backupResult = run([
      "backup",
      "--environment",
      "sandbox",
      "--database",
      database,
      "--destination",
      backup,
      "--artifact",
      artifact,
      "--configuration-sha256",
      configHash,
    ]);
    assert.equal(backupResult.status, 0, backupResult.stderr);
    assert.equal(JSON.parse(backupResult.stdout).environment, "sandbox");

    const verifyResult = run([
      "verify",
      "--environment",
      "sandbox",
      "--backup",
      backup,
      "--artifact",
      artifact,
      "--configuration-sha256",
      configHash,
    ]);
    assert.equal(verifyResult.status, 0, verifyResult.stderr);
    assert.equal(JSON.parse(verifyResult.stdout).valid, true);

    const restoreResult = run([
      "restore-rehearsal",
      "--environment",
      "sandbox",
      "--backup",
      backup,
      "--destination",
      restored,
      "--artifact",
      artifact,
      "--configuration-sha256",
      configHash,
      "--report",
      restoreReport,
    ]);
    assert.equal(restoreResult.status, 0, restoreResult.stderr);
    const report = JSON.parse(restoreResult.stdout);
    assert.equal(report.execution_status, "execution_disabled");
    assert.equal(report.payment_execution_attempted, false);
    assert.equal(JSON.parse(readFileSync(restoreReport, "utf8")).restore_id, report.restore_id);

    const refusedRestore = join(work, "restore-must-not-exist.sqlite");
    const existingReport = join(work, "existing-report.json");
    writeFileSync(existingReport, "retained evidence\n", "utf8");
    const refused = run([
      "restore-rehearsal",
      "--environment",
      "sandbox",
      "--backup",
      backup,
      "--destination",
      refusedRestore,
      "--artifact",
      artifact,
      "--configuration-sha256",
      configHash,
      "--report",
      existingReport,
    ]);
    assert.equal(refused.status, 1);
    assert.equal(JSON.parse(refused.stderr).error.code, "operations_evidence_exists");
    assert.equal(existsSync(refusedRestore), false);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
