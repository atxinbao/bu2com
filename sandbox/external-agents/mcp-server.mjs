import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Bu2HttpError, bu2Request } from "./bu2-http-client.mjs";

const contract = JSON.parse(
  readFileSync(new URL("../../docs/03-technical/mcp-tools.json", import.meta.url), "utf8"),
);

const amount = (args) => ({
  value: args.amount_value,
  currency: args.currency,
});

function externalContext(args) {
  if (!args.external_context_type && !args.external_context_id) return undefined;
  return {
    type: args.external_context_type,
    id: args.external_context_id,
  };
}

export async function executeBu2McpTool(baseUrl, name, args) {
  switch (name) {
    case "bu2_create_quote":
      return bu2Request(baseUrl, "/v1/quotes", {
        method: "POST",
        idempotencyKey: args.idempotency_key,
        body: {
          seller_agent_id: args.seller_agent_id,
          payee_account_id: args.payee_account_id,
          item: {
            name: args.item_name,
            delivery_type: args.delivery_type,
          },
          amount: amount(args),
          expires_at: args.expires_at,
        },
      });
    case "bu2_create_payment_intent":
      return bu2Request(baseUrl, "/v1/payment_intents", {
        method: "POST",
        idempotencyKey: args.idempotency_key,
        body: {
          quote_id: args.quote_id,
          payer_account_id: args.payer_account_id,
          buyer_agent_id: args.buyer_agent_id,
          payment_mandate_id: args.payment_mandate_id,
          amount: amount(args),
          purpose: args.purpose,
          ...(externalContext(args)
            ? { external_context: externalContext(args) }
            : {}),
        },
      });
    case "bu2_get_payment_status":
      return bu2Request(
        baseUrl,
        `/v1/payment_intents/${encodeURIComponent(args.payment_intent_id)}`,
      );
    case "bu2_submit_delivery":
      return bu2Request(
        baseUrl,
        `/v1/transactions/${encodeURIComponent(args.transaction_id)}/deliveries`,
        {
          method: "POST",
          idempotencyKey: args.idempotency_key,
          body: {
            type: args.delivery_type,
            evidence_hash: args.evidence_hash,
            ...(args.summary ? { summary: args.summary } : {}),
          },
        },
      );
    case "bu2_get_receipt":
      return bu2Request(
        baseUrl,
        `/v1/receipts/${encodeURIComponent(args.receipt_id)}`,
      );
    case "bu2_verify_receipt":
      return bu2Request(
        baseUrl,
        `/v1/receipts/${encodeURIComponent(args.receipt_id)}/verify`,
      );
    default:
      throw new Error(`Unsupported BU2 MCP tool: ${name}`);
  }
}

function toolError(error) {
  if (error instanceof Bu2HttpError) return error.payload;
  return {
    error: {
      type: "internal_error",
      code: "mcp_bridge_error",
      message: error instanceof Error ? error.message : "BU2 MCP bridge failed.",
    },
  };
}

export function createBu2McpServer({
  baseUrl = process.env.BU2_SANDBOX_URL ?? "http://127.0.0.1:3100",
} = {}) {
  const server = new McpServer(
    { name: contract.name, version: contract.version },
    {
      instructions:
        "BU2 is the transaction boundary. Use idempotency keys for every write. Authorization and settlement remain explicit human or BU2 control-plane actions and are not exposed as Agent tools.",
    },
  );

  for (const tool of contract.tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema),
      },
      async (args) => {
        try {
          const result = await executeBu2McpTool(baseUrl, tool.name, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          const result = toolError(error);
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        }
      },
    );
  }

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serveStdio(() => createBu2McpServer());
  console.error("BU2 MCP Server v0.1 running on stdio");
}
