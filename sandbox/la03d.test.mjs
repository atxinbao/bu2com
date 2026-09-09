import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteLedger } from "./persistence.mjs";

const account = (overrides = {}) => ({
  id: "lga_buyer_cny",
  environment: "local",
  tenant_id: "ten_buyer",
  book_id: "book_primary",
  owner_account_id: "acct_buyer",
  asset: "CNY",
  network: null,
  ...overrides,
});

test("LA-03d persists an explicit multi-account ownership tuple", () => {
  const ledger = new SqliteLedger(":memory:");
  const created = ledger.registerLedgerAccount(account());
  assert.equal(ledger.schemaVersion(), 19);
  assert.equal(created.status, "active");
  assert.equal(created.version, 1);
  assert.deepEqual(ledger.listLedgerAccounts({ tenant_id: "ten_buyer" }), [created]);
  assert.deepEqual(ledger.registerLedgerAccount(account()), created);
  assert.throws(
    () => ledger.registerLedgerAccount(account({ id: "lga_other" })),
    (error) => error.code === "ledger_account_ownership_exists",
  );
  assert.throws(
    () => ledger.registerLedgerAccount(account({ id: "lga_invalid_owner", owner_account_id: "agt_not_account" })),
    (error) => error.code === "invalid_ledger_owner_account",
  );
  ledger.close();
});

test("LA-03d isolates environment and tenant ownership tuples", () => {
  const ledger = new SqliteLedger(":memory:");
  ledger.registerLedgerAccount(account());
  const sandboxAccount = ledger.registerLedgerAccount(account({
    id: "lga_sandbox_buyer",
    environment: "sandbox",
  }));
  const otherTenant = ledger.registerLedgerAccount(account({
    id: "lga_other_tenant",
    tenant_id: "ten_other",
  }));
  assert.deepEqual(
    ledger.listLedgerAccounts({ environment: "sandbox" }).map((row) => row.id),
    [sandboxAccount.id],
  );
  assert.deepEqual(
    ledger.listLedgerAccounts({ tenant_id: "ten_other" }).map((row) => row.id),
    [otherTenant.id],
  );
  ledger.close();
});

test("LA-03d uses conditional version transitions and keeps retired accounts terminal", () => {
  const ledger = new SqliteLedger(":memory:");
  const created = ledger.registerLedgerAccount(account());
  const suspended = ledger.transitionLedgerAccount(created.id, { status: "suspended", version: 1 });
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.version, 2);
  assert.throws(
    () => ledger.transitionLedgerAccount(created.id, { status: "active", version: 1 }),
    (error) => error.code === "ledger_account_version_conflict",
  );
  const retired = ledger.transitionLedgerAccount(created.id, { status: "retired", version: 2 });
  assert.equal(retired.status, "retired");
  assert.equal(retired.version, 3);
  assert.throws(
    () => ledger.transitionLedgerAccount(created.id, { status: "active", version: 3 }),
    (error) => error.code === "ledger_account_retired",
  );
  ledger.close();
});

test("LA-03d ownership records survive SQLite restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-la03d-"));
  const path = join(directory, "ledger.sqlite");
  try {
    const first = new SqliteLedger(path);
    first.registerLedgerAccount(account({ network: "base-sepolia" }));
    first.close();
    const second = new SqliteLedger(path);
    assert.equal(second.schemaVersion(), 19);
    assert.equal(second.getLedgerAccount("lga_buyer_cny").network, "base-sepolia");
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
