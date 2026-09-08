# BU2 Agent Payment API 契约 v0.3.0

日期：2026-09-06
执行者：Codex  
状态：Phase 0 Frozen（`/v1` 资源与行为契约）

## 1. 设计原则

- BU2 是嵌入式 Agent 收付层，不是任务平台。
- 金额统一使用最小货币单位整数，例如 `3900 CNY = ¥39.00`。
- 所有创建与资金动作必须携带 `Idempotency-Key`。
- Quote、授权、资金预留、交付和结算是独立事件。
- 外部上下文可选，不要求上传完整会话或任务内容。
- 完成交易必须生成可验证 Receipt。
- 所有 HTTP 响应返回服务端生成的 `X-Request-Id` 与 `X-Trace-Id`；错误体中的 `request_id`、`trace_id` 与响应头一致。
- 调用方可传入符合 `trc_` 规则的 `X-Trace-Id` 贯穿一次外部 Agent 执行；省略时由 BU2 生成，非法值失败关闭。
- 所有外部请求体、路径参数和查询参数必须在 HTTP 边界运行时校验，未知字段失败关闭。
- 资源 ID 由固定前缀和 ASCII 字母、数字、下划线或连字符组成，总长度不超过 255 字符。
- `GET /v1/environment` 是客户端 mutation 前的版本化环境、链、执行后端、Receipt issuer 和 execution status 自描述入口。
- `GET /health`、`GET /v1/environment` 和 `GET /v1/receipts/{id}/verify` 公开；其余接口使用环境绑定的 Bearer API key，并按 Agent/Developer/Operator 权限与 Account/Agent claims 校验。
- 对外环境只允许 `sandbox/live`；本机模拟使用显式 `local` 开发模式。任何跨环境不匹配都必须在 mutation 前失败关闭。

## 2. 稳定资源

| 资源 | 前缀 | 责任 |
| --- | --- | --- |
| AgentIdentity | `agt_` | 证明哪个 Agent 代表哪个 Account |
| Wallet | `wal_` | 保存可用、预留与结算余额视图 |
| PaymentMandate | `mdt_` | 定义 Agent 自主支付边界 |
| Quote | `quo_` | 卖方对服务、价格和交付条件的承诺 |
| PaymentIntent | `pi_` | 买方对一笔具体交易的支付意图 |
| Authorization | `auth_` | Mandate 或人工授权的判断记录 |
| Transaction | `txn_` | 获得授权后的资金与交付容器 |
| DeliveryEvidence | `dlv_` | 卖方提交的交付证明 |
| Receivable | `rcv_` | 卖方 Account 的可持久化应收款事实 |
| Collection | `cpay_` | Provider 验证并一次性入账的入站收款事实 |
| AccessGrant | `agr_` | 从已入账 Collection 派生、可恢复的付费访问权益 |
| Settlement | `stl_` | 资金结算事件 |
| Receipt | `rcpt_` | 双方可验证的交易凭证 |
| WebhookSubscription | `whsub_` | 外部系统的事件接收地址与 Secret 版本元数据 |
| WebhookOutbox | `out_` | 每个事件与订阅组合的可靠投递状态 |
| WebhookDeliveryAttempt | `wha_` | 单次投递的不可变审计事实 |
| WebhookReplay | `whrp_` | 死信人工重放的操作者与理由 |
| AdapterRecoveryAttempt | `arv_` | 未知支付结果的一次不可变查询审计 |

## 3. PaymentIntent 最小输入

```json
{
  "quote_id": "quo_01KBU2A",
  "payer_account_id": "acct_bu2_ventures",
  "buyer_agent_id": "agt_research_copilot",
  "payment_mandate_id": "mdt_research_04",
  "amount": { "value": 3900, "currency": "CNY" },
  "purpose": "Southeast Asia commerce dataset · 2026 Q2",
  "external_context": {
    "type": "chatgpt_conversation",
    "id": "conv_external_8421"
  },
  "metadata": { "project": "market-research" }
}
```

服务端必须从 Quote 解析 `payee_account_id`、`seller_agent_id` 和交付条件，调用方不能用 PaymentIntent 覆盖 Quote 的卖方或金额。

## 4. 状态机

```text
requires_authorization
  → authorized
  → funds_reserved
  → delivery_submitted
  → settled

终止状态：declined / expired / canceled / refunded
争议状态：disputed（可从 delivery_submitted 或 settled 进入）
```

允许的状态转换：

| 当前状态 | 操作 | 下一状态 |
| --- | --- | --- |
| requires_authorization | authorize | authorized |
| requires_authorization | decline | declined |
| authorized | reserve | funds_reserved |
| funds_reserved | submit_delivery | delivery_submitted |
| delivery_submitted | settle | settled |
| funds_reserved | cancel | canceled |
| settled | refund | refunded |

任何未列出的转换返回 `409 invalid_state_transition`。

## 5. 授权结果

创建 PaymentIntent 后，BU2 立即评估 Payment Mandate：

```json
{
  "decision": "review_required",
  "authorization_id": "auth_01KBU2B",
  "reason_code": "first_time_payee",
  "matched_rules": ["category:research_data", "amount_lte:5000"],
  "required_action": "human_confirmation"
}
```

`decision` 只能是 `allowed`、`review_required` 或 `denied`。`allowed` 可以自动进入资金预留；`review_required` 必须等待人工决定。

## 6. 幂等契约

- `POST /quotes`、`POST /payment_intents`、授权、交付、结算、收款、AccessGrant、退款、Webhook 订阅、Secret 轮换和死信重放均要求 `Idempotency-Key`。
- 同一 Account、同一路径、同一 Key 和相同请求体返回第一次结果。
- 同一 Key 配合不同请求体返回 `409 idempotency_conflict`。
- Key 至少保留 24 小时；资金动作建议永久绑定到业务记录。

未知结算只能通过 `POST /transactions/{transaction_id}/settlement_recoveries` 显式查询。该操作同样要求幂等键，但不得调用支付提交入口；同键重放返回原查询结果。

## 7. 金额与对账

- `amount.value` 必须是非负整数。
- `currency` 使用 ISO 4217 三字母大写代码。
- `authorized_amount`、`reserved_amount`、`settled_amount`、`refunded_amount` 分开保存。
- 任意时刻满足：`refunded_amount ≤ settled_amount ≤ reserved_amount ≤ authorized_amount`。
- 汇率、通道费和平台费作为独立 Amount 字段，不能改写商品金额。

## 8. Receipt

Receipt 至少覆盖：

- Quote 与 PaymentIntent ID；
- payer、payee、buyer agent、seller agent；
- Authorization 与命中 Mandate；
- 商品金额、费用、结算金额和币种；
- DeliveryEvidence 的摘要与哈希；
- Settlement ID、支付通道引用和时间；
- Receipt 版本、签名算法、签名与验证键 ID。

Phase 0 的新签发凭证固定为 Receipt v0.3，并使用 RFC 8785 JCS
（`canonicalization_version=RFC8785-JCS-1`）递归规范化全部签名字段。签名范围必须包含金额与币种、环境、支付通道、Provider 引用、收付款双方、Mandate、交付证据和结算时间；任一字段改变都必须导致签名验证失败。

v0.3 还必须签名绑定 `environment_contract_version`、`environment`、`execution_backend`、`chain_id`、`network` 与 `receipt_issuer_id`。

验证结果不得只返回单一的密码学判断，而要区分：

- `signature_valid`：签名与完整 payload 是否匹配；
- `issuer_trusted`：`verification_key_id` 是否对应 BU2 持久化信任的公钥；
- `settlement_confirmed`：Receipt 是否与当前已结算 Transaction、金额和 Provider 引用一致；
- `environment_valid`：Receipt 的服务环境、链、执行后端和 issuer 是否与当前受信环境一致；
- `valid`：仅当 schema 受支持且以上四项都为 `true` 时为 `true`。

v0.1/v0.2 只保留历史读取与 schema registry 验证，不得作为新的签发版本。旧 `simulation/testnet` 字段、原始签名字节和 canonicalization 算法不重写、不重签；服务重启或签发密钥轮换后，已签发 Receipt 仍应可验证。私钥不写入账本。

## 9. 错误模型

```json
{
  "error": {
    "type": "invalid_state_transition",
    "code": "transaction_not_delivered",
    "message": "Transaction must be delivery_submitted before settlement.",
    "request_id": "req_01KBU2Z",
    "trace_id": "trc_01KBU2TRACE",
    "details": { "current_state": "funds_reserved" }
  }
}
```

P0 稳定错误类型：`validation_error`、`authentication_error`、`configuration_error`、`policy_error`、`mandate_denied`、`insufficient_funds`、`idempotency_conflict`、`invalid_state_transition`、`resource_not_found`、`adapter_error`、`provider_unknown`。

稳定校验错误码包括：`invalid_request_body`、`invalid_resource_id`、`invalid_query_parameters`、`invalid_limit`、`invalid_cursor`、`invalid_trace_id`、`missing_idempotency_key`、`invalid_json`、`unsupported_media_type` 和 `request_body_too_large`。

## 10. 链路关联

一次 HTTP 请求由 `request_id` 唯一标识，一次跨请求 Agent 执行由 `trace_id` 关联。交易建立后，BU2 将以下字段追加到 LedgerEvent、Outbox、Adapter 操作和 Webhook 投递审计：

- `request_id`：创建该事实的 BU2 HTTP 请求；
- `trace_id`：调用方传入或 BU2 生成的端到端链路；
- `transaction_id`：资金与交付容器；
- `event_id`：不可变业务事件；
- `provider_reference`：支付通道返回的外部引用。

Webhook 使用 `webhook-trace-id` 转发原业务事件的 `trace_id`。投递本身的请求与链路保存在 `WebhookDeliveryAttempt`，不会覆盖原事件关联。

## 11. Transaction 分页

`GET /v1/transactions` 使用稳定的不透明 cursor 分页：

```json
{
  "data": [],
  "page": {
    "limit": 20,
    "has_more": false,
    "next_cursor": null
  }
}
```

- `limit` 默认 20，范围 1–100。
- `cursor` 只能使用前一页返回的 `next_cursor`，调用方不得解析其内部结构。
- 排序固定为 `created_at DESC, transaction_id DESC`。
- 未知、重复或非法查询参数返回 `400 validation_error`，不静默纠正。
- 新增 `page` 字段是向后兼容扩展；既有调用方仍可直接读取 `data`。

## 12. Webhook 事件

```text
payment_intent.authorization_required
payment_intent.authorized
transaction.funds_reserved
transaction.delivery_submitted
transaction.settled
transaction.refunded
transaction.disputed
receipt.issued
```

Webhook 使用事件 ID 去重；接收方应按至少一次投递处理，不依赖事件严格按序到达。

- Outbox 状态为 `pending / delivering / retrying / dead_letter / delivered`。
- 投递使用有限 Worker 租约；租约过期后允许恢复领取，并发 Worker 不得同时拥有同一投递。
- 非 2xx、网络异常或超时使用有上限的指数退避；达到最大尝试次数后必须进入 `dead_letter`。
- 只有死信允许人工重放；重放保留原 `event_id` 和载荷，不创建新的业务事件，并记录操作者与理由。
- `webhook-signature` 按 `版本=HMAC-SHA256` 表达；Secret 轮换重叠期可同时携带多个版本。
- Secret 只允许出现在写入请求和内部签名路径，不在公开资源、日志、事件或审计响应中返回。

## 13. 版本边界

- `/v1` 冻结资源名称、金额模型、状态语义和错误外壳。
- Phase 0 冻结同时覆盖 Transaction 列表分页、`X-Request-Id`、`X-Trace-Id`、运行时校验与 Receipt verify 响应。
- Access Contract v1 已覆盖环境绑定 API key、权限、claims、访问审计、Sandbox 租户重置与脱敏支持包；正式凭据签发、托管 edge 和 secret manager 仍属于部署准入，当前 Reference Server 不构成公开生产支付服务。
- x402、AP2、银行卡或稳定币只能作为 Adapter，不改变核心资源。
- P0 不承诺真实托管、换汇、跨链、收益或开放市场。

## 14. x402 未知结算恢复

- challenge 必须匹配配置的 scheme、network、asset 与 BU2 授权金额，任一不匹配均失败关闭。
- 付款请求超时、中断、5xx、成功响应缺少 `PAYMENT-RESPONSE` 或响应不可解释时保存 `provider_unknown`。
- `provider_unknown` 不等于失败或成功：Transaction 保持 `delivery_submitted`，内部金额保持 reserved，不签发 Receipt。
- 再次调用普通 settlement 必须返回 `x402_settlement_unknown`，不得再次提交付款。
- 恢复查询只能使用 Provider 明确支持的查询边界；官方协议没有通用查询时不得伪造链上结论。
- 每次实际恢复查询追加 `AdapterRecoveryAttempt`；只有明确 `settled` 才能完成 Transaction 并签发 Receipt。
