# CI-04 定时账本韧性与供应链契约

日期：2026-09-10
执行者：Codex
风险等级：R2

## 目标

CI-04 在常规 PR 门禁之外持续发现低频故障、账本增长和依赖风险。它回答三个问题：

1. 真实账本模块在故障、重启、恢复和迁移组合下是否仍保持既有不变量？
2. 固定 seed 的更大输入序列和单写者容量基线是否仍可重现并通过？
3. 锁定依赖是否出现新的高危或严重 advisory，已有例外是否仍适用且未过期？

## 验收对象

| 对象 | 必需结果 |
| --- | --- |
| 故障注入 | 原子提交、退款未知/确认恢复、x402 未知结果与并发路径使用真实模块通过 |
| 属性与容量 | 至少四个固定 seed，保存完整步骤序列；1,000 个 Journal/2,000 条 Posting 可备份恢复且保持平衡 |
| 迁移与恢复 | SQLite 状态恢复、历史回放、Schema 连续性、Online Backup 与运维恢复通过 |
| 锁定依赖 | 三个 workspace 直接依赖和 override 为精确版本，lockfile v3 与完整性元数据匹配 |
| Advisory | 新的 high/critical 默认阻断；例外必须绑定 workspace、包、advisory、实际版本、Owner 与到期日 |
| 证据 | commit/tree、Node 版本、seed、测试数量、完整日志路径与 SHA-256 可核对 |

两个 nightly job 均使用固定 `Node 24.20.0`，不得随 GitHub runner 默认版本漂移。

任何测试为零、失败、skip/todo、日志缺失、新高危/严重问题、未匹配或过期例外都不得输出通过结论。失败仍应上传诊断 artifact，但上传成功不等于 Gate 通过。

## 产品与发布边界

- CI-04 是 Local/Simulation 的持续工程证据，不是用户任务、支付审批或 BU2 交易状态。
- nightly 不自动准备或晋级 Release Candidate，不创建 Tag、Release、registry package 或部署。
- 不加载 Signer、Provider、业务 API/RPC Secret，不执行 Hosted 或 Sandbox/Testnet 双向支付。
- `LA-06b=not_executed`、E3.1 保持暂停，Live/Mainnet 和真实资金保持关闭。
- CI-04 通过不能替代独立 R2 审查，也不能解除 CI-03 对受保护 `main` 的准入要求。

## 恢复

工作流本身只读。出现误报时应保留失败 seed、完整日志和 audit JSON，修正测试、依赖或有时限的例外策略后重新运行；不得使用永久 `continue-on-error`、删除断言或自动 `npm audit fix` 使检查变绿。
