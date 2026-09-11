# BU2

> Payments for agents. Control for humans.

BU2.com 是 Agent 的 AI 收付平台。它把身份、授权、交易编排、支付适配、账本、Receipt 与对账组合成一个可审计的支付控制层，让 ChatGPT、Codex、Claude 和自建 Agent 在用户授权范围内完成收付，而不要求用户迁移到 BU2 创建任务。

> **当前边界：** BU2 仍处于 Phase 0。Local / Simulation 已形成完整工程基线，但不等于真实 Sandbox/Testnet、Hosted 或 Live/Mainnet 已获准。技术可行、PR 合并或测试通过都不会自动提升资金执行权限。

## 项目一览

| 项目 | 当前基线 |
| --- | --- |
| 项目阶段 | Phase 0 · Local execution / Sandbox architecture |
| 上层产品方向 | Social Wallet · FP-07 Local 两账户产品接入验收与 RC 证据机制已进入 `main` |
| 交易领域基线 | Product v0.3 · Transaction-first |
| API / SDK / MCP | Agent Payment API v0.3.0 · Access Contract v1.1 · `@bu2/sdk` v0.3 · MCP stdio v0.3 |
| Reference Server | v0.17 · Node.js + SQLite WAL · Schema 22 |
| 支付通道 | Local Simulated Adapter + x402 Base Sepolia Adapter |
| 运行时基线 | Node 24.20.0 · npm 11.19.0 · SQLite 3.53.4 |
| 历史内部 RC | `ledger-rc-local-v0.1`，仅 Local/Simulation 历史基线 |
| 当前 RC 边界 | CI-03 v3 将 `main protected` 与 LA-06a 作为必须如实记录、但不单独阻断 Local prerelease 的观测；Public Wallet API 已纳入产品验收，Project Owner 可手工晋级同一不可变候选 |
| 生产边界 | Live 初始 `execution_disabled`；真实资金托管、法币、跨境、换汇与跨链能力未开放 |

## 从这里开始

| 想了解什么 | 入口 |
| --- | --- |
| 项目定位、执行模式和阶段准入 | [PROJECT.html](PROJECT.html) |
| 长期领域模型与架构不变量 | [ARCHITECTURE.html](ARCHITECTURE.html) |
| 决策、审批、发布与事故治理 | [GOVERNANCE.html](GOVERNANCE.html) |
| AI Agent 工程与安全规则 | [AGENTS.md](AGENTS.md) |
| 已发生的系统变化与验证证据 | [CHANGELOG.html](CHANGELOG.html) |
| 完整产品 / 技术文档目录 | [docs/README.md](docs/README.md) |
| Ledger Foundation 当前能力 | [Ledger Foundation Overview](docs/03-technical/LEDGER_FOUNDATION_OVERVIEW.md) |
| Social Wallet 产品接入边界 | [FP-07 Social Wallet baseline](docs/02-product/FP07_SOCIAL_WALLET_BASELINE_CONTRACT.md) |

## 当前能力与边界

### 已经证明的 Local 能力

- **交易闭环**：Quote → PaymentIntent → Authorization → Funds Reserved → DeliveryEvidence → Settlement → Receipt，并保持退款与争议为独立事实。
- **Agent 原生授权**：Account / AgentIdentity / Credential / PaymentMandate / ExecutionSession 形成可撤销、可限额、可审计的授权链。
- **账务基础**：不可变 LedgerEvent / Journal / FinancialPosting、可信 LedgerAccount ownership、Schema 22 版本化 projection 与账户级运行时余额、历史 replay、Reconciliation 与 Online Backup/restore。
- **Social Wallet Local 基线**：FP-06a/06b 建立 WalletReadModel、shadow comparison 与 Local-only read cutover；FP-07 组合验证两账户产品闭环；FP-08 把已切换的新付款写入账户余额；Public Wallet API 通过认证 Account 只读返回健康的账户级 available/reserved，异常时隐藏金额且不回退 legacy wallet。
- **恢复与未知结果**：Provider 超时或结果未知不会自动重复支付；状态通过持久 Attempt/Adapter operation、显式 recovery 和 reconciliation 收敛。
- **Agent 接入**：HTTP、TypeScript SDK、MCP stdio、外部 Buyer/Seller Agent 样例和三路径 clean-room 验收均已有 Local 证据。
- **环境与运维**：环境自描述、运行时 preflight、Webhook Outbox、租约/重试/死信、结构化日志、SQLite WAL、固定运行时和隔离恢复证据已建立。

### 尚未放行

以下能力仍不是当前产品或资金准入的一部分：

- Collection 主金额与 Collection-side ProviderFee 的账户级运行时净入账语义。
- Public Wallet API 的 Hosted、Sandbox/Testnet 或 Live 对外服务准入。
- 真实 Hosted/Base Sepolia 双向结算证据（LA-06b）与 Phase 0 Epic 3 的 E3.1 Pilot Manifest。
- Live/Mainnet 资金执行、客户资金托管、法币钱包、提现、换汇、跨境和跨链。
- 成功的 Social Wallet exact-main RC artifact 与对应 Project Owner 晋级记录；CI-03 v3 要求 `refs/heads/main`、输入 SHA、workflow SHA 与 checkout SHA 完全一致，并如实记录 `main protected` 和 LA-06a 结果。二者不单独阻断 Local prerelease，任何失败仍必须在 Release 中披露。

### 环境矩阵

| 环境 | 执行后端 | Network | 当前资金状态 |
| --- | --- | --- | --- |
| `local` | `simulated` | `null` | 内部开发、自动化测试、故障注入与产品基线验收 |
| `sandbox` | `x402` | Base Sepolia · `eip155:84532` | 架构与受控部署能力已建设；真实双向 Testnet 验收仍独立 |
| `live` | `x402` | Base Mainnet · `eip155:8453` | 初始 `execution_disabled`，配置存在不等于获准付款 |

服务环境、执行后端和资金准入是三个独立维度。完整定义见 [系统环境契约 v1](docs/03-technical/SYSTEM_ENVIRONMENTS_V1.md)、[环境注册表与链隔离](docs/03-technical/ENVIRONMENT_REGISTRY_AND_CHAIN_ISOLATION_V1.md) 和 [环境验收矩阵](docs/03-technical/ENVIRONMENT_ACCEPTANCE_MATRIX_V1.md)。

## 核心交易模型

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
                         │
                 Reconciliation
```

BU2 永久区分授权、预留、交付、结算、退款与争议。核心资金不变量包括：

- 只有 **Transaction Core** 可以改变交易状态。
- 金额使用整数最小货币单位并显式携带币种。
- 始终保持 `refunded <= settled <= reserved <= authorized`。
- LedgerEvent / Journal / Posting 作为历史资金事实只追加；更正使用新事实而不是覆盖历史。
- 相同幂等键 + 相同载荷返回原结果；同键不同载荷必须拒绝。
- 外部超时意味着结果未知；不得直接释放资金或自动重付。
- Receipt 必须与交易、交付、结算和 Provider reference 保持可验证绑定。

完整长期约束以 [ARCHITECTURE.html](ARCHITECTURE.html) 和 [AGENTS.md](AGENTS.md) 为准。

## 能力地图

### Transaction Core 与授权

- Quote、PaymentIntent、Authorization、资金预留、DeliveryEvidence、Settlement、Refund、Dispute 和 Receipt。
- Account-Owned Receivable、Inbound Collection 与 Paid Access；Collection、AccessGrant、DeliveryRecord、Receipt 和 FinancialPosting 保持独立事实。
- 版本化 PaymentMandate、FundingSource / ReceivingTarget trusted binding、PolicyDecision、ExecutionSession 与幂等状态转换。
- 即时 / 延迟 Agent 支付执行；review-required、Mandate 失效、越权 Agent、错误资产或错误网络均失败关闭。

### Ledger Foundation 与恢复

- SQLite WAL、追加式 LedgerEvent、双式 Journal/Posting、LedgerAccount ownership 和进程重启恢复。
- processing idempotency claim、状态版本 CAS、非负钱包约束，以及资源、余额、Ledger、Outbox 与幂等终态的事务一致性。
- Schema 21 的 migration plan / assessment / append-only read generation，以及 Schema 22 的账户级余额、交易写源快照和版本 CAS。
- 外部观察对账、未决队列、孤立事实、期初/更正、历史 replay、projection 删除重建和 Online Backup。
- active Local cutover 会持续比较 accounting candidate 与对应账户写源；stale、unknown、负可用余额或 shadow mismatch 时不静默 fallback，并在 Adapter 前阻止新 reserve。

### Adapter、Receipt 与外部协议

- SimulatedPaymentAdapter 与官方 x402 v2 Base Sepolia Adapter。
- x402 challenge 的金额、资产、网络、资源与 payTo 校验；支付 Attempt 在 Provider 边界前持久化。
- timeout / 5xx / 缺少有效 transaction reference 时冻结为 `provider_unknown`，恢复前禁止重复付款。
- Receipt v0.3 使用 Ed25519 + RFC 8785 JCS，并绑定环境、链、执行后端和 issuer；历史 v0.2 签名字节保持可独立验证。

### Agent 集成与开发体验

- OpenAPI 3.1、生成类型的 `@bu2/sdk` v0.3，以及稳定的错误/恢复分类。
- 官方 MCP TypeScript SDK 2.0 stdio Server，冻结 6 个 MCP 工具，支持 Codex、Claude Desktop 和 Generic Host。
- `GET /v1/environment`、SDK/MCP/Doctor preflight、`bu2-doctor` 中英文诊断和本地零遥测。
- 独立 Buyer/Seller Agent 示例，以及 HTTP / SDK tarball / MCP 三路径 clean-room 接入验收。

### 运营与工程证据

- Transactional Webhook Outbox、Worker 租约、有限重试、dead letter、审计 replay 与事件去重。
- `request_id` / `trace_id` 关联、结构化事件、敏感值脱敏、运行健康快照和受控访问。
- 固定 Node/npm/SQLite runtime、不可变 Docker 制品、部署 fingerprint、Online Backup 与隔离 restore。
- CI-01～04、LA-06a 与 RT-01 建立本地回归、证据来源绑定、运行时验收和持续韧性检查。

## 快速开始

### 环境要求

- Node.js `>= 24.20.0`（账本固定运行时为 `24.20.0`）
- npm
- macOS、Linux 或可运行 Node.js / Docker 的本地开发环境

### 安装依赖

```bash
npm ci --prefix sandbox
npm ci --prefix prototype
npm ci --prefix packages/typescript-sdk
```

### 最小验证路径

```bash
# API / MCP contract
node docs/03-technical/validate-contract.mjs

# Reference Server + Ledger + HTTP + Adapter + recovery
npm --prefix sandbox test

# Social Wallet Local 产品接入基线
npm --prefix sandbox run acceptance:social-wallet

# TypeScript SDK
npm --prefix packages/typescript-sdk test

# Product prototype
npm --prefix prototype run lint
npm --prefix prototype run build
```

FP-07 合并时的参考证据为：Contract **63 invariants / 6 MCP tools**、Sandbox **253/253**、CI/runtime **31/31**、SDK **10/10**、Prototype lint **0 warnings / 0 errors** 且 build 通过；RT-01 固定 Node 24.20.0 / npm 11.19.0 / SQLite 3.53.4 / Schema 21 / WAL / Online Backup。以上均是 Local/CI 证据，不替代真实 Sandbox/Testnet 或生产验收。

更多专项命令与故障注入入口见 [sandbox/README.md](sandbox/README.md)。

### 接入诊断

启动 Reference Server 后，在任何资金工具调用前运行：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
npm --prefix sandbox run doctor
```

`--format json` 输出机器可读结果，`--language en` 输出英文提示。完整说明见 [开发者接入诊断](docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)。

### 外部 Agent 示例

```bash
npm --prefix sandbox run demo:external
```

该命令启动隔离 Reference Server 和 stdio MCP Server，让独立 Buyer / Seller Agent 完成 Local Simulation 交易并验证 Receipt。角色边界见 [外部 Agent 快速接入](docs/03-technical/EXTERNAL_AGENT_QUICKSTART.md)，Host 配置见 [MCP integration](integrations/mcp/README.md)。

### 三路径 clean-room 验收

```bash
npm --prefix sandbox run acceptance:clean-room
```

它分别验证 HTTP、TypeScript SDK tarball 和 MCP stdio 的全新临时项目接入。证据契约见 [Clean-room Acceptance Evidence](docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)。

### 本地产品演示

终端一：

```bash
BU2_SANDBOX_PORT=3101 npm --prefix sandbox start
```

终端二：

```bash
BU2_SANDBOX_URL=http://127.0.0.1:3101 npm --prefix sandbox run demo
```

终端三：

```bash
npm --prefix prototype run dev
```

浏览器打开 `http://localhost:3000/`；Reference Server 健康检查位于 `http://127.0.0.1:3101/health`。

### x402 Testnet

Base Sepolia 的 x402 商户、协议探针、测试钱包和受控演示见 [sandbox/README.md](sandbox/README.md)。私钥只能通过本地进程环境或受管理密钥系统提供，不得进入代码、日志、文档或提交记录。

## 仓库结构

```text
bu2com/
├── prototype/          # Transaction-first React / TypeScript 产品原型
├── sandbox/            # Reference Server、SQLite、Webhook、Ledger 与支付 Adapter
├── packages/
│   └── typescript-sdk/ # OpenAPI 生成类型的 TypeScript SDK
├── integrations/
│   ├── mcp/            # Codex / Claude Desktop / Generic Host 配置
│   └── clean-room/     # HTTP / SDK / MCP 独立接入样例
├── docs/
│   ├── 01-business-plan/
│   ├── 02-product/
│   └── 03-technical/
├── PROJECT.html        # 项目定位、执行模式与阶段准入
├── ARCHITECTURE.html   # 长期领域模型与架构不变量
├── GOVERNANCE.html     # 决策、审批、发布、事故与退役制度
├── CHANGELOG.html      # 可观察变更和验证证据
├── docs-system.css     # 四份治理 HTML 的共享视觉系统
└── AGENTS.md           # AI Agent 金融工程规则
```

## 文档索引

### 治理与项目边界

- [项目总纲](PROJECT.html)
- [架构宪法](ARCHITECTURE.html)
- [项目治理制度](GOVERNANCE.html)
- [AI Agent 工程规则](AGENTS.md)
- [系统变更日志](CHANGELOG.html)
- [金融业务 PR 模板](.github/pull_request_template.md)

### 产品与 Ledger Foundation

- [完整文档目录](docs/README.md)
- [Ledger Foundation 当前能力](docs/03-technical/LEDGER_FOUNDATION_OVERVIEW.md)
- [Social Wallet 接入边界](docs/02-product/SOCIAL_WALLET_INTEGRATION_BOUNDARY.md)
- [FP-07 Social Wallet Local 基线](docs/02-product/FP07_SOCIAL_WALLET_BASELINE_CONTRACT.md)
- [Transaction-first 产品基线](docs/02-product/P0_TRANSACTION_FIRST_BASELINE.md)
- [Phase 0 产品路线](docs/02-product/PHASE0_ROADMAP_BASELINE.md)
- [PaymentMandate 契约](docs/02-product/F08_PAYMENT_MANDATE_CONTRACT.md)
- [MVP PRD](docs/02-product/MVP_PRD.md)

### API、环境与集成

- [Agent Payment API 契约](docs/03-technical/API_CONTRACT_V0.1.md)
- [OpenAPI 3.1](docs/03-technical/openapi.yaml)
- [系统环境契约](docs/03-technical/SYSTEM_ENVIRONMENTS_V1.md)
- [Sandbox / Live 环境隔离 ADR](docs/03-technical/ADR_0001_SANDBOX_LIVE_ENVIRONMENT_ISOLATION.md)
- [环境验收矩阵](docs/03-technical/ENVIRONMENT_ACCEPTANCE_MATRIX_V1.md)
- [x402 Trusted Execution](docs/03-technical/X402_TRUSTED_EXECUTION_V0.1.md)
- [TypeScript SDK](packages/typescript-sdk/README.md)
- [MCP Host 配置](integrations/mcp/README.md)
- [Phase 0 Epic 3：外部试点证据](docs/03-technical/PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)

### 商业计划

- [商业计划书 PDF](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf)
- [商业计划书 PPTX](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pptx)

## 开发与变更规则

1. 开始修改前阅读 [AGENTS.md](AGENTS.md)、[PROJECT.html](PROJECT.html)、[ARCHITECTURE.html](ARCHITECTURE.html)、[GOVERNANCE.html](GOVERNANCE.html) 和 [CHANGELOG.html](CHANGELOG.html)。
2. 所有变更通过 Pull Request，并按 R0–R3 标记风险等级。
3. 交易相关修改必须证明金额、状态、授权、幂等、并发、账本、外部未知状态和恢复不变量。
4. 每次代码、Schema、依赖、配置、行为或文档变更都必须同步更新 [CHANGELOG.html](CHANGELOG.html)。
5. R2/R3 不能由 AI Agent 自行批准；生产资金、主网、生产迁移、密钥或不可逆操作需要独立、明确且限定范围的人工授权。
6. Project Owner 授权也不能绕过 [PROJECT.html](PROJECT.html) 当前生效的阶段准入门槛。

## 当前禁止边界

- Local Simulation 只能作为内部开发、自动化和产品基线证据。
- Sandbox 固定 Base Sepolia；真实托管开放仍需要独立环境与资金能力验收。
- Live 固定 Base Mainnet 且保持 `execution_disabled`，直至全部 G-F / G-L / CapabilityGrant / 租户 / Mandate 门槛满足。
- 法币与托管支付只能通过持牌合作方评估。
- BU2 内部可提现客户余额、跨境、换汇和跨链当前禁止。

---

更新日期：2026-09-11
维护者：BU2 Engineering / Codex
