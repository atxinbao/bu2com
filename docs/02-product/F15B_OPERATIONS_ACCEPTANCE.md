# F15b 业务负载、停机与财务恢复验收契约 v1

日期：2026-09-09  
执行者：Codex  
状态：本地自动化通过，待 Project Owner 以 Domain 与 Architecture 角色审查
适用范围：Phase 0 · Local Simulation / 内部 Sandbox-Testnet

## 1. 目标与边界

F15b 把 F12、F13、F14 与 F15a 组合成一次可重复的内部运营演练，验证业务事实在有限负载、进程停止、SQLite 重启和显式恢复后的完整性。它是运营证据，不是性能基准，也不是公网可用性或真实资金准入。

本 PR 不新增 Provider、Signer、钱包托管、Live/Mainnet、Hosted Sandbox 或生产凭证能力；Sandbox/Testnet 仍由 `execution_disabled` 保护。所有付款、收款、退款和手续费均使用本地 Simulation 事实。

## 2. 验收场景

### 2.1 有界业务负载

连续完成 6 个带独立 Account、Agent、已验证资金绑定、PaymentMandate 和 ExecutionSession 的付款，再完成一次入站收款、一次部分退款和三笔 ProviderFee 记录。最终生成 `matched` ReconciliationRun，并验证支付、收款、退款和手续费总额可重建。

该场景只证明业务闭环在固定候选和有限数量下可重复，不推导吞吐量、延迟 SLO、并发容量或生产规模。

### 2.2 停机与 SQLite 重启

支付预留完成后关闭 Ledger，重新打开同一 SQLite 数据库，确认 Transaction 仍处于 `funds_reserved`、ExecutionSession 仍保留预留支出；恢复交付并结算后重复相同幂等键，不能产生第二笔交易或第二组事实。再次重启后，交易仍为 `settled`，对账结果为 `matched`。

另行启动 Reference Server，向数据库写入一条业务 Quote 后发送 `SIGTERM`，必须输出 `shutdown.started` 与 `shutdown.completed`，以零退出码结束且无 `SQLITE_BUSY` / `SQLITE_IOERR`；重新打开数据库仍能读取 Quote。

### 2.3 Sandbox/Testnet 失败关闭

使用 `environment=sandbox` 与 x402 配置执行相同的会话激活入口时，必须返回 `environment_execution_disabled`，会话保持未激活。F15b 不把本地测试通过解释为真实 Base Sepolia 付款授权。

## 3. 验收命令与证据

```bash
node --test sandbox/f15b.test.mjs
npm --prefix sandbox run test:f15b
```

预期结果：4/4 通过，覆盖：

1. 有界业务负载与对账；
2. 支付预留后的 SQLite 重启与无重复结算；
3. Sandbox/Testnet 保持 `execution_disabled`；
4. 持久化业务状态下的 Reference Server 优雅停机。

完整放行前仍需执行仓库基线命令：Sandbox 全量、契约验证、SDK 生成/类型/Lint/build、Prototype lint/build 和 `git diff --check`。

## 4. 放行与停止条件

只有四个 F15b 场景、既有 F12/F13/F14/F15a 回归和文档审查全部通过，才可把 F15b 标记为本地 R2 候选。以下任一情况都停止后续 F16a：

- 重启后出现重复 Transaction、Refund、Collection、ProviderFee 或 ReconciliationRun 事实；
- 对账出现 `unknown` / `exception`，但测试仍报告成功；
- 停机未关闭 HTTP/SQLite，或出现忙锁/IO 错误；
- Sandbox/Testnet 入口绕过 `execution_disabled`；
- 任何测试依赖真实 Provider、Signer、主网、Hosted 或托管凭证。

F15b 通过不等于内部 Beta 放行。F16a 仍需固定候选上的无人值守双向收付、故障、退款与对账证据，并单独完成 R2 审查。
