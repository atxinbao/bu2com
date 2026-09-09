# ENV-03 操作日志

## 2026-09-10 · CI-04 定时账本韧性与供应链检查

- Scope: PR #70 合并后同步 `main` 到 `0910906`，清理 CI-03 本地/远端分支，创建 `ci/ledger-resilience-supply-chain`；新增定时韧性与供应链证据，不改变交易状态机或资金能力。
- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: confirmed PR #70 merged and removed the merged local branch.
- Tool: Graphify `reflect` / `query`, `rg`, `sed`, `npm audit`; result: traced CI-04 to real fault, migration, backup/recovery and SQLite modules; initial audit found upgradeable high advisories in the SDK toolchain and Prototype dependencies.
- Decision: reuse existing real-module tests, add fixed-seed property/capacity coverage, preserve complete logs, and upgrade affected dependencies instead of creating an initial permanent exception baseline.
- Tool: `apply_patch`, `npm install --package-lock-only`; result: added the nightly workflow/runners/contracts, upgraded SDK Redocly/js-yaml and Prototype React/vinext/Vite/Cloudflare dependencies, and pinned `sharp@0.35.4` with an exact override. No automatic audit fix was used.
- Tool: `node`, `npm`, Ruby YAML parser; result: CI tests 18/18, property/capacity 5/5, nightly real-module matrix 68/68, LA-06a Sandbox 207/207 plus all seven checks, three workspace audits 0 vulnerabilities, SDK 10/10 and Prototype lint/build passed.
- Tool: `apply_patch`; result: fixed the property test to assert Journal/Posting persistence rather than unrelated LedgerEvent rows, and made malformed workspace manifests/lockfiles preserve failure evidence before failing closed.
- Tool: `node --test`, `npm`, `jq`, Ruby YAML/link checks, `git diff --check`; result: final CI script tests 18/18, property/capacity 5/5, three workspace audits 0 vulnerabilities, and all syntax/link/whitespace checks passed.
- Decision: pin both nightly jobs to the approved `Node 22.16.0` through the reviewed full SHA of official `actions/setup-node`; do not inherit a moving runner default.
- Tool: `npm audit`; result: removed `--package-lock-only` after its retiring quick endpoint produced intermittent TLS/400 failures; installed-tree `npm audit --json` uses the official bulk advisory endpoint and is protected by a command-level regression test.
- Tool: `graphify update .`; result: refreshed the repository AST graph to 3,785 nodes, 6,188 edges and 251 communities after the CI-04 code changes.
- Boundary: scheduled Local/Simulation evidence only; no Signer, Provider, Hosted, Sandbox/Testnet bilateral settlement, Live/Mainnet, release publication or real funds.

## 2026-09-09 · LA-05b Draft PR

- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `8dcf5f6`, pushed `feat/ledger-assurance-history-replay-catchup`, and opened Draft PR #52 at `https://github.com/atxinbao/bu2com/pull/52` using `.github/pull_request_template.md`.
- Review boundary: PR #52 is an R2 review candidate for historical ledger replay and backup catch-up evidence; it does not complete LA-06, Hosted/Testnet acceptance, real Provider reconciliation, or E3.1.

## 2026-09-09 · LA-05b 历史账务重放与备份追平

- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #51 merged at `b79eb8c`, synchronized `main`, deleted `feat/ledger-assurance-independent-reconciliation`, and created `feat/ledger-assurance-history-replay-catchup`.
- Tool: `graphify query`, `rg`, `sed`; result: traced LA-05b to existing SqliteLedger Online Backup/loadState, immutable ledger events, Journal/Posting persistence, LA-03c projection and ENV-06 restore boundary.
- Tool: `apply_patch`; result: added time-point immutable ledger replay, missing-history gap reporting, backup append-only catch-up evidence, LA-05b tests, package script and synchronized product/technical/roadmap/README/CHANGELOG/evidence docs.
- Tool: `npm`, `git diff --check`; result: LA-05b 4/4, Sandbox 182/182, LA-04/LA-05a/Operations/F15b/F16a 3/3/4/4/6/6/4/4/3/3, contract 63 invariants / 6 MCP tools, SDK 10/10, Prototype lint/build, Hosted 8/8/2/2 and diff check passed.
- Boundary: Local/Simulation only; no automatic restore write-back, Provider replay, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability; E3.1 remains paused.

## 2026-09-09 · LA-05a Draft PR

- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `4ef4439`, pushed `feat/ledger-assurance-independent-reconciliation`, and opened Draft PR #51 at `https://github.com/atxinbao/bu2com/pull/51` using `.github/pull_request_template.md`.
- Review boundary: PR #51 is an R2 review candidate for independent external observation reconciliation; it does not complete LA-05b historical replay/backup catch-up, Hosted/Testnet acceptance, real Provider reconciliation, or E3.1.

## 2026-09-09 · LA-05a 外部观察对账

- Tool: `git switch`, `graphify query`, `rg`, `sed`; result: verified PR #50 merge baseline at `86a1268`, created `feat/ledger-assurance-independent-reconciliation`, and traced LA-05a to F14 ReconciliationRun plus existing transaction/collection/persistence modules.
- Tool: `apply_patch`; result: added external observation validation, deterministic matching, unresolved `delivery_submitted` Payment coverage, external orphan queue items, OpenAPI/API contract fields, LA-05a tests, and synchronized product/technical/roadmap/README/CHANGELOG/evidence docs.
- Tool: `npm`, `git diff --check`; result: LA-05a 4/4, Sandbox 178/178, LA-04/Operations/F15b/F16a 3/3/6/6/4/4/3/3, contract 63 invariants / 6 MCP tools, SDK 10/10, Prototype lint/build, Hosted 8/8/2/2 and diff check passed.
- Boundary: Local/Simulation only; LA-05b historical replay and backup catch-up remain out of scope; E3.1 remains paused; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability is enabled.

## 2026-09-09 · LA-04 Draft PR

- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `bff565f`, pushed `feat/ledger-assurance-collection-convergence`, and opened Draft PR #50 at `https://github.com/atxinbao/bu2com/pull/50` using `.github/pull_request_template.md`.
- Review boundary: PR #50 is an R2 review candidate for Collection convergence and single posting; it does not complete LA-05, independent external reconciliation, Hosted/Testnet acceptance, or E3.1.

## 2026-09-09 · LA-04 Collection 持续验证与单次入账

- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #49 merged at `4eb3cad`, synchronized `main`, deleted local `feat/ledger-assurance-rebuild-projection`, and created `feat/ledger-assurance-collection-convergence`.
- Tool: `graphify query`, `rg`, `sed`; result: traced LA-04 to F11 `verifyInboundPayment`, F12 paid-access gating, F14 pending reconciliation and generic SQLite resource persistence; confirmed pending Provider Reference replay was returned without re-verification.
- Tool: `apply_patch`; result: added persistent CollectionVerificationAttempt evidence, pending-to-verified convergence, single-posting guard, late inbound evidence boundary, LA-04 tests, OpenAPI/SDK fields and synchronized product/technical docs.
- Tool: `npm`; result: LA-04 3/3, F11/F12/F14 regression 9/9, Sandbox 174/174, LA-03a/LA-03b/LA-03c 3/3/4/4, ENV-06/F15b/F16a/LA-01 6/6/4/4/3/3/7/7, contract 63 invariants / 6 MCP tools, SDK 10/10, Hosted 8/8/2/2 and Prototype lint/build passed.
- Boundary: Local/Simulation only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled; E3.1 remains paused.

## 2026-09-09 · LA-03c Draft PR

- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `d2903a1`, pushed `feat/ledger-assurance-rebuild-projection`, and opened Draft PR #49 at `https://github.com/atxinbao/bu2com/pull/49` using `.github/pull_request_template.md`.
- Review boundary: PR #49 is an R2 review candidate for read-only ledger projection rebuilding; it does not complete the Ledger Assurance Gate and does not reopen E3.1.

## 2026-09-09 · LA-03c 账务投影重建

- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #48 merged at `3a31504`, synchronized `main`, deleted local `feat/ledger-assurance-opening-corrections`, and created `feat/ledger-assurance-rebuild-projection`.
- Tool: `apply_patch`; result: added read-only `rebuildLedgerProjection`, LA-03c restart/projection assertions, package-facing documentation, CHANGELOG and evidence records.
- Tool: `npm`; result: LA-03b/LA-03c 4/4, LA-03a 3/3, Sandbox 171/171, ENV-06/F15b/F16a/LA-01 6/6/4/4/3/3/7/7, contract 63 invariants / 6 MCP tools, SDK 10/10, Hosted 8/8/2/2 and Prototype lint/build passed.
- Boundary: Local/Simulation only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled; E3.1 remains paused.

## 2026-09-09 · LA-03b 期初检查点与追加更正分录

- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #47 merged at `1eeee1e`, synchronized `main`, deleted local `feat/ledger-assurance-business-postings`, and created `feat/ledger-assurance-opening-corrections`.
- Tool: `apply_patch`; result: added persistent OpeningBalanceCheckpoint and LedgerCorrection resources, balanced Journal/Posting writers, LA-03b tests, package script and synchronized product/technical/roadmap/README/CHANGELOG/evidence docs.
- Tool: `npm`; result: LA-03b 3/3, LA-03a 3/3, Sandbox 170/170, ENV-06/F15b/F16a/LA-01 6/6/4/4/3/3/7/7, contract 63 invariants / 6 MCP tools, SDK 10/10, Hosted 8/8/2/2 and Prototype lint/build passed.
- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `a5a53e4`, pushed `feat/ledger-assurance-opening-corrections`, and opened Draft PR #48 at `https://github.com/atxinbao/bu2com/pull/48` using `.github/pull_request_template.md`.
- Boundary: Local/Simulation only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled; E3.1 remains paused.

## 2026-09-09 · LA-03a 业务资金事实分录

- Tool: `git switch`, `git status`; result: preserved the uncommitted LA-03 business posting implementation on `feat/ledger-assurance-business-postings` after LA-02 merge cleanup.
- Tool: `apply_patch`; result: added settlement, confirmed refund and ProviderFee Journal/Posting writers, LA-03 focused tests, product/technical/roadmap/README/CHANGELOG and verification records.
- Tool: `npm`; result: LA-03a 3/3, affected regression 13/13, Sandbox 167/167, ENV-06 operations 6/6, F15b/F16a/LA-01 4/4/7/7, contract 63 invariants / 6 MCP tools, SDK 10/10, Hosted 8/8/2/2 and Prototype lint/build passed.
- Tool: `apply_patch`; result: aligned deploy/operations.mjs backup evidence counts with recovery counts for budgets, budget_holds and financial_postings; ENV-06 operations regression returned 6/6.
- Tool: `git commit`, `git push`, `gh pr create`, `gh pr view`; result: committed `0a6b1d9`, pushed `feat/ledger-assurance-business-postings`, and opened Draft PR #47 at `https://github.com/atxinbao/bu2com/pull/47` using `.github/pull_request_template.md`.
- Boundary: Local/Simulation only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled; E3.1 remains paused.

## 2026-09-09 · LA-02 Ledger Assurance Gate：Journal / Posting 保护

- Tool: `gh pr view`, `git fetch`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #45 merged at `8927098`, synchronized `main`, deleted local `feat/ledger-assurance-refund-attempts`, and created `feat/ledger-assurance-journal-guards`.
- Tool: `rg`, `sed`; result: traced audit L-02/L-06/L-07 to `financial_postings`, budget/collection posting writers, SQLite DDL and unsafe integer validation; kept LA-03 full business posting coverage separate.
- Tool: `apply_patch`; result: added Schema v15 `journal_headers`, `journal_id`, one balanced journal write path, strict safe-integer validation, source checks, immutable posting/journal triggers, LA-02 tests and synchronized contracts/docs.
- Boundary: Local/Simulation ledger guard only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled; E3.1 remains paused.

## 2026-09-09 · LA-01 Ledger Assurance Gate：持久化退款尝试

- Tool: `gh pr view`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #44 merged at `e0d8c47`, synchronized `main`, deleted local `feat/pilot-manifest-preflight` after E3.1 was paused, and created `feat/ledger-assurance-refund-attempts`.
- Tool: audit report review plus `graphify query`; result: selected LA-01 as the smallest first Ledger Assurance Gate package; E3.1 remains paused and no Hosted/Live scope was expanded.
- Tool: `apply_patch`; result: added Schema v14 durable `refund_attempts`, pre-provider reservation, unknown-result amount reservation, exact Provider result validation, same-key recovery after local commit failure, F13 regression cases and synchronized contracts/docs.
- Boundary: Local/Simulation refund control only; no real Provider refund, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled.

## 2026-09-09 · F16b Hosted Sandbox 外部集成基础准入

- Tool: `gh pr view`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #43 merged at `259b3b74b8e439e776c0e37e8ed3a5e231c1b22c`, synchronized `main`, deleted local `test/internal-sandbox-pay-collect-beta`, and created `test/hosted-sandbox-foundation-gate`.
- Tool: `graphify query`, `rg`, `sed`; result: traced F16b to the existing Hosted Candidate, Activation, Evidence validators, Sandbox-only Compose contract and ENV-07B Runbook; no new transaction core or hosted secret integration was required.
- Tool: `apply_patch`; result: added the non-authorizing `qualifyHostedSandboxFoundation` composition and F16b negative-matrix tests, package script, product/technical/roadmap/README/CHANGELOG documentation and evidence records.
- Tool: `npm`, `node`; result: F16b 3/3, Hosted Runtime 8/8, Hosted deployment 2/2, Evidence Schema 2/2, Sandbox 158/158, Contract 63 invariants / 6 MCP tools, SDK 10/10, Prototype lint/build and `git diff --check` passed.
- Boundary: local qualification only; no DNS/TLS, cloud resource, managed Secret, independent production activation, external endpoint, real Base Sepolia settlement, Live/Mainnet or custody capability was enabled.

## 2026-09-09 · F16a 内部 Sandbox 自主双向收付 Beta 候选

- Tool: `gh pr view`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #42 merged at `65ba20f`, synchronized `main`, deleted local `test/operations-recovery-evidence`, and created `test/internal-sandbox-pay-collect-beta`.
- Tool: `graphify query`; result: traced F16a to PaymentMandate, ExecutionSession, F09a autonomous execution, F11 collection, F12 AccessGrant, F13 refund, F14 reconciliation and F15b recovery evidence; no new transaction core was required.
- Tool: `apply_patch`; result: added the F16a fixed-candidate Beta acceptance suite, package script, product contract and synchronized documentation/evidence.
- Tool: `node --test sandbox/f16a.test.mjs`; result: 3/3 passed, covering autonomous bilateral pay-and-collect, provider-unknown recovery after restart, and authorization/environment fail-closed gates.
- Tool: `node`, `npm`; result: F15a/F15b regression 8/8, Sandbox 158/158, Contract 63 invariants / 6 MCP tools, SDK 10/10, Prototype lint/build and `git diff --check` passed.
- Boundary: F16a is Local/Simulation evidence only; Sandbox/Testnet remains `execution_disabled`, and Hosted, Live/Mainnet, custody and production credentials remain closed.

## 2026-09-09 · F15b 业务负载、停机与财务恢复验收

- Tool: `gh pr view`, `git switch`, `git pull --ff-only`, `git branch -d`; result: verified PR #41 merged at `6082cd3`, synchronized `main`, deleted local `feat/bounded-sandbox-execution-sessions`, and created `test/operations-recovery-evidence`.
- Tool: `graphify query`; result: traced F15b to the existing Transaction, Collection, Refund, ProviderFee, ReconciliationRun, SQLite restart and graceful shutdown paths; no second ledger or operations runtime was required.
- Tool: `apply_patch`; result: added the F15b bounded operations acceptance suite, product contract, package script and synchronized root/product/technical/CHANGELOG/verification evidence.
- Tool: `node --test sandbox/f15b.test.mjs`; result: 4/4 passed, covering bounded business load, matched reconciliation, restart without duplicate settlement, disarmed Sandbox/Testnet and SIGTERM shutdown.
- Tool: `node`, `npm`; result: Contract 63 invariants / 6 MCP tools, Sandbox 155/155, SDK 10/10, Prototype lint/build and `git diff --check` passed.
- Boundary: F15b remains Local/Simulation and internal Sandbox-Testnet evidence only; no real Provider, Base Sepolia, Hosted, Live/Mainnet, custody or production credential capability was enabled.

## 2026-09-09 · F13 Bounded Cancellation & Refund Recovery

- Tool: `git fetch --prune`, `git merge --ff-only`, `git branch -d`; result: confirmed PR #38 merged at `dcc9c2d`, synchronized `main`, deleted local F12 branch and created `feat/bounded-refunds-recovery`.
- Tool: `graphify query`; result: traced F13 to existing Transaction state machine, Wallet/Budget Hold postings, Adapter idempotency and explicit recovery boundaries; F14 remains owner of reconciliation.
- Tool: `apply_patch`; result: added atomic reserved cancellation, persistent Refund resources, partial/full refund invariant, provider-unknown recovery, HTTP/OpenAPI/Access Contract/SDK surfaces and F13 tests.
- Tool: `node --test sandbox/f13.test.mjs sandbox/f13-http.test.mjs`; result: 5/5 passed, including serialized concurrent refunds.
- Tool: `npm --prefix sandbox test`; result: 144/144 passed.
- Tool: `npm --prefix packages/typescript-sdk run generate && npm --prefix packages/typescript-sdk run format && npm --prefix packages/typescript-sdk test`; result: generated contract, format, lint, typecheck, build and 10/10 tests passed.
- Boundary: F13 remains Local/Simulation and existing Sandbox/Testnet contract only; x402 refund is unsupported and fails closed; no automatic refund replay, F14 reconciliation, Hosted, Live/Mainnet or custody capability was enabled.

## 2026-09-08 · F12 Recoverable Paid Access implementation

- Tool: `git fetch --prune`, `git switch`, `git pull`, `git branch -d`; result: verified F11 PR #37 merged at `67679f5`, synchronized `main`, confirmed no remaining local feature branch, and created `feat/recoverable-paid-access`.
- Tool: `graphify query`; result: confirmed F12 must reuse F11 Collection, existing DeliveryRecord/Receipt separation, generic resources, SQLite atomicity and idempotency; no second Transaction or Ledger core introduced.
- Tool: `apply_patch`; result: added persistent AccessGrant resource, posted Collection precondition, idempotent create/recovery, HTTP/OpenAPI/SDK/access contract, F12 product contract and tests.
- Tool: `npm`, `node`; result: F12 targeted tests 4/4, Sandbox 139/139, Contract 63 + MCP 6, SDK generated/format/lint/typecheck/build and 10/10 tests, Prototype lint/build and diff check passed.
- Boundary: F12 does not create provider calls, refunds, reconciliation, Hosted, Live/Mainnet, custody or production credential capability; only local Simulation/Testnet-compatible contracts remain.

## 2026-09-08 · F11 Inbound Collection implementation

- Tool: `git fetch`, `git switch`, `git pull`, `git branch -d`; result: verified F10 PR #36 merged at `b267a83`, synchronized `main`, deleted local `feat/account-owned-receivables`, and created `feat/verify-inbound-collections`.
- Tool: `graphify query`; result: confirmed F11 is the next unimplemented roadmap item after F10 and must reuse Receivable, FinancialPosting, SQLite atomicity and existing adapter boundaries.
- Tool: `apply_patch`; result: added Adapter inbound verification, Collection resource, provider-reference uniqueness, Receivable paid transition, immutable posting pair, HTTP/OpenAPI/SDK/access contract and F11 tests/docs.
- Tool: `node`, `npm`; result: F11 targeted tests 4/4, Sandbox 135/135, Contract 63 + MCP 6, SDK generated/format/lint/typecheck/build and 10/10 tests, Prototype lint/build and diff check passed.
- Boundary: F11 does not change the buyer wallet, create a second Transaction Core, call Live/Mainnet, enable Hosted, custody or production credentials; real Testnet collection remains a later evidence gate.

## 2026-09-08 · F10 Account-Owned Receivable implementation

- Tool: `gh pr view`, `git fetch --prune`, `git switch`, `git pull`, `git branch -d`; result: verified F09a PR #35 merged at `66f466b56936a1528214ad6ae8608c151cb1734b`, synchronized `main`, deleted local `feat/autonomous-payment-execution`, and created `feat/account-owned-receivables`.
- Tool: `graphify query`; result: confirmed F09b unknown-result recovery already exists in historical PR #7 through persisted payment attempts, adapter recovery attempts and explicit settlement recovery; no duplicate F09b implementation introduced.
- Tool: `apply_patch`; result: added persisted generic Receivable resource, Quote-derived amount, ownership/target/expiry validation, account-scoped HTTP API, access permissions, OpenAPI and TypeScript SDK methods.
- Tool: `apply_patch`; result: added F10 product contract, Changelog, roadmap status, verification/test records and targeted domain/HTTP/restart tests.
- Tool: `node`, `npm`; result: F10 targeted tests 4/4, Sandbox 131/131, Contract 63 + MCP 6, SDK generated/format/lint/typecheck/build and 10/10 tests, Prototype lint/build and diff check passed.
- Tool: `git commit`; result: created the local F10 commit (`feat(collections): create account-owned receivables`); branch remains local and has not been pushed or opened as a remote PR.
- Boundary: F10 does not move balances, create transactions, post financial ledger entries, verify inbound payments, call Provider/Signer/x402, or enable Hosted/Live/Mainnet/production credentials; F11 owns inbound verification and one-time posting.

## 2026-09-08 · F09a Autonomous Payment Execution

- Tool: `git fetch`, `git switch`, `git pull`, `git branch -d`; result: verified F08 PR #34 merged at `151cf7f9661e609042aae3a66a3caabeed9b8d3e`, synchronized `main`, removed local `feat/mandates-versioned-policy`, and created `feat/autonomous-payment-execution`.
- Tool: `graphify query`; result: connected F09a to existing `PaymentIntent`, `PolicyDecision`, `reserve()`, Budget Hold, Adapter, Wallet CAS, Ledger and idempotency boundaries; no second Transaction Core introduced.
- Tool: `apply_patch`; result: added optional `execution_mode`, explicit `/execution` command, `payment_intents:execute`, deferred execution state transition, SDK/OpenAPI contract, targeted domain/HTTP tests and F09a product documentation.
- Tool: `npm`, `node`; result: corrected OpenAPI optional-field generation and fixed the HTTP route identifier validation; targeted F09a tests now pass 4/4.
- Tool: `git diff --check`, `node docs/03-technical/validate-contract.mjs`, `npm --prefix sandbox test`, `npm --prefix packages/typescript-sdk test`, `npm --prefix prototype run lint && npm --prefix prototype run build`; result: diff clean, Contract 63 + MCP 6, Sandbox 127/127, SDK 10/10 with all quality gates, and Prototype lint/build passed.
- Tool: `git commit`; result: created local commit `34bb999` (`feat(execution): run approved payment intents autonomously`); branch remains local and has not been pushed or opened as a remote PR.
- Boundary: F09a cannot execute `review_required` or denied intents, rechecks active Mandate version, reuses existing reservation/ledger atomicity, and does not add F09b recovery, Hosted, Live/Mainnet or production credential capability.

## 2026-09-08 · F07 Budget Hold / Financial Posting implementation

- Tool: `git switch -c`; result: created `feat/f07-budget-financial-posting` from merged D1 `main` baseline `9c05889`.
- Tool: `rg`, `sed`; result: confirmed existing `wallet_accounts`, append-only `ledger_events`, `commitDomainMutation`, idempotency claims, WAL and Webhook Outbox are the only financial persistence path.
- Tool: `apply_patch`; result: added Schema v12 `budgets`, `budget_holds`, `financial_postings`, domain hold/consume behavior, HTTP resources, OpenAPI and TypeScript SDK support.
- Tool: `apply_patch`; result: added F07 targeted unit/HTTP/restart tests and updated migration assertions from Schema v11 to v12.
- Tool: `npm --prefix sandbox test`, `npm --prefix packages/typescript-sdk test`, `node docs/03-technical/validate-contract.mjs`, `npm --prefix prototype run lint && npm --prefix prototype run build`; result: all local verification passed.
- Boundary: F07 remains Local / Sandbox / Testnet only; no F08 Mandate, Live/Mainnet, custody, hosted or production credential capability was enabled.
- Tool: `git commit`, `git push`, `gh pr create`, `gh pr edit`; result: committed `41fb338` (`feat(ledger): add scoped budget holds and financial postings`), pushed `feat/f07-budget-financial-posting`, and opened Draft PR #32 at `https://github.com/atxinbao/bu2com/pull/32` using `.github/pull_request_template.md`.

## 2026-09-08 · D1 F07 财务边界契约

- Tool: `git fetch`, `git switch`, `git pull`, `git branch -d`; result: verified D0 PR #30 merged at `9a6bdaf`, synchronized `main`, deleted local `docs/d0-roadmap-baseline`, created `docs/d1-f07-financial-boundary`.
- Tool: `graphify query`; result: connected F07 PRD requirements with `wallet_accounts`, append-only `ledger_events`, `commitDomainMutation`, idempotency claims, CAS and adapter unknown-result recovery.
- Tool: `rg`, `sed`; result: confirmed existing runtime has wallet/ledger atomic primitives but no standalone Budget, BudgetHold or FinancialPosting resource.
- Decision: freeze D1 as documentation only; F07 must extend the existing Transaction Core and atomic commit boundary without creating a second balance or ledger source.
- Tool: `apply_patch`; result: added F07 financial boundary contract and context evidence, aligned product/technical roadmap and Changelog. No runtime or Schema changes.
- Tool: `apply_patch`; result: appended D1 autonomous review report with R0 conclusion, R2 approval gate and residual implementation risks.

日期：2026-09-06
执行者：Codex

- `gh pr view`：确认 PR #19 已合并，merge commit 为 `2353e9501a51ff94cf8b48313ef288a21df586a8`。
- `git fetch/switch/pull/branch`：同步 main、删除 ENV-02 本地分支并创建 `feat/env03-environment-contract-migration`。
- `graphify query`：定位 API、SDK、MCP、Doctor、Evidence 与 Receipt 的 legacy 环境依赖。
- `rg/sed`：核对环境系统文档、验收矩阵、运行时、OpenAPI、客户端和测试边界。
- `apply_patch`：实现环境机器契约、API 自描述、SDK/MCP/Doctor preflight、Receipt v0.3、legacy fixture、clean-room 迁移与文档对齐。
- `npm test` / `validate-contract`：Reference Server 100/100、SDK 9/9、Contract 47 + MCP 6、clean-room 3/3、Prototype lint/build 通过。
- `playwright-cli`：Google Chrome 验证 PROJECT/GOVERNANCE/CHANGELOG 桌面与移动页面，控制台 0 error/warning。
- `graphify update .`：更新代码图到 2243 nodes / 3446 edges；无语义 backend，文档图未重新抽取。
## 2026-09-06 21:26 CST · ENV-04 start

- Tool: `git fetch`, `git switch`, `git pull`, `git branch -d`; result: PR #20 merge verified in `origin/main`, local ENV-03 branch removed, new `feat/env04-isolated-deployment-units` branch created.
- Tool: Graphify query; result: deployment work connects to `environment-config.mjs`, `SqliteLedger`, server assembly and E-T07.
- Tool: `rg`, `sed`, Docker/Compose version checks; result: Docker 28.1.1 and Compose 2.36.1 available, no existing deployment template, ENV-04 scope is sufficiently defined.
- Decision: build one local immutable container image, two disarmed isolated units, and fault-inject the Sandbox database into Live to prove fail-closed startup. No signer, payment, DNS or cloud action.

## 2026-09-06 21:41 CST · ENV-04 implementation and verification

- Tool: `apply_patch`; result: added Dockerfile, Compose, deployment-unit machine contract, validator, tests, real-container acceptance and deployment documentation; upgraded Reference Server to v0.14 with container host binding and graceful shutdown.
- Tool: Docker/Compose; result: static contract 2/2 and real container acceptance passed. One image ID served isolated Sandbox/Live, wrong DB and cross-environment signer failed closed, temporary resources removed.
- Tool: project tests; result: Contract 50 + MCP 6, Reference Server 101/101, SDK 9/9 plus all quality gates, clean-room 3/3, Prototype lint/build passed.
- Tool: Playwright CLI with Google Chrome; result: PROJECT/GOVERNANCE/CHANGELOG desktop and 390x844 mobile content visible, console 0 errors and 0 warnings.
- Tool: `graphify update .`; result: code graph refreshed to 2286 nodes, 3500 edges and 143 communities; documentation semantic extraction unavailable without Gemini/Google backend and was not represented as completed.
- Failure record: Docker daemon initially unavailable; after startup, first image lacked `contract-versions.json`; both were corrected without weakening tests. A stale v0.13 HTTP assertion was aligned with v0.14.

## 2026-09-06 22:07 CST · ENV-05 start

- Tool: `gh pr view`, `git fetch/switch/pull/branch`; result: PR #21 merge verified at `360468045e2eec493e617db446e75d5806eec480`, local ENV-04 branch removed, `feat/env05-controlled-access` created.
- Tool: Graphify reflect/query plus `rg`/`sed`; result: located server, SQLite, SDK, MCP, Doctor, deployment and environment-contract boundaries for E-T04/11/12/15/16.
- Decision: external Sandbox/Live use environment-bound Bearer credentials; Local remains explicit development-open. Agent/Developer/Operator permissions, claims, append-only access audit, Sandbox-only tenant generation reset and redacted support bundles are in scope. Public hosting, production credentials, Mainnet and PaymentMandate expansion are out of scope.

## 2026-09-06 22:39 CST · ENV-05 implementation and verification

- Tool: `apply_patch`; result: added Access Contract v1, access controller, Schema v9, operator routes and tests; upgraded API/SDK/MCP to v0.3 and Reference Server to v0.15; aligned deployment, docs and Changelog.
- Tool: npm/node/Docker; result: Contract 56 + MCP 6, Sandbox 109/109, SDK 10/10, deployment contract 2/2, real container acceptance and clean-room 3/3 passed.
- Tool: Playwright CLI; result: PROJECT, GOVERNANCE and CHANGELOG rendered over local HTTP with expected ENV-05 content and zero console errors/warnings.
- Tool: read-only link and secret scans; result: 53 documentation files had no broken relative links; 55 changed/untracked files had no private-key, OpenAI-key or raw Bearer match.
- Tool: `graphify update .`; result: AST graph refreshed to 2341 nodes, 3614 edges and 146 communities; semantic documentation relabeling remains unavailable without a configured backend and was not claimed complete.

## 2026-09-06 23:04 CST · ENV-06 start

- Tool: `gh pr view`, `git fetch/switch/pull/branch`; result: PR #22 merge verified at `5cc13bb654c68e7ae9881508b0b4b0745bf58f2c`, local ENV-05 branch removed, `feat/env06-artifact-recovery-operations` created.
- Tool: Graphify reflect/query plus `rg`/`sed`; result: located deployment, SQLite, environment contract, acceptance matrix and operational evidence boundaries.
- Decision: bind a clean commit to one immutable artifact, create environment-scoped online backups, verify and restore only into disarmed same-environment copies, and expose redacted local monitoring. No hosting, signer, secret or payment is authorized.

## 2026-09-06 23:35 CST · ENV-06 implementation and verification

- Tool: `apply_patch`; result: added Operations Contract v1, CLI, online backup/verification, isolated restore rehearsal, redacted operational snapshot, clean-commit acceptance and aligned technical/governance/status documentation.
- Tool: npm/node/Docker; result: ENV-06 6/6, Contract 59 + MCP 6, Sandbox 109/109, SDK 10/10, deployment 2/2, container deployment, clean-room 3/3 and Prototype lint/build passed.
- Tool: Playwright CLI; result: PROJECT and CHANGELOG desktop/mobile content rendered, gate navigation worked, console 0 errors/warnings.
- Tool: read-only scans; result: final 219 relative documentation links had no failures; 29 core changed/new files had no credential-pattern match; `git diff --check` passed.
- Tool: `graphify update .`; result: final graph refreshed to 2412 nodes, 3798 edges and 158 communities; semantic documentation relabeling unavailable without configured backend.
- Failure record: first operations acceptance stopped at Docker Hub metadata EOF before BU2 build; exact Node 22.16 image pull followed by an unchanged full rerun passed.

## 2026-09-07 00:06 CST · ENV-07A Hosted Sandbox admission and evidence baseline

- Tool: `gh pr view`, `git fetch/switch/pull/branch`; result: PR #23 verified merged at `6daa4a9353664f7a3193e74fc29d43ff6fbd595b`, remote branch pruned, local ENV-06 branch deleted, `feat/env07-hosted-sandbox-evidence` created from clean `main`.
- Tool: Graphify query plus `rg`/`sed`; result: located environment, x402, access, immutable artifact, operations and external pilot evidence boundaries. No cloud deployment CLI or verifiable public HTTPS Sandbox target was available.
- Decision: split ENV-07 into ENV-07A local admission/evidence readiness and ENV-07B real hosted acceptance. Keep shared Sandbox/Live Compose disarmed; add a Sandbox-only hosted entrypoint without authorizing Live or self-authorizing Testnet execution.
- Tool: `apply_patch`; result: added mounted-file runtime Secret validation, Base Sepolia RPC preflight, immutable Candidate, independently supplied bounded Activation, bilateral/failure/edge Evidence validator, JSON CLI, 8 tests and aligned technical/governance/status documentation.
- Tool: npm/node; result: Hosted Sandbox 8/8, Contract 62 + MCP 6, Reference Server 109/109, SDK 10/10, deployment 2/2, operations 6/6, clean-room 3/3 and Prototype lint/build passed.
- Tool: read-only scans; result: 53 Markdown/HTML files and 223 relative links had no failures; 34 changed/new files had no high-confidence credential match; `git diff --check` and Node syntax checks passed.
- Tool: Playwright CLI fallback; reason: Browser plugin was not available. PROJECT desktop and CHANGELOG mobile rendered, ENV-07A/PR #23 status was visible, anchor navigation worked, and console had 0 errors/warnings.
- Failure record: the first startup test passed `paymentAdapter` to a server that accepts `adapterMode`; the resulting two related failures were corrected and the full ENV-07A test file passed 8/8. One verification command was initially run from the root without a root `package.json`; it was rerun with `npm --prefix sandbox` and passed.
- Boundary: no cloud/DNS/TLS mutation, public deployment, managed Secret creation, Base Sepolia payment, external team traffic, Live/Mainnet execution, production credential or custody was performed. E-T13/E-T14/E-T15 hosted portions remain Not yet accepted.
- Tool: `graphify update .`; result: AST graph refreshed to 2472 nodes, 3920 edges and 172 communities; semantic documentation relabeling remains unavailable without a configured Gemini/Google backend.
- Tool: Docker/OrbStack acceptance on clean commit `c7e8dd548b4d4500a9426c72f0cde095f705b8ef`; result: deployment and operations passed, Sandbox/Live reused immutable artifacts, remained authenticated and execution disabled, restored copies required reconciliation, and no Signer, Secret or payment execution occurred.

## 2026-09-06 · ENV-07B hosted deployment preparation

- Tool: `git fetch --prune`, `git switch`, `gh pr list`; result: PR #24 confirmed merged, local `main` matched `origin/main`, and no merged feature branch remained locally.
- Tool: Graphify query plus `rg`/`sed`; result: confirmed ENV-07B depends on an explicit Hosted Sandbox deployment unit while the shared Compose remains intentionally disarmed.
- Decision: add a provider-neutral, Sandbox-only Hosted Compose profile. It enables only the hosted Sandbox entrypoint with Base Sepolia `84532`, x402 exact, authenticated access, execution enabled, immutable artifact input, loopback reverse-proxy port and external file-mounted secrets. Live, DNS/TLS, cloud resources, Activation and real Testnet execution remain outside this local change.
- Tool: `apply_patch`; result: added `deploy/hosted-sandbox.compose.yaml`, `hosted-sandbox-deployment.json`, validator/test, deployment docs, package script and verification entry.
- Tool: `docker compose config`, npm/node; result: Hosted deployment 2/2, Hosted Sandbox 8/8, Reference Server 109/109, Contract 62 + MCP 6, TypeScript SDK 10/10, Prototype lint/build and syntax/diff checks passed.
- Boundary: no cloud or DNS/TLS mutation, no managed Secret creation, no external Activation, no Base Sepolia payment, no Live/Mainnet enablement.

## 2026-09-06 · ENV-07B external acceptance pack

- Tool: `git switch`; result: created `feat/env07b-external-acceptance-pack` from merged `main` after PR #25 cleanup.
- Decision: add a provider-neutral external acceptance pack instead of expanding transaction logic or treating local Compose as hosted evidence.
- Tool: `apply_patch`; result: added bounded Hosted Sandbox Evidence Schema v1, redacted evidence template, E-T13/E-T14/E-T15 Runbook, schema test, technical index and Changelog/verification alignment.
- Boundary: no cloud, DNS/TLS, managed Secret, Activation, real Base Sepolia payment, external Agent traffic or Live/Mainnet execution.

## 2026-09-06 · OrbStack Sandbox origin validation

- Tool: `dig`; result: `bu2.com` is delegated to GoDaddy nameservers and `api.sandbox.bu2.com` currently resolves to `198.18.0.19`, which is not a usable public service address.
- Tool: `orb list`, `orb run`; result: `bu2-sandbox` is running Ubuntu 24.04 ARM64 with internal address `192.168.139.15`; this address is private to the OrbStack network.
- Tool: Docker BuildKit on context `orbstack`; result: Linux ARM64 hosted artifact built as `sha256:9210d6649bc7e4d1a3d7912b705fc6db7306ee7e6`.
- Tool: `npm --prefix sandbox run test:hosted-deployment`; result: Hosted deployment contract 2/2 passed.
- Tool: `npm --prefix sandbox run test:hosted-sandbox`; result: Hosted Sandbox admission/runtime tests 8/8 passed.
- Tool: local Compose with the immutable artifact; result: Sandbox origin served `/health` and `/v1/environment` on `127.0.0.1:3110`, returning `sandbox`, Base Sepolia `84532`, x402, and `execution_disabled`; temporary container and volume were removed after verification.
- Decision: OrbStack is approved as the local Linux Sandbox origin, not as a standalone public edge. Do not alter DNS until inbound 80/443, TLS, machine authentication, managed Secrets, and independent Activation are ready.

## 2026-09-06 · Internal OrbStack Sandbox acceptance

- Tool: `npm --prefix sandbox test`; result: 109/109 passed.
- Tool: `npm --prefix sandbox run test:deployment-contract`, `test:hosted-deployment`, `test:hosted-sandbox`; result: 2/2, 2/2 and 8/8 passed.
- Tool: `npm --prefix sandbox run acceptance:deployment`; result: Sandbox/Live disarmed acceptance passed, unauthenticated mutation rejected before domain write, no payment attempted.
- Tool: OrbStack Compose with the immutable artifact; result: `/health` healthy, `/v1/environment` matched Sandbox/Base Sepolia/x402, unauthenticated `/v1/quotes` returned HTTP 401 `credential_required`.
- Cleanup: temporary Compose container, network and volume removed.
- Decision: mark Internal Sandbox / Testnet as accepted for local/private use; keep public Hosted Sandbox and real bilateral Testnet payment as not yet accepted.

## 2026-09-06 · Execution enablement gate

- Tool: `docker secret ls`; result: OrbStack Docker node is not a Swarm manager, so no managed Docker Secret store is currently available.
- Decision: do not initialize Swarm, inject direct environment secrets, or start `execution_enabled` with placeholders.
- Artifact: added `.codex/orbstack-sandbox-execution-enable-checklist.md` with the bounded Secret, Candidate, Activation and Testnet evidence prerequisites.

## 2026-09-06 · Base Sepolia x402 preflight

- Tool: `npm run x402:wallet`; result: test buyer has `9.98 USDC` and `0` native Base Sepolia ETH; private key remained inside the macOS Keychain-backed process.
- Tool: `npm run x402:merchant`; result: local merchant started on `127.0.0.1:4021`.
- Tool: `npm run x402:probe:funded`; result: x402 v2 challenge and facilitator capability passed, but settlement returned `invalid_exact_evm_transaction_failed` / `replacement transaction underpriced` with no confirmed transaction hash.
- Recovery: merchant stopped; no automatic retry or second payment attempt.
- Decision: keep Testnet execution gate closed until Base Sepolia gas is available and a bounded retry is explicitly performed.

## 2026-09-06 · Base Sepolia x402 bounded retry

- Tool: Playwright CLI in Chrome session `faucet`; result: the Chainlink Base Sepolia native faucet required wallet connection. No private key, seed phrase or password was entered; the user completed the funding step separately.
- Tool: `npm run x402:wallet`; result: buyer `0x2c8b07E38155195826e91e266aCee03B3398dD97` reported Base Sepolia `0.0011 ETH`, `9.98 USDC`, `ready: true`; the private key remained in the macOS Keychain-backed process.
- Tool: `npm run x402:merchant`; result: local Merchant started on `127.0.0.1:4021`.
- Tool: `npm run x402:probe:funded`; result: x402 v2 challenge, facilitator capability and one bounded `0.01 USDC` settlement completed; no automatic retry was performed.
- Tool: viem Base Sepolia public RPC receipt query; result: transaction `0xc5d4b9753072829ff5fc3eef923ecf479dec645a424f6ee471cc05bd12c9d9d5` confirmed with status `success`, block `46477384`, gas used `102840`.
- Tool: Base Sepolia explorer navigation; result: explorer returned Cloudflare HTTP 403, so the RPC receipt is the authoritative confirmation for this run.
- Cleanup: Merchant process stopped after the bounded probe.
- Decision: internal Sandbox/Testnet x402 settlement gate is accepted for this bounded run; public Hosted Sandbox, Live/Mainnet, custody and production secrets remain out of scope.

## 2026-09-06 · ENV-07B Candidate preparation

- Tool: `node deploy/hosted-sandbox-cli.mjs candidate`; result: generated `.codex/env07b-candidate.json` bound to source commit `62da8db3a55ddfedeb0ed157be65ec664d58b813`, immutable artifact `sha256:9210d6649bc7e4d1b570c64b52d5aaa97061c16a3d7912b705fc6db7306ee7e6`, and intended HTTPS origin `https://api.sandbox.bu2.com`.
- Candidate authorization remains `hosted_deployment=false`, `testnet_payment_execution=false`, `human_activation_required=true`.
- First generation attempt was rejected because the artifact digest was incomplete; the input was corrected to the full 64-hex digest and regenerated successfully.
- Boundary: no DNS/TLS change, managed Secret creation, independent Activation, hosted startup or additional payment was performed.

## 2026-09-06 · Scope decision

- Decision: keep OrbStack as the approved internal Sandbox / local Testnet debugging environment.
- Deferred: public Hosted Sandbox, managed Secret integration, independent Activation, external edge E2E and E-T13/E-T14/E-T15.
- Boundary: no Live/Mainnet enablement, custody or production execution is authorized by this decision.

## 2026-09-06 · Internal Sandbox Product Baseline

- Tool: `apply_patch`; result: added `deploy/local-sandbox.mjs`, local plan/doctor tests, Sandbox npm shortcuts and an internal OrbStack Runbook.
- Tool: `npm --prefix sandbox run sandbox:up`; result: built immutable artifact `sha256:1d7dc82a204e035c87d771fc0df32f731b5a7ce8577d5842a7c5e0f274f9188f`, recreated `bu2-local-sandbox-sandbox-1`, and passed health/environment preflight.
- Tool: `npm --prefix sandbox run sandbox:status`; result: Docker context `orbstack`, service healthy, loopback `127.0.0.1:3110`, one preserved Sandbox volume.
- Tool: `npm --prefix sandbox run sandbox:doctor`; result: Sandbox, Base Sepolia `84532`, x402, authenticated access and `execution_disabled` all passed.
- Tool: unauthenticated `POST /v1/quotes`; result: HTTP `401 credential_required`, with no domain write.
- Failure record: first doctor implementation checked `payment_adapter`, while the existing environment contract exposes `execution_backend`; corrected to the existing contract and reran successfully.
- Boundary: Live was not started; no Signer, API key, RPC secret or Testnet payment was loaded by the local Compose entrypoint.

## 2026-09-06 · F06a account-agent onboarding

- Tool: `graphify query "How do the F06a identity persistence, access control, onboarding CLI, OpenAPI, and SDK changes connect?"`; result: confirmed the persistence, access-control, OpenAPI and SDK dependency path before final review.
- Tool: `apply_patch`; result: removed the unused `_identityBundleFingerprint()` helper without changing the identity persistence contract.
- Tool: `npm --prefix sandbox test`; result: 112/112 passed.
- Tool: `npm --prefix packages/typescript-sdk test`; result: generated contract, format, lint, typecheck, build and 10/10 tests passed.
- Tool: `node docs/03-technical/validate-contract.mjs`; result: 63 invariants and 6 MCP tools passed.
- Tool: `npm --prefix sandbox run test:deployment-contract`; result: 2/2 passed.
- Tool: `npm --prefix sandbox run test:operations`; result: 6/6 passed.
- Tool: `npm --prefix sandbox run test:hosted-sandbox`; result: 8/8 passed.
- Tool: `npm --prefix sandbox run acceptance:clean-room`; result: HTTP/SDK/MCP 3/3 Local Simulation paths passed.
- Tool: `npm --prefix prototype run lint && npm --prefix prototype run build`; result: lint and production build passed.
- Tool: `apply_patch`; result: appended F06a testing, verification and review evidence without rewriting historical entries.
- Boundary: F06a remains Sandbox identity/onboarding only; no Signer, Live/Mainnet, Hosted deployment or new payment execution was enabled.

## 2026-09-07 · F06b funding source and receiving target bindings

- Tool: `npm --prefix sandbox test`; result: 115/115 passed after updating the legacy migration assertion from schema range `[1..10]` to `[1..11]`.
- Tool: `npm --prefix packages/typescript-sdk test`; result: generated check, format, lint, typecheck, build and 10/10 unit tests passed.
- Tool: `node docs/03-technical/validate-contract.mjs`; result: 63 invariants and 6 MCP tools passed.
- Tool: `apply_patch`; result: added F06b technical contract and synchronized root/Sandbox/operations/access/changelog documentation with Schema v11 and current test counts.
- Tool: `git diff --check`; result: passed.
- Decision: F06b is ready for R2 independent human review. It binds verified funding sources and receiving targets to existing Principal/Account/Agent records; it does not enable Signer, Live/Mainnet, Hosted or new external payment execution.

## 2026-09-07 · F06b commit and pull request

- Tool: `git add -f`, `git commit`; result: created local commit `8054cbd` (`feat(wallets): bind funding sources and receiving targets`) with code, contract, documentation and audit evidence.
- Tool: `gh auth status`, `git push -u origin`; result: authenticated GitHub session confirmed and branch `feat/wallet-funding-target-bindings` pushed to `origin`.
- Tool: `gh pr create`; result: opened draft PR #29 against `main`; no existing PR was found for the branch.
- Boundary: PR is for R2 independent human review; no Live/Mainnet, custody, hosted deployment or new payment execution was enabled.

## 2026-09-07 · 后续 PR 路线图梳理

- Tool: `graphify query`; result: confirmed the current dependency graph centers on ENV-07 Hosted Sandbox, Epic 3, the existing Agent Payment API v1, Doctor, clean-room evidence and Transaction Trust Gate.
- Tool: `rg` / `sed`; result: verified `main` is clean at F06b merge `82cdb7b`; Epic 1, Epic 2, Transaction Trust Gate and ENV-01–ENV-06 are complete; ENV-07B remains unaccepted.
- Decision: classify ENV-07B as a deployment/acceptance gate rather than a code PR; sequence implementation PRs as E3.1 → E3.2 → E3.3, then conduct E3.4 as an external pilot stage.
- Boundary: no code, payment path, Live/Mainnet capability, production credential or hosted resource was enabled by this planning task.

## 2026-09-07 · 文档 PR 交付策略确认

- Tool: `graphify query`; result: identified product, technical contract, acceptance and operations documents as separate documentation communities connected to F02–F16 and Epic 3.
- Tool: `rg` / `sed`; result: confirmed `docs/README.md` requires product baseline, technical contracts, examples, validation scripts and `CHANGELOG.html` to stay synchronized when behavior or contracts change.
- Decision: documentation is required for every implementation PR; only roadmap/governance/status alignment and standalone contract changes should use separate documentation PRs.
- Boundary: no business code, schema, transaction state or environment capability was changed.

## 2026-09-07 · D0 Phase 0 业务路线与文档基线

- Tool: `git switch -c docs/d0-roadmap-baseline`; result: created isolated documentation branch from merged F06b baseline `82cdb7b`.
- Tool: `rg` / `sed`; result: found stale F07/F08 product definitions, merged-item `R2 review pending` markers, and Epic 3 sequencing drift.
- Tool: `apply_patch`; result: added `docs/02-product/PHASE0_ROADMAP_BASELINE.md` and synchronized product, technical, Epic 3, root README and `CHANGELOG.html`.
- Decision: D0 is R0 documentation-only; D1 (F07 financial contract) is the next work item, followed by F07 implementation and D2/F08.
- Boundary: no API, Schema, transaction state, payment adapter, Sandbox/Testnet or Live/Mainnet capability changed.

## 2026-09-08 · D2 F08 Payment Mandate 契约

- Tool: `graphify query`; result: confirmed the F08 dependency path across PaymentMandate, PolicyDecision, F07 Budget Hold, API contract and Phase 0 roadmap.
- Tool: `git switch -c docs/d2-f08-mandate-contract`; result: created an isolated documentation branch from merged `main` baseline `b982c87`.
- Tool: `apply_patch`; result: added the F08 versioned Mandate contract and synchronized product/technical/root indexes, roadmap, changelog and verification records.
- Decision: D2 is R0 documentation-only; F08 runtime remains blocked until this contract is merged and an independent R2 Domain/Architecture review is complete.
- Boundary: no API, Schema, transaction state, budget hold, ledger, adapter, signer, environment or payment behavior changed; Live/Mainnet, custody and Hosted remain closed.
- Tool: `git add -A`, `git commit`; result: created `cb5067a` (`docs(f08): freeze payment mandate contract`) with the D2 contract, synchronized documentation and audit evidence.
- Tool: `gh auth status`, `git push -u origin docs/d2-f08-mandate-contract`; result: authenticated push completed.
- Tool: `gh pr create` / `gh pr edit`; result: opened Draft PR #33, titled `docs(f08): freeze payment mandate contract`, using `.github/pull_request_template.md` sections and the verified D2 body.
## 2026-09-08 · F08 Payment Mandate 运行时实现

- Tool: `rg` / `sed`; result: reviewed D2 contract, F07 persistence pattern, API/SDK generation path and existing binding assertions before implementation.
- Tool: `apply_patch`; result: implemented versioned PaymentMandate and PolicyDecision persistence/API/SDK, added SQLite Schema v13 indexes, and added deterministic PaymentIntent mandate evaluation.
- Tool: `apply_patch`; result: tightened persistent Mandate activation to require active/verified Funding Source and Receiving Target bindings; binding lookup accepts the canonical binding ID or existing redacted reference.
- Tool: `node --test sandbox/f08.test.mjs`; result: 4/4 passed, including persistent binding gate.
- Tool: `npm --prefix sandbox test`; result: 122/122 passed.
- Tool: `node docs/03-technical/validate-contract.mjs`; result: 63 invariants and 6 MCP tools passed.
- Tool: `npm --prefix packages/typescript-sdk test`; result: generated contract, format, lint, typecheck, build and 10/10 tests passed.
- Tool: `npm --prefix prototype run lint && npm --prefix prototype run build`; result: passed.
- Tool: `git diff --check`; result: passed.
- Boundary: F08 remains Local/ Sandbox/Testnet contract and authorization logic only; no Provider, Signer, x402/AP2 execution, Hosted deployment, Live/Mainnet, custody or production credentials were enabled.
- Tool: `git commit`; result: created `502a977` (`feat(mandates): enforce versioned autonomous payment grants`) and `a232fcc` (`docs(f08): prepare R2 review evidence`).
- Tool: `git push -u origin`; result: pushed `feat/mandates-versioned-policy` to `origin`.
- Tool: `gh pr create` / `gh pr edit`; result: opened Draft PR #34 with `.github/pull_request_template.md`, title `feat(mandates): enforce versioned autonomous payment grants`, and complete R2 evidence.
## 2026-09-08 · F09a 自主支付执行实现

- Tool: `gh pr view`, `git switch/pull/branch -d`; result: confirmed PR #34 merged at `151cf7f`, synchronized `main`, deleted local `feat/mandates-versioned-policy`.
- Tool: `graphify query`; result: traced F08 PolicyDecision → PaymentIntent → reserve() → Adapter/Wallet/Budget Hold/atomic commit and existing execution_status gate.
- Tool: `apply_patch`; result: added immediate/deferred execution mode, idempotent execution endpoint, `payment_intents:execute` permission, OpenAPI/SDK bindings and F09a tests.
- Tool: `node --test sandbox/f09a.test.mjs`; result: 3/3 passed.
- Boundary: F09a does not change Provider unknown recovery, does not call Live/Mainnet or Hosted resources, and does not load production credentials.
## 2026-09-09 · F14 Payment / Collection / Refund / Fee Reconciliation implementation

- Tool: `git switch`, `git pull`, `git branch -d`; result: verified PR #39 merged, fast-forwarded `main` to `528e4fd`, deleted `feat/bounded-refunds-recovery`, and created `feat/reconciliation-payment-facts`.
- Tool: `graphify query`; result: traced F14 to existing Transaction, Collection, Refund, FinancialPosting, Adapter Operation and generic SQLite resources; no second ledger or Transaction Core required.
- Tool: `apply_patch`; result: added immutable ProviderFee facts, deterministic ReconciliationRun snapshots, HTTP/OpenAPI/Access Contract/TypeScript SDK surfaces and F14 tests/docs.
- Tool: `node`, `npm`; result: F14 domain 2/2, HTTP 1/1, Sandbox 147/147 regression, SDK generated/typecheck/lint and contract checks passed.
- Boundary: F14 only reads and records Local/Simulation evidence; it does not query or mutate real Providers, does not replay unknown results, and does not enable Hosted, Live/Mainnet, custody or production credentials.
## 2026-09-09 · F15a bounded internal execution sessions

- Tool: `gh pr view`, `git checkout`, `git pull --ff-only`, `git branch -d`; result: verified PR #40 merged, fast-forwarded `main` to `0995aac`, deleted `feat/reconciliation-payment-facts`.
- Tool: `graphify query`; result: traced environment `execution_status`, hosted activation, PaymentMandate, Transaction Core and generic SQLite resources before selecting the F15a boundary.
- Tool: `git checkout -b feat/bounded-sandbox-execution-sessions`; result: created the next isolated implementation branch from merged `main`.
- Tool: `apply_patch`; result: added persisted ExecutionSession lifecycle, independent activation, 15-minute window, account/Agent/environment binding, session spend reservation/commit/release, HTTP/OpenAPI/access/SDK surfaces and F15a tests/docs.
- Tool: `node`, `npm`; result: domain syntax, F15a targeted tests (4/4), contract validation (63 invariants / 6 MCP tools), SDK generation/typecheck/lint/build and SDK tests (10/10) passed.
- Boundary: F15a remains Local / internal Sandbox-Testnet only; no BU2 Task platform, Hosted, Live/Mainnet, custody, production credential or real Provider payment was enabled. Independent R2 Domain and Architecture review is still required.
## 2026-09-09 · LA-06a 本地全量与隔离准入

- Scope: 暂停 E3.1；先把 Ledger Assurance Gate 的原仓库回归、故障/属性/跨租户证据收敛为本地门禁。真实 Sandbox 双向收付另列 LA-06b。
- Tool: `graphify query`, `rg`, `sed`; result: traced existing atomicity, access-control, identity, operations, Hosted contract and full Sandbox suites; no new Provider or transaction core was required.
- Tool: `apply_patch`; result: added deterministic LA-06a amount/claim tests, local gate runner, evidence validator, package script, product/technical/roadmap/README/CHANGELOG and audit records.
- Boundary: `node deploy/la06a-local-gate.mjs` must report `execution_status=execution_disabled`, `payment_execution_attempted=false`, `live_enabled=false`, and `external_sandbox_bilateral.accepted=false`; no external settlement claim is allowed.
## 2026-09-09 · RT-01 固定运行时与 SQLite 账本准入

- Scope: LA-06a 合并后推进审计路线 RT-01；LA-06b 真实 Sandbox 双向收付仍需外部 Hosted 条件，未在本 PR 执行。
- Tool: `rg`, `sed`; result: confirmed Dockerfile pins Node 22.16.0 in both stages, Sandbox requires Node >=22.16.0, SqliteLedger exposes WAL, migration, integrity and Online Backup paths.
- Tool: `apply_patch`; result: added runtime assurance runner/test, `test:rt01`, RT-01 product/technical/roadmap/README/CHANGELOG and audit records.
- Tool: `npm`, `node`; result: RT-01 2/2, Node v23.11.0, WAL, foreign keys, Schema 1–17 continuity, backup integrity and isolated restore passed; no Provider/Signer/payment execution.
- Submission verification: `npm --prefix packages/typescript-sdk test`, `npm --prefix prototype run lint`, `npm --prefix prototype run build`, `git diff --check`; result: SDK 10/10 with generated/format/lint/type/build gates, Prototype lint/build and diff check passed; final `rt01.v1` remained `passed`.
- Boundary: Local-only evidence; no image mutation, Schema migration, Hosted endpoint, Base Sepolia payment, Live/Mainnet or E3.1 activation.

## 2026-09-09 · LA-03d 多账户账簿所有权与余额投影契约

- Scope: RT-01 合并后，LA-06b 仍受外部 Hosted/Base Sepolia 条件阻塞；先冻结 LA-03 完整范围的本地实现边界。
- Tool: graphify query, rg, sed; result: confirmed LA-03c is read-only, current wallet persistence is single-projection, and the audit still lists multi-account ownership, projection cutover and historical migration as incomplete.
- Tool: apply_patch; result: added LA-03d contract and synchronized product/technical/roadmap/CHANGELOG/verification documentation.
- Boundary: documentation-only; no Schema, API, runtime balance, Provider, Sandbox/Testnet payment, Hosted, Live/Mainnet or E3.1 activation changed.

## 2026-09-09 · LA-03d Schema 与所有权约束实现

- Scope: 依据已合并 LA-03d 契约，增加多账户账簿所有权的持久化 Schema 与条件版本状态转换；不接入现有资金过账或运行时余额切换。
- Tool: apply_patch; result: added Schema 16 ledger_accounts, unique ownership tuple, environment/tenant/book/owner/asset/network validation and restart-safe persistence.
- Tool: node --test sandbox/la03d.test.mjs; result: 4/4 passed, covering idempotency, tenant/environment isolation, version conflicts, terminal retirement and SQLite restart.
- Boundary: local-only schema foundation; no Provider, signer, payment, Hosted, Base Sepolia, Live/Mainnet or E3.1 activation.

## 2026-09-09 · LA-03d Posting 绑定与按账户投影实现

- Scope: 在已合并 Schema 16 基础上增加 Schema 17 `financial_postings.ledger_account_id`、active 账簿账户绑定校验和按账簿账户只读投影重建；不切换运行时钱包余额或历史事实。
- Tool: `apply_patch`; result: extended SQLite migration/persistence, posting fingerprint/idempotency comparison, domain projection key and scoped projection API; added `sandbox/la03d-posting.test.mjs` and package script.
- Tool: `node --test sandbox/la03d-posting.test.mjs`; result: targeted LA-03d Posting/投影 tests 3/3 passed, covering binding, inactive/unknown/cross-environment rejection and account isolation.
- Tool: `npm --prefix sandbox test`; result: 191/191 passed after normalizing legacy `ledger_account_id: null` in replay evidence; `node deploy/runtime-assurance.mjs` passed with Schema 1–17; contract validation 63 invariants/6 MCP tools; SDK 10/10; Prototype lint/build and `git diff --check` passed.
- Audit boundary: the separately reported refund external-success/local-commit-failure re-occupation issue remains a Release blocker and is intentionally not mixed into this LA-03d PR; it requires the next dedicated R2 repair.
- Follow-up check: `writeBalancedJournals(..., { environment })` now rejects an active ledger account from another environment; targeted 3/3 and full Sandbox 191/191 were rerun after this guard.
- Boundary: local-only; no Provider, signer, payment, Hosted, Base Sepolia, Live/Mainnet or E3.1 activation.

## 2026-09-09 · LA-01b 已确认退款事实恢复与新请求防重复

- Scope: PR #58 合并后处理审计确认的 Release 阻断；修复外部退款成功、RefundAttempt 已持久化但本地 Transaction/Refund 提交失败时，换新幂等键可能重复调用 Provider 和重复占用额度。
- Tool: `apply_patch`; result: added `reconcileConfirmedRefundAttempts`, invoked before a new refund Provider call, and added a regression using a new idempotency key.
- Tool: `node --test sandbox/f13.test.mjs`; result: regression currently passes 8/8, including the new-key recovery case.
- Boundary: Local/Simulation only; no real Provider, Hosted, Base Sepolia, Live/Mainnet, custody or E3.1 activation. Release remains blocked until this PR is reviewed and merged.

## 2026-09-09 · LA-01c 已确认但未入账退款继续占用剩余容量

- Scope: 复核外部修复包后发现 LA-01b 的“立即恢复并返回”语义不足以覆盖剩余容量先用、原键后补记的交错顺序；按审计矩阵改为在 `refundReservation` 中统计未被 Refund 资源覆盖的 `refunded` Attempt。
- Tool: `apply_patch`; result: removed immediate new-request reconciliation, added `refunded` reservation with `excludeRefundId`/`knownRefundIds` safeguards, and added `sandbox/la01-confirmed-unposted-refunds.test.mjs`.
- Tool: `node --test sandbox/f13.test.mjs sandbox/la01-confirmed-unposted-refunds.test.mjs`; result: 11/11 passed, covering same-process, SQLite restart, new-key over-capacity rejection, remainder-first, original-key posting and interleaved order.
- Boundary: Local/Simulation only; no Schema change, LA-03d change, real Provider, Hosted, Base Sepolia, Live/Mainnet, custody or E3.1 activation.

## 2026-09-09 · LA-01d 退款请求条款持久化绑定

- Scope: 根据 PR #60 复审 R60-01，修复 processing Claim 清理后同一退款 key 可能携带新金额/原因而复用旧 RefundAttempt 的 P0 缺口。
- Tool: `apply_patch`; result: added Schema 18 `refund_attempts.request_fingerprint`, legacy backfill, domain-side immutable terms comparison and pre-quota/provider rejection.
- Tool: `node --test sandbox/la01-refund-request-binding.test.mjs sandbox/f13.test.mjs sandbox/la01-confirmed-unposted-refunds.test.mjs`; result: 14/14 passed, covering failed Attempt, SQLite restart, confirmed-unposted drift, remaining-capacity rejection and Adapter call count.
- Tool: `npm --prefix sandbox test`; result: 198/198 passed.
- Tool: `node deploy/runtime-assurance.mjs`, contract validation, SDK test, Prototype lint/build and `git diff --check`; result: Schema 1–18 passed, 63 invariants/6 MCP tools passed, SDK 10/10 and local quality gates passed.
- Boundary: Local/Simulation only; no real Provider, Hosted, Base Sepolia, Live/Mainnet, custody or E3.1 activation. Release remains blocked pending R2 review and merge.

## 2026-09-09 · R61 退款不确定结果与确认恢复修复

- Scope: 修复审计 R61-01/R61-02；提交后无法证明外部未生效的异常统一保留 `provider_unknown` 占用，已确认 Attempt 直接补记本地事实。
- Tool: `apply_patch`; result: 更新 `sandbox/domain.mjs`，补充 F13 回归测试覆盖外部效果后异常、新键额度保护和确认恢复不查询 Provider。
- Tool: `node --test sandbox/f13.test.mjs sandbox/la01-refund-request-binding.test.mjs sandbox/la01-confirmed-unposted-refunds.test.mjs`; result: 16/16 passed。
- Boundary: Local/Simulation only; no real Provider, Hosted, Base Sepolia, Live/Mainnet or custody.

## 2026-09-09 · LA-05b 历史回放基线修复

- Scope: 历史 `as_of` 回放按 checkpoint 生效时间纳入开账事件及其不可变分录，避免迁移写入时间晚于回放时点时误报缺口。
- Tool: `apply_patch`; result: 更新 `exportLedgerReplayEvidence`，不生成或改写历史分录。
- Tool: `node --test sandbox/la05b.test.mjs`; result: 4/4 passed。
- Boundary: Local/Simulation only; no provider or financial execution.

## 2026-09-09 · CI-02 合并证据绑定

- Scope: 严格绑定 CI foundation/runtime 证据到同一 run/attempt、checkout commit/tree 和 Local/Simulation 边界。
- Tool: `apply_patch`; result: 新增 `scripts/ci/validate-evidence.mjs`、负向测试、CI-02 文档，并让 workflow 保存原始 JSON/日志和验证 manifest。
- Tool: `node --test scripts/ci/validate-evidence.test.mjs`; result: 2/2 passed；workflow YAML 解析通过。
- Boundary: no financial credentials, Provider calls, Hosted, Testnet, Mainnet or automatic release.

## 2026-09-09 · CI-RT01 发布镜像内运行时验收

- Scope: 固定 Node image digest，并在实际制品内验证 Node/npm/SQLite、Schema、WAL 和备份恢复。
- Tool: `docker build` / `docker run`; result: OrbStack candidate image passed as UID/GID 10001 with Node v22.16.0, SQLite 3.49.1 and Schema 1–18; its per-build image ID is preserved in the generated evidence artifact.
- Tool: `apply_patch`; result: added runtime policy, image probe/validator/tests and required CI runtime-image job; bound the JSON image ID to the builder's separate ID artifact.
- Tool: `node --test`; result: RT-01/CI-RT01 targeted tests 4/4 passed, including runtime, source commit, image ID and execution-boundary drift rejection.
- Tool: `node deploy/la06a-local-gate.mjs`; result: passed with Sandbox 202/202, LA-06a 4/4, deployment/Hosted contracts 23/23, SDK 10/10, contract validation, Prototype lint and build.
- Tool: `ruby` / `git diff --check`; result: workflow YAML parsed and patch whitespace validation passed.
- Tool: `graphify update .`; result: code knowledge graph updated after implementation; the final incremental pass reported no further topology drift.
- Boundary: container runs as UID/GID 10001 with network disabled and root filesystem read-only; no Signer, Provider, Hosted, Testnet, Mainnet or payment execution.

## 2026-09-10 · CI-03 有边界账本 Release Candidate

- Scope: PR #69 合并后清理本地 CI-RT01 分支，从 `d05b5ec` 创建 `ci/bounded-ledger-release-candidates`；只准备 Local/Integration 候选，不执行发布或资金动作。
- Tool: `rg` / `sed` / Graphify instructions; result: traced CI-01/CI-02/CI-RT01 evidence, runtime image and release policy boundaries; confirmed request, evidence, image and archive must be bound to one protected-main source and workflow run.
- Tool: `gh api`; result: branch-protection endpoint returned HTTP 403 with the private-repository plan upgrade requirement. Decision: retain the protected-main assertion and fail closed rather than weaken admission.
- Tool: `apply_patch`; result: added read-only manual candidate workflow, release policy, protected-main request validator, source/run/image/archive manifest generator, negative tests, product/technical contracts and synchronized README/CHANGELOG records.
- Tool: `node --test`; result: CI/RT targeted matrix passed 13/13, including CLI rejection of an unprotected main ref, post-validation request-file creation and cross-run/ref evidence drift.
- Tool: `node deploy/la06a-local-gate.mjs`; result: passed with Sandbox 202/202, LA-06a 4/4, deployment/Hosted 23/23, SDK 10/10, contract validation and Prototype lint/build.
- Tool: Ruby YAML, Node JSON/syntax and `git diff --check`; result: all local syntax and patch checks passed.
- Boundary: candidate status is always `prepared_not_released`; tag, GitHub Release, registry, Hosted, Sandbox/Testnet bilateral settlement, Live/Mainnet, Signer, Provider and payment execution remain unauthorized. E3.1 remains paused and LA-06b remains not executed.
