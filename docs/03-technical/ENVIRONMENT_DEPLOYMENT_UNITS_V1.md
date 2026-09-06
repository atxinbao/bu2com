# ENV-04：隔离 Sandbox / Live 部署单元 v1

日期：2026-09-06
执行者：Codex
状态：已实现，等待 R2 Domain + Architecture 审查

## 1. 目标与结论

ENV-04 把已批准的环境隔离决策落实为可执行的容器部署模板：Sandbox 与 Live 使用同一个 SHA-256 不可变镜像，但拥有不同的服务、Linux UID/GID、网络、SQLite 持久卷、数据路径、秘密命名空间、Provider scope 和备份 scope。部署模板不会挂载 Signer，Sandbox 与 Live 均为 `execution_disabled`；其中 Live 只有显式启用 `live` profile 才会创建。

本工作提供的是本地可复现的部署参考与故障注入证据，不是托管 Sandbox、云环境或生产系统。没有创建 DNS、云资源、API credential、钱包、Receipt 私钥、Webhook secret 或 Provider 账户，也没有执行 Base Sepolia/Mainnet 付款。

## 2. 制品与部署边界

唯一制品由 [`deploy/Dockerfile`](../../deploy/Dockerfile) 构建。Compose 要求 `BU2_ARTIFACT_IMAGE` 为 `sha256:<image-id>` 或 registry digest，Sandbox 与 Live 引用完全相同的值；`latest`、普通 tag 或两个不同镜像会被部署契约拒绝。

| 边界 | Sandbox | Live |
| --- | --- | --- |
| Compose service | `sandbox` | `live`（显式 profile） |
| Runtime UID/GID | `10001:10001` | `10002:10002` |
| SQLite volume | `sandbox-data` | `live-data` |
| Data path | `/var/lib/bu2/sandbox` | `/var/lib/bu2/live` |
| Network | `sandbox-network` | `live-network` |
| Secret namespace | `bu2/sandbox` | `bu2/live` |
| Provider scope | `bu2-sandbox` | `bu2-live` |
| Backup scope | `bu2-sandbox` | `bu2-live` |
| Execution | disabled | disabled |
| Signer mount | forbidden | forbidden |

两个容器使用只读 root filesystem、丢弃 Linux capabilities、启用 `no-new-privileges`，只有环境专属 SQLite 卷与 `/tmp` 可写。宿主机端口只绑定 `127.0.0.1`；这不构成边缘访问、TLS、身份或公网部署方案。

## 3. 机器契约

[`deploy/environment-units.json`](../../deploy/environment-units.json) v1.0 是部署隔离的机器契约，[`deployment-contract.mjs`](../../deploy/deployment-contract.mjs) 对 Docker Compose 解析结果验证：

- 两个服务必须引用同一个不可变镜像；
- 服务环境、x402 backend、chain/network/Provider 与 execution status 必须匹配；
- UID、数据卷、数据路径、网络与各类 scope 不得共享；
- root filesystem 必须只读并丢弃 capabilities；
- 不得出现 `X402_BUYER_PRIVATE_KEY`、`BU2_SIGNER_ENVIRONMENT`、legacy database claim 或任何 runtime secret/config mount；
- Live 必须保留显式 profile，不能随默认 Sandbox 启动隐式创建。

Reference Server v0.14 新增 `BU2_HOST`，默认仍为 `127.0.0.1`；容器模板显式使用 `0.0.0.0`，宿主机映射继续限制为 loopback。进程收到 `SIGTERM/SIGINT` 后停止接收请求并关闭 SQLite，容器停止不会主动触发支付、重放或跨环境恢复。

## 4. 自动化验收

静态契约：

```bash
npm --prefix sandbox run test:deployment-contract
```

真实本机容器验收：

```bash
npm --prefix sandbox run acceptance:deployment
```

验收器执行以下步骤：

1. 构建一次镜像并取得本地 `sha256` image ID；
2. 用同一 image ID 启动 Sandbox 与 Live；
3. 分别读取 `/v1/environment`，确认 84532/8453 与 `execution_disabled`；
4. 对两个单元分别发送支付 mutation，必须在领域写入前以 `environment_execution_disabled` 拒绝；
5. 把 Sandbox SQLite volume 故意挂载到 Live，启动必须以 `database_environment_mismatch` 失败；
6. 把 Sandbox Signer 环境标记与测试 sentinel 故意注入 Live，必须在密钥解析前失败，日志不得出现 sentinel；
7. 删除本次随机命名的临时容器、卷、网络与镜像。

上述测试不传入真实秘密、不调用商户或 Facilitator、不签名或广播资金指令。它关闭 E-T07 的本地部署挂载子范围，并补强 E-T09 的 disarmed container 证据；托管环境、备份恢复与 Live 受限执行仍分别属于 ENV-06、ENV-07 与 ENV-08。

## 5. 发布、失败与恢复

ENV-04 只允许提升相同 digest，不迁移 Sandbox 数据、余额、API key、Mandate、钱包或 Receipt issuer。配置解析、容器启动或环境握手任一失败时，停止该部署单元；不得换链、共享卷、自动降级为 Simulation 或复制另一环境的秘密。

回退方式是停止两个部署单元并回退 Compose/Dockerfile；环境数据库和账本事实保持原样。若已存在 v0.3 Receipt，继续由版本化验证器只读验证，不重签。备份/恢复演练、监控与制品提升流程将在 ENV-06 独立完成。

## 6. 后续工作

下一项为 ENV-05 受控开发者与运维入口，复用 F02/F03 的身份、Agent credential 与 PaymentMandate 边界。ENV-06 可并行补齐制品提升、监控、备份和恢复演练。Live/Mainnet 继续 `execution_disabled`，不得从本 PR 的容器证据推导任何资金许可。
