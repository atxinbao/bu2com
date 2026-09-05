# BU2 项目文档

本目录只索引当前实际存在的 BU2 商业、产品与技术资料。已经删除的目录和文档不再保留占位入口，也不因历史索引而自动恢复。

## 项目级正式文件

以下文件位于项目根目录，对 `docs/` 内文档具有上位约束：

| 文件 | 作用 |
| --- | --- |
| [`PROJECT.html`](../PROJECT.html) | 项目定位、执行模式、法域边界和阶段准入门槛 |
| [`ARCHITECTURE.html`](../ARCHITECTURE.html) | 长期系统不变量与架构宪法 |
| [`GOVERNANCE.html`](../GOVERNANCE.html) | 决策、责任、变更、发布、事故和退役制度 |
| [`CHANGELOG.html`](../CHANGELOG.html) | 已实施变更、验证证据和已知风险记录 |
| [`AGENTS.md`](../AGENTS.md) | AI Agent 必须遵守的金融系统工程规则 |

## 当前目录结构

| 目录 | 当前内容 | 状态 |
| --- | --- | --- |
| [`01-business-plan/`](01-business-plan/) | 商业计划书 PDF 与可编辑 PPTX | BP v0.1 |
| [`02-product/`](02-product/) | Transaction-first 产品基线、PRD、策略、验收与历史决策 | Product v0.3 |
| [`03-technical/`](03-technical/) | API、OpenAPI、MCP、doctor、持久化、Webhook、x402 与验证证据 | Contract v0.1–v0.3 |

当前没有可索引的市场、架构或运营文档；空目录不作为正式文档入口。相关规则以项目根目录 HTML 文件和现存产品、技术文档为准。

## 01 · 商业计划

- [`BU2_AI_Agent_Wallet_BP_v0.1.pdf`](01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf)：用于阅读、评审和对外分享。
- [`BU2_AI_Agent_Wallet_BP_v0.1.pptx`](01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pptx)：用于编辑和后续路演迭代。

商业计划描述 Agent 收付机会、目标用户、产品结构、商业模式和早期路线图。涉及当前产品范围时，应以 Transaction-first 产品基线为准。

## 02 · 产品文档

完整导航见 [`02-product/README.md`](02-product/README.md)。

### 当前有效基线

| 文档 | 作用 |
| --- | --- |
| [`P0_TRANSACTION_FIRST_BASELINE.md`](02-product/P0_TRANSACTION_FIRST_BASELINE.md) | 当前正式产品定位、交易对象、范围和演示闭环 |
| [`MVP_PRD.md`](02-product/MVP_PRD.md) | Transaction-first MVP 功能、流程、优先级和验收标准 |
| [`INFORMATION_ARCHITECTURE.md`](02-product/INFORMATION_ARCHITECTURE.md) | Transaction-first 页面、对象和状态关系 |
| [`TRANSACTION_P0_ACCEPTANCE.md`](02-product/TRANSACTION_P0_ACCEPTANCE.md) | 当前 P0 交易闭环的验收路径与门槛 |

### 产品支撑文档

- [`PRODUCT_STRATEGY.md`](02-product/PRODUCT_STRATEGY.md)：愿景、原则、范围与阶段路线。
- [`USERS_AND_JOBS.md`](02-product/USERS_AND_JOBS.md)：首批用户、角色和核心任务。
- [`POLICY_AND_APPROVAL_MODEL.md`](02-product/POLICY_AND_APPROVAL_MODEL.md)：预算、授权、策略和审批边界。
- [`METRICS_AND_VALIDATION.md`](02-product/METRICS_AND_VALIDATION.md)：指标、访谈与实验计划。
- [`PROTOCOL_ADOPTION_PLAN.md`](02-product/PROTOCOL_ADOPTION_PLAN.md)：AP2、x402 的阶段门槛和范围控制。

### 历史文档

- [`P0_TASK_FIRST_BASELINE.md`](02-product/P0_TASK_FIRST_BASELINE.md)：已废止，只用于保留决策历史。
- [`FORMAL_USER_TEST_PLAN.md`](02-product/FORMAL_USER_TEST_PLAN.md)：Task-first 测试方案，已废止。

当前 Transaction-first 页面规格已纳入上方产品入口，不再属于历史或待重写文档。

## 03 · 技术契约与证据

完整导航见 [`03-technical/README.md`](03-technical/README.md)。

### 核心契约

- [`API_CONTRACT_V0.1.md`](03-technical/API_CONTRACT_V0.1.md)：Agent Payment API 的资源、状态、金额、幂等、错误和 Receipt 契约。
- [`openapi.yaml`](03-technical/openapi.yaml)：OpenAPI 3.1 接口定义。
- [`mcp-tools.json`](03-technical/mcp-tools.json)：Agent 原生 MCP 工具定义。
- [`contract-versions.json`](03-technical/contract-versions.json)：API 与 MCP 可机读版本清单。
- [`EXTERNAL_AGENT_QUICKSTART.md`](03-technical/EXTERNAL_AGENT_QUICKSTART.md)：外部 Buyer/Seller Agent 的 MCP + HTTP Simulation 快速接入。
- [`../integrations/mcp/README.md`](../integrations/mcp/README.md)：Codex、Claude Desktop 与通用 MCP Host 配置。
- [`../packages/typescript-sdk/README.md`](../packages/typescript-sdk/README.md)：TypeScript SDK v0.1 的中英文接入、错误恢复与契约生成说明。
- [`examples/payment-flow.json`](03-technical/examples/payment-flow.json)：完整交易示例载荷。
- [`validate-contract.mjs`](03-technical/validate-contract.mjs)：本地契约一致性验证脚本。

### 持久化与支付通道

- [`PERSISTENCE_WEBHOOK_ADAPTER_V0.2.md`](03-technical/PERSISTENCE_WEBHOOK_ADAPTER_V0.2.md)：SQLite 追加账本、Webhook Outbox 与 Adapter 边界。
- [`X402_ADAPTER_V0.4.md`](03-technical/X402_ADAPTER_V0.4.md)：x402 Sandbox Adapter、未知结果冻结与显式恢复。
- [`X402_TEST_WALLET.md`](03-technical/X402_TEST_WALLET.md)：Base Sepolia 测试钱包边界和操作记录。
- [`X402_LIVE_SETTLEMENT_EVIDENCE.md`](03-technical/X402_LIVE_SETTLEMENT_EVIDENCE.md)：真实测试网结算及 Receipt 验证证据，不等同于生产可用性证明。
- [`PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md`](03-technical/PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)：首个正式开发 Epic 的范围、Owner、可靠性工作包和完成门槛。
- [`PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md`](03-technical/PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)：开发者接入规模化 Epic 的 SDK、MCP 分发、诊断、试点证据与阶段边界。

## 可运行实现

- [`../prototype/`](../prototype/)：Transaction-first 双语产品原型。
- [`../sandbox/`](../sandbox/)：本地 Agent 收付 Reference Server、持久化账本、Webhook 与支付 Adapter。

文档描述目标与契约，可运行实现提供本地验证证据；两者不一致时必须停止交付、确认当前基线，并同步更新 `CHANGELOG.html`。

## 文档维护规则

1. 只为实际存在的文件建立链接；删除文档时同步清理本索引和相关子目录索引。
2. 当前有效文档与历史文档必须分区，废止文件不得静默恢复为正式依据。
3. 产品定位变更先更新正式基线，再更新 PRD、信息架构、交互规格和验收方案。
4. API、事件、Schema、账本或支付状态变化必须同步技术契约、示例、验证脚本与 `CHANGELOG.html`。
5. HTML 宪法、治理和变更日志是正式可浏览文档；Markdown 用于仍在维护的产品与技术工作文档。

---

更新日期：2026-09-06<br>
维护者：Codex
