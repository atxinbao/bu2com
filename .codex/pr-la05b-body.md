# BU2 Pull Request

## 1. 变更摘要

- 关联 Issue / 需求：Ledger Assurance Gate LA-05b：历史账务重放与备份后追加事实追平。
- 变更 Owner：Codex（Contributor / Verifier，非 R2 Approver）
- 目标环境：`Local / Simulation`
- 计划发布日期：合并后由独立 R2 审查者决定。

本 PR 在 LA-05a 外部观察和 LA-03c 只读投影基础上，增加从经核对 OpeningBalanceCheckpoint 与不可变 FinancialPosting 重放指定时间点账务的审计能力。它同时比较已验证 SQLite 备份 evidence 与当前追加事实，输出可审查的 catch-up 清单；不把结果写回恢复库，不自动调用 Provider 或重新付款。

## 2. 范围与边界

### 本 PR 包含

- `replayLedgerHistory({ as_of, currency })`：时间点余额、Journal 平衡、重放事件数与历史缺口。
- `exportLedgerReplayEvidence()`：版本化 `la05b.v1` 事件、Posting 与 OpeningBalanceCheckpoint evidence。
- `catchUpLedgerFromBackup({ baseline })`：基线事实完整性比较和追加事件/Posting/Checkpoint 清单。
- `complete`、`incomplete`、`caught_up`、`catch_up_required`、`blocked` 状态与稳定缺口码。
- SQLite Online Backup、重启、基线漂移、缺失 Posting 和追加更正的专项测试。
- LA-05b 产品契约、路线图、技术/API说明、Sandbox README、CHANGELOG 与验证记录。

### 本 PR 不包含

- 不自动写入恢复库，不改变 Wallet、Transaction、Budget、Collection、Refund、FinancialPosting 或 Receipt。
- 不查询真实 Provider、链上 RPC、Base Sepolia、Hosted、Live/Mainnet 或托管钱包。
- 不伪造缺失历史、不补造旧分录、不自动重放支付/退款；多账簿所有权、实时余额切换和完整迁移不在本 PR。
- 不恢复 E3.1 Pilot Manifest 或外部试点。

### 受影响模块

- [x] Ledger / Balance / Reconciliation
- [x] Database / Migration（复用现有 resources、ledger_events、financial_postings 和 Online Backup，无新增 Schema 版本）
- [x] Observability / Operations（只读恢复证据）
- [x] Documentation / Governance

## 3. 风险等级

- [x] **R2 — 交易相关**

风险判断理由：涉及历史金额解释、不可变 Posting、备份恢复和账务缺口；实现只读且不执行真实资金。

## 4. 行为变化

| 项目 | 变更前 | 变更后 | 兼容性影响 |
| --- | --- | --- | --- |
| 历史账务 | 只能重建当前全量 Posting 投影 | 可按 `as_of` 从检查点和 Posting 重放 | 仅新增域方法，不改变旧投影结果 |
| 历史缺口 | 缺失历史没有统一结果 | 返回 `incomplete` 和稳定 gap code | 不补造事实 |
| 备份恢复 | ENV-06 只验证隔离恢复并要求对账 | 可比较备份与当前追加 immutable facts | 只读 evidence，不自动应用 |
| Provider / 外部系统 | 恢复不自动重放 Provider | 明确 `automatic_provider_replay=false` | 外部调用次数不增加 |
| Environment / Chain | Local/Simulation | 保持 Local/Simulation | 无环境放行扩大 |

## 5. 金融不变量检查

- [x] 重放只读取 OpeningBalanceCheckpoint、LedgerEvent 和 FinancialPosting，不修改业务资源或余额投影。
- [x] 没有期初检查点、事件缺 Posting、Posting 缺事件或基线漂移时不报告完整成功。
- [x] 备份追平只报告追加事实，不把恢复副本当作可执行数据库。
- [x] 原始 Receipt、Posting 和历史事件不可变；更正仍通过追加事实表达。
- [x] Provider 超时/未知不触发自动重新付款或退款。

不变量影响与证明：重放复用现有 `financialPostings`、`events` 和 SQLite Online Backup；`postingProjection` 只读计算，catch-up 只比较 immutable IDs/content 并返回 evidence。

## 6. 授权、权限与敏感信息

- [x] 没有秘密、私钥、支付令牌、生产凭证或客户数据进入代码、日志、测试夹具或 PR 内容。
- [x] 不新增权限，不扩大 PaymentMandate、预算、Provider 或环境范围。
- 影响环境：`local`
- 执行后端：`simulated`
- Chain ID / Network：无
- `execution_status` 是否变化：否
- 本 PR 是否可能签名或广播资金指令：否
- [x] Live 保持 `execution_disabled`；Local evidence 不被描述为 Sandbox 链上验收。

## 7. API、事件、Schema 与迁移

- API 影响：无新增 HTTP mutation；增加本地领域 replay evidence 方法和 `la05b.v1` 机器结果。
- 数据所有者与事务边界：读取既有 SQLite resources、ledger_events、financial_postings 和备份文件；不产生新的业务事实。
- 迁移方式：`无`，无新增 Schema migration。
- 向后兼容：`rebuildLedgerProjection()` 的结果结构保持不变。

## 8. 失败、恢复与回滚

- 缺失历史、基线事实删除/漂移、非法 evidence schema 均失败关闭或返回 `incomplete/blocked`。
- 追平不会写回备份或恢复库；人工/受控后续流程必须重新审查 append facts。
- SQLite 重启后同一数据库可重新生成相同 replay facts；不会自动调用 Provider。
- 回滚方式：回退本 PR；已有 Posting、Receipt、备份和 manifest 不删除或改写。

## 9. 测试与证据

| 验证项 | 命令 / 场景 | 结果 | 环境与证据 |
| --- | --- | --- | --- |
| LA-05b 定向 | `npm --prefix sandbox run test:la05b` | 4/4 | Local/Simulation |
| Sandbox 全量 | `npm --prefix sandbox test` | 182/182 | Local/Simulation |
| LA-04/LA-05a/Operations/F15b/F16a | 对应 Sandbox 专项 | 3/3、4/4、6/6、4/4、3/3 | Local/Simulation |
| 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools | Local |
| SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建、10/10 单测 | Local |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 | Local |
| Hosted 合约回归 | `test:hosted-sandbox`, `test:hosted-deployment`, `test:hosted-evidence-schema` | 8/8、2/2、2/2 | Local contract only |
| 差异检查 | `git diff --check` | 通过 | Local |

未执行真实 Provider、Base Sepolia、公网 Hosted、Live/Mainnet、托管钱包或生产凭证验证；这些不属于本 PR。

### R2 强制场景

- [x] 期初检查点与追加更正按时间点重放，余额和 Journal 平衡可重复生成。
- [x] 缺失 Posting 不补造，返回 `financial_event_without_posting`。
- [x] 验证 SQLite 备份后的追加事实返回 `catch_up_required`。
- [x] 基线事实漂移返回 `blocked`，重启后 replay 结果保持一致。
- [x] 自动 Provider replay 固定为 false，未执行真实资金动作。

## 10. 可观测性与运营

- replay report 输出账簿/币种、Posting/Journal 数、余额、缺口和恢复状态，供审查与人工处置使用。
- catch-up evidence 输出 append events/Postings/Checkpoints，不自动应用；ENV-06 的 `reconciliation_required` 边界保持。

## 11. 发布计划

- 发布方式：一次发布（合并后仍仅限 Local/Simulation）。
- 发布、回滚和对账负责人：待独立 R2 审查确认。

## 12. 文档与变更日志

- [x] `CHANGELOG.html` 已更新。
- [x] LA-05b 契约、F14/API、技术 README、路线图、README、Sandbox README、验证与审查记录已同步。
- Changelog 条目名称：`LA-05b 历史账务重放与备份追平`

## 13. 审查与批准

- 独立审查者：待指定。
- [x] R2：需要至少一名独立人类审查者批准；Codex 不自行批准。

## 14. 残余风险与后续工作

| 风险 / 技术债 | 影响 | 临时控制 | Owner | 关闭条件 |
| --- | --- | --- | --- | --- |
| 追平清单尚未自动应用到恢复库 | 恢复后仍需受控审查与对账 | 只读 evidence、blocked 状态和 `automatic_provider_replay=false` | Operations Owner | 后续受控恢复设计与独立审查 |
| LA-03 多账簿/多账户完整范围未完成 | 不能宣称完整 Ledger Assurance Gate | 保持 Local/Simulation，禁止生产财务扩展 | Project Owner | LA-03 后续范围完成 |
| E3.1 外部试点暂停 | 不产生外部 Beta 证据 | 保持暂停状态 | Project Owner | 明确恢复授权 |

## 15. 提交者最终确认

- [x] 变更范围与批准需求一致，没有夹带无关重构或依赖升级。
- [x] 没有通过放宽校验、删除断言或跳过测试掩盖问题。
- [x] 没有把 Local、Sandbox 或 Testnet 结果描述为生产证明。
- [x] 已明确区分服务环境、执行后端与资金准入。
- [x] 所有未覆盖路径、未知结果和恢复责任均已披露。
