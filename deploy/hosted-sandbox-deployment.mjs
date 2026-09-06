import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const HOSTED_SANDBOX_DEPLOYMENT = Object.freeze(
  JSON.parse(readFileSync(join(here, "hosted-sandbox-deployment.json"), "utf8")),
);

const immutableImage = (reference) =>
  /^sha256:[a-f0-9]{64}$/.test(reference) || /@sha256:[a-f0-9]{64}$/.test(reference);

const asEnvironment = (service) =>
  Array.isArray(service.environment)
    ? Object.fromEntries(service.environment.map((entry) => entry.split(/=(.*)/s).slice(0, 2)))
    : service.environment ?? {};

const normalizeCommand = (command) => (Array.isArray(command) ? command : [command]);

const secretEntries = (service) =>
  (service.secrets ?? []).map((entry) =>
    typeof entry === "string" ? { source: entry, target: entry } : entry,
  );

const networkEntries = (service) =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});

export function validateHostedSandboxDeployment(compose, contract = HOSTED_SANDBOX_DEPLOYMENT) {
  const errors = [];
  const services = compose?.services ?? {};
  const serviceNames = Object.keys(services);
  if (serviceNames.length !== 1 || serviceNames[0] !== "sandbox") {
    errors.push("services:hosted_sandbox_must_exclude_live");
  }
  const service = services.sandbox;
  if (!service) return { valid: false, errors: Object.freeze(errors.concat("sandbox:service_missing")) };

  const environment = asEnvironment(service);
  const labels = service.labels ?? {};
  const expectedEnvironment = {
    BU2_ENVIRONMENT: contract.environment,
    BU2_PAYMENT_ADAPTER: contract.payment_adapter,
    BU2_CHAIN_ID: String(contract.chain_id),
    BU2_NETWORK: contract.network,
    BU2_PROVIDER_NETWORK: contract.network,
    BU2_PROVIDER_SCHEME: contract.provider_scheme,
    BU2_EXECUTION_STATUS: contract.execution_status,
    BU2_ACCESS_MODE: contract.access_mode,
    BU2_API_CREDENTIALS_FILE: "/run/secrets/bu2_api_credentials",
    X402_BUYER_PRIVATE_KEY_FILE: "/run/secrets/x402_buyer_private_key",
    BU2_RPC_URL_FILE: "/run/secrets/base_sepolia_rpc_url",
  };

  if (!immutableImage(String(service.image ?? ""))) errors.push("sandbox:image_not_immutable");
  if (JSON.stringify(normalizeCommand(service.command)) !== JSON.stringify(contract.command)) {
    errors.push("sandbox:hosted_command_mismatch");
  }
  for (const [key, value] of Object.entries(expectedEnvironment)) {
    if (environment[key] !== value) errors.push(`sandbox:${key.toLowerCase()}_mismatch`);
  }
  if (typeof environment.X402_RESOURCE_URL !== "string" || environment.X402_RESOURCE_URL.length < 1) {
    errors.push("sandbox:resource_url_missing");
  }
  for (const key of contract.prohibited_environment_variables) {
    if (Object.hasOwn(environment, key)) errors.push(`sandbox:prohibited_${key}`);
  }
  if (String(service.user ?? "") !== contract.runtime_uid) errors.push("sandbox:runtime_uid_mismatch");
  if (service.read_only !== true) errors.push("sandbox:root_filesystem_not_read_only");
  if (!(service.cap_drop ?? []).includes("ALL")) errors.push("sandbox:capabilities_not_dropped");
  if (service.restart !== "on-failure:3") errors.push("sandbox:restart_policy_unbounded");
  if ((service.ports ?? []).some((port) => port.host_ip !== "127.0.0.1")) {
    errors.push("sandbox:host_port_not_loopback");
  }
  if ((service.volumes ?? []).length !== 1) errors.push("sandbox:unexpected_volume_mount");
  if (networkEntries(service).length !== 1) errors.push("sandbox:unexpected_network_attachment");

  const secrets = secretEntries(service);
  const targets = secrets.map((entry) => entry.target).sort();
  if (JSON.stringify(targets) !== JSON.stringify([...contract.required_secret_targets].sort())) {
    errors.push("sandbox:secret_targets_mismatch");
  }
  for (const [key, value] of Object.entries(contract.required_labels)) {
    if (labels[key] !== value) errors.push(`sandbox:label_${key.replaceAll(".", "_")}_mismatch`);
  }
  if (compose.services.live) errors.push("live:service_must_not_exist");

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.sort()) });
}
