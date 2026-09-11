# CI-02 证据绑定说明

更新日期：2026-09-10
维护者：Codex

CI-02 在 CI-01 基础上对合并证据执行严格绑定：`BU2 / CI Gate` 只接受同一 workflow run/attempt 的 foundation 与 runtime 制品，并校验实际 checkout 的 commit、tree、事件、运行批次和 Local/Simulation 边界。FP-02 进一步要求 foundation/runtime producer 都把 source commit 与 run/attempt 写进原始证据，再由汇总 Gate 与当前 checkout 和 GitHub run 交叉验证。

`scripts/ci/validate-evidence.mjs` 固定要求 LA-06a 的七个检查 ID 恰好各出现一次，每项状态与真实退出码一致；四个实际测试任务必须给出完整的 `tests/passed/failed` 统计，命令型 contract/lint/build 允许没有 `node:test` 统计。汇总器把整体状态、失败项和 `required_to_run=true / required_to_pass=false` 写入 `observations.la06a`。LA-06a 必须运行且不得伪装结果，但和 `main protected=false` 一样，不作为 Local prerelease 的硬阻断条件。

foundation 与 runtime 原始日志文件都属于必需证据；LA-06a producer 会把每个子命令的 stdout/stderr 按检查 ID 原样写入 `foundation.stderr`，而 JSON 只保存结构化摘要。汇总器要求 foundation 日志包含全部七个检查 ID 的原始日志边界，再对原始 JSON 与日志计算 SHA-256；缺失/空壳式不完整日志、tracked source 修改、source commit 漂移、run/attempt 漂移或与 `external_sandbox_bilateral=not_executed` / `execution_disabled` 矛盾的声明都会失败关闭。

本工作流不使用 `pull_request_target`、OrbStack self-hosted runner、资金凭证或自动发布权限。缺少制品、来源 SHA 不匹配、检查失败或边界声明异常都会使汇总 Gate 失败；制品上传成功不等于验证通过。

## 验证范围

- CI evidence validator 正向/负向测试：覆盖 source commit、run/attempt、必需测试统计、日志、tracked source 与执行边界。
- LA-06a / RT-01 producer 专项：证明原始日志与 source identity 不扩大任何资金权限。
- workflow YAML 语法解析：通过。
- GitHub Actions 远程运行：由 PR 触发，不能用本地结果替代。

LA-06b 双向 Sandbox/Testnet、Live/Mainnet 和生产资金执行仍不在范围内。
