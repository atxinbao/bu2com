import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  Bu2McpToolError,
  connectBu2McpClient,
} from "./external-agents/mcp-client.mjs";
import {
  BU2_MCP_CAPABILITY_NAMESPACE,
  bu2McpCapability,
  expectedEnvironmentInfo,
  mcpContract,
  mcpContractSha256,
  preflightBu2Endpoint,
  validateBu2McpHandshake,
} from "./external-agents/mcp-runtime.mjs";
import { listen } from "./server.mjs";
import { credentialMetadata } from "./access-control.mjs";

const cliPath = fileURLToPath(new URL("./bin/bu2-mcp.mjs", import.meta.url));
const TEST_API_KEY = `test-${"m".repeat(40)}`;

function cliEnvironment(overrides = {}) {
  const environment = { ...process.env };
  delete environment.BU2_ENDPOINT;
  delete environment.BU2_SANDBOX_URL;
  delete environment.BU2_ENVIRONMENT;
  delete environment.BU2_LOCAL_DEVELOPMENT;
  delete environment.BU2_API_KEY;
  return { ...environment, ...overrides };
}

function runCli(args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: cliEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function closeRunning(running, mcp) {
  await mcp?.close();
  await new Promise((resolve) => running.server.close(resolve));
  running.ledger.close();
}

test("stable MCP CLI exposes deterministic version and capability metadata", async () => {
  const result = await runCli(["--metadata"], {
    BU2_ENVIRONMENT: "local",
    BU2_LOCAL_DEVELOPMENT: "true",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.server.name, mcpContract.name);
  assert.equal(metadata.server.version, mcpContract.version);
  assert.equal(metadata.capability_namespace, BU2_MCP_CAPABILITY_NAMESPACE);
  assert.equal(metadata.capability.mcp_contract_sha256, mcpContractSha256);
  assert.equal(metadata.capability.environment, "local");
  assert.equal(metadata.capability.environment_contract_version, "1.0");
  assert.equal(metadata.capability.local_development, true);
  assert.equal(metadata.capability.automatic_mutation_retry, false);
  assert.equal(metadata.capability.agent_authorization_tool, false);
  assert.equal(metadata.capability.agent_settlement_tool, false);
  assert.deepEqual(
    metadata.tool_names,
    mcpContract.tools.map(({ name }) => name),
  );
});

test("stable MCP CLI preflights the endpoint before opening stdio", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => closeRunning(running));
  const result = await runCli(["--preflight"], {
    BU2_ENDPOINT: running.url,
    BU2_ENVIRONMENT: "local",
    BU2_LOCAL_DEVELOPMENT: "true",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const preflight = JSON.parse(result.stdout);
  assert.equal(preflight.status, "compatible");
  assert.equal(preflight.environment, "local");
  assert.equal(preflight.api_contract_version, "0.3.0");
  assert.equal(preflight.environment_contract_version, "1.0");
  assert.equal(preflight.mcp_contract_version, mcpContract.version);
});

test("MCP initialize handshake exposes and validates BU2 compatibility", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  let mcp;
  context.after(() => closeRunning(running, mcp));
  mcp = await connectBu2McpClient({ baseUrl: running.url });
  assert.equal(mcp.handshake.server.name, mcpContract.name);
  assert.equal(mcp.handshake.server.version, mcpContract.version);
  assert.equal(mcp.handshake.capability.api_contract_version, "0.3.0");
  assert.equal(mcp.handshake.capability.environment, "local");
  assert.equal(mcp.handshake.capability.chain_id, null);
  assert.equal(mcp.handshake.capability.mcp_contract_sha256, mcpContractSha256);
  assert.equal((await mcp.listTools()).length, 6);
});

test("MCP authenticates private Agent tools while keeping environment preflight public", async (context) => {
  const token = `test-${"a".repeat(40)}`;
  const credential = credentialMetadata(
    {
      token,
      id: "key_mcp_agent",
      tenant_id: "ten_mcp",
      principal_id: "usr_mcp_agent",
      role: "agent",
      account_ids: ["acct_mcp_seller"],
      agent_ids: ["agt_mcp_seller"],
    },
    "local",
  );
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify([credential]),
  });
  let mcp;
  context.after(() => closeRunning(running, mcp));
  mcp = await connectBu2McpClient({ baseUrl: running.url, apiKey: token });

  const quote = await mcp.call("bu2_create_quote", {
    seller_agent_id: "agt_mcp_seller",
    payee_account_id: "acct_mcp_seller",
    item_name: "Authenticated MCP dataset",
    delivery_type: "dataset_access",
    amount_value: 100,
    currency: "USD",
    expires_at: "2099-09-06T12:00:00Z",
    idempotency_key: "mcp-authenticated-quote",
  });
  assert.match(quote.id, /^quo_/);
  assert.equal(running.ledger.accessDecisionSummary("local").allowed > 0, true);
});

test("MCP rechecks execution status before a mutation and fails closed", async (context) => {
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    environment: "sandbox",
    adapterMode: "x402",
    executionStatus: "execution_disabled",
  });
  let mcp;
  context.after(() => closeRunning(running, mcp));
  mcp = await connectBu2McpClient({
    baseUrl: running.url,
    environment: "sandbox",
    localDevelopment: false,
    apiKey: TEST_API_KEY,
  });

  await assert.rejects(
    mcp.call("bu2_create_quote", {
      seller_agent_id: "agt_mcp_disabled",
      payee_account_id: "acct_mcp_disabled",
      item_name: "Disabled environment",
      delivery_type: "dataset_access",
      amount_value: 100,
      currency: "USD",
      expires_at: "2099-09-06T12:00:00Z",
      idempotency_key: "mcp-disabled-quote",
    }),
    (error) => {
      assert.ok(error instanceof Bu2McpToolError);
      assert.equal(
        error.result.structuredContent.error.code,
        "environment_execution_disabled",
      );
      return true;
    },
  );
  assert.equal(running.sandbox.quotes.size, 0);
});

test("MCP handshake validation rejects an unexpected configured environment", () => {
  const capability = bu2McpCapability({
    ...expectedEnvironmentInfo("local"),
    receipt_issuer: {
      ...expectedEnvironmentInfo("local").receipt_issuer,
      verification_key_id: "key_mcp_local",
    },
  });
  assert.throws(
    () =>
      validateBu2McpHandshake(
        { name: mcpContract.name, version: mcpContract.version },
        {
          experimental: {
            [BU2_MCP_CAPABILITY_NAMESPACE]: capability,
          },
        },
        "sandbox",
      ),
    (error) => error.code === "mcp_capability_mismatch",
  );
});

test("stable MCP CLI rejects an incompatible API before starting stdio", async (context) => {
  const server = createServer((_request, response) => {
    response.setHeader("x-request-id", "req_mcp_preflight");
    response.setHeader("x-trace-id", "trc_mcp_preflight");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        service: "bu2-reference-server",
        api_contract_version: "0.0.0",
        mcp_contract_versions: [mcpContract.version],
        ...expectedEnvironmentInfo("local"),
        api_contract_version: "0.0.0",
        receipt_issuer: {
          issuer_id: "bu2-reference-server:local",
          environment: "local",
          verification_key_id: "key_mcp_preflight",
          signature_algorithm: "Ed25519",
          public_key: "mcp-test-public-key",
        },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const result = await runCli(["--preflight"], {
    BU2_ENDPOINT: `http://127.0.0.1:${address.port}`,
    BU2_ENVIRONMENT: "local",
    BU2_LOCAL_DEVELOPMENT: "true",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.event, "bu2.mcp.startup.failed");
  assert.equal(error.code, "api_contract_version_mismatch");
  assert.equal(error.recovery, "fix_configuration");
  assert.equal(error.details.request_id, "req_mcp_preflight");
  assert.equal(error.details.trace_id, "trc_mcp_preflight");
});

test("preflight rejects environment and MCP contract mismatches", async () => {
  const info = {
    service: "bu2-reference-server",
    api_contract_version: "0.3.0",
    mcp_contract_versions: [mcpContract.version],
    ...expectedEnvironmentInfo("local"),
    receipt_issuer: {
      issuer_id: "bu2-reference-server:local",
      environment: "local",
      verification_key_id: "key_mcp_preflight",
      signature_algorithm: "Ed25519",
      public_key: "mcp-test-public-key",
    },
  };
  await assert.rejects(
    () =>
      preflightBu2Endpoint(
        { endpoint: "http://127.0.0.1:3100", environment: "sandbox" },
        { fetchImpl: async () => Response.json(info) },
      ),
    (error) => error.code === "environment_mismatch",
  );
  await assert.rejects(
    () =>
      preflightBu2Endpoint(
        { endpoint: "http://127.0.0.1:3100", environment: "local" },
        {
          fetchImpl: async () =>
            Response.json({ ...info, environment_contract_version: "0.0" }),
        },
      ),
    (error) => error.code === "environment_contract_mismatch",
  );
  await assert.rejects(
    () =>
      preflightBu2Endpoint(
        { endpoint: "http://127.0.0.1:3100", environment: "local" },
        {
          fetchImpl: async () =>
            Response.json({
              ...info,
              receipt_issuer: { ...info.receipt_issuer, signature_algorithm: "unknown" },
            }),
        },
      ),
    (error) =>
      error.code === "environment_contract_mismatch" &&
      error.details.mismatches.includes("receipt_issuer.signature_algorithm"),
  );
});

test("stable MCP CLI rejects legacy and network-name environments before startup", async () => {
  const result = await runCli(["--metadata"], { BU2_ENVIRONMENT: "testnet" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "environment_invalid");
  assert.equal(error.recovery, "fix_configuration");
});

test("stable MCP CLI requires an API key for Sandbox and Live configuration", async () => {
  const result = await runCli(["--metadata"], {
    BU2_ENVIRONMENT: "sandbox",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "credential_required");
  assert.equal(error.recovery, "fix_configuration");
  assert.equal(result.stderr.includes(TEST_API_KEY), false);
});

test("MCP endpoint preflight remains public and refuses redirects", async () => {
  let requestOptions;
  await preflightBu2Endpoint(
    {
      endpoint: "https://sandbox.example.test",
      environment: "sandbox",
      apiKey: TEST_API_KEY,
    },
    {
      fetchImpl: async (_url, options) => {
        requestOptions = options;
        return Response.json({
          service: "bu2-reference-server",
          mcp_contract_versions: [mcpContract.version],
          ...expectedEnvironmentInfo("sandbox"),
          receipt_issuer: {
            ...expectedEnvironmentInfo("sandbox").receipt_issuer,
            verification_key_id: "key_mcp_public_preflight",
            signature_algorithm: "Ed25519",
            public_key: "mcp-public-preflight-key",
          },
        });
      },
    },
  );
  assert.equal(requestOptions.headers.authorization, undefined);
  assert.equal(requestOptions.redirect, "error");
});

test("Host configuration examples point to the stable bounded stdio entry", () => {
  const codex = readFileSync(
    new URL("../integrations/mcp/codex-config.toml.example", import.meta.url),
    "utf8",
  );
  const jsonFiles = [
    "../integrations/mcp/claude-desktop-config.json.example",
    "../integrations/mcp/generic-stdio-config.json.example",
  ];
  assert.match(codex, /^\[mcp_servers\.bu2-local\]/m);
  assert.match(codex, /sandbox\/bin\/bu2-mcp\.mjs/);
  assert.match(codex, /BU2_ENVIRONMENT = "local"/);
  assert.match(codex, /BU2_LOCAL_DEVELOPMENT = "true"/);
  for (const path of jsonFiles) {
    const configuration = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const server = configuration.mcpServers["bu2-local"];
    assert.equal(server.type ?? "stdio", "stdio");
    assert.equal(server.command, "node");
    assert.match(server.args[0], /sandbox\/bin\/bu2-mcp\.mjs$/);
    assert.equal(server.env.BU2_ENDPOINT, "http://127.0.0.1:3100");
    assert.equal(server.env.BU2_ENVIRONMENT, "local");
    assert.equal(server.env.BU2_LOCAL_DEVELOPMENT, "true");
    assert.equal(
      server.args.some((value) => /mainnet/i.test(value)),
      false,
    );
  }
});
