# F07 财务边界契约 v1

日期：2026-09-08
执行者：Codex
状态：D1 文档基线；后续 R2 变更适用当前 Project Owner 单人批准规则
适用范围：Phase 0 Reference Sandbox · Local / Sandbox / Base Sepolia Testnet

## 1. 目的与非目标

F07 为 BU2 的预算预留和财务记账定义稳定事实。它回答“这笔钱能不能被占用、当前还剩多少、发生了哪些财务事件”，但不回答 Agent 是否有权支付；授权边界由 F08 的版本化 Payment Mandate 提供。

本契约冻结后，F07 实现必须复用现有 Transaction Core、SQLite WAL、`wallet_accounts`、`ledger_events`、幂等 Claim、状态版本 CAS 和 Outbox 原子提交能力，不得新增第二套余额或账本实现。

本契约不包含：Payment Mandate 规则、外部支付提交、收款账户建档、退款策略、生产多节点账本、Mainnet、真实资金托管或法币清算。

## 2. 核心对象

### 2.1 Budget Scope

预算边界可以绑定到以下任一主体：`workspace`、`project`、`account` 或 `agent`。每个 Scope 具有稳定 ID、币种、周期、额度和状态；同一笔操作解析出一个有效 Scope 链，并按最严格的剩余可用额度执行。

Scope 的最小字段：

```text
budget_id       bud_...
scope_type      workspace | project | account | agent
scope_id        对应主体 ID
currency        ISO 4217 大写代码
period          lifetime | calendar_month | rolling_24h
limit_minor     非负整数，使用最小货币单位
status          active | paused | exhausted | expired
version         非负整数
```

同一 Scope、周期和币种只能有一个生效预算版本。修改额度必须创建新版本并记录原因，不得覆盖已经发生的 Hold 或 Ledger 事实。

### 2.2 Budget Hold

`BudgetHold` 是对预算或钱包可用额度的临时占用，不是结算，不代表 Provider 已付款。它必须绑定 `transaction_id`、`payment_intent_id`、Scope、金额、币种和创建它的授权事实。

```text
hold_id             hold_...
transaction_id      txn_...
budget_id           bud_...
amount              非负整数 + currency
status              active | consumed | released | expired
authorization_id    auth_...
idempotency_key     稳定资金操作幂等键
created_at          ISO-8601
released_at         可空
consumed_at         可空
```

同一 `transaction_id` 和预算 Scope 在任意时刻最多存在一个 active Hold。重复创建返回原 Hold；不同金额、币种、Scope 或载荷必须返回幂等冲突。

### 2.3 Ledger Entry / Financial Posting

`LedgerEntry` 是不可变的财务事件，`FinancialPosting` 是该事件对预算和余额投影的明确影响。F07 可以先使用一条业务事件配对一组 Posting，但不能把可变余额快照当成账本。

每条事件至少包含：

```text
event_id            evt_...
event_type          budget_hold_created | budget_hold_released |
                    budget_hold_consumed | budget_adjusted |
                    fee_posted | correction_posted
transaction_id      txn_... 或 null（预算调整可为空）
scope_id            预算 Scope
amount              非负整数 + currency
postings            追加的 debit / credit 事实
source_id           hold_id、settlement_id 或 adjustment_id
occurred_at         ISO-8601
```

Posting 只描述事实方向，不允许通过负数隐藏方向：`direction` 只能是 `debit` 或 `credit`，`account` 必须是已登记的 BU2 账务投影账户。更正必须新增 `correction_posted`，引用原 `event_id` 和理由，禁止 UPDATE 或 DELETE 历史事件。

## 3. 金额与不变量

- 所有金额使用最小货币单位整数，禁止浮点数；同一 Hold、Posting、Wallet 和 Transaction 必须携带相同币种。
- `refunded <= settled <= reserved <= authorized` 继续由 Transaction Core 维护；F07 不得用预算余额替代交易金额字段。
- 预算可用额按 `limit_minor - active_hold_total - consumed_total - committed_adjustments` 计算，不能从 UI 或缓存推导。
- `wallet.available` 与 `wallet.reserved` 必须始终非负；预算 Scope 的可用额也必须非负。
- `active_hold_total` 只能由 `active` Hold 汇总；`released` 不再占用，`consumed` 转为已发生支出。
- 预算币种不匹配、过期、暂停或余额不足均失败关闭，不得自动换算或拆分为未授权的多笔 Hold。
- 任何完成结算的 Transaction 必须能追溯到唯一有效 Hold；没有 Hold 的结算不得写入成功财务事件。

## 4. 状态机

```text
none → active → consumed
             ↘ released
             ↘ expired
```

允许的操作：

| 当前状态 | 操作 | 下一状态 | 说明 |
| --- | --- | --- | --- |
| none | create | active | 校验 Scope、币种、预算和授权事实 |
| active | consume | consumed | 结算成功后一次性消费 Hold |
| active | release | released | 拒绝、取消、交付失败或明确恢复结果 |
| active | expire | expired | 仅在有效期结束且未发生结算时 |
| consumed / released / expired | 任意资金操作 | 拒绝 | 终态不可重开或复用 |

`consume`、`release` 和 `expire` 都必须幂等。相同操作键和载荷返回第一次结果；同键不同载荷返回 `idempotency_conflict`。

## 5. 事务边界

一次 F07 变更必须在现有 `BEGIN IMMEDIATE` 事务中完成：

```text
读取并校验 Scope / Wallet / Hold
  → 条件更新 available / reserved / version
  → 写入或更新 Hold 当前投影
  → 追加 LedgerEvent 与 FinancialPosting
  → 写入 Transaction / Resource 快照
  → 写入 Webhook Outbox
  → 写入 idempotency succeeded 终态
  → state_revision + 1
  → COMMIT
```

任一步失败全部回滚。不能出现“余额已扣但 Hold 未写入”“Ledger 已写但业务状态未提交”或“Outbox 先于财务事实”的部分成功。

外部 Adapter 调用不得持有 SQLite 写锁。外部结果未知时，Hold 保持 `active`，禁止自动 `consume`、`release` 或重新付款；必须走既有查询/对账恢复路径。

## 6. 并发与幂等

F07 实现必须覆盖：

1. 两个并发请求不能从同一 Scope 的剩余额度成功创建超过额度的 Hold。
2. 同一 Transaction 并发创建 Hold 只产生一个 Hold、一个预算事件和一个 Outbox 事实。
3. 同一 Hold 并发消费或释放只能有一个状态转换成功。
4. 陈旧的 `state_revision` 或 Wallet version 必须返回冲突并重新读取，禁止用旧快照覆盖新余额。
5. 重启后遗留 `processing` Claim 返回 `idempotency_outcome_unknown`，不能自动重放资金动作。

幂等作用域建议固定为：

```text
budget-holds:{transaction_id}:{budget_id}
budget-holds/{hold_id}:consume
budget-holds/{hold_id}:release
budget-adjustments:{adjustment_id}
```

## 7. 预算层级与解释

一次付款请求必须返回可解释的预算评估：命中的 Scope、周期、额度、已占用、此次 Hold、评估后剩余、版本和拒绝原因。多个 Scope 同时生效时，响应必须列出全部约束，不能只展示最宽松的一层。

F07 不新增人工审批。`review_required`、`denied` 和 `allowed` 仍由 Payment Mandate / Policy 决定；F07 只在允许的资金动作进入时执行额度和账务约束。

## 8. 对账与恢复

必须可以从追加 LedgerEvent 重建：

- 每个 Budget Scope 的当前额度和 active Hold 总额；
- 每个 Wallet 的 available、reserved 与版本；
- 每个 Transaction 的授权、预留、结算、退款和关联 Hold；
- 每个 Posting 的来源、方向、币种和累计结果。

对账发现差异时只能追加更正事件并暂停受影响 Scope 的自动资金动作。不得删除历史、直接修改余额绕过 Ledger、或以新的幂等键掩盖未知结果。

## 9. Schema 与 API 约束

D1 只冻结契约，不引入迁移。F07 实现阶段优先追加表和索引，禁止删除或重命名现有 `wallet_accounts`、`ledger_events`、`idempotency_claims`、`resources` 和 `webhook_outbox`。

预计新增资源：`Budget`、`BudgetHold`、`FinancialPosting`。具体 HTTP/MCP 路径必须在 F07 代码 PR 中随 OpenAPI、MCP、Schema、SDK 和测试一起提交；任何新路径必须带 `Idempotency-Key`、`X-Trace-Id` 和环境契约校验。

## 10. 验收门槛

- 正常创建、消费、释放和过期 Hold 的结果可查询且可解释。
- 预算不足、币种错误、过期 Scope、暂停 Scope 和无授权来源均失败关闭。
- 并发、重复请求、重启和故障注入不产生负余额、重复 Hold、重复 Posting 或孤立 Outbox。
- 从 LedgerEvent 重建的预算余额与当前投影一致。
- Transaction Detail 能从授权追踪到 Hold、Ledger、Posting、结算和 Receipt。
- Local / Sandbox / Base Sepolia Testnet 的执行边界继续可见；Live/Mainnet、托管和生产凭证保持关闭。

F07 通过 D1 后才允许开始代码实现；代码 PR 必须标记 R2。当前单人治理阶段由 Project Owner 明确兼任 Domain 与 Architecture 角色并作出人工批准，AI 不得自批。

## 11. 明确不变的边界

- F08 仍是唯一的 Payment Mandate 版本化授权来源。
- F09a/F09b 才负责自主支付执行与未知结果恢复。
- F10/F11 才负责收款与入账，不在 F07 中提前实现。
- x402、AP2、Mainnet、真实资金、托管钱包和生产部署不因 D1 解冻。
