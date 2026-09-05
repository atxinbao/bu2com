# BU2 技术契约

日期：2026-09-06
维护者：Codex

- [Agent Payment API 契约 v0.1](API_CONTRACT_V0.1.md)
- [OpenAPI v0.1](openapi.yaml)
- [MCP 工具定义](mcp-tools.json)
- [API / MCP 版本清单](contract-versions.json)
- [开发者接入诊断 v0.1](DEVELOPER_DIAGNOSTICS_V0.1.md)
- [Doctor 机器结果 Schema v0.1](doctor-result.schema.json)
- [外部 Buyer / Seller Agent 快速接入](EXTERNAL_AGENT_QUICKSTART.md)
- [Codex、Claude Desktop 与通用 MCP Host 配置](../../integrations/mcp/README.md)
- [TypeScript SDK v0.1](../../packages/typescript-sdk/README.md)
- [契约示例](examples/payment-flow.json)
- [可运行 Reference Server](../../sandbox/README.md)
- [Persistence、Webhook 与 Adapter v0.5](PERSISTENCE_WEBHOOK_ADAPTER_V0.2.md)
- [交易链路可观测性与处置手册 v0.1](OBSERVABILITY_RUNBOOK_V0.1.md)
- [x402 Sandbox Adapter v0.4](X402_ADAPTER_V0.4.md)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)
- [Phase 0 Epic 2：开发者接入规模化](PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)

Contract v0.1 已具备本地 SQLite Reference Server、追加式账本、Webhook Outbox、有限重试与死信、审计重放、Secret 版本轮换、端到端交易关联、结构化观测、健康快照、签名 Receipt、模拟支付 Adapter、基于官方 MCP SDK 的外部 Buyer/Seller Agent 样例，以及基于官方 x402 SDK 的 Base Sepolia Testnet Adapter。Epic 1 已经 PR #8 合并并完成，Epic 2 的 E2.1 已经 PR #10 合并，E2.2 已经 PR #11 合并；E2.3 已实现本地 doctor、机器结果 Schema、中英恢复提示和零远程遥测的最小分析。当前只允许 Simulation / Testnet；SDK 与 MCP 均未公开发布，Mainnet、真实资金托管与生产密钥管理仍受项目治理约束，未经独立准入不得启用。
