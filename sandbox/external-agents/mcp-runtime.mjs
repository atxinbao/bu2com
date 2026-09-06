import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const BU2_MCP_CAPABILITY_NAMESPACE = "com.bu2.agent-payments";

export const mcpContract = JSON.parse(
  readFileSync(new URL("../../docs/03-technical/mcp-tools.json", import.meta.url), "utf8"),
);

export const contractVersions = JSON.parse(
  readFileSync(new URL("../../docs/03-technical/contract-versions.json", import.meta.url), "utf8"),
);

export const environmentContract = JSON.parse(
  readFileSync(
    new URL("../../docs/03-technical/environment-contract.json", import.meta.url),
    "utf8",
  ),
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
  const activeEnvironment = environment.BU2_ENVIRONMENT;
  if (!["local", "sandbox", "live"].includes(activeEnvironment)) {
    throw new Bu2McpCompatibilityError(
      "environment_invalid",
      "BU2_ENVIRONMENT must be local, sandbox, or live.",
      { actual: activeEnvironment ?? null },
    );
  }
  const localDevelopment = environment.BU2_LOCAL_DEVELOPMENT === "true";
  if (activeEnvironment === "local" && !localDevelopment) {
    throw new Bu2McpCompatibilityError(
      "local_development_confirmation_required",
      "BU2_LOCAL_DEVELOPMENT=true is required when BU2_ENVIRONMENT=local.",
    );
  }
  if (activeEnvironment !== "local" && environment.BU2_LOCAL_DEVELOPMENT !== undefined) {
    throw new Bu2McpCompatibilityError(
      "local_development_flag_invalid",
      "BU2_LOCAL_DEVELOPMENT is only valid with BU2_ENVIRONMENT=local.",
    );
  }
  const apiKey = environment.BU2_API_KEY;
  if (activeEnvironment !== "local" && (!apiKey || apiKey.length < 32)) {
    throw new Bu2McpCompatibilityError(
      "credential_required",
      "BU2_API_KEY with at least 32 characters is required for sandbox and live.",
    );
  }
  if (apiKey !== undefined && apiKey.length < 32) {
    throw new Bu2McpCompatibilityError(
      "credential_invalid",
      "BU2_API_KEY must contain at least 32 characters when provided.",
    );
  }
  return { endpoint, environment: activeEnvironment, localDevelopment, apiKey: apiKey ?? null };
}

export function expectedEnvironmentInfo(environment) {
  const expected = environmentContract.environments[environment];
  if (!expected) {
    throw new Bu2McpCompatibilityError("environment_invalid", "Unknown BU2 environment.", {
      actual: environment,
    });
  }
  return {
    environment,
    environment_contract_version: environmentContract.schema_version,
    chain_id: expected.chain_id,
    network: expected.network,
    execution_backend: expected.payment_adapter,
    execution_status: expected.default_execution_status,
    access_contract_version: contractVersions.access_contract,
    access_mode: environment === "local" ? "development_open" : "authenticated",
    api_contract_version: contractVersions.agent_payment_api,
    api_base_path: contractVersions.api_base_path,
    mcp_contract_version: mcpContract.version,
    mcp_contract_sha256: mcpContractSha256,
    tool_count: mcpContract.tools.length,
    receipt_schema_versions: environmentContract.receipt_schema_versions,
    receipt_issuer: {
      issuer_id: `bu2-reference-server:${environment}`,
      environment,
    },
  };
}

export function bu2McpCapability(environmentInfo) {
  return {
    api_contract_version: contractVersions.agent_payment_api,
    api_base_path: contractVersions.api_base_path,
    mcp_contract_version: mcpContract.version,
    mcp_contract_sha256: mcpContractSha256,
    contract_status: mcpContract.contract_status,
    environment_contract_version: environmentInfo.environment_contract_version,
    environment: environmentInfo.environment,
    chain_id: environmentInfo.chain_id,
    network: environmentInfo.network,
    execution_backend: environmentInfo.execution_backend,
    execution_status: environmentInfo.execution_status,
    access_contract_version: environmentInfo.access_contract_version,
    access_mode: environmentInfo.access_mode,
    receipt_issuer_id: environmentInfo.receipt_issuer?.issuer_id ?? null,
    receipt_verification_key_id:
      environmentInfo.receipt_issuer?.verification_key_id ?? null,
    supported_environments: environmentContract.public_environments,
    local_development: environmentInfo.environment === "local",
    transport: "stdio",
    tool_count: mcpContract.tools.length,
    automatic_mutation_retry: false,
    agent_authorization_tool: false,
    agent_settlement_tool: false,
  };
}

export function bu2McpMetadata(environment) {
  const environmentInfo = expectedEnvironmentInfo(environment);
  return {
    server: {
      name: mcpContract.name,
      version: mcpContract.version,
      title: "BU2 Agent Payments",
    },
    capability_namespace: BU2_MCP_CAPABILITY_NAMESPACE,
    capability: bu2McpCapability(environmentInfo),
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
  const expected = expectedEnvironmentInfo(expectedEnvironment);
  if (
    !capability ||
    capability.api_contract_version !== expected.api_contract_version ||
    capability.api_base_path !== expected.api_base_path ||
    capability.mcp_contract_version !== expected.mcp_contract_version ||
    capability.mcp_contract_sha256 !== expected.mcp_contract_sha256 ||
    capability.environment_contract_version !== expected.environment_contract_version ||
    capability.environment !== expected.environment ||
    capability.chain_id !== expected.chain_id ||
    capability.network !== expected.network ||
    capability.execution_backend !== expected.execution_backend ||
    capability.access_contract_version !== expected.access_contract_version ||
    capability.receipt_issuer_id !== expected.receipt_issuer.issuer_id ||
    !capability.receipt_verification_key_id ||
    (expected.environment === "local"
      ? capability.local_development !== true
      : !capability.supported_environments?.includes(expected.environment)) ||
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
  { endpoint, environment, apiKey = null },
  { fetchImpl = fetch, timeoutMs = 5_000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(new URL("/v1/environment", `${endpoint}/`), {
      headers: { accept: "application/json" },
      redirect: "error",
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
  let info;
  const correlation = {
    request_id: response.headers.get("x-request-id"),
    trace_id: response.headers.get("x-trace-id"),
  };
  try {
    info = await response.json();
  } catch {
    throw new Bu2McpCompatibilityError(
      "endpoint_response_invalid",
      "BU2 endpoint environment response must be valid JSON.",
      { status: response.status, ...correlation },
    );
  }
  if (!response.ok || info.service !== "bu2-reference-server") {
    throw new Bu2McpCompatibilityError(
      "endpoint_incompatible",
      "BU2 endpoint did not identify a compatible Reference Server.",
      { status: response.status, ...correlation },
    );
  }
  if (
    info.api_contract_version !== contractVersions.agent_payment_api
  ) {
    throw new Bu2McpCompatibilityError(
      "api_contract_version_mismatch",
      "BU2 endpoint API contract is incompatible with this MCP server.",
      {
        expected: contractVersions.agent_payment_api,
        actual: info.api_contract_version ?? null,
        ...correlation,
      },
    );
  }
  const expected = expectedEnvironmentInfo(environment);
  const expectedAccessMode = environment === "local" && !apiKey ? "development_open" : "authenticated";
  if (info.environment !== environment) {
    throw new Bu2McpCompatibilityError(
      "environment_mismatch",
      "BU2 endpoint environment does not match BU2_ENVIRONMENT.",
      { expected: environment, actual: info.environment ?? null, ...correlation },
    );
  }
  const mismatches = [
    info.environment_contract_version !== expected.environment_contract_version
      ? "environment_contract_version"
      : null,
    info.chain_id !== expected.chain_id ? "chain_id" : null,
    info.network !== expected.network ? "network" : null,
    info.execution_backend !== expected.execution_backend ? "execution_backend" : null,
    info.access_contract_version !== expected.access_contract_version
      ? "access_contract_version"
      : null,
    info.access_mode !== expectedAccessMode ? "access_mode" : null,
    info.receipt_issuer?.environment !== environment ? "receipt_issuer.environment" : null,
    info.receipt_issuer?.issuer_id !== expected.receipt_issuer.issuer_id
      ? "receipt_issuer.issuer_id"
      : null,
    !info.receipt_issuer?.verification_key_id
      ? "receipt_issuer.verification_key_id"
      : null,
    info.receipt_issuer?.signature_algorithm !== "Ed25519"
      ? "receipt_issuer.signature_algorithm"
      : null,
    !info.receipt_issuer?.public_key ? "receipt_issuer.public_key" : null,
    !info.receipt_schema_versions?.includes(contractVersions.receipt_current)
      ? "receipt_schema_versions"
      : null,
    !info.mcp_contract_versions?.includes(mcpContract.version)
      ? "mcp_contract_versions"
      : null,
  ].filter(Boolean);
  if (mismatches.length > 0) {
    throw new Bu2McpCompatibilityError(
      "environment_contract_mismatch",
      "BU2 endpoint does not match the required environment contract.",
      { expected_environment: environment, mismatches, ...correlation },
    );
  }
  return {
    endpoint,
    environment,
    service: info.service,
    api_contract_version: info.api_contract_version,
    mcp_contract_version: mcpContract.version,
    environment_contract_version: info.environment_contract_version,
    chain_id: info.chain_id,
    network: info.network,
    execution_backend: info.execution_backend,
    execution_status: info.execution_status,
    access_contract_version: info.access_contract_version,
    access_mode: info.access_mode,
    receipt_schema_versions: info.receipt_schema_versions,
    receipt_issuer: info.receipt_issuer,
    ...correlation,
  };
}
