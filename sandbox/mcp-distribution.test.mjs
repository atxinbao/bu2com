import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import { connectBu2McpClient } from "./external-agents/mcp-client.mjs";
import {
  BU2_MCP_CAPABILITY_NAMESPACE,
  mcpContract,
  mcpContractSha256,
  preflightBu2Endpoint,
  validateBu2McpHandshake,
} from "./external-agents/mcp-runtime.mjs";
import { listen } from "./server.mjs";

const cliPath = fileURLToPath(new URL("./bin/bu2-mcp.mjs", import.meta.url));

function cliEnvironment(overrides = {}) {
  const environment = { ...process.env };
  delete environment.BU2_ENDPOINT;
  delete environment.BU2_SANDBOX_URL;
  delete environment.BU2_ENVIRONMENT;
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
  const result = await runCli(["--metadata"], { BU2_ENVIRONMENT: "simulation" });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.server.name, mcpContract.name);
  assert.equal(metadata.server.version, mcpContract.version);
  assert.equal(metadata.capability_namespace, BU2_MCP_CAPABILITY_NAMESPACE);
  assert.equal(metadata.capability.mcp_contract_sha256, mcpContractSha256);
  assert.equal(metadata.capability.environment, "simulation");
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
    BU2_ENVIRONMENT: "simulation",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const preflight = JSON.parse(result.stdout);
  assert.equal(preflight.status, "compatible");
  assert.equal(preflight.environment, "simulation");
  assert.equal(preflight.api_contract_version, "0.1.3");
  assert.equal(preflight.mcp_contract_version, mcpContract.version);
});

test("MCP initialize handshake exposes and validates BU2 compatibility", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  let mcp;
  context.after(() => closeRunning(running, mcp));
  mcp = await connectBu2McpClient({ baseUrl: running.url });
  assert.equal(mcp.handshake.server.name, mcpContract.name);
  assert.equal(mcp.handshake.server.version, mcpContract.version);
  assert.equal(mcp.handshake.capability.api_contract_version, "0.1.3");
  assert.equal(mcp.handshake.capability.environment, "simulation");
  assert.equal(mcp.handshake.capability.mcp_contract_sha256, mcpContractSha256);
  assert.equal((await mcp.listTools()).length, 6);
});

test("MCP handshake validation rejects an unexpected configured environment", () => {
  assert.throws(
    () =>
      validateBu2McpHandshake(
        { name: mcpContract.name, version: mcpContract.version },
        {
          experimental: {
            [BU2_MCP_CAPABILITY_NAMESPACE]: {
              api_contract_version: "0.1.3",
              api_base_path: "/v1",
              mcp_contract_version: mcpContract.version,
              mcp_contract_sha256: mcpContractSha256,
              environment: "simulation",
              supported_environments: ["simulation", "testnet"],
              transport: "stdio",
              tool_count: 6,
              automatic_mutation_retry: false,
              agent_authorization_tool: false,
              agent_settlement_tool: false,
            },
          },
        },
        "testnet",
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
        status: "ok",
        service: "bu2-reference-server",
        version: "0.0.0",
        api_contract_version: "0.0.0",
        api_base_path: "/v1",
        mcp_contract_versions: [mcpContract.version],
        environment: "simulation",
        adapter: "bu2_simulated_provider",
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const result = await runCli(["--preflight"], {
    BU2_ENDPOINT: `http://127.0.0.1:${address.port}`,
    BU2_ENVIRONMENT: "simulation",
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
  const health = {
    status: "ok",
    service: "bu2-reference-server",
    version: "0.8.0",
    api_contract_version: "0.1.3",
    api_base_path: "/v1",
    mcp_contract_versions: [mcpContract.version],
    environment: "simulation",
    adapter: "bu2_simulated_provider",
  };
  await assert.rejects(
    () =>
      preflightBu2Endpoint(
        { endpoint: "http://127.0.0.1:3100", environment: "testnet" },
        { fetchImpl: async () => Response.json(health) },
      ),
    (error) => error.code === "environment_mismatch",
  );
  await assert.rejects(
    () =>
      preflightBu2Endpoint(
        { endpoint: "http://127.0.0.1:3100", environment: "simulation" },
        {
          fetchImpl: async () => Response.json({ ...health, mcp_contract_versions: ["0.0.0"] }),
        },
      ),
    (error) => error.code === "mcp_contract_version_unsupported",
  );
});

test("stable MCP CLI rejects Mainnet configuration before startup", async () => {
  const result = await runCli(["--metadata"], { BU2_ENVIRONMENT: "mainnet" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "environment_invalid");
  assert.equal(error.recovery, "fix_configuration");
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
  assert.match(codex, /^\[mcp_servers\.bu2-simulation\]/m);
  assert.match(codex, /sandbox\/bin\/bu2-mcp\.mjs/);
  assert.match(codex, /BU2_ENVIRONMENT = "simulation"/);
  for (const path of jsonFiles) {
    const configuration = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const server = configuration.mcpServers["bu2-simulation"];
    assert.equal(server.type ?? "stdio", "stdio");
    assert.equal(server.command, "node");
    assert.match(server.args[0], /sandbox\/bin\/bu2-mcp\.mjs$/);
    assert.equal(server.env.BU2_ENDPOINT, "http://127.0.0.1:3100");
    assert.equal(server.env.BU2_ENVIRONMENT, "simulation");
    assert.equal(
      server.args.some((value) => /mainnet/i.test(value)),
      false,
    );
  }
});
