import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const policy = JSON.parse(
  readFileSync(new URL("../../deploy/release-policy.json", import.meta.url), "utf8"),
);

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function validateReleaseRequest({
  candidateVersion,
  requestedCommit,
  workflowCommit,
  workflowRef,
  workflowRefProtected,
  workflowEvent,
  workflowRunId,
  workflowRunAttempt,
  actualCommit,
  actualTree,
  dirtyStatus,
  tagExists,
}) {
  const versionPattern = new RegExp(policy.candidate_version_pattern);
  if (!versionPattern.test(candidateVersion ?? "")) {
    throw new Error("Candidate version does not match the approved RC pattern");
  }
  for (const [name, value] of Object.entries({ requestedCommit, workflowCommit, actualCommit })) {
    if (!/^[a-f0-9]{40}$/.test(value ?? "")) throw new Error(`${name} must be a full commit SHA`);
  }
  if (!/^[a-f0-9]{40}$/.test(actualTree ?? "")) {
    throw new Error("actualTree must be a full tree SHA");
  }
  if (workflowEvent !== policy.source.event) throw new Error("Release candidates require workflow_dispatch");
  if (workflowRef !== policy.source.ref) throw new Error("Release candidates must run from refs/heads/main");
  if (workflowRefProtected !== policy.source.ref_protected) {
    throw new Error("The main ref is not protected; candidate preparation is denied");
  }
  if (!/^[1-9][0-9]*$/.test(workflowRunId ?? "") || !/^[1-9][0-9]*$/.test(workflowRunAttempt ?? "")) {
    throw new Error("Workflow run ID and attempt must be positive integers");
  }
  if (requestedCommit !== workflowCommit || requestedCommit !== actualCommit) {
    throw new Error("Requested, workflow and checked-out commits must be identical");
  }
  if (dirtyStatus) throw new Error("Release candidate checkout must be clean");
  if (tagExists) throw new Error("Candidate version already exists as a tag");

  return Object.freeze({
    schema_version: "ci03.release-request.v1",
    status: "accepted",
    candidate_version: candidateVersion,
    release_class: policy.release_class,
    source: {
      commit: actualCommit,
      tree: actualTree,
      ref: workflowRef,
      ref_protected: true,
      workflow_commit: workflowCommit,
    },
    workflow_run: {
      id: workflowRunId,
      attempt: workflowRunAttempt,
    },
    boundary: policy.boundary,
    authorization: {
      candidate_preparation: true,
      tag_creation: false,
      github_release_creation: false,
      registry_publish: false,
      payment_execution: false,
    },
  });
}

export function createReleaseRequestFromEnvironment({ cwd = process.cwd(), env = process.env } = {}) {
  const candidateVersion = env.BU2_CANDIDATE_VERSION;
  const tag = candidateVersion ? `refs/tags/${candidateVersion}` : "refs/tags/invalid";
  const tagExists = spawnSync("git", ["show-ref", "--verify", "--quiet", tag], { cwd }).status === 0;
  return validateReleaseRequest({
    candidateVersion,
    requestedCommit: env.BU2_CANDIDATE_SOURCE_COMMIT,
    workflowCommit: env.BU2_WORKFLOW_SOURCE_COMMIT,
    workflowRef: env.BU2_WORKFLOW_REF,
    workflowRefProtected: env.BU2_WORKFLOW_REF_PROTECTED === "true",
    workflowEvent: env.BU2_WORKFLOW_EVENT,
    workflowRunId: env.BU2_WORKFLOW_RUN_ID,
    workflowRunAttempt: env.BU2_WORKFLOW_RUN_ATTEMPT,
    actualCommit: git(["rev-parse", "HEAD"], cwd),
    actualTree: git(["rev-parse", "HEAD^{tree}"], cwd),
    dirtyStatus: git(["status", "--porcelain"], cwd),
    tagExists,
  });
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const serialized = `${JSON.stringify(createReleaseRequestFromEnvironment(), null, 2)}\n`;
    const outputPath = process.argv[2];
    if (outputPath) writeFileSync(outputPath, serialized);
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
