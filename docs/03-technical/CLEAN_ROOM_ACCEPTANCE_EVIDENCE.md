# E2.4 外部 clean-room 接入证据

日期：2026-09-06<br>
执行者：Codex<br>
状态：本地自动化通过 · 待 R2 人工审查<br>
适用环境：Phase 0 Local simulated execution

## 1. 结论

HTTP、TypeScript SDK 和 MCP 三条路径均从全新临时项目完成一笔独立 `local + simulated` 交易，并获得可验证 Receipt v0.3。三条路径都低于 15 分钟门槛；执行前后相关 BU2 源码哈希一致，临时项目已自动删除。

The HTTP, TypeScript SDK, and MCP paths each completed an independent `local + simulated` transaction from a fresh temporary project and produced a verifiable Receipt v0.3. All paths remained below the 15-minute threshold, the relevant BU2 source hashes were unchanged, and every temporary project was removed automatically.

## 2. 执行方式

```bash
npm ci --prefix sandbox
npm ci --prefix packages/typescript-sdk
npm --prefix sandbox run acceptance:clean-room
```

验收器只把临时项目、安装依赖和 SDK tarball 写入操作系统临时目录；SDK 的标准构建仍写入 Git 忽略的 `dist/`：

- HTTP 项目只使用 Node.js 原生 `fetch`。
- SDK 项目先构建 `@bu2/sdk`，将 tarball 写到临时目录，再从 tarball 安装。
- MCP 项目只安装官方 `@modelcontextprotocol/client@2.0.0`，通过稳定 stdio 入口连接仓库内 BU2 MCP Server。
- 每条路径使用独立 `:memory:` SQLite Reference Server，不共享交易或策略状态。
- 不需要也不允许人工修改 BU2 源码。

## 3. 实测结果

执行时间：2026-09-06 20:57:34–20:57:36（Asia/Shanghai）<br>
结果 Schema：`clean-room-evidence` v0.2.0<br>
总结果：3/3 通过

| 路径 | 空项目 | 安装/连接方式 | 总耗时 | 交易状态 | Receipt | 验证 |
| --- | --- | --- | ---: | --- | --- | --- |
| HTTP | 是 | 原生 `fetch` | 103ms | `settled` | `rcpt_05ffed921ec140d6` | `valid=true` |
| SDK | 是 | 本地 `@bu2/sdk` tarball | 1425ms | `settled` | `rcpt_3c6d717af330413a` | `valid=true` |
| MCP | 是 | 官方 MCP Client + BU2 stdio | 610ms | `settled` | `rcpt_93ef495d145945ef` | `valid=true` |

所有耗时都包含项目脚手架；SDK 路径还包含构建、打包和安装，MCP 路径包含官方 Client 安装和 initialize 握手。

## 4. 失败与恢复记录

本次最终验收没有失败步骤，因此三条路径的 `failures` 和 `recovery_actions` 均为空数组。验收器已冻结失败行为：

- 任一步骤失败时停止该路径，不重试可能产生资金结果的操作。
- 证据只记录失败阶段、稳定错误码和 `stop_and_inspect_stage_evidence`。
- 源码哈希变化时记录 `source_changed`，恢复动作固定为 `stop_and_restore_source_baseline`。
- 不把异常原文、endpoint、请求载荷、Prompt、Secret、私钥或个人数据写入证据。

There were no failed steps in the final run, so `failures` and `recovery_actions` are empty for all three paths. A failed step stops its path and records only the stage, stable error code, and bounded recovery action; mutation requests are never replayed automatically.

## 5. 机器证据边界

[`clean-room-evidence.schema.json`](clean-room-evidence.schema.json) 固定以下内容：

- `local` 与 `simulated` 是唯一允许的服务环境和执行后端，并要求 environment contract v1.0；
- 三条路径和 900000ms 上限；
- 项目是否为空、源码是否变化、临时目录是否删除；
- 最终交易状态、Receipt ID 与验证结果；
- 阶段、耗时、失败码和恢复动作；
- `remote_enabled=false`、`upload_attempted=false`、`persistence=none`、`retention=process_lifetime`。

机器结果只输出到当前进程 stdout，不上传、不写数据库、不保存到用户目录。本文档仅固化审查所需的非敏感最终摘要。

## 6. 金融与产品边界

- Transaction Core、金额、状态机、PaymentMandate、Ledger、Webhook 和 Adapter 资金语义均未修改；新 Receipt 使用 v0.3 环境签名绑定。
- HTTP、SDK 和 MCP 当前都调用同一 Agent Payment API v0.3.0；SDK/MCP 不拥有交易状态。原 E2.4 结果 Schema 继续保持 v0.2.0，避免重写历史证据格式。
- 人工授权和 BU2 结算保持显式控制面操作，Agent MCP 工具不自批授权、不直接结算。
- 结果只证明 Local simulated execution 的重复接入能力，不构成公开分发、托管 Sandbox、Live/Mainnet、真实资金、托管或法律合规证明。

## 7. 恢复方式

若本变更需要回退，移除 clean-room 样例、编排器、Schema 与文档即可。它没有数据库迁移、交易历史或外部分发状态；现有 HTTP API、SDK、MCP、doctor 和 Epic 1 证据继续有效。
