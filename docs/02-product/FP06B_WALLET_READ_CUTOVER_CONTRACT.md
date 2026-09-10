# FP-06b 目标账簿迁移与 Local 运行时读路径切换契约

日期：2026-09-10
维护者：Codex
风险等级：R2（账簿迁移解释、运行时读路径与新执行失败关闭）

## 1. 目标与非目标

FP-06b 把 FP-06a 的 shadow 模型推进为**可受控选择的 Local 运行时读路径**，同时保持 Transaction Core 和资金写路径不变。它不执行生产数据迁移，不回填旧 Posting，不创建产品公开 Wallet API，不让 projection 直接决定扣款额度，也不开放 Sandbox/Testnet、Hosted、Live/Mainnet、Signer 或真实资金。

> 后续状态：FP-08 在不改写 FP-06b 历史控制事实的前提下增加 Schema 22。健康 cutover 激活现在会初始化账户级写源；新交易由 Transaction Core 写入该账户余额。未激活 scope 和历史交易仍保持本页的 legacy 行为。

## 2. Schema 21 控制事实

- `wallet_migration_plans`：冻结目标 LedgerAccount/币种、当前 legacy unbound source fingerprint、分类策略和证据引用。
- `wallet_cutover_assessments`：保存当次 state revision、projection/source identity、WalletReadModel、shadow、reconciliation 与 legacy wallet 快照；ready 与 blocked 都保留。
- `wallet_cutover_generations`：追加 `ledger_projection` 或 `legacy_wallet` 路由 generation。最大 generation 是当前路由；不存在 UPDATE/DELETE pointer。

三类表全部为追加式控制事实，不是 Journal/Posting，也不产生资金余额。Schema 1–21 必须连续迁移。assessment 保存 projection ID/hash 作为历史证据，不以外键阻止删除可重建的派生投影；删除投影不删除 assessment。

## 3. 历史迁移计划

计划只允许 Local，并最多处理 500 个当前同币种 legacy-unbound source。每个 source 必须恰好出现一次分类，不能漏项或额外伪造 source；计划保存 source 清单指纹（来源、Posting/Journal 数与时间边界），后续新增/追加 legacy source 会使原计划 stale。reconciled-opening 另保存完整 checkpoint 内容指纹，资源内容漂移或缺失同样失败关闭；这不构成证据真实性证明。trusted source inspection 每批至多 400 个 source ID 加一个币种参数，避免账户增长后参数溢出。

| 策略 | 允许条件 | 不能声称 |
| --- | --- | --- |
| `fully_bound` | 当前没有 legacy-unbound source | 不代表全库历史已审计 |
| `scoped_exclusion` | 每个 legacy source 都有 `excluded_other_scope` 与独立证据引用 | 机器只验证引用存在，不验证证据真实性 |
| `reconciled_opening` | 绑定目标 LedgerAccount 的已过账 opening checkpoint；目标历史 source 的最后 Posting 不晚于 effective_at；其余逐项排除 | 不允许用 opening 覆盖 checkpoint 之后的新事实 |

`status=verified` 是**结构/范围机器校验结果**，不是人类批准或生产数据结论。当前单人治理阶段的 R2 合并由 Project Owner 明确兼任 Domain/Architecture 角色并作出人工批准，AI 不得自批；任何实际生产数据操作另需 R3。

## 4. Cutover assessment

ready 至少要求：

- migration plan 仍 current；
- LedgerAccount active；
- WalletReadModel 非 stale 且 target completeness complete；
- `available_spending_capacity` 可计算；
- `reserved=0` 且 `pending_outbound=0`，没有持久化未知或已确认未过账的 Payment/Refund Attempt；
- legacy `wallet.available/reserved` 与 shadow candidate matched；其中 legacy `reserved` 的候选等价值是 WalletReadModel 的 `reserved + pending_outbound`，不能因状态拆分把同一预留重复或遗漏；
- 目标已有需 Provider 对账的 settled/refunded payment、已确认 refund、posted collection 或 provider fee 时，同一最新相关 reconciliation 必须在相同 LedgerAccount+币种 scope 内完整且唯一地覆盖全部 required source，并全部 matched；缺项、重复、未知 item status、错币种、unknown 或 exception 均阻断。开账与内部更正不属于 Provider required source；目标没有此类外部事实时明确返回 `not_required`。

assessment 创建后不自动获得激活资格。激活时必须重新计算 fresh assessment，并与保存的 snapshot hash 完全一致；同时 SQLite 再比较 state revision、legacy wallet、projection/source hash 和 generation CAS。assessment 幂等只绑定调用者的账簿、币种、计划 ID；同键同请求返回原快照，后续状态变化不会伪装成请求冲突，但原快照不能因此跳过激活重验。

## 5. Runtime read 与资金写边界

切换前或回滚后：

```text
read_mode = legacy_wallet
read_balance = wallet.available
spend_decision_source = legacy_wallet
```

切换后且健康：

```text
read_mode = ledger_projection
read_balance = WalletReadModel.available_spending_capacity
read_balance_semantics = available_spending_capacity
spend_decision_source = legacy_wallet
```

因此正常 reserve 后，projection 的 `book_balance` 尚未变化时，reserved/pending 仍会从 candidate available 中扣除；在已核对的同一隔离 scope 中，读值不会因漏减该预留而高估。active cutover 每次读取还必须重新执行 shadow equivalence 和同一共享 reconciliation coverage 判定；即使 Posting、projection 与 shadow 都未变化，只要最新相关对账变为 incomplete/unknown/exception，也立即 blocked/null 并在 Adapter 前阻止新 reserve。全局 legacy wallet 尚不具备真正多账户资金写隔离，不能据此宣称跨账户读值与旧 wallet 永远一致。真正 settlement/collection/refund/fee 产生新 Posting 后，如果活动 projection 尚未刷新，则 runtime view 同样 `blocked`，不会返回旧值或静默 fallback。

FP-08 后，第二段代码块中的 `spend_decision_source` 对已初始化 scope 更新为 `account_wallet`；shadow 比较对象也更新为对应 `ledger_account_id + currency` 行。公开 API 和非 Local 环境仍不改变。

## 6. 停止与恢复

- active cutover stale/incomplete、Domain 内存 revision 落后于数据库、存在未完成 Payment/Refund Attempt、持久 `provider_unknown/payment_*` settlement Adapter operation、持续 shadow mismatch，或 required reconciliation 为 not_observed/incomplete/unknown/exception：`read_balance=null`、`fallback_performed=false`；匹配 LedgerAccount 的新 reserve 在 Adapter 前拒绝。该 guard 仅适用于 Local，其他环境原有 execution/authorization/binding 门槛不变，cutover 控制面仍拒绝 Sandbox/Live。
- 已预留/已确认外部事实不因读路径故障被删除或重复付款；继续按 Transaction Core/provider_unknown/reconciliation 恢复。
- 对账异常通过追加更新且完整的正规 reconciliation evidence 恢复；不删除旧 run、不修改 Posting、不重新付款。其他异常可使用同一个仍 current 的 migration plan 刷新 projection 后重新 assessment，或追加 `legacy_wallet` rollback generation。
- rollback 后重新切换必须使用新的 assessment 和更高 generation；旧 plan/assessment/generation 永不改写。FP-08 账户余额一旦与 legacy wallet 分歧，rollback 必须拒绝并以前滚修复，避免把已发生的账户级变动丢回全局余额。

## 7. 验收边界

FP-06b 只在隔离 Local/合成 SQLite 数据上证明：Schema 21 连续迁移、计划分类、reconciled opening、append-only、跨状态幂等、两个 SQLite 连接的 generation CAS、激活写后故障整体回滚、在线备份/重启恢复、fresh assessment、stale block、健康 reserve 与 rollback/reactivate。真实 Sandbox/Base Sepolia 双向证据仍为 `not_executed`，生产数据和 Live/Mainnet 仍未经授权。

## 8. 隔离 Local 恢复操作手册

数据与控制事实 Owner 为 Transaction Domain Owner；当前单人治理阶段的范围/证据由 Project Owner 明确兼任 Domain 与 Architecture 角色并作出人工批准。以下仅适用于已经明确为合成数据的隔离 Local 实例；不得把默认业务库或生产备份代入。

1. 停止接收新的资金请求，等待现有 Domain mutation 完成；保留查询、Attempt 观察与对账。使用 `ledger.backupTo(新的隔离路径)` 取得一致性备份，不覆盖既有文件。
2. 记录 `getRuntimeWalletView({ ledger_account_id, currency })` 的 generation、blockers、plan ID 与 assessment ID。调用 `walletMigrationPlanState(planId)` 检查 source/checkpoint 漂移；任何未分类事实或未知 Attempt 先处理证据，不得重复付款。
3. 仅内存 revision 过期时，在写入队列静止后调用 `reloadCommittedState()`，再次读取。投影损坏时查询 `getActiveLedgerAccountProjection()` 的实际 version，再显式调用 `refreshLedgerAccountProjection({ ledger_account_id, currency, expected_active_version, migration_plan_id })`；没有活动投影才传 `null`。CAS 冲突须重读，不强制覆盖。
4. 无法继续使用读投影时，调用 `rollbackWalletReadCutover({ ledger_account_id, currency, expected_active_generation, reason }, 新幂等键)` 追加 legacy generation。旧 generation/assessment 与资金事实保留；回滚本身不确认外部资金状态，也不应被当作恢复未知付款的手段。
5. 重新切换前取得新的完整对账与 assessment；以当前 generation 显式激活。核对新 generation、相同 scope、余额约束、备份 integrity 与未决 Attempt；未通过任一项就保持停止新执行。

Schema 21 是新增三表、索引及不可变 trigger 的短迁移，不回填旧资金表；SQLite 单写者锁仍可能竞争。旧应用回退不理解新读路径 guard，应保持停止新执行/只读并以前滚修复为主，禁止删除 Schema 21 记录。分类上限不是总数据量或生产延迟保证。

架构决定见 [`ADR_0002_LOCAL_WALLET_READ_CUTOVER.md`](../03-technical/ADR_0002_LOCAL_WALLET_READ_CUTOVER.md)。
