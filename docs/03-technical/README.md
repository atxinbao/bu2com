# BU2 技术契约

日期：2026-09-06
维护者：Codex

- [Agent Payment API 契约 v0.1](API_CONTRACT_V0.1.md)
- [OpenAPI v0.1](openapi.yaml)
- [MCP 工具定义](mcp-tools.json)
- [外部 Buyer / Seller Agent 快速接入](EXTERNAL_AGENT_QUICKSTART.md)
- [契约示例](examples/payment-flow.json)
- [可运行 Reference Server](../../sandbox/README.md)
- [Persistence、Webhook 与 Adapter v0.5](PERSISTENCE_WEBHOOK_ADAPTER_V0.2.md)
- [交易链路可观测性与处置手册 v0.1](OBSERVABILITY_RUNBOOK_V0.1.md)
- [x402 Sandbox Adapter v0.4](X402_ADAPTER_V0.4.md)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)

Contract v0.1 已具备本地 SQLite Reference Server、追加式账本、Webhook Outbox、有限重试与死信、审计重放、Secret 版本轮换、端到端交易关联、结构化观测、健康快照、签名 Receipt、模拟支付 Adapter、基于官方 MCP SDK 的外部 Buyer/Seller Agent 样例，以及基于官方 x402 SDK 的 Base Sepolia Testnet Adapter。当前只允许 Simulation / Testnet；Mainnet、真实资金托管与生产密钥管理仍受项目治理约束，未经独立准入不得启用。
