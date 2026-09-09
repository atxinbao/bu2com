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

`ledger_account_id` 必须由服务端可信的环境、租户、账簿、Account、Funding Source/Receiving Target、资产与网络关系解析。请求中的账户 ID 最多作为一致性校验，不是授权依据。新格式事实无法解析时拒绝；历史未绑定事实必须保持 unresolved，不能伪造归属。

## 4. WalletReadModel（后续 FP-06a 冻结）

当前仓库**尚未提供**下面的正式产品读模型。FP-06a 至少应定义：

- `ledger_account_id / owner_account_id / environment / asset / network`；
- `accounting_currency / asset_decimals / amount_format_version`；
- `book_balance`：明确科目范围后的账务净额，不等同于无限制可支付金额；
- `provider_balance`：外部观察值，并携带 `observed_at` 与 Provider/网络证据引用；
- `reserved / pending_outbound / available_spending_capacity`：互相分离的约束；
- `projection_id / projector_version / generation / source_sequence / projected_at / stale / completeness`；
- `reconciliation_status / execution_status / supported_operations`。

未建立、过期、存在缺口或对账不一致时必须显式返回相应状态，不以 `0`、固定 Demo 数字或旧 `this.wallet` 值伪装新模型成功。shadow 阶段的新投影不得参与新增支出决策。

## 5. 生命周期语义

账户暂停的目标是阻止新的资金权限扩大，不是抹掉历史。后续实现应区分：

| 行为 | 目标规则 |
| --- | --- |
| 新增支出/新授权 | 必须校验账户当前可执行状态，暂停时拒绝。 |
| 历史交易/余额/对账查询 | 校验读取权限；不因暂停而让历史消失。 |
| 已存在不可变事实的幂等重放 | 校验原内容一致性；不得解释成新付款。 |
| 已确认外部资金事实的受控补记 | 使用恢复权限与原执行证据；不得再次调用 Provider 付款。 |

FP-01 不修改当前 active 校验代码；该耦合作为 FP-05/FP-06 的 R2 验收项。

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

## 7. 三层准入

### G-LOCAL-INTEGRATION

目标产品账簿的本地归属、收付、读模型、恢复、重建、对账和代码/文档/Release 一致性通过后，才允许正式实现上层社交钱包资金体验。

### G-SANDBOX

独立完成真实 Base Sepolia 双向证据后，只开放对应测试网业务；Local Simulation 不计入该门槛。

### G-LIVE

继续遵守 [`PROJECT.html`](../../PROJECT.html) 既有 G-L、CapabilityGrant、租户启用、PaymentMandate 和独立 R3 授权。任何本地产品开发准入都不能替代 G-L。
