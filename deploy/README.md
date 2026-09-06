# BU2 ENV-04/05 Deployment Reference

日期：2026-09-06
执行者：Codex

本目录提供同一不可变镜像、两个隔离部署单元和外部默认鉴权的本地参考实现。它只用于验证环境与关闭入口边界；不是云部署、公开 Sandbox 或 Live 上线方案。

## 验证

```bash
npm --prefix sandbox run test:deployment-contract
npm --prefix sandbox run acceptance:deployment
```

第一条命令解析 Compose 并检查机器契约；第二条命令真实构建一次镜像，启动 Sandbox/Live 两个 disarmed 容器，执行错库与错 Signer 故障注入，然后删除本次临时资源。

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

删除 `--volumes` 会移除该 Compose 项目的本地测试数据库；不得对任何需要保留的环境照抄此命令。完整边界与验收说明见 [ENV-04 技术说明](../docs/03-technical/ENVIRONMENT_DEPLOYMENT_UNITS_V1.md)。
