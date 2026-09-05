import Ajv from "ajv";
import addFormats from "ajv-formats";
import { ApiError } from "./domain.mjs";

const identifier = (prefix) => ({
  type: "string",
  pattern: `^${prefix}_[A-Za-z0-9_-]+$`,
  maxLength: 255,
});
const amount = {
  type: "object",
  additionalProperties: false,
  required: ["value", "currency"],
  properties: {
    value: { type: "integer", minimum: 0 },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
  },
};

const schemas = {
  createQuote: {
    type: "object",
    additionalProperties: false,
    required: ["seller_agent_id", "payee_account_id", "item", "amount", "expires_at"],
    properties: {
      seller_agent_id: identifier("agt"),
      payee_account_id: identifier("acct"),
      item: {
        type: "object",
        additionalProperties: false,
        required: ["name", "delivery_type"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          delivery_type: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
      amount,
      expires_at: { type: "string", format: "date-time" },
    },
  },
  createPaymentIntent: {
    type: "object",
    additionalProperties: false,
    required: [
      "quote_id",
      "payer_account_id",
      "buyer_agent_id",
      "payment_mandate_id",
      "amount",
      "purpose",
    ],
    properties: {
      quote_id: identifier("quo"),
      payer_account_id: identifier("acct"),
      buyer_agent_id: identifier("agt"),
      payment_mandate_id: identifier("mdt"),
      amount,
      purpose: { type: "string", minLength: 1, maxLength: 500 },
      external_context: {
        type: "object",
        additionalProperties: false,
        required: ["type", "id"],
        properties: {
          type: {
            type: "string",
            enum: ["chatgpt_conversation", "codex_task", "agent_run", "automation", "other"],
          },
          id: { type: "string", minLength: 1, maxLength: 255 },
        },
      },
      metadata: {
        type: "object",
        maxProperties: 20,
        additionalProperties: { type: "string", maxLength: 500 },
      },
    },
  },
  authorizationDecision: {
    type: "object",
    additionalProperties: false,
    required: ["decision"],
    properties: {
      decision: { type: "string", enum: ["authorize", "decline"] },
      reason: { type: "string", maxLength: 500 },
    },
  },
  deliveryEvidence: {
    type: "object",
    additionalProperties: false,
    required: ["type", "evidence_hash"],
    properties: {
      type: { type: "string", minLength: 1, maxLength: 100 },
      evidence_hash: { type: "string", pattern: "^sha256:[A-Za-z0-9]+$", maxLength: 256 },
      summary: { type: "string", maxLength: 1000 },
    },
  },
  settlement: { type: "object", additionalProperties: false },
  webhookSubscription: {
    type: "object",
    additionalProperties: false,
    required: ["id", "url", "secret"],
    properties: {
      id: identifier("whsub"),
      url: { type: "string", format: "uri", pattern: "^https?://", maxLength: 2048 },
      secret: { type: "string", minLength: 16, maxLength: 512 },
    },
  },
};

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]),
);

export function validateBody(schemaName, body) {
  const validate = validators[schemaName];
  if (!validate) throw new Error(`Unknown request schema: ${schemaName}`);
  if (validate(body)) return body;
  throw new ApiError(
    400,
    "validation_error",
    "invalid_request_body",
    "Request body does not match the frozen v1 schema.",
    {
      fields: validate.errors.map((error) => ({
        path: error.instancePath || "/",
        rule: error.keyword,
      })),
    },
  );
}

export function validateIdempotencyKey(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 255) {
    throw new ApiError(
      400,
      "validation_error",
      "missing_idempotency_key",
      "Idempotency-Key must contain between 8 and 255 characters.",
    );
  }
  return value;
}

export function validateResourceId(value, prefix, field) {
  if (
    typeof value !== "string" ||
    !new RegExp(`^${prefix}_[A-Za-z0-9_-]+$`).test(value) ||
    value.length > 255
  ) {
    throw new ApiError(400, "validation_error", "invalid_resource_id", `Invalid ${field}.`, {
      field,
    });
  }
  return value;
}

export function validateNoQueryParameters(searchParams) {
  const fields = [...new Set(searchParams.keys())];
  if (fields.length === 0) return;
  throw new ApiError(
    400,
    "validation_error",
    "invalid_query_parameters",
    "This endpoint does not accept query parameters.",
    { fields },
  );
}

function decodeCursor(cursor) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !value ||
      typeof value.created_at !== "string" ||
      typeof value.id !== "string" ||
      !/^txn_[A-Za-z0-9_-]+$/.test(value.id)
    ) {
      throw new Error("invalid cursor shape");
    }
    return value;
  } catch {
    throw new ApiError(
      400,
      "validation_error",
      "invalid_cursor",
      "Cursor must be an opaque value returned by the previous page.",
    );
  }
}

function encodeCursor(view) {
  return Buffer.from(
    JSON.stringify({
      created_at: view.transaction.created_at,
      id: view.transaction.id,
    }),
  ).toString("base64url");
}

export function paginateTransactions(views, searchParams) {
  const unknown = [...searchParams.keys()].filter((key) => !["limit", "cursor"].includes(key));
  if (unknown.length > 0 || searchParams.getAll("limit").length > 1 || searchParams.getAll("cursor").length > 1) {
    throw new ApiError(
      400,
      "validation_error",
      "invalid_query_parameters",
      "Only one limit and one cursor query parameter are allowed.",
      { fields: unknown },
    );
  }

  const rawLimit = searchParams.get("limit") ?? "20";
  if (!/^[1-9][0-9]*$/.test(rawLimit)) {
    throw new ApiError(400, "validation_error", "invalid_limit", "Limit must be an integer from 1 to 100.");
  }
  const limit = Number(rawLimit);
  if (limit > 100) {
    throw new ApiError(400, "validation_error", "invalid_limit", "Limit must be an integer from 1 to 100.");
  }

  let start = 0;
  const rawCursor = searchParams.get("cursor");
  if (rawCursor) {
    if (rawCursor.length > 1024) {
      throw new ApiError(400, "validation_error", "invalid_cursor", "Cursor is too long.");
    }
    const cursor = decodeCursor(rawCursor);
    const index = views.findIndex(
      (view) =>
        view.transaction.id === cursor.id && view.transaction.created_at === cursor.created_at,
    );
    if (index === -1) {
      throw new ApiError(
        400,
        "validation_error",
        "invalid_cursor",
        "Cursor does not reference an available transaction.",
      );
    }
    start = index + 1;
  }

  const data = views.slice(start, start + limit);
  const hasMore = start + data.length < views.length;
  return {
    data,
    page: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore && data.length > 0 ? encodeCursor(data.at(-1)) : null,
    },
  };
}
