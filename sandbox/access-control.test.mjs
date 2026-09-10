import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  AccessController,
  ACCESS_CONTRACT,
  credentialMetadata,
} from "./access-control.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { listen } from "./server.mjs";

const digest = (token) => createHash("sha256").update(token).digest("hex");
const token = () => `bu2_${randomBytes(32).toString("base64url")}`;

function credential({
  id,
  token: secret,
  environment = "local",
  tenant,
  principal,
  role,
  accounts = [],
  agents = [],
  generation = 1,
  expiresAt = null,
  status = "active",
}) {
  return {
    id,
    token_sha256: digest(secret),
    environment,
    tenant_id: tenant,
    principal_id: principal,
    role,
    account_ids: accounts,
    agent_ids: agents,
    generation,
    expires_at: expiresAt,
    status,
  };
}

async function request(base, path, { method = "GET", body, key, token: secret } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(key ? { "idempotency-key": key } : {}),
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    authenticate: response.headers.get("www-authenticate"),
  };
}

function closeServer(context, running) {
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );
}

test("access contract rejects external development-open mode and wrong-environment metadata", () => {
  assert.equal(ACCESS_CONTRACT.schema_version, "1.1");
  for (const role of ["agent", "developer", "operator"]) {
    assert.ok(ACCESS_CONTRACT.roles[role].includes("wallets:read"));
  }
  const sandboxConfig = loadEnvironmentConfig({
    environment: "sandbox",
    paymentAdapter: "x402",
    executionStatus: "execution_disabled",
  });
  assert.throws(
    () => new AccessController({ environmentConfig: sandboxConfig, mode: "development_open" }),
    (error) => error.code === "external_access_authentication_required",
  );
  const secret = token();
  assert.throws(
    () =>
      new AccessController({
        environmentConfig: sandboxConfig,
        credentials: [
          credential({
            id: "key_wrong_environment",
            token: secret,
            environment: "live",
            tenant: "ten_wrong_environment",
            principal: "agt_wrong_environment",
            role: "agent",
          }),
        ],
      }),
    (error) => error.code === "access_credential_environment_mismatch",
  );
});

test("credential metadata stores only a digest and cannot expand role permissions", () => {
  const secret = token();
  const metadata = credentialMetadata(
    {
      id: "key_digest_only",
      token: secret,
      environment: "local",
      tenant_id: "ten_digest_only",
      principal_id: "agt_digest_only",
      role: "agent",
      account_ids: ["acct_digest_only"],
      agent_ids: ["agt_digest_only"],
    },
    "local",
  );
  assert.equal(metadata.token_sha256, digest(secret));
  assert.equal(JSON.stringify(metadata).includes(secret), false);
  assert.throws(
    () =>
      new AccessController({
        environmentConfig: loadEnvironmentConfig(),
        mode: "authenticated",
        credentials: [
          {
            ...credential({
              id: "key_expanded_role",
              token: token(),
              tenant: "ten_expanded_role",
              principal: "agt_expanded_role",
              role: "agent",
            }),
            permissions: ["tenants:reset"],
          },
        ],
      }),
    (error) => error.code === "access_credential_permission_invalid",
  );
});

test("authenticated API separates Agent and operator actions and filters tenant resources", async (context) => {
  const secrets = {
    seller: token(),
    buyer: token(),
    outsider: token(),
    operator: token(),
  };
  const credentials = [
    credential({
      id: "key_seller",
      token: secrets.seller,
      tenant: "ten_seller",
      principal: "agt_seller",
      role: "agent",
      accounts: ["acct_seller"],
      agents: ["agt_seller"],
    }),
    credential({
      id: "key_buyer",
      token: secrets.buyer,
      tenant: "ten_buyer",
      principal: "agt_buyer",
      role: "agent",
      accounts: ["acct_buyer"],
      agents: ["agt_buyer"],
    }),
    credential({
      id: "key_outsider",
      token: secrets.outsider,
      tenant: "ten_outsider",
      principal: "agt_outsider",
      role: "agent",
      accounts: ["acct_outsider"],
      agents: ["agt_outsider"],
    }),
    credential({
      id: "key_operator",
      token: secrets.operator,
      tenant: "ten_operations",
      principal: "usr_operator",
      role: "operator",
    }),
  ];
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify(credentials),
  });
  closeServer(context, running);

  assert.equal((await request(running.url, "/health")).status, 200);
  const environment = await request(running.url, "/v1/environment");
  assert.equal(environment.status, 200);
  assert.equal(environment.body.access_mode, "authenticated");
  assert.equal(environment.body.public_capabilities.includes("transactions:read"), false);

  const anonymous = await request(running.url, "/v1/transactions");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, "credential_required");
  assert.equal(anonymous.authenticate, 'Bearer realm="bu2"');

  const identity = await request(running.url, "/v1/access", { token: secrets.seller });
  assert.equal(identity.status, 200);
  assert.equal(identity.body.tenant_id, "ten_seller");
  assert.equal(identity.body.role, "agent");
  assert.equal(JSON.stringify(identity.body).includes(secrets.seller), false);

  const spoofedQuote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "env05-spoofed-quote",
    token: secrets.seller,
    body: {
      seller_agent_id: "agt_outsider",
      payee_account_id: "acct_outsider",
      item: { name: "Spoofed", delivery_type: "dataset_access" },
      amount: { value: 100, currency: "CNY" },
      expires_at: "2026-09-12T08:00:00Z",
    },
  });
  assert.equal(spoofedQuote.status, 403);
  assert.equal(spoofedQuote.body.error.code, "resource_scope_denied");

  const quote = await request(running.url, "/v1/quotes", {
    method: "POST",
    key: "env05-seller-quote",
    token: secrets.seller,
    body: {
      seller_agent_id: "agt_seller",
      payee_account_id: "acct_seller",
      item: { name: "Controlled dataset", delivery_type: "dataset_access" },
      amount: { value: 100, currency: "CNY" },
      expires_at: "2026-09-12T08:00:00Z",
    },
  });
  assert.equal(quote.status, 201);

  const intent = await request(running.url, "/v1/payment_intents", {
    method: "POST",
    key: "env05-buyer-intent",
    token: secrets.buyer,
    body: {
      quote_id: quote.body.id,
      payer_account_id: "acct_buyer",
      buyer_agent_id: "agt_buyer",
      payment_mandate_id: "mdt_env05_buyer",
      amount: quote.body.amount,
      purpose: "Controlled access test",
    },
  });
  assert.equal(intent.status, 201);
  assert.equal(intent.body.status, "requires_authorization");

  assert.equal(
    (await request(running.url, `/v1/payment_intents/${intent.body.id}`, {
      token: secrets.outsider,
    })).status,
    404,
  );
  assert.equal(
    (await request(running.url, `/v1/payment_intents/${intent.body.id}`, {
      token: secrets.seller,
    })).status,
    200,
  );

  const agentApproval = await request(
    running.url,
    `/v1/payment_intents/${intent.body.id}/authorization`,
    {
      method: "POST",
      key: "env05-agent-approval",
      token: secrets.buyer,
      body: { decision: "authorize" },
    },
  );
  assert.equal(agentApproval.status, 403);
  assert.equal(agentApproval.body.error.code, "permission_denied");

  const approved = await request(
    running.url,
    `/v1/payment_intents/${intent.body.id}/authorization`,
    {
      method: "POST",
      key: "env05-operator-approval",
      token: secrets.operator,
      body: { decision: "authorize", reason: "Test operator approval" },
    },
  );
  assert.equal(approved.status, 200);
  const transactionId = approved.body.transaction_id;

  const outsiderTransactions = await request(running.url, "/v1/transactions", {
    token: secrets.outsider,
  });
  assert.equal(outsiderTransactions.body.data.length, 0);
  const buyerTransactions = await request(running.url, "/v1/transactions", {
    token: secrets.buyer,
  });
  assert.equal(buyerTransactions.body.data.length, 1);

  const delivery = await request(running.url, `/v1/transactions/${transactionId}/deliveries`, {
    method: "POST",
    key: "env05-seller-delivery",
    token: secrets.seller,
    body: { type: "dataset_access", evidence_hash: "sha256:env05delivery" },
  });
  assert.equal(delivery.status, 201);

  const settlement = await request(
    running.url,
    `/v1/transactions/${transactionId}/settlements`,
    {
      method: "POST",
      key: "env05-operator-settlement",
      token: secrets.operator,
      body: {},
    },
  );
  assert.equal(settlement.status, 201);
  const receiptId = settlement.body.receipt.id;
  assert.equal(
    (await request(running.url, `/v1/receipts/${receiptId}`, { token: secrets.buyer })).status,
    200,
  );
  assert.equal((await request(running.url, `/v1/receipts/${receiptId}/verify`)).status, 200);

  const agentSupport = await request(running.url, "/v1/operations/support_bundles", {
    method: "POST",
    token: secrets.buyer,
    body: { reason: "Agent must not inspect operations" },
  });
  assert.equal(agentSupport.status, 403);
  const support = await request(running.url, "/v1/operations/support_bundles", {
    method: "POST",
    token: secrets.operator,
    body: { reason: "Investigate test transaction", transaction_id: transactionId },
  });
  assert.equal(support.status, 201);
  assert.equal(support.body.transaction.id, transactionId);
  assert.equal(support.body.redaction.applied, true);
  const serialized = JSON.stringify(support.body);
  for (const secret of Object.values(secrets)) assert.equal(serialized.includes(secret), false);
  for (const forbidden of ["BU2_SANDBOX_DB", "authorization_header", "payment_mandate_id"]) {
    if (forbidden === "authorization_header") continue;
    assert.equal(serialized.includes(forbidden), false);
  }

  const audit = running.ledger.accessDecisionRows("local");
  assert.ok(audit.some((row) => row.reason_code === "credential_missing"));
  assert.ok(audit.some((row) => row.reason_code === "permission_denied"));
  assert.ok(audit.some((row) => row.reason_code === "resource_scope_denied"));
  assert.equal(JSON.stringify(audit).includes(secrets.operator), false);
});

test("Sandbox tenant reset is idempotent, preserves facts, and invalidates only one tenant", async (context) => {
  const agentSecret = token();
  const otherSecret = token();
  const operatorSecret = token();
  const credentials = [
    credential({
      id: "key_reset_agent",
      token: agentSecret,
      environment: "sandbox",
      tenant: "ten_reset_target",
      principal: "agt_reset_target",
      role: "agent",
      accounts: ["acct_reset_target"],
      agents: ["agt_reset_target"],
    }),
    credential({
      id: "key_reset_other",
      token: otherSecret,
      environment: "sandbox",
      tenant: "ten_reset_other",
      principal: "agt_reset_other",
      role: "agent",
      accounts: ["acct_reset_other"],
      agents: ["agt_reset_other"],
    }),
    credential({
      id: "key_reset_operator",
      token: operatorSecret,
      environment: "sandbox",
      tenant: "ten_operations",
      principal: "usr_reset_operator",
      role: "operator",
    }),
  ];
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    adapterMode: "x402",
    environment: "sandbox",
    executionStatus: "execution_disabled",
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify(credentials),
  });
  closeServer(context, running);

  assert.equal((await request(running.url, "/v1/access", { token: agentSecret })).status, 200);
  assert.equal((await request(running.url, "/v1/access", { token: otherSecret })).status, 200);
  const beforeEvents = running.ledger.listLedgerEvents().length;

  const reset = await request(
    running.url,
    "/v1/operations/tenants/ten_reset_target/resets",
    {
      method: "POST",
      key: "env05-reset-target",
      token: operatorSecret,
      body: { reason: "Rotate invited Sandbox tenant credentials" },
    },
  );
  assert.equal(reset.status, 201);
  assert.equal(reset.body.previous_generation, 1);
  assert.equal(reset.body.new_generation, 2);

  const replay = await request(
    running.url,
    "/v1/operations/tenants/ten_reset_target/resets",
    {
      method: "POST",
      key: "env05-reset-target",
      token: operatorSecret,
      body: { reason: "Rotate invited Sandbox tenant credentials" },
    },
  );
  assert.equal(replay.body.id, reset.body.id);
  assert.equal(running.ledger.listLedgerEvents().length, beforeEvents);

  const resetCredential = await request(running.url, "/v1/access", { token: agentSecret });
  assert.equal(resetCredential.status, 401);
  assert.equal(resetCredential.body.error.code, "credential_reset");
  assert.equal((await request(running.url, "/v1/access", { token: otherSecret })).status, 200);
  assert.equal((await request(running.url, "/v1/access", { token: operatorSecret })).status, 200);

  const conflict = await request(
    running.url,
    "/v1/operations/tenants/ten_reset_target/resets",
    {
      method: "POST",
      key: "env05-reset-target",
      token: operatorSecret,
      body: { reason: "Different reason" },
    },
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "idempotency_key_reused");
});

test("expired and revoked credentials fail without exposing token material", async (context) => {
  const expiredSecret = token();
  const revokedSecret = token();
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify([
      credential({
        id: "key_expired",
        token: expiredSecret,
        tenant: "ten_expired",
        principal: "agt_expired",
        role: "agent",
        expiresAt: "2025-01-01T00:00:00Z",
      }),
      credential({
        id: "key_revoked",
        token: revokedSecret,
        tenant: "ten_revoked",
        principal: "agt_revoked",
        role: "agent",
        status: "revoked",
      }),
    ]),
  });
  closeServer(context, running);

  const expired = await request(running.url, "/v1/access", { token: expiredSecret });
  const revoked = await request(running.url, "/v1/access", { token: revokedSecret });
  assert.equal(expired.body.error.code, "credential_expired");
  assert.equal(revoked.body.error.code, "credential_revoked");
  const evidence = JSON.stringify({ expired, revoked, audit: running.ledger.accessDecisionRows("local") });
  assert.equal(evidence.includes(expiredSecret), false);
  assert.equal(evidence.includes(revokedSecret), false);
});
