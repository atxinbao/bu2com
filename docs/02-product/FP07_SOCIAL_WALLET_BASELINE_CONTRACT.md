# FP-07 社交钱包 Local 产品接入基线与 FP-08 扩展契约

日期：2026-09-11
维护者：Codex
风险等级：R2（产品资金读模型、恢复、迁移与候选证据集成）

## 1. 目标与非目标

FP-07 把 FP-05～FP-06b 的 Ledger Foundation 能力组合成一个可重复执行的 **Local / Simulation 产品接入验收**，并把验收证据绑定进新的 Social Wallet Local Integration RC。它证明同一软件候选能够解释两个独立 Account 的收付、退款、费用、恢复、对账、投影重建与备份，但不把 Local 结果升级为 Sandbox/Testnet、Hosted、Live/Mainnet 或生产资金准入。

FP-07 原始基线不新增公开 Wallet API，也不把 WalletReadModel 变成支出授权源。FP-08 在同一验收流程上增加由 Transaction Core 持有的账户级写源和买方费用语义；仍不迁移生产数据、不加载 Signer、不广播交易，也不创建 Git tag、GitHub Release、registry package 或部署。

## 2. Local 产品验收

`sandbox/social-wallet-acceptance.mjs` 在临时隔离 SQLite 中执行 `fp08.social-wallet-acceptance.v1`。旧 `fp07.social-wallet-acceptance.v1` 保留为历史语义，不得被当前 RC 消费者静默解释为 FP-08：

- 两个独立 Account、两个 LedgerAccount、四个 Agent 与可信 FundingSource / ReceivingTarget；
- 两个可核对期初；
- buyer→seller 两笔付款，其中一笔保存 `provider_unknown` Adapter operation，SQLite 重启后显式 recovery；
- seller inbound collection、部分 refund、seller-side Collection ProviderFee，以及 buyer-side Payment/Refund ProviderFee；
- 完整 reconciliation、WalletReadModel/cutover、projection 删除重建、历史 replay 与 Online Backup/restore；
- cross-Agent FundingSource、错 asset、错 network 均必须在可信 binding 边界失败关闭；
- 外部 Sandbox 双向证据固定为 `not_executed/accepted=false`。

验收器输出只包含机器可复核的非敏感摘要与边界，不包含生产凭证、真实账户、私钥或客户数据。

## 3. 余额一致性停止条件

FP-07 不允许“账务候选看起来合理”替代当前资金决策事实：

1. FP-06a 将 `funds_reserved` 与 `delivery_submitted` 拆成 `reserved` / `pending_outbound`；候选 reserved exposure 使用两者之和，避免同一预留因状态拆分被误报差异。
2. FP-08 在健康 cutover 激活时从已重验候选初始化账户余额；新交易固定 `wallet_write_source=account_wallet`。每次 runtime read 必须继续满足 accounting candidate 与该账户写源的 shadow equivalence；差异时返回 `blocked`、`read_balance=null`、`fallback_performed=false`，新 reserve 在 Adapter 前停止。
3. Payment/Refund ProviderFee 是已发生的买方费用事实，必须从同一账户 available 只扣一次；业务重复即使使用新幂等键也不得重复扣减。费用可使 available 为负，但负值会阻止新 reserve。Collection-side fee 仍只进入 Posting，因为 Collection 主金额尚未接入账户级运行时余额。

## 4. Unknown、恢复与对账

Local simulated unknown 不是 x402 Testnet 证据。验收中的 unknown settlement 会先写入同一 `settle:<transaction>` Adapter operation 为 `provider_unknown`，重启后通过现有 recovery 记录前滚为 `settled`；不会创建第二笔付款。cutover 在 unresolved operation 存在时失败关闭，恢复后新 settlement Posting 仍使旧 projection stale，必须重新对账/refresh 后才恢复 active read。

Reconciliation 必须看到同一 settlement operation 的金额、币种和 provider reference；不得只凭 Transaction 状态推断 Provider 已确认。

## 5. Social Wallet RC

现有 CI-03 发布链继续作为唯一候选系统，不新增第二套 release 流程：

```text
protected main request
→ CI-02 / LA-06a / RT-01
→ one immutable Docker image + archive
→ fp08.social-wallet-acceptance.v1 on the same source/image
→ ci03.release-candidate.v1
```

RC class 为 `social_wallet_local_integration_rc`，版本格式为 `social-wallet-vX.Y.Z-rc.N`。manifest 必须绑定 acceptance SHA-256，并直接披露：2 Account / 4 Agent、`spend_decision_source=account_scoped_wallet`、公开 Wallet API 未授权、buyer-side ProviderFee 支出语义已在 Local 获验收、真实 Sandbox bilateral 未执行。

旧 `ledger-rc-local-v0.1` 必须继续指向 `005b3949de4672a5aae301bd9b511e47b8be89fa`。workflow 会在准备新候选前验证该历史 tag，没有权限移动、覆盖或重打它。

候选状态始终是 `prepared_not_released`。独立 R2 审查和 Project Owner release approval 都保持 pending，`candidate_promotion_authorized=false`。

## 6. 当前外部阻塞

CI-03 仍要求 `refs/heads/main` 是受保护分支。当前私有仓库套餐不能证明该条件，因此本 PR 可以验证候选机制和本地 fixture，但**不能制造一个成功的 protected-main 产品 RC**。不得删除 `github.ref_protected` 断言绕过该阻塞。

真实 Hosted/Base Sepolia 双向证据、LA-06b、E3.1、Live/Mainnet 与生产数据迁移继续独立，不由 Local Social Wallet RC 替代。

## 7. 验收命令

```bash
npm --prefix sandbox run acceptance:social-wallet
node --test sandbox/fp07-social-wallet-acceptance.test.mjs
node --test scripts/ci/validate-release-request.test.mjs scripts/ci/release-candidate.test.mjs
```

完整交付仍需 Sandbox 全量、LA-06a、Prototype lint/build、RT-01、Graphify、Git diff 与远程 PR CI。
