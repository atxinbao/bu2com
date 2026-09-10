# FP-08 账户级资金写源与买方 ProviderFee 契约

日期：2026-09-11  
维护者：Codex  
风险等级：R2（资金写源、余额并发与费用语义）

## 1. 目标

FP-08 将通过 FP-06b Local cutover 的新付款从全局 legacy wallet 切换到 `ledger_account_id + currency` 账户级运行时余额，并让 Payment/Refund 来源的 ProviderFee 在同一买方账户中只扣减一次。Transaction Core 继续是唯一资金写所有者，账务历史仍由不可变 LedgerEvent、Journal 与 Posting 解释。

本变更不新增公开 Wallet API，不改变 Collection 的运行时入账，不执行 Hosted、Sandbox/Testnet、Live/Mainnet、Signer、真实资金、Tag、Release 或生产迁移。

## 2. 写源选择

- 没有活动 FP-06b cutover 的交易继续使用 `legacy_wallet`。
- 活动 cutover 在激活事务中，以已重验的 `available_spending_capacity` 初始化账户级写源；初始化不调用 Provider，也不新增账务金额，但会原子追加 `wallet.account_write_initialized` LedgerEvent/Outbox 和 state revision。
- 新交易把 `wallet_write_source` 固定为 `account_wallet` 或 `legacy_wallet`。后续取消、结算、退款与费用只按该持久事实路由，不根据当前配置或账户状态重新推断。
- 历史交易缺少该字段时继续解释为 `legacy_wallet`，不得静默改绑。
- 账户级写源一旦发生变化，不允许回退到全局 legacy wallet；恢复必须前滚并保留既有资金事实。

## 3. 金额语义

账户级余额按 `ledger_account_id + currency` 隔离：

- reserve：`available -= amount`，`reserved += amount`；
- cancel：`reserved -= amount`，`available += amount`；
- settle：`reserved -= amount`；
- refund：`available += amount`；
- Payment/Refund ProviderFee：`available -= fee`，业务重复键或新幂等键重放均不得再次扣减。

ProviderFee 是已经发生的外部费用事实。即使账户随后暂停或费用导致可支出余额为负，也必须允许补记；负余额会阻止新的 reserve，但不能用“余额不足”丢弃费用。Collection-side fee 本轮继续只写 Posting，因为 Collection 主金额尚未进入账户级运行时余额，不能只扣费用而不承接收款。

## 4. 原子性与并发

Schema 22 的账户级余额行使用安全整数最小单位、复合唯一键和版本 CAS。所有余额增量在写回前必须保持 JavaScript safe-integer 范围，`reserved` 不得为负；ProviderFee 可以让 `available` 为负。变更后的余额、资源、Posting、LedgerEvent、Outbox、幂等终态与全局 state revision 必须在同一个 SQLite immediate transaction 提交。并发冲突失败关闭并要求查询后重试；故障注入不得留下部分余额或孤立费用事实。

## 5. 兼容与恢复

- Schema 22 只追加新表和触发器，不 UPDATE/DELETE 历史 wallet、Receipt、Journal 或 Posting。
- 旧 `wallet_accounts` 和 `sandbox_state.wallet` 继续解释 legacy-unbound 交易。
- 账户级写源是绑定交易的运行时资金状态，不是第二套公开账本；WalletReadModel 继续从不可变 Posting 重建并与当前活动写源比较。
- 回退代码时必须停止新的账户级执行并只读检查 Schema 22；不得删除账户级余额或把新交易改回全局 wallet。
- 产品验收证据升级为 `fp08.social-wallet-acceptance.v1`，明确账户级写源和 buyer-side fee 已在 Local 验收；旧 `fp07.social-wallet-acceptance.v1` 不得被当前 RC 消费者重新解释。

## 6. 验收

专项测试必须覆盖：两账户隔离、reserve/cancel/settle/refund、Payment/Refund fee、业务重复、新幂等键、暂停账户补记、费用导致负 available 后的新 reserve 阻断、SQLite 重启、双连接 CAS、故障注入整体回滚、回退阻断和 legacy 路径不回归。完整交付还需 Sandbox 全量、RT-01、LA-06a、Prototype lint/build、Graphify 与 diff 检查。
