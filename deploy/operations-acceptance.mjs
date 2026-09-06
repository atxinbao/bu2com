import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const composeFile = join(here, "compose.yaml");
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const imageTag = `bu2-env06-${runId}:acceptance`;
const work = mkdtempSync(join(tmpdir(), "bu2-env06-"));
const iidFile = join(work, "image-id");

const command = (program, args, options = {}) =>
  execFileSync(program, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env,
  });

const config = (environment) =>
  loadEnvironmentConfig(
    {
      environment,
      paymentAdapter: "x402",
      executionStatus: "execution_disabled",
    },
    {},
  );

const recordFact = (ledger, environment) =>
  ledger.recordAccessDecision({
    id: `acd_${environment}_${runId}`,
    environment,
    credential_id: "key_acceptance",
    tenant_id: "ten_acceptance",
    principal_id: "agt_acceptance",
    role: "agent",
    permission: "transactions:read",
    method: "GET",
    path: "/v1/transactions",
    resource_id: null,
    outcome: "allowed",
    reason_code: "authorized",
    request_id: `req_${runId}`,
    trace_id: `trc_${runId}`,
    created_at: new Date().toISOString(),
  });

let imageId = null;
const openLedgers = {};
try {
  const dirty = command("git", ["status", "--porcelain"]).trim();
  assert.equal(dirty, "", "ENV-06 acceptance must bind a clean committed source tree.");
  const sourceCommit = command("git", ["rev-parse", "HEAD"]).trim();
  command("docker", [
    "build",
    "--file",
    join(here, "Dockerfile"),
    "--tag",
    imageTag,
    "--iidfile",
    iidFile,
    root,
  ]);
  imageId = readFileSync(iidFile, "utf8").trim();
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const composeEnvironment = { ...process.env, BU2_ARTIFACT_IMAGE: imageId };
  const resolvedCompose = JSON.parse(
    command(
      "docker",
      ["compose", "--file", composeFile, "--profile", "live", "config", "--format", "json"],
      { env: composeEnvironment },
    ),
  );
  const configurationSha256 = deploymentConfigurationSha256(resolvedCompose);
  const backups = {};
  const verifications = {};
  const restores = {};
  const snapshots = {};

  for (const environment of ["sandbox", "live"]) {
    const environmentConfig = config(environment);
    const database = join(work, environment, "source.sqlite");
    const backupPath = join(work, environment, "backups", "snapshot.sqlite");
    const restorePath = join(work, environment, "restore", "rehearsal.sqlite");
    const ledger = new SqliteLedger(database, { environmentConfig });
    openLedgers[environment] = ledger;
    recordFact(ledger, environment);
    backups[environment] = await createEnvironmentBackup({
      ledger,
      destination: backupPath,
      environmentConfig,
      artifactReference: imageId,
      configurationSha256,
      backupScope: `bu2-${environment}`,
      backupId: `bkp_${environment}_${runId}`,
    });
    verifications[environment] = await verifyEnvironmentBackup({
      backupPath,
      expectedEnvironment: environment,
      expectedArtifactReference: imageId,
      expectedConfigurationSha256: configurationSha256,
    });
    restores[environment] = await rehearseEnvironmentRestore({
      backupPath,
      destination: restorePath,
      environmentConfig,
      artifactReference: imageId,
      configurationSha256,
      restoreId: `rst_${environment}_${runId}`,
    });
    snapshots[environment] = createOperationalSnapshot({
      ledger,
      environmentConfig,
      artifactReference: imageId,
      expectedConfigurationSha256: configurationSha256,
      actualConfigurationSha256: configurationSha256,
      backupManifest: backups[environment],
      maxBackupAgeSeconds: 3_600,
    });
    assert.equal(snapshots[environment].operational_status, "healthy");
  }

  let crossEnvironmentRestore;
  try {
    await rehearseEnvironmentRestore({
      backupPath: join(work, "sandbox", "backups", "snapshot.sqlite"),
      destination: join(work, "cross-environment.sqlite"),
      environmentConfig: config("live"),
      artifactReference: imageId,
      configurationSha256,
    });
    crossEnvironmentRestore = "unexpected_success";
  } catch (error) {
    crossEnvironmentRestore = error.code;
  }
  assert.equal(crossEnvironmentRestore, "backup_environment_mismatch");

  const drifted = createOperationalSnapshot({
    ledger: openLedgers.live,
    environmentConfig: config("live"),
    artifactReference: imageId,
    expectedConfigurationSha256: configurationSha256,
    actualConfigurationSha256: "d".repeat(64),
    backupManifest: backups.live,
    maxBackupAgeSeconds: 3_600,
  });
  assert.equal(drifted.operational_status, "blocked");

  const promotion = createPromotionManifest({
    sourceCommit,
    artifactReference: imageId,
    resolvedCompose,
    databaseSchemaVersion: openLedgers.sandbox.schemaVersion(),
    gateEvidence: {
      local_contract: "passed",
      isolated_deployment: "passed",
      backup_restore_rehearsal: "passed",
    },
  });
  assert.equal(verifyPromotionManifest(promotion, resolvedCompose).valid, true);

  for (const [environment, ledger] of Object.entries(openLedgers)) {
    ledger.close();
    delete openLedgers[environment];
  }
  const evidence = {
    schema_version: "1.0",
    run_id: runId,
    source_commit: sourceCommit,
    artifact: {
      image_id: imageId,
      same_digest_for_sandbox_and_live: true,
      hosted_deployment_authorized: promotion.authorization.hosted_deployment,
      payment_execution_authorized: promotion.authorization.payment_execution,
    },
    backup: Object.fromEntries(
      Object.entries(backups).map(([environment, manifest]) => [
        environment,
        {
          backup_id: manifest.backup_id,
          scope: manifest.backup_scope,
          schema_version: manifest.database.schema_version,
          integrity: verifications[environment].database.integrity,
          fact_counts: manifest.database.fact_counts,
        },
      ]),
    ),
    restore: Object.fromEntries(
      Object.entries(restores).map(([environment, rehearsal]) => [
        environment,
        {
          execution_status: rehearsal.execution_status,
          reconciliation_status: rehearsal.reconciliation_status,
          automatic_provider_replay: rehearsal.automatic_provider_replay,
          payment_execution_attempted: rehearsal.payment_execution_attempted,
        },
      ]),
    ),
    monitoring: {
      sandbox: snapshots.sandbox.operational_status,
      live: snapshots.live.operational_status,
      configuration_drift: drifted.operational_status,
    },
    fault_injection: {
      cross_environment_restore: "rejected_before_copy",
      cross_environment_error: crossEnvironmentRestore,
      configuration_drift: "blocked",
    },
    secrets_loaded: false,
    signer_loaded: false,
    payment_execution_attempted: false,
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  for (const ledger of Object.values(openLedgers)) ledger.close();
  if (imageId) {
    spawnSync("docker", ["image", "rm", "--force", imageTag], { stdio: "ignore" });
  }
  rmSync(work, { recursive: true, force: true });
}
