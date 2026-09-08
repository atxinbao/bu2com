# BU2 产品文档

本目录将 BP 中的商业构想转化为可执行、可验证的产品定义。

## 产品定义

**BU2.com 是 Agent 的 AI 收付平台。**

首发产品使用演示资金验证交易状态，不要求用户迁移任务。BU2 首先帮助 Agent 完成：

> 谁代表谁，向谁购买了什么，依据什么授权，是否完成交付，资金最终结算到哪里？

## 文档导航

| 文档 | 解决的问题 |
| --- | --- |
| [产品战略](PRODUCT_STRATEGY.md) | 做什么、不做什么，以及如何逐步实现钱包愿景 |
| [用户与核心任务](USERS_AND_JOBS.md) | 第一批用户是谁，他们为什么使用 BU2 |
| [MVP PRD](MVP_PRD.md) | 首版功能、流程、优先级与验收标准 |
| [信息架构](INFORMATION_ARCHITECTURE.md) | 页面、对象和对象之间的关系 |
| [预算与审批模型](POLICY_AND_APPROVAL_MODEL.md) | 如何确定性地限制 Agent 消费权限 |
| [指标与验证计划](METRICS_AND_VALIDATION.md) | 如何判断需求、产品和付费是否成立 |
| [协议引入计划](PROTOCOL_ADOPTION_PLAN.md) | AP2、x402 在什么阶段进入，以及如何控制范围 |
| [Phase 0 路线与 PR 基线](PHASE0_ROADMAP_BASELINE.md) | M1～M5 里程碑、F02-CI～F16b 依赖与文档提交规则 |
| [F07 财务边界契约](F07_FINANCIAL_BOUNDARY_CONTRACT.md) | D1 冻结 Budget Scope、Budget Hold、Financial Posting、并发、幂等与对账边界 |
| [F08 Payment Mandate 契约](F08_PAYMENT_MANDATE_CONTRACT.md) | 版本化授权、确定性 Policy Decision、绑定边界、幂等与 F07/F09 边界及运行时映射 |
| [F09a 自主支付执行契约](F09A_AUTONOMOUS_EXECUTION_CONTRACT.md) | 已批准 PaymentIntent 的延迟执行、幂等、状态与 F09b 恢复边界 |
| [F10 Account-Owned Receivable 契约](F10_RECEIVABLE_CONTRACT.md) | 从 active Quote 创建可持久化应收款，绑定收款主体与目标，由 F11 完成入站验证 |
| [F11 Inbound Collection 契约](F11_INBOUND_COLLECTION_CONTRACT.md) | 验证入站付款、一次性标记 Receivable 并追加 FinancialPosting |
| [F12 Paid Access 与 Delivery Fact 契约](F12_FULFILLMENT_ACCESS_CONTRACT.md) | 从已入账 Collection 授予可恢复访问权益，并保持交付事实独立 |
| [页面与交互规格](INTERACTION_SPEC.md) | Transaction-first P0 的页面、状态、操作和验收标准 |
| [Transaction-first P0 产品基线](P0_TRANSACTION_FIRST_BASELINE.md) | 当前正式定位、交易契约和原型验收路径 |
| [Transaction-first P0 验收方案](TRANSACTION_P0_ACCEPTANCE.md) | 当前主路径、辅助路径和 GO/ITERATE/STOP 门槛 |

已废止的 Task-first 基线与用户测试方案保留为历史决策记录，不再作为产品导航或实现入口。

## 产品阶段

```text
Agent 身份、报价与 Payment Intent
        ↓
Payment Mandate 与资金预留
        ↓
交付证据、结算与 Receipt
        ↓
受控的 x402 / 支付通道接入
        ↓
Agent 商业账户、信誉与服务网络
```

## 当前状态

- 产品阶段：Phase 0 开发（Simulation / Testnet）；F07 已合并，F08～F12 运行时已实现，待各自 R2 Domain 与 Architecture 审查
- 产品版本：Product v0.3 Transaction-first
- 对应商业计划：BP v0.1
- 更新日期：2026-09-08
- 维护者：Codex
