# LA-03c 账务投影重建契约

日期：2026-09-09
维护者：Codex
风险等级：R2（账务重建、金额聚合、历史解释）

## 1. 目的与范围

LA-03c 增加一个只读的 `rebuildLedgerProjection()`，从持久化不可变 Financial Posting 重建按账户、币种的余额投影，并逐 Journal 检查借贷平衡。它用于审计、重启恢复和后续对账，不替换当前运行时钱包投影，也不触发任何资金动作。

## 2. 重建规则

- Debit 记为正、Credit 记为负；金额只使用安全整数最小货币单位。
- 可按币种过滤；结果返回账户余额、Posting 数、Journal 数和不平衡 Journal 数。
- 期初检查点、结算、收款、退款、ProviderFee 和更正均通过其已持久化 Posting 进入同一重建路径。
- 结果按账户和币种确定性排序，可在 SQLite 重启后重新生成并比较。
- 任何安全整数溢出失败关闭；重建不修改资源、余额、事件、Posting 或 Outbox。

## 3. 验收与非目标

- `npm --prefix sandbox run test:la03b`：期初、追加更正、重启恢复和重建投影 4/4。
- Sandbox 全量及既有 LA-03a、LA-02、运营、契约、SDK、Prototype 门禁必须继续通过。

本 PR 不完成跨账簿/跨资产所有权模型、外部 Provider 对账、pending Collection 收敛、备份后追平、实时余额切换或生产财务结算。重建结果仍是审计投影，不能被解释为 Live/Mainnet 或 Hosted 放行。
