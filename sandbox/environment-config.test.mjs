import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ENVIRONMENT_REGISTRY,
  EXECUTION_DISABLED,
  EXECUTION_ENABLED,
  loadEnvironmentConfig,
  verifyRpcChain,
} from "./environment-config.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { listen } from "./server.mjs";
import { X402PaymentAdapter } from "./x402-adapter.mjs";

const isolatedConfig = (overrides) => loadEnvironmentConfig(overrides, {});

test("environment registry exposes only the approved local, Sandbox, and Live combinations", () => {
  assert.deepEqual(Object.keys(ENVIRONMENT_REGISTRY), ["local", "sandbox", "live"]);
  assert.deepEqual(isolatedConfig({}), {
    environment_contract_version: "1.0",
    environment: "local",
    payment_adapter: "simulated",
    chain_id: null,
    network: null,
    asset: null,
    asset_decimals: null,
    execution_status: EXECUTION_ENABLED,
    signer_environment: null,
    provider_network: null,
    provider_scheme: null,
    rpc_chain_id: null,
  });
  const sandbox = isolatedConfig({ environment: "sandbox", paymentAdapter: "x402" });
  assert.equal(sandbox.chain_id, 84532);
  assert.equal(sandbox.network, "eip155:84532");
  assert.equal(sandbox.execution_status, EXECUTION_DISABLED);
  const live = isolatedConfig({ environment: "live", paymentAdapter: "x402" });
  assert.equal(live.chain_id, 8453);
  assert.equal(live.network, "eip155:8453");
  assert.equal(live.execution_status, EXECUTION_DISABLED);
});

test("E-T01 and E-T02 reject cross-chain Sandbox and Live configuration before execution", async () => {
  let providerCalls = 0;
  await assert.rejects(
    listen({
      port: 0,
      dbPath: ":memory:",
      environment: "sandbox",
      adapterMode: "x402",
      chainId: 8453,
      executionStatus: EXECUTION_ENABLED,
      signerEnvironment: "sandbox",
      x402PaidFetch: async () => {
        providerCalls += 1;
      },
    }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("chain_id"),
  );
  await assert.rejects(
    listen({
      port: 0,
      dbPath: ":memory:",
      environment: "live",
      adapterMode: "x402",
      chainId: 84532,
    }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("chain_id"),
  );
  assert.equal(providerCalls, 0);
});

test("E-T03 rejects simulated deployments and missing environment for x402", () => {
  assert.throws(
    () => isolatedConfig({ environment: "sandbox", paymentAdapter: "simulated" }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("payment_adapter"),
  );
  assert.throws(
    () => isolatedConfig({ environment: "live", paymentAdapter: "simulated" }),
    (error) => error.code === "environment_binding_mismatch",
  );
  assert.throws(
    () => isolatedConfig({ paymentAdapter: "x402" }),
    (error) => error.code === "environment_required",
  );
});

test("Provider, asset, signer, and RPC bindings reject mismatched environments", async () => {
  assert.throws(
    () =>
      isolatedConfig({
        environment: "sandbox",
        paymentAdapter: "x402",
        providerNetwork: "eip155:8453",
      }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("provider_network"),
  );
  assert.throws(
    () =>
      isolatedConfig({
        environment: "sandbox",
        paymentAdapter: "x402",
        asset: ENVIRONMENT_REGISTRY.live.asset,
      }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("asset"),
  );
  assert.throws(
    () =>
      isolatedConfig({
        environment: "sandbox",
        paymentAdapter: "x402",
        signerEnvironment: "live",
      }),
    (error) =>
      error.code === "environment_binding_mismatch" &&
      error.details.mismatches.includes("signer_environment"),
  );

  let failoverChecks = 0;
  const sandbox = isolatedConfig({ environment: "sandbox", paymentAdapter: "x402" });
  await assert.rejects(
    verifyRpcChain(sandbox, async () => {
      failoverChecks += 1;
      return 8453;
    }),
    (error) => error.code === "rpc_chain_mismatch",
  );
  assert.equal(failoverChecks, 1);
});

test("E-T07 binds a new database immutably and rejects a database from another environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-env-binding-"));
  const path = join(directory, "bu2.sqlite");
  const local = isolatedConfig({});
  const sandbox = isolatedConfig({ environment: "sandbox", paymentAdapter: "x402" });
  try {
    const ledger = new SqliteLedger(path, { environmentConfig: local });
    assert.deepEqual(
      {
        environment: ledger.environmentMetadata().environment,
        payment_adapter: ledger.environmentMetadata().payment_adapter,
        binding_method: ledger.environmentMetadata().binding_method,
      },
      { environment: "local", payment_adapter: "simulated", binding_method: "initial" },
    );
    assert.throws(
      () => ledger.db.exec("UPDATE environment_metadata SET environment='sandbox'"),
      /environment_metadata_immutable/,
    );
    ledger.close();

    assert.throws(
      () => new SqliteLedger(path, { environmentConfig: sandbox }),
      (error) => error.code === "database_environment_mismatch",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy database binding requires an explicit one-time environment claim", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-env-legacy-"));
  const path = join(directory, "legacy.sqlite");
  const local = isolatedConfig({});
  try {
    new SqliteLedger(path).close();
    assert.throws(
      () => new SqliteLedger(path, { environmentConfig: local }),
      (error) => error.code === "legacy_database_environment_unclaimed",
    );
    const claimed = new SqliteLedger(path, {
      environmentConfig: local,
      claimLegacyEnvironment: true,
    });
    assert.equal(claimed.environmentMetadata().binding_method, "legacy_claim");
    claimed.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("E-T09 keeps Live disarmed and makes zero merchant or signer calls", async () => {
  let merchantCalls = 0;
  let signerCalls = 0;
  const adapter = new X402PaymentAdapter({
    ledger: {},
    resourceUrl: "https://merchant.invalid/resource",
    network: ENVIRONMENT_REGISTRY.live.network,
    asset: ENVIRONMENT_REGISTRY.live.asset,
    environment: "live",
    executionStatus: EXECUTION_DISABLED,
    fetchImpl: async () => {
      merchantCalls += 1;
    },
    paidFetch: async () => {
      signerCalls += 1;
    },
  });
  await assert.rejects(
    adapter.reserve("txn_live_disabled", { value: 1, currency: "USD" }),
    (error) => error.code === "environment_execution_disabled",
  );
  await assert.rejects(
    adapter.settle("txn_live_disabled", { value: 1, currency: "USD" }),
    (error) => error.code === "environment_execution_disabled",
  );
  assert.equal(merchantCalls, 0);
  assert.equal(signerCalls, 0);
  await assert.rejects(
    listen({
      port: 0,
      dbPath: ":memory:",
      environment: "live",
      adapterMode: "x402",
      signerEnvironment: "live",
      x402BuyerPrivateKey: "0x_not_loaded",
    }),
    (error) => error.code === "signer_loading_disabled",
  );
  assert.throws(
    () =>
      isolatedConfig({
        environment: "live",
        paymentAdapter: "x402",
        executionStatus: EXECUTION_ENABLED,
      }),
    (error) => error.code === "live_execution_not_authorized",
  );
  assert.throws(
    () =>
      new X402PaymentAdapter({
        ledger: {},
        resourceUrl: "https://merchant.invalid/resource",
        network: ENVIRONMENT_REGISTRY.live.network,
        asset: ENVIRONMENT_REGISTRY.live.asset,
        environment: "live",
        executionStatus: EXECUTION_ENABLED,
      }),
    (error) => error.code === "live_execution_not_authorized",
  );
});
