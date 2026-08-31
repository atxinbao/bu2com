# BU2 Agent Payment API 契约 v0.1

日期：2026-09-01  
执行者：Codex  
状态：P0 冻结候选

## 1. 设计原则

- BU2 是嵌入式 Agent 收付层，不是任务平台。
- 金额统一使用最小货币单位整数，例如 `3900 CNY = ¥39.00`。
- 所有创建与资金动作必须携带 `Idempotency-Key`。
- Quote、授权、资金预留、交付和结算是独立事件。
- 外部上下文可选，不要求上传完整会话或任务内容。
- 完成交易必须生成可验证 Receipt。

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
| Settlement | `stl_` | 资金结算事件 |
| Receipt | `rcpt_` | 双方可验证的交易凭证 |

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

- `POST /quotes`、`POST /payment_intents`、授权、交付、结算和退款均要求 `Idempotency-Key`。
- 同一 Account、同一路径、同一 Key 和相同请求体返回第一次结果。
- 同一 Key 配合不同请求体返回 `409 idempotency_conflict`。
- Key 至少保留 24 小时；资金动作建议永久绑定到业务记录。

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

## 9. 错误模型

```json
{
  "error": {
    "type": "invalid_state_transition",
    "code": "transaction_not_delivered",
    "message": "Transaction must be delivery_submitted before settlement.",
    "request_id": "req_01KBU2Z",
    "details": { "current_state": "funds_reserved" }
  }
}
```

P0 稳定错误类型：`validation_error`、`authentication_error`、`mandate_denied`、`insufficient_funds`、`idempotency_conflict`、`invalid_state_transition`、`resource_not_found`、`adapter_error`。

## 10. Webhook 事件

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

## 11. 版本边界

- `/v1` 冻结资源名称、金额模型、状态语义和错误外壳。
- x402、AP2、银行卡或稳定币只能作为 Adapter，不改变核心资源。
- P0 不承诺真实托管、换汇、跨链、收益或开放市场。
