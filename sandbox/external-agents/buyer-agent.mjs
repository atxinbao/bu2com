export class BuyerAgent {
  constructor({ mcp }) {
    this.mcp = mcp;
  }

  createPaymentIntent({
    quoteId,
    payerAccountId,
    buyerAgentId,
    paymentMandateId,
    amountValue,
    currency,
    purpose,
    externalContextType,
    externalContextId,
    idempotencyKey,
  }) {
    return this.mcp.call("bu2_create_payment_intent", {
      quote_id: quoteId,
      payer_account_id: payerAccountId,
      buyer_agent_id: buyerAgentId,
      payment_mandate_id: paymentMandateId,
      amount_value: amountValue,
      currency,
      purpose,
      ...(externalContextType
        ? { external_context_type: externalContextType }
        : {}),
      ...(externalContextId ? { external_context_id: externalContextId } : {}),
      idempotency_key: idempotencyKey,
    });
  }

  getPaymentStatus(paymentIntentId) {
    return this.mcp.call("bu2_get_payment_status", {
      payment_intent_id: paymentIntentId,
    });
  }

  getReceipt(receiptId) {
    return this.mcp.call("bu2_get_receipt", { receipt_id: receiptId });
  }

  verifyReceipt(receiptId) {
    return this.mcp.call("bu2_verify_receipt", { receipt_id: receiptId });
  }
}
