# BU2 技术契约

日期：2026-09-06
维护者：Codex

- [Agent Payment API 契约 v0.3.0](API_CONTRACT_V0.1.md)
- [OpenAPI v0.3.0](openapi.yaml)
- [MCP 工具定义](mcp-tools.json)
- [API / MCP 版本清单](contract-versions.json)
- [开发者接入诊断 v0.2](DEVELOPER_DIAGNOSTICS_V0.1.md)
- [Doctor 机器结果 Schema v0.2](doctor-result.schema.json)
- [E2.4 外部 clean-room 接入证据](CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)
- [Clean-room 机器结果 Schema v0.2](clean-room-evidence.schema.json)
- [HTTP、SDK 与 MCP clean-room 样例](../../integrations/clean-room/README.md)
- [外部 Buyer / Seller Agent 快速接入](EXTERNAL_AGENT_QUICKSTART.md)
- [Codex、Claude Desktop 与通用 MCP Host 配置](../../integrations/mcp/README.md)
- [TypeScript SDK v0.3](../../packages/typescript-sdk/README.md)
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
- [环境注册表与链隔离 v1](ENVIRONMENT_REGISTRY_AND_CHAIN_ISOLATION_V1.md)
- [客户端与 Receipt 环境契约 v1](ENVIRONMENT_CLIENT_AND_RECEIPT_CONTRACT_V1.md)
- [ENV-04 隔离 Sandbox / Live 部署单元 v1](ENVIRONMENT_DEPLOYMENT_UNITS_V1.md)
- [ENV-04 Docker / Compose 参考实现](../../deploy/README.md)
- [ENV-05 受控开发者与运维入口 v1](ENVIRONMENT_CONTROLLED_ACCESS_V1.md)
- [Access Contract v1](access-contract.json)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)
- [Phase 0 Epic 2：开发者接入规模化](PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [Phase 0 Epic 3：外部试点准备与证据](PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)
- [Phase 0 Transaction Trust Gate](PHASE0_TRANSACTION_TRUST_GATE.md)

Contract v0.3.0 已具备本地 SQLite Reference Server、数据库 processing 幂等 Claim、状态版本 CAS、原子化 Ledger/Outbox、有限重试与死信、审计重放、Secret 版本轮换、端到端交易关联、结构化观测、环境自描述、签名 Receipt、环境绑定的 Agent/Developer/Operator 访问控制、租户隔离与受控运维入口，以及基于官方 MCP/x402 SDK 的 Agent 支付接入。Epic 1 与 Epic 2 已完成；Transaction Trust Gate 1–3 已经 PR #15–#17 合并。

F01/ENV-01、ENV-02、ENV-03 与 ENV-04 已分别由 PR #18/#19/#20/#21 批准。ENV-05 已实现受控 API、SDK、MCP、租户重置和脱敏支持包，等待 R2 审查；Compose 仍是本地参考且没有加载 Signer 或执行链上付款。Epic 3 的正式证据仍要求托管 Sandbox 的真实 Base Sepolia 双向收付。SDK/MCP 未公开发布，Live/Mainnet、真实资金托管与生产凭证仍未经独立准入。
