#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const usage = `BU2 identity onboarding

Commands:
  bootstrap <document.json>   Persist Principal/Account/Agent ownership and credential digests.
  inspect [tenant_id]         Read persisted ownership without credential material.

Options:
  --database <path>           SQLite database path (default: sandbox/data/bu2-sandbox.sqlite)
  --environment <name>        local or sandbox (default: document environment or local)
  --claim-legacy              Explicitly claim an existing unbound database environment
`;

const argumentValue = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

const hasFlag = (args, name) => args.includes(name);

function readDocument(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read onboarding document: ${error.message}`);
  }
}

function configFor(environment) {
  return loadEnvironmentConfig({
    environment,
    paymentAdapter: environment === "local" ? "simulated" : "x402",
    executionStatus: "execution_disabled",
  });
}

function databasePath(args) {
  return argumentValue(args, "--database") ?? fileURLToPath(new URL("./data/bu2-sandbox.sqlite", import.meta.url));
}

async function run(args) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (["--database", "--environment"].includes(value)) {
      index += 1;
      continue;
    }
    if (value === "--claim-legacy") continue;
    positional.push(value);
  }
  const [command, documentPath] = positional;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage);
    return;
  }
  const document = command === "bootstrap" ? readDocument(documentPath) : null;
  const environment =
    argumentValue(args, "--environment") ?? document?.environment ?? process.env.BU2_ENVIRONMENT ?? "local";
  const config = configFor(environment);
  const ledger = new SqliteLedger(databasePath(args), {
    environmentConfig: config,
    claimLegacyEnvironment: hasFlag(args, "--claim-legacy"),
  });
  try {
    if (command === "bootstrap") {
      const normalized = normalizeOnboardingDocument(document, environment);
      const result = ledger.bootstrapIdentityTenants(normalized);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (command === "inspect") {
      const tenantId = documentPath ?? null;
      const rows = tenantId
        ? [ledger.identityBundle(environment, tenantId)]
        : ledger.identityTenants(environment);
      process.stdout.write(`${JSON.stringify({ environment, identities: rows }, null, 2)}\n`);
      return;
    }
    throw new Error(`Unknown onboarding command: ${command}\n\n${usage}`);
  } finally {
    ledger.close();
  }
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error: {
        code: error.code ?? "onboarding_failed",
        message: error.message,
        details: error.details ?? {},
      },
    })}\n`,
  );
  process.exitCode = 1;
}
