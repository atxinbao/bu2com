import { pathToFileURL } from "node:url";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Bu2HttpError, bu2Request } from "./bu2-http-client.mjs";
import {
  BU2_MCP_CAPABILITY_NAMESPACE,
  Bu2McpCompatibilityError,
  bu2McpCapability,
  bu2McpMetadata,
  expectedEnvironmentInfo,
  loadBu2McpConfiguration,
  mcpContract,
  preflightBu2Endpoint,
} from "./mcp-runtime.mjs";

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

export async function executeBu2McpTool(baseUrl, name, args, { apiKey = null } = {}) {
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
        apiKey,
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
          ...(externalContext(args) ? { external_context: externalContext(args) } : {}),
        },
        apiKey,
      });
    case "bu2_get_payment_status":
      return bu2Request(
        baseUrl,
        `/v1/payment_intents/${encodeURIComponent(args.payment_intent_id)}`,
        { apiKey },
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
          apiKey,
        },
      );
    case "bu2_get_receipt":
      return bu2Request(baseUrl, `/v1/receipts/${encodeURIComponent(args.receipt_id)}`, { apiKey });
    case "bu2_verify_receipt":
      return bu2Request(baseUrl, `/v1/receipts/${encodeURIComponent(args.receipt_id)}/verify`);
    default:
      throw new Error(`Unsupported BU2 MCP tool: ${name}`);
  }
}

function toolError(error) {
  if (error instanceof Bu2HttpError) return error.payload;
  if (error instanceof Bu2McpCompatibilityError) {
    return {
      error: {
        type: "configuration_error",
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  return {
    error: {
      type: "internal_error",
      code: "mcp_bridge_error",
      message: error instanceof Error ? error.message : "BU2 MCP bridge failed.",
    },
  };
}

export function createBu2McpServer({
  baseUrl = process.env.BU2_ENDPOINT ?? process.env.BU2_SANDBOX_URL ?? "http://127.0.0.1:3100",
  environment = process.env.BU2_ENVIRONMENT,
  localDevelopment = process.env.BU2_LOCAL_DEVELOPMENT === "true",
  apiKey = process.env.BU2_API_KEY,
  environmentInfo = null,
  fetchImpl = fetch,
} = {}) {
  const configuration = loadBu2McpConfiguration({
    BU2_ENDPOINT: baseUrl,
    BU2_ENVIRONMENT: environment,
    ...(localDevelopment ? { BU2_LOCAL_DEVELOPMENT: "true" } : {}),
    ...(apiKey ? { BU2_API_KEY: apiKey } : {}),
  });
  const activeEnvironmentInfo = environmentInfo ?? expectedEnvironmentInfo(configuration.environment);
  const mutationTools = new Set([
    "bu2_create_quote",
    "bu2_create_payment_intent",
    "bu2_submit_delivery",
  ]);
  const server = new McpServer(
    { name: mcpContract.name, version: mcpContract.version, title: "BU2 Agent Payments" },
    {
      capabilities: {
        experimental: {
          [BU2_MCP_CAPABILITY_NAMESPACE]: bu2McpCapability(activeEnvironmentInfo),
        },
      },
      instructions:
        "BU2 is the transaction boundary. Use idempotency keys for every write. Authorization and settlement remain explicit human or BU2 control-plane actions and are not exposed as Agent tools. Inspect the com.bu2.agent-payments capability before calling a tool.",
    },
  );

  for (const tool of mcpContract.tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema),
      },
      async (args) => {
        try {
          if (mutationTools.has(tool.name)) {
            const current = await preflightBu2Endpoint(configuration, { fetchImpl });
            if (current.execution_status !== "execution_enabled") {
              throw new Bu2McpCompatibilityError(
                "environment_execution_disabled",
                "BU2 payment execution is disabled for this environment.",
                {
                  environment: current.environment,
                  execution_status: current.execution_status,
                },
              );
            }
          }
          const result = await executeBu2McpTool(configuration.endpoint, tool.name, args, {
            apiKey: configuration.apiKey,
          });
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

function cliError(error) {
  if (error instanceof Bu2McpCompatibilityError) {
    return {
      event: "bu2.mcp.startup.failed",
      code: error.code,
      message: error.message,
      recovery: error.recovery,
      details: error.details,
    };
  }
  return {
    event: "bu2.mcp.startup.failed",
    code: "mcp_startup_failed",
    message: error instanceof Error ? error.message : "BU2 MCP startup failed.",
    recovery: "fix_configuration",
  };
}

function helpText() {
  return [
    "BU2 MCP Server v0.3",
    "",
    "Usage: node sandbox/bin/bu2-mcp.mjs [--metadata | --preflight | --version | --help]",
    "",
    "Environment:",
    "  BU2_ENDPOINT       BU2 Reference Server base URL (default http://127.0.0.1:3100)",
    "  BU2_ENVIRONMENT    sandbox or live; local requires BU2_LOCAL_DEVELOPMENT=true",
    "  BU2_LOCAL_DEVELOPMENT  true only for the local simulated Reference Server",
    "  BU2_API_KEY        required for sandbox and live; never sent during preflight",
    "  BU2_SANDBOX_URL    deprecated alias for BU2_ENDPOINT",
  ].join("\n");
}

export async function runBu2McpCli({
  args = process.argv.slice(2),
  environment = process.env,
  fetchImpl = fetch,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const knownFlags = new Set(["--help", "--metadata", "--preflight", "--version"]);
  if (args.length > 1 || (args.length === 1 && !knownFlags.has(args[0]))) {
    throw new Bu2McpCompatibilityError(
      "cli_argument_invalid",
      "Use one of --metadata, --preflight, --version, or --help.",
    );
  }
  if (args[0] === "--help") {
    stdout(helpText());
    return null;
  }
  if (args[0] === "--version") {
    stdout(mcpContract.version);
    return null;
  }
  const configuration = loadBu2McpConfiguration(environment);
  if (args[0] === "--metadata") {
    stdout(JSON.stringify(bu2McpMetadata(configuration.environment), null, 2));
    return null;
  }
  const preflight = await preflightBu2Endpoint(configuration, { fetchImpl });
  if (args[0] === "--preflight") {
    stdout(JSON.stringify({ status: "compatible", ...preflight }, null, 2));
    return null;
  }
  stderr(JSON.stringify({ event: "bu2.mcp.preflight.ok", ...preflight }));
  const handle = serveStdio(() =>
    createBu2McpServer({
      baseUrl: configuration.endpoint,
      environment: configuration.environment,
      localDevelopment: configuration.localDevelopment,
      apiKey: configuration.apiKey,
      environmentInfo: preflight,
      fetchImpl,
    }),
  );
  stderr(
    JSON.stringify({
      event: "bu2.mcp.started",
      transport: "stdio",
      server: `${mcpContract.name}@${mcpContract.version}`,
    }),
  );
  return handle;
}

export async function main(options) {
  try {
    return await runBu2McpCli(options);
  } catch (error) {
    const stderr = options?.stderr ?? console.error;
    stderr(JSON.stringify(cliError(error)));
    process.exitCode = 1;
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
