# F16a 内部 Sandbox 自主双向收付 Beta 候选自主审查报告

# LA-05a 外部观察对账自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-independent-reconciliation`

## 初步结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖独立观察、未决队列、孤立外部事实和确定性异常 |
| 技术实现 | 18/20 | 复用 F14 快照、通用资源持久化和既有事实模型；最终门禁待执行 |
| 金融边界 | 20/20 | 只追加对账观察，不修正原始事实，不调用 Provider |
| 自动化验证 | 20/20 | LA-05a 4/4、Sandbox 178/178 及全套本地门禁通过 |
| 文档与恢复 | 18/20 | 契约、OpenAPI、产品/技术/路线和恢复边界已同步 |
| 综合 | **97/100** | 达到本地实现审查门槛，待独立 R2 |

## 结论

当前建议：**通过 LA-05a 本地独立外部观察对账实现，提交 R2 审查**。LA-05a 只覆盖独立外部观察；历史重放、备份后追平和完整迁移属于 LA-05b。

## 残余风险

1. 外部读取器输入仍是调用方提供的观察事实，不能替代真实 Provider / 链上独立证据。
2. `delivery_submitted` 仅进入未决对账队列，不得推断结算成功或自动重试付款。
3. Live/Mainnet、Hosted、托管和生产凭证仍关闭，E3.1 Pilot Manifest 保持暂停。

# LA-02 成组 Journal / Posting 保护自主审查报告

# LA-04 Collection 持续验证与单次入账自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-collection-convergence`

## 初步结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 20/20 | 覆盖 pending 收敛、连续证据、迟到款和单次过账 |
| 技术实现 | 19/20 | 复用现有 Collection、幂等队列、Journal/Posting 与通用资源持久化 |
| 金融边界 | 20/20 | 不重复过账、不调用真实 Provider、不自动授予迟到权益 |
| 自动化验证 | 20/20 | LA-04 3/3、受影响回归 9/9、Sandbox 174/174 及全套本地门禁通过 |
| 文档与恢复 | 19/20 | F11、OpenAPI、SDK、产品/技术/路线、CHANGELOG 与证据记录已同步 |
| 综合 | **98/100** | 达到本地实现审查门槛，待独立 R2 |

## 结论

建议：**通过 LA-04 本地 Collection 持续验证实现，提交 R2 审查**。本报告不代表外部 Provider 对账、Hosted、Testnet 或完整 Ledger Assurance Gate 完成。

## 残余风险

1. Provider/链上独立观察、checkpoint、孤立外部付款和完整历史重放仍属于 LA-05/ENV-07B。
2. 迟到 Collection 只保留财务事实，不可直接发放已过期权益；产品侧仍需明确待匹配处理。
3. Live/Mainnet、Hosted 和真实 Provider 仍关闭，E3.1 Pilot Manifest 保持暂停。

# LA-03c 账务投影重建自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-rebuild-projection`

## 初步结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖账户聚合、Journal 平衡、币种过滤、溢出和重启一致性 |
| 技术实现 | 19/20 | 只读遍历不可变 Posting，不新增第二账本或资金写入路径 |
| 金融边界 | 20/20 | 不替换钱包投影、不触发 Provider/Signer、不开放真实资金 |
| 自动化验证 | 20/20 | LA-03b/LA-03c 4/4、LA-03a 3/3、Sandbox 171/171、运营/契约/SDK/Prototype/Hosted 门禁通过 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 与 operations 已同步 |
| 综合 | **97/100** | 达到本地实现审查门槛，待独立 R2 |

## 结论

建议：**通过 LA-03c 本地账务投影重建实现，提交 R2 审查**。该报告是审计投影，不是实时钱包余额切换或完整 Ledger Assurance Gate 完成声明。

## 残余风险

1. 多账簿/多资产所有权、实时余额切换和完整历史迁移仍需后续 PR。
2. LA-04 pending Collection 收敛、LA-05 独立对账/备份追平和 E3.1 外部试点仍未放行。
3. Live/Mainnet、Hosted 和真实 Provider 仍关闭。

# LA-03b 期初检查点与追加更正分录自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-opening-corrections`

## 初步结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖核对期初、原事件引用、追加更正和明确非目标 |
| 技术实现 | 19/20 | 复用通用 resources、成组 Journal/Posting 和 SQLite 原子提交 |
| 金融边界 | 20/20 | 不改变钱包投影，不更新/删除历史，不开放真实资金路径 |
| 自动化验证 | 20/20 | LA-03b 3/3、LA-03a 3/3、Sandbox 170/170、运营/契约/SDK/Prototype/Hosted 门禁通过 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 与 operations 已同步 |
| 综合 | **97/100** | 达到本地实现审查门槛，待独立 R2 |

## 结论

建议：**通过 LA-03b 本地期初/更正事实实现，提交 R2 审查**。本 PR 不声称完成余额重建、完整历史迁移、多账户投影或 Ledger Assurance Gate。

## 残余风险

1. 期初检查点是经核对的迁移边界，不是对缺失历史的推断；来源与覆盖范围需要独立人类审查。
2. 当前余额仍由既有投影维护，完整从 Journal/Posting 重建留给后续 PR。
3. E3.1 Pilot Manifest 保持暂停，Live/Mainnet、Hosted 和真实 Provider 仍关闭。

# LA-03a 结算、退款与 ProviderFee 业务事实分录自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-business-postings`

## 初步结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖结算、确认退款、ProviderFee、交易关联与幂等重放 |
| 技术实现 | 19/20 | 复用 LA-02 成组写入、SQLite 原子提交和既有 Transaction Core |
| 金融边界 | 20/20 | Provider-unknown/pending 不生成已确认业务分录；不启用真实资金路径 |
| 自动化验证 | 20/20 | LA-03a 3/3、受影响回归 13/13、Sandbox 167/167、运营 6/6、契约/SDK/Prototype/Hosted 门禁通过 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 与 operations 已同步 |
| 综合 | **97/100** | 达到本地实现审查门槛，待独立 R2 |

## 结论

建议：**通过 LA-03a 本地业务事实分录实现，提交 R2 审查**。该 PR 只覆盖 LA-03 的首个子范围；期初余额、完整历史重建、pending 收款收敛、独立对账重放和更正分录仍需后续 PR。

## 残余风险

1. LA-03 完整范围、LA-04、LA-05 尚未完成，不能将局部业务分录解释为完整 Ledger Assurance Gate 通过。
2. 账户科目由已绑定业务主体 ID 确定性生成，但不引入余额投影或资金所有权变更。
3. E3.1 Pilot Manifest 保持暂停，Live/Mainnet、Hosted 和真实 Provider 仍关闭。

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-journal-guards`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖平衡 Journal、严格金额、来源、同 ID 内容漂移和不可变事实 |
| 技术实现 | 19/20 | Schema v15 追加 Journal Header、统一写入入口和 SQLite 触发器 |
| 金融边界 | 20/20 | 不平衡、孤立、浮点和已过账修改均失败关闭 |
| 自动化验证 | 20/20 | LA-02 定向 3/3，F07/F11/F12/F13/F14 回归 19/19 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 与 operations 已同步 |
| 综合 | **97/100** | 通过本地整改审查，进入 R2 |

## 结论

建议：**通过 LA-02 本地 Journal/Posting 保护实现，提交 R2 审查**。LA-03 仍需把付款、收款、退款、费用、期初和更正全部接入完整账务语义；本 PR 不把现有局部 Posting 宣称为完整账本。

## 残余风险

1. LA-03/LA-04/LA-05 尚未完成，完整业务分录、pending 收款收敛和独立对账仍是准入阻断项。
2. 当前迁移只为既有 Posting 建立兼容性 Journal 引用，不伪造缺失历史分录。
3. E3.1 Pilot Manifest 保持暂停，Live/Mainnet、Hosted 和真实 Provider 仍关闭。

# LA-01 持久化退款尝试与未决额度占用自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/ledger-assurance-refund-attempts`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖未知退款占用、Provider 结果校验、持久化尝试和同键恢复 |
| 技术实现 | 19/20 | Schema v14 追加 RefundAttempt，不重做 Transaction Core 或 Provider |
| 金融边界 | 20/20 | 未知结果不增加钱包余额、不标记 refunded、不释放可退额度 |
| 自动化验证 | 20/20 | F13/LA-01 定向测试 7/7，通过三项审计反例 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 与 operations 已同步 |
| 综合 | **97/100** | 通过本地整改审查，进入 R2 |

## 结论

建议：**通过 LA-01 本地整改实现，提交 R2 审查**。它只解决退款执行边界，不能把完整 Ledger Assurance Gate、真实 Provider 退款、Hosted 或 Live 准入描述为已通过。

## 残余风险

1. LA-02/LA-03/LA-04/LA-05 仍未完成，统一账簿、完整分录、收款推进和独立对账仍是产品基础准入阻断项。
2. 当前退款分录完整性留给后续统一 Journal 过账 PR；LA-01 不伪造历史分录。
3. E3.1 Pilot Manifest 保持暂停，直到账本基础整改获得进一步审查结论。

# F16b Hosted Sandbox 外部集成基础准入自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`test/hosted-sandbox-foundation-gate`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖 Candidate、Activation、Evidence 组合资格与 Hosted/Live 边界 |
| 技术实现 | 19/20 | 组合既有验证器，不新增交易核心、Schema、Provider 或 Secret Manager |
| 环境边界 | 20/20 | 本地结果不授权公网部署、Testnet 付款或 Live/Mainnet |
| 自动化验证 | 20/20 | F16b 定向资格测试 3/3，通过正常与负向矩阵 |
| 文档与恢复 | 19/20 | 产品、技术、路线、README、CHANGELOG、testing、verification 和 operations 已同步 |
| 综合 | **97/100** | 通过本地资格审查，进入 R2 |

## 结论

建议：**通过本地 Hosted foundation qualification，提交 R2 审查**。`env07b_accepted=false` 是强制结果；公网 HTTPS/DNS/TLS、托管 Secret、独立 Activation、外部机器 E2E 和真实 Base Sepolia 双向结算仍需独立执行和取证。

## 残余风险

1. 本地 Candidate/Activation/Evidence fixture 不能证明外部 endpoint、边缘鉴权或真实链上结算。
2. F16b 不创建云资源、不注入 Secret、不调用真实 Provider，不能作为 Hosted 或 Live 放行依据。
3. 下一阶段应由具备部署权限的独立审查人决定是否进入 ENV-07B E-T13/E-T14/E-T15。

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`test/internal-sandbox-pay-collect-beta`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖自主付款、收款、权益恢复、退款、故障恢复与对账 |
| 技术实现 | 19/20 | 复用现有 Mandate、Session、Transaction Core、Adapter 和 ReconciliationRun |
| 金融边界 | 20/20 | 无逐笔管理员批准只适用于预授权商户；unknown、越权和 disabled 路径失败关闭 |
| 自动化验证 | 20/20 | F16a 定向验收 3/3，通过正常、恢复和停止条件 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 和 operations 已同步；R2 尚待独立审查 |
| 综合 | **97/100** | 通过本地候选审查，进入 R2 |

## 结论

建议：**通过本地候选实现，提交 R2 审查**。F16a 不能解释为真实 Sandbox/Testnet、Hosted、外部团队或生产 Beta 放行；这些仍需 ENV-07B、F16b 和独立人工准入。

# F15b 业务负载、停机与财务恢复自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`test/operations-recovery-evidence`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖有限业务负载、收款、退款、手续费、对账、重启和停机 |
| 技术实现 | 19/20 | 复用现有 Transaction Core、SQLite、幂等和 ReconciliationRun，无第二账本 |
| 金融边界 | 20/20 | 重启和幂等重放不重复创建事实；Sandbox/Testnet 仍失败关闭 |
| 自动化验证 | 20/20 | F15b 定向验收 4/4，通过业务、恢复和停机场景 |
| 文档与恢复 | 19/20 | 契约、路线、README、CHANGELOG、testing、verification 和 operations 已同步；R2 尚待独立审查 |
| 综合 | **97/100** | 通过本地实现审查，进入 R2 |

## 结论

建议：**通过本地实现，提交 R2 审查**。F15b 只提供固定候选上的 Local/Simulation 运营证据，不能解释为吞吐量 SLO、Hosted 可用性、真实 Base Sepolia 对账或内部 Beta 放行。F16a 仍需独立验收无人值守双向收付、故障、退款与对账。

# F12 Recoverable Paid Access 自主审查报告

# F13 有界取消与退款恢复自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/bounded-refunds-recovery`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖取消、部分/全额退款、恢复、状态和 F14 边界 |
| 技术实现 | 19/20 | 复用现有快照、Claim、Wallet CAS、Adapter Operation 与事件 Outbox |
| 金融边界 | 20/20 | 退款金额受 settled 剩余值约束；Budget 历史不被 F13 擅自重写 |
| 自动化验证 | 20/20 | F13 5/5、Sandbox 144/144、SDK 10/10 |
| 文档与恢复 | 19/20 | 契约、API、SDK、README、CHANGELOG、testing、verification 已同步；R2 尚待独立审查 |
| 综合 | **97/100** | 通过本地实现审查，进入 R2 |

## 结论

建议：**通过本地实现，提交 R2 审查**。x402 当前没有标准退款原语，不能把本地 Simulated refund 解释为 Testnet 或生产退款证据；F14 负责后续财务对账。

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
任务：从已验证入账的 Collection 授予可恢复 AccessGrant，并保持 DeliveryRecord、Receipt 与 FinancialPosting 独立
分支：`feat/recoverable-paid-access`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖 posted Collection 前置条件、AccessGrant 生命周期、查询/恢复、幂等和 F11/F13/F14 边界 |
| 技术实现 | 19/20 | 复用 generic resources、runIdempotentAsync、SQLite 原子提交、既有 Collection 与 DeliveryRecord；未新增第二套账本 |
| 金融不变量 | 20/20 | AccessGrant 不改变金额、余额或 FinancialPosting，重复来源不重复授予 |
| 自动化验证 | 20/20 | F12 定向 4/4、Sandbox 139/139、Contract 63 + MCP 6、SDK 10/10、Prototype lint/build 和 diff 检查通过 |
| 文档与边界 | 19/20 | F12 契约、README、Roadmap、Changelog、验证和操作日志已同步；R2 独立审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立 Domain 与 Architecture 审查**。

F12 只从 `Collection(status=posted, verification_status=verified)` 派生 AccessGrant。AccessGrant 是独立的付费访问事实，可通过持久化详情和恢复接口重新取得；DeliveryRecord 仍只记录交易交付事实，Receipt 只签名引用交付证据，FinancialPosting 只表达 F11 入账事实。

## 残余风险

1. F12 尚未接入真实 Base Sepolia 交付或外部资源授权；Simulation 结果不能作为 Testnet 或生产访问证据。
2. AccessGrant 的资源引用由业务方提供，当前不负责资源服务、密钥托管或撤销后的外部资源回收。
3. 退款、取消和财务对账留给 F13/F14；Hosted、Live/Mainnet、托管和生产凭证继续关闭。

---

# F11 Inbound Collection Verification 自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
任务：验证 Receivable 入站付款并一次性追加 Collection 与 FinancialPosting
分支：`feat/verify-inbound-collections`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖 Provider 验证、金额/引用/付款方约束、Receivable 状态、Collection 查询与一次性 Posting |
| 技术实现 | 19/20 | 复用既有 Adapter、generic resources、runIdempotentAsync、FinancialPosting 和 SQLite 原子提交；未新增第二套交易核心 |
| 金融不变量 | 20/20 | 只在 verified 结果下写入一对 Posting；不改变买方钱包；Provider Reference 全局唯一 |
| 自动化验证 | 20/20 | F11 定向 4/4、Sandbox 135/135、Contract 63 + MCP 6、SDK 10/10、Prototype lint/build 和 diff 检查通过 |
| 文档与边界 | 19/20 | F11 契约、README、Roadmap、Changelog、验证和操作日志已同步；R2 独立审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立 Domain 与 Architecture 审查**。

F11 将 Provider 已验证的入站付款绑定到 F10 Receivable，在同一幂等事务中更新 Receivable、写入 Collection、追加 `receivable.payment_posted` 事件和一对不可变 FinancialPosting。当前仅使用明确标记的 Simulation 验证，不改变买方钱包，不启用真实 Testnet、Hosted、Live/Mainnet 或生产凭证。

## 核对

- [x] Provider Reference 和 Collection Reference 具备唯一性与精确匹配校验。
- [x] 金额、币种、可选资产/网络和预期付款方漂移失败关闭。
- [x] verified 结果才会将 Receivable 标记为 paid 并追加 Posting。
- [x] 相同幂等键和相同 Provider Reference 不会重复创建 Collection 或 Posting。
- [x] SQLite 重启恢复 Receivable、Collection、事件和 Posting。
- [x] HTTP API、权限、OpenAPI、SDK 和 generic resources 持久化已对齐。
- [ ] R2 独立 Domain + Architecture 审查尚未完成。

## 残余风险

1. F11 尚未接入真实 Base Sepolia 入站观察或链上确认；Simulation 结果不能作为 Testnet 资金证据。
2. 当前核心没有卖方钱包余额投影，Posting 只表达 Receiving Target 与 Receivable 的财务事实；F14 负责后续对账。
3. Hosted、Live/Mainnet、托管和生产凭证继续关闭。

---

# F10 Account-Owned Receivable 自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
任务：从 active Quote 创建可持久化、账户所有的 Receivable
分支：`feat/account-owned-receivables`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖 Quote 派生金额、Account/Agent/Receiving Target 绑定、状态、幂等、查询和 F11 边界 |
| 技术实现 | 19/20 | 复用通用 resources 持久化、既有 idempotency、Access claims、OpenAPI/SDK 生成链路；未新增第二套账本 |
| 金融不变量 | 20/20 | 创建不移动余额、不创建 Transaction、不写 Financial Posting；Quote 金额为唯一金额来源 |
| 自动化验证 | 20/20 | 定向领域/HTTP/重启 4/4、Sandbox 131/131、Contract 63 + MCP 6、SDK 10/10、Prototype lint/build 和 diff 检查通过 |
| 文档与边界 | 19/20 | F10 契约、README、Roadmap、Changelog、验证和操作日志已同步；R2 独立审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立 Domain 与 Architecture 审查**。

Receivable 是 F11 入站付款验证之前唯一的收款业务事实。它从 active Quote 派生金额与币种，绑定收款 Account、Seller Agent、Receiving Target 和可选付款方，创建时只追加资源与事件，不改变钱包或结算状态。F09b 的历史恢复实现已存在，本 PR 不重复创建恢复路径。

## 核对

- [x] active Quote 才能创建 Receivable。
- [x] Quote payee/seller 与 Receivable Account/Agent 必须一致。
- [x] 金额从 Quote 派生，不能由第二份输入覆盖。
- [x] Receiving Target、到期时间和预期付款方约束已校验。
- [x] HTTP API、权限、OpenAPI、SDK 和 generic resources 持久化已对齐。
- [x] 相同幂等键重放不创建第二个 Receivable。
- [x] F11 入站验证与入账明确留在后续范围。
- [ ] R2 独立 Domain + Architecture 审查尚未完成。

## 残余风险

1. F10 不验证链上或 Provider 入站付款；在 F11 合并前，Receivable 只能作为 issued 业务事实。
2. generic resources 复用既有 Schema v13，不新增专用 Receivable 表；若后续需要高吞吐查询，应另行评估索引而非复制账本。
3. 当前仍只验证 Local/Simulation，Sandbox/Testnet 双向收款必须通过 F11/F16 证据门禁。

---

# F09a 自主支付执行自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
任务：在 F08 已批准 PaymentIntent 上提供 Agent 自主执行命令
分支：`feat/autonomous-payment-execution`

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| 需求完整性 | 19/20 | 覆盖 immediate/deferred 模式、显式执行端点、幂等、人工审批边界和 Mandate 版本复核；未知 Provider 结果恢复留给 F09b |
| 技术实现 | 19/20 | 复用现有 `reserve()`、Wallet CAS、Budget Hold、LedgerEvent、Webhook Outbox 与 SQLite 原子提交；新增权限、OpenAPI、SDK 和 HTTP 路由 |
| 金融不变量 | 20/20 | review-required/denied 不可绕过；暂停、撤销、过期和版本漂移失败关闭；执行重放不重复预留 |
| 自动化验证 | 20/20 | 定向领域/HTTP 4/4、Sandbox 127/127、Contract 63 + MCP 6、SDK 10/10、Prototype lint/build 和 diff 检查通过 |
| 文档与边界 | 19/20 | 产品/技术 README、OpenAPI、SDK、Changelog、验证、测试和操作日志已同步；R2 独立 Domain + Architecture 审查尚未完成 |

综合评分：97/100

## 结论

建议：**通过本地实现，进入 R2 独立 Domain 与 Architecture 审查**。

F09a 只让 Agent 执行已经由 F08 `PolicyDecision=approved` 授权的 deferred PaymentIntent。它不把执行命令当作新的授权，不替 review-required 任务提供旁路，并将 Adapter 超时/未知结果恢复留给 F09b。默认 `immediate` 行为保持现有调用兼容；真实 Testnet、Hosted、Live/Mainnet、生产凭证和托管继续关闭。

## 核对

- [x] `execution_mode` 可选，未提供时默认为 `immediate`。
- [x] deferred Intent 在已批准时进入 `authorized`，随后由 Agent 调用 `/execution`。
- [x] `funds_reserved` 重放返回现有结果，避免重复余额预留。
- [x] `review_required`、denied、非 active Mandate 和 Mandate 版本冲突均失败关闭。
- [x] HTTP 路由、权限、OpenAPI 和 TypeScript SDK 已对齐。
- [x] 定向领域、HTTP、全量 Sandbox、契约、SDK 和 Prototype 验证通过。
- [ ] R2 独立 Domain + Architecture 审查尚未完成。

## 残余风险

1. F09a 不处理 Adapter unknown result；F09b 必须在不重复付款的前提下查询并恢复现有 attempt。
2. 本地测试覆盖的是 Local/Simulation；Sandbox/Testnet 双向真实收付仍需 F15/F16 证据门禁。
3. `createPaymentMandate()` 的真实 Funding Source / Receiving Target 持久绑定校验沿用 F08 现状，后续仍需独立审查其生产化边界。

---

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
# F08 Payment Mandate 运行时实现自主审查报告

日期：2026-09-08
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/mandates-versioned-policy`

## 审查范围

- PaymentMandate 与 PolicyDecision 领域对象、状态机、版本冲突和幂等。
- PaymentIntent 授权引用、F07 Budget Hold 边界与持久化 Schema v13。
- HTTP/OpenAPI/TypeScript SDK 契约、绑定门槛、测试和文档同步。

## 结果

| 维度 | 评分 | 结论 |
|---|---:|---|
| 需求覆盖 | 19/20 | 覆盖版本化授权、确定性决策、限额、范围、状态和审计引用 |
| 技术实现 | 19/20 | 复用现有 resources、Claim、CAS、环境和钱包绑定路径；未引入第二账本 |
| 金融边界 | 20/20 | 只有 approved 可进入 F07 Hold；不调用 Provider 或执行支付 |
| 自动化验证 | 20/20 | F08 4/4、Sandbox 123/123、SDK 10/10、契约 63/6、Prototype lint/build 通过 |
| 文档与恢复 | 19/20 | Schema/API/SDK/README/CHANGELOG/verification/testing 已同步；R2 尚待独立人工审查 |
| 综合 | **97/100** | 通过本地实现审查，进入 R2 |

## 遗留风险与门槛

1. R2 Domain 与 Architecture 审查必须由独立人类完成，Codex 不作为批准者。
2. F09a 自主执行、F10/F11 收款、退款、对账和内部 Beta 仍不得与本 PR 合并放行。
3. Live/Mainnet、Hosted、托管和生产凭证继续关闭；真实 Testnet 双向收付需后续证据门禁。

## 结论

建议：**通过本地实现，提交 R2 审查**。F08 已完成版本化 PaymentMandate、PolicyDecision 和持久钱包绑定门槛；未扩大 Agent 权限，也未改变环境执行状态。
# F14 Payment / Collection / Refund / Fee Reconciliation 自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/reconciliation-payment-facts`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖支付、收款、退款、手续费事实和逐项状态 |
| 技术实现 | 19/20 | 复用通用 resources、Snapshot、Idempotency Claim 与既有 Adapter Operation |
| 金融边界 | 20/20 | 对账只追加快照，不覆盖交易、余额或历史 Posting |
| 自动化验证 | 20/20 | F14 领域/HTTP 测试和 Sandbox 回归门禁 |
| 文档与恢复 | 19/20 | 契约、API、SDK、CHANGELOG、testing、verification 已同步；R2 尚待独立审查 |
| 综合 | **97/100** | 通过本地实现审查，进入 R2 |

## 结论

建议：**通过本地实现，提交 R2 Domain 与 Architecture 审查**。ProviderFee 必须绑定已确认来源和 Provider Reference；任何 pending 或 provider-unknown 事实都保持 `unknown`，不被对账报告伪装为成功。真实 Provider、Hosted、Live/Mainnet、托管和生产凭证仍关闭。

## 残余风险

1. 当前 ProviderFee 由受控 API 录入，尚未连接真实 Provider 对账文件或链上索引。
2. F14 不自动修正历史金额；费用或外部事实发生更正时必须追加新事实并重新运行对账。
3. 多币种只按币种分别汇总，不提供跨币种换算；汇率与商业结算留给后续范围。
# F15a 内部 Sandbox 执行会话自主审查报告

日期：2026-09-09
审查者：Codex（Contributor / Verifier，非 R2 Approver）
分支：`feat/bounded-sandbox-execution-sessions`

## 结果

| 维度 | 得分 | 结论 |
| --- | ---: | --- |
| 需求覆盖 | 19/20 | 覆盖独立激活、15 分钟窗口、主体/环境绑定、会话支出与状态机 |
| 技术实现 | 19/20 | 复用通用 resources、既有原子事务、Wallet/Budget Hold/Transaction，不新增第二账本 |
| 金融边界 | 20/20 | Session 不能替代 PaymentMandate 或放宽 execution_status；预留、结算、取消保持有界 |
| 自动化验证 | 20/20 | F15a Domain/HTTP、SDK、契约和现有回归门禁已覆盖；最终全量门禁待收口 |
| 文档与恢复 | 19/20 | 产品/技术/API/CHANGELOG/verification/testing 已同步；R2 尚待独立人工审查 |
| 综合 | **97/100** | 通过本地实现审查，进入 R2 |

## 结论

建议：**通过本地实现，提交 R2 Domain 与 Architecture 审查**。F15a 为外部 Agent 的既有工作流增加短时、隔离且可恢复的内部执行窗口，并把环境激活、业务授权和会话支出三个事实保持独立。

## 遗留风险与门槛

1. R2 审查必须由独立人类完成，Codex 不作为批准者。
2. F15a 尚不等于 Sandbox/Testnet 双向支付验收；F15b/F16a 仍需固定候选上的业务、故障、退款和对账证据。
3. Live/Mainnet、Hosted、托管钱包和生产凭证继续关闭；ExecutionSession 激活不能绕过环境或 Mandate 门禁。
