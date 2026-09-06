import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

const endpoint = process.env.BU2_ENDPOINT;
const mcpEntry = process.env.BU2_MCP_ENTRY;
const runId = process.env.BU2_RUN_ID ?? randomUUID().replaceAll("-", "").slice(0, 12);

if (!endpoint) throw new Error("BU2_ENDPOINT is required.");
if (!mcpEntry) throw new Error("BU2_MCP_ENTRY is required.");

const steps = [];

async function step(name, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    steps.push({ name, status: "passed", duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    steps.push({
      name,
      status: "failed",
      duration_ms: Date.now() - startedAt,
      error_code: error?.code ?? "client_step_failed",
    });
    throw error;
  }
}

async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const options = {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(new URL(path, `${endpoint}/`), options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`BU2 returned HTTP ${response.status}.`);
    error.code = payload?.error?.code ?? `http_${response.status}`;
    throw error;
  }
  return payload;
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: {
    ...getDefaultEnvironment(),
    BU2_ENDPOINT: endpoint,
    BU2_ENVIRONMENT: "local",
    BU2_LOCAL_DEVELOPMENT: "true",
  },
  stderr: "pipe",
});
const client = new Client({ name: "bu2-clean-room-mcp", version: "0.2.0" });
const startedAt = Date.now();

async function callTool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const error = new Error(`${name} failed.`);
    error.code = result.structuredContent?.error?.code ?? "mcp_tool_error";
    throw error;
  }
  return result.structuredContent;
}

try {
  await step("initialize", () => client.connect(transport));
  const capability = client.getServerCapabilities()?.experimental?.["com.bu2.agent-payments"];
  assert.equal(client.getServerVersion()?.name, "bu2-agent-payments");
  assert.equal(client.getServerVersion()?.version, "0.2.0");
  assert.equal(capability?.environment, "local");
  assert.equal(capability?.environment_contract_version, "1.0");
  assert.equal(capability?.local_development, true);
  assert.equal(capability?.automatic_mutation_retry, false);
  assert.equal(capability?.agent_authorization_tool, false);
  assert.equal(capability?.agent_settlement_tool, false);
  const tools = await step("list_tools", async () => (await client.listTools()).tools);
  assert.equal(tools.length, 6);

  const quote = await step("create_quote", () =>
    callTool("bu2_create_quote", {
      seller_agent_id: "agt_clean_mcp_seller",
      payee_account_id: "acct_clean_mcp_seller",
      item_name: "Clean-room MCP dataset",
      delivery_type: "dataset_access",
      amount_value: 3900,
      currency: "CNY",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      idempotency_key: `clean-mcp-quote-${runId}`,
    }),
  );
  let intent = await step("create_payment_intent", () =>
    callTool("bu2_create_payment_intent", {
      quote_id: quote.id,
      payer_account_id: "acct_clean_mcp_buyer",
      buyer_agent_id: "agt_clean_mcp_buyer",
      payment_mandate_id: "mdt_clean_mcp",
      amount_value: quote.amount.value,
      currency: quote.amount.currency,
      purpose: "Clean-room MCP acceptance",
      external_context_type: "agent_run",
      external_context_id: `run_clean_mcp_${runId}`,
      idempotency_key: `clean-mcp-intent-${runId}`,
    }),
  );
  if (intent.status === "requires_authorization") {
    intent = await step("authorize", () =>
      request(`/v1/payment_intents/${intent.id}/authorization`, {
        method: "POST",
        idempotencyKey: `clean-mcp-authorize-${runId}`,
        body: { decision: "authorize", reason: "Explicit local simulated acceptance" },
      }),
    );
  }
  await step("submit_delivery", () =>
    callTool("bu2_submit_delivery", {
      transaction_id: intent.transaction_id,
      delivery_type: "dataset_access",
      evidence_hash: `sha256:cleanmcp${runId}`,
      summary: "Clean-room MCP delivery",
      idempotency_key: `clean-mcp-delivery-${runId}`,
    }),
  );
  const settlement = await step("settle", () =>
    request(`/v1/transactions/${intent.transaction_id}/settlements`, {
      method: "POST",
      idempotencyKey: `clean-mcp-settle-${runId}`,
      body: {},
    }),
  );
  const receipt = await step("get_receipt", () =>
    callTool("bu2_get_receipt", { receipt_id: settlement.receipt.id }),
  );
  const verification = await step("verify_receipt", () =>
    callTool("bu2_verify_receipt", { receipt_id: receipt.id }),
  );

  assert.equal(settlement.transaction.status, "settled");
  assert.equal(verification.valid, true);

  console.log(
    JSON.stringify({
      path: "mcp",
      environment: "local",
      transaction_status: settlement.transaction.status,
      receipt_id: receipt.id,
      receipt_valid: verification.valid,
      execution_ms: Date.now() - startedAt,
      steps,
    }),
  );
} finally {
  await client.close();
}
