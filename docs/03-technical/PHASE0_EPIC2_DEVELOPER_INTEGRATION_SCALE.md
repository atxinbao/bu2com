# Phase 0 Epic 2：Developer Integration Scale

日期：2026-09-06
执行者：Codex
状态：E2.4 implemented locally · pending R2 review
风险等级：R2（交易接入边界，不包含生产资金）

## 1. 目标

让外部 Agent 开发者不复制 BU2 内部实现、不理解第二套交易语义，也能通过受版本治理的 TypeScript SDK 或标准 MCP Host 配置，在 15 分钟内完成第一笔 Simulation 交易，并能自行诊断接入失败。

本 Epic 把 Epic 1 已验证的 HTTP/MCP 交易闭环产品化为可重复接入能力。它不把任务迁移到 BU2，不新增支付通道，也不提升 Mainnet、托管或生产密钥权限。

## 2. Owner

| 职责 | Owner | 责任 |
| --- | --- | --- |
| Accountable | Project Owner | 冻结范围、批准 R2 合并、决定公开分发时点 |
| Product | BU2 Product | 开发者旅程、接入指标、试点验收与失败反馈 |
| Contract | BU2 Architecture | 保证 OpenAPI、SDK、MCP 与交易事实一致 |
| Engineering | BU2 Engineering | SDK、MCP 分发、诊断工具与本地自动化实现 |
| Verification | Codex（本地自动化） | 契约、兼容、重试、故障和 clean-room 接入验证 |

公开包发布、生产凭证和真实资金操作不属于本 Epic，PR 合并不构成相关授权。

## 3. 用户闭环

```text
开发者选择 TypeScript SDK 或 MCP
  → 按版本化配置连接 BU2 Simulation
  → 运行接入诊断并确认环境、契约与能力
  → 外部 Buyer / Seller Agent 创建并完成交易
  → 获取 Transaction、Webhook 状态与可验证 Receipt
  → 在失败时获得稳定错误、关联 ID 和恢复建议
  → BU2 记录匿名或显式同意的接入结果，用于改进接入漏斗
```

BU2 只接收完成交易所需的结构化对象和外部上下文引用，不收集完整 Prompt、私人会话或调用方任务内容。

## 4. 工作包与顺序

### E2.0 — 冻结开发者接入契约（已完成）

- 冻结 SDK、MCP、诊断与接入证据的职责边界。
- 明确唯一语义来源仍是 Agent Payment API v1；SDK 和 MCP 都是薄客户端。
- 固定版本兼容、错误透传、幂等、超时与结果未知规则。
- 定义 E2.1–E2.4 的验收、恢复和阶段禁区。

### E2.1 — TypeScript SDK v0.1（已完成 · PR #10）

- 建立独立、可测试的 TypeScript 包，覆盖 Quote、PaymentIntent、Transaction、DeliveryEvidence、Authorization、Settlement 与 Receipt 查询/验证。
- 类型与运行时输入约束来源于冻结契约，不手写第二套资源定义。
- 每个写操作显式要求 `Idempotency-Key`；SDK 不替调用方静默生成业务幂等语义。
- 网络错误返回稳定 SDK Error，保留 HTTP 状态、BU2 `code`、`request_id` 与可恢复性分类。
- 首轮只在 Monorepo 内以 workspace/local package 验证；公开 registry 发布另行审批。

完成证据：Monorepo 新增私有包 `@bu2/sdk` v0.1.0。请求与响应类型由 `openapi-typescript` 7.13.0 从冻结的 `openapi.yaml` 生成，运行时 HTTP 使用 `openapi-fetch` 0.17.0；公开方法覆盖 Quote、PaymentIntent、Authorization、Transaction、DeliveryEvidence、Settlement、Settlement Recovery 与 Receipt。SDK 不自动重试；读取传输错误标记 `retry_safe`，写入超时、网络错误和 5xx 标记 `query_before_retry`，并保留服务端 `type`、`code`、`request_id`、`trace_id` 与 details。8 项专项测试覆盖完整 Simulation 交易、类型/生成漂移、幂等、无效输入、传输失败、超时、5xx 和恢复端点。包保持 `private: true`，未公开发布。

### E2.2 — MCP 分发与 Host 配置（已完成 · PR #11）

- 将现有 stdio Server 包装为稳定入口，提供 Codex、Claude Desktop 和通用 MCP Host 配置示例。
- 6 个现有工具继续读取 `mcp-tools.json`，不复制 Schema，不增加 Agent 自批授权或直接结算能力。
- 提供版本与能力握手，使 Host 能识别 API/MCP 不兼容，而不是在资金动作中猜测。
- 不建设插件市场、远程 MCP 托管或新的身份系统。

完成证据：新增稳定 `sandbox/bin/bu2-mcp.mjs` stdio 入口，并继续从唯一 `mcp-tools.json` 注册原有 6 个工具。Reference Server `/health` 以加法字段报告 Agent Payment API contract、base path、活动环境和兼容 MCP contract；CLI 在打开 stdio 前完成 endpoint preflight，不兼容时返回稳定错误并停止。MCP initialize 使用标准 `serverInfo` 与 `capabilities.experimental["com.bu2.agent-payments"]` 公开 API/MCP version、contract SHA-256、环境、工具数量和无自动 mutation retry 边界。Codex、Claude Desktop 与通用 Host 配置均指向稳定入口。8 项专项测试覆盖静态元数据、实际 endpoint preflight、真实 initialize 握手及握手拒绝、API/环境/MCP 版本不兼容、Mainnet 拒绝和配置解析。

### E2.3 — 接入诊断与最小分析（已完成 · PR #12）

- 提供本地 `doctor`：检查 Node 版本、BU2 endpoint、环境模式、契约版本、MCP 启动和 Receipt 验证能力。
- 输出机器可读诊断结果和人类可读恢复建议，所有敏感值必须脱敏。
- 接入分析只记录阶段、耗时、结果类别和稳定错误码；默认不上传 Prompt、交易载荷、Secret、私钥或个人数据。
- 远程遥测默认关闭；启用方式、保留期和删除方式必须在实现前独立冻结。

完成证据：新增稳定 `sandbox/bin/bu2-doctor.mjs` 和 `npm run doctor`，按固定顺序检查 Node、配置、endpoint、环境、API/MCP contract、真实 stdio initialize 与 Receipt 验证能力。无 Receipt ID 时只报告 `capability_available`，显式提供 ID 且服务端返回 `valid=true` 时才报告 `verified`。机器输出由 `doctor-result.schema.json` 冻结，人类输出支持全中文或全英文固定恢复建议。最小分析严格只包含阶段、耗时、结果类别和稳定错误码，并固定 `remote_enabled=false`、`upload_attempted=false`、`persistence=none`；12 项专项测试覆盖真实 endpoint/MCP/Receipt、故障注入、结果 Schema、敏感值不泄漏和 CLI 行为。

### E2.4 — 外部 clean-room 接入证据（已完成本地实现）

- 在三个全新临时项目中分别验证 HTTP、TypeScript SDK 和 MCP 路径。
- 每条路径从文档入口到有效 Simulation Receipt 不超过 15 分钟，不允许人工修改 BU2 源码。
- 记录失败步骤、恢复动作、耗时和最终 Receipt 验证结果。
- 只有三条路径全部通过，Epic 2 才能标记 Done。

完成证据：新增三个独立客户端样例与 `npm --prefix sandbox run acceptance:clean-room` 自动验收入口。验收器在三个空系统临时目录中分别运行原生 HTTP、从本地 tarball 安装的 `@bu2/sdk`、以及只依赖官方 MCP Client 的 stdio Host；每条路径使用独立内存 Simulation Server，并完成 Quote、PaymentIntent、显式授权、DeliveryEvidence、Settlement 和 Receipt 验证。最终实测 HTTP 101ms、SDK 1472ms、MCP 609ms，均为 `settled`、`receipt_valid=true`、源码哈希前后一致且临时目录已删除。机器结果由 `clean-room-evidence.schema.json` 冻结，只记录阶段、耗时、结果、稳定错误码与恢复动作，不持久化或上传原始载荷。

## 5. 明确不做

- 不新增 Mainnet、托管、法币、提现、换汇、跨链或第二个真实支付通道。
- 不重建 Transaction Core、SQLite 追加账本、Webhook Outbox 或现有 Adapter。
- 不让用户在 BU2 创建 Task、工作流或完整 Agent 项目。
- 不在本 Epic 同时建设 Python SDK；待 TypeScript 接入证据和真实需求成立后单独评估。
- 不公开发布 npm 包、托管远程 MCP、发放生产 API Key 或开放公网 Reference Server。
- 不建设插件市场、计费套餐、企业权限系统或通用 Agent 框架。

## 6. 接口与兼容契约

- Agent Payment API v1 是资源、状态、金额和错误语义的唯一来源。
- OpenAPI、JSON Schema、MCP Schema 与 SDK 类型必须能被自动一致性检查；不得手工漂移。
- SDK/MCP 不拥有交易状态，不缓存并覆盖服务端最终事实。
- 所有金额使用最小货币单位整数和明确币种；不得在客户端转为浮点金额。
- 写操作必须携带调用方可重放的显式幂等键；同键不同载荷错误必须原样可识别。
- 超时或响应丢失不能自动重放可能产生资金结果的操作；调用方先按资源 ID 或关联 ID 查询。
- v0.1 兼容变化只允许增加可选字段和新增方法；字段改义、删除或状态改义必须升级主版本。
- Receipt 验证必须使用服务端公开验证材料和冻结 canonicalization 规则，不以 UI 状态替代密码学结果。

## 7. 验收标准

### 契约一致性

- 自动证明 OpenAPI、运行时校验、MCP 与 SDK 暴露同一组核心字段、枚举和稳定错误。
- SDK 对正常、拒绝、冲突、无效输入、超时和结果未知均有本地自动化测试。
- 既有 HTTP/MCP 调用方和 SQLite 历史数据不需要迁移。

### 开发者体验

- 新开发者只阅读公开入口文档即可完成接入，不需要 BU2 团队修改代码。
- `doctor` 能在资金动作前发现 endpoint、版本、环境和 MCP 启动问题。
- 错误同时回答“发生了什么、能否重试、用哪个关联 ID 查询”。
- 中文和英文接入文档表达同一边界；代码标识、错误码和协议名保持原文。

### 金融不变量

- SDK/MCP 重试不会造成重复 Quote、PaymentIntent、预留、结算或 LedgerEvent。
- `refunded_amount ≤ settled_amount ≤ reserved_amount ≤ authorized_amount` 始终成立。
- 未授权、未交付或结果未知的交易不能被客户端推进为 settled，也不能签发 Receipt。
- Simulation 与 Testnet 在配置、日志、示例和输出中始终可区分。

### 接入证据

- HTTP、SDK、MCP 三条 clean-room 路径各自产生一笔有效 Simulation Receipt。
- 三条路径耗时均不超过 15 分钟；测试记录包含开始/结束时间、失败与恢复。
- 接入分析不包含 Secret、私钥、完整 Prompt、私人会话或原始交易载荷。

## 8. 强制验证

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
npm --prefix prototype run lint
npm --prefix prototype run build
```

从 E2.1 起还必须增加：SDK 单元与 HTTP 集成测试、契约漂移检查、错误/超时/重试测试、MCP Host 启动测试、`doctor` 故障注入和三个 clean-room 接入计时测试。

## 9. 完成门槛

只有同时满足以下条件，Epic 才能标记 Done：

1. E2.1–E2.4 全部完成并通过本地自动化验证。
2. 没有开放 Mainnet、真实资金托管、生产 Secret、公开 npm 发布或远程 MCP 托管。
3. SDK、MCP、OpenAPI、快速接入、运行手册和 `CHANGELOG.html` 保持一致。
4. R2 PR 获得 Project Owner 审查并合并。
5. 残余风险、恢复方式和未执行项进入验证报告。

## 10. 恢复策略

- SDK 和 MCP 保持薄客户端；失败时可回到已冻结的 HTTP API，不修改交易历史。
- 新包先以 Monorepo 内部依赖验证；未批准公开发布前不存在外部撤回问题。
- 诊断与接入分析可独立关闭，不影响 Transaction Core、Outbox、Adapter 或 Receipt。
- 若无法保持 v1 兼容，停止当前工作包并创建新版本提案，不在 SDK 中隐藏兼容差异。
- clean-room 验收失败只阻止 Epic 2 Done，不反向改写 Epic 1 的交易与可靠性证据。

## 11. Definition of Ready

- 目标、非目标、用户闭环、Owner 与 R2 风险等级已经明确。
- 唯一契约来源、状态所有者、幂等、未知结果和兼容规则已经明确。
- E2.1–E2.4 依赖顺序、验收、测试与恢复方案已经明确。
- 生产资金、公开分发、远程托管和数据采集边界已经明确排除。

结论：Epic 2 的 E2.1–E2.3 已分别经 PR #10–#12 合并，E2.4 已完成本地实现和 3/3 clean-room 自动验收。当前达到 **GO for R2 review**；只有本次 E2.4 PR 经 Project Owner 人工审查并合并后，Epic 2 才能标记 **Done**。不得扩大到 Python SDK、公开分发、远程 MCP 或 Mainnet。
