# BU2 系统环境契约 v1

日期：2026-09-06
执行者：Codex
状态：F01 / ENV-01 至 ENV-05 已由 PR #18–#22 批准；ENV-06 已实现，等待 R2 独立人工审查
适用范围：BU2 服务、API、SDK、MCP、Doctor、Receipt、部署与运营

## 1. 决策

BU2 对外只提供两个服务环境：

| 对外名称 | 机器值 | 网络 | Chain ID | CAIP-2 网络标识 | 资产 |
| --- | --- | --- | ---: | --- | --- |
| Sandbox | `sandbox` | Base Sepolia Testnet | 84532 | `eip155:84532` | 测试 USDC，无真实金融价值 |
| Live | `live` | Base Mainnet | 8453 | `eip155:8453` | 主网 USDC，具有真实金融价值 |

`Mainnet` 是 Live 的网络描述，不是第三个环境枚举。`Simulation` 是内部本地执行方式，不是对外服务环境；本地开发、单元测试和故障注入使用 `environment=local` 与 `payment_adapter=simulated`。

旧 Receipt 中的 `simulation/testnet` 是必须保留的 legacy 值；当前运行时和新客户端已经使用 `local/sandbox/live`。本文件不授权批量改写或重签历史 Receipt。

## 2. 三个正交维度

| 维度 | 值 | 含义 |
| --- | --- | --- |
| 服务环境 | `local / sandbox / live` | 数据、身份、端点和信任域 |
| 执行后端 | `simulated / x402` | 资金动作的实现机制 |
| 资金准入 | `execution_disabled / execution_enabled` + CapabilityGrant + Mandate | 是否允许签名或广播资金指令 |

环境字符串、Adapter 名称和资金许可不得互相推导。合法组合只有：

| 服务环境 | 执行后端 | Chain ID | 用途 | 初始执行状态 |
| --- | --- | ---: | --- | --- |
| `local` | `simulated` | `null` | 本地开发、自动化测试、故障注入 | enabled for simulation |
| `sandbox` | `x402` | 84532 | 内部集成、邀请制外部接入、发布候选验收 | gated |
| `live` | `x402` | 8453 | 主网服务 | `execution_disabled` |

以下组合必须失败关闭：`sandbox + simulated`、`sandbox + 8453`、`live + simulated`、`live + 84532`。任何故障均不得自动切换到另一环境或返回模拟成功。

## 3. 环境不是付款许可

建设 Live 的配置、数据库、部署模板、只读诊断和管理能力，不等于允许主网收付。Live 初始状态必须为 `execution_disabled`；只有 G-L、有效 CapabilityGrant、租户启用和 PaymentMandate 同时成立，资金路径才可在限定范围内启用。

`execution_disabled` 至少阻止：

- 创建或发布可用的主网付款要求；
- 钱包签名、Provider 提交和链上广播；
- 自动放行履约或结算。

它不应阻止只读查询、链上观察、回调接收和对账。第三方仍可能向已存在地址主动转账，系统必须记录可观察事实，不能因执行关闭而忽略已发生的链上活动。

## 4. 同一软件，两套隔离部署

Sandbox 与 Live 可以复用同一提交、不可变制品、API 定义、迁移版本和监控模板，但不得共享：

- 主机挂载目录、数据库、缓存、Inbox 或 Outbox；
- API credential、钱包 Signer、Receipt Ed25519 key 或 Webhook secret；
- 业务数据、租户授权、Mandate、队列和恢复目标；
- Provider/RPC 账户、运行身份、对象存储或备份权限。

当前 Node.js + SQLite WAL 继续作为第一阶段的单写者部署路径。每个环境使用独立 Linux/容器部署单元和本地持久卷；不得把 SQLite WAL 放在共享网络文件系统并声称已具备多节点高可用。若容量或恢复目标需要多写者或跨节点高可用，必须另行提交数据库演进 ADR。

## 5. 网络与资产注册表

环境注册表是 API、Worker、SDK、MCP、Doctor、Signer 和 Provider 的唯一批准来源：

| 环境 | Network | Chain ID | USDC 合约 | 小数位 |
| --- | --- | ---: | --- | ---: |
| Sandbox | `eip155:84532` | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6 |
| Live | `eip155:8453` | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |

ENV-02 必须在启动、RPC 切换和每次签名边界验证：配置环境、RPC `eth_chainId`、批准资产、Signer 环境、数据库环境、Provider 网络/scheme 和执行状态。RPC 返回 chain id 不是单独的信任根；受信 endpoint、TLS 和 Provider 配置仍需独立校验。

现有 API 的 USD 最小单位不得直接当作 USDC 原子单位。资产转换必须显式、版本化、使用整数并提供精度和舍入测试。

## 6. 数据库、对象与凭证隔离

- 新数据库初始化时写入不可随意改变的环境 metadata；进程发现配置与数据库不一致时停止资金相关启动。
- 没有 metadata 的旧库先进入显式鉴别和迁移，不默认解释为 Sandbox 或 Live。
- 新资源逻辑唯一键必须覆盖 environment、tenant/account 和操作作用域。
- Provider 证据不得只按 `tx_hash` 去重，至少结合 network/chain、Provider、合约和事件位置。
- Sandbox 与 Live 的 API key、Agent membership、Mandate 和钱包必须分别创建；不得“升级”或原样复用。
- 只允许经人工审核迁移非敏感配置模板，不迁移余额、交易历史、私钥或授权。

## 7. 环境自描述与客户端预检

ENV-03 已冻结版本化环境信息接口 `GET /v1/environment`，最小返回：

```json
{
  "environment": "sandbox",
  "environment_contract_version": "1.0",
  "chain_id": 84532,
  "network": "eip155:84532",
  "api_contract_version": "0.3.0",
  "receipt_schema_versions": ["0.2", "0.3"],
  "execution_status": "execution_enabled",
  "public_capabilities": [],
  "receipt_issuer": {}
}
```

环境值只能来自服务端配置，不接受请求 header 覆盖。SDK、MCP 与 Doctor 在携带敏感凭证或发送 mutation 前，必须验证 endpoint、expected environment、chain、契约版本、Receipt issuer 与 execution status；不得携带凭证自动跟随跨来源重定向，不得自动改环境或静默换链。

健康状态分为 process liveness、HTTP readiness 和 payment execution readiness。公开健康接口不得泄露数据库路径、全站交易量、内部死信详情或凭证状态。

## 8. Receipt 与历史兼容

旧 Receipt 已签名的 `simulation/testnet` 字段、签名字节、schema 和 canonicalization 算法必须原样保留：

- 新版本写入 `sandbox/live`；本地模拟证据写 `local + simulated`，不成为正式环境选择。
- 验证器按 schema-version registry 选择算法，不用单一 current-version 常量解释全部历史。
- 历史 `testnet` 只有在 network、Adapter 和 Provider 证据共同证明 Base Sepolia 时，才可派生展示为“Sandbox（历史记录）”。
- 历史 `simulation` 只能解释为本地模拟，不得更名为 Sandbox 链上成功。
- 环境字段迁移采用 expand → backfill → verify → switch；禁止重签 Receipt 掩盖历史语义。

## 9. 对外与内部服务面

以下名称是规划，不是已配置或已验证的地址：

| 服务面 | Sandbox 规划 | Live 规划 | 开放边界 |
| --- | --- | --- | --- |
| API | `api.sandbox.bu2.com` | `api.bu2.com` | 环境绑定的机器凭证 |
| Console | `console.sandbox.bu2.com` | `console.bu2.com` | 人员登录和账户内资源 |
| Operations | `ops.sandbox.bu2.com` | `ops.bu2.com` | 私有访问、强认证和审计 |
| Provider hooks | `hooks.sandbox.bu2.com` | `hooks.bu2.com` | 来源和通道证据校验 |
| Docs / Status | `docs.bu2.com` / `status.bu2.com` | 同站独立组件 | 环境分别标识 |

机器收付链路不能依赖逐笔交互登录或验证码。首版 MCP 继续为本地 stdio Bridge，连接受信远端 API；本次不授权远程 MCP 或公开 npm 分发。

## 10. 发布与准入

```text
PR local simulation / contract verification
  → build one immutable artifact
  → internal Sandbox deployment
  → Base Sepolia acceptance
  → invited hosted Sandbox evidence
  → G-F foundation readiness
  → same artifact + isolated Live configuration/resources
  → G-L + CapabilityGrant + tenant/Mandate checks
  → restricted Live execution
```

升级的是代码和 schema，不是 Sandbox 数据、余额、API key、Mandate 或钱包私钥。普通 PR 验证不得加载资金 Signer 或 Live 凭证。Testnet 集成使用可撤销、限额凭证和独立租户；取消测试进程不能取消已提交的链上付款，未决 Attempt 必须继续对账。

## 11. 环境工作与依赖

| 工作 | 交付 | 依赖与边界 |
| --- | --- | --- |
| F01 / ENV-01 | 冻结本文、ADR、验收矩阵和治理入口 | 当前 PR；不改运行时 |
| F02 | 基础身份、数据所有权和凭证边界 | 可与 ENV-01 后续并行 |
| ENV-02 | 环境注册表、配置装载、DB/RPC/Signer/Provider 断言 | 前置于新签名路径 |
| ENV-03 | API/SDK/MCP/Doctor/Receipt 环境契约迁移 | ENV-02 后实施 |
| ENV-04 | 隔离 Sandbox/Live 部署单元 | PR #21 已合并；模板不启用 Live 签名 |
| ENV-05 | 受控开发者与运维入口 | PR #22 已合并 |
| ENV-06 | 制品提升、监控、备份与恢复演练 | 已实现；等待 R2 审查；Live execution disabled |
| ENV-07 | 托管 Sandbox 双向 Base Sepolia 验收 | ENV-02–06 + F03–F16 对应能力 |
| ENV-08 | 受限 Live 启用 | G-F、L01、G-L；独立 R3 授权 |

本环境路线复用 F 路线的身份、账本、权限、收付、对账和运营能力，不建设第二套系统。

## 12. 本次边界与恢复

F01/ENV-01 只冻结决策，不创建云资源、不配置 DNS、不部署服务、不修改历史数据、不启用 Live，也不执行测试网或主网支付。若决策未获批准，删除本次新增入口并恢复上层文档即可；交易、账本、数据库、Adapter 和 Receipt 均无需回滚。

ENV-02/03 已由 PR #19/#20 合并，实现环境注册表、配置装载、Schema v8 数据库绑定、RPC/Signer/Provider 断言、客户端预检和 Receipt v0.3。ENV-04 已由 PR #21 合并，建立同一不可变镜像、两个隔离且 disarmed 的本地容器部署单元。ENV-05 已由 PR #22 合并，实现 API/SDK/MCP v0.3 的环境绑定机器凭据、角色/claims、Schema v9 访问审计、Sandbox 租户重置与脱敏支持包。ENV-06 在此基础上实现候选制品提升清单、配置漂移检测、环境专属 SQLite Online Backup、隔离恢复演练和脱敏运营快照，等待 R2 审查；说明见[运营与恢复 v1](ENVIRONMENT_OPERATIONS_V1.md)。旧 Receipt 仍保留原始 legacy 值、签名字节和解释规则。

## 参考来源

- [Base `eth_chainId`](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId)
- [Base RPC networks](https://docs.base.org/base-chain/api-reference/rpc-overview)
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [SQLite WAL](https://sqlite.org/wal.html)
- [SQLite Online Backup API](https://sqlite.org/backup.html)
- [GitHub deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
