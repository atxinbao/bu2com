import { readFileSync } from "node:fs";
import { base, baseSepolia } from "viem/chains";
import { ApiError } from "./domain.mjs";

export const ENVIRONMENT_CONTRACT = Object.freeze(
  JSON.parse(
    readFileSync(
      new URL("../docs/03-technical/environment-contract.json", import.meta.url),
      "utf8",
    ),
  ),
);
export const ENVIRONMENT_CONTRACT_VERSION = ENVIRONMENT_CONTRACT.schema_version;
export const EXECUTION_DISABLED = "execution_disabled";
export const EXECUTION_ENABLED = "execution_enabled";

const registry = ENVIRONMENT_CONTRACT.environments;

if (
  registry.sandbox.chain_id !== baseSepolia.id ||
  registry.sandbox.network !== `eip155:${baseSepolia.id}` ||
  registry.live.chain_id !== base.id ||
  registry.live.network !== `eip155:${base.id}`
) {
  throw new Error("Environment contract does not match the official Viem Base chain definitions.");
}

export const ENVIRONMENT_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(registry).map(([key, value]) => [key, Object.freeze({ ...value })]),
  ),
);

const configurationError = (code, message, details = {}) =>
  new ApiError(503, "configuration_error", code, message, details);

const configured = (overrides, key, source, environmentKey, fallback) =>
  overrides[key] ?? source[environmentKey] ?? fallback;

const parseChainId = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw configurationError(
      "environment_chain_id_invalid",
      `${field} must be a positive integer chain ID.`,
      { field },
    );
  }
  return parsed;
};

const normalizeAddress = (value) =>
  value === null || value === undefined || value === "" ? null : String(value).toLowerCase();

export function loadEnvironmentConfig(overrides = {}, source = process.env) {
  const explicitEnvironment = overrides.environment ?? source.BU2_ENVIRONMENT;
  const paymentAdapter = configured(
    overrides,
    "paymentAdapter",
    source,
    "BU2_PAYMENT_ADAPTER",
    "simulated",
  );
  if (!explicitEnvironment && paymentAdapter !== "simulated") {
    throw configurationError(
      "environment_required",
      "BU2_ENVIRONMENT is required when a deployed payment adapter is configured.",
    );
  }

  const environment = explicitEnvironment ?? "local";
  const approved = ENVIRONMENT_REGISTRY[environment];
  if (!approved) {
    throw configurationError(
      "environment_invalid",
      "Environment must be one of local, sandbox, or live.",
      { environment },
    );
  }

  const chainId = parseChainId(
    configured(overrides, "chainId", source, "BU2_CHAIN_ID", approved.chain_id),
    "chain_id",
  );
  const network = configured(overrides, "network", source, "BU2_NETWORK", approved.network);
  const asset = normalizeAddress(
    configured(overrides, "asset", source, "BU2_USDC_ADDRESS", approved.asset),
  );
  const executionStatus = configured(
    overrides,
    "executionStatus",
    source,
    "BU2_EXECUTION_STATUS",
    approved.default_execution_status,
  );
  const signerEnvironment = configured(
    overrides,
    "signerEnvironment",
    source,
    "BU2_SIGNER_ENVIRONMENT",
    null,
  );
  const providerNetwork = configured(
    overrides,
    "providerNetwork",
    source,
    "BU2_PROVIDER_NETWORK",
    approved.network,
  );
  const providerScheme = configured(
    overrides,
    "providerScheme",
    source,
    "BU2_PROVIDER_SCHEME",
    paymentAdapter === "x402" ? "exact" : null,
  );
  const rpcChainId = parseChainId(
    configured(overrides, "rpcChainId", source, "BU2_RPC_CHAIN_ID", null),
    "rpc_chain_id",
  );

  const mismatches = [];
  if (paymentAdapter !== approved.payment_adapter) mismatches.push("payment_adapter");
  if (chainId !== approved.chain_id) mismatches.push("chain_id");
  if (network !== approved.network) mismatches.push("network");
  if (asset !== normalizeAddress(approved.asset)) mismatches.push("asset");
  if (providerNetwork !== approved.network) mismatches.push("provider_network");
  if (providerScheme !== (paymentAdapter === "x402" ? "exact" : null)) {
    mismatches.push("provider_scheme");
  }
  if (rpcChainId !== null && rpcChainId !== approved.chain_id) mismatches.push("rpc_chain_id");
  if (signerEnvironment !== null && signerEnvironment !== environment) {
    mismatches.push("signer_environment");
  }
  if (![EXECUTION_DISABLED, EXECUTION_ENABLED].includes(executionStatus)) {
    mismatches.push("execution_status");
  }
  if (environment === "live" && executionStatus !== EXECUTION_DISABLED) {
    throw configurationError(
      "live_execution_not_authorized",
      "Live execution must remain disabled until the independent G-L authorization exists.",
      { environment, execution_status: executionStatus },
    );
  }
  if (mismatches.length > 0) {
    throw configurationError(
      "environment_binding_mismatch",
      "Runtime configuration does not match the approved environment registry.",
      { environment, mismatches: [...new Set(mismatches)].sort() },
    );
  }

  return Object.freeze({
    environment_contract_version: ENVIRONMENT_CONTRACT_VERSION,
    environment,
    payment_adapter: paymentAdapter,
    chain_id: chainId,
    network,
    asset,
    asset_decimals: approved.asset_decimals,
    execution_status: executionStatus,
    signer_environment: signerEnvironment,
    provider_network: providerNetwork,
    provider_scheme: providerScheme,
    rpc_chain_id: rpcChainId,
  });
}

export function assertSignerBinding(config, signerEnvironment) {
  if (!signerEnvironment) {
    throw configurationError(
      "signer_environment_required",
      "A signer must declare the service environment it belongs to before loading key material.",
    );
  }
  if (signerEnvironment !== config.environment) {
    throw configurationError(
      "signer_environment_mismatch",
      "Signer environment does not match the active service environment.",
      { environment: config.environment, signer_environment: signerEnvironment },
    );
  }
  if (config.execution_status !== EXECUTION_ENABLED) {
    throw configurationError(
      "signer_loading_disabled",
      "Signer material cannot be loaded while payment execution is disabled.",
      { environment: config.environment, execution_status: config.execution_status },
    );
  }
}

export function assertExecutionEnabled(config, operation) {
  if (config.execution_status !== EXECUTION_ENABLED) {
    throw new ApiError(
      503,
      "policy_error",
      "environment_execution_disabled",
      "Payment execution is disabled for this environment.",
      { environment: config.environment, operation },
    );
  }
}

export async function verifyRpcChain(config, getChainId) {
  if (typeof getChainId !== "function") return config;
  let received;
  try {
    received = parseChainId(await getChainId(), "rpc_chain_id");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw configurationError(
      "rpc_chain_unavailable",
      "The configured RPC chain could not be verified.",
      { environment: config.environment },
    );
  }
  if (received !== config.chain_id) {
    throw configurationError(
      "rpc_chain_mismatch",
      "RPC chain does not match the active service environment.",
      { environment: config.environment, expected_chain_id: config.chain_id, received_chain_id: received },
    );
  }
  return config;
}
