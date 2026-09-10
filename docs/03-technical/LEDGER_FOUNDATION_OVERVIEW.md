# Ledger Foundation 当前能力与产品接入基线

日期：2026-09-10
状态：FP-01 current-capability baseline
整理起点：`2cb8b1259b9d590447c22321a8f1b9cf608ea9a1`

本页是当前能力入口，不替代 [`AGENTS.md`](../../AGENTS.md)、[`PROJECT.html`](../../PROJECT.html)、[`ARCHITECTURE.html`](../../ARCHITECTURE.html)、[`GOVERNANCE.html`](../../GOVERNANCE.html) 或具体版本化契约。它不授予资金执行、Sandbox/Testnet 验收、Live/Mainnet、生产迁移或发布权限。

## 1. 定位

BU2 Ledger Foundation 是多个上层业务产品共享的收付、授权、账务、恢复与证据基础，不单独作为收费产品。**社交钱包是首个上层产品方向**，但当前仍处于 Foundation 接入前收口阶段；产品不得把既有单钱包运行时路径包装成已经完成的多账户社交钱包。

Transaction-first v0.3 继续作为交易领域语义基线：授权、预留、交付、结算、退款和争议保持独立事实。它不等同于上层产品的信息架构或余额读模型。

## 2. 必须分开的四个维度

1. **服务环境**：`local / sandbox / live`。
2. **执行后端**：`simulated / x402` 或后续经批准的 Adapter。
3. **已实现能力**：Schema、命令、状态机、查询、恢复和证据代码是否存在。
4. **运行准入**：该能力是否只在 Local 验证、是否已完成真实 Sandbox/Testnet 验收、是否得到 Live 资金准入。

Simulation 不是对外 Sandbox。CI 成功、代码已合并或存在 Live 配置都不自动形成 Testnet/Live 资金授权。

## 3. 核心对象与事实所有者

| 对象 | 当前职责与边界 |
| --- | --- |
| `Account / AgentIdentity / Credential` | 法律/业务责任主体、Agent 与受限调用身份；公开昵称不是资金主键。 |
| `LedgerAccount` | `environment / tenant / book / owner / asset / network` 的账簿归属边界。 |
| `Posting.account` | 会计科目；与 `ledger_account_id`、公开钱包身份是不同概念。 |
| `Journal / FinancialPosting` | 已过账的技术账务事实；更正追加新事实，不覆盖历史。 |
| `PaymentAttempt / RefundAttempt` | 外部执行与未知结果边界；先持久化 Attempt，再进入外部执行或恢复。 |
| `Wallet / Budget / Hold` | 当前运行时约束、预留与额度事实；不是外部资产确权。 |
| `ProjectionVersion` | 从不可变 Posting 重建的派生读模型；不是第二套资金事实。 |
| Provider observation | 外部独立证据；不能直接等同于 BU2 已结算、已交付或已对账。 |
| `Receipt / AccessGrant` | 交易凭证与履约权益；二者互不替代。 |

只有 Transaction Core 可以改变核心交易状态；上层产品和只读工具均不得绕过该边界。

## 4. 当前能力矩阵

| 能力 | 当前已有 | 仍未完成 | 当前可依赖范围 |
| --- | --- | --- | --- |
| Journal / Posting | 平衡校验、已过账不可变、业务资金事实分录；FP-04 将纯计算提到内部 helper；FP-05 让新格式 settlement/collection/refund/fee/opening/correction Posting 继承可信 `ledger_account_id` | 历史未绑定事实的目标范围迁移/期初核对 | 内部账务事实 |
| LedgerAccount | Schema 16 所有权注册、Schema 17 Posting 绑定；Schema 20 将 FundingSource/ReceivingTarget 固定到 environment/tenant/owner/asset/network 一致的 LedgerAccount，并在 SQLite 层保护归属不可变 | 历史 null binding 的归属迁移与产品范围 cutover | 内部所有权边界 |
| 账户投影 | Schema 19、确定性内容哈希、显式期望版本、条件激活、可重建；FP-06a 增加只读 source watermark、source/projection hash、stale/completeness inspection；FP-06b 允许经 current Local migration plan 的目标投影刷新 | 时间型 freshness SLA、Sandbox/Live cutover | Local 受控派生读路径；**不是支付授权** |
| 运行时余额 | legacy `wallet_accounts` / `this.wallet` 仍是资金写/支出决策源；FP-06b Schema 21 以 append-only generation 在 Local 选择 `legacy_wallet` 或 WalletReadModel `available_spending_capacity` 作为读值 | 正式产品 API、真实多账户写模型、Sandbox/Live cutover | Local 受控读路径；spend decision 仍为 legacy wallet |
| 历史重放/恢复 | 只读重放、备份追加事实追平、缺口报告；FP-06b 支持 fully-bound/scoped-exclusion/reconciled-opening 迁移计划及追加 rollback generation | 实际生产数据迁移与外部环境验证 | Local 隔离迁移/恢复证据 |
| 收款/付款/退款/费用 | Local/Simulation 业务与故障路径、Attempt/对账能力；新格式业务分录已从可信 wallet binding 解析到账簿账户；FP-06a 将 reserved/pending 与账簿余额分开读取 | 历史范围迁移、正式产品 cutover 与真实 Sandbox 证据 | 不扩张到未批准通道 |
| CI | main `2cb8b125…` 的 `BU2 CI` run `34396290376` 已完成且 success | FP-02 的证据消费者收口和仓库合并门禁 | 回归证据；**不是资金授权** |
| 内部 Release | `ledger-rc-local-v0.1` 保留；FP-07 增加 Social Wallet Local RC 准备机制与 acceptance 绑定 | protected-main 条件满足后的实际新 RC artifact、独立人类批准 | 新候选仍 `prepared_not_released`，仅 Local/Simulation |

### v0.1 与当前 main 的边界

`ledger-rc-local-v0.1` 实际指向：

```text
005b3949de4672a5aae301bd9b511e47b8be89fa
```

它是 Local/Simulation 内部历史基线，不包含后续的 Schema 19 账户投影刷新或 Schema 20 可信业务归属接线。不得移动、覆盖或重打该标签来改变历史批准范围。

## 5. 为什么现在还不能把账户投影当成社交钱包余额

[`LA03D_MULTI_ACCOUNT_OWNERSHIP_CONTRACT.md`](../02-product/LA03D_MULTI_ACCOUNT_OWNERSHIP_CONTRACT.md) 已明确：运行时 `wallet.available` 尚未切换。FP-06a 只把可证明属于目标 LedgerAccount trusted business source 的未绑定 Posting 作为目标 completeness blocker；无法证明属于该目标的全库 legacy unbound Posting 只保留 `historical_scope=migration_pending / cutover_accepted=false` 警告，避免无关旧 Demo 污染 shadow，同时明确历史迁移仍未完成。

FP-05 已完成**新格式业务事实**的可信归属接线；FP-06a 已建立 WalletReadModel/shadow；FP-06b 已实现**仅 Local 的受控读路径 cutover 机制**。历史 null binding / unbound Posting 保持原样，不自动回填。社交钱包正式消费余额前，至少还需要：

- 对目标产品账簿的历史未绑定事实建立可证明归属或已核对期初，不可确定的事实继续保持 unresolved；
- 在真实目标产品范围内完成人工审查的历史归属/期初证据，并持续取得完整 shadow/reconciliation 差异证据；
- FP-07 冻结正式产品 API 与多账户体验；Sandbox/Testnet/Live cutover 仍需独立准入；
- 证明暂停账户仍可查询历史和对账，而新增支出保持失败关闭；
- 保持 Journal/Posting 与 Provider 已发生事实不可改写，不用重新付款掩盖差异。

### FP-04 / FP-05 / FP-06a / FP-06b 内部边界

`sandbox/ledger-calculations.mjs` 只负责确定性的 Posting shape、Journal 合计/平衡和 Posting → 投影计算。它不持有 SQLite handle，不开启或提交事务，不解析业务归属，不读取运行环境，也不调用 Provider。计算失败只返回稳定 violation；`Bu2Sandbox` / `SqliteLedger` 在既有兼容入口将 violation 转回原有 `ApiError` 语义。

数据库相关责任仍留在 `SqliteLedger`：账簿账户所有权/状态校验、source/event 存在性、不可变内容 fingerprint、Posting/Journal 写入，以及 Schema 19 投影版本的 `BEGIN IMMEDIATE` / `expected_active_version` 条件激活。Schema 20 的 FundingSource/ReceivingTarget 归属由服务端 onboarding 记录持有，业务请求不能任选 `ledger_account_id`；ownership 字段在 SQLite 边界不可直接改绑。新资金活动必须绑定 active LedgerAccount；账户后续暂停不会抹掉历史，也不会阻止已确认外部事实按原账户补记。Transaction Core 原事务、幂等、Outbox、provider_unknown 与退款恢复边界保持不变。

FP-06a 的 `inspectLedgerAccountProjection()` 只执行 SELECT，并以当前不可变 Posting 重算 content hash / Journal 水位 / projection rows 对照；不会调用 projection refresh、不会删除损坏派生行、不会追加 LedgerEvent。completeness scope 固定为 `trusted_bound_sources`：Domain 只把已有可信 ledger ownership 的 transaction/refund/collection/fee/opening/correction source ID 传给 inspection，相关 source 若仍有 unbound Posting 才阻断目标模型；其他全局 unbound 历史只进入 `historical_scope` 迁移警告。`wallet-posting-liquidity.v1` 的 `book_balance` 只包含明确流动性科目，`available_spending_capacity` 永远标记 `usable_for_spend=false`。仓库当前没有账户级 Provider balance observation，因此 `provider_balance` 必须返回 `not_observed/null`；交易级 reconciliation evidence 只能决定 `reconciliation_status`，不能冒充 Provider 余额。`stale` 当前只表示 source/projection 内容漂移，未定义时间型 freshness SLA。

FP-06b Schema 21 的 migration plan / assessment / generation 都是 append-only 控制事实，不是资金事实。plan `verified` 只证明 legacy source 分类、scope 与期初时间边界在机器上自洽，证据引用本身仍需人类审查。Local cutover 激活会在同一 SQLite 写事务内重验 plan、state revision、legacy wallet、fresh assessment snapshot、projection/source hash 与 generation；运行时读值选择 WalletReadModel `available_spending_capacity`，但 `spend_decision_source` 继续是 legacy wallet。active cutover 若 stale/incomplete，则读值失败关闭且不 fallback，并阻止新的 reserve 在 Adapter 前继续；rollback 追加 legacy generation。完整契约见 [`FP06B_WALLET_READ_CUTOVER_CONTRACT.md`](../02-product/FP06B_WALLET_READ_CUTOVER_CONTRACT.md) 与 [`ADR_0002_LOCAL_WALLET_READ_CUTOVER.md`](ADR_0002_LOCAL_WALLET_READ_CUTOVER.md)。

## 6. 只读盘点入口

FP-01 增加 [`scripts/ledger/ledger_inventory.py`](../../scripts/ledger/ledger_inventory.py)，只允许对**明确提供的隔离一致性 SQLite 备份**执行查询：

```bash
python3 scripts/ledger/ledger_inventory.py \
  /path/to/isolated-backup.sqlite \
  --acknowledge-isolated-copy
```

工具固定输出 `verdict=inventory_only_not_acceptance`，不会实例化 `SqliteLedger`、不会运行迁移、不会调用 Provider、不会修改源数据库，也不会授予 Release 或运行时切换权限。缺文件、缺关键表、查询不可评估或检测到同名 WAL/SHM 伴随文件时失败关闭。

**零异常计数也不等于完整历史、产品准入或账本验收。** 实际业务数据库、生产数据和 Live 运行不属于 FP-01。

## 7. 后续依赖

执行顺序见 [`FOUNDATION_PR_PLAN.md`](FOUNDATION_PR_PLAN.md)。FP-06b 已实现 Local migration/cutover 控制面，但不构成真实产品数据迁移、Sandbox/Testnet 或 Live 准入；FP-07 才进行社交钱包产品接入基线验收与新 RC。
