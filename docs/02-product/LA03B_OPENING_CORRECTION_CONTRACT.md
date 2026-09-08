# LA-03b 期初检查点与追加更正分录契约

日期：2026-09-09
维护者：Codex
风险等级：R2（账务事实、迁移边界、幂等与恢复）

## 1. 目的与范围

本 PR 是 LA-03 的第二个可审查子范围，解决“缺失历史不能伪造、但必须能从某个核对时点开始连续记账”的边界。它增加两类持久业务事实：

- `OpeningBalanceCheckpoint`：带账簿、所有者账户、资金来源、环境、资产、网络、金额、有效时点、来源引用和核对理由的期初检查点。
- `LedgerCorrection`：引用既有事件、说明理由并追加一组反向或补偿 Journal/Posting 的更正事实。

两者均复用通用 `resources` 表、事件、成组 Journal/Posting 和 SQLite 原子提交。它们不是公开 Agent 支付工具，也不直接改变当前 `wallet.available` 投影。

## 2. 期初检查点

期初检查点必须：

1. 明确 `book_id`、`account_id`、`owner_account_id`、`funding_source_id`、`environment`、`asset`、`network`。
2. 使用非负整数金额和 ISO-8601 `effective_at`。
3. 保存 `source_reference` 与 `reason`，说明核对来源和覆盖边界。
4. 生成 `ledger.opening_balance_posted` 事件及两行平衡分录：`asset.cash:{account}` / `equity.opening_balance:{checkpoint}`。
5. 不把检查点当作新的支付，不自动增加运行时钱包余额。

## 3. 更正分录

更正必须引用已存在的 `original_event_id`，并保存账簿、环境、金额、借方科目、贷方科目和理由。原事件、原 Journal 和原 Posting 不允许 UPDATE/DELETE；更正只追加 `ledger.correction_posted` 事件和两行平衡分录。相同幂等键重放返回原更正，不能产生第二组 Posting。

## 4. 不变量与恢复

- 错环境、无原事件、无效科目、相同借贷科目或非法金额失败关闭。
- 期初/更正资源、事件、Posting、Outbox 和幂等终态在同一 SQLite 原子事务中提交。
- 重启后检查点、更正和分录可重新读取；提交失败不会留下半组事实。
- 该 PR 不从历史快照推断或回填缺失分录，也不改变钱包、Budget Hold、Transaction 或 Provider 状态。

## 5. 验收与非目标

- `npm --prefix sandbox run test:la03b`：期初持久化/重启、更正引用/幂等、错误边界。
- Sandbox 全量和既有 LA-03a、LA-02、运营、契约、SDK、Prototype 门禁必须继续通过。

本 PR 不完成余额从 Journal 重建、跨账户余额投影、完整历史迁移、pending Collection 收敛、独立对账重放、真实 Provider/Testnet/Hosted/Live、托管钱包或 E3.1。余额重建与 LA-03 完整账簿准入仍需后续 PR。
