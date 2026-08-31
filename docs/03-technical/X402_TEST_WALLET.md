# BU2 x402 Base Sepolia 测试钱包

日期：2026-09-01  
执行者：Codex

## 钱包

- 地址：`0x2c8b07E38155195826e91e266aCee03B3398dD97`
- 网络：Base Sepolia
- 用途：仅用于 BU2 x402 沙盒买方测试
- 私钥存储：macOS 钥匙串
- 钥匙串服务：`bu2-x402-base-sepolia`
- 钥匙串账户：`buyer-private-key`
- 项目文件与日志不保存私钥

## 当前余额

- ETH：0
- USDC：9.98（完成两笔 0.01 USDC 支付后）
- 状态：真实 x402 测试网结算已通过

## 领取测试资产

打开 Coinbase Developer Platform Faucet：

https://portal.cdp.coinbase.com/products/faucet

选择 Base Sepolia 和 USDC，将测试资产发送到：

```text
0x2c8b07E38155195826e91e266aCee03B3398dD97
```

x402 使用 EIP-3009 USDC，通常不需要买方预先发送链上 approve。当前 facilitator 支持代付相关流程；本次 0.01 USD 支付的必要条件是测试地址至少拥有 0.01 USDC。

## 领取后验证

```bash
cd /Users/mac/Documents/bu2com/sandbox
npm run x402:wallet
npm run x402:probe:funded
```

若 paid probe 成功，再启动完整 BU2 x402 服务：

```bash
npm run x402:server
npm run demo:x402
```

成功验收需要同时获得：

- `PAYMENT-RESPONSE`
- Base Sepolia 交易哈希
- BU2 Settlement provider reference
- BU2 Ed25519 Receipt 且 `valid=true`

## 当前实测

钱包领取到 10 USDC 后，paid probe 与完整 BU2 Agent 支付均成功。链上交易与 BU2 Receipt 证据见 `X402_LIVE_SETTLEMENT_EVIDENCE.md`。

## 官方资料

- https://docs.cdp.coinbase.com/faucets/introduction/quickstart
- https://docs.x402.org/core-concepts/network-and-token-support
