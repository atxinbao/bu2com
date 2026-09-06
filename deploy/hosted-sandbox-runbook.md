# ENV-07B Hosted Sandbox 外部验收 Runbook

日期：2026-09-06  
执行者：Codex  
状态：执行模板；不代表已完成托管验收

## 1. 目的与边界

本 Runbook 用于在一个真实、可审计的外部托管目标上执行 ENV-07B。目标是证明机器 Agent 可以通过非交互鉴权，在 Sandbox / Base Sepolia / x402 `exact` 环境完成双向收付，并在重复提交、响应丢失和 Receipt 验证场景下保持可解释、可对账和无重复资金效果。

本 Runbook 不授权 Live/Mainnet、真实资金、托管客户资金或生产凭据。所有付款必须使用有界 Testnet 资产，并且只能在独立 Activation 有效期内执行。

## 2. 开始前必须满足

执行人必须在开始前记录以下内容：

- 不可变镜像引用：`BU2_HOSTED_ARTIFACT_IMAGE`
- Candidate JSON 及其 SHA-256
- 托管 API 公网 HTTPS origin
- DNS/TLS 和边缘机器 Bearer 规则
- 三个托管 Secret 的引用名，不记录 Secret 值
- 独立 Activation：审查人、有效期、最大付款次数、最大 Testnet 总额
- Buyer/Seller 测试 Agent 标识和钱包地址；钱包只允许使用 Base Sepolia 测试资产

以下任一项缺失时停止，不启动真实付款：

- origin 不是 HTTPS 公网 DNS；
- 镜像不是 immutable digest；
- Secret 只能通过直接环境变量注入；
- API 不支持机器 Bearer 或出现交互挑战/重定向；
- Candidate 与 Activation 的 SHA-256 不一致；
- Activation 过期、无界或未由独立人员签发；
- `/v1/environment` 不是 Sandbox、84532、x402、authenticated、execution_enabled；
- Receipt issuer 无法被信任或验证。

## 3. 部署前检查

```bash
docker compose --file deploy/hosted-sandbox.compose.yaml config --format json > resolved-hosted-sandbox.json
npm --prefix sandbox run test:hosted-deployment
npm --prefix sandbox run hosted-sandbox -- candidate candidate-input.json > candidate.json
sha256sum candidate.json
```

将 `resolved-hosted-sandbox.json`、Candidate 摘要和配置 SHA-256 纳入脱敏部署记录；不得纳入 Secret 值、私钥、Bearer token 或完整请求载荷。

## 4. E-T13：双向托管 Sandbox 收付

1. 外部 Buyer Agent 通过 HTTP、SDK 或 MCP 之一连接托管 origin。
2. 在任何 mutation 前运行 `doctor`，保存环境、契约、Receipt issuer 和执行状态结果。
3. 在 Activation 限额内完成 `buyer_to_seller` 一笔 settled 交易。
4. 由 Seller Agent 在同一 Sandbox 完成 `seller_to_buyer` 一笔 settled 交易。
5. 每笔交易保存链上交易哈希、Receipt ID、Receipt 验证字段、Provider reference 和网络 `eip155:84532`。
6. 不保存 Prompt、完整交易载荷、Authorization header、Cookie、私钥或助记词。

## 5. E-T14：重复提交与响应丢失

对每个方向只使用测试资产和独立的有限额度：

- 使用相同幂等键和相同载荷重复提交；必须只产生一个资金效果并最终收敛。
- 在 Provider 响应丢失或客户端超时后，先查询 Transaction、Payment Attempt 和 Provider reference；不得自动再次付款。
- 最终结果只能记录为 `confirmed`、`reconciled` 或 `explicit_unknown`；`explicit_unknown` 不计入成功收付。

保存最小化故障记录：场景、request/trace ID、Transaction ID、Attempt ID、最终状态、是否重复资金、恢复动作。

## 6. E-T15：边缘机器鉴权

使用无浏览器、无 Cookie 的 HTTP 客户端验证：

- `/health` 和 `/v1/environment` 的公开/机器访问边界；
- Bearer 访问私有端点返回 `200` 或契约规定的业务状态；
- 不发生 `3xx` 重定向；
- 不出现 CAPTCHA、网页登录或人工挑战；
- 未授权请求稳定失败且不产生交易写入。

## 7. 证据打包与验证

复制 `deploy/hosted-sandbox-evidence.template.json`，填写真实脱敏值后保存为 `evidence.json`。然后运行：

```bash
npm --prefix sandbox run hosted-sandbox -- \
  verify-evidence candidate.json activation.json evidence.json
```

证据必须符合 [`hosted-sandbox-evidence.schema.json`](../docs/03-technical/hosted-sandbox-evidence.schema.json)，并通过 Candidate/Activation 绑定、双向 Receipt、故障收敛、机器鉴权和 Live 排除检查。

## 8. 停止、恢复与结论

任何错链、错环境、Receipt 无效、重复资金、未知结果自动重试、边缘挑战、证据脱敏失败或 Candidate/Activation 漂移都会停止新增 Testnet 执行。保留只读账本、Payment Attempt、Receipt 和 Provider 对账，不修改旧证据，不自动重放付款。

只有 E-T13、E-T14、E-T15 的托管证据全部通过，才能把 ENV-07B 标记为 Accepted，并进入 Epic 3 外部团队试点。否则状态保持 `Not yet accepted`。
