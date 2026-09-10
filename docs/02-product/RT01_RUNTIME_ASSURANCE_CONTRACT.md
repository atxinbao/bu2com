# RT-01 固定运行时与 SQLite 账本准入契约

更新日期：2026-09-10
维护者：Codex
风险等级：R2（账本持久化与恢复运行时证据）

## 1. 目标

RT-01 验证包含已修复 SQLite 账本的固定运行时可以在本地重复启动、迁移、写入 WAL 并完成 Online Backup 与隔离恢复。当前迁移连续性为 Schema 1–21；入口为：

```bash
node deploy/runtime-assurance.mjs
```

输出 `rt01.v1` 机器可读证据；任一断言失败时命令以非零状态退出。

## 2. 验收范围

- Node.js 运行时固定为 `24.20.0`，Sandbox engine 下限同步为 `>=24.20.0`。
- `runtime-policy.json` 固定 npm `11.19.0`、SQLite `3.53.4`，并永久要求 SQLite 不低于 WAL-reset 修复下限 `3.51.3`；host 与最终镜像都必须精确匹配批准版本且满足该下限。
- Docker 制品的 dependencies/runtime 两个阶段均固定为 `runtime-policy.json` 批准的 Node 镜像及完整 digest。
- 发布镜像以 Sandbox 非特权身份 `10001:10001` 运行，并在内部报告及精确匹配 Node、npm、SQLite 引擎版本和账本 Schema；证据中的 image ID 必须与构建器输出的独立 ID 文件一致。
- SQLite 开启 WAL 和 foreign keys。
- Schema migration 从 1 连续到当前版本 21，不跳号、不回退。
- Online Backup 复制到新的隔离文件，源库与恢复库完整性均为 `ok` 且 Schema 一致。
- 运行时证据明确不加载 Signer、不调用 Provider、不执行付款。

## 3. 明确不包含

- FP-03 历史上只替换批准的 Docker/Node/SQLite 运行时基线；当前 runtime policy 随后续账本迁移同步到 Schema 21，但 Node/npm/SQLite 固定版本和 WAL-reset 安全下限不变。
- 不创建 Hosted endpoint，不执行 Base Sepolia 或 Mainnet 付款。
- 不把本地 WAL/备份证据解释为高可用、多节点或生产财务准入。
- 不替代 LA-06b 的真实 Sandbox 双向收付与 G-F 审查。

## 4. 放行结论

RT-01 通过只表示固定本地运行时、WAL、迁移和隔离备份恢复可重复验证。CI-RT01 进一步要求同一 checkout 构建的不可变镜像在隔离容器内执行 `runtime-image-assurance.mjs`，并将 image ID 与 source commit 写入证据。LA-03 完整多账户能力、LA-06b 外部双向证据、E3.1、Live/Mainnet 和生产资金路径仍保持关闭。
