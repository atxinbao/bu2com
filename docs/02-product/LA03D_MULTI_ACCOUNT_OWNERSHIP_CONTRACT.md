# LA-03d 多账户账簿所有权与余额投影契约

日期：2026-09-10
维护者：Codex  
文档风险等级：R0（冻结后续实现边界；实现 PR 仍按 R2 审查）

## 1. 目的

LA-03a～LA-03c 已经把业务资金事实写入受保护的 Journal/Posting，并提供了只读的单账户投影重建。审计仍指出：多账户/资金来源归属、实时余额投影切换和完整历史迁移尚未完成。本契约冻结下一阶段的可审查边界，不把当前单钱包快照解释为多账户账簿。

## 2. 账簿所有权维度

后续实现必须为每个可过账账簿账户固定以下维度：

- `environment`：只能是当前运行环境；Local、Sandbox 与 Live 不可交叉引用。
- `tenant_id`：账户所属租户，不能从请求方隐式推导。
- `book_id`：账簿标识；同一租户可以拥有多个账簿。
- `owner_account_id`：业务主体的稳定 Account ID；不得用 Agent ID 替代所有权主体。
- `asset` / `network`：资产和网络必须成对固定，不能把不同网络的同名资产合并。
- `status`：`active`、`suspended` 或 `retired`；退休账户不可产生新的资金效果。
- `version`：所有权或状态变更使用条件更新，冲突必须失败关闭。

同一环境、租户、账簿、所有者、资产和网络组合只能对应一个稳定的账簿账户。Funding Source、Receiving Target、PaymentMandate、Budget Hold 和 Financial Posting 引用的所有权维度必须能够解析到该账户；无法解析时拒绝过账。

## 3. 余额投影规则

- Journal/Posting 是唯一资金事实；余额投影是可删除、可重建的派生读模型。
- 投影键至少包含 `ledger_account_id`、`asset`、`network` 和 `currency`，不得只使用全局 wallet ID。
- Debit/credit 的符号规则与 LA-03c 保持一致；每个 Journal 仍必须逐币种借贷相等。
- 投影刷新必须在独立事务中完成：先生成新版本，再以条件版本切换活动版本；切换失败不影响既有投影。
- 投影重建必须是幂等的；相同期初检查点和 Posting 集合必须产生相同余额、Journal 数和缺口结果。
- 任何未归属、跨租户或跨网络 Posting 都产生确定性缺口并阻止运行时投影切换。

## 4. 历史迁移边界

- 不更新、不覆盖、不补造既有 Receipt、Ledger Event、Journal 或 Financial Posting。
- 迁移只能追加版本化归属事实和迁移报告；旧事实无法确定归属时必须标记 `unresolved`。
- 只要存在未解决的历史归属、资产/网络冲突或 Journal 不平衡，运行时余额投影不得切换到新模型。
- 迁移完成必须提供逐账户、逐资产/网络的期初余额、Posting 数、Journal 平衡和缺口清单，且可在隔离 SQLite 备份上重复验证。
- LA-03d 不执行 Provider 查询、自动补款、退款重放、Base Sepolia 双向付款或 Live/Mainnet 操作。

## 5. 验收不变量

后续实现 PR 至少应证明：

1. 两个租户或两个 Account 的 Posting 不会出现在同一余额投影中。
2. 同一账簿账户的重复创建、状态变更和投影切换具有幂等或条件版本冲突语义。
3. 未绑定账簿账户的 Posting、跨网络资产和退休账户过账均被拒绝。
4. 删除投影表后，可仅依靠不可变 Posting 与已核对期初检查点重建相同结果。
5. 模拟并发刷新时最多一个版本成为活动投影，失败方不会产生部分余额。
6. 任一迁移缺口会保持 `cutover=blocked`，不会被报告为完整 Ledger Assurance Gate。

## 6. 非目标与顺序

本契约的实现按“Schema/归属约束 → 写入原语与投影刷新 → 隔离历史迁移与运行时切换证据”拆分，并分别通过 R2 Domain 与 Architecture 审查。LA-06b 的真实 Hosted/Base Sepolia 双向证据、E3.1、Live/Mainnet、托管和生产资金路径继续关闭。

### 实现状态

Schema/归属约束子范围已增加 `ledger_accounts` Schema 16、唯一所有权元组、幂等注册、隔离查询和条件版本状态转换。第二实现子范围增加 Schema 17 `financial_postings.ledger_account_id`、活跃账簿账户绑定校验和按账簿账户重建只读投影；未绑定的历史 Posting 仍保留为兼容状态。

第三实现子范围增加 Schema 19 `ledger_projection_versions` 与 `ledger_projection_balances`。刷新以账簿账户、资产/网络和币种为边界，在同一个 `BEGIN IMMEDIATE` 事务内读取不可变 Posting、生成确定性内容哈希、写入新版本并按 `expected_active_version` 条件激活；相同内容幂等复用活动版本，失败或并发冲突整体回滚。未绑定 Posting、非 active 账户、错环境或不平衡结果阻止激活。投影表仍是可删除、可重建的派生数据，不产生新的资金事实。

第四实现子范围 FP-05 增加 Schema 20：FundingSource/ReceivingTarget 保存可信 `ledger_account_id`，onboarding 校验 environment、tenant、owner Account、asset/network 完整匹配并在 DB 层阻止 ownership 改绑；新业务 settlement、collection、refund、ProviderFee、opening/correction Posting 从受信业务快照继承归属。新资金活动要求 active 账户，历史读取与已确认事实补记允许原账户处于 suspended；历史 null/unbound 事实不更新、不伪造归属。

第五实现子范围 FP-06a 不新增 Schema：在活动 Schema 19 projection 与 Schema 20 ownership 上增加只读 `wallet-read-model.v1` / `wallet-shadow.v1`。模型冻结 liquidity 科目映射、minor-unit 格式、账户/币种 Journal 水位、source/projection hash、generation、stale/completeness、reserved/pending、对账状态和 shadow 差异；completeness 只对 `trusted_bound_sources` 失败关闭，目标 source 的 unbound Posting 与未绑定/异常 pending 必须阻断，而无法归属到目标账户的全局 legacy unbound 只标记历史迁移 pending/cutover=false。缺账户级 Provider balance observation 时明确返回 `not_observed`。读取允许 suspended 账户，但候选可支出能力固定 `usable_for_spend=false`，shadow 固定 `decision_use=forbidden`，且调用前后 Wallet、Posting、LedgerEvent、projection version/rows 必须不变。

以上实现不切换运行时 `wallet.available`，不执行历史归属迁移或运行时 cutover。剩余隔离历史迁移/期初核对与切换证据必须由 FP-06b 独立取证。
