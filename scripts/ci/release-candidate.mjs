import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeImageEvidence } from "../../deploy/validate-runtime-image.mjs";
import { validateSocialWalletAcceptance } from "../../sandbox/social-wallet-acceptance.mjs";

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
  socialWalletEvidencePath,
  imageArchivePath,
  manifestPath,
  notesPath,
}) {
  for (const path of [requestPath, ciEvidencePath, runtimeImageEvidencePath, runtimeImageIdPath, socialWalletEvidencePath, imageArchivePath]) {
    if (!path || !existsSync(path)) throw new Error(`Required release input is missing: ${path ?? "undefined"}`);
  }
  const request = readJson(requestPath);
  const ci = readJson(ciEvidencePath);
  const runtimeImage = readJson(runtimeImageEvidencePath);
  const socialWallet = readJson(socialWalletEvidencePath);
  const imageId = readFileSync(runtimeImageIdPath, "utf8").trim();

  if (request.schema_version !== "ci03.release-request.v3" || request.status !== "accepted") {
    throw new Error("Release request was not accepted by the exact-main gate");
  }
  if (
    request.release_class !== policy.release_class ||
    request.source?.ref !== policy.source.ref ||
    typeof request.source?.ref_protected !== "boolean" ||
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
    throw new Error("Release request class or source evidence is invalid");
  }
  if (!new RegExp(policy.candidate_version_pattern).test(request.candidate_version ?? "")) {
    throw new Error("Release request candidate version is invalid");
  }
  if (ci.schema_version !== "bu2.ci.v2" || ci.status !== "accepted") {
    throw new Error("CI evidence schema is invalid");
  }
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
    checkIds.length !== policy.observed_ci_checks.length ||
    new Set(checkIds).size !== checkIds.length ||
    checkIds.some((id) => !policy.observed_ci_checks.includes(id)) ||
    ci.checks.some((check) =>
      !["passed", "failed"].includes(check.status) ||
      !Number.isInteger(check.exit_code) ||
      (check.status === "passed" && check.exit_code !== 0) ||
      (check.status === "failed" && check.exit_code === 0)
    )
  ) {
    throw new Error("CI evidence does not contain seven truthful observations");
  }
  const failedCheckIds = ci.checks
    .filter((check) => check.status === "failed")
    .map((check) => check.id);
  if (
    ci.observations?.la06a?.status !== (failedCheckIds.length === 0 ? "passed" : "failed") ||
    ci.observations?.la06a?.required_to_run !== true ||
    ci.observations?.la06a?.required_to_pass !== false ||
    JSON.stringify(ci.observations?.la06a?.failed_check_ids) !== JSON.stringify(failedCheckIds)
  ) {
    throw new Error("LA-06a observation is missing or contradicts the recorded checks");
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
  if (!validateSocialWalletAcceptance(socialWallet, {
    expectedSourceCommit: request.source.commit,
    expectedImageId: imageId,
  })) {
    throw new Error("Social Wallet acceptance evidence does not match the candidate source, image, or Local product boundary");
  }
  const archive = statSync(imageArchivePath);
  if (!archive.isFile() || archive.size <= 0) throw new Error("Release image archive is empty");

  const manifest = {
    schema_version: "ci03.release-candidate.v3",
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
      social_wallet_acceptance_sha256: sha256(socialWalletEvidencePath),
      release_policy_sha256: sha256(policyPath),
    },
    product_acceptance: {
      schema_version: socialWallet.schema_version,
      status: socialWallet.status,
      account_count: socialWallet.scope.account_count,
      agent_count: socialWallet.scope.agent_count,
      ledger_account_count: socialWallet.scope.ledger_account_count,
      external_sandbox_bilateral: socialWallet.external_sandbox_bilateral.status,
      simulated_payment_flow_executed: socialWallet.authorization.simulated_payment_flow_executed,
      spend_decision_source: socialWallet.product_boundary.multi_account_spend_decision_source,
      public_wallet_api_authorized: socialWallet.product_boundary.public_wallet_api_authorized,
      buyer_side_provider_fee_spend_semantics_authorized: socialWallet.product_boundary.buyer_side_provider_fee_spend_semantics_authorized,
      product_promotion_authorized: socialWallet.product_boundary.product_promotion_authorized,
    },
    quality_observation: {
      la06a: ci.observations.la06a,
    },
    historical_baseline: policy.historical_baseline,
    capabilities: policy.capabilities,
    explicit_exclusions: policy.explicit_exclusions,
    boundary: policy.boundary,
    approval: {
      project_owner_release_approval: "pending",
      separate_human_reviewer_required: false,
      ai_self_approval: "forbidden",
      candidate_promotion_authorized: false,
    },
  };
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
  socialWallet,
  imageId,
  imageArchivePath,
  requestPath,
  ciEvidencePath,
  runtimeImageEvidencePath,
  runtimeImageIdPath,
  socialWalletEvidencePath,
}) {
  return (
    manifest?.schema_version === "ci03.release-candidate.v3" &&
    manifest.status === "prepared_not_released" &&
    manifest.candidate_version === request.candidate_version &&
    manifest.release_class === policy.release_class &&
    ci.schema_version === "bu2.ci.v2" &&
    ci.status === "accepted" &&
    manifest.source?.commit === request.source.commit &&
    manifest.source?.tree === request.source.tree &&
    manifest.source?.ref === policy.source.ref &&
    typeof manifest.source?.ref_protected === "boolean" &&
    manifest.source?.ref_protected === request.source?.ref_protected &&
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
    ci.checks?.length === policy.observed_ci_checks.length &&
    new Set(ci.checks?.map((check) => check.id)).size === policy.observed_ci_checks.length &&
    ci.checks?.every((check) =>
      policy.observed_ci_checks.includes(check.id) &&
      ["passed", "failed"].includes(check.status) &&
      Number.isInteger(check.exit_code) &&
      ((check.status === "passed" && check.exit_code === 0) ||
        (check.status === "failed" && check.exit_code !== 0))
    ) &&
    JSON.stringify(manifest.quality_observation?.la06a) ===
      JSON.stringify(ci.observations?.la06a) &&
    manifest.artifact?.format === policy.artifact.format &&
    manifest.artifact?.image_id === imageId &&
    manifest.artifact?.archive_sha256 === sha256(imageArchivePath) &&
    manifest.artifact?.archive_size_bytes === statSync(imageArchivePath).size &&
    manifest.evidence?.ci_manifest_sha256 === sha256(ciEvidencePath) &&
    manifest.evidence?.runtime_image_sha256 === sha256(runtimeImageEvidencePath) &&
    manifest.evidence?.runtime_image_id_sha256 === sha256(runtimeImageIdPath) &&
    manifest.evidence?.release_request_sha256 === sha256(requestPath) &&
    manifest.evidence?.social_wallet_acceptance_sha256 === sha256(socialWalletEvidencePath) &&
    manifest.evidence?.release_policy_sha256 === sha256(policyPath) &&
    runtimeImage.source_commit === request.source.commit &&
    runtimeImage.image_id === imageId &&
    validateSocialWalletAcceptance(socialWallet, {
      expectedSourceCommit: request.source.commit,
      expectedImageId: imageId,
    }) &&
    manifest.product_acceptance?.schema_version === "fp08.social-wallet-acceptance.v2" &&
    manifest.product_acceptance?.schema_version === socialWallet.schema_version &&
    manifest.product_acceptance?.status === "passed" &&
    manifest.product_acceptance?.account_count === 2 &&
    manifest.product_acceptance?.agent_count === 4 &&
    manifest.product_acceptance?.ledger_account_count === 2 &&
    manifest.product_acceptance?.external_sandbox_bilateral === "not_executed" &&
    manifest.product_acceptance?.simulated_payment_flow_executed === true &&
    manifest.product_acceptance?.spend_decision_source === "account_scoped_wallet" &&
    manifest.product_acceptance?.public_wallet_api_authorized === true &&
    manifest.product_acceptance?.buyer_side_provider_fee_spend_semantics_authorized === true &&
    manifest.product_acceptance?.product_promotion_authorized === false &&
    JSON.stringify(manifest.historical_baseline) === JSON.stringify(policy.historical_baseline) &&
    sameArray(manifest.capabilities, policy.capabilities) &&
    sameArray(manifest.explicit_exclusions, policy.explicit_exclusions) &&
    JSON.stringify(manifest.boundary) === JSON.stringify(policy.boundary) &&
    manifest.approval?.project_owner_release_approval === "pending" &&
    manifest.approval?.separate_human_reviewer_required === false &&
    manifest.approval?.ai_self_approval === "forbidden" &&
    manifest.approval?.candidate_promotion_authorized === false
  );
}

function releaseNotes(manifest) {
  return `# ${manifest.candidate_version}\n\n` +
    `Status: **Prepared, not released**\n\n` +
    `Release class: \`${manifest.release_class}\`\n\n` +
    `Source commit: \`${manifest.source.commit}\`\n\n` +
    `Source ref protected: \`${manifest.source.ref_protected}\` (recorded evidence, not an admission requirement)\n\n` +
    `Image ID: \`${manifest.artifact.image_id}\`\n\n` +
    `Social Wallet acceptance: \`${manifest.product_acceptance.status}\` (2 Accounts / 4 Agents, spend decision: \`${manifest.product_acceptance.spend_decision_source}\`)\n\n` +
    `Public Wallet API: \`${manifest.product_acceptance.public_wallet_api_authorized}\`\n\n` +
    `LA-06a observation: \`${manifest.quality_observation.la06a.status}\` (required to run, not required to pass)\n\n` +
    `Historical baseline: \`${manifest.historical_baseline.tag}\` -> \`${manifest.historical_baseline.commit}\`\n\n` +
    `## Capabilities\n\n${manifest.capabilities.map((value) => `- ${value}`).join("\n")}\n\n` +
    `## Explicit exclusions\n\n${manifest.explicit_exclusions.map((value) => `- ${value}`).join("\n")}\n\n` +
    `This candidate does not authorize a tag, GitHub Release, registry publication, deployment, signing, Provider call, or payment execution.\n`;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const [requestPath, ciEvidencePath, runtimeImageEvidencePath, runtimeImageIdPath, socialWalletEvidencePath, imageArchivePath, manifestPath, notesPath] = process.argv.slice(2);
    const manifest = prepareReleaseCandidate({
      requestPath,
      ciEvidencePath,
      runtimeImageEvidencePath,
      runtimeImageIdPath,
      socialWalletEvidencePath,
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
