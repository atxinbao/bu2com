# CI-03 有边界账本 Release Candidate 契约

更新日期：2026-09-10
维护者：Codex
风险等级：R2（账本制品、证据与发布准入）

## 1. 目标

CI-03 将已经通过 CI-01、CI-02 与 CI-RT01 的确定 `main` 提交，准备为可下载、可复核但**尚未发布**的 Ledger Core Local/Integration Release Candidate。候选必须绑定同一份源码、同一次本地门禁、同一次镜像运行时证据和同一份 Docker archive，不能在批准后重新构建同名制品。

## 2. 准入条件

- 只能通过 `workflow_dispatch` 从 `refs/heads/main` 启动。
- `github.ref_protected` 必须为 `true`；没有分支保护时失败关闭。
- 用户输入的完整 source SHA、workflow SHA 和实际 checkout SHA 必须完全相同。
- 版本必须符合 `ledger-vX.Y.Z-rc.N`，且同名 Git tag 尚不存在。
- checkout 必须干净；基础门禁、宿主运行时和镜像运行时证据必须全部通过。
- Docker image ID、导出 archive SHA-256、源码 commit/tree、workflow run/attempt 和证据文件哈希必须写入 `ci03.release-candidate.v1`；请求与 CI 证据中的 run/attempt 必须相同。CI-02 上游还必须证明 foundation/runtime producer 的 source commit 和 run/attempt 与同一 checkout/run 一致，并保留必需原始日志。
- 安装依赖和运行门禁后，受版本控制的文件必须仍无差异；生成的临时证据不允许掩盖源码漂移。

当前私有仓库的 GitHub 套餐尚未提供分支保护能力，因此工作流在该条件改变前会以 `The main ref is not protected` 拒绝候选。不得删除或放宽该断言来制造成功记录。

## 3. 候选能力边界

候选只声明：

- Local 账本与集成测试基线；
- 当前 SQLite Schema 21、WAL 与 Online Backup/restore；
- 固定 Node/npm/SQLite 运行时；
- 可加载的不可变 Docker archive；
- 源码、制品与证据绑定的机器清单。

候选明确不包含：

- Hosted 部署；
- Sandbox/Testnet 双向结算；
- Live/Mainnet；
- 真实资金或生产托管；
- 自动创建 tag、GitHub Release 或 registry publish；
- 任何 Signer、Provider 或支付执行。

## 4. 状态与批准

成功输出的状态固定为 `prepared_not_released`，`candidate_promotion_authorized=false`。PR 合并、Actions 成功和 artifact 上传都不构成发布批准。

真正创建 tag、GitHub Release 或晋级 registry 前，必须由独立 R2 审查者核对候选 manifest，并由 Project Owner 对**同一 source SHA、tree、image ID、archive SHA-256、manifest hash、版本和 Local/Integration 范围**作出独立批准。任何字节变化都必须生成新的候选。

## 5. 验收

- 发布请求和候选生成器的正常/负向测试通过。
- 普通 PR 的 `runtime` job 执行全部 CI validator 测试。
- workflow YAML 可解析，且仅具有 `contents: read`。
- 当前未保护仓库必须被准入脚本拒绝。
- 分支保护启用后，才可执行一次真实 `workflow_dispatch` 并保存 90 天候选 artifact。

该契约通过不等于正式 Release、LA-06b、Hosted、Testnet、Live/Mainnet 或生产资金准入。
