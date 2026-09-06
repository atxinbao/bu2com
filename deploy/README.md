# BU2 ENV-04/05/06 Deployment and Operations Reference

日期：2026-09-06
执行者：Codex

本目录提供同一不可变镜像、两个隔离部署单元、外部默认鉴权，以及制品提升、监控、在线备份和隔离恢复的本地参考实现。它只用于验证环境、关闭入口与恢复边界；不是云部署、公开 Sandbox 或 Live 上线方案。

## ENV-07B Hosted Sandbox 部署准备

`hosted-sandbox.compose.yaml` 是仅包含 Sandbox 的托管部署单元。它固定使用不可变镜像、`node sandbox/hosted-sandbox.mjs`、Base Sepolia `84532`、x402 `exact`、机器鉴权和 `execution_enabled`，并通过外部 Compose secrets 将三类托管 Secret 以文件方式挂载。该文件不包含 Live 服务，也不会创建云资源、DNS、TLS 或独立 Activation。

生成 Compose 解析结果前，必须由托管平台提供以下非秘密配置和已创建的 Secret 名称：

```bash
export BU2_HOSTED_ARTIFACT_IMAGE='ghcr.io/atxinbao/bu2com@sha256:<64 hex characters>'
export X402_RESOURCE_URL='https://merchant.sandbox.example/premium-data'
export BU2_SECRET_API_CREDENTIALS='bu2/sandbox/api-credentials-v1'
export BU2_SECRET_BUYER_SIGNER='bu2/sandbox/buyer-signer-v1'
export BU2_SECRET_RPC_ENDPOINT='bu2/sandbox/base-sepolia-rpc-v1'

docker compose --file deploy/hosted-sandbox.compose.yaml config
```

`npm --prefix sandbox run test:hosted-deployment` 只验证本地解析后的部署契约；它不能证明 DNS/TLS、边缘机器鉴权、托管 Secret 或真实 Base Sepolia 交易已经完成。部署前仍必须生成 Candidate、取得独立 Activation，并按 [ENV-07 Hosted Sandbox 验收](../docs/03-technical/ENVIRONMENT_HOSTED_SANDBOX_V1.md) 保存 E-T13/E-T14/E-T15 证据。

外部验收使用 [Hosted Sandbox Runbook](hosted-sandbox-runbook.md)、[Evidence Schema](../docs/03-technical/hosted-sandbox-evidence.schema.json) 和脱敏模板 `hosted-sandbox-evidence.template.json`。模板只用于填写，不应直接作为通过证据提交。

## 验证

```bash
npm --prefix sandbox run test:deployment-contract
npm --prefix sandbox run acceptance:deployment
npm --prefix sandbox run test:operations
npm --prefix sandbox run test:hosted-sandbox
npm --prefix sandbox run acceptance:operations
```

前两条命令验证 ENV-04/05 的 Compose 和真实 disarmed 容器；ENV-06 命令验证候选提升清单、配置漂移、SQLite Online Backup、跨环境拒绝与恢复后禁用执行；ENV-07A 命令验证 Hosted Sandbox 的 Secret 文件、不可变候选、独立激活与证据契约。完整 operations acceptance 只允许在干净提交上运行，构建的临时镜像、数据库和备份会在结束时删除。

## ENV-06 运维命令

CLI 不会创建源数据库，也不会覆盖既有备份或恢复目标。下面的 `BU2_OPS_ARTIFACT` 必须是 `sha256:<image-id>` 或 registry digest，`BU2_OPS_CONFIG_SHA` 是已解析部署配置的 SHA-256：

```bash
BU2_OPS_ARTIFACT='sha256:<64 hex characters>'
BU2_OPS_CONFIG_SHA='<64 hex characters>'

node deploy/operations-cli.mjs backup \
  --environment sandbox \
  --database .codex/operations/sandbox/bu2.sqlite \
  --destination .codex/operations/sandbox/backups/snapshot.sqlite \
  --artifact "$BU2_OPS_ARTIFACT" \
  --configuration-sha256 "$BU2_OPS_CONFIG_SHA"

node deploy/operations-cli.mjs verify \
  --environment sandbox \
  --backup .codex/operations/sandbox/backups/snapshot.sqlite \
  --artifact "$BU2_OPS_ARTIFACT" \
  --configuration-sha256 "$BU2_OPS_CONFIG_SHA"

node deploy/operations-cli.mjs restore-rehearsal \
  --environment sandbox \
  --backup .codex/operations/sandbox/backups/snapshot.sqlite \
  --destination .codex/operations/sandbox/restore/rehearsal.sqlite \
  --artifact "$BU2_OPS_ARTIFACT" \
  --configuration-sha256 "$BU2_OPS_CONFIG_SHA" \
  --report .codex/operations/sandbox/restore/rehearsal.json
```

运营快照必须显式提供备份年龄阈值；阈值由环境 Owner 定义，不在代码中冒充已批准的 SLO：

```bash
node deploy/operations-cli.mjs snapshot \
  --environment sandbox \
  --database .codex/operations/sandbox/bu2.sqlite \
  --backup .codex/operations/sandbox/backups/snapshot.sqlite \
  --artifact "$BU2_OPS_ARTIFACT" \
  --expected-configuration-sha256 "$BU2_OPS_CONFIG_SHA" \
  --actual-configuration-sha256 "$BU2_OPS_CONFIG_SHA" \
  --max-backup-age-seconds 3600 \
  --destination .codex/operations/sandbox/status.json
```

`promotion-manifest` 接收 `docker compose config --format json` 的落盘结果、完整 commit SHA、当前 schema 和三项显式 `passed` Gate，并以新文件保存候选制品证据。恢复输出始终是 `execution_disabled` 与 `blocked_pending_reconciliation`。完成 Ledger、Payment Attempt、链上事实和外部 Provider 对账前，不得把隔离副本投入服务，也不得自动重放支付。

## 手工查看 disarmed 单元

```bash
mkdir -p .codex
docker build --file deploy/Dockerfile --tag bu2-reference:env04 --iidfile .codex/env04-image-id .
BU2_ARTIFACT_IMAGE="$(tr -d '\n' < .codex/env04-image-id)" \
  docker compose --file deploy/compose.yaml --profile live up --detach
```

默认宿主机地址：Sandbox `http://127.0.0.1:3110`，Live `http://127.0.0.1:3111`。两个单元都返回 `execution_disabled` 且 `access_mode=authenticated`，没有 Signer，也没有内置凭据；公开 health/environment/Receipt verify 可用，其他入口默认返回 401。正式凭据注入和 secret manager 属于托管部署工作，不写入镜像或本参考 Compose。

停止并删除该手工环境：

```bash
BU2_ARTIFACT_IMAGE="$(tr -d '\n' < .codex/env04-image-id)" \
  docker compose --file deploy/compose.yaml --profile live down --volumes
```

删除 `--volumes` 会移除该 Compose 项目的本地测试数据库；不得对任何需要保留的环境照抄此命令。完整边界与验收说明见 [ENV-04 技术说明](../docs/03-technical/ENVIRONMENT_DEPLOYMENT_UNITS_V1.md)和[ENV-06 运营与恢复说明](../docs/03-technical/ENVIRONMENT_OPERATIONS_V1.md)。
