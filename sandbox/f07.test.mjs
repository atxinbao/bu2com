import assert from "node:assert/strict";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { listen } from "./server.mjs";

const budgetInput = {
  id: "bud_project_research",
  scope_type: "project",
  scope_id: "proj_research",
  currency: "CNY",
  period: "calendar_month",
  limit_minor: 5000,
};

const quoteInput = {
  seller_agent_id: "agt_market_data",
  payee_account_id: "acct_atlas_data",
  item: { name: "Budgeted dataset", delivery_type: "dataset_access" },
  amount: { value: 3900, currency: "CNY" },
  expires_at: "2026-09-30T00:00:00Z",
};

test("F07 creates a budget hold and consumes it with immutable financial postings", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const budget = await sandbox.createBudget(budgetInput, "f07-budget-create");
  const quote = await sandbox.createQuote(quoteInput, "f07-quote-create");
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.amount,
      purpose: "Budgeted dataset",
      budget_id: budget.id,
    },
    "f07-intent-create",
  );
  const authorized = await sandbox.decideAuthorization(
    intent.id,
    { decision: "authorize" },
    "f07-authorize",
  );
  assert.equal(authorized.status, "funds_reserved");
  const reserved = sandbox.getTransaction(authorized.transaction_id);
  assert.equal(reserved.budget_hold.status, "active");
  assert.equal(reserved.budget.active_hold_total, 3900);
  assert.equal(reserved.financial_postings.length, 2);

  await sandbox.submitDelivery(
    authorized.transaction_id,
    { type: "dataset_access", evidence_hash: "sha256:f07" },
    "f07-delivery",
  );
  await sandbox.settle(authorized.transaction_id, {}, "f07-settle");
  const settled = sandbox.getTransaction(authorized.transaction_id);
  assert.equal(settled.budget_hold.status, "consumed");
  assert.equal(settled.budget.active_hold_total, 0);
  assert.equal(settled.budget.consumed_total, 3900);
  assert.equal(settled.financial_postings.length, 6);
  assert.deepEqual(
    settled.financial_postings.map((posting) => posting.direction),
    ["debit", "credit", "debit", "credit", "debit", "credit"],
  );
  assert.equal(settled.financial_postings.filter((posting) => posting.event_type === "transaction.settled").length, 2);
  assert.equal(sandbox.listBudgets()[0].available_minor, 1100);
  ledger.close();
});

test("F07 rejects a hold that would exceed the active budget", async () => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({ ledger, adapter: new SimulatedPaymentAdapter({ ledger }) });
  const budget = await sandbox.createBudget({ ...budgetInput, limit_minor: 1000 }, "f07-budget-small");
  const quote = await sandbox.createQuote({ ...quoteInput, amount: { value: 3900, currency: "CNY" } }, "f07-quote-small");
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: "acct_bu2_ventures",
      buyer_agent_id: "agt_research_copilot",
      payment_mandate_id: "mdt_research_04",
      amount: quote.amount,
      purpose: "Over budget",
      budget_id: budget.id,
    },
    "f07-intent-small",
  );
  await assert.rejects(
    sandbox.decideAuthorization(intent.id, { decision: "authorize" }, "f07-authorize-small"),
    (error) => error.code === "budget_limit_exceeded",
  );
  assert.equal(sandbox.listBudgetHolds().length, 0);
  assert.equal(ledger.listLedgerEvents().some((event) => event.type === "budget_hold_created"), false);
  ledger.close();
});

test("F07 survives SQLite restart with budgets, holds and postings", async () => {
  const path = `/tmp/bu2-f07-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`;
  const first = new SqliteLedger(path);
  await new Bu2Sandbox({ ledger: first }).createBudget(budgetInput, "f07-restart-budget");
  assert.equal(first.schemaVersion(), 16);
  first.close();
  const second = new SqliteLedger(path);
  const restored = second.loadState();
  assert.equal(restored.financial.budgets.length, 1);
  assert.equal(restored.financial.budget_holds.length, 0);
  assert.equal(restored.financial.financial_postings.length, 0);
  second.close();
});

test("F07 HTTP endpoints expose budget and posting resources", async (context) => {
  const running = await listen({ port: 0, dbPath: ":memory:" });
  context.after(() => new Promise((resolve) => running.server.close(() => { running.ledger.close(); resolve(); })));
  const request = async (path, options = {}) => {
    const response = await fetch(`${running.url}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.key ? { "idempotency-key": options.key } : {}),
      },
    });
    return { status: response.status, body: await response.json() };
  };
  const created = await request("/v1/budgets", {
    method: "POST",
    key: "f07-http-budget",
    body: JSON.stringify(budgetInput),
  });
  assert.equal(created.status, 201);
  const listed = await request("/v1/budgets");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].id, budgetInput.id);
  const postings = await request("/v1/financial_postings");
  assert.equal(postings.status, 200);
  assert.deepEqual(postings.body.data, []);
});
