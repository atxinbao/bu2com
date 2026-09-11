# CI-03 v3 Social Wallet Local Integration Release Candidate 与晋级契约

更新日期：2026-09-11
维护者：Codex
风险等级：R2（账本制品、证据与发布准入）

## 1. 目标

CI-03 将已经通过 CI-01、CI-02、CI-RT01 与 FP-08 Local 产品验收的确定 `main` 提交，准备为可下载、可复核但**尚未发布**的 Social Wallet Local Integration Release Candidate。候选必须绑定同一份源码、同一次本地门禁、同一次镜像运行时证据、同一 image ID 的 FP-08 acceptance 和同一份 Docker archive，不能在批准后重新构建同名制品。

## 2. 准入条件

- 只能通过 `workflow_dispatch` 从 `refs/heads/main` 启动。
- `github.ref_protected` 必须作为布尔证据保存，但不再作为候选准备的准入条件。当前私有仓库无法启用分支保护时，`false` 是可接受且不可伪装的观测值。
- 用户输入的完整 source SHA、workflow SHA 和实际 checkout SHA 必须完全相同。
- 版本必须符合 `social-wallet-vX.Y.Z-rc.N`，且同名 Git tag 尚不存在。
- checkout 必须干净；LA-06a 必须完整运行并保存七项 `passed/failed`、退出码和失败项。它和 `main protected=false` 一样是必须如实披露的质量观测，不是 Local prerelease 的硬阻断条件；宿主与镜像运行时、Public Wallet API 产品验收和不可变制品校验仍必须通过。
- Docker image ID、导出 archive SHA-256、源码 commit/tree、workflow run/attempt、FP-08 acceptance SHA-256 和证据文件哈希必须写入 `ci03.release-candidate.v3`；请求与 CI 证据中的 run/attempt 必须相同。`fp08.social-wallet-acceptance.v2` 必须绑定相同 source commit/image ID，证明账户级写源、买方 Payment/Refund ProviderFee 语义和认证 Public Wallet API。旧 v1 证据不得被解释为 v2 通过。CI-02 上游还必须证明 foundation/runtime producer 的 source commit 和 run/attempt 与同一 checkout/run 一致，并保留必需原始日志。
- 安装依赖和运行门禁后，受版本控制的文件必须仍无差异；生成的临时证据不允许掩盖源码漂移。

CI-03 v3 以精确来源绑定替代不可满足的分支保护硬条件：请求提交、workflow 提交和实际 checkout 必须相同，ref 必须是 `refs/heads/main`，工作树必须干净，同名 Tag 必须不存在，七项 LA-06a 结果和不可变镜像证据必须绑定同一 run/attempt。分支保护与 LA-06a 状态只如实记录，不得伪造为 `true` 或 `passed`。

候选准备前还必须确认历史 `ledger-rc-local-v0.1` 仍指向 `005b3949de4672a5aae301bd9b511e47b8be89fa`；新产品 RC 不移动或覆盖旧标签。

## 3. 候选能力边界

候选只声明：

- Local 账本与集成测试基线；
- 当前 SQLite Schema 22、WAL 与 Online Backup/restore；
- Local 账户级资金写源与 buyer-side Payment/Refund ProviderFee 单次扣减；
- 认证 Account 范围内的 Public Wallet API v1；
- 固定 Node/npm/SQLite 运行时；
- 可加载的不可变 Docker archive；
- 源码、制品与证据绑定的机器清单。

候选明确不包含：

- Hosted 部署；
- Sandbox/Testnet 双向结算；
- Live/Mainnet；
- 真实资金或生产托管；
- 未经 Project Owner 手工批准的自动 tag、GitHub Release 或 registry publish；
- 任何 Signer、Provider 或支付执行。
- Collection 运行时净入账。

## 4. 状态与批准

候选准备成功时输出状态固定为 `prepared_not_released`，`candidate_promotion_authorized=false`。PR 合并、Actions 成功和 artifact 上传都不构成发布批准。

`social-wallet-release-promotion.yml` 是唯一晋级入口。它要求配置中的 Project Owner 从候选同一 main SHA 手工触发，引用成功的候选 run/attempt，下载原 artifact，重新验证 source SHA、tree、image ID、archive SHA-256、manifest 与 evidence hashes，并提交由版本和完整 SHA 决定的精确批准声明。通过后只创建同版本 Git Tag 和 GitHub prerelease；不要求第二位自然人重复批准，AI 不得自批。任何字节变化都必须生成新的候选。

晋级保留 `main_ref_protected` 与 LA-06a 的真实观测，不把失败值改写成通过。GitHub prerelease 不授权 registry、Hosted 部署、Signer、Provider、Testnet/Mainnet 支付或真实资金。

## 5. 验收

- 发布请求和候选生成器的正常/负向测试通过。
- 普通 PR 的 `runtime` job 执行全部 CI validator 测试。
- 候选 workflow YAML 可解析且只有只读内容权限；晋级 workflow 仅增加下载候选 artifact 与创建 Git Tag/GitHub prerelease 所需的 `actions: read`、`contents: write`。
- 未保护仓库必须生成 `ref_protected=false` 的候选请求证据，并通过同一组来源绑定检查。
- 候选准备、晋级生成器及其篡改/身份/批准负向测试通过；当前仓库可以用两个独立 `workflow_dispatch` 先保存 90 天候选 artifact，再由 Project Owner 明确批准晋级。

该契约通过不等于正式 Release、LA-06b、Hosted、Testnet、Live/Mainnet 或生产资金准入。
