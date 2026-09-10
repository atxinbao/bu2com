import {
  Bu2Client,
  type CreatePaymentIntent,
  type CreateQuote,
  type AccountWallet,
  type TransactionListQuery,
} from "../src/index.js";

const client = new Bu2Client({
  baseUrl: "http://127.0.0.1:3100/v1",
  environment: "local",
  localDevelopment: true,
});

const quote: CreateQuote = {
  seller_agent_id: "agt_types",
  payee_account_id: "acct_types",
  item: { name: "Typed data", delivery_type: "dataset_access" },
  amount: { value: 100, currency: "CNY" },
  expires_at: "2026-09-12T08:00:00Z",
};

const intent: CreatePaymentIntent = {
  quote_id: "quo_types",
  payer_account_id: "acct_buyer",
  buyer_agent_id: "agt_buyer",
  payment_mandate_id: "mdt_buyer",
  amount: { value: 100, currency: "CNY" },
  purpose: "Typed API test",
};

const query: TransactionListQuery = { limit: 20 };

void client.createQuote(quote, { idempotencyKey: "types-quote-key" });
void client.createPaymentIntent(intent, { idempotencyKey: "types-intent-key" });
void client.listTransactions(query);
void client.listAccountWallets("acct_types");

const wallet: AccountWallet = {
  schema_version: "wallet.v1",
  account_id: "acct_types",
  ledger_account_id: "lga_types",
  book_id: "book_primary",
  asset: "CNY",
  network: null,
  currency: "CNY",
  account_status: "active",
  status: "active",
  available: { value: 100, currency: "CNY" },
  reserved: { value: 0, currency: "CNY" },
  balance_source: "account_wallet",
  read_mode: "ledger_projection",
  cutover_generation: 1,
  blockers: [],
  fallback_performed: false,
};
void wallet;

// @ts-expect-error 写操作必须显式提供幂等键。
void client.createQuote(quote, {});

// @ts-expect-error 对外环境使用 live，而不是网络名称 Mainnet。
new Bu2Client({ baseUrl: "https://api.bu2.com/v1", environment: "mainnet" });

// @ts-expect-error Sandbox 和 Live 必须显式提供环境绑定的 API key。
new Bu2Client({ baseUrl: "https://sandbox.api.bu2.com/v1", environment: "sandbox" });

new Bu2Client({
  baseUrl: "https://sandbox.api.bu2.com/v1",
  environment: "sandbox",
  apiKey: "test-credential-with-more-than-thirty-two-characters",
});
