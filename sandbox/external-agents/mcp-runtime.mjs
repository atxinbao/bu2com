import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const BU2_MCP_CAPABILITY_NAMESPACE = "com.bu2.agent-payments";

export const mcpContract = JSON.parse(
  readFileSync(new URL("../../docs/03-technical/mcp-tools.json", import.meta.url), "utf8"),
);

export const contractVersions = JSON.parse(
  readFileSync(new URL("../../docs/03-technical/contract-versions.json", import.meta.url), "utf8"),
);

export const mcpContractSha256 = createHash("sha256")
  .update(JSON.stringify(mcpContract))
  .digest("hex");

export class Bu2McpCompatibilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "Bu2McpCompatibilityError";
    this.code = code;
    this.details = details;
    this.recovery = "fix_configuration";
  }
}

function normalizeEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Bu2McpCompatibilityError(
      "endpoint_invalid",
      "BU2_ENDPOINT must be an absolute HTTP(S) URL.",
    );
  }
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Bu2McpCompatibilityError("endpoint_invalid", "BU2_ENDPOINT must use HTTP or HTTPS.");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Bu2McpCompatibilityError(
      "endpoint_invalid",
      "BU2_ENDPOINT must not contain credentials, query parameters, or fragments.",
    );
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return endpoint.toString().replace(/\/$/, "");
}

export function loadBu2McpConfiguration(environment = process.env) {
  const currentEndpoint = environment.BU2_ENDPOINT;
  const legacyEndpoint = environment.BU2_SANDBOX_URL;
  if (
    currentEndpoint &&
    legacyEndpoint &&
    normalizeEndpoint(currentEndpoint) !== normalizeEndpoint(legacyEndpoint)
  ) {
    throw new Bu2McpCompatibilityError(
      "endpoint_conflict",
      "BU2_ENDPOINT and BU2_SANDBOX_URL must identify the same endpoint when both are set.",
    );
  }
  const endpoint = normalizeEndpoint(currentEndpoint ?? legacyEndpoint ?? "http://127.0.0.1:3100");
  const activeEnvironment = environment.BU2_ENVIRONMENT ?? "simulation";
  if (!["simulation", "testnet"].includes(activeEnvironment)) {
    throw new Bu2McpCompatibilityError(
      "environment_invalid",
      "BU2_ENVIRONMENT must be simulation or testnet.",
      { actual: activeEnvironment },
    );
  }
  return { endpoint, environment: activeEnvironment };
}

export function bu2McpCapability(environment) {
  return {
    api_contract_version: contractVersions.agent_payment_api,
    api_base_path: contractVersions.api_base_path,
    mcp_contract_version: mcpContract.version,
    mcp_contract_sha256: mcpContractSha256,
    contract_status: mcpContract.contract_status,
    environment,
    supported_environments: ["simulation", "testnet"],
    transport: "stdio",
    tool_count: mcpContract.tools.length,
    automatic_mutation_retry: false,
    agent_authorization_tool: false,
    agent_settlement_tool: false,
  };
}

export function bu2McpMetadata(environment) {
  return {
    server: {
      name: mcpContract.name,
      version: mcpContract.version,
      title: "BU2 Agent Payments",
    },
    capability_namespace: BU2_MCP_CAPABILITY_NAMESPACE,
    capability: bu2McpCapability(environment),
    tool_names: mcpContract.tools.map(({ name }) => name),
  };
}

export function validateBu2McpHandshake(serverInfo, serverCapabilities, expectedEnvironment) {
  if (serverInfo?.name !== mcpContract.name || serverInfo?.version !== mcpContract.version) {
    throw new Bu2McpCompatibilityError(
      "mcp_server_version_mismatch",
      "The MCP server identity does not match the frozen BU2 MCP contract.",
      { expected: `${mcpContract.name}@${mcpContract.version}` },
    );
  }
  const capability = serverCapabilities?.experimental?.[BU2_MCP_CAPABILITY_NAMESPACE];
  const expected = bu2McpCapability(expectedEnvironment);
  if (
    !capability ||
    capability.api_contract_version !== expected.api_contract_version ||
    capability.api_base_path !== expected.api_base_path ||
    capability.mcp_contract_version !== expected.mcp_contract_version ||
    capability.mcp_contract_sha256 !== expected.mcp_contract_sha256 ||
    capability.environment !== expected.environment ||
    !capability.supported_environments?.includes(expected.environment) ||
    capability.transport !== "stdio" ||
    capability.tool_count !== expected.tool_count ||
    capability.automatic_mutation_retry !== false ||
    capability.agent_authorization_tool !== false ||
    capability.agent_settlement_tool !== false
  ) {
    throw new Bu2McpCompatibilityError(
      "mcp_capability_mismatch",
      "The MCP server capabilities do not match the required BU2 API, contract, or environment.",
      {
        expected_api_contract_version: expected.api_contract_version,
        expected_mcp_contract_version: expected.mcp_contract_version,
        expected_environment: expected.environment,
      },
    );
  }
  return { server: serverInfo, capability };
}

export async function preflightBu2Endpoint(
  { endpoint, environment },
  { fetchImpl = fetch, timeoutMs = 5_000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(new URL("/health", `${endpoint}/`), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    throw new Bu2McpCompatibilityError(
      error?.name === "AbortError" ? "endpoint_timeout" : "endpoint_unreachable",
      "BU2 endpoint preflight failed before the MCP session started.",
    );
  } finally {
    clearTimeout(timer);
  }
  let health;
  try {
    health = await response.json();
  } catch {
    throw new Bu2McpCompatibilityError(
      "endpoint_response_invalid",
      "BU2 endpoint health response must be valid JSON.",
      { status: response.status },
    );
  }
  if (!response.ok || health.status !== "ok" || health.service !== "bu2-reference-server") {
    throw new Bu2McpCompatibilityError(
      "endpoint_incompatible",
      "BU2 endpoint did not identify a compatible Reference Server.",
      { status: response.status },
    );
  }
  if (
    health.api_contract_version !== contractVersions.agent_payment_api ||
    health.api_base_path !== contractVersions.api_base_path
  ) {
    throw new Bu2McpCompatibilityError(
      "api_contract_version_mismatch",
      "BU2 endpoint API contract is incompatible with this MCP server.",
      {
        expected: contractVersions.agent_payment_api,
        actual: health.api_contract_version ?? null,
      },
    );
  }
  if (health.environment !== environment) {
    throw new Bu2McpCompatibilityError(
      "environment_mismatch",
      "BU2 endpoint environment does not match BU2_ENVIRONMENT.",
      { expected: environment, actual: health.environment ?? null },
    );
  }
  if (
    !Array.isArray(health.mcp_contract_versions) ||
    !health.mcp_contract_versions.includes(mcpContract.version)
  ) {
    throw new Bu2McpCompatibilityError(
      "mcp_contract_version_unsupported",
      "BU2 endpoint does not advertise support for this MCP contract version.",
      { expected: mcpContract.version },
    );
  }
  return {
    endpoint,
    environment,
    service: health.service,
    service_version: health.version,
    api_contract_version: health.api_contract_version,
    mcp_contract_version: mcpContract.version,
    adapter: health.adapter,
  };
}
