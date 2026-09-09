import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { prepareReleaseCandidate, validateReleaseCandidate } from "./release-candidate.mjs";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const imageId = `sha256:${"c".repeat(64)}`;
const checks = [
  "sandbox_full_regression",
  "la06a_targeted_boundary_tests",
  "deployment_and_hosted_contracts",
  "contract_validation",
  "typescript_sdk",
  "prototype_lint",
  "prototype_build",
].map((id) => ({ id, status: "passed", exit_code: 0 }));

const createFixtures = () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci03-"));
  const paths = Object.fromEntries(
    ["request", "ci", "runtime", "imageId", "archive", "manifest", "notes"].map((name) => [
      `${name}Path`,
      join(directory, `${name}.${name === "archive" ? "tar" : name === "notes" ? "md" : "json"}`),
    ]),
  );
  const request = {
    schema_version: "ci03.release-request.v1",
    status: "accepted",
    candidate_version: "ledger-v0.1.0-rc.1",
    release_class: "ledger_core_local_integration_rc",
    source: { commit, tree, ref: "refs/heads/main", ref_protected: true, workflow_commit: commit },
    workflow_run: { id: "12345", attempt: "1" },
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
  const ci = {
    schema_version: "bu2.ci.v1",
    source: {
      commit,
      tree,
      event: "workflow_dispatch",
      ref: "refs/heads/main",
      workflow_sha: commit,
    },
    run: { id: "12345", attempt: "1", job: "prepare" },
    boundary: {
      environment: "local",
      execution_backend: "simulated",
      execution_disabled: true,
      provider_call: false,
      live_enabled: false,
      la06b: "not_executed",
    },
    checks,
  };
  const runtimeImage = {
    schema_version: "rt01.image.v1",
    status: "passed",
    image_id: imageId,
    source_commit: commit,
    node_version: "v22.16.0",
    npm_version: "10.9.2",
    runtime_identity: { uid: 10001, gid: 10001 },
    sqlite_version: "3.49.1",
    schema_version_number: 19,
    migration_versions: Array.from({ length: 19 }, (_, index) => index + 1),
    journal_mode: "wal",
    foreign_keys: 1,
    backup_restore: { integrity: "ok", same_schema: true, provider_replay: false },
    authorization: { signer_loaded: false, payment_execution_attempted: false, live_enabled: false },
  };
  writeFileSync(paths.requestPath, `${JSON.stringify(request, null, 2)}\n`);
  writeFileSync(paths.ciPath, `${JSON.stringify(ci, null, 2)}\n`);
  writeFileSync(paths.runtimePath, `${JSON.stringify(runtimeImage, null, 2)}\n`);
  writeFileSync(paths.imageIdPath, `${imageId}\n`);
  writeFileSync(paths.archivePath, "immutable docker archive fixture");
  return { directory, paths, request, ci, runtimeImage };
};

test("CI-03 binds source, image archive and evidence into a non-authorizing candidate", () => {
  const fixture = createFixtures();
  try {
    const manifest = prepareReleaseCandidate({
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      imageArchivePath: fixture.paths.archivePath,
      manifestPath: fixture.paths.manifestPath,
      notesPath: fixture.paths.notesPath,
    });
    assert.equal(manifest.status, "prepared_not_released");
    assert.equal(manifest.source.commit, commit);
    assert.equal(manifest.artifact.image_id, imageId);
    assert.deepEqual(manifest.workflow_run, { id: "12345", attempt: "1", job: "prepare" });
    assert.equal(manifest.approval.candidate_promotion_authorized, false);
    assert.ok(manifest.explicit_exclusions.includes("real_funds"));
    assert.match(readFileSync(fixture.paths.notesPath, "utf8"), /Prepared, not released/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("CI-03 detects archive and runtime evidence drift after candidate preparation", () => {
  const fixture = createFixtures();
  try {
    const manifest = prepareReleaseCandidate({
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      imageArchivePath: fixture.paths.archivePath,
      manifestPath: fixture.paths.manifestPath,
      notesPath: fixture.paths.notesPath,
    });
    const validation = () => validateReleaseCandidate(manifest, {
      request: fixture.request,
      ci: fixture.ci,
      runtimeImage: fixture.runtimeImage,
      imageId,
      imageArchivePath: fixture.paths.archivePath,
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
    });
    assert.equal(validation(), true);
    writeFileSync(fixture.paths.archivePath, "tampered archive");
    assert.equal(validation(), false);
    writeFileSync(fixture.paths.archivePath, "immutable docker archive fixture");
    writeFileSync(fixture.paths.runtimePath, "{}\n");
    assert.equal(validation(), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("CI-03 rejects CI evidence from another workflow run or source ref", () => {
  const fixture = createFixtures();
  try {
    const input = {
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      imageArchivePath: fixture.paths.archivePath,
      manifestPath: fixture.paths.manifestPath,
      notesPath: fixture.paths.notesPath,
    };
    writeFileSync(fixture.paths.ciPath, `${JSON.stringify({
      ...fixture.ci,
      run: { ...fixture.ci.run, attempt: "2" },
    }, null, 2)}\n`);
    assert.throws(() => prepareReleaseCandidate(input), /admitted workflow run/);

    writeFileSync(fixture.paths.ciPath, `${JSON.stringify({
      ...fixture.ci,
      source: { ...fixture.ci.source, ref: "refs/heads/feature" },
    }, null, 2)}\n`);
    assert.throws(() => prepareReleaseCandidate(input), /admitted workflow run/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
