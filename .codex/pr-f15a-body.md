# BU2 Pull Request

## 1. 变更摘要

- 关联 Issue / 需求：Phase 0 F15a — `feat(sandbox): add isolated bounded internal execution sessions`
- 变更 Owner：Codex（Contributor / Verifier，非 R2 Approver）
- 目标环境：`Local / Sandbox / Testnet`；仅本地与内部契约验证
- 计划发布日期：合并后由独立 R2 Domain / Architecture 审查决定

F15a 为外部 Agent 的既有工作流增加短时、隔离、可审计的 `ExecutionSession`，不要求用户迁移任务到 BU2。会话激活与 PaymentMandate 激活保持独立；会话支出在预留、结算、取消和 SQLite 重启路径保持有界。

## 2. 范围与边界

### 本 PR 包含

- 持久化 `ExecutionSession` 资源及 requested/active/paused/completed/expired/revoked 状态机。
- 独立 `activation_id`、审核人、15 分钟最大窗口、tenant/Account/Agent/environment 绑定。
- PaymentIntent 可选引用 `execution_session_id`；会话支出在预留、结算、取消中原子更新。
- HTTP/OpenAPI/Access Contract/TypeScript SDK、产品契约、CHANGELOG 和验证记录。

### 本 PR 不包含

- 不创建 BU2 Task 平台，不替代 PaymentMandate，不改变 MCP 6 工具冻结契约。
- 不启用 Hosted、公网 DNS/TLS、Live/Mainnet、托管钱包、生产凭证或真实 Provider 付款。
- 不实现 F15b 运营压测/停机恢复验收或 F16a 内部 Beta 放行。

### 受影响模块

- [x] API / MCP / SDK
- [x] Transaction Core / 状态机
- [x] PaymentMandate / Policy / Approval
- [x] Ledger / Balance / Reconciliation
- [x] Database / Migration（复用通用 resources 快照，无新增破坏性表迁移）
- [x] Environment / Deployment / Chain isolation
- [x] Documentation / Governance

## 3. 风险等级

- [x] **R2 — 交易相关**

风险判断理由：ExecutionSession 参与 PaymentIntent 预留边界，改变 API、权限、持久化资源和交易视图，虽然不新增 Provider 或真实资金通道。

## 4. 行为变化

| 项目 | 变更前 | 变更后 | 兼容性影响 |
| --- | --- | --- | --- |
| 用户可见行为 | 没有会话级执行边界 | 可创建/激活/暂停/完成/撤销/过期 bounded session | 旧 PaymentIntent 不受影响 |
| API / Event | 无 Session API | 新增 `/v1/execution_sessions` 与 `execution_session.*` 事件 | OpenAPI/SDK 同步扩展 |
| 交易状态 | PaymentIntent 只受 Mandate 约束 | 可额外受 active Session、窗口和剩余支出约束 | 未引用 Session 的旧流程保持原语义 |
| 金额与币种 | Wallet/Budget Hold | 增加 Session reserved/committed 支出，币种必须匹配 | 金额仍为整数最小单位 |
| 数据与账本 | 通用 resources 快照 | 新增 `execution_sessions` 资源，沿用原子 Snapshot/Ledger/Outbox | 无破坏性 schema 表迁移 |
| Provider / 外部系统 | 既有 Adapter | 无新增 Provider 调用 | 不触发真实付款 |
| Environment / Chain / Execution status | 由环境契约控制 | Session 必须匹配环境；激活仍受 `execution_status` 门禁 | Live 保持 disabled |

## 5. 金融不变量检查

- [x] 交易状态只能由 Transaction Core 改变。
- [x] 授权、预留、交付、结算、退款和争议仍是独立事实。
- [x] 金额使用整数最小货币单位并显式携带币种。
- [x] 保持 `refunded <= settled <= reserved <= authorized`。
- [x] LedgerEvent 只追加；Session 支出以追加事件表达。
- [x] 相同幂等键和相同载荷返回原结果；不同载荷被拒绝。
- [x] 并发、重复消息和重复 Webhook 不会造成重复资金操作。
- [x] 外部调用超时被视为结果未知，不会自动重复扣款或错误释放资金。
- [x] Adapter 不绕过 PaymentMandate、策略、交付证据、Receipt 或对账。
- [x] 本 PR 不影响以上不变量，并已由 F15a targeted/full regression 证明。

不变量影响与证明：Session 预留、Session committed/reserved 计数、Wallet、Budget Hold、Transaction、LedgerEvent、Outbox 和幂等终态在同一既有 mutation 事务中提交；取消释放 reserved，结算转为 committed，Provider unknown 仍由 F09b 查询恢复。

## 6. 授权、权限与敏感信息

- [x] 没有秘密、私钥、助记词、支付令牌、生产凭证或客户数据进入代码、日志、测试夹具或 PR 内容。
- [x] 新权限遵循最小权限：Agent 可创建/读取，Developer 可创建/管理，Operator 可读取/管理；非平台主体还受 tenant/Account/Agent claims 约束。
- [x] 未扩大 Agent 的 PaymentMandate、预算、限额、商户或 Provider 范围。
- [x] 日志和错误响应已脱敏。
- [x] 使用既有官方 SDK；没有新增密码学或自研支付算法。

环境与执行边界：

- 影响环境：`local / sandbox` 契约；Live 创建被拒绝
- 执行后端：`simulated / x402` 既有契约，不新增调用
- Chain ID / Network：沿用环境注册表；Local 无链，Sandbox 仍 Base Sepolia `eip155:84532`
- `execution_status` 是否变化：否；Sandbox/Live 默认仍 `execution_disabled`
- 数据库、凭证、Signer、Receipt issuer、Webhook 和 Provider：保持环境隔离
- 本 PR 是否可能签名或广播资金指令：否

## 7. API、事件、Schema 与迁移

- API / Event / Policy 影响：新增 ExecutionSession API、权限和 `execution_session.*` 事件；PaymentIntent 增加可选 `execution_session_id`。
- Environment contract / handshake 版本：不变，API v0.3.0 / MCP v0.3.0 保持。
- 迁移方式：`无`；复用现有 generic `resources` snapshot，不新增破坏性 SQLite 表。
- 数据所有者与事务边界：Transaction Core / `runIdempotentAsync`；Session 与 Wallet/Budget Hold/Transaction 一起提交。
- 旧版本停止条件：无；未引用 Session 的旧资源继续可读。

## 8. 失败、恢复与回滚

- 失败点：窗口超过 15 分钟、跨环境/主体/币种、未激活/暂停/过期、Session 剩余支出不足、版本冲突。
- 部分成功：既有原子提交回滚资源、余额、Session 支出、事件、Outbox 和幂等 Claim。
- 超时或未知 Provider：不自动重付；继续由 F09b 查询/对账。
- 停止条件：任一环境或 Mandate 门禁不满足，Session 激活或 PaymentIntent 预留失败关闭。
- 回滚：停止新 Session 创建/激活并回退应用制品；保留已写入资源和账本供只读查询，不删除历史事实。

## 9. 测试与证据

| 验证项 | 命令 / 场景 | 结果 | 环境与证据 |
| --- | --- | --- | --- |
| Lint / 类型检查 | `npm --prefix packages/typescript-sdk test`；Prototype lint | 通过 | Local |
| 单元测试 | `node --test sandbox/f15a.test.mjs` | 3/3 通过 | Local |
| 集成 / HTTP 测试 | `node --test sandbox/f15a-http.test.mjs` | 1/1 通过 | Local |
| 契约测试 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP 通过 | Local |
| 幂等 / 并发测试 | Sandbox full suite | 151/151 通过 | Local |
| 故障注入 / 恢复 | F15a restart + existing atomicity/x402 recovery suites | 通过 | Local |
| Migration / Backfill | generic resources restart persistence | 通过 | Local SQLite |
| 构建 / 浏览器验收 | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 | Local |
| Sandbox / Testnet E2E | Hosted/真实 Base Sepolia | 未执行；不属于 F15a，继续关闭 | — |

### R2/R3 强制场景

- [x] 同键同载荷只产生一次结果，同键不同载荷被拒绝。
- [x] 未授权不能预留，未交付不能结算，非法状态转换不移动资金。
- [x] Adapter 失败、超时和未知结果不会重复移动资金。
- [x] 重启后资源、幂等、账本、Outbox 和 Session 支出可恢复。
- [x] 旧 API、事件、Receipt 和历史数据仍可解释。
- [x] 日志与错误输出不包含秘密或敏感支付数据。
- [x] 错环境、错链、错库、错 Signer、错 Provider 和跨环境凭证均失败关闭。

未执行项及风险：独立 R2 人工 Domain/Architecture 审查、Hosted Sandbox、公网 DNS/TLS、真实 Base Sepolia 双向支付、Live/Mainnet、托管和生产凭证均未执行。

## 10. 可观测性与运营

- 新增 `execution_session.*` LedgerEvent；沿用 request/trace 关联和既有运营快照。
- F15b 负责后续业务负载、关闭、恢复和对账演练。

## 11. 发布计划

- 发布方式：一次合并，默认能力仍受环境与独立激活门禁控制。
- 人工执行步骤：独立 R2 审查 → 合并 → 在 Local/内部 Sandbox 取证；不执行 Hosted/Mainnet。
- 发布负责人：Project Owner；回滚/对账负责人：Operations Owner。

## 12. 文档与变更日志

- [x] `CHANGELOG.html` 已同步。
- [x] 产品契约、API/OpenAPI、Access Contract、SDK、Sandbox README、verification/testing/review 记录已同步。
- Changelog 条目名称：F15a · 有界内部 Sandbox 执行会话。

## 13. 审查与批准

- Product Owner：待指定
- Transaction Domain Owner：待独立审查
- Architecture Owner：待独立审查
- Operations Owner：待指定
- 独立审查者：必须为人类 Domain + Architecture Reviewer

审批要求：

- [x] R2：已完成本地实现和自动化证据，等待至少一名独立人类审查者批准。
- [ ] R3：不适用；本 PR 不涉及生产执行。

## 14. 残余风险与后续工作

| 风险 / 技术债 | 影响 | 临时控制 | Owner | 关闭条件 |
| --- | --- | --- | --- | --- |
| F15b 业务负载、停机、退款和对账 | 内部 Beta 尚未放行 | 固定 Session 窗口/支出，保持 Hosted/Live 关闭 | Operations Owner | F15b/F16a 证据通过 |
| Hosted Sandbox / Base Sepolia E2E | 外部准入仍未完成 | 只允许 Local/内部契约，独立 Activation | Project Owner | ENV-07B/F16b 通过 |

## 15. 提交者最终确认

- [x] 变更范围与批准需求一致，没有夹带无关重构或依赖升级。
- [x] 没有通过放宽校验、删除断言或跳过测试掩盖问题。
- [x] 没有把 Local、Sandbox 或 Testnet 结果描述为生产证明。
- [x] 已明确区分服务环境、执行后端与资金准入；Live 配置不等同于 Mainnet 执行授权。
- [x] 所有失败、未覆盖路径、未知结果和恢复责任均已披露。
- [x] 本 PR 满足 R2 本地 Definition of Done，可以进入独立人工审查。
