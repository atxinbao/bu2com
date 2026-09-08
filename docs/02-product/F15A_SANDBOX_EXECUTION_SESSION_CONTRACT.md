# F15a 内部 Sandbox 执行会话契约 v1

日期：2026-09-09  
执行者：Codex  
状态：运行时实现，待独立 R2 Domain 与 Architecture 审查  
适用范围：Phase 0 · Local Simulation / 内部 Sandbox-Testnet

## 1. 目的

F15a 为外部 Agent 的既有工作流提供一个短时、隔离、可审计的内部执行边界。它不创建 BU2 Task 平台，也不替代 PaymentMandate；ExecutionSession 只回答“这次内部执行在哪个环境、代表哪个 Account/Agent、最多可花多少、何时失效”。

## 2. 核心对象

`ExecutionSession` 持久化以下事实：

- `tenant_id`、`account_id`、`agent_id` 与 `environment` 绑定；
- `purpose`、`max_spend`、`starts_at`、`expires_at`；
- `status`：`requested`、`active`、`paused`、`completed`、`expired`、`revoked`；
- 独立的 `activation_status`、`activation_id`、审核人和理由；
- `reserved_spend_minor` 与 `committed_spend_minor`，以及派生的 `remaining_spend`。

内部会话最长 15 分钟，不能创建于 `live`。资源复用现有 SQLite `resources` 快照，不引入第二账本或独立资金系统。

## 3. 双重门槛

ExecutionSession 激活与 PaymentMandate 激活必须分别发生：

1. 会话激活需要独立的 `activation_id`、审核人和版本号，并且运行时 `execution_status` 必须为 `execution_enabled`。
2. PaymentMandate 仍负责 Account/Agent、资金来源、收款目标、商户、用途和限额授权。
3. PaymentIntent 只有在两个对象都有效时，才允许在会话范围内预留资金；任一对象暂停、撤销、过期或版本漂移都会失败关闭。

## 4. 支出边界与恢复

- 创建带 `execution_session_id` 的 PaymentIntent 时校验环境、租户主体、Account、Agent 和币种。
- 预留资金与 `reserved_spend_minor` 在同一 `runIdempotentAsync` 事务中更新；余额、Budget Hold、Transaction、LedgerEvent、Outbox 与幂等终态继续复用既有原子提交。
- 结算把会话预留额转为 `committed_spend_minor`；预留态取消释放会话预留额。
- 重试、并发、进程重启不得重复增加会话支出；未知 Provider 结果仍由 F09b 处理，不由 F15a 自动重付。

## 5. HTTP / SDK

```text
GET  /v1/execution_sessions
POST /v1/execution_sessions
GET  /v1/execution_sessions/{execution_session_id}
POST /v1/execution_sessions/{execution_session_id}/{activate|pause|complete|revoke|expire}
```

TypeScript SDK 提供对应的 `listExecutionSessions`、`createExecutionSession`、`getExecutionSession` 和 `transitionExecutionSession` 方法。

## 6. 验收标准

- 会话创建、独立激活、暂停、完成、撤销和过期状态转换具备版本冲突与幂等保护。
- 超过 15 分钟、跨环境、跨 Account/Agent、币种不一致或会话余额不足时失败关闭。
- 绑定会话的支付能在预留、结算和取消路径正确更新会话支出，并可在 SQLite 重启后恢复。
- F15a 不启用 Live/Mainnet、Hosted、公网凭证、托管钱包或真实 Provider 付款。

本契约不构成真实资金执行授权；进入内部 Beta 仍需 F15b/F16a 的独立证据与 R2 审查。
