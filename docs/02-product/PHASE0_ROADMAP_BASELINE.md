# BU2 Phase 0 业务路线与 PR 基线 v1

更新日期：2026-09-07  
维护者：Codex  
风险等级：R0（文档与状态对齐，不改变运行时、Schema 或交易行为）

## 1. 目的

本文件把当前已批准的 Phase 0 业务里程碑、功能计划 ID、依赖和放行门槛统一为单一文档入口。计划 ID（F02-CI、F06a～F16b-ENV07B）是产品与工程路线标识，不等同于 GitHub PR 编号；实际 PR 编号以创建时为准。

BU2 继续定位为嵌入式 Agent AI 收付平台。外部 Agent 在自己的工作流中创建报价、支付意图和收款请求，BU2 负责授权、资金边界、交易事实、交付、结算、退款和 Receipt；本路线不建设 BU2 Task 平台或通用 Agent Runtime。

## 2. 当前状态

- 已完成：Epic 1、Epic 2、Transaction Trust Gate 1–3、F06a、F06b、ENV-01～ENV-06。
- 当前可用：Local Simulation；内部 Sandbox/Testnet 调试能力。
- 尚未验收：Hosted Sandbox 的 ENV-07B、真实 Base Sepolia 双向收付、外部团队证据。
- 明确关闭：Live/Mainnet、真实生产资金、托管钱包、生产凭证和无人值守生产执行。

## 3. 里程碑

| 里程碑 | 主工作 | 验收结果 |
|---|---|---|
| M1 真实业务主体 | F06a、F06b、F07、F08；F02-CI 并行 | 可建档/撤销；Account、资金来源、收款目标与 Payment Mandate 真实绑定 |
| M2 自主收付 | F09a、F09b、F10、F11、F15a | 无管理员逐笔代批准；Sandbox/Testnet 收付款按代码就绪情况逐项取证 |
| M3 商业闭环 | F12、F13、F14、F15b | 可重取权益、取消/退款、财务对账、负载与停机恢复 |
| M4 内部 Beta | F16a | 固定候选上的无人值守双向收付、故障、退款与对账通过 |
| M5 外部准入 / G-F | F16b-ENV07B | 外部机器接入与独立团队证据通过，不以内部演示替代 |

不设无依据的日历工期。每个里程碑以证据放行；未通过的资金路径保持关闭。社交主页、增长功能、更多协议和 Live/Mainnet 不属于当前主线。

## 4. PR 顺序与依赖

| 计划 ID | PR 标题 | 依赖 | 风险 |
|---|---|---|---|
| F02-CI | `ci: enforce reproducible foundation checks` | 当前 `main` | R1；涉及部署/签名权限时重新定级 |
| F06a | `feat(accounts): persist account-agent ownership and sandbox onboarding` | 当前 `main` | 已完成 |
| F06b | `feat(wallets): bind funding sources and verified receiving targets` | F06a | 已完成 |
| F07 | `feat(ledger): add scoped budget holds and financial postings` | F06b | R2 |
| F08 | `feat(mandates): enforce versioned autonomous payment grants` | F07 | R2 |
| F09a | `feat(execution): run authorized payment commands without operator approval` | F08 | R2 |
| F09b | `feat(recovery): schedule evidence-based recovery for existing attempts` | F09a | R2 |
| F10 | `feat(collections): create account-owned receivables` | F07 | R2 |
| F11 | `feat(collections): verify inbound payments and post funds once` | F10 | R2 |
| F12 | `feat(fulfillment): make paid access recoverable and separate delivery facts` | F09a、F11 | R2 |
| F13 | `feat(refunds): implement bounded cancellation and refund recovery` | F12、F09b | R2；实际资金执行另行受控 |
| F14 | `feat(reconciliation): reconcile payments collections refunds and fees` | F13 | R2 |
| F15a | `feat(sandbox): add isolated bounded internal execution sessions` | F08、F09a | R2；环境激活与业务 Mandate 分开批准 |
| F15b | `test(operations): verify business load shutdown and financial recovery` | F14、F15a | R2 |
| F16a | `test(sandbox): accept autonomous internal pay-and-collect beta` | F09b、F11、F12、F13、F14、F15b、F02-CI | R2 |
| F16b-ENV07B | `test(hosted): qualify external sandbox integrations for foundation gate` | F16a | R2；部署授权独立 |

## 5. 文档提交规则

1. 路线图、阶段门槛、架构决策和跨功能验收矩阵，单独提交文档 PR。
2. 业务行为、Schema、API、授权、账本、Adapter 和恢复规则，必须与对应功能 PR 同步提交。
3. 每个 R2 功能 PR 必须包含契约、不变量、兼容性、恢复方案、测试和 `CHANGELOG.html` 更新。
4. 文档 PR 不得把“已实现”“本地通过”写成“Hosted Sandbox 已验收”或“Live 已开放”。

## 6. 当前下一步

D0 文档基线完成后，进入 D1：冻结 F07 的 Budget Hold、Ledger Entry 和 Financial Posting 契约；D1 通过独立 R2 审查后，才开始 F07 代码实现。F08 同理，先完成 D2 Mandate 契约文档，再开始 F08。

