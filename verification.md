# BU2 Product v0.1 验证结论

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
