# F09a 自主支付执行契约 v1

日期：2026-09-08  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查  
适用范围：Phase 0 Reference Sandbox · Local / Sandbox / Base Sepolia Testnet

## 1. 目的

F09a 把 F08 已批准的 `PaymentIntent` 交给 Agent 自主执行，不再要求管理员对每一笔已经满足 Mandate 的请求重复点击批准。F09a 只负责执行边界，不改变 PaymentMandate 的授权语义，也不负责 Provider 未知结果恢复。

## 2. 执行模式

`CreatePaymentIntent.execution_mode` 可取：

- `immediate`（默认）：F08 返回 `approved` 后，沿现有 Transaction Core 立即预留资金。
- `deferred`：F08 返回 `approved` 后只将 PaymentIntent 置为 `authorized`，由 Agent 后续调用执行命令。

`review_required` 和 `denied` 不受执行模式影响；它们不能创建 Transaction 或 Budget Hold。

## 3. 执行命令

```text
POST /v1/payment_intents/{payment_intent_id}/execution
Idempotency-Key: <unique-key>
{}
```

执行命令必须满足：

1. PaymentIntent 当前状态为 `authorized`；`funds_reserved` 重放直接返回原结果；`requires_authorization` 明确返回 `operator_approval_required`。
2. `authorization.decision=allowed` 且关联 `PolicyDecision.decision=approved`。
3. PaymentMandate 仍为同一版本且状态为 `active`；暂停、撤销、过期或版本漂移失败关闭。
4. 继续复用现有 `reserve()`、Budget Hold、Adapter、Wallet CAS、LedgerEvent、Webhook Outbox 和 SQLite 原子提交。
5. 同一幂等键和相同载荷只产生一个执行结果，不得重复调用 Adapter 或预留余额。

TypeScript SDK 暴露 `executePaymentIntent(paymentIntentId, options)`；Agent 仍必须先通过环境预检，Sandbox/Testnet 仍受 `execution_status` 门禁约束。

## 4. 状态与事实

```text
PaymentIntent created
  → F08 PolicyDecision approved
  → authorized (deferred)
  → F09a execution_requested
  → funds_reserved
```

`execution_requested` 是审计事件，不是新的授权事实。授权、预留、交付、结算和退款仍保持独立；F09a 不签发 Receipt，不代表 Provider 已结算。

## 5. 失败与恢复

- Mandate 不 active、版本不一致、PolicyDecision 非 approved 或状态不允许执行：失败关闭，不移动余额。
- Adapter 失败：沿用现有原子回滚，Intent 保持可查询状态；不由 F09a 自动重试。
- Adapter 超时或结果未知：交给 F09b 的查询/恢复流程，禁止重复付款。
- 服务重启：依靠既有 processing Claim 与资源恢复；执行命令重放只返回成功事实或结果未知。

## 6. 权限与环境边界

- Agent 需要 `payment_intents:execute`，只能执行其 Account/Agent 范围内的 Intent。
- Developer 可在其声明范围内使用同一能力；Operator 不获得 Agent 的自主支付范围。
- F09a 不增加 Mandate、预算、商户、Provider、资产、网络或环境权限。
- 不启用 Live/Mainnet、托管、生产凭证或 Hosted 外部验收；真实 Testnet 双向收付另由 F15/F16 证据门禁决定。

## 7. 验收标准

- 已批准的 deferred Intent 可由 Agent 执行，无管理员授权请求。
- 同一执行命令重放不会重复预留或调用 Adapter。
- review-required Intent 不能通过执行命令绕过人工审批。
- Mandate 暂停、撤销、过期或版本漂移会阻止执行。
- 既有金额不变量、幂等、并发、故障注入、重启恢复和环境门禁保持通过。

F09a 代码 PR 必须由独立 Domain 与 Architecture 审查者批准；本契约不构成真实资金或生产执行授权。
