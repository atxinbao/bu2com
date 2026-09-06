# BU2 环境注册表与链隔离 v1

日期：2026-09-06
执行者：Codex
状态：ENV-02 已由 PR #19 批准并合并
风险等级：R2

## 1. 目标与边界

ENV-02 把已批准的 `local / sandbox / live` 环境决策落实为 Reference Server 的运行时前置条件。配置必须在数据库、Signer 或 Provider 建立前完成验证；失败时不启动资金执行，不跨链、不降级到 Simulation，也不生成假成功。

ENV-02 合并时没有修改公开 API、SDK、MCP、Doctor 或 Receipt v0.2 的 legacy `simulation/testnet` 语义。后续 ENV-03 已实现 expand → verify → switch 迁移，并继续保留历史 Receipt 的原始签名。本工作本身没有执行 Base Sepolia 或 Mainnet 付款，也没有加载生产密钥。

## 2. 唯一注册表

运行时注册表位于 `sandbox/environment-config.mjs`，链定义复用 `viem/chains`：

| Environment | Adapter | Chain | Network | Asset | 默认执行状态 |
| --- | --- | ---: | --- | --- | --- |
| `local` | `simulated` | `null` | `null` | `null` | `execution_enabled` |
| `sandbox` | `x402` | 84532 | `eip155:84532` | Base Sepolia USDC | `execution_disabled` |
| `live` | `x402` | 8453 | `eip155:8453` | Base Mainnet USDC | `execution_disabled` |

Sandbox 只有在显式设置 `execution_enabled` 后才允许测试资金边界；Live 在 ENV-02 中无条件拒绝 `execution_enabled`。环境、Adapter、chain、network、asset、Provider network/scheme、RPC chain 和 Signer environment 任一冲突，返回稳定配置错误并停止装配。

## 3. 配置入口

| 变量 | 含义 |
| --- | --- |
| `BU2_ENVIRONMENT` | `local / sandbox / live`；使用 x402 时必填 |
| `BU2_PAYMENT_ADAPTER` | `simulated / x402` |
| `BU2_CHAIN_ID` | 预期 EVM chain id |
| `BU2_NETWORK` | CAIP-2 network |
| `BU2_USDC_ADDRESS` | 当前环境批准的 USDC 合约 |
| `BU2_PROVIDER_NETWORK` | x402 Provider network 绑定 |
| `BU2_PROVIDER_SCHEME` | 当前仅允许 `exact` |
| `BU2_EXECUTION_STATUS` | `execution_disabled / execution_enabled` |
| `BU2_SIGNER_ENVIRONMENT` | Signer 所属环境；加载签名材料时必填且必须匹配 |
| `BU2_RPC_CHAIN_ID` | 已解析 RPC chain id；若提供必须匹配注册表 |
| `BU2_CLAIM_LEGACY_DB_ENVIRONMENT` | 一次性显式认领无 metadata 的旧库；默认关闭 |

配置值不能覆盖注册表批准值。缺省 Reference Server 只能进入 `local + simulated`。`sandbox/live + simulated`、错链、错资产、错 Provider、错 Signer 或 Live execution enabled 都会失败关闭。

## 4. 数据库环境绑定

SQLite Schema v8 新增单行 `environment_metadata`：

- 保存 environment contract version、environment、Adapter、chain、network、asset、绑定方式和时间；
- 数据库约束只允许三种批准组合；
- UPDATE/DELETE 触发器阻止静默换环境；
- 新库在第一次运行时绑定；同一数据库再次以另一环境打开时返回 `database_environment_mismatch`；
- 已有数据但没有 metadata 的旧库返回 `legacy_database_environment_unclaimed`，只有明确鉴别后使用一次性 claim 才能绑定。

旧库认领不会改写交易、账本、Receipt、余额或 Adapter 证据。若环境无法确定，保持数据库只读并停止资金启动；不得猜测为 Sandbox 或 Live。

## 5. 执行边界

- `listen()` 先装载注册表并验证 RPC/Signer，再打开或绑定数据库，最后构造 Adapter。
- x402 Adapter 在 `reserve` 和 `settle` 的第一行检查执行状态；禁用时不会请求商户、创建签名或调用 Provider。
- `recoverSettlement` 仍允许查询和对账，禁止通过恢复路径重新付款。
- x402 challenge、签名前 hook 和 settlement response 继续分别验证 network、asset、amount、resource 与 `payTo`。
- Live 只允许进程装配、数据库绑定、只读查询和对账；ENV-02 不提供启用主网资金路径的配置。

## 6. 验收与证据

| 场景 | ENV-02 结果 |
| --- | --- |
| E-T01 Sandbox → 8453 | 通过：启动前拒绝，Provider spy 0 次 |
| E-T02 Live → 84532 | 通过：启动前拒绝，Provider spy 0 次 |
| E-T03 Sandbox/Live → simulated | 通过：组合矩阵拒绝 |
| E-T06 RPC failover 返回错链 | ENV-02 范围通过：`verifyRpcChain` 拒绝；完整运行恢复演练留 ENV-06 |
| E-T07 错环境数据库 | ENV-02 范围通过：metadata 不匹配拒绝；部署挂载测试留 ENV-04 |
| E-T09 Live 未获准 | ENV-02 范围通过：execution enabled 和 Signer 加载拒绝，Adapter 外部调用 0 次；完整 E2E 留 ENV-08 |

验证命令与最终数量记录在根目录 `verification.md`。这些是 Local 自动化证据，不是 Sandbox 实支付或生产证明。

## 7. 兼容与恢复

- ENV-02 合并时 API contract、事件、MCP、SDK 与 Receipt schema/version 均不变；后续 ENV-03 通过独立 R2 变更迁移这些客户端契约。
- `/health.environment` 已由 ENV-03 切换为 `local/sandbox/live`，详细环境信息由版本化 `GET /v1/environment` 返回。
- Schema v8 为纯新增；旧数据不重写。若本实现未获批准，停止新版本服务并恢复到旧制品。已写入的 metadata 保留为审计事实，旧版本会忽略新表。
- ENV-03 必须复用本注册表输出 `GET /v1/environment`，不得重新定义第二套环境映射。

## 8. 下一步

ENV-03 已实现 API、SDK、MCP、Doctor、Evidence 与 Receipt 环境契约迁移，说明见 [客户端与 Receipt 环境契约 v1](ENVIRONMENT_CLIENT_AND_RECEIPT_CONTRACT_V1.md)。其 R2 审查合并后，下一项为 ENV-04 隔离部署单元。
