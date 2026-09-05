# BU2 MCP Host 配置 / Host Configuration

日期：2026-09-06
执行者：Codex
适用环境：Phase 0 Simulation / Base Sepolia Testnet

本目录提供 BU2 stdio MCP Server 的版本化 Host 配置。当前入口是仓库内私有分发，不是公开 npm 包或远程 MCP 服务。

This directory contains versioned host configuration for the BU2 stdio MCP Server. The current entrypoint is distributed only inside this repository; it is not a public npm package or a remotely hosted MCP service.

## 1. 启动前提 / Prerequisites

在仓库根目录安装依赖并启动 Reference Server：

Install dependencies and start the Reference Server from the repository root:

```bash
npm ci --prefix sandbox
npm --prefix sandbox start
```

稳定 MCP 入口：

Stable MCP entrypoint:

```text
/absolute/path/to/bu2com/sandbox/bin/bu2-mcp.mjs
```

将示例中的 `/absolute/path/to/bu2com` 替换为仓库的真实绝对路径。不要把 Secret、私钥或生产凭证写入这些配置。

Replace `/absolute/path/to/bu2com` with the repository's real absolute path. Do not place secrets, private keys, or production credentials in these files.

## 2. Codex

可以复制 [`codex-config.toml.example`](codex-config.toml.example) 到 Codex 配置，或使用当前 CLI 的标准 stdio 添加命令：

Copy [`codex-config.toml.example`](codex-config.toml.example) into the Codex configuration, or use the current CLI stdio command:

```bash
codex mcp add --env BU2_ENDPOINT=http://127.0.0.1:3100 \
  --env BU2_ENVIRONMENT=simulation \
  bu2-simulation -- node /absolute/path/to/bu2com/sandbox/bin/bu2-mcp.mjs
```

验证配置：

Verify the configuration:

```bash
codex mcp get bu2-simulation --json
```

## 3. Claude Desktop / Claude Code

Claude Desktop 使用 [`claude-desktop-config.json.example`](claude-desktop-config.json.example)。Claude Code 可以导入该配置，也可以运行：

Claude Desktop uses [`claude-desktop-config.json.example`](claude-desktop-config.json.example). Claude Code can import that configuration or run:

```bash
claude mcp add --transport stdio \
  --env BU2_ENDPOINT=http://127.0.0.1:3100 \
  --env BU2_ENVIRONMENT=simulation \
  bu2-simulation -- node /absolute/path/to/bu2com/sandbox/bin/bu2-mcp.mjs
```

项目级 Claude 配置第一次使用时可能要求用户确认该 stdio Server。此确认不等于授权任何付款；BU2 的 PaymentMandate、异常审批与结算边界保持不变。

A project-scoped Claude configuration may require user approval before the stdio server is first used. This trust decision does not authorize a payment; BU2 PaymentMandate, exception approval, and settlement boundaries remain unchanged.

## 4. 通用 Host / Generic Host

支持 `mcpServers` JSON 约定的 Host 可以从 [`generic-stdio-config.json.example`](generic-stdio-config.json.example) 开始。其他 Host 应映射相同的 `command`、`args` 和 `env` 字段。

Hosts using the `mcpServers` JSON convention can start from [`generic-stdio-config.json.example`](generic-stdio-config.json.example). Other hosts should map the same `command`, `args`, and `env` values into their native configuration format.

## 5. 版本与能力握手 / Version and capability handshake

在连接 Host 前可读取静态元数据并探测实际 endpoint：

Inspect static metadata and probe the configured endpoint before connecting a host:

```bash
BU2_ENVIRONMENT=simulation \
  node sandbox/bin/bu2-mcp.mjs --metadata

BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=simulation \
  node sandbox/bin/bu2-mcp.mjs --preflight
```

正常启动也会自动执行同一 preflight。它会在 stdio 会话建立前验证：

Normal startup performs the same preflight automatically. Before opening the stdio session, it validates:

- endpoint 是 BU2 Reference Server / the endpoint identifies a BU2 Reference Server;
- Agent Payment API contract version 与 `/v1` base path；
- configured `simulation` or `testnet` environment;
- MCP contract version compatibility.

MCP initialize 响应还会在 `capabilities.experimental["com.bu2.agent-payments"]` 中公开 API version、MCP version、contract SHA-256、环境、工具数量以及“不自动重试 mutation”的边界。Host 或自建 Client 应在调用工具前校验它；仓库内示例 Client 已强制校验。

The MCP initialize response also advertises the API version, MCP version, contract SHA-256, environment, tool count, and no-automatic-mutation-retry boundary under `capabilities.experimental["com.bu2.agent-payments"]`. Hosts or custom clients should validate it before calling a tool; the repository sample client enforces this check.

## 6. 环境边界 / Environment boundary

| `BU2_ENVIRONMENT` | Endpoint                              | 允许范围 / Allowed scope          |
| ----------------- | ------------------------------------- | --------------------------------- |
| `simulation`      | Local Reference Server                | 模拟交易 / simulated transactions |
| `testnet`         | Base Sepolia-enabled Reference Server | 测试网交易 / testnet transactions |

`mainnet` 会在 MCP 进程启动前被拒绝。六个 Agent 工具不包含人工授权和直接结算；未知写入结果不能自动重试。

`mainnet` is rejected before the MCP process starts. The six Agent tools do not expose human authorization or direct settlement; an unknown mutation result must not be retried automatically.

## 7. 参考 / References

- [MCP lifecycle and capability negotiation](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [OpenAI Codex configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
