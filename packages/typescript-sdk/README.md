# @bu2/sdk · TypeScript SDK v0.1

日期：2026-09-06
执行者：Codex
适用环境：BU2 Phase 0 Simulation / Base Sepolia Testnet
发布状态：Monorepo 内部包，未发布到 npm registry

## 中文

`@bu2/sdk` 是冻结 Agent Payment API v1 的 TypeScript 薄客户端。请求和响应类型由 [`openapi.yaml`](../../docs/03-technical/openapi.yaml) 自动生成，HTTP 调用使用 `openapi-fetch`；SDK 不复制交易状态机、不缓存并覆盖服务端事实，也不自动重试请求。

### 安装与验证

当前包只允许在仓库内验证：

```bash
npm ci --prefix packages/typescript-sdk
npm --prefix packages/typescript-sdk test
```

构建产物位于 `packages/typescript-sdk/dist/`，已被 Git 忽略。此包设置了 `private: true`，代码完成不代表允许公开发布。

E2.4 会先构建本包，将 npm tarball 写入系统临时目录，再由一个全新项目安装和运行。该路径证明 SDK 消费者不依赖 Monorepo 相对源码 import；命令与结果见 [clean-room 样例](../../integrations/clean-room/README.md) 和 [验收证据](../../docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md)。

### 创建客户端

```ts
import { Bu2Client } from "@bu2/sdk";

const bu2 = new Bu2Client({
  baseUrl: "http://127.0.0.1:3100/v1",
  environment: "simulation",
});
```

`baseUrl` 必须是以 `/v1` 结尾的绝对 HTTP(S) URL。`environment` 只允许 `simulation` 或 `testnet`，不会因修改字符串而启用 Mainnet。

### 完成一笔交易

```ts
const quote = await bu2.createQuote(
  {
    seller_agent_id: "agt_seller",
    payee_account_id: "acct_seller",
    item: { name: "Research dataset", delivery_type: "dataset_access" },
    amount: { value: 100, currency: "CNY" },
    expires_at: "2026-09-12T08:00:00Z",
  },
  { idempotencyKey: "quote-run-0001" },
);

const intent = await bu2.createPaymentIntent(
  {
    quote_id: quote.id,
    payer_account_id: "acct_buyer",
    buyer_agent_id: "agt_buyer",
    payment_mandate_id: "mdt_buyer",
    amount: quote.amount,
    purpose: "Research Agent data purchase",
  },
  { idempotencyKey: "intent-run-0001" },
);
```

所有写操作都要求调用方提供稳定的 `idempotencyKey`。SDK 不替业务生成键，也不会自动重复请求。

### 错误与恢复

```ts
import { Bu2ApiError, Bu2TransportError } from "@bu2/sdk";

try {
  await bu2.settleTransaction("txn_example", {
    idempotencyKey: "settlement-run-0001",
  });
} catch (error) {
  if (error instanceof Bu2ApiError || error instanceof Bu2TransportError) {
    console.error(error.code, error.requestId, error.traceId, error.recovery);
  }
}
```

| `recovery`           | 含义                                                           |
| -------------------- | -------------------------------------------------------------- |
| `retry_safe`         | 读取请求可以由调用方显式重试                                   |
| `query_before_retry` | 写入结果可能未知，必须先查询 PaymentIntent/Transaction/Receipt |
| `fix_request`        | 修正输入、幂等键或请求格式后再调用                             |
| `stop`               | 当前请求不应重试，需要人工或业务处理                           |

### API

- `createQuote`
- `createPaymentIntent`
- `getPaymentIntent`
- `decideAuthorization`
- `listTransactions`
- `getTransaction`
- `submitDelivery`
- `settleTransaction`
- `recoverTransactionSettlement`
- `getReceipt`
- `verifyReceipt`

## English

`@bu2/sdk` is a thin TypeScript client for the frozen Agent Payment API v1. Request and response types are generated from [`openapi.yaml`](../../docs/03-technical/openapi.yaml), and HTTP transport is provided by `openapi-fetch`. The SDK does not own transaction state, overwrite server facts, or retry requests automatically.

### Install and verify

The package is currently available only inside this monorepo:

```bash
npm ci --prefix packages/typescript-sdk
npm --prefix packages/typescript-sdk test
```

Build output is written to `packages/typescript-sdk/dist/` and ignored by Git. The package is marked `private: true`; implementation does not authorize public registry publication.

E2.4 builds this package, writes an npm tarball into an operating-system temporary directory, and installs it into a fresh project. This proves that an SDK consumer does not rely on relative Monorepo source imports. See the [clean-room samples](../../integrations/clean-room/README.md) and [acceptance evidence](../../docs/03-technical/CLEAN_ROOM_ACCEPTANCE_EVIDENCE.md).

### Create a client

```ts
import { Bu2Client } from "@bu2/sdk";

const bu2 = new Bu2Client({
  baseUrl: "http://127.0.0.1:3100/v1",
  environment: "simulation",
});
```

`baseUrl` must be an absolute HTTP(S) URL ending in `/v1`. `environment` accepts only `simulation` or `testnet`; changing this label cannot enable Mainnet.

Every mutation requires a caller-owned `idempotencyKey`. On a write timeout, network error, or uncertain server response, the SDK returns `query_before_retry` and never replays the operation automatically. Use `getPaymentIntent`, `getTransaction`, or `getReceipt` to reconcile server state first.

The public methods and recovery actions are identical to the Chinese section above. Code identifiers, protocol names, and stable error codes remain untranslated.

## Contract generation

```bash
npm --prefix packages/typescript-sdk run generate
npm --prefix packages/typescript-sdk run check:generated
```

`generate` is required only after an approved OpenAPI change. `check:generated` fails when committed SDK types drift from the frozen contract.
