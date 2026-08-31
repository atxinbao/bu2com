# BU2 信息架构 v0.2（Transaction-first）

更新日期：2026-09-01  
维护者：Codex

## 1. 导航结构

```text
BU2 Console
├── Transactions
│   └── Transaction Detail
├── Authorizations
├── Payment Mandates
├── Wallets & Limits
├── Agent Identities
├── Settlement Ledger
├── Developers
└── Workspace Settings
```

默认首页为 Transactions。BU2 不提供“创建任务”入口；交易从外部 Agent、API、SDK、MCP 或支付协议进入。

## 2. 页面职责

| 页面 | 主要问题 | 核心操作 |
| --- | --- | --- |
| Transactions | 哪些 Agent 正在收付款，资金处于什么状态 | 搜索、筛选、进入交易详情 |
| Transaction Detail | 谁向谁购买了什么，依据什么授权，是否交付和结算 | 授权、查看证据、确认交付、查看 Receipt |
| Authorizations | 哪些交易超出自动 Mandate | 授权、拒绝、调整授权范围 |
| Payment Mandates | Agent 可以在什么边界内自主支付 | 创建、测试、暂停和版本化规则 |
| Wallets & Limits | 哪些资金可用、已预留或已结算 | 绑定支付方式、设置限额、查看余额 |
| Agent Identities | 哪个 Agent 代表哪个 Account | 注册、验证、轮换和撤销身份凭证 |
| Settlement Ledger | 每次资金状态如何变化 | 对账、导出、查看退款和争议 |
| Developers | 如何嵌入现有 Agent | 获取 API、SDK、MCP 与协议示例 |

## 3. 对象关系

```text
Account 1 ── N Wallet
Account 1 ── N AgentIdentity
Account 1 ── N PaymentMandate

Seller Agent 1 ── N Quote
Quote 1 ── 0..N PaymentIntent
PaymentIntent 1 ── 1 AuthorizationDecision
PaymentIntent 1 ── 0..1 Transaction
Transaction 1 ── 0..N DeliveryEvidence
Transaction 1 ── 0..N SettlementEvent
Transaction 1 ── 0..1 Receipt
Transaction 1 ── 0..N Refund / Dispute
```

## 4. 交易详情信息层级

1. 交易摘要：金额、状态、商品或服务。
2. 交易双方：payer、payee、buyer agent、seller agent。
3. 授权依据：Mandate、命中规则或人工决策。
4. 资金状态：授权、预留、结算、退款。
5. 交付证据：交付摘要、哈希、验收方和时间。
6. Receipt：机器可读凭证和验证状态。
7. 外部上下文：可选的会话、任务或 Agent run 引用。

## 5. 状态模型

### Payment Intent

```text
created → quoted → authorization_required → authorized
                         ↘ declined / expired
```

### Transaction

```text
authorized → funds_reserved → service_delivered → settled
                          ↘ delivery_failed
settled → refunded / disputed
```

## 6. 嵌入边界

- ChatGPT、Codex、Claude 和自建 Agent 是任务入口。
- BU2 是收付、授权和结算入口。
- `external_context_id` 只用于解释交易来源。
- 外部任务内容不是完成支付所必需的 BU2 主数据。
