import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import { validateBu2McpHandshake } from "./mcp-runtime.mjs";

export class Bu2McpToolError extends Error {
  constructor(name, result) {
    const detail = result.structuredContent?.error;
    const text = result.content?.find((item) => item.type === "text")?.text;
    super(`${name} failed: ${detail?.code ?? text ?? "mcp_tool_error"}`);
    this.name = "Bu2McpToolError";
    this.result = result;
  }
}

export async function connectBu2McpClient({
  baseUrl,
  environment = "local",
  localDevelopment = environment === "local",
  apiKey,
  onDiagnostic = () => {},
} = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../bin/bu2-mcp.mjs", import.meta.url))],
    env: {
      ...getDefaultEnvironment(),
      BU2_ENDPOINT: baseUrl ?? "http://127.0.0.1:3100",
      BU2_ENVIRONMENT: environment,
      ...(localDevelopment ? { BU2_LOCAL_DEVELOPMENT: "true" } : {}),
      ...(apiKey ? { BU2_API_KEY: apiKey } : {}),
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => onDiagnostic(chunk.toString()));

  const client = new Client({ name: "bu2-external-agent-sample", version: "0.3.0" });
  await client.connect(transport);
  let handshake;
  try {
    handshake = validateBu2McpHandshake(
      client.getServerVersion(),
      client.getServerCapabilities(),
      environment,
    );
  } catch (error) {
    await client.close();
    throw error;
  }

  return {
    handshake,
    async listTools() {
      return (await client.listTools()).tools;
    },
    async call(name, args) {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) throw new Bu2McpToolError(name, result);
      return result.structuredContent;
    },
    async close() {
      await client.close();
    },
  };
}
