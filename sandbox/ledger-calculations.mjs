const violation = (code, message, details = {}) => ({ code, message, details });

export function validateFinancialPosting(posting) {
  if (!posting.event_id || !posting.source_id || !posting.event_type) {
    return violation(
      "journal_reference_missing",
      "Every financial posting must reference an event, source, and event type.",
    );
  }
  if (!Number.isSafeInteger(posting.amount_value) || posting.amount_value < 0) {
    return violation(
      "journal_amount_invalid",
      "Financial posting amounts must be safe non-negative integers.",
    );
  }
  if (typeof posting.currency !== "string" || !/^[A-Z]{3}$/.test(posting.currency)) {
    return violation(
      "journal_currency_invalid",
      "Financial postings must use an uppercase three-letter currency.",
    );
  }
  if (!/^[a-z][a-z0-9_.:-]{1,255}$/.test(posting.account ?? "")) {
    return violation(
      "journal_account_invalid",
      "Financial posting account names must use a stable namespaced format.",
    );
  }
  return null;
}

const safePostingTotal = (entries, eventId) => {
  let total = 0;
  for (const entry of entries) {
    const next = total + entry.amount_value;
    if (!Number.isSafeInteger(next)) {
      return {
        violation: violation(
          "journal_amount_overflow",
          "A journal amount exceeds the safe integer boundary.",
          { event_id: eventId },
        ),
      };
    }
    total = next;
  }
  return { total };
};

export function summarizeJournalGroup(eventId, group) {
  const debit = group.filter((posting) => posting.direction === "debit");
  const credit = group.filter((posting) => posting.direction === "credit");
  if (debit.length === 0 || credit.length === 0) {
    return {
      violation: violation(
        "journal_unbalanced",
        "A posted journal must contain both debit and credit postings.",
        { event_id: eventId },
      ),
    };
  }
  const currencies = new Set(group.map((posting) => posting.currency));
  const eventTypes = new Set(group.map((posting) => posting.event_type));
  const sourceIds = new Set(group.map((posting) => posting.source_id));
  if (currencies.size !== 1 || eventTypes.size !== 1 || sourceIds.size !== 1) {
    return {
      violation: violation(
        "journal_group_mismatch",
        "A journal must use one currency, event type, and source.",
        { event_id: eventId },
      ),
    };
  }
  const debitResult = safePostingTotal(debit, eventId);
  if (debitResult.violation) return debitResult;
  const creditResult = safePostingTotal(credit, eventId);
  if (creditResult.violation) return creditResult;
  if (debitResult.total !== creditResult.total) {
    return {
      violation: violation(
        "journal_unbalanced",
        "Debit and credit postings must balance for every currency.",
        {
          event_id: eventId,
          debit_minor: debitResult.total,
          credit_minor: creditResult.total,
        },
      ),
    };
  }
  return {
    debit_minor: debitResult.total,
    credit_minor: creditResult.total,
    currency: group[0].currency,
    event_type: group[0].event_type,
    source_id: group[0].source_id,
  };
}

export function buildPostingProjection(postings, currency = null) {
  const balances = new Map();
  const journals = new Map();
  for (const posting of postings) {
    if (currency !== null && posting.currency !== currency) continue;
    const ledgerAccountId = posting.ledger_account_id ?? null;
    const key = `${ledgerAccountId ?? "legacy"}:${posting.currency}:${posting.account}`;
    const current = balances.get(key) ?? {
      account: posting.account,
      currency: posting.currency,
      balance_minor: 0,
      posting_count: 0,
    };
    if (ledgerAccountId !== null) current.ledger_account_id = ledgerAccountId;
    const signedAmount = posting.direction === "debit" ? posting.amount_value : -posting.amount_value;
    const nextBalance = current.balance_minor + signedAmount;
    if (!Number.isSafeInteger(nextBalance)) {
      return {
        violation: violation(
          "projection_amount_overflow",
          "Ledger projection exceeds the safe integer boundary.",
          { account: posting.account, currency: posting.currency },
        ),
      };
    }
    current.balance_minor = nextBalance;
    current.posting_count += 1;
    balances.set(key, current);
    const journal = journals.get(posting.event_id) ?? {
      event_id: posting.event_id,
      currency: posting.currency,
      debit_minor: 0,
      credit_minor: 0,
      posting_count: 0,
    };
    if (posting.direction === "debit") journal.debit_minor += posting.amount_value;
    if (posting.direction === "credit") journal.credit_minor += posting.amount_value;
    journal.posting_count += 1;
    journals.set(posting.event_id, journal);
  }
  const journalRows = [...journals.values()].map((journal) => ({
    ...journal,
    balanced: journal.debit_minor === journal.credit_minor,
  }));
  return {
    projection: {
      posting_count: [...balances.values()].reduce((total, account) => total + account.posting_count, 0),
      journal_count: journalRows.length,
      unbalanced_journal_count: journalRows.filter((journal) => !journal.balanced).length,
      accounts: [...balances.values()].sort((left, right) =>
        (left.ledger_account_id ?? "").localeCompare(right.ledger_account_id ?? "")
        || left.currency.localeCompare(right.currency)
        || left.account.localeCompare(right.account)),
      journals: journalRows.sort((left, right) => left.event_id.localeCompare(right.event_id)),
    },
  };
}
