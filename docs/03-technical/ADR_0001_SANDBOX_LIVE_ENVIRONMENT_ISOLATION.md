# ADR-0001：Sandbox 与 Live 环境隔离

日期：2026-09-06
执行者：Codex
状态：Accepted · PR #18（2026-09-06）

## 背景

当前 Reference Sandbox 从 Adapter 名称推导 `simulation/testnet`，并在多个客户端和 Receipt 契约中重复环境枚举。BU2 下一阶段需要托管 Base Sepolia Sandbox，同时把 Base Mainnet 纳入架构目标；若继续让环境、执行后端和资金许可共用一个字符串，错链、错库、错 Signer 或模拟成功被误认成链上结果的风险会扩大。

## 决策

1. 对外服务环境只有 `sandbox/live`；内部本地执行使用 `local`。
2. `simulated/x402` 是执行后端，不是服务环境。
3. Live 初始为 `execution_disabled`；环境配置不构成资金许可。
4. Sandbox 与 Live 复用同一不可变软件制品，但使用独立数据库、凭证、Signer、Receipt 信任域、Webhook、队列、存储和运行身份。
5. 数据库保存不可静默改变的环境 metadata，错环境挂载必须停止资金启动。
6. 客户端在发送凭证或 mutation 前执行环境握手，服务端在每次资金操作时再次校验。
7. 旧 Receipt 按原字段、schema 和算法验证；不改写、不重签、不把 simulation 更名为 Sandbox。

完整契约见 [SYSTEM_ENVIRONMENTS_V1.md](SYSTEM_ENVIRONMENTS_V1.md)。

## 候选方案

### A. 单进程加 `environment` 列

拒绝。它不能隔离数据库、凭证、Signer、Webhook、备份和故障域，配置错误可能直接跨环境影响资金。

### B. 每个环境维护一套代码分支

拒绝。代码和迁移会漂移，无法证明 Sandbox 验证的制品与 Live 候选一致。

### C. 同一制品、独立部署单元与独立信任域

采用。它保留单一代码与契约来源，同时把数据、资金、秘密和恢复边界物理隔离。

## 后果

### 正面

- 环境、执行后端和资金准入可以独立验证。
- Sandbox 证据不会自动升级为 Live 许可。
- 相同制品可从 Sandbox 提升到 Live，减少代码漂移。
- 错链、错库、错 Signer 和跨环境凭证可在启动或签名前失败关闭。

### 成本与约束

- 需要 ENV-02 配置注册表和数据库 metadata 迁移。
- 需要 ENV-03 同步迁移 API、SDK、MCP、Doctor、Evidence 和 Receipt 环境语义。
- 两套部署增加基础设施、监控、备份、测试资金和运维成本。
- 当前 SQLite 路径仍是单写者，不能宣称多节点高可用。

## 兼容与迁移

- 采用 expand → backfill → verify → switch，不批量替换历史字符串。
- legacy `simulation/testnet` 仅在明确兼容窗口内读取。
- 旧未决交易若无法证明环境、网络和授权，不得自动执行。
- 公共契约发生不兼容变化时发布新版本，不让旧客户端静默获得 Live 能力。

## 失败与恢复

任何环境、DB、RPC、Signer、Provider 或 Receipt issuer 不一致均停止新增资金执行，并保留观察、查询和对账。回退应用时保留已追加环境 metadata 和原始历史；恢复旧备份后保持 execution disabled，先对账备份点之后的 Payment Attempt 和链上事实。

## 重新评估条件

- SQLite 单写者无法满足冻结后的容量、RTO 或 RPO；
- 新增第二网络、第二资产或第二真实支付通道；
- 法律或 Provider 要求改变数据/签名隔离模型；
- 托管模式进入正式评估。
