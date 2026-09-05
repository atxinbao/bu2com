import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { listen } from "./server.mjs";

const executeFile = promisify(execFile);
const MAX_ELAPSED_MS = 15 * 60 * 1000;
const sandboxDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(sandboxDir);
const integrationDir = join(projectRoot, "integrations", "clean-room");
const sdkDir = join(projectRoot, "packages", "typescript-sdk");
const mcpEntry = join(sandboxDir, "bin", "bu2-mcp.mjs");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const contractVersions = JSON.parse(
  await readFile(join(projectRoot, "docs", "03-technical", "contract-versions.json"), "utf8"),
);
const cleanRoomSchema = JSON.parse(
  await readFile(
    join(projectRoot, "docs", "03-technical", "clean-room-evidence.schema.json"),
    "utf8",
  ),
);
const schemaValidator = addFormats(new Ajv({ allErrors: true, strict: true })).compile(
  cleanRoomSchema,
);

const sourceFiles = [
  "integrations/clean-room/http-client.mjs",
  "integrations/clean-room/sdk-client.mjs",
  "integrations/clean-room/mcp-client.mjs",
  "packages/typescript-sdk/src/client.ts",
  "packages/typescript-sdk/src/errors.ts",
  "packages/typescript-sdk/src/index.ts",
  "packages/typescript-sdk/src/types.ts",
  "sandbox/bin/bu2-mcp.mjs",
  "sandbox/external-agents/mcp-runtime.mjs",
  "sandbox/external-agents/mcp-server.mjs",
  "docs/03-technical/clean-room-evidence.schema.json",
  "docs/03-technical/contract-versions.json",
  "docs/03-technical/mcp-tools.json",
];

function childEnvironment(extra = {}) {
  const allowed = [
    "HOME",
    "PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "ComSpec",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "NODE_EXTRA_CA_CERTS",
  ];
  return Object.fromEntries([
    ...allowed.filter((name) => process.env[name]).map((name) => [name, process.env[name]]),
    ...Object.entries(extra),
  ]);
}

async function sourceDigest() {
  const hash = createHash("sha256");
  for (const relativePath of sourceFiles) {
    hash.update(relativePath);
    hash.update(await readFile(join(projectRoot, relativePath)));
  }
  return hash.digest("hex");
}

async function runCommand(command, args, options = {}) {
  return executeFile(command, args, {
    cwd: options.cwd,
    env: options.env ?? childEnvironment(),
    timeout: options.timeout ?? MAX_ELAPSED_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function parseClientResult(stdout) {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1)
    throw Object.assign(new Error("Unexpected client output."), { code: "client_output_invalid" });
  try {
    return JSON.parse(lines[0]);
  } catch {
    throw Object.assign(new Error("Client output was not valid JSON."), {
      code: "client_output_invalid",
    });
  }
}

function safeErrorCode(error) {
  if (typeof error?.code === "string" && /^[a-z0-9_]+$/i.test(error.code)) {
    return error.code.toLowerCase();
  }
  if (error?.killed) return "step_timed_out";
  return "clean_room_step_failed";
}

async function closeReferenceServer(running) {
  if (!running) return;
  await new Promise((resolve) => running.server.close(resolve));
  running.ledger.close();
}

async function writeProject(projectDir, pathName, dependency = null) {
  const packageJson = {
    name: `bu2-clean-room-${pathName}`,
    version: "0.0.0",
    private: true,
    type: "module",
    ...(dependency ? { dependencies: dependency } : {}),
  };
  await writeFile(join(projectDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await copyFile(join(integrationDir, `${pathName}-client.mjs`), join(projectDir, "index.mjs"));
}

async function runCleanRoomPath(pathName) {
  const startedAt = new Date();
  const startTime = Date.now();
  const steps = [];
  const failures = [];
  const recoveryActions = [];
  const beforeDigest = await sourceDigest();
  const projectDir = await mkdtemp(join(tmpdir(), `bu2-clean-room-${pathName}-`));
  const projectFresh = (await readdir(projectDir)).length === 0;
  let running;
  let clientResult = null;
  let pathError = null;
  let tempProjectRemoved = false;

  async function step(name, operation) {
    const stepStart = Date.now();
    try {
      const result = await operation();
      steps.push({ name, status: "passed", duration_ms: Date.now() - stepStart });
      return result;
    } catch (error) {
      const errorCode = safeErrorCode(error);
      steps.push({
        name,
        status: "failed",
        duration_ms: Date.now() - stepStart,
        error_code: errorCode,
      });
      failures.push({ stage: name, error_code: errorCode });
      recoveryActions.push({ stage: name, action: "stop_and_inspect_stage_evidence" });
      throw error;
    }
  }

  try {
    await step("scaffold_project", () => writeProject(projectDir, pathName));
    if (pathName === "sdk") {
      await step("build_sdk", () => runCommand(npmCommand, ["run", "build"], { cwd: sdkDir }));
      const packageDir = join(projectDir, "packages");
      await mkdir(packageDir);
      const packed = await step("pack_sdk", () =>
        runCommand(npmCommand, ["pack", "--json", "--pack-destination", packageDir], {
          cwd: sdkDir,
        }),
      );
      const packageResult = JSON.parse(packed.stdout);
      const tarball = join(packageDir, packageResult[0].filename);
      await writeProject(projectDir, pathName, { "@bu2/sdk": `file:${tarball}` });
      await step("install_sdk", () =>
        runCommand(
          npmCommand,
          ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
          { cwd: projectDir },
        ),
      );
    }
    if (pathName === "mcp") {
      await writeProject(projectDir, pathName, { "@modelcontextprotocol/client": "2.0.0" });
      await step("install_mcp_client", () =>
        runCommand(
          npmCommand,
          ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
          { cwd: projectDir },
        ),
      );
    }
    running = await step("start_reference_server", () => listen({ port: 0, dbPath: ":memory:" }));
    const runId = randomUUID().replaceAll("-", "").slice(0, 12);
    const execution = await step("execute_client", () =>
      runCommand(process.execPath, ["index.mjs"], {
        cwd: projectDir,
        env: childEnvironment({
          BU2_ENDPOINT: running.url,
          BU2_ENVIRONMENT: "simulation",
          BU2_RUN_ID: runId,
          ...(pathName === "mcp" ? { BU2_MCP_ENTRY: mcpEntry } : {}),
        }),
      }),
    );
    clientResult = parseClientResult(execution.stdout);
    steps.push(...clientResult.steps.map((item) => ({ ...item, name: `client.${item.name}` })));
    await step("verify_acceptance_result", async () => {
      assert.equal(clientResult.path, pathName);
      assert.equal(clientResult.environment, "simulation");
      assert.equal(clientResult.transaction_status, "settled");
      assert.match(clientResult.receipt_id, /^rcpt_/);
      assert.equal(clientResult.receipt_valid, true);
      assert.ok(Array.isArray(clientResult.steps) && clientResult.steps.length >= 6);
    });
  } catch (error) {
    pathError = error;
  } finally {
    try {
      await step("stop_reference_server", () => closeReferenceServer(running));
    } catch (error) {
      pathError ??= error;
    }
    try {
      await step("remove_temp_project", () => rm(projectDir, { recursive: true, force: true }));
      tempProjectRemoved = true;
    } catch (error) {
      pathError ??= error;
    }
  }

  const finishedAt = new Date();
  const elapsedMs = Date.now() - startTime;
  const afterDigest = await sourceDigest();
  if (beforeDigest !== afterDigest && failures.length === 0) {
    failures.push({ stage: "source_integrity", error_code: "source_changed" });
    recoveryActions.push({ stage: "source_integrity", action: "stop_and_restore_source_baseline" });
  }
  return {
    path: pathName,
    status: failures.length === 0 ? "passed" : "failed",
    environment: "simulation",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    elapsed_ms: elapsedMs,
    within_limit: elapsedMs < MAX_ELAPSED_MS,
    project_fresh: projectFresh,
    source_unchanged: beforeDigest === afterDigest,
    temp_project_removed: tempProjectRemoved,
    transaction_status: clientResult?.transaction_status ?? null,
    receipt_id: clientResult?.receipt_id ?? null,
    receipt_valid: clientResult?.receipt_valid ?? null,
    steps,
    failures,
    recovery_actions: recoveryActions,
    ...(pathError ? { stopped_after_failure: true } : {}),
  };
}

export function validateCleanRoomEvidence(evidence) {
  assert.equal(schemaValidator(evidence), true, JSON.stringify(schemaValidator.errors));
  assert.equal(evidence.schema_version, "0.1.0");
  assert.equal(evidence.environment, "simulation");
  assert.equal(evidence.max_elapsed_ms, MAX_ELAPSED_MS);
  assert.deepEqual(
    evidence.paths.map(({ path }) => path),
    ["http", "sdk", "mcp"],
  );
  for (const result of evidence.paths) {
    assert.equal(result.status, "passed");
    assert.equal(result.within_limit, true);
    assert.equal(result.project_fresh, true);
    assert.equal(result.source_unchanged, true);
    assert.equal(result.temp_project_removed, true);
    assert.equal(result.transaction_status, "settled");
    assert.match(result.receipt_id, /^rcpt_/);
    assert.equal(result.receipt_valid, true);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.recovery_actions, []);
    assert.ok(result.steps.every(({ status }) => status === "passed"));
  }
  assert.deepEqual(evidence.summary, { total: 3, passed: 3, failed: 0 });
  assert.deepEqual(evidence.analytics, {
    remote_enabled: false,
    upload_attempted: false,
    persistence: "none",
    retention: "process_lifetime",
  });
  return evidence;
}

export async function runCleanRoomAcceptance() {
  const paths = [];
  for (const pathName of ["http", "sdk", "mcp"]) {
    paths.push(await runCleanRoomPath(pathName));
  }
  const evidence = {
    schema_version: contractVersions.clean_room_evidence,
    generated_at: new Date().toISOString(),
    environment: "simulation",
    max_elapsed_ms: MAX_ELAPSED_MS,
    paths,
    summary: {
      total: paths.length,
      passed: paths.filter(({ status }) => status === "passed").length,
      failed: paths.filter(({ status }) => status === "failed").length,
    },
    analytics: {
      remote_enabled: false,
      upload_attempted: false,
      persistence: "none",
      retention: "process_lifetime",
    },
  };
  return evidence;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const evidence = await runCleanRoomAcceptance();
    console.log(JSON.stringify(evidence, null, 2));
    validateCleanRoomEvidence(evidence);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "bu2.clean_room.failed",
        code: safeErrorCode(error),
        recovery: "stop_and_inspect_stage_evidence",
      }),
    );
    process.exitCode = 1;
  }
}
