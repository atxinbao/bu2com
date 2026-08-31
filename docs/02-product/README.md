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
| [页面与交互规格](INTERACTION_SPEC.md) | P0 原型的页面、状态、操作和验收标准 |
| [Transaction-first P0 产品基线](P0_TRANSACTION_FIRST_BASELINE.md) | 当前正式定位、交易契约和原型验收路径 |
| [Task-first P0 产品基线（已废止）](P0_TASK_FIRST_BASELINE.md) | 历史决策记录，不再指导产品实现 |
| [正式用户测试方案](FORMAL_USER_TEST_PLAN.md) | 招募、主持脚本、任务卡、记录方式和 GO/ITERATE/STOP 门槛 |

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

- 产品阶段：问题验证与 MVP 定义
- 产品版本：Product v0.3 Transaction-first
- 对应商业计划：BP v0.1
- 更新日期：2026-09-01
- 维护者：Codex
