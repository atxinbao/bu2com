# F08 版本化 Payment Mandate 契约 v1

日期：2026-09-08
执行者：Codex
状态：D2 文档基线，待 R2 独立人工审查
适用范围：Phase 0 Reference Sandbox · Local / Sandbox / Base Sepolia Testnet

## 1. 目的与非目标

F08 冻结 Agent 发起资金动作前的唯一授权事实：版本化 `PaymentMandate` 以及与之对应的确定性 `PolicyDecision`。它回答“这个 Agent 是否有权在这些条件下发起这笔资金动作”，不回答预算是否还有额度，也不代表 Provider 已付款。

F08 必须复用现有 Account、Agent、Funding Source、Receiving Target、PaymentIntent、Transaction Core、幂等 Claim、状态版本 CAS 和 F07 Budget Hold 能力。F08 通过后，才允许进入预算预留；预算充足不能覆盖 Mandate 拒绝。

本契约不包含：Provider 调用、Signer、x402/AP2 执行、收款、交付、结算、退款、托管钱包、Mainnet、生产凭证或 Live 环境启用。F08 不建设 BU2 Task 平台，`task_id` 只作为外部执行上下文的可选关联。

## 2. 核心对象

### 2.1 PaymentMandate

`PaymentMandate` 是不可静默覆盖的授权版本。每次修改都创建新版本，历史版本和已产生的决策继续可重放。

```text
mandate_id             mdt_...
account_id             acct_...
agent_id               agt_...
funding_source_id      fsrc_...
receiving_target_id    rct_...
version                正整数
status                 draft | active | suspended | revoked | expired
environment            local | sandbox | live
currency               ISO 4217 大写代码
max_single_amount      非负整数（最小货币单位）
daily_limit            非负整数
monthly_limit          非负整数
merchant_allowlist     商户标识数组，可空
merchant_denylist      商户标识数组，可空
category_allowlist     资源或服务类别数组，可空
purpose_constraints    结构化用途约束
resource_constraints   模型、工具、商品或资源范围约束
effective_at           ISO-8601
expires_at             ISO-8601，可空但不得早于 effective_at
created_at             ISO-8601
created_by             Principal / 操作来源
supersedes_version     可空，指向上一版本
```

金额始终使用整数最小货币单位，且 `currency` 必须同时存在于 Mandate、PaymentIntent、Quote 和后续预算事实中。`environment` 是授权条件，不得从 Adapter 名称、网络名称或布尔开关推导资金许可。

### 2.2 PolicyDecision

每个 Spend Request 或 PaymentIntent 必须产生且只产生一个确定性决策事实；重复读取返回同一事实。

```text
decision_id             dec_...
mandate_id              mdt_...
mandate_version         正整数
decision                approved | review_required | denied
request_fingerprint     规范化输入指纹
input_snapshot          决策所用的结构化输入快照
matched_rules           稳定规则标识数组
reason_codes            稳定拒绝、审批或允许原因数组
budget_context          预算版本、额度和评估时快照
effective_until         决策有效期
idempotency_key         决策幂等键
request_id              BU2 请求关联
trace_id                Agent 执行关联
created_at              ISO-8601
```

`approved` 表示满足 Mandate 和 Policy 硬约束，可进入 F07 Budget Hold；`review_required` 表示未违反硬约束但需要人工确认；`denied` 表示违反硬约束或缺少必要上下文。决策结果不得只依赖自然语言解释，必须能由输入快照、版本和稳定规则重放。

### 2.3 Authorization 引用

PaymentIntent、Transaction 和 Receipt 只能引用 `decision_id`、`mandate_id` 与 `mandate_version`，不能只保存当前 Mandate 的 ID。Mandate 版本、决策指纹和命中规则进入交易审计与 Receipt 关联字段。

## 3. Mandate 状态机

```text
draft → active → suspended
              ↘ revoked
              ↘ expired
```

允许的操作：

| 当前状态 | 操作 | 下一状态 | 说明 |
| --- | --- | --- | --- |
| draft | activate | active | 校验全部绑定、范围和生效时间 |
| active | suspend | suspended | 暂停尚未执行的授权，不删除历史 |
| active | revoke | revoked | 立即撤销尚未执行的授权 |
| active | expire | expired | 到达 `expires_at` 后自动或显式标记 |
| suspended | activate | active | 仅在未撤销、未过期且重新满足绑定校验时允许 |
| suspended | revoke | revoked | 终止尚未执行的授权 |
| draft / active / suspended | replace | 新版本 draft | 原版本保持不可变，新版本需重新激活 |
| revoked / expired | 任意重新激活 | 拒绝 | 终态不可重新激活 |

撤销或暂停不追溯改变已经完成的资金动作；对尚未进入执行的授权必须失败关闭。修改任何金额、币种、商户、类别、用途、资源、环境、收款目标或有效期都必须创建新版本。

## 4. 绑定与授权边界

Mandate 激活前必须绑定并验证：

- `Account`：授权资金主体与租户边界；
- `Agent`：代表该 Account 发起请求的身份；
- `Funding Source`：同一环境、网络、资产和 Account 下的资金来源；
- `Receiving Target`：已验证的收款目标或交易对手边界；
- `Environment`：`local`、`sandbox` 或 `live`，不能跨环境复用。

Agent、模型输出、外部网页内容或 PaymentIntent 不能扩大以下范围：

- 单笔、每日、每月金额；
- 币种、资产、网络或环境；
- 商户、收款目标、类别或资源；
- 用途约束、有效期或审批条件。

调用方提供的字段必须与 Mandate、Quote、Account、Funding Source 和 Receiving Target 逐项比较；缺失、漂移、未验证、停用或跨租户引用均返回确定性拒绝，不使用默认演示值兜底。

## 5. 确定性决策顺序

一次决策必须按以下顺序执行，前置失败不可被后续规则覆盖：

1. Workspace 冻结、Account 状态或 Agent 是否停用；
2. Mandate 状态、版本、有效期和环境；
3. Account、Agent、Funding Source、Receiving Target 绑定及租户归属；
4. 输入完整性、金额/币种/资源规范化和幂等；
5. 单笔、每日、每月 Mandate 硬上限；
6. 商户、收款目标、类别、用途和资源范围；
7. F07 Budget Scope 的可用额度（仅用于后续预留，不替代授权）；
8. 人工审批条件；
9. 自动批准。

决策返回必须包含 `decision`、`decision_id`、Mandate 版本、有效期、命中规则、稳定原因码和预算上下文。相同版本和相同规范化输入必须得到相同结果。

## 6. 与 F07 Budget Hold 的边界

```text
PaymentIntent / Spend Request
  → F08 Mandate PolicyDecision
  → approved
  → F07 Budget Hold
  → F09a 自主执行
```

- Mandate 决定“是否有权发起资金动作”；
- Budget 决定“是否有可预留额度”；
- Budget Hold 不是授权，也不能生成或扩大 Mandate；
- `review_required` 或 `denied` 不得创建 Budget Hold；
- Budget 充足不能覆盖 Mandate 拒绝、暂停、撤销、过期或绑定错误；
- F07 只消费已批准授权引用，不重新解释或扩大历史 Mandate。

## 7. 幂等、并发与重放

F08 必须满足以下不变量：

1. 同一 `mandate_id + version` 不可静默覆盖；新版本拥有独立 ID/版本和激活审计。
2. 同一 Account、决策路径、幂等键和相同载荷只产生一个 `PolicyDecision`。
3. 相同幂等键复用不同载荷、Mandate 版本、金额、币种、收款目标或环境时返回 `idempotency_conflict`。
4. 并发激活、暂停、撤销或替换使用状态版本 CAS；陈旧版本不能覆盖新状态。
5. 并发决策固定引用同一个已激活版本；版本切换不产生半个旧版本、半个新版本的结果。
6. 历史决策绑定历史 Mandate 版本和输入快照；策略修改不重解释历史交易。
7. 紧急暂停/撤销只影响尚未执行的授权；已完成的预留、结算和 Receipt 通过既有恢复、退款或对账流程处理。

建议幂等作用域：

```text
mandates:{mandate_id}:activate:{version}
mandates:{mandate_id}:suspend:{version}
mandates:{mandate_id}:revoke:{version}
policy-decisions:{account_id}:{idempotency_key}
```

未知或崩溃结果只能查询已写入的决策事实；F08 不自动调用 Provider、不重新付款、不自动创建第二个 Mandate 版本。

## 8. API、事件和持久化映射

F08 运行时按本契约落地，OpenAPI、TypeScript SDK、持久化迁移、错误码和测试在同一变更中同步更新。Mandate 与 PolicyDecision 继续复用通用 `resources` 表，新增 SQLite Schema v13 索引，不改写既有交易历史。

HTTP API 为 `GET/POST /v1/payment_mandates`、`GET /v1/payment_mandates/{mandate_id}`，以及 `POST /v1/payment_mandates/{mandate_id}/{activate|suspend|revoke|expire}`。所有写操作要求 `Idempotency-Key` 与 `version`（状态转换），SDK 提供对应的列表、创建、查询和转换方法。

预计资源与事件：

- `PaymentMandate`：创建草稿、激活、暂停、撤销和版本查询；
- `PolicyDecision`：确定性决策及其输入快照；
- `mandate.activated`、`mandate.suspended`、`mandate.revoked`、`mandate.expired`；
- `payment_intent.policy_decided` 或等价审计事件；PaymentIntent 保存 `policy_decision_id`、`mandate_version` 和完整决策快照。

所有资金相关写操作仍需环境契约校验、`Idempotency-Key`、`X-Trace-Id` 和 Account/Agent 权限校验。决策、状态变更与审计 Outbox 必须遵循既有 SQLite 原子提交边界；外部 Adapter 调用不得持有写锁。持久化运行时激活 Mandate 时会强制验证 active/verified Funding Source 与 Receiving Target；无持久绑定的纯内存单元测试仅用于策略逻辑验证。

## 9. F09 边界

F08 只负责版本化授权和确定性 `PolicyDecision`：

- F09a 才执行已批准的自主付款命令，不再逐笔依赖管理员代批准；
- F09b 才处理 Adapter 未知结果、查询和证据化恢复；
- F10/F11 才实现收款、应收和入账；
- F12/F13/F14 才实现交付权益、取消退款和财务对账；
- F15a/F16a 才验证内部 Sandbox 自主双向收付 Beta。

F08 不调用 Provider、Signer、x402、AP2 或链上 RPC，也不改变 `execution_status`。

## 10. 验收门槛

- 创建、激活、暂停、撤销、过期和版本替换均可查询且有审计事实；
- Account、Agent、Funding Source、Receiving Target、环境和 Mandate 版本不匹配时失败关闭；
- `approved`、`review_required`、`denied` 均返回可重放的输入、版本、规则和原因；
- 同键同载荷只产生一次决策，同键不同载荷返回冲突；
- 并发状态操作不会复活终态、覆盖版本或扩大授权；
- `review_required` / `denied` 不创建 Budget Hold，`approved` 才能进入 F07；
- 重启后 Mandate、PolicyDecision、幂等事实和审计事件可恢复；
- Local / Sandbox / Base Sepolia Testnet 边界继续可见；Live/Mainnet、托管和生产凭证保持关闭。

F08 代码 PR 必须标记 R2，并由独立 Domain 与 Architecture 审查者批准；D2 文档合并不等于 F08 代码获准，也不等于 Testnet 双向收付或 Hosted Sandbox 已验收。

## 11. 明确不变的边界

- F07 Budget Hold 仍是授权后的预算预留，不反向生成 Mandate；
- PaymentIntent、Transaction、Receipt 必须保留 Mandate ID、版本和 PolicyDecision 引用；
- 外部 Agent 继续在自己的工作流中发起交易，BU2 不要求用户在平台创建 Task；
- Sandbox 继续使用 Base Sepolia 和 x402 测试语义；
- Live/Mainnet、真实生产资金、托管钱包、法币清算和无人值守生产执行继续关闭。
