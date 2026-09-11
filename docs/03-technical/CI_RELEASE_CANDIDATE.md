# CI-03 v3 Ledger Release Candidate 与晋级技术说明

更新日期：2026-09-11
维护者：Codex

## 工作流

`.github/workflows/ledger-release-candidate.yml` 是只读、手工触发的候选准备入口。它不创建 tag、GitHub Release、registry package、部署或支付操作。

执行顺序：

```text
Exact main ref + exact source SHA
  -> release request admission
  -> LA-06a truthful observation (passed or failed)
  -> host RT-01 evidence
  -> one Docker image build
  -> non-root/no-network/read-only image probe
  -> docker save of the same image ID
  -> CI evidence manifest
  -> bounded RC manifest + release notes
  -> 90-day GitHub artifact
```

准入由 `scripts/ci/validate-release-request.mjs` 执行。它验证 workflow 事件、ref、三个相同的完整 commit SHA、run/attempt、干净 checkout、版本格式和 tag 未占用，并把 `github.ref_protected` 作为布尔证据保存。该值不再决定准入。LA-06a 随后完整执行七项检查并保存 `passed/failed`、退出码和失败项；失败不会被改写为成功，也不单独阻断 Local prerelease。依赖安装与检查结束后，workflow 还会再次拒绝任何受版本控制文件的差异。

候选由 `scripts/ci/release-candidate.mjs` 生成。`deploy/release-policy.json` 固定 release class、版本格式、七项 CI check、允许能力、排除项和执行边界。生成器会重新验证：

- `bu2.ci.v2` 的 source commit/tree、七项真实观察结果与 Local/Simulation 边界；
- `bu2.ci.v2` 的 workflow event/ref/SHA 与准入请求的 run/attempt；
- `rt01.image.v1` 的 source commit、image ID、固定运行时、当前 Schema 22 和禁用执行状态；
- `fp08.social-wallet-acceptance.v2` 的账户级写源、buyer-side fee、认证 Public Wallet API、Local/Simulation 和相同 source/image 绑定；
- Docker archive 非空并计算 SHA-256；
- request、policy、CI evidence、runtime image evidence 和 image ID 文件哈希。

输出文件：

| 文件 | 用途 |
| --- | --- |
| `release-candidate.json` | 机器可读候选清单，状态固定 `prepared_not_released` |
| `release-notes.md` | 能力与明确排除项，不是发布公告 |
| `ledger-release-image.tar` | 从已验证 image ID 导出的同一 Docker 制品 |
| `release-request.json` | 精确 main、输入 SHA 与实际分支保护状态的准入证据 |
| `ci-evidence.json` | CI-02 源码与基础门禁绑定 |
| `runtime-image-assurance.json` | CI-RT01 镜像内运行时证据 |
| `social-wallet-acceptance.json` | FP-08 两 Account / 四 Agent 的 Local 账户级写入证据，绑定同一 source/image |
| 其他 JSON/stderr | 原始基础与运行时证据 |

## 当前执行限制

仓库 API 在 2026-09-10 返回：`Upgrade to GitHub Pro or make this repository public to enable this feature.` CI-03 v3 不再把该账户套餐能力作为候选阻塞项，而是保存 `ref_protected=false`；LA-06a 也保存七项真实状态而不作为 Local prerelease 的单独阻断项。精确 main SHA、同一 workflow/checkout、干净树、Tag 唯一性、不可变镜像和产品验收仍强制。从 GitHub Actions 的 `main` ref 运行：

```bash
gh workflow run ledger-release-candidate.yml \
  --ref main \
  -f candidate_version=social-wallet-v0.1.0-rc.1 \
  -f source_commit=<完整 main SHA>
```

候选成功后仍停在 artifact。manifest 同时绑定 FP-08 acceptance 与历史 `ledger-rc-local-v0.1 @ 005b3949…`。晋级使用独立手工入口：

```bash
gh workflow run social-wallet-release-promotion.yml \
  --ref main \
  -f candidate_version=<候选版本> \
  -f source_commit=<完整 main SHA> \
  -f candidate_run_id=<成功候选 run ID> \
  -f candidate_run_attempt=1 \
  -f approval_statement="I approve <候选版本> at <完整 main SHA> for Local/Simulation prerelease with the recorded LA-06a and main protection observations."
```

该 workflow 要求触发者是 `deploy/release-policy.json` 中的 Project Owner，并验证候选 run 成功、workflow 路径、同一 main SHA/run/attempt、image/archive/manifest/acceptance hashes 和批准声明。它只创建同版本 annotated Git Tag 与 GitHub prerelease，并附上原 candidate manifest、Docker archive 和 `ci03.release-promotion.v1` 批准记录；不会重新 build、移动旧标签、发布 registry、部署或执行付款。若 Tag 已创建而 GitHub Release 创建中断，只允许同 SHA 恢复，仍拒绝覆盖已有 Release。
