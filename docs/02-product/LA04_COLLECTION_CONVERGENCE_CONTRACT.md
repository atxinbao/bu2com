# LA-04 Collection 持续验证与单次入账契约

日期：2026-09-09
维护者：Codex
风险等级：R2（入站资金事实、持续验证、账务过账）

## 1. 目的与范围

LA-04 修复入站收款在 `pending` 后无法继续验证的问题。相同经济付款由 `provider_reference` 唯一标识；后续使用新的幂等键重新观察时复用同一 Collection，追加验证证据，并只在 `pending → verified` 的第一次收敛时写入一对 Financial Posting。

本 PR 继续复用现有 `POST /v1/receivables/{receivable_id}/collections`，不创建第二套收款核心，不调用新的 Provider，也不打开真实 Testnet 或 Hosted 执行。

## 2. Collection 状态与证据

```text
Receivable (issued | pending | expired)
  → Collection (pending)
  → Collection (posted, verification_status=verified)
  → Receivable (paid，或保留 expired 状态)
```

- 每次 Provider 观察都追加 `CollectionVerificationAttempt`，包含 Provider、稳定引用、状态、金额、资产、网络、付款方、验证模式和观察时间。
- 同一 `provider_reference` 只能绑定一个 Collection；不同幂等键不会创建第二个 Collection。
- 已经 `posted/verified` 的 Collection 只返回已持久化事实，不重复调用 Provider 或写入 Posting。
- 迟到入站证据仍可被记录和过账，但 Collection 标记 `late=true`、`fulfillment_eligible=false`，不能自动授予已过期权益。

## 3. 单次过账不变量

- `pending` 观察不产生 Financial Posting，不把 Receivable 标记为 paid。
- 第一次 `verified` 观察在同一 Domain 事务中追加 `receivable.payment_posted` 或 `receivable.payment_posted_late` 事件和一对平衡 Posting。
- 已有 Posting 的 Collection 不会因重复验证、重启或新幂等键再次过账。
- Provider 返回的金额、币种、Collection Reference、资产、网络和付款方约束仍必须与 Receivable 精确匹配。
- Provider 结果失败、未知、引用不一致或状态漂移失败关闭，既有 pending 事实保持不变。

## 4. 恢复与边界

- SQLite 重启后 Collection、验证尝试和 Posting 一起恢复；恢复后可继续用同一 Provider Reference 观察。
- 迟到收款保留财务事实供对账，但不得绕过 AccessGrant 的付费交付前置条件。
- 本契约不实现真实链上扫描、外部 Provider checkpoint、独立对账、跨账簿所有权、多资产结算或生产财务结算；这些属于 LA-05、ENV-07B 或后续准入。

## 5. 验收

- pending → verified 使用新幂等键可以收敛到同一 Collection，验证尝试为 2，Posting 恰好为 2 行。
- 已 posted 重放不再调用 Provider，也不增加 Posting。
- SQLite 重启后验证证据和 Posting 数量保持一致，并可继续完成收敛。
- 过期 Receivable 的迟到入站证据可以入账，但创建 AccessGrant 被 `collection_not_fulfillable` 拒绝。
