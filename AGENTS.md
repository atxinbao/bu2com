# AGENTS.md — BU2 金融系统 AI Agent 工程规则

> 版本：1.1
> 生效日期：2026-09-06
> 制定与维护：BU2 Engineering / Codex  
> 适用范围：本文件所在目录及全部子目录。子目录可以增加更严格的规则，不得削弱本文件。

## 1. 使命与优先级

BU2.com 是 Agent 的 AI 收付平台。任何 AI Agent 的首要职责不是“尽快完成代码”，而是保护交易事实、客户资金、授权边界和可审计性。

规则优先级如下：

1. 法律、监管、支付通道和生产运行约束；
2. 本文件；
3. [`PROJECT.html`](PROJECT.html) 中冻结的项目定位、执行模式和阶段准入门槛；
4. [`ARCHITECTURE.html`](ARCHITECTURE.html)；
5. [`GOVERNANCE.html`](GOVERNANCE.html) 定义的责任、决策、变更、发布、例外、事故和退役制度；
6. [`CHANGELOG.html`](CHANGELOG.html) 与实际代码、契约和行为的一致性；
7. 已批准的 ADR、API/事件 Schema 和数据库迁移规范；
8. 模块 README、测试约定和代码风格；
9. 临时需求与实现便利性。

发生冲突时必须停止相关写操作，说明冲突、影响范围和建议决策，不得静默选择更宽松的规则。

## 2. Agent 工作模式

### 2.1 默认行为

- 先阅读本文件、`PROJECT.html`、`ARCHITECTURE.html`、`GOVERNANCE.html`、`CHANGELOG.html`、目标模块 README、相关 Schema、迁移和测试。
- 修改前检查工作区状态，区分已有变更与本次变更；不得覆盖或清理不属于本任务的内容。
- 每次修改代码、Schema、依赖、配置或系统行为时，必须在同一个变更集中同步更新 `CHANGELOG.html`；不得承诺以后补写。
- 先定位交易边界、数据所有者、调用链和失败路径，再编写代码。
- 优先复用官方 SDK、成熟库和项目现有模式，禁止重复实现密码学、金额计算、协议解析或持久化基础设施。
- 采用小步修改；每一步必须可验证、可回滚且不破坏历史数据解释能力。
- 所有结论必须引用代码、测试、Schema、日志或正式文档证据，不得把推测表述为事实。

### 2.2 变更前必须回答

Agent 在修改交易、资金、账本、授权、结算、退款、Receipt、Webhook 或 Adapter 代码前，必须明确：

1. 谁拥有这份数据，谁可以改变状态？
2. 输入是否可信，运行时如何验证？
3. 幂等键的作用域、指纹和重放结果是什么？
4. 数据库事务边界在哪里？
5. 外部调用超时后如何判断“未知”而非错误地判定失败？
6. 重试、并发和重复 Webhook 会不会造成重复扣款或重复结算？
7. 会新增哪些 LedgerEvent，能否据此解释和重建结果？
8. 失败时资金、状态、Outbox 和 Adapter 操作记录分别处于什么状态？
9. 旧 API、事件、Receipt 和数据如何继续解释或迁移？
10. 用哪些自动化测试证明以上性质？

无法回答任一问题时，不得进入实现阶段。

## 3. 金融领域不可变规则

### 3.1 交易状态所有权

- 只有 `Transaction Core` 可以改变 `PaymentIntent`、`Authorization`、`Transaction`、`Settlement`、`Refund` 和 `Dispute` 状态。
- Webhook、Worker、Adapter、签名、通知、分析和对账模块只能提交命令、结果或证据，不得直接更新核心交易状态。
- 不得为了服务拆分、性能或开发便利破坏 Transaction Core 的强一致事务边界。

### 3.2 账本与历史

- `LedgerEvent` 只允许追加，不允许更新含义、物理删除或覆盖历史。
- 更正必须写入新的补偿或更正事件，并关联原事件。
- 当前状态是投影，不是历史真相；关键状态必须能通过账本验证并最终可重建。
- 事件必须具备稳定的 `event_id`、聚合标识、聚合版本、顺序号、发生时间与记录时间。
- Agent 不得编写“清空账本”“重写交易历史”或绕过事件写入的生产路径。

### 3.3 金额与币种

- 金额只能使用整数最小货币单位和明确的 ISO 4217 币种；禁止二进制浮点金额。
- 请求、授权、预留、结算、退款和费用必须分别保存，不得复用同一字段覆盖。
- 必须维持：`refunded <= settled <= reserved <= authorized`。
- 所有金额转换、精度、舍入和汇率来源必须显式、版本化并有边界测试。
- 不同币种不得隐式比较、相加或结算。

### 3.4 状态分离

- `authorization_required`、`authorized`、`funds_reserved`、`delivery_submitted`、`settled`、`refunded`、`disputed` 永远是不同事实。
- 授权不等于扣款，预留不等于结算，交付不等于验收，通道响应成功不等于 BU2 已完成结算。
- 非法状态转换必须失败关闭，并且不得移动资金。

### 3.5 幂等、并发与超时

- 每个可能影响资金的操作必须具备端到端幂等：API、Transaction Core、Adapter 和支付提供商使用可追踪的关联键。
- 同一幂等键与相同载荷返回原结果；同一键与不同载荷必须拒绝并记录冲突。
- 幂等记录必须与业务结果具备一致的持久化边界，不能只存在于进程内存或短期缓存。
- 并发写入必须使用唯一约束、聚合版本或等效机制，不能依赖“先查询再写入”。
- 外部支付请求超时表示结果未知。不得直接标记失败、释放资金或自动重新扣款；必须查询通道、接收回调或进入对账流程。

### 3.6 授权与支付委托

- 每次支出必须能够追溯到 Account、AgentIdentity、PaymentMandate、用途、金额、币种、收款方和有效期。
- 默认拒绝超预算、超授权范围、过期委托、未知收款方或策略无法确定的请求。
- 人工审批不能修改历史请求；批准、拒绝和条件调整必须形成独立、可审计的决策记录。
- Agent 不得自行扩大授权、提高预算、伪造审批、替用户接受条款或规避策略引擎。

### 3.7 Adapter 与外部协议

- x402、AP2、银行卡、稳定币、银行转账等只能通过标准 Adapter 接口接入。
- Adapter 必须验证金额、币种、收款方、网络、通道引用和返回结果，不得让外部协议重新定义 BU2 核心状态。
- Adapter 不得直接写 Transaction Core 数据库，不得绕过 PaymentMandate、幂等、交付证据、Receipt 或对账。
- 通道原始响应应保留为证据，但不得直接作为已结算事实。
- 新 Adapter 必须先在 local simulated 完成契约与故障注入，再在隔离 Sandbox 完成真实测试网对账，才可申请 Live 接入。

### 3.8 Receipt、签名与凭证

- Receipt 必须包含明确的 Schema 版本、规范化版本、签名算法、验证密钥标识和签名时间，并能脱离 BU2 主系统验证。
- 生产私钥、钱包私钥、支付密钥和 Webhook Secret 不得写入代码、测试夹具、日志、Prompt、账本或提交记录。
- 使用官方、经过审查的密码学库；禁止 Agent 自行设计签名算法、密钥派生、加密格式或随机数方案。
- 日志和错误信息必须脱敏；禁止输出 Authorization header、Cookie、完整凭证、私钥、支付令牌或个人敏感数据。

## 4. 数据库与迁移规则

- 所有 Schema 变更必须通过版本化迁移完成；禁止在生产启动流程中临时修改表结构。
- 资金约束必须同时存在于领域代码和数据库约束中，包括唯一性、非负金额和退款/结算上限。
- 迁移默认采用 expand → migrate/backfill → verify → switch → contract，避免一次性破坏性变更。
- 迁移必须说明前向步骤、回滚或前滚恢复方案、锁表风险、数据量影响、校验查询和旧版本兼容期。
- 不得删除列、表、事件类型或历史数据，除非存在批准的 ADR、归档证明、迁移验证和恢复演练。
- 数据修复必须可重复、可审计、限量执行，并在执行前后生成校验结果；禁止无条件全表更新。
- local、Sandbox 和 Live 必须使用隔离的数据、凭证、密钥和支付账户。

### 4.1 系统环境契约

- 对外服务环境只有 `sandbox` 与 `live`；内部本地执行环境为 `local`。Mainnet 是 Live 的网络属性，Simulation 是 local 的执行后端，均不得另建对外环境枚举。
- `local + simulated`、`sandbox + x402 + eip155:84532`、`live + x402 + eip155:8453` 是唯一批准组合；其他组合必须失败关闭，不得跨链或降级为模拟成功。
- 服务环境、执行后端和资金准入相互独立。不得从 Adapter 名称猜测环境，不得把 `live`、配置文件或布尔开关解释成资金许可。
- Live 初始为 `execution_disabled`。只有 G-L、有效 CapabilityGrant、租户启用和 PaymentMandate 同时成立，才可在独立授权范围内启用签名或广播。
- Sandbox 与 Live 必须使用独立数据库、API 凭证、Signer、Receipt 信任域、Webhook、队列、存储、备份、Provider/RPC 和运行身份；只允许复用同一已验证软件制品与版本化模板。
- 数据库环境 metadata、RPC chain id、资产、Signer、Provider 和 Receipt issuer 任一不一致时，停止资金启动并保留只读查询、观察与对账。
- 旧 Receipt 的 `simulation/testnet` 字段、签名字节、schema 和 canonicalization 必须原样保留并按原版本验证；不得批量改名或重签历史。
- 详细契约以 `docs/03-technical/SYSTEM_ENVIRONMENTS_V1.md`、ADR-0001 和环境验收矩阵为准。ENV-02/03 合并前，不得宣称现有运行时已经实现新环境语义。

## 5. API、事件和版本兼容

- 所有外部输入必须运行时校验；TypeScript 类型不能替代边界验证。
- API、事件、Receipt、Policy、Adapter 和数据库迁移必须独立版本化。
- 已发布字段不得改变含义或被复用；兼容版本只能增加可选字段。
- 不兼容变化必须使用新版本或新事件名称，并提供迁移期、双读/双写策略与停止旧版本的客观条件。
- 事件消费者必须幂等；事件投递采用至少一次语义时，重复事件不得产生重复业务结果。
- Transactional Outbox 的事件和业务事务必须原子提交；禁止“先提交业务、再尽力发消息”。

## 6. 生产操作与权限边界

### 6.1 Agent 可以自主执行

- 阅读代码、文档、Schema、测试和非敏感日志；
- 在 local 或隔离 Sandbox 中修改代码并运行与该环境相符的自动化测试；
- 在 local 使用模拟支付通道，或在已批准 Sandbox 使用限额测试钱包和测试凭证；
- 生成迁移草案、回滚方案、风险分析和只读对账报告；
- 修复不会触碰真实资金、生产数据或生产凭证的普通缺陷。

### 6.2 必须获得明确人工批准

- 生产部署、流量切换、生产数据库迁移或回滚；
- 启用真实支付通道、主网链、真实钱包或生产签名密钥；
- 执行退款、结算、资金释放、人工调账或争议处理；
- 修改预算、PaymentMandate、审批策略、费率、限额或风控阈值；
- 访问生产敏感数据、导出客户数据或轮换生产密钥；
- 删除数据、停用审计、跳过测试或绕过明确的人工批准；
- 执行可能导致外部费用、不可逆操作或客户可见通知的命令。

批准必须包含环境、目标、金额/数据范围、命令或版本、有效时间和批准人。模糊的“可以”“继续”不能解释为生产资金操作授权。

### 6.3 Agent 永远不得执行

- 使用或推测真实客户凭证、私钥、助记词或支付令牌；
- 在日志、输出或 Prompt 中暴露秘密；
- 绕过授权、策略、审计、幂等、对账或人工审批；
- 将模拟测试结果描述成生产验证结果；
- 伪造交易、Receipt、审批、测试、监控或对账证据；
- 在结果未知时重复发起可能扣款的操作；
- 使用 `DROP`、`TRUNCATE`、无范围 `DELETE/UPDATE` 或等效破坏性操作处理生产数据；
- 直接向主分支推送或自动合并涉及资金路径的变更。

## 7. 代码实现规则

- 金融领域逻辑必须是确定性的；时间、UUID、随机数、汇率和外部状态通过明确依赖注入，便于重放与测试。
- 领域状态机与 HTTP/UI 分离；UI 不得成为资金规则的唯一实现位置。
- 错误必须使用稳定的机器可读错误码，并区分验证失败、策略拒绝、非法状态、通道失败、未知结果和内部错误。
- 不得吞掉异常或仅记录后继续；资金路径必须明确失败状态和恢复责任。
- 重试必须有上限、退避、抖动和可观测性；只对已证明安全且幂等的操作重试。
- 金融日志使用结构化字段并贯穿 `trace_id`、`request_id`、`account_id`、`agent_id`、`payment_intent_id`、`transaction_id`、`event_id` 和 provider reference。
- 优先修复根因，禁止通过放宽校验、删除断言、跳过测试或捕获所有异常来“修复”失败。
- 代码注释说明业务原因和约束，不复述语法；涉及资金不变量时必须引用相应条款或测试。

## 8. 强制测试矩阵

任何影响交易路径的变更必须覆盖正常流程、边界条件、并发、失败和恢复。至少验证：

1. 相同幂等键与相同载荷只产生一次结果；
2. 相同幂等键与不同载荷被拒绝；
3. 未授权不能预留，未交付不能结算；
4. 退款不超过结算，结算不超过预留；
5. 并发授权、结算、退款只能成功一次；
6. Adapter 超时、失败和未知结果不会重复移动资金；
7. 重启后资源、幂等记录、账本、Outbox 和 Adapter 操作可恢复；
8. Webhook 重复投递不会重复处理，失败会进入受控重试或死信；
9. Ledger 顺序稳定并可验证/重建关键状态；
10. Receipt 可使用归档公钥独立验证；
11. 旧 API、事件和历史数据仍可解释；
12. 日志与错误输出不包含秘密或敏感支付数据。

当前项目的基础验证命令：

```bash
# 交易核心、持久化、HTTP、Webhook 与 x402 Sandbox
cd sandbox
npm test

# 前端静态检查和构建
cd ../prototype
npm run lint
npm run build
```

不得只报告“命令成功”。交付时必须列出实际执行的命令、通过/失败数量、未执行项及原因，并明确测试环境不是生产证明。

## 9. 变更风险等级与交付门槛

### R0 — 文档与纯展示

不影响契约、金额或交易状态。要求格式检查和相关页面/链接验证。

### R1 — 普通应用逻辑

不触碰资金路径。要求 lint、类型检查、单元测试和构建。

### R2 — 交易相关

涉及状态机、金额、授权、账本、持久化、Webhook、Adapter 或 Receipt。必须包含：

- 设计说明和不变量清单；
- 单元、集成、契约、并发、故障恢复测试；
- 数据与 API 兼容分析；
- 回滚/前滚恢复方案；
- 至少一名独立审查者批准后才可合并。

### R3 — 生产资金与不可逆变更

涉及真实资金、生产迁移、密钥、主网或支付通道。除 R2 外，还必须包含：

- Project Owner 明确批准和清晰的变更窗口；
- 当前单人治理阶段允许在 Project Owner 明确批准后执行 R3 操作；批准必须写明环境、目标、金额或数据范围、命令或版本、执行窗口、停止条件和恢复方式；
- PR 合并本身不自动构成生产执行授权，但 Project Owner 可以在执行前以独立、明确且限定范围的授权批准真实资金、主网、生产密钥、生产迁移或不可逆操作；
- Project Owner 授权不得绕过 `PROJECT.html` 中当前生效的阶段准入门槛；需要扩大能力边界时，必须先更新并批准项目总纲。
- Sandbox 端到端证据；
- Canary/限额策略和停止条件；
- 实时监控、对账与回滚负责人；
- 执行前快照/备份及恢复演练结果；
- 人工执行或逐步确认，禁止 Agent 无人值守完成。

## 10. 提交前检查清单

Agent 在交付前必须逐项确认：

- [ ] 变更范围与用户请求一致，没有夹带重构或依赖升级；
- [ ] 未违反 `ARCHITECTURE.html`，如有架构变化已附 ADR；
- [ ] 没有秘密、真实账户、生产地址或客户数据进入变更；
- [ ] 金额、状态、授权、幂等、并发和失败恢复不变量已验证；
- [ ] LedgerEvent、Outbox、Receipt 和对账影响已说明；
- [ ] API、事件、Schema 和历史数据兼容性已检查；
- [ ] `CHANGELOG.html` 已在同一变更中更新，内容与实际代码、契约、数据和行为完全一致；
- [ ] 自动化测试已实际运行并记录结果；
- [ ] 生产相关步骤已停在人工审批之前；
- [ ] 剩余风险、未覆盖路径和回滚方式已明确报告；
- [ ] 文档、代码和测试表达的是同一套业务事实。

## 11. 规则维护

- 修改本文件属于 R2 变更，必须说明为何现有规则不足以及对金融不变量的影响。
- 不得通过子目录 `AGENTS.md`、README、代码注释或 Prompt 放宽本文件。
- 新增支付通道、资产类型、结算网络或监管区域时，必须先更新相关 ADR、测试矩阵和本文件。
- 事故复盘发现新的系统性风险时，必须把对应防线转化为可自动验证的规则或永久回归测试。

## 12. CHANGELOG 强制对齐规则

- `CHANGELOG.html` 是项目代码、契约、数据、依赖、配置和可观察行为变化的正式人类可读记录。
- 任何上述修改都必须在同一个提交或变更集中更新 `CHANGELOG.html`；没有日志记录的修改视为未完成。
- 日志必须描述业务或系统行为变化，而不能只罗列文件名、提交号或“优化”“修复”等模糊措辞。
- 每条记录至少包含：日期或版本、变更类别、风险等级、影响范围、金融不变量影响、实际验证证据和恢复方案。
- 涉及 API、事件、Receipt、数据库、状态机、金额、授权、账本、Adapter 或支付通道时，必须逐项说明兼容性与迁移影响。
- 纯格式化、注释或内部重构也必须记录，但可以合并为一条 R0/R1 记录；不得以“用户不可见”为由跳过。
- 代码与日志冲突时，以已验证的实际行为为准，并在交付前修正日志；不得用日志掩盖实现差异。
- 发布时必须把相关 `Unreleased` 条目归入明确版本和发布日期，且不得改写已发布历史；更正历史记录必须新增更正说明。
- Agent 在最终答复中必须明确说明 `CHANGELOG.html` 是否已更新，以及对应条目的标题。

本文件的目标不是限制 AI Agent 的效率，而是确保任何 Agent 的速度都不会快过 BU2 对资金事实的理解、验证和恢复能力。

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
