import type { components, paths } from "./generated/openapi.js";

export type Amount = components["schemas"]["Amount"];
export type Authorization = components["schemas"]["Authorization"];
export type AccessIdentity = components["schemas"]["AccessIdentity"];
export type IdentityAccount = components["schemas"]["IdentityAccount"];
export type IdentityAgent = components["schemas"]["IdentityAgent"];
export type IdentityPrincipal = components["schemas"]["IdentityPrincipal"];
export type IdentitySummary = components["schemas"]["IdentitySummary"];
export type CreatePaymentIntent = components["schemas"]["CreatePaymentIntent"];
export type CreateBudget = components["schemas"]["CreateBudget"];
export type Budget = components["schemas"]["Budget"];
export type BudgetHold = components["schemas"]["BudgetHold"];
export type FinancialPosting = components["schemas"]["FinancialPosting"];
export type PaymentMandate = components["schemas"]["PaymentMandate"];
export type CreatePaymentMandate = components["schemas"]["CreatePaymentMandate"];
export type MandateTransition = components["schemas"]["MandateTransition"];
export type CreateQuote = components["schemas"]["CreateQuote"];
export type DeliveryEvidence = components["schemas"]["DeliveryEvidence"];
export type DeliveryRecord = components["schemas"]["DeliveryRecord"];
export type PaymentIntent = components["schemas"]["PaymentIntent"];
export type Quote = components["schemas"]["Quote"];
export type Receipt = components["schemas"]["Receipt"];
export type EnvironmentInfo = components["schemas"]["EnvironmentInfo"];
export type SettlementRecoveryResult = components["schemas"]["SettlementRecoveryResult"];
export type Transaction = components["schemas"]["Transaction"];
export type TransactionPage = components["schemas"]["TransactionPage"];
export type TransactionView = components["schemas"]["TransactionView"];

export type AuthorizationDecision = NonNullable<
  paths["/payment_intents/{payment_intent_id}/authorization"]["post"]["requestBody"]
>["content"]["application/json"];

export type DeliveryResult =
  paths["/transactions/{transaction_id}/deliveries"]["post"]["responses"][201]["content"]["application/json"];

export type SettlementResult =
  paths["/transactions/{transaction_id}/settlements"]["post"]["responses"][201]["content"]["application/json"];

export type ReceiptVerification =
  paths["/receipts/{receipt_id}/verify"]["get"]["responses"][200]["content"]["application/json"];

export type TransactionListQuery = NonNullable<
  paths["/transactions"]["get"]["parameters"]["query"]
>;

export type Bu2ExternalEnvironment = "sandbox" | "live";
export type Bu2Environment = "local" | Bu2ExternalEnvironment;

interface Bu2ClientBaseOptions {
  baseUrl: string;
  defaultTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export type Bu2ClientOptions = Bu2ClientBaseOptions &
  (
    | { environment: Bu2ExternalEnvironment; localDevelopment?: false; apiKey: string }
    | { environment: "local"; localDevelopment: true; apiKey?: string }
  );

export interface Bu2RequestOptions {
  traceId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Bu2MutationOptions extends Bu2RequestOptions {
  idempotencyKey: string;
}
