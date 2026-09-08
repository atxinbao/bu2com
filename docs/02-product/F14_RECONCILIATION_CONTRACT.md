# F14 支付、收款、退款与手续费对账契约 v1

日期：2026-09-09  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

F14 将已有 Payment、Collection、Refund、ProviderFee 和 FinancialPosting 事实汇总为可持久化、可重取、可解释的 `ReconciliationRun`。对账只读取并记录证据，不改写交易、收款、退款、钱包或历史 LedgerEvent。LA-05a 在此基础上增加外部观察输入；外部观察契约与未决队列见 [LA-05a](LA05A_EXTERNAL_RECONCILIATION_CONTRACT.md)。

本 PR 只在 Local / Simulation 边界验收。它不执行真实 Provider 查询、不发起支付或退款、不开放 Hosted、Live/Mainnet、托管或生产凭证。真实 Testnet 对账仍需独立 Provider 证据和环境准入。

## 2. 核心事实

### ProviderFee

`ProviderFee` 是由受控 Operator/Developer 录入的不可变外部费用事实，必须绑定一个已经确认的 Payment、Collection 或 Refund 及其 Provider Reference。重复来源只能返回相同事实；金额使用整数最小货币单位并保持源币种。

### ReconciliationRun

`ReconciliationRun` 是一次确定性快照，包含：

- `matched`、`exception` 或 `unknown` 总体状态；
- 按币种的 Payment、Collection、Refund、Fee 总额；
- 每个事实的预期金额、观察金额、Provider Reference、状态和稳定问题码；
- `as_of`、计数和创建时间。

## 3. 对账规则

- 已结算 Payment 必须存在状态为 `settled` 的 Adapter Operation，金额、币种和 Provider Reference 必须与 Transaction/Receipt 一致。`delivery_submitted` Payment 在外部对账模式中也必须进入未决队列，以预留金额作为预期金额。
- `posted` Collection 以已验证金额和 Provider Reference 作为观察事实；`pending` Collection 为 `unknown`。
- `refunded` Refund 需要 Provider Reference；`processing` 或 `provider_unknown` 为 `unknown`，不能推断退款已完成。
- 已登记 ProviderFee 作为独立费用事实计入对应币种，不从余额差额反推手续费。
- 任一金额、币种或 Provider Reference 不一致时，对账项为 `exception`；任一结果未知时为 `unknown`（无 exception 时）。
- 对账结果不能反向改变任何业务状态；修正通过新的事实或后续对账完成。

## 4. API

```text
POST /v1/provider_fees
GET  /v1/provider_fees
GET  /v1/provider_fees/{provider_fee_id}
POST /v1/reconciliations
GET  /v1/reconciliations
GET  /v1/reconciliations/{reconciliation_run_id}
```

所有写操作要求 `Idempotency-Key`。相同 Key 和请求体返回原结果；同 Key 不同请求体失败关闭。ProviderFee 的 source、amount、currency 和 reference 漂移均拒绝。

## 5. 持久化与恢复

ProviderFee 与 ReconciliationRun 复用 SQLite `resources` 表，随通用 Snapshot、LedgerEvent、Outbox 和 Idempotency Claim 原子提交，无新增 Schema migration。重启后可重新读取历史费用与对账快照；不得自动重跑 Provider。

## 6. 验收标准

- [x] Payment、Collection、Refund 和 Fee 可在同一对账运行中按币种汇总。
- [x] ProviderFee 只能绑定已确认来源，重复来源和引用漂移失败关闭。
- [x] 对账项明确区分 matched、exception、unknown，不把未知结果标记为成功。
- [x] 对账运行是追加事实，不改变 Transaction、Collection、Refund、Wallet 或历史 Posting。
- [x] HTTP、OpenAPI、Access Contract、TypeScript SDK 和领域测试一致。
- [x] SQLite 重启保留 ProviderFee 与 ReconciliationRun。
- [ ] 真实 Provider / Base Sepolia / Hosted / Live/Mainnet 和 F14 后续财务修正仍未开放。
