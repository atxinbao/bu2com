# F16a 内部 Sandbox 自主双向收付 Beta 验收契约 v1

日期：2026-09-09  
执行者：Codex  
状态：本地固定候选通过，待独立 R2 Domain 与 Architecture 审查  
适用范围：Phase 0 · Local Simulation / 内部 Sandbox-Testnet

## 1. 目标与放行边界

F16a 验证 BU2 是否已经能够在外部 Agent 的既有工作流中，以预授权的 Account/Agent、PaymentMandate 和 ExecutionSession 完成一次无人逐笔批准的双向业务闭环：买方 Agent 付款，卖方 Agent 收款，访问权益可恢复，退款受限，对账可重建，故障结果可见且不会重复产生资金事实。

本 PR 是本地固定候选的 Beta 证据，不是公网 Hosted、真实 Base Sepolia 或生产放行。当前测试使用 Local/Simulation；Sandbox/Testnet 的 `execution_disabled` 失败关闭仍是预期行为。真实 Sandbox 双向收付需要独立 ENV-07B 托管、Activation、资金和证据门槛。

## 2. 核心验收场景

### 2.1 无逐笔管理员批准的双向闭环

1. 为买方和卖方建立持久 Account/Agent 与已验证 Funding Source/Receiving Target。
2. 创建并激活买方 PaymentMandate 与短时 ExecutionSession。
3. 卖方 Agent 创建 Quote；买方 Agent 在预授权商户范围内创建 `deferred` PaymentIntent。
4. 买方 Agent 直接调用执行命令完成预留、交付和结算，不调用人工授权接口。
5. 卖方 Agent 为独立 Quote 创建 Receivable，验证入站付款并一次性入账。
6. 为已入账 Collection 创建 AccessGrant，模拟过期后由 Agent 恢复权益。
7. 执行有界部分退款，记录支付/收款/退款手续费并生成 `matched` ReconciliationRun。

正常路径的逐笔人工批准次数必须为 0；未经预授权的商户不能通过执行命令绕过 `review_required`。

### 2.2 故障与恢复

模拟结算 Provider unknown，确认 Transaction 停留在 `delivery_submitted`，不会错误签发 Receipt 或创建第二笔支付。进程重启后，使用显式 recovery 查询完成一次结算；重复 recovery 使用同一幂等键只返回原结果，ExecutionSession 支出只提交一次。

### 2.3 环境与越权失败关闭

Sandbox/Testnet 的会话激活在 `execution_disabled` 时必须失败；未预授权商户的 deferred Intent 必须保持 `requires_authorization`，执行命令返回 `operator_approval_required`，Wallet 不得发生预留。

## 3. 验收命令与证据

```bash
node --test sandbox/f16a.test.mjs
npm --prefix sandbox run test:f16a
```

预期结果：3/3 通过，覆盖：

1. 自主付款、收款、可恢复权益、退款和对账；
2. Provider unknown、SQLite 重启、显式恢复和无重复支付；
3. 未预授权商户与 Sandbox/Testnet disabled 的失败关闭。

完整门禁还必须通过 Sandbox 全量、F15a/F15b 回归、契约验证、SDK 生成/类型/Lint/build、Prototype lint/build 与 `git diff --check`。

## 4. 不变量与停止条件

- `refunded <= settled <= reserved <= authorized` 始终成立；
- Transaction、Collection、Refund、AccessGrant、ProviderFee 与 ReconciliationRun 是独立可追溯事实；
- 相同幂等键只产生一次业务结果，恢复不得重复 Provider 资金效果；
- `review_required`、Mandate 失效、Session 过期、余额不足和环境 disabled 均失败关闭；
- Receipt 只有在结算事实确认后签发；unknown 结果可见且可对账。

任一正常路径需要管理员逐笔批准、任一错误状态显示为成功、任一恢复产生重复事实、任一 Sandbox/Testnet disabled 入口被绕过，立即停止 F16a 放行，回到对应 F09b/F13/F14/F15a 修复。

F16a 通过本地候选验收不等于 G-F 或 ENV-07B 通过；外部机器、真实 Testnet 双向收付、Hosted 和 Live/Mainnet 仍需独立阶段与人工批准。
