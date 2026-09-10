import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { listen } from "./server.mjs";

const CURRENCY = "CNY";
const OPENING_VALUE = 100_000;

const token = () => `bu2_${randomBytes(32).toString("base64url")}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function credential({ id, secret, tenantId, principalId, accountIds }) {
  return {
    id,
    token_sha256: digest(secret),
    environment: "local",
    tenant_id: tenantId,
    principal_id: principalId,
    role: "agent",
    account_ids: accountIds,
    agent_ids: [principalId],
    generation: 1,
    expires_at: null,
    status: "active",
  };
}

async function request(base, path, secret = null) {
  const response = await fetch(`${base}${path}`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

async function setupWalletServer(context, suffix) {
  const ids = {
    ledgerAccountId: `lga_wallet_api_${suffix}`,
    accountId: `acct_wallet_api_${suffix}`,
    agentId: `agt_wallet_api_${suffix}`,
    tenantId: `ten_wallet_api_${suffix}`,
    fundingSourceId: `fund_wallet_api_${suffix}`,
  };
  const ownerSecret = token();
  const outsiderSecret = token();
  const ledger = new SqliteLedger(":memory:");
  ledger.registerLedgerAccount({
    id: ids.ledgerAccountId,
    environment: "local",
    tenant_id: ids.tenantId,
    book_id: "book_primary",
    owner_account_id: ids.accountId,
    asset: CURRENCY,
    network: null,
  });
  ledger.registerLedgerAccount({
    id: `lga_wallet_api_uninitialized_${suffix}`,
    environment: "local",
    tenant_id: ids.tenantId,
    book_id: "book_primary",
    owner_account_id: ids.accountId,
    asset: "USD",
    network: null,
  });
  ledger.bootstrapIdentityTenants(
    normalizeOnboardingDocument(
      {
        environment: "local",
        requested_by: "usr_wallet_api_operator",
        idempotency_key: `wallet-api-onboarding-${suffix}`,
        tenants: [
          {
            tenant_id: ids.tenantId,
            principal: { id: ids.agentId, display_name: ids.agentId, kind: "service" },
            accounts: [{ id: ids.accountId, display_name: ids.accountId }],
            agents: [{ id: ids.agentId, display_name: ids.agentId }],
            credentials: [],
            funding_sources: [
              {
                id: ids.fundingSourceId,
                account_id: ids.accountId,
                agent_id: ids.agentId,
                asset: CURRENCY,
                network: null,
                provider: "simulated",
                ledger_account_id: ids.ledgerAccountId,
                source_reference: `wallet:public-api-${suffix}`,
              },
            ],
            receiving_targets: [],
          },
        ],
      },
      "local",
    ),
  );
  const credentials = [
    credential({
      id: `key_wallet_api_owner_${suffix}`,
      secret: ownerSecret,
      tenantId: ids.tenantId,
      principalId: ids.agentId,
      accountIds: [ids.accountId],
    }),
    credential({
      id: `key_wallet_api_outsider_${suffix}`,
      secret: outsiderSecret,
      tenantId: `ten_wallet_api_outsider_${suffix}`,
      principalId: `agt_wallet_api_outsider_${suffix}`,
      accountIds: [`acct_wallet_api_outsider_${suffix}`],
    }),
  ];
  const running = await listen({
    port: 0,
    ledger,
    accessMode: "authenticated",
    accessCredentialsJson: JSON.stringify(credentials),
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

  await running.sandbox.createOpeningBalance(
    {
      id: `obc_wallet_api_${suffix}`,
      book_id: "book_primary",
      account_id: ids.accountId,
      owner_account_id: ids.accountId,
      funding_source_id: ids.fundingSourceId,
      environment: "local",
      asset: CURRENCY,
      network: null,
      amount: { value: OPENING_VALUE, currency: CURRENCY },
      effective_at: "2026-09-10T00:00:00.000Z",
      source_reference: `reconciled:wallet-api:${suffix}`,
      reason: "Public Wallet API account opening",
    },
    `wallet-api-opening-${suffix}`,
  );
  const plan = await running.sandbox.prepareWalletMigrationPlan(
    {
      ledger_account_id: ids.ledgerAccountId,
      currency: CURRENCY,
      history_strategy: "fully_bound",
      classifications: [],
    },
    `wallet-api-plan-${suffix}`,
  );
  running.sandbox.refreshLedgerAccountProjection({
    ledger_account_id: ids.ledgerAccountId,
    currency: CURRENCY,
    expected_active_version: null,
    migration_plan_id: plan.id,
  });
  const assessment = await running.sandbox.prepareWalletCutoverAssessment(
    {
      ledger_account_id: ids.ledgerAccountId,
      currency: CURRENCY,
      migration_plan_id: plan.id,
    },
    `wallet-api-assessment-${suffix}`,
  );
  await running.sandbox.activateWalletReadCutover(
    {
      assessment_id: assessment.id,
      expected_active_generation: 0,
      reason: "Activate account wallet for public read",
    },
    `wallet-api-activate-${suffix}`,
  );
  return { running, ids, ownerSecret, outsiderSecret };
}

test("Public Wallet API returns only authenticated account-scoped balances", async (context) => {
  const { running, ids, ownerSecret, outsiderSecret } = await setupWalletServer(context, "scope");

  assert.equal((await request(running.url, `/v1/accounts/${ids.accountId}/wallets`)).status, 401);
  const forbidden = await request(
    running.url,
    `/v1/accounts/${ids.accountId}/wallets`,
    outsiderSecret,
  );
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "resource_scope_denied");

  const response = await request(
    running.url,
    `/v1/accounts/${ids.accountId}/wallets`,
    ownerSecret,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    data: [
      {
        schema_version: "wallet.v1",
        account_id: ids.accountId,
        ledger_account_id: ids.ledgerAccountId,
        book_id: "book_primary",
        asset: CURRENCY,
        network: null,
        currency: CURRENCY,
        account_status: "active",
        status: "active",
        available: { value: OPENING_VALUE, currency: CURRENCY },
        reserved: { value: 0, currency: CURRENCY },
        balance_source: "account_wallet",
        read_mode: "ledger_projection",
        cutover_generation: 1,
        blockers: [],
        fallback_performed: false,
      },
    ],
  });

  const arbitraryLedger = await request(
    running.url,
    `/v1/accounts/${ids.accountId}/wallets?ledger_account_id=${ids.ledgerAccountId}`,
    ownerSecret,
  );
  assert.equal(arbitraryLedger.status, 400);
  assert.equal(arbitraryLedger.body.error.code, "invalid_query_parameters");

  await running.sandbox.rollbackWalletReadCutover(
    {
      ledger_account_id: ids.ledgerAccountId,
      currency: CURRENCY,
      expected_active_generation: 1,
      reason: "Verify the public API never exposes a legacy fallback",
    },
    "wallet-api-rollback-scope",
  );
  const rolledBack = await request(
    running.url,
    `/v1/accounts/${ids.accountId}/wallets`,
    ownerSecret,
  );
  assert.equal(rolledBack.body.data[0].status, "blocked");
  assert.equal(rolledBack.body.data[0].available, null);
  assert.equal(rolledBack.body.data[0].reserved, null);
  assert.deepEqual(rolledBack.body.data[0].blockers, ["account_wallet_cutover_not_active"]);
  assert.equal(Object.hasOwn(rolledBack.body.data[0], "legacy_wallet"), false);
});

test("Public Wallet API requires credentials even in Local development-open mode", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(
    () =>
      new Promise((resolve) =>
        running.server.close(() => {
          running.ledger.close();
          resolve();
        }),
      ),
  );

  const response = await request(running.url, "/v1/accounts/acct_local_wallet/wallets");
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "credential_required");
});

test("Public Wallet API hides amounts when the account wallet runtime is stale", async (context) => {
  const { running, ids, ownerSecret } = await setupWalletServer(context, "blocked");
  const createdAt = "2026-09-11T00:00:00.000Z";
  running.ledger.db
    .prepare("INSERT INTO resources(kind, id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run("test_sources", "src_wallet_api_drift", "{}", createdAt);
  running.ledger.writeBalancedJournals(
    [
      {
        id: "pst_wallet_api_drift_debit",
        event_id: "evt_wallet_api_drift",
        event_type: "journal.wallet_api_test",
        source_id: "src_wallet_api_drift",
        direction: "debit",
        account: "expense.wallet_api_test",
        amount_value: 10,
        currency: CURRENCY,
        ledger_account_id: ids.ledgerAccountId,
        created_at: createdAt,
      },
      {
        id: "pst_wallet_api_drift_credit",
        event_id: "evt_wallet_api_drift",
        event_type: "journal.wallet_api_test",
        source_id: "src_wallet_api_drift",
        direction: "credit",
        account: "liability.wallet_api_test",
        amount_value: 10,
        currency: CURRENCY,
        ledger_account_id: ids.ledgerAccountId,
        created_at: createdAt,
      },
    ],
    [
      {
        id: "evt_wallet_api_drift",
        type: "journal.wallet_api_test",
        resource_id: "src_wallet_api_drift",
        created_at: createdAt,
      },
    ],
  );

  const response = await request(
    running.url,
    `/v1/accounts/${ids.accountId}/wallets`,
    ownerSecret,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].status, "blocked");
  assert.equal(response.body.data[0].available, null);
  assert.equal(response.body.data[0].reserved, null);
  assert.equal(response.body.data[0].fallback_performed, false);
  assert.ok(response.body.data[0].blockers.includes("wallet_read_model_stale"));
  assert.equal(JSON.stringify(response.body).includes("legacy_wallet"), false);
});
