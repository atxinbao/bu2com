const LIQUIDITY_ACCOUNT_MATCHERS = [
  (account) => account === "asset.cash" || account.startsWith("asset.cash:"),
  (account) => account.startsWith("cash.wallet:"),
  (account) => account.startsWith("cash.receiving_target:"),
  (account) => account.startsWith("cash.account:"),
];

export const WALLET_READ_MODEL_SCHEMA_VERSION = "wallet-read-model.v1";
export const WALLET_SHADOW_SCHEMA_VERSION = "wallet-shadow.v1";
export const WALLET_PROJECTOR_VERSION = "wallet-posting-liquidity.v1";
export const WALLET_AMOUNT_FORMAT_VERSION = "minor-units.v1";

const safeAdd = (left, right, code) => {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    const error = new RangeError(code);
    error.code = code;
    throw error;
  }
  return result;
};

export function isWalletLiquidityAccount(account) {
  return typeof account === "string" && LIQUIDITY_ACCOUNT_MATCHERS.some((matches) => matches(account));
}

export function walletBookBalance(accounts, currency) {
  let value = 0;
  const includedAccounts = [];
  for (const row of accounts ?? []) {
    if (row.currency !== currency || !isWalletLiquidityAccount(row.account)) continue;
    if (!Number.isSafeInteger(row.balance_minor)) {
      const error = new TypeError("wallet_book_balance_invalid");
      error.code = "wallet_book_balance_invalid";
      throw error;
    }
    value = safeAdd(value, row.balance_minor, "wallet_book_balance_overflow");
    includedAccounts.push(row.account);
  }
  return {
    amount: { value, currency },
    included_accounts: [...new Set(includedAccounts)].sort(),
    mapping_version: WALLET_PROJECTOR_VERSION,
  };
}

export function walletPendingConstraints(transactions, ledgerAccountId, currency) {
  let reserved = 0;
  let pendingOutbound = 0;
  const reservedTransactionIds = [];
  const pendingTransactionIds = [];
  const blockers = [];
  let unboundPendingTransactionCount = 0;
  for (const transaction of transactions ?? []) {
    if (!["funds_reserved", "delivery_submitted"].includes(transaction.status)) continue;
    const amount = transaction.reserved_amount;
    if (transaction.ledger_account_id === null || transaction.ledger_account_id === undefined) {
      if (!amount || typeof amount.currency !== "string" || amount.currency === currency) {
        unboundPendingTransactionCount += 1;
      }
      continue;
    }
    if (transaction.ledger_account_id !== ledgerAccountId) continue;
    if (!amount || typeof amount.currency !== "string" || !Number.isSafeInteger(amount.value) || amount.value < 0) {
      blockers.push("pending_transaction_amount_invalid");
      continue;
    }
    if (amount.currency !== currency) continue;
    if (transaction.status === "funds_reserved") {
      reserved = safeAdd(reserved, amount.value, "wallet_reserved_overflow");
      reservedTransactionIds.push(transaction.id);
    } else if (transaction.status === "delivery_submitted") {
      pendingOutbound = safeAdd(pendingOutbound, amount.value, "wallet_pending_outbound_overflow");
      pendingTransactionIds.push(transaction.id);
    }
  }
  if (unboundPendingTransactionCount > 0) blockers.push("unbound_pending_transactions_present");
  return {
    reserved: { value: reserved, currency },
    pending_outbound: { value: pendingOutbound, currency },
    reserved_transaction_ids: reservedTransactionIds.sort(),
    pending_transaction_ids: pendingTransactionIds.sort(),
    unbound_pending_transaction_count: unboundPendingTransactionCount,
    blockers: [...new Set(blockers)].sort(),
  };
}

export function walletCandidateCapacity({ bookBalance, reserved, pendingOutbound, blockers = [] }) {
  if (blockers.length > 0 || !bookBalance) {
    return {
      status: "blocked",
      amount: null,
      usable_for_spend: false,
      blockers: [...new Set(blockers)].sort(),
    };
  }
  const afterReserved = safeAdd(bookBalance.value, -reserved.value, "wallet_capacity_overflow");
  const value = safeAdd(afterReserved, -pendingOutbound.value, "wallet_capacity_overflow");
  if (value < 0) {
    return {
      status: "blocked",
      amount: null,
      usable_for_spend: false,
      blockers: ["candidate_capacity_negative"],
    };
  }
  return {
    status: "candidate",
    amount: { value, currency: bookBalance.currency },
    usable_for_spend: false,
    blockers: [],
  };
}

export function compareWalletShadow({ model, legacyWallet }) {
  const warnings = ["legacy_runtime_scope_is_global"];
  const blockers = model.available_spending_capacity.blockers ?? [];
  if (model.stale) warnings.push("candidate_projection_stale");
  if (model.completeness.status !== "complete") warnings.push("candidate_projection_incomplete");
  if (model.historical_scope?.status === "migration_pending") warnings.push("historical_scope_migration_pending");
  const legacyAvailable = legacyWallet
    ? { value: legacyWallet.available, currency: legacyWallet.currency }
    : null;
  const legacyReserved = legacyWallet
    ? { value: legacyWallet.reserved, currency: legacyWallet.currency }
    : null;
  const candidateLegacyReserved = {
    value: safeAdd(model.reserved.value, model.pending_outbound.value, "wallet_shadow_reserved_overflow"),
    currency: model.accounting_currency,
  };
  const common = {
    schema_version: WALLET_SHADOW_SCHEMA_VERSION,
    mode: "shadow_only",
    ledger_account_id: model.ledger_account_id,
    accounting_currency: model.accounting_currency,
    candidate_available: model.available_spending_capacity.amount,
    legacy_available: legacyAvailable,
    candidate_reserved: model.reserved,
    candidate_pending_outbound: model.pending_outbound,
    candidate_legacy_reserved_equivalent: candidateLegacyReserved,
    legacy_reserved: legacyReserved,
    warnings: [...new Set(warnings)].sort(),
    decision_use: "forbidden",
    writes_performed: false,
  };
  if (!legacyWallet || legacyWallet.currency !== model.accounting_currency) {
    return {
      ...common,
      status: "blocked",
      available_delta: null,
      reserved_delta: null,
      blockers: [...new Set([...blockers, "legacy_wallet_currency_or_state_unavailable"])].sort(),
    };
  }
  const candidateAvailable = model.available_spending_capacity.amount;
  if (!candidateAvailable) {
    return {
      ...common,
      status: "blocked",
      available_delta: null,
      reserved_delta: null,
      blockers: [...new Set(blockers)].sort(),
    };
  }
  const availableDelta = safeAdd(candidateAvailable.value, -legacyAvailable.value, "wallet_shadow_delta_overflow");
  const reservedDelta = safeAdd(candidateLegacyReserved.value, -legacyReserved.value, "wallet_shadow_delta_overflow");
  return {
    ...common,
    status: availableDelta === 0 && reservedDelta === 0 ? "matched" : "difference",
    available_delta: { value: availableDelta, currency: model.accounting_currency },
    reserved_delta: { value: reservedDelta, currency: model.accounting_currency },
    blockers: [],
  };
}
