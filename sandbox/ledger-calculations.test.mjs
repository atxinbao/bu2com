import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostingProjection,
  summarizeJournalGroup,
  validateFinancialPosting,
} from "./ledger-calculations.mjs";
import { ApiError } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";

const posting = (overrides = {}) => ({
  id: "pst_fp04_debit",
  event_id: "evt_fp04",
  event_type: "journal.fp04",
  source_id: "src_fp04",
  direction: "debit",
  account: "asset.cash",
  amount_value: 100,
  currency: "CNY",
  created_at: "2026-09-10T00:00:00.000Z",
  ledger_account_id: "lga_fp04",
  ...overrides,
});

const balanced = (amount = 100) => [
  posting({ amount_value: amount }),
  posting({
    id: "pst_fp04_credit",
    direction: "credit",
    account: "liability.receivable",
    amount_value: amount,
  }),
];

test("FP-04 pure journal helpers preserve posting validation and balanced totals", () => {
  const input = balanced();
  assert.equal(validateFinancialPosting(input[0]), null);
  assert.equal(validateFinancialPosting(input[1]), null);
  assert.deepEqual(summarizeJournalGroup("evt_fp04", input), {
    debit_minor: 100,
    credit_minor: 100,
    currency: "CNY",
    event_type: "journal.fp04",
    source_id: "src_fp04",
  });
  assert.equal(input[0].amount_value, 100);
});

test("FP-04 pure journal helpers preserve validation codes and overflow boundaries", () => {
  assert.equal(validateFinancialPosting(posting({ source_id: null })).code, "journal_reference_missing");
  assert.equal(validateFinancialPosting(posting({ amount_value: -1 })).code, "journal_amount_invalid");
  assert.equal(validateFinancialPosting(posting({ currency: "cny" })).code, "journal_currency_invalid");
  assert.equal(validateFinancialPosting(posting({ account: "Cash" })).code, "journal_account_invalid");
  assert.equal(summarizeJournalGroup("evt_fp04", [posting()]).violation.code, "journal_unbalanced");
  assert.equal(
    summarizeJournalGroup("evt_fp04", balanced().map((value) => ({ ...value, source_id: value.direction === "debit" ? "src_a" : "src_b" }))).violation.code,
    "journal_group_mismatch",
  );
  assert.deepEqual(
    summarizeJournalGroup("evt_fp04", balanced().map((value) => ({ ...value, amount_value: value.direction === "debit" ? 100 : 99 }))).violation,
    {
      code: "journal_unbalanced",
      message: "Debit and credit postings must balance for every currency.",
      details: { event_id: "evt_fp04", debit_minor: 100, credit_minor: 99 },
    },
  );
  const overflow = [
    posting({ id: "pst_fp04_d1", amount_value: Number.MAX_SAFE_INTEGER }),
    posting({ id: "pst_fp04_d2", amount_value: 1 }),
    posting({ id: "pst_fp04_c1", direction: "credit", account: "liability.one", amount_value: Number.MAX_SAFE_INTEGER }),
    posting({ id: "pst_fp04_c2", direction: "credit", account: "liability.two", amount_value: 1 }),
  ];
  assert.equal(summarizeJournalGroup("evt_fp04", overflow).violation.code, "journal_amount_overflow");
});

test("FP-04 posting projection is deterministic and account scoped", () => {
  const input = [
    ...balanced(),
    ...balanced(25).map((value) => ({
      ...value,
      id: `${value.id}_other`,
      event_id: "evt_fp04_other",
      ledger_account_id: "lga_other",
    })),
  ];
  const result = buildPostingProjection(input, "CNY");
  assert.equal(result.violation, undefined);
  assert.deepEqual(result.projection.accounts.map(({ ledger_account_id, account, balance_minor }) => ({ ledger_account_id, account, balance_minor })), [
    { ledger_account_id: "lga_fp04", account: "asset.cash", balance_minor: 100 },
    { ledger_account_id: "lga_fp04", account: "liability.receivable", balance_minor: -100 },
    { ledger_account_id: "lga_other", account: "asset.cash", balance_minor: 25 },
    { ledger_account_id: "lga_other", account: "liability.receivable", balance_minor: -25 },
  ]);
  assert.equal(result.projection.posting_count, 4);
  assert.equal(result.projection.journal_count, 2);
  assert.equal(result.projection.unbalanced_journal_count, 0);
});

test("FP-04 posting projection reports the existing safe-integer overflow violation", () => {
  const result = buildPostingProjection([
    posting({ id: "pst_fp04_max", amount_value: Number.MAX_SAFE_INTEGER }),
    posting({ id: "pst_fp04_over", event_id: "evt_fp04_over", amount_value: 1 }),
  ]);
  assert.deepEqual(result.violation, {
    code: "projection_amount_overflow",
    message: "Ledger projection exceeds the safe integer boundary.",
    details: { account: "asset.cash", currency: "CNY" },
  });
});

test("FP-04 SqliteLedger facade preserves ApiError identity and posting failure order", () => {
  const ledger = new SqliteLedger(":memory:");
  try {
    assert.throws(
      () => ledger.writeBalancedJournals([
        posting({ ledger_account_id: "lga_missing" }),
        posting({ id: "pst_fp04_later_invalid", currency: "cny", ledger_account_id: null }),
      ]),
      (error) => error instanceof ApiError && error.code === "ledger_account_not_found",
    );
  } finally {
    ledger.close();
  }
});
