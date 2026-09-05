# BU2 技术契约

日期：2026-09-06
维护者：Codex

- [Agent Payment API 契约 v0.1](API_CONTRACT_V0.1.md)
- [OpenAPI v0.1](openapi.yaml)
- [MCP 工具定义](mcp-tools.json)
- [API / MCP 版本清单](contract-versions.json)
- [开发者接入诊断 v0.1](DEVELOPER_DIAGNOSTICS_V0.1.md)
- [Doctor 机器结果 Schema v0.1](doctor-result.schema.json)
- [E2.4 外部 clean-room 接入证据](CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)
- [Clean-room 机器结果 Schema v0.1](clean-room-evidence.schema.json)
- [HTTP、SDK 与 MCP clean-room 样例](../../integrations/clean-room/README.md)
- [外部 Buyer / Seller Agent 快速接入](EXTERNAL_AGENT_QUICKSTART.md)
- [Codex、Claude Desktop 与通用 MCP Host 配置](../../integrations/mcp/README.md)
- [TypeScript SDK v0.1](../../packages/typescript-sdk/README.md)
- [契约示例](examples/payment-flow.json)
- [可运行 Reference Server](../../sandbox/README.md)
- [Persistence、Webhook 与 Adapter v0.6](PERSISTENCE_WEBHOOK_ADAPTER_V0.2.md)
- [Transaction Atomicity v0.1](TRANSACTION_ATOMICITY_V0.1.md)
- [交易链路可观测性与处置手册 v0.1](OBSERVABILITY_RUNBOOK_V0.1.md)
- [x402 Sandbox Adapter v0.4](X402_ADAPTER_V0.4.md)
- [x402 Testnet 可信执行 v0.1](X402_TRUSTED_EXECUTION_V0.1.md)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)
- [Phase 0 Epic 2：开发者接入规模化](PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [Phase 0 Epic 3：外部试点准备与证据](PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)
- [Phase 0 Transaction Trust Gate](PHASE0_TRANSACTION_TRUST_GATE.md)

Contract v0.1 已具备本地 SQLite Reference Server、数据库 processing 幂等 Claim、状态版本 CAS、原子化 Ledger/Outbox、有限重试与死信、审计重放、Secret 版本轮换、端到端交易关联、结构化观测、健康快照、签名 Receipt、模拟支付 Adapter、基于官方 MCP SDK 的外部 Buyer/Seller Agent 样例，以及基于官方 x402 SDK 的 Base Sepolia Testnet Adapter。Epic 1 已经 PR #8 合并并完成；Epic 2 已经 PR #10–#13 合并并完成。Epic 3 的范围保持冻结，并由 Transaction Trust Gate 阻塞；Gate 1 Receipt v0.2 与 Gate 2 数据库原子性已合并，Gate 3 x402 Testnet 可信执行已在本地实现并等待独立 R2 审查。当前只允许 Simulation / Testnet；SDK 与 MCP 均未公开发布，Mainnet、真实资金托管与生产密钥管理仍受项目治理约束，未经独立准入不得启用。
