# BU2 x402 Base Sepolia 实结算证据

日期：2026-09-01  
执行者：Codex

## 验收结论

BU2 已完成首个真实 x402 Base Sepolia 支付闭环：

```text
Quote
→ PaymentIntent
→ Human Authorization
→ BU2 Internal Reserve
→ Delivery Evidence
→ x402 PAYMENT-SIGNATURE
→ Facilitator Settlement
→ Base Sepolia USDC Transfer
→ BU2 Settlement
→ Ed25519 Receipt
```

协议支付与 BU2 账本均已验证，结论为 **GO（测试网）**。该结论不代表主网、托管或生产合规已经通过。

## 真实 paid probe

- Buyer：`0x2c8b07E38155195826e91e266aCee03B3398dD97`
- Receiver：`0xE1a16E3F4Ed378830d72B3aD23BFA3C596313978`
- Amount：0.01 USDC
- Transaction：`0xd380aea68dd5458e0121f83c367161ff0a4e00667b640ac7b3652ffd52d55a8c`
- Block：46220495
- Status：success
- Explorer：https://sepolia.basescan.org/tx/0xd380aea68dd5458e0121f83c367161ff0a4e00667b640ac7b3652ffd52d55a8c

Facilitator 返回的 `PAYMENT-RESPONSE` 解码结果：

```json
{
  "success": true,
  "payer": "0x2c8b07E38155195826e91e266aCee03B3398dD97",
  "transaction": "0xd380aea68dd5458e0121f83c367161ff0a4e00667b640ac7b3652ffd52d55a8c",
  "network": "eip155:84532"
}
```

## 完整 BU2 Agent 支付

- BU2 Transaction：`txn_68e7a5088d8c422e`
- x402 Transaction：`0xbaad90f8c6c8cf121d4913bdadf162dd2831a69be5d106a911655d62d3208b08`
- Base Sepolia Block：46220518
- BU2 Receipt：`rcpt_7c0ac5450f4b4e39`
- Receipt verification：`valid=true`
- Explorer：https://sepolia.basescan.org/tx/0xbaad90f8c6c8cf121d4913bdadf162dd2831a69be5d106a911655d62d3208b08

两笔测试后余额：

- Buyer：9.98 USDC
- 临时 Receiver：0.02 USDC

## 商户地址修正

首轮商户进程使用临时测试地址。为避免后续测试继续向不可持久复用的地址支付，商户已切换为 macOS 钥匙串持久化地址：

```text
0x990c282E1bBb1Fe56D8B8B98a75DF4dE703710C9
```

后续 x402 challenge 已使用该地址。旧地址仅承载本次 0.02 测试 USDC 证据，不再用于新交易。

## 运行状态

- Simulated Reference Server：`http://127.0.0.1:3100`
- x402 Reference Server：`http://127.0.0.1:3101`
- x402 Merchant：`http://127.0.0.1:4021/premium-data`
- x402 SQLite：`sandbox/data/bu2-x402.sqlite`
- x402 Ledger events：7
- 自动化测试：20/20

## 产品页面接入

`http://localhost:3000/` 已接入 3101 Reference Server：

- `GET /v1/transactions` 返回交易、PaymentIntent、Quote、Delivery、Receipt 和通道信息。
- `GET /v1/transactions/{id}` 返回单笔完整详情。
- 真实交易在列表首位显示，并标注“真实 x402 数据”。
- 详情页显示 0.01 USD、x402 通道、交付哈希、Receipt ID、Ed25519 验证结果和 Base Sepolia 交易链接。
- API 不可用时显示明确离线提示并保留演示数据。

Playwright 真实浏览器验收通过，中英文列表和详情均可读取真实交易；控制台 0 error。截图：`prototype/output/playwright/x402-transaction-detail.png`。
