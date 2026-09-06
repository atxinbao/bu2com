# ENV-05：受控开发者与运维入口 v1

日期：2026-09-06
执行者：Codex
状态：Accepted · PR #22（2026-09-06）

## 1. 目标与边界

ENV-05 为 BU2 的 Agent、开发者和运维入口建立统一的机器身份边界。外部 `sandbox` 与 `live` 服务默认使用 `authenticated`；只有 `local` 可以显式使用 `development_open`。本变更不创建公网部署、生产凭证、托管资金或 Mainnet 执行许可，Live 继续 `execution_disabled`。

公开接口仅包括 `GET /health`、`GET /v1/environment` 与 `GET /v1/receipts/{id}/verify`。其余 API 使用环境绑定的 Bearer API key，凭据配置只保存 SHA-256 摘要，不保存或返回原始 key。

## 2. 身份与权限模型

机器契约见 [`access-contract.json`](access-contract.json)。角色与范围如下：

| 角色 | 允许能力 | 明确禁止 |
| --- | --- | --- |
| Agent | 以凭据声明的 Agent/Account 创建 Quote、PaymentIntent，读取参与交易，提交卖方交付，读取 Receipt | 人工授权、结算、恢复、租户重置、支持包、Webhook 运维 |
| Developer | Agent 能力与 Webhook subscription 管理 | 人工授权、结算、恢复、租户重置、支持包 |
| Operator | 交易读取、授权、结算/恢复、Ledger/Webhook 运维、支持包和 Sandbox 租户访问重置 | 伪装普通 Agent 身份；重置自己的运维租户；启用 Live 执行 |

每次非公开请求都会把 permission、主体、租户、结果、reason code、request/trace ID 写入只追加的 `access_decisions`。Agent/Developer 的 Account 与 Agent 声明在写入前校验，读取按交易参与者过滤；调用方不能通过请求体声明别人的身份。

F06a 在不改变角色权限集合的前提下，把这些声明映射为 SQLite Schema v10 的持久 Principal、Account、Agent 和 credential binding。配置启动只允许按明确的 credential metadata 幂等补齐对应记录；服务端会拒绝环境、租户、主体、generation 或 claims 漂移。`GET /v1/access` 仅返回当前调用者的脱敏归属摘要，onboarding CLI 只接受 token SHA-256 摘要。

## 3. 凭据配置与客户端传输

- Reference Server 从 `BU2_API_CREDENTIALS_JSON` 读取元数据数组；元数据包含 `token_sha256`、environment、tenant、principal、role、claims、generation、expiry 和 status，不包含原始 token。
- TypeScript SDK v0.3 和 MCP v0.3 在 `sandbox/live` 强制要求 `apiKey` / `BU2_API_KEY`。
- 客户端先匿名读取 `/v1/environment`；凭据只发送到同一 endpoint 的私有 API，并使用 `redirect: error`，防止自动重定向扩大凭据接收方。
- 公开 Receipt verify 不发送 API key；错误体、诊断和支持包不包含 key、Authorization header、私钥、Webhook secret、数据库路径或私有载荷。

## 4. Sandbox 租户访问重置

`POST /v1/operations/tenants/{tenant_id}/resets` 仅供 Operator 且只允许 Sandbox。重置递增目标租户的 credential generation，使旧 key 失效；它不删除 Transaction、Ledger、Receipt、链上引用或其他租户状态。请求必须使用幂等键，同键同请求返回原结果，同键异请求失败关闭。

Live 不提供该重置操作。任何凭据问题都不能通过改写交易事实、复制其他环境密钥或重放支付解决。

## 5. 运维支持包

`POST /v1/operations/support_bundles` 只返回粗粒度环境、服务版本、关联 ID、诊断计数与可选交易状态。它不会返回完整交易对象、文件路径、凭据、私钥、Webhook secret 或私有 payload。支持包是诊断快照，不是账本或 Receipt 的替代事实。

## 6. 验收结果

| 用例 | 结果 |
| --- | --- |
| E-T04 API key 环境绑定 | 通过：错环境 metadata 启动失败；外部环境无 key/错 key 为 401 |
| E-T11 Sandbox 租户重置 | 通过：只失效目标租户，其他租户、Operator 与 Ledger 事实不变 |
| E-T12 内部管理权限隔离 | 通过：Agent 不能授权或运维；拒绝与允许决策均有审计 |
| E-T15 边缘访问规则 | 部分：SDK/MCP 使用机器 Bearer 且不跟随重定向；真实托管 edge E2E 留 ENV-07 |
| E-T16 公开诊断最小化 | 通过：health 与 operator support bundle 均通过敏感字段回归 |

本地证据包括访问控制单元/HTTP/MCP 测试、SDK 类型与传输测试、SQLite migration、部署契约和完整 Reference Server 回归。详细命令与结果见 [`verification.md`](../../verification.md)。

## 7. 恢复

若需要回退，先停止外部流量，再回退服务、SDK 与 MCP 制品。Schema v10 的访问审计、租户重置、身份归属和 onboarding 记录必须保留；不得删除 Ledger/Receipt、降低为外部 development-open、跨环境复用 key 或自动重复任何支付。Live 仍保持 `execution_disabled`。

## 8. 后续

ENV-05/06 已由 PR #22/#23 合并。ENV-07A 已建立文件型 Secret、独立激活和 edge 机器证据契约；真实托管 edge、正式 secret manager 和 Sandbox 凭据签发仍属于 ENV-07B 部署验收。PaymentMandate 的主体信任仍是 F02/F03 独立工作，不由 API key 自动替代。
