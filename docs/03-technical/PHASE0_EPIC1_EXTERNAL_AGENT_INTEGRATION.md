# Phase 0 Epic 1：External Agent Transaction Integration & Reliability

日期：2026-09-05
执行者：Codex
状态：Frozen for implementation
风险等级：R2（交易相关，不包含生产资金）

## 1. 目标

让一个运行在 ChatGPT、Codex、Claude 或自建系统中的外部 Agent，通过稳定的 BU2 v1 接口发起一笔交易，并可靠地接收从授权到 Receipt 的状态事件。

本 Epic 验证的是“外部 Agent 能否接入并可靠完成交易”，不是继续扩展 BU2 内部任务管理，也不是开放 Mainnet 或托管。

## 2. Owner

| 职责 | Owner | 责任 |
| --- | --- | --- |
| Accountable | Project Owner | 冻结范围、批准 R2 合并、处理范围变更 |
| Product | BU2 Product | 外部 Agent 接入路径、开发者体验与验收 |
| Engineering | BU2 Engineering | API、Outbox、Adapter、可观测性与测试实现 |
| Verification | Codex（本地自动化） | 契约、单元、集成、故障恢复与浏览器证据 |

生产资金操作不属于本 Epic，PR 合并也不构成生产执行授权。

## 3. 用户闭环

```text
外部 Agent 获取卖方 Quote
  → 创建 PaymentIntent
  → BU2 返回确定的 Authorization 结果
  → 交易进入 funds_reserved 或 review_required
  → 外部 Agent/卖方提交 DeliveryEvidence
  → BU2 结算并签发 Receipt
  → 外部系统通过 Webhook 或查询 API 获得最终状态
  → 同一请求、重复事件或进程重启不会产生重复资金动作
```

外部上下文只保存引用，不要求用户把任务或完整会话迁移到 BU2。

## 4. 范围

### E1.0 — 冻结 Transaction API v1

- 将 Agent Payment API v0.1 从“冻结候选”升级为 Phase 0 frozen contract。
- 对齐 OpenAPI、MCP 工具、HTTP 实现、示例与稳定错误码。
- 明确列表、详情、分页、请求关联 ID 和运行时输入校验。
- 兼容变化只允许增加可选字段；破坏性变化必须进入新版本。

### E1.1 — Webhook 可靠性闭环

- 为重试配置最大次数、退避上限和确定的 `dead_letter` 状态。
- 提供受审计的死信查询与单事件重放；重放沿用原 `event_id`，不得重新产生业务事件。
- Webhook Secret 支持版本标识和有限重叠轮换，不在 API、日志或事件载荷中返回明文。
- 证明重复投递、接收方超时、持续 5xx、重启和人工重放不会重复改变交易状态。

### E1.2 — 交易链路可观测性

- API、Transaction Core、Outbox 和 Adapter 贯穿 `request_id`、`trace_id`、`transaction_id`、`event_id` 与 provider reference。
- `/health` 增加待投递、重试中、死信、Adapter 未知结果和最近成功投递时间。
- 结构化日志区分 validation、policy、state、adapter、unknown-result 与 internal error，且不包含 Secret 或私钥。
- 为死信积压、Adapter 未知结果和 Receipt 验证失败定义告警条件与处理手册。

### E1.3 — x402 Testnet 失败回归

- 覆盖 challenge 金额/网络/资产不匹配。
- 覆盖 facilitator 超时、响应丢失、链上结果未知和恢复查询。
- 证明未知结果不会自动重试扣款、释放内部预留或签发 Receipt。
- Base Sepolia 成功路径继续产生稳定 provider reference 和可验证 Receipt。

### E1.4 — 首个外部 Agent 接入样例

仅在 E1.0–E1.3 通过后实施：

- 提供一个最小 buyer-agent 示例和一个 seller-agent 示例。
- 同时演示 HTTP API 与现有 MCP 工具，不新增第二套交易语义。
- 从空环境到第一笔 Simulation 交易的接入时间目标不超过 15 分钟。

## 5. 明确不做

- 不新增 Mainnet、法币、托管、提现、换汇、跨链或第二个真实支付通道。
- 不重建 SQLite 追加账本、现有 Outbox、Simulated Adapter 或 x402 Adapter。
- 不要求用户在 BU2 创建 Task、工作流或完整 Agent 项目。
- 不先建设通用 SDK 框架、插件市场、计费套餐或企业权限系统。
- 不把 HTTP 402 challenge 表述为资金预留或结算完成。

## 6. 接口与状态契约

- 每个创建和资金动作都要求 `Idempotency-Key`。
- 同键同载荷返回原结果；同键不同载荷返回 `409 idempotency_conflict`。
- 外部超时首先进入“结果未知”，只能通过 provider 查询、回调或对账确认最终结果。
- 授权、预留、交付、结算和 Receipt 保持独立事实。
- LedgerEvent 只追加；Webhook 重放不新增或改写 LedgerEvent。
- `refunded_amount ≤ settled_amount ≤ reserved_amount ≤ authorized_amount` 始终成立。

## 7. 验收标准

### 契约

- OpenAPI、MCP、示例、HTTP 响应和文档表达同一套 v1 对象与状态。
- 所有外部输入在运行时校验，稳定错误包含 `type`、`code`、`message` 和 `request_id`。
- 旧 v1 交易、Receipt、事件和 SQLite 数据仍可读取与解释。

### 可靠性

- Webhook 在达到最大尝试次数后进入死信，不再无限重试。
- 单事件重放可恢复成功，保留原事件身份并产生独立审计记录。
- Secret 轮换期间新旧有效版本均能按明确窗口验证；过期版本失败关闭。
- 并发结算、重复 Webhook 和重复重放只产生一次业务结果。

### x402

- 成功、明确失败和未知结果三类路径均有自动化测试。
- 未知结果不会造成重复链上付款、错误释放预留或提前签发 Receipt。
- 测试只使用 Base Sepolia、测试钱包和低额 USDC。

### 产品与开发者体验

- Transactions 和 Transaction Detail 能显示实时状态、provider reference、Receipt 验证和 Webhook 投递状态。
- 全中文/全英文路径均通过，控制台 0 error。
- 新开发者只按 README 即可在 15 分钟内跑通一笔 Simulation 交易。

## 8. 强制验证

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
npm --prefix prototype run lint
npm --prefix prototype run build
```

在以上基线之上新增：Webhook 死信/重放/轮换测试、并发与重启恢复测试、x402 timeout/unknown-result 故障注入，以及真实浏览器 Transaction-first 回归。

## 9. 完成门槛

只有同时满足以下条件，Epic 才能标记 Done：

1. E1.0–E1.4 全部通过本地自动化验证。
2. 没有开放 Mainnet、真实资金托管或生产 Secret。
3. `CHANGELOG.html`、API 文档、OpenAPI、MCP、运行手册和实现保持一致。
4. R2 PR 获得 Project Owner 审查并合并。
5. 未执行项、残余风险和恢复方式进入验证报告。

## 10. 恢复策略

- 数据库只允许 additive migration；旧字段和历史事件不删除。
- 新可靠性能力以配置关闭或前向修复恢复，不回写交易历史。
- x402 Testnet 回归失败时切回 Simulated Adapter，保留未知结果用于只读对账。
- 若 v1 契约无法保持兼容，停止 Epic 并创建新版本提案，不静默改变现有字段语义。

## 11. 后续门槛

Epic 1 完成后，才评估 Epic 2：开发者接入规模化，包括 SDK 包装、MCP 分发、示例 Agent 和接入分析。Epic 1 不会自动提升 Mainnet、托管或生产执行模式。
