# BU2

> Payments for agents. Control for humans.

BU2.com 是 Agent 的 AI 收付平台。它嵌入 ChatGPT、Codex、Claude 和自建 Agent 工作流，让 Agent 在用户授权范围内完成报价、付款、收款、交付、结算和可验证凭证，不要求用户迁移到 BU2 创建任务。

## 当前状态

| 项目 | 当前基线 |
| --- | --- |
| 项目阶段 | Phase 0 · Simulation / Testnet |
| 产品定义 | Product v0.3 · Transaction-first |
| API 契约 | Agent Payment API v0.1 |
| Reference Server | Sandbox v0.4 · Node.js + SQLite WAL |
| 支付通道 | Simulated Adapter + x402 Base Sepolia Adapter |
| 产品界面 | React 19 + TypeScript 双语原型 |
| 生产边界 | Mainnet、客户资金托管和法币能力尚未开放 |

当前代码已经形成可运行的 Agent 收付闭环，但仍是本地与测试网证据，不是生产支付系统或法律合规结论。

当前正式开发项为 [Phase 0 Epic 1：External Agent Transaction Integration & Reliability](docs/03-technical/PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)：先冻结外部 Transaction API，再闭合 Webhook 死信/重放/Secret 轮换、交易可观测性与 x402 Testnet 失败恢复，最后提供首个外部 Agent 接入样例。

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
- Webhook Outbox、HMAC 签名、失败重试和事件去重。
- SimulatedPaymentAdapter 与官方 x402 v2 Base Sepolia Adapter。
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
```

### 运行自动化验证

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
npm --prefix prototype run lint
npm --prefix prototype run build
```

当前基线应得到：Contract 19 项不变量通过、6 个 MCP 工具有效、Sandbox 21/21 通过、Prototype lint 与 build 通过。

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
- [x402 Sandbox Adapter v0.3](docs/03-technical/X402_ADAPTER_V0.3.md)
- [Base Sepolia 实结算证据](docs/03-technical/X402_LIVE_SETTLEMENT_EVIDENCE.md)

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

更新日期：2026-09-01  
维护者：BU2 Engineering / Codex
