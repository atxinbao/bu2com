# Public Wallet API 产品契约

日期：2026-09-11
执行者：Codex
风险等级：R2（认证账户归属、余额公开语义与 Access Contract 变更）

## 1. 目标与边界

Public Wallet API 让上层产品按业务 `Account` 读取 FP-08 已初始化的账户钱包，不要求调用方理解内部 `LedgerAccount` 或 WalletReadModel。当前实现和验收只适用于 Local/Simulation；它不构成 Hosted、Sandbox/Testnet、Live/Mainnet 或真实资金服务准入。

本契约只新增读取能力，不新增充值、提现、转账、调账、余额初始化或 cutover 控制接口。Transaction Core 继续是账户余额的唯一业务写入者。

## 2. 接口

```http
GET /v1/accounts/{account_id}/wallets
Authorization: Bearer <BU2 API key>
```

- `account_id` 是业务 Account 标识；调用方不能传入或筛选 `ledger_account_id`。
- 响应只包含当前环境、认证租户和目标 Account 下已经初始化 `account_wallet_balances` 的钱包。
- 一个 Account 可以拥有多个资产、网络或币种钱包，结果按 `ledger_account_id`、`currency` 确定性排序。
- 没有已初始化钱包时返回 `200 { "data": [] }`，不从全局 legacy wallet 构造假余额。

每个 Wallet 返回：

| 字段 | 语义 |
| --- | --- |
| `account_id` | 上层产品使用的业务 Account |
| `ledger_account_id` | 服务端解析并返回的可信账簿归属；不是请求选择器 |
| `asset / network / currency` | 钱包的资产、网络和会计币种范围 |
| `available / reserved` | 整数最小单位金额；仅 `status=active` 时可见 |
| `balance_source` | 固定为 `account_wallet`，禁止伪装为 Provider 余额 |
| `read_mode / cutover_generation` | 当前追加式读路由与 generation |
| `status / blockers` | `active` 或失败关闭的 `blocked` 及稳定原因 |
| `fallback_performed` | 固定为 `false` |

底层 FP-08 账户钱包可能因已发生的 ProviderFee 形成负 `available`；此时运行时容量状态为 `blocked`，公开 API 必须把 `available / reserved` 都返回为 `null`，不得暴露负数为可用资金。`status=active` 时两个金额均为非负整数最小单位。它们是 BU2 运行时账户余额，不代表 Provider 托管资产确权。

## 3. 归属与权限

Access Contract 从 `1.0` 升级到 `1.1`，为 `agent / developer / operator` 增加 `wallets:read`：

- Agent 或 Developer 只能读取凭据 `account_ids` 中的 Account，并且 LedgerAccount 必须属于同一认证租户。
- Operator 保留平台范围读取能力，用于受控诊断；该能力不授予资金写入。
- 缺少凭据返回 `401`；没有 Account claim 返回 `403 resource_scope_denied`。
- 任意查询参数，包括调用方尝试提供 `ledger_account_id`，返回 `400 invalid_query_parameters`。

## 4. 失败关闭

公开 Wallet 复用 `getRuntimeWalletView()` 的完整运行检查。projection stale/incomplete、Domain revision 过期、未决 Provider Attempt、对账缺失/重复/异常、shadow 差异、账户写源缺失或 cutover 已回滚时：

- `status=blocked`；
- `available=null`；
- `reserved=null`；
- 返回排序后的 `blockers`；
- `fallback_performed=false`；
- 不返回、复制或暗示 legacy global wallet 金额。

恢复必须沿用既有追加式 projection refresh、reconciliation 或 cutover generation 流程；API 本身不自动修复、回滚、对账或重新付款。

## 5. 验收

- [x] 认证 Account 可以读取自身已初始化钱包。
- [x] 未认证和跨 Account 请求被拒绝。
- [x] 同 Account 未初始化的 LedgerAccount 不出现在结果中。
- [x] 任意 LedgerAccount 查询参数被拒绝。
- [x] 健康状态返回账户级 available/reserved。
- [x] stale 状态隐藏金额、返回 blocker 且不进行 legacy fallback。
- [x] HTTP、OpenAPI、Access Contract 1.1 与 TypeScript SDK 使用同一结构。
- [ ] Hosted、Sandbox/Testnet、Live/Mainnet 与真实资金验收，继续属于后续独立准入。

## 6. 恢复与兼容

该接口是 Agent Payment API v0.3.0 的向后兼容只读扩展。回退应用可以停止暴露此路由；Schema 22、账户余额、Journal、Posting、交易与 cutover generation 不得因此删除或改写。Access Contract 1.1 客户端必须拒绝错误版本的服务端环境声明，不能把 1.0 权限集合静默解释为已支持钱包读取。
