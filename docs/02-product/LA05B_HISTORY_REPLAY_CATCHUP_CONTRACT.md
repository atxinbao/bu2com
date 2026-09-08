# LA-05b 历史账务重放与备份追平契约 v1

日期：2026-09-09
执行者：Codex
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

LA-05b 在 LA-05a 外部观察和 LA-03c 只读投影之上，提供从经核对的期初检查点与不可变 Financial Posting 重放历史账务的审计报告，并比较已验证 SQLite 备份与当前追加事实，生成可审查的追平清单。

该能力只读，不把重放结果写回 Wallet、Transaction、Budget、Collection、Refund、Posting 或 Receipt；也不把追平清单自动应用到恢复库。任何 Provider、链上 RPC、支付、退款和签名调用都保持关闭。LA-05b 仍只在 Local / Simulation 验收，不代表 Hosted、Base Sepolia、Live/Mainnet 或生产财务准入。

## 2. 历史重放

`replayLedgerHistory({ as_of, currency })` 读取：

- `OpeningBalanceCheckpoint` 作为明确的历史边界；
- `Journal/Posting` 的不可变金额、科目、币种和事件引用；
- `ledger.opening_balance_posted`、`ledger.correction_posted`、结算、收款、退款和费用事实事件。

结果按时间点生成账户余额与 Journal 平衡报告，并返回 `complete` 或 `incomplete`。没有期初检查点、财务事件缺少 Posting、或 Posting 缺少 LedgerEvent 时，结果必须带稳定缺口码，不能伪造历史分录或把报告标记为完整。

## 3. 备份后追平

经验证备份实例可导出版本化 `la05b.v1` replay evidence。当前数据库使用 `catchUpLedgerFromBackup({ baseline })` 比较：

- 备份中已有的事件和 Posting 是否仍存在且内容未改变；
- 备份中已有的 OpeningBalanceCheckpoint 是否仍存在且内容未改变；
- 当前库新增了哪些事件和 Posting；
- 重放后的账务是否仍为 complete。

状态含义：

- `caught_up`：没有新增事实；
- `catch_up_required`：只发现追加事实，可供人工/受控流程审查；
- `blocked`：基线事实缺失或内容漂移，必须停止恢复。

追平结果明确 `automatic_provider_replay=false`。LA-05b 不会把追加事实自动写入备份，也不会重新提交任何支付或退款。

## 4. 持久化与恢复

重放使用现有 SQLite resources、`ledger_events`、`financial_postings` 和 Online Backup，不新增第二套账本。重启后同一数据库可重取相同历史事实；备份基线的导出只去除派生的 `journal_id`，不改变 Posting 的经济字段。

## 5. 验收标准

- [x] 期初检查点与追加更正可在指定时间点重放，余额和 Journal 平衡可重复生成。
- [x] 缺少历史 Posting 时报告 `financial_event_without_posting`，不补造分录。
- [x] 验证 SQLite 备份后的新增事实可生成 `catch_up_required` 追平清单。
- [x] 备份基线事实漂移进入 `blocked`，不继续追平。
- [x] SQLite 重启后重放结果保持一致，且不调用 Provider 或重新付款。
- [x] F14/LA-05a 对账、Operations 备份/恢复与既有全量门禁继续通过。
- [ ] LA-06 全量跨租户/属性/故障测试与真实 Sandbox 双向证据仍未开始。
