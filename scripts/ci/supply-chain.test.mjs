import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  blockingAuditIssues,
  evaluateAuditIssues,
  runSupplyChain,
  validateLockedWorkspace,
} from "./supply-chain.mjs";

const manifest = {
  name: "fixture",
  version: "1.0.0",
  dependencies: { alpha: "1.2.3" },
  devDependencies: { beta: "2.0.0-beta.1" },
};
const lockfile = {
  lockfileVersion: 3,
  packages: {
    "": {
      name: "fixture",
      version: "1.0.0",
      dependencies: { alpha: "1.2.3" },
      devDependencies: { beta: "2.0.0-beta.1" },
    },
    "node_modules/alpha": {
      version: "1.2.3",
      resolved: "https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz",
      integrity: "sha512-fixture",
    },
    "node_modules/beta": {
      version: "2.0.0-beta.1",
      resolved: "https://registry.npmjs.org/beta/-/beta-2.0.0-beta.1.tgz",
      integrity: "sha512-fixture",
    },
  },
};

const audit = {
  auditReportVersion: 2,
  vulnerabilities: {
    alpha: {
      severity: "high",
      range: "<1.2.4",
      via: [
        {
          source: 1234,
          dependency: "alpha",
          severity: "high",
          range: "<1.2.4",
          url: "https://github.com/advisories/GHSA-fixture",
        },
      ],
    },
  },
};

test("CI-04 accepts exact direct dependencies with matching lockfile integrity", () => {
  assert.deepEqual(validateLockedWorkspace({ workspace: "fixture", manifest, lockfile }), {
    workspace: "fixture",
    lockfile_version: 3,
    direct_dependencies: 2,
    resolved_packages: 2,
  });
  assert.throws(
    () =>
      validateLockedWorkspace({
        workspace: "fixture",
        manifest: { ...manifest, dependencies: { alpha: "^1.2.3" } },
        lockfile,
      }),
    /exact version/,
  );
  assert.throws(
    () =>
      validateLockedWorkspace({
        workspace: "fixture",
        manifest: { ...manifest, overrides: { alpha: "1.x" } },
        lockfile,
      }),
    /overrides\.alpha must use an exact version/,
  );
});

test("CI-04 blocks new high advisories and permits only exact active exceptions", () => {
  const issues = blockingAuditIssues({ workspace: "fixture", audit, lockfile });
  assert.deepEqual(
    issues.map((issue) => issue.advisory_id),
    ["1234"],
  );
  assert.equal(
    evaluateAuditIssues({
      issues,
      policy: { schema_version: "ci04.supply-chain-exceptions.v1", exceptions: [] },
      now: new Date("2026-09-10T00:00:00Z"),
    }).blocked.length,
    1,
  );
  const exception = {
    workspace: "fixture",
    package: "alpha",
    advisory_id: "1234",
    installed_versions: ["1.2.3"],
    owner: "BU2 Engineering",
    rationale: "Upgrade is tracked in the next bounded dependency review.",
    expires_on: "2026-09-20",
  };
  const accepted = evaluateAuditIssues({
    issues,
    policy: { schema_version: "ci04.supply-chain-exceptions.v1", exceptions: [exception] },
    now: new Date("2026-09-10T00:00:00Z"),
  });
  assert.equal(accepted.blocked.length, 0);
  assert.equal(accepted.excepted.length, 1);
});

test("CI-04 rejects expired, version-drifted and unused exceptions", () => {
  const issues = blockingAuditIssues({ workspace: "fixture", audit, lockfile });
  const base = {
    workspace: "fixture",
    package: "alpha",
    advisory_id: "1234",
    installed_versions: ["1.2.3"],
    owner: "BU2 Engineering",
    rationale: "Upgrade is tracked in the next bounded dependency review.",
    expires_on: "2026-09-20",
  };
  assert.throws(
    () =>
      evaluateAuditIssues({
        issues,
        policy: {
          schema_version: "ci04.supply-chain-exceptions.v1",
          exceptions: [{ ...base, expires_on: "2026-09-09" }],
        },
        now: new Date("2026-09-10T00:00:00Z"),
      }),
    /expired/,
  );
  assert.throws(
    () =>
      evaluateAuditIssues({
        issues,
        policy: {
          schema_version: "ci04.supply-chain-exceptions.v1",
          exceptions: [{ ...base, installed_versions: ["1.2.2"] }],
        },
        now: new Date("2026-09-10T00:00:00Z"),
      }),
    /Unused/,
  );
  assert.throws(
    () =>
      evaluateAuditIssues({
        issues: [],
        policy: { schema_version: "ci04.supply-chain-exceptions.v1", exceptions: [base] },
        now: new Date("2026-09-10T00:00:00Z"),
      }),
    /Unused/,
  );
});

test("CI-04 preserves evidence when a workspace manifest or lockfile is unreadable", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci04-supply-failure-"));
  const policyPath = join(directory, "exceptions.json");
  try {
    writeFileSync(
      policyPath,
      `${JSON.stringify({ schema_version: "ci04.supply-chain-exceptions.v1", exceptions: [] })}\n`,
    );
    const evidence = runSupplyChain({
      cwd: directory,
      outputDirectory: join(directory, "logs"),
      policyPath,
      spawn: () => {
        throw new Error("npm audit must not run without a validated lockfile");
      },
    });
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.workspaces.length, 3);
    assert.ok(evidence.workspaces.every((entry) => entry.lock.status === "failed"));
    assert.match(evidence.summary.error, /package\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CI-04 uses the installed dependency tree and the npm bulk advisory path", () => {
  const directory = mkdtempSync(join(tmpdir(), "bu2-ci04-supply-audit-"));
  const policyPath = join(directory, "exceptions.json");
  const calls = [];
  try {
    writeFileSync(
      policyPath,
      `${JSON.stringify({ schema_version: "ci04.supply-chain-exceptions.v1", exceptions: [] })}\n`,
    );
    for (const workspace of ["sandbox", "packages/typescript-sdk", "prototype"]) {
      const workspaceDirectory = join(directory, workspace);
      mkdirSync(workspaceDirectory, { recursive: true });
      writeFileSync(join(workspaceDirectory, "package.json"), `${JSON.stringify(manifest)}\n`);
      writeFileSync(join(workspaceDirectory, "package-lock.json"), `${JSON.stringify(lockfile)}\n`);
    }
    const evidence = runSupplyChain({
      cwd: directory,
      outputDirectory: join(directory, "logs"),
      policyPath,
      spawn: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return {
          status: 0,
          stdout: JSON.stringify({
            auditReportVersion: 2,
            vulnerabilities: {},
            metadata: {
              vulnerabilities: {
                info: 0,
                low: 0,
                moderate: 0,
                high: 0,
                critical: 0,
                total: 0,
              },
            },
          }),
          stderr: "",
        };
      },
    });
    assert.equal(evidence.status, "passed");
    assert.equal(calls.length, 3);
    assert.ok(calls.every(({ command }) => command === "npm"));
    assert.ok(calls.every(({ args }) => JSON.stringify(args) === JSON.stringify(["audit", "--json"])));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
