# BU2 Clean-room Integration Samples / 接入样例

日期：2026-09-06<br>
执行者：Codex<br>
适用环境：Phase 0 Simulation

本目录提供 E2.4 使用的三条独立客户端入口。正式验收不会从这些文件所在目录直接执行，而是将对应文件复制到三个全新的系统临时项目，再分别通过 HTTP、TypeScript SDK tarball 和 MCP stdio 完成交易。

This directory contains the three independent client entrypoints used by E2.4. The acceptance runner copies each client into a fresh operating-system temporary project, then completes a transaction through HTTP, a local TypeScript SDK tarball, or the stable MCP stdio entrypoint.

## 自动验收 / Automated acceptance

在仓库根目录安装 Sandbox 与 SDK 依赖，然后运行：

Install the Sandbox and SDK dependencies from the repository root, then run:

```bash
npm ci --prefix sandbox
npm ci --prefix packages/typescript-sdk
npm --prefix sandbox run acceptance:clean-room
```

验收器按固定顺序运行 `http`、`sdk`、`mcp`。每条路径：

The runner executes `http`, `sdk`, and `mcp` in that order. Every path:

- 从空目录开始，并拥有独立 `package.json` / starts from an empty directory with its own `package.json`;
- 使用独立内存 Simulation Reference Server / uses an independent in-memory Simulation Reference Server;
- 完成 Quote → PaymentIntent → Authorization → DeliveryEvidence → Settlement → Receipt；
- 在 15 分钟内得到 `receipt_valid=true` / obtains `receipt_valid=true` within 15 minutes;
- 运行前后校验相关 BU2 源码哈希，并在结束后删除临时项目 / verifies relevant BU2 source hashes before and after execution and removes the temporary project;
- 只记录阶段、耗时、状态、稳定错误码与恢复动作 / records only stages, durations, status, stable error codes, and recovery actions.

完整证据与字段说明见 [E2.4 clean-room 验收证据](../../docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md) 和 [机器结果 Schema](../../docs/03-technical/clean-room-evidence.schema.json)。

See [E2.4 clean-room acceptance evidence](../../docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md) and the [machine-readable result schema](../../docs/03-technical/clean-room-evidence.schema.json).

## 路径边界 / Path boundaries

| 路径 | 客户端入口 | 依赖边界 |
| --- | --- | --- |
| HTTP | [`http-client.mjs`](http-client.mjs) | Node.js 原生 `fetch`，不导入 BU2 源码 |
| SDK | [`sdk-client.mjs`](sdk-client.mjs) | 从临时 tarball 安装 `@bu2/sdk`，不使用仓库相对 import |
| MCP | [`mcp-client.mjs`](mcp-client.mjs) | 只依赖官方 MCP Client，通过文档化 `sandbox/bin/bu2-mcp.mjs` stdio 入口连接 |

人工授权和结算仍由 HTTP 控制面显式完成；六个 Agent MCP 工具没有获得自批授权或直接结算能力。所有路径只使用 Simulation。公开 npm 发布、远程 MCP 托管、Mainnet、真实资金、托管和生产 Secret 不在本验收范围内。

Human authorization and settlement remain explicit HTTP control-plane actions. The six Agent MCP tools do not gain self-authorization or direct-settlement capabilities. Every path is Simulation-only. Public npm publication, remote MCP hosting, Mainnet, real funds, custody, and production secrets are outside this acceptance scope.
