import createClient from "openapi-fetch";
import type { paths } from "./generated/openapi.js";
import {
  Bu2ApiError,
  Bu2ConfigurationError,
  Bu2SdkError,
  Bu2TransportError,
  type Bu2RecoveryAction,
} from "./errors.js";
import type {
  AuthorizationDecision,
  Bu2ClientOptions,
  Bu2MutationOptions,
  Bu2RequestOptions,
  CreatePaymentIntent,
  CreateQuote,
  DeliveryEvidence,
  DeliveryResult,
  PaymentIntent,
  Quote,
  Receipt,
  ReceiptVerification,
  SettlementRecoveryResult,
  SettlementResult,
  TransactionListQuery,
  TransactionPage,
  TransactionView,
} from "./types.js";

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

type Operation = {
  name: string;
  mutation: boolean;
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
  readonly defaultTimeoutMs: number;
  private readonly api: ReturnType<typeof createClient<paths>>;

  constructor(options: Bu2ClientOptions) {
    if (!options || !["simulation", "testnet"].includes(options.environment)) {
      throw new Bu2ConfigurationError("environment must be simulation or testnet.");
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.environment = options.environment;
    this.defaultTimeoutMs = timeoutValue(options.defaultTimeoutMs, 30_000);
    this.api = createClient<paths>({
      baseUrl: this.baseUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  private async execute<T>(
    operation: Operation,
    options: Bu2RequestOptions | Bu2MutationOptions | undefined,
    perform: (signal: AbortSignal) => Promise<OpenApiResult<T>>,
  ): Promise<T> {
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
      { name: "recoverTransactionSettlement", mutation: true },
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
