# BU2 客户端与 Receipt 环境契约 v1

日期：2026-09-06
执行者：Codex
状态：Accepted · PR #20（2026-09-06）
风险等级：R2

> 历史说明：本文件记录 ENV-03 合并时的 v0.2 客户端迁移基线。ENV-05 已将 API/SDK/MCP 升级到 v0.3 并增加 Access Contract v1；当前入口见[受控开发者与运维入口 v1](ENVIRONMENT_CONTROLLED_ACCESS_V1.md)。Receipt v0.2/v0.3 的历史兼容语义不变。

## 1. 目标与边界

ENV-03 把 ENV-01/02 已批准的 `local / sandbox / live` 环境语义扩展到公开 API、TypeScript SDK、MCP、Doctor、clean-room Evidence 和新签发 Receipt。客户端必须在发送 mutation 前确认 endpoint 环境、链、执行后端、契约版本、Receipt issuer 与执行状态，不能通过修改字符串、重定向或自动降级切换信任域。

本工作没有创建 Sandbox 或 Live 部署，没有启用 Base Sepolia 或 Mainnet 付款，没有加载钱包或生产凭证。仓库目前不存在正式 API key 和结构化 PaymentMandate 对象，因此 E-T04 中这两项仍留给 ENV-05 与 F02/F03；本工作只关闭 endpoint、客户端和 Receipt 的跨环境拒绝。

## 2. 唯一机器契约

[`environment-contract.json`](environment-contract.json) 是运行时、SDK 生成器和 MCP 的共享机器来源：

| 服务环境 | 执行后端 | Chain ID | Network | 默认执行状态 |
| --- | --- | ---: | --- | --- |
| `local` | `simulated` | `null` | `null` | `execution_enabled` |
| `sandbox` | `x402` | 84532 | `eip155:84532` | `execution_disabled` |
| `live` | `x402` | 8453 | `eip155:8453` | `execution_disabled` |

`sandbox/live` 是对外环境；`local` 只允许显式开发模式。环境契约不包含凭证、钱包、交易数量或内部存储信息。

## 3. API 自描述

`GET /v1/environment` 返回：

- service environment 与 environment contract version；
- chain、CAIP-2 network 和 execution backend；
- API/MCP/Receipt 兼容版本；
- `execution_enabled` 或 `execution_disabled`；
- 公开能力和当前 Receipt issuer 公钥标识。

返回值只来自服务端配置，不能由请求 header 覆盖。公开 `/health` 只保留粗粒度存活、运行状态、版本、环境和执行 readiness，不再暴露数据库路径、账本数量、Outbox 内部统计或 Adapter 操作详情。

## 4. SDK、MCP 与 Doctor 预检

- TypeScript SDK v0.2 在每次 mutation 前读取 `/v1/environment`。环境、链、后端、契约、issuer 或当前 Receipt schema 不匹配时抛出 `environment_contract_mismatch`；执行禁用时抛出 `environment_execution_disabled`，mutation 不会发送。
- SDK 新客户端只接受 `sandbox/live`；连接本机时必须显式使用 `environment: "local"` 与 `localDevelopment: true`。写入失败或超时仍不自动重放。
- MCP contract v0.2 在进程启动和每次 Agent mutation 前执行同一预检，并在 initialize capability 中公开环境、链、后端、执行状态和 issuer ID。`testnet/mainnet/simulation` legacy 值在启动前拒绝。
- Doctor result v0.2 记录环境契约摘要，并把链、后端、issuer 或契约不一致归类到 environment/contract 阶段；诊断仍为进程内、无持久化、无远程上传。

Settlement recovery 是查询式恢复，不创建第二笔付款，因此即使 execution disabled 仍可运行；普通 Quote、PaymentIntent、Authorization、Delivery 和 Settlement 均由服务端再次检查执行状态。

## 5. Receipt v0.3 与历史兼容

新 Receipt 使用 schema `0.3`、RFC 8785 JCS 和 Ed25519，并把以下字段纳入签名字节：

- `environment_contract_version`
- `environment`
- `execution_backend`
- `chain_id`
- `network`
- `receipt_issuer_id`

验证结果分别返回 `signature_valid`、`issuer_trusted`、`settlement_confirmed` 和 `environment_valid`；任一项失败时 `valid=false`。改变金额、币种、Mandate、交付证据、Provider 引用或任一环境绑定都会使验证失败。

旧 Receipt 不重写、不重签：schema registry 继续按 v0.1/v0.2 原算法验证。仓库包含一份没有私钥的静态 v0.2 Simulation fixture，独立验证其原始签名字节。旧 `simulation` 只能派生为 Local 历史证据；旧 `testnet` 只有同时具备 Base Sepolia channel 和 Provider 引用时才可解释为 Sandbox 历史证据，否则保持 unknown。

## 6. 验收结果

| 验收项 | ENV-03 结果 |
| --- | --- |
| E-T04 endpoint / Receipt 跨环境 | 通过：API、SDK、MCP 和 Receipt 均失败关闭，mutation 0 次 |
| E-T04 API key / PaymentMandate | 未关闭：等待 ENV-05 与 F02/F03 正式对象和身份边界 |
| E-T05 历史 Receipt v0.2 | 通过：静态 fixture 原始签名独立验证，篡改拒绝 |
| E-T16 公开 health | ENV-03 范围通过：敏感内部运行统计不再出现在公开响应 |

完整命令和数量记录在根目录 [`verification.md`](../../verification.md)。所有结果均为 Local 自动化证据，不是托管 Sandbox、链上结算或生产准入证明。

## 7. 兼容、部署与恢复

这是面向新客户端的破坏性契约切换：SDK/MCP/Doctor 使用 v0.2，API contract 使用 v0.2.0，新 Receipt 使用 v0.3。旧客户端若仍发送 legacy 环境名会在 mutation 前失败；应先升级客户端并验证 `/v1/environment`，再切换服务。

建议部署顺序：先部署支持 `/v1/environment` 和 Receipt schema registry 的服务，再升级 Doctor/MCP/SDK，最后允许新 mutation。若回退应用版本，旧 Receipt v0.2 继续可验证；已签发的 v0.3 Receipt 与账本事实不得删除或重签，应保持新验证器只读可用。不得用回滚触发支付重放、跨环境数据库装载或环境自动降级。

ENV-04/05 已由 PR #21/#22 合并。ENV-06 运营与恢复已实现并等待 R2 审查；Live 继续 `execution_disabled`。
