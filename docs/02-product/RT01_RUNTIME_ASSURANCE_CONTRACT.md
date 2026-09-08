# RT-01 固定运行时与 SQLite 账本准入契约

更新日期：2026-09-09
维护者：Codex
风险等级：R2（账本持久化与恢复运行时证据）

## 1. 目标

RT-01 验证包含已修复 SQLite 账本的固定运行时可以在本地重复启动、迁移、写入 WAL 并完成 Online Backup 与隔离恢复。当前迁移连续性为 Schema 1–18；入口为：

```bash
node deploy/runtime-assurance.mjs
```

输出 `rt01.v1` 机器可读证据；任一断言失败时命令以非零状态退出。

## 2. 验收范围

- Node.js 运行时不低于 `22.16.0`。
- Docker 制品的 dependencies/runtime 两个阶段均固定为 `node:22.16.0-bookworm-slim`。
- SQLite 开启 WAL 和 foreign keys。
- Schema migration 从 1 连续到当前版本 15，不跳号、不回退。
- Online Backup 复制到新的隔离文件，源库与恢复库完整性均为 `ok` 且 Schema 一致。
- 运行时证据明确不加载 Signer、不调用 Provider、不执行付款。

## 3. 明确不包含

- 不修改 Docker 基础镜像、SQLite Schema、API、Transaction Core 或支付 Adapter。
- 不创建 Hosted endpoint，不执行 Base Sepolia 或 Mainnet 付款。
- 不把本地 WAL/备份证据解释为高可用、多节点或生产财务准入。
- 不替代 LA-06b 的真实 Sandbox 双向收付与 G-F 审查。

## 4. 放行结论

RT-01 通过只表示固定本地运行时、WAL、迁移和隔离备份恢复可重复验证，达到 **GO for R2 review**。LA-03 完整多账户能力、LA-06b 外部双向证据、E3.1、Live/Mainnet 和生产资金路径仍保持关闭。
