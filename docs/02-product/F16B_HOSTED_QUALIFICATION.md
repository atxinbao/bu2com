# F16b Hosted Sandbox 外部集成基础准入

日期：2026-09-09  
维护者：Codex  
风险等级：R2（环境、部署与外部证据边界）

## 目标

F16b 把 Hosted Sandbox 的本地基础契约整理成一个可重复执行的准入检查：候选制品、独立 Activation、Evidence Schema、失败恢复和 Live 排除必须互相绑定，并且任何本地通过结果都不能自动授予公网部署或 Testnet 付款权限。

本 PR 对应路线中的 `F16b-ENV07B`，名称是“qualify external sandbox integrations for foundation gate”。它是外部验收前的基础资格，不是 ENV-07B 已验收声明。

## 本地覆盖范围

- 通过 `Candidate → Activation → Evidence` 的组合验证，确认候选摘要、独立激活和证据摘要相互绑定。
- 拒绝不可变制品漂移、候选自授权、Activation 候选不匹配或过期。
- 拒绝边缘机器鉴权失败、双向交易证据不完整、Receipt 不可信或 Live 被包含。
- 保持 Sandbox / Base Sepolia `84532` / x402 / `execution_enabled` / authenticated 的既有契约。
- 返回结构化资格结果，并显式标记 `env07b_accepted=false` 及待完成的外部关卡。

执行命令：

```bash
npm --prefix sandbox run test:f16b-hosted
```

## 不能由本地资格替代的关卡

以下事项仍需独立部署授权、真实外部环境和可审计证据：

1. 公网 HTTPS、DNS、TLS 与稳定 API origin。
2. 托管 Secret 注入与轮换；不允许把本地文件或测试值当成托管凭证。
3. 独立审查人签发、绑定候选摘要和时间窗口的 Activation。
4. 外部机器无浏览器挑战的鉴权与边缘行为。
5. Base Sepolia 买方到卖方、卖方到买方的真实双向结算，以及重复提交、丢响应和恢复证据。

在上述证据完成前，ENV-07B 状态必须保持 `Not yet accepted`；Live/Mainnet、生产资金、托管钱包和生产凭证继续关闭。

## 停止条件

- 候选来源、制品摘要或 Hosted API origin 发生漂移。
- Activation 与 Candidate 摘要不匹配、过期、超出金额或次数上限。
- 任一 Receipt 无法同时证明签名有效、签发方可信和结算已确认。
- 失败场景无法证明无重复资金事实或无法收敛到可对账状态。
- 发现 Live 服务、Live 交易或直接 Secret 环境变量进入 Hosted Sandbox。
