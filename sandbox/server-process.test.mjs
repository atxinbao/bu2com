import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("container entrypoint closes HTTP and SQLite cleanly on SIGTERM", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-server-signal-"));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      BU2_SANDBOX_PORT: "0",
      BU2_SANDBOX_DB: join(directory, "bu2.sqlite"),
      BU2_ENVIRONMENT: "local",
      BU2_PAYMENT_ADAPTER: "simulated",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server did not start in time.")), 10_000);
      const inspect = (chunk) => {
        if (!String(chunk).includes("listening on")) return;
        clearTimeout(timeout);
        child.stdout.off("data", inspect);
        resolve();
      };
      child.stdout.on("data", inspect);
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code !== null) reject(new Error(`Server exited before startup with ${code}.`));
      });
    });
    child.kill("SIGTERM");
    const result = await new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(result, { code: 0, signal: null });
    assert.match(output, /"event":"shutdown\.started"/);
    assert.match(output, /"event":"shutdown\.completed"/);
    assert.doesNotMatch(output, /SQLITE_BUSY|SQLITE_IOERR/);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
  }
});
