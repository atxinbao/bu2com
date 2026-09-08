# BU2 Pull Request

## 1. 变更摘要

F08 将已冻结的 D2 Payment Mandate 契约落到 Reference Sandbox。系统现在可以创建和查询版本化 Mandate，执行 activate/suspend/revoke/expire 状态转换，并在 PaymentIntent 创建时产生可持久化、可解释的 PolicyDecision。持久化运行时只有在 Funding Source 与 Receiving Target 均为 active/verified 绑定时才能激活 Mandate，避免未绑定授权进入 F07 Budget Hold。本 PR 不执行支付，也不开放 Hosted、Live/Mainnet 或托管能力。

- 关联 Issue / 需求：Phase 0 / F08
- 变更 Owner：BU2 Engineering / Codex（Contributor）
- 目标环境：`Local / Sandbox / Testnet`
- 计划发布日期：R2 审查通过后随下一候选版本发布

## 2. 范围与边界

### 本 PR 包含

- PaymentMandate 与 PolicyDecision 领域对象、状态机、版本检查、幂等和持久化。
- Mandate HTTP API、权限、OpenAPI 与 TypeScript SDK。
- PaymentIntent 的确定性授权判断及 PolicyDecision/Mandate version 引用。
- SQLite Schema v13 追加索引，以及绑定、重启、状态和回归测试。

### 本 PR 不包含

- F09a Provider/Signer 自主执行、F09b 恢复调度、F10/F11 收款。
- 真实 Testnet 双向付款、Hosted Sandbox、Live/Mainnet、托管或生产凭证。
- MCP 工具数量变更、Receipt 版本变更或支付 Adapter 行为变更。

### 受影响模块

- [ ] Prototype / UI
- [x] API / MCP / SDK
- [x] Transaction Core / 状态机
- [x] PaymentMandate / Policy / Approval
- [x] Ledger / Balance / Reconciliation
- [x] Database / Migration
- [ ] Webhook / Outbox / Worker
- [ ] Payment Adapter / Provider / x402 / AP2
- [ ] Receipt / Signature / Key
- [ ] Observability / Operations
- [ ] Environment / Deployment / Chain isolation
- [x] Documentation / Governance
- [ ] 其他：不适用

## 3. 风险等级

- [ ] **R0 — 文档与纯展示**：不影响契约、金额或交易状态。
- [ ] **R1 — 普通应用逻辑**：不触碰资金路径。
- [x] **R2 — 交易相关**：涉及状态机、金额、授权、账本、持久化、Webhook、Adapter 或 Receipt。
- [ ] **R3 — 生产资金与不可逆变更**：涉及真实资金、生产迁移、密钥、主网或支付通道。

风险判断理由：本 PR 改变 PaymentIntent 前的授权判断、持久化对象和 Schema，但不会调用 Provider、签名或广播资金指令。

## 4. 行为变化

| 项目 | 变更前 | 变更后 | 兼容性影响 |
| --- | --- | --- | --- |
| 用户可见行为 | 仅有演示 Mandate ID | 可创建、查询和转换版本化 Mandate | 新 API 为追加能力 |
| API / MCP / Event | 无 Mandate API | 新增 Mandate API、SDK 与授权审计事件 | MCP 六工具不变 |
| 交易状态 | 演示规则决定授权 | PolicyDecision 决定 allowed/review_required/denied | 旧演示 ID 仅通过显式白名单兼容 |
| 金额与币种 | 单笔演示上限 | Mandate 定义单笔、每日、每月整数限额 | 不改变 Quote 金额 |
| 数据与账本 | Schema v12 | Schema v13 追加 Mandate/PolicyDecision 索引和资源 | 不重写历史记录 |
| Provider / 外部系统 | 既有 simulated/x402 Adapter | 不变 | 无外部调用变化 |
| Environment / Chain / Execution status | Local/Sandbox/Live 既有门禁 | 不变 | Live 保持关闭 |

## 5. 金融不变量检查

- [x] 交易状态只能由 Transaction Core 改变。
- [x] 授权、预留、交付、结算、退款和争议仍是独立事实。
- [x] 金额使用整数最小货币单位并显式携带币种。
- [x] 保持 `refunded <= settled <= reserved <= authorized`。
- [x] LedgerEvent 只追加；更正使用补偿事件，不覆盖历史。
- [x] 相同幂等键和相同载荷返回原结果；不同载荷被拒绝。
- [x] 并发、重复消息和重复 Webhook 不会造成重复资金操作。
- [x] 外部调用超时被视为结果未知，不会自动重复扣款或错误释放资金。
- [x] Adapter 不绕过 PaymentMandate、策略、交付证据、Receipt 或对账。
- [x] Receipt 与交易、交付、结算和 Provider reference 保持可验证绑定。
- [ ] 本 PR 不影响以上不变量，并已在下方说明原因。

不变量影响与证明：F08 仅在授权前增加确定性决策。只有 `approved` 能进入现有 F07 Budget Hold；`review_required` 与 `denied` 不预留资金。既有原子提交、幂等 Claim、CAS、Ledger、Outbox、Adapter 未知结果和 Receipt 回归全部通过。

## 6. 授权、权限与敏感信息

- [x] 没有秘密、私钥、助记词、支付令牌、生产凭证或客户数据进入代码、日志、测试夹具或 PR 内容。
- [x] 新增或改变的权限遵循最小权限，并明确主体、资源、动作、环境和有效期。
- [x] 未扩大 Agent 的 PaymentMandate、预算、限额、商户或 Provider 范围。
- [x] 日志和错误响应已脱敏。
- [x] 使用官方且经过审查的密码学或支付 SDK，没有自研加密算法。
- [ ] 不适用；原因：本 PR 明确涉及授权权限。

环境与执行边界（所有 PR 必填）：

- 影响环境：`local / sandbox`；Live 仅验证失败关闭
- 执行后端：`none`（本 PR 不新增执行）
- Chain ID / Network：环境契约不变；Sandbox 仍为 Base Sepolia / `eip155:84532`
- `execution_status` 是否变化：否
- 数据库、凭证、Signer、Receipt issuer、Webhook 和 Provider 是否保持环境隔离：是
- 本 PR 是否可能签名或广播资金指令：否
- [x] 没有从 Adapter 名称推导环境，没有将环境值或布尔开关解释成资金许可。
- [x] 没有把 Local Simulation 证据描述为 Sandbox 链上验收。
- [x] Live 保持 `execution_disabled`；若不保持，已按 R3 提供独立、限定范围的明确授权。

## 7. API、事件、Schema 与迁移

- API / Event / Receipt / Policy / Adapter 版本影响：API v0.3.0 追加 Mandate 资源；Receipt、MCP、Adapter 版本不变
- Environment contract / client handshake 版本影响：无
- 向后兼容策略：显式保留既有演示 Mandate ID 白名单；未知 `mdt_*` 不自动接受
- 数据所有者与事务边界：Transaction Domain；复用现有 `commitDomainMutation`
- 迁移方式：`expand → verify`
- 数据量、锁表和性能影响：Schema v13 仅为通用 resources 表追加部分索引
- 校验查询或一致性证明：Schema 迁移、重启恢复与全量 Sandbox 测试通过
- 旧版本停止条件：旧运行时不得写入或重解释 Schema v13 Mandate 决策

数据库或历史数据是否发生变化：

- [ ] 否
- [x] 是，已附版本化迁移、前滚恢复、兼容期和验证证据。

## 8. 失败、恢复与回滚

- 可能的失败点：无绑定、非 active、过期、超限、范围漂移、版本冲突或幂等冲突。
- 部分成功时的资金、状态、Ledger、Outbox 与 Adapter 状态：失败发生在 Provider 调用前，不产生资金动作；事务回滚保持既有事实。
- 超时或未知结果的处理方式：F08 不调用外部 Provider；既有写入未知结果仍要求查询后恢复。
- 停止条件：Mandate 或绑定不满足、版本冲突、环境不匹配时失败关闭。
- 回滚或前滚恢复步骤：回退应用代码；保留 Schema v13 资源和索引，不删除或重写历史决策。
- 数据恢复与对账方式：SQLite 重启恢复 Mandate/PolicyDecision；交易仍按既有 Ledger/Receipt 对账。
- 已验证无法安全回滚；原因及替代控制：不适用，Schema v13 为追加迁移。

## 9. 测试与证据

| 验证项 | 命令 / 场景 | 结果 | 环境与证据 |
| --- | --- | --- | --- |
| Lint / 类型检查 | `npm --prefix packages/typescript-sdk test`、Prototype lint | 通过 | Local |
| 单元测试 | `node --test sandbox/f08.test.mjs` | 4/4 | Local，覆盖状态与绑定门槛 |
| 集成 / HTTP 测试 | `npm --prefix sandbox test` | 123/123 | Local Reference Sandbox |
| 契约测试 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools | Local |
| 幂等 / 并发测试 | Sandbox atomicity 与 F08 状态测试 | 通过 | Local SQLite |
| 故障注入 / 恢复 | Sandbox 全量原子提交、重启、Provider unknown 回归 | 通过 | Local |
| Migration / Backfill | Schema v13 迁移与重启恢复 | 通过 | Local SQLite |
| 构建 / 浏览器验收 | `npm --prefix prototype run build` | 构建通过；无 UI 行为变化 | Local |
| Sandbox / Testnet E2E | 未执行 | 本 PR 不启用资金执行 | 后续 F09/F15/F16 门禁 |

### R2/R3 强制场景

- [x] 同键同载荷只产生一次结果，同键不同载荷被拒绝。
- [x] 未授权不能预留，未交付不能结算，非法状态转换不移动资金。
- [x] 并发授权、结算或退款只有一次成功。
- [x] Adapter 失败、超时和未知结果不会重复移动资金。
- [x] 重启后资源、幂等、账本、Outbox 和 Adapter 操作可恢复。
- [x] 重复 Webhook 不会重复处理，失败进入受控重试或死信。
- [x] Ledger 可验证或重建关键状态，Receipt 可独立验证。
- [x] 旧 API、事件、Receipt 和历史数据仍可解释。
- [x] 日志与错误输出不包含秘密或敏感支付数据。
- [x] 错环境、错链、错库、错 Signer、错 Provider 和跨环境凭证均失败关闭。

未执行项及风险：未执行真实 Sandbox/Testnet 双向付款和 Hosted E2E，因为 F08 不加载 Signer、不调用 Provider；不得据此宣称资金执行已验收。

## 10. 可观测性与运营

- 新增或变化的指标、日志和 Trace：新增 Mandate 事件与 PaymentIntent PolicyDecision 引用；沿用 request/trace correlation
- 告警条件与 Owner：授权拒绝率或版本冲突异常由 Transaction Domain Owner 观察
- 对账与未知交易处理：不变，沿用现有 Ledger/Receipt 与 Provider unknown 恢复
- Dashboard / Runbook：文档入口、CHANGELOG、verification 已更新
- 容量、延迟和成本影响：本地确定性规则和资源索引，预期影响有限
- 发布后观察窗口：下一候选版本的 Local/Sandbox 回归周期

## 11. 发布计划

- 发布方式：`一次发布`
- Canary 范围与限额：仅 Local/Internal Sandbox，不启用真实资金
- 人工执行步骤：独立 R2 Domain 与 Architecture 审查后合并
- 发布负责人：待 Owner 指定
- 回滚负责人：待 Owner 指定
- 对账负责人：Transaction Domain Owner

### R3 追加门槛

- [ ] 已提供真实隔离 Sandbox / Base Sepolia 端到端证据；Local Simulation 不计入本项。
- [ ] 已定义 Canary、低限额、白名单和自动停止条件。
- [ ] 已确认监控、对账、备份与恢复演练结果。
- [ ] 已确定生产变更窗口与逐步确认流程。
- [ ] 如包含生产执行，已获得或将在执行前获得 Project Owner 的明确授权，并记录环境、目标、范围、窗口、停止条件和恢复方式。

R3 不适用：本 PR 为 R2，且不包含生产或真实资金执行。

## 12. 文档与变更日志

- [x] `CHANGELOG.html` 已在本 PR 中同步更新，并准确描述行为、风险和验证结果。
- [x] 产品、API、OpenAPI、MCP、Event、Schema、Receipt 和运行手册已按影响更新。
- [x] 如改变架构边界或不可逆决策，已附 ADR。（未改变既有架构边界，D2 契约已合并）
- [x] 如存在临时例外，已记录范围、补偿控制、批准人和到期时间。（无临时例外）
- [x] 文档、代码与测试表达同一套业务事实。

Changelog 条目名称：`F08 · 版本化 Payment Mandate 运行时`

## 13. 审查与批准

- Product Owner：待指定
- Transaction Domain Owner：待指定
- Architecture Owner：待指定
- Operations Owner：不适用，本 PR 不改变部署或执行状态
- Compliance / Legal Owner：不适用，本 PR 不开放生产资金
- 独立审查者：待指定

审批要求：

- [ ] R0：Owner 或维护者已审查。
- [ ] R1：模块 Owner 已审查，Lint、测试和构建通过。
- [ ] R2：至少一名独立人类审查者批准，Domain 与 Architecture 证据完整。
- [ ] R3：Project Owner 已明确人工批准；如包含生产执行，授权范围、执行窗口、停止条件和恢复方式已经记录。
- [ ] R3 操作符合 `PROJECT.html` 当前阶段准入门槛；如需扩大能力边界，项目总纲已先行更新并批准。

## 14. 残余风险与后续工作

| 风险 / 技术债 | 影响 | 临时控制 | Owner | 到期日期 / 关闭条件 |
| --- | --- | --- | --- | --- |
| F09a 自主执行尚未实现 | Mandate approved 不等于 Provider 已付款 | 执行能力保持既有门禁 | Transaction Domain Owner | F09a R2 合并 |
| 真实 Sandbox 双向收付未验收 | 不能作为外部 Beta 证据 | 仅使用 Local/Internal Sandbox | Project Owner | F16a/F16b 验收 |
| 独立 R2 审查未完成 | 不得合并或放行后续依赖 | Draft PR 保持待审 | Domain/Architecture Owner | 独立批准 |

## 15. 提交者最终确认

- [x] 变更范围与批准需求一致，没有夹带无关重构或依赖升级。
- [x] 没有通过放宽校验、删除断言或跳过测试掩盖问题。
- [x] 没有把 Local、Sandbox 或 Testnet 结果描述为生产证明。
- [x] 已明确区分服务环境、执行后端与资金准入；Live 配置不等同于 Mainnet 执行授权。
- [x] 所有失败、未覆盖路径、未知结果和恢复责任均已披露。
- [x] 本 PR 满足对应风险等级的 Definition of Done，可以进入审查。
