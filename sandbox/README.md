# BU2 Reference Server v0.6 / x402 Sandbox v0.3

日期：2026-09-05
执行者：Codex

本目录实现 Phase 0 Frozen `/v1` Contract 的本地 SQLite 沙盒。它具备追加账本、Webhook Outbox、模拟支付 Adapter、签名 Receipt、稳定分页与运行时请求校验，以及基于官方 x402 SDK 的 Base Sepolia `exact` 支付通道；不持有真实资金，不可用于生产。

## 启动

```bash
node sandbox/server.mjs
```

默认地址：`http://127.0.0.1:3100`。

默认数据库：`sandbox/data/bu2-sandbox.sqlite`。重启服务后资源、钱包、幂等结果、账本和 Receipt 均会恢复。

## 完整 Agent 交易演示

服务启动后运行：

```bash
node sandbox/demo-agents.mjs
```

演示顺序：卖方报价 → 买方 PaymentIntent → Mandate 请求确认 → 人工授权与资金预留 → 卖方交付 → 结算 → Ed25519 Receipt 验证。

## 测试

```bash
node --test sandbox/*.test.mjs
```

覆盖完整闭环、幂等冲突、报价金额篡改、Mandate 拒绝、交付前非法结算、SQLite 重启恢复、Adapter 防重复、Webhook HTTP 超时/5xx、有限重试、死信、审计重放、并发租约、Secret 轮换、端到端关联、日志脱敏、健康快照和 Receipt 签名验证。

## x402 沙盒商户

```bash
npm run x402:merchant
```

默认付费资源为 `http://127.0.0.1:4021/premium-data`。未付款请求返回 HTTP 402 和 x402 v2 `PAYMENT-REQUIRED`，要求 Base Sepolia、USDC、`exact`、0.01 USD。

运行协议和 facilitator 能力探针：

```bash
npm run x402:probe
```

真实测试网结算需要仅通过进程环境传入已有 Base Sepolia USDC 的测试买方私钥：

```bash
X402_BUYER_PRIVATE_KEY=0x... npm run x402:probe
```

未配置有资金的钱包时，探针只验证 402 挑战与 facilitator 能力，不会声称链上结算成功。

### 启动完整 x402 BU2 链路

x402 模式使用独立端口和数据库，避免与 CNY 模拟钱包混用：

```bash
BU2_SANDBOX_PORT=3101 \
BU2_SANDBOX_DB=./data/bu2-x402.sqlite \
BU2_PAYMENT_ADAPTER=x402 \
X402_BUYER_PRIVATE_KEY=0x... \
npm start
```

随后运行：

```bash
npm run demo:x402
```

领域入口已经支持异步 Adapter。支付通道失败时不会扣减内部余额、改变 Delivery 状态或签发 Receipt，可以使用相同幂等键安全重试。

### 本机测试钱包

专用 Base Sepolia 买方地址：`0x2c8b07E38155195826e91e266aCee03B3398dD97`。私钥只保存在 macOS 钥匙串。

```bash
npm run x402:wallet
npm run x402:probe:funded
npm run x402:server
```

测试钱包已经领取 10 Base Sepolia USDC，并完成两笔 0.01 USDC 支付；当前余额为 9.98 USDC。

## 沙盒调试端点

- `GET /health`：服务、数据库、Adapter、账本事件，以及 Outbox 与 Adapter 未知结果健康快照。
- `GET /v1/transactions?limit=20&cursor=...`：按时间倒序返回交易及其支付、交付、通道和 Receipt 上下文，使用不透明 cursor 分页。
- `GET /v1/transactions/{id}`：返回单笔完整交易详情。
- `GET /v1/ledger`：追加式账本事件。
- `POST /v1/webhook_subscriptions`：创建本地 Webhook 订阅。
- `POST /v1/webhook_subscriptions/{id}/secret_rotations`：轮换签名 Secret，并设置新旧版本重叠窗口。
- `POST /v1/webhooks/dispatch`：立即投递当前 Outbox。
- `GET /v1/webhook_outbox`：查看投递状态与尝试次数。
- `GET /v1/webhook_dead_letters`：查看达到最大尝试次数的死信。
- `GET /v1/webhook_outbox/{id}/attempts`：查看逐次投递审计。
- `POST /v1/webhook_outbox/{id}/replays`：幂等重放单个死信，保留原 `event_id`。

Webhook 默认最多尝试 5 次，指数退避上限 60 秒，Worker 租约 30 秒，请求超时 10 秒。创建订阅、轮换和重放要求 `Idempotency-Key`；公开响应与审计记录不会返回明文 Secret。

所有 HTTP 响应均返回 `X-Request-Id` 和 `X-Trace-Id`。调用方可传入合法 `X-Trace-Id`，将外部 Agent 执行与 Transaction、LedgerEvent、Adapter、Outbox 和 Webhook 投递关联；省略时由服务生成。公开 `/v1` 请求体、资源 ID、分页参数与 `Idempotency-Key` 会在边界运行时校验；未知字段、非法 cursor、非法 Trace ID 和不匹配的资源前缀返回稳定 JSON 错误。

直接启动服务时，标准输出为分类后的单行 JSON 事件；敏感字段和值在写出前脱敏。字段定义、告警条件和处置步骤见 [交易链路可观测性与处置手册](../docs/03-technical/OBSERVABILITY_RUNBOOK_V0.1.md)。Reference Server 仅绑定本机 Sandbox/Testnet，当前认证边界不支持公开部署。
