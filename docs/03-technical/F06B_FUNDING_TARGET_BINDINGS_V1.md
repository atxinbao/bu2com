# F06b：资金来源与收款目标绑定 v1

日期：2026-09-07  
执行者：Codex  
状态：Implemented / Local automated pass / R2 review pending

## 1. 目标与边界

F06b 将 Agent 交易使用的资金来源和收款目标纳入持久身份边界。目标是让每一笔 Quote、PaymentIntent 和后续交易都能回答“使用了哪个 Account/Agent 的哪一个已验证资金绑定”，并在配置漂移、跨租户冒用或环境不一致时失败关闭。

本变更不重写 Transaction Core，不启用 Signer、真实付款、Live/Mainnet、托管或 Hosted Sandbox；Local 继续使用 Simulation，Sandbox 继续固定 Base Sepolia 与 x402。

## 2. 数据契约

Schema v11 新增两张环境隔离表：

- `funding_sources`：资金来源绑定。
- `receiving_targets`：收款目标绑定。

两类绑定均包含：

`environment`、`id`、`tenant_id`、`account_id`、`agent_id`、`asset`、`network`、`provider`、引用字段、`status`、`verification_status`、`generation`、创建/更新时间。

数据库主键为 `(environment, id)`，同一租户内的引用和 generation 具备唯一约束。绑定 ID 已写入 Quote 与 PaymentIntent；`/v1/access` 只返回当前主体可见的脱敏摘要。

## 3. 运行时规则

1. onboarding 只接受结构化的非秘密引用，不接受私钥、原始 token 或支付秘密。
2. Account/Agent 必须属于当前租户；未知主体、重复 ID 和引用冲突拒绝。
3. 绑定的资产与网络必须匹配持久化环境 metadata。
4. 已存在绑定时，交易创建必须命中 `active + verified` 绑定；跨租户、错资产、错网络、未验证、停用或引用漂移均失败关闭。
5. 已存在绑定的账户不会回退到 `knownPayees` 演示行为；未配置绑定的旧演示账户继续保持兼容。
6. 绑定引用变化必须创建新绑定 ID 或 generation，禁止静默覆盖历史指向。

## 4. 验证证据

- `sandbox/funding-bindings.test.mjs`：归一化、持久化、重启恢复、跨租户/环境/资产/网络/引用漂移拒绝、幂等和绑定 ID 冲突。
- `sandbox` 完整回归：115/115 通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `packages/typescript-sdk`：generated check、format、lint、typecheck、build、10/10 单元测试通过。

## 5. 恢复与兼容

迁移采用追加 Schema v11，不删除或重写历史 Ledger、Receipt、Transaction 或身份事实。旧 onboarding 文档未配置绑定时仍可启动；新绑定只在显式提供并通过环境与身份校验后生效。回退代码时保留 v11 数据库和备份，旧版本不得静默解释或改写绑定记录。
