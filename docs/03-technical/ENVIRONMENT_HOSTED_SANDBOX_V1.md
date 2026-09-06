# ENV-07：Hosted Sandbox 双向 Base Sepolia 验收 v1

日期：2026-09-07
执行者：Codex
状态：ENV-07A 本地准入基线已实现；真实托管部署与 E-T13/E-T14/E-T15 尚未验收

## 1. 目标与边界

ENV-07 不是“把本地服务暴露到公网”。它要证明外部 Agent 能通过非交互机器鉴权，在托管 Sandbox 完成 Base Sepolia 双向 x402 收付，并且重复提交、响应丢失与 Receipt 验证不会产生重复资金效果或虚假成功。

本变更只完成 ENV-07A：提供专用启动入口、文件型运行秘密、不可变候选记录、独立激活记录和机器可读证据验证器。它不创建云资源、DNS、TLS 证书或正式凭据，不执行 Base Sepolia 付款，不授权 Live/Mainnet，也不把 `https://api.sandbox.bu2.com` 声明为已部署。

## 2. 两阶段准入

| 阶段 | 内容 | 当前结论 |
| --- | --- | --- |
| ENV-07A | 启动门槛、Secret 文件读取、候选/激活/证据契约、本地自动化 | Implemented / Local automated pass |
| ENV-07B | 公网 HTTPS 部署、边缘机器鉴权、真实双向 Testnet 结算、故障注入 | Not yet accepted |

只有 ENV-07B 在不可变候选上完成，E-T13/E-T14/E-T15 才能标记通过。Local Simulation、本机容器、HTTP 200 或静态 JSON 均不能替代托管证据。

## 3. Hosted Sandbox 专用启动入口

托管运行时使用：

```bash
npm --prefix sandbox run start:hosted-sandbox
```

入口固定并重新验证以下组合：

- `sandbox`；
- Base Sepolia `84532` / `eip155:84532`；
- `x402` / `exact`；
- `authenticated`；
- `execution_enabled`；
- `signer_environment=sandbox`；
- 实际 RPC `eth_chainId` 必须返回 `84532`。

运行时必须显式提供 `X402_RESOURCE_URL`，并只从下列文件引用读取秘密：

- `BU2_API_CREDENTIALS_FILE`：只包含 API key SHA-256 摘要的凭据元数据；
- `X402_BUYER_PRIVATE_KEY_FILE`：仅属于 Sandbox 的 Base Sepolia 测试签名材料；
- `BU2_RPC_URL_FILE`：Base Sepolia RPC endpoint，由托管 Secret 提供。

直接注入 `BU2_API_CREDENTIALS_JSON`、`X402_BUYER_PRIVATE_KEY` 或 `BU2_RPC_URL` 会在启动前失败。文件必须是绝对路径、普通文件、非符号链接、非空且不超过 64 KiB。容器编排时可将平台托管 Secret 以只读文件挂入；Docker Compose 的标准行为是把显式授予服务的 Secret 作为文件挂载到 `/run/secrets/<name>`，应用侧采用 `_FILE` 引用读取。[Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) / [Compose secrets reference](https://docs.docker.com/reference/compose-file/secrets/)

共享 `deploy/compose.yaml` 继续保持 Sandbox/Live 双环境 `execution_disabled` 且不挂载 Signer。托管 Sandbox 的激活配置必须位于独立部署单元，不能通过修改共享模板顺带启用 Live。

## 4. 三类不可混淆的证据

### 4.1 Candidate

`createHostedSandboxCandidate` 绑定：

- 完整 Git commit；
- registry 或本地不可变 `sha256` 制品；
- 非本地公网 HTTPS API origin；
- Secret 管理器中的引用名，不包含秘密值；
- Contract、Sandbox、Prototype build 与 Secret scan 四项本地 Gate。

Candidate 固定写入：

```json
{
  "hosted_deployment": false,
  "testnet_payment_execution": false,
  "human_activation_required": true
}
```

因此生成 Candidate 不等于部署，更不等于允许付款。

### 4.2 Activation

Activation 必须由仓库外的独立人工审查流程提供，并与 Candidate SHA-256 绑定。它必须限定：

- scope 为 `sandbox_base_sepolia_test_assets`；
- 有效起止时间；
- 审查人；
- 最大付款次数；
- Testnet 最大小额总额。

仓库 CLI 不创建或批准 Activation，只验证调用方提交的记录。过期、候选不匹配或额度无界均失败关闭。

### 4.3 Evidence

托管证据必须同时证明：

1. `/v1/environment` 返回 Sandbox、84532、x402、`execution_enabled`、`authenticated` 和明确 Receipt issuer；
2. 外部 Buyer Agent 与 Seller Agent 各完成一个方向的真实 Base Sepolia `settled` 交易；
3. 两条链上引用均为交易哈希；
4. 每条 Receipt 的 `signature_valid`、`issuer_trusted`、`settlement_confirmed` 和 environment 均通过；
5. 重复提交无重复资金效果并收敛；
6. 响应丢失无重复资金效果，最终为 confirmed、reconciled 或明确 unknown；
7. Bearer 机器鉴权穿过边缘层时不出现浏览器挑战或重定向；
8. 证据不包含 Live，Live 仍为 `execution_disabled`。

验证命令：

```bash
npm --prefix sandbox run hosted-sandbox -- candidate candidate-input.json
npm --prefix sandbox run hosted-sandbox -- verify-evidence candidate.json activation.json evidence.json
```

CLI 只向标准输出返回 JSON，不回写输入证据，也不会自动重试支付。

## 5. 停止与恢复

出现错链、错环境凭据、未知支付自动重试、Receipt 不可信、边缘交互挑战、Candidate/Activation 漂移或重复资金效果时，立即停止新增 Testnet 执行，保留查询、账本、Payment Attempt、Receipt 和对账能力。恢复必须使用新的不可变候选和新的独立 Activation；不得修改旧证据使其重新“通过”。

## 6. 下一步

本地下一步已提供 `deploy/hosted-sandbox.compose.yaml` 和对应部署契约测试。它是仅 Sandbox 的部署准备单元，固定不可变镜像、Hosted Sandbox 启动入口、Base Sepolia、文件型 Secret 和机器鉴权配置；它不创建云资源，也不代表已部署。

随后选择并配置一个可审计的托管目标，完成 DNS/TLS、托管 Secret 文件注入和不可变镜像部署后，才执行 ENV-07B。届时需在真实外部网络运行 E-T13、E-T14、E-T15，并保存脱敏证据包；通过之前 Epic 3 继续保持 Ready，不能开始三个外部团队正式试点。
