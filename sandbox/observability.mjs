import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const TRACE_ID_PATTERN = /^trc_[A-Za-z0-9_-]{8,251}$/;
const CATEGORIES = new Set([
  "request",
  "validation",
  "policy",
  "state",
  "adapter",
  "unknown_result",
  "webhook",
  "internal",
]);
const SENSITIVE_FIELD =
  /(^|_)(authorization|cookie|credential|mnemonic|private_?key|secret|signature|token)($|_)/i;
const SENSITIVE_VALUE =
  /(0x[a-fA-F0-9]{64}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[^\s,;]+)/g;

export const createTraceId = () =>
  `trc_${randomUUID().replaceAll("-", "").slice(0, 24)}`;

export function isTraceId(value) {
  return typeof value === "string" && TRACE_ID_PATTERN.test(value);
}

function sanitize(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return value.replaceAll(SENSITIVE_VALUE, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_FIELD.test(key)) {
      safe[key] = "[REDACTED]";
    } else {
      safe[key] = sanitize(item, seen);
    }
  }
  seen.delete(value);
  return safe;
}

export function classifyOperationalError(error) {
  if (error?.type === "validation_error") return "validation";
  if (error?.type === "mandate_denied") return "policy";
  if (
    error?.type === "provider_unknown" ||
    error?.code?.includes("unknown")
  ) {
    return "unknown_result";
  }
  if (
    error?.type?.startsWith("provider_") ||
    error?.type === "adapter_error"
  ) {
    return "adapter";
  }
  if (error?.status && error.status < 500) return "state";
  return "internal";
}

export class Observability {
  constructor({ sink = null, now = Date.now, maxRecords = 1000 } = {}) {
    this.storage = new AsyncLocalStorage();
    this.sink = sink;
    this.now = now;
    this.maxRecords = maxRecords;
    this.records = [];
    this.sinkFailures = 0;
  }

  run(context, operation) {
    return this.storage.run(Object.freeze({ ...context }), operation);
  }

  context(extra = {}) {
    return Object.fromEntries(
      Object.entries({ ...(this.storage.getStore() ?? {}), ...extra }).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    );
  }

  record(category, event, fields = {}) {
    if (!CATEGORIES.has(category)) {
      throw new Error(`Unsupported observability category: ${category}`);
    }
    const record = sanitize({
      timestamp: new Date(this.now()).toISOString(),
      category,
      event,
      ...this.context(fields),
    });
    this.records.push(record);
    if (this.records.length > this.maxRecords) this.records.shift();
    try {
      this.sink?.(JSON.stringify(record));
    } catch {
      this.sinkFailures += 1;
    }
    return record;
  }
}
