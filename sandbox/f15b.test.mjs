import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { Bu2Sandbox } from "./domain.mjs";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { loadEnvironmentConfig } from "./environment-config.mjs";
import { normalizeOnboardingDocument } from "./identity.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { bindReceivingTarget } from "./test-ledger-bindings.mjs";

const now = new Date(Date.now() - 1_000).toISOString();

function sessionInput(suffix, overrides = {}) {
  return {
    tenant_id: `ten_f15b_${suffix}`,
    account_id: `acct_f15b_${suffix}`,
    agent_id: `agt_f15b_${suffix}`,
    environment: "local",
    purpose: "F15b internal operations rehearsal",
    max_spend: { value: 100, currency: "CNY" },
    starts_at: now,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function mandateInput(suffix) {
  return {
    account_id: `acct_f15b_${suffix}`,
    agent_id: `agt_f15b_${suffix}`,
    funding_source_id: `fund_f15b_${suffix}`,
    receiving_target_id: `tgt_f15b_${suffix}`,
    environment: "local",
    currency: "CNY",
    max_single_amount: 100,
    daily_limit: 500,
    monthly_limit: 1_000,
    effective_at: now,
  };
}

async function activateSessionAndMandate(sandbox, suffix) {
  sandbox.ledger.registerLedgerAccount({
    id: `lga_f15b_${suffix}`,
    environment: "local",
    tenant_id: `ten_f15b_${suffix}`,
    book_id: "book_primary",
    owner_account_id: `acct_f15b_${suffix}`,
    asset: "CNY",
    network: null,
  });
  sandbox.ledger.registerLedgerAccount({
    id: `lga_f15b_seller_${suffix}`,
    environment: "local",
    tenant_id: `ten_f15b_${suffix}`,
    book_id: "book_primary",
    owner_account_id: `acct_f15b_seller_${suffix}`,
    asset: "CNY",
    network: null,
  });
  sandbox.ledger.bootstrapIdentityTenants(
    normalizeOnboardingDocument(
      {
        environment: "local",
        requested_by: "usr_f15b_reviewer",
        idempotency_key: `f15b-bindings-${suffix}`,
        tenants: [
          {
            tenant_id: `ten_f15b_${suffix}`,
            principal: { id: `usr_f15b_${suffix}`, display_name: `F15b ${suffix}` },
            accounts: [
              { id: `acct_f15b_${suffix}`, display_name: `F15b ${suffix}` },
              { id: `acct_f15b_seller_${suffix}`, display_name: `F15b Seller ${suffix}` },
            ],
            agents: [
              { id: `agt_f15b_${suffix}`, display_name: `F15b ${suffix}` },
              { id: `agt_f15b_seller_${suffix}`, display_name: `F15b Seller ${suffix}` },
            ],
            credentials: [],
            funding_sources: [
              {
                id: `fund_f15b_${suffix}`,
                account_id: `acct_f15b_${suffix}`,
                agent_id: `agt_f15b_${suffix}`,
                asset: "CNY",
                network: null,
                provider: "simulated",
                ledger_account_id: `lga_f15b_${suffix}`,
                source_reference: `wallet:f15b-source-${suffix}`,
              },
            ],
            receiving_targets: [
              {
                id: `tgt_f15b_${suffix}`,
                account_id: `acct_f15b_seller_${suffix}`,
                agent_id: `agt_f15b_seller_${suffix}`,
                asset: "CNY",
                network: null,
                provider: "simulated",
                ledger_account_id: `lga_f15b_seller_${suffix}`,
                target_reference: `wallet:f15b-target-${suffix}`,
              },
            ],
          },
        ],
      },
      "local",
    ),
  );
  const session = await sandbox.createExecutionSession(
    sessionInput(suffix),
    `f15b-session-create-${suffix}`,
  );
  const activeSession = await sandbox.transitionExecutionSession(
    session.id,
    "activate",
    { version: 1, activation_id: `act_f15b_${suffix}`, approved_by: "usr_f15b_reviewer" },
    `f15b-session-activate-${suffix}`,
  );
  const mandate = await sandbox.createPaymentMandate(
    mandateInput(suffix),
    `f15b-mandate-create-${suffix}`,
  );
  const activeMandate = await sandbox.transitionPaymentMandate(
    mandate.id,
    "activate",
    { version: 1 },
    `f15b-mandate-activate-${suffix}`,
  );
  return { session: activeSession, mandate: activeMandate };
}

async function settledPayment(sandbox, suffix, amount = 20) {
  const { session, mandate } = await activateSessionAndMandate(sandbox, suffix);
  const quote = await sandbox.createQuote(
    {
      seller_agent_id: `agt_f15b_seller_${suffix}`,
      payee_account_id: `acct_f15b_seller_${suffix}`,
      item: { name: `F15b resource ${suffix}`, delivery_type: "research_data" },
      amount: { value: amount, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    `f15b-quote-${suffix}`,
  );
  sandbox.knownPayees.add(quote.payee_account_id);
  const intent = await sandbox.createPaymentIntent(
    {
      quote_id: quote.id,
      payer_account_id: mandate.account_id,
      buyer_agent_id: mandate.agent_id,
      payment_mandate_id: mandate.id,
      amount: quote.amount,
      purpose: `F15b payment ${suffix}`,
      funding_source_id: mandate.funding_source_id,
      receiving_target_id: mandate.receiving_target_id,
      execution_session_id: session.id,
    },
    `f15b-intent-${suffix}`,
  );
  await sandbox.submitDelivery(
    intent.transaction_id,
    { type: "research_data", evidence_hash: `sha256:f15b-${suffix}` },
    `f15b-delivery-${suffix}`,
  );
  const settled = await sandbox.settle(
    intent.transaction_id,
    {},
    `f15b-settle-${suffix}`,
  );
  return { ...settled, session, mandate };
}

test("F15b completes a bounded business load and produces a matched financial reconciliation", async (context) => {
  const ledger = new SqliteLedger(":memory:");
  const sandbox = new Bu2Sandbox({
    ledger,
    adapter: new SimulatedPaymentAdapter({ ledger }),
  });
  context.after(() => ledger.close());

  const payments = [];
  for (let index = 0; index < 6; index += 1) {
    payments.push(await settledPayment(sandbox, `load_${index}`));
  }
  assert.equal(payments.length, 6);
  assert.equal(
    sandbox.listTransactions().filter(({ transaction }) => transaction.status === "settled").length,
    6,
  );

  bindReceivingTarget(ledger, {
    suffix: "f15b_collection",
    account_id: "acct_f15b_collection_seller",
    agent_id: "agt_f15b_collection_seller",
    receiving_target_id: "tgt_f15b_collection",
  });

  const collectionQuote = await sandbox.createQuote(
    {
      seller_agent_id: "agt_f15b_collection_seller",
      payee_account_id: "acct_f15b_collection_seller",
      item: { name: "F15b inbound resource", delivery_type: "research_data" },
      amount: { value: 60, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    "f15b-collection-quote",
  );
  const receivable = await sandbox.createReceivable(
    {
      quote_id: collectionQuote.id,
      account_id: collectionQuote.payee_account_id,
      agent_id: collectionQuote.seller_agent_id,
      receiving_target_id: "tgt_f15b_collection",
      expires_at: new Date(Date.now() + 43_200_000).toISOString(),
      purpose: "F15b inbound resource",
    },
    "f15b-collection-receivable",
  );
  const collection = await sandbox.verifyInboundPayment(
    receivable.id,
    {
      provider_reference: "sim_f15b_collection",
      collection_reference: receivable.collection_reference,
    },
    "f15b-collection-post",
  );
  const refund = await sandbox.requestRefund(
    payments[0].transaction.id,
    { amount: { value: 10, currency: "CNY" } },
    "f15b-refund",
  );
  for (const [sourceType, sourceId, providerReference, value, key] of [
    ["payment", payments[0].transaction.id, payments[0].transaction.settlement_provider_reference, 2, "payment"],
    ["collection", collection.collection.id, collection.collection.provider_reference, 1, "collection"],
    ["refund", refund.refund.id, refund.refund.provider_reference, 1, "refund"],
  ]) {
    await sandbox.recordProviderFee(
      {
        source_type: sourceType,
        source_id: sourceId,
        provider: "bu2_simulated_provider",
        provider_reference: providerReference,
        amount: { value, currency: "CNY" },
      },
      `f15b-fee-${key}`,
    );
  }

  const reconciliation = await sandbox.createReconciliation({}, "f15b-reconcile");
  assert.equal(reconciliation.status, "matched");
  assert.equal(reconciliation.exception_count, 0);
  assert.equal(reconciliation.unknown_count, 0);
  assert.deepEqual(reconciliation.totals.CNY, {
    payments: 120,
    collections: 60,
    refunds: 10,
    fees: 4,
  });
  assert.equal(sandbox.listProviderFees().length, 3);
});

test("F15b resumes an interrupted financial workflow after SQLite restart without duplicate posting", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f15b-restart-"));
  const database = join(directory, "f15b.sqlite");
  const config = loadEnvironmentConfig();
  try {
    const firstLedger = new SqliteLedger(database, { environmentConfig: config });
    const first = new Bu2Sandbox({
      ledger: firstLedger,
      environmentConfig: config,
      adapter: new SimulatedPaymentAdapter({ ledger: firstLedger }),
    });
    const { session, mandate } = await activateSessionAndMandate(first, "restart");
    const quote = await first.createQuote(
      {
        seller_agent_id: "agt_f15b_seller_restart",
        payee_account_id: "acct_f15b_seller_restart",
        item: { name: "F15b restart resource", delivery_type: "research_data" },
        amount: { value: 40, currency: "CNY" },
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      "f15b-restart-quote",
    );
    first.knownPayees.add(quote.payee_account_id);
    const intent = await first.createPaymentIntent(
      {
        quote_id: quote.id,
        payer_account_id: mandate.account_id,
        buyer_agent_id: mandate.agent_id,
        payment_mandate_id: mandate.id,
        amount: quote.amount,
        purpose: "F15b restart payment",
        funding_source_id: mandate.funding_source_id,
        receiving_target_id: mandate.receiving_target_id,
        execution_session_id: session.id,
      },
      "f15b-restart-intent",
    );
    const transactionId = intent.transaction_id;
    firstLedger.close();

    const secondLedger = new SqliteLedger(database, { environmentConfig: config });
    const second = new Bu2Sandbox({
      ledger: secondLedger,
      environmentConfig: config,
      adapter: new SimulatedPaymentAdapter({ ledger: secondLedger }),
    });
    assert.equal(second.getTransaction(transactionId).transaction.status, "funds_reserved");
    assert.equal(second.getExecutionSession(session.id).reserved_spend_minor, 40);
    await second.submitDelivery(
      transactionId,
      { type: "research_data", evidence_hash: "sha256:f15b-restart" },
      "f15b-restart-delivery",
    );
    const settled = await second.settle(transactionId, {}, "f15b-restart-settle");
    const replay = await second.settle(transactionId, {}, "f15b-restart-settle");
    assert.deepEqual(replay, settled);
    assert.equal(
      second.listTransactions().filter(({ transaction }) => transaction.status === "settled").length,
      1,
    );
    secondLedger.close();

    const thirdLedger = new SqliteLedger(database, { environmentConfig: config });
    const third = new Bu2Sandbox({
      ledger: thirdLedger,
      environmentConfig: config,
      adapter: new SimulatedPaymentAdapter({ ledger: thirdLedger }),
    });
    assert.equal(third.getTransaction(transactionId).transaction.status, "settled");
    assert.equal(
      third.listTransactions().filter(({ transaction }) => transaction.status === "settled").length,
      1,
    );
    const reconciliation = await third.createReconciliation({}, "f15b-restart-reconcile");
    assert.equal(reconciliation.status, "matched");
    assert.equal(reconciliation.unknown_count, 0);
    thirdLedger.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("F15b keeps Sandbox/Testnet disarmed during an operations rehearsal", async () => {
  const config = loadEnvironmentConfig({ environment: "sandbox", paymentAdapter: "x402" });
  const sandbox = new Bu2Sandbox({ environmentConfig: config });
  const session = await sandbox.createExecutionSession(
    sessionInput("testnet", { environment: "sandbox" }),
    "f15b-testnet-session",
  );
  await assert.rejects(
    sandbox.transitionExecutionSession(
      session.id,
      "activate",
      { version: 1, activation_id: "act_f15b_testnet", approved_by: "usr_f15b_reviewer" },
      "f15b-testnet-activate",
    ),
    (error) => error.code === "environment_execution_disabled",
  );
  assert.equal(sandbox.getExecutionSession(session.id).activation_status, "pending");
  assert.equal(config.execution_status, "execution_disabled");
});

test("F15b stops the Reference Server cleanly after persisted business setup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-f15b-shutdown-"));
  const database = join(directory, "shutdown.sqlite");
  const config = loadEnvironmentConfig();
  const ledger = new SqliteLedger(database, { environmentConfig: config });
  const sandbox = new Bu2Sandbox({ ledger, environmentConfig: config });
  await sandbox.createQuote(
    {
      seller_agent_id: "agt_f15b_shutdown_seller",
      payee_account_id: "acct_f15b_shutdown_seller",
      item: { name: "F15b shutdown resource", delivery_type: "research_data" },
      amount: { value: 10, currency: "CNY" },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    "f15b-shutdown-quote",
  );
  ledger.close();

  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      BU2_SANDBOX_PORT: "0",
      BU2_SANDBOX_DB: database,
      BU2_ENVIRONMENT: "local",
      BU2_PAYMENT_ADAPTER: "simulated",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("F15b server did not start in time.")), 10_000);
      const inspect = (chunk) => {
        if (!String(chunk).includes("listening on")) return;
        clearTimeout(timeout);
        child.stdout.off("data", inspect);
        resolve();
      };
      child.stdout.on("data", inspect);
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code !== null) reject(new Error(`F15b server exited before startup with ${code}.`));
      });
    });
    child.kill("SIGTERM");
    const result = await new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(result, { code: 0, signal: null });
    assert.match(output, /"event":"shutdown\.started"/);
    assert.match(output, /"event":"shutdown\.completed"/);
    assert.doesNotMatch(output, /SQLITE_BUSY|SQLITE_IOERR/);

    const restoredLedger = new SqliteLedger(database, { environmentConfig: config });
    assert.equal(restoredLedger.loadState().resources.quotes.length, 1);
    restoredLedger.close();
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
  }
});
