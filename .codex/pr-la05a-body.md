# BU2 Pull Request

## 1. 变更摘要

- 关联 Issue / 需求：Ledger Assurance Gate LA-05a：独立外部观察对账、未决队列与孤立事实。
- 变更 Owner：Codex（Contributor / Verifier，非 R2 Approver）
- 目标环境：`Local / Simulation`
- 计划发布日期：合并后由独立 R2 审查者决定。

F14 目前只能从本地持久化事实生成内部对账快照。本 PR 增加可选的 `ReconciliationObservation` 输入，让调用方提交独立读取器观察并获得确定性的匹配、异常和未决队列。`delivery_submitted` Payment 不再从外部对账中消失，无法归属的外部事实会显式保留为 `external_fact_unmatched`。

## 2. 范围与边界

### 本 PR 包含

- 外部观察输入校验、按 `source_id` 或 Provider Reference 的确定性匹配。
- 缺失观察、pending/unknown 观察、金额/币种/引用漂移与外部孤立事实的问题码。
- `delivery_submitted` Payment 以预留金额进入未决对账队列。
- `ReconciliationRun.mode` 与逐项观察证据的 SQLite 持久化和重启恢复。
- HTTP、OpenAPI、生成 SDK 类型、领域/HTTP 测试、产品/技术/路线、CHANGELOG 与审查证据。

### 本 PR 不包含

- 不查询真实 Provider、链上扫描、Base Sepolia、Hosted、Live/Mainnet 或托管钱包。
- 不实现历史事件重放、备份后追平、完整历史迁移或实时余额切换；这些属于 LA-05b。
- 不改变 Transaction、Collection、Refund、Wallet、FinancialPosting 或历史 LedgerEvent，不自动重试付款。
- 不恢复 E3.1 Pilot Manifest 或外部试点。

### 受影响模块

- [x] API / MCP / SDK（ReconciliationInput/OpenAPI/生成类型）
- [x] Ledger / Balance / Reconciliation
- [x] Database / Migration（复用通用 `resources`，无新增 Schema 版本）
- [x] Documentation / Governance

## 3. 风险等级

- [x] **R2 — 交易相关**

风险判断理由：涉及外部资金事实、金额比较、未决队列、账本对账和持久化；仅使用调用方提供的 Local/Simulation 观察，不执行真实资金。

## 4. 行为变化

| 项目 | 变更前 | 变更后 | 兼容性影响 |
| --- | --- | --- | --- |
| 对账范围 | Payment 只包含 settled/refunded | 外部模式额外包含 delivery_submitted | 内部模式保持原有结果 |
| API / Event | ReconciliationInput 只有 as_of/id | 可选 observations 数组，返回 mode/observation | 增量字段，旧请求不变 |
| 未决事实 | 本地未知事实可见但无外部来源 | 缺失/未知观察与外部孤立事实均显式排队 | 不修改源事实 |
| 金额与币种 | 只比较本地 Adapter 结果 | 外部观察金额/币种/Provider Reference 漂移为 exception | 整数最小货币单位不变 |
| Environment / Chain | Local/Simulation | 保持 Local/Simulation，`execution_status` 不变 | 无环境放行扩大 |

## 5. 金融不变量检查

- [x] 交易状态仍只能由 Transaction Core 改变。
- [x] 外部观察只生成追加 ReconciliationRun，不覆盖历史事实或 Posting。
- [x] 金额使用整数最小货币单位并显式携带币种。
- [x] 相同幂等键和相同载荷返回原结果；不同载荷失败关闭。
- [x] `delivery_submitted` 只进入 unknown 队列，不推断结算成功。
- [x] 外部 Provider 超时/未知未被自动重试，也不移动资金。

不变量影响与证明：LA-05a 复用现有 `runIdempotentAsync` 与 SQLite resources 原子持久化；`external` 队列项不参与财务 totals，源交易、收款、退款和 Posting 只读。

## 6. 授权、权限与敏感信息

- [x] 没有秘密、私钥、支付令牌、生产凭证或客户数据进入代码、日志、测试夹具或 PR 内容。
- [x] 不新增权限，不扩大 PaymentMandate、预算、Provider 或环境范围。
- 影响环境：`local`
- 执行后端：`simulated`
- Chain ID / Network：无
- `execution_status` 是否变化：否
- 本 PR 是否可能签名或广播资金指令：否
- [x] 没有把 Local Simulation 证据描述为 Sandbox 链上验收；Live 保持 `execution_disabled`。

## 7. API、事件、Schema 与迁移

- API 影响：`POST /v1/reconciliations` 的 `observations` 为可选数组，最多 1000 条；`ReconciliationRun.mode`、`ReconciliationItem.observation` 和 `kind=external` 为增量响应字段。
- 数据所有者与事务边界：观察、对账运行、LedgerEvent 与幂等终态复用现有 SQLite 资源事务。
- 迁移方式：`无`，无新增 Schema migration。
- 向后兼容：省略 observations 时继续执行 F14 内部对账行为。

## 8. 失败、恢复与回滚

- 输入校验失败、观察缺失、未知状态和匹配漂移均失败关闭或进入显式 unknown/exception，不修改原始事实。
- SQLite 重启后可重新读取 external mode、观察证据和未决队列；不会自动查询 Provider 或重新付款。
- 幂等提交失败时对账快照、事件和幂等终态整体回滚。
- 回滚方式：回退本 PR；已有历史 ReconciliationRun 不删除或改写。

## 9. 测试与证据

| 验证项 | 命令 / 场景 | 结果 | 环境与证据 |
| --- | --- | --- | --- |
| LA-05a 定向 | `npm --prefix sandbox run test:la05a` | 4/4 | Local/Simulation |
| Sandbox 全量 | `npm --prefix sandbox test` | 178/178 | Local/Simulation |
| LA-04/Operations/F15b/F16a | 对应 Sandbox 专项 | 3/3、6/6、4/4、3/3 | Local/Simulation |
| 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools | Local |
| SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建、10/10 单测 | Local |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 | Local |
| Hosted 合约回归 | `test:hosted-sandbox`, `test:hosted-deployment`, `test:hosted-evidence-schema` | 8/8、2/2、2/2 | Local contract only |
| 差异检查 | `git diff --check` | 通过 | Local |

未执行真实 Provider、Base Sepolia、公网 Hosted、Live/Mainnet、托管钱包或生产凭证验证；这些不属于本 PR。

### R2 强制场景

- [x] 同键同载荷只产生一次结果，同键不同载荷被拒绝（复用 F14 幂等测试）。
- [x] 未决、金额不匹配、外部孤立事实和 SQLite 重启均有专项断言。
- [x] Ledger 对账只读、Receipt/资金状态不被改写。
- [x] 错环境、错链、错 Provider 与真实资金路径继续失败关闭（全量 Sandbox/Hosted 合约回归）。

## 10. 可观测性与运营

- 新增对账运行模式、逐项观察证据和稳定问题码，可供后续人工处理队列使用。
- LA-05b 负责历史重放和备份后追平；E3.1 Pilot Manifest 保持暂停。

## 11. 发布计划

- 发布方式：一次发布（合并后仍仅限 Local/Simulation）。
- 发布、回滚和对账负责人：待独立 R2 审查确认。

## 12. 文档与变更日志

- [x] `CHANGELOG.html` 已更新。
- [x] LA-05a 产品契约、F14/API/OpenAPI、技术 README、路线图、Sandbox README、验证与审查记录已同步。
- Changelog 条目名称：`LA-05a 外部观察对账`

## 13. 审查与批准

- 独立审查者：待指定。
- [x] R2：需要至少一名独立人类审查者批准；Codex 不自行批准。

## 14. 残余风险与后续工作

| 风险 / 技术债 | 影响 | 临时控制 | Owner | 关闭条件 |
| --- | --- | --- | --- | --- |
| 外部观察仍由调用方提交 | 不能宣称真实链上/Provider 对账 | 标记 Local/Simulation，保留 provider/reference/status | Ledger Owner | ENV-07B 或真实 Provider 证据 |
| LA-05b 历史重放与备份追平未实现 | Ledger Assurance Gate 仍未完整通过 | 保持未决队列和追加快照，不自动重放 | Project Owner | LA-05b 独立 R2 PR |
| E3.1 外部试点暂停 | 不产生外部 Beta 证据 | 保持暂停状态 | Project Owner | 明确恢复授权 |

## 15. 提交者最终确认

- [x] 变更范围与批准需求一致，没有夹带无关重构或依赖升级。
- [x] 没有通过放宽校验、删除断言或跳过测试掩盖问题。
- [x] 没有把 Local、Sandbox 或 Testnet 结果描述为生产证明。
- [x] 已明确区分服务环境、执行后端与资金准入。
- [x] 所有未覆盖路径、未知结果和恢复责任均已披露。
