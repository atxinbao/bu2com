# BU2 MVP 产品需求文档 v0.3（Transaction-first）

更新日期：2026-09-07
维护者：Codex

## 1. 目标

验证 AI 原生团队和 Agent 服务商是否需要一套嵌入式收付层，使 Agent 无需迁移工作流，就能在预先授权范围内自主报价、付款、收款、交付和结算。

## 2. 目标用户

- 买方：需要 Agent 自主采购数据、API 或其他 Agent 服务的团队。
- 卖方：向 Agent 提供数据、工具、内容或自动化服务的开发者与商户。
- 管理者：为 Agent 配置身份、资金来源和 Payment Mandate 的账户所有者。

## 3. P0 成功标准

- 5 个买方 Agent 和 5 个卖方 Agent 完成沙盒接入。
- 至少 100 笔 Payment Intent 进入 BU2。
- 至少 30 笔完成 `funds_reserved → delivered → settled`。
- 自动授权率达到 80%，且所有自动授权均可解释。
- 重复请求不产生重复预留或重复结算。
- 至少 2 个试点愿意继续接入真实支付通道。

以上是验证目标，不代表已有经营结果。

## 4. 核心对象

```text
Account
  ├── Wallets
  ├── Payment Mandates
  └── Agent Identities

Quote
  → Payment Intent
      → Authorization
      → Transaction
          → Delivery Evidence
          → Settlement
          → Receipt
          → Refund / Dispute
```

## 5. 核心流程

### 5.1 Agent 付款

```text
外部 Agent 发现付费服务
  → 获取卖方 Quote
  → 调用 BU2 创建 Payment Intent
  → Mandate 自动允许 / 请求确认 / 拒绝
  → 预留资金
  → 卖方交付
  → 验收交付证据
  → 结算
  → 返回 Receipt 给双方 Agent
```

### 5.2 Agent 收款

```text
卖方 Agent 发布报价
  → 买方 Agent 接受报价
  → BU2 获得付款授权并预留资金
  → 卖方 Agent 获得交付许可
  → 提交 Delivery Evidence
  → 结算到卖方账户
  → 双方获得 Receipt
```

用户不需要在 BU2 创建 Task。ChatGPT 会话、Codex 任务或 Agent run 仅通过 `external_context_id` 关联交易。

## 6. P0 功能需求

### F01 Agent Identity

- 注册买方或卖方 Agent。
- 绑定 Agent 所代表的 Account。
- 签发、轮换和撤销接入凭证。
- 在 Receipt 中记录交易时使用的身份版本。

### F02 Wallet 与限额

- 管理演示资金余额、可用额度和已预留资金。
- 区分余额、授权金额、预留金额和已结算金额。
- 支持单笔、单日和单月限额。

### F03 Payment Mandate

- 按金额、币种、服务类别、商户、Agent、时间和有效期配置规则。
- 支持自动允许、请求确认和拒绝。
- 每次判断返回命中规则和可追踪决策 ID。

### F04 Quote 与 Payment Intent

- Quote 明确商品或服务、价格、币种、卖方、有效期和交付条件。
- Payment Intent 明确付款方、收款方、买卖双方 Agent、用途和外部上下文。
- 支持幂等键，重复请求返回原交易。

### F05 Authorization 与资金预留

- 自动授权引用 Payment Mandate。
- 人工授权记录操作者、时间和范围。
- 授权后先预留资金，不直接标记为已结算。
- 拒绝或过期后不可继续交付和结算。

### F06 Delivery 与 Settlement

- 卖方提交机器可读 Delivery Evidence。
- 根据报价约定由买方、规则或外部证明完成验收。
- 验收成功后结算；失败时释放预留或进入退款/争议分支。

### F07 预算预留与财务记账

- 为 Workspace、Project、Account 或 Agent 维护可解释的预算边界。
- 在授权与实际支付之间建立幂等的 Budget Hold，区分余额、授权、预留、结算和退款。
- 将资金事件写入追加式 Ledger Entry / Financial Posting；更正只能通过新事件完成。
- 预算预留、账本事件、业务状态和 Outbox 必须在同一事务边界内提交，并支持并发与重启恢复。

### F08 版本化 Payment Mandate

- 用版本化 Mandate 明确 Agent 可使用的金额、币种、收款方、用途、环境、有效期和资源范围。
- 支持自动允许、拒绝、暂停、撤销和人工审批，并返回可追踪的 Policy Decision。
- Mandate 必须绑定 Account、Agent、Funding Source 与 Receiving Target；Agent 不得自行扩大授权。
- Mandate 规则在 F09a/F09b 执行与恢复路径中作为唯一授权来源。

## 7. P0 页面

1. Transactions
2. Transaction Detail
3. Authorizations
4. Payment Mandates
5. Wallets & Limits
6. Agent Identities
7. Settlement Ledger
8. Developers

## 8. 发布门槛

- 正常、拒绝、过期、交付失败、退款和争议状态均可重放。
- 重复幂等键不会产生重复资金动作。
- 授权、预留、结算和退款金额能够严格对账。
- 未交付或未验收交易不能进入 settled。
- 被撤销的 Agent 凭证不能创建新的 Payment Intent。
- 每笔完成交易都能验证 Receipt。
- 页面明确标注 P0 为演示资金，不误述为真实托管。

## 9. 协议边界

- P0：BU2 内部规范与演示资金适配器。
- P1：选择一个沙盒支付通道完成真实小额闭环。
- x402：作为机器购买 API/内容的支付适配器，不定义 BU2 全部业务对象。
- AP2：在多商户和多支付方式阶段评估为授权与支付互操作层。
