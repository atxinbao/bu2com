# CI-04 Ledger Nightly 技术说明

更新日期：2026-09-10
维护者：Codex

## 工作流

`.github/workflows/ledger-nightly.yml` 每日 UTC 18:17 定时运行，也支持手工传入逗号分隔的 property seed。工作流权限固定为 `contents: read`，使用 GitHub-hosted `ubuntu-24.04` 和固定 SHA 的官方 `setup-node` 将两个 job 对齐到 `Node 22.16.0`；不使用 OrbStack/self-hosted runner，也不加载业务或资金 Secret。

工作流包含两个独立 job 和一个 `always()` 汇总 Gate：

```text
ledger resilience ----┐
                      ├─> BU2 / Ledger Nightly Gate
supply chain ---------┘
```

任一 job 失败、取消或跳过，汇总 Gate 都失败。两个 job 均在失败时上传原始日志和机器可读证据，保留 30 天。

## 账本韧性

`scripts/ci/ledger-resilience.mjs` 顺序运行并保存三类真实模块测试：

| Check ID | 覆盖 |
| --- | --- |
| `ledger_fault_injection` | `atomicity`、已确认未入账退款、退款条款绑定和 x402 故障/并发 |
| `ledger_property_and_capacity` | 四组或更多固定 seed 的 Journal 属性序列，以及固定单写者 SQLite 增长基线 |
| `ledger_migration_and_recovery` | SQLite 持久化、LA-05b 历史回放、RT-01 迁移/备份和 ENV-06 恢复 |

`sandbox/ledger-nightly.test.mjs` 对每个 seed 生成 64 个确定性金额步骤，间隔注入不平衡 Journal 并确认拒绝，然后写入合法 Journal。失败信息和 stdout 都包含 seed 与完整步骤序列。容量用例在一个 SQLite 单写者事务中写入 1,000 个 Journal/2,000 条 Posting，执行 Online Backup 后重新打开并核对完整性；30 秒和 32 MiB 是宽松的回归上界，不是生产 SLA 或多写者容量承诺。

输出 `ci04.ledger-resilience.v1`，绑定源码 commit/tree、Node/平台、seed、检查命令、退出码、测试/通过/失败/skip/todo 数、耗时和 stdout/stderr SHA-256。测试为零或任何 skip/todo 均失败关闭。

## 供应链

`scripts/ci/supply-chain.mjs` 对 `sandbox`、`packages/typescript-sdk` 和 `prototype` 执行：

1. 校验直接 dependencies/devDependencies/optionalDependencies 与 npm override 均为精确版本。
2. 校验 package-lock v3、根声明一致、直接依赖已解析，以及 registry 包存在 SHA-512 integrity。
3. 在 `npm ci` 后运行只读的 `npm audit --json`，使用已安装依赖树访问 bulk advisory 端点，并保存每个 workspace 的原始报告。
4. 默认阻断 high/critical advisory；moderate/low 仍保留在原始计数中，但不作为本版本发布阻断阈值。
5. 通过 `scripts/ci/supply-chain-exceptions.json` 管理显式例外。

每个例外必须包含 `workspace`、`package`、`advisory_id`、实际 `installed_versions`、`owner`、`rationale` 和 `expires_on`。过期、版本漂移和不再命中任何 advisory 的例外都会失败；当前策略为空，不存在已批准例外。

本 PR 将 SDK 的 `@redocly/openapi-core/js-yaml` 锁定到修复版本，并升级 Prototype 的 React 19.2 补丁、vinext/Vite/Cloudflare 工具链；上游 `miniflare` 固定的 `sharp` 通过精确 npm override 提升到 0.35.4。没有运行 `npm audit fix`。

## 本地复核

```bash
npm --prefix sandbox run test:ledger-nightly
node --test scripts/ci/ledger-resilience.test.mjs scripts/ci/supply-chain.test.mjs

node scripts/ci/ledger-resilience.mjs \
  ledger-resilience-evidence.json nightly-logs
node scripts/ci/supply-chain.mjs \
  supply-chain-evidence.json supply-chain-logs
```

本地生成物不应提交。GitHub artifact 也不是 Release、Hosted/Testnet 或生产资金证据；CI-03、CI-05/LA-06b 和任何外部环境准入继续独立管理。
