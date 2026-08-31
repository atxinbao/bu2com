# BU2 Task-first P0 产品基线（已废止）

日期：2026-09-01  
执行者：Codex

> 本基线已被 [Transaction-first P0 产品基线](P0_TRANSACTION_FIRST_BASELINE.md) 取代。Task 费用治理不再作为 BU2.com 的核心定位；本文仅保留为决策历史。

## 1. 产品定位

BU2 P0 定位为 **Agent Spend Control Plane**，以治理每一次 Agent 执行为核心，而不是以余额、钱包或传统财务审批为核心。

> BU2 能告诉用户每个 Agent 任务花了多少钱、为什么花、是否超出预期，并在可控制的异常发生前阻止它。

## 2. 连续交付顺序

第一轮完成 Task-first 原型，验证用户能否发现、解释和处理异常费用；此阶段不冻结数据库和 API。第二轮在交互稳定后冻结数据模型与 API 契约。

核心页面顺序：Tasks、Task Detail、Exceptions、Budgets、Policies、Projects & Agents、Ledger、Overview。

## 3. 核心对象

```text
Workspace
Project
Agent
Task
Budget
Policy
SpendRequest
PolicyDecision
ApprovalRecord
ResourceCall
LedgerEntry
```

`ResourceCall` 通过 `resource_type` 区分模型、搜索、浏览器、数据库和 MCP 工具。

## 4. 不可破坏契约

- 每个费用事件必须归属于一个 `task_id`。
- 每个 `SpendRequest` 必须产生一个 `PolicyDecision`。
- 每个实际费用必须写入不可变 `LedgerEntry`。
- 估算费用与实际费用分开保存，不允许相互覆盖。

## 5. 事件流程

```text
Task Created
  → Spend Requested
  → Policy Evaluated
  → Allowed / Denied / Approval Required
  → Resource Called
  → Cost Recorded
  → Task Completed / Failed / Paused
```

## 6. 治理模式边界

- **强控制**：调用必须经过 BU2 Spend Request 才能执行。
- **观察模式**：BU2 在调用后接收费用事件，不能承诺调用前拦截。
- **混合模式**：部分资源强控制，部分资源调用后入账。

所有任务页面必须明确显示治理模式。只有强控制范围内才能使用“调用前阻止”的承诺。

## 7. 原型验收路径

1. 用户进入 Tasks，而非 Overview。
2. 找到成本异常的失败或暂停任务。
3. 下钻查看模型和工具调用。
4. 识别重试造成的额外成本。
5. 查看命中的预算和策略。
6. 理解任务暂停原因。
7. 批准、拒绝或调整任务预算。
8. 查看决策写入时间线和账本。
9. 返回 Tasks，确认状态与费用同步变化。

## 8. 衡量与边界

北极星指标：纳入 BU2 治理且具备完整费用归因的 Agent 任务数量。

配套指标包括自动通过率、异常支出拦截金额、预算中断率、单任务平均成本、重试额外成本、成功任务实际成本、预算预测偏差和审批等待时间。

P0 不包含资金托管、充值提现、统一结算、资产交易以及 x402/AP2 生产接入。
