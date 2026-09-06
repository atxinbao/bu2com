# BU2 环境验收矩阵 v1

日期：2026-09-06
执行者：Codex
状态：F01 / ENV-01、ENV-02、ENV-03、ENV-04 已批准；ENV-05 已有本地自动化证据，等待 R2 审查

本矩阵是 ENV-02–ENV-08 的验收来源。除非列出真实执行证据，不得将“已定义”写成“已通过”。

| ID | 最迟工作项 | 场景 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| E-T01 | ENV-02 | Sandbox 配置 chain 8453 | 启动或资金路径拒绝，无签名 | 配置测试 + Signer spy 0 次 |
| E-T02 | ENV-02 | Live 配置 chain 84532 | 拒绝，无主网或测试网广播 | 配置测试 + Provider spy 0 次 |
| E-T03 | ENV-02 | Sandbox/Live 使用 simulated | 配置拒绝，不降级生成假成功 | 组合矩阵测试 |
| E-T04 | ENV-03 | 错环境 API key、Mandate 或 Receipt | 拒绝，不跨库查找或自动路由 | API/SDK/MCP 契约测试 |
| E-T05 | ENV-03 | 验证旧 Receipt v0.2 | 原字段和原算法验证，可追溯解释 | 归档 fixture + 独立验证器 |
| E-T06 | ENV-02/06 | RPC failover 返回错链或证据矛盾 | 暂停新增执行，保持未知，不创建新付款 | 故障注入 + Attempt 审计 |
| E-T07 | ENV-02/04 | 挂载另一环境数据库或秘密 | 环境绑定拒绝，日志不泄密 | 启动测试 + 日志扫描 |
| E-T08 | ENV-06 | 普通 PR 验证 | 无资金 Signer/Live 凭证；证据标记 local simulation | 隔离运行证明 |
| E-T09 | ENV-02/08 | Live 未获 G-L/Grant/租户启用 | 管理和只读可用；资金 mutation 稳定拒绝 | Live disarmed E2E |
| E-T10 | ENV-06/08 | Live 回滚或旧备份恢复 | execution disabled；对账前不自动重放 | 恢复演练 |
| E-T11 | ENV-05/07 | 重置测试租户 | 不影响其他租户、Live 数据或链上事实 | 多租户隔离测试 |
| E-T12 | ENV-05 | 内部管理权限用于外部 API | 不自动授予普通 Agent 管理能力；审计明确 | 授权矩阵测试 |
| E-T13 | ENV-07 | 外部 Agent 完成托管 Sandbox 样例 | 真实 Base Sepolia 双向证据；只在开始前授权 | 外部团队证据包 |
| E-T14 | ENV-07 | 双向收付、重复通知和响应丢失 | 资金效果不重复；最终收敛或保持明确未知 | Provider/Webhook 故障注入 |
| E-T15 | ENV-05/07 | API/回调遇到边缘访问规则 | 机器认证可通行，不要求人工挑战 | 部署 E2E |
| E-T16 | ENV-03/05 | 读取公开健康和支持包 | 不暴露内部路径、全量交易、凭证或私人载荷 | Schema + 敏感信息扫描 |

## 当前状态

- E-T01、E-T02、E-T03：**Approved / Local automated pass**，ENV-02 已由 PR #19 合并。
- E-T06：ENV-02 的 RPC 错链拒绝已通过；ENV-06 的故障恢复与 Attempt 审计仍为 **Not yet accepted**。
- E-T07：ENV-02 的数据库 metadata 错环境拒绝已通过；ENV-04 已使用真实本地容器证明 Sandbox 数据卷挂入 Live 时启动拒绝、跨环境 Signer 在密钥解析前拒绝且日志不泄密，状态为 **Implemented / Local automated pass**；托管环境秘密管理仍留 ENV-05/06。
- E-T09：ENV-02 的 Live disarmed 配置和 Adapter 零调用已通过；ENV-08 的受限 Live E2E 仍为 **Not yet accepted**，且不授权主网付款。
- E-T04：endpoint、SDK、MCP、Receipt 与 API key 环境绑定子范围 **Implemented / Local automated pass**；正式 PaymentMandate 主体信任仍留 F02/F03。
- E-T05：**Implemented / Local automated pass**；v0.2 静态 fixture 保持原始签名字节并由独立验证器验证。
- E-T11：Sandbox 租户 credential generation 重置 **Implemented / Local automated pass**；交易、Ledger、Receipt 与其他租户保持不变。
- E-T12：Agent/Developer/Operator 权限矩阵、claims 和只追加访问决策 **Implemented / Local automated pass**。
- E-T15：机器 Bearer、公开预检不携带 key 和 redirect fail-closed **Implemented / Local automated pass**；托管 edge E2E 留 ENV-07。
- E-T16：公开 `/health` 与 Operator 脱敏支持包 **Implemented / Local automated pass**。
- E-T08：ENV-04 容器验收未挂载 Signer、未传入真实凭证且明确标记本地部署边界，子范围为 **Implemented / Local automated pass**；托管发布证明留 ENV-06。
- E-T10–E-T15：**Defined / Not yet accepted**。
- 当前仓库已有 local Simulation、Base Sepolia Adapter、Receipt、未知支付恢复、幂等和原子性测试，可作为实现基础，但不能替代新的环境隔离测试。
- E-T13/E-T14 必须在真实托管 Sandbox 上执行；本地 mock、Simulation 或仓库内自动化不能计作外部团队验收。
- E-T09/E-T10 只验证 Live disarmed 架构，不授权 Mainnet 付款。

## 通用停止条件

任何跨环境凭证、错链、错库、错 Signer、未知付款自动重试、历史 Receipt 含义变化或公开健康泄密都会使对应工作项失败。失败后停止新增资金执行，保留查询、观察和对账，并在修复后重新运行完整矩阵。
