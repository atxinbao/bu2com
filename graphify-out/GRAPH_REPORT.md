# Graph Report - bu2com  (2026-09-06)

## Corpus Check
- 170 files · ~86,497 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2085 nodes · 3176 edges · 128 communities (121 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2fe7fe4f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 付费需求验证
- AP2
- Bu2Sandbox
- Agent 信誉
- cn
- sidebar.tsx
- devDependencies
- dependencies
- BU2 协议引入计划 v0.1
- menubar.tsx
- AGENTS.md — BU2 金融系统 AI Agent 工程规则
- compilerOptions
- scripts
- BU2 Task-first P0 正式用户测试方案（已废止）
- components.json
- x402-wallet.mjs
- BU2 MVP 产品需求文档 v0.3（Transaction-first）
- utils.ts
- combobox.tsx
- rules
- BU2 指标与验证计划 v0.1
- page.tsx
- doctor.mjs
- BU2 Pull Request
- BU2 预算与审批模型 v0.1
- Phase 0 Epic 1：External Agent Transaction Integration & Reliability
- context-menu.tsx
- drawer.tsx
- carousel.tsx
- BU2 P0 页面与交互规格 v0.3（Transaction-first）
- react
- chart.tsx
- toast.tsx
- BU2 Agent Payment API 契约 v0.1
- attachment.tsx
- field.tsx
- ignorePatterns
- .oxlintrc.json
- BU2 Product v0.1 验证结论
- client.ts
- BU2 Transaction-first P0 产品基线
- BU2 产品战略 v0.1
- navigation-menu.tsx
- ignorePatterns
- BU2 信息架构 v0.2（Transaction-first）
- BU2 Task-first P0 产品基线（已废止）
- button.tsx
- BU2 Reference Server v0.11 / x402 Sandbox v0.5
- 1. 首发客户画像
- SqliteLedger
- layout.tsx
- empty.tsx
- plugins
- 02-product/README.md
- server.mjs
- BU2 x402 Base Sepolia 测试钱包
- typescript-sdk/package.json
- bubble.tsx
- properties
- clean-room.mjs
- ApiError
- Phase 0 Epic 2：Developer Integration Scale
- Phase 0 Epic 3：External Pilot Readiness & Evidence
- 03-technical/README.md
- BU2 Persistence、Webhook 与 Adapter v0.6
- command.tsx
- BU2 x402 Base Sepolia 实结算证据
- compilerOptions
- properties
- tabs.tsx
- versions
- http.test.mjs
- properties
- definitions
- required
- checks
- required
- validate-contract.mjs
- summary
- required
- compilerOptions
- paths
- English
- alert-dialog.tsx
- error_code
- BU2 交易链路可观测性与处置手册 v0.1
- BU2 x402 Sandbox Adapter v0.4
- 中文
- properties
- null
- properties
- properties
- properties
- BU2 P0 可点击原型
- 外部 Buyer / Seller Agent 快速接入
- BU2 MCP Host 配置 / Host Configuration
- required
- E2.4 外部 clean-room 接入证据
- required
- prototype/AGENTS.md
- properties
- required
- enum
- 6. P0 功能需求
- 2. 顺序与完成门槛
- clean-room/mcp-client.mjs
- x402.test.mjs
- step
- doctor-result.schema.json
- failure
- clean-room-evidence.schema.json
- required
- enum
- http-client.mjs
- sdk-client.mjs
- generate-openapi.mjs
- elapsed_ms
- steps
- BU2 Transaction Atomicity v0.1
- 5. 正式测试任务
- BU2 x402 Testnet 可信执行 v0.1
- breadcrumb.tsx
- BU2 Clean-room Integration Samples / 接入样例
- BU2 Transaction-first P0 验收方案

## God Nodes (most connected - your core abstractions)
1. `cn()` - 343 edges
2. `ApiError` - 54 edges
3. `SqliteLedger` - 52 edges
4. `react` - 40 edges
5. `Bu2Sandbox` - 34 edges
6. `rules` - 21 edges
7. `createBu2Server()` - 19 edges
8. `Bu2Client` - 18 edges
9. `required` - 17 edges
10. `listen()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Agent 预算与费用治理` --rationale_for--> `Agent Wallet`  [INFERRED]
  README.md → docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf
- `Agent 开发者与 AI 团队` --conceptually_related_to--> `Agent 预算与费用治理`  [EXTRACTED]
  docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf → README.md
- `非托管与预算编排优先` --rationale_for--> `Agent 预算与费用治理`  [EXTRACTED]
  docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf → README.md
- `Policy Engine` --conceptually_related_to--> `Agent 支付权限`  [EXTRACTED]
  docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf → README.md
- `BU2` --conceptually_related_to--> `AI Agent 财务与支付治理平台`  [EXTRACTED]
  README.md → docs/01-business-plan/BU2_AI_Agent_Wallet_BP_v0.1.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **BU2 核心产品结构** — agent_passport, agent_wallet, policy_engine, audit_ledger, payment_gateway [EXTRACTED 1.00]
- **BU2 商业验证计划** — concept_validation, customer_interviews, product_prototype, paid_demand_validation [EXTRACTED 1.00]
- **Agent 商业基础设施** — agent_identity, budget_governance, payment_permissions, auditability, agent_reputation [INFERRED 0.85]

## Communities (128 total, 3 thin omitted)

### Community 0 - "付费需求验证"
Cohesion: 0.38
Nodes (7): 概念及商业验证阶段, 客户访谈, 03-market 市场研究、客户访谈和竞品, 05-operations 路线图、指标和运营记录, 付费需求验证, 02-product 产品定位、需求和原型, 产品原型

### Community 1 - "AP2"
Cohesion: 0.17
Nodes (13): Agent Wallet, AP2, Agent 预算与费用治理, 确定性消费规则, Agent 开发者与 AI 团队, 人工审批, MCP, 非托管与预算编排优先 (+5 more)

### Community 2 - "Bu2Sandbox"
Cohesion: 0.17
Nodes (10): Bu2Sandbox, clone(), legacyCanonical(), prefix(), receiptCanonical(), requireFields(), createReviewIntent(), validateAmount() (+2 more)

### Community 3 - "Agent 信誉"
Cohesion: 0.18
Nodes (11): AI Agent 财务与支付治理平台, Agent 身份, Agent 市场, Agent Passport, Agent 信誉, Audit Ledger, 可审计交易, Budget for agents. Control for humans. (+3 more)

### Community 4 - "cn"
Cohesion: 0.05
Nodes (67): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup() (+59 more)

### Community 5 - "sidebar.tsx"
Cohesion: 0.06
Nodes (39): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), Sidebar() (+31 more)

### Community 6 - "devDependencies"
Cohesion: 0.04
Nodes (48): @cloudflare/vite-plugin, @cloudflare/workers-types, @openai/sites-vite-plugin, oxlint-tsgolint, devDependencies, @cloudflare/vite-plugin, @cloudflare/workers-types, @openai/sites-vite-plugin (+40 more)

### Community 7 - "dependencies"
Cohesion: 0.05
Nodes (39): @base-ui/react, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, input-otp, lucide-react (+31 more)

### Community 8 - "BU2 协议引入计划 v0.1"
Cohesion: 0.06
Nodes (34): 10. 当前决策, 11. 参考资料, 1. 决策摘要, 2. 协议与 BU2 产品层的关系, 3. P0：MVP 不接入真实支付协议, 4. P1：x402 沙盒验证, 5. P2：x402 受控生产闭环, 6. P3：AP2 适配器 (+26 more)

### Community 9 - "menubar.tsx"
Cohesion: 0.09
Nodes (26): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuGroup(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuPortal(), DropdownMenuRadioGroup() (+18 more)

### Community 10 - "AGENTS.md — BU2 金融系统 AI Agent 工程规则"
Cohesion: 0.06
Nodes (31): 10. 提交前检查清单, 11. 规则维护, 12. CHANGELOG 强制对齐规则, 1. 使命与优先级, 2.1 默认行为, 2.2 变更前必须回答, 2. Agent 工作模式, 3.1 交易状态所有权 (+23 more)

### Community 11 - "compilerOptions"
Cohesion: 0.06
Nodes (31): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+23 more)

### Community 12 - "scripts"
Cohesion: 0.04
Nodes (46): ajv, ajv-formats, canonicalize, express, @modelcontextprotocol/client, @modelcontextprotocol/server, bin, bu2-doctor (+38 more)

### Community 13 - "BU2 Task-first P0 正式用户测试方案（已废止）"
Cohesion: 0.14
Nodes (14): 10. 测试结论分级, 11. 测试完成后的交付物, 1. 测试目标, 2. 目标参与者, 3. 测试设置, 4. 主持人开场脚本, 6. 结束访谈问题, 7. 单场记录表 (+6 more)

### Community 14 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 15 - "x402-wallet.mjs"
Cohesion: 0.11
Nodes (20): createX402Merchant(), defaultPayTo(), listenX402Merchant(), X402_FACILITATOR, X402_NETWORK, X402_PRICE, capability, challenge (+12 more)

### Community 16 - "BU2 MVP 产品需求文档 v0.3（Transaction-first）"
Cohesion: 0.18
Nodes (11): 1. 目标, 2. 目标用户, 3. P0 成功标准, 4. 核心对象, 5.1 Agent 付款, 5.2 Agent 收款, 5. 核心流程, 7. P0 页面 (+3 more)

### Community 17 - "utils.ts"
Cohesion: 0.08
Nodes (15): AspectRatio(), Checkbox(), HoverCardContent(), Kbd(), KbdGroup(), ResizableHandle(), ResizablePanelGroup(), Slider() (+7 more)

### Community 18 - "combobox.tsx"
Cohesion: 0.09
Nodes (23): ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxContent(), ComboboxEmpty(), ComboboxGroup(), ComboboxInput() (+15 more)

### Community 19 - "rules"
Cohesion: 0.10
Nodes (21): rules, import/no-anonymous-default-export, no-array-constructor, no-var, prefer-const, prefer-rest-params, prefer-spread, react/display-name (+13 more)

### Community 20 - "BU2 指标与验证计划 v0.1"
Cohesion: 0.11
Nodes (19): 1. 验证目标, 2. 北极星指标, 3. 漏斗指标, 4. 价值指标, 5. 可靠性指标, 6. 客户访谈计划, 7. 原型实验, 8. Go / Iterate / Stop 门槛 (+11 more)

### Community 21 - "page.tsx"
Cohesion: 0.09
Nodes (18): copy, demoTxs, Detail(), formatAmount(), formatApiTime(), hasReached(), Home(), Language (+10 more)

### Community 22 - "doctor.mjs"
Cohesion: 0.05
Nodes (56): blockRemaining(), check(), compareVersions(), correlation(), DOCTOR_SCHEMA_VERSION, DOCTOR_STAGES, doctorHelp(), errorCode() (+48 more)

### Community 23 - "BU2 Pull Request"
Cohesion: 0.09
Nodes (21): 10. 可观测性与运营, 11. 发布计划, 12. 文档与变更日志, 13. 审查与批准, 14. 残余风险与后续工作, 15. 提交者最终确认, 1. 变更摘要, 2. 范围与边界 (+13 more)

### Community 24 - "BU2 预算与审批模型 v0.1"
Cohesion: 0.12
Nodes (17): 10. 钱包阶段的产品边界, 1. 目标, 2. 授权层级, 3. 支出申请契约, 4. 策略条件, 5. 判断结果, 6. 规则优先级, 7. 示例 (+9 more)

### Community 25 - "Phase 0 Epic 1：External Agent Transaction Integration & Reliability"
Cohesion: 0.09
Nodes (21): 10. 恢复策略, 11. 后续门槛, 1. 目标, 2. Owner, 3. 用户闭环, 4. 范围, 5. 明确不做, 6. 接口与状态契约 (+13 more)

### Community 26 - "context-menu.tsx"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubTrigger() (+1 more)

### Community 27 - "drawer.tsx"
Cohesion: 0.14
Nodes (10): DrawerContent(), DrawerContext, DrawerContextProps, DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerSwipeHandle() (+2 more)

### Community 28 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 29 - "BU2 P0 页面与交互规格 v0.3（Transaction-first）"
Cohesion: 0.17
Nodes (12): 1. 原型目标, 2.1 导航, 2.2 语言与响应式, 2. 全局框架, 3. Transactions（默认首页）, 4. Transaction Detail, 5. Authorizations, 6. Payment Mandates (+4 more)

### Community 30 - "react"
Cohesion: 0.10
Nodes (17): Alert(), AlertAction(), AlertDescription(), AlertTitle(), alertVariants, Label(), Marker(), MarkerContent() (+9 more)

### Community 31 - "chart.tsx"
Cohesion: 0.21
Nodes (11): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION (+3 more)

### Community 32 - "toast.tsx"
Cohesion: 0.15
Nodes (7): toast, ToastAction(), ToastClose(), ToastContent(), ToastDescription(), ToastTitle(), ToastViewport()

### Community 33 - "BU2 Agent Payment API 契约 v0.1"
Cohesion: 0.12
Nodes (15): 10. 链路关联, 11. Transaction 分页, 12. Webhook 事件, 13. 版本边界, 14. x402 未知结算恢复, 1. 设计原则, 2. 稳定资源, 3. PaymentIntent 最小输入 (+7 more)

### Community 34 - "attachment.tsx"
Cohesion: 0.20
Nodes (11): Attachment(), AttachmentAction(), AttachmentActions(), AttachmentContent(), AttachmentDescription(), AttachmentGroup(), AttachmentMedia(), attachmentMediaVariants (+3 more)

### Community 35 - "field.tsx"
Cohesion: 0.13
Nodes (16): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Field(), FieldContent(), FieldDescription(), FieldError() (+8 more)

### Community 36 - "ignorePatterns"
Cohesion: 0.18
Nodes (10): ignorePatterns, printWidth, $schema, singleQuote, sortPackageJson, bun.lock, bun.lockb, package-lock.json (+2 more)

### Community 37 - ".oxlintrc.json"
Cohesion: 0.18
Nodes (10): categories, correctness, env, browser, builtin, node, options, typeAware (+2 more)

### Community 38 - "BU2 Product v0.1 验证结论"
Cohesion: 0.07
Nodes (27): Agent Payment API Contract v0.1 验证, BU2 Product v0.1 验证结论, docs/README 当前目录对齐验证, E1.0 Transaction API v1 冻结验证, E1.1 Webhook 可靠性闭环验证, E1.2 交易链路可观测性验证, E1.3 x402 Testnet 失败恢复验证, E1.4 外部 Buyer / Seller Agent 接入样例验证 (+19 more)

### Community 39 - "client.ts"
Cohesion: 0.08
Nodes (51): apiError(), apiRecovery(), Bu2Client, isRecord(), mutationHeaders(), normalizeBaseUrl(), OpenApiResult, Operation (+43 more)

### Community 40 - "BU2 Transaction-first P0 产品基线"
Cohesion: 0.20
Nodes (10): 1. 产品定位, 2. P0 核心闭环, 3. 核心对象, 4. 不可破坏契约, 5. 状态机, 6. P0 产品页面, 7. P0 演示验收, 8. P0 非目标 (+2 more)

### Community 41 - "BU2 产品战略 v0.1"
Cohesion: 0.12
Nodes (16): 1. 产品愿景, 2. 当前产品切口, 3.1 先治理，后支付, 3.2 模型提出理由，规则决定权限, 3.3 默认最小权限, 3.4 任务是最小归因单元, 3.5 协议中立, 3.6 证据优先 (+8 more)

### Community 42 - "navigation-menu.tsx"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuPositioner(), NavigationMenuTrigger() (+1 more)

### Community 43 - "ignorePatterns"
Cohesion: 0.20
Nodes (8): ignorePatterns, dist/**, next-env.d.ts, localBindingConfig, build/**, coverage/**, out/**, .vinext/**

### Community 44 - "BU2 信息架构 v0.2（Transaction-first）"
Cohesion: 0.20
Nodes (9): 1. 导航结构, 2. 页面职责, 3. 对象关系, 4. 交易详情信息层级, 5. 状态模型, 6. 嵌入边界, BU2 信息架构 v0.2（Transaction-first）, Payment Intent (+1 more)

### Community 45 - "BU2 Task-first P0 产品基线（已废止）"
Cohesion: 0.22
Nodes (9): 1. 产品定位, 2. 连续交付顺序, 3. 核心对象, 4. 不可破坏契约, 5. 事件流程, 6. 治理模式边界, 7. 原型验收路径, 8. 衡量与边界 (+1 more)

### Community 46 - "button.tsx"
Cohesion: 0.12
Nodes (16): Button(), buttonVariants, Calendar(), CalendarDayButton(), MessageScroller(), MessageScrollerButton(), MessageScrollerContent(), MessageScrollerItem() (+8 more)

### Community 47 - "BU2 Reference Server v0.11 / x402 Sandbox v0.5"
Cohesion: 0.17
Nodes (12): BU2 Reference Server v0.11 / x402 Sandbox v0.5, x402 沙盒商户, 三路径 clean-room 验收, 启动, 启动完整 x402 BU2 链路, 外部 Buyer / Seller Agent 与 MCP, 完整 Agent 交易演示, 恢复未知 x402 结算 (+4 more)

### Community 48 - "1. 首发客户画像"
Cohesion: 0.15
Nodes (12): 1. 首发客户画像, 2. 优先场景, 3. 端到端使用故事, 4. 首批访谈筛选条件, BU2 用户与核心任务 v0.1, Persona A：AI 产品负责人, Persona B：Agent 开发者, Persona C：财务或 FinOps 管理者 (+4 more)

### Community 49 - "SqliteLedger"
Cohesion: 0.08
Nodes (7): canonical(), immediateTransaction(), nowIso(), parse(), requestFingerprint(), secretFingerprint(), SqliteLedger

### Community 50 - "layout.tsx"
Cohesion: 0.25
Nodes (5): geistMono, geistSans, metadata, nextConfig, .next/**

### Community 51 - "empty.tsx"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 52 - "plugins"
Cohesion: 0.25
Nodes (8): plugins, eslint, import, jsx-a11y, nextjs, oxc, typescript, unicorn

### Community 53 - "02-product/README.md"
Cohesion: 0.15
Nodes (5): BU2 产品文档, 产品定义, 产品阶段, 当前状态, 文档导航

### Community 54 - "server.mjs"
Cohesion: 0.11
Nodes (25): sdkServer(), ajv, amount, decodeCursor(), encodeCursor(), paginateTransactions(), schemas, validateBody() (+17 more)

### Community 55 - "BU2 x402 Base Sepolia 测试钱包"
Cohesion: 0.25
Nodes (7): BU2 x402 Base Sepolia 测试钱包, 官方资料, 当前余额, 当前实测, 钱包, 领取后验证, 领取测试资产

### Community 56 - "typescript-sdk/package.json"
Cohesion: 0.06
Nodes (35): openapi-fetch, openapi-typescript, dependencies, openapi-fetch, description, devDependencies, openapi-typescript, oxfmt (+27 more)

### Community 57 - "bubble.tsx"
Cohesion: 0.38
Nodes (6): Bubble(), BubbleContent(), BubbleGroup(), BubbleReactions(), bubbleReactionsVariants, bubbleVariants

### Community 58 - "properties"
Cohesion: 0.18
Nodes (11): properties, const, const, deletion, persistence, remote_enabled, retention, upload_attempted (+3 more)

### Community 59 - "clean-room.mjs"
Cohesion: 0.12
Nodes (23): childEnvironment(), cleanRoomSchema, closeReferenceServer(), contractVersions, executeFile, integrationDir, mcpEntry, parseClientResult() (+15 more)

### Community 60 - "ApiError"
Cohesion: 0.17
Nodes (13): ApiError, quoteInput, reserve(), settle(), buildPaymentAdapter(), digest(), expectedAtomicUsdc(), normalizedAddress() (+5 more)

### Community 61 - "Phase 0 Epic 2：Developer Integration Scale"
Cohesion: 0.09
Nodes (21): 10. 恢复策略, 11. Definition of Ready, 1. 目标, 2. Owner, 3. 用户闭环, 4. 工作包与顺序, 5. 明确不做, 6. 接口与兼容契约 (+13 more)

### Community 62 - "Phase 0 Epic 3：External Pilot Readiness & Evidence"
Cohesion: 0.09
Nodes (21): 10. 失败、停止与恢复, 11. Definition of Ready, 12. Definition of Done, 1. 目标, 2. 前置状态, 3. Owner 与责任, 4. 试点闭环, 5. 工作包与顺序 (+13 more)

### Community 64 - "BU2 Persistence、Webhook 与 Adapter v0.6"
Cohesion: 0.29
Nodes (6): 1. 持久化追加账本, 2. Webhook Outbox, 3. Webhook Secret 轮换, 4. 支付 Adapter, 5. 当前边界, BU2 Persistence、Webhook 与 Adapter v0.6

### Community 65 - "command.tsx"
Cohesion: 0.12
Nodes (16): Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+8 more)

### Community 66 - "BU2 x402 Base Sepolia 实结算证据"
Cohesion: 0.25
Nodes (7): BU2 x402 Base Sepolia 实结算证据, 产品页面接入, 商户地址修正, 完整 BU2 Agent 支付, 真实 paid probe, 运行状态, 验收结论

### Community 67 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, exactOptionalPropertyTypes, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+9 more)

### Community 68 - "properties"
Cohesion: 0.12
Nodes (17): format, type, properties, type, finished_at, project_fresh, source_unchanged, started_at (+9 more)

### Community 69 - "tabs.tsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 70 - "versions"
Cohesion: 0.12
Nodes (17): type, node, type, type, type, api_contract, mcp_contract, minimum_node (+9 more)

### Community 71 - "http.test.mjs"
Cohesion: 0.14
Nodes (5): SimulatedPaymentAdapter, stack(), quoteInput, stack(), WebhookDispatcher

### Community 72 - "properties"
Cohesion: 0.12
Nodes (16): type, properties, code, recovery, request_id, retry, trace_id, type (+8 more)

### Community 73 - "definitions"
Cohesion: 0.14
Nodes (15): definitions, failure, pathResult, recoveryAction, additionalProperties, required, type, error_code (+7 more)

### Community 74 - "required"
Cohesion: 0.13
Nodes (15): started_at, required, elapsed_ms, failures, finished_at, path, project_fresh, receipt_id (+7 more)

### Community 75 - "checks"
Cohesion: 0.18
Nodes (11): items, maxItems, minItems, type, $ref, checks, records, items (+3 more)

### Community 76 - "required"
Cohesion: 0.14
Nodes (15): analytics, environment, schema_version, started_at, required, enum, checks, configuration (+7 more)

### Community 77 - "validate-contract.mjs"
Cohesion: 0.22
Nodes (7): cleanRoom, doctor, flow, here, mcp, openapi, versions

### Community 78 - "summary"
Cohesion: 0.14
Nodes (14): maximum, minimum, type, maximum, minimum, type, failed, passed (+6 more)

### Community 79 - "required"
Cohesion: 0.31
Nodes (9): additionalProperties, required, type, required, analyticsRecord, duration_ms, error_code, stage (+1 more)

### Community 80 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, sourceMap, exclude (+5 more)

### Community 81 - "paths"
Cohesion: 0.15
Nodes (13): items, type, $ref, items, maxItems, minItems, type, failures (+5 more)

### Community 82 - "English"
Cohesion: 0.15
Nodes (13): 1. Purpose and boundaries, 1. 目标与边界, 2. Run, 2. 运行, 3. Fixed check order, 3. 固定检查顺序, 4. Machine result and minimal analytics, 4. 机器结果与最小分析 (+5 more)

### Community 83 - "alert-dialog.tsx"
Cohesion: 0.15
Nodes (9): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogMedia(), AlertDialogOverlay() (+1 more)

### Community 84 - "error_code"
Cohesion: 0.17
Nodes (12): enum, pattern, type, properties, action, error_code, stage, properties (+4 more)

### Community 85 - "BU2 交易链路可观测性与处置手册 v0.1"
Cohesion: 0.17
Nodes (12): 1. 目标, 2. 关联字段, 3. 健康快照, 4. 结构化事件, 5. 告警条件, 6.1 Webhook 死信, 6.2 Adapter 结果未知, 6.3 Receipt 验证失败 (+4 more)

### Community 86 - "BU2 x402 Sandbox Adapter v0.4"
Cohesion: 0.15
Nodes (12): BU2 x402 Sandbox Adapter v0.4, 协议映射, 固定配置, 恢复契约, 成功, 数据与恢复, 明确失败, 目标与边界 (+4 more)

### Community 87 - "中文"
Cohesion: 0.18
Nodes (11): API, @bu2/sdk · TypeScript SDK v0.1, Contract generation, Create a client, English, Install and verify, 中文, 创建客户端 (+3 more)

### Community 88 - "properties"
Cohesion: 0.20
Nodes (10): const, format, type, const, properties, environment, generated_at, max_elapsed_ms (+2 more)

### Community 89 - "null"
Cohesion: 0.22
Nodes (10): null, string, receipt_id, receipt_valid, transaction_status, pattern, type, type (+2 more)

### Community 90 - "properties"
Cohesion: 0.13
Nodes (18): $ref, failed, passed, properties, failure, receipt_verification, result, schema_version (+10 more)

### Community 91 - "properties"
Cohesion: 0.22
Nodes (9): properties, const, persistence, remote_enabled, retention, upload_attempted, const, const (+1 more)

### Community 92 - "properties"
Cohesion: 0.31
Nodes (9): properties, properties, minimum, type, duration_ms, error_code, result_category, stage (+1 more)

### Community 94 - "BU2 P0 可点击原型"
Cohesion: 0.50
Nodes (3): BU2 P0 可点击原型, 对应规格, 覆盖页面

### Community 95 - "外部 Buyer / Seller Agent 快速接入"
Cohesion: 0.22
Nodes (9): 1. 五分钟快速开始, 2. 角色与调用边界, 3. 连接已有本地 Reference Server, 4. MCP Host 配置, 5. 样例代码, 6. 验证与限制, 7. 三路径 clean-room 验收, 8. Three-path clean-room acceptance (+1 more)

### Community 96 - "BU2 MCP Host 配置 / Host Configuration"
Cohesion: 0.22
Nodes (9): 1. 启动前提 / Prerequisites, 2. Codex, 3. Claude Desktop / Claude Code, 4. 通用 Host / Generic Host, 5. 版本与能力握手 / Version and capability handshake, 6. 环境边界 / Environment boundary, 7. Clean-room 验收 / Clean-room acceptance, 8. 参考 / References (+1 more)

### Community 97 - "required"
Cohesion: 0.20
Nodes (10): additionalProperties, required, type, persistence, remote_enabled, retention, upload_attempted, analytics (+2 more)

### Community 98 - "E2.4 外部 clean-room 接入证据"
Cohesion: 0.25
Nodes (8): 1. 结论, 2. 执行方式, 3. 实测结果, 4. 失败与恢复记录, 5. 机器证据边界, 6. 金融与产品边界, 7. 恢复方式, E2.4 外部 clean-room 接入证据

### Community 99 - "required"
Cohesion: 0.25
Nodes (8): additionalProperties, required, type, persistence, remote_enabled, retention, upload_attempted, analytics

### Community 104 - "properties"
Cohesion: 0.25
Nodes (8): minimum, type, minLength, type, duration_ms, name, status, properties

### Community 105 - "required"
Cohesion: 0.25
Nodes (8): analytics, environment, schema_version, required, generated_at, max_elapsed_ms, paths, summary

### Community 106 - "enum"
Cohesion: 0.29
Nodes (8): enum, type, type, null, string, environment, simulation, testnet

### Community 107 - "6. P0 功能需求"
Cohesion: 0.22
Nodes (9): 6. P0 功能需求, F01 Agent Identity, F02 Wallet 与限额, F03 Payment Mandate, F04 Quote 与 Payment Intent, F05 Authorization 与资金预留, F06 Delivery 与 Settlement, F07 Receipt 与账本 (+1 more)

### Community 108 - "2. 顺序与完成门槛"
Cohesion: 0.25
Nodes (7): 1. 目的, 2. 顺序与完成门槛, 3. Epic 3 准入, Gate 1：Receipt v0.2 与界面真实性, Gate 2：数据库幂等与交易原子性, Gate 3：x402 Testnet 可信执行, Phase 0 Transaction Trust Gate

### Community 109 - "clean-room/mcp-client.mjs"
Cohesion: 0.25
Nodes (4): client, startedAt, steps, transport

### Community 110 - "x402.test.mjs"
Cohesion: 0.25
Nodes (4): facilitatorClient, paymentRequired(), persistAuthorization(), rotatingChallengeServer()

### Community 111 - "step"
Cohesion: 0.29
Nodes (7): step, duration_ms, additionalProperties, required, type, name, status

### Community 112 - "doctor-result.schema.json"
Cohesion: 0.17
Nodes (11): additionalProperties, allOf, additionalProperties, type, definitions, check, stage, $id (+3 more)

### Community 113 - "failure"
Cohesion: 0.29
Nodes (7): failure, additionalProperties, required, type, code, recovery, retry

### Community 114 - "clean-room-evidence.schema.json"
Cohesion: 0.33
Nodes (5): additionalProperties, $id, $schema, title, type

### Community 115 - "required"
Cohesion: 0.50
Nodes (5): failed, passed, enum, required, total

### Community 116 - "enum"
Cohesion: 0.40
Nodes (5): enum, path, http, mcp, sdk

### Community 118 - "sdk-client.mjs"
Cohesion: 0.40
Nodes (3): bu2, startedAt, steps

### Community 119 - "generate-openapi.mjs"
Cohesion: 0.50
Nodes (3): generated, outputUrl, schemaUrl

### Community 120 - "elapsed_ms"
Cohesion: 0.67
Nodes (3): minimum, type, elapsed_ms

### Community 121 - "steps"
Cohesion: 0.67
Nodes (3): steps, minItems, type

### Community 122 - "BU2 Transaction Atomicity v0.1"
Cohesion: 0.22
Nodes (8): 1. 目标与边界, 2. 幂等契约, 3. 并发与余额, 4. 原子提交边界, 5. 外部调用与未知结果, 6. 迁移与恢复, 7. 自动化验收, BU2 Transaction Atomicity v0.1

### Community 123 - "5. 正式测试任务"
Cohesion: 0.25
Nodes (8): 5. 正式测试任务, UT-01 识别工作重点, UT-02 解释任务费用, UT-03 理解治理模式, UT-04 处理异常, UT-05 验证决策结果, UT-06 检查另一项异常, UT-07 语言切换

### Community 124 - "BU2 x402 Testnet 可信执行 v0.1"
Cohesion: 0.25
Nodes (8): 1. 目标与边界, 2. 数据所有权与授权条款, 3. 签名前最终一致性, 4. Payment Attempt 与事务边界, 5. 崩溃恢复, 6. 兼容、迁移与恢复方案, 7. 自动化验收, BU2 x402 Testnet 可信执行 v0.1

### Community 125 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 126 - "BU2 Clean-room Integration Samples / 接入样例"
Cohesion: 0.67
Nodes (3): BU2 Clean-room Integration Samples / 接入样例, 自动验收 / Automated acceptance, 路径边界 / Path boundaries

### Community 127 - "BU2 Transaction-first P0 验收方案"
Cohesion: 0.50
Nodes (4): BU2 Transaction-first P0 验收方案, 主路径, 结论规则, 辅助路径

## Knowledge Gaps
- **902 isolated node(s):** `$schema`, `$id`, `title`, `type`, `additionalProperties` (+897 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1018 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `sidebar.tsx`, `menubar.tsx`, `utils.ts`, `combobox.tsx`, `page.tsx`, `context-menu.tsx`, `drawer.tsx`, `carousel.tsx`, `react`, `chart.tsx`, `toast.tsx`, `attachment.tsx`, `field.tsx`, `navigation-menu.tsx`, `button.tsx`, `empty.tsx`, `bubble.tsx`, `command.tsx`, `tabs.tsx`, `alert-dialog.tsx`, `breadcrumb.tsx`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `cn`, `sidebar.tsx`, `menubar.tsx`, `utils.ts`, `combobox.tsx`, `page.tsx`, `context-menu.tsx`, `drawer.tsx`, `carousel.tsx`, `chart.tsx`, `toast.tsx`, `attachment.tsx`, `field.tsx`, `button.tsx`, `plugins`, `bubble.tsx`, `command.tsx`, `alert-dialog.tsx`, `breadcrumb.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `plugins` connect `plugins` to `.oxlintrc.json`, `react`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `$schema`, `$id`, `title` to the rest of the system?**
  _902 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.04506172839506173 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05585106382978723 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._