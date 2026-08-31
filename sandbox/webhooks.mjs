import { createHmac } from "node:crypto";

export class WebhookDispatcher {
  constructor({ ledger, fetchImpl = fetch, baseDelayMs = 1000 }) {
    this.ledger = ledger;
    this.fetchImpl = fetchImpl;
    this.baseDelayMs = baseDelayMs;
  }

  async flush({ force = false } = {}) {
    const results = [];
    for (const job of this.ledger.listDueOutbox({ force })) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", job.secret)
        .update(`${timestamp}.${job.payload}`)
        .digest("hex");
      try {
        const response = await this.fetchImpl(job.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "webhook-id": job.event_id,
            "webhook-timestamp": timestamp,
            "webhook-signature": `v1=${signature}`,
          },
          body: job.payload,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.ledger.markDelivered(job.id);
        results.push({ id: job.id, status: "delivered" });
      } catch (error) {
        const delay = this.baseDelayMs * 2 ** Math.min(job.attempts, 8);
        this.ledger.markWebhookFailed(job.id, error.message, delay);
        results.push({ id: job.id, status: "retrying", error: error.message });
      }
    }
    return results;
  }
}
