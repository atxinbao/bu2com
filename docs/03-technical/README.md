# BU2 技术契约

日期：2026-09-07
维护者：Codex

## LA-03d 当前契约状态

LA-03d 已冻结多账户账簿所有权、余额投影切换和历史迁移契约；Schema 16/17/19 建立所有权、Posting 绑定与版本化投影，Schema 20 把可信 FundingSource/ReceivingTarget 接到业务 Posting，FP-06a 增加 WalletReadModel/shadow，FP-06b Schema 21 增加仅 Local 的 append-only migration plan / assessment / cutover generation。FP-08 Schema 22 在健康 cutover 激活时初始化 `ledger_account_id + currency` 账户级写源，新付款及买方 Payment/Refund ProviderFee 由 Transaction Core 原子写入该余额；Sandbox/Live 与生产数据切换继续关闭。

## Foundation 当前入口

- [Ledger Foundation 当前能力与产品接入基线](LEDGER_FOUNDATION_OVERVIEW.md)
- [Ledger Foundation 产品接入收口 PR 计划](FOUNDATION_PR_PLAN.md)
- [社交钱包与 Foundation 接入边界](../02-product/SOCIAL_WALLET_INTEGRATION_BOUNDARY.md)
- [FP-06b 目标账簿迁移与 Local 读路径切换](../02-product/FP06B_WALLET_READ_CUTOVER_CONTRACT.md)
- [ADR-0002 Local WalletReadModel cutover](ADR_0002_LOCAL_WALLET_READ_CUTOVER.md)

这些入口区分“已实现”“已接入业务”“本地已验证”和“已获准运行”。FP-06b 只完成 Local 受控读路径切换机制，不是正式社交钱包 API、Sandbox/Testnet 或 Live 资金准入。

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
- [Access Contract v1.1](access-contract.json)
- [F06a 持久身份与内部 Sandbox onboarding](../../sandbox/onboarding.mjs)
- [F06b 资金来源与收款目标绑定](F06B_FUNDING_TARGET_BINDINGS_V1.md)
- [ENV-06 制品提升、监控、备份与恢复演练 v1](ENVIRONMENT_OPERATIONS_V1.md)
- [ENV-07 Hosted Sandbox 双向 Base Sepolia 验收 v1](ENVIRONMENT_HOSTED_SANDBOX_V1.md)
- [ENV-07B Hosted Sandbox 部署准备契约](../../deploy/hosted-sandbox-deployment.json)
- [ENV-07B Hosted Sandbox 外部验收 Runbook](../../deploy/hosted-sandbox-runbook.md)
- [Hosted Sandbox Evidence Schema v1](hosted-sandbox-evidence.schema.json)
- [Operations Contract v1](../../deploy/operations-contract.json)
- [x402 Base Sepolia 测试钱包](X402_TEST_WALLET.md)
- [x402 Base Sepolia 实结算证据](X402_LIVE_SETTLEMENT_EVIDENCE.md)
- [Phase 0 Epic 1：外部 Agent 交易接入与可靠性](PHASE0_EPIC1_EXTERNAL_AGENT_INTEGRATION.md)
- [Phase 0 Epic 2：开发者接入规模化](PHASE0_EPIC2_DEVELOPER_INTEGRATION_SCALE.md)
- [Phase 0 Epic 3：外部试点准备与证据](PHASE0_EPIC3_EXTERNAL_PILOT_EVIDENCE.md)
- [Phase 0 Transaction Trust Gate](PHASE0_TRANSACTION_TRUST_GATE.md)
- [Phase 0 业务路线与 PR 基线](../02-product/PHASE0_ROADMAP_BASELINE.md)
- [D1 F07 财务边界契约](../02-product/F07_FINANCIAL_BOUNDARY_CONTRACT.md)
- [D2 F08 Payment Mandate 契约](../02-product/F08_PAYMENT_MANDATE_CONTRACT.md)
- [F09a 自主支付执行契约](../02-product/F09A_AUTONOMOUS_EXECUTION_CONTRACT.md)
- [F10 Account-Owned Receivable 契约](../02-product/F10_RECEIVABLE_CONTRACT.md)
- [F11 Inbound Collection 契约](../02-product/F11_INBOUND_COLLECTION_CONTRACT.md)
- [F12 Paid Access 与 Delivery Fact 契约](../02-product/F12_FULFILLMENT_ACCESS_CONTRACT.md)
- [F13 有界取消与退款恢复契约](../02-product/F13_REFUND_RECOVERY_CONTRACT.md)
- [F14 支付、收款、退款与手续费对账契约](../02-product/F14_RECONCILIATION_CONTRACT.md)
- [F15a 内部 Sandbox 执行会话契约](../02-product/F15A_SANDBOX_EXECUTION_SESSION_CONTRACT.md)
- [F15b 业务负载、停机与财务恢复验收契约](../02-product/F15B_OPERATIONS_ACCEPTANCE.md)
- [F16a 内部 Sandbox 自主双向收付 Beta 验收契约](../02-product/F16A_INTERNAL_BETA_ACCEPTANCE.md)
- [F16b Hosted Sandbox 外部集成基础准入](../02-product/F16B_HOSTED_QUALIFICATION.md)
- [Public Wallet API 产品契约](../02-product/PUBLIC_WALLET_API_CONTRACT.md)
- [LA-01 持久化退款尝试与未决额度占用](../02-product/LA01_REFUND_ATTEMPT_CONTRACT.md)
- [LA-02 成组 Journal / Posting 保护](../02-product/LA02_JOURNAL_POSTING_CONTRACT.md)
- [LA-03a 业务资金事实分录](../02-product/LA03_BUSINESS_POSTINGS_CONTRACT.md)
- [LA-03b 期初检查点与追加更正](../02-product/LA03B_OPENING_CORRECTION_CONTRACT.md)
- [LA-03c 账务投影重建](../02-product/LA03C_LEDGER_PROJECTION_CONTRACT.md)
- [LA-03d 多账户账簿所有权与余额投影](../02-product/LA03D_MULTI_ACCOUNT_OWNERSHIP_CONTRACT.md)
- [LA-05a 外部观察对账](../02-product/LA05A_EXTERNAL_RECONCILIATION_CONTRACT.md)
- [LA-05b 历史账务重放与备份追平](../02-product/LA05B_HISTORY_REPLAY_CATCHUP_CONTRACT.md)
- [LA-06a 本地全量与隔离准入](../02-product/LA06A_LOCAL_FOUNDATION_GATE_CONTRACT.md)
- [RT-01 固定运行时与 SQLite 账本准入](../02-product/RT01_RUNTIME_ASSURANCE_CONTRACT.md)
- [CI-02 证据绑定](CI_FOUNDATION_EVIDENCE.md)
- [CI-03 Ledger Release Candidate 技术说明](CI_RELEASE_CANDIDATE.md)
- [CI-04 Ledger Nightly 技术说明](CI_LEDGER_NIGHTLY.md)

Contract v0.3.0 已具备本地 SQLite Reference Server、幂等/CAS、Ledger/Outbox、授权/预留/结算/退款、受保护 Journal/Posting、期初/更正、版本化账户投影、历史重放/备份追平、外部观察对账、Receipt、MCP/x402 等既有能力；FP-05 Schema 20 将新业务事实接到可信 LedgerAccount，FP-06a 建立 WalletReadModel/shadow，FP-06b Schema 21 增加 Local-only append-only migration plan / assessment / cutover generation 与 stale reserve guard，FP-08 Schema 22 增加账户级写余额和固定交易写源，Public Wallet API 以 Access Contract v1.1 暴露认证 Account 的只读余额。Transaction Core 仍是唯一写入者。

F01/ENV-01 至 ENV-06 已分别由 PR #18–#23 批准。ENV-07A/07B 本地部署准备已实现；真实托管 Sandbox、Base Sepolia 双向收付与边缘 E2E 仍为 Not yet accepted。Public Wallet API 只完成隔离 Local 的认证账户读取；Collection 运行时净入账、LA-06b 外部双向证据、E3.1 与 Live/Mainnet/生产数据仍未经独立准入。
