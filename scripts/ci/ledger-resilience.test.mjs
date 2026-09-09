import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  NIGHTLY_CHECKS,
  runNightlyResilience,
  summarizeNodeTest,
  validateNightlyEvidence,
} from "./ledger-resilience.mjs";

const summary = "ℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n";

test("CI-04 parses complete Node test summaries and rejects skipped coverage", () => {
  assert.deepEqual(summarizeNodeTest(summary), {
    tests: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    todo: 0,
  });
  assert.equal(summarizeNodeTest("ℹ tests 0\n").tests, 0);
  assert.equal(summarizeNodeTest("ℹ skipped 2\n").skipped, 2);
});

test("CI-04 runs every resilience category and preserves full stdout and stderr", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci04-resilience-"));
  const checks = [
    { id: "first", program: "node", args: ["--version"] },
    { id: "second", program: "node", args: ["--version"] },
  ];
  let calls = 0;
  try {
    const evidence = runNightlyResilience({
      outputDirectory: directory,
      checks,
      spawn: () => {
        calls += 1;
        return calls === 1
          ? { status: 0, signal: null, stdout: summary, stderr: "first diagnostic\n" }
          : { status: 1, signal: null, stdout: summary, stderr: "second failure\n" };
      },
    });
    assert.equal(calls, 2);
    assert.equal(evidence.status, "failed");
    assert.deepEqual(
      evidence.checks.map((entry) => entry.status),
      ["passed", "failed"],
    );
    assert.equal(readFileSync(join(directory, "first.stderr.log"), "utf8"), "first diagnostic\n");
    assert.equal(readFileSync(join(directory, "second.stderr.log"), "utf8"), "second failure\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CI-04 evidence requires exact categories, tests, hashes and disabled execution", () => {
  const evidence = {
    schema_version: "ci04.ledger-resilience.v1",
    status: "passed",
    source: { commit: "a".repeat(40), tree: "b".repeat(40) },
    property_seeds: ["a", "b", "c", "d"],
    checks: NIGHTLY_CHECKS.map((check) => ({
      id: check.id,
      status: "passed",
      exit_code: 0,
      test_summary: { tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0 },
      logs: { stdout_sha256: "c".repeat(64), stderr_sha256: "d".repeat(64) },
    })),
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      provider_call: false,
      signer_loaded: false,
      payment_execution_attempted: false,
      live_enabled: false,
      la06b: "not_executed",
    },
  };
  assert.equal(validateNightlyEvidence(evidence), true);
  assert.equal(
    validateNightlyEvidence({
      ...evidence,
      checks: evidence.checks.map((check, index) =>
        index === 1 ? { ...check, test_summary: { ...check.test_summary, skipped: 1 } } : check,
      ),
    }),
    false,
  );
  assert.equal(
    validateNightlyEvidence({
      ...evidence,
      boundary: { ...evidence.boundary, provider_call: true },
    }),
    false,
  );
});

test("CI-04 workflow pins the approved Node runtime and read-only permissions", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/ledger-nightly.yml", import.meta.url),
    "utf8",
  );
  assert.equal(
    workflow.match(/actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/g)?.length,
    2,
  );
  assert.equal(workflow.match(/node-version: 24\.20\.0/g)?.length, 2);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});
