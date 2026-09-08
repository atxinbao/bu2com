# F10 Account-Owned Receivable 契约 v1

日期：2026-09-08  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

F10 为卖方 Account 建立一条可持久化、可查询、可幂等重放的应收业务事实。Receivable 从一个 active Quote 创建，金额和币种从 Quote 派生，并绑定收款 Account、Seller Agent 和已验证或待验证的 Receiving Target。

F10 不验证入站链上付款、不移动钱包余额、不追加入账 Ledger、不签发 Receipt。F11 负责识别入站付款、将 Receivable 置为 paid 并一次性追加资金事实。

## 2. 对象与状态

```text
Quote (active)
  → Receivable (issued)
  → F11 pending / paid
```

核心字段：

- `id`：`rcv_...`；
- `quote_id`：唯一金额、币种和商品来源；
- `account_id` / `agent_id`：收款业务主体；
- `receiving_target_id` / `receiving_target_binding_id`：收款目标绑定；
- `amount`：从 Quote 复制的最小货币单位金额，不接受第二份金额输入；
- `collection_reference`：供后续入站支付匹配的 BU2 业务引用；
- `expected_payer_account_id` / `expected_buyer_agent_id`：可选的付款方约束，必须成对出现；
- `expires_at`、`status`、`version`、`created_at`、`updated_at`；
- `purpose` 与受限 `metadata`。

当前 F10 创建状态为 `issued`。后续 F11 才能推进 `issued → pending → paid`；过期和取消状态不得被 F10 创建接口伪造。

## 3. 创建规则

1. Quote 必须存在且为 `active`。
2. Quote 的 payee Account、seller Agent 必须分别等于 Receivable 的 `account_id`、`agent_id`。
3. Quote 若已有 Receiving Target，Receivable 必须使用同一目标；持久运行时继续复用 F06b 的环境、资产、网络和 verified binding 校验。
4. Receivable 到期时间必须在未来，且不得晚于 Quote 到期时间。
5. 金额、币种、资产和网络从 Quote 派生，F10 不接受覆盖金额的输入。
6. 创建只写 Receivable 资源、追加 `receivable.created` 事件和幂等事实，不改变钱包、Transaction、Budget Hold 或 Financial Posting。

## 4. API 与权限

```text
POST /v1/receivables
GET  /v1/receivables
GET  /v1/receivables/{receivable_id}
```

Agent/Developer 使用 `receivables:create` 创建自己的收款请求；Agent、Developer 和 Operator 使用 `receivables:read` 按 Account/Agent 声明范围读取。列表不会泄露其他租户的 Receivable。

创建必须携带 `Idempotency-Key`。相同键与相同载荷返回原 Receivable；相同键与不同载荷返回 `idempotency_conflict`。

## 5. 恢复与后续边界

- SQLite 重启恢复 Receivable、事件和幂等记录。
- F10 不自动触发 Provider、Signer、x402 或链上 RPC。
- F11 必须复用 `collection_reference`、Quote、Receiving Target 和同一交易核心，不能创建第二套收款账本。
- Live/Mainnet、Hosted、托管和生产凭证继续关闭。

## 6. 验收标准

- [x] active Quote 可创建 account-owned Receivable。
- [x] 金额从 Quote 派生，创建不移动余额、不创建 Transaction。
- [x] Account/Agent/Receiving Target 不匹配失败关闭。
- [x] 到期时间窗口和 Quote 状态校验生效。
- [x] 创建、查询、列表和幂等 HTTP 契约可运行。
- [x] SQLite 重启后 Receivable 与状态保持一致。
- [x] F11 入站付款验证与一次性入账已实现；真实 Testnet/Hosted/Mainnet 仍未执行。

本契约不构成真实收款、Testnet 双向资金或生产结算授权。
