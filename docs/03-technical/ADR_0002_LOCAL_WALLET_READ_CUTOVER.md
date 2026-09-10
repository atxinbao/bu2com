# ADR-0002：目标账簿 Local 读路径的追加式切换

日期：2026-09-10
执行者：Codex
状态：Accepted for FP-06b；资金写源部分由 FP-08 契约扩展

## 背景

FP-05 已把新业务资金事实绑定到可信 LedgerAccount，FP-06a 已提供按 LedgerAccount/币种隔离的 WalletReadModel 与 legacy wallet shadow，但运行时仍以单一 `this.wallet` 为读写事实。直接把历史 null/unbound Posting 回填到目标账户会改写既有资金事实；直接把 Schema 19 projection 用作扣款授权又会把读模型升级成新的 Transaction Core。因此 FP-06b 需要一个可审计、可停止、可回退的中间层，只在明确迁移边界成立时切换**读路径**。

## 决策

1. FP-06b 只允许 `local` 环境执行迁移计划与读路径 cutover。Sandbox/Testnet、Hosted、Live/Mainnet 和生产数据操作继续需要后续独立准入。
2. Schema 21 新增 `wallet_migration_plans`、`wallet_cutover_assessments`、`wallet_cutover_generations` 三类控制事实；全部禁止 UPDATE/DELETE。当前路由由同一 scope 最大 generation 推导，不维护可被覆盖的 mutable pointer。
3. 旧 Receipt、LedgerEvent、Journal、FinancialPosting 不回填、不改绑。历史处理只能选择：
   - `fully_bound`：当前币种没有 legacy unbound source；
   - `scoped_exclusion`：逐 source 记录独立证据引用，证明它不属于目标账簿；
   - `reconciled_opening`：逐 source 分类为已被目标期初覆盖或属于其他 scope，并绑定真实已过账的 reconciled opening checkpoint。
4. migration plan 的 `verified` 只表示机器检查“当前 legacy source 集合完整分类、scope/期初/时间边界一致且证据引用存在”；它**不等于** R2/R3 人类批准，也不证明证据内容真实性。source 清单指纹与 checkpoint 内容指纹分别保护范围和期初快照，后续漂移使计划 stale。
5. cutover assessment 必须重新取得当前 WalletReadModel/shadow，并要求 active account、非 stale、target completeness complete、candidate available、无 in-flight reserved/pending 或持久化未知/已确认未过账 Attempt、legacy shadow matched；目标存在 settled/refunded/posted/fee source 时，同一最新相关 reconciliation 必须完整且唯一覆盖全部 source 并 matched。blocked assessment 也保留为追加式失败证据。
6. 激活在同一个 SQLite `BEGIN IMMEDIATE` 内重新验证 migration-plan fingerprint、`state_revision`、legacy wallet 快照、fresh assessment snapshot hash、活动 projection identity/source hash/content hash 和 generation CAS。任一漂移都拒绝激活。
7. `wallet-runtime-view.v1` 在 cutover 后选择 `available_spending_capacity` 作为与旧 `wallet.available` 对应的运行时读值，同时保留完整 `book_balance`/reserved/pending 模型。shadow 对 legacy reserved 的等价比较使用 candidate `reserved + pending_outbound`。该读值不成为支付授权：`spend_decision_source` 仍固定为 `legacy_wallet`。
8. cutover 健康时现有 Transaction Core 仍按原 wallet 规则 reserve/settle/refund；每次 runtime read 持续重验 shadow equivalence。cutover 变 stale/unresolved、Domain revision 过期、Attempt/settlement Adapter operation 未完成或 accounting candidate 与 legacy spend source 分叉时不静默 fallback，而是在新 reserve 调用 Adapter 前失败关闭。该 guard 只作用 Local，不改变其他环境原有授权/执行规则。已存在或已确认的资金事实仍按原恢复路径完成。
9. rollback 不修改旧 generation；它追加一个新的 `legacy_wallet` generation。恢复 projection 后若要再次 cutover，必须重新 assessment 并追加下一 generation。

## 事务与数据所有权

- Transaction Core 继续独占支付状态、legacy wallet mutation、授权、幂等、Outbox 和 Provider 调用。
- Journal/Posting 继续是不可变资金事实；Schema 21 只保存迁移/切换控制事实和证据快照。
- projection refresh 只有在默认“无 legacy unbound”条件成立，或显式 migration plan 当前且 scope 匹配时才能激活；migration plan 不产生或修改任何 Posting。
- migration/assessment/generation 使用独立短事务；cutover 激活使用 `BEGIN IMMEDIATE` 与 generation CAS，不能与另一个激活者同时成功。
- assessment 幂等指纹只绑定输入请求，派生 snapshot 独立保存；重放原 assessment 不等于重新批准。projection ID/hash 是历史证据，不以外键阻止清理可重建的派生表。激活写后故障由同一事务整体回滚。

## 候选方案

### A. UPDATE 历史 Posting 后直接切换

拒绝。它会改写既有资金事实，破坏历史可验证性，并把无法证明的归属伪装成确定事实。

### B. projection 一旦存在就自动替代 wallet

拒绝。缺少历史分类、shadow、reconciliation、并发 CAS 和恢复边界，也会把派生读模型变成隐式支付授权。

### C. 追加式 plan → assessment → generation

采用。它把历史解释、切换条件和当前路由分别留痕，失败时可以停止新执行并追加回滚 generation，而不改写资金历史。

## 失败与恢复

- plan source drift：停止 projection refresh/cutover，重新盘点并建立新计划。
- assessment/state/wallet/projection drift：拒绝激活，重新 assessment；不得强行覆盖 CAS。
- active runtime view stale/incomplete：返回 `blocked`、`read_balance=null`、`fallback_performed=false`，阻止新的 reserve；先 refresh/reconcile，或追加 legacy rollback generation。
- rollback 后不删除 Schema 21 或旧 generation；前滚恢复时在相同 scope 上重新 assessment 并追加新 generation。
- 任何 Provider 结果未知仍遵守原 provider_unknown/对账流程；cutover 机制不得自动重放外部付款。

## 重新评估条件

- 产品正式公开 Wallet API 或把 `available_spending_capacity` 变成支付授权来源；
- Sandbox/Testnet 或 Live 环境需要执行 migration/cutover；
- 单一 legacy wallet 被真正多账户写模型替代；
- migration source 超过当前 500 条有界分类上限；
- 引入新的资产、网络、Provider balance observation 或多写者数据库。

## FP-08 后续决定

FP-08 已触发“单一 legacy wallet 被真正多账户写模型替代”的重新评估条件。Schema 21 的追加式 plan / assessment / generation 与 Local-only 控制边界保持不变；Schema 22 在健康激活时初始化账户级写余额，新交易持久化写源，Transaction Core 继续独占所有余额修改。账户余额发生变化后不允许 rollback 到 legacy 全局写源。具体金额、费用、并发和恢复契约见 [`FP08_ACCOUNT_WALLET_WRITE_CONTRACT.md`](../02-product/FP08_ACCOUNT_WALLET_WRITE_CONTRACT.md)。
