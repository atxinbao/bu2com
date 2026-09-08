# F11 Inbound Collection Verification 契约 v1

日期：2026-09-08  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

F11 将 Provider 已验证的入站付款与 F10 Receivable 关联，并在一次原子幂等变更中将 Receivable 标记为 `paid`、创建 Collection 事实和一对不可变 FinancialPosting。F11 复用 F10 的 `collection_reference`、金额、币种、Receiving Target 和可选付款方约束。

F11 不创建第二套交易核心，不改变买方钱包，不执行退款，不提供对账，不签发 Receipt，也不打开 Live/Mainnet、托管、Hosted 或生产凭证。当前 Reference Sandbox 仅使用 `SimulatedPaymentAdapter.verifyInboundPayment()` 产生明确标记为 `simulation` 的验证结果；没有入站验证能力的 Adapter 会失败关闭。

## 2. 对象与状态

```text
Receivable (issued | pending)
  → Collection (pending | posted)
  → Receivable (paid)
```

Collection 核心字段：

- `id`：`cpay_...`；
- `receivable_id`、`account_id`、`agent_id`、`receiving_target_id`；
- `collection_reference`：必须等于 Receivable 的业务引用；
- `provider` / `provider_reference`：外部验证来源和不可重复引用；
- `amount`、`asset`、`network`：必须与 Receivable 一致；
- `payer_account_id` / `payer_agent_id`：实际验证到的付款方；
- `verification_status`：`pending | verified`；
- `status`：`pending | posted`；
- `verification_mode`：`simulation | provider`；
- `verified_at`、`created_at`、`updated_at`。

只有 `verified` 结果才能进入 `posted` 并写入 FinancialPosting；`pending` 结果只记录待处理事实，不移动资金或改变为 `paid`。LA-04 允许后续使用新的幂等键重新观察同一 `provider_reference`，追加验证证据并在首次 verified 收敛时单次过账。

## 3. 验证规则

1. Receivable 必须存在、未过期且处于 `issued` 或 `pending`。
2. Provider 返回的 `collection_reference` 必须精确匹配 Receivable。
3. 金额和币种必须精确匹配，禁止换算、拆分或覆盖 Quote 金额。
4. 如果 Receivable 有资产或网络约束，Provider 返回值必须精确匹配。
5. 如果 Receivable 指定预期付款方，Account 和 Agent 必须同时匹配。
6. `provider_reference` 在所有 Collection 中全局唯一；重复引用只返回已存在事实，不重复入账。
7. 失败、未知或未验证结果不得创建 FinancialPosting，不得把 Receivable 标记为 `paid`；迟到的已验证付款必须保留为可对账事实，但不能自动授予已过期权益。

## 4. API 与权限

```text
POST /v1/receivables/{receivable_id}/collections
GET  /v1/collections
GET  /v1/collections/{collection_id}
```

创建验证必须携带 `Idempotency-Key`、`provider_reference` 和 `collection_reference`。Account/Agent 范围内的 Agent/Developer 使用 `collections:create`；Agent、Developer 和 Operator 使用 `collections:read`。列表与详情均按 Account/Agent 声明范围过滤。

## 5. 财务事实

成功验证在同一 Domain 事务中追加事件 `receivable.payment_posted` 与两条 Posting：

```text
debit  cash.receiving_target:<receiving_target_id>
credit receivable:<receivable_id>
```

Posting 的 `source_id` 为 Collection ID，`transaction_id` 与 `budget_id` 为空。它表达入站收款事实，不伪造买方钱包余额，也不替代后续 F14 对账。

## 6. 恢复与验收标准

- [x] 已验证付款可将 Receivable 置为 `paid` 并产生一对 Posting。
- [x] 金额、币种、Collection Reference、付款方、资产和网络不匹配时失败关闭。
- [x] 相同 Idempotency-Key 重放返回原结果。
- [x] 相同 Provider Reference 使用新幂等键不会重复创建 Collection 或 Posting。
- [x] SQLite 重启后 Receivable、Collection、事件和 Posting 保持一致。
- [x] pending Collection 可持续验证到 verified，连续观察证据持久化且只产生一对 Posting。
- [x] HTTP、OpenAPI、TypeScript SDK、访问控制和列表详情契约已对齐。
- [ ] Base Sepolia 双向收款、Hosted、Live/Mainnet 和真实资金仍未执行。

本契约不构成真实收款、Testnet 双向资金或生产结算授权。
