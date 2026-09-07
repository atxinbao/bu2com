import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { listen } from "./server.mjs";

const digest = (token) => createHash("sha256").update(token).digest("hex");
const token = () => `bu2_${randomBytes(32).toString("base64url")}`;

function document(secretSuffix = "a") {
  return {
    environment: "local",
    requested_by: "usr_identity_operator",
    idempotency_key: `identity-onboarding-${secretSuffix}`,
    tenants: [
      {
        tenant_id: "ten_identity_buyer",
        principal: {
          id: "usr_identity_buyer",
          kind: "human",
          display_name: "Identity Buyer",
        },
        accounts: [{ id: "acct_identity_buyer", display_name: "Buyer Account" }],
        agents: [{ id: "agt_identity_buyer", display_name: "Buyer Agent" }],
        credentials: [
          {
            id: "key_identity_buyer",
            role: "agent",
            principal_id: "agt_identity_buyer",
            token_sha256: digest(`token-${secretSuffix}`),
            account_ids: ["acct_identity_buyer"],
            agent_ids: ["agt_identity_buyer"],
          },
        ],
      },
      {
        tenant_id: "ten_identity_seller",
        principal: {
          id: "usr_identity_seller",
          kind: "human",
          display_name: "Identity Seller",
        },
        accounts: [{ id: "acct_identity_seller", display_name: "Seller Account" }],
        agents: [{ id: "agt_identity_seller", display_name: "Seller Agent" }],
        credentials: [
          {
            id: "key_identity_seller",
            role: "agent",
            principal_id: "agt_identity_seller",
            token_sha256: digest(`seller-${secretSuffix}`),
            account_ids: ["acct_identity_seller"],
            agent_ids: ["agt_identity_seller"],
          },
        ],
      },
    ],
  };
}

test("persistent identity onboarding is idempotent and survives restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-identity-"));
  const database = join(directory, "identity.sqlite");
  const config = loadEnvironmentConfig();
  const firstLedger = new SqliteLedger(database, { environmentConfig: config });
  try {
    const first = firstLedger.bootstrapIdentityTenants(document());
    const replay = firstLedger.bootstrapIdentityTenants(document());
    assert.deepEqual(replay, first);
    assert.deepEqual(first.tenant_ids, ["ten_identity_buyer", "ten_identity_seller"]);
    assert.equal(first.identities[0].credentials[0].token_sha256, undefined);
    assert.equal(firstLedger.schemaVersion(), 11);
    assert.equal(firstLedger.identityTenants("local").length, 2);
  } finally {
    firstLedger.close();
  }

  const secondLedger = new SqliteLedger(database, { environmentConfig: config });
  try {
    const buyer = secondLedger.identityBundle("local", "ten_identity_buyer");
    assert.equal(buyer.principal.id, "usr_identity_buyer");
    assert.equal(buyer.accounts[0].owner_principal_id, "usr_identity_buyer");
    assert.equal(buyer.agents[0].owner_principal_id, "usr_identity_buyer");
    assert.equal(buyer.credentials[0].credential_id, "key_identity_buyer");
    assert.deepEqual(secondLedger.assertIdentityClaims("local", {
      tenant_id: "ten_identity_buyer",
      platform_access: false,
    }, {
      accountIds: ["acct_identity_buyer"],
      agentIds: ["agt_identity_buyer"],
    }), undefined);
    assert.throws(
      () =>
        secondLedger.assertIdentityClaims("local", {
          tenant_id: "ten_identity_buyer",
          platform_access: false,
        }, {
          accountIds: ["acct_identity_seller"],
          agentIds: [],
        }),
      (error) => error.code === "resource_scope_denied",
    );
  } finally {
    secondLedger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("onboarding rejects raw tokens and identity metadata conflicts", () => {
  assert.throws(
    () =>
      normalizeOnboardingDocument({
        ...document(),
        tenants: [
          {
            ...document().tenants[0],
            credentials: [
              {
                ...document().tenants[0].credentials[0],
                token: token(),
              },
            ],
          },
        ],
      }, "local"),
    (error) => error.code === "onboarding_token_material_forbidden",
  );

  const ledger = new SqliteLedger(":memory:", { environmentConfig: loadEnvironmentConfig() });
  try {
    ledger.bootstrapIdentityTenants(document());
    assert.throws(
      () =>
        ledger.bootstrapIdentityTenants({
          ...document("different"),
          idempotency_key: "identity-onboarding-conflict",
          tenants: [
            {
              ...document("different").tenants[0],
              principal: {
                ...document("different").tenants[0].principal,
                id: "usr_identity_buyer",
              },
            },
          ],
        }),
      (error) => error.code === "identity_binding_conflict" || error.code === "credential_binding_conflict",
    );
  } finally {
    ledger.close();
  }
});

test("authenticated access exposes persisted ownership without token material", async (context) => {
  const buyerSecret = token();
  const operatorSecret = token();
  const running = await listen({
    port: 0,
    dbPath: ":memory:",
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify([
      {
        id: "key_identity_http_buyer",
        token_sha256: digest(buyerSecret),
        environment: "local",
        tenant_id: "ten_identity_http_buyer",
        principal_id: "agt_identity_http_buyer",
        role: "agent",
        account_ids: ["acct_identity_http_buyer"],
        agent_ids: ["agt_identity_http_buyer"],
      },
      {
        id: "key_identity_http_operator",
        token_sha256: digest(operatorSecret),
        environment: "local",
        tenant_id: "ten_identity_http_ops",
        principal_id: "usr_identity_http_operator",
        role: "operator",
      },
    ]),
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
  const response = await fetch(`${running.url}/v1/access`, {
    headers: { authorization: `Bearer ${buyerSecret}` },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.identity.principal.id, "agt_identity_http_buyer");
  assert.equal(body.identity.accounts[0].id, "acct_identity_http_buyer");
  assert.equal(body.identity.agents[0].id, "agt_identity_http_buyer");
  assert.equal(JSON.stringify(body).includes(buyerSecret), false);
  assert.equal(JSON.stringify(body).includes(digest(buyerSecret)), false);

  const denied = await fetch(`${running.url}/v1/operations/tenants/ten_identity_http_buyer/resets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${buyerSecret}`,
      "content-type": "application/json",
      "idempotency-key": "identity-agent-denied",
    },
    body: JSON.stringify({ reason: "Agent cannot manage tenant access." }),
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "permission_denied");
});
