# 社交钱包与 Ledger Foundation 接入边界

日期：2026-09-10
状态：FP-01 integration boundary；**不是已经存在的 API 或资金准入**

本文件定义首个上层产品“社交钱包”可以依赖什么、不得绕过什么，以及在正式产品实现前必须通过哪些 Foundation 门槛。交易领域语义继续服从 [`P0_TRANSACTION_FIRST_BASELINE.md`](P0_TRANSACTION_FIRST_BASELINE.md) 与上位治理文件。

## 1. 产品与 Foundation 的职责

社交钱包负责 Agent 主页、公开昵称、关注关系、作品/服务展示和产品交互。Ledger Foundation 负责稳定身份归属、PaymentMandate、收付、账务、恢复、对账与证据。

- 用户名、头像、关注关系都不是账簿主键，也不是支付授权。
- UI 中的“确认支付”不能替代 PaymentMandate、确定性策略或 Transaction Core 状态机。
- 产品不能保存第二份“真实余额”，也不能把 Provider 观察值直接标记成 BU2 已结算余额。
- 支持/打赏、购买服务、订阅具有不同履约与退款语义；未批准的业务类型必须通过 capability 明确拒绝。

## 2. 稳定主键与业务上下文

公开产品身份可以变化，但经济操作最终必须能关联：

```text
owner_account_id
ledger_account_id
environment
asset / network
currency
mandate_version
stable business id
```

`product_id`、帖子 ID、会话 ID 或 `external_context_id` 只用于业务归因与权限上下文，不创建新的资金所有权或余额事实。

## 3. 可信资金写入

产品只能调用有界领域命令，例如：创建应收、提出 PaymentIntent、执行已授权付款、申请有界退款、提交交付/权益事实或显式恢复。命令最终进入现有 Transaction Core；产品不获得以下能力：

- 任意 INSERT/UPDATE Journal、Posting、Wallet、Projection 或 Provider 状态；
- 直接调用 Signer 或广播交易；
- 通过请求参数选择任意同环境 `ledger_account_id` 来扩大权限；
- 在失败或数据缺口时降级成 simulated success。

`ledger_account_id` 必须由服务端可信的环境、租户、账簿、Account、Funding Source/Receiving Target、资产与网络关系解析。Schema 20 已把该 ID 固定进受信 FundingSource/ReceivingTarget onboarding 记录，并在持久化时校验 environment、tenant、owner Account、asset/network 与 active LedgerAccount 一致；ownership 字段不可通过后续 SQLite UPDATE 偷换。产品请求仍不能任选该 ID。新格式事实无法解析时拒绝；历史 null binding / 未绑定 Posting 保持可读但不能用于新的资金活动，也不能伪造归属。

## 4. WalletReadModel（FP-06a shadow 契约）

FP-06a 已提供内部 `wallet-read-model.v1`，但它仍是**shadow-only** 读模型，不是已经切换的产品余额 API。模型定义：

- `ledger_account_id / owner_account_id / environment / asset / network`；
- `accounting_currency / asset_decimals / amount_format_version`；
- `book_balance`：`wallet-posting-liquidity.v1` 只汇总 `asset.cash* / cash.wallet:* / cash.receiving_target:* / cash.account:*`，不把整个双式账簿净和当余额；
- `provider_balance`：只有账户级 Provider balance observation 才能填写；当前 Foundation 没有该事实时固定 `not_observed/null`，交易级 reconciliation amount 不能替代；
- `reserved / pending_outbound / available_spending_capacity`：互相分离的约束；
- `projection_id / projector_version / generation / source_sequence / projected_at / stale / completeness`；其中 `source_sequence` 是账簿账户+币种范围内不可变 Journal 数水位，同时携带 source/projection content hash；
- `reconciliation_status / execution_status / supported_operations`。

活动 projection 缺失、源内容变化、派生行漂移、目标 trusted business source 仍有未绑定 Posting、不平衡 Journal、未绑定或异常 pending transaction 必须显式进入 stale/completeness blocker，不以 `0`、固定 Demo 数字或旧 `this.wallet` 值伪装成功。completeness scope 固定为 `trusted_bound_sources`；无法证明属于目标账户的全库 legacy unbound Posting 不得被强行归属，也不得让无关旧 Demo 永久阻断目标 shadow，而是单独返回 `historical_scope=migration_pending`、`cutover_accepted=false`，交给 FP-06b。当前 `stale` 只表示 source/projection 内容漂移，尚未冻结时间型 freshness SLA。`available_spending_capacity.usable_for_spend=false`、`decision_use=forbidden`；shadow comparison 只把 legacy `this.wallet` 标为 `global_single_wallet` 后报告差异，绝不进入新增支出决策。

### FP-06b Local cutover

FP-06b 增加 `wallet-runtime-view.v1`，只允许 Local、明确 LedgerAccount+币种 scope。目标历史必须先建立机器可校验的 migration plan；`verified` 只表示 source 分类完整、scope/期初条件成立与证据引用存在，不代表证据已被 AI 或机器独立证明。cutover assessment 还要求 shadow matched、无 in-flight reserved/pending、目标对账满足、projection 非 stale/complete，并在激活事务中再次比较 state/wallet/snapshot/projection/generation。

激活后 `read_balance` 使用 `available_spending_capacity`，但 `spend_decision_source=legacy_wallet`：Transaction Core 仍用既有 wallet 进行授权后预留、结算和退款。读模型 stale 时不会退回旧数值，而是 blocked/null；匹配该账簿的新 reserve 也在 Provider/Adapter 前失败关闭。rollback 通过追加更高 generation 恢复 legacy 读路径，不修改旧 generation 或资金历史。

FP-07 进一步要求 active cutover 在每次读取持续保持 shadow equivalence；legacy `wallet.reserved` 与候选比较时使用 `reserved + pending_outbound` 的等价暴露。若会计事实（例如 buyer-side ProviderFee）已经改变候选可用能力、但 legacy spend-decision wallet 未同步表达该语义，则必须 `wallet_shadow_mismatch` 并停止新 reserve，不能只刷新 projection 后继续使用。当前 buyer-side Payment/Refund ProviderFee 的支出语义未获产品准入。

## 5. 生命周期语义

账户暂停的目标是阻止新的资金权限扩大，不是抹掉历史。FP-05 已按以下规则分离新执行与历史/恢复：

| 行为 | 目标规则 |
| --- | --- |
| 新增支出/新授权 | 必须校验账户当前可执行状态，暂停时拒绝。 |
| 历史交易/余额/对账查询 | 校验读取权限；不因暂停而让历史消失。 |
| 已存在不可变事实的幂等重放 | 校验原内容一致性；不得解释成新付款。 |
| 已确认外部资金事实的受控补记 | 使用恢复权限与原执行证据；不得再次调用 Provider 付款。 |

FP-05 已把 active 校验放在新资金活动的可信 binding 解析处；最终原子落账只要求快照中的 LedgerAccount 仍存在，因此账户在预留后被暂停时，已确认 settlement/refund/collection 等事实仍能按原归属记录。FP-06b 进一步保证已切换读路径不健康时只停止**新的 reserve**，不会抹掉或重放已确认事实。

## 6. 产品实现前的集成门槛

在隔离 Local 数据库、明确的假 Provider/Simulated Adapter 下，至少证明两个独立 Account 的完整流程：

```text
身份/绑定
→ 可核对期初
→ 收款
→ 付款
→ 部分退款
→ ProviderFee
→ 对账
→ 停机/SQLite 重启恢复
→ 投影删除重建
→ 跨账户/错资产/错网络拒绝
```

还必须满足：

- 自动正常路径不依赖 Operator 逐笔批准来伪装 Agent 自主性；
- 同一金额不能同时在旧 wallet 与新 projection 各成为一次可支配资金；
- 目标产品账簿的未绑定、不平衡或未知事实不能被过滤掉；
- 无关旧 Demo 数据可以隔离只读，不要求为了产品开发先全量迁移；
- LA-06b 如果尚未执行，必须继续标记 `not_executed`，不得用 Local 结果替代。

FP-07 的机器化实现与 RC 边界见 [`FP07_SOCIAL_WALLET_BASELINE_CONTRACT.md`](FP07_SOCIAL_WALLET_BASELINE_CONTRACT.md)。

## 7. 三层准入

### G-LOCAL-INTEGRATION

目标产品账簿的本地归属、收付、读模型、恢复、重建、对账和代码/文档/Release 一致性通过后，才允许正式实现上层社交钱包资金体验。

### G-SANDBOX

独立完成真实 Base Sepolia 双向证据后，只开放对应测试网业务；Local Simulation 不计入该门槛。

### G-LIVE

继续遵守 [`PROJECT.html`](../../PROJECT.html) 既有 G-L、CapabilityGrant、租户启用、PaymentMandate 和独立 R3 授权。任何本地产品开发准入都不能替代 G-L。
