import assert from "node:assert/strict";
import test from "node:test";
import { runSocialWalletAcceptance, validateSocialWalletAcceptance } from "./social-wallet-acceptance.mjs";

const sourceCommit = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;

test("FP-07 proves the bounded Local Social Wallet product integration baseline", async () => {
  const evidence = await runSocialWalletAcceptance({ sourceCommit, imageId });
  assert.equal(validateSocialWalletAcceptance(evidence, { expectedSourceCommit: sourceCommit, expectedImageId: imageId }), true);
  assert.equal(evidence.scope.account_count, 2);
  assert.equal(evidence.scope.agent_count, 4);
  assert.deepEqual(evidence.flows.reconciliation_totals, { payments: 180, collections: 100, refunds: 20, fees: 1 });
  assert.equal(evidence.flows.per_transaction_operator_approval_count, 0);
  assert.equal(evidence.wallet_read.buyer_read_balance.value, 99_840);
  assert.equal(evidence.wallet_read.seller_cutover_activated, false);
  assert.equal(evidence.boundary.cross_agent_error_code, "funding_source_binding_required");
  assert.equal(evidence.boundary.wrong_asset_error_code, "funding_source_binding_mismatch");
  assert.equal(evidence.boundary.wrong_network_error_code, "funding_source_binding_mismatch");
  assert.equal(evidence.external_sandbox_bilateral.status, "not_executed");
  assert.equal(evidence.authorization.simulated_payment_flow_executed, true);
  assert.equal(evidence.product_boundary.product_promotion_authorized, false);
  assert.equal(evidence.product_boundary.buyer_side_provider_fee_spend_semantics_authorized, false);
});

test("FP-07 acceptance validator rejects source, funds, and product-authorization drift", async () => {
  const evidence = await runSocialWalletAcceptance({ sourceCommit, imageId });
  assert.equal(validateSocialWalletAcceptance({ ...evidence, source: { ...evidence.source, commit: "c".repeat(40) } }, { expectedSourceCommit: sourceCommit, expectedImageId: imageId }), false);
  assert.equal(validateSocialWalletAcceptance({ ...evidence, authorization: { ...evidence.authorization, payment_execution_attempted: true } }), false);
  assert.equal(validateSocialWalletAcceptance({ ...evidence, product_boundary: { ...evidence.product_boundary, public_wallet_api_authorized: true } }), false);
});
