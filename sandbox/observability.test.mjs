import assert from "node:assert/strict";
import test from "node:test";
import {
  Observability,
  classifyOperationalError,
  createTraceId,
  isTraceId,
} from "./observability.mjs";

test("structured observations preserve concurrent contexts and redact sensitive values", async () => {
  const lines = [];
  const observer = new Observability({ sink: (line) => lines.push(line), now: () => 1000 });
  const first = observer.run(
    { request_id: "req_first", trace_id: "trc_first000" },
    async () => {
      await Promise.resolve();
      return observer.record("state", "transaction.updated", {
        transaction_id: "txn_first",
        secret: "must-not-appear",
        error: "Bearer credential-value",
      });
    },
  );
  const second = observer.run(
    { request_id: "req_second", trace_id: "trc_second00" },
    async () => {
      await Promise.resolve();
      return observer.record("adapter", "adapter.completed", {
        transaction_id: "txn_second",
        private_key: `0x${"a".repeat(64)}`,
      });
    },
  );
  const [firstRecord, secondRecord] = await Promise.all([first, second]);

  assert.equal(firstRecord.request_id, "req_first");
  assert.equal(firstRecord.transaction_id, "txn_first");
  assert.equal(secondRecord.request_id, "req_second");
  assert.equal(secondRecord.transaction_id, "txn_second");
  assert.equal(firstRecord.secret, "[REDACTED]");
  assert.equal(firstRecord.error, "[REDACTED]");
  assert.equal(secondRecord.private_key, "[REDACTED]");
  assert.equal(lines.join("\n").includes("must-not-appear"), false);
  assert.equal(lines.join("\n").includes("credential-value"), false);
});

test("observation sink failures never change transaction execution", () => {
  const observer = new Observability({
    sink: () => {
      throw new Error("log transport unavailable");
    },
  });
  const record = observer.record("state", "transaction.updated", {
    transaction_id: "txn_sink_failure",
  });
  assert.equal(record.transaction_id, "txn_sink_failure");
  assert.equal(observer.sinkFailures, 1);
});

test("trace identifiers and operational error categories are deterministic", () => {
  assert.equal(isTraceId(createTraceId()), true);
  assert.equal(isTraceId("not-a-trace"), false);
  assert.equal(classifyOperationalError({ type: "validation_error" }), "validation");
  assert.equal(classifyOperationalError({ type: "mandate_denied" }), "policy");
  assert.equal(
    classifyOperationalError({ type: "provider_unknown" }),
    "unknown_result",
  );
  assert.equal(classifyOperationalError({ type: "provider_error" }), "adapter");
  assert.equal(classifyOperationalError({ status: 409 }), "state");
  assert.equal(classifyOperationalError(new Error("boom")), "internal");
  const observer = new Observability();
  observer.record(
    classifyOperationalError({ type: "provider_unknown" }),
    "adapter.operation.failed",
  );
  assert.equal(observer.records[0].category, "unknown_result");
});
