import createClient from "openapi-fetch";
import type { paths } from "./generated/openapi.js";
import {
  Bu2ApiError,
  Bu2ConfigurationError,
  Bu2EnvironmentError,
  Bu2SdkError,
  Bu2TransportError,
  type Bu2RecoveryAction,
} from "./errors.js";
import type {
  AccessIdentity,
  AuthorizationDecision,
  Budget,
  BudgetHold,
  Bu2ClientOptions,
  Bu2MutationOptions,
  Bu2RequestOptions,
  CreatePaymentIntent,
  CreateBudget,
  CreateQuote,
  CreateReceivable,
  DeliveryEvidence,
  DeliveryResult,
  EnvironmentInfo,
  FinancialPosting,
  PaymentMandate,
  CreatePaymentMandate,
  MandateTransition,
  PaymentIntent,
  Quote,
  Receivable,
  Receipt,
  ReceiptVerification,
  SettlementRecoveryResult,
  SettlementResult,
  TransactionListQuery,
  TransactionPage,
  TransactionView,
} from "./types.js";
import { ENVIRONMENT_CONTRACT } from "./generated/environment.js";

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

type Operation = {
  name: string;
  mutation: boolean;
  requiresExecution?: boolean;
};

type TimedSignal = {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Bu2ConfigurationError("baseUrl must be an absolute HTTP(S) URL ending in /v1.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Bu2ConfigurationError("baseUrl must use HTTP or HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/v1")) {
    throw new Bu2ConfigurationError("baseUrl must end in /v1.");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function timeoutValue(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > 300_000) {
    throw new Bu2ConfigurationError("timeoutMs must be an integer from 1 to 300000.");
  }
  return resolved;
}

function validateApiKey(
  environment: Bu2ClientOptions["environment"],
  value?: string,
): string | null {
  if (environment !== "local" && (!value || value.length < 32)) {
    throw new Bu2ConfigurationError(
      "apiKey with at least 32 characters is required for sandbox and live.",
    );
  }
  if (value !== undefined && value.length < 32) {
    throw new Bu2ConfigurationError("apiKey must contain at least 32 characters when provided.");
  }
  return value ?? null;
}

function publicRequest(pathname: string): boolean {
  return pathname === "/v1/environment" || /^\/v1\/receipts\/[^/]+\/verify$/.test(pathname);
}

function timedSignal(input: AbortSignal | undefined, timeoutMs: number): TimedSignal {
  const controller = new AbortController();
  let timeoutReached = false;
  const onAbort = () => controller.abort(input?.reason);
  if (input?.aborted) onAbort();
  else input?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timeoutReached = true;
    controller.abort(new DOMException("BU2 request timed out.", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timeoutReached,
    cleanup: () => {
      clearTimeout(timer);
      input?.removeEventListener("abort", onAbort);
    },
  };
}

function traceHeaders(options: Bu2RequestOptions | undefined): { "X-Trace-Id"?: string } {
  return options?.traceId ? { "X-Trace-Id": options.traceId } : {};
}

function mutationHeaders(options: Bu2MutationOptions | undefined): {
  "X-Trace-Id"?: string;
  "Idempotency-Key": string;
} {
  return {
    ...traceHeaders(options),
    "Idempotency-Key": typeof options?.idempotencyKey === "string" ? options.idempotencyKey : "",
  };
}

function apiRecovery(status: number, mutation: boolean): Bu2RecoveryAction {
  if ([400, 413, 415, 422].includes(status)) return "fix_request";
  if ([401, 403, 404].includes(status)) return "stop";
  if (mutation) return "query_before_retry";
  if (status === 429 || status >= 500) return "retry_safe";
  return "stop";
}

function apiError(response: Response, payload: unknown, operation: Operation): Bu2ApiError {
  const envelope = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const code = stringValue(envelope.code) ?? `http_${response.status}`;
  const type = stringValue(envelope.type) ?? "api_error";
  const message =
    stringValue(envelope.message) ?? `BU2 request failed with HTTP ${response.status}.`;
  const requestId = stringValue(envelope.request_id) ?? response.headers.get("x-request-id");
  const traceId = stringValue(envelope.trace_id) ?? response.headers.get("x-trace-id");
  const details = isRecord(envelope.details) ? envelope.details : {};
  return new Bu2ApiError(message, {
    status: response.status,
    code,
    type,
    requestId,
    traceId,
    details,
    recovery: apiRecovery(response.status, operation.mutation),
  });
}

export class Bu2Client {
  readonly baseUrl: string;
  readonly environment: Bu2ClientOptions["environment"];
  readonly localDevelopment: boolean;
  readonly defaultTimeoutMs: number;
  private readonly api: ReturnType<typeof createClient<paths>>;

  constructor(options: Bu2ClientOptions) {
    if (!options || !["local", "sandbox", "live"].includes(options.environment)) {
      throw new Bu2ConfigurationError("environment must be local, sandbox, or live.");
    }
    if (options.environment === "local" && options.localDevelopment !== true) {
      throw new Bu2ConfigurationError(
        "local requires localDevelopment: true and cannot be used as an external environment.",
      );
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.environment = options.environment;
    this.localDevelopment = options.environment === "local";
    this.defaultTimeoutMs = timeoutValue(options.defaultTimeoutMs, 30_000);
    const apiKey = validateApiKey(options.environment, options.apiKey);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    this.api = createClient<paths>({
      baseUrl: this.baseUrl,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (!apiKey || publicRequest(url.pathname)) {
          return fetchImpl(new Request(request, { redirect: "error" }));
        }
        const headers = new Headers(request.headers);
        headers.set("authorization", `Bearer ${apiKey}`);
        return fetchImpl(new Request(request, { headers, redirect: "error" }));
      },
    });
  }

  private validateEnvironment(info: EnvironmentInfo, requireExecution: boolean): EnvironmentInfo {
    const expected = ENVIRONMENT_CONTRACT.environments[this.environment];
    const mismatches = [
      info.environment !== this.environment ? "environment" : null,
      info.environment_contract_version !== ENVIRONMENT_CONTRACT.schema_version
        ? "environment_contract_version"
        : null,
      info.chain_id !== expected.chain_id ? "chain_id" : null,
      info.network !== expected.network ? "network" : null,
      info.execution_backend !== expected.payment_adapter ? "execution_backend" : null,
      info.access_contract_version !== "1.0" ? "access_contract_version" : null,
      this.environment !== "local" && info.access_mode !== "authenticated" ? "access_mode" : null,
      this.environment === "local" &&
      !["development_open", "authenticated"].includes(info.access_mode)
        ? "access_mode"
        : null,
      info.receipt_issuer?.environment !== this.environment ? "receipt_issuer.environment" : null,
      info.receipt_issuer?.issuer_id !== `bu2-reference-server:${this.environment}`
        ? "receipt_issuer.issuer_id"
        : null,
      !info.receipt_issuer?.verification_key_id ? "receipt_issuer.verification_key_id" : null,
      info.receipt_issuer?.signature_algorithm !== "Ed25519"
        ? "receipt_issuer.signature_algorithm"
        : null,
      !info.receipt_issuer?.public_key ? "receipt_issuer.public_key" : null,
      info.api_contract_version !== "0.3.0" ? "api_contract_version" : null,
      !info.receipt_schema_versions?.includes("0.3") ? "receipt_schema_versions" : null,
    ].filter((value): value is string => value !== null);
    if (mismatches.length > 0) {
      throw new Bu2EnvironmentError(
        "BU2 endpoint does not match the expected environment contract.",
        "environment_contract_mismatch",
        { expected_environment: this.environment, mismatches },
      );
    }
    if (requireExecution && info.execution_status !== "execution_enabled") {
      throw new Bu2EnvironmentError(
        "BU2 payment execution is disabled for the selected environment.",
        "environment_execution_disabled",
        { environment: this.environment, execution_status: info.execution_status },
      );
    }
    return info;
  }

  private async preflightMutation(
    options: Bu2RequestOptions | undefined,
    requireExecution: boolean,
  ): Promise<void> {
    const info = await this.getEnvironment(options);
    this.validateEnvironment(info, requireExecution);
  }

  private async execute<T>(
    operation: Operation,
    options: Bu2RequestOptions | Bu2MutationOptions | undefined,
    perform: (signal: AbortSignal) => Promise<OpenApiResult<T>>,
  ): Promise<T> {
    if (operation.mutation) {
      await this.preflightMutation(options, operation.requiresExecution !== false);
    }
    const activeSignal = timedSignal(
      options?.signal,
      timeoutValue(options?.timeoutMs, this.defaultTimeoutMs),
    );
    try {
      const result = await perform(activeSignal.signal);
      if (result.error !== undefined) throw apiError(result.response, result.error, operation);
      if (result.data === undefined) {
        throw new Bu2TransportError("BU2 returned a response without a documented JSON body.", {
          operation: operation.name,
          code: "invalid_response",
          recovery: operation.mutation ? "query_before_retry" : "retry_safe",
          status: result.response.status,
          requestId: result.response.headers.get("x-request-id"),
          traceId: result.response.headers.get("x-trace-id"),
        });
      }
      return result.data;
    } catch (error) {
      if (error instanceof Bu2SdkError) throw error;
      const timedOut = activeSignal.didTimeout();
      const aborted = options?.signal?.aborted === true;
      const code = timedOut
        ? "request_timed_out"
        : aborted
          ? "request_aborted"
          : error instanceof SyntaxError
            ? "invalid_response"
            : "network_error";
      throw new Bu2TransportError(
        timedOut
          ? "BU2 request timed out; the server may still have processed it."
          : aborted
            ? "BU2 request was aborted; the server may still have processed it."
            : "BU2 request failed before a valid response was received.",
        {
          operation: operation.name,
          code,
          recovery: operation.mutation ? "query_before_retry" : "retry_safe",
          traceId: options?.traceId ?? null,
          cause: error,
        },
      );
    } finally {
      activeSignal.cleanup();
    }
  }

  async getEnvironment(options: Bu2RequestOptions = {}): Promise<EnvironmentInfo> {
    const info = await this.execute(
      { name: "getEnvironment", mutation: false },
      options,
      (signal) =>
        this.api.GET("/environment", {
          params: { header: traceHeaders(options) },
          signal,
        }),
    );
    return this.validateEnvironment(info, false);
  }

  getAccessIdentity(options: Bu2RequestOptions = {}): Promise<AccessIdentity> {
    return this.execute({ name: "getAccessIdentity", mutation: false }, options, (signal) =>
      this.api.GET("/access", {
        params: { header: traceHeaders(options) },
        signal,
      }),
    );
  }

  listBudgets(options: Bu2RequestOptions = {}): Promise<{ data: Budget[] }> {
    return this.execute({ name: "listBudgets", mutation: false }, options, (signal) =>
      this.api.GET("/budgets", { params: { header: traceHeaders(options) }, signal }),
    );
  }

  createBudget(body: CreateBudget, options: Bu2MutationOptions): Promise<Budget> {
    return this.execute({ name: "createBudget", mutation: true }, options, (signal) =>
      this.api.POST("/budgets", {
        params: { header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  getBudget(budgetId: string, options: Bu2RequestOptions = {}): Promise<Budget> {
    return this.execute({ name: "getBudget", mutation: false }, options, (signal) =>
      this.api.GET("/budgets/{budget_id}", {
        params: { path: { budget_id: budgetId }, header: traceHeaders(options) },
        signal,
      }),
    );
  }

  listBudgetHolds(options: Bu2RequestOptions = {}): Promise<{ data: BudgetHold[] }> {
    return this.execute({ name: "listBudgetHolds", mutation: false }, options, (signal) =>
      this.api.GET("/budget_holds", { params: { header: traceHeaders(options) }, signal }),
    );
  }

  getBudgetHold(budgetHoldId: string, options: Bu2RequestOptions = {}): Promise<BudgetHold> {
    return this.execute({ name: "getBudgetHold", mutation: false }, options, (signal) =>
      this.api.GET("/budget_holds/{budget_hold_id}", {
        params: { path: { budget_hold_id: budgetHoldId }, header: traceHeaders(options) },
        signal,
      }),
    );
  }

  listFinancialPostings(options: Bu2RequestOptions = {}): Promise<{ data: FinancialPosting[] }> {
    return this.execute({ name: "listFinancialPostings", mutation: false }, options, (signal) =>
      this.api.GET("/financial_postings", { params: { header: traceHeaders(options) }, signal }),
    );
  }

  listPaymentMandates(options: Bu2RequestOptions = {}): Promise<{ data: PaymentMandate[] }> {
    return this.execute({ name: "listPaymentMandates", mutation: false }, options, (signal) =>
      this.api.GET("/payment_mandates", { params: { header: traceHeaders(options) }, signal }),
    );
  }

  createPaymentMandate(
    body: CreatePaymentMandate,
    options: Bu2MutationOptions,
  ): Promise<PaymentMandate> {
    return this.execute({ name: "createPaymentMandate", mutation: true }, options, (signal) =>
      this.api.POST("/payment_mandates", {
        params: { header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  listReceivables(options: Bu2RequestOptions = {}): Promise<{ data: Receivable[] }> {
    return this.execute({ name: "listReceivables", mutation: false }, options, (signal) =>
      this.api.GET("/receivables", { params: { header: traceHeaders(options) }, signal }),
    );
  }

  createReceivable(body: CreateReceivable, options: Bu2MutationOptions): Promise<Receivable> {
    return this.execute({ name: "createReceivable", mutation: true }, options, (signal) =>
      this.api.POST("/receivables", {
        params: { header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  getReceivable(receivableId: string, options: Bu2RequestOptions = {}): Promise<Receivable> {
    return this.execute({ name: "getReceivable", mutation: false }, options, (signal) =>
      this.api.GET("/receivables/{receivable_id}", {
        params: { path: { receivable_id: receivableId }, header: traceHeaders(options) },
        signal,
      }),
    );
  }

  getPaymentMandate(mandateId: string, options: Bu2RequestOptions = {}): Promise<PaymentMandate> {
    return this.execute({ name: "getPaymentMandate", mutation: false }, options, (signal) =>
      this.api.GET("/payment_mandates/{mandate_id}", {
        params: { path: { mandate_id: mandateId }, header: traceHeaders(options) },
        signal,
      }),
    );
  }

  transitionPaymentMandate(
    mandateId: string,
    action: "activate" | "suspend" | "revoke" | "expire",
    body: MandateTransition,
    options: Bu2MutationOptions,
  ): Promise<PaymentMandate> {
    return this.execute({ name: "transitionPaymentMandate", mutation: true }, options, (signal) =>
      this.api.POST("/payment_mandates/{mandate_id}/{action}", {
        params: { path: { mandate_id: mandateId, action }, header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  createQuote(body: CreateQuote, options: Bu2MutationOptions): Promise<Quote> {
    return this.execute({ name: "createQuote", mutation: true }, options, (signal) =>
      this.api.POST("/quotes", {
        params: { header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  createPaymentIntent(
    body: CreatePaymentIntent,
    options: Bu2MutationOptions,
  ): Promise<PaymentIntent> {
    return this.execute({ name: "createPaymentIntent", mutation: true }, options, (signal) =>
      this.api.POST("/payment_intents", {
        params: { header: mutationHeaders(options) },
        body,
        signal,
      }),
    );
  }

  getPaymentIntent(
    paymentIntentId: string,
    options: Bu2RequestOptions = {},
  ): Promise<PaymentIntent> {
    return this.execute({ name: "getPaymentIntent", mutation: false }, options, (signal) =>
      this.api.GET("/payment_intents/{payment_intent_id}", {
        params: {
          path: { payment_intent_id: paymentIntentId },
          header: traceHeaders(options),
        },
        signal,
      }),
    );
  }

  decideAuthorization(
    paymentIntentId: string,
    body: AuthorizationDecision,
    options: Bu2MutationOptions,
  ): Promise<PaymentIntent> {
    return this.execute({ name: "decideAuthorization", mutation: true }, options, (signal) =>
      this.api.POST("/payment_intents/{payment_intent_id}/authorization", {
        params: {
          path: { payment_intent_id: paymentIntentId },
          header: mutationHeaders(options),
        },
        body,
        signal,
      }),
    );
  }

  executePaymentIntent(
    paymentIntentId: string,
    options: Bu2MutationOptions,
  ): Promise<PaymentIntent> {
    return this.execute({ name: "executePaymentIntent", mutation: true }, options, (signal) =>
      this.api.POST("/payment_intents/{payment_intent_id}/execution", {
        params: {
          path: { payment_intent_id: paymentIntentId },
          header: mutationHeaders(options),
        },
        body: {},
        signal,
      }),
    );
  }

  listTransactions(
    query: TransactionListQuery = {},
    options: Bu2RequestOptions = {},
  ): Promise<TransactionPage> {
    return this.execute({ name: "listTransactions", mutation: false }, options, (signal) =>
      this.api.GET("/transactions", {
        params: { query, header: traceHeaders(options) },
        signal,
      }),
    );
  }

  getTransaction(transactionId: string, options: Bu2RequestOptions = {}): Promise<TransactionView> {
    return this.execute({ name: "getTransaction", mutation: false }, options, (signal) =>
      this.api.GET("/transactions/{transaction_id}", {
        params: {
          path: { transaction_id: transactionId },
          header: traceHeaders(options),
        },
        signal,
      }),
    );
  }

  submitDelivery(
    transactionId: string,
    body: DeliveryEvidence,
    options: Bu2MutationOptions,
  ): Promise<DeliveryResult> {
    return this.execute({ name: "submitDelivery", mutation: true }, options, (signal) =>
      this.api.POST("/transactions/{transaction_id}/deliveries", {
        params: {
          path: { transaction_id: transactionId },
          header: mutationHeaders(options),
        },
        body,
        signal,
      }),
    );
  }

  settleTransaction(transactionId: string, options: Bu2MutationOptions): Promise<SettlementResult> {
    return this.execute({ name: "settleTransaction", mutation: true }, options, (signal) =>
      this.api.POST("/transactions/{transaction_id}/settlements", {
        params: {
          path: { transaction_id: transactionId },
          header: mutationHeaders(options),
        },
        body: {},
        signal,
      }),
    );
  }

  recoverTransactionSettlement(
    transactionId: string,
    options: Bu2MutationOptions,
  ): Promise<SettlementRecoveryResult> {
    return this.execute(
      { name: "recoverTransactionSettlement", mutation: true, requiresExecution: false },
      options,
      (signal) =>
        this.api.POST("/transactions/{transaction_id}/settlement_recoveries", {
          params: {
            path: { transaction_id: transactionId },
            header: mutationHeaders(options),
          },
          body: {},
          signal,
        }),
    );
  }

  getReceipt(receiptId: string, options: Bu2RequestOptions = {}): Promise<Receipt> {
    return this.execute({ name: "getReceipt", mutation: false }, options, (signal) =>
      this.api.GET("/receipts/{receipt_id}", {
        params: {
          path: { receipt_id: receiptId },
          header: traceHeaders(options),
        },
        signal,
      }),
    );
  }

  verifyReceipt(receiptId: string, options: Bu2RequestOptions = {}): Promise<ReceiptVerification> {
    return this.execute({ name: "verifyReceipt", mutation: false }, options, (signal) =>
      this.api.GET("/receipts/{receipt_id}/verify", {
        params: {
          path: { receipt_id: receiptId },
          header: traceHeaders(options),
        },
        signal,
      }),
    );
  }
}
