# BU2 x402 Sandbox Adapter v0.4

日期：2026-09-06  
执行者：Codex

## 目标与边界

BU2 将 x402 作为外部支付 Adapter，继续复用 `Quote`、`PaymentIntent`、`Transaction`、`Settlement` 和 `Receipt`。x402 不替代 Mandate、策略判断、交付证据或统一 Receipt。

v0.4 完成 Testnet 失败恢复闭环：挑战必须匹配 `exact`、Base Sepolia、指定 USDC 合约和 BU2 授权金额；可能已经付款但没有确定响应的结算持久化为 `provider_unknown`，普通结算入口不再发起第二次支付。只有显式恢复查询确认 `settled` 后，BU2 才释放内部预留并签发 Receipt。

该实现仅覆盖 Simulation / Base Sepolia。默认 Reference Server 仍使用 SimulatedPaymentAdapter；Mainnet、托管和生产密钥保持 NO-GO。

## 协议映射

| BU2 阶段 | x402 动作 | v0.4 行为 |
| --- | --- | --- |
| Mandate / PolicyDecision | BU2 内部判断 | 不变 |
| Reserve preparation | 获取并校验 402 challenge | 校验 scheme、network、asset、amount |
| Settlement | 携带 `PAYMENT-SIGNATURE` 重试 | 成功写入 provider reference；明确失败失败关闭 |
| Unknown result | 超时、5xx、响应缺失或响应不可解析 | 保存 `provider_unknown`，阻止再次付款 |
| Recovery | Provider-specific 查询 | 追加恢复审计；只有 `settled` 才完成核心结算 |
| Receipt | 写入通道交易引用 | 仅确定结算后签发并验证 |

x402 的 HTTP 402 challenge 只是付款要求，不是链上资金预留。Adapter 的 `payment_required` 状态不能对外表述为资金已锁定。

## 固定配置

- 协议：x402 v2，scheme `exact`。
- 网络：`eip155:84532`（Base Sepolia）。
- 测试网 USDC：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。
- 演示价格：0.01 USD，对应 10,000 USDC atomic units。
- Facilitator：`https://x402.org/facilitator`。
- 本地资源：`http://127.0.0.1:4021/premium-data`。

## 结果分类

### 成功

`PAYMENT-RESPONSE` 必须可解析、`success=true` 且 network 与配置一致。BU2 保存链上交易引用或稳定 provider reference，然后完成 `transaction.settled` 与 `receipt.issued`。

### 明确失败

未签名、HTTP 4xx 或 provider 明确返回 `success=false` 时返回稳定错误，不写入成功结算。

### 结果未知

付款请求超时/中断、HTTP 5xx、成功响应缺少 `PAYMENT-RESPONSE`、响应无法解析或响应 network 不一致时，Adapter 保存：

- `status=provider_unknown`；
- 确定性的内部 recovery reference（不是链上哈希）；
- `reason_code`、更新时间和原关联字段。

此时 Transaction 保持 `delivery_submitted`，内部金额保持 reserved，Receipt 不存在。再次调用普通 settlement 返回 `x402_settlement_unknown`，不会重新执行 `paidFetch`。

## 恢复契约

```http
POST /v1/transactions/{transaction_id}/settlement_recoveries
Idempotency-Key: <stable-key>
Content-Type: application/json

{}
```

恢复查询通过 `recoveryQuery` Adapter 边界注入。官方 x402 v2.24.0 SDK 没有按 BU2 `transaction_id` 查询结算结果的通用方法，因此 Reference Server 不伪造协议能力：未配置查询器时返回 `provider_unknown / x402_recovery_unavailable`。

每次实际查询写入不可变的 `adapter_recovery_attempts`。同一 HTTP 幂等键返回原结果，不重复查询。查询结果仍未知时不改变交易和资金；确认 `settled` 时更新 Adapter operation，并复用正常结算逻辑签发一张 Receipt。

## 数据与恢复

SQLite schema v4 只追加：

- `adapter_operations.last_error / updated_at / resolved_at`；
- `adapter_recovery_attempts` 追加审计表。

旧数据库自动迁移且历史操作继续可读。若 v0.4 出现问题，停止 x402 Adapter 并切回 Simulation；保留所有 `provider_unknown` 记录进行只读对账，不删除或改写历史 LedgerEvent。

## 验证范围

- challenge amount/network/asset mismatch；
- signer 缺失、明确失败、timeout、5xx 与响应丢失；
- unknown 后重复 settlement 不再次付款；
- 进程重启后仍保持阻断；
- unresolved recovery 不释放、不签发；
- settled recovery 释放预留、产生稳定引用与有效 Receipt；
- recovery HTTP 幂等与追加审计；
- Base Sepolia 正常成功路径回归。

## 资料来源

- https://github.com/x402-foundation/x402
- https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- https://docs.x402.org/getting-started/quickstart-for-sellers
- https://docs.x402.org/core-concepts/network-and-token-support
- 本地锁定 SDK：`sandbox/node_modules/@x402/core` 与 `sandbox/node_modules/@x402/fetch`，版本 `2.24.0`
