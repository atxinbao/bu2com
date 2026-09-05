import { createHmac, randomUUID } from "node:crypto";

export class WebhookDispatcher {
  constructor({
    ledger,
    observer = null,
    fetchImpl = fetch,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    maxAttempts = 5,
    leaseMs = 30_000,
    requestTimeoutMs = 10_000,
    jitterRatio = 0.2,
    random = Math.random,
    now = Date.now,
    workerId = `whw_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
  }) {
    this.ledger = ledger;
    this.observer = observer;
    this.fetchImpl = fetchImpl;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.maxAttempts = maxAttempts;
    this.leaseMs = leaseMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.jitterRatio = jitterRatio;
    this.random = random;
    this.now = now;
    this.workerId = workerId;
  }

  retryDelay(attempts) {
    const exponential = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** Math.min(attempts, 16),
    );
    const jitter = Math.floor(exponential * this.jitterRatio * this.random());
    return Math.min(this.maxDelayMs, exponential + jitter);
  }

  async flush({ force = false } = {}) {
    const results = [];
    const jobs = this.ledger.claimWebhookDeliveries({
      force,
      workerId: this.workerId,
      leaseMs: this.leaseMs,
      now: this.now(),
    });
    for (const job of jobs) {
      const startedAt = this.now();
      const timestamp = Math.floor(startedAt / 1000).toString();
      const versions = job.secrets.map((secret) => secret.version);
      const correlation = this.observer?.context({
        event_id: job.event_id,
        transaction_id: job.transaction_id,
      }) ?? { transaction_id: job.transaction_id };
      let httpStatus = null;
      try {
        if (job.secrets.length === 0) {
          throw new Error("No active Webhook secret version is available.");
        }
        const signatures = job.secrets.map((secret) => {
          const signature = createHmac("sha256", secret.secret)
            .update(`${timestamp}.${job.payload}`)
            .digest("hex");
          return `${secret.version}=${signature}`;
        });
        const response = await this.fetchImpl(job.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "webhook-id": job.event_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": signatures.join(","),
            "webhook-secret-versions": versions.join(","),
            ...(job.trace_id ? { "webhook-trace-id": job.trace_id } : {}),
          },
          body: job.payload,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        httpStatus = response.status;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        results.push(
          this.ledger.completeWebhookDelivery({
            outboxId: job.id,
            workerId: this.workerId,
            succeeded: true,
            httpStatus,
            maxAttempts: this.maxAttempts,
            secretVersions: versions,
            startedAt,
            correlation,
            now: this.now(),
          }),
        );
        this.observer?.record("webhook", "webhook.delivery.completed", {
          outbox_id: job.id,
          event_id: job.event_id,
          transaction_id: job.transaction_id,
          source_request_id: job.request_id,
          source_trace_id: job.trace_id,
          http_status: httpStatus,
          status: "delivered",
        });
      } catch (error) {
        const result = this.ledger.completeWebhookDelivery({
          outboxId: job.id,
          workerId: this.workerId,
          succeeded: false,
          httpStatus,
          error: error.message,
          delayMs: this.retryDelay(job.attempts),
          maxAttempts: this.maxAttempts,
          secretVersions: versions,
          startedAt,
          correlation,
          now: this.now(),
        });
        results.push({ ...result, error: error.message });
        this.observer?.record("webhook", "webhook.delivery.failed", {
          outbox_id: job.id,
          event_id: job.event_id,
          transaction_id: job.transaction_id,
          source_request_id: job.request_id,
          source_trace_id: job.trace_id,
          http_status: httpStatus,
          status: result.status,
          error: error.message,
        });
      }
    }
    return results;
  }
}
