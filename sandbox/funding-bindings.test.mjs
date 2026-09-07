import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";

const config = loadEnvironmentConfig();

const document = (suffix = "v1") => ({
  environment: "local",
  requested_by: "usr_binding_operator",
  idempotency_key: `wallet-bindings-${suffix}`,
  tenants: [
    {
      tenant_id: "ten_binding",
      principal: { id: "usr_binding_owner", display_name: "Binding Owner" },
      accounts: [{ id: "acct_binding", display_name: "Binding Account" }],
      agents: [{ id: "agt_binding", display_name: "Binding Agent" }],
      credentials: [],
      funding_sources: [
        {
          id: "fund_binding_v1",
          account_id: "acct_binding",
          agent_id: "agt_binding",
          asset: "CNY",
          network: null,
          provider: "simulated",
          source_reference: "wallet:binding-source-v1",
        },
      ],
      receiving_targets: [
        {
          id: "tgt_binding_v1",
          account_id: "acct_binding",
          agent_id: "agt_binding",
          asset: "CNY",
          network: null,
          provider: "simulated",
          target_reference: "wallet:binding-target-v1",
        },
      ],
    },
  ],
});

test("F06b bindings are normalized, persisted, exposed, and survive restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-bindings-"));
  const database = join(directory, "bindings.sqlite");
  try {
    const first = new SqliteLedger(database, { environmentConfig: config });
    const normalized = normalizeOnboardingDocument(document(), "local");
    const result = first.bootstrapIdentityTenants(normalized);
    assert.equal(result.identities[0].funding_sources[0].id, "fund_binding_v1");
    assert.equal(result.identities[0].receiving_targets[0].id, "tgt_binding_v1");
    assert.deepEqual(
      first.assertWalletBinding("local", {
        kind: "funding_source",
        accountId: "acct_binding",
        agentId: "agt_binding",
        asset: "CNY",
        network: null,
      }).bound,
      true,
    );
    assert.equal(
      first.assertWalletBinding("local", {
        kind: "receiving_target",
        accountId: "acct_binding",
        agentId: "agt_binding",
        asset: "CNY",
        network: null,
        reference: "wallet:binding-target-v1",
      }).binding.id,
      "tgt_binding_v1",
    );
    first.close();

    const second = new SqliteLedger(database, { environmentConfig: config });
    const identity = second.identityBundle("local", "ten_binding");
    assert.equal(identity.funding_sources[0].generation, 1);
    assert.equal(identity.receiving_targets[0].verification_status, "verified");
    assert.equal(second.schemaVersion(), 13);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("F06b rejects cross-tenant, environment, asset, network, and target drift", () => {
  assert.throws(
    () =>
      normalizeOnboardingDocument(
        {
          ...document(),
          tenants: [
            {
              ...document().tenants[0],
              funding_sources: [
                {
                  ...document().tenants[0].funding_sources[0],
                  account_id: "acct_other",
                },
              ],
            },
          ],
        },
        "local",
      ),
    (error) => error.code === "identity_binding_claim_unknown",
  );

  const ledger = new SqliteLedger(":memory:", { environmentConfig: config });
  try {
    ledger.bootstrapIdentityTenants(normalizeOnboardingDocument(document(), "local"));
    assert.throws(
      () =>
        ledger.assertWalletBinding("local", {
          kind: "funding_source",
          accountId: "acct_binding",
          agentId: "agt_binding",
          asset: "USD",
          network: null,
        }),
      (error) => error.code === "funding_source_binding_mismatch",
    );
    assert.throws(
      () =>
        ledger.assertWalletBinding("local", {
          kind: "receiving_target",
          accountId: "acct_binding",
          agentId: "agt_binding",
          asset: "CNY",
          network: null,
          reference: "wallet:changed-target",
        }),
      (error) => error.code === "receiving_target_binding_mismatch",
    );
  } finally {
    ledger.close();
  }
});

test("F06b onboarding remains idempotent and binding IDs cannot be silently overwritten", () => {
  const ledger = new SqliteLedger(":memory:", { environmentConfig: config });
  try {
    const first = ledger.bootstrapIdentityTenants(normalizeOnboardingDocument(document(), "local"));
    assert.deepEqual(
      ledger.bootstrapIdentityTenants(normalizeOnboardingDocument(document(), "local")),
      first,
    );
    assert.throws(
      () =>
        ledger.bootstrapIdentityTenants(
          normalizeOnboardingDocument(
            {
              ...document("conflict"),
              idempotency_key: "wallet-bindings-conflict",
              tenants: [
                {
                  ...document("conflict").tenants[0],
                  funding_sources: [
                    {
                      ...document("conflict").tenants[0].funding_sources[0],
                      id: "fund_binding_v1",
                      source_reference: "wallet:changed",
                    },
                  ],
                },
              ],
            },
            "local",
          ),
        ),
      (error) => error.code === "identity_binding_conflict",
    );
  } finally {
    ledger.close();
  }
});
