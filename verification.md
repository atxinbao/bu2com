# BU2 Product v0.1 验证结论

# 2026-09-09 · F15b 业务负载、停机与财务恢复验收

执行者：Codex
分支：`test/operations-recovery-evidence`

- `node --test sandbox/f15b.test.mjs`：4/4 通过，覆盖有限业务负载与 matched 对账、SQLite 重启无重复结算、Sandbox/Testnet `execution_disabled`、持久业务状态下 Reference Server 优雅停机。
- F15b 仅使用 Local/Simulation；未加载 Signer 或生产凭证，未调用真实 Provider、Base Sepolia、Live/Mainnet、Hosted 或托管能力。
- 后续完整门禁将在提交前执行：Sandbox 全量、契约验证、SDK 生成/格式/Lint/类型/build、Prototype lint/build 与 `git diff --check`。

## 2026-09-09 · F15a 有界内部 Sandbox 执行会话

执行者：Codex
分支：`feat/bounded-sandbox-execution-sessions`

本轮新增持久化 `ExecutionSession`，为内部 Agent 执行提供独立 activation、15 分钟最大窗口、Account/Agent/environment 绑定和会话级支出边界。绑定 PaymentIntent 的支出在预留、结算、取消和 SQLite 重启路径保持可审计；PaymentMandate 仍是业务授权来源。

验证结果：

- `node --test sandbox/f15a.test.mjs sandbox/f15a-http.test.mjs`：4/4 通过。
- `npm --prefix sandbox test`：151/151 通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单元测试通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

边界：F15a 仅支持 Local / 内部 Sandbox-Testnet 契约，不创建 BU2 Task 平台，不启用 Hosted、Live/Mainnet、托管、生产凭证或真实 Provider 付款。ExecutionSession 激活不能替代 PaymentMandate 激活，未知 Provider 结果仍由 F09b 负责。

## 2026-09-09 · F14 Payment / Collection / Refund / Fee Reconciliation

本轮新增不可变 `ProviderFee` 事实和 `ReconciliationRun` 快照。对账按币种汇总 Payment、Collection、Refund 与 Fee，并为每个来源返回 `matched`、`exception` 或 `unknown`；对账不会修改原始交易、收款、退款、钱包或历史 Posting。

当前验证：F14 领域测试 2/2、HTTP 测试 1/1、Sandbox 全量 147/147；SDK/OpenAPI 生成检查、TypeScript 类型/Lint、Prototype lint/build 和本地契约验证均已通过。

边界：F14 仅在 Local / Simulation 验收；真实 Provider、Base Sepolia、Hosted、Live/Mainnet、托管和生产凭证仍保持关闭。

## 2026-09-09 · F13 有界取消与退款恢复

本轮在 Transaction Core 上实现预留态取消、结算后部分/全额退款和 provider-unknown 显式恢复。取消释放 Wallet reserved 与 active Budget Hold；退款使用持久化 `Refund` 资源，不改变已消费 Budget 历史，F14 继续负责对账。

验证结果：F13 定向 5/5（含并发退款）、Sandbox 全量 144/144、SDK 全量 10/10 通过；契约验证、Prototype lint/build 和 diff 检查通过。

边界：F13 不提供真实 Provider 退款，不自动重试 provider-unknown，不实现 F14 财务对账，不启用 Hosted、Live/Mainnet、托管或生产凭证。

## 2026-09-08 · F12 Recoverable Paid Access

执行者：Codex

- `node --test sandbox/f12.test.mjs sandbox/f12-http.test.mjs`：4/4 通过，覆盖已入账 Collection 授权、重复来源、撤销失败关闭、SQLite 重启和 HTTP 列表/恢复。
- `npm --prefix sandbox test`：139/139 通过，包含既有支付、恢复、访问控制、F07～F11 回归。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、TypeScript 类型检查、构建和 10/10 单元测试通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

边界：F12 只从 `posted/verified` Collection 授予 AccessGrant；DeliveryRecord、Receipt、Collection 与 FinancialPosting 保持独立。当前仅使用 Simulation，未执行 Base Sepolia、Hosted、Live/Mainnet 或生产凭证。

结论：本地实现达到 **GO for R2 Domain + Architecture review**；尚未构成真实访问交付、退款、对账或生产资金授权。

## 2026-09-08 · F11 Inbound Collection Verification

执行者：Codex

- `node --test sandbox/f11.test.mjs sandbox/f11-http.test.mjs`：4/4 通过，覆盖一次性 Collection/Posting、金额/引用/付款方失败关闭、SQLite 重启和 HTTP 列表/详情。
- `npm --prefix sandbox test`：135/135 通过，包含既有支付、恢复、访问控制、F07/F08/F09a/F10 回归。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、TypeScript 类型检查、构建和 10/10 单元测试通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

边界：F11 只接受 Adapter 返回的已验证或 pending 入站结果；已验证结果将 Receivable 标记为 `paid` 并追加一对 FinancialPosting，不改变买方钱包、不创建第二套 Transaction Core。当前仅使用 Simulation，未执行 Base Sepolia、Hosted、Live/Mainnet 或生产凭证。

结论：本地实现达到 **GO for R2 Domain + Architecture review**；尚未构成真实收款或生产资金授权。

## 2026-09-08 · F10 Account-Owned Receivable 验证

执行者：Codex

- `node --test sandbox/f10.test.mjs sandbox/f10-http.test.mjs`：4/4 通过，覆盖 Quote 派生金额、Account/Agent/Receiving Target 绑定、幂等冲突、到期窗口、HTTP 列表/详情和 SQLite 重启。
- `npm --prefix sandbox test`：131/131 通过，包含既有支付、恢复、访问控制、重启和 F09a 回归。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、TypeScript 类型检查、构建和 10/10 单元测试通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

边界：F10 只创建 account-owned Receivable，不移动钱包余额、不创建 Transaction、不追加 Financial Posting；F11 入站支付验证与一次性入账、真实 Testnet/Hosted/Mainnet 仍未执行。

结论：本地实现达到 **GO for R2 Domain + Architecture review**；尚未构成 F11 入站收款或真实资金授权。

## 2026-09-08 · F09a 自主支付执行验证

执行者：Codex

- `node --test sandbox/f09a.test.mjs sandbox/f09a-http.test.mjs`：4/4 通过，覆盖已批准 deferred Intent、自主执行、HTTP 端点、幂等重放、review-required 拒绝和 Mandate 暂停失败关闭。
- `npm --prefix sandbox test`：127/127 通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、TypeScript 类型检查、构建和 10/10 单元测试通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

边界：F09a 仅提供已批准 PaymentIntent 的自主执行命令；不绕过人工审批、不启用 Live/Mainnet、Hosted、生产凭证或托管，不实现 Provider 未知结果恢复（留给 F09b）。

结论：本地实现达到 **GO for R2 Domain + Architecture review**；尚未构成合并或真实资金生产授权。

日期：2026-09-01  
执行者：Codex

## 已验证

- 产品战略、用户、PRD、信息架构、策略模型和指标形成完整闭环。
- MVP 明确以虚拟预算、费用归因、策略和审批为范围。
- x402 仅作为受控验证闭环，真实资金托管不在 MVP 范围。
- 需求、对象、状态和验收标准可以支持下一步原型设计。
- AP2 与 x402 已按 P0-P4 阶段拆分；MVP 不依赖任何真实支付协议。
- x402 被限定为单场景沙盒和受控小额验证；AP2 被推迟到多商户、多支付方式的企业授权阶段。
- P0 可点击原型已完成，覆盖总览、项目、Agents、预算、确定性策略、审批和任务账本。
- 原型生产构建已通过，本地 HTTP 冒烟检查返回 200。
- 私有站点版本 1 已保存并启动生产发布；截至本次验证结束，托管平台状态仍为 `publishing`。
- Task-first v0.2 已通过生产构建；默认首页为 Tasks，并支持异常任务下钻和决策状态联动。
- 三种治理模式已在任务列表与详情语义中区分，观察模式不承诺调用前拦截。
- Task-first v0.2 私有生产站点发布成功。
- 浏览器反馈的 5 项一致性问题已修复，中文/英文双语切换和站点图标已加入。
- 本地根页面与图标请求均返回 HTTP 200，修订后生产构建通过。
- 语言切换已修正为全中文/全英文界面；专有标识保持原文，生产构建再次通过。
- 使用真实 Chromium 完成主路径回归：三个任务详情关联、两条异常选择、批准后费用口径和四处数量同步均通过。
- 中文界面未发现不必要的英文 UI 词；英文界面除语言切换按钮“中文”外未检测到中文字符。
- 新浏览器会话控制台错误数为 0，网站图标请求正常。

## Task-first P0 浏览器验收（UT-01～UT-07）

测试日期：2026-09-01  
测试环境：全新 Playwright Chromium 会话，`http://localhost:3000/`

| 用例 | 验收结果 | 得分 |
| --- | --- | ---: |
| UT-01 默认进入 Tasks，异常任务信息可识别 | 通过 | 2/2 |
| UT-02 TASK-2048 任务摘要、时间线、费用和治理记录完整 | 通过 | 2/2 |
| UT-03 强控制、观察模式及任务混合模式口径一致 | 通过 | 2/2 |
| UT-04 两条异常可独立选择并显示各自详情 | 通过 | 2/2 |
| UT-05 批准后实际成本、新增授权和预计最终成本正确拆分 | 通过 | 2/2 |
| UT-06 三个任务详情关联及四处异常数量同步 | 通过 | 2/2 |
| UT-07 全中文/全英文切换与控制台检查 | 通过；英文界面除语言按钮“中文”外无中文残留，控制台 0 error | 2/2 |

总分：**14/14**。原型浏览器回归结论为 **GO**，可以进入 5～8 名目标用户的正式访谈测试。该结论只代表交互和数据口径达到测试准入标准，不代表市场需求已经验证。

## 尚未验证

- 尚未进行真实客户访谈。
- 定价和转化目标仍是产品假设。
- 尚未验证 SDK/MCP 的实际接入耗时。
- 尚未完成合规法律意见和真实支付通道评估。
- Task-first 原型仍使用模拟数据，尚未验证数据库持久化、API 幂等和真实费用接入。

## 结论

Product v0.1 可作为客户访谈、交互原型和工程方案设计的输入；不能视为市场需求已经成立。

## Transaction-first P0 重构验收

日期：2026-09-01  
执行者：Codex

- 默认首页已从 Tasks 改为 Transactions，界面不提供创建任务入口。
- `PAY-8421` 正确展示 payer、payee、买卖双方 Agent、商品、金额和 ChatGPT 外部上下文。
- 首次商户规则正确进入人工授权；授权后待授权数量由 1 变为 0。
- 授权后交易仅进入“资金已预留”，Receipt 仍为空，未错误标记为已结算。
- 确认交付后生成交付证据、结算事件、Receipt ID 和 Ed25519 验证标记。
- 返回 Transactions 后 `PAY-8421` 同步显示为“已结算”。
- Authorizations 授权后显示空队列。
- 英文界面除语言切换按钮“中文”外无中文残留。
- 生产构建通过，真实 Chromium 主路径通过。

结论：Transaction-first P0 可点击闭环为 **GO**；真实 API、资金适配器和持久化尚未实现。

## Agent Payment API Contract v0.1 验证

日期：2026-09-01  
执行者：Codex

- OpenAPI 3.1 YAML 通过系统解析器语法检查。
- Payment flow 示例通过 12 项绑定、金额和状态不变量检查。
- 6 个 MCP 工具名称唯一，输入全部使用封闭对象 Schema。
- 金额统一使用最小货币单位整数和 ISO 4217 币种。
- Quote、PaymentIntent、Transaction、Delivery 和 Receipt ID 绑定关系通过。
- `refunded ≤ settled ≤ reserved ≤ authorized` 金额不变量通过。
- 原型 Developers 页面已加入核心端点、示例载荷和协议能力说明。
- 生产构建和本地 HTTP 200 检查通过。

结论：Contract v0.1 可进入开发者评审和沙盒适配器设计；尚未实现可运行服务端。

## Reference Server v0.1 验证

日期：2026-09-01  
执行者：Codex

- 领域与 HTTP 测试共 7 项，7 项通过，0 失败。
- 实际 HTTP 完成卖方 Quote、买方 PaymentIntent、首次商户人工授权、资金预留、DeliveryEvidence、Settlement 和 Receipt。
- 同一幂等键和相同载荷返回原资源，不重复创建 Quote。
- 同一幂等键配合不同载荷返回 `409 idempotency_conflict`。
- PaymentIntent 无法覆盖 Quote 金额。
- 超过 Mandate 上限的交易直接拒绝且不创建 Transaction。
- 交付前请求结算返回 `409 transaction_not_delivered`，预留资金保持不变。
- 完成交易生成真实 Ed25519 签名，Receipt 验证返回 `valid=true`。
- Reference Server 健康检查返回 200，事件流包含完整 7 个交易事件。

结论（已由 v0.2 取代）：本地 Reference Server v0.1 为 **GO**；当时使用内存和演示资金，进程重启后数据会丢失。

## Reference Server v0.2 验证

日期：2026-09-01  
执行者：Codex

- 自动化测试由 7 项扩展为 11 项，11/11 通过。
- SQLite WAL 数据库保存资源快照、追加账本、幂等记录、钱包、Adapter 操作与 Webhook Outbox。
- 完整交易后重启服务，账本事件仍为 7 条，交易状态仍为 settled。
- 重启后 Receipt `rcpt_89ba954811fb42ed` 验证仍返回 `valid=true`。
- 重启后再次运行相同 Agent 演示，返回原 Transaction 与 Receipt，未产生重复事件或重复资金操作。
- Webhook 对真实 HTTP 接收端第一次 503 后重试成功，两次投递保持相同 `webhook-id`，成功后不再投递。
- 模拟支付 Adapter 对 reserve 和 settle 独立幂等，每种资金操作只生成一个 provider reference。
- API 健康检查报告 SQLite 路径、Adapter 名称和账本事件数量。

结论：Reference Server v0.2 为 **GO**。下一生产化门槛是持久化签名密钥、Webhook 死信与密钥轮换、真实支付沙盒 Adapter 和多进程一致性。

## x402 Sandbox Adapter v0.3 验证

日期：2026-09-01  
执行者：Codex

- 官方 x402 v2 SDK 已生成真实 HTTP 402 `PAYMENT-REQUIRED` 挑战。
- 挑战要求为 `exact`、Base Sepolia、测试网 USDC、0.01 USD。
- 公开 facilitator 实时能力查询确认支持 v2 exact `eip155:84532`。
- Adapter 对网络、币种和 atomic amount 进行一致性校验，重复 reserve 不产生重复 provider operation。
- 无签名钱包时 settlement 返回 `x402_signer_unavailable`，不会写入 settled 操作。
- 自动化测试共 20 项，20/20 通过。
- BU2 授权、预留和结算入口已支持异步 Adapter；通道失败可安全重试且不污染账本。
- `BU2_PAYMENT_ADAPTER=x402` 显式模式已通过服务启动测试，默认模式仍为 simulated。

阶段性结论：协议接入和本地商户先行通过；当时真实结算因测试钱包余额为 0 暂缓。该阻塞已在下方最终复测中解除。默认 3100 服务继续使用 SimulatedPaymentAdapter，3101 服务显式使用 x402 Adapter。

最终补充：用户领取 10 Base Sepolia USDC 后，真实 paid probe 与完整 BU2 Agent x402 支付均成功。链上交易 `0xbaad90f8c6c8cf121d4913bdadf162dd2831a69be5d106a911655d62d3208b08` 状态为 success，BU2 Receipt `rcpt_7c0ac5450f4b4e39` 验证为 `valid=true`。x402 测试网闭环结论升级为 **GO**。

产品页面补充：localhost:3000 已从静态演示升级为“真实 API + 演示回退”。Playwright 确认真实 x402 交易出现在列表首位，详情页展示链上交易与有效 Receipt，中英文切换正常，控制台 0 error。结论为 **GO**。
# docs/README 当前目录对齐验证

补充验证：已同步移除根目录 README 和 `GOVERNANCE.html` 对已删除治理中心的依赖；所有现存链接与内部锚点有效，移动端浏览器控制台无错误。

日期：2026-09-01  
执行者：Codex

- `docs/README.md` 仅列出当前存在的 `01-business-plan`、`02-product` 与 `03-technical`。
- 35 个相对链接全部解析成功，无失效目标。
- Transaction-first 当前基线与 Task-first 历史文件已明确分区。
- `INTERACTION_SPEC.md` 已标记为待按 Transaction-first 重写，不作为当前验收依据。
- 技术索引覆盖契约、OpenAPI、MCP、示例、验证脚本、持久化/Webhook 与 x402 证据。
- Contract 验证、Sandbox 20/20 与 Prototype 生产构建均通过。

结论：本次文档索引修订为 **GO**；未对产品逻辑、交易状态或资金行为作出修改。

## Phase 0 Epic 1 冻结验证

日期：2026-09-05
执行者：Codex

- Epic：`External Agent Transaction Integration & Reliability`。
- 风险等级：R2；本轮只冻结实施范围，不改变交易状态、金额、数据库或支付通道行为。
- 范围：Transaction API v1、Webhook 死信/重放/Secret 轮换、交易可观测性、x402 Testnet 失败回归、外部 Agent 接入样例。
- 边界：Mainnet、真实资金托管、法币、提现、换汇、跨链和第二支付通道不在范围内。
- 文档链接：根 README 24/24、docs README 35/35、技术 README 10/10 有效。
- 契约验证：12 项不变量、6 个 MCP 工具通过。
- Sandbox：20/20 通过，0 失败。
- Prototype：lint 0 error，生产 build 通过。
- 格式：`git diff --check` 通过。

结论：Epic 1 定义达到 **Ready**，可以从 E1.0 Transaction API v1 契约冻结开始实施；不构成 Mainnet 或生产资金执行授权。

## Phase 0 Epic 2 冻结验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #8 已合并，Epic 1 的 E1.0–E1.4 已满足完成门槛并标记 Done。
- Epic：`Developer Integration Scale`。
- 风险等级：R2；本轮只冻结外部交易接入边界，不改变金额、状态机、账本、数据库、Webhook、Adapter 或 Receipt 行为。
- 顺序：E2.1 TypeScript SDK、E2.2 MCP 分发、E2.3 接入诊断与最小分析、E2.4 HTTP/SDK/MCP 三路径 clean-room 证据。
- 唯一语义来源：Agent Payment API v1；SDK 与 MCP 只能作为薄客户端，不拥有交易状态。
- 边界：Python SDK、公开 npm 发布、远程 MCP、生产 API Key、Mainnet、托管和第二支付通道不在范围内。
- 恢复：任一接入层失败可退回现有 HTTP API，不修改历史交易；兼容无法保持时停止并提新版本，而非隐藏差异。
- 契约：`node docs/03-technical/validate-contract.mjs` 通过，29 项不变量、6 个 MCP 工具有效。
- Sandbox：`npm --prefix sandbox test` 通过，44/44，0 失败。
- Prototype：`npm --prefix prototype run lint` 通过，0 error；`npm --prefix prototype run build` 通过。
- 文档：5 个变更相关 Markdown 入口共 77 个本地链接有效。
- 格式与凭证：`git diff --check` 通过；新增行未发现凭证样式值。

结论：Epic 2 已定义目标、非目标、Owner、接口与兼容规则、测试、验收和恢复方案，并通过本地门禁，达到 **Ready**。下一实现项为 E2.1 TypeScript SDK v0.1；不构成公开包发布、Mainnet 或生产资金执行授权。

## TypeScript SDK v0.1 E2.1 验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #9 已合并，Epic 2 范围达到 Ready；本地已同步 `main` 并删除已合并分支。
- 包：`@bu2/sdk` v0.1.0，保持 `private: true`，未发布到 npm registry。
- 标准化依赖：`openapi-typescript` 7.13.0 从冻结 OpenAPI 生成类型，`openapi-fetch` 0.17.0 提供 typed fetch；TypeScript 5.9.3 与现有项目基线一致。
- 契约漂移：`npm --prefix packages/typescript-sdk run check:generated` 通过，生成类型与 `openapi.yaml` 一致。
- 类型：严格 `tsc` 通过；写操作缺少显式幂等键、Mainnet 环境均在类型测试中被拒绝。
- SDK 专项：8/8 通过，覆盖完整 Simulation 交易、PaymentIntent 查询、Receipt 验证、幂等重放/冲突、无效输入、settlement recovery、网络失败、超时和 5xx。
- 失败恢复：SDK 没有自动重试；读取失败为 `retry_safe`，写入未知结果为 `query_before_retry`，服务端关联 ID 与稳定错误字段不丢失。
- 包结构：`npm pack --dry-run --json` 通过，22 个文件、约 16.9 KB；只包含 README、构建输出和 package metadata。
- 首轮测试失败：断言混淆 `type=idempotency_conflict` 与 `code=idempotency_key_reused`；修正测试后通过，未改变 API 行为。
- 全项目门禁：Contract 29 项与 MCP 6/6、Sandbox 44/44、Prototype lint 与 build 全部通过。
- SDK 质量门禁：生成漂移、oxfmt、oxlint、严格类型、build 和 8/8 单元/HTTP 集成全部通过。
- UI 浏览器回归未执行；本变更不修改 Prototype UI，生产 build 作为本轮前端回归证据。

结论：E2.1 实现满足冻结范围并通过全项目 R2 本地验证，已经 PR #10 人工合并；不构成公开包发布、生产凭证、Mainnet 或托管授权。

## MCP 分发与 Host 配置 E2.2 验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #10 已合并，本地 `main` 已同步到 merge commit `d4fd32b`，已合并 E2.1 分支已删除。
- 稳定入口：`sandbox/bin/bu2-mcp.mjs` 可输出静态 metadata、执行 endpoint preflight 或启动 stdio；`sandbox/package.json` 通过 `bin` 与 `npm run mcp` 指向同一入口。
- 唯一工具契约：原有 6 个工具继续从 `mcp-tools.json` 注册，没有复制 Schema 或新增授权、结算工具。
- 版本清单：`contract-versions.json` 将 OpenAPI `0.1.3`、`/v1` 与 MCP `0.1.0` 关联，契约验证自动检查三者一致。
- API preflight：启动前验证 Reference Server、API contract、base path、`simulation`/`testnet` 环境和兼容 MCP contract；不兼容时 stdout 保持为空并返回稳定恢复错误。
- MCP initialize：标准 `serverInfo` 和 `capabilities.experimental["com.bu2.agent-payments"]` 返回 API/MCP version、contract SHA-256、环境、工具数量、无自动 mutation retry、无 Agent 授权/结算工具边界。
- Host 配置：Codex TOML、Claude Desktop JSON 与通用 JSON 均指向稳定入口；JSON 配置已由测试解析。当前机器未安装 `claude` CLI，因此未执行 Claude 客户端真实注册；命令和 JSON 字段已按官方 Host 文档对齐。
- E2.2 专项：8/8 通过，覆盖 metadata、真实 endpoint preflight、真实 stdio initialize 与握手拒绝、API/环境/MCP contract 错配、Mainnet 拒绝和 Host 配置解析。
- 契约：32 项不变量与 6/6 MCP 工具通过。
- Sandbox：52/52 通过，包含既有交易、幂等、并发、持久化、Webhook、x402、Receipt 与新增 MCP 分发回归。
- TypeScript SDK：生成漂移、格式、lint、严格类型、build 和 8/8 测试通过。
- Prototype：lint 与生产 build 通过；本轮无 UI 变更，未运行浏览器回归。

结论：E2.2 满足冻结范围并通过 R2 本地验证，已经 PR #11 人工合并；不构成远程 MCP 托管、公开包发布、生产凭证、Mainnet 或托管授权。

## 接入诊断与最小分析 E2.3 验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #11 已合并，本地 `main` 已同步到 merge commit `f9a20ab`，已合并 E2.2 分支已删除。
- 稳定入口：`sandbox/bin/bu2-doctor.mjs`、package `bin` 与 `npm run doctor` 指向同一 CLI；默认输出中文，也支持 `--language en` 全英文和 `--format json` 机器结果。
- 固定阶段：Node runtime、configuration、endpoint、environment、contract、真实 MCP stdio startup 与 Receipt verification 共 7 阶段；失败后后续检查明确标记 `blocked`。
- Receipt 语义：未提供 ID 时只验证 `bu2_verify_receipt` 工具存在并报告 `capability_available`；显式提供 Receipt ID 且服务端返回 `valid=true` 后才报告 `verified`。
- 机器契约：`doctor-result.schema.json` v0.1.0 禁止未知字段，固定检查顺序、结果类别、失败恢复和最小分析边界；版本进入 `contract-versions.json` 和自动契约校验。
- 失败恢复：稳定输出错误码、`retry_safe` / `retry_after_fix` / `query_before_retry`、恢复代码以及合法 request/trace ID；人类提示由固定文案生成，不回显原始异常。
- 数据边界：最小分析仅包含阶段、耗时、结果类别和错误码；固定 remote disabled、upload not attempted、persistence none、process lifetime，不存在远程删除动作。
- Doctor 专项：12/12 通过，覆盖真实 endpoint、真实 MCP initialize、真实 Receipt 验证、Node/Mainnet/endpoint/environment/contract/tool 漂移故障注入、Schema、敏感值不泄漏和中英双语。
- 契约：35 项不变量与 6/6 MCP 工具通过。
- Sandbox：64/64 通过，包含既有交易、幂等、并发、持久化、Webhook、x402、Receipt、MCP 分发与新增 doctor 回归。
- TypeScript SDK：生成漂移、格式、lint、严格类型、build 和 8/8 测试通过。
- Prototype：lint 与生产 build 通过；本轮无 UI 变更，未运行浏览器回归。

结论：E2.3 满足冻结范围并通过 R2 本地验证，已经 PR #12 人工合并；不构成远程遥测、公开分发、生产凭证、Mainnet 或托管授权。

## 外部 clean-room 接入证据 E2.4 验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #12 已合并，本地 `main` 已同步到 merge commit `6780921`，已合并 E2.3 分支已删除。
- 三个项目：验收器分别创建 HTTP、SDK 与 MCP 三个空系统临时目录，为每个项目写入独立 `package.json` 和客户端入口，并在结束后递归删除临时目录。
- 环境隔离：每条路径使用独立 `:memory:` SQLite Simulation Reference Server，不共享交易、策略、钱包或 Receipt 状态。
- HTTP：只使用 Node.js 原生 `fetch`，101ms 完成交易，Receipt `rcpt_0b8c4ada737e4e2a` 且 `valid=true`。
- SDK：构建后将 `@bu2/sdk` 打为临时 npm tarball，由全新项目安装并通过包名导入；1472ms 完成交易，Receipt `rcpt_d5d04ae5e0d14ea6` 且 `valid=true`。
- MCP：全新项目只安装官方 `@modelcontextprotocol/client@2.0.0`，通过稳定 `sandbox/bin/bu2-mcp.mjs` stdio 入口完成 initialize、6 工具检查和交易；609ms 完成，Receipt `rcpt_52eb5bd9cc4d4825` 且 `valid=true`。
- 完整性：三条路径均从空目录开始，相关 BU2 源码执行前后 SHA-256 一致，且低于 900000ms 上限。
- 失败恢复：最终验收 0 失败；Schema 支持记录失败阶段、稳定错误码和固定恢复动作，失败路径不会自动重放资金 mutation。
- 机器契约：`clean-room-evidence.schema.json` v0.1.0 固定三路径、Simulation、15 分钟、Receipt、源码完整性、失败/恢复与零远程遥测字段。
- Clean-room 专项：4/4 通过，覆盖三路径成功门槛、Schema 成功/失败结果、依赖边界和 Mainnet/遥测/源码 mutation 禁区。
- 契约：39 项不变量与 6/6 MCP 工具通过。
- Sandbox：68/68 通过，包含既有交易、幂等、并发、持久化、Webhook、x402、Receipt、MCP、doctor 与新增 clean-room 回归。
- TypeScript SDK：生成漂移、格式、lint、严格类型、build 和 8/8 测试通过；npm tarball 22 个文件且不包含源码外数据。
- Prototype：lint 与生产 build 通过；本轮无 UI 变化，因此未运行浏览器回归。
- 文档与凭证：10 份关联 Markdown 的 145 个本地链接通过；变更内容敏感信息扫描与 `git diff --check` 通过。
- 未执行：未运行 funded Base Sepolia；本轮不修改 x402 Adapter、签名、结算或支付通道，只证明 Local Simulation 接入。

结论：E2.4 满足冻结范围并完成 3/3 clean-room 本地验收，达到 **GO for R2 review**。只有本 PR 经 Project Owner 人工审查并合并后，Epic 2 才能标记 Done；结果不构成公开 npm 发布、远程 MCP 托管、Production、Mainnet、真实资金或托管授权。

## Phase 0 Epic 3 范围冻结验证

日期：2026-09-06
执行者：Codex

- 前置状态：PR #13 已合并，merge commit 为 `06043ffb74994678fa0b2fbe66ae6f40b8754736`；Epic 2 的 E2.1–E2.4 均已完成人工审查与合并，状态更新为 Done。
- Epic：`External Pilot Readiness & Evidence`。
- 本次风险等级：R0；仅关闭 Epic 2 状态并冻结下一 Epic，不修改代码、API、事件、Schema、金额、状态机、账本、数据库、Webhook、Adapter、Receipt 或支付通道。
- 顺序：E3.1 Pilot Manifest 与本地启动门槛、E3.2 最小 Pilot Evidence 与显式共享、E3.3 失败处置与支持包、E3.4 三团队外部试点与阶段决策。
- 产品边界：用户继续在 ChatGPT、Codex、Claude 或自建 Agent 中创建和运行任务；BU2 只处理收付闭环，不建设 BU2 Task 工作台或通用 Agent Runtime。
- 证据边界：自动 clean-room 只作为工具前置证明，不能替代至少 3 个真实外部团队的接入耗时、人工协助、失败和价值反馈。
- 阶段边界：项目仍处于 Phase 0 Simulation/Testnet；本次冻结不构成 Phase 1、公开 npm、远程 MCP、生产 API Key、Mainnet、真实资金、托管或生产部署授权。
- 恢复：可以移除 Epic 3 入口并恢复 Epic 2 后续门槛；无代码回滚、数据迁移、外部分发或交易历史恢复。
- 本地验证：相关 Markdown 链接、HTML 结构、`git diff --check` 与新增行敏感信息扫描已执行，结果见本次提交前检查。

结论：Epic 3 已定义目标、非目标、Owner、外部用户闭环、证据字段、指标、失败、恢复和完成门槛，达到 **Ready**。下一实现项为 E3.1 Pilot Manifest 与本地启动门槛；任何真实外部试点结果和阶段升级仍需独立人工证据与批准。

## Phase 0 开发准入结论

日期：2026-09-01
执行者：Codex

- 版本库：根目录单一 Monorepo 已建立，Prototype 由根仓库统一追踪；远程功能分支与 PR 已存在。
- 质量基线：Prototype lint 由 19 个错误清零，生产构建通过。
- 文档基线：Product、Technical、Interaction Spec、根 README 与 x402 当前状态已统一为 Transaction-first。
- 自动化验证：API 契约 12/12、MCP 工具 6/6、Sandbox 20/20。
- 浏览器验证：真实 x402 交易列表与详情、中英文切换、Receipt 与链上证据均通过，控制台 0 error。

结论：**Phase 0 Development GO**。该 GO 仅覆盖 Simulation 与 Base Sepolia Testnet；Mainnet、真实资金托管和生产密钥仍为 **NO-GO**。
# 金融业务 PR 模板验证

日期：2026-09-01
执行者：Codex

- GitHub 默认 PR 模板路径有效。
- 风险等级、金融不变量、权限与秘密、Schema 迁移、失败恢复、测试证据、运营发布、人工批准及 Changelog 对齐均已覆盖。
- R2 明确要求独立人类审查；当前单人治理阶段的 R3 由 Project Owner 明确批准。生产执行可以推进，但必须具备独立、限定范围的 Owner 授权并符合 `PROJECT.html` 阶段准入门槛。
- 模板静态检查、Contract、Sandbox、Prototype lint 与构建全部通过。

结论：PR 模板为 **GO**。
# README 重构与单人 R3 治理验证

日期：2026-09-01
执行者：Codex

- 根目录 README 已按定位、状态、交易闭环、能力、快速启动、仓库结构、开发规则和边界重新组织。
- 23 个文档链接全部有效，README 中的本地启动命令已使用独立临时数据库真实验证。
- 演示交易完成 Quote → PaymentIntent → Authorization → Reserve → Delivery → Settlement → Receipt，签名验证为 `valid=true`。
- 当前单人治理阶段允许 Project Owner 明确批准 R3；双人复核与单人禁止执行条款均不存在。
- R3 生产授权必须限定环境、目标、范围、窗口、停止条件和恢复方式，并符合 `PROJECT.html` 阶段门槛。
- Contract 12 项、Sandbox 20/20、Prototype lint 与 build 全部通过。

结论：本次 README 与治理变更为 **GO**，可以提交 PR。

## E1.2 交易链路可观测性验证

日期：2026-09-05
执行者：Codex

- `request_id`、`trace_id`、`transaction_id`、`event_id` 与 provider reference 已贯穿 HTTP、Transaction Core、LedgerEvent、Adapter、Outbox 和 Webhook 投递审计。
- 并发请求使用 AsyncLocalStorage 隔离上下文；调用方 Trace 可传入，省略时自动生成，非法 Trace 返回稳定 `400 invalid_trace_id`。
- `/health` 返回 pending、delivering、retrying、dead-letter、delivered、最近成功投递和 Adapter 未知结果计数。
- 单行 JSON 事件区分 request、validation、policy、state、adapter、unknown_result、webhook 与 internal，敏感字段和值写出前脱敏。
- SQLite schema v3 为 additive migration；旧 Outbox 记录升级后关联列为 `null`，历史数据仍可读。
- 新增告警与处置手册，覆盖死信、Adapter 结果未知和 Receipt 验证失败；未接线外部生产告警系统。
- `npm --prefix sandbox test`：32/32 通过，包括观测输出通道失败不影响交易执行。

结论：E1.2 本地实现达到 **GO for R2 review**。它不改变交易金额、状态机或既有资金动作，不构成 Mainnet、托管或生产运行授权。

## E1.0 Transaction API v1 冻结验证

日期：2026-09-05
执行者：Codex

- `/v1` 资源与行为契约标记为 `phase0-frozen`，OpenAPI、MCP、HTTP 实现和 Developers 页面已对齐。
- `GET /v1/transactions` 返回稳定的 cursor 分页结构；旧有 `data` 字段保持不变。
- 所有 HTTP 响应携带 `X-Request-Id`，错误体 `request_id` 与响应头一致。
- AJV 在 HTTP 边界拒绝未知字段、非法资源 ID、非法幂等键、无效 cursor、错误媒体类型和超过 1 MiB 的 JSON 请求体。
- Contract 19 项不变量、6 个 MCP 工具通过；Sandbox 21/21 通过。
- OpenAPI YAML 可解析，Redocly 判定 API description 有效；仅缺少 license 字段 warning，未在无项目 LICENSE 的情况下擅自声明许可证。
- Prototype lint 0 error，生产 build 通过。
- Playwright 在桌面与 390×844 移动端完成中文/英文 Developers 页面、实时 API 数据和控制台验证；0 error、0 warning。
- 浏览器验证同时修复了 Simulated Adapter 数据被误标为 x402 的展示口径。

结论：E1.0 为 **GO**。本结论冻结 Phase 0 Transaction API v1，但不开放 Mainnet、托管、生产密钥或公开无认证部署；下一顺序项为 E1.1 Webhook 死信、审计重放与 Secret 轮换。

## E1.1 Webhook 可靠性闭环验证

日期：2026-09-05
执行者：Codex

- Reference Sandbox 已升级为 v0.5.0；旧 SQLite 订阅与 Outbox 通过 additive migration 恢复。
- Worker 以事务和有限租约领取 Outbox；两个并发 Dispatcher 对同一事件只投递一次，重启后过期租约可被回收。
- HTTP 5xx、网络异常和接收方超时进入有限指数退避；达到最大次数后进入 `dead_letter`，不再无限重试。
- 死信可通过幂等 API 单事件重放；重放保留原 `event_id` 与载荷，产生独立审计记录，不增加或改写 `LedgerEvent`。
- Secret 轮换支持显式版本与有限重叠窗口；重叠期间新旧 HMAC 均通过精确签名断言，窗口结束后只使用当前版本。
- 创建订阅、Secret 轮换与重放均验证同键同载荷返回原结果、同键异载荷返回冲突；公开 API 和审计结果不包含明文 Secret。
- Contract 24 项不变量、6 个 MCP 工具通过；Sandbox 28/28 通过。
- OpenAPI YAML 解析和 Redocly 校验通过；仅保留仓库既有的缺少 license 字段 warning。
- Prototype lint 0 error，Vinext 五阶段生产构建通过；`git diff --check` 通过。

结论：E1.1 为 **GO**，可以提交 R2 PR 供 Project Owner 审查。本结论只覆盖本地 Simulation 与 Base Sepolia Testnet 事件投递可靠性；不开放 Mainnet、托管、生产 Secret 或多节点生产部署。下一顺序项为 E1.2 交易链路可观测性。

## E1.3 x402 Testnet 失败恢复验证

日期：2026-09-06
执行者：Codex

- Reference Sandbox 升级为 v0.7.0；SQLite schema v4 只追加 Adapter operation 恢复字段与 `adapter_recovery_attempts` 审计表。
- x402 challenge 分别校验 exact scheme、Base Sepolia network、指定 USDC asset 与 BU2 授权 amount，错误码稳定且不写入 reserve operation。
- facilitator timeout、5xx、响应缺失、响应不可解析和 response network 异常进入 `provider_unknown`；普通 settlement 重放被阻断，不再次执行 `paidFetch`。
- 未知结果与恢复查询跨进程重启持久化；查询未决时 Transaction 保持 `delivery_submitted`、钱包保持 reserved、Receipt 为 null。
- Provider 查询明确返回 settled 后，Adapter operation 与恢复审计在 SQLite 事务中收口，核心复用正常结算路径，只签发一张可验证 Receipt。
- `POST /v1/transactions/{id}/settlement_recoveries` 使用闭合请求体和 `Idempotency-Key`；同键重放不重复查询。
- 官方 x402 v2.24.0 SDK 没有按 BU2 transaction id 查询结果的通用接口，故恢复使用显式注入的 provider-specific callback；未配置时保持未知，不伪造链上结论。
- 本轮验证命令和最终计数记录于 `.codex/testing.md`；未使用 Mainnet、生产密钥或托管资金。

结论：E1.3 本地实现达到 **GO for R2 review**。结果未知时不会自动重复付款、释放内部预留或提前签发 Receipt；下一顺序项为 E1.4 首个外部 Agent 接入样例，但应在本 PR 经 Project Owner 审查合并后开始。

## E1.4 外部 Buyer / Seller Agent 接入样例验证

日期：2026-09-06
执行者：Codex

- Reference Sandbox 升级为 v0.8.0；没有数据库迁移、API 破坏性变化或新的交易状态。
- 标准 stdio MCP Server 基于官方 `@modelcontextprotocol/server@2.0.0`，直接从冻结的 `mcp-tools.json` 注册 6 个工具。
- MCP 工具只映射现有 `/v1` API；不导入领域对象、不直接写 SQLite，Transaction Core 仍是唯一交易状态所有者。
- Seller Agent 通过 MCP 创建 Quote 和提交 DeliveryEvidence；Buyer Agent 通过 MCP 创建 PaymentIntent、查询状态并读取/验证 Receipt。
- 首次收款方的人工授权与交付后的 BU2 结算保留在 HTTP 控制面；Agent 不获得自批授权或直接结算能力。
- 单命令隔离 Simulation 从空运行环境完成完整闭环，实测 237ms；自动化门禁要求小于 15 分钟。
- Contract 29 项不变量、MCP 6/6、Sandbox 44/44、Prototype lint/build、OpenAPI、依赖审计和文档链接全部通过。

结论：E1.4 本地实现达到 **GO for R2 review**。E1.0–E1.4 已完成本地实现，但 Epic 1 只有在 Project Owner 完成人工审查并合并后才能标记 Done；Mainnet、托管与生产执行仍为 NO-GO。

## Transaction Trust Gate 2 验证

日期：2026-09-06
执行者：Codex

- Reference Sandbox 升级为 v0.10.0；公开 Agent Payment API v0.1.4 与 MCP v0.1.0 保持不变。
- SQLite Schema v6 只追加 `idempotency_claims`、`wallet_accounts` 和 `state_revision`，旧幂等成功结果和钱包状态可回填，历史交易不删除、不改写。
- 所有领域写入口使用数据库 `processing` Claim；同键同载荷并发共享一个结果，同键异载荷拒绝，重启遗留 Claim 返回 `idempotency_outcome_unknown` 且不重新执行。
- 钱包 available/reserved 使用非负 CHECK、期望余额和版本条件更新；全局状态版本 CAS 阻止陈旧进程静默覆盖新快照。
- Quote、PaymentIntent、Authorization、Delivery、Settlement 与 Recovery 的资源、钱包、LedgerEvent、Webhook Outbox 和幂等成功终态在同一事务提交。
- 故障注入证明 Outbox 写入后失败会回滚资源、钱包、事件、Outbox 与幂等终态；失败后 Transaction Core 从数据库恢复已提交事实。
- Gate 2 专项 8/8、Sandbox 78/78、Contract 42 项与 MCP 6/6、SDK 8/8、clean-room 3/3、Prototype lint/build 全部通过。
- UI 浏览器回归未执行，因为本轮没有修改 Prototype 或公开响应结构；Trust Gate 总验收仍保留浏览器回归门槛。

结论：Gate 2 本地实现达到 **GO for R2 review**。Adapter 的外部调用前 Payment Attempt 与授权条款仍属于 Gate 3；Epic 3、Mainnet、真实资金与托管继续 NO-GO。

## Transaction Trust Gate 3 验证

日期：2026-09-06
执行者：Codex

- Reference Sandbox 升级为 v0.11.0；公开 Agent Payment API、事件、Receipt、TypeScript SDK 与 MCP 契约保持不变。
- SQLite Schema v7 纯追加 `x402_authorizations` 与 `payment_attempts`；完整预检条款使用 RFC 8785 JCS 和 SHA-256 指纹保存，并关联 PaymentIntent、Quote、Authorization、PaymentMandate 与 Payee Account。
- 正式钱包路径使用官方 x402 v2.24.0 Client 的 `onBeforePaymentCreation` hook；amount、asset、network、resource 或 `payTo` 在预检后发生变化时，签名前失败关闭且不发送支付请求。
- Adapter operation 与 Payment Attempt 在 Provider 调用前同事务写入；签名前进入 submitting，确定成功、未知和拒绝同步更新。
- prepared/submitting/provider_unknown 在重启后均阻断普通 Settlement，只能查询或对账；恢复不会调用 `paidFetch` 或创建第二个 Attempt。
- 确定成功响应缺少真实 Provider 引用时保持 unknown，不再用本地散列替代结算证据。
- x402 专项 25/25、Sandbox 88/88、Contract 42 项与 MCP 6 个、SDK 8/8、clean-room 3/3、Prototype lint/build 全部通过。
- Playwright CLI 使用 Google Chrome 验证 `http://localhost:3000/`：真实 API 的 funds_reserved 交易未显示虚构 Receipt；中英文、桌面与 390×844 移动视口通过；当前回归会话控制台 0 error、0 warning。该浏览器证据连接本地 Simulation API，不是链上结算证明。

结论：Gate 3 本地实现达到 **GO for R2 review**。必须经独立人工审查并合并后，Transaction Trust Gate 才可标记完成并进入 Epic 3；Mainnet、真实资金、托管和生产密钥仍为 NO-GO。

## F01 / ENV-01 系统环境决策冻结验证

日期：2026-09-06
执行者：Codex

- 输入文档：`BU2_SYSTEM_ENVIRONMENTS_V1_1.md` 与 `BU2_F01_ENV01_PR_BRIEF_V1_1.md`；两份输入均按建议实施基线处理，不作为已经部署或已经验收的事实。
- 当前基线：PR #17 已合并，Transaction Trust Gate 1–3 均为 Done；输入文档中的 Gate 3 pending 状态已按当前 `main` 修正。
- 决策：对外服务环境只允许 `sandbox/live`，内部本地执行环境为 `local`；`simulated/x402` 是执行后端，环境值不构成资金许可。
- 网络：Sandbox 固定 Base Sepolia `eip155:84532`；Live 固定 Base Mainnet `eip155:8453` 且初始 `execution_disabled`。Base/Circle 官方资料已于本轮重新核对。
- 交付：新增系统环境契约 v1、ADR-0001 与 E-T01–E-T16 环境验收矩阵，并对齐 PROJECT、ARCHITECTURE、GOVERNANCE、AGENTS、README、Epic 3、Trust Gate、技术索引、PR 模板与 Changelog。
- Epic 3：正式外部试点证据升级为托管 Sandbox 的真实 Base Sepolia 双向收付；Local Simulation 只作为工具与故障测试证据。
- 兼容：不修改 API、SDK、MCP、Doctor、数据库或 Receipt；legacy `simulation/testnet` 保留，ENV-02/03 采用分步迁移并保留旧 Receipt 原始签名语义。
- 静态验证：89 个本地 Markdown 链接有效，PROJECT/ARCHITECTURE/GOVERNANCE/CHANGELOG 均可解析，环境决策断言与 `git diff --check` 通过，变更内容未发现秘密样式值。
- 全项目门禁：Contract 42 项不变量与 MCP 6/6、Reference Server 88/88、TypeScript SDK 8/8、HTTP/SDK/MCP clean-room 3/3、Prototype lint 与 Vinext build 全部通过。
- 浏览器：Playwright CLI 使用 Google Chrome 验证 PROJECT、ARCHITECTURE、GOVERNANCE 的桌面渲染及 PROJECT 390×844 移动视口；新环境章节、版本和治理警告可见，控制台 0 error、0 warning。
- 未执行：没有创建 DNS、云资源或部署，没有修改运行时环境枚举，没有执行 Base Sepolia 或 Mainnet 支付，没有加载钱包或生产凭证。

结论：F01/ENV-01 达到 **GO for R2 review**。它冻结的是目标环境与迁移契约，不代表 ENV-02/03 已实现，也不构成 Live/Mainnet 执行授权。下一实现项为 ENV-02 环境注册表与链隔离。

## ENV-02 环境注册表与链隔离验证

日期：2026-09-06
执行者：Codex

- 基线：PR #18 已合并；本地 `main` 已快进至合并提交后创建独立 ENV-02 分支。
- Reference Server 升级为 v0.12.0；公开 Agent Payment API、事件、SDK、MCP、Doctor 与 Receipt v0.2 契约均保持不变。
- 环境注册表只允许 `local + simulated`、`sandbox + x402 + eip155:84532`、`live + x402 + eip155:8453`；Sandbox 和 Live 默认 `execution_disabled`，Live 在本阶段不能配置为 enabled。
- SQLite Schema v8 纯新增不可变 `environment_metadata`；新库首次绑定，错环境数据库在后续 migration 前拒绝，无 metadata 的旧库必须显式一次性认领。
- 配置在数据库、Signer 与 Provider 构造前验证；RPC、asset、Provider network/scheme 和 Signer environment 任一冲突均失败关闭。
- x402 Adapter 在 reserve/settle 边界检查 execution status；E-T09 证明禁用状态下 merchant 和 signer 调用均为 0，恢复查询仍不创建第二笔付款。
- ENV-02 专项 7/7、最终 Reference Server 95/95、Contract 42 项与 MCP 6 个、TypeScript SDK 8/8、HTTP/SDK/MCP clean-room 3/3 全部通过。
- Prototype `npm run lint` 与 Vinext 五阶段 production build 通过。
- 文档检查：185 个 Markdown 相对链接、27 个 HTML 相对链接/锚点、4 个 HTML 文件解析、本轮新增内容秘密样式扫描和 `git diff --check` 全部通过；全文件扫描只命中既有链上交易哈希，复核后按新增行扫描为 0 hit。
- 浏览器：Playwright CLI 使用 Google Chrome 验证 PROJECT、GOVERNANCE 桌面页面和 PROJECT 移动视口；ENV-02 状态、环境边界与 Live disabled 可见，控制台 0 error、0 warning。
- Graphify：代码图增量更新至 2153 nodes / 3295 edges；文档语义增量因当前未配置 Gemini backend 未重新抽取，不影响源文档与代码验证。
- 未执行：没有 Base Sepolia 或 Mainnet 支付，没有加载生产密钥，没有部署、DNS、云资源、托管或资金迁移。

结论：ENV-02 本地实现达到 **GO for R2 review**。E-T01/02/03 已在本范围通过；E-T06/07/09 只关闭 ENV-02 子范围，部署恢复与受限 Live E2E 仍分别属于 ENV-04/06/08。ENV-02 合并后下一项为 ENV-03，Mainnet 与真实资金继续 NO-GO。

## ENV-03 客户端与 Receipt 环境契约验证

日期：2026-09-06
执行者：Codex

- 基线：PR #19 已合并；本地 `main` 快进至 `2353e9501a51ff94cf8b48313ef288a21df586a8` 后删除 ENV-02 本地分支，并创建 `feat/env03-environment-contract-migration`。
- 唯一契约：新增 `environment-contract.json` v1.0；运行时、SDK 生成器和 MCP 共享 `local/sandbox/live`、Base chain/network、Adapter 与默认执行状态。
- API：Agent Payment API 升至 v0.2.0，Reference Server 升至 v0.13.0；`GET /v1/environment` 返回环境、链、后端、版本、execution status、公开能力和 Receipt issuer。公开 `/health` 不再返回数据库路径、账本数量或内部 Outbox/Adapter 统计。
- 客户端：`@bu2/sdk` 与 MCP contract 升至 v0.2.0，Doctor/clean-room result 升至 v0.2.0；新客户端只接受 `sandbox/live`，本地模拟必须显式 `local + localDevelopment`。SDK/MCP 在 mutation 前验证 endpoint、环境、链、后端、契约、issuer 和 execution status，错误或禁用时 mutation 0 次；Settlement recovery 保持只查询、不重付。
- Receipt：新签发版本为 v0.3，签名覆盖 environment contract、environment、execution backend、chain/network 和 issuer ID；验证独立区分 signature、issuer、settlement 与 environment。静态 v0.2 Simulation fixture 没有私钥，原始签名字节由独立 schema registry 验证，篡改拒绝；legacy testnet 缺少 Base Sepolia channel/provider 证据时保持 unknown。
- E-T04：endpoint、SDK、MCP 与 Receipt 的跨环境拒绝已通过；仓库尚无正式 API key 和结构化 PaymentMandate 对象，因此这两项明确留 ENV-05 与 F02/F03，不宣称关闭整个 E-T04。
- E-T05：历史 Receipt v0.2 原字段、原 canonicalization 和原签名验证通过；不重写、不重签。
- E-T16：公开 health 的 ENV-03 子范围通过；支持包权限仍留 ENV-05。
- 自动化：Contract 47 项不变量与 6 个 MCP 工具通过；Reference Server 100/100；TypeScript SDK 生成漂移、格式、lint、类型、build 与 9/9；Prototype lint 与 Vinext 五阶段 production build 通过。
- Clean-room：HTTP / SDK tarball / MCP stdio 三个全新临时项目 3/3 通过，最终耗时 103ms / 1425ms / 610ms，均为 `local + simulated`、Receipt v0.3、`valid=true`，源码未变化且临时目录已删除。
- 文档：191 个 Markdown 相对链接、27 个 HTML 相对链接/锚点、4 份 HTML 基本解析和 `git diff --check` 通过；本次 diff 秘密样式扫描 0 hit。
- 浏览器：Playwright CLI 使用 Google Chrome 验证 PROJECT、GOVERNANCE 与 CHANGELOG；ENV-03 状态、Receipt v0.3、R2 边界和 100/100 证据在桌面/390×844 视口可见，控制台 0 error、0 warning。
- Graphify：代码图增量更新到 2243 nodes / 3446 edges / 143 communities；当前没有 Gemini/Google backend，文档语义未重新抽取，不影响源文档、链接和运行时验证。
- 未执行：没有 Base Sepolia 或 Mainnet 付款，没有加载钱包、生产密钥或 API credential，没有部署、DNS、云资源、托管、资金或历史数据迁移。

结论：ENV-03 本地实现达到 **GO for R2 review**。这是新客户端环境枚举和 Receipt 签名契约的 R2 变更，必须经 Domain + Architecture 人工审查后合并。合并后下一项为 ENV-04 隔离 Sandbox/Live 部署单元；Live/Mainnet 与真实资金继续 NO-GO。

## ENV-04 隔离 Sandbox / Live 部署单元验证

日期：2026-09-06
执行者：Codex

- 基线：PR #20 已合并；本地 `main` 快进至 `d9c65b8` 后删除 ENV-03 分支，并创建 `feat/env04-isolated-deployment-units`。
- 制品：新增 Node.js 22.13 多阶段 Dockerfile；依赖只安装一次，Sandbox 与 Live 必须使用同一个 `sha256` image ID 或 registry digest，普通 tag 与不同镜像由机器契约拒绝。
- 隔离：两个 Compose 单元使用不同 service、UID/GID、SQLite volume、data path、network、secret namespace、Provider scope 与 backup scope；只共享镜像、Compose 模板和环境契约版本。
- 禁用执行：Sandbox 与 Live 均为 `execution_disabled`，模板禁止 `X402_BUYER_PRIVATE_KEY`、`BU2_SIGNER_ENVIRONMENT` 和 legacy DB claim；Live 还要求显式 `live` profile。本轮没有商户、Signer、Facilitator 或 Provider 调用。
- 运行时：Reference Server 升至 v0.14，增加显式 `BU2_HOST` 容器监听；默认仍为 `127.0.0.1`。SIGTERM/SIGINT 会停止 HTTP 并关闭 SQLite，新增进程测试通过。
- 部署契约：`npm --prefix sandbox run test:deployment-contract` 2/2 通过，覆盖合法拓扑以及共享卷/网络/身份/秘密命名空间、mutable image、Signer mount 和 Live enabled 的拒绝。
- 容器验收：`npm --prefix sandbox run acceptance:deployment` 通过；最终一次构建得到 `sha256:2c897d703e2328e1800d4f708470f2b7a11a0ce53f78b3161a267bd7bc19e0f1`，同一 image ID 同时启动 Sandbox 84532 与 Live 8453，二者均返回 disabled；对两个环境发送支付 mutation 均在领域写入前稳定拒绝。
- E-T07：把真实 Sandbox volume 故意挂入 Live，进程以 `database_environment_mismatch` 拒绝；注入 Sandbox Signer environment 与测试 sentinel 时在密钥解析前以环境不匹配拒绝，日志未出现 sentinel。
- 全项目门禁：Contract 50 项与 MCP 6/6、Reference Server 101/101、TypeScript SDK 生成/格式/lint/类型/build 与 9/9、HTTP/SDK/MCP clean-room 3/3、Prototype lint 与 Vinext 五阶段 build 全部通过。
- Clean-room：HTTP / SDK / MCP 最终耗时 212ms / 3814ms / 4381ms，均为 `local + simulated`、settled、Receipt v0.3 valid，不能作为托管 Sandbox 证据。
- 浏览器：Playwright CLI 使用 Google Chrome 验证 PROJECT、GOVERNANCE、CHANGELOG；桌面状态与 390×844 CHANGELOG 新条目可见，控制台 0 error、0 warning。
- Graphify：代码图增量更新至 2286 nodes / 3500 edges / 143 communities；当前无 Gemini/Google backend，文档语义未重新抽取，不影响源文档、链接、容器与运行时验证。
- 故障与修复：首次容器验收因 Docker daemon 未运行而未开始，启动 Docker Desktop 后重试；随后发现镜像漏装 `contract-versions.json`，补齐 Dockerfile 并保留失败日志后最终通过。全量回归发现一处 v0.13 固定断言，更新到 v0.14 后 101/101 通过。
- 清理：每次验收使用随机 Compose project，并在 finally 中删除本次容器、卷、网络、镜像和临时文件；未触碰任何持久环境。
- 未执行：没有云资源、DNS、托管 Sandbox、API credential、钱包/Receipt 私钥、Webhook secret、Base Sepolia/Mainnet 付款、备份恢复或生产发布。

结论：ENV-04 本地实现达到 **GO for R2 review**，关闭 E-T07 的本地部署挂载子范围并补强 disarmed container 证据；它不等于托管 Sandbox 或 Live 准入。合并后下一项为 ENV-05 受控开发者/运维入口，ENV-06 可并行推进制品提升、监控与恢复演练；Live/Mainnet 与真实资金继续 NO-GO。

## ENV-05 受控开发者与运维入口验证

日期：2026-09-06
执行者：Codex

- 合并基线：确认 ENV-04 PR #21 已合并，`main` 同步到 `360468045e2eec493e617db446e75d5806eec480`，本地 ENV-04 分支已删除；本工作位于 `feat/env05-controlled-access`。
- Access Contract：外部 Sandbox/Live 固定 `authenticated`，Local 默认 `development_open`；Agent、Developer、Operator 权限和公开路由由机器契约约束。
- 凭据：配置仅持有 SHA-256 token digest；缺失、未知、过期、吊销、错环境或被租户 generation reset 的 key 均失败关闭，错误与审计不包含原始 token。
- 租户与角色：Agent/Developer 写入受 Account/Agent claims 限制，交易读取按参与方过滤；Agent 不能执行人工授权、结算、租户 reset 或支持包操作，Operator 权限不会自动授予普通 Agent。
- 数据迁移：SQLite Schema v9 新增 tenant access state、只追加 access decisions 与幂等 tenant reset；目标 Sandbox 租户 reset 后旧 key 失效，其他租户、Operator、Ledger、Receipt 和链上事实保持不变。
- 客户端：Agent Payment API、TypeScript SDK 与 MCP 升级到 v0.3；Sandbox/Live 强制 API key，公开 environment preflight 与 Receipt verify 不携带 key，私有请求使用 Bearer 且禁止自动跟随重定向。
- 运维：Operator 支持包只返回粗粒度环境、版本、关联 ID、诊断计数与可选交易状态，不返回完整交易、路径、Authorization header、key、私钥、Webhook secret 或私有 payload。
- Contract：`node docs/03-technical/validate-contract.mjs` 通过，56 项 invariant、6 个 MCP tool。
- Reference Server：`npm --prefix sandbox test` 通过，109/109，0 失败。
- TypeScript SDK：`npm --prefix packages/typescript-sdk test` 通过，generated、format、lint、typecheck、build 与 10/10 单元/HTTP 测试全部通过。
- 部署契约：`npm --prefix sandbox run test:deployment-contract` 2/2 通过；Sandbox/Live 均为 `authenticated + execution_disabled`。
- 容器验收：`npm --prefix sandbox run acceptance:deployment` 通过；同一不可变 image ID 启动两单元，无凭据 mutation 在领域写入前返回 401，错库与跨环境 Signer 失败关闭，日志无 secret，支付尝试 0 次，临时容器/卷/镜像已清理。
- Clean-room：`npm --prefix sandbox run acceptance:clean-room` 通过；HTTP、SDK、MCP 三个全新 Local 项目均在时限内完成 settled 交易并验证 Receipt，源码不变且临时项目删除。
- Prototype：`npm --prefix prototype run lint && npm --prefix prototype run build` 通过。
- 文档浏览器：通过本地 HTTP 使用 Playwright CLI 渲染 PROJECT、GOVERNANCE、CHANGELOG，ENV-05 内容存在，控制台 0 error / 0 warning。
- 静态质量：`git diff --check` 通过；53 个 Markdown/HTML 文件相对链接 0 失效；55 个本轮修改/新增文件未匹配私钥、OpenAI key 或原始 Bearer credential。
- Graphify：`graphify update .` 完成 AST 图更新，结果为 2341 nodes、3614 edges、146 communities；未配置语义文档后端，因此没有把文档语义重标记表述为已完成。
- 未执行：没有托管 edge E2E、云资源、DNS/TLS、正式 secret manager/凭据签发、Signer 装载、Base Sepolia/Mainnet 付款、生产发布或备份恢复；这些不属于 ENV-05 本地实现范围。

结论：ENV-05 本地实现达到 **GO for R2 review**。E-T04 的 API key 环境绑定、E-T11、E-T12 和 E-T16 已有本地自动化证据；E-T15 的机器认证与 redirect fail-closed 子范围通过，托管 edge E2E 留 ENV-07。API key 不替代 LegalPrincipal/PaymentMandate，Live/Mainnet 与真实资金继续 NO-GO。R2 Domain + Architecture 人工审查合并后，下一项优先进入 ENV-06 制品提升、监控、备份与恢复演练。

## ENV-06 制品提升、监控、备份与恢复演练验证

日期：2026-09-06
执行者：Codex

- 合并基线：确认 ENV-05 PR #22 已合并，`main` 同步到 `5cc13bb654c68e7ae9881508b0b4b0745bf58f2c`，本地 ENV-05 分支已删除；本工作位于 `feat/env06-artifact-recovery-operations`。
- Operations Contract：v1 固定单一不可变制品、环境专属备份 scope、禁止覆盖、同环境隔离恢复、恢复后 `execution_disabled + reconciliation_required`、禁止自动 Provider 重放，并明确本地候选清单不授权托管或支付。
- SQLite：复用 Node 22.16 官方 `node:sqlite backup()` 进行在线备份；数据库 SHA-256、完整性、schema v9、不可变环境元数据与关键事实计数均写入并校验。没有修改 Schema、API、SDK、MCP、Receipt 或交易状态机。
- 专项测试：`npm --prefix sandbox run test:operations` 通过，6/6；覆盖制品/配置漂移、WAL 一致性备份、数据库篡改、跨环境恢复、恢复禁用状态、脱敏监控、CLI JSON 输出以及报告冲突前置拒绝。
- Operations 验收：干净提交 `712efc485c50f0dc9a55c46d01764e13169e700e` 构建镜像 `sha256:494502b0747524c5901d45252b3a7008d1bd2b785ba4c792c8e98aebe38be58f`；Sandbox/Live 使用同一镜像，分别生成 scope 隔离、`PRAGMA integrity_check=ok`、Schema v9 的备份并恢复至新副本。
- 故障注入：Sandbox 备份恢复到 Live 在复制前以 `backup_environment_mismatch` 拒绝；配置指纹漂移进入 `blocked`；两环境恢复副本均要求对账、禁止自动重放，Signer、secret 与支付调用均为 0。
- 回归门禁：Contract 59 项与 MCP 6/6、Reference Server 109/109、TypeScript SDK 生成/格式/lint/类型/build 与 10/10、部署契约 2/2、容器部署验收、clean-room 3/3、Prototype lint/build 均通过。
- 文档与浏览器：55 个 Markdown/HTML 文件共 219 个相对链接无失效；29 个核心变更/新增文件未匹配凭据样式值；`git diff --check` 通过。Playwright CLI 验证 PROJECT 状态、阶段准入锚点、CHANGELOG 桌面与 390×844 移动视口，控制台 0 error / 0 warning。
- Graphify：`graphify update .` 刷新代码图至 2412 nodes / 3798 edges / 158 communities；未配置 Gemini/Google backend，因此未声称完成文档语义重标记。
- 失败记录：Operations 验收首次在 Docker Hub 拉取 Node 22.16 镜像元数据时因 EOF 中止，尚未进入 BU2 构建；精确拉取同一 digest 后完整重跑通过，未降低验收标准。
- 未执行：没有部署云资源、DNS/TLS、托管 Sandbox、正式对象存储或通知渠道，没有加载 API credential、Signer、钱包或生产密钥，没有执行 Base Sepolia/Mainnet 支付，也没有启用 Live。

结论：ENV-06 本地实现达到 **GO for R2 review**。E-T06、E-T08 与 E-T10 的本地制品、漂移、备份和恢复子范围具备自动化证据；这不等于托管环境、灾备 SLO、公开 Sandbox 或资金执行准入。R2 审查合并后再进入 ENV-07 托管 Sandbox 双向 Base Sepolia 验收；Live/Mainnet 与真实资金继续 NO-GO。

## ENV-07A Hosted Sandbox 准入与证据基线验证

日期：2026-09-07
执行者：Codex

- 合并基线：确认 ENV-06 PR #23 已合并，`main` 快进至 `6daa4a9353664f7a3193e74fc29d43ff6fbd595b`，本地 ENV-06 分支已删除；本工作位于 `feat/env07-hosted-sandbox-evidence`。
- 范围拆分：ENV-07A 只完成 Hosted Sandbox 本地准入与机器证据基线；ENV-07B 才执行公网 HTTPS 部署、真实双向 Base Sepolia 和 edge E2E。当前没有把本地结果写成托管通过。
- Runtime Secret：只接受绝对路径普通文件，拒绝符号链接、空/超限文件、直接 Secret 环境变量、原始 API key、错环境 credential 与无效 EVM key；Candidate 只保存 `bu2/sandbox/...` 引用名。
- 启动门槛：专用入口固定 `sandbox + x402 + exact + authenticated + execution_enabled + signer_environment=sandbox`，并通过 Viem 对实际 RPC 执行 `eth_chainId`；84532 启动、8453 在监听前拒绝。
- Candidate/Activation：完整 commit、不可变 artifact、非本地 HTTPS origin、四项 Gate 与契约指纹绑定；Candidate 固定不授权部署/执行。Activation 必须从外部提供并绑定 Candidate hash、审查人、有效期、付款次数和 Testnet 小额总额。
- Evidence：只接受两条方向唯一的真实 settled 交易、Base Sepolia hash、Receipt signature/issuer/settlement/environment 全部通过、重复提交/响应丢失无重复资金并收敛，以及 edge Bearer 无交互挑战/重定向；Live 必须不包含且 disabled。
- 自动化：Hosted Sandbox 8/8，Contract 62 + MCP 6，Reference Server 109/109，SDK 10/10，deployment 2/2，operations 6/6，clean-room 3/3，Prototype lint/build 全部通过。
- 干净提交容器证据：commit `c7e8dd548b4d4500a9426c72f0cde095f705b8ef` 通过 deployment 与 operations acceptance；两个环境分别复用一个不可变镜像，Sandbox/Live 均为 `execution_disabled + authenticated`，错库、错 Signer、跨环境恢复和配置漂移均失败关闭，Signer/Secret/支付调用为 0，恢复副本保持 disabled 且要求对账。
- 文档与静态检查：53 份 Markdown/HTML、223 个相对链接、0 失效；34 个变更/新增文件高置信 Secret 扫描 0 hit；Node syntax 与 `git diff --check` 通过。
- 浏览器：Browser 插件不可用，按前端测试技能降级到 Playwright CLI + 本地 Chrome；PROJECT 桌面、CHANGELOG 390×844 移动端均正常，ENV-07A 与 PR #23 状态可见，阶段准入 anchor 可交互，控制台 0 error / 0 warning。
- 失败与修复：启动测试最初使用错误的 `paymentAdapter` 参数名，修正为服务器契约的 `adapterMode` 后 8/8；一次根目录 npm 命令因仓库无根 package.json 失败，使用 `npm --prefix sandbox` 原样重跑通过。
- 未执行：云资源、DNS/TLS、托管 Secret、真实双向 Base Sepolia 支付、外部 Agent 流量、Hosted Provider/Webhook 故障注入、Live/Mainnet、生产凭据或托管。
- Graphify：AST 图刷新至 2472 nodes / 3920 edges / 172 communities；未配置 Gemini/Google 语义后端，因此未声称文档语义重标记完成。

结论：ENV-07A 本地实现达到 **GO for R2 review**。E-T13/E-T14/E-T15 的机器契约已建立，但真实托管部分仍为 **Not yet accepted**；下一步需要先选择托管目标并生成可审查的不可变部署 Candidate，再由独立 Activation 开启受限 Testnet 验收。Live/Mainnet 与真实资金继续 NO-GO。

## ENV-07B Hosted Sandbox 部署准备验证

日期：2026-09-06
执行者：Codex

- 分支基线：确认 PR #24 已合并，工作树切回 `main` 并清理已合并的本地功能分支；本轮工作位于 `feat/env07b-hosted-deployment-prep`。
- 部署单元：新增 `deploy/hosted-sandbox.compose.yaml`，只包含 Sandbox 服务，固定 `node sandbox/hosted-sandbox.mjs`、Base Sepolia `84532`、x402 `exact`、`authenticated` 和 `execution_enabled`。
- Secret 边界：三项运行 Secret 只能通过外部 Compose secret 以文件方式挂载到 `/run/secrets/...`；Compose 不包含原始 Secret 值，也不允许直接 Secret 环境变量。
- 制品与网络：Hosted Compose 要求不可变 `sha256` 镜像，宿主端口只绑定 `127.0.0.1`，并保持单独 Sandbox 数据卷、网络、运行身份和激活标记。
- 契约：新增 `hosted-sandbox-deployment.json` 与 `hosted-sandbox-deployment.mjs`，验证 Hosted Compose 不含 Live、命令/环境/Secret target/标签/资源边界一致。
- 未执行：没有创建云资源、DNS/TLS、托管 Secret、独立 Activation、真实 Base Sepolia 交易或公网边缘 E2E；这些仍属于 ENV-07B 外部验收。

验证命令：

```bash
npm --prefix sandbox run test:hosted-deployment
```

结论：本地 Hosted Sandbox 部署准备达到 **GO for R2 review**；它只证明托管部署配置可审查，不代表 ENV-07B 的公网部署或真实 Testnet 证据已通过。

## ENV-07B Hosted Sandbox 外部验收包验证

日期：2026-09-06
执行者：Codex

- 本地交付：新增 `deploy/hosted-sandbox-runbook.md`、`deploy/hosted-sandbox-evidence.template.json` 和 `docs/03-technical/hosted-sandbox-evidence.schema.json`。
- 证据边界：Schema 固定 Sandbox、Base Sepolia `84532`、x402、机器鉴权、双向交易、Receipt 三项信任、重复/丢响应处置和 Live 排除；禁止原始凭据、私钥、Bearer、Prompt 和完整交易载荷进入证据包。
- 执行边界：Runbook 明确托管目标、DNS/TLS、Secret、Candidate、独立 Activation 和边缘机器鉴权的前置条件，以及 E-T13/E-T14/E-T15 的停止与恢复步骤。
- 未执行：云资源、DNS/TLS、托管 Secret、Activation、真实双向 Base Sepolia、外部 Agent 流量和 Hosted edge E2E 仍未执行。

结论：外部验收包达到 **GO for R2 review**；ENV-07B 仍为 `Not yet accepted`，Epic 3 继续保持 Ready。

## F06a 账户/Agent 持久归属与内部开发者接入验证

日期：2026-09-06
执行者：Codex

### 变更范围

本轮将 Account、Agent、Principal、Credential Binding 和 Onboarding Event 持久化为 Sandbox Schema v10，并把当前明确配置的凭证元数据幂等映射到持久身份。新增 onboarding CLI、`/v1/access` 脱敏身份摘要、OpenAPI/TypeScript SDK `getAccessIdentity()` 以及内部接入文档。

### 验证结果

- Reference Sandbox：112/112。
- TypeScript SDK：10/10，generated/format/lint/typecheck/build 全部通过。
- API 契约：63 invariants、6 MCP tools。
- Deployment contract：2/2。
- Operations：6/6。
- Hosted Sandbox contract/runtime：8/8。
- Clean-room：HTTP/SDK/MCP 3/3，均为 Local Simulation。
- Prototype：lint 与 build 通过。
- `git diff --check`：通过。
- Onboarding CLI：bootstrap/inspect 通过，示例仅包含 `token_sha256`，不包含 raw token。

### F06a 验收判断

| 场景 | 结果 |
| --- | --- |
| 持久身份建档、幂等和重启恢复 | 通过 |
| 跨租户或身份绑定冲突 | 拒绝并保持一致性 |
| raw token 写入 onboarding | 拒绝 |
| `/v1/access` 身份摘要 | 通过；不返回 token 或 digest |
| Agent / Human Principal 分离 | 通过 |
| 默认 Sandbox 执行边界 | 保持 `execution_disabled` |

结论：F06a 达到 **GO for R2 independent human review**。本轮没有启用 Signer、真实付款、Live/Mainnet、Hosted 公网或托管能力；这些能力仍由后续 PR 和独立门禁控制。

## F06b 资金来源与收款目标绑定验证

日期：2026-09-07
执行者：Codex

### 变更范围

本轮在 F06a 持久身份基础上新增 SQLite Schema v11 的 `funding_sources` 与 `receiving_targets`，并将绑定校验接入 onboarding、`/v1/access`、Quote 与 PaymentIntent。绑定记录保存环境、租户、Account/Agent、资产、网络、Provider、脱敏引用、状态、验证状态和 generation；不保存私钥、原始 token 或支付秘密。

### 验证结果

- Reference Sandbox：115/115。
- TypeScript SDK：generated check、format、lint、typecheck、build 与 10/10 单元测试全部通过。
- API 契约：63 invariants、6 MCP tools。
- `git diff --check`：通过。
- 文档：技术索引、F06b 技术契约、Sandbox README、根 README、ENV-05/06 说明和 CHANGELOG 已同步。

### F06b 验收判断

| 场景 | 结果 |
| --- | --- |
| 绑定归一化、持久化与重启恢复 | 通过 |
| 跨租户、错环境、错资产/网络、引用漂移 | 拒绝并保持一致性 |
| 同一绑定 ID 静默覆盖 | 拒绝 |
| 已配置绑定的 Quote / PaymentIntent 归属 | 绑定 ID 写入并校验 |
| 未配置绑定的旧演示账户 | 保持兼容 |
| 默认 Sandbox 执行边界 | 保持 `execution_disabled` |

结论：F06b 达到 **GO for R2 independent human review**。本轮未启用 Signer、真实付款、Live/Mainnet、Hosted 公网或托管能力；这些仍由独立门禁控制。

## D1 F07 财务边界契约验证

日期：2026-09-08
执行者：Codex

本轮新增 `docs/02-product/F07_FINANCIAL_BOUNDARY_CONTRACT.md`，并同步产品/技术入口、Phase 0 路线、CHANGELOG 与审计上下文。契约冻结 Budget Scope、Budget Hold、Financial Posting、状态机、金额不变量、原子事务、并发幂等、对账恢复和明确非目标，作为 F07 代码实现前的 D1 基线。

验证结果：

- `git diff --check`：通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix sandbox test`：115/115 通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单测通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- 变更文档相对链接扫描：通过。

未执行：F07 运行时、数据库迁移、浏览器、Sandbox/Testnet 支付和 Hosted E2E；D1 明确不改变可执行行为。风险等级为 R0 文档契约冻结，需独立 R2 审查后才允许进入 F07 代码 PR。

## F07 Budget Hold / Financial Posting 实现验证

日期：2026-09-08
执行者：Codex

本轮在 Reference Sandbox Schema v12 增加 `budgets`、`budget_holds` 与 `financial_postings`，并将授权时的 Budget Hold、结算时的 Consume 与四条 Financial Posting 接入既有 `commitDomainMutation` 原子事务。OpenAPI 与 TypeScript SDK 同步新增 Budget、Hold、Posting 读写类型与接口。

验证结果：

- `node --test sandbox/f07.test.mjs`：3/3 通过。
- `npm --prefix sandbox test`：118/118 通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单测通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。

验收边界：预算不足、错误币种、非 active Scope 在 Hold 前失败关闭；同一事务的钱包、资源、Budget、Hold、Posting、LedgerEvent、Webhook Outbox 与幂等终态由现有 SQLite `BEGIN IMMEDIATE` 一次提交。未配置 `budget_id` 的既有演示支付保持兼容。

未执行：F08 Payment Mandate、收款 F10/F11、退款 F13、Hosted E2E、真实 Testnet 双向支付、Live/Mainnet 或托管；后续 F08 代码 PR 仍需独立 Domain 与 Architecture R2 审查。

## D2 F08 Payment Mandate 契约验证

日期：2026-09-08
执行者：Codex

本轮新增 `docs/02-product/F08_PAYMENT_MANDATE_CONTRACT.md`，并同步产品、技术、根 README、Phase 0 路线、CHANGELOG 与审计上下文。契约冻结版本化 Payment Mandate、Policy Decision、Account/Agent/Funding Source/Receiving Target 绑定、状态机、确定性规则、幂等重放，以及与 F07 Budget Hold 和 F09 自主执行的边界。

验证结果：

- `git diff --check`：通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- Markdown 相对链接扫描：通过。
- F08 旧状态扫描：通过；活动文档均将 D2 标记为 F08 运行时前置条件。

未执行：Sandbox 单元/集成、SDK、Prototype、浏览器、Testnet 支付和 Hosted E2E；D2 只修改文档。风险等级为 R0，需独立 R2 Domain 与 Architecture 审查后才允许进入 F08 代码 PR。

边界确认：未改变 API、Schema、交易状态、预算预留、账本、Adapter、Signer、环境或支付行为；Live/Mainnet、托管、生产凭证和 Hosted Sandbox 继续关闭。
## F08 Payment Mandate 运行时实现验证

日期：2026-09-08
执行者：Codex
分支：`feat/mandates-versioned-policy`

本轮在 D2 契约基础上实现版本化 `PaymentMandate` 与确定性 `PolicyDecision`。Mandate 通过统一资源持久化并升级至 SQLite Schema v13；状态转换使用版本检查和幂等 Claim；PaymentIntent 保存决策 ID、Mandate 版本、输入快照、规则和稳定原因码。持久化运行时激活 Mandate 前强制验证 active/verified Funding Source 与 Receiving Target 绑定，避免未绑定授权进入预算预留。

验证结果：

- `node --test sandbox/f08.test.mjs`：4/4 通过，包含绑定门槛、版本冲突、幂等状态转换和决策持久化。
- `npm --prefix sandbox test`：123/123 通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单测通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。

验收边界：`approved` 才能进入 F07 Budget Hold；`review_required` 与 `denied` 不创建 Hold。F08 不调用 Provider、Signer、x402、AP2 或链上 RPC，不改变 `execution_status`，不启用真实 Testnet 双向收付、Hosted、Live/Mainnet、托管或生产凭证。

残余风险：F08 需要独立 Domain 与 Architecture R2 人工审查；F09a 自主执行、F10/F11 收款、退款、对账和 Sandbox 双向 Beta 仍按路线图顺序推进。纯内存测试允许省略 Ledger，仅验证策略逻辑；持久化环境则强制钱包绑定。
# F09a 自主支付执行验证

日期：2026-09-08
执行者：Codex
分支：`feat/autonomous-payment-execution`

本轮新增 deferred PaymentIntent 执行模式和 `POST /v1/payment_intents/{id}/execution`。F08 approved 的 deferred Intent 可以由 Agent 在不调用人工授权接口的情况下进入现有 `reserve()`；review_required、Mandate suspended/revoked/expired 或版本漂移均失败关闭。执行命令复用既有 Idempotency Claim、Budget Hold、Wallet CAS、Adapter 和原子提交。

验证结果：

- `node --test sandbox/f09a.test.mjs`：3/3 通过。
- 其余全量验证将在本 PR 收口后记录。

边界：F09a 不负责 Provider unknown 恢复（F09b），不启用真实 Sandbox/Testnet 双向付款、Hosted、Live/Mainnet、托管或生产凭证。
