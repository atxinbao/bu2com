# LA-01 持久化退款尝试与未决额度占用契约

日期：2026-09-09  
维护者：Codex  
风险等级：R2（退款状态、外部调用与持久化恢复）

## 目标

LA-01 是 Ledger Assurance Gate 的第一项整改，专门收紧退款执行边界，不重做 Transaction Core，也不把 Simulation 退款解释为真实 Provider 退款。

每次退款在外部 Adapter 调用前必须建立持久化 `RefundAttempt`，并以 `refund_id` 作为 Provider 幂等关联。`prepared`、`submitting` 和 `provider_unknown` 尝试都会占用本笔交易的可退额度；只有明确的 `refunded` 结果才会改变交易退款金额和钱包投影。

## 状态与规则

```text
prepared → submitting → refunded
                    └→ provider_unknown → refunded
                    └→ failed → submitting
```

- Provider 返回 `provider_unknown`，或抛出未知结果错误时，退款保持 `provider_unknown`，不能增加钱包余额，不能把交易标记为已退款。
- Provider 返回必须包含 `status=refunded`、非空 `provider_reference`，并且金额与币种必须和 RefundAttempt 完全一致。
- 同一交易的新退款请求必须扣除已确认退款和所有未决 RefundAttempt；超过剩余可退额度直接拒绝。
- 本地提交在外部退款成功后失败时，重试相同幂等键必须复用原 `refund_id` 和 Provider 幂等键，不能重新发起第二笔退款。
- 如果外部退款成功且 `RefundAttempt=refunded` 已持久化，但本地 `Refund`/`Transaction` 提交失败，后续任意新退款请求必须先从该 Attempt 补齐本地退款事实并返回已确认退款（`recovery.reason_code=refund_attempt_reconciled`），不得调用 Provider 或创建第二笔外部退款。
- 已确认退款仍由既有 Refund、Transaction、Receipt 和对账事实表达；RefundAttempt 只保存外部执行边界与恢复状态。

## 持久化

SQLite Schema v14 新增 `refund_attempts`：

- 唯一 `operation_key` 和 `refund_id`；
- 交易、金额、币种、状态、Provider 引用、原因和时间；
- `prepared`、`submitting`、`provider_unknown`、`refunded`、`failed` 状态约束；
- 通过 `loadState()` 和领域快照恢复，支持本地提交失败后的重试与对账。

## 验收

```bash
node --test sandbox/f13.test.mjs
```

必须覆盖：未知退款占用额度、Provider 返回未知对象失败关闭、外部成功但本地提交失败后的同键恢复、换新幂等键仍只恢复已确认退款且不重复调用 Provider，以及既有已确认退款和恢复路径不回归。

本契约不开放 Live/Mainnet、托管钱包、生产凭证或真实 Provider 退款；Sandbox/Testnet 仍受既有环境和执行状态门槛约束。
