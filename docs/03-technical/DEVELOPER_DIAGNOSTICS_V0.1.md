# BU2 开发者接入诊断 v0.2 / Developer Integration Doctor v0.2

日期：2026-09-06
执行者：Codex
适用环境：Phase 0 Local / Sandbox / Live（Live execution disabled）

## 中文

### 1. 目标与边界

`bu2-doctor` 在任何资金工具调用前检查本地开发者接入。它不会创建 Quote、PaymentIntent、授权、交付或结算，也不会修改 Transaction Core、Ledger、Outbox、Adapter 或 Receipt。

本版本不包含远程遥测。每次运行的最小接入分析只存在于当前进程返回值，不写文件、不写数据库、不发送网络分析请求。未来若要启用远程遥测，必须先独立冻结启用方式、字段、保留期、删除方式和用户同意流程。

### 2. 运行

先启动 BU2 Reference Server：

```bash
npm --prefix sandbox start
```

然后运行中文人类可读诊断：

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
npm --prefix sandbox run doctor
```

机器可读结果：

```bash
npm --prefix sandbox run doctor -- --format json
```

验证一张已存在的 Receipt：

```bash
npm --prefix sandbox run doctor -- --receipt-id rcpt_...
```

未提供 `--receipt-id` 时，doctor 只确认 MCP 暴露且可以调用 `bu2_verify_receipt`，结果为 `capability_available`；只有实际返回 `valid=true` 才报告 `verified`。

### 3. 固定检查顺序

| 阶段 | 检查内容 | 是否产生资金动作 |
| --- | --- | --- |
| `node_runtime` | Node.js 满足 `>=22.16.0` | 否 |
| `configuration` | endpoint 合法，环境为 `local/sandbox/live`；Local 明确确认 | 否 |
| `endpoint` | `/v1/environment` 可达且属于 BU2 Reference Server | 否 |
| `environment` | 环境、链、执行后端、execution status 与 Receipt issuer 一致 | 否 |
| `contract` | API v0.3.0、environment v1.0、Receipt v0.3 与 MCP v0.3.0 兼容 | 否 |
| `mcp_startup` | 真实 stdio initialize、能力握手和 6 个冻结工具一致 | 否 |
| `receipt_verification` | 验证工具可用，或对显式 Receipt ID 执行只读验证 | 否 |

前置阶段失败时，后续阶段标记为 `blocked`，不会继续猜测或发起资金写操作。

### 4. 机器结果与最小分析

JSON 输出必须符合 [`doctor-result.schema.json`](doctor-result.schema.json)。诊断结果包含运行版本、环境、检查结果和可操作失败信息；其中 `request_id`、`trace_id` 只在服务端提供合法关联值时出现。

`analytics.records` 严格只包含：

- `stage`
- `duration_ms`
- `result_category`
- `error_code`

固定隐私边界为：`remote_enabled=false`、`upload_attempted=false`、`persistence=none`、`retention=process_lifetime`。因此没有远程数据需要删除，`deletion=not_applicable_no_persistence`。

### 5. 恢复与重试

- `retry_safe`：只读 endpoint 检查失败，可在服务恢复后安全重试 doctor。
- `retry_after_fix`：先修复 Node、配置、环境或契约，再重跑 doctor。
- `query_before_retry`：Receipt 或交易事实异常，先按关联 ID 查询和核对；不得据此重放资金 mutation。

人类输出使用固定恢复文案，不回显异常 message、endpoint、Prompt、交易载荷、Secret、私钥或个人数据。

## English

### 1. Purpose and boundaries

`bu2-doctor` checks a local developer integration before any payment tool is called. It does not create a Quote or PaymentIntent, authorize funds, submit delivery, settle a Transaction, or mutate the Transaction Core, Ledger, Outbox, Adapter, or Receipt.

This version has no remote telemetry. Minimal integration analytics exist only in the current process result. They are not written to a file or database and no analytics network request is made. Any future remote telemetry requires a separate frozen contract covering enablement, fields, retention, deletion, and user consent.

### 2. Run

Start the BU2 Reference Server:

```bash
npm --prefix sandbox start
```

Run the fully English human-readable doctor:

```bash
BU2_ENDPOINT=http://127.0.0.1:3100 \
BU2_ENVIRONMENT=local \
BU2_LOCAL_DEVELOPMENT=true \
npm --prefix sandbox run doctor -- --language en
```

Request machine-readable output:

```bash
npm --prefix sandbox run doctor -- --format json
```

Verify an existing Receipt:

```bash
npm --prefix sandbox run doctor -- --language en --receipt-id rcpt_...
```

Without `--receipt-id`, the doctor only confirms that MCP exposes and can call `bu2_verify_receipt`; it reports `capability_available`. It reports `verified` only after an actual verification returns `valid=true`.

### 3. Fixed check order

| Stage | Check | Payment mutation |
| --- | --- | --- |
| `node_runtime` | Node.js satisfies `>=22.16.0` | No |
| `configuration` | Endpoint is valid; environment is `local/sandbox/live`; Local is explicit | No |
| `endpoint` | `/v1/environment` identifies a BU2 Reference Server | No |
| `environment` | Environment, chain, backend, execution status, and Receipt issuer match | No |
| `contract` | API v0.3.0, environment v1.0, Receipt v0.3, and MCP v0.3.0 are compatible | No |
| `mcp_startup` | Real stdio initialize, capability handshake, and six frozen tools match | No |
| `receipt_verification` | Verification tool is available, or a supplied Receipt ID is verified read-only | No |

When an earlier stage fails, later stages are `blocked`. The doctor does not guess or issue a payment mutation.

### 4. Machine result and minimal analytics

JSON output must conform to [`doctor-result.schema.json`](doctor-result.schema.json). Diagnostics include runtime versions, environment, check outcomes, and actionable failure data. `request_id` and `trace_id` appear only when the server supplied valid correlation values.

`analytics.records` contains only:

- `stage`
- `duration_ms`
- `result_category`
- `error_code`

The fixed privacy boundary is `remote_enabled=false`, `upload_attempted=false`, `persistence=none`, and `retention=process_lifetime`. No remote data exists to delete, so `deletion=not_applicable_no_persistence`.

### 5. Recovery and retry

- `retry_safe`: a read-only endpoint check failed; rerun the doctor safely after service recovery.
- `retry_after_fix`: fix Node.js, configuration, environment, or contract compatibility first.
- `query_before_retry`: a Receipt or transaction fact is inconsistent; inspect correlation IDs before any payment mutation.

Human output uses fixed recovery text. It never echoes raw exception messages, endpoints, Prompts, transaction payloads, secrets, private keys, or personal data.
