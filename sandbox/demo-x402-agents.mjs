const baseUrl = process.env.BU2_X402_SANDBOX_URL ?? "http://127.0.0.1:3101";

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

console.log("1. Seller Agent creates a 0.01 USD x402 quote");
const quote = await api("/v1/quotes", {
  method: "POST",
  key: "x402-seller-quote-001",
  body: {
    seller_agent_id: "agt_x402_merchant",
    payee_account_id: "acct_x402_merchant",
    item: { name: "BU2 x402 premium dataset", delivery_type: "dataset_access" },
    amount: { value: 1, currency: "USD" },
    expires_at: "2026-09-02T08:00:00Z",
  },
});

console.log("2. Buyer Agent creates a PaymentIntent");
const intent = await api("/v1/payment_intents", {
  method: "POST",
  key: "x402-buyer-intent-001",
  body: {
    quote_id: quote.id,
    payer_account_id: "acct_x402_buyer",
    buyer_agent_id: "agt_x402_buyer",
    payment_mandate_id: "mdt_x402_test",
    amount: { value: 1, currency: "USD" },
    purpose: "Buy one x402 sandbox dataset",
  },
});

console.log("3. Owner authorizes; BU2 validates the merchant challenge and reserves internally");
const authorized = await api(`/v1/payment_intents/${intent.id}/authorization`, {
  method: "POST",
  key: "x402-human-authorize-001",
  body: { decision: "authorize" },
});

console.log("4. Seller submits delivery evidence");
await api(`/v1/transactions/${authorized.transaction_id}/deliveries`, {
  method: "POST",
  key: "x402-delivery-001",
  body: { type: "dataset_access", evidence_hash: "sha256:x402sandbox001" },
});

console.log("5. BU2 performs the paid x402 request and issues its unified Receipt");
const settled = await api(`/v1/transactions/${authorized.transaction_id}/settlements`, {
  method: "POST",
  key: "x402-settlement-001",
  body: {},
});
const verification = await api(`/v1/receipts/${settled.receipt.id}/verify`);
console.log(
  JSON.stringify(
    {
      transaction_id: settled.transaction.id,
      x402_transaction: settled.transaction.settlement_provider_reference,
      receipt_id: settled.receipt.id,
      receipt_valid: verification.valid,
    },
    null,
    2,
  ),
);
