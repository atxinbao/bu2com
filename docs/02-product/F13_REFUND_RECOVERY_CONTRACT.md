# F13 有界取消与退款恢复契约 v1

日期：2026-09-09  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

F13 为现有 Transaction Core 增加两条受限资金事实路径：预留后取消，以及结算后全额/部分退款。它复用既有 Transaction、Wallet、Budget Hold、Adapter Operation、Idempotency Claim 和 LedgerEvent，不创建第二套交易或财务账本。

F13 只在 Local / Sandbox / Testnet 的既有执行边界内验证。真实 Provider 退款、法币结算、Live/Mainnet、Hosted、托管和 F14 对账不在本 PR 中开放。

## 2. 状态与不变量

```text
funds_reserved ── cancel ──> canceled
settled ── refund ──> settled (partial) ──> refunded (full)
provider_unknown refund ── recover ──> refunded / provider_unknown
```

- `cancel` 只允许 `funds_reserved`；取消释放 Wallet reserved 和 active Budget Hold，并追加不可变 Posting。
- `refund` 只允许 `settled` 或仍有可退余额的 `refunded` 交易；金额必须为正整数、币种必须匹配，且不得超过剩余可退金额。
- 始终满足 `refunded_amount ≤ settled_amount ≤ reserved_amount ≤ authorized_amount`。
- 退款成功才增加买方可用余额；F13 不改写已消费 Budget 的历史金额，预算/Provider/费用对账由 F14 处理。

## 3. 退款事实与恢复

`Refund` 使用 `resources(kind=refunds)` 持久化，字段包括 `transaction_id`、`payment_intent_id`、`amount`、`status`、`provider_reference`、原因、创建/完成时间和 `recovery_required`。

`status` 为 `processing | refunded | provider_unknown`。Provider unknown 会先提交退款事实和恢复要求，再由 `POST /v1/refunds/{refund_id}/recoveries` 显式查询；恢复路径不得重新调用退款提交入口。没有 Adapter refund/recovery 能力时失败关闭。

## 4. API

```text
POST /v1/transactions/{transaction_id}/cancellations
POST /v1/transactions/{transaction_id}/refunds
GET  /v1/refunds
GET  /v1/refunds/{refund_id}
POST /v1/refunds/{refund_id}/recoveries
```

所有写操作要求 `Idempotency-Key`。同一 Key 和请求体返回原结果；请求体漂移返回 `409 idempotency_conflict`。

## 5. Adapter 边界

SimulatedPaymentAdapter 提供可审计的 `cancel`、`refund` 与 `recoverRefund` 结果，用于本地验收。x402 Adapter 当前没有标准退款原语，因此 F13 不伪造退款成功，也不自动发起第二笔支付；必须由后续受控 Adapter/Provider 接入并由 F14 对账。

## 6. 验收标准

- [x] 预留态取消恢复钱包和 Budget Hold，重复请求不重复释放。
- [x] 部分/全额退款分别更新 `refunded_amount` 与交易终态。
- [x] 超额、错误币种和非法状态失败关闭。
- [x] Provider unknown 退款可跨 SQLite 重启保存，并通过显式恢复完成。
- [x] HTTP、OpenAPI、Access Contract、TypeScript SDK 和领域测试一致。
- [ ] F14 财务对账、真实 Provider 退款、Hosted、Live/Mainnet 和托管仍未开放。
