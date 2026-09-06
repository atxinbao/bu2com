import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BuyerAgent } from "./external-agents/buyer-agent.mjs";
import { bu2Request } from "./external-agents/bu2-http-client.mjs";
import {
  Bu2McpToolError,
  connectBu2McpClient,
} from "./external-agents/mcp-client.mjs";
import { runExternalAgentDemo } from "./external-agents/demo.mjs";
import { SellerAgent } from "./external-agents/seller-agent.mjs";
import { listen } from "./server.mjs";

const contract = JSON.parse(
  readFileSync(new URL("../docs/03-technical/mcp-tools.json", import.meta.url), "utf8"),
);

async function closeRunning(running, mcp) {
  await mcp?.close();
  await new Promise((resolve) => running.server.close(resolve));
  running.ledger.close();
}

test("MCP runtime exposes the six frozen tools and enforces idempotency", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  const mcp = await connectBu2McpClient({ baseUrl: running.url });
  context.after(() => closeRunning(running, mcp));

  const tools = await mcp.listTools();
  assert.deepEqual(
    tools.map(({ name }) => name).sort(),
    contract.tools.map(({ name }) => name).sort(),
  );
  assert.deepEqual(
    tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
    contract.tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  );

  const args = {
    seller_agent_id: "agt_mcp_seller",
    payee_account_id: "acct_mcp_seller",
    item_name: "MCP dataset",
    delivery_type: "dataset_access",
    amount_value: 100,
    currency: "CNY",
    expires_at: "2099-09-06T12:00:00Z",
    idempotency_key: "mcp-idempotent-quote",
  };
  const first = await mcp.call("bu2_create_quote", args);
  const replay = await mcp.call("bu2_create_quote", args);
  assert.equal(replay.id, first.id);

  await assert.rejects(
    () =>
      mcp.call("bu2_create_quote", {
        ...args,
        idempotency_key: "mcp-schema-drift",
        unexpected: true,
      }),
    /Input validation error/,
  );

  await assert.rejects(
    () => mcp.call("bu2_create_quote", { ...args, item_name: "Changed" }),
    (error) =>
      error instanceof Bu2McpToolError &&
      error.result.structuredContent.error.code === "idempotency_key_reused",
  );
});

test("external Buyer and Seller Agents share one HTTP Transaction Core", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  const mcp = await connectBu2McpClient({ baseUrl: running.url });
  context.after(() => closeRunning(running, mcp));
  const seller = new SellerAgent({ mcp });
  const buyer = new BuyerAgent({ mcp });

  const quote = await seller.createQuote({
    sellerAgentId: "agt_mcp_seller",
    payeeAccountId: "acct_mcp_seller",
    itemName: "Hybrid dataset",
    deliveryType: "dataset_access",
    amountValue: 3900,
    currency: "CNY",
    expiresAt: "2099-09-06T12:00:00Z",
    idempotencyKey: "hybrid-quote-key",
  });
  let intent = await buyer.createPaymentIntent({
    quoteId: quote.id,
    payerAccountId: "acct_mcp_buyer",
    buyerAgentId: "agt_mcp_buyer",
    paymentMandateId: "mdt_mcp_buyer",
    amountValue: 3900,
    currency: "CNY",
    purpose: "Hybrid E2E test",
    externalContextType: "agent_run",
    externalContextId: "run_hybrid_e2e",
    idempotencyKey: "hybrid-intent-key",
  });
  assert.equal(intent.status, "requires_authorization");

  intent = await bu2Request(
    running.url,
    `/v1/payment_intents/${intent.id}/authorization`,
    {
      method: "POST",
      idempotencyKey: "hybrid-authorize-key",
      body: { decision: "authorize" },
    },
  );
  assert.equal(intent.status, "funds_reserved");

  await seller.submitDelivery({
    transactionId: intent.transaction_id,
    deliveryType: "dataset_access",
    evidenceHash: "sha256:hybride2e",
    idempotencyKey: "hybrid-delivery-key",
  });
  const settlement = await bu2Request(
    running.url,
    `/v1/transactions/${intent.transaction_id}/settlements`,
    {
      method: "POST",
      idempotencyKey: "hybrid-settle-key",
      body: {},
    },
  );
  const receipt = await buyer.getReceipt(settlement.receipt.id);
  const verification = await buyer.verifyReceipt(receipt.id);
  const transaction = await bu2Request(
    running.url,
    `/v1/transactions/${intent.transaction_id}`,
  );

  assert.equal(verification.valid, true);
  assert.equal(transaction.transaction.status, "settled");
  assert.equal(transaction.payment_intent.id, intent.id);
  assert.equal(transaction.quote.id, quote.id);
  assert.equal(transaction.delivery.evidence_hash, "sha256:hybride2e");
  assert.equal(transaction.receipt.id, receipt.id);
});

test("one-command external Agent demo completes a local simulated transaction within 15 minutes", async () => {
  const summary = await runExternalAgentDemo({ log: () => {} });
  assert.equal(summary.environment, "local");
  assert.equal(summary.transaction_status, "settled");
  assert.equal(summary.receipt_valid, true);
  assert.ok(summary.elapsed_ms < 15 * 60 * 1000);
});
