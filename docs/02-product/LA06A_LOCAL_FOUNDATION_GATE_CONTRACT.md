# LA-06a 本地全量与隔离准入契约

更新日期：2026-09-09
维护者：Codex
风险等级：R2（账本与资金路径证据门禁）

## 1. 目标

LA-06a 将 Ledger Assurance Gate 要求的原仓库回归、故障注入、确定性属性检查和跨租户负向测试收敛为一条可重复的本地命令：

```bash
node deploy/la06a-local-gate.mjs
```

命令输出 `la06a.v1` 机器可读证据。任一检查失败即非零退出，不生成本地通过结论。

## 2. 包含范围

- Sandbox 全量 Node.js 测试。
- LA-06a 定向金额矩阵与跨租户声明测试。
- 部署、备份/恢复、Hosted Candidate/Activation/Evidence 契约回归。
- API/MCP 契约验证、TypeScript SDK 回归、Prototype lint 与 build。
- 证据中区分故障注入、属性检查、跨租户隔离和部署边界。

## 3. 明确不包含

- 不调用真实 Provider，不加载 Signer、托管 Secret 或生产凭证。
- 不启用 Live/Mainnet，不改变 `execution_disabled`。
- 不创建公网 Hosted endpoint、独立 Activation 或 Base Sepolia 交易。
- 不把 Local/Simulation 测试结果写成真实 Sandbox 双向收付证据。
- 不恢复或启动 E3.1；外部团队试点仍暂停。

## 4. 证据不变量

1. `schema_version` 必须为 `la06a.v1`。
2. `gate=ledger_assurance_local_foundation` 且 `status=passed` 只能表示本地门禁通过。
3. 所有本地检查必须为 `passed`；缺少任何检查或存在失败项均不合格。
4. `external_sandbox_bilateral.status=not_executed` 且 `accepted=false` 必须同时成立。
5. `authorization.payment_execution_attempted=false`、`live_enabled=false` 必须同时成立。
6. 真实 Sandbox/Testnet 双向证据属于 LA-06b，需独立外部环境和 G-F 审查，不能由本命令生成。

## 5. 验收与放行

LA-06a 仅达到 **GO for R2 review**。它证明本地回归和边界证据可重复，不证明完整 Ledger Assurance Gate、真实 Provider 对账、Hosted Sandbox、Base Sepolia 双向收付或生产准入。LA-06b 的外部证据未完成前，E3.1、Live/Mainnet 和生产资金路径继续关闭。
