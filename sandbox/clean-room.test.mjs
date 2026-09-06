import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { validateCleanRoomEvidence } from "./clean-room.mjs";

function pathResult(path) {
  return {
    path,
    status: "passed",
    environment: "local",
    environment_contract_version: "1.0",
    execution_backend: "simulated",
    started_at: "2026-09-06T00:00:00.000Z",
    finished_at: "2026-09-06T00:00:01.000Z",
    elapsed_ms: 1000,
    within_limit: true,
    project_fresh: true,
    source_unchanged: true,
    temp_project_removed: true,
    transaction_status: "settled",
    receipt_id: `rcpt_clean_${path}`,
    receipt_valid: true,
    steps: [{ name: "verify_receipt", status: "passed", duration_ms: 1 }],
    failures: [],
    recovery_actions: [],
  };
}

function evidence() {
  return {
    schema_version: "0.2.0",
    generated_at: "2026-09-06T00:00:01.000Z",
    environment: "local",
    environment_contract_version: "1.0",
    execution_backend: "simulated",
    max_elapsed_ms: 900000,
    paths: [pathResult("http"), pathResult("sdk"), pathResult("mcp")],
    summary: { total: 3, passed: 3, failed: 0 },
    analytics: {
      remote_enabled: false,
      upload_attempted: false,
      persistence: "none",
      retention: "process_lifetime",
    },
  };
}

test("clean-room evidence requires all three successful bounded paths", () => {
  assert.equal(validateCleanRoomEvidence(evidence()).summary.passed, 3);
  for (const mutate of [
    (value) => (value.paths[0].receipt_valid = false),
    (value) => (value.paths[1].project_fresh = false),
    (value) => (value.paths[2].source_unchanged = false),
    (value) => (value.paths[0].within_limit = false),
  ]) {
    const invalid = evidence();
    mutate(invalid);
    assert.throws(() => validateCleanRoomEvidence(invalid));
  }
});

test("clean-room evidence matches the versioned machine-readable schema", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../docs/03-technical/clean-room-evidence.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const value = evidence();
  assert.equal(validate(value), true, JSON.stringify(validate.errors));

  const failed = evidence();
  failed.paths[1] = {
    ...failed.paths[1],
    status: "failed",
    within_limit: false,
    transaction_status: null,
    receipt_id: null,
    receipt_valid: null,
    steps: [
      {
        name: "install_sdk",
        status: "failed",
        duration_ms: 1,
        error_code: "enotfound",
      },
    ],
    failures: [{ stage: "install_sdk", error_code: "enotfound" }],
    recovery_actions: [
      { stage: "install_sdk", action: "stop_and_inspect_stage_evidence" },
    ],
    stopped_after_failure: true,
  };
  failed.summary = { total: 3, passed: 2, failed: 1 };
  assert.equal(validate(failed), true, JSON.stringify(validate.errors));
  assert.throws(() => validateCleanRoomEvidence(failed));
});

test("clean-room clients use the intended external integration boundary", () => {
  const http = readFileSync(
    new URL("../integrations/clean-room/http-client.mjs", import.meta.url),
    "utf8",
  );
  const sdk = readFileSync(
    new URL("../integrations/clean-room/sdk-client.mjs", import.meta.url),
    "utf8",
  );
  const mcp = readFileSync(
    new URL("../integrations/clean-room/mcp-client.mjs", import.meta.url),
    "utf8",
  );

  assert.match(http, /fetch\(/);
  assert.doesNotMatch(http, /\.\.\/\.\.\/sandbox/);
  assert.match(sdk, /from "@bu2\/sdk"/);
  assert.doesNotMatch(sdk, /packages\/typescript-sdk|\.\.\/\.\./);
  assert.match(mcp, /from "@modelcontextprotocol\/client"/);
  assert.match(mcp, /BU2_MCP_ENTRY/);
  assert.doesNotMatch(mcp, /external-agents\/mcp-client/);
});

test("clean-room sources never declare Mainnet, telemetry, or source mutation", () => {
  const files = [
    "../integrations/clean-room/http-client.mjs",
    "../integrations/clean-room/sdk-client.mjs",
    "../integrations/clean-room/mcp-client.mjs",
    "./clean-room.mjs",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /BU2_ENVIRONMENT:\s*"mainnet"|remote_enabled:\s*true|upload_attempted:\s*true/,
    );
    assert.doesNotMatch(source, /git\s+(checkout|reset|clean)|rm\s+-rf/);
  }
});
