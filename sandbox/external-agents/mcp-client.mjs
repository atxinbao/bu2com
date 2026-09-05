import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";

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
  onDiagnostic = () => {},
} = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./mcp-server.mjs", import.meta.url))],
    env: {
      ...getDefaultEnvironment(),
      BU2_SANDBOX_URL: baseUrl ?? "http://127.0.0.1:3100",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => onDiagnostic(chunk.toString()));

  const client = new Client({ name: "bu2-external-agent-sample", version: "0.1.0" });
  await client.connect(transport);

  return {
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
