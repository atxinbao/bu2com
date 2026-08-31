const baseUrl = process.env.BU2_SANDBOX_URL ?? "http://127.0.0.1:3100";

async function api(path, { method = "GET", body, key } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(result)}`);
  return result;
}

console.log("1. Seller Agent creates a quote");
const quote = await api("/v1/quotes", {
  method: "POST",
  key: "seller-quote-8421",
  body: {
    seller_agent_id: "agt_market_data",
    payee_account_id: "acct_atlas_data",
    item: { name: "Southeast Asia commerce dataset", delivery_type: "dataset_access" },
    amount: { value: 3900, currency: "CNY" },
    expires_at: "2026-09-02T08:00:00Z",
  },
});

console.log("2. Buyer Agent creates a PaymentIntent");
const intent = await api("/v1/payment_intents", {
  method: "POST",
  key: "buyer-intent-8421",
  body: {
    quote_id: quote.id,
    payer_account_id: "acct_bu2_ventures",
    buyer_agent_id: "agt_research_copilot",
    payment_mandate_id: "mdt_research_04",
    amount: { value: 3900, currency: "CNY" },
    purpose: "Southeast Asia commerce dataset · 2026 Q2",
    external_context: { type: "chatgpt_conversation", id: "conv_external_8421" },
  },
});
console.log(
  `   decision=${intent.authorization.decision} reason=${intent.authorization.reason_code}`,
);

console.log("3. Account owner authorizes; BU2 reserves funds");
const authorized = await api(`/v1/payment_intents/${intent.id}/authorization`, {
  method: "POST",
  key: "human-authorize-8421",
  body: { decision: "authorize", reason: "Approved in ChatGPT" },
});
console.log(`   status=${authorized.status} transaction=${authorized.transaction_id}`);

console.log("4. Seller Agent submits delivery evidence");
await api(`/v1/transactions/${authorized.transaction_id}/deliveries`, {
  method: "POST",
  key: "seller-delivery-8421",
  body: {
    type: "dataset_access",
    evidence_hash: "sha256:9fc2a17e",
    summary: "Signed dataset access grant",
  },
});

console.log("5. BU2 settles and issues a signed Receipt");
const settled = await api(`/v1/transactions/${authorized.transaction_id}/settlements`, {
  method: "POST",
  key: "settlement-8421",
  body: {},
});
const verification = await api(`/v1/receipts/${settled.receipt.id}/verify`);
console.log(
  `   status=${settled.transaction.status} receipt=${settled.receipt.id} signature_valid=${verification.valid}`,
);

console.log("6. End-to-end Agent payment completed");
