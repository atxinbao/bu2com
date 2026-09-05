# BU2 交易链路可观测性与处置手册 v0.1

日期：2026-09-05
执行者：Codex
适用范围：Phase 0 · Simulation / Base Sepolia Testnet

## 1. 目标

本手册用于从一个外部 Agent 请求追踪到 BU2 交易、账本事件、支付 Adapter 和 Webhook 投递，并为死信、支付结果未知和 Receipt 验证失败给出确定的本地处置步骤。

E1.2 只增加观测和处置契约，不开放 Mainnet、托管、生产密钥或自动资金恢复。

## 2. 关联字段

| 字段 | 含义 | 首要查询位置 |
| --- | --- | --- |
| `request_id` | 单次 BU2 HTTP 请求 | 响应头、错误体、结构化日志 |
| `trace_id` | 一次外部 Agent 执行或跨请求业务链路 | `X-Trace-Id`、结构化日志、账本与 Outbox |
| `transaction_id` | 授权后的交易容器 | Transaction API、Adapter 操作、事件 |
| `event_id` | 不可变业务事件 | LedgerEvent、Outbox、Webhook `webhook-id` |
| `provider_reference` | 支付通道返回的外部结果引用 | Adapter 操作、Transaction、LedgerEvent |

调用方可以传入 `X-Trace-Id: trc_<identifier>`。BU2 始终生成新的 `X-Request-Id`，并在未提供合法 Trace ID 时生成 `X-Trace-Id`。Webhook 的 `webhook-trace-id` 保留原事件 Trace；投递动作自身的 Trace 单独写入投递审计。

## 3. 健康快照

`GET /health` 返回：

- `webhook_outbox.pending`：尚未领取的投递；
- `webhook_outbox.retrying`：等待下次尝试的投递；
- `webhook_outbox.dead_letter`：已停止自动重试的投递；
- `webhook_outbox.last_successful_delivery_at`：最近成功投递时间；
- `adapter_operations.unknown_results`：支付通道结果未知的操作数；
- `operational_status`：存在死信或未知结果时为 `attention_required`。

这些是本地运行快照，不代表生产监控或资金对账完成。

## 4. 结构化事件

Reference Server 启动后向标准输出写入单行 JSON。`category` 固定为：

- `request`：HTTP 开始与完成；
- `validation`：请求体、路径、分页、幂等键或 Trace ID 不合法；
- `policy`：PaymentMandate 判断；
- `state`：允许或拒绝的状态转换、Receipt 验证成功；
- `adapter`：支付通道明确成功、明确失败或幂等重放；
- `unknown_result`：通道结果无法确认；
- `webhook`：投递成功、重试或死信；
- `internal`：未分类异常和 Receipt 验证失败。

日志不得包含 Webhook Secret、Authorization、Cookie、Token、助记词、私钥或 Receipt 签名；相关字段和值在写出前被替换为 `[REDACTED]`。

## 5. 告警条件

| 条件 | 级别 | 第一动作 | 自动资金动作 |
| --- | --- | --- | --- |
| `dead_letter > 0` 持续 5 分钟 | Warning | 按 Outbox ID 检查最后一次错误和接收方状态 | 无 |
| `dead_letter >= 10` 或持续 30 分钟 | Critical | 停止继续扩大投递量，逐项确认接收方后审计重放 | 无 |
| `unknown_results > 0` | Critical | 停止该 Transaction 的自动资金重试，查询 provider reference 并对账 | 禁止自动重付、释放预留或签发 Receipt |
| 任一 `receipt.verification_failed` | Critical | 隔离该 Receipt，按 Transaction 与 LedgerEvent 重建验证输入 | 禁止把 Receipt 标记为有效 |
| `retrying >= 100` 或最老重试超过 15 分钟 | Warning | 检查接收方 5xx、超时、网络和签名版本 | 无 |

Phase 0 仅实现健康指标和结构化事实；外部告警系统接线属于部署工作，不在 E1.2 内伪装完成。

## 6. 处置流程

### 6.1 Webhook 死信

1. 用 `GET /v1/webhook_dead_letters` 找到 `outbox_id`、`event_id` 和最后错误。
2. 用 `GET /v1/webhook_outbox/{outbox_id}/attempts` 检查每次 HTTP 状态、Trace 和 Secret 版本。
3. 根据 `event_id` 在 `GET /v1/ledger` 确认原事件未变化。
4. 接收方恢复后，使用新的 `Idempotency-Key` 调用 `POST /v1/webhook_outbox/{outbox_id}/replays`。
5. 确认重放沿用原 `event_id`，且账本事件数量不增加。

### 6.2 Adapter 结果未知

1. 以 `transaction_id` 查询 Adapter 操作和 provider reference。
2. 禁止用新幂等键重新付款；保留内部预留和当前交易状态。
3. 通过通道查询、回调或链上交易引用确认最终结果。
4. 只有得到确定 provider 事实后才允许进入前向恢复；E1.3 将实现 x402 专项回归和恢复查询。

### 6.3 Receipt 验证失败

1. 记录 `request_id`、`trace_id`、`receipt_id` 和 `transaction_id`。
2. 比对 Receipt 载荷、LedgerEvent、DeliveryEvidence 与 Settlement，不修改历史记录。
3. 检查验证键 ID、签名算法和序列化输入是否一致。
4. 原因未确定前，该 Receipt 不得用于确认交付或对外结算事实。

## 7. 恢复与回退

- 可停止 Reference Server 或 Webhook Dispatcher，数据库中的追加事件、Outbox、尝试记录和关联 ID 保留。
- Schema v3 仅增加可空列；旧 SQLite 记录升级后关联字段为 `null`，仍可读取。
- 日志或健康指标异常时采用前向修复，不删除或改写 LedgerEvent。
- x402 Testnet 异常可切回 Simulated Adapter；不得把 Testnet 证据解释为 Mainnet 或生产能力。

## 8. 本地验证

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
curl -s http://127.0.0.1:3101/health
```

自动化测试覆盖并发 Trace 隔离、敏感值脱敏、请求/交易/Adapter/Outbox/Webhook 关联、非法 Trace 拒绝、健康快照和旧数据库 additive migration。
