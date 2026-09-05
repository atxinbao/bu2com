import { readFileSync } from "node:fs";
import { connectBu2McpClient } from "./external-agents/mcp-client.mjs";
import {
  contractVersions,
  loadBu2McpConfiguration,
  mcpContract,
  preflightBu2Endpoint,
} from "./external-agents/mcp-runtime.mjs";

const sandboxPackage = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export const DOCTOR_SCHEMA_VERSION = contractVersions.doctor_result;
export const DOCTOR_STAGES = Object.freeze([
  "node_runtime",
  "configuration",
  "endpoint",
  "environment",
  "contract",
  "mcp_startup",
  "receipt_verification",
]);
export const MINIMUM_NODE_VERSION = sandboxPackage.engines.node.replace(/^>=/, "");

const RECEIPT_ID = /^rcpt_[A-Za-z0-9_-]+$/;
const REQUEST_ID = /^req_[A-Za-z0-9_-]+$/;
const TRACE_ID = /^trc_[A-Za-z0-9_-]{8,251}$/;

const GUIDANCE = {
  node_version_unsupported: {
    retry: "retry_after_fix",
    recovery: "upgrade_node",
    zh: `安装 Node.js ${MINIMUM_NODE_VERSION} 或更高版本后重新运行。`,
    en: `Install Node.js ${MINIMUM_NODE_VERSION} or later, then run the doctor again.`,
  },
  endpoint_invalid: {
    retry: "retry_after_fix",
    recovery: "fix_endpoint",
    zh: "将 BU2_ENDPOINT 设置为不含凭证、查询参数或片段的 HTTP(S) 地址。",
    en: "Set BU2_ENDPOINT to an HTTP(S) URL without credentials, query parameters, or fragments.",
  },
  endpoint_conflict: {
    retry: "retry_after_fix",
    recovery: "remove_legacy_endpoint_conflict",
    zh: "删除旧 BU2_SANDBOX_URL，或确保它与 BU2_ENDPOINT 指向同一地址。",
    en: "Remove BU2_SANDBOX_URL or make it identify the same URL as BU2_ENDPOINT.",
  },
  environment_invalid: {
    retry: "retry_after_fix",
    recovery: "select_phase0_environment",
    zh: "将 BU2_ENVIRONMENT 设置为 simulation 或 testnet；Mainnet 在 Phase 0 被禁止。",
    en: "Set BU2_ENVIRONMENT to simulation or testnet; Mainnet is prohibited in Phase 0.",
  },
  endpoint_unreachable: {
    retry: "retry_safe",
    recovery: "start_or_reconnect_endpoint",
    zh: "启动 BU2 Reference Server 或恢复网络连接后安全重试。",
    en: "Start the BU2 Reference Server or restore connectivity, then retry safely.",
  },
  endpoint_timeout: {
    retry: "retry_safe",
    recovery: "restore_endpoint_responsiveness",
    zh: "确认 Reference Server 可响应 /health 后安全重试。",
    en: "Confirm that the Reference Server responds to /health, then retry safely.",
  },
  endpoint_response_invalid: {
    retry: "retry_after_fix",
    recovery: "fix_health_response",
    zh: "确认 BU2_ENDPOINT 的 /health 返回兼容的 JSON 响应。",
    en: "Ensure that BU2_ENDPOINT /health returns a compatible JSON response.",
  },
  endpoint_incompatible: {
    retry: "retry_after_fix",
    recovery: "select_bu2_reference_server",
    zh: "把 BU2_ENDPOINT 指向兼容的 BU2 Reference Server。",
    en: "Point BU2_ENDPOINT at a compatible BU2 Reference Server.",
  },
  environment_mismatch: {
    retry: "retry_after_fix",
    recovery: "match_endpoint_environment",
    zh: "让 BU2_ENVIRONMENT 与 Reference Server 报告的环境一致。",
    en: "Make BU2_ENVIRONMENT match the environment reported by the Reference Server.",
  },
  api_contract_version_mismatch: {
    retry: "retry_after_fix",
    recovery: "align_api_contract",
    zh: `使用与 Agent Payment API v${contractVersions.agent_payment_api} 兼容的 Reference Server。`,
    en: `Use a Reference Server compatible with Agent Payment API v${contractVersions.agent_payment_api}.`,
  },
  mcp_contract_version_unsupported: {
    retry: "retry_after_fix",
    recovery: "align_mcp_contract",
    zh: `使用支持 MCP contract v${mcpContract.version} 的 Reference Server。`,
    en: `Use a Reference Server that supports MCP contract v${mcpContract.version}.`,
  },
  mcp_server_version_mismatch: {
    retry: "retry_after_fix",
    recovery: "align_mcp_server",
    zh: "更新 Host 配置，使其指向当前稳定 bu2-mcp 入口。",
    en: "Update the host configuration to use the current stable bu2-mcp entrypoint.",
  },
  mcp_capability_mismatch: {
    retry: "retry_after_fix",
    recovery: "align_mcp_capability",
    zh: "修复 MCP Server 与 endpoint 的版本或环境配置后重试。",
    en: "Align the MCP Server and endpoint versions or environment, then retry.",
  },
  mcp_tool_contract_mismatch: {
    retry: "retry_after_fix",
    recovery: "restore_frozen_mcp_tools",
    zh: "恢复与 mcp-tools.json 一致的 6 个冻结工具后重试。",
    en: "Restore the six frozen tools from mcp-tools.json, then retry.",
  },
  receipt_not_found: {
    retry: "retry_after_fix",
    recovery: "check_receipt_id",
    zh: "检查 Receipt ID，确认交易已结算并已签发 Receipt。",
    en: "Check the Receipt ID and confirm that the transaction settled and issued a Receipt.",
  },
  receipt_invalid: {
    retry: "query_before_retry",
    recovery: "investigate_receipt_binding",
    zh: "停止使用该 Receipt，并按 Transaction、Ledger 与交付证据检查绑定关系。",
    en: "Stop using the Receipt and inspect its Transaction, Ledger, and delivery-evidence bindings.",
  },
  doctor_internal_error: {
    retry: "retry_after_fix",
    recovery: "inspect_local_doctor",
    zh: "检查本地 doctor 与依赖安装；不要据此重放任何资金写操作。",
    en: "Inspect the local doctor and dependencies; do not replay any payment mutation because of this failure.",
  },
};

function compareVersions(actual, minimum) {
  const parse = (value) =>
    value
      .match(/^(\d+)\.(\d+)\.(\d+)/)
      ?.slice(1)
      .map(Number);
  const left = parse(actual);
  const right = parse(minimum);
  if (!left || !right) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return 1;
    if ((left[index] ?? 0) < (right[index] ?? 0)) return -1;
  }
  return 0;
}

function errorCode(error) {
  return typeof error?.code === "string"
    ? error.code
    : (error?.result?.structuredContent?.error?.code ?? "doctor_internal_error");
}

function correlation(error) {
  const detail = error?.details ?? error?.result?.structuredContent?.error ?? {};
  return {
    ...(REQUEST_ID.test(detail.request_id ?? "") ? { request_id: detail.request_id } : {}),
    ...(TRACE_ID.test(detail.trace_id ?? "") ? { trace_id: detail.trace_id } : {}),
  };
}

function failedStage(code) {
  if (code === "environment_mismatch") return "environment";
  if (code.includes("contract") || code.includes("version_mismatch")) return "contract";
  if (code.startsWith("endpoint_")) return "endpoint";
  return "mcp_startup";
}

function check(stage, resultCategory, durationMs = 0, code = null) {
  return {
    stage,
    result_category: resultCategory,
    duration_ms: Math.max(0, Math.round(durationMs)),
    error_code: code,
  };
}

function guidanceFor(code) {
  return GUIDANCE[code] ?? GUIDANCE.doctor_internal_error;
}

function failure(stage, error) {
  const code = errorCode(error);
  const guidance = guidanceFor(code);
  return {
    stage,
    code,
    retry: guidance.retry,
    recovery: guidance.recovery,
    ...correlation(error),
  };
}

function blockRemaining(checks, failedStageName) {
  const existing = new Set(checks.map(({ stage }) => stage));
  for (const stage of DOCTOR_STAGES) {
    if (!existing.has(stage)) {
      checks.push(check(stage, "blocked", 0, `blocked_by_${failedStageName}`));
    }
  }
}

function finalize({
  startedAtMs,
  now,
  nodeVersion,
  environment,
  receiptVerification,
  checks,
  failed,
}) {
  const result = {
    schema_version: DOCTOR_SCHEMA_VERSION,
    result: failed ? "failed" : "passed",
    started_at: new Date(startedAtMs).toISOString(),
    duration_ms: Math.max(0, Math.round(now() - startedAtMs)),
    environment,
    versions: {
      node: nodeVersion,
      minimum_node: MINIMUM_NODE_VERSION,
      api_contract: contractVersions.agent_payment_api,
      mcp_contract: mcpContract.version,
    },
    receipt_verification: receiptVerification,
    checks,
    analytics: {
      remote_enabled: false,
      upload_attempted: false,
      persistence: "none",
      retention: "process_lifetime",
      deletion: "not_applicable_no_persistence",
      records: checks.map(({ stage, duration_ms, result_category, error_code }) => ({
        stage,
        duration_ms,
        result_category,
        error_code,
      })),
    },
    ...(failed ? { failure: failed } : {}),
  };
  return Object.freeze(result);
}

export async function runDoctor({
  environment = process.env,
  nodeVersion = process.versions.node,
  receiptId,
  now = Date.now,
  preflight = preflightBu2Endpoint,
  connectMcp = connectBu2McpClient,
} = {}) {
  const startedAtMs = now();
  const checks = [];
  let activeEnvironment = null;
  let receiptVerification = "blocked";
  let started = now();

  if (compareVersions(nodeVersion, MINIMUM_NODE_VERSION) < 0) {
    const error = { code: "node_version_unsupported" };
    checks.push(check("node_runtime", "failed", now() - started, error.code));
    const failed = failure("node_runtime", error);
    blockRemaining(checks, failed.stage);
    return finalize({
      startedAtMs,
      now,
      nodeVersion,
      environment: null,
      receiptVerification,
      checks,
      failed,
    });
  }
  checks.push(check("node_runtime", "passed", now() - started));

  let configuration;
  started = now();
  try {
    configuration = loadBu2McpConfiguration(environment);
    activeEnvironment = configuration.environment;
    checks.push(check("configuration", "passed", now() - started));
  } catch (error) {
    checks.push(check("configuration", "failed", now() - started, errorCode(error)));
    const failed = failure("configuration", error);
    blockRemaining(checks, failed.stage);
    return finalize({
      startedAtMs,
      now,
      nodeVersion,
      environment: null,
      receiptVerification,
      checks,
      failed,
    });
  }

  started = now();
  try {
    await preflight(configuration);
    checks.push(check("endpoint", "passed", now() - started));
    checks.push(check("environment", "passed"));
    checks.push(check("contract", "passed"));
  } catch (error) {
    const stage = failedStage(errorCode(error));
    checks.push(
      check(
        "endpoint",
        stage === "endpoint" ? "failed" : "passed",
        now() - started,
        stage === "endpoint" ? errorCode(error) : null,
      ),
    );
    const environmentChecked = errorCode(error) === "mcp_contract_version_unsupported";
    checks.push(
      check(
        "environment",
        stage === "environment" ? "failed" : environmentChecked ? "passed" : "blocked",
        0,
        stage === "environment"
          ? errorCode(error)
          : environmentChecked
            ? null
            : `blocked_by_${stage}`,
      ),
    );
    checks.push(
      check(
        "contract",
        stage === "contract" ? "failed" : "blocked",
        0,
        stage === "contract" ? errorCode(error) : `blocked_by_${stage}`,
      ),
    );
    const failed = failure(stage, error);
    blockRemaining(checks, failed.stage);
    return finalize({
      startedAtMs,
      now,
      nodeVersion,
      environment: activeEnvironment,
      receiptVerification,
      checks,
      failed,
    });
  }

  let mcp;
  started = now();
  try {
    mcp = await connectMcp({
      baseUrl: configuration.endpoint,
      environment: configuration.environment,
    });
    const tools = await mcp.listTools();
    const actual = tools.map(({ name }) => name).sort();
    const expected = mcpContract.tools.map(({ name }) => name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw Object.assign(new Error("MCP tool contract mismatch."), {
        code: "mcp_tool_contract_mismatch",
      });
    }
    checks.push(check("mcp_startup", "passed", now() - started));

    started = now();
    if (receiptId) {
      const verification = await mcp.call("bu2_verify_receipt", { receipt_id: receiptId });
      if (verification.valid !== true) {
        throw Object.assign(new Error("Receipt verification failed."), { code: "receipt_invalid" });
      }
      receiptVerification = "verified";
    } else {
      receiptVerification = "capability_available";
    }
    checks.push(check("receipt_verification", "passed", now() - started));
  } catch (error) {
    const stage = checks.some(({ stage: name }) => name === "mcp_startup")
      ? "receipt_verification"
      : "mcp_startup";
    if (stage === "receipt_verification") receiptVerification = "failed";
    checks.push(check(stage, "failed", now() - started, errorCode(error)));
    const failed = failure(stage, error);
    blockRemaining(checks, failed.stage);
    return finalize({
      startedAtMs,
      now,
      nodeVersion,
      environment: activeEnvironment,
      receiptVerification,
      checks,
      failed,
    });
  } finally {
    try {
      await mcp?.close();
    } catch {
      // 诊断结果已由握手与工具调用确定；关闭失败不能覆盖可操作的原始结论。
    }
  }

  return finalize({
    startedAtMs,
    now,
    nodeVersion,
    environment: activeEnvironment,
    receiptVerification,
    checks,
    failed: null,
  });
}

export function parseDoctorArgs(args) {
  const options = { format: "human", language: "zh", receiptId: undefined, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      options.help = true;
    } else if (argument === "--format") {
      options.format = args[++index];
      if (!new Set(["human", "json"]).has(options.format)) {
        throw Object.assign(new Error("--format must be human or json."), {
          code: "cli_argument_invalid",
        });
      }
    } else if (argument === "--language") {
      options.language = args[++index];
      if (!new Set(["zh", "en"]).has(options.language)) {
        throw Object.assign(new Error("--language must be zh or en."), {
          code: "cli_argument_invalid",
        });
      }
    } else if (argument === "--receipt-id") {
      options.receiptId = args[++index];
      if (!RECEIPT_ID.test(options.receiptId ?? "")) {
        throw Object.assign(new Error("--receipt-id must use the rcpt_ prefix."), {
          code: "cli_argument_invalid",
        });
      }
    } else {
      throw Object.assign(new Error(`Unknown argument: ${argument}`), {
        code: "cli_argument_invalid",
      });
    }
  }
  if (options.help && args.length > 1) {
    throw Object.assign(new Error("--help cannot be combined with other arguments."), {
      code: "cli_argument_invalid",
    });
  }
  return options;
}

const STAGE_LABELS = {
  zh: {
    node_runtime: "Node 运行时",
    configuration: "配置",
    endpoint: "BU2 endpoint",
    environment: "环境模式",
    contract: "契约版本",
    mcp_startup: "MCP 启动",
    receipt_verification: "Receipt 验证",
  },
  en: {
    node_runtime: "Node runtime",
    configuration: "Configuration",
    endpoint: "BU2 endpoint",
    environment: "Environment",
    contract: "Contract versions",
    mcp_startup: "MCP startup",
    receipt_verification: "Receipt verification",
  },
};

export function renderDoctorHuman(result, language = "zh") {
  const zh = language === "zh";
  const lines = [
    zh
      ? `BU2 接入诊断：${result.result === "passed" ? "通过" : "失败"}`
      : `BU2 integration doctor: ${result.result.toUpperCase()}`,
  ];
  for (const item of result.checks) {
    const mark =
      item.result_category === "passed" ? "✓" : item.result_category === "failed" ? "✗" : "-";
    const category = zh
      ? { passed: "通过", failed: "失败", blocked: "已阻断" }[item.result_category]
      : item.result_category;
    lines.push(
      `${mark} ${STAGE_LABELS[language][item.stage]}: ${category} (${item.duration_ms} ms)${item.error_code ? ` [${item.error_code}]` : ""}`,
    );
  }
  if (result.failure) {
    const guidance = guidanceFor(result.failure.code);
    lines.push(zh ? `恢复建议：${guidance.zh}` : `Recovery: ${guidance.en}`);
    lines.push(
      zh ? `重试分类：${result.failure.retry}` : `Retry classification: ${result.failure.retry}`,
    );
    if (result.failure.request_id) lines.push(`request_id: ${result.failure.request_id}`);
    if (result.failure.trace_id) lines.push(`trace_id: ${result.failure.trace_id}`);
  }
  lines.push(
    zh
      ? "接入分析：仅保留在当前进程，未持久化，远程上传关闭。"
      : "Integration analytics: process-only, not persisted, remote upload disabled.",
  );
  return lines.join("\n");
}

export function doctorHelp() {
  return [
    "BU2 doctor v0.1 / BU2 接入诊断 v0.1",
    "",
    "Usage: node sandbox/bin/bu2-doctor.mjs [--format human|json] [--language zh|en] [--receipt-id rcpt_...]",
    "",
    "Environment:",
    "  BU2_ENDPOINT       BU2 Reference Server URL",
    "  BU2_ENVIRONMENT    simulation or testnet",
    "",
    "No remote telemetry or local persistence is performed.",
  ].join("\n");
}

export async function runDoctorCli({
  args = process.argv.slice(2),
  environment = process.env,
  stdout = console.log,
  stderr = console.error,
  doctor = runDoctor,
} = {}) {
  let options;
  try {
    options = parseDoctorArgs(args);
  } catch (error) {
    stderr(JSON.stringify({ code: errorCode(error), recovery: "use_help" }));
    return 1;
  }
  if (options.help) {
    stdout(doctorHelp());
    return 0;
  }
  const result = await doctor({ environment, receiptId: options.receiptId });
  stdout(
    options.format === "json"
      ? JSON.stringify(result, null, 2)
      : renderDoctorHuman(result, options.language),
  );
  return result.result === "passed" ? 0 : 1;
}
