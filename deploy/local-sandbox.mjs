#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, "..");
export const COMPOSE_FILE = join(here, "compose.yaml");
export const ARTIFACT_FILE = join(PROJECT_ROOT, ".codex", "local-sandbox-image-id");
export const COMPOSE_PROJECT = "bu2-local-sandbox";
export const DEFAULT_HOST_PORT = 3110;
export const ARTIFACT_PATTERN = /^sha256:[a-f0-9]{64}$/;

const command = (program, args, options = {}) =>
  execFileSync(program, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env,
  });

const fail = (code, message, details = {}) => {
  throw Object.assign(new Error(message), { code, details });
};

export function parsePort(value = DEFAULT_HOST_PORT) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    fail("local_sandbox_port_invalid", "Sandbox host port must be an integer from 1024 to 65535.", {
      port: value,
    });
  }
  return port;
}

export function readArtifact(path = ARTIFACT_FILE) {
  if (!existsSync(path)) {
    fail("local_sandbox_artifact_missing", "Build the local Sandbox artifact before starting it.", {
      path,
    });
  }
  const reference = readFileSync(path, "utf8").trim();
  if (!ARTIFACT_PATTERN.test(reference)) {
    fail("local_sandbox_artifact_invalid", "Local Sandbox artifact must be a full sha256 image ID.", {
      path,
    });
  }
  return reference;
}

export function createLocalSandboxPlan({
  artifactReference,
  hostPort = DEFAULT_HOST_PORT,
  artifactFile = ARTIFACT_FILE,
} = {}) {
  const port = parsePort(hostPort);
  if (!ARTIFACT_PATTERN.test(String(artifactReference ?? ""))) {
    fail("local_sandbox_artifact_invalid", "Local Sandbox plan requires an immutable sha256 image ID.");
  }
  const composeArgs = [
    "compose",
    "--project-name",
    COMPOSE_PROJECT,
    "--file",
    COMPOSE_FILE,
  ];
  const composeEnvironment = {
    ...process.env,
    BU2_ARTIFACT_IMAGE: artifactReference,
    BU2_SANDBOX_HOST_PORT: String(port),
  };
  return Object.freeze({
    artifact_file: artifactFile,
    artifact_reference: artifactReference,
    host_port: port,
    environment: "sandbox",
    chain_id: 84532,
    network: "eip155:84532",
    execution_status: "execution_disabled",
    access_mode: "authenticated",
    build: Object.freeze({
      program: "docker",
      args: Object.freeze([
        "build",
        "--file",
        join(here, "Dockerfile"),
        "--iidfile",
        artifactFile,
        PROJECT_ROOT,
      ]),
    }),
    up: Object.freeze({
      program: "docker",
      args: Object.freeze([
        ...composeArgs,
        "up",
        "--detach",
        "--force-recreate",
        "--no-build",
        "sandbox",
      ]),
      environment: composeEnvironment,
    }),
    down: Object.freeze({
      program: "docker",
      args: Object.freeze([...composeArgs, "down", "--remove-orphans"]),
      environment: composeEnvironment,
    }),
    status: Object.freeze({
      program: "docker",
      args: Object.freeze([...composeArgs, "ps", "--all", "--format", "json"]),
      environment: composeEnvironment,
    }),
  });
}

function runPlanCommand(planCommand, options = {}) {
  return command(planCommand.program, planCommand.args, {
    env: planCommand.environment,
    stdio: options.stdio,
  });
}

function ensureArtifactDirectory() {
  mkdirSync(dirname(ARTIFACT_FILE), { recursive: true, mode: 0o700 });
}

export function buildLocalSandboxArtifact() {
  ensureArtifactDirectory();
  command("docker", [
    "build",
    "--file",
    join(here, "Dockerfile"),
    "--iidfile",
    ARTIFACT_FILE,
    PROJECT_ROOT,
  ], { stdio: "inherit" });
  return readArtifact();
}

export async function readLocalSandboxEnvironment(hostPort = DEFAULT_HOST_PORT) {
  const port = parsePort(hostPort);
  const response = await fetch(`http://127.0.0.1:${port}/v1/environment`);
  const payload = await response.json();
  return { status: response.status, payload };
}

export function validateLocalSandboxEnvironment(payload) {
  const expected = {
    environment: "sandbox",
    chain_id: 84532,
    network: "eip155:84532",
    execution_backend: "x402",
    execution_status: "execution_disabled",
    access_mode: "authenticated",
  };
  const errors = Object.entries(expected)
    .filter(([key, value]) => payload?.[key] !== value)
    .map(([key]) => `environment:${key}_mismatch`);
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export async function waitForLocalSandbox(hostPort = DEFAULT_HOST_PORT, timeoutMs = 60_000) {
  const port = parsePort(hostPort);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return response.json();
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  fail("local_sandbox_not_ready", "Local Sandbox did not become healthy before the timeout.", {
    cause: lastError?.message ?? "timeout",
  });
}

export async function runLocalSandboxDoctor(hostPort = DEFAULT_HOST_PORT) {
  const health = await waitForLocalSandbox(hostPort);
  const environment = await readLocalSandboxEnvironment(hostPort);
  if (environment.status !== 200) {
    fail("local_sandbox_environment_unavailable", "Local Sandbox environment endpoint did not return HTTP 200.", {
      status: environment.status,
    });
  }
  const validation = validateLocalSandboxEnvironment(environment.payload);
  if (!validation.valid) {
    fail("local_sandbox_environment_invalid", "Local Sandbox environment contract did not match.", validation);
  }
  return {
    health,
    environment: environment.payload,
    checks: {
      loopback: true,
      sandbox: true,
      base_sepolia: true,
      x402: true,
      execution_disabled: true,
      authenticated: true,
    },
  };
}

async function run() {
  const [action = "doctor", ...argumentsList] = process.argv.slice(2);
  const hostPort = parsePort(argumentsList[0] ?? process.env.BU2_SANDBOX_HOST_PORT);

  if (action === "build") {
    const artifactReference = buildLocalSandboxArtifact();
    return { action, artifact_reference: artifactReference, artifact_file: ARTIFACT_FILE };
  }
  if (action === "up") {
    const artifactReference = existsSync(ARTIFACT_FILE)
      ? readArtifact()
      : buildLocalSandboxArtifact();
    const plan = createLocalSandboxPlan({ artifactReference, hostPort });
    runPlanCommand(plan.up, { stdio: "inherit" });
    const doctor = await runLocalSandboxDoctor(hostPort);
    return { action, ...doctor, artifact_reference: artifactReference, host_port: hostPort };
  }
  if (action === "doctor") return { action, ...(await runLocalSandboxDoctor(hostPort)) };
  if (action === "status") {
    const artifactReference = readArtifact();
    const plan = createLocalSandboxPlan({ artifactReference, hostPort });
    const context = command("docker", ["context", "show"]).trim();
    const output = runPlanCommand(plan.status);
    return { action, docker_context: context, host_port: hostPort, compose: output.trim() };
  }
  if (action === "down") {
    const artifactReference = existsSync(ARTIFACT_FILE)
      ? readArtifact()
      : `sha256:${"0".repeat(64)}`;
    const plan = createLocalSandboxPlan({ artifactReference, hostPort });
    runPlanCommand(plan.down, { stdio: "inherit" });
    return { action, host_port: hostPort, volumes_preserved: true };
  }
  fail("local_sandbox_action_invalid", "Action must be build, up, doctor, status, or down.", {
    action,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: error.code ?? "local_sandbox_failed",
        message: error.message,
        details: error.details ?? {},
      },
    })}\n`);
    process.exitCode = 1;
  }
}
