import {
  Bu2Client,
  type CreatePaymentIntent,
  type CreateQuote,
  type TransactionListQuery,
} from "../src/index.js";

const client = new Bu2Client({
  baseUrl: "http://127.0.0.1:3100/v1",
  environment: "simulation",
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

// @ts-expect-error 写操作必须显式提供幂等键。
void client.createQuote(quote, {});

// @ts-expect-error Phase 0 SDK 不允许 Mainnet 环境。
new Bu2Client({ baseUrl: "https://api.bu2.com/v1", environment: "mainnet" });
