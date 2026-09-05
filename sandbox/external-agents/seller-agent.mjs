export class SellerAgent {
  constructor({ mcp }) {
    this.mcp = mcp;
  }

  createQuote({
    sellerAgentId,
    payeeAccountId,
    itemName,
    deliveryType,
    amountValue,
    currency,
    expiresAt,
    idempotencyKey,
  }) {
    return this.mcp.call("bu2_create_quote", {
      seller_agent_id: sellerAgentId,
      payee_account_id: payeeAccountId,
      item_name: itemName,
      delivery_type: deliveryType,
      amount_value: amountValue,
      currency,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
    });
  }

  submitDelivery({
    transactionId,
    deliveryType,
    evidenceHash,
    summary,
    idempotencyKey,
  }) {
    return this.mcp.call("bu2_submit_delivery", {
      transaction_id: transactionId,
      delivery_type: deliveryType,
      evidence_hash: evidenceHash,
      ...(summary ? { summary } : {}),
      idempotency_key: idempotencyKey,
    });
  }
}
