# 单一人工 Owner 治理决定

日期：2026-09-11
执行者：Codex（Contributor / Verifier）
批准主体：Project Owner（通过本次明确需求发起，合并后生效）
风险等级：R2（治理和发布准入）

## 背景

BU2 当前由一位人类 Project Owner 推进。要求第二位独立自然人审查，以及要求私有仓库提供当前套餐不支持的 GitHub 分支保护，会让 Local/Simulation Release Candidate 永久无法生成。这两个条件不能继续作为当前阶段的硬阻塞项。

## 决定

- Project Owner 可以明确兼任 Product、Transaction Domain、Architecture、Operations 和 Release Approver。
- R2/R3 仍需要人工批准；AI Agent 只能贡献实现与验证证据，不能自批。
- R2 不再要求第二位独立自然人重复批准。批准记录必须包含目标提交、所代表角色、范围和结论。
- CI-03 v2 继续只接受 `refs/heads/main`，并要求输入 SHA、workflow SHA 和 checkout SHA 完全相同。`github.ref_protected` 作为真实布尔证据保存，但不再决定候选准入。
- 候选继续保持 `prepared_not_released`。Tag、GitHub Release 或 registry 晋级仍需要 Project Owner 对同一源码、镜像、archive 和 manifest 作出明确批准。

## 不变边界

- 不改变 Transaction Core、账本、余额、授权、Receipt、Provider 或资金状态。
- 不启用 LA-06b、Hosted Sandbox、真实 Base Sepolia 双向执行、Live/Mainnet、真实资金或生产托管。
- 不允许 AI 把测试、PR 合并、Tag 或候选 artifact 解释为人工资金授权。

## 恢复与重新评估

回退本治理变更会恢复 CI-03 v1 的分支保护和独立审查要求，不需要迁移数据库或资金事实。项目进入多人治理、开始外部客户承诺或 Project Owner 宣布职责分离时，必须重新评估并通过后续治理变更恢复独立审查。

已发布的 `social-wallet-v0.2.0-rc.1` 不会因本决定被追溯解释为具有此前不存在的候选 artifact 或 LA-06b 证据。
