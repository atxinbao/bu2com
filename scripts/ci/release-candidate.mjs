import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeImageEvidence } from "../../deploy/validate-runtime-image.mjs";

const policyPath = fileURLToPath(new URL("../../deploy/release-policy.json", import.meta.url));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const sameArray = (left, right) =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function prepareReleaseCandidate({
  requestPath,
  ciEvidencePath,
  runtimeImageEvidencePath,
  runtimeImageIdPath,
  imageArchivePath,
  manifestPath,
  notesPath,
}) {
  for (const path of [requestPath, ciEvidencePath, runtimeImageEvidencePath, runtimeImageIdPath, imageArchivePath]) {
    if (!path || !existsSync(path)) throw new Error(`Required release input is missing: ${path ?? "undefined"}`);
  }
  const request = readJson(requestPath);
  const ci = readJson(ciEvidencePath);
  const runtimeImage = readJson(runtimeImageEvidencePath);
  const imageId = readFileSync(runtimeImageIdPath, "utf8").trim();

  if (request.schema_version !== "ci03.release-request.v1" || request.status !== "accepted") {
    throw new Error("Release request was not accepted by the protected-main gate");
  }
  if (
    request.release_class !== policy.release_class ||
    request.source?.ref !== policy.source.ref ||
    request.source?.ref_protected !== true ||
    request.source?.workflow_commit !== request.source?.commit ||
    !/^[1-9][0-9]*$/.test(request.workflow_run?.id ?? "") ||
    !/^[1-9][0-9]*$/.test(request.workflow_run?.attempt ?? "") ||
    JSON.stringify(request.boundary) !== JSON.stringify(policy.boundary) ||
    request.authorization?.candidate_preparation !== true ||
    request.authorization?.tag_creation !== false ||
    request.authorization?.github_release_creation !== false ||
    request.authorization?.registry_publish !== false ||
    request.authorization?.payment_execution !== false
  ) {
    throw new Error("Release request class or protected-ref evidence is invalid");
  }
  if (!new RegExp(policy.candidate_version_pattern).test(request.candidate_version ?? "")) {
    throw new Error("Release request candidate version is invalid");
  }
  if (ci.schema_version !== "bu2.ci.v1") throw new Error("CI evidence schema is invalid");
  if (ci.source?.commit !== request.source.commit || ci.source?.tree !== request.source.tree) {
    throw new Error("CI evidence does not match the release request source");
  }
  if (
    ci.source?.event !== policy.source.event ||
    ci.source?.ref !== policy.source.ref ||
    ci.source?.workflow_sha !== request.source.commit ||
    ci.run?.id !== request.workflow_run.id ||
    ci.run?.attempt !== request.workflow_run.attempt
  ) {
    throw new Error("CI evidence does not match the admitted workflow run");
  }
  const checkIds = ci.checks?.map((check) => check.id) ?? [];
  if (
    checkIds.length !== policy.required_ci_checks.length ||
    new Set(checkIds).size !== checkIds.length ||
    checkIds.some((id) => !policy.required_ci_checks.includes(id)) ||
    ci.checks.some((check) => check.status !== "passed" || check.exit_code !== 0)
  ) {
    throw new Error("CI evidence does not contain seven passed checks");
  }
  for (const [key, expected] of Object.entries(policy.boundary)) {
    const actual = key === "signer_loaded"
      ? runtimeImage.authorization?.signer_loaded
      : key === "payment_execution_attempted"
        ? runtimeImage.authorization?.payment_execution_attempted
        : key === "execution_status"
          ? ci.boundary?.execution_disabled === true ? "execution_disabled" : null
          : key === "la06b"
            ? ci.boundary?.la06b
            : runtimeImage.authorization?.[key] ?? ci.boundary?.[key];
    if (actual !== expected) throw new Error(`Release boundary mismatch: ${key}`);
  }
  if (!validateRuntimeImageEvidence(runtimeImage, {
    expectedCommit: request.source.commit,
    expectedImageId: imageId,
  })) {
    throw new Error("Runtime image evidence does not match the candidate source or image");
  }
  const archive = statSync(imageArchivePath);
  if (!archive.isFile() || archive.size <= 0) throw new Error("Release image archive is empty");

  const manifest = {
    schema_version: "ci03.release-candidate.v1",
    status: "prepared_not_released",
    candidate_version: request.candidate_version,
    release_class: policy.release_class,
    source: request.source,
    workflow_run: ci.run,
    artifact: {
      format: policy.artifact.format,
      image_id: imageId,
      archive_sha256: sha256(imageArchivePath),
      archive_size_bytes: archive.size,
    },
    evidence: {
      ci_manifest_sha256: sha256(ciEvidencePath),
      runtime_image_sha256: sha256(runtimeImageEvidencePath),
      runtime_image_id_sha256: sha256(runtimeImageIdPath),
      release_request_sha256: sha256(requestPath),
      release_policy_sha256: sha256(policyPath),
    },
    capabilities: policy.capabilities,
    explicit_exclusions: policy.explicit_exclusions,
    boundary: policy.boundary,
    approval: {
      independent_r2_review: "pending",
      project_owner_release_approval: "pending",
      candidate_promotion_authorized: false,
    },
  };
  if (!validateReleaseCandidate(manifest, {
    request,
    ci,
    runtimeImage,
    imageId,
    imageArchivePath,
    requestPath,
    ciEvidencePath,
    runtimeImageEvidencePath,
    runtimeImageIdPath,
  })) {
    throw new Error("Generated release candidate manifest failed self-validation");
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(notesPath, releaseNotes(manifest));
  return manifest;
}

export function validateReleaseCandidate(manifest, {
  request,
  ci,
  runtimeImage,
  imageId,
  imageArchivePath,
  requestPath,
  ciEvidencePath,
  runtimeImageEvidencePath,
  runtimeImageIdPath,
}) {
  return (
    manifest?.schema_version === "ci03.release-candidate.v1" &&
    manifest.status === "prepared_not_released" &&
    manifest.candidate_version === request.candidate_version &&
    manifest.release_class === policy.release_class &&
    manifest.source?.commit === request.source.commit &&
    manifest.source?.tree === request.source.tree &&
    manifest.source?.ref === policy.source.ref &&
    manifest.source?.ref_protected === true &&
    manifest.workflow_run?.id === ci.run?.id &&
    manifest.workflow_run?.attempt === ci.run?.attempt &&
    request.workflow_run?.id === ci.run?.id &&
    request.workflow_run?.attempt === ci.run?.attempt &&
    ci.source?.commit === request.source.commit &&
    ci.source?.tree === request.source.tree &&
    ci.source?.event === policy.source.event &&
    ci.source?.ref === policy.source.ref &&
    ci.source?.workflow_sha === request.source.commit &&
    ci.boundary?.environment === policy.boundary.environment &&
    ci.boundary?.execution_backend === policy.boundary.execution_backend &&
    ci.boundary?.execution_disabled === true &&
    ci.boundary?.provider_call === false &&
    ci.boundary?.live_enabled === false &&
    ci.boundary?.la06b === policy.boundary.la06b &&
    ci.checks?.length === policy.required_ci_checks.length &&
    new Set(ci.checks?.map((check) => check.id)).size === policy.required_ci_checks.length &&
    ci.checks?.every((check) =>
      policy.required_ci_checks.includes(check.id) &&
      check.status === "passed" &&
      check.exit_code === 0
    ) &&
    manifest.artifact?.format === policy.artifact.format &&
    manifest.artifact?.image_id === imageId &&
    manifest.artifact?.archive_sha256 === sha256(imageArchivePath) &&
    manifest.artifact?.archive_size_bytes === statSync(imageArchivePath).size &&
    manifest.evidence?.ci_manifest_sha256 === sha256(ciEvidencePath) &&
    manifest.evidence?.runtime_image_sha256 === sha256(runtimeImageEvidencePath) &&
    manifest.evidence?.runtime_image_id_sha256 === sha256(runtimeImageIdPath) &&
    manifest.evidence?.release_request_sha256 === sha256(requestPath) &&
    manifest.evidence?.release_policy_sha256 === sha256(policyPath) &&
    runtimeImage.source_commit === request.source.commit &&
    runtimeImage.image_id === imageId &&
    sameArray(manifest.capabilities, policy.capabilities) &&
    sameArray(manifest.explicit_exclusions, policy.explicit_exclusions) &&
    JSON.stringify(manifest.boundary) === JSON.stringify(policy.boundary) &&
    manifest.approval?.independent_r2_review === "pending" &&
    manifest.approval?.project_owner_release_approval === "pending" &&
    manifest.approval?.candidate_promotion_authorized === false
  );
}

function releaseNotes(manifest) {
  return `# ${manifest.candidate_version}\n\n` +
    `Status: **Prepared, not released**\n\n` +
    `Release class: \`${manifest.release_class}\`\n\n` +
    `Source commit: \`${manifest.source.commit}\`\n\n` +
    `Image ID: \`${manifest.artifact.image_id}\`\n\n` +
    `## Capabilities\n\n${manifest.capabilities.map((value) => `- ${value}`).join("\n")}\n\n` +
    `## Explicit exclusions\n\n${manifest.explicit_exclusions.map((value) => `- ${value}`).join("\n")}\n\n` +
    `This candidate does not authorize a tag, GitHub Release, registry publication, deployment, signing, Provider call, or payment execution.\n`;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const [requestPath, ciEvidencePath, runtimeImageEvidencePath, runtimeImageIdPath, imageArchivePath, manifestPath, notesPath] = process.argv.slice(2);
    const manifest = prepareReleaseCandidate({
      requestPath,
      ciEvidencePath,
      runtimeImageEvidencePath,
      runtimeImageIdPath,
      imageArchivePath,
      manifestPath,
      notesPath,
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
