export class Bu2HttpError extends Error {
  constructor(status, payload) {
    const detail = payload?.error ?? payload;
    super(`${status} ${detail?.code ?? "http_error"}: ${detail?.message ?? "BU2 request failed"}`);
    this.name = "Bu2HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export async function bu2Request(
  baseUrl,
  path,
  { method = "GET", body, idempotencyKey, traceId } = {},
) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(traceId ? { "x-trace-id": traceId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Bu2HttpError(response.status, payload);
  return payload;
}
