# BU2

BU2.com 是 Agent 的 AI 收付平台，让 Agent 在用户授权范围内自主收款和付款，并完成验证、交付、结算与追溯。

## 项目定位

> Payments for agents. Control for humans.

BU2 作为支付层嵌入 ChatGPT、Codex、Claude 和自建 Agent 工作流，不要求用户在 BU2 创建任务。

## 项目文档

- [文档目录](docs/README.md)
- [商业计划书 PDF](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf)
- [商业计划书 PPTX](docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pptx)
- [产品文档 Product v0.1](docs/02-product/README.md)
- [技术契约 v0.1](docs/03-technical/README.md)
- [项目总纲与未来规划（HTML）](PROJECT.html)
- [系统架构宪法 v1.0（HTML）](ARCHITECTURE.html)
- [项目治理制度（HTML）](GOVERNANCE.html)
- [系统变更日志（HTML）](CHANGELOG.html)
- [AI Agent 工程规则](AGENTS.md)
- [P0 可点击产品原型](prototype/README.md)
- [本地 Agent 收付 Reference Server](sandbox/README.md)

## 当前阶段

- 项目状态：Phase 0 开发（仅 Simulation / Testnet）
- 当前版本：BP v0.1
- 产品定义：Product v0.3 Transaction-first
- 当前基线：SQLite 追加账本、Webhook Outbox、模拟 Adapter 与 x402 Base Sepolia Adapter 已实现
- 下一阶段：冻结首个正式开发 Epic，完善 Transaction API、通道可观测性与 Testnet 回归；Mainnet、真实资金托管仍为 NO-GO

---

更新日期：2026-09-01  
维护者：Codex
