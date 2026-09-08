# BU2 Phase 0 业务路线与 PR 基线 v2

更新日期：2026-09-08
维护者：Codex  
风险等级：R0（文档与状态对齐，不改变运行时、Schema 或交易行为）

## 1. 目的

本文件把当前已批准的 Phase 0 业务里程碑、功能计划 ID、依赖和放行门槛统一为单一文档入口。计划 ID（F02-CI、F06a～F16b-ENV07B）是产品与工程路线标识，不等同于 GitHub PR 编号；实际 PR 编号以创建时为准。

BU2 继续定位为嵌入式 Agent AI 收付平台。外部 Agent 在自己的工作流中创建报价、支付意图和收款请求，BU2 负责授权、资金边界、交易事实、交付、结算、退款和 Receipt；本路线不建设 BU2 Task 平台或通用 Agent Runtime。

## 2. 当前状态

- 已完成：Epic 1、Epic 2、Transaction Trust Gate 1–3、F06a、F06b、ENV-01～ENV-06。
- 当前可用：Local Simulation；内部 Sandbox/Testnet 调试能力；F07 Budget Hold / Financial Posting、F08 版本化 PaymentMandate、F09a 自主支付执行、F10 Account-Owned Receivable 与 F11 Inbound Collection 已实现，均待对应 R2 审查。
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
| F07 | `feat(ledger): add scoped budget holds and financial postings` | F06b | 已合并 |
| D2 | `docs(f08): freeze payment mandate contract` | F07 | R0 文档基线 |
| F08 | `feat(mandates): enforce versioned autonomous payment grants` | D2 | R2 |
| F09a | `feat(execution): run authorized payment commands without operator approval` | F08 | R2 |
| F09b | `feat(recovery): schedule evidence-based recovery for existing attempts` | F09a | 历史实现已存在，需按当前路线补齐状态与审查记录 |
| F10 | `feat(collections): create account-owned receivables` | F07 | 已实现，待 R2 |
| F11 | `feat(collections): verify inbound payments and post funds once` | F10 | 进行中 |
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

D0/D1/D2 文档基线与 F07 代码实现已合并。F08 运行时与 F09a 已完成版本化授权、确定性 PolicyDecision、绑定校验、幂等状态转换和 Agent 执行命令，当前进入独立 R2 Domain 与 Architecture 审查。

D2 只改文档；F08/F09a/F10/F11 代码 PR 不启用真实 Testnet 双向收付、Hosted Sandbox、Live/Mainnet、托管或生产凭证，必须独立完成 Domain 与 Architecture R2 审查。F09b 的历史实现已覆盖持久化 payment attempt、unknown-result 冻结和显式 recovery 查询，本轮不重复引入第二套恢复实现。
