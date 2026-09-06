import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readHostedSandboxSecrets } from "../sandbox/runtime-secrets.mjs";
import { startHostedSandbox } from "../sandbox/hosted-sandbox.mjs";
import {
  candidateSha256,
  createHostedSandboxCandidate,
  validateHostedSandboxActivation,
  validateHostedSandboxCandidate,
  validateHostedSandboxEvidence,
} from "./hosted-sandbox.mjs";

const artifact = `ghcr.io/atxinbao/bu2com@sha256:${"a".repeat(64)}`;
const sourceCommit = "b".repeat(40);
const now = Date.parse("2026-09-06T12:00:00.000Z");
const txHash = `0x${"c".repeat(64)}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const cliPath = fileURLToPath(new URL("./hosted-sandbox-cli.mjs", import.meta.url));
const gates = {
  contract_tests: "passed",
  sandbox_tests: "passed",
  prototype_build: "passed",
  secret_scan: "passed",
};

const candidateInput = (overrides = {}) => ({
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
  ...overrides,
});

const activationFor = (candidate, overrides = {}) => ({
  schema_version: "1.0",
  record_type: "hosted_sandbox_activation",
  decision: "approved",
  candidate_sha256: candidateSha256(candidate),
  scope: "sandbox_base_sepolia_test_assets",
  reviewer: "external-reviewer",
  reviewed_at: "2026-09-06T11:00:00.000Z",
  expires_at: "2099-09-07T12:00:00.000Z",
  limits: { max_payments: 10, max_total_amount_minor: 100 },
  ...overrides,
});

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

const evidenceFor = (candidate, overrides = {}) => ({
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
    receipt_issuer: { id: "iss_sandbox" },
  },
  edge_machine_auth: {
    status_code: 200,
    interactive_challenge: false,
    redirect_count: 0,
  },
  failure_recovery: {
    duplicate_submission: { duplicate_funds: false, converged: true },
    lost_response: { duplicate_funds: false, outcome: "reconciled" },
  },
  transactions: [transaction("buyer_to_seller"), transaction("seller_to_buyer")],
  live: { included: false, execution_status: "execution_disabled" },
  ...overrides,
});

function secretFixture(context) {
  const directory = mkdtempSync(join(tmpdir(), "bu2-hosted-secrets-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const accessPath = join(directory, "access.json");
  const keyPath = join(directory, "buyer.key");
  const rpcPath = join(directory, "rpc.url");
  const access = [
    {
      id: "key_hosted_agent",
      token_sha256: digest("hosted-agent-token"),
      environment: "sandbox",
      tenant_id: "ten_hosted",
      principal_id: "agt_hosted",
      role: "agent",
      account_ids: ["acct_hosted"],
      agent_ids: ["agt_hosted"],
      generation: 1,
      status: "active",
    },
  ];
  writeFileSync(accessPath, JSON.stringify(access), { mode: 0o600 });
  writeFileSync(keyPath, `0x${"1".repeat(64)}\n`, { mode: 0o600 });
  writeFileSync(rpcPath, "https://base-sepolia-rpc.example-provider.invalid", { mode: 0o600 });
  return { directory, accessPath, keyPath, rpcPath, access };
}

async function rpcFixture(context, chainId = 84532) {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // 消费请求体后再响应，确保 Viem 完成一次真实 JSON-RPC 往返。
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${chainId.toString(16)}` }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("hosted runtime reads validated secret files without exposing direct secret environment values", (context) => {
  const fixture = secretFixture(context);
  const secrets = readHostedSandboxSecrets({
    BU2_API_CREDENTIALS_FILE: fixture.accessPath,
    X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
    BU2_RPC_URL_FILE: fixture.rpcPath,
  });
  assert.deepEqual(JSON.parse(secrets.accessCredentialsJson), fixture.access);
  assert.equal(secrets.buyerPrivateKey, `0x${"1".repeat(64)}`);

  assert.throws(
    () =>
      readHostedSandboxSecrets({
        BU2_API_CREDENTIALS_JSON: "[]",
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
        BU2_RPC_URL_FILE: fixture.rpcPath,
      }),
    (error) => error.code === "direct_secret_environment_forbidden",
  );
});

test("hosted runtime rejects symbolic links, raw tokens, wrong environments, and invalid keys", (context) => {
  const fixture = secretFixture(context);
  const linked = join(fixture.directory, "linked.key");
  symlinkSync(fixture.keyPath, linked);
  assert.throws(
    () =>
      readHostedSandboxSecrets({
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: linked,
        BU2_RPC_URL_FILE: fixture.rpcPath,
      }),
    (error) => error.code === "secret_file_invalid",
  );

  writeFileSync(
    fixture.accessPath,
    JSON.stringify([{ ...fixture.access[0], token: "raw-token" }]),
  );
  assert.throws(
    () =>
      readHostedSandboxSecrets({
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
        BU2_RPC_URL_FILE: fixture.rpcPath,
      }),
    (error) => error.code === "raw_access_token_forbidden",
  );

  writeFileSync(
    fixture.accessPath,
    JSON.stringify([{ ...fixture.access[0], environment: "live" }]),
  );
  assert.throws(
    () =>
      readHostedSandboxSecrets({
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
        BU2_RPC_URL_FILE: fixture.rpcPath,
      }),
    (error) => error.code === "access_credential_environment_mismatch",
  );

  writeFileSync(fixture.accessPath, JSON.stringify(fixture.access));
  writeFileSync(fixture.keyPath, "not-a-key");
  assert.throws(
    () =>
      readHostedSandboxSecrets({
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
        BU2_RPC_URL_FILE: fixture.rpcPath,
      }),
    (error) => error.code === "buyer_private_key_invalid",
  );
});

test("hosted runtime starts only after an authenticated Base Sepolia RPC preflight", async (context) => {
  const fixture = secretFixture(context);
  const rpcUrl = await rpcFixture(context);
  writeFileSync(fixture.rpcPath, rpcUrl);
  const running = await startHostedSandbox({
    BU2_API_CREDENTIALS_FILE: fixture.accessPath,
    X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
    BU2_RPC_URL_FILE: fixture.rpcPath,
    BU2_HOST: "127.0.0.1",
    BU2_SANDBOX_PORT: "0",
    BU2_SANDBOX_DB: join(fixture.directory, "sandbox.sqlite"),
    X402_RESOURCE_URL: "https://merchant.sandbox.bu2.com/premium-data",
  });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );
  const response = await fetch(`${running.url}/v1/environment`);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.equal(document.environment, "sandbox");
  assert.equal(document.chain_id, 84532);
  assert.equal(document.execution_status, "execution_enabled");
  assert.equal(document.access_mode, "authenticated");
});

test("hosted runtime rejects the wrong RPC chain before opening the API", async (context) => {
  const fixture = secretFixture(context);
  const rpcUrl = await rpcFixture(context, 8453);
  writeFileSync(fixture.rpcPath, rpcUrl);
  await assert.rejects(
    () =>
      startHostedSandbox({
        BU2_API_CREDENTIALS_FILE: fixture.accessPath,
        X402_BUYER_PRIVATE_KEY_FILE: fixture.keyPath,
        BU2_RPC_URL_FILE: fixture.rpcPath,
        BU2_HOST: "127.0.0.1",
        BU2_SANDBOX_PORT: "0",
        BU2_SANDBOX_DB: join(fixture.directory, "wrong-chain.sqlite"),
        X402_RESOURCE_URL: "https://merchant.sandbox.bu2.com/premium-data",
      }),
    (error) => error.code === "rpc_chain_mismatch",
  );
});

test("hosted candidate is immutable, HTTPS-only, Sandbox-only, and not self-authorizing", () => {
  const candidate = createHostedSandboxCandidate(candidateInput());
  assert.equal(candidate.artifact_digest, `sha256:${"a".repeat(64)}`);
  assert.equal(candidate.api_origin, "https://api.sandbox.bu2.com");
  assert.equal(candidate.environment.chain_id, 84532);
  assert.equal(candidate.authorization.hosted_deployment, false);
  assert.equal(candidate.authorization.testnet_payment_execution, false);
  assert.equal(candidate.authorization.human_activation_required, true);
  assert.equal(validateHostedSandboxCandidate(candidate), true);

  for (const apiOrigin of [
    "http://api.sandbox.bu2.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://sandbox.example",
    "https://api.sandbox.bu2.com/path",
  ]) {
    assert.throws(
      () => createHostedSandboxCandidate(candidateInput({ apiOrigin })),
      (error) => error.code === "hosted_api_origin_invalid",
    );
  }
  assert.throws(
    () => createHostedSandboxCandidate(candidateInput({ artifactReference: "bu2:latest" })),
    (error) => error.code === "artifact_reference_not_immutable",
  );
  assert.throws(
    () =>
      createHostedSandboxCandidate(
        candidateInput({
          secrets: {
            access_credentials: `0x${"1".repeat(64)}`,
            buyer_signer: "bu2/sandbox/buyer-signer-v1",
            rpc_endpoint: "bu2/sandbox/base-sepolia-rpc-v1",
          },
        }),
      ),
    (error) => error.code === "hosted_secret_reference_invalid",
  );
  assert.throws(
    () =>
      createHostedSandboxCandidate(
        candidateInput({
          secrets: {
            access_credentials: "bu2/sandbox/api-credentials-v1",
            buyer_signer: "bu2/sandbox/buyer-signer-v1",
            rpc_endpoint: "bu2/sandbox/base-sepolia-rpc-v1",
            raw_private_key: `0x${"1".repeat(64)}`,
          },
        }),
      ),
    (error) => error.code === "hosted_secret_reference_invalid",
  );
  assert.throws(
    () => createHostedSandboxCandidate(candidateInput({ gates: { ...gates, secret_scan: "failed" } })),
    (error) => error.code === "hosted_candidate_gate_incomplete",
  );
  const drifted = structuredClone(candidate);
  drifted.authorization.testnet_payment_execution = true;
  assert.throws(
    () => validateHostedSandboxCandidate(drifted),
    (error) => error.code === "hosted_candidate_self_authorized",
  );
});

test("activation is separately supplied, candidate-bound, time-bounded, and amount-bounded", () => {
  const candidate = createHostedSandboxCandidate(candidateInput());
  assert.equal(validateHostedSandboxActivation(activationFor(candidate), candidate, now), true);
  assert.throws(
    () =>
      validateHostedSandboxActivation(
        activationFor(candidate, { candidate_sha256: "d".repeat(64) }),
        candidate,
        now,
      ),
    (error) => error.code === "hosted_activation_invalid",
  );
  assert.throws(
    () =>
      validateHostedSandboxActivation(
        activationFor(candidate, { expires_at: "2026-09-06T11:30:00.000Z" }),
        candidate,
        now,
      ),
    (error) => error.code === "hosted_activation_expired",
  );
  assert.throws(
    () =>
      validateHostedSandboxActivation(
        activationFor(candidate, { limits: { max_payments: 0, max_total_amount_minor: 100 } }),
        candidate,
        now,
      ),
    (error) => error.code === "hosted_activation_limits_invalid",
  );
});

test("hosted evidence requires bilateral settlement, trusted receipts, failure convergence, and machine auth", () => {
  const candidate = createHostedSandboxCandidate(candidateInput());
  const activation = activationFor(candidate);
  const result = validateHostedSandboxEvidence(evidenceFor(candidate), candidate, activation, now);
  assert.equal(result.valid, true);
  assert.equal(result.environment, "sandbox");

  assert.throws(
    () =>
      validateHostedSandboxEvidence(
        evidenceFor(candidate, {
          edge_machine_auth: {
            status_code: 403,
            interactive_challenge: true,
            redirect_count: 1,
          },
        }),
        candidate,
        activation,
        now,
      ),
    (error) => error.code === "hosted_edge_auth_invalid",
  );
  assert.throws(
    () =>
      validateHostedSandboxEvidence(
        evidenceFor(candidate, { transactions: [transaction("buyer_to_seller")] }),
        candidate,
        activation,
        now,
      ),
    (error) => error.code === "hosted_bilateral_evidence_invalid",
  );
  const invalidReceipt = transaction("seller_to_buyer");
  invalidReceipt.receipt_verification.issuer_trusted = false;
  assert.throws(
    () =>
      validateHostedSandboxEvidence(
        evidenceFor(candidate, {
          transactions: [transaction("buyer_to_seller"), invalidReceipt],
        }),
        candidate,
        activation,
        now,
      ),
    (error) => error.code === "hosted_bilateral_evidence_invalid",
  );
});

test("hosted CLI emits JSON candidates and verifies externally supplied activation and evidence", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-hosted-cli-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const inputPath = join(directory, "candidate-input.json");
  const candidatePath = join(directory, "candidate.json");
  const activationPath = join(directory, "activation.json");
  const evidencePath = join(directory, "evidence.json");
  writeFileSync(inputPath, JSON.stringify(candidateInput()));

  const created = spawnSync(process.execPath, [cliPath, "candidate", inputPath], {
    encoding: "utf8",
  });
  assert.equal(created.status, 0, created.stderr);
  const candidate = JSON.parse(created.stdout);
  writeFileSync(candidatePath, JSON.stringify(candidate));
  writeFileSync(activationPath, JSON.stringify(activationFor(candidate)));
  writeFileSync(evidencePath, JSON.stringify(evidenceFor(candidate)));

  const verified = spawnSync(
    process.execPath,
    [cliPath, "verify-evidence", candidatePath, activationPath, evidencePath],
    { encoding: "utf8" },
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).valid, true);
});
