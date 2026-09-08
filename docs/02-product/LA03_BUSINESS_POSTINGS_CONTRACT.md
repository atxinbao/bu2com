# LA-03a 业务资金事实分录契约

日期：2026-09-09
维护者：Codex
风险等级：R2（业务金额、账务事实、幂等与恢复）

## 1. 目的与范围

本文件定义 Ledger Assurance Gate 的 LA-03 首个可审查子范围：把已经确认的结算、退款和 Provider 手续费事实写入现有受保护 Journal/Posting 边界。它不是完整 LA-03 的完成声明，而是为后续收款收敛、期初余额和更正分录提供可验证的业务事实基础。

本子范围只复用现有 Transaction Core、`financial_postings`、成组 `Journal` 写入入口和 SQLite 原子提交，不创建第二套账本，不调用 Provider、Signer、x402 或 AP2。

## 2. 业务分录规则

| 业务事实 | 借方 | 贷方 | `source_id` | `transaction_id` |
| --- | --- | --- | --- | --- |
| `transaction.settled` | `payable.payee:{payee_account_id}` | `cash.wallet:{payer_account_id}` | settled Transaction | settled Transaction |
| `transaction.refunded` | `cash.wallet:{payer_account_id}` | `payable.payee:{payee_account_id}` | confirmed Refund | owning Transaction |
| `reconciliation.fee_recorded` | `expense.provider_fee:{provider}` | `cash.account:{account_id}` | ProviderFee | payment/refund 来源对应 Transaction；collection 为 `null` |

每个事实产生一个两行、同币种、同金额的平衡 Journal。账户标识经过确定性规范化，仅用于账务科目命名，不改变原始业务主体或资金绑定。

## 3. 不变量

1. 只有确认的 `transaction.settled`、`status=refunded` 和可对账的 ProviderFee 才能产生对应 Posting。
2. 同一幂等键重放必须返回原结果，不得追加第二组 Posting。
3. 每组 Posting 必须通过 LA-02 的来源、金额、安全整数、借贷平衡和不可变约束。
4. 业务资源、事件、Posting、Outbox 和幂等终态在同一 SQLite 原子提交中落盘；提交失败时恢复内存状态，不留下半组分录。
5. Provider-unknown、pending 或未确认事实不得伪装为已结算、已退款或已收费。
6. 已有历史 Posting 不回填缺失的业务来源；后续更正必须追加新事实。

## 4. 验收证据

- `npm --prefix sandbox run test:la03`：持久化结算、退款确认/未知结果、ProviderFee 关联与幂等重放。
- `f07.test.mjs`、`f13.test.mjs`、`f14.test.mjs`：预算结算、部分/全额退款和对账回归。
- Sandbox 全量、契约、SDK、Prototype 与 Hosted 本地合约门禁必须继续通过。

## 5. 明确非目标与后续边界

本 PR 不包含：期初余额、完整历史重建、pending Collection 收敛、独立对账重放、跨账户余额投影、生产财务结算、真实 Provider/Testnet/Hosted/Live 执行、托管钱包或 E3.1 外部试点。LA-03 完整范围仍需后续补齐并单独审查；LA-04/LA-05 依赖其结果。E3.1 Pilot Manifest 继续保持暂停。
