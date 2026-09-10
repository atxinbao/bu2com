import { normalizeOnboardingDocument } from "./identity.mjs";

const token = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "_");

export function bindReceivingTarget(ledger, {
  suffix,
  account_id = `acct_seller_${suffix}`,
  agent_id = `agt_seller_${suffix}`,
  receiving_target_id = `tgt_seller_${suffix}`,
  tenant_id = `ten_${suffix}`,
  asset = "CNY",
  network = null,
  book_id = "book_primary",
} = {}) {
  const key = token(suffix);
  const ledgerAccountId = `lga_test_${key}`;
  ledger.registerLedgerAccount({
    id: ledgerAccountId,
    environment: "local",
    tenant_id,
    book_id,
    owner_account_id: account_id,
    asset,
    network,
  });
  ledger.bootstrapIdentityTenants(normalizeOnboardingDocument({
    environment: "local",
    requested_by: `usr_test_operator_${key}`,
    idempotency_key: `test-binding-${key}`,
    tenants: [{
      tenant_id,
      principal: { id: `usr_test_owner_${key}`, display_name: `Test Owner ${key}` },
      accounts: [{ id: account_id, display_name: `Test Account ${key}` }],
      agents: [{ id: agent_id, display_name: `Test Agent ${key}` }],
      credentials: [],
      funding_sources: [],
      receiving_targets: [{
        id: receiving_target_id,
        account_id,
        agent_id,
        asset,
        network,
        provider: "simulated",
        ledger_account_id: ledgerAccountId,
        target_reference: `wallet:test-${key}`,
      }],
    }],
  }, "local"));
  return ledgerAccountId;
}
