export type Bu2RecoveryAction = "retry_safe" | "query_before_retry" | "fix_request" | "stop";

export interface Bu2ErrorOptions {
  code: string;
  recovery: Bu2RecoveryAction;
  status?: number | null;
  requestId?: string | null;
  traceId?: string | null;
  cause?: unknown;
}

export class Bu2SdkError extends Error {
  readonly code: string;
  readonly recovery: Bu2RecoveryAction;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly traceId: string | null;

  constructor(message: string, options: Bu2ErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "Bu2SdkError";
    this.code = options.code;
    this.recovery = options.recovery;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.traceId = options.traceId ?? null;
  }
}

export interface Bu2ApiErrorOptions extends Bu2ErrorOptions {
  type: string;
  details: Record<string, unknown>;
}

export class Bu2ApiError extends Bu2SdkError {
  readonly type: string;
  readonly details: Record<string, unknown>;

  constructor(message: string, options: Bu2ApiErrorOptions) {
    super(message, options);
    this.name = "Bu2ApiError";
    this.type = options.type;
    this.details = options.details;
  }
}

export interface Bu2TransportErrorOptions extends Bu2ErrorOptions {
  operation: string;
}

export class Bu2TransportError extends Bu2SdkError {
  readonly operation: string;

  constructor(message: string, options: Bu2TransportErrorOptions) {
    super(message, options);
    this.name = "Bu2TransportError";
    this.operation = options.operation;
  }
}

export class Bu2ConfigurationError extends Bu2SdkError {
  constructor(message: string) {
    super(message, { code: "invalid_sdk_configuration", recovery: "fix_request" });
    this.name = "Bu2ConfigurationError";
  }
}
