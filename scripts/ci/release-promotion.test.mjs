import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runSocialWalletAcceptance } from "../../sandbox/social-wallet-acceptance.mjs";
import { prepareReleaseCandidate } from "./release-candidate.mjs";
import { approveReleasePromotion, expectedApprovalStatement } from "./release-promotion.mjs";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const imageId = `sha256:${"c".repeat(64)}`;
const candidateVersion = "social-wallet-v0.2.0-rc.2";
const candidateRunId = "12345";
const candidateRunAttempt = "1";
const checkIds = [
  "sandbox_full_regression",
  "la06a_targeted_boundary_tests",
  "deployment_and_hosted_contracts",
  "contract_validation",
  "typescript_sdk",
  "prototype_lint",
  "prototype_build",
];

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "bu2-promotion-"));
  const path = (name) => join(directory, name);
  const request = {
    schema_version: "ci03.release-request.v3",
    status: "accepted",
    candidate_version: candidateVersion,
    release_class: "social_wallet_local_integration_rc",
    source: {
      commit,
      tree,
      ref: "refs/heads/main",
      ref_protected: false,
      workflow_commit: commit,
    },
    workflow_run: { id: candidateRunId, attempt: candidateRunAttempt },
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      execution_status: "execution_disabled",
      provider_call: false,
      signer_loaded: false,
      payment_execution_attempted: false,
      live_enabled: false,
      la06b: "not_executed",
    },
    authorization: {
      candidate_preparation: true,
      tag_creation: false,
      github_release_creation: false,
      registry_publish: false,
      payment_execution: false,
    },
  };
  const checks = checkIds.map((id) => ({ id, status: "passed", exit_code: 0 }));
  const ci = {
    schema_version: "bu2.ci.v2",
    status: "accepted",
    source: {
      commit,
      tree,
      event: "workflow_dispatch",
      ref: "refs/heads/main",
      workflow_sha: commit,
    },
    run: { id: candidateRunId, attempt: candidateRunAttempt, job: "prepare" },
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      execution_disabled: true,
      provider_call: false,
      live_enabled: false,
      la06b: "not_executed",
    },
    checks,
    observations: {
      la06a: {
        status: "passed",
        required_to_run: true,
        required_to_pass: false,
        failed_check_ids: [],
      },
    },
  };
  const runtime = {
    schema_version: "rt01.image.v1",
    status: "passed",
    image_id: imageId,
    source_commit: commit,
    node_version: "v24.20.0",
    npm_version: "11.19.0",
    runtime_identity: { uid: 10001, gid: 10001 },
    sqlite_version: "3.53.4",
    schema_version_number: 22,
    migration_versions: Array.from({ length: 22 }, (_, index) => index + 1),
    journal_mode: "wal",
    foreign_keys: 1,
    backup_restore: { integrity: "ok", same_schema: true, provider_replay: false },
    authorization: { signer_loaded: false, payment_execution_attempted: false, live_enabled: false },
  };
  const socialWallet = await runSocialWalletAcceptance({ sourceCommit: commit, imageId });
  const paths = {
    requestPath: path("release-request.json"),
    ciEvidencePath: path("ci-evidence.json"),
    runtimeImageEvidencePath: path("runtime-image-assurance.json"),
    runtimeImageIdPath: path("runtime-image-id"),
    socialWalletEvidencePath: path("social-wallet-acceptance.json"),
    imageArchivePath: path("ledger-release-image.tar"),
    manifestPath: path("release-candidate.json"),
    candidateNotesPath: path("candidate-notes.md"),
    candidateRunPath: path("candidate-run.json"),
    approvalPath: path("release-approval.json"),
    notesPath: path("release-notes.md"),
  };
  writeFileSync(paths.requestPath, `${JSON.stringify(request, null, 2)}\n`);
  writeFileSync(paths.ciEvidencePath, `${JSON.stringify(ci, null, 2)}\n`);
  writeFileSync(paths.runtimeImageEvidencePath, `${JSON.stringify(runtime, null, 2)}\n`);
  writeFileSync(paths.runtimeImageIdPath, `${imageId}\n`);
  writeFileSync(paths.socialWalletEvidencePath, `${JSON.stringify(socialWallet, null, 2)}\n`);
  writeFileSync(paths.imageArchivePath, "immutable docker archive fixture");
  writeFileSync(paths.candidateRunPath, `${JSON.stringify({
    id: Number(candidateRunId),
    run_attempt: Number(candidateRunAttempt),
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: commit,
    path: ".github/workflows/ledger-release-candidate.yml",
  }, null, 2)}\n`);
  prepareReleaseCandidate({
    requestPath: paths.requestPath,
    ciEvidencePath: paths.ciEvidencePath,
    runtimeImageEvidencePath: paths.runtimeImageEvidencePath,
    runtimeImageIdPath: paths.runtimeImageIdPath,
    socialWalletEvidencePath: paths.socialWalletEvidencePath,
    imageArchivePath: paths.imageArchivePath,
    manifestPath: paths.manifestPath,
    notesPath: paths.candidateNotesPath,
  });
  return { directory, paths };
}

function approvalInput(paths) {
  return {
    ...paths,
    actor: "atxinbao",
    workflowEvent: "workflow_dispatch",
    workflowRef: "refs/heads/main",
    workflowCommit: commit,
    workflowRunId: "45678",
    workflowRunAttempt: "1",
    candidateRunId,
    candidateRunAttempt,
    candidateVersion,
    sourceCommit: commit,
    approvalStatement: expectedApprovalStatement(candidateVersion, commit),
    approvedAt: "2026-09-11T12:00:00.000Z",
  };
}

test("CI-03 promotes an exact successful candidate with truthful observations", async () => {
  const value = await fixture();
  try {
    const approval = approveReleasePromotion(approvalInput(value.paths));
    assert.equal(approval.status, "approved_for_github_prerelease");
    assert.equal(approval.observations.main_ref_protected, false);
    assert.equal(approval.observations.la06a.required_to_pass, false);
    assert.equal(approval.authorization.tag_creation, true);
    assert.equal(approval.authorization.github_prerelease_creation, true);
    assert.equal(approval.authorization.registry_publish, false);
    assert.equal(approval.authorization.payment_execution, false);
    assert.equal(JSON.parse(readFileSync(value.paths.approvalPath, "utf8")).source.commit, commit);
    assert.match(readFileSync(value.paths.notesPath, "utf8"), /LA-06a observation: `passed`/);
    assert.match(readFileSync(value.paths.notesPath, "utf8"), /Source ref protected: `false`/);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("CI-03 preserves a failed LA-06a result while approving the bounded prerelease", async () => {
  const value = await fixture();
  try {
    const manifest = JSON.parse(readFileSync(value.paths.manifestPath, "utf8"));
    const ci = JSON.parse(readFileSync(value.paths.ciEvidencePath, "utf8"));
    ci.checks[1] = { ...ci.checks[1], status: "failed", exit_code: 1 };
    ci.observations.la06a = {
      status: "failed",
      required_to_run: true,
      required_to_pass: false,
      failed_check_ids: ["la06a_targeted_boundary_tests"],
    };
    writeFileSync(value.paths.ciEvidencePath, `${JSON.stringify(ci, null, 2)}\n`);
    manifest.quality_observation.la06a = ci.observations.la06a;
    manifest.evidence.ci_manifest_sha256 = (await import("node:crypto"))
      .createHash("sha256")
      .update(readFileSync(value.paths.ciEvidencePath))
      .digest("hex");
    writeFileSync(value.paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const approval = approveReleasePromotion(approvalInput(value.paths));
    assert.equal(approval.observations.la06a.status, "failed");
    assert.deepEqual(approval.observations.la06a.failed_check_ids, ["la06a_targeted_boundary_tests"]);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("CI-03 rejects the wrong owner, approval, candidate run, or artifact bytes", async () => {
  const value = await fixture();
  try {
    const input = approvalInput(value.paths);
    assert.throws(
      () => approveReleasePromotion({ ...input, actor: "another-user" }),
      /Project Owner/,
    );
    assert.throws(
      () => approveReleasePromotion({ ...input, approvalStatement: "approve" }),
      /exact candidate/,
    );
    const candidateRun = JSON.parse(readFileSync(value.paths.candidateRunPath, "utf8"));
    writeFileSync(value.paths.candidateRunPath, `${JSON.stringify({ ...candidateRun, conclusion: "failure" })}\n`);
    assert.throws(() => approveReleasePromotion(input), /successful exact-main/);
    writeFileSync(value.paths.candidateRunPath, `${JSON.stringify(candidateRun)}\n`);
    writeFileSync(value.paths.imageArchivePath, "different archive bytes");
    assert.throws(() => approveReleasePromotion(input), /hashes/);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("CI-03 promotion workflow only downloads, validates, tags, and creates a prerelease", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/social-wallet-release-promotion.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /permissions:\n  actions: read\n  contents: write/);
  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /npm --prefix sandbox ci/);
  assert.ok(
    workflow.indexOf("npm --prefix sandbox ci") <
      workflow.indexOf("node scripts/ci/release-promotion.mjs"),
  );
  assert.match(workflow, /node scripts\/ci\/release-promotion\.mjs/);
  assert.match(workflow, /git tag -a/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--prerelease/);
  assert.doesNotMatch(workflow, /docker build|docker push|npm publish|pull_request_target/);
});
