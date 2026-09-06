#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvironmentConfig } from "../sandbox/environment-config.mjs";
import { SqliteLedger } from "../sandbox/persistence.mjs";
import { DEPLOYMENT_UNITS } from "./deployment-contract.mjs";
import {
  createEnvironmentBackup,
  createOperationalSnapshot,
  createPromotionManifest,
  rehearseEnvironmentRestore,
  verifyEnvironmentBackup,
} from "./operations.mjs";

const parseArguments = (values) => {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw Object.assign(new Error("Arguments must use --name value pairs."), {
        code: "operations_arguments_invalid",
      });
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
};

const required = (values, key) => {
  if (!values[key]) {
    throw Object.assign(new Error(`--${key} is required.`), {
      code: "operations_argument_required",
      details: { argument: key },
    });
  }
  return values[key];
};

const environmentConfig = (environment) =>
  loadEnvironmentConfig(
    {
      environment,
      paymentAdapter: "x402",
      executionStatus: "execution_disabled",
    },
    {},
  );

const withLedger = async (database, config, operation) => {
  if (!existsSync(database)) {
    throw Object.assign(new Error("The source database must already exist."), {
      code: "operations_database_missing",
    });
  }
  const ledger = new SqliteLedger(database, { environmentConfig: config });
  try {
    return await operation(ledger);
  } finally {
    ledger.close();
  }
};

const assertNewEvidencePath = (path) => {
  if (existsSync(path)) {
    throw Object.assign(new Error("Evidence destination must be a new file."), {
      code: "operations_evidence_exists",
    });
  }
};

const writeEvidence = (path, value) => {
  assertNewEvidencePath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return value;
};

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  const values = parseArguments(rest);
  const artifactReference = required(values, "artifact");

  if (command === "promotion-manifest") {
    const resolvedCompose = JSON.parse(
      readFileSync(required(values, "compose-json"), "utf8"),
    );
    const manifest = createPromotionManifest({
      sourceCommit: required(values, "source-commit"),
      artifactReference,
      resolvedCompose,
      databaseSchemaVersion: Number(required(values, "database-schema-version")),
      gateEvidence: {
        local_contract: required(values, "local-contract"),
        isolated_deployment: required(values, "isolated-deployment"),
        backup_restore_rehearsal: required(values, "backup-restore-rehearsal"),
      },
    });
    return writeEvidence(required(values, "destination"), manifest);
  }

  const environment = required(values, "environment");
  const config = environmentConfig(environment);

  if (command === "backup") {
    return withLedger(required(values, "database"), config, (ledger) =>
      createEnvironmentBackup({
        ledger,
        destination: required(values, "destination"),
        environmentConfig: config,
        artifactReference,
        configurationSha256: required(values, "configuration-sha256"),
        backupScope: DEPLOYMENT_UNITS.units[environment].backup_scope,
      }),
    );
  }
  if (command === "verify") {
    return verifyEnvironmentBackup({
      backupPath: required(values, "backup"),
      expectedEnvironment: environment,
      expectedArtifactReference: artifactReference,
      expectedConfigurationSha256: values["configuration-sha256"] ?? null,
    });
  }
  if (command === "restore-rehearsal") {
    const reportPath = required(values, "report");
    assertNewEvidencePath(reportPath);
    const report = await rehearseEnvironmentRestore({
      backupPath: required(values, "backup"),
      destination: required(values, "destination"),
      environmentConfig: config,
      artifactReference,
      configurationSha256: required(values, "configuration-sha256"),
    });
    return writeEvidence(reportPath, report);
  }
  if (command === "snapshot") {
    const verified = values.backup
      ? await verifyEnvironmentBackup({
          backupPath: values.backup,
          expectedEnvironment: environment,
          expectedArtifactReference: artifactReference,
          expectedConfigurationSha256: required(values, "expected-configuration-sha256"),
        })
      : null;
    const snapshot = await withLedger(required(values, "database"), config, (ledger) =>
      createOperationalSnapshot({
        ledger,
        environmentConfig: config,
        artifactReference,
        expectedConfigurationSha256: required(values, "expected-configuration-sha256"),
        actualConfigurationSha256: required(values, "actual-configuration-sha256"),
        backupManifest: verified?.manifest ?? null,
        maxBackupAgeSeconds: Number(required(values, "max-backup-age-seconds")),
      }),
    );
    return writeEvidence(required(values, "destination"), snapshot);
  }
  throw Object.assign(
    new Error(
      "Command must be promotion-manifest, backup, verify, restore-rehearsal, or snapshot.",
    ),
    { code: "operations_command_invalid" },
  );
}

try {
  const result = await run();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error: {
        code: error.code ?? "operations_failed",
        message: error.message,
        details: error.details ?? {},
      },
    })}\n`,
  );
  process.exitCode = 1;
}
