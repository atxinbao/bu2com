# F12 Paid Access 与 Delivery Fact 契约 v1

日期：2026-09-08  
执行者：Codex  
状态：运行时实现，待 R2 Domain 与 Architecture 审查

## 1. 目标与边界

F12 将已验证且已入账的 `Collection` 转换为可持久化、可查询、可恢复的 `AccessGrant`。它把“付款事实”“交付事实”和“可访问权益”保持为三个独立对象，避免从 Receipt、UI 状态或临时响应重新推导访问权限。

F12 只接受 F11 的 `Collection(status=posted, verification_status=verified)` 作为付款来源，不创建第二套 Transaction 或 Ledger，不修改 Collection 的金额、付款方、Provider 引用或 FinancialPosting。F12 不实现取消、退款、费用对账、Hosted、公网部署、Live/Mainnet 或真实资金授权。

## 2. 对象关系

```text
Receivable → Collection(verified, posted) → AccessGrant(active)

Transaction → DeliveryRecord → Receipt
```

`DeliveryRecord` 是交付事实，记录交易、交付类型和证据哈希；`Receipt` 只签名引用 `delivery_id` 与 `delivery_evidence_hash`。`AccessGrant` 是独立的付费访问权益，保存 `collection_id`、访问类型、稳定的 `access_reference`、状态与有效期，不承载原始密钥或 Provider 付款响应。

## 3. AccessGrant 字段与状态

- `id`：`agr_...`；
- `collection_id` / `receivable_id`：唯一付款来源和应收来源；
- `account_id` / `agent_id`：收款主体范围，用于访问过滤；
- `access_type` / `access_reference`：业务定义的访问类型与可重取引用；
- `source_type=collection`、`source_id=collection_id`：明确来源，不复制交易核心；
- `status`：`active | expired | revoked`；
- `expires_at`：可选的访问有效期；
- `version`、`granted_at`、`recovered_at`、`created_at`、`updated_at`；
- `metadata`：仅保存受约束的业务元数据。

相同 Collection 与 `access_reference` 只允许一个权益。重复请求返回既有事实，不重复授予或追加财务 Posting。

## 4. API 与恢复

```text
POST /v1/collections/{collection_id}/access_grants
GET  /v1/access_grants
GET  /v1/access_grants/{access_grant_id}
POST /v1/access_grants/{access_grant_id}/recover
```

创建和恢复都必须携带 `Idempotency-Key`。创建前重新读取 Collection，只有 `posted/verified` 才能授予权益；`pending`、未知或失败付款均失败关闭。恢复会重新确认来源 Collection 仍为已验证入账，已撤销权益不可恢复，已过期权益不能绕过过期时间重新激活。

## 5. 持久化与事件

AccessGrant 使用通用 `resources(kind=access_grants)` 持久化，与 Collection、Transaction、Receipt 同一 SQLite 原子快照提交；不新增第二套业务账本。创建追加 `access_grant.created`，恢复追加 `access_grant.recovered`。SQLite 重启后通过资源读取恢复，不重新调用 Provider，也不重复付款或入账。

## 6. 验收标准

- [x] 已 posted Collection 可幂等创建 AccessGrant；重复来源不重复创建。
- [x] AccessGrant 可通过列表、详情和恢复接口重新取得。
- [x] Collection、FinancialPosting、DeliveryRecord 和 Receipt 的事实边界保持独立。
- [x] 未付款、pending、未知或已撤销来源失败关闭。
- [x] SQLite 重启后 Collection、AccessGrant、事件和 Posting 一致。
- [x] HTTP、OpenAPI、TypeScript SDK、Access Contract 与领域实现一致。
- [ ] Base Sepolia 双向支付、Hosted、Live/Mainnet 和真实资金仍未执行。

本契约不构成真实支付、生产访问控制或托管授权。
