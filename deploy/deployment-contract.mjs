import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const DEPLOYMENT_UNITS = Object.freeze(
  JSON.parse(readFileSync(join(here, "environment-units.json"), "utf8")),
);

const immutableImage = (reference) =>
  /^sha256:[a-f0-9]{64}$/.test(reference) || /@sha256:[a-f0-9]{64}$/.test(reference);

const asEnvironment = (service) =>
  Array.isArray(service.environment)
    ? Object.fromEntries(service.environment.map((entry) => entry.split(/=(.*)/s).slice(0, 2)))
    : service.environment ?? {};

const volumeSources = (service) =>
  (service.volumes ?? []).map((volume) =>
    typeof volume === "string" ? volume.split(":", 1)[0] : volume.source,
  );

const networkNames = (service) =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});

export function validateResolvedDeployment(compose, contract = DEPLOYMENT_UNITS) {
  const errors = [];
  const services = compose.services ?? {};
  const resolved = {};

  for (const [environment, unit] of Object.entries(contract.units)) {
    const service = services[unit.service];
    if (!service) {
      errors.push(`${environment}:service_missing`);
      continue;
    }
    const variables = asEnvironment(service);
    const labels = service.labels ?? {};
    const volumes = volumeSources(service);
    const networks = networkNames(service);
    const uid = Number(String(service.user ?? "").split(":", 1)[0]);

    if (!immutableImage(service.image ?? "")) errors.push(`${environment}:image_not_immutable`);
    if (variables.BU2_ENVIRONMENT !== environment) errors.push(`${environment}:environment_mismatch`);
    if (variables.BU2_PAYMENT_ADAPTER !== unit.payment_adapter) {
      errors.push(`${environment}:adapter_mismatch`);
    }
    if (Number(variables.BU2_CHAIN_ID) !== unit.chain_id) {
      errors.push(`${environment}:chain_id_mismatch`);
    }
    if (
      variables.BU2_NETWORK !== unit.network_id ||
      variables.BU2_PROVIDER_NETWORK !== unit.network_id
    ) {
      errors.push(`${environment}:network_binding_mismatch`);
    }
    if (variables.BU2_PROVIDER_SCHEME !== "exact") {
      errors.push(`${environment}:provider_scheme_mismatch`);
    }
    if (variables.BU2_EXECUTION_STATUS !== unit.execution_status) {
      errors.push(`${environment}:execution_status_mismatch`);
    }
    if (uid !== unit.runtime_uid) errors.push(`${environment}:runtime_uid_mismatch`);
    if (!volumes.includes(unit.data_volume)) errors.push(`${environment}:data_volume_mismatch`);
    if (volumes.length !== 1) errors.push(`${environment}:unexpected_volume_mount`);
    if (!String(variables.BU2_SANDBOX_DB ?? "").startsWith(`${unit.data_path}/`)) {
      errors.push(`${environment}:database_path_mismatch`);
    }
    if (!networks.includes(unit.network)) errors.push(`${environment}:network_mismatch`);
    if (networks.length !== 1) errors.push(`${environment}:unexpected_network_attachment`);
    if (labels["com.bu2.runtime-identity"] !== unit.runtime_identity) {
      errors.push(`${environment}:runtime_identity_mismatch`);
    }
    for (const key of ["secret_namespace", "backup_scope", "provider_scope"]) {
      if (labels[`com.bu2.${key.replaceAll("_", "-")}`] !== unit[key]) {
        errors.push(`${environment}:${key}_mismatch`);
      }
    }
    for (const key of contract.prohibited_environment_variables) {
      if (Object.hasOwn(variables, key)) errors.push(`${environment}:prohibited_${key}`);
    }
    if ((service.secrets ?? []).length > 0 || (service.configs ?? []).length > 0) {
      errors.push(`${environment}:runtime_secret_or_config_mount_not_allowed`);
    }
    if (service.read_only !== true) errors.push(`${environment}:root_filesystem_not_read_only`);
    if (!(service.cap_drop ?? []).includes("ALL")) errors.push(`${environment}:capabilities_not_dropped`);
    if (service.restart !== "on-failure:3") errors.push(`${environment}:restart_policy_unbounded`);
    if ((service.ports ?? []).some((port) => port.host_ip !== "127.0.0.1")) {
      errors.push(`${environment}:host_port_not_loopback`);
    }

    resolved[environment] = { service, variables, labels, volumes, networks, uid };
  }

  const environments = Object.keys(contract.units);
  if (environments.every((environment) => resolved[environment])) {
    const [first, ...rest] = environments;
    const scalarBoundaries = {
      runtime_identity: (unit) => unit.labels["com.bu2.runtime-identity"],
      data_path: (unit) => String(unit.variables.BU2_SANDBOX_DB ?? "").replace(/\/[^/]+$/, ""),
      secret_namespace: (unit) => unit.labels["com.bu2.secret-namespace"],
      backup_scope: (unit) => unit.labels["com.bu2.backup-scope"],
      provider_scope: (unit) => unit.labels["com.bu2.provider-scope"],
    };
    for (const [key, getter] of Object.entries(scalarBoundaries)) {
      const values = environments.map((environment) => getter(resolved[environment]));
      if (new Set(values).size !== values.length) errors.push(`shared_boundary:${key}`);
    }
    const [firstUnit, secondUnit] = environments.map((environment) => resolved[environment]);
    if (firstUnit.volumes.some((volume) => secondUnit.volumes.includes(volume))) {
      errors.push("shared_boundary:data_volume");
    }
    if (firstUnit.networks.some((network) => secondUnit.networks.includes(network))) {
      errors.push("shared_boundary:network");
    }
    if (firstUnit.uid === secondUnit.uid) errors.push("shared_boundary:runtime_uid");
    for (const environment of rest) {
      if (resolved[environment].service.image !== resolved[first].service.image) {
        errors.push("artifact:image_reference_differs");
      }
    }
  }

  if (!services.live?.profiles?.includes("live")) errors.push("live:explicit_profile_required");

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.sort()) });
}
