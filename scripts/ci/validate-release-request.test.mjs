import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateReleaseRequest } from "./validate-release-request.mjs";

const commit = "a".repeat(40);
const validRequest = {
  candidateVersion: "social-wallet-v0.1.0-rc.1",
  requestedCommit: commit,
  workflowCommit: commit,
  workflowRef: "refs/heads/main",
  workflowRefProtected: true,
  workflowEvent: "workflow_dispatch",
  workflowRunId: "12345",
  workflowRunAttempt: "1",
  actualCommit: commit,
  actualTree: "b".repeat(40),
  dirtyStatus: "",
  tagExists: false,
};

test("CI-03 accepts only a clean protected-main request bound to the workflow commit", () => {
  const request = validateReleaseRequest(validRequest);
  assert.equal(request.status, "accepted");
  assert.equal(request.source.commit, commit);
  assert.equal(request.source.ref_protected, true);
  assert.deepEqual(request.workflow_run, { id: "12345", attempt: "1" });
  assert.equal(request.authorization.candidate_preparation, true);
  assert.equal(request.authorization.tag_creation, false);
  assert.equal(request.authorization.payment_execution, false);
});

test("CI-03 rejects unprotected refs, commit drift, dirty trees and occupied versions", () => {
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, workflowRefProtected: false }),
    /not protected/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, workflowCommit: "c".repeat(40) }),
    /must be identical/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, dirtyStatus: " M sandbox/domain.mjs" }),
    /must be clean/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, tagExists: true }),
    /already exists/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, candidateVersion: "latest" }),
    /RC pattern/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...validRequest, workflowRunAttempt: "0" }),
    /positive integers/,
  );
});

test("CI-03 CLI fails closed when the current checkout is presented as an unprotected main ref", () => {
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./validate-release-request.mjs", import.meta.url))], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      BU2_CANDIDATE_VERSION: "social-wallet-v0.1.0-rc.1",
      BU2_CANDIDATE_SOURCE_COMMIT: actualCommit,
      BU2_WORKFLOW_SOURCE_COMMIT: actualCommit,
      BU2_WORKFLOW_REF: "refs/heads/main",
      BU2_WORKFLOW_REF_PROTECTED: "false",
      BU2_WORKFLOW_EVENT: "workflow_dispatch",
      BU2_WORKFLOW_RUN_ID: "12345",
      BU2_WORKFLOW_RUN_ATTEMPT: "1",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /main ref is not protected/);
  assert.equal(result.stdout, "");
});

test("CI-03 CLI writes its request file only after validating a clean checkout", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci03-request-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    writeFileSync(join(directory, "source.txt"), "candidate source\n");
    execFileSync("git", ["add", "source.txt"], { cwd: directory });
    execFileSync("git", [
      "-c", "user.name=BU2 CI",
      "-c", "user.email=ci@example.invalid",
      "commit", "--quiet", "-m", "candidate source",
    ], { cwd: directory });
    const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    const outputPath = join(directory, "release-request.json");
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./validate-release-request.mjs", import.meta.url)),
      outputPath,
    ], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        BU2_CANDIDATE_VERSION: "social-wallet-v0.1.0-rc.1",
        BU2_CANDIDATE_SOURCE_COMMIT: actualCommit,
        BU2_WORKFLOW_SOURCE_COMMIT: actualCommit,
        BU2_WORKFLOW_REF: "refs/heads/main",
        BU2_WORKFLOW_REF_PROTECTED: "true",
        BU2_WORKFLOW_EVENT: "workflow_dispatch",
        BU2_WORKFLOW_RUN_ID: "12345",
        BU2_WORKFLOW_RUN_ATTEMPT: "1",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).status, "accepted");
    assert.match(
      execFileSync("git", ["status", "--porcelain"], { cwd: directory, encoding: "utf8" }),
      /\?\? release-request\.json/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
