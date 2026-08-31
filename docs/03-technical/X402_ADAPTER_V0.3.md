# BU2 x402 Sandbox Adapter v0.3

日期：2026-09-01  
执行者：Codex

## 目标与边界

保持 `Quote`、`PaymentIntent`、`Transaction`、`Settlement` 和 `Receipt` 不变，将 x402 作为外部支付 Adapter。x402 不替代 BU2 的 Mandate、策略判断、交付证据或统一 Receipt。

已实现：官方 x402 Express 商户、公共 facilitator client、Base Sepolia `exact` scheme、v2 挑战解析、金额校验、Adapter 幂等，以及 `PAYMENT-RESPONSE` 到 provider reference 的映射。无买方签名钱包时 fail-closed，不写入成功结算。

真实 Base Sepolia 结算已经完成。默认 3100 Reference Server 仍使用 SimulatedPaymentAdapter；独立 3101 Reference Server 使用 x402 Adapter，以免测试网资金通道影响原有 CNY 演示数据。

Reference Server 已完成异步 Adapter 编排：授权、内部预留和结算会等待通道结果；reserve 失败会恢复为可审批状态，settle 失败会保留 `delivery_submitted` 与内部预留余额，不签发 Receipt。启动参数 `BU2_PAYMENT_ADAPTER=x402` 可显式选择通道。

## 协议映射

| BU2 阶段 | x402 动作 | 本轮状态 |
| --- | --- | --- |
| Mandate / PolicyDecision | BU2 内部判断 | 保持不变 |
| Reserve preparation | 获取并校验 402 挑战 | 已实现 |
| Settlement | 携带 `PAYMENT-SIGNATURE` 重试 | 已完成 Base Sepolia 实结算 |
| Provider evidence | 解析 `PAYMENT-RESPONSE` | 已实现并用协议响应夹具验证 |
| Receipt | 写入通道交易引用 | 已写入链上交易引用并完成签名验证 |

x402 `exact` 的 402 挑战不等于链上资金预留。Adapter 将其标记为 `payment_required`，不能对外宣称已经锁定资金。

## 固定配置与验证

- x402 v2，`exact`，`eip155:84532`（Base Sepolia）。
- 测试网 USDC：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。
- 价格：0.01 USD，对应 10,000 USDC atomic units。
- Facilitator：`https://x402.org/facilitator`。
- 本地资源：`http://127.0.0.1:4021/premium-data`。
- 自动化测试：20/20 通过。
- 已覆盖完整异步 x402 Adapter 夹具交易，现有 BU2 核心对象与 Receipt 签名保持不变。
- 已覆盖 reserve/settle 外部失败时的状态与余额回滚。
- 公开 facilitator：实时返回 v2 exact Base Sepolia capability。
- 链上结算：已完成真实 paid probe 和完整 BU2 Agent 支付，两笔 Base Sepolia 交易均成功。

## 下一准入门槛

1. 保持 x402 仅在独立 Testnet 环境显式启用，不替换 Simulation 默认通道。
2. 为支付失败、链上确认延迟、Webhook 重投与 Receipt 校验建立可重复回归。
3. 冻结生产密钥、Mainnet 与资金托管的独立治理门槛；在门槛通过前保持 NO-GO。

## 资料来源

- https://github.com/x402-foundation/x402
- https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- https://docs.x402.org/getting-started/quickstart-for-sellers
- https://docs.x402.org/core-concepts/network-and-token-support
- https://docs.cdp.coinbase.com/faucets/introduction/quickstart
