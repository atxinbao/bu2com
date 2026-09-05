import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  DOCTOR_STAGES,
  MINIMUM_NODE_VERSION,
  parseDoctorArgs,
  renderDoctorHuman,
  runDoctor,
  runDoctorCli,
} from "./doctor.mjs";
import { Bu2McpCompatibilityError } from "./external-agents/mcp-runtime.mjs";
import { listen } from "./server.mjs";

const schema = JSON.parse(
  readFileSync(new URL("../docs/03-technical/doctor-result.schema.json", import.meta.url), "utf8"),
);
const validate = addFormats(new Ajv({ allErrors: true })).compile(schema);
const doctorPath = fileURLToPath(new URL("./bin/bu2-doctor.mjs", import.meta.url));

function assertValid(result) {
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.deepEqual(
    result.checks.map(({ stage }) => stage),
    DOCTOR_STAGES,
  );
  assert.deepEqual(result.analytics.records, result.checks);
  assert.equal(result.analytics.remote_enabled, false);
  assert.equal(result.analytics.upload_attempted, false);
  assert.equal(result.analytics.persistence, "none");
}

async function closeRunning(running) {
  await new Promise((resolve) => running.server.close(resolve));
  running.ledger.close();
}

async function createReceipt(sandbox) {
  const quote = sandbox.createQuote(
    {
      seller_agent_id: "agt_doctor_seller",
      payee_account_id: "acct_doctor_seller",
      item: { name: "Doctor dataset", delivery_type: "dataset_access" },
      amount: { value: 3900, currency: "CNY" },
      expires_at: "2099-09-06T12:00:00Z",
    },
    "doctor-quote-key",
  );
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_doctor_buyer",
      buyer_agent_id: "agt_doctor_buyer",
      payment_mandate_id: "mdt_doctor_buyer",
      amount: { value: 3900, currency: "CNY" },
      purpose: "Doctor receipt verification",
    },
    "doctor-intent-key",
  );
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "doctor-authorize-key",
  );
  sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:doctorreceipt" },
    "doctor-delivery-key",
  );
  const settled = await sandbox.settle(authorized.transaction_id, {}, "doctor-settlement-key");
  return settled.receipt.id;
}

function runExecutable(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [doctorPath, "--format", "json"], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("doctor CLI arguments are explicit and reject ambiguous input", () => {
  assert.deepEqual(parseDoctorArgs([]), {
    format: "human",
    language: "zh",
    receiptId: undefined,
    help: false,
  });
  assert.deepEqual(parseDoctorArgs(["--format", "json", "--language", "en"]), {
    format: "json",
    language: "en",
    receiptId: undefined,
    help: false,
  });
  assert.throws(() => parseDoctorArgs(["--format", "xml"]), /human or json/);
  assert.throws(() => parseDoctorArgs(["--receipt-id", "not-a-receipt"]), /rcpt_/);
  assert.throws(() => parseDoctorArgs(["--help", "--format", "json"]), /cannot be combined/);
});

test("doctor checks a real endpoint and MCP session before reporting Receipt capability", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => closeRunning(running));
  const result = await runDoctor({
    environment: { BU2_ENDPOINT: running.url, BU2_ENVIRONMENT: "simulation" },
  });
  assertValid(result);
  assert.equal(result.result, "passed");
  assert.equal(result.environment, "simulation");
  assert.equal(result.receipt_verification, "capability_available");
  assert.ok(result.checks.every(({ result_category }) => result_category === "passed"));
});

test("doctor verifies an explicitly supplied real Receipt through MCP", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => closeRunning(running));
  const receiptId = await createReceipt(running.sandbox);
  const result = await runDoctor({
    environment: { BU2_ENDPOINT: running.url, BU2_ENVIRONMENT: "simulation" },
    receiptId,
  });
  assertValid(result);
  assert.equal(result.result, "passed");
  assert.equal(result.receipt_verification, "verified");
});

test("doctor blocks all network checks when Node is unsupported", async () => {
  let preflightCalled = false;
  const result = await runDoctor({
    nodeVersion: "20.0.0",
    preflight: async () => {
      preflightCalled = true;
    },
  });
  assertValid(result);
  assert.equal(preflightCalled, false);
  assert.equal(result.result, "failed");
  assert.equal(result.failure.code, "node_version_unsupported");
  assert.equal(result.failure.retry, "retry_after_fix");
  assert.equal(result.checks[0].result_category, "failed");
  assert.equal(result.checks[1].result_category, "blocked");
  assert.equal(result.versions.minimum_node, MINIMUM_NODE_VERSION);
});

test("doctor rejects Mainnet configuration without leaking configured sensitive values", async () => {
  const result = await runDoctor({
    environment: {
      BU2_ENDPOINT: "https://user:private-value@example.com",
      BU2_ENVIRONMENT: "mainnet",
    },
  });
  assertValid(result);
  const serialized = JSON.stringify(result);
  assert.equal(result.result, "failed");
  assert.equal(result.failure.stage, "configuration");
  assert.equal(serialized.includes("private-value"), false);
  assert.equal(serialized.includes("example.com"), false);
});

test("doctor classifies endpoint failure and preserves only valid correlation ids", async () => {
  const result = await runDoctor({
    environment: {
      BU2_ENDPOINT: "http://127.0.0.1:3100",
      BU2_ENVIRONMENT: "simulation",
    },
    preflight: async () => {
      throw new Bu2McpCompatibilityError(
        "endpoint_incompatible",
        `Secret ${"sk-" + "proj-" + "this-must-never-leak"}`,
        {
          request_id: "req_doctor_endpoint",
          trace_id: "trc_doctor_endpoint",
          private_key: `0x${"a".repeat(64)}`,
        },
      );
    },
  });
  assertValid(result);
  const serialized = JSON.stringify(result);
  assert.equal(result.failure.stage, "endpoint");
  assert.equal(result.failure.request_id, "req_doctor_endpoint");
  assert.equal(result.failure.trace_id, "trc_doctor_endpoint");
  assert.equal(result.failure.retry, "retry_after_fix");
  assert.equal(serialized.includes("sk-" + "proj"), false);
  assert.equal(serialized.includes("0xaaaaaaaa"), false);
});

test("doctor identifies contract mismatch before MCP startup", async () => {
  let mcpCalled = false;
  const result = await runDoctor({
    environment: {
      BU2_ENDPOINT: "http://127.0.0.1:3100",
      BU2_ENVIRONMENT: "simulation",
    },
    preflight: async () => {
      throw new Bu2McpCompatibilityError("api_contract_version_mismatch", "Wrong API version.");
    },
    connectMcp: async () => {
      mcpCalled = true;
    },
  });
  assertValid(result);
  assert.equal(mcpCalled, false);
  assert.equal(result.failure.stage, "contract");
  assert.equal(result.checks[3].result_category, "blocked");
  assert.equal(result.checks[4].result_category, "failed");
  assert.equal(result.checks[5].result_category, "blocked");
});

test("doctor distinguishes endpoint environment mismatch from contract failure", async () => {
  const result = await runDoctor({
    environment: {
      BU2_ENDPOINT: "http://127.0.0.1:3100",
      BU2_ENVIRONMENT: "testnet",
    },
    preflight: async () => {
      throw new Bu2McpCompatibilityError(
        "environment_mismatch",
        "Configured testnet but endpoint reported simulation.",
      );
    },
  });
  assertValid(result);
  assert.equal(result.environment, "testnet");
  assert.equal(result.failure.stage, "environment");
  assert.equal(result.failure.recovery, "match_endpoint_environment");
  assert.equal(result.checks[2].result_category, "passed");
  assert.equal(result.checks[3].result_category, "failed");
  assert.equal(result.checks[4].error_code, "blocked_by_environment");
});

test("doctor rejects MCP tool drift and still closes the client", async () => {
  let closed = false;
  const result = await runDoctor({
    environment: {
      BU2_ENDPOINT: "http://127.0.0.1:3100",
      BU2_ENVIRONMENT: "simulation",
    },
    preflight: async () => ({}),
    connectMcp: async () => ({
      listTools: async () => [{ name: "unexpected_tool" }],
      close: async () => {
        closed = true;
      },
    }),
  });
  assertValid(result);
  assert.equal(closed, true);
  assert.equal(result.failure.stage, "mcp_startup");
  assert.equal(result.failure.code, "mcp_tool_contract_mismatch");
  assert.equal(result.checks[6].result_category, "blocked");
});

test("human output provides full Chinese or English recovery guidance", () => {
  const checks = DOCTOR_STAGES.map((stage, index) => ({
    stage,
    result_category: index === 2 ? "failed" : index > 2 ? "blocked" : "passed",
    duration_ms: 1,
    error_code: index === 2 ? "endpoint_unreachable" : index > 2 ? "blocked_by_endpoint" : null,
  }));
  const result = {
    result: "failed",
    checks,
    failure: {
      code: "endpoint_unreachable",
      retry: "retry_safe",
    },
  };
  const zh = renderDoctorHuman(result, "zh");
  const en = renderDoctorHuman(result, "en");
  assert.match(zh, /接入诊断：失败/);
  assert.match(zh, /恢复建议：启动 BU2 Reference Server/);
  assert.match(en, /integration doctor: FAILED/);
  assert.match(en, /Recovery: Start the BU2 Reference Server/);
  assert.equal(zh.includes("Recovery:"), false);
  assert.equal(en.includes("恢复建议"), false);
});

test("stable doctor executable emits schema-valid JSON without stderr diagnostics", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => closeRunning(running));
  const execution = await runExecutable({
    BU2_ENDPOINT: running.url,
    BU2_ENVIRONMENT: "simulation",
  });
  assert.equal(execution.status, 0);
  assert.equal(execution.stderr, "");
  const result = JSON.parse(execution.stdout);
  assertValid(result);
  assert.equal(result.result, "passed");
});

test("CLI returns a stable non-zero result for invalid arguments", async () => {
  const stdout = [];
  const stderr = [];
  const status = await runDoctorCli({
    args: ["--format", "xml"],
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  assert.equal(status, 1);
  assert.deepEqual(stdout, []);
  assert.deepEqual(JSON.parse(stderr[0]), {
    code: "cli_argument_invalid",
    recovery: "use_help",
  });
});
