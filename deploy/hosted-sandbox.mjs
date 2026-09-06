import { readFileSync } from "node:fs";
import { immutableArtifactDigest, sha256Value } from "./operations.mjs";

export const HOSTED_SANDBOX_CONTRACT = Object.freeze(
  JSON.parse(readFileSync(new URL("./hosted-sandbox-contract.json", import.meta.url), "utf8")),
);

const COMMIT = /^[a-f0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const REFERENCE = /^bu2\/sandbox\/[A-Za-z0-9][A-Za-z0-9._/-]{2,100}$/;
const RESERVED_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const RESERVED_SUFFIXES = [".local", ".test", ".example", ".invalid"];

export class HostedSandboxError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HostedSandboxError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, message, details) => {
  throw new HostedSandboxError(code, message, details);
};

const isoTime = (value, field) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("timestamp_invalid", `${field} is invalid.`, { field });
  return date.toISOString();
};

export function normalizeHostedApiOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("hosted_api_origin_invalid", "Hosted Sandbox API origin must be a valid URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    !host.includes(".") ||
    RESERVED_HOSTS.has(host) ||
    RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  ) {
    fail(
      "hosted_api_origin_invalid",
      "Hosted Sandbox API origin must be a non-local HTTPS DNS origin without path or credentials.",
    );
  }
  return url.origin;
}

const gateEvidence = (value) => {
  const result = {};
  for (const gate of HOSTED_SANDBOX_CONTRACT.candidate_required_gates) {
    if (value?.[gate] !== "passed") {
      fail("hosted_candidate_gate_incomplete", "Every local readiness gate must pass.", { gate });
    }
    result[gate] = "passed";
  }
  return result;
};

const secretReferences = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      [...HOSTED_SANDBOX_CONTRACT.required_secret_references].sort().join(",")
  ) {
    fail(
      "hosted_secret_reference_invalid",
      "Hosted candidates must contain exactly the approved managed secret reference names.",
    );
  }
  const result = {};
  for (const field of HOSTED_SANDBOX_CONTRACT.required_secret_references) {
    if (typeof value?.[field] !== "string" || !REFERENCE.test(value[field])) {
      fail(
        "hosted_secret_reference_invalid",
        "Hosted candidates may contain managed secret reference names only.",
        { field },
      );
    }
    result[field] = value[field];
  }
  return result;
};

export function createHostedSandboxCandidate({
  sourceCommit,
  artifactReference,
  apiOrigin,
  secrets,
  gates,
  createdAt = Date.now(),
}) {
  if (!COMMIT.test(String(sourceCommit ?? ""))) {
    fail("source_commit_invalid", "Source commit must be a full lowercase Git SHA-1.");
  }
  const artifactDigest = immutableArtifactDigest(artifactReference);
  return Object.freeze({
    schema_version: HOSTED_SANDBOX_CONTRACT.schema_version,
    record_type: "hosted_sandbox_candidate",
    created_at: new Date(createdAt).toISOString(),
    source_commit: sourceCommit,
    artifact_reference: artifactReference,
    artifact_digest: artifactDigest,
    api_origin: normalizeHostedApiOrigin(apiOrigin),
    contract_sha256: sha256Value(HOSTED_SANDBOX_CONTRACT),
    environment: {
      name: HOSTED_SANDBOX_CONTRACT.environment,
      chain_id: HOSTED_SANDBOX_CONTRACT.chain_id,
      network: HOSTED_SANDBOX_CONTRACT.network,
      payment_adapter: HOSTED_SANDBOX_CONTRACT.payment_adapter,
      provider_scheme: HOSTED_SANDBOX_CONTRACT.provider_scheme,
      access_mode: HOSTED_SANDBOX_CONTRACT.access_mode,
    },
    secret_references: secretReferences(secrets),
    gate_evidence: gateEvidence(gates),
    authorization: {
      hosted_deployment: false,
      testnet_payment_execution: false,
      human_activation_required: true,
    },
  });
}

export function candidateSha256(candidate) {
  return sha256Value(candidate);
}

export function validateHostedSandboxCandidate(candidate) {
  const expected = HOSTED_SANDBOX_CONTRACT;
  if (
    candidate?.schema_version !== expected.schema_version ||
    candidate?.record_type !== "hosted_sandbox_candidate" ||
    !COMMIT.test(String(candidate?.source_commit ?? "")) ||
    candidate?.contract_sha256 !== sha256Value(expected)
  ) {
    fail("hosted_candidate_invalid", "Hosted Sandbox candidate metadata is invalid.");
  }
  isoTime(candidate.created_at, "created_at");
  const digest = immutableArtifactDigest(candidate.artifact_reference);
  if (candidate.artifact_digest !== digest) {
    fail("hosted_candidate_artifact_drift", "Hosted Sandbox candidate artifact has drifted.");
  }
  if (normalizeHostedApiOrigin(candidate.api_origin) !== candidate.api_origin) {
    fail("hosted_candidate_origin_drift", "Hosted Sandbox candidate API origin has drifted.");
  }
  const environment = candidate.environment;
  if (
    environment?.name !== expected.environment ||
    environment?.chain_id !== expected.chain_id ||
    environment?.network !== expected.network ||
    environment?.payment_adapter !== expected.payment_adapter ||
    environment?.provider_scheme !== expected.provider_scheme ||
    environment?.access_mode !== expected.access_mode
  ) {
    fail("hosted_candidate_environment_drift", "Hosted Sandbox candidate environment has drifted.");
  }
  secretReferences(candidate.secret_references);
  gateEvidence(candidate.gate_evidence);
  if (
    candidate?.authorization?.hosted_deployment !== false ||
    candidate.authorization.testnet_payment_execution !== false ||
    candidate.authorization.human_activation_required !== true
  ) {
    fail("hosted_candidate_self_authorized", "A Hosted Sandbox candidate cannot authorize itself.");
  }
  return true;
}

export function validateHostedSandboxActivation(activation, candidate, now = Date.now()) {
  validateHostedSandboxCandidate(candidate);
  if (
    activation?.schema_version !== HOSTED_SANDBOX_CONTRACT.schema_version ||
    activation?.record_type !== "hosted_sandbox_activation" ||
    activation?.decision !== "approved" ||
    activation?.scope !== HOSTED_SANDBOX_CONTRACT.activation_scope ||
    activation?.candidate_sha256 !== candidateSha256(candidate) ||
    typeof activation?.reviewer !== "string" ||
    activation.reviewer.trim().length < 3
  ) {
    fail(
      "hosted_activation_invalid",
      "Hosted Sandbox activation must be an independent approval bound to this candidate.",
    );
  }
  const reviewedAt = isoTime(activation.reviewed_at, "reviewed_at");
  const expiresAt = isoTime(activation.expires_at, "expires_at");
  if (Date.parse(reviewedAt) > now || Date.parse(expiresAt) <= now) {
    fail("hosted_activation_expired", "Hosted Sandbox activation is not currently valid.");
  }
  const limits = activation.limits;
  if (
    !Number.isSafeInteger(limits?.max_payments) ||
    limits.max_payments < 1 ||
    limits.max_payments > 100 ||
    !Number.isSafeInteger(limits?.max_total_amount_minor) ||
    limits.max_total_amount_minor < 1 ||
    limits.max_total_amount_minor > 1_000_000
  ) {
    fail("hosted_activation_limits_invalid", "Hosted Sandbox activation requires bounded limits.");
  }
  return true;
}

const validateTransaction = (transaction, direction) => {
  const receipt = transaction?.receipt_verification;
  if (
    transaction?.direction !== direction ||
    transaction?.environment !== "sandbox" ||
    transaction?.chain_id !== HOSTED_SANDBOX_CONTRACT.chain_id ||
    transaction?.status !== "settled" ||
    !TX_HASH.test(String(transaction?.provider_reference ?? "")) ||
    receipt?.signature_valid !== true ||
    receipt?.issuer_trusted !== true ||
    receipt?.settlement_confirmed !== true ||
    receipt?.environment !== "sandbox"
  ) {
    fail("hosted_bilateral_evidence_invalid", "A bilateral settlement evidence record is invalid.", {
      direction,
    });
  }
};

export function validateHostedSandboxEvidence(evidence, candidate, activation, now = Date.now()) {
  validateHostedSandboxActivation(activation, candidate, now);
  if (
    evidence?.schema_version !== HOSTED_SANDBOX_CONTRACT.schema_version ||
    evidence?.record_type !== "hosted_sandbox_evidence" ||
    evidence?.candidate_sha256 !== candidateSha256(candidate) ||
    normalizeHostedApiOrigin(evidence?.api_origin) !== candidate.api_origin ||
    evidence?.environment_document?.environment !== "sandbox" ||
    evidence.environment_document.chain_id !== HOSTED_SANDBOX_CONTRACT.chain_id ||
    evidence.environment_document.network !== HOSTED_SANDBOX_CONTRACT.network ||
    evidence.environment_document.execution_backend !== "x402" ||
    evidence.environment_document.execution_status !== "execution_enabled" ||
    evidence.environment_document.access_mode !== "authenticated" ||
    !evidence.environment_document.receipt_issuer
  ) {
    fail("hosted_environment_evidence_invalid", "Hosted environment evidence is invalid.");
  }
  if (
    evidence?.edge_machine_auth?.status_code !== 200 ||
    evidence.edge_machine_auth.interactive_challenge !== false ||
    evidence.edge_machine_auth.redirect_count !== 0
  ) {
    fail("hosted_edge_auth_invalid", "Machine authentication must pass without a browser challenge.");
  }
  if (
    evidence?.failure_recovery?.duplicate_submission?.duplicate_funds !== false ||
    evidence.failure_recovery.duplicate_submission.converged !== true ||
    evidence?.failure_recovery?.lost_response?.duplicate_funds !== false ||
    !["confirmed", "reconciled", "explicit_unknown"].includes(
      evidence.failure_recovery.lost_response.outcome,
    )
  ) {
    fail("hosted_failure_evidence_invalid", "Failure evidence must prove no duplicate funds.");
  }
  if (
    !Array.isArray(evidence.transactions) ||
    evidence.transactions.length !==
      HOSTED_SANDBOX_CONTRACT.required_evidence.bilateral_directions.length
  ) {
    fail("hosted_bilateral_evidence_invalid", "Evidence must contain exactly two directions.");
  }
  for (const direction of HOSTED_SANDBOX_CONTRACT.required_evidence.bilateral_directions) {
    validateTransaction(
      evidence.transactions?.find((transaction) => transaction.direction === direction),
      direction,
    );
  }
  if (evidence?.live?.included !== false || evidence.live.execution_status !== "execution_disabled") {
    fail("live_boundary_invalid", "Hosted Sandbox evidence must exclude Live execution.");
  }
  return Object.freeze({
    valid: true,
    environment: "sandbox",
    chain_id: HOSTED_SANDBOX_CONTRACT.chain_id,
    api_origin: candidate.api_origin,
    evidence_sha256: sha256Value(evidence),
  });
}
