# Phase 0 Transaction Trust Gate

日期：2026-09-06

执行者：Codex

状态：In progress · Gate 1–2 merged · Gate 3 implemented locally

风险等级：R2

## 1. 目的

在 Epic 3 对外试点前，先证明 BU2 的交易证据、数据库状态和 x402 执行路径不会把篡改、并发竞争或未知支付结果错误呈现为成功。该 Gate 不扩大产品范围，也不授权 Mainnet、真实资金或托管。

## 2. 顺序与完成门槛

### Gate 1：Receipt v0.2 与界面真实性

- 使用 RFC 8785 JCS 递归规范化 Receipt 全部签名字段。
- 签名覆盖金额、币种、环境、收付款方、Mandate、交付证据、支付通道和 Provider 引用。
- 验证结果区分 `signature_valid`、`issuer_trusted`、`settlement_confirmed`；只有三项都成立时 `valid=true`。
- 以追加迁移保存历史公开验证键；服务重启后旧 Receipt 仍可验证，私钥不写入账本。
- 真实 API 页面按实际状态展示；未签发、未知、旧版或无效 Receipt 不得显示成功。

当前状态：已通过 PR #15 人工审查并合并。

### Gate 2：数据库幂等与交易原子性

- 操作前登记幂等 `processing` 状态并使用数据库唯一约束。
- 余额检查与预留改为条件式数据库更新。
- 状态、余额、LedgerEvent、Webhook Outbox 与幂等终态在同一数据库事务提交。
- 通过并发请求、进程中断和故障注入验证不会重复预留或留下部分状态。

当前状态：已通过 PR #16 人工审查并合并。

### Gate 3：x402 Testnet 可信执行

- 持久化完整支付授权条款，并在实际签名前重新比对 amount、asset、network、resource 与 `payTo`。
- 对外调用前持久化 Payment Attempt。
- 崩溃恢复只允许查询或对账，不得自动重新付款。
- 仅覆盖 Base Sepolia Testnet；Mainnet 仍为 NO-GO。

当前状态：本地实现完成，等待独立 R2 PR 人工审查；不得据此启动 Mainnet 或真实资金。

## 3. Epic 3 准入

Gate 1–3 均通过本地自动化、篡改、并发、重启与浏览器回归，并经各自 R2 PR 人工审查合并后，Epic 3 才能执行 Pilot Manifest、外部证据共享和三团队试点。否则任何 `receipt_valid=true` 都不能作为可信试点证据。

审计报告中的界面性能项不阻塞交易可信度 Gate；公网化相关控制只在 Sandbox endpoint 对外暴露前进入准入。
