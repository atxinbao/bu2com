# BU2 Reference Server v0.17 / x402 Sandbox v0.5

日期：2026-09-07
执行者：Codex

本目录实现 Phase 0 Frozen `/v1` Contract 的本地 SQLite Reference Server。它具备追加账本、Webhook Outbox、模拟支付 Adapter、签名 Receipt、稳定分页与运行时请求校验、基于官方 MCP SDK 的外部 Agent 接入样例，以及基于官方 x402 SDK 的 Base Sepolia `exact` 支付通道；ENV-02–06 已建立环境、客户端、Receipt、隔离容器、受控访问与恢复边界，ENV-07A 增加 Hosted Sandbox 的专用启动和证据门槛。LA-03a 进一步把结算、确认退款和 ProviderFee 事实接入受保护的 Journal/Posting，LA-03b 增加可核对期初检查点与追加更正事实，LA-03c 提供从不可变 Posting 重建账户余额与 Journal 平衡的只读报告，LA-04 支持 pending Collection 持续验证与单次入账，LA-05a 支持独立外部观察对账、未决队列和孤立事实，LA-05b 支持历史账务重放和备份追加事实追平证据，LA-06a 提供本地全量回归、故障/属性/跨租户准入编排。它不持有真实资金，不可用于生产；LA-06a 不代表真实 Sandbox 双向收付已验收。

## 启动

```bash
node sandbox/server.mjs
```

默认地址：`http://127.0.0.1:3100`。未指定环境时只允许 `local + simulated`。

容器部署可以通过 `BU2_HOST=0.0.0.0` 显式改变容器内监听地址；默认值仍是 loopback。ENV-04 Docker/Compose 模板与错库、错 Signer 验收见 [`deploy/README.md`](../deploy/README.md)。模板中的 Sandbox/Live 均为 `execution_disabled`，不会挂载 Signer。

### Hosted Sandbox 候选入口

托管候选必须使用 `npm run start:hosted-sandbox`，而不是直接启用默认入口。它固定 Sandbox、Base Sepolia、x402、机器鉴权和 `signer_environment=sandbox`，并在监听 API 前检查真实 RPC chain ID。凭据元数据、测试网 buyer key 与 RPC endpoint 必须分别通过 `BU2_API_CREDENTIALS_FILE`、`X402_BUYER_PRIVATE_KEY_FILE`、`BU2_RPC_URL_FILE` 指向只读普通文件；直接 Secret 环境变量会被拒绝。

该入口可启动不代表已获部署或支付授权。完整 Candidate、独立 Activation、双向结算与边缘机器鉴权门槛见 [ENV-07 Hosted Sandbox v1](../docs/03-technical/ENVIRONMENT_HOSTED_SANDBOX_V1.md)。

默认数据库：`sandbox/data/bu2-sandbox.sqlite`。SQLite Schema v15 会为新库写入不可变环境 metadata、持久 Principal/Account/Agent 归属、资金来源、收款目标、版本化 PaymentMandate、PolicyDecision、ExecutionSession、只追加访问决策、租户 credential generation 与 reset 审计、持久化退款尝试以及受保护的平衡 Journal/Posting；错环境数据库拒绝启动。没有 metadata 的旧库必须先鉴别，再用一次性 `BU2_CLAIM_LEGACY_DB_ENVIRONMENT=true` 明确认领，不能默认解释为 Sandbox 或 Live。重启服务后资源、钱包、幂等结果、账本、Receipt、身份归属、钱包绑定、Mandate 决策、ExecutionSession 支出、退款尝试和已过账 Journal 均会恢复。领域写入先登记数据库 `processing` Claim，再以状态版本 CAS 把资源、余额、LedgerEvent、Webhook Outbox 和幂等终态一次提交；退款外部调用前另行持久化 Refund Attempt，未知结果保留可退额度占用，禁止自动重放；财务 Posting 必须经成组借贷平衡校验，已过账事实不可更新或删除。

F13 增加 `funds_reserved` 交易的有界取消，以及 `settled` 交易的部分/全额退款事实。取消会原子释放 Wallet reserved 和 active Budget Hold；退款持久化为 `Refund` 资源并维持 `refunded ≤ settled ≤ reserved ≤ authorized`。Provider unknown 只能通过显式 recovery 查询推进；当前 x402 Adapter 没有标准退款原语，因此不会伪造退款成功或自动重付。

## 受控访问

`local` 默认是显式开发开放模式；`sandbox/live` 默认是 `authenticated`。公开接口只有 health、environment 和 Receipt verify。外部凭据元数据通过 `BU2_API_CREDENTIALS_JSON` 注入，必须只包含 token SHA-256 摘要，不得包含原始 key；SDK/MCP 从独立的 `BU2_API_KEY` 读取原始 key。角色、字段和生成辅助函数见 [`ENVIRONMENT_CONTROLLED_ACCESS_V1.md`](../docs/03-technical/ENVIRONMENT_CONTROLLED_ACCESS_V1.md) 与 [`access-control.mjs`](access-control.mjs)。

### F06a 持久身份与内部 Sandbox onboarding

F06a 将配置中的 `tenant_id`、`principal_id`、`account_ids` 和 `agent_ids` 映射为 SQLite 中可重启恢复的 Principal、Account、Agent 和 credential binding 记录。启动时只会按当前凭证配置执行明确、幂等的映射；不会猜测历史交易的客户归属，也不会把原始 API key 写入数据库、镜像、日志或 `/v1/access` 响应。

需要建立隔离的内部 Buyer/Seller 租户时，使用只包含摘要的 onboarding 文档：

```bash
# 文档只允许 token_sha256，不允许 token 原文
npm run onboarding:bootstrap -- \
  sandbox/onboarding.example.json \
  --database ./data/bu2-sandbox.sqlite

# 查看当前环境已持久化的归属，不返回 token digest
npm run onboarding:inspect -- \
  --environment sandbox \
  --database ./data/bu2-sandbox.sqlite
```

`/v1/access` 会在认证成功后返回当前调用者的持久 Principal、Account 和 Agent 摘要；业务 Agent 仍不能调用 Operator 的租户重置、人工授权、结算或恢复权限。该 onboarding 只建立业务主体与受限凭证归属，不启用 Signer、不改变 `execution_disabled`，也不代表真实 Base Sepolia 资金验收已完成。

### F06b 资金来源与收款目标绑定

F06b 将 Agent 交易使用的资金来源和收款目标作为持久、可验证的绑定记录保存。每条绑定都属于一个环境、租户、Account，可选地限定到 Agent，并记录资产、网络、Provider、脱敏引用、生命周期状态、验证状态和 generation。绑定 ID 已写入 Quote 与 PaymentIntent；绑定存在时，交易创建会拒绝跨租户、错资产、错网络、未验证、已停用或引用漂移。

绑定配置仍通过 onboarding 文档显式提供，不保存私钥、原始 token 或支付秘密。Local Simulation 可以使用 `CNY` 与空网络；Sandbox 必须匹配环境注册表批准的 Base Sepolia 资产和 `eip155:84532`。同一个绑定 ID 不能静默改指向，收款地址或引用变化必须创建新的绑定 ID 或 generation。

### F15a 有界内部 ExecutionSession

`ExecutionSession` 为外部 Agent 的既有工作流提供短时内部执行窗口，不要求用户把任务迁移到 BU2。会话绑定 `tenant_id`、Account、Agent 和当前环境，最长 15 分钟，拥有独立的 `activation_id` 与审核人；它不能替代 PaymentMandate，也不能绕过 `execution_status`。PaymentIntent 可携带 `execution_session_id`，其支出在预留、结算、取消和重启后分别保持可查询。Live、Hosted、公网凭证和生产资金不属于该能力范围。

## 完整 Agent 交易演示

服务启动后运行：

```bash
node sandbox/demo-agents.mjs
```

演示顺序：卖方报价 → 买方 PaymentIntent → PaymentMandate PolicyDecision →（必要时）人工授权与资金预留 → 卖方交付 → 结算 → Ed25519 Receipt 验证。

## 外部 Buyer / Seller Agent 与 MCP

从空环境执行一条命令即可启动隔离 Reference Server、标准 stdio MCP Server，并让独立 Buyer/Seller Agent 完成首笔 Simulation 交易：

```bash
npm run demo:external
```

也可以把 MCP Server 连接到已运行的本地 BU2：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
npm run mcp
```

`npm run mcp` 使用稳定入口 `bin/bu2-mcp.mjs`，先校验 endpoint、API/environment/MCP contract、链、执行后端、执行状态和 Receipt issuer，再打开 stdio；每次 Agent mutation 前重新预检。Agent 只获得冻结的 6 个 MCP 工具；人工授权和 BU2 结算仍留在 HTTP 控制面。MCP 层只转发 `/v1`，不会直接修改领域状态或账本。完整配置、角色边界和五分钟快速开始见 [外部 Agent 快速接入](../docs/03-technical/EXTERNAL_AGENT_QUICKSTART.md)；Codex、Claude Desktop 与通用 Host 示例见 [MCP Host 配置](../integrations/mcp/README.md)。

## 接入诊断

Reference Server 启动后运行本地 doctor：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
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

覆盖完整闭环、数据库幂等 Claim、并发预留、状态 CAS、原子提交故障注入、报价金额篡改、Mandate 拒绝、交付前非法结算、SQLite 重启恢复、角色/claims 与租户隔离、访问重置、支持包脱敏、Adapter 防重复、Webhook HTTP 超时/5xx、有限重试、死信、审计重放、并发租约、Secret 轮换、端到端关联、日志脱敏、MCP 外部 Agent 接入、doctor 故障注入、clean-room 证据约束、x402 签名前条款漂移、调用前 Payment Attempt、重启只查询恢复和 Receipt 签名验证。

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

- `GET /health`：公开粗粒度存活、版本、环境和 payment execution readiness；不暴露数据库路径、交易数量或内部 Outbox/Adapter 统计。
- `GET /v1/environment`：版本化环境、链、执行后端、契约、执行状态、公开能力和 Receipt issuer 自描述。
- `GET /v1/access`：返回当前机器主体、角色、claims 与权限，不返回 API key。
- `POST /v1/operations/support_bundles`：Operator 生成脱敏诊断快照。
- `POST /v1/operations/tenants/{tenant_id}/resets`：Operator 幂等失效一个 Sandbox 租户的旧 credential generation，不删除交易事实。
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

直接启动服务时，标准输出为分类后的单行 JSON 事件；敏感字段和值在写出前脱敏。字段定义、告警条件和处置步骤见 [交易链路可观测性与处置手册](../docs/03-technical/OBSERVABILITY_RUNBOOK_V0.1.md)。Reference Server 仍是本地参考实现；ENV-05 的鉴权能力不等于托管公网、生产凭据或 Live 准入。
