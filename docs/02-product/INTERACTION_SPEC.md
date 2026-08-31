# BU2 P0 页面与交互规格 v0.3（Transaction-first）

日期：2026-09-01
执行者：Codex

## 1. 原型目标

BU2 是嵌入既有 Agent 工作流的 AI 收付平台。用户不需要在 BU2 创建任务；原型验证一笔外部 Agent 交易能否完成识别、授权、支付、交付、结算和凭证追溯。

```text
外部 Agent 发起交易
  → Transactions 发现交易
  → 查看交易双方、商品与授权依据
  → 自动授权 / 人工确认 / 拒绝
  → 支付通道执行
  → 提交并确认交付
  → 结算并生成可验证 Receipt
```

原型位置：`/Users/mac/Documents/bu2com/prototype`

## 2. 全局框架

### 2.1 导航

- Transactions：默认首页，承载主路径。
- Authorizations：仅处理 Mandate 无法自动决定的例外。
- Payment Mandates：配置 Agent 可自主支付的边界。
- Wallets & Limits：展示余额、限额、预留与可用资金。
- Agent Identities：展示 Agent 与账户所有者的代表关系。
- Settlement Ledger：查看不可覆盖的资金状态事件。
- Developers：提供 API、MCP、Webhook 和支付通道接入信息。

导航中的待处理数量必须与页面内容、交易列表和详情状态同步。

### 2.2 语言与响应式

- 支持全中文和全英文即时切换；同一页面不得混用界面语言。
- 交易 ID、Receipt ID、链上哈希、模型名、协议名和自定义 Agent 名称保持原值。
- 桌面端显示完整侧栏；窄屏保留主内容和必要操作，列表改为可读的纵向布局。

## 3. Transactions（默认首页）

每行至少展示：交易 ID、状态、付款方、收款方、买方 Agent、卖方 Agent、商品或服务、金额与币种、支付通道、外部上下文及更新时间。

用户点击任意交易只能打开该交易对应的详情。状态需要明确区分：

`authorization_required → authorized → funds_reserved → service_delivered → settled`

异常分支为 `declined / expired / delivery_failed / refunded / disputed`。列表不得把授权额度、预留资金或预计金额显示为已结算金额。

## 4. Transaction Detail

详情由五个区域组成：

1. 交易摘要：交易双方、Agent、商品、金额、币种与外部上下文。
2. 授权依据：生效 Mandate、判断结果、理由、版本和人工决定。
3. 支付通道：Adapter、网络、资产、provider reference 与链上哈希。
4. 交付与结算：交付证据、验收结果、结算状态和失败原因。
5. 时间线与 Receipt：按发生顺序展示不可覆盖事件，并提供 Receipt ID 与验证状态。

在 `funds_reserved` 之前不得出现“已结算”；交付未验证时不得生成完成态 Receipt。

## 5. Authorizations

Authorizations 是例外队列，不是所有付款的必经步骤。每项必须直接回答：

- 谁代表谁付款，向谁购买什么？
- 金额、币种和外部上下文是什么？
- 命中了哪个 Mandate，为什么不能自动决定？
- 批准、拒绝分别会导致什么资金状态？

批准只创建授权并进入资金预留，不得直接标记结算；拒绝必须记录决定者、时间和理由。处理后队列数量、导航徽标、交易列表和详情同步更新。

## 6. Payment Mandates

用户可定义金额、周期额度、商户、资产、网络、Agent、环境和有效期。规则结果只有自动允许、人工确认或拒绝。规则修改产生新版本，不重写历史交易。

## 7. Wallets、Ledger 与 Developers

- Wallets & Limits 分开显示总余额、已预留、可用余额和已结算金额。
- Settlement Ledger 只追加资金状态事件，不覆盖历史记录，并可按交易下钻。
- Developers 展示当前环境、API 地址、MCP 工具、Webhook 状态和 Adapter 能力；Simulation、Testnet 与 Mainnet 必须明确标识。

## 8. x402 交易

x402 是支付通道 Adapter，不替代 BU2 的 Mandate、交付验证与 Receipt。详情页必须展示协议版本、网络、资产、facilitator、支付响应、链上哈希和 Receipt 验证结果。

x402 的 HTTP 402 challenge 仅表示需要支付，不等于资金已经预留或结算成功。

## 9. P0 验收路径

1. 默认进入 Transactions，不要求创建 Task。
2. 打开待授权交易，完整识别交易参与方、商品、金额和外部上下文。
3. 理解 Mandate 判断及人工确认原因。
4. 授权后只进入 `funds_reserved`。
5. 提交并确认交付后进入 `settled`。
6. 查看支付通道证据和机器可读 Receipt。
7. 返回列表，状态与所有待处理数量同步。
8. 切换中英文，完成同一路径且无语言残留。

详细判定使用 [Transaction-first P0 验收方案](TRANSACTION_P0_ACCEPTANCE.md)。历史 Task-first 规格已废止，仅保留在 [Task-first P0 产品基线](P0_TASK_FIRST_BASELINE.md) 中作为决策记录。
