# ENV-06：制品提升、监控、备份与恢复演练 v1

日期：2026-09-06
执行者：Codex
状态：Implemented / Local automated pass / R2 review pending

## 1. 目标与边界

ENV-06 把 ENV-04 的隔离部署单元与 ENV-05 的受控运维入口连接成可执行运营闭环：同一不可变制品生成候选提升清单，运行配置可检测漂移，每个环境使用独立 SQLite 在线备份，旧备份只能恢复到同环境的隔离副本，恢复结果保持 `execution_disabled` 并在重新服务前要求对账。

本工作不创建云资源、DNS、GitHub Environment、正式凭据、对象存储、通知渠道或托管 Sandbox；不加载 Signer，不调用 Provider，不执行 Base Sepolia 或 Mainnet 支付，也不声称具备高可用。Local 自动化证据不能替代 ENV-07 的真实托管 Sandbox 验收。

## 2. Operations Contract

[`operations-contract.json`](../../deploy/operations-contract.json) v1 冻结四类机器规则：

- 制品提升：Sandbox 与 Live 必须解析为同一 SHA-256 制品；本地契约、隔离部署和备份恢复演练全部通过后，才可生成候选清单。
- 备份：使用 Node 官方 `node:sqlite backup()`，目标文件禁止覆盖，并生成环境、chain、备份 scope、artifact、配置、数据库 SHA-256、schema 与关键事实计数清单。
- 恢复：只复制到新的隔离目标，禁止跨环境恢复；恢复后固定 `execution_disabled`、`reconciliation_required`，不自动重放 Provider 操作。
- 监控：区分 `healthy / attention_required / blocked`；配置漂移、数据库完整性或环境绑定错误为阻断，备份缺失/过期、未知付款或 Webhook 死信需要人工关注。

候选提升清单中的 `hosted_deployment=false` 与 `payment_execution=false` 是固定事实。生成清单不等于发布批准，更不构成 Live/Mainnet 资金授权。

## 3. 一致性备份

`SqliteLedger.backupTo()` 直接复用 Node `node:sqlite` 的 SQLite Online Backup API，不复制正在运行的 WAL、SHM 或主数据库文件。备份完成后必须依次验证：

1. `PRAGMA integrity_check` 唯一结果为 `ok`；
2. schema version 不低于 v10；F06a 的身份归属与凭证绑定必须随环境数据库一起备份；
3. 数据库不可变 environment metadata 与调用环境一致；
4. 关键事实计数与 manifest 一致；
5. 数据库文件 SHA-256 与 manifest 一致；
6. artifact、configuration fingerprint 与 backup scope 属于同一环境。

备份文件与 manifest 使用新路径并以 `0600` 创建。当前参考实现把保留周期、远端存储、加密密钥、RPO 和备份频率留给部署环境配置；不能将“本地备份成功”解释为 RPO=0。

## 4. 恢复演练

恢复演练首先验证备份，再复制到一个不存在的新目标路径，并使用同环境配置打开副本。Transaction、Ledger、Payment Attempt、Adapter Operation、Outbox 与 Access Decision 的关键计数必须与备份 manifest 一致。

恢复结果只允许：

```text
execution_status = execution_disabled
reconciliation_status = required
release_status = blocked_pending_reconciliation
automatic_provider_replay = false
payment_execution_attempted = false
```

错误环境、错误 artifact、错误配置指纹、被修改的数据库或已存在的恢复目标都会失败关闭。恢复失败只删除本次新建的隔离副本；不修改源数据库、备份、Ledger、Receipt 或链上事实。

## 5. 运营快照

`createOperationalSnapshot()` 读取数据库完整性、schema、Webhook 死信、未知付款、备份时间和配置指纹，输出不含数据库路径、Authorization、API key、私钥、Receipt issuer 私钥、Webhook secret 或私有 payload 的机器快照。

- `healthy`：数据库、配置和备份状态一致，且没有死信或未知付款。
- `attention_required`：需要处理备份缺失/过期、死信或未知付款，但不自动改变交易状态。
- `blocked`：配置漂移、数据库完整性失败或环境绑定错误；不得继续提升或恢复服务。

备份过期阈值由环境 Owner 在调用时显式提供，当前契约不替业务定义 SLO/RPO 数值。

## 6. 可执行入口

专项验证与完整本地演练：

```bash
npm --prefix sandbox run test:operations
npm --prefix sandbox run acceptance:operations
```

运维 CLI 提供 `promotion-manifest`、`backup`、`verify`、`restore-rehearsal` 和 `snapshot` 五个命令。候选清单、恢复报告和运营快照必须写入新的证据文件，禁止覆盖；所有参数使用 `--name value`，输出为 JSON，稳定错误码写入 stderr，且不输出堆栈或敏感配置。示例和停止条件见 [`deploy/README.md`](../../deploy/README.md)。

## 7. 验收映射

| 验收 | ENV-06 证据 | 当前结论 |
| --- | --- | --- |
| E-T06 | 配置指纹漂移使运营状态进入 `blocked`；既有 RPC 错链仍失败关闭 | Local automated pass |
| E-T08 | 干净提交构建一次不可变镜像；未加载 Signer、凭据或调用支付 | Local automated pass |
| E-T10 | Sandbox/Live 独立在线备份；同环境隔离恢复；跨环境拒绝；恢复后禁用执行并要求对账 | Local automated pass |

ENV-07 的托管部署、真实 Base Sepolia 双向收付、边缘访问和外部团队证据仍为 `Not yet accepted`。

## 8. 兼容、恢复与后续

ENV-06 原始 PR #23 不修改 API、事件、Receipt、金额、Transaction Core 状态机或 Provider 语义；本次 F06a 追加 Schema v10 的 Principal、Account、Agent、credential binding 与 onboarding 审计事实，运维备份最低版本同步提升为 v10。Node 最低版本仍为 22.16，因为 `node:sqlite backup()` 从 22.16 提供。

回退代码时保留已生成备份和 manifest；旧版本不得把恢复副本直接投入执行。若运维模块失败，停止制品提升，保留只读查询、观察和对账，由人工检查备份与配置证据。ENV-06 已由 PR #23 合并；后续 ENV-07 的本地准入基线不能替代托管 Sandbox 双向 Base Sepolia 验收。

## 参考来源

- Node.js，`sqlite.backup()`：https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options
- SQLite，Online Backup API：https://sqlite.org/backup.html
