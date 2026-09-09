# CI-02 证据绑定说明

更新日期：2026-09-09  
维护者：Codex

CI-02 在 CI-01 基础上对合并证据执行严格绑定：`BU2 / CI Gate` 只接受同一 workflow run/attempt 的 foundation 与 runtime 制品，并校验实际 checkout 的 commit、tree、事件、运行批次和 Local/Simulation 边界。

`scripts/ci/validate-evidence.mjs` 固定要求 LA-06a 的七个检查 ID 恰好各出现一次，检查状态为 `passed` 且退出码为 0；测试类检查不得报告 0 个用例。它同时为原始 JSON 与日志生成 SHA-256，输出 `bu2.ci.v1` manifest，供后续 CI-03 发布候选绑定。

本工作流不使用 `pull_request_target`、OrbStack self-hosted runner、资金凭证或自动发布权限。缺少制品、来源 SHA 不匹配、检查失败或边界声明异常都会使汇总 Gate 失败；制品上传成功不等于验证通过。

## 验证范围

- 本地证据验证器单元测试：2/2。
- workflow YAML 语法解析：通过。
- GitHub Actions 远程运行：由 PR 触发，不能用本地结果替代。

LA-06b 双向 Sandbox/Testnet、Live/Mainnet 和生产资金执行仍不在范围内。
