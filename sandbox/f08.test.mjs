import test from "node:test";
import assert from "node:assert/strict";
import { Bu2Sandbox } from "./domain.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = new Date(Date.now() - 1_000).toISOString();

function quoteInput() {
  return {
    seller_agent_id: "agt_seller_f08",
    payee_account_id: "acct_seller_f08",
    item: { name: "F08 data", delivery_type: "research_data" },
    amount: { value: 100, currency: "USD" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function mandateInput(overrides = {}) {
  return {
    account_id: "acct_buyer_f08",
    agent_id: "agt_buyer_f08",
    funding_source_id: "fund_buyer_f08",
    receiving_target_id: "tgt_seller_f08",
    environment: "local",
    currency: "USD",
    max_single_amount: 500,
    daily_limit: 1_000,
    monthly_limit: 10_000,
    effective_at: now,
    ...overrides,
  };
}

test("F08 creates, activates, evaluates and persists a versioned mandate decision", async () => {
  const sandbox = new Bu2Sandbox();
  const mandate = await sandbox.createPaymentMandate(mandateInput(), "mandate-create-001");
  assert.equal(mandate.status, "draft");
  const active = await sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, "mandate-activate-001");
  assert.equal(active.status, "active");
  const quote = await sandbox.createQuote(quoteInput(), "quote-f08-001");
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: "acct_buyer_f08",
    buyer_agent_id: "agt_buyer_f08",
    payment_mandate_id: mandate.id,
    amount: quote.amount,
    purpose: "F08 data purchase",
    funding_source_id: "fund_buyer_f08",
    receiving_target_id: "tgt_seller_f08",
  }, "intent-f08-001");
  assert.equal(intent.authorization.decision, "review_required");
  assert.equal(intent.authorization.mandate_version, 1);
  assert.match(intent.authorization.policy_decision_id, /^dec_/);
  assert.equal(intent.policy_decision.mandate_id, mandate.id);
});

test("F08 denies an inactive mandate and prevents replacement version drift", async () => {
  const sandbox = new Bu2Sandbox();
  const mandate = await sandbox.createPaymentMandate(mandateInput(), "mandate-create-002");
  await assert.rejects(
    sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 2 }, "mandate-activate-002"),
    (error) => error.code === "mandate_version_conflict",
  );
  const quote = await sandbox.createQuote(quoteInput(), "quote-f08-002");
  const intent = await sandbox.createPaymentIntent({
    quote_id: quote.id,
    payer_account_id: "acct_buyer_f08",
    buyer_agent_id: "agt_buyer_f08",
    payment_mandate_id: mandate.id,
    amount: quote.amount,
    purpose: "F08 data purchase",
    funding_source_id: "fund_buyer_f08",
    receiving_target_id: "tgt_seller_f08",
  }, "intent-f08-002");
  assert.equal(intent.authorization.decision, "denied");
  assert.equal(intent.authorization.reason_code, "mandate_not_active");
  assert.equal(intent.status, "declined");
});

test("F08 mandate transitions are idempotent and terminal states cannot reactivate", async () => {
  const sandbox = new Bu2Sandbox();
  const mandate = await sandbox.createPaymentMandate(mandateInput(), "mandate-create-003");
  const revoked = await sandbox.transitionPaymentMandate(mandate.id, "revoke", { version: 1 }, "mandate-revoke-003");
  assert.equal(revoked.status, "revoked");
  const replay = await sandbox.transitionPaymentMandate(mandate.id, "revoke", { version: 1 }, "mandate-revoke-003");
  assert.equal(replay.status, "revoked");
  await assert.rejects(
    sandbox.transitionPaymentMandate(mandate.id, "activate", { version: 1 }, "mandate-reactivate-003"),
    (error) => error.code === "mandate_not_transitionable",
  );
});

test("F08 activation requires verified funding and receiving bindings in persistent runtimes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f08-bindings-"));
  const database = join(directory, "f08.sqlite");
  const config = loadEnvironmentConfig();
  const ledger = new SqliteLedger(database, { environmentConfig: config });
  try {
    const sandbox = new Bu2Sandbox({ ledger, environmentConfig: config });
    const mandate = await sandbox.createPaymentMandate(
      mandateInput({ currency: "CNY" }),
      "mandate-create-004",
    );
    await assert.rejects(
      sandbox.transitionPaymentMandate(
        mandate.id,
        "activate",
        { version: 1 },
        "mandate-activate-unbound-004",
      ),
      (error) => error.code === "funding_source_binding_required",
    );

    ledger.bootstrapIdentityTenants(
      normalizeOnboardingDocument(
        {
          environment: "local",
          requested_by: "usr_f08_operator",
          idempotency_key: "f08-wallet-bindings-004",
          tenants: [
            {
              tenant_id: "ten_f08_buyer",
              principal: { id: "usr_f08_buyer", display_name: "F08 Buyer" },
              accounts: [{ id: "acct_buyer_f08", display_name: "F08 Buyer" }],
              agents: [{ id: "agt_buyer_f08", display_name: "F08 Buyer Agent" }],
              credentials: [],
              funding_sources: [
                {
                  id: "fund_buyer_f08",
                  account_id: "acct_buyer_f08",
                  agent_id: "agt_buyer_f08",
                  asset: "CNY",
                  network: null,
                  provider: "simulated",
                  source_reference: "wallet:f08-buyer",
                },
              ],
              receiving_targets: [],
            },
            {
              tenant_id: "ten_f08_seller",
              principal: { id: "usr_f08_seller", display_name: "F08 Seller" },
              accounts: [{ id: "acct_seller_f08", display_name: "F08 Seller" }],
              agents: [{ id: "agt_seller_f08", display_name: "F08 Seller Agent" }],
              credentials: [],
              funding_sources: [],
              receiving_targets: [
                {
                  id: "tgt_seller_f08",
                  account_id: "acct_seller_f08",
                  agent_id: "agt_seller_f08",
                  asset: "CNY",
                  network: null,
                  provider: "simulated",
                  target_reference: "wallet:f08-seller",
                },
              ],
            },
          ],
        },
        "local",
      ),
    );
    const active = await sandbox.transitionPaymentMandate(
      mandate.id,
      "activate",
      { version: 1 },
      "mandate-activate-bound-004",
    );
    assert.equal(active.status, "active");
  } finally {
    ledger.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
