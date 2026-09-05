# Phase 0 Epic 3：External Pilot Readiness & Evidence

日期：2026-09-06
执行者：Codex
状态：Blocked by Transaction Trust Gate · scope frozen
Epic 风险等级：R2（外部试点会执行现有交易路径，不包含生产资金）
本次范围冻结风险等级：R0（仅文档与状态对齐）

## 1. 目标

验证真实外部团队能否在自己的 ChatGPT、Codex、Claude 或自建 Agent 工作流中接入 BU2，并完成可解释、可恢复且可验证的 Agent 收付闭环。

本 Epic 不再证明“仓库内代码能否运行”，而是回答三个产品问题：

1. 外部团队能否在不修改 BU2 源码的情况下完成第一笔有效 Simulation Receipt？
2. 接入失败时，团队能否依靠版本信息、`doctor`、稳定错误码和恢复建议自行定位问题？
3. 团队是否愿意继续进入受限真实支付评估，并能指出 BU2 对其 Agent 收付流程的具体价值？

用户继续在原有 Agent 平台创建和运行任务。BU2 只承担支付意图、授权、策略、交易编排、交付证据、结算事实和 Receipt，不建设任务工作台或通用 Agent 运行平台。

## 2. 前置状态

- Transaction Trust Gate 的 Receipt v0.2、数据库原子性与 x402 Testnet 可信执行必须全部通过并合并；在此之前不得开始外部团队试点。
- Epic 1 已通过 PR #8 合并并标记 Done。
- Epic 2 的 E2.1–E2.4 已通过 PR #10–#13 合并，TypeScript SDK、MCP Host、`doctor` 和三路径 clean-room 证据均已建立。
- HTTP、SDK 与 MCP 三条自动 clean-room 路径已在独立 Local Simulation 环境生成有效 Receipt。
- 当前项目仍处于 Phase 0；Mainnet、真实资金、客户资金托管、生产密钥、公开 npm 分发和远程 MCP 托管没有获得授权。

自动 clean-room 是试点前置证据，不能替代真实外部团队的接入与价值验证。

## 3. Owner 与责任

| 职责 | Owner | 责任 |
| --- | --- | --- |
| Accountable | Project Owner | 冻结试点范围、选择团队、批准 R2 合并与阶段决策 |
| Product | BU2 Product | 用户招募、试点脚本、价值访谈、指标与 Go/Iterate/Stop 结论 |
| Contract | BU2 Architecture | 保证试点不产生第二套交易、身份或证据语义 |
| Engineering | BU2 Engineering | Pilot Manifest、证据导出、诊断与支持包实现 |
| Verification | Codex（本地自动化） | Schema、兼容、失败、脱敏与回归验证 |
| Pilot Participant | 外部团队指定负责人 | 在其 Agent 环境执行接入、确认共享范围并反馈真实结果 |

AI Agent 可以实现、验证和整理证据，但不得伪造外部团队、代替用户反馈或批准 Phase 1。

## 4. 试点闭环

```text
外部团队选择自己的 Agent 与真实业务样例
  → 在本地读取版本化 Pilot Manifest
  → 使用 HTTP、TypeScript SDK 或 MCP 连接 BU2 Simulation
  → 运行 doctor，确认 endpoint、环境、契约与 Receipt 能力
  → 外部 Agent 提交 Quote / PaymentIntent
  → 人类或既有 Mandate 完成明确授权
  → Seller Agent 提交 DeliveryEvidence
  → BU2 结算并签发可独立验证的 Receipt
  → 团队本地生成最小化 Pilot Evidence
  → 团队明确选择是否向 BU2 分享脱敏结果
  → Product Owner 给出 Go / Iterate / Stop 决策
```

BU2 不要求试点团队复制 Prompt、上传私人会话、迁移任务或把完整 Agent 工程托管到 BU2。

## 5. 工作包与顺序

### E3.0 — 冻结外部试点契约（本文件）

- 关闭 Epic 2 并记录 PR #13 合并事实。
- 冻结试点对象、证据字段、共享边界、验收指标和停止条件。
- 明确自动化证据与外部用户证据的区别。
- 保持 Phase 0，不把范围冻结解释为 Phase 1 或真实资金准入。

### E3.1 — Pilot Manifest 与本地启动门槛

- 新增版本化 Pilot Manifest，声明 API、SDK、MCP、doctor、Evidence Schema、环境和支持的接入路径。
- 提供单一预检入口，复用现有 `doctor` 和 clean-room，不复制健康检查或交易语义。
- 在发生交易 mutation 前验证环境、契约版本、MCP 能力与 Receipt 验证能力。
- Manifest 不包含 API Key、私钥、钱包地址、客户数据或动态授权值。

### E3.2 — 最小 Pilot Evidence 与显式共享

- 冻结 `pilot-session-evidence` Schema，只记录匿名试点标识、接入路径、阶段耗时、结果类别、稳定错误码、人工协助次数和 Receipt 验证结果。
- Evidence 默认只保存在参与者本地；不得默认上传或远程持久化。
- 参与者必须显式选择共享，且共享前输出字段清单与脱敏预览。
- 不记录完整 Prompt、私人会话、原始交易载荷、Authorization header、Cookie、Secret、私钥或助记词。

### E3.3 — 失败处置与可移交支持包

- 支持包复用 Pilot Manifest、`doctor` 结果、稳定错误码、合法 request/trace ID、Transaction/Receipt ID 和版本哈希。
- 为配置不兼容、授权拒绝、幂等冲突、交付缺失、Provider unknown 与 Receipt 无效分别给出固定恢复路径。
- 任何未知资金结果都要求先查询或对账，不允许支持工具自动重放 mutation。
- 支持包必须通过敏感字段扫描，并允许参与者在共享前检查和删除。

### E3.4 — 三团队外部试点与阶段决策

- 由至少 3 个相互独立的外部团队在各自环境完成试点；自动化 Agent 或 BU2 内部重复运行不能计作外部团队。
- 每个团队至少让一个现有 Agent 完成一笔完整 Simulation 交易并验证 Receipt；整个样本至少覆盖两种接入路径。
- Base Sepolia 仅在参与者明确同意测试网资产边界后作为可选附加路径；不得成为试点通过的必要条件。
- Product Owner 汇总完成率、接入耗时、失败阶段、人工协助、价值反馈和继续试点意愿，并给出 Go / Iterate / Stop 结论。

## 6. 核心对象与契约

Epic 3 不新增交易系统核心对象。`pilot_id`、`pilot_session_id` 和证据记录属于试点上下文，不拥有或改变交易状态。

```text
Existing Agent Workflow
  → HTTP / @bu2/sdk / MCP
    → Agent Payment API v1
      → Existing Transaction Core
        → Signed Receipt

Pilot Manifest + Doctor Result + Pilot Evidence
  → 只描述接入过程
  → 不成为交易真相
  → 不覆盖 Ledger 或 Receipt
```

必须保持：

- Agent Payment API v1 是交易资源、状态、金额和错误语义的唯一来源。
- Pilot Evidence 只能引用 Transaction 与 Receipt，不能把试点状态投影成 `settled`。
- 所有金额继续使用整数最小货币单位和明确币种。
- 所有 mutation 继续要求显式幂等键；证据收集不得触发自动重试。
- 估算、观察、用户反馈和实际交易事实必须分别保存，不能相互覆盖。
- HTTP、SDK 与 MCP 继续是同一交易语义的不同入口。

## 7. 指标与通过标准

### 接入有效性

- 至少 3 个外部团队完成试点。
- 每个团队都从自身 Agent 环境生成至少 1 个 `receipt_valid=true` 的 Simulation Receipt。
- 整个样本至少覆盖 HTTP、SDK、MCP 中的 2 条路径。
- 接入不要求修改 BU2 源码，也不要求在 BU2 创建 Task。

### 开发者体验

- 首次接入至有效 Receipt 的中位耗时不超过 30 分钟。
- 每个团队最多需要 1 次同步人工协助；所有协助原因必须分类记录。
- 失败结果能回答发生阶段、稳定错误码、是否可重试以及下一恢复动作。
- 100% 支持包与共享证据通过 Schema 和敏感字段检查。

### 产品价值

- 至少 2 个团队明确愿意继续评估受限真实支付通道。
- 每个团队能指出至少一个具体价值：支付授权、异常阻断、交易归因、收款结算、Receipt 或审计。
- Product Owner 记录继续、迭代或停止的原因，不把礼貌性反馈计作购买承诺。

这些指标是进入下一次阶段决策的必要证据，不会自动批准 Phase 1、Mainnet 或生产部署。

## 8. 强制验证

E3.1–E3.3 的每个实现 PR 至少运行：

```bash
node docs/03-technical/validate-contract.mjs
npm --prefix sandbox test
npm --prefix packages/typescript-sdk test
npm --prefix sandbox run acceptance:clean-room
npm --prefix prototype run lint
npm --prefix prototype run build
```

还必须增加 Pilot Manifest/Evidence Schema 测试、失败/恢复测试、共享预览脱敏测试、零默认上传验证和从全新目录运行的试点包测试。

E3.4 必须提供真实外部团队证据。自动化测试只能证明工具正确，不能替代团队身份、真实接入耗时、人工协助次数或价值反馈。

## 9. 明确不做

- 不把用户任务、工作流、Prompt 或完整 Agent 项目迁移到 BU2。
- 不建设 BU2 Task 工作台、通用 Agent Runtime、Agent 市场或插件市场。
- 不公开发布 npm 包、不托管远程 MCP、不开放公网生产 Reference Server。
- 不增加 Python SDK、第二支付协议、第二资产、第二网络或第二真实支付通道。
- 不开放 Mainnet、真实资金、法币、托管、提现、换汇、跨链、资金归集或跨客户代付。
- 不发放生产 API Key，不收集生产客户数据，不建立默认远程遥测。
- 不把测试网成功、用户意向或 PR 合并描述为法律合规或生产准入。

## 10. 失败、停止与恢复

- Manifest、API、SDK 或 MCP 版本不兼容：在任何交易 mutation 前停止。
- 环境无法证明为 Simulation/Testnet：默认拒绝继续。
- 交易结果未知：停止自动动作，按 Transaction ID、request/trace ID 或 Provider reference 查询与对账。
- Receipt 无效：试点失败，保留最小证据，不将交易计入完成指标。
- 证据含敏感字段或共享范围不明确：禁止导出或上传，先完成本地清理与重新预览。
- 参与者要求真实资金、Mainnet、托管或生产凭证：退出本 Epic，进入独立阶段准入评估。

回退 E3.1–E3.3 时可以移除 Pilot Manifest、Evidence 与支持包，不修改已有 Transaction、Ledger、Outbox、Adapter 或 Receipt 历史。E3.4 的用户反馈只允许追加更正，不得为了改善指标覆盖原始记录。

## 11. Definition of Ready

- 目标、非目标、Owner、用户闭环与产品问题明确。
- Pilot 上下文与交易真相的所有权边界明确。
- E3.1–E3.4 顺序、指标、失败、恢复和人工证据要求明确。
- 数据字段、显式共享、脱敏与零默认上传边界明确。
- Phase 0、Simulation/Testnet 和禁止能力边界明确。

## 12. Definition of Done

只有同时满足以下条件，Epic 3 才能标记 Done：

1. E3.1–E3.3 已实现并通过本地自动化与独立审查。
2. 至少 3 个真实外部团队完成 E3.4，证据可追溯且没有由自动化伪装替代。
3. 试点指标、失败、人工协助、价值反馈和未覆盖路径已进入版本化报告。
4. API、SDK、MCP、doctor、Pilot Manifest、Evidence Schema、文档和 Changelog 保持一致。
5. Product Owner 和 Project Owner 对 Go / Iterate / Stop 结论完成人工审查。
6. 没有开放 Mainnet、真实资金、托管、生产 Secret、公开分发或远程 MCP。

结论：Epic 3 达到 **Ready**。下一实现项为 E3.1 Pilot Manifest 与本地启动门槛；本文件不构成 Phase 1、公开分发、Mainnet、真实资金、托管或生产部署授权。
