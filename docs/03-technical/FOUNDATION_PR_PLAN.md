# Ledger Foundation 产品接入收口 PR 计划

日期：2026-09-11
状态：Execution plan；工作包编号不是 GitHub PR 编号

目标不是重写已经验证的 Transaction Core，而是让“已实现能力、真实业务接线、产品读模型、迁移/切换和发布准入”形成可追溯且互不混淆的链路。资金/契约行为修改仍须按各自 R2/R3 门槛独立审查。

## 第一批：当前基线与工程保障

### FP-01 — Foundation 当前能力与产品接入基线

**本 PR 范围。**

- 建立 [`LEDGER_FOUNDATION_OVERVIEW.md`](LEDGER_FOUNDATION_OVERVIEW.md)。
- 建立 [`SOCIAL_WALLET_INTEGRATION_BOUNDARY.md`](../02-product/SOCIAL_WALLET_INTEGRATION_BOUNDARY.md)。
- 更新根 README 与 docs 导航，区分 Foundation、Transaction-first 领域语义和首个社交钱包产品方向。
- 加入只读 SQLite 盘点工具，只对显式隔离备份运行并固定输出 `inventory_only_not_acceptance`。

不修改交易运行时、Schema、余额 API、历史事实或 Provider。因为包含可执行只读工具，FP-01 按 **R1** 验收，而不是把整个 PR 当作纯 R0 文档。

### FP-02 — CI 证据收口

收紧证据消费者与生产者：源码 commit/tree/run/attempt、必需测试统计、原始日志、tracked source 状态和失败统计必须一致；旧 SHA、零/空测试、缺日志或不完整结果不能通过。仓库 required checks / branch protection 是独立运营门槛，不能靠 YAML 自证。

### FP-03 — 安全运行时基线

升级到包含已知 SQLite WAL 修复的受支持 Node/SQLite 构建，固定镜像 digest，并在最终镜像内验证 Node/npm/SQLite、Schema、WAL、备份恢复与账务回归。不得只升级宿主 `sqlite3` CLI 或放宽现有 runtime validator。

FP-01、FP-02、FP-03 可以并行准备，但应分别提交和审查。

## 第二批：代码边界与真实业务接线

### FP-04 — 保持 facade 的账本职责整理

优先提取纯金额/归属/投影计算与只读 helper，保留 `Bu2Sandbox` / `SqliteLedger` 兼容入口和 Transaction Core 单一强一致事务边界。纯结构提取不同时修改退款、未知状态或迁移语义。

### FP-05 — 新业务分录可信归属接线

从 Quote/Intent/FundingSource/ReceivingTarget 的可信快照解析环境、租户、账簿、Account、资产/网络和 `ledger_account_id`；结算、收款、退款、费用、期初与更正统一进入受保护过账入口。扩展绑定校验到完整所有权，而不只检查 active/environment。

验收必须由真实业务流程产生 Posting，而不是只手工构造完整 Posting 后验证查询。暂停账户的新支出拒绝，历史查询/已确认事实恢复保持可解释。

实现状态：Schema 20 已为 FundingSource/ReceivingTarget 增加不可变的可信 `ledger_account_id` 绑定，并校验 environment、tenant、owner Account、asset/network；Quote/Intent/Receivable/Transaction 将该归属快照传入 settlement、collection、refund、ProviderFee，期初与更正按显式账簿/原事实解析。新资金活动要求 active LedgerAccount；已确认事实的补记与历史读取只要求原 LedgerAccount 仍存在。历史 null/unbound 事实不回填，继续交给 FP-06b 的目标账簿迁移/期初核对。

## 第三批：产品读模型、限定切换与新 RC

### FP-06a — WalletReadModel 与 shadow comparison

冻结科目映射、余额字段、投影算法版本、源水位、stale/completeness 与 generation；对目标账簿只读 shadow 比较旧运行时和新账务结果。差异只报告，不自动补造 Posting，新投影不参与支出决策。

实现状态：`wallet-read-model.v1` 以 `ledger_account_id + accounting_currency` 为范围，`wallet-posting-liquidity.v1` 只汇总 `asset.cash* / cash.wallet:* / cash.receiving_target:* / cash.account:*` 流动性科目；`source_sequence` 固定为该范围不可变 Journal 数水位并同时输出 source/projection content hash。活动 projection 缺失、源内容变化、派生行漂移、目标 trusted business source 仍存在未绑定 Posting、不平衡 Journal、未绑定/异常 pending transaction 都显式进入 stale/completeness blocker。全库同币种但无法证明属于目标账户的 legacy unbound Posting 只记录为 `historical_scope=migration_pending` 与 `cutover_accepted=false`，不污染目标 shadow，也不被当成迁移完成。`provider_balance` 在缺少账户级 Provider balance observation 时返回 `not_observed/null`，不得用交易对账金额伪造。shadow 只比较 legacy 单钱包和候选模型，固定 `decision_use=forbidden` / `writes_performed=false`，不接入 `reserve()` 或任何资金状态转换。

### FP-06b — 目标产品账簿迁移与运行时切换

独立 R2：为目标范围追加可证明归属或建立已核对期初，进行版本化切换并提供停止新执行、继续观察/对账、前滚补记和恢复 runbook。实际生产数据操作仍需独立 R3 授权。

不得 UPDATE 旧 Receipt、Journal 或 Posting，不重新发起已发生外部付款，不双记余额。

实现状态：Schema 21 已增加 append-only migration plan / cutover assessment / cutover generation。FP-06b 仅在 `local` 允许控制面；migration plan 对当前 legacy-unbound source 做完整指纹与逐项分类，可用 fully-bound、scoped exclusion 或绑定已过账期初的 reconciled-opening，但 `verified` 只表示机器结构/范围检查，不替代人类 R2/R3 批准。激活前重新验证 state revision、legacy wallet、fresh assessment snapshot、projection/source hash 与 generation CAS；健康 cutover 的运行时读值取 `available_spending_capacity`，支出决策仍由 legacy Transaction Core wallet 负责。stale/incomplete 时不静默 fallback，而在新 reserve 调用 Adapter 前失败关闭；rollback 追加新的 legacy generation。

### FP-07 — 社交钱包产品接入基线验收与新 RC

同一候选上完成两个独立 Account、多个 Agent、收付/退款/费用、恢复、历史重放、权限、环境、迁移与备份 E2E；绑定 CI、runtime image、契约和人工审查证据后生成**新的**产品接入基线 RC。旧 `ledger-rc-local-v0.1` 标签保持不动。

实现状态：新增 `fp07.social-wallet-acceptance.v1`，在隔离 Local/Simulation SQLite 上组合两个 Account、四个 Agent、可信绑定、可核对期初、付款/收款/部分退款/seller-side Collection fee、持久 unknown→重启→recovery、完整对账、projection 删除重建、历史 replay 和 Online Backup。active cutover 增加持续 shadow-match guard，并把 delivery-submitted pending 纳入 legacy reserved 等价比较。buyer-side Payment/Refund ProviderFee 的 spending-capacity 语义仍未批准。CI-03 RC class 更新为 `social_wallet_local_integration_rc`，绑定同 source/image 的 FP-07 acceptance 与旧 `ledger-rc-local-v0.1` 历史基线；候选仍是 `prepared_not_released`，当前 protected-main 套餐阻塞不被绕过。

### FP-08 — 账户级资金写源与买方费用语义

独立 R2：Schema 22 增加 `ledger_account_id + currency` 账户余额。健康 Local cutover 激活从重验后的会计候选原子初始化写源；新交易固定保存 `wallet_write_source`，reserve/cancel/settle/refund 与买方 Payment/Refund ProviderFee 在 Transaction Core 既有强事务内通过账户余额版本 CAS 提交。

实现状态：`fp08.social-wallet-acceptance.v1` 取代旧 FP-07 证据语义，明确 `spend_decision_source=account_scoped_wallet` 且 buyer-side fee 已授权；旧 v1 证据不被静默重新解释。费用作为已观察外部事实可以使 available 为负，但新 reserve 在 Adapter 前失败关闭。历史交易继续使用 legacy wallet；公开 Wallet API、Collection 运行时净入账、Sandbox/Testnet/Live 和真实资金不在本范围。

## 审计修复与当前状态

### FP-A01 — 钱包对账完整性与激活后运行检查统一

PR [#82](https://github.com/atxinbao/bu2com/pull/82) 已合并到 main `e19bae63f29604554bcca9e10151d5363341ac07`。修复统一 WalletReadModel、cutover assessment 与 active Local runtime guard 的 required-source 完整、唯一和状态合法判定；异常时阻止可信余额读取及新的 reserve，正规追加对账可以恢复，且不重新付款或改写 Posting。

该合并提交的 `BU2 CI` run [`34527198064`](https://github.com/atxinbao/bu2com/actions/runs/34527198064) 已完成，`foundation`、`runtime`、`runtime image`、`BU2 / CI Gate` 四组 job 均 success。FP-A01 在当前范围内关闭，不再以“修复进行中”列为后续依赖。

### FP-A02 — Foundation 状态与合并证据收口

本工作包只对齐 FP-A01 合并后的文档状态、固定 main 基线和 CI 证据，风险等级为 **R0**。它不修改代码、Schema、API、交易/账务状态、环境配置或资金执行。GitHub API 当前仍报告 `main protected=false`，Social Wallet RC 继续保持 `prepared_not_released`；该运营门槛不能由 PR #82 的成功检查替代。

FP-A02 后的功能建设顺序为：FP-08 账户级资金写源与 buyer-side ProviderFee 支出语义、公开 Wallet API、LA-06b 外部 Sandbox/Testnet 双向验收。FP-08 当前候选通过后再进入公开 Wallet API；每项必须按自身 R2/R3 边界单独设计、验证和批准，不把 Local/Simulation 证据扩张为 Hosted、Live/Mainnet 或真实资金准入。

## 依赖关系

```text
FP-01 ─┐
FP-02 ─┼─> FP-04 -> FP-05 -> FP-06a -> FP-06b -> FP-07
FP-03 ─┘
FP-07 -> FP-08 -> Public Wallet API -> LA-06b
```

共享账务写入路径和数据库迁移按顺序合并；不要并行打开多个同时修改同一资金写边界的大 PR。

## 终点

指定产品账簿在批准范围内可以独立归属、收付、查询、重建、恢复和对账，并且代码、文档、制品与发布证据描述同一事实。达到该门槛后，才把社交钱包接入正式资金读写能力。
