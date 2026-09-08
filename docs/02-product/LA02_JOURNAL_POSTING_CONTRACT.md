# LA-02 成组 Journal / Posting 保护契约

日期：2026-09-09
维护者：Codex
风险等级：R2（账务状态、金额、数据库迁移）

## 目标

LA-02 是 Ledger Assurance Gate 的第二项整改。本 PR 只建立统一的已过账 Journal/Posting 写入边界，不声称已经完成付款、收款、退款、费用和预算的完整业务分录覆盖；完整覆盖留给 LA-03。

## 规则

- 每组 Posting 必须关联同一个 `event_id`、`event_type`、`source_id` 和币种。
- 每组必须同时包含 debit 与 credit，且每个币种的借贷合计相等。
- 金额必须是非负安全整数；SQLite 层额外拒绝 REAL/浮点金额。
- `source_id` 必须已经属于 BU2 持久资源、Budget Hold 或 RefundAttempt；孤立分录拒绝写入。
- Journal 以事件 ID 唯一；同 ID 同内容重放可复用，内容漂移产生冲突。
- 已过账 Journal 与 Posting 只能追加，数据库直接 UPDATE/DELETE 失败；更正必须由后续补偿分录表达。
- 现有 `financial_postings` API 保持读取兼容，但所有领域快照写入都经过同一组平衡校验入口。

## 持久化

SQLite Schema v15 新增 `journal_headers`，并为 `financial_postings` 增加 `journal_id`。迁移会为既有 Posting 建立兼容性 Journal 引用；不会伪造缺失的历史业务分录。数据库触发器保护已过账事实，应用层在同一事务中校验组平衡、来源和不可变内容。

## 验收

```bash
npm --prefix sandbox run test:la02
```

覆盖：平衡 Journal 写入、同 ID 内容漂移、借贷不平衡、浮点金额、孤立 Posting、已过账 UPDATE/DELETE，以及超出安全整数的业务输入。

## 边界

本契约不完成完整账户科目表、资金来源归属、多账户投影、预算周期、历史重放、外部 Provider 对账或真实 Sandbox/Testnet 资金执行。E3.1 Pilot Manifest 继续暂停；Live/Mainnet 和托管能力继续关闭。
