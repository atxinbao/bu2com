# BU2 x402 Testnet 可信执行 v0.1

日期：2026-09-06

执行者：Codex

状态：Implemented locally · R2 review required

适用范围：Reference Sandbox v0.11 · Base Sepolia Testnet

## 1. 目标与边界

本版本关闭审计 F03、F04：BU2 必须证明实际签名的 x402 条款仍是用户已授权的条款，并在任何可能产生外部支付的调用前留下唯一、可恢复的 Payment Attempt。

该变更不修改公开 `/v1`、TypeScript SDK 或 MCP 契约，不启用 Mainnet、真实客户资金、托管或生产密钥。`paidFetch` 依赖注入仅用于本地故障测试；正式 Testnet 钱包路径固定使用官方 `@x402/core` / `@x402/fetch` v2.24.0 的 `onBeforePaymentCreation` hook。

## 2. 数据所有权与授权条款

Transaction Core 仍是交易状态唯一写入者。x402 Adapter 只保存 Provider 执行证据并返回结果，不直接把通道响应改成 BU2 已结算事实。

Reserve 预检成功后，SQLite `x402_authorizations` 以 `transaction_id` 保存：

- PaymentIntent、Quote、Authorization、PaymentMandate 与 BU2 Payee Account 关联；
- x402 version、scheme、network、asset、atomic amount、`payTo` 和 resource URL；
- 原始 `PaymentRequired`、选中的 `PaymentRequirements`、RFC 8785 JCS JSON 和 SHA-256 指纹。

同一 Transaction 的条款只能重复读取；不同指纹写入稳定返回 `x402_authorization_conflict`，不覆盖原授权。

## 3. 签名前最终一致性

钱包路径为每次 Settlement 创建独立官方 x402 Client，并把 BU2 校验注册到 `onBeforePaymentCreation`。官方 Client 在构造签名载荷前把当次 402 的选中条款交给 BU2；以下任一字段变化都返回 `x402_authorization_terms_changed`，Payment Attempt 进入 `rejected`，不会发送带支付签名的第二个 HTTP 请求：

```text
amount · asset · network · resource · payTo
```

初始预检同样拒绝 scheme、network、asset、amount、resource 或空 `payTo`。当前 Payee Account 到链上地址的可信注册仍属于后续身份/Mandate Gate；本版本解决的是预检与实际签名之间的条款漂移，不能扩张解释为多租户身份已经完成。

## 4. Payment Attempt 与事务边界

SQLite Schema v7 纯追加 `x402_authorizations` 与 `payment_attempts`。Settlement 在调用钱包或 Provider 前，用一个 `BEGIN IMMEDIATE` 事务同时写入：

```text
adapter_operations.status = payment_prepared
payment_attempts.status   = prepared
attempt_id + request_nonce + authorization_fingerprint
```

签名前校验通过后，两个投影同步进入 `payment_submitting/submitting`。确定结算时同步进入 `settled` 并保存真实 Provider 引用；超时、中断、5xx、响应丢失、解析失败、网络不匹配或缺少真实交易引用时进入 `provider_unknown`。本地哈希不得替代链上或 Provider 结算引用。

数据库唯一 `operation_key` 保证一笔 Transaction 只产生一个 Payment Attempt。进程内 Promise 只用于降低重复工作，不作为资金幂等保证。

## 5. 崩溃恢复

重启后发现 `payment_prepared`、`payment_submitting` 或 `provider_unknown` 均按“可能已经支付”处理：

- 普通 Settlement 返回 `x402_settlement_unknown`；
- 只允许调用显式 `settlement_recoveries`；
- 查询参数携带 attempt ID、稳定 nonce、授权指纹、amount、asset、network、resource 与 `payTo`；
- 未配置查询器、查询失败或结果不确定时继续冻结内部预留；
- 只有 Provider 明确返回 `settled` 且给出真实引用，Transaction Core 才完成结算并签发 Receipt。

恢复不会调用 `paidFetch`，也不会创建第二个 Payment Attempt。

## 6. 兼容、迁移与恢复方案

- Schema v7 只新增表和索引，不删除或改写 v1–v6 数据。
- 已完成的历史 x402 Transaction、Adapter operation 与 Receipt 继续可读。
- 旧版本留下但没有 `x402_authorizations` 的未结算 Testnet Transaction 必须失败关闭并重新取得明确授权，不自动付款。
- 回退应用时保留 v7 表；停止 x402 Adapter，所有未完成 Attempt 只读对账。前滚后继续按唯一 operation key 恢复。
- 公开 Agent Payment API、事件、Receipt、SDK 与 MCP 版本均不变。

## 7. 自动化验收

1. 授权快照包含业务关联及完整 x402 条款。
2. 官方 x402 签名前 hook 能阻止 `payTo` 漂移，且只发生预检与最终 402 两次无签名请求。
3. amount、asset、network、resource、`payTo` 任一变化均在 Provider 调用前拒绝。
4. Provider 执行边界观察到的 Attempt 已持久化为 `prepared`，签名前变为 `submitting`。
5. 在 `prepared` 后重启，普通 Settlement 不调用 Provider、不新增 Attempt，只能查询对账。
6. timeout、5xx、响应丢失与 Provider unknown 继续冻结重试和内部预留。
7. 并发 Settlement 只产生一个 Provider 调用、一张 Receipt 和一个 Payment Attempt。
8. 全量 Sandbox、API Contract、MCP、SDK、clean-room、Prototype lint/build 均持续通过。

上述证据只适用于本地 Simulation / Base Sepolia Testnet，不构成 Mainnet 或生产资金证明。
