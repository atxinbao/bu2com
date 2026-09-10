import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { prepareReleaseCandidate, validateReleaseCandidate } from "./release-candidate.mjs";
import { runSocialWalletAcceptance } from "../../sandbox/social-wallet-acceptance.mjs";

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

const createFixtures = async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci03-"));
  const paths = Object.fromEntries(
    ["request", "ci", "runtime", "imageId", "socialWallet", "archive", "manifest", "notes"].map((name) => [
      `${name}Path`,
      join(directory, `${name}.${name === "archive" ? "tar" : name === "notes" ? "md" : "json"}`),
    ]),
  );
  const request = {
    schema_version: "ci03.release-request.v1",
    status: "accepted",
    candidate_version: "social-wallet-v0.1.0-rc.1",
    release_class: "social_wallet_local_integration_rc",
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
    node_version: "v24.20.0",
    npm_version: "11.19.0",
    runtime_identity: { uid: 10001, gid: 10001 },
    sqlite_version: "3.53.4",
    schema_version_number: 21,
    migration_versions: Array.from({ length: 21 }, (_, index) => index + 1),
    journal_mode: "wal",
    foreign_keys: 1,
    backup_restore: { integrity: "ok", same_schema: true, provider_replay: false },
    authorization: { signer_loaded: false, payment_execution_attempted: false, live_enabled: false },
  };
  const socialWallet = await runSocialWalletAcceptance({ sourceCommit: commit, imageId });
  writeFileSync(paths.requestPath, `${JSON.stringify(request, null, 2)}\n`);
  writeFileSync(paths.ciPath, `${JSON.stringify(ci, null, 2)}\n`);
  writeFileSync(paths.runtimePath, `${JSON.stringify(runtimeImage, null, 2)}\n`);
  writeFileSync(paths.imageIdPath, `${imageId}\n`);
  writeFileSync(paths.socialWalletPath, `${JSON.stringify(socialWallet, null, 2)}\n`);
  writeFileSync(paths.archivePath, "immutable docker archive fixture");
  return { directory, paths, request, ci, runtimeImage, socialWallet };
};

test("CI-03 binds source, image archive and Social Wallet evidence into a non-authorizing candidate", async () => {
  const fixture = await createFixtures();
  try {
    const manifest = prepareReleaseCandidate({
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      socialWalletEvidencePath: fixture.paths.socialWalletPath,
      imageArchivePath: fixture.paths.archivePath,
      manifestPath: fixture.paths.manifestPath,
      notesPath: fixture.paths.notesPath,
    });
    assert.equal(manifest.status, "prepared_not_released");
    assert.equal(manifest.source.commit, commit);
    assert.equal(manifest.artifact.image_id, imageId);
    assert.deepEqual(manifest.workflow_run, { id: "12345", attempt: "1", job: "prepare" });
    assert.equal(manifest.approval.candidate_promotion_authorized, false);
    assert.equal(manifest.product_acceptance.status, "passed");
    assert.equal(manifest.product_acceptance.simulated_payment_flow_executed, true);
    assert.equal(manifest.product_acceptance.spend_decision_source, "legacy_global_wallet");
    assert.equal(manifest.product_acceptance.public_wallet_api_authorized, false);
    assert.equal(manifest.product_acceptance.buyer_side_provider_fee_spend_semantics_authorized, false);
    assert.equal(manifest.historical_baseline.tag, "ledger-rc-local-v0.1");
    assert.equal(manifest.historical_baseline.commit, "005b3949de4672a5aae301bd9b511e47b8be89fa");
    assert.ok(manifest.explicit_exclusions.includes("real_funds"));
    assert.match(readFileSync(fixture.paths.notesPath, "utf8"), /Prepared, not released/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("CI-03 detects archive, runtime, and Social Wallet evidence drift after candidate preparation", async () => {
  const fixture = await createFixtures();
  try {
    const manifest = prepareReleaseCandidate({
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      socialWalletEvidencePath: fixture.paths.socialWalletPath,
      imageArchivePath: fixture.paths.archivePath,
      manifestPath: fixture.paths.manifestPath,
      notesPath: fixture.paths.notesPath,
    });
    const validation = () => validateReleaseCandidate(manifest, {
      request: fixture.request,
      ci: fixture.ci,
      runtimeImage: fixture.runtimeImage,
      socialWallet: fixture.socialWallet,
      imageId,
      imageArchivePath: fixture.paths.archivePath,
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      socialWalletEvidencePath: fixture.paths.socialWalletPath,
    });
    assert.equal(validation(), true);
    writeFileSync(fixture.paths.archivePath, "tampered archive");
    assert.equal(validation(), false);
    writeFileSync(fixture.paths.archivePath, "immutable docker archive fixture");
    writeFileSync(fixture.paths.runtimePath, "{}\n");
    assert.equal(validation(), false);
    writeFileSync(fixture.paths.runtimePath, `${JSON.stringify(fixture.runtimeImage, null, 2)}\n`);
    const tampered = structuredClone(fixture.socialWallet);
    tampered.product_boundary.product_promotion_authorized = true;
    writeFileSync(fixture.paths.socialWalletPath, `${JSON.stringify(tampered, null, 2)}\n`);
    assert.equal(validation(), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("CI-03 rejects CI evidence from another workflow run or source ref", async () => {
  const fixture = await createFixtures();
  try {
    const input = {
      requestPath: fixture.paths.requestPath,
      ciEvidencePath: fixture.paths.ciPath,
      runtimeImageEvidencePath: fixture.paths.runtimePath,
      runtimeImageIdPath: fixture.paths.imageIdPath,
      socialWalletEvidencePath: fixture.paths.socialWalletPath,
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
