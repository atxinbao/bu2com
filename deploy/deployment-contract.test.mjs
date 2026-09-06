import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEPLOYMENT_UNITS, validateResolvedDeployment } from "./deployment-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const composePath = join(here, "compose.yaml");
const digest = `sha256:${"a".repeat(64)}`;

const resolvedCompose = () =>
  JSON.parse(
    execFileSync(
      "docker",
      ["compose", "--file", composePath, "--profile", "live", "config", "--format", "json"],
      {
        encoding: "utf8",
        env: { ...process.env, BU2_ARTIFACT_IMAGE: digest },
      },
    ),
  );

test("ENV-04 Compose resolves to one immutable artifact and two isolated disarmed units", () => {
  const compose = resolvedCompose();
  assert.deepEqual(validateResolvedDeployment(compose), { valid: true, errors: [] });
  assert.equal(compose.services.sandbox.image, digest);
  assert.equal(compose.services.live.image, digest);
  assert.notEqual(compose.services.sandbox.user, compose.services.live.user);
});

test("ENV-04 deployment contract rejects shared state, mutable images, signer mounts and enabled Live", () => {
  const compose = resolvedCompose();
  compose.services.live.image = "bu2/reference:latest";
  compose.services.live.user = compose.services.sandbox.user;
  compose.services.live.volumes = compose.services.sandbox.volumes;
  compose.services.live.networks = compose.services.sandbox.networks;
  compose.services.live.labels["com.bu2.secret-namespace"] =
    compose.services.sandbox.labels["com.bu2.secret-namespace"];
  compose.services.live.environment.BU2_SANDBOX_DB = "/var/lib/bu2/sandbox/bu2.sqlite";
  compose.services.live.environment.BU2_EXECUTION_STATUS = "execution_enabled";
  compose.services.live.environment.X402_BUYER_PRIVATE_KEY = "blocked";
  compose.services.live.secrets = [{ source: "live-signer", target: "/run/secrets/signer" }];

  const result = validateResolvedDeployment(compose);
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors,
    [
      "artifact:image_reference_differs",
      "live:data_volume_mismatch",
      "live:database_path_mismatch",
      "live:execution_status_mismatch",
      "live:image_not_immutable",
      "live:network_mismatch",
      "live:prohibited_X402_BUYER_PRIVATE_KEY",
      "live:runtime_secret_or_config_mount_not_allowed",
      "live:runtime_uid_mismatch",
      "live:secret_namespace_mismatch",
      "shared_boundary:data_path",
      "shared_boundary:data_volume",
      "shared_boundary:network",
      "shared_boundary:runtime_uid",
      "shared_boundary:secret_namespace",
    ],
  );
  assert.equal(DEPLOYMENT_UNITS.units.live.signer_mount, "forbidden");
});
