# BU2 Transaction Atomicity v0.1

日期：2026-09-06

执行者：Codex

状态：Implemented locally · R2 review required

适用范围：Reference Sandbox v0.10 · Simulation / Base Sepolia Testnet

## 1. 目标与边界

Transaction Core 是 Quote、PaymentIntent、Transaction、Delivery、Receipt、钱包投影和 LedgerEvent 的唯一写入者。所有 HTTP、MCP 与 Adapter 输入均视为不可信；公开请求继续由 API Schema 校验，领域层继续校验金额、币种和状态转换。

本版本只解决数据库幂等、并发余额和本地交易事实的原子提交。x402 完整授权条款、Payment Attempt 以及外部调用崩溃恢复属于 Gate 3；Mainnet、真实资金、托管和生产密钥仍为 NO-GO。

## 2. 幂等契约

Phase 0 的单一 Sandbox Workspace 内，幂等作用域由 Transaction Core 的操作类型与资源路径组成，例如：

```text
quotes:{idempotency_key}
payment_intents:{idempotency_key}
payment_intents/{id}/authorization:{idempotency_key}
transactions/{id}/deliveries:{idempotency_key}
transactions/{id}/settlements:{idempotency_key}
```

请求体使用稳定 SHA-256 指纹。执行前，短数据库事务向 `idempotency_claims` 写入唯一的 `processing` Claim：

- 相同作用域、相同键、相同指纹且已成功：返回第一次业务结果。
- 相同作用域、相同键、不同指纹：返回 `idempotency_key_reused`。
- 重启后发现遗留 `processing`：返回 `idempotency_outcome_unknown`，要求先查询资源，禁止自动重放。
- 同进程相同键并发：共享同一个 in-flight Promise，只产生一个业务结果。
- 明确的校验或执行失败：释放本请求持有的 Claim，允许修正后重试。

`idempotency_records` 继续保存历史成功结果，Schema v6 会把旧记录回填为 `succeeded` Claim，旧数据库无需改写历史交易。

## 3. 并发与余额

Reference Sandbox 在单进程内串行执行领域写操作。数据库以 `sandbox_state.state_revision` 作为全局乐观版本：提交必须匹配操作开始时读取的版本，否则返回 `transaction_state_conflict` 并从数据库重新加载，禁止用陈旧内存快照覆盖新状态。

`wallet_accounts` 保存整数最小货币单位、币种和版本，并使用：

- `available >= 0` 数据库约束；
- `reserved >= 0` 数据库约束；
- 期望 available、reserved、currency 与 version 的条件式更新；
- 与全局状态版本相同的数据库事务。

因此两个 80 单位的授权请求不能同时从 100 单位余额中成功预留；第二个请求必须得到明确的余额不足或并发冲突，账本中不允许出现负余额。

## 4. 原子提交边界

领域代码先在 AsyncLocalStorage 操作上下文中缓冲事件，不允许 `event()` 独立写数据库。成功提交使用一个 `BEGIN IMMEDIATE` 事务完成：

```text
State revision CAS
  → Wallet conditional update
  → Resource snapshots
  → Sandbox state projections
  → LedgerEvent append
  → Webhook Outbox enqueue
  → Idempotency succeeded result
  → State revision increment
  → COMMIT
```

任一步失败均 `ROLLBACK`。事件、Outbox 或幂等终态不能领先于业务状态和余额。回滚后 Transaction Core 从数据库重新加载已提交事实。

## 5. 外部调用与未知结果

本版本不会在网络调用期间持有 SQLite 写锁。Adapter 自身仍必须使用 Provider 级幂等键；x402 已有的 `provider_unknown` 会继续阻止普通 settlement 自动重付。

但是，外部调用前的 Payment Attempt、完整授权条款持久化和签名前二次比对尚未进入本版本。进程恰好在外部调用后、本地原子提交前崩溃时，必须沿用只查询或对账的 Gate 3 恢复模型，不能把 Gate 2 视为外部资金执行已经完全可信。

## 6. 迁移与恢复

Schema v6 只追加 `idempotency_claims`、`wallet_accounts` 和 `state_revision`：

- 旧 `idempotency_records` 保留并回填成功 Claim；
- 旧钱包 JSON 在迁移时回填到约束表；
- 不删除资源、事件、Outbox、Adapter 操作或 Receipt；
- 新代码回退时可保留 v6 表，由旧版本忽略；再次前滚时继续读取。

SQLite 仍仅是 Phase 0 单实例 Reference Sandbox，不代表多节点生产高可用或分布式账本。

## 7. 自动化验收

必须持续通过：

1. 同键同载荷并发只返回一个业务结果。
2. 同键不同载荷在执行中和执行后均拒绝。
3. 并发授权不会产生负余额或重复 Transaction。
4. 状态、事件、Outbox 和幂等终态的故障注入全部回滚。
5. 重启后的 `processing` 返回结果未知且不重新执行。
6. 陈旧进程不能覆盖更新的数据库快照，重新加载后可以显式重试。
7. 并发 settlement 只调用一次 Provider、签发一张 Receipt。
8. 旧数据库可追加迁移并继续解释历史数据。

本文件仅记录本地自动化证据，不构成 Mainnet 或生产资金证明。
