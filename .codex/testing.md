# ENV-02 测试记录

## 2026-09-09 · LA-03c 账务投影重建

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| LA-03b/LA-03c 定向 | `npm --prefix sandbox run test:la03b` | 4/4 通过 |
| LA-03a 回归 | `npm --prefix sandbox run test:la03` | 3/3 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 171/171 通过 |
| ENV-06/F15b/F16a/LA-01 | 对应 Sandbox 专项 | 6/6、4/4、3/3、7/7 通过 |
| API/MCP 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 均通过 |
| Hosted 合约回归 | `npm --prefix sandbox run test:hosted-sandbox && npm --prefix sandbox run test:hosted-deployment && npm --prefix sandbox run test:hosted-evidence-schema` | 8/8、2/2、2/2 通过 |
| 差异检查 | `git diff --check` | 通过 |

覆盖期初、业务和更正 Posting 的账户余额聚合、Journal 平衡计数、安全整数和 SQLite 重启一致性。重建只读，不改变当前钱包投影或任何资金状态。

## 2026-09-09 · LA-03b 期初检查点与追加更正分录

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| LA-03b 定向 | `npm --prefix sandbox run test:la03b` | 3/3 通过 |
| LA-03a 回归 | `npm --prefix sandbox run test:la03` | 3/3 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 170/170 通过 |
| ENV-06/F15b/F16a/LA-01 | 对应 Sandbox 专项 | 6/6、4/4、3/3、7/7 通过 |
| API/MCP 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 均通过 |
| Hosted 合约回归 | `npm --prefix sandbox run test:hosted-sandbox && npm --prefix sandbox run test:hosted-deployment && npm --prefix sandbox run test:hosted-evidence-schema` | 8/8、2/2、2/2 通过 |
| 差异检查 | `git diff --check` | 通过 |

覆盖核对期初检查点、两行平衡分录、SQLite 重启、更正原始事件引用、幂等重放和错环境/科目失败关闭。期初事实不改变当前钱包投影；更正不更新或删除历史事实。

## 2026-09-09 · LA-03a 业务资金事实分录

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| LA-03a 定向 | `npm --prefix sandbox run test:la03` | 3/3 通过 |
| 回归 | `node --test sandbox/f07.test.mjs sandbox/f13.test.mjs sandbox/f14.test.mjs` | 13/13 通过 |
| LA-03a 专项 | `npm --prefix sandbox run test:la03` | 3/3 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 167/167 通过 |
| ENV-06 运营恢复 | `npm --prefix sandbox run test:operations` | 6/6 通过；统一备份与恢复事实计数 |
| F15b/F16a/LA-01 | `npm --prefix sandbox run test:f15b && npm --prefix sandbox run test:f16a && npm --prefix sandbox run test:la01` | 4/4、3/3、7/7 通过 |
| API/MCP 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 均通过 |
| Hosted 合约回归 | `npm --prefix sandbox run test:hosted-sandbox && npm --prefix sandbox run test:hosted-deployment && npm --prefix sandbox run test:hosted-evidence-schema` | 8/8、2/2、2/2 通过 |
| 差异检查 | `git diff --check` | 通过 |

覆盖结算、确认退款、ProviderFee 的双行平衡分录、来源/交易关联、SQLite 重启恢复和同幂等键重放不重复过账。当前仍只验证 Local/Simulation；真实 Provider、Base Sepolia、Hosted、Live/Mainnet、托管钱包和 E3.1 外部试点保持关闭。

## 2026-09-09 · LA-02 成组 Journal / Posting 保护

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| LA-02 定向 | `npm --prefix sandbox run test:la02` | 3/3 通过 |
| 回归 | `node --test sandbox/f07.test.mjs sandbox/f11.test.mjs sandbox/f12.test.mjs sandbox/f13.test.mjs sandbox/f14.test.mjs` | 19/19 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 164/164 通过 |
| API/MCP 契约 | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype build | `npm --prefix prototype run build` | 通过 |
| Hosted 合约回归 | `npm --prefix sandbox run test:hosted-sandbox && npm --prefix sandbox run test:hosted-deployment && npm --prefix sandbox run test:hosted-evidence-schema` | 8/8、2/2、2/2 通过 |
| Prototype lint | `npm --prefix prototype run lint` | 通过 |
| 差异检查 | `git diff --check` | 通过 |

覆盖平衡 Journal、同 ID 内容漂移、借贷不平衡、浮点金额、孤立来源、已过账 UPDATE/DELETE 和超出安全整数的业务输入。完整 Sandbox、SDK、契约、Hosted 合约和 Prototype 门禁均已执行。

本轮未执行真实 Provider、Base Sepolia、Hosted、Live/Mainnet、托管钱包或生产凭证；E3.1 Pilot Manifest 保持暂停。

## 2026-09-09 · LA-01 持久化退款尝试与未决额度占用

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| LA-01 / F13 定向 | `node --test sandbox/f13.test.mjs` | 7/7 通过 |
| 覆盖 | 未知退款占用、未知结果对象失败关闭、外部成功后本地提交失败同键恢复 | 通过 |

本轮未执行真实 Provider、Base Sepolia、Hosted、Live/Mainnet 或托管钱包。E3.1 Pilot Manifest 保持暂停。

## 2026-09-09 · F16b Hosted Sandbox 外部集成基础准入

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F16b foundation qualification | `npm --prefix sandbox run test:f16b-hosted` | 3/3 通过 |
| Hosted Runtime 回归 | `npm --prefix sandbox run test:hosted-sandbox` | 8/8 通过 |
| Hosted 部署契约 | `npm --prefix sandbox run test:hosted-deployment` | 2/2 通过 |
| Hosted Evidence Schema | `npm --prefix sandbox run test:hosted-evidence-schema` | 2/2 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 158/158 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

覆盖 Candidate、Activation、Evidence 的组合资格、制品漂移与候选自授权拒绝、Activation 不匹配、边缘机器鉴权失败和 Live 证据拒绝。结果固定为本地契约资格，`env07b_accepted=false`。

未执行公网 HTTPS/DNS/TLS、托管 Secret、独立外部 Activation、外部机器 E2E、真实 Base Sepolia 双向支付、Live/Mainnet 或托管钱包；这些仍属于 ENV-07B 外部验收。

## 2026-09-09 · F16a 内部 Sandbox 自主双向收付 Beta 候选

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F16a 定向 Beta 验收 | `node --test sandbox/f16a.test.mjs` | 3/3 通过 |
| F15a/F15b 回归 | `node --test sandbox/f15a.test.mjs sandbox/f15a-http.test.mjs sandbox/f15b.test.mjs` | 8/8 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 158/158 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

覆盖预授权 Agent 无逐笔批准完成付款/收款/权益恢复/退款/对账、Provider unknown 重启恢复，以及未预授权商户和 Sandbox/Testnet `execution_disabled` 的失败关闭。真实 Provider、Base Sepolia、Hosted、Live/Mainnet、托管和生产凭证未执行。

# 2026-09-09 · F15b 业务负载、停机与财务恢复验收

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F15b 定向运营验收 | `node --test sandbox/f15b.test.mjs` | 4/4 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 155/155 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

覆盖有限业务负载与 matched 对账、SQLite 重启后的无重复结算、Sandbox/Testnet `execution_disabled` 失败关闭，以及持久业务状态下 Reference Server 的 SIGTERM 优雅停机。未执行真实 Provider、Base Sepolia、Hosted、Live/Mainnet、托管或生产凭证路径。

## 2026-09-09 · F13 Bounded Cancellation & Refund Recovery

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F13 领域与 HTTP | `node --test sandbox/f13.test.mjs sandbox/f13-http.test.mjs` | 5/5 通过 |
| Sandbox 全量 | `npm --prefix sandbox test` | 144/144 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | 生成、格式、Lint、类型检查、构建与 10/10 单测通过 |

边界：未执行 Hosted、Base Sepolia 双向收付、Live/Mainnet、真实 Provider 退款、托管或生产凭证；F13 只验证 Local/Simulation 与既有环境契约。

## 2026-09-08 · F12 Recoverable Paid Access

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F12 定向领域与 HTTP | `node --test sandbox/f12.test.mjs sandbox/f12-http.test.mjs` | 4/4 通过 |
| Reference Server 全量 | `npm --prefix sandbox test` | 139/139 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | generated/format/lint/typecheck/build、10/10 通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

未运行 Base Sepolia 双向收付、Hosted、Mainnet、生产凭证或托管；这些不属于 F12 本地准入范围。

## 2026-09-08 · F11 Inbound Collection Verification

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F11 定向领域与 HTTP | `node --test sandbox/f11.test.mjs sandbox/f11-http.test.mjs` | 4/4 通过 |
| Reference Server 全量 | `npm --prefix sandbox test` | 135/135 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | generated/format/lint/typecheck/build、10/10 通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

未运行 Base Sepolia 双向收款、Hosted、Mainnet、生产凭证或托管；这些不属于 F11 本地准入范围。

## 2026-09-08 · F10 Account-Owned Receivable

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F10 定向领域与 HTTP | `node --test sandbox/f10.test.mjs sandbox/f10-http.test.mjs` | 4/4 通过 |
| Reference Server 全量 | `npm --prefix sandbox test` | 131/131 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | generated/format/lint/typecheck/build、10/10 通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

未运行 Hosted、Base Sepolia 双向付款、Mainnet、生产凭证或托管；这些不属于 F10 本地准入范围。


## 2026-09-08 · F09a 自主支付执行

执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| F09a 定向领域与 HTTP | `node --test sandbox/f09a.test.mjs sandbox/f09a-http.test.mjs` | 4/4 通过 |
| Reference Server 全量 | `npm --prefix sandbox test` | 127/127 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 63 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm --prefix packages/typescript-sdk test` | generated/format/lint/typecheck/build、10/10 通过 |
| Prototype | `npm --prefix prototype run lint && npm --prefix prototype run build` | 通过 |
| Diff | `git diff --check` | 通过 |

未运行真实 Hosted、Base Sepolia 双向付款、Mainnet、生产凭证或托管；这些不属于 F09a 本地准入范围。


日期：2026-09-06  
执行者：Codex

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| ENV-02 专项与相关回归 | `node --test environment-config.test.mjs persistence.test.mjs http.test.mjs` | 22/22 通过，其中专项 7/7 |
| Reference Server | `npm test` | 95/95 通过 |
| API/MCP Contract | `node docs/03-technical/validate-contract.mjs` | 42 invariants、6 MCP tools 通过 |
| TypeScript SDK | `npm test` | 8/8；generated/format/lint/typecheck/build 全通过 |
| Clean-room | `npm run acceptance:clean-room` | HTTP/SDK/MCP 3/3，均为 Local Simulation |
| Prototype | `npm run lint && npm run build` | lint 通过；Vinext 五阶段 build 通过 |
| 文档链接 | 本地 Python 只读检查 | Markdown 185、HTML links/anchors 27，全部通过 |
| HTML | Python `html.parser` | 4/4 通过 |
| Browser | Playwright CLI + Google Chrome | PROJECT/GOVERNANCE desktop、PROJECT mobile；0 error / 0 warning |
| Secret scan | tracked 新增行 + 3 个 untracked 文件 | 0 hit；既有链上交易哈希不计作本轮凭证 |
| Diff | `git diff --check` | 通过 |

未运行真实 Base Sepolia/Mainnet 支付。没有读取、打印或提交钱包/生产凭证。
## 2026-09-06 · ENV-04

- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed.
- `npm --prefix sandbox run acceptance:deployment`: passed; one image reused by Sandbox/Live, both disabled, wrong DB and signer rejected, no secret logged.
- `node docs/03-technical/validate-contract.mjs`: 50 invariants and 6 MCP tools passed.
- `npm --prefix sandbox test`: 101/101 passed.
- `npm --prefix packages/typescript-sdk test`: quality pipeline and 9/9 passed.
- `npm --prefix sandbox run acceptance:clean-room`: 3/3 passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- Playwright CLI / Google Chrome: PROJECT, GOVERNANCE and CHANGELOG desktop/mobile passed; console 0 error/0 warning.
- Not run: hosted Sandbox, cloud, DNS, testnet/mainnet payment, signer/credential loading, backup/restore and production deployment; outside ENV-04 scope.

## 2026-09-06 · ENV-05

- `node docs/03-technical/validate-contract.mjs`: 56 invariants and 6 MCP tools passed.
- `npm --prefix sandbox test`: 109/109 passed, including role/claims, tenant isolation/reset, support redaction, Schema v9 and MCP credential tests.
- `npm --prefix packages/typescript-sdk test`: generated/format/lint/typecheck/build and 10/10 tests passed.
- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed; both units require authenticated access.
- `npm --prefix sandbox run acceptance:deployment`: passed; one image, Sandbox/Live disabled and unauthenticated mutations rejected before domain writes.
- `npm --prefix sandbox run acceptance:clean-room`: HTTP/SDK/MCP 3/3 Local Simulation paths passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- Browser: PROJECT, GOVERNANCE and CHANGELOG rendered over local HTTP; expected ENV-05 content present; console 0 errors/0 warnings.
- Link scan: 53 documentation files, 0 broken relative links. Secret scan: 55 changed/untracked files, 0 suspicious matches. `git diff --check`: passed.
- `graphify update .`: code graph refreshed to 2341 nodes / 3614 edges / 146 communities; no semantic documentation backend configured.
- Not run: hosted edge E2E, public Sandbox/Live, production credential issuance, secret manager, Base Sepolia/Mainnet payment, signer loading or production deployment; outside ENV-05 scope.

## 2026-09-06 · ENV-06

- `npm --prefix sandbox run test:operations`: 6/6 passed, including immutable artifact drift, WAL backup, tamper/cross-environment rejection, disarmed restore, monitoring redaction and CLI evidence preflight.
- `npm --prefix sandbox run acceptance:operations`: passed from clean commit `712efc4`; one image ID used by Sandbox/Live, both backups integrity `ok`, both restores disabled and reconciliation-required, no signer/secret/payment.
- Regression: Contract 59 + MCP 6, Sandbox 109/109, SDK 10/10 plus all quality gates, deployment 2/2 plus real container, clean-room 3/3, Prototype lint/build all passed.
- Browser: PROJECT and CHANGELOG desktop/mobile rendered over local HTTP; ENV-06 status and gate anchor visible; console 0 errors/0 warnings.
- Link scan: final 55 documentation files / 219 relative links / 0 broken. Secret scan: 29 core changed/untracked files / 0 suspicious matches. `git diff --check`: passed.
- First acceptance attempt stopped before BU2 build on Docker Hub metadata EOF; exact Node 22.16 image pull and complete rerun passed.
- Not run: hosted Sandbox, cloud storage, DNS/TLS, formal alert transport, credentials, signer, Base Sepolia/Mainnet payment or Live enablement; outside ENV-06 scope.

## 2026-09-07 · ENV-07A

- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed; file Secret validation, Base Sepolia RPC startup/refusal, immutable Candidate, independent bounded Activation, bilateral/failure/edge Evidence and CLI JSON paths.
- `node docs/03-technical/validate-contract.mjs`: 62 invariants and 6 MCP tools passed.
- `npm --prefix sandbox test`: 109/109 passed.
- `npm --prefix packages/typescript-sdk test`: generated/format/lint/typecheck/build and 10/10 passed.
- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed.
- `npm --prefix sandbox run test:operations`: 6/6 passed.
- `npm --prefix sandbox run acceptance:clean-room`: HTTP/SDK/MCP 3/3 Local Simulation paths passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- Static: Node syntax and `git diff --check` passed; 53 Markdown/HTML files / 223 relative links / 0 broken; 34 changed/new files / 0 high-confidence secret hits.
- Browser: Playwright CLI + local Chrome fallback because Browser plugin was unavailable; PROJECT desktop and CHANGELOG mobile rendered, gate anchor worked, ENV-07A and PR #23 status visible, 0 console errors/warnings.
- Not run: public hosting, DNS/TLS, managed Secret provisioning, real bilateral Base Sepolia payment, provider/webhook hosted fault injection, external Agent traffic, Live/Mainnet execution or custody. These remain ENV-07B and later gates.
- Clean-commit Docker/OrbStack: deployment and operations acceptance passed on `c7e8dd548b4d4500a9426c72f0cde095f705b8ef`; both units stayed authenticated/disarmed, cross-environment faults were rejected, restores required reconciliation, and payment execution was not attempted.

## 2026-09-06 · ENV-07B deployment preparation

- `npm --prefix sandbox run test:hosted-deployment`: 2/2 passed; Hosted Compose resolves to one Sandbox-only execution-enabled unit and rejects mutable images, direct secrets, Live and public ports.
- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed.
- `npm --prefix sandbox test`: 109/109 passed.
- `node docs/03-technical/validate-contract.mjs`: 62 invariants and 6 MCP tools passed.
- `npm --prefix packages/typescript-sdk test`: generated/format/lint/typecheck/build and 10/10 passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- `docker compose --file deploy/hosted-sandbox.compose.yaml config --format json`: resolved one `sandbox` service, immutable image, `execution_enabled`, and three file Secret targets.
- `git diff --check` and Node syntax checks: passed.
- Not run: cloud resources, DNS/TLS, managed Secret creation, independent Activation, real bilateral Base Sepolia payment, hosted edge E2E, Live/Mainnet execution or custody.

## 2026-09-06 · ENV-07B external acceptance pack

- `npm --prefix sandbox run test:hosted-evidence-schema`: 2/2 passed; bounded bilateral evidence accepted, Live/missing direction/raw payload fields rejected.
- `node docs/03-technical/validate-contract.mjs`: 63 invariants and 6 MCP tools passed.
- `npm --prefix sandbox run test:hosted-deployment`: 2/2 passed.
- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed.
- `npm --prefix sandbox test`: 109/109 passed.
- `npm --prefix packages/typescript-sdk test`: generated/format/lint/typecheck/build and 10/10 passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- `docker compose --file deploy/hosted-sandbox.compose.yaml config --format json`: resolved Sandbox-only service.
- `git diff --check` and Node syntax checks: passed; targeted changed files contained no private-key, Bearer or raw credential pattern.
- Not run: cloud resources, DNS/TLS, managed Secret creation, independent Activation, real bilateral Base Sepolia payment, hosted edge E2E, Live/Mainnet execution or custody.

## 2026-09-06 · Internal OrbStack Sandbox acceptance

- `npm --prefix sandbox test`: 109/109 passed.
- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed.
- `npm --prefix sandbox run test:hosted-deployment`: 2/2 passed.
- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed.
- `npm --prefix sandbox run acceptance:deployment`: passed; Sandbox/Live remained authenticated and `execution_disabled`, cross-environment faults rejected, no payment attempted.
- OrbStack container smoke: `/health` returned healthy; `/v1/environment` returned Sandbox, Base Sepolia `84532`, `eip155:84532`, x402 and authenticated access; unauthenticated mutation returned HTTP 401 `credential_required`.
- Artifact: Linux ARM64 image `sha256:9210d6649bc7e4d1b570c64b52d5aaa97061c16a3d7912b705fc6db7306ee7e6`.
- Temporary Compose container and volume were removed after verification.
- Not run: real Base Sepolia payment, execution-enabled signer injection, public DNS/TLS, hosted edge E2E, external Agent traffic or Live/Mainnet execution.

## 2026-09-06 · Base Sepolia x402 preflight

- `npm run x402:wallet`: wallet status read without printing the private key; Base Sepolia USDC `9.98`, native ETH `0`.
- `npm run x402:merchant`: local x402 merchant started on `127.0.0.1:4021`.
- `npm run x402:probe:funded`: x402 v2 challenge and facilitator capability passed; settlement did not complete. Facilitator returned `invalid_exact_evm_transaction_failed` with `replacement transaction underpriced`; no confirmed transaction hash was produced.
- The merchant process was stopped and no automatic retry was attempted.
- Gate result: Testnet execution remains blocked until the buyer wallet has Base Sepolia gas ETH and the bounded payment is explicitly retried.

## 2026-09-06 · Bounded Base Sepolia x402 settlement

- `npm run x402:wallet`: passed; Base Sepolia wallet had `0.0011 ETH` and `9.98 USDC`, with `ready: true`.
- `npm run x402:probe:funded`: passed for one bounded `0.01 USDC` request; x402 v2 challenge and facilitator capability passed, and the facilitator returned a real transaction reference.
- viem public RPC receipt query: passed; transaction `0xc5d4b9753072829ff5fc3eef923ecf479dec645a424f6ee471cc05bd12c9d9d5` had receipt status `success` in block `46477384`.
- Browser explorer check: blocked by Cloudflare HTTP 403; this does not invalidate the RPC receipt check.
- Safety boundary: no private key, seed phrase, password or Mainnet asset was entered; no automatic retry was performed.

## 2026-09-06 · ENV-07B Candidate preparation

- `npm run test:hosted-sandbox`: 8/8 passed after Candidate generation.
- `node deploy/hosted-sandbox-cli.mjs candidate`: passed after correcting the incomplete artifact digest; generated Candidate remains non-authorizing and requires independent Activation.
- `git diff --check`: passed.

## 2026-09-06 · F06a account-agent onboarding

- `npm --prefix sandbox test`: 112/112 passed, including persistent identity onboarding, restart recovery, raw-token rejection, ownership exposure and credential binding checks.
- `npm --prefix packages/typescript-sdk test`: generated contract, format, lint, typecheck, build and 10/10 unit tests passed.
- `node docs/03-technical/validate-contract.mjs`: 63 invariants and 6 MCP tools passed.
- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed.
- `npm --prefix sandbox run test:operations`: 6/6 passed.
- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed.
- `npm --prefix sandbox run acceptance:clean-room`: HTTP/SDK/MCP 3/3 Local Simulation paths passed.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- `git diff --check`: passed after removing the unused identity fingerprint helper.
- Scope boundary: no Signer, Live/Mainnet, Hosted deployment, or new payment execution was enabled.

## 2026-09-07 · F06b funding source and receiving target bindings

- `npm --prefix sandbox test`: 115/115 passed, including the new F06b binding normalization, persistence, restart, tenant/environment/asset/network/reference drift and idempotency coverage.
- `npm --prefix packages/typescript-sdk test`: generated check, format check, lint, typecheck, build and 10/10 unit tests passed.
- `node docs/03-technical/validate-contract.mjs`: 63 invariants and 6 MCP tools passed.
- `git diff --check`: passed after updating the F06b technical, operations, root, Sandbox and changelog documentation.
- Not run: public Hosted Sandbox, DNS/TLS, managed Secrets, Live/Mainnet, custody or new external payment execution; these remain outside F06b.

## 2026-09-07 · 后续 PR 路线图梳理

- Read-only planning task; no production or transaction code was changed.
- Executed `graphify query "基于当前已合并基线，后续还需要开发哪些 PR？请区分代码开发、部署验收、外部试点和暂不开发事项，并说明依赖关系。"`; graph traversal completed against `graphify-out/graph.json` (2472 nodes).
- Executed `rg`/`sed` against Epic, environment and F06b documents; confirmed current PR sequence and acceptance commands from source documents.
- Not run: unit/integration/build suites, because this task only produced a roadmap and did not modify executable code.

## 2026-09-07 · D0 Phase 0 业务路线与文档基线

- `git diff --check`: passed.
- `rg` stale-marker scan: passed; no remaining `R2 review pending`, legacy F07/F08 headings, or obsolete Epic 3 prerequisite wording in active docs.
- Markdown/link consistency scan: passed for the new roadmap references in root, product and technical indexes.
- `node docs/03-technical/validate-contract.mjs`: passed; 63 invariants and 6 MCP tools remain valid after documentation updates.
- Not run: sandbox unit/integration, SDK, prototype lint/build or hosted acceptance suites; D0 changed documentation only.
- Risk assessment: R0; executable behavior and financial state are unchanged.

## 2026-09-08 · D1 F07 财务边界契约

- `git diff --check`: passed.
- `node docs/03-technical/validate-contract.mjs`: passed; 63 invariants and 6 MCP tools remain valid.
- `npm --prefix sandbox test`: passed; 115/115 tests.
- `npm --prefix packages/typescript-sdk test`: passed; generated/format/lint/typecheck/build and 10/10 unit tests.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- Markdown relative-link scan: passed for changed documentation links.
- Not run: F07 runtime, migration, browser, Sandbox/Testnet payment and hosted E2E; D1 intentionally changes documentation only.
- Boundary: no API, Schema, transaction state, balance, Ledger, Adapter, signer or environment behavior changed.

## 2026-09-08 · F07 Budget Hold / Financial Posting implementation

- `node --test sandbox/f07.test.mjs`: passed; 3/3 targeted tests for budget creation, hold consumption, over-budget rejection and restart recovery.
- `npm --prefix sandbox test`: passed; 118/118 tests, including existing F06a/F06b, atomicity, webhook, x402 and environment suites.
- `npm --prefix packages/typescript-sdk test`: passed; generated contract, format, lint, typecheck, build and 10/10 unit tests.
- `node docs/03-technical/validate-contract.mjs`: passed; 63 invariants and 6 MCP tools remain valid.
- Boundary: Schema v12 adds `budgets`, `budget_holds` and `financial_postings`; F07 mutations reuse existing Transaction Core atomic commit, idempotency claim, wallet CAS and Webhook Outbox. No F08 Mandate, Live/Mainnet or custody capability was enabled.

## 2026-09-08 · D2 F08 Payment Mandate 契约

- `git diff --check`: passed。
- `node docs/03-technical/validate-contract.mjs`: passed；63 invariants and 6 MCP tools remain valid。
- Markdown relative-link scan: passed for the new F08 contract and synchronized indexes。
- Stale-state scan: passed；D2 is documented as a prerequisite and F08 runtime remains not implemented。
- Not run: Sandbox unit/integration, SDK, Prototype, browser, Testnet payment and Hosted E2E；D2 changes documentation only。
- Boundary: no API, Schema, transaction state, budget hold, ledger, adapter, signer, environment or payment behavior changed。

## 2026-09-06 · Internal Sandbox Product Baseline

- `node --test deploy/local-sandbox.test.mjs`: 3/3 passed.
- `npm --prefix sandbox run test:hosted-sandbox`: 8/8 passed.
- `npm --prefix sandbox test`: 109/109 passed.
- `npm --prefix sandbox run test:deployment-contract`: 2/2 passed.
- `npm --prefix sandbox run sandbox:up`: passed on OrbStack; health and environment preflight passed.
- `npm --prefix sandbox run sandbox:doctor`: passed; Sandbox/Base Sepolia/x402/authenticated/`execution_disabled`.
- `npm --prefix sandbox run sandbox:status`: passed; context `orbstack`, loopback port `3110`, healthy service.
- Unauthenticated quote mutation smoke: HTTP 401 `credential_required`.
- `git diff --check`: passed.
## 2026-09-08 · F08 Payment Mandate 运行时

- `node --test sandbox/f08.test.mjs`：4/4 通过，覆盖 Mandate 创建/激活、PolicyDecision、版本冲突、幂等终态和持久钱包绑定门槛。
- `npm --prefix sandbox test`：123/123 通过。
- `node docs/03-technical/validate-contract.mjs`：63 项不变量、6 个 MCP 工具通过。
- `npm --prefix packages/typescript-sdk test`：生成检查、格式、Lint、类型检查、构建和 10/10 单测通过。
- `npm --prefix prototype run lint && npm --prefix prototype run build`：通过。
- `git diff --check`：通过。
- 未执行：真实 Sandbox/Testnet 双向收付、Hosted E2E、Live/Mainnet、托管或生产凭证验证；F08 明确不开放这些能力。
## 2026-09-08 · F09a 自主支付执行

- `node --test sandbox/f09a.test.mjs`：3/3 通过，覆盖 approved deferred 执行、幂等重放、review_required 绕过阻断和 Mandate 暂停失败关闭。
- 全量 Sandbox、SDK、契约、Prototype 与 diff 验证待本轮文档同步后执行。
## 2026-09-09 · F14 reconciliation implementation

- `node --test sandbox/f14.test.mjs sandbox/f14-http.test.mjs`: currently 3/3 passed; covers fee source binding, matched totals, pending unknown state, idempotency boundary and HTTP resources.
- `npm --prefix packages/typescript-sdk run generate && npm --prefix packages/typescript-sdk run format`: passed; generated OpenAPI types include ProviderFee and ReconciliationRun.
- `npm --prefix packages/typescript-sdk run check:generated && npm --prefix packages/typescript-sdk run typecheck && npm --prefix packages/typescript-sdk run lint`: passed.
- `npm --prefix sandbox test`: 147/147 passed, including F14 domain and HTTP tests.
- `node docs/03-technical/validate-contract.mjs`: 63 invariants and 6 MCP tools passed after F14 implementation.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- `git diff --check`: passed.
- Not run: external Hosted/Testnet reconciliation or Live/Mainnet execution. These remain closed by contract.
## 2026-09-09 · F15a bounded internal execution sessions

- `node --test sandbox/f15a.test.mjs sandbox/f15a-http.test.mjs`: 4/4 passed; covered independent activation, 15-minute window, session-bound payment reservation/settlement, SQLite restart and HTTP lifecycle.
- `node docs/03-technical/validate-contract.mjs`: 63 invariants and 6 MCP tools passed after the OpenAPI/access contract update.
- `npm --prefix packages/typescript-sdk test`: generated contract, format, lint, typecheck, build and 10/10 unit tests passed.
- `npm --prefix sandbox test`: 151/151 passed, including F07-F14, environment, atomicity, x402 and restart regression.
- `npm --prefix prototype run lint && npm --prefix prototype run build`: passed.
- `git diff --check`: passed.
- Not run: Hosted Sandbox, public DNS/TLS, real Base Sepolia, Live/Mainnet, custody or production credentials.
