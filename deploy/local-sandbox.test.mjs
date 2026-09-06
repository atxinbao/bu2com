import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_PATTERN,
  createLocalSandboxPlan,
  validateLocalSandboxEnvironment,
} from "./local-sandbox.mjs";

const artifact = `sha256:${"a".repeat(64)}`;

test("local Sandbox plan is immutable, loopback and disarmed", () => {
  const plan = createLocalSandboxPlan({ artifactReference: artifact, hostPort: 3115 });
  assert.match(plan.artifact_reference, ARTIFACT_PATTERN);
  assert.equal(plan.host_port, 3115);
  assert.equal(plan.environment, "sandbox");
  assert.equal(plan.chain_id, 84532);
  assert.equal(plan.execution_status, "execution_disabled");
  assert.equal(plan.access_mode, "authenticated");
  assert.equal(plan.up.args.at(-1), "sandbox");
  assert.equal(plan.up.args.includes("live"), false);
  assert.equal(plan.up.environment.BU2_EXECUTION_STATUS, undefined);
  assert.equal(plan.up.environment.BU2_ARTIFACT_IMAGE, artifact);
  assert.equal(plan.up.environment.BU2_SANDBOX_HOST_PORT, "3115");
});

test("local Sandbox plan rejects mutable artifacts and invalid ports", () => {
  assert.throws(
    () => createLocalSandboxPlan({ artifactReference: "bu2-hosted-sandbox:local" }),
    (error) => error.code === "local_sandbox_artifact_invalid",
  );
  assert.throws(
    () => createLocalSandboxPlan({ artifactReference: artifact, hostPort: 80 }),
    (error) => error.code === "local_sandbox_port_invalid",
  );
});

test("local Sandbox doctor contract validates the disarmed Base Sepolia boundary", () => {
  const valid = validateLocalSandboxEnvironment({
    environment: "sandbox",
    chain_id: 84532,
    network: "eip155:84532",
    execution_backend: "x402",
    execution_status: "execution_disabled",
    access_mode: "authenticated",
  });
  assert.deepEqual(valid, { valid: true, errors: [] });
  const wrongChain = validateLocalSandboxEnvironment({
    environment: "sandbox",
    chain_id: 8453,
    network: "eip155:8453",
    execution_backend: "x402",
    execution_status: "execution_disabled",
    access_mode: "authenticated",
  });
  assert.equal(wrongChain.valid, false);
  assert.deepEqual(wrongChain.errors, ["environment:chain_id_mismatch", "environment:network_mismatch"]);
});
