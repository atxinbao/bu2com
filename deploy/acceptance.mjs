import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResolvedDeployment } from "./deployment-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const composeFile = join(here, "compose.yaml");
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const project = `bu2env04${runId}`;
const imageTag = `bu2-env04-${runId}:acceptance`;
const work = mkdtempSync(join(tmpdir(), "bu2-env04-"));
const iidFile = join(work, "image-id");
const createdContainers = [];

const command = (program, args, options = {}) =>
  execFileSync(program, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env,
  });

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });

const waitForEnvironment = async (port, environment) => {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/environment`);
      if (response.ok) {
        const payload = await response.json();
        assert.equal(payload.environment, environment);
        assert.equal(payload.execution_status, "execution_disabled");
        return payload;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${environment} did not become ready: ${lastError?.message ?? "timeout"}`);
};

const assertPaymentMutationDisabled = async (port, environment) => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/quotes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `env04-${environment}-disabled`,
    },
    body: JSON.stringify({}),
  });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "environment_execution_disabled");
};

const runFaultContainer = ({ name, image, volume = null, variables }) => {
  const args = [
    "create",
    "--name",
    name,
    "--read-only",
    "--tmpfs",
    "/tmp:size=16m,mode=1777",
    "--user",
    "10002:10002",
  ];
  if (volume) args.push("--volume", `${volume}:/var/lib/bu2/live`);
  for (const [key, value] of Object.entries(variables)) args.push("--env", `${key}=${value}`);
  args.push(image);
  command("docker", args);
  createdContainers.push(name);

  const result = spawnSync("docker", ["start", "--attach", name], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return {
    exitCode: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
};

const baseLiveVariables = {
  BU2_HOST: "0.0.0.0",
  BU2_SANDBOX_PORT: "3100",
  BU2_SANDBOX_DB: "/var/lib/bu2/live/bu2.sqlite",
  BU2_ENVIRONMENT: "live",
  BU2_PAYMENT_ADAPTER: "x402",
  BU2_CHAIN_ID: "8453",
  BU2_NETWORK: "eip155:8453",
  BU2_PROVIDER_NETWORK: "eip155:8453",
  BU2_PROVIDER_SCHEME: "exact",
  BU2_EXECUTION_STATUS: "execution_disabled",
};

let evidence;
let activeComposeEnvironment;
try {
  const [sandboxPort, livePort] = await Promise.all([reservePort(), reservePort()]);
  command("docker", [
    "build",
    "--file",
    composeFile.replace(/compose\.yaml$/, "Dockerfile"),
    "--tag",
    imageTag,
    "--iidfile",
    iidFile,
    root,
  ]);
  const imageId = readFileSync(iidFile, "utf8").trim();
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);

  const composeEnvironment = {
    ...process.env,
    BU2_ARTIFACT_IMAGE: imageId,
    BU2_SANDBOX_HOST_PORT: String(sandboxPort),
    BU2_LIVE_HOST_PORT: String(livePort),
  };
  activeComposeEnvironment = composeEnvironment;
  const composeArgs = ["compose", "--project-name", project, "--file", composeFile];
  const resolved = JSON.parse(
    command("docker", [...composeArgs, "--profile", "live", "config", "--format", "json"], {
      env: composeEnvironment,
    }),
  );
  assert.deepEqual(validateResolvedDeployment(resolved), { valid: true, errors: [] });

  command(
    "docker",
    [...composeArgs, "--profile", "live", "up", "--detach", "--no-build", "sandbox", "live"],
    { env: composeEnvironment },
  );
  const [sandboxInfo, liveInfo] = await Promise.all([
    waitForEnvironment(sandboxPort, "sandbox"),
    waitForEnvironment(livePort, "live"),
  ]);
  await Promise.all([
    assertPaymentMutationDisabled(sandboxPort, "sandbox"),
    assertPaymentMutationDisabled(livePort, "live"),
  ]);

  const sandboxVolume = command("docker", [
    "volume",
    "ls",
    "--quiet",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    "label=com.docker.compose.volume=sandbox-data",
  ]).trim();
  assert.ok(sandboxVolume, "Sandbox data volume was not created.");

  const databaseFault = runFaultContainer({
    name: `${project}-wrong-db`,
    image: imageId,
    volume: sandboxVolume,
    variables: baseLiveVariables,
  });
  assert.notEqual(databaseFault.exitCode, 0);
  assert.match(databaseFault.output, /database_environment_mismatch/);

  const secretSentinel = `0x${"11".repeat(32)}`;
  const signerFault = runFaultContainer({
    name: `${project}-wrong-signer`,
    image: imageId,
    variables: {
      ...baseLiveVariables,
      BU2_SIGNER_ENVIRONMENT: "sandbox",
      X402_BUYER_PRIVATE_KEY: secretSentinel,
    },
  });
  assert.notEqual(signerFault.exitCode, 0);
  assert.match(signerFault.output, /environment_binding_mismatch/);
  assert.doesNotMatch(signerFault.output, new RegExp(secretSentinel, "i"));

  evidence = {
    schema_version: "1.0",
    run_id: runId,
    artifact: {
      image_id: imageId,
      reused_by: ["sandbox", "live"],
    },
    units: {
      sandbox: {
        environment: sandboxInfo.environment,
        chain_id: sandboxInfo.chain_id,
        execution_status: sandboxInfo.execution_status,
      },
      live: {
        environment: liveInfo.environment,
        chain_id: liveInfo.chain_id,
        execution_status: liveInfo.execution_status,
      },
    },
    fault_injection: {
      sandbox_payment_mutation: "rejected_before_domain_write",
      live_payment_mutation: "rejected_before_domain_write",
      wrong_database_mount: "rejected_before_start",
      cross_environment_signer: "rejected_before_key_load",
      secret_in_logs: false,
    },
    payment_execution_attempted: false,
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  if (activeComposeEnvironment) {
    const logs = spawnSync(
      "docker",
      [
        "compose",
        "--project-name",
        project,
        "--file",
        composeFile,
        "--profile",
        "live",
        "logs",
        "--no-color",
      ],
      { cwd: root, env: activeComposeEnvironment, encoding: "utf8" },
    );
    process.stderr.write(`${logs.stdout ?? ""}${logs.stderr ?? ""}`);
  }
  throw error;
} finally {
  for (const container of createdContainers) {
    spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  }
  const composeEnvironment = {
    ...process.env,
    BU2_ARTIFACT_IMAGE: evidence?.artifact.image_id ?? `sha256:${"0".repeat(64)}`,
  };
  spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      project,
      "--file",
      composeFile,
      "--profile",
      "live",
      "down",
      "--volumes",
      "--remove-orphans",
    ],
    { cwd: root, env: composeEnvironment, stdio: "ignore" },
  );
  spawnSync("docker", ["image", "rm", "--force", imageTag], { stdio: "ignore" });
  rmSync(work, { recursive: true, force: true });
}
