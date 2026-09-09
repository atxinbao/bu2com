import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

export const WORKSPACES = Object.freeze(["sandbox", "packages/typescript-sdk", "prototype"]);

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const gitValue = (cwd, args, fallback) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

const installedVersions = (lockfile, packageName) =>
  [
    ...new Set(
      Object.entries(lockfile.packages ?? {})
        .filter(
          ([path, value]) =>
            value?.version &&
            (path === `node_modules/${packageName}` ||
              path.endsWith(`/node_modules/${packageName}`)),
        )
        .map(([, value]) => value.version),
    ),
  ].sort();

export function validateLockedWorkspace({ workspace, manifest, lockfile }) {
  if (lockfile?.lockfileVersion !== 3 || !lockfile.packages?.[""]) {
    throw new Error(
      `${workspace}: package-lock.json must use lockfileVersion 3 with a root package`,
    );
  }
  const rootPackage = lockfile.packages[""];
  if (rootPackage.name !== manifest.name || rootPackage.version !== manifest.version) {
    throw new Error(`${workspace}: package.json and package-lock.json root identity differ`);
  }
  const sections = ["dependencies", "devDependencies", "optionalDependencies"];
  let directDependencyCount = 0;
  for (const section of sections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      directDependencyCount += 1;
      if (!EXACT_VERSION.test(version)) {
        throw new Error(
          `${workspace}: ${section}.${name} must use an exact version, received ${version}`,
        );
      }
      if (rootPackage[section]?.[name] !== version) {
        throw new Error(`${workspace}: lockfile root does not match ${section}.${name}@${version}`);
      }
      if (installedVersions(lockfile, name).length === 0) {
        throw new Error(`${workspace}: lockfile does not resolve direct dependency ${name}`);
      }
    }
  }
  for (const [name, version] of Object.entries(manifest.overrides ?? {})) {
    if (typeof version !== "string" || !EXACT_VERSION.test(version)) {
      throw new Error(`${workspace}: overrides.${name} must use an exact version`);
    }
    const versions = installedVersions(lockfile, name);
    if (versions.length === 0 || versions.some((resolved) => resolved !== version)) {
      throw new Error(`${workspace}: override ${name}@${version} does not match the lockfile`);
    }
  }
  for (const [path, value] of Object.entries(lockfile.packages)) {
    if (path === "" || value.link === true || !value.resolved) continue;
    if (!value.integrity?.startsWith("sha512-")) {
      throw new Error(`${workspace}: ${path} is missing sha512 integrity`);
    }
  }
  return {
    workspace,
    lockfile_version: lockfile.lockfileVersion,
    direct_dependencies: directDependencyCount,
    resolved_packages: Object.keys(lockfile.packages).length - 1,
  };
}

const advisoryId = (via) => String(via.source ?? via.url?.split("/").pop() ?? "unknown");

export function blockingAuditIssues({ workspace, audit, lockfile }) {
  if (audit?.auditReportVersion !== 2 || typeof audit.vulnerabilities !== "object") {
    throw new Error(`${workspace}: npm audit did not return a v2 report`);
  }
  const issues = [];
  for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities)) {
    const advisories = (vulnerability.via ?? []).filter((via) => typeof via === "object");
    if (advisories.length === 0 && BLOCKING_SEVERITIES.has(vulnerability.severity)) {
      issues.push({
        workspace,
        package: packageName,
        advisory_id: `npm:${packageName}:${vulnerability.range}`,
        severity: vulnerability.severity,
        installed_versions: installedVersions(lockfile, packageName),
        affected_range: vulnerability.range,
        url: null,
      });
      continue;
    }
    for (const advisory of advisories) {
      if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;
      issues.push({
        workspace,
        package: advisory.dependency ?? advisory.name ?? packageName,
        advisory_id: advisoryId(advisory),
        severity: advisory.severity,
        installed_versions: installedVersions(
          lockfile,
          advisory.dependency ?? advisory.name ?? packageName,
        ),
        affected_range: advisory.range,
        url: advisory.url ?? null,
      });
    }
  }
  return issues.sort((left, right) =>
    `${left.workspace}:${left.package}:${left.advisory_id}`.localeCompare(
      `${right.workspace}:${right.package}:${right.advisory_id}`,
    ),
  );
}

const validateException = (entry) => {
  if (
    typeof entry?.workspace !== "string" ||
    typeof entry?.package !== "string" ||
    typeof entry?.advisory_id !== "string" ||
    typeof entry?.owner !== "string" ||
    entry.owner.trim().length < 2 ||
    typeof entry?.rationale !== "string" ||
    entry.rationale.trim().length < 10 ||
    !DATE.test(entry?.expires_on ?? "") ||
    !Array.isArray(entry?.installed_versions) ||
    entry.installed_versions.length === 0 ||
    entry.installed_versions.some((version) => !EXACT_VERSION.test(version))
  ) {
    throw new Error(
      "Supply-chain exceptions require workspace, package, advisory_id, owner, rationale, exact installed_versions and expires_on",
    );
  }
};

export function evaluateAuditIssues({ issues, policy, now = new Date() }) {
  if (
    policy?.schema_version !== "ci04.supply-chain-exceptions.v1" ||
    !Array.isArray(policy.exceptions)
  ) {
    throw new Error("Supply-chain exception policy schema is invalid");
  }
  const date = now.toISOString().slice(0, 10);
  const used = new Set();
  for (const entry of policy.exceptions) {
    validateException(entry);
    if (entry.expires_on < date) {
      throw new Error(
        `Supply-chain exception expired: ${entry.workspace}/${entry.package}/${entry.advisory_id}`,
      );
    }
  }
  const blocked = [];
  const excepted = [];
  for (const issue of issues) {
    const index = policy.exceptions.findIndex(
      (entry) =>
        entry.workspace === issue.workspace &&
        entry.package === issue.package &&
        entry.advisory_id === issue.advisory_id &&
        issue.installed_versions.length > 0 &&
        issue.installed_versions.every((version) => entry.installed_versions.includes(version)),
    );
    if (index === -1) blocked.push(issue);
    else {
      used.add(index);
      excepted.push({ ...issue, exception: policy.exceptions[index] });
    }
  }
  const unused = policy.exceptions.filter((_, index) => !used.has(index));
  if (unused.length > 0) {
    throw new Error(
      `Unused supply-chain exceptions must be removed: ${unused
        .map((entry) => `${entry.workspace}/${entry.package}/${entry.advisory_id}`)
        .join(", ")}`,
    );
  }
  return { blocked, excepted };
}

export function validateSupplyChainEvidence(evidence) {
  return (
    evidence?.schema_version === "ci04.supply-chain.v1" &&
    evidence?.status === "passed" &&
    evidence?.source?.commit?.match(/^[0-9a-f]{40}$/) &&
    evidence?.source?.tree?.match(/^[0-9a-f]{40}$/) &&
    JSON.stringify(evidence.workspaces?.map((entry) => entry.workspace)) ===
      JSON.stringify(WORKSPACES) &&
    evidence.workspaces.every(
      (entry) =>
        entry.lock?.lockfile_version === 3 &&
        entry.audit?.report_version === 2 &&
        /^[0-9a-f]{64}$/.test(entry.audit?.sha256 ?? ""),
    ) &&
    evidence.summary?.blocked === 0 &&
    evidence.boundary?.automatic_fix === false &&
    evidence.boundary?.release_authorized === false &&
    evidence.boundary?.payment_execution_attempted === false &&
    evidence.boundary?.live_enabled === false
  );
}

export function runSupplyChain({
  cwd = root,
  outputDirectory = join(root, "supply-chain-logs"),
  policyPath = join(root, "scripts/ci/supply-chain-exceptions.json"),
  env = process.env,
  spawn = spawnSync,
  now = new Date(),
} = {}) {
  mkdirSync(outputDirectory, { recursive: true });
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const workspaceEvidence = [];
  const issues = [];
  let executionError = null;

  for (const workspace of WORKSPACES) {
    const directory = join(cwd, workspace);
    const lockPath = join(directory, "package-lock.json");
    const slug = workspace.replaceAll("/", "-");
    const auditPath = join(outputDirectory, `${slug}.audit.json`);
    const stderrPath = join(outputDirectory, `${slug}.audit.stderr.log`);
    let lockfile;
    let lock;
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      lockfile = JSON.parse(readFileSync(lockPath, "utf8"));
      lock = { status: "passed", ...validateLockedWorkspace({ workspace, manifest, lockfile }) };
    } catch (error) {
      executionError ??= error;
      lock = { status: "failed", error: error.message };
      writeFileSync(auditPath, "");
      writeFileSync(stderrPath, `${error.message}\n`);
      workspaceEvidence.push({
        workspace,
        lock,
        audit: {
          command: "npm audit --json",
          process_exit_code: null,
          report_version: null,
          vulnerability_counts: null,
          path: relative(cwd, auditPath),
          sha256: sha256(readFileSync(auditPath)),
          stderr_path: relative(cwd, stderrPath),
          stderr_sha256: sha256(readFileSync(stderrPath)),
        },
      });
      continue;
    }
    const result = spawn("npm", ["audit", "--json"], {
      cwd: directory,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(auditPath, result.stdout ?? "");
    writeFileSync(stderrPath, result.stderr ?? "");
    let audit;
    try {
      audit = JSON.parse(result.stdout ?? "");
      issues.push(...blockingAuditIssues({ workspace, audit, lockfile }));
    } catch (error) {
      executionError ??= error;
      audit = null;
    }
    workspaceEvidence.push({
      workspace,
      lock,
      audit: {
        command: "npm audit --json",
        process_exit_code: result.status,
        report_version: audit?.auditReportVersion ?? null,
        vulnerability_counts: audit?.metadata?.vulnerabilities ?? null,
        path: relative(cwd, auditPath),
        sha256: sha256(readFileSync(auditPath)),
        stderr_path: relative(cwd, stderrPath),
        stderr_sha256: sha256(readFileSync(stderrPath)),
      },
    });
  }

  let evaluation = { blocked: [], excepted: [] };
  try {
    evaluation = evaluateAuditIssues({ issues, policy, now });
  } catch (error) {
    executionError ??= error;
  }
  const evidence = {
    schema_version: "ci04.supply-chain.v1",
    status: !executionError && evaluation.blocked.length === 0 ? "passed" : "failed",
    source: {
      commit: gitValue(cwd, ["rev-parse", "HEAD"], "working-tree"),
      tree: gitValue(cwd, ["rev-parse", "HEAD^{tree}"], "working-tree"),
      dirty_status: gitValue(cwd, ["status", "--porcelain"], "unknown"),
    },
    runtime: { node_version: process.version },
    workspaces: workspaceEvidence,
    summary: {
      blocking_severities: [...BLOCKING_SEVERITIES].sort(),
      discovered: issues.length,
      blocked: evaluation.blocked.length,
      excepted: evaluation.excepted.length,
      blocked_issues: evaluation.blocked,
      excepted_issues: evaluation.excepted,
      error: executionError?.message ?? null,
    },
    boundary: {
      automatic_fix: false,
      dependency_write: false,
      release_authorized: false,
      payment_execution_attempted: false,
      live_enabled: false,
    },
  };
  return evidence;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const evidencePath = resolve(process.argv[2] ?? "supply-chain-evidence.json");
  const outputDirectory = resolve(process.argv[3] ?? "supply-chain-logs");
  const evidence = runSupplyChain({ outputDirectory });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (!validateSupplyChainEvidence(evidence)) {
    process.stderr.write(
      `Supply-chain checks failed; inspect ${evidencePath} and ${outputDirectory}.\n`,
    );
    process.exitCode = 1;
  }
}
