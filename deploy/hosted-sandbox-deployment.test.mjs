import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateHostedSandboxDeployment } from "./hosted-sandbox-deployment.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const composePath = join(here, "hosted-sandbox.compose.yaml");
const digest = `ghcr.io/atxinbao/bu2com@sha256:${"a".repeat(64)}`;

const resolvedCompose = () =>
  JSON.parse(
    execFileSync(
      "docker",
      ["compose", "--file", composePath, "config", "--format", "json"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          BU2_HOSTED_ARTIFACT_IMAGE: digest,
          X402_RESOURCE_URL: "https://merchant.sandbox.bu2.com/premium-data",
          BU2_SECRET_API_CREDENTIALS: "bu2/sandbox/api-credentials-v1",
          BU2_SECRET_BUYER_SIGNER: "bu2/sandbox/buyer-signer-v1",
          BU2_SECRET_RPC_ENDPOINT: "bu2/sandbox/base-sepolia-rpc-v1",
        },
      },
    ),
  );

test("ENV-07B hosted Compose resolves to a Sandbox-only execution-enabled unit", () => {
  const compose = resolvedCompose();
  assert.deepEqual(validateHostedSandboxDeployment(compose), { valid: true, errors: [] });
  assert.equal(compose.services.sandbox.image, digest);
  assert.equal(compose.services.sandbox.environment.BU2_EXECUTION_STATUS, "execution_enabled");
  assert.equal(compose.services.sandbox.environment.BU2_ENVIRONMENT, "sandbox");
  assert.equal(compose.services.sandbox.command.join(" "), "node sandbox/hosted-sandbox.mjs");
  assert.equal(compose.services.sandbox.secrets.length, 3);
  assert.equal(compose.services.live, undefined);
});

test("ENV-07B hosted deployment rejects mutable images, direct secrets, Live and public host ports", () => {
  const compose = resolvedCompose();
  compose.services.sandbox.image = "bu2/reference:latest";
  compose.services.sandbox.environment.X402_BUYER_PRIVATE_KEY = "forbidden";
  compose.services.sandbox.ports[0].host_ip = "0.0.0.0";
  compose.services.live = {};

  const result = validateHostedSandboxDeployment(compose);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    "live:service_must_not_exist",
    "sandbox:host_port_not_loopback",
    "sandbox:image_not_immutable",
    "sandbox:prohibited_X402_BUYER_PRIVATE_KEY",
    "services:hosted_sandbox_must_exclude_live",
  ]);
});
