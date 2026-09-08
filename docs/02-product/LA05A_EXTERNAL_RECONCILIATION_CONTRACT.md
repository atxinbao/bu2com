# LA-05a 外部观察对账契约 v1

日期：2026-09-09
执行者：Codex
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

LA-05a 在 F14 的内部事实快照之上增加“独立外部观察”输入。一次对账可以把持久化 Payment、Collection、Refund、ProviderFee 与外部读取器提供的观察事实逐项比对，保留未决队列、金额/币种/Provider Reference 异常和无法归属的外部事实。

本 PR 只在 Local / Simulation 边界验收。它不查询真实 Provider，不签名、不发起支付或退款，不改变 Transaction、Collection、Refund、Wallet、FinancialPosting 或历史 LedgerEvent，也不开放 Hosted、Base Sepolia、Live/Mainnet、托管或生产凭证。

LA-05a 不实现历史事件重放、备份后追平、实时余额切换或完整多账簿迁移；这些内容属于后续 [LA-05b](LA05B_HISTORY_REPLAY_CATCHUP_CONTRACT.md)，不能用本 PR 的外部观察输入替代。

## 2. 外部观察事实

`ReconciliationObservation` 是一次独立读取器提交的不可变快照，至少包含：

- `kind`：`payment`、`collection`、`refund` 或 `fee`；
- `provider` 与 `provider_reference`；
- 整数最小货币单位的 `amount`；
- 可选的 `source_id`、`status`（`verified`、`pending`、`unknown`）和 `observed_at`。

带 `source_id` 时按本地事实 ID 匹配，否则按同类事实的 Provider Reference 匹配。相同事实只能消费一条外部观察；多余观察会进入 `external_fact_unmatched` 未归属队列。

## 3. 确定性判定

- 本地 `delivery_submitted`、`settled`、`refunded` Payment 都进入对账；前者以预留金额作为预期金额，防止未完成交付从队列消失。
- 缺少外部观察的本地事实为 `unknown`，问题码为 `external_observation_missing`。
- 外部观察为 `pending` 或 `unknown` 时，本地项为 `unknown`，问题码为 `external_observation_unknown`。
- 金额、币种或既有 Provider Reference 不一致时，本地项为 `exception`，问题码为 `external_observation_mismatch`。
- 本地事实仍未知但外部观察已 verified 时，追加 `local_fact_unknown`，不得推断本地事实已完成。
- 无法匹配本地事实的外部观察作为 `kind=external`、`status=unknown` 的队列项，问题码为 `external_fact_unmatched`。
- `ReconciliationRun.mode` 明确为 `internal` 或 `external`；外部运行仍只生成追加快照，不修正原始事实。

## 4. API 与持久化

`POST /v1/reconciliations` 的 `observations` 为可选数组，最多 1000 条；省略时保持 F14 的内部对账行为。HTTP、OpenAPI、Access Contract 与 TypeScript SDK 继续复用 F14 的资源。

对账运行与外部观察证据随 SQLite `resources` 快照、LedgerEvent、Outbox 和幂等 Claim 原子提交。相同幂等键和请求体返回相同运行；请求体漂移失败关闭。重启后可以重新读取 `mode`、观察证据和未决队列，但不会自动重新查询 Provider 或重新付款。

## 5. 验收标准

- [x] 外部金额不匹配进入 `exception`，保留实际观察金额和问题码。
- [x] 未完成交付的 Payment 与无法归属的外部事实同时进入 `unknown` 队列。
- [x] 外部对账运行在 SQLite 重启后保留模式和观察证据。
- [x] F14 内部对账、ProviderFee 和既有事实行为保持回归通过。
- [x] 不增加真实 Provider、Base Sepolia、Hosted、Live/Mainnet 或托管能力。
- [ ] LA-05b 历史重放、备份后追平、完整历史迁移和实时余额切换仍未实现。
