# BU2 Persistence、Webhook 与 Adapter v0.2

日期：2026-09-01  
执行者：Codex

## 1. 持久化追加账本

Reference Server 使用 SQLite WAL 模式保存资源快照和不可变事件。

核心表：

- `resources`：Quote、PaymentIntent、Transaction、Delivery 和 Receipt 当前快照。
- `ledger_events`：按自增 sequence 追加的不可覆盖业务事件。
- `idempotency_records`：请求指纹和第一次响应。
- `sandbox_state`：演示钱包与已确认商户状态。
- `adapter_operations`：支付 Adapter 的资金操作和提供商引用。
- `webhook_outbox`：待投递、重试和已交付事件。

进程重启后必须恢复资源、钱包、幂等结果、账本顺序、Adapter 操作和 Receipt 验证能力。

## 2. Webhook Outbox

业务事件写入 `ledger_events` 时，同步为每个有效订阅创建唯一 Outbox 行：

```text
UNIQUE(event_id, subscription_id)
```

投递头：

```text
webhook-id: evt_...
webhook-timestamp: 178...
webhook-signature: v1=<HMAC-SHA256>
```

接收方以 `webhook-id` 去重。非 2xx 响应进入指数退避重试；成功后标记 `delivered`，不会再次投递。

## 3. 模拟支付 Adapter

`SimulatedPaymentAdapter` 只实现：

```text
reserve(transaction_id, amount)
settle(transaction_id, amount)
```

Adapter 使用 `reserve:{transaction_id}` 和 `settle:{transaction_id}` 作为独立幂等键，重复调用返回同一 provider reference。它不创建 BU2 Quote、PaymentIntent 或 Receipt，因此不会把通道概念侵入核心对象。

## 4. 当前边界

- SQLite 和模拟资金只用于本地沙盒。
- Node.js `node:sqlite` 在当前运行时仍标记为实验能力。
- Webhook 尚未实现最大重试次数、死信队列和订阅密钥轮换。
- Adapter 尚未接入 x402 或持牌支付提供商。
- 单机 SQLite 不等同于生产高可用账本。
