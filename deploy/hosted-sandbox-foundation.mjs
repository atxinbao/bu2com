import {
  candidateSha256,
  validateHostedSandboxActivation,
  validateHostedSandboxCandidate,
  validateHostedSandboxEvidence,
} from "./hosted-sandbox.mjs";

/**
 * 验证 Hosted Sandbox 基础准入包，但不授予公网部署或 Testnet 付款权限。
 *
 * 该函数只组合已有 Candidate、Activation 和 Evidence 验证器，明确返回
 * 本地契约资格与真实 ENV-07B 验收之间的边界。
 */
export function qualifyHostedSandboxFoundation({ candidate, activation, evidence, now = Date.now() }) {
  validateHostedSandboxCandidate(candidate);
  validateHostedSandboxActivation(activation, candidate, now);
  const evidenceResult = validateHostedSandboxEvidence(evidence, candidate, activation, now);
  return Object.freeze({
    qualification: "local_contract_passed",
    scope: "hosted_sandbox_foundation",
    candidate_sha256: candidateSha256(candidate),
    evidence_sha256: evidenceResult.evidence_sha256,
    hosted_deployment_verified: false,
    external_endpoint_verified: false,
    real_testnet_verified: false,
    env07b_accepted: false,
    pending_external_gates: Object.freeze([
      "public_https_dns_tls",
      "managed_secret_injection",
      "independent_activation",
      "external_machine_auth",
      "bilateral_base_sepolia_settlement",
    ]),
  });
}
