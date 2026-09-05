# BU2

> Payments for agents. Control for humans.

BU2.com 是 Agent 的 AI 收付平台。它嵌入 ChatGPT、Codex、Claude 和自建 Agent 工作流，让 Agent 在用户授权范围内完成报价、付款、收款、交付、结算和可验证凭证，不要求用户迁移到 BU2 创建任务。

## 当前状态

| 项目 | 当前基线 |
| --- | --- |
| 项目阶段 | Phase 0 · Simulation / Testnet |
| 产品定义 | Product v0.3 · Transaction-first |
| API 契约 | Agent Payment API v0.1 |
| Reference Server | Sandbox v0.8 · Node.js + SQLite WAL + MCP |
| TypeScript SDK | `@bu2/sdk` v0.1 · Monorepo private package |
| MCP 分发 | stdio v0.1 · Codex / Claude Desktop / Generic Host |
| 接入诊断 | `bu2-doctor` v0.1 · 本地执行 / 零远程遥测 |
| 支付通道 | Simulated Adapter + x402 Base Sepolia Adapter |
| 产品界面 | React 19 + TypeScript 双语原型 |
| 生产边界 | Mainnet、客户资金托管和法币能力尚未开放 |

当前代码已经形成可运行的 Agent 收付闭环，但仍是本地与测试网证据，不是生产支付系统或法律合规结论。

[Phase 0 Epic 1：External Agent Transaction Integration & Reliability](docs/03-technical/PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md) 已经 PR #8 合并并完成。当前正式开发项为 [Phase 0 Epic 2：Developer Integration Scale](docs/03-technical/PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)：按 TypeScript SDK、MCP 分发、接入诊断和三条 clean-room 接入证据推进，继续复用已经冻结的 Transaction API v1。

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
- 整数最小货币单位、明确币种和受约束的交易状态机。
- 端到端幂等、载荷冲突拒绝和非法状态转换保护。
- SQLite WAL 持久化、追加式 LedgerEvent 和进程重启恢复。
- Webhook Outbox、Worker 租约、有限重试、死信、审计重放、版本化 HMAC Secret 和事件去重。
- `request_id` / `trace_id` 端到端关联、分类结构化事件、敏感值脱敏和运行健康快照。
- SimulatedPaymentAdapter 与官方 x402 v2 Base Sepolia Adapter。
- x402 challenge 全字段校验、未知结算冻结、显式恢复查询与恢复审计。
- 官方 MCP TypeScript SDK 2.0 stdio Server，以及独立 Buyer/Seller Agent Simulation 样例。
- 稳定 MCP CLI、endpoint preflight、initialize 版本/能力握手，以及三类 Host 配置。
- 本地 `bu2-doctor`：Node、endpoint、环境、契约、MCP 启动和 Receipt 验证诊断；支持 JSON 与中英文恢复提示。
- OpenAPI 生成类型的 `@bu2/sdk` v0.1 薄客户端；显式幂等、无自动重试和错误恢复分类。
- Ed25519 签名 Receipt 及独立验证。
- 中英文 Transaction-first 产品界面，可展示真实 Sandbox API 数据并在离线时降级到演示数据。
- OpenAPI 3.1、Agent 原生 MCP 工具和完整交易示例。

## 快速开始

### 环境要求

- Node.js `>= 22.13.0`
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
npm --prefix prototype run lint
npm --prefix prototype run build
npm --prefix packages/typescript-sdk test
```

当前基线应得到：Contract 35 项不变量通过、6 个 MCP 工具有效、Sandbox 64/64 通过、TypeScript SDK 8/8 通过、Prototype lint 与 build 通过。

### 运行接入诊断

启动 Reference Server 后，在发生任何资金工具调用前运行：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=simulation \
npm --prefix sandbox run doctor
```

使用 `--format json` 获取机器可读结果，使用 `--language en` 获取全英文提示。若已有 Receipt，可追加 `--receipt-id rcpt_...` 执行实际只读验证；否则只确认验证能力可用。诊断分析只存在于当前进程，不写文件、不写数据库，也不远程上传。完整契约见 [`开发者接入诊断 v0.1`](docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)。

### 一条命令运行外部 Agent 样例

安装 Sandbox 依赖后，以下命令会启动隔离 Reference Server 和 stdio MCP Server，让独立 Buyer/Seller Agent 完成一笔 Simulation 交易，并验证签名 Receipt：

```bash
npm --prefix sandbox run demo:external
```

完整角色边界和代码入口见 [`外部 Buyer / Seller Agent 快速接入`](docs/03-technical/EXTERNAL_AGENT_QUICKSTART.md)；Codex、Claude Desktop 与通用配置见 [`MCP Host 配置`](integrations/mcp/README.md)。

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
│   └── typescript-sdk/ # OpenAPI 生成类型的内部 TypeScript SDK v0.1
├── integrations/
│   └── mcp/           # Codex、Claude Desktop 与通用 stdio Host 配置
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
- [MVP PRD v0.3](docs/02-product/MVP_PRD.md)
- [Transaction P0 验收方案](docs/02-product/TRANSACTION_P0_ACCEPTANCE.md)
- [Agent Payment API 契约](docs/03-technical/API_CONTRACT_V0.1.md)
- [OpenAPI 3.1](docs/03-technical/openapi.yaml)
- [x402 Sandbox Adapter v0.4](docs/03-technical/X402_ADAPTER_V0.4.md)
- [Base Sepolia 实结算证据](docs/03-technical/X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 2：开发者接入规模化](docs/03-technical/PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [TypeScript SDK v0.1](packages/typescript-sdk/README.md)
- [MCP Host 配置](integrations/mcp/README.md)
- [开发者接入诊断 v0.1](docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)

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

- Simulation 与 Base Sepolia Testnet：允许。
- 非托管 Mainnet 支付：待满足 CapabilityGrant、低限额、白名单、法律审查和完整对账。
- 法币与托管支付：只能通过持牌合作方评估。
- BU2 内部可提现余额：当前禁止。
- 跨境、换汇和跨链：当前禁止。

技术可行、PR 合并或测试网成功都不会自动提升执行模式。能力升级必须先更新并批准项目总纲中的阶段门槛。

---

更新日期：2026-09-06
维护者：BU2 Engineering / Codex
