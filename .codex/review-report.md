# ENV-06 自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
任务：制品提升、监控、备份与恢复演练  
分支：`feat/env06-artifact-recovery-operations`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 制品候选、配置漂移、环境备份、隔离恢复和运营快照均落地；托管设施与 SLO 留 ENV-07/后续运营阶段 |
| 技术实现 | 19/20 | 复用官方 SQLite Online Backup API、Compose、SHA-256 与既有 Ledger；manifest 是受保护存储下的校验证据，不被表述为独立签名证明 |
| 金融不变量 | 20/20 | 恢复必须同环境、全新目标、禁用执行并要求对账；不自动重放 Provider，不加载 Signer，不执行付款 |
| 自动化验证 | 20/20 | Operations 6/6、Contract 59、Sandbox 109/109、SDK 10/10、部署/容器、clean-room、Prototype 与浏览器通过 |
| 文档与恢复 | 19/20 | Contract、操作手册、验收矩阵、总纲、治理、Changelog 与验证同步；正式远端存储、告警通道和 RPO/RTO 尚未定义 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

ENV-06 已证明干净提交可绑定同一不可变镜像，Sandbox/Live 可生成隔离的一致性备份并恢复至同环境禁用副本，配置漂移和跨环境恢复会失败关闭。它没有创建公网服务、远端备份设施、生产凭据、Signer 或链上付款，因此只能称为 GO for R2 review，不能称为托管 Sandbox/Live 上线。

## 核对

- [x] 目标、接口、非目标、Owner 与风险等级清晰。
- [x] 制品、配置、环境、数据库、备份 scope 与恢复状态具备机器契约。
- [x] 正常备份、WAL 事实、篡改、错环境、错配置和已存在目标已验证。
- [x] 恢复结果禁用执行、要求对账并禁止自动 Provider 重放。
- [x] Schema v9 未变化；真实镜像、两环境备份与隔离恢复已验证。
- [x] CHANGELOG 与实际行为一致。
- [ ] 托管对象存储、保留策略、告警通道、RPO/RTO 与 Sandbox E2E 尚未实现。
- [ ] R2 独立人类 Domain + Architecture 审查尚未完成。

## 残余风险

1. 当前是本机容器与临时文件证据，不证明远端存储耐久性、跨区域恢复、值班通知或既定 RPO/RTO。
2. 备份 manifest 使用数据库 SHA-256 发现漂移或篡改，但没有独立签名；生产存储必须另行提供访问控制与不可变保留。
3. SQLite 在线备份适用于 Phase 0 单实例；多节点一致性、对象锁和长期保留需独立设计。
4. Live 必须继续 `execution_disabled`；任何启用需要 G-F、L01、G-L 与独立 R3 授权。

---

# ENV-07A 自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
分支：`feat/env07-hosted-sandbox-evidence`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 独立覆盖启动、Secret、Candidate、Activation 与 E-T13/E-T14/E-T15 证据；明确拆出未执行的托管阶段 |
| 技术实现 | 19/20 | 复用现有环境、访问、Viem、x402 与制品摘要契约；启动前验证实际 RPC 链；无第二套 Transaction Core |
| 金融不变量 | 20/20 | Candidate 不自授权；Activation 有时限和小额限额；故障证据必须无重复资金；Live 排除 |
| 自动化验证 | 20/20 | 专项 8/8、全量 109/109、SDK/部署/运营/clean-room/Prototype、链接、Secret 和浏览器均通过 |
| 文档与恢复 | 17/20 | 系统文档和 Changelog 对齐；真实托管目标、DNS/TLS 和外部证据仍未建立 |

综合评分：95/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

Candidate 固定不授权部署或付款；Activation 必须由仓库外独立流程提供并绑定候选、有效期、审查人和 Testnet 小额限额。Hosted 启动入口拒绝直接 Secret 环境变量，并在监听 API 前验证 Sandbox、x402、Base Sepolia RPC 和机器鉴权组合。Evidence 同时要求双向 settled、可信 Receipt、无重复资金故障收敛与非交互 edge 鉴权。

## 残余风险

1. 尚未选定并认证托管目标，`api.sandbox.bu2.com` 的 DNS/TLS 也未验证，因此 ENV-07B 为 Not yet accepted。
2. 未执行真实双向 Base Sepolia 付款和托管故障注入；E-T13/E-T14/E-T15 不能标记通过，Epic 3 不能据此开始正式外部试点。
3. R2 变更需要独立 Domain + Architecture 审查后合并。

结论：ENV-07A 达到 **GO for R2 review**；托管 Sandbox、正式 Testnet 双向证据、Live/Mainnet 与真实资金仍为 NO-GO。

---

# ENV-07B Hosted Sandbox 部署准备自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
分支：`feat/env07b-hosted-deployment-prep`  
提交：`31a8cc1`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 仅 Sandbox Hosted Compose、部署契约、Secret 文件边界、Live 排除和文档均已覆盖 |
| 技术实现 | 19/20 | 复用既有 Hosted Sandbox 入口、Compose secret、不可变 artifact 和环境契约；未新增 Transaction Core |
| 金融不变量 | 20/20 | 无交易状态、金额、Ledger、Receipt 或 Adapter 逻辑变化；未加载 Signer 或广播付款 |
| 自动化验证 | 20/20 | Hosted 部署 2/2、Hosted Sandbox 8/8、Reference Server 109/109、Contract 62、SDK 10/10、Prototype lint/build 全部通过 |
| 文档与恢复 | 18/20 | ENV-07、部署 README、Changelog、验证记录已同步；真实托管目标、DNS/TLS 和 Activation 仍待外部阶段 |

综合评分：96/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

本变更为 ENV-07B 提供了可审查的 Sandbox-only 部署准备单元。它固定 Hosted Sandbox 启动命令、Base Sepolia `84532`、x402 exact、authenticated、execution_enabled、不可变镜像、文件型 Secret 和 loopback 端口，并拒绝 Live、mutable image、直接 Secret 环境变量与公开宿主端口。

## 残余风险

1. Compose 配置本身不证明云资源、DNS/TLS、边缘机器鉴权或 Secret Manager 已配置。
2. 未签发独立 Activation，未执行真实双向 Base Sepolia 交易和托管故障注入；E-T13/E-T14/E-T15 仍为 Not yet accepted。
3. Hosted Compose 的 `execution_enabled` 只代表受控 Sandbox 入口配置，不构成资金许可或 Mainnet 授权。

结论：ENV-07B 本地部署准备达到 **GO for R2 review**；公网 Hosted Sandbox、Testnet 双向证据、Live/Mainnet 与真实资金继续 NO-GO。

---

# ENV-07B Hosted Sandbox 外部验收包自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
分支：`feat/env07b-external-acceptance-pack`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | Schema、脱敏模板、Runbook、E-T13/E-T14/E-T15 顺序和停止条件均已覆盖 |
| 技术实现 | 19/20 | 复用 Hosted Sandbox Contract、Candidate/Activation/Evidence 验证器和现有 Compose；不新增交易语义 |
| 金融不变量 | 20/20 | 仅约束证据格式和部署前置，不改变金额、Ledger、Receipt 或支付状态机 |
| 自动化验证 | 20/20 | Schema 2/2、Hosted 部署 2/2、Hosted Sandbox 8/8、Reference Server 109/109、Contract 63、SDK 10/10、Prototype lint/build 通过 |
| 文档与运营 | 19/20 | Runbook、模板、Schema、索引、README、Changelog 和 verification 已同步；真实托管目标仍待外部指定 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

该变更把 ENV-07B 的外部执行顺序和证据结构固定下来，允许后续托管执行直接生成可验证的最小证据包，同时明确不接受 Local Simulation、模板文件或本地 Compose 解析作为托管通过证明。

## 残余风险

1. 没有托管平台、DNS/TLS、Secret Manager 和独立 Activation，就不能执行真实 E-T13/E-T14/E-T15。
2. Schema 只描述证据形状；链上真实性、Receipt issuer 信任和边缘机器鉴权仍需真实托管运行验证。
3. Epic 3 仍保持 Ready，不能因本地证据包完成而开始三个外部团队正式试点。

结论：外部验收包达到 **GO for R2 review**；ENV-07B hosted 子范围、Live/Mainnet 与真实资金继续 NO-GO。

---

# Internal Sandbox Product Baseline 自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非独立 R2 Approver）  
范围：OrbStack 本地 Sandbox 编排与环境预检

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖一键启动、健康/环境预检、状态查看、停止保留卷和 Live 排除 |
| 技术实现 | 19/20 | 复用现有 Dockerfile、Compose、环境契约和 immutable image；不新增交易语义 |
| 金融不变量 | 20/20 | 固定 `execution_disabled`，不加载 Signer，不触碰 Transaction Core、Ledger、Receipt 或 Adapter |
| 自动化验证 | 20/20 | 编排单测 3/3、Reference Sandbox 109/109、部署契约 2/2、Hosted Sandbox 8/8、Prototype lint/build 通过 |
| 文档与恢复 | 19/20 | Runbook、Changelog、testing、verification 和 operations 已同步；公网 Hosted 仍明确延后 |

综合评分：97/100

## 结论

建议：**通过本地实现，保留在当前分支等待人工审查**。

新增入口只允许启动内部 Sandbox，默认监听 loopback，自动验证 Sandbox / Base Sepolia / x402 / authenticated / `execution_disabled`，停止操作不删除数据卷。

## 残余风险

1. 本地编排入口不等于公网 Hosted Sandbox，也不提供 Secret Manager、TLS、边缘鉴权或独立 Activation。
2. 真实 Testnet 付款仍必须通过单独的受控流程，不能从 `sandbox:up` 推导付款授权。
3. 当前没有新增 Live/Mainnet 能力，Hosted E-T13/E-T14/E-T15 继续保持 Deferred。

结论：Internal Sandbox Product Baseline 达到 **GO for local review**；无需立即创建公网 Hosted PR。

---

# F06a 账户/Agent 持久归属与内部开发者接入自主审查报告

日期：2026-09-06  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
范围：Sandbox Schema v10、身份归属、onboarding、AccessController、OpenAPI/SDK 与内部接入文档

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | Principal、Account、Agent、Credential Binding、幂等 onboarding、生命周期和内部接入均已覆盖；资金来源、收款目标和 Mandate 留给后续 F06b/F08 |
| 技术实现 | 19/20 | 复用现有 access-control、环境/generation/expiry/status 语义和 SQLite 迁移；Agent Principal 与 Human Principal 明确分离 |
| 数据与权限边界 | 20/20 | 跨租户 claims、绑定冲突、状态和 generation 校验失败关闭；`/v1/access` 仅返回脱敏摘要 |
| 自动化验证 | 20/20 | Sandbox 112、SDK 10、Contract 63 + MCP 6、Deployment 2、Operations 6、Hosted 8、Clean-room 3、Prototype lint/build 全部通过 |
| 文档与运行说明 | 19/20 | README、技术文档、OpenAPI、SDK、CLI 示例、CHANGELOG 和验证记录已同步；独立人工 R2 审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

F06a 把配置中的明确身份声明落成可持久查询和审计的一等对象，支持幂等 onboarding、重启恢复、凭证轮换/失效和租户隔离，同时保留默认 Sandbox `execution_disabled`。它没有把 Agent 提升为 Operator，也没有修改支付执行、资金签名、Live/Mainnet 或 Hosted 公网边界。

## 残余风险

1. F06a 只建立业务身份与归属，不证明资金来源、收款目标或 Mandate 已可信绑定；这些是 F06b/F08 的验收范围。
2. 本轮验证没有启用 Signer 或真实付款，不能把 Sandbox 身份建档结果描述为 Testnet 双向收付完成。
3. R2 合并仍需要独立人类 Domain 与 Architecture 审查；Codex 不能作为批准者。

---

# D2 F08 Payment Mandate 契约自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`docs/d2-f08-mandate-contract`
基线：`main` / `b982c87`

## 审查范围

- PaymentMandate 核心字段、绑定主体、状态机和版本替换。
- PolicyDecision 的确定性输出、快照、原因码、有效期与审计引用。
- F07 Budget Hold 与 F09 自主执行的边界。
- 幂等、并发、重放、暂停/撤销和环境隔离约束。
- 产品、技术、路线、根 README、CHANGELOG 与验证记录的同步。

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 20/20 | 覆盖金额、币种、收款方、用途、环境、有效期、资源范围和四类主体绑定 |
| 契约清晰度 | 19/20 | 字段、状态、决策顺序、稳定原因码和 F07/F09 依赖均可执行；具体 API 仍留给 F08 代码 PR |
| 金融边界 | 20/20 | 明确 Mandate 不是预算、Hold 不是授权，未授权不得预留，未调用 Provider 或 Signer |
| 可验证性 | 19/20 | 链接、格式、契约静态检查通过；运行时测试留给 F08 R2 代码 PR |
| 文档一致性 | 20/20 | 产品、技术、路线、根 README、CHANGELOG、testing、verification 和 operations 已同步 |

综合评分：98/100

## 结论

建议：**通过 D2 文档基线，进入独立 R2 Domain 与 Architecture 审查；合并后才开始 F08 代码 PR。**

D2 只冻结授权事实和运行时边界，不声称 F08 已实现，也不授权 Sandbox/Testnet 双向收付、Hosted、Live/Mainnet、托管或生产凭证。

## 遗留风险

1. F08 代码需要把契约落到 Schema、OpenAPI、MCP、SDK 和确定性运行时测试，并验证并发、重启和幂等冲突。
2. F07 当前实现与未来 Mandate 决策的集成必须证明 `approved` 之后才创建 Budget Hold，不能以预算充足覆盖授权拒绝。
3. 独立人类 R2 审查尚未完成；Codex 不能作为批准者。

---

# D1 F07 财务边界契约自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`docs/d1-f07-financial-boundary`
基线：`main` / `9a6bdaf`

## 审查范围

- `docs/02-product/F07_FINANCIAL_BOUNDARY_CONTRACT.md` 的 Budget Scope、Budget Hold、Ledger Entry、Financial Posting、状态机、事务、并发幂等、对账恢复和非目标。
- 产品、技术、Phase 0 路线入口及 `CHANGELOG.html` 的状态同步。
- D1 是否保持文档-only 边界，不提前改变 API、Schema、Transaction Core、余额、支付或环境准入。

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 20/20 | 覆盖 F07 对象、金额约束、状态流转、并发、幂等、恢复、对账和 F08/F09/F10 边界 |
| 契约一致性 | 19/20 | 复用现有 Transaction Core、SQLite WAL、CAS、Claim、LedgerEvent 与 Outbox；实现阶段仍需用代码固定具体 API/Schema |
| 风险边界 | 20/20 | 明确预算预留不等于授权或 Provider 付款，未开放 Live/Mainnet、托管和生产凭证 |
| 可验证性 | 19/20 | 已完成契约回归、现有 Sandbox/SDK/Prototype 回归与链接扫描；F07 运行时测试留待代码 PR |
| 文档同步 | 20/20 | 产品、技术、路线、Changelog、testing、verification 与审计上下文已同步 |

综合评分：98/100

## 结论

建议：**通过本地文档审查，进入 R2 独立人工审查**。

D1 将预算 Scope、Hold 和不可变财务事件定义为单一边界，并要求 F07 复用既有原子事务和追加账本能力。它没有把预算余额变成第二账本，也没有把预算检查误认为 Payment Mandate 或支付结算授权。D1 PR 合并不代表 F07 代码获准实施；必须先获得独立 Domain 与 Architecture R2 批准。

## 验证证据

- `git diff --check`：通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix sandbox test`：115/115 通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单测通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- 变更文档相对链接扫描：通过。

## 残余风险与后续门槛

1. F07 代码实现仍需追加 Schema、API、SDK、MCP、迁移、并发和故障注入测试，并按 R2 模板提交。
2. Budget Hold 与 Transaction reserved/settled 之间的映射必须在实现 PR 中提供可重建证据，不能依赖 UI 快照。
3. 本轮未执行 F07 运行时、数据库迁移、浏览器、Sandbox/Testnet 支付或 Hosted E2E；这些不是文档 PR 的验收范围。
4. Live/Mainnet、真实资金托管、生产凭证和公网 Hosted Sandbox 继续关闭。

---

# F07 Budget Hold / Financial Posting 自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/f07-budget-financial-posting`
基线：`main` / `9c05889`

## 审查范围

- Schema v12 的 `budgets`、`budget_holds`、`financial_postings` 和迁移恢复。
- PaymentIntent `budget_id`、授权前 Budget Hold、结算时 Consume 与 Transaction Detail 财务证据。
- HTTP/OpenAPI/TypeScript SDK 资源接口、幂等、原子提交和旧支付流兼容。

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 18/20 | 覆盖预算、预留、Posting、超预算、结算和重启；释放/过期端点与层级 Scope 解析留给后续增量 |
| 技术实现 | 18/20 | 复用现有 SQLite WAL、CAS、Claim、LedgerEvent、Outbox 和 `commitDomainMutation`；Posting 追加写入且不覆盖历史 |
| 金融边界 | 19/20 | Hold 与 Provider 付款、Mandate、Settlement 分离；未配置预算的旧流程兼容，Live/Mainnet 继续关闭 |
| 自动化验证 | 20/20 | F07 4/4、Sandbox 118/118、SDK 10/10、契约 63 项不变量与 Prototype lint/build 通过 |
| 文档与契约 | 19/20 | OpenAPI、SDK、产品、技术、Changelog、testing、verification 已同步；独立 R2 审查尚未完成 |

综合评分：94/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

F07 已把预算约束接入 Transaction Core 的同一原子提交：授权时先校验并创建 active Hold，结算时将 Hold 转为 consumed 并追加两条 Posting；预算、Hold、Posting、LedgerEvent、Webhook Outbox、钱包和幂等终态一起提交。F08 Mandate 仍是授权来源，F07 不新增审批或支付执行。

## 残余风险与后续门槛

1. 当前实现优先覆盖单一有效 Scope；多级 Scope 链、释放/过期操作和预算调整需后续 F07 增量 PR。
2. `financial_postings` 目前通过追加表与资源快照同步，后续需增加独立对账重建命令和并发故障注入覆盖。
3. 本轮未执行真实 Testnet 支付、Hosted E2E、Live/Mainnet 或托管；这些能力仍保持关闭。
4. F07 PR 合并前需要独立人类 Domain 与 Architecture R2 批准；Codex 不能作为批准者。

---

# D0 Phase 0 业务路线与文档基线审查报告

日期：2026-09-07
审查者：Codex
分支：`docs/d0-roadmap-baseline`
基线：`main` / `82cdb7b`

## 审查范围

- M1～M5 里程碑与 F02-CI～F16b-ENV07B 依赖。
- F07/F08 产品定义与后续实现顺序。
- 已合并项状态、Epic 3 前置条件和文档入口。
- `CHANGELOG.html` 对本次文档变更的记录。

## 结果

| 维度 | 评分 | 结论 |
|---|---:|---|
| 需求覆盖 | 95 | 用户提供的里程碑、PR 依赖和文档策略已进入单一基线 |
| 一致性 | 94 | 产品、技术、根 README 与 Epic 3 已统一当前顺序和状态 |
| 可验证性 | 93 | 链接、格式、契约静态验证通过 |
| 风险边界 | 97 | 未修改 API、Schema、交易状态、支付通道或环境准入 |
| 综合 | 95 | 通过 |

## 验证证据

- `git diff --check` 通过。
- Markdown 相对链接扫描通过。
- `rg` 旧状态与旧 F07/F08 定义扫描无残留。
- `node docs/03-technical/validate-contract.mjs` 通过：63 项不变量、6 个 MCP 工具。

## 遗留风险

- D0 只完成文档基线；F07 财务契约仍未冻结，不能据此开始资金相关实现。
- Hosted Sandbox、真实 Base Sepolia 双向收付和 Live/Mainnet 仍未开放。
- 本次未运行 Sandbox、SDK、Prototype 或 Hosted 测试，因为没有可执行代码变更。

## 结论

D0 文档基线达到 R0 交付标准。下一项应创建 D1：F07 Budget Hold、Ledger Entry 与 Financial Posting 契约文档；D1 通过 R2 审查后再开发 F07。

---

# F06b 资金来源与收款目标绑定自主审查报告

日期：2026-09-07  
审查者：Codex（Contributor / Verifier，非 R2 Approver）  
范围：Schema v11、onboarding、钱包绑定校验、Quote/PaymentIntent 归属、OpenAPI/SDK 与文档同步

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖资金来源、收款目标、环境/租户/Account/Agent 归属、状态/验证/generation、Quote/PaymentIntent 绑定和旧演示兼容 |
| 技术实现 | 19/20 | 复用 F06a 身份与环境 metadata，采用追加 Schema v11 和现有 Quote/PaymentIntent 校验路径 |
| 数据与金融边界 | 20/20 | 跨租户、资产/网络、未验证、停用、引用漂移和绑定 ID 冲突失败关闭，不改变 Transaction Core 状态机 |
| 自动化验证 | 20/20 | Sandbox 115、SDK 10、Contract 63 + MCP 6，生成/格式/lint/类型/build 与 diff 检查通过 |
| 文档与恢复 | 19/20 | F06b 技术契约、README、ENV-05/06、CHANGELOG、testing、verification 已同步；独立人工 R2 审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立人工审查**。

F06b 让 Quote 和 PaymentIntent 能够保留可验证的资金来源与收款目标归属，并把配置漂移从默认演示行为提升为明确的失败关闭。旧 onboarding 未配置绑定时继续可用；绑定引用变化必须创建新 ID 或 generation。该变更没有启用 Signer、真实支付、Live/Mainnet、Hosted 公网或托管能力。

## 残余风险

1. 真实钱包地址/Provider 引用的外部验证仍需在批准的 Sandbox 流程中完成；本轮只验证配置契约和持久化边界。
2. F06b 不等于资金来源已经可用或已完成 Testnet 双向付款；付款执行仍受环境和独立授权门禁控制。
3. R2 合并仍需要独立人类 Domain 与 Architecture 审查；Codex 不能作为批准者。
