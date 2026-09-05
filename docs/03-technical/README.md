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
- [系统环境契约 v1](SYSTEM_ENVIRONMENTS_V1.md)
- [ADR-0001：Sandbox 与 Live 环境隔离](ADR_0001_SANDBOX_LIVE_ENVIRONMENT_ISOLATION.md)
- [环境验收矩阵 v1](ENVIRONMENT_ACCEPTANCE_MATRIX_V1.md)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)
- [Phase 0 Epic 2：开发者接入规模化](PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [Phase 0 Epic 3：外部试点准备与证据](PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)
- [Phase 0 Transaction Trust Gate](PHASE0_TRANSACTION_TRUST_GATE.md)

Contract v0.1 已具备本地 SQLite Reference Server、数据库 processing 幂等 Claim、状态版本 CAS、原子化 Ledger/Outbox、有限重试与死信、审计重放、Secret 版本轮换、端到端交易关联、结构化观测、健康快照、签名 Receipt、模拟支付 Adapter、基于官方 MCP SDK 的外部 Buyer/Seller Agent 样例，以及基于官方 x402 SDK 的 Base Sepolia Adapter。Epic 1 与 Epic 2 已完成；Transaction Trust Gate 1–3 已经 PR #15–#17 合并。

F01/ENV-01 将目标对外环境冻结为 `sandbox/live`，内部执行环境为 `local`，并明确 Live 初始 `execution_disabled`。现有 API、SDK、MCP、Doctor、Receipt 与运行时仍使用 legacy `simulation/testnet`，必须由 ENV-02/03 完成配置、链隔离与契约迁移后，才能把新语义视为运行控制。Epic 3 的正式证据升级为托管 Sandbox 的真实 Base Sepolia 双向收付；Local Simulation 只作为自动化工具证据。SDK 与 MCP 未公开发布，Live/Mainnet、真实资金托管与生产密钥仍未经独立准入。
