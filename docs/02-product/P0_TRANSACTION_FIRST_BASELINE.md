# BU2 Transaction-first P0 产品基线

日期：2026-09-01  
执行者：Codex

> 2026-09-10 状态说明：本文件继续作为 Transaction-first **交易领域语义基线**，保留授权、预留、交付、结算与退款的状态约束；首个上层产品方向已进入社交钱包 Foundation 接入收口，产品读写与余额边界以 [`SOCIAL_WALLET_INTEGRATION_BOUNDARY.md`](SOCIAL_WALLET_INTEGRATION_BOUNDARY.md) 为准。当前没有完成运行时多账户余额切换，本说明不授权直接读取账表或把既有 `Wallet` 当成社交钱包正式余额。

## 1. 产品定位

BU2.com 是 **Agent 的 AI 收付平台**。它让任何 Agent 在账户所有者预先授权的范围内自主收款与付款，并完成交易验证、交付、结算、退款和追溯。

> BU2 不要求用户创建任务，也不替代 ChatGPT、Codex、Claude 或其他 Agent 平台；BU2 作为支付层嵌入既有 Agent 工作流。

## 2. P0 核心闭环

```text
买方 Agent 发现付费服务
  → 卖方 Agent 报价
  → 创建 Payment Intent
  → BU2 检查 Payment Mandate
  → 自动授权 / 请求确认 / 拒绝
  → 资金预留
  → 卖方交付
  → 买方或规则验收
  → 资金结算
  → 双方获得机器可读 Receipt
```

P0 使用演示资金，但必须按真实资金状态演示，不允许把“授权”“预留”和“结算”混为一体。

## 3. 核心对象

```text
Account
AgentIdentity
Wallet
PaymentMandate
Quote
PaymentIntent
Authorization
Transaction
DeliveryEvidence
Settlement
Receipt
Refund
Dispute
```

`external_context_id` 和 `external_context_type` 用于关联 ChatGPT 会话、Codex 任务、Agent run 或自动化工作流。外部任务不是 BU2 的核心对象。

## 4. 不可破坏契约

- 每个 Payment Intent 必须明确付款方、收款方、买方 Agent、卖方 Agent、金额、币种和用途。
- 每次授权必须引用生效的 Payment Mandate 或人工决策。
- `authorized`、`funds_reserved`、`delivered` 和 `settled` 是不同状态。
- 未验证交付不得自动标记为结算完成。
- 每次资金状态变化追加写入账本，不覆盖历史记录。
- 每笔完成交易必须生成可验证、机器可读的 Receipt。
- 重复幂等键不得产生重复预留或重复扣款。

## 5. 状态机

```text
created → quoted → authorization_required → authorized
  → funds_reserved → service_delivered → settled

异常分支：declined / expired / delivery_failed / refunded / disputed
```

## 6. P0 产品页面

1. Transactions：默认首页，展示所有 Agent 收付款活动。
2. Transaction Detail：展示交易双方、Agent、授权依据、资金状态、交付证据和凭证。
3. Authorizations：只处理 Mandate 无法自动决定的例外。
4. Payment Mandates：定义 Agent 自主支付边界。
5. Wallets & Limits：管理资金来源、余额、预留和限额。
6. Agent Identities：管理谁代表谁发起或接收交易。
7. Settlement Ledger：查看不可覆盖的资金状态记录。
8. Developers：提供 API、SDK、MCP 和协议接入。

## 7. P0 演示验收

用户无需在 BU2 创建任务，能够完成：

1. 从 Transactions 发现一笔由外部 Agent 发起的待授权交易。
2. 识别付款方、收款方、买方 Agent、卖方 Agent、商品、金额和外部上下文。
3. 查看命中的 Payment Mandate 及需要确认的原因。
4. 授权后看到状态变为 `funds_reserved`，而不是立即结算。
5. 确认交付后看到交易变为 `settled`。
6. 获得包含交易和交付证据的机器可读 Receipt。
7. Authorizations 数量、交易列表和详情状态同步更新。

## 8. P0 非目标

- 不管理 Agent 的完整任务生命周期。
- 不以模型 Token 成本治理作为核心购买理由。
- 不要求用户迁移至 BU2 创建工作流。
- 不在 P0 承诺持有真实资金或覆盖全部支付通道。
- 不把 ChatGPT Business 的工作区统计等同于实时支付控制。

## 9. 北极星指标

> 通过 BU2 完成授权、交付和结算，并生成可验证凭证的 Agent 交易数量。

配套指标：自动授权率、支付成功率、交付后结算率、人工确认时延、退款率、争议率、买卖双方活跃 Agent 数和交易总额。
