# 外部 Buyer / Seller Agent 快速接入

日期：2026-09-06<br>
执行者：Codex<br>
适用环境：Phase 0 Simulation

本样例让独立 Buyer Agent 与 Seller Agent 通过 BU2 完成 Quote、PaymentIntent、人工授权、DeliveryEvidence、Settlement 和 Receipt 验证。Agent 使用标准 MCP 工具；人工授权与 BU2 结算继续使用冻结的 HTTP 控制面，因此不会出现第二套交易状态或资金语义。

## 1. 五分钟快速开始

要求 Node.js `>=22.13.0` 和 npm。在仓库根目录运行：

```bash
npm ci --prefix sandbox
npm --prefix sandbox run demo:external
```

第二条命令会启动一个隔离的内存 Reference Server、连接本地 stdio MCP Server、完成一笔 Simulation 交易，然后自动关闭所有进程。成功输出包含：

```json
{
  "environment": "simulation",
  "transaction_status": "settled",
  "receipt_valid": true,
  "elapsed_ms": 1000
}
```

`elapsed_ms` 是实际执行时间而非固定值。自动化验收要求其小于 900000 毫秒，即 15 分钟。

## 2. 角色与调用边界

| 调用方 | 工具或接口 | 作用 |
| --- | --- | --- |
| Seller Agent | `bu2_create_quote` | 创建报价 |
| Buyer Agent | `bu2_create_payment_intent` | 请求付款并触发 PaymentMandate 判断 |
| Account Owner | `POST /v1/payment_intents/{id}/authorization` | 仅在 `review_required` 时明确批准或拒绝 |
| Seller Agent | `bu2_submit_delivery` | 提交交付证据 |
| BU2 Control Plane | `POST /v1/transactions/{id}/settlements` | 在交付后执行结算 |
| Buyer Agent | `bu2_get_payment_status`、`bu2_get_receipt`、`bu2_verify_receipt` | 查询最终状态并验证 Receipt |

MCP Server 只做参数映射与 HTTP 转发。它不导入领域对象，不直接写 SQLite，不改变 LedgerEvent，也不绕过 Transaction Core。

## 3. 连接已有本地 Reference Server

终端一：

```bash
npm --prefix sandbox start
```

终端二：

```bash
BU2_SANDBOX_URL=http://127.0.0.1:3100 npm --prefix sandbox run demo:external
```

当持久化环境已认识同一收款方时，PaymentMandate 可能自动允许；首次收款方仍会进入明确授权步骤。示例不会把 Agent 工具调用伪装成人工批准。

## 4. MCP Host 配置

先启动 Reference Server，再将绝对路径替换为本机仓库路径。Host 必须使用稳定入口 `sandbox/bin/bu2-mcp.mjs`，不要直接绑定内部实现文件：

连接 Host 前先运行只读接入诊断：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=simulation \
npm --prefix sandbox run doctor
```

doctor 检查 Node、endpoint、环境、契约、真实 MCP stdio 和 Receipt 验证能力；失败时给出稳定错误码与恢复建议。机器结果和零远程遥测边界见 [`开发者接入诊断 v0.1`](DEVELOPER_DIAGNOSTICS_V0.1.md)。

```json
{
  "mcpServers": {
    "bu2-simulation": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/bu2com/sandbox/bin/bu2-mcp.mjs"],
      "env": {
        "BU2_ENDPOINT": "http://127.0.0.1:3100",
        "BU2_ENVIRONMENT": "simulation"
      }
    }
  }
}
```

稳定入口会在打开 stdio 会话前探测 `/health`，验证 API contract version、`/v1` base path、环境和 MCP contract version。MCP initialize 还会通过标准 `serverInfo` 与 `capabilities.experimental["com.bu2.agent-payments"]` 返回版本、contract SHA-256、工具数量和重试边界。不兼容时进程会在第一次资金工具调用前停止。

MCP stdio 的标准输出是协议通道；运行诊断只写标准错误。6 个工具及输入 Schema 的唯一来源仍是 [`mcp-tools.json`](mcp-tools.json)。Codex、Claude Desktop 与通用 Host 的版本化示例见 [`integrations/mcp`](../../integrations/mcp/README.md)。

## 5. 样例代码

- [`seller-agent.mjs`](../../sandbox/external-agents/seller-agent.mjs)：创建 Quote、提交 DeliveryEvidence。
- [`buyer-agent.mjs`](../../sandbox/external-agents/buyer-agent.mjs)：创建 PaymentIntent、查询状态、读取并验证 Receipt。
- [`mcp-server.mjs`](../../sandbox/external-agents/mcp-server.mjs)：基于官方 MCP TypeScript SDK 2.0 的 stdio 薄适配层。
- [`mcp-runtime.mjs`](../../sandbox/external-agents/mcp-runtime.mjs)：契约指纹、initialize capability 与 endpoint preflight。
- [`bu2-mcp.mjs`](../../sandbox/bin/bu2-mcp.mjs)：供 Host 使用的稳定 stdio 入口。
- [`demo.mjs`](../../sandbox/external-agents/demo.mjs)：编排本地 Simulation 演示，明确区分 Agent、Account Owner 与 BU2 Control Plane。

## 6. 验证与限制

```bash
npm --prefix sandbox test
```

专项测试会验证：冻结工具清单、幂等重放与冲突、MCP/HTTP 共享同一 Transaction Core、完整交易关联、签名 Receipt、标准 initialize 握手、Host 配置、endpoint/API/环境不兼容前置阻断，以及单命令演示耗时。

此样例不启用 Mainnet、真实资金、托管、生产密钥、提现、退款或第二个支付通道。它只证明本地 Simulation 接入与交易契约，不构成生产准入证据。
