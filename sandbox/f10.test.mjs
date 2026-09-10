import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { bindReceivingTarget } from "./test-ledger-bindings.mjs";

function quoteInput(suffix = "f10") {
  return {
    seller_agent_id: `agt_seller_${suffix}`,
    payee_account_id: `acct_seller_${suffix}`,
    item: { name: "F10 payable resource", delivery_type: "research_data" },
    amount: { value: 250, currency: "CNY" },
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function receivableInput(quote, suffix = "f10") {
  return {
    quote_id: quote.id,
    account_id: `acct_seller_${suffix}`,
    agent_id: `agt_seller_${suffix}`,
    receiving_target_id: `tgt_seller_${suffix}`,
    expires_at: new Date(Date.now() + 43_200_000).toISOString(),
    purpose: "F10 payable resource",
    expected_payer_account_id: "acct_buyer_f10",
    expected_buyer_agent_id: "agt_buyer_f10",
    metadata: { source: "f10-test" },
  };
}

test("F10 creates an account-owned receivable from an active quote", async () => {
  const sandbox = new Bu2Sandbox();
  const quote = await sandbox.createQuote(quoteInput(), "f10-quote-create-001");
  const receivable = await sandbox.createReceivable(
    receivableInput(quote),
    "f10-receivable-create-001",
  );
  assert.match(receivable.id, /^rcv_/);
  assert.equal(receivable.quote_id, quote.id);
  assert.deepEqual(receivable.amount, quote.amount);
  assert.equal(receivable.status, "issued");
  assert.match(receivable.collection_reference, /^col_/);
  assert.equal(receivable.receiving_target_id, "tgt_seller_f10");
  assert.equal(sandbox.wallet.reserved, 0);
  assert.equal(sandbox.wallet.available, 100_000);
  assert.equal(sandbox.listReceivables().length, 1);
});

test("F10 receivables are idempotent and reject owner or expiry drift", async () => {
  const sandbox = new Bu2Sandbox();
  const quote = await sandbox.createQuote(quoteInput("idempotent"), "f10-quote-create-002");
  const input = receivableInput(quote, "idempotent");
  const first = await sandbox.createReceivable(input, "f10-receivable-create-002");
  const replay = await sandbox.createReceivable(input, "f10-receivable-create-002");
  assert.deepEqual(replay, first);
  await assert.rejects(
    sandbox.createReceivable({ ...input, purpose: "changed" }, "f10-receivable-create-002"),
    (error) => error.code === "idempotency_key_reused",
  );
  await assert.rejects(
    sandbox.createReceivable({ ...receivableInput(quote, "other"), quote_id: quote.id }, "f10-receivable-owner-003"),
    (error) => error.code === "receivable_owner_mismatch",
  );
  await assert.rejects(
    sandbox.createReceivable({ ...input, expires_at: new Date(Date.now() + 172_800_000).toISOString() }, "f10-receivable-expiry-004"),
    (error) => error.code === "receivable_expiry_after_quote",
  );
});

test("F10 receivables survive SQLite restart without moving funds", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f10-receivables-"));
  const database = join(directory, "receivables.sqlite");
  const config = loadEnvironmentConfig();
  try {
    const firstLedger = new SqliteLedger(database, { environmentConfig: config });
    bindReceivingTarget(firstLedger, { suffix: "restart" });
    const first = new Bu2Sandbox({ ledger: firstLedger, environmentConfig: config });
    const quote = await first.createQuote(quoteInput("restart"), "f10-quote-restart-005");
    const receivable = await first.createReceivable(
      receivableInput(quote, "restart"),
      "f10-receivable-restart-005",
    );
    firstLedger.close();

    const secondLedger = new SqliteLedger(database, { environmentConfig: config });
    const second = new Bu2Sandbox({ ledger: secondLedger, environmentConfig: config });
    assert.deepEqual(second.getReceivable(receivable.id), receivable);
    assert.equal(second.listReceivables()[0].status, "issued");
    assert.equal(second.wallet.reserved, 0);
    secondLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
