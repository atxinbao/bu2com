import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateSha256,
  createHostedSandboxCandidate,
} from "./hosted-sandbox.mjs";
import { qualifyHostedSandboxFoundation } from "./hosted-sandbox-foundation.mjs";

const artifact = `ghcr.io/atxinbao/bu2com@sha256:${"a".repeat(64)}`;
const sourceCommit = "b".repeat(40);
const now = Date.parse("2026-09-09T12:00:00.000Z");
const txHash = `0x${"c".repeat(64)}`;
const gates = {
  contract_tests: "passed",
  sandbox_tests: "passed",
  prototype_build: "passed",
  secret_scan: "passed",
};

const candidate = createHostedSandboxCandidate({
  sourceCommit,
  artifactReference: artifact,
  apiOrigin: "https://api.sandbox.bu2.com",
  secrets: {
    access_credentials: "bu2/sandbox/api-credentials-v1",
    buyer_signer: "bu2/sandbox/buyer-signer-v1",
    rpc_endpoint: "bu2/sandbox/base-sepolia-rpc-v1",
  },
  gates,
  createdAt: now,
});

const activation = {
  schema_version: "1.0",
  record_type: "hosted_sandbox_activation",
  decision: "approved",
  candidate_sha256: candidateSha256(candidate),
  scope: "sandbox_base_sepolia_test_assets",
  reviewer: "external-reviewer",
  reviewed_at: "2026-09-09T11:00:00.000Z",
  expires_at: "2099-09-09T12:00:00.000Z",
  limits: { max_payments: 10, max_total_amount_minor: 100 },
};

const transaction = (direction) => ({
  direction,
  environment: "sandbox",
  chain_id: 84532,
  status: "settled",
  provider_reference: txHash,
  receipt_verification: {
    signature_valid: true,
    issuer_trusted: true,
    settlement_confirmed: true,
    environment: "sandbox",
  },
});

const evidence = () => ({
  schema_version: "1.0",
  record_type: "hosted_sandbox_evidence",
  candidate_sha256: candidateSha256(candidate),
  api_origin: candidate.api_origin,
  environment_document: {
    environment: "sandbox",
    chain_id: 84532,
    network: "eip155:84532",
    execution_backend: "x402",
    execution_status: "execution_enabled",
    access_mode: "authenticated",
    receipt_issuer: { id: "issuer_sandbox" },
  },
  edge_machine_auth: { status_code: 200, interactive_challenge: false, redirect_count: 0 },
  failure_recovery: {
    duplicate_submission: { duplicate_funds: false, converged: true },
    lost_response: { duplicate_funds: false, outcome: "reconciled" },
  },
  transactions: [transaction("buyer_to_seller"), transaction("seller_to_buyer")],
  live: { included: false, execution_status: "execution_disabled" },
});

test("F16b local foundation qualification is explicit and non-authorizing", () => {
  const result = qualifyHostedSandboxFoundation({
    candidate,
    activation,
    evidence: evidence(),
    now,
  });

  assert.equal(result.qualification, "local_contract_passed");
  assert.equal(result.scope, "hosted_sandbox_foundation");
  assert.equal(result.hosted_deployment_verified, false);
  assert.equal(result.external_endpoint_verified, false);
  assert.equal(result.real_testnet_verified, false);
  assert.equal(result.env07b_accepted, false);
  assert.deepEqual(result.pending_external_gates, [
    "public_https_dns_tls",
    "managed_secret_injection",
    "independent_activation",
    "external_machine_auth",
    "bilateral_base_sepolia_settlement",
  ]);
});

test("F16b rejects candidate drift and self-authorization", () => {
  const mutableArtifact = structuredClone(candidate);
  mutableArtifact.artifact_reference = "ghcr.io/atxinbao/bu2com:latest";
  assert.throws(
    () => qualifyHostedSandboxFoundation({ candidate: mutableArtifact, activation, evidence: evidence(), now }),
    (error) => error.code === "hosted_candidate_artifact_drift" || error.name === "OperationsError",
  );

  const selfAuthorized = structuredClone(candidate);
  selfAuthorized.authorization.hosted_deployment = true;
  assert.throws(
    () => qualifyHostedSandboxFoundation({ candidate: selfAuthorized, activation, evidence: evidence(), now }),
    (error) => error.code === "hosted_candidate_self_authorized",
  );
});

test("F16b rejects activation and evidence boundary drift", () => {
  const wrongActivation = { ...activation, candidate_sha256: "d".repeat(64) };
  assert.throws(
    () => qualifyHostedSandboxFoundation({ candidate, activation: wrongActivation, evidence: evidence(), now }),
    (error) => error.code === "hosted_activation_invalid",
  );

  const invalidEvidence = evidence();
  invalidEvidence.edge_machine_auth.status_code = 302;
  assert.throws(
    () => qualifyHostedSandboxFoundation({ candidate, activation, evidence: invalidEvidence, now }),
    (error) => error.code === "hosted_edge_auth_invalid",
  );

  const liveEvidence = evidence();
  liveEvidence.live.included = true;
  assert.throws(
    () => qualifyHostedSandboxFoundation({ candidate, activation, evidence: liveEvidence, now }),
    (error) => error.code === "live_boundary_invalid",
  );
});
