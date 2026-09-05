# BU2 Reference Server v0.12 / x402 Sandbox v0.5

日期：2026-09-06
执行者：Codex

本目录实现 Phase 0 Frozen `/v1` Contract 的本地 SQLite Reference Server。它具备追加账本、Webhook Outbox、模拟支付 Adapter、签名 Receipt、稳定分页与运行时请求校验、基于官方 MCP SDK 的外部 Agent 接入样例，以及基于官方 x402 SDK 的 Base Sepolia `exact` 支付通道；ENV-02 已增加 `local/sandbox/live` 环境注册表、SQLite 环境绑定和链/Signer/Provider 断言。它不持有真实资金，不可用于生产。

## 启动

```bash
node sandbox/server.mjs
```

默认地址：`http://127.0.0.1:3100`。未指定环境时只允许 `local + simulated`。

默认数据库：`sandbox/data/bu2-sandbox.sqlite`。SQLite Schema v8 会为新库写入不可变环境 metadata；错环境数据库拒绝启动。没有 metadata 的旧库必须先鉴别，再用一次性 `BU2_CLAIM_LEGACY_DB_ENVIRONMENT=true` 明确认领，不能默认解释为 Sandbox 或 Live。重启服务后资源、钱包、幂等结果、账本和 Receipt 均会恢复。领域写入先登记数据库 `processing` Claim，再以状态版本 CAS 把资源、余额、LedgerEvent、Webhook Outbox 和幂等终态一次提交；遗留 `processing` 会返回结果未知，禁止自动重放。

## 完整 Agent 交易演示

服务启动后运行：

```bash
node sandbox/demo-agents.mjs
```

演示顺序：卖方报价 → 买方 PaymentIntent → Mandate 请求确认 → 人工授权与资金预留 → 卖方交付 → 结算 → Ed25519 Receipt 验证。

## 外部 Buyer / Seller Agent 与 MCP

从空环境执行一条命令即可启动隔离 Reference Server、标准 stdio MCP Server，并让独立 Buyer/Seller Agent 完成首笔 Simulation 交易：

```bash
npm run demo:external
```

也可以把 MCP Server 连接到已运行的本地 BU2：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=simulation \
npm run mcp
```

`npm run mcp` 使用稳定入口 `bin/bu2-mcp.mjs`，先校验 endpoint、API contract、环境和 MCP contract compatibility，再打开 stdio。Agent 只获得冻结的 6 个 MCP 工具；人工授权和 BU2 结算仍留在 HTTP 控制面。MCP 层只转发 `/v1`，不会直接修改领域状态或账本。完整配置、角色边界和五分钟快速开始见 [外部 Agent 快速接入](../docs/03-technical/EXTERNAL_AGENT_QUICKSTART.md)；Codex、Claude Desktop 与通用 Host 示例见 [MCP Host 配置](../integrations/mcp/README.md)。

## 接入诊断

Reference Server 启动后运行本地 doctor：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=simulation \
npm run doctor
```

doctor 会按顺序检查 Node、配置、endpoint、环境、API/MCP 契约、真实 stdio 启动以及 Receipt 验证能力。`--format json` 返回受 Schema 约束的机器结果；`--language zh|en` 控制人类提示语言；`--receipt-id rcpt_...` 对一张已存在的 Receipt 执行只读验证。未提供 Receipt ID 时只报告验证能力可用，不声称任何 Receipt 已通过。

接入分析只返回阶段、耗时、结果类别和稳定错误码，并固定为进程内、无持久化、无远程上传。详见 [开发者接入诊断 v0.1](../docs/03-technical/DEVELOPER_DIAGNOSTICS_V0.1.md)。

## 三路径 clean-room 验收

在仓库根目录安装 Sandbox 与 SDK 依赖后运行：

```bash
npm --prefix sandbox run acceptance:clean-room
```

验收器会在三个全新临时项目中分别通过原生 HTTP、`@bu2/sdk` 本地 tarball 和稳定 MCP stdio 入口完成独立 Simulation 交易。每条路径必须在 15 分钟内得到 `settled` 交易和 `valid=true` Receipt，并证明相关 BU2 源码未变化、临时项目已删除。样例和双语说明见 [`integrations/clean-room`](../integrations/clean-room/README.md)，实际结果见 [E2.4 clean-room 接入证据](../docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)。

## 测试

```bash
node --test sandbox/*.test.mjs
```

覆盖完整闭环、数据库幂等 Claim、并发预留、状态 CAS、原子提交故障注入、报价金额篡改、Mandate 拒绝、交付前非法结算、SQLite 重启恢复、Adapter 防重复、Webhook HTTP 超时/5xx、有限重试、死信、审计重放、并发租约、Secret 轮换、端到端关联、日志脱敏、健康快照、MCP 外部 Agent 接入、doctor 故障注入、clean-room 证据约束、x402 签名前条款漂移、调用前 Payment Attempt、重启只查询恢复和 Receipt 签名验证。

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
BU2_ENVIRONMENT=sandbox \
BU2_PAYMENT_ADAPTER=x402 \
BU2_EXECUTION_STATUS=execution_enabled \
BU2_SIGNER_ENVIRONMENT=sandbox \
X402_BUYER_PRIVATE_KEY=0x... \
npm start
```

随后运行：

```bash
npm run demo:x402
```

领域入口已经支持异步 Adapter。Sandbox 默认 `execution_disabled`，必须显式启用测试执行并声明 Signer 环境；Live 在 ENV-02 中不能启用。预检时会持久化完整 x402 授权条款；正式钱包路径通过官方 x402 Client 的签名前 hook 再次比较 amount、asset、network、resource 和 `payTo`。Adapter 会在任何对外支付调用前，以同一数据库事务写入 `adapter_operation` 和唯一 Payment Attempt。明确失败不会扣减内部余额、改变 Delivery 状态或签发 Receipt；可能已支付、进程中断或只留下 `prepared/submitting` 尝试时统一阻断普通重试，只能通过显式恢复查询收口。

### 恢复未知 x402 结算

```bash
curl -X POST http://127.0.0.1:3101/v1/transactions/txn_.../settlement_recoveries \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: recovery-query-001' \
  -d '{}'
```

恢复查询不会发起第二次付款。只有注入的 Provider 查询器明确返回 `settled`，BU2 才释放内部预留并签发 Receipt；未配置查询器或链上结果仍不确定时保持 `delivery_submitted`。详见 [x402 Testnet 可信执行 v0.1](../docs/03-technical/X402_TRUSTED_EXECUTION_V0.1.md)。

### 本机测试钱包

专用 Base Sepolia 买方地址：`0x2c8b07E38155195826e91e266aCee03B3398dD97`。私钥只保存在 macOS 钥匙串。

```bash
npm run x402:wallet
npm run x402:probe:funded
npm run x402:server
```

测试钱包已经领取 10 Base Sepolia USDC，并完成两笔 0.01 USDC 支付；当前余额为 9.98 USDC。

## 沙盒调试端点

- `GET /health`：服务、API/MCP 兼容版本、环境、数据库、Adapter、账本事件，以及 Outbox 与 Adapter 未知结果健康快照。
- `GET /v1/transactions?limit=20&cursor=...`：按时间倒序返回交易及其支付、交付、通道和 Receipt 上下文，使用不透明 cursor 分页。
- `GET /v1/transactions/{id}`：返回单笔完整交易详情。
- `POST /v1/transactions/{id}/settlement_recoveries`：幂等查询未知 x402 结算，不重复付款。
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
