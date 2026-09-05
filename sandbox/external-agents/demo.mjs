import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { listen } from "../server.mjs";
import { BuyerAgent } from "./buyer-agent.mjs";
import { bu2Request } from "./bu2-http-client.mjs";
import { connectBu2McpClient } from "./mcp-client.mjs";
import { SellerAgent } from "./seller-agent.mjs";

async function closeReferenceServer(running) {
  if (!running) return;
  await new Promise((resolve) => running.server.close(resolve));
  running.ledger.close();
}

export async function runExternalAgentDemo({
  baseUrl = process.env.BU2_SANDBOX_URL,
  log = console.log,
} = {}) {
  const startedAt = Date.now();
  const running = baseUrl ? null : await listen({ port: 0, dbPath: ":memory:" });
  const activeBaseUrl = baseUrl ?? running.url;
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  let mcp;

  try {
    mcp = await connectBu2McpClient({ baseUrl: activeBaseUrl });
    const seller = new SellerAgent({ mcp });
    const buyer = new BuyerAgent({ mcp });

    log("1. Seller Agent creates Quote through MCP");
    const quote = await seller.createQuote({
      sellerAgentId: "agt_external_seller",
      payeeAccountId: "acct_external_seller",
      itemName: "External Agent research dataset",
      deliveryType: "dataset_access",
      amountValue: 3900,
      currency: "CNY",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      idempotencyKey: `seller-quote-${runId}`,
    });

    log("2. Buyer Agent creates PaymentIntent through MCP");
    let intent = await buyer.createPaymentIntent({
      quoteId: quote.id,
      payerAccountId: "acct_external_buyer",
      buyerAgentId: "agt_external_buyer",
      paymentMandateId: "mdt_external_simulation",
      amountValue: 3900,
      currency: "CNY",
      purpose: "Buy the external Agent research dataset",
      externalContextType: "agent_run",
      externalContextId: `run_${runId}`,
      idempotencyKey: `buyer-intent-${runId}`,
    });

    if (intent.status === "requires_authorization") {
      log("3. Demo account owner authorizes through the HTTP control plane");
      intent = await bu2Request(
        activeBaseUrl,
        `/v1/payment_intents/${intent.id}/authorization`,
        {
          method: "POST",
          idempotencyKey: `owner-authorize-${runId}`,
          body: {
            decision: "authorize",
            reason: "Explicit approval in the local Simulation demo",
          },
        },
      );
    } else {
      log("3. PaymentMandate auto-allows the known payee; no human action is required");
    }

    log("4. Seller Agent submits DeliveryEvidence through MCP");
    await seller.submitDelivery({
      transactionId: intent.transaction_id,
      deliveryType: "dataset_access",
      evidenceHash: `sha256:${runId}`,
      summary: "Signed access grant for the demo dataset",
      idempotencyKey: `seller-delivery-${runId}`,
    });

    log("5. BU2 settles through the HTTP control plane");
    const settlement = await bu2Request(
      activeBaseUrl,
      `/v1/transactions/${intent.transaction_id}/settlements`,
      {
        method: "POST",
        idempotencyKey: `bu2-settlement-${runId}`,
        body: {},
      },
    );

    log("6. Buyer Agent retrieves and verifies the Receipt through MCP");
    const finalStatus = await buyer.getPaymentStatus(intent.id);
    const receipt = await buyer.getReceipt(settlement.receipt.id);
    const verification = await buyer.verifyReceipt(receipt.id);
    const elapsedMs = Date.now() - startedAt;
    const summary = {
      environment: "simulation",
      payment_intent_id: finalStatus.id,
      transaction_id: finalStatus.transaction_id,
      transaction_status: settlement.transaction.status,
      receipt_id: receipt.id,
      receipt_valid: verification.valid,
      elapsed_ms: elapsedMs,
    };
    log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    try {
      await mcp?.close();
    } finally {
      await closeReferenceServer(running);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runExternalAgentDemo();
}
