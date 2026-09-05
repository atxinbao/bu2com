# BU2 Persistence、Webhook 与 Adapter v0.6

日期：2026-09-05
执行者：Codex

## 1. 持久化追加账本

Reference Server 使用 SQLite WAL 模式保存资源快照和不可变事件。

核心表：

- `resources`：Quote、PaymentIntent、Transaction、Delivery 和 Receipt 当前快照。
- `ledger_events`：按自增 sequence 追加的不可覆盖业务事件。
- `idempotency_claims`：操作前的 `processing` Claim、请求指纹和成功终态。
- `idempotency_records`：兼容保留的历史请求指纹和第一次响应。
- `sandbox_state`：已确认商户状态、钱包兼容投影与全局状态版本。
- `wallet_accounts`：带非负约束和版本号的钱包权威投影。
- `adapter_operations`：支付 Adapter 的资金操作和提供商引用。
- `webhook_outbox`：待投递、租约占用、重试、死信和已交付事件。
- `webhook_delivery_attempts`：每次投递的不可变审计记录。
- `webhook_replays`：人工重放的操作者、理由和原状态。
- `webhook_subscription_secrets`：订阅密钥版本及有效窗口。
- `webhook_secret_rotations`：密钥轮换审计记录。
- `schema_migrations`：可重复执行的追加式数据库迁移历史。

进程重启后必须恢复资源、钱包、幂等结果、账本顺序、Adapter 操作和 Receipt 验证能力。Transaction Core 的领域事件先缓冲，资源、钱包、LedgerEvent、Webhook Outbox 和幂等成功终态在同一事务提交；遗留 `processing` 必须报告结果未知，不得自动重放。

## 2. Webhook Outbox

业务事件写入 `ledger_events` 时，同步为每个有效订阅创建唯一 Outbox 行：

```text
UNIQUE(event_id, subscription_id)
```

投递头：

```text
webhook-id: evt_...
webhook-timestamp: 178...
webhook-signature: v2=<HMAC-SHA256>,v1=<HMAC-SHA256>
webhook-secret-versions: v2,v1
```

接收方以 `webhook-id` 去重。投递使用 `pending → delivering → retrying / delivered / dead_letter` 状态机：

- Worker 先以数据库事务领取有限租约；并发 Dispatcher 不能同时发送同一行。
- 非 2xx、网络异常和接收方超时进入指数退避，默认最多 5 次、退避上限 60 秒并加入有限 jitter。
- 达到最大次数后进入确定的 `dead_letter`，不会继续后台重试。
- 只有死信事件可以人工重放。重放沿用原 `event_id` 和载荷，增加 replay cycle 与独立审计记录，不创建新的 `LedgerEvent`。
- 进程退出后，过期的 `delivering` 租约可由新 Worker 重新领取。

## 3. Webhook Secret 轮换

每个订阅保存显式版本。新版本启用时可给旧版本配置 0～86400 秒的重叠窗口；重叠期间每次投递同时携带新旧签名，窗口结束后只携带当前版本。

创建订阅、轮换和重放均要求 `Idempotency-Key`。公开 API、Outbox 查询、投递审计和轮换审计只返回版本及时间元数据，不返回明文 Secret。

## 4. 支付 Adapter

`SimulatedPaymentAdapter` 只实现：

```text
reserve(transaction_id, amount)
settle(transaction_id, amount)
```

Adapter 使用 `reserve:{transaction_id}` 和 `settle:{transaction_id}` 作为独立幂等键，重复调用返回同一 provider reference。当前实现包括 Simulated Adapter 与官方 x402 SDK 驱动的 Base Sepolia Testnet Adapter；两者都不创建 BU2 Quote、PaymentIntent 或 Receipt，因此不会把通道概念侵入核心对象。

## 5. 当前边界

- SQLite 和模拟资金只用于本地沙盒。
- Node.js `node:sqlite` 在当前运行时仍标记为实验能力。
- 当前只实现单实例 SQLite 的本地串行写与数据库状态版本冲突保护，不代表多节点生产高可用。
- Secret 仍只允许本地 Sandbox/Testnet 使用；生产密钥管理尚未开放。
- x402 仅限 Base Sepolia Testnet，尚未接入 Mainnet 或持牌法币支付提供商。
- 单机 SQLite 不等同于生产高可用账本。
