# BU2

> Payments for agents. Control for humans.

BU2.com 是 Agent 的 AI 收付平台。它嵌入 ChatGPT、Codex、Claude 和自建 Agent 工作流，让 Agent 在用户授权范围内完成报价、付款、收款、交付、结算和可验证凭证，不要求用户迁移到 BU2 创建任务。

## 当前状态

| 项目 | 当前基线 |
| --- | --- |
| 项目阶段 | Phase 0 · local execution / Sandbox architecture |
| 当前工程关卡 | F16b · Hosted Sandbox foundation qualification 本地资格，待 R2 审查；ENV-07B 公网验收未通过 |
| 产品定义 | Product v0.3 · Transaction-first |
| API 契约 | Agent Payment API v0.3.0 |
| Reference Server | v0.17 · Node.js + SQLite WAL + 持久身份、钱包绑定、版本化 Mandate 与有界 ExecutionSession |
| TypeScript SDK | `@bu2/sdk` v0.3 · Monorepo private package |
| MCP 分发 | stdio v0.3 · Codex / Claude Desktop / Generic Host |
| 接入诊断 | `bu2-doctor` result v0.2 · 本地执行 / 零远程遥测 |
| Clean-room 验收 | HTTP / TypeScript SDK / MCP · 3/3 Local 通过 |
| 支付通道 | local Simulated Adapter + x402 Base Sepolia Adapter |
| 产品界面 | React 19 + TypeScript 双语原型 |
| 环境契约 | ENV-02–06 已批准；ENV-07A 本地准入基线已实现，托管验收未完成 |
| 生产边界 | Live 初始 `execution_disabled`；客户资金托管和法币能力尚未开放 |

当前代码已经形成可运行的 Agent 收付闭环，但仍是本地与 Base Sepolia 测试网证据，不是生产支付系统或法律合规结论。ENV-02–06 已由 PR #19–#23 合并；ENV-07A 为 Hosted Sandbox 增加专用启动门槛、文件型 Secret、不可变候选、独立激活与证据验证器，但尚未创建托管 Sandbox 或 Live。

F06a 已把受控访问中的 Principal、Account 和 Agent 声明落到 SQLite Schema v10 的持久业务主体记录；F06b 在其上增加 Schema v11 的资金来源与收款目标绑定；F07 在 Schema v12 增加 Budget、Budget Hold 与 Financial Posting；F08 在 Schema v13 增加版本化 PaymentMandate、PolicyDecision 及确定性授权判断，并接入 PaymentIntent；LA-01 在 Schema v14 增加持久化 RefundAttempt；LA-02 在 Schema v15 增加成组平衡 Journal/Posting、严格安全整数和已过账不可变保护；LA-03a 将结算、确认退款和 ProviderFee 事实接入两行平衡 Journal；LA-03b 增加可核对期初检查点和追加更正事实；LA-03c 增加从不可变 Posting 重建账户余额与 Journal 平衡的只读报告；LA-04 增加 pending Collection 持续验证、迟到证据和单次过账；LA-05a 增加独立外部观察、未决队列和孤立事实对账；F12 增加可恢复 AccessGrant；F13 增加预留态取消、部分/全额退款与 provider-unknown 显式恢复；F14 增加 ProviderFee 与 ReconciliationRun，在不改写原始事实的前提下汇总支付、收款、退款和手续费；F15a 增加独立激活、15 分钟窗口和会话级支出边界；F15b 增加有限业务负载、停机、SQLite 重启、无重复结算和对账恢复证据；F16a 增加买方 Agent 自主付款、卖方 Agent 收款、权益恢复、退款、故障恢复和对账的本地 Beta 候选证据；F16b 增加 Hosted Candidate、Activation、Evidence 的本地基础资格检查。上述能力都只在 Local / Sandbox / Testnet 边界内运行，不启用 Live/Mainnet、托管或生产凭证。LA-03 完整范围、LA-05b 历史重放/备份追平与 E3.1 仍需独立 R2/外部准入，E3.1 Pilot Manifest 保持暂停。

[Phase 0 Epic 1：External Agent Transaction Integration & Reliability](docs/03-technical/PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md) 与 [Phase 0 Epic 2：Developer Integration Scale](docs/03-technical/PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md) 已完成。Transaction Trust Gate 1–3 已经 PR #15–#17 合并，F01/ENV-01 至 ENV-06 分别由 PR #18–#23 批准。当前进入 ENV-07：ENV-07A 本地准入与证据契约、F16b Hosted foundation qualification 已实现，ENV-07B 的部署单元、外部验收 Schema 与 Runbook 已准备，但公网部署、真实 Base Sepolia 双向收付和边缘 E2E 仍未执行。[Phase 0 Epic 3](docs/03-technical/PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md) 的 E3.1 Pilot Manifest 保持暂停，不能以 Local Simulation 或本地资格结果代替正式外部证据；当前继续推进 Ledger Assurance Gate 的 LA-05a 外部观察对账，LA-05b 历史重放与备份后追平尚未开始。

## 环境定义

- `local`：内部开发环境，只允许 `simulated` 执行，用于单元测试、故障注入和 clean-room 工具证明。
- `sandbox`：对外测试环境，固定 Base Sepolia（84532）与 x402；测试资产没有真实金融价值。
- `live`：对外主网环境，固定 Base Mainnet（8453）；初始 `execution_disabled`，配置存在不等于获准付款。

服务环境、执行后端和资金准入是三个独立维度。完整定义、实现与验收见 [系统环境契约 v1](docs/03-technical/SYSTEM_ENVIRONMENTS_V1.md)、[ADR-0001](docs/03-technical/ADR_0001_SANDBOX_LIVE_ENVIRONMENT_ISOLATION.md)、[环境注册表与链隔离 v1](docs/03-technical/ENVIRONMENT_REGISTRY_AND_CHAIN_ISOLATION_V1.md)、[ENV-04 隔离部署单元](docs/03-technical/ENVIRONMENT_DEPLOYMENT_UNITS_V1.md)、[ENV-05 受控入口](docs/03-technical/ENVIRONMENT_CONTROLLED_ACCESS_V1.md)、[ENV-06 运营与恢复](docs/03-technical/ENVIRONMENT_OPERATIONS_V1.md)、[ENV-07 Hosted Sandbox](docs/03-technical/ENVIRONMENT_HOSTED_SANDBOX_V1.md) 和[环境验收矩阵 v1](docs/03-technical/ENVIRONMENT_ACCEPTANCE_MATRIX_V1.md)。

## Agent 支付闭环

```text
Buyer Agent                         Seller Agent
    │                                   │
    ├── PaymentIntent ──┐    ┌── Quote ─┤
    │                   ▼    ▼          │
    │             PaymentMandate         │
    │                    │                │
    │            Policy / Approval        │
    │                    │                │
    │              Funds Reserved         │
    │                    │                │
    │             Delivery Evidence ◄─────┤
    │                    │
    └──────────── Settlement ─────────────┘
                         │
                Signed BU2 Receipt
```

BU2 将授权、资金预留、交付、结算和退款保存为不同事实。每笔交易都绑定 Agent 身份、PaymentMandate、金额、币种、收款方、交付证据、支付通道引用和可独立验证的 Receipt。

## 已实现能力

- Quote、PaymentIntent、人工授权、资金预留、DeliveryEvidence、Settlement 和 Receipt。
- Account-Owned Receivable：从 active Quote 创建收款事实，绑定收款 Account、Seller Agent 和 Receiving Target，并由 F11 完成入站验证。
- Inbound Collection：验证 Provider 入站结果，幂等标记 Receivable 为 paid，并追加不可变 FinancialPosting。
- Paid Access：从已 `posted/verified` 的 Collection 幂等授予可恢复 `AccessGrant`；AccessGrant、DeliveryRecord、Receipt 与 FinancialPosting 保持独立。
- Bounded cancellation/refund：预留态取消会释放 Wallet/Budget Hold；结算后退款支持部分/全额事实、幂等和 provider-unknown 显式恢复。
- 整数最小货币单位、明确币种和受约束的交易状态机。
- 端到端幂等、载荷冲突拒绝和非法状态转换保护。
- SQLite WAL 持久化、追加式 LedgerEvent 和进程重启恢复。
- 数据库 processing 幂等 Claim、状态版本 CAS、非负钱包约束，以及资源、余额、LedgerEvent、Outbox 和幂等终态的单事务提交。
- Webhook Outbox、Worker 租约、有限重试、死信、审计重放、版本化 HMAC Secret 和事件去重。
- `request_id` / `trace_id` 端到端关联、分类结构化事件、敏感值脱敏和运行健康快照。
- SimulatedPaymentAdapter 与官方 x402 v2 Base Sepolia Adapter。
- x402 challenge 全字段校验、未知结算冻结、显式恢复查询与恢复审计。
- 官方 MCP TypeScript SDK 2.0 stdio Server，以及独立 Buyer/Seller Agent Simulation 样例。
- `GET /v1/environment` 自描述，以及 SDK/MCP/Doctor 的 endpoint、环境、链、执行后端、Receipt issuer 与 execution status 预检。
- 稳定 MCP CLI、mutation 前二次 preflight、initialize 版本/能力握手，以及三类 Host 配置。
- 本地 `bu2-doctor`：Node、endpoint、环境、契约、MCP 启动和 Receipt 验证诊断；支持 JSON 与中英文恢复提示。
- OpenAPI 生成类型的 `@bu2/sdk` v0.3 薄客户端；显式环境、外部 API key、本地开发确认、幂等、无自动重试和错误恢复分类。
- HTTP、SDK tarball 和 MCP stdio 三条全新临时项目接入证据；均在 15 分钟内生成有效 Local Simulation Receipt。
- Receipt v0.3：Ed25519、RFC 8785 JCS、环境/链/后端/issuer 签名绑定，以及签名、签发方、结算和环境四项独立验证；v0.2 历史签名字节保持可验证。
- 版本化 PaymentMandate：draft/active/suspended/revoked/expired 状态机、Funding Source/Receiving Target 绑定、确定性 PolicyDecision、版本冲突和幂等状态转换；持久化环境激活时强制使用 active verified 钱包绑定。
- F09a 自主支付执行：即时或延迟执行模式；已批准的 deferred PaymentIntent 可由 Agent 通过幂等执行命令预留资金，review_required 与 Mandate 失效均失败关闭。
- F15a 有界内部执行会话：ExecutionSession 独立于 PaymentMandate 激活，限制环境、Account/Agent、15 分钟窗口和会话支出，并在预留、结算、取消与重启路径保持可审计。
- F15b 运营验收：固定候选上完成 6 笔有界支付、入站收款、部分退款、ProviderFee 与 ReconciliationRun，对 SQLite 重启、无重复事实、优雅停机和 Sandbox/Testnet `execution_disabled` 进行验证。
- F16a 内部 Beta 候选：预授权买方 Agent 无逐笔管理员批准完成付款，卖方 Agent 完成收款和权益恢复，故障、退款与对账保持可解释；未预授权商户和 Sandbox/Testnet disabled 路径失败关闭。
- LA-05a 外部观察对账：支持独立观察、未完成交付 Payment 的未决队列、外部孤立事实和确定性异常快照；不自动重试 Provider、不改变原始交易或账务事实。
- 中英文 Transaction-first 产品界面，可展示真实 Reference API 数据并在离线时降级到演示数据。
- OpenAPI 3.1、Agent 原生 MCP 工具和完整交易示例。
- 同一不可变制品候选提升清单、配置漂移阻断、SQLite Online Backup、同环境隔离恢复演练与脱敏运营快照。

## 快速开始

### 环境要求

- Node.js `>= 22.16.0`
- npm
- macOS、Linux 或可运行 Node.js 的本地开发环境

### 安装依赖

```bash
npm ci --prefix sandbox
npm ci --prefix prototype
npm ci --prefix packages/typescript-sdk
```

### 运行自动化验证

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
npm --prefix sandbox run test:operations
npm --prefix sandbox run test:f15b
npm --prefix sandbox run test:f16a
npm --prefix sandbox run test:la01
npm --prefix sandbox run test:la04
npm --prefix sandbox run test:hosted-sandbox
npm --prefix sandbox run test:f16b-hosted
npm --prefix prototype run lint
npm --prefix prototype run build
npm --prefix packages/typescript-sdk test
npm --prefix sandbox run acceptance:clean-room
```

当前基线应得到：Contract 63 项不变量通过、6 个 MCP 工具有效、Reference Server 预计 174/174 通过、LA-03a 专项 3/3、LA-03b/LA-03c 专项 4/4、LA-04 专项 3/3、F15b 运营专项 4/4、F16a Beta 专项 3/3、LA-01/F13 专项 7/7、LA-02 专项 3/3、F16b Hosted foundation 专项 3/3 通过、TypeScript SDK 10/10 通过、ENV-06 运营专项 6/6 通过、ENV-07A 准入专项 8/8 通过、两环境部署与恢复验收通过、三条 clean-room 路径全部生成有效 Local Receipt、Prototype lint 与 build 通过。LA-03 完整范围、LA-05 与 E3.1 仍未完成/暂停。

### 运行接入诊断

启动 Reference Server 后，在发生任何资金工具调用前运行：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
npm --prefix sandbox run doctor
```

使用 `--format json` 获取机器可读结果，使用 `--language en` 获取全英文提示。若已有 Receipt，可追加 `--receipt-id rcpt_...` 执行实际只读验证；否则只确认验证能力可用。诊断分析只存在于当前进程，不写文件、不写数据库，也不远程上传。完整契约见 [`开发者接入诊断 v0.2`](docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)。

### 一条命令运行外部 Agent 样例

安装 Sandbox 依赖后，以下命令会启动隔离 Reference Server 和 stdio MCP Server，让独立 Buyer/Seller Agent 完成一笔 Simulation 交易，并验证签名 Receipt：

```bash
npm --prefix sandbox run demo:external
```

完整角色边界和代码入口见 [`外部 Buyer / Seller Agent 快速接入`](docs/03-technical/EXTERNAL_AGENT_QUICKSTART.md)；Codex、Claude Desktop 与通用配置见 [`MCP Host 配置`](integrations/mcp/README.md)。

### 运行三路径 clean-room 验收

以下命令会在三个全新临时项目中分别验证 HTTP、TypeScript SDK tarball 和 MCP stdio 接入，并要求每条路径在 15 分钟内得到有效 Local Simulation Receipt：

```bash
npm --prefix sandbox run acceptance:clean-room
```

可审计结果与字段边界见 [`E2.4 clean-room 接入证据`](docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)，客户端样例见 [`integrations/clean-room`](integrations/clean-room/README.md)。

### 启动本地交易演示

终端一：在 `3101` 启动 Simulated Reference Server，使产品界面能够读取真实本地 API。

```bash
BU2_SANDBOX_PORT=3101 npm --prefix sandbox start
```

终端二：生成一笔完整 Agent 演示交易。

```bash
BU2_SANDBOX_URL=http://127.0.0.1:3101 npm --prefix sandbox run demo
```

终端三：启动产品原型。

```bash
npm --prefix prototype run dev
```

浏览器打开 `http://localhost:3000/`。Reference Server 健康检查位于 `http://127.0.0.1:3101/health`。

### x402 Testnet

x402 商户、协议探针、测试钱包和完整 Base Sepolia 演示请参阅 [`sandbox/README.md`](sandbox/README.md)。私钥只能通过本地进程环境或受管理密钥系统提供，不得写入代码、日志、文档或提交记录。

## 仓库结构

```text
bu2com/
├── prototype/        # Transaction-first 双语 React/TypeScript 产品界面
├── sandbox/          # Reference Server、SQLite、Webhook 与支付 Adapter
├── packages/
│   └── typescript-sdk/ # OpenAPI 生成类型的内部 TypeScript SDK v0.3
├── integrations/
│   ├── mcp/           # Codex、Claude Desktop 与通用 stdio Host 配置
│   └── clean-room/    # HTTP、SDK 与 MCP 独立接入样例
├── docs/
│   ├── 01-business-plan/
│   ├── 02-product/
│   └── 03-technical/
├── PROJECT.html      # 项目定位、执行模式与阶段准入门槛
├── ARCHITECTURE.html # 长期架构不变量
├── GOVERNANCE.html   # 决策、发布、事故与退役制度
├── AGENTS.md         # AI Agent 金融工程规则
└── CHANGELOG.html    # 变更与验证历史
```

## 核心文档

### 项目治理

- [项目总纲与阶段准入](PROJECT.html)
- [系统架构宪法](ARCHITECTURE.html)
- [项目治理制度](GOVERNANCE.html)
- [AI Agent 工程规则](AGENTS.md)
- [系统变更日志](CHANGELOG.html)
- [金融业务 PR 模板](.github/pull_request_template.md)

### 产品与技术

- [完整文档目录](docs/README.md)
- [Transaction-first 产品基线](docs/02-product/P0_TRANSACTION_FIRST_BASELINE.md)
- [Phase 0 业务路线与 PR 基线](docs/02-product/PHASE0_ROADMAP_BASELINE.md)
- [F08 Payment Mandate 契约](docs/02-product/F08_PAYMENT_MANDATE_CONTRACT.md)
- [MVP PRD v0.3](docs/02-product/MVP_PRD.md)
- [Transaction P0 验收方案](docs/02-product/TRANSACTION_P0_ACCEPTANCE.md)
- [Agent Payment API 契约 v0.3.0](docs/03-technical/API_CONTRACT_V0.1.md)
- [OpenAPI 3.1](docs/03-technical/openapi.yaml)
- [x402 Testnet 可信执行 v0.1](docs/03-technical/X402_TRUSTED_EXECUTION_V0.1.md)
- [系统环境契约 v1](docs/03-technical/SYSTEM_ENVIRONMENTS_V1.md)
- [ADR-0001：Sandbox 与 Live 环境隔离](docs/03-technical/ADR_0001_SANDBOX_LIVE_ENVIRONMENT_ISOLATION.md)
- [环境验收矩阵 v1](docs/03-technical/ENVIRONMENT_ACCEPTANCE_MATRIX_V1.md)
- [客户端与 Receipt 环境契约 v1](docs/03-technical/ENVIRONMENT_CLIENT_AND_RECEIPT_CONTRACT_V1.md)
- [Base Sepolia 实结算证据](docs/03-technical/X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 2：开发者接入规模化](docs/03-technical/PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [Phase 0 Epic 3：外部试点准备与证据](docs/03-technical/PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)
- [TypeScript SDK v0.3](packages/typescript-sdk/README.md)
- [MCP Host 配置](integrations/mcp/README.md)
- [开发者接入诊断 v0.2](docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)
- [E2.4 clean-room 接入证据](docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)

### 商业计划

- [商业计划书 PDF](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf)
- [商业计划书 PPTX](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pptx)

## 开发与变更规则

1. 开始修改前阅读 [`AGENTS.md`](AGENTS.md)、[`PROJECT.html`](PROJECT.html)、[`ARCHITECTURE.html`](ARCHITECTURE.html) 和 [`GOVERNANCE.html`](GOVERNANCE.html)。
2. 所有变更通过 Pull Request，并按 R0–R3 标记风险等级。
3. 交易相关修改必须证明金额、状态、幂等、并发、账本、失败恢复和历史兼容性。
4. 每次修改必须同步更新 [`CHANGELOG.html`](CHANGELOG.html)。
5. 当前单人治理阶段允许 Project Owner 明确批准 R3 操作；生产授权必须限定环境、目标、金额或数据范围、执行窗口、停止条件和恢复方式。
6. Project Owner 授权不得绕过 [`PROJECT.html`](PROJECT.html) 当前生效的阶段准入门槛。

## 当前边界

- Local Simulation：仅内部开发与自动化验证。
- Sandbox：固定 Base Sepolia；对外托管开放仍需 ENV-02–07 和相应资金能力门槛。
- Live：固定 Base Mainnet，初始 `execution_disabled`；只有 G-L、有效 CapabilityGrant、租户启用与 Mandate 同时成立后，才能申请限定范围的非托管执行。
- 法币与托管支付：只能通过持牌合作方评估。
- BU2 内部可提现余额：当前禁止。
- 跨境、换汇和跨链：当前禁止。

技术可行、PR 合并或测试网成功都不会自动提升执行模式。能力升级必须先更新并批准项目总纲中的阶段门槛。

---

更新日期：2026-09-06
维护者：BU2 Engineering / Codex
