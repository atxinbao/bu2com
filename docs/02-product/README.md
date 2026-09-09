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
| [F13 有界取消与退款恢复契约](F13_REFUND_RECOVERY_CONTRACT.md) | 预留态取消、结算后部分/全额退款与 provider-unknown 显式恢复 |
| [F14 支付、收款、退款与手续费对账契约](F14_RECONCILIATION_CONTRACT.md) | 记录 ProviderFee 并生成可重建、可解释的 ReconciliationRun |
| [F15a 内部 Sandbox 执行会话契约](F15A_SANDBOX_EXECUTION_SESSION_CONTRACT.md) | 为外部 Agent 既有工作流提供独立激活、短时、有界的内部执行会话 |
| [F15b 业务负载、停机与财务恢复验收契约](F15B_OPERATIONS_ACCEPTANCE.md) | 验证有限业务闭环、SQLite 重启、优雅停机、无重复事实与 Sandbox/Testnet 失败关闭 |
| [F16a 内部 Sandbox 自主双向收付 Beta 验收契约](F16A_INTERNAL_BETA_ACCEPTANCE.md) | 验证预授权 Agent 无逐笔批准完成付款、收款、权益恢复、退款、故障恢复与对账 |
| [F16b Hosted Sandbox 外部集成基础准入](F16B_HOSTED_QUALIFICATION.md) | 验证 Candidate、Activation、Evidence 和部署边界；不代表公网 ENV-07B 已验收 |
| [LA-01 持久化退款尝试与未决额度占用](LA01_REFUND_ATTEMPT_CONTRACT.md) | Ledger Assurance Gate 第一项整改：退款前持久化、未知结果占用、同键恢复、已确认未入账额度保护与新请求防重复 |
| [LA-02 成组 Journal / Posting 保护](LA02_JOURNAL_POSTING_CONTRACT.md) | Ledger Assurance Gate 第二项整改：严格金额、来源引用、借贷平衡和已过账不可变 |
| [LA-03a 业务资金事实分录](LA03_BUSINESS_POSTINGS_CONTRACT.md) | Ledger Assurance Gate 第三项整改的首个子范围：结算、确认退款与 ProviderFee 接入受保护 Journal/Posting |
| [LA-03b 期初检查点与追加更正](LA03B_OPENING_CORRECTION_CONTRACT.md) | Ledger Assurance Gate 第三项整改的第二个子范围：核对期初与不可变更正事实 |
| [LA-03c 账务投影重建](LA03C_LEDGER_PROJECTION_CONTRACT.md) | Ledger Assurance Gate 第三项整改的第三个子范围：从不可变 Posting 重建账户余额与 Journal 平衡报告 |
| [LA-03d 多账户账簿所有权与余额投影](LA03D_MULTI_ACCOUNT_OWNERSHIP_CONTRACT.md) | 冻结多账户所有权维度、投影切换和历史迁移边界；Schema 16/17 实现仍不切换运行时余额 |
| [LA-04 Collection 持续验证与单次入账](LA04_COLLECTION_CONVERGENCE_CONTRACT.md) | Ledger Assurance Gate 第四项整改：pending 收款持续验证、迟到证据保留与单次过账 |
| [LA-05a 外部观察对账](LA05A_EXTERNAL_RECONCILIATION_CONTRACT.md) | Ledger Assurance Gate 第五项整改的首个子范围：独立观察、未决队列、外部孤立事实与确定性异常 |
| [LA-05b 历史账务重放与备份追平](LA05B_HISTORY_REPLAY_CATCHUP_CONTRACT.md) | Ledger Assurance Gate 第五项整改的第二个子范围：期初检查点重放、历史缺口与备份追加事实追平 |
| [LA-06a 本地全量与隔离准入](LA06A_LOCAL_FOUNDATION_GATE_CONTRACT.md) | Ledger Assurance Gate 第六项整改的本地子范围：全量回归、故障/属性/跨租户证据；不接受真实 Sandbox 双向结算 |
| [RT-01 固定运行时与 SQLite 账本准入](RT01_RUNTIME_ASSURANCE_CONTRACT.md) | 核对固定 Node/SQLite 运行时、WAL、迁移连续性与隔离备份恢复；不改变生产运行时 |
| [CI-03 有边界账本 Release Candidate 契约](CI03_LEDGER_RELEASE_CANDIDATE_CONTRACT.md) | 从受保护 main 的确定 SHA 准备源码、镜像和证据绑定的 Local/Integration RC；不自动发布 |
| [CI-04 定时账本韧性与供应链契约](CI04_LEDGER_RESILIENCE_CONTRACT.md) | 定时验证真实模块故障/属性/容量/迁移恢复与锁定依赖风险；不执行资金或自动发布 |
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

- 产品阶段：Phase 0 开发（Local / Sandbox / Testnet 边界）；首个 `ledger-rc-local-v0.1` 仅批准为 Local/Simulation 内部账本基线，既有 Release 名称中的 Sandbox 不表示 Testnet 已验收。退款审计阻断与 R63-01 历史回放时间窗口已经后续 PR 关闭；CI-01、CI-02、CI-RT01、CI-03 已实现，CI-04 增加定时账本韧性与供应链检查。当前私有仓库套餐不能证明分支保护，CI-03 必须失败关闭；LA-03 完整迁移/切换、LA-06b 真实 Sandbox 双向证据与 E3.1 仍未放行。
- 产品版本：Product v0.3 Transaction-first
- 对应商业计划：BP v0.1
- 更新日期：2026-09-10
- 维护者：Codex
