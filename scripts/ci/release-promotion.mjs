import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseCandidate } from "./release-candidate.mjs";

const policyPath = fileURLToPath(new URL("../../deploy/release-policy.json", import.meta.url));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function expectedApprovalStatement(candidateVersion, sourceCommit) {
  return policy.promotion.approval_statement_template
    .replace("{candidate_version}", candidateVersion)
    .replace("{source_commit}", sourceCommit);
}

export function approveReleasePromotion({
  candidateRunPath,
  manifestPath,
  requestPath,
  ciEvidencePath,
  runtimeImageEvidencePath,
  runtimeImageIdPath,
  socialWalletEvidencePath,
  imageArchivePath,
  actor,
  workflowEvent,
  workflowRef,
  workflowCommit,
  workflowRunId,
  workflowRunAttempt,
  candidateRunId,
  candidateRunAttempt,
  candidateVersion,
  sourceCommit,
  approvalStatement,
  approvalPath,
  notesPath,
  approvedAt = new Date().toISOString(),
}) {
  for (const path of [
    candidateRunPath,
    manifestPath,
    requestPath,
    ciEvidencePath,
    runtimeImageEvidencePath,
    runtimeImageIdPath,
    socialWalletEvidencePath,
    imageArchivePath,
  ]) {
    if (!path || !existsSync(path)) {
      throw new Error(`Required promotion input is missing: ${path ?? "undefined"}`);
    }
  }

  const candidateRun = readJson(candidateRunPath);
  const manifest = readJson(manifestPath);
  const request = readJson(requestPath);
  const ci = readJson(ciEvidencePath);
  const runtimeImage = readJson(runtimeImageEvidencePath);
  const socialWallet = readJson(socialWalletEvidencePath);
  const imageId = readFileSync(runtimeImageIdPath, "utf8").trim();

  if (
    workflowEvent !== "workflow_dispatch" ||
    workflowRef !== policy.source.ref ||
    workflowCommit !== sourceCommit ||
    actor !== policy.approval.project_owner_github_login
  ) {
    throw new Error("Promotion must be dispatched from the candidate main commit by the Project Owner");
  }
  for (const [name, value] of Object.entries({
    workflowCommit,
    sourceCommit,
    manifestCommit: manifest.source?.commit,
  })) {
    if (!/^[a-f0-9]{40}$/.test(value ?? "")) {
      throw new Error(`${name} must be a full commit SHA`);
    }
  }
  for (const [name, value] of Object.entries({
    workflowRunId,
    workflowRunAttempt,
    candidateRunId,
    candidateRunAttempt,
  })) {
    if (!/^[1-9][0-9]*$/.test(value ?? "")) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
  if (
    candidateVersion !== manifest.candidate_version ||
    sourceCommit !== manifest.source.commit ||
    approvalStatement !== expectedApprovalStatement(candidateVersion, sourceCommit)
  ) {
    throw new Error("Promotion request does not contain the exact candidate and Project Owner approval statement");
  }
  if (
    String(candidateRun.id) !== candidateRunId ||
    String(candidateRun.run_attempt) !== candidateRunAttempt ||
    candidateRun.status !== "completed" ||
    candidateRun.conclusion !== "success" ||
    candidateRun.event !== "workflow_dispatch" ||
    candidateRun.head_branch !== "main" ||
    candidateRun.head_sha !== sourceCommit ||
    candidateRun.path !== ".github/workflows/ledger-release-candidate.yml"
  ) {
    throw new Error("Candidate workflow run is not a successful exact-main release candidate run");
  }
  if (
    manifest.workflow_run?.id !== candidateRunId ||
    manifest.workflow_run?.attempt !== candidateRunAttempt
  ) {
    throw new Error("Candidate artifact does not belong to the selected workflow run and attempt");
  }
  if (!validateReleaseCandidate(manifest, {
    request,
    ci,
    runtimeImage,
    socialWallet,
    imageId,
    imageArchivePath,
    requestPath,
    ciEvidencePath,
    runtimeImageEvidencePath,
    runtimeImageIdPath,
    socialWalletEvidencePath,
  })) {
    throw new Error("Candidate artifact or evidence hashes no longer match the prepared manifest");
  }

  const approval = {
    schema_version: "ci03.release-promotion.v1",
    status: "approved_for_github_prerelease",
    candidate_version: candidateVersion,
    release_class: manifest.release_class,
    source: manifest.source,
    candidate_workflow: {
      id: candidateRunId,
      attempt: candidateRunAttempt,
    },
    promotion_workflow: {
      id: workflowRunId,
      attempt: workflowRunAttempt,
      actor,
    },
    artifact: {
      image_id: manifest.artifact.image_id,
      archive_sha256: manifest.artifact.archive_sha256,
      candidate_manifest_sha256: sha256(manifestPath),
    },
    observations: {
      main_ref_protected: manifest.source.ref_protected,
      la06a: manifest.quality_observation.la06a,
    },
    capabilities: manifest.capabilities,
    explicit_exclusions: manifest.explicit_exclusions,
    approval: {
      project_owner_github_login: actor,
      statement: approvalStatement,
      approved_at: approvedAt,
      separate_human_reviewer_required: false,
      ai_self_approval: "forbidden",
    },
    authorization: {
      tag_creation: true,
      github_prerelease_creation: true,
      registry_publish: false,
      hosted_deployment: false,
      provider_call: false,
      signer_loaded: false,
      payment_execution: false,
    },
  };
  writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
  writeFileSync(notesPath, releaseNotes(approval));
  return approval;
}

function releaseNotes(approval) {
  return `# ${approval.candidate_version}\n\n` +
    `Status: **Local/Simulation GitHub prerelease**\n\n` +
    `Source commit: \`${approval.source.commit}\`\n\n` +
    `Source ref protected: \`${approval.observations.main_ref_protected}\` (truthfully recorded, not a release blocker)\n\n` +
    `LA-06a observation: \`${approval.observations.la06a.status}\` (required to run, not required to pass)\n\n` +
    `Project Owner: \`${approval.approval.project_owner_github_login}\`\n\n` +
    `## Capabilities\n\n${approval.capabilities.map((value) => `- ${value}`).join("\n")}\n\n` +
    `## Explicit exclusions\n\n${approval.explicit_exclusions.map((value) => `- ${value}`).join("\n")}\n\n` +
    `This prerelease does not authorize registry publication, Hosted deployment, signing, Provider calls, Testnet/Mainnet payment execution, or real funds.\n`;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const [
      candidateDirectory,
      candidateRunPath,
      approvalPath,
      notesPath,
    ] = process.argv.slice(2);
    const approval = approveReleasePromotion({
      candidateRunPath,
      manifestPath: resolve(candidateDirectory, "release-candidate.json"),
      requestPath: resolve(candidateDirectory, "release-request.json"),
      ciEvidencePath: resolve(candidateDirectory, "ci-evidence.json"),
      runtimeImageEvidencePath: resolve(candidateDirectory, "runtime-image-assurance.json"),
      runtimeImageIdPath: resolve(candidateDirectory, "runtime-image-id"),
      socialWalletEvidencePath: resolve(candidateDirectory, "social-wallet-acceptance.json"),
      imageArchivePath: resolve(candidateDirectory, "ledger-release-image.tar"),
      actor: process.env.GITHUB_ACTOR,
      workflowEvent: process.env.GITHUB_EVENT_NAME,
      workflowRef: process.env.GITHUB_REF,
      workflowCommit: process.env.GITHUB_SHA,
      workflowRunId: process.env.GITHUB_RUN_ID,
      workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
      candidateRunId: process.env.BU2_CANDIDATE_RUN_ID,
      candidateRunAttempt: process.env.BU2_CANDIDATE_RUN_ATTEMPT,
      candidateVersion: process.env.BU2_CANDIDATE_VERSION,
      sourceCommit: process.env.BU2_SOURCE_COMMIT,
      approvalStatement: process.env.BU2_APPROVAL_STATEMENT,
      approvalPath,
      notesPath,
    });
    process.stdout.write(`${JSON.stringify(approval, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
