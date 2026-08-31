# Graph Report - bu2com  (2026-09-01)

## Corpus Check
- 120 files · ~43,255 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1209 nodes · 1837 edges · 81 communities (74 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- 付费需求验证
- AP2
- ApiError
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
- item.tsx
- react
- BU2 预算与审批模型 v0.1
- breadcrumb.tsx
- context-menu.tsx
- drawer.tsx
- carousel.tsx
- BU2 P0 页面与交互规格 v0.2（Task-first）
- alert-dialog.tsx
- chart.tsx
- toast.tsx
- BU2 Agent Payment API 契约 v0.1
- attachment.tsx
- 8. Go / Iterate / Stop 门槛
- ignorePatterns
- .oxlintrc.json
- BU2 Product v0.1 验证结论
- BU2 Transaction-first P0 产品基线
- BU2 产品战略 v0.1
- navigation-menu.tsx
- ignorePatterns
- BU2 信息架构 v0.2（Transaction-first）
- BU2 Task-first P0 产品基线（已废止）
- button.tsx
- BU2 Reference Server / x402 Sandbox v0.3
- 1. 首发客户画像
- layout.tsx
- empty.tsx
- plugins
- BU2 x402 Base Sepolia 测试钱包
- avatar.tsx
- bubble.tsx
- popover.tsx
- toggle-group.tsx
- 8. 审批
- 03-technical/README.md
- BU2 Persistence、Webhook 与 Adapter v0.2
- BU2 x402 Sandbox Adapter v0.3
- BU2 x402 Base Sepolia 实结算证据
- alert.tsx
- tabs.tsx
- 11. 关键空状态
- 5. Agents
- 7. 策略
- 8.1 总览
- 9. 任务与账本
- BU2 产品文档
- validate-contract.mjs
- marker.tsx
- 2. 全局框架
- 4. 项目
- 6. 预算
- BU2 P0 可点击原型
- prototype/AGENTS.md

## God Nodes (most connected - your core abstractions)
1. `cn()` - 343 edges
2. `react` - 40 edges
3. `ApiError` - 28 edges
4. `Bu2Sandbox` - 24 edges
5. `SqliteLedger` - 22 edges
6. `BU2 P0 页面与交互规格 v0.2（Task-first）` - 22 edges
7. `rules` - 21 edges
8. `Button()` - 16 edges
9. `compilerOptions` - 16 edges
10. `AGENTS.md — BU2 金融系统 AI Agent 工程规则` - 14 edges

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

## Communities (81 total, 2 thin omitted)

### Community 0 - "付费需求验证"
Cohesion: 0.38
Nodes (7): 概念及商业验证阶段, 客户访谈, 03-market 市场研究、客户访谈和竞品, 05-operations 路线图、指标和运营记录, 付费需求验证, 02-product 产品定位、需求和原型, 产品原型

### Community 1 - "AP2"
Cohesion: 0.17
Nodes (13): Agent Wallet, AP2, Agent 预算与费用治理, 确定性消费规则, Agent 开发者与 AI 团队, 人工审批, MCP, 非托管与预算编排优先 (+5 more)

### Community 2 - "ApiError"
Cohesion: 0.06
Nodes (31): SimulatedPaymentAdapter, ApiError, Bu2Sandbox, canonical(), clone(), prefix(), requireFields(), createReviewIntent() (+23 more)

### Community 3 - "Agent 信誉"
Cohesion: 0.18
Nodes (11): AI Agent 财务与支付治理平台, Agent 身份, Agent 市场, Agent Passport, Agent 信誉, Audit Ledger, 可审计交易, Budget for agents. Control for humans. (+3 more)

### Community 4 - "cn"
Cohesion: 0.06
Nodes (52): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Card(), CardAction(), CardContent(), CardDescription() (+44 more)

### Community 5 - "sidebar.tsx"
Cohesion: 0.05
Nodes (40): Input(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle() (+32 more)

### Community 6 - "devDependencies"
Cohesion: 0.04
Nodes (48): @cloudflare/vite-plugin, @cloudflare/workers-types, @openai/sites-vite-plugin, oxfmt, oxlint, oxlint-tsgolint, devDependencies, @cloudflare/vite-plugin (+40 more)

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
Cohesion: 0.07
Nodes (29): express, dependencies, express, viem, @x402/core, @x402/evm, @x402/express, @x402/fetch (+21 more)

### Community 13 - "BU2 Task-first P0 正式用户测试方案（已废止）"
Cohesion: 0.07
Nodes (26): 10. 测试结论分级, 11. 测试完成后的交付物, 1. 测试目标, 2. 目标参与者, 3. 测试设置, 4. 主持人开场脚本, 5. 正式测试任务, 6. 结束访谈问题 (+18 more)

### Community 14 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 15 - "x402-wallet.mjs"
Cohesion: 0.13
Nodes (17): defaultPayTo(), X402_FACILITATOR, X402_NETWORK, X402_PRICE, capability, challenge, encoded, result (+9 more)

### Community 16 - "BU2 MVP 产品需求文档 v0.3（Transaction-first）"
Cohesion: 0.10
Nodes (20): 1. 目标, 2. 目标用户, 3. P0 成功标准, 4. 核心对象, 5.1 Agent 付款, 5.2 Agent 收款, 5. 核心流程, 6. P0 功能需求 (+12 more)

### Community 17 - "utils.ts"
Cohesion: 0.09
Nodes (12): AspectRatio(), ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Checkbox(), HoverCardContent(), ResizableHandle() (+4 more)

### Community 18 - "combobox.tsx"
Cohesion: 0.05
Nodes (38): ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxContent(), ComboboxEmpty(), ComboboxGroup(), ComboboxInput() (+30 more)

### Community 19 - "rules"
Cohesion: 0.10
Nodes (21): rules, import/no-anonymous-default-export, no-array-constructor, no-var, prefer-const, prefer-rest-params, prefer-spread, react/display-name (+13 more)

### Community 20 - "BU2 指标与验证计划 v0.1"
Cohesion: 0.13
Nodes (15): 1. 验证目标, 2. 北极星指标, 3. 漏斗指标, 4. 价值指标, 5. 可靠性指标, 6. 客户访谈计划, 7. 原型实验, 9. 90 天验证节奏 (+7 more)

### Community 21 - "page.tsx"
Cohesion: 0.10
Nodes (13): copy, demoTxs, Detail(), formatAmount(), Language, Page, Stage, Status (+5 more)

### Community 22 - "item.tsx"
Cohesion: 0.18
Nodes (12): Item(), ItemActions(), ItemContent(), ItemDescription(), ItemFooter(), ItemGroup(), ItemHeader(), ItemMedia() (+4 more)

### Community 23 - "react"
Cohesion: 0.13
Nodes (15): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+7 more)

### Community 24 - "BU2 预算与审批模型 v0.1"
Cohesion: 0.12
Nodes (17): 10. 钱包阶段的产品边界, 1. 目标, 2. 授权层级, 3. 支出申请契约, 4. 策略条件, 5. 判断结果, 6. 规则优先级, 7. 示例 (+9 more)

### Community 25 - "breadcrumb.tsx"
Cohesion: 0.25
Nodes (7): Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 26 - "context-menu.tsx"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubTrigger() (+1 more)

### Community 27 - "drawer.tsx"
Cohesion: 0.14
Nodes (10): DrawerContent(), DrawerContext, DrawerContextProps, DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerSwipeHandle() (+2 more)

### Community 28 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 29 - "BU2 P0 页面与交互规格 v0.2（Task-first）"
Cohesion: 0.15
Nodes (13): 10. 搜索, 12. 错误与恢复, 13. 原型验收, 1. 原型目标, 3. Tasks（默认首页）, 4. Task Detail, 5. Exceptions, 6.1 费用口径 (+5 more)

### Community 30 - "alert-dialog.tsx"
Cohesion: 0.15
Nodes (9): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogMedia(), AlertDialogOverlay() (+1 more)

### Community 31 - "chart.tsx"
Cohesion: 0.21
Nodes (11): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION (+3 more)

### Community 32 - "toast.tsx"
Cohesion: 0.15
Nodes (7): toast, ToastAction(), ToastClose(), ToastContent(), ToastDescription(), ToastTitle(), ToastViewport()

### Community 33 - "BU2 Agent Payment API 契约 v0.1"
Cohesion: 0.17
Nodes (12): 10. Webhook 事件, 11. 版本边界, 1. 设计原则, 2. 稳定资源, 3. PaymentIntent 最小输入, 4. 状态机, 5. 授权结果, 6. 幂等契约 (+4 more)

### Community 34 - "attachment.tsx"
Cohesion: 0.20
Nodes (11): Attachment(), AttachmentAction(), AttachmentActions(), AttachmentContent(), AttachmentDescription(), AttachmentGroup(), AttachmentMedia(), attachmentMediaVariants (+3 more)

### Community 35 - "8. Go / Iterate / Stop 门槛"
Cohesion: 0.50
Nodes (4): 8. Go / Iterate / Stop 门槛, Go, Iterate, Stop or Reposition

### Community 36 - "ignorePatterns"
Cohesion: 0.18
Nodes (10): ignorePatterns, printWidth, $schema, singleQuote, sortPackageJson, bun.lock, bun.lockb, package-lock.json (+2 more)

### Community 37 - ".oxlintrc.json"
Cohesion: 0.18
Nodes (10): categories, correctness, env, browser, builtin, node, options, typeAware (+2 more)

### Community 38 - "BU2 Product v0.1 验证结论"
Cohesion: 0.17
Nodes (11): Agent Payment API Contract v0.1 验证, BU2 Product v0.1 验证结论, docs/README 当前目录对齐验证, Reference Server v0.1 验证, Reference Server v0.2 验证, Task-first P0 浏览器验收（UT-01～UT-07）, Transaction-first P0 重构验收, x402 Sandbox Adapter v0.3 验证 (+3 more)

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
Nodes (8): ignorePatterns, next-env.d.ts, localBindingConfig, build/**, coverage/**, dist/**, out/**, .vinext/**

### Community 44 - "BU2 信息架构 v0.2（Transaction-first）"
Cohesion: 0.20
Nodes (9): 1. 导航结构, 2. 页面职责, 3. 对象关系, 4. 交易详情信息层级, 5. 状态模型, 6. 嵌入边界, BU2 信息架构 v0.2（Transaction-first）, Payment Intent (+1 more)

### Community 45 - "BU2 Task-first P0 产品基线（已废止）"
Cohesion: 0.22
Nodes (9): 1. 产品定位, 2. 连续交付顺序, 3. 核心对象, 4. 不可破坏契约, 5. 事件流程, 6. 治理模式边界, 7. 原型验收路径, 8. 衡量与边界 (+1 more)

### Community 46 - "button.tsx"
Cohesion: 0.12
Nodes (16): Button(), buttonVariants, Calendar(), CalendarDayButton(), MessageScroller(), MessageScrollerButton(), MessageScrollerContent(), MessageScrollerItem() (+8 more)

### Community 47 - "BU2 Reference Server / x402 Sandbox v0.3"
Cohesion: 0.22
Nodes (8): BU2 Reference Server / x402 Sandbox v0.3, x402 沙盒商户, 启动, 启动完整 x402 BU2 链路, 完整 Agent 交易演示, 本机测试钱包, 沙盒调试端点, 测试

### Community 48 - "1. 首发客户画像"
Cohesion: 0.15
Nodes (12): 1. 首发客户画像, 2. 优先场景, 3. 端到端使用故事, 4. 首批访谈筛选条件, BU2 用户与核心任务 v0.1, Persona A：AI 产品负责人, Persona B：Agent 开发者, Persona C：财务或 FinOps 管理者 (+4 more)

### Community 50 - "layout.tsx"
Cohesion: 0.25
Nodes (5): geistMono, geistSans, metadata, nextConfig, .next/**

### Community 51 - "empty.tsx"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 52 - "plugins"
Cohesion: 0.25
Nodes (8): plugins, eslint, import, jsx-a11y, nextjs, oxc, typescript, unicorn

### Community 55 - "BU2 x402 Base Sepolia 测试钱包"
Cohesion: 0.29
Nodes (7): BU2 x402 Base Sepolia 测试钱包, 官方资料, 当前余额, 当前实测, 钱包, 领取后验证, 领取测试资产

### Community 56 - "avatar.tsx"
Cohesion: 0.29
Nodes (6): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage()

### Community 57 - "bubble.tsx"
Cohesion: 0.38
Nodes (6): Bubble(), BubbleContent(), BubbleGroup(), BubbleReactions(), bubbleReactionsVariants, bubbleVariants

### Community 60 - "popover.tsx"
Cohesion: 0.29
Nodes (4): PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle()

### Community 61 - "toggle-group.tsx"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 62 - "8. 审批"
Cohesion: 0.33
Nodes (6): 8. 审批, 反馈, 右侧详情, 左侧队列, 操作, 页面目标

### Community 64 - "BU2 Persistence、Webhook 与 Adapter v0.2"
Cohesion: 0.33
Nodes (5): 1. 持久化追加账本, 2. Webhook Outbox, 3. 模拟支付 Adapter, 4. 当前边界, BU2 Persistence、Webhook 与 Adapter v0.2

### Community 65 - "BU2 x402 Sandbox Adapter v0.3"
Cohesion: 0.29
Nodes (6): BU2 x402 Sandbox Adapter v0.3, 下一准入门槛, 协议映射, 固定配置与验证, 目标与边界, 资料来源

### Community 66 - "BU2 x402 Base Sepolia 实结算证据"
Cohesion: 0.29
Nodes (7): BU2 x402 Base Sepolia 实结算证据, 产品页面接入, 商户地址修正, 完整 BU2 Agent 支付, 真实 paid probe, 运行状态, 验收结论

### Community 67 - "alert.tsx"
Cohesion: 0.40
Nodes (5): Alert(), AlertAction(), AlertDescription(), AlertTitle(), alertVariants

### Community 69 - "tabs.tsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 70 - "11. 关键空状态"
Cohesion: 0.40
Nodes (5): 11. 关键空状态, Agent 被暂停, 无 Agent, 无交易, 无审批

### Community 71 - "5. Agents"
Cohesion: 0.40
Nodes (5): 5. Agents, 列表字段, 创建 Agent, 状态, 页面目标

### Community 72 - "7. 策略"
Cohesion: 0.40
Nodes (5): 7. 策略, 交互规则, 示例策略, 策略卡片, 页面目标

### Community 73 - "8.1 总览"
Cohesion: 0.40
Nodes (5): 8.1 总览, 交互, 状态, 页面目标, 首屏内容

### Community 74 - "9. 任务与账本"
Cohesion: 0.40
Nodes (5): 9. 任务与账本, 任务详情, 列表字段, 规则, 页面目标

### Community 75 - "BU2 产品文档"
Cohesion: 0.40
Nodes (5): BU2 产品文档, 产品定义, 产品阶段, 当前状态, 文档导航

### Community 77 - "validate-contract.mjs"
Cohesion: 0.40
Nodes (3): flow, here, mcp

### Community 79 - "marker.tsx"
Cohesion: 0.50
Nodes (4): Marker(), MarkerContent(), MarkerIcon(), markerVariants

### Community 82 - "2. 全局框架"
Cohesion: 0.50
Nodes (4): 2. 全局框架, 响应式行为, 左侧导航, 顶部栏

### Community 83 - "4. 项目"
Cohesion: 0.50
Nodes (4): 4. 项目, 交互, 列表字段, 页面目标

### Community 84 - "6. 预算"
Cohesion: 0.50
Nodes (4): 6. 预算, 交互规则, 内容, 页面目标

### Community 94 - "BU2 P0 可点击原型"
Cohesion: 0.50
Nodes (3): BU2 P0 可点击原型, 对应规格, 覆盖页面

## Knowledge Gaps
- **489 isolated node(s):** `here`, `flow`, `mcp`, `$schema`, `singleQuote` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 578 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `sidebar.tsx`, `menubar.tsx`, `utils.ts`, `combobox.tsx`, `page.tsx`, `item.tsx`, `react`, `breadcrumb.tsx`, `context-menu.tsx`, `drawer.tsx`, `carousel.tsx`, `alert-dialog.tsx`, `chart.tsx`, `toast.tsx`, `attachment.tsx`, `navigation-menu.tsx`, `button.tsx`, `empty.tsx`, `avatar.tsx`, `bubble.tsx`, `popover.tsx`, `toggle-group.tsx`, `alert.tsx`, `tabs.tsx`, `marker.tsx`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `cn`, `sidebar.tsx`, `menubar.tsx`, `combobox.tsx`, `page.tsx`, `item.tsx`, `breadcrumb.tsx`, `context-menu.tsx`, `drawer.tsx`, `carousel.tsx`, `alert-dialog.tsx`, `chart.tsx`, `toast.tsx`, `attachment.tsx`, `button.tsx`, `plugins`, `avatar.tsx`, `bubble.tsx`, `popover.tsx`, `toggle-group.tsx`, `alert.tsx`, `marker.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `plugins` connect `plugins` to `.oxlintrc.json`, `react`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `here`, `flow`, `mcp` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ApiError` be split into smaller, more focused modules?**
  _Cohesion score 0.05590386624869383 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.056051587301587304 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.053877551020408164 - nodes in this community are weakly interconnected._