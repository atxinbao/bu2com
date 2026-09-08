import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SimulatedPaymentAdapter } from "./adapter.mjs";
import { ApiError, Bu2Sandbox } from "./domain.mjs";
import {
  Observability,
  classifyOperationalError,
  createTraceId,
  isTraceId,
} from "./observability.mjs";
import { SqliteLedger } from "./persistence.mjs";
import { WebhookDispatcher } from "./webhooks.mjs";
import { X402PaymentAdapter } from "./x402-adapter.mjs";
import {
  loadAccessController,
  sanitizedAccessContract,
} from "./access-control.mjs";
import {
  assertExecutionEnabled,
  assertSignerBinding,
  loadEnvironmentConfig,
  verifyRpcChain,
} from "./environment-config.mjs";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import {
  paginateTransactions,
  validateBody,
  validateIdempotencyKey,
  validateNoQueryParameters,
  validateResourceId,
} from "./api-contract.mjs";

const requestId = () => `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const MAX_JSON_BODY_BYTES = 1_048_576;
const contractVersions = JSON.parse(
  readFileSync(new URL("../docs/03-technical/contract-versions.json", import.meta.url), "utf8"),
);
const packageMetadata = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const executionMutation = (method, pathname) =>
  method === "POST" &&
  (/^\/v1\/quotes$/.test(pathname) ||
    /^\/v1\/receivables$/.test(pathname) ||
    /^\/v1\/receivables\/[^/]+\/collections$/.test(pathname) ||
    /^\/v1\/payment_intents$/.test(pathname) ||
    /^\/v1\/payment_intents\/[^/]+\/authorization$/.test(pathname) ||
    /^\/v1\/payment_intents\/[^/]+\/execution$/.test(pathname) ||
    /^\/v1\/transactions\/[^/]+\/deliveries$/.test(pathname) ||
    /^\/v1\/transactions\/[^/]+\/settlements$/.test(pathname));

function environmentDocument(config, sandbox, accessController) {
  const executionEnabled = config.execution_status === "execution_enabled";
  return {
    service: "bu2-reference-server",
    environment: config.environment,
    environment_contract_version: config.environment_contract_version,
    chain_id: config.chain_id,
    network: config.network,
    execution_backend: config.payment_adapter,
    api_contract_version: contractVersions.agent_payment_api,
    mcp_contract_versions: [contractVersions.mcp_tools],
    receipt_schema_versions: contractVersions.receipt_supported,
    execution_status: config.execution_status,
    access_contract_version: sanitizedAccessContract().schema_version,
    access_mode: accessController.mode,
    public_capabilities: [
      "environment:read",
      "receipts:verify",
      ...(accessController.mode === "development_open" ? ["local_development_open"] : []),
      ...(executionEnabled ? ["authenticated_payment_mutations"] : []),
    ],
    receipt_issuer: sandbox.receiptIssuer(),
  };
}

async function readJson(request) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "validation_error",
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new ApiError(
        413,
        "validation_error",
        "request_body_too_large",
        "Request body must not exceed 1 MiB.",
      );
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "validation_error", "invalid_json", "Request body must be valid JSON.");
  }
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key, x-trace-id",
  });
  response.end(JSON.stringify(body, null, 2));
}

function errorBody(error, id, traceId) {
  const known = error instanceof ApiError;
  return {
    status: known ? error.status : 500,
    body: {
      error: {
        type: known ? error.type : "internal_error",
        code: known ? error.code : "unexpected_error",
        message: known ? error.message : "Unexpected sandbox error.",
        request_id: id,
        trace_id: traceId,
        details: known ? error.details : {},
      },
    },
  };
}

export function buildPaymentAdapter({
  ledger,
  observer,
  mode = "simulated",
  resourceUrl,
  buyerPrivateKey,
  paidFetch = null,
  recoveryQuery = null,
  environmentConfig = null,
} = {}) {
  const activeEnvironment =
    environmentConfig ?? loadEnvironmentConfig({ paymentAdapter: mode });
  if (mode !== activeEnvironment.payment_adapter) {
    throw new ApiError(
      503,
      "configuration_error",
      "environment_adapter_mismatch",
      "Payment adapter does not match the active environment configuration.",
    );
  }
  if (mode === "simulated") return new SimulatedPaymentAdapter({ ledger, observer });
  if (mode !== "x402") {
    throw new ApiError(400, "validation_error", "adapter_mode_invalid", `Unknown adapter: ${mode}`);
  }
  if (buyerPrivateKey || paidFetch) {
    assertSignerBinding(activeEnvironment, activeEnvironment.signer_environment);
  }
  const paidFetchFactory = buyerPrivateKey
    ? ({ beforePaymentCreation }) => {
        const client = new x402Client()
          .register(
            activeEnvironment.network,
            new ExactEvmScheme(privateKeyToAccount(buyerPrivateKey)),
          )
          .onBeforePaymentCreation(beforePaymentCreation);
        return wrapFetchWithPayment(fetch, client);
      }
    : null;
  return new X402PaymentAdapter({
    ledger,
    observer,
    resourceUrl: resourceUrl ?? "http://127.0.0.1:4021/premium-data",
    paidFetch,
    paidFetchFactory,
    recoveryQuery,
    network: activeEnvironment.network,
    asset: activeEnvironment.asset,
    environment: activeEnvironment.environment,
    executionStatus: activeEnvironment.execution_status,
  });
}

export function createBu2Server({
  sandbox,
  ledger,
  dispatcher,
  adapter,
  initialWallet,
  observer = new Observability(),
  environmentConfig = loadEnvironmentConfig(),
  accessController = null,
  accessSource = process.env,
} = {}) {
  const activeLedger = ledger ?? sandbox?.ledger ?? new SqliteLedger(":memory:");
  activeLedger.observer = observer;
  const activeAdapter =
    adapter ??
    sandbox?.adapter ??
    new SimulatedPaymentAdapter({ ledger: activeLedger, observer });
  activeAdapter.observer = observer;
  const activeSandbox =
    sandbox ??
    new Bu2Sandbox({
      ledger: activeLedger,
      adapter: activeAdapter,
      initialWallet,
      observer,
      environmentConfig,
    });
  activeSandbox.observer = observer;
  activeSandbox.environmentConfig = environmentConfig;
  if (activeSandbox.adapter) activeSandbox.adapter.observer = observer;
  const activeDispatcher =
    dispatcher ?? new WebhookDispatcher({ ledger: activeLedger, observer });
  activeDispatcher.observer = observer;
  const activeAccess =
    accessController ??
    loadAccessController({
      environmentConfig,
      ledger: activeLedger,
      source: accessSource,
    });
  const server = createServer(async (request, response) => {
    const id = requestId();
    const requestedTraceId = request.headers["x-trace-id"];
    const traceId = isTraceId(requestedTraceId) ? requestedTraceId : createTraceId();
    response.setHeader("x-request-id", id);
    response.setHeader("x-trace-id", traceId);
    response.setHeader(
      "access-control-expose-headers",
      "x-request-id, x-trace-id",
    );
    const url = new URL(request.url, "http://127.0.0.1");
    const segments = url.pathname.split("/").filter(Boolean);
    const key = request.headers["idempotency-key"];
    const accessContext = {
      method: request.method,
      pathname: url.pathname,
      requestId: id,
      traceId,
    };
    return observer.run({ request_id: id, trace_id: traceId }, async () => {
      const startedAt = Date.now();
      observer.record("request", "http.request.started", {
        method: request.method,
        path: url.pathname,
      });
      try {
      if (requestedTraceId !== undefined && !isTraceId(requestedTraceId)) {
        throw new ApiError(
          400,
          "validation_error",
          "invalid_trace_id",
          "X-Trace-Id must use the trc_ prefix and contain 8 to 251 identifier characters.",
        );
      }
      if (request.method === "OPTIONS") return send(response, 204, {});
      const actor = activeAccess.authenticate(request.headers, accessContext);
      if (actor) response.setHeader("cache-control", "no-store");
      if (url.pathname.startsWith("/v1/") && url.pathname !== "/v1/transactions") {
        validateNoQueryParameters(url.searchParams);
      }
      if (request.method === "GET" && url.pathname === "/health") {
        const snapshot = activeLedger.healthSnapshot();
        return send(response, 200, {
          status: "ok",
          operational_status:
            snapshot.webhook_outbox.dead_letter > 0 ||
            snapshot.adapter_operations.unknown_results > 0
              ? "attention_required"
              : "healthy",
          service: "bu2-reference-server",
          version: packageMetadata.version,
          api_contract_version: contractVersions.agent_payment_api,
          api_base_path: contractVersions.api_base_path,
          mcp_contract_versions: [contractVersions.mcp_tools],
          environment_contract_version: environmentConfig.environment_contract_version,
          environment: environmentConfig.environment,
          execution_status: environmentConfig.execution_status,
          payment_execution_readiness:
            environmentConfig.execution_status === "execution_enabled" ? "ready" : "disabled",
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/environment") {
        return send(
          response,
          200,
          environmentDocument(environmentConfig, activeSandbox, activeAccess),
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/access") {
        return send(response, 200, activeAccess.publicActor(actor));
      }
      if (request.method === "GET" && url.pathname === "/v1/payment_mandates") {
        return send(response, 200, { data: activeAccess.filterMandates(actor, activeSandbox.listPaymentMandates()) });
      }
      if (request.method === "POST" && url.pathname === "/v1/payment_mandates") {
        const body = validateBody("createPaymentMandate", await readJson(request));
        activeAccess.assertClaims(actor, { accountIds: [body.account_id], agentIds: [body.agent_id] }, accessContext);
        return send(response, 201, await activeSandbox.createPaymentMandate(body, validateIdempotencyKey(key)));
      }
      if (request.method === "GET" && url.pathname === "/v1/receivables") {
        return send(response, 200, { data: activeAccess.filterReceivables(actor, activeSandbox.listReceivables()) });
      }
      if (request.method === "POST" && url.pathname === "/v1/receivables") {
        const body = validateBody("createReceivable", await readJson(request));
        activeAccess.assertClaims(actor, { accountIds: [body.account_id], agentIds: [body.agent_id] }, accessContext);
        return send(response, 201, await activeSandbox.createReceivable(body, validateIdempotencyKey(key)));
      }
      if (request.method === "GET" && url.pathname === "/v1/collections") {
        return send(response, 200, { data: activeAccess.filterCollections(actor, activeSandbox.listCollections()) });
      }
      if (request.method === "GET" && url.pathname === "/v1/access_grants") {
        return send(response, 200, { data: activeAccess.filterAccessGrants(actor, activeSandbox.listAccessGrants()) });
      }
      if (executionMutation(request.method, url.pathname)) {
        assertExecutionEnabled(environmentConfig, `${request.method} ${url.pathname}`);
      }
      if (request.method === "GET" && url.pathname === "/v1/events") {
        return send(response, 200, { data: activeLedger.listLedgerEvents() });
      }
      if (request.method === "GET" && url.pathname === "/v1/ledger") {
        return send(response, 200, { data: activeLedger.listLedgerEvents() });
      }
      if (request.method === "GET" && url.pathname === "/v1/budgets") {
        return send(response, 200, { data: activeSandbox.listBudgets() });
      }
      if (request.method === "POST" && url.pathname === "/v1/budgets") {
        const body = validateBody("createBudget", await readJson(request));
        return send(
          response,
          201,
          await activeSandbox.createBudget(body, validateIdempotencyKey(key)),
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/budget_holds") {
        return send(response, 200, { data: activeSandbox.listBudgetHolds() });
      }
      if (request.method === "GET" && url.pathname === "/v1/financial_postings") {
        return send(response, 200, { data: activeSandbox.listFinancialPostings() });
      }
      if (request.method === "GET" && url.pathname === "/v1/transactions") {
        const visible = activeAccess.filterTransactionViews(
          actor,
          activeSandbox.listTransactions(),
        );
        return send(
          response,
          200,
          paginateTransactions(visible, url.searchParams),
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/webhook_outbox") {
        return send(response, 200, { data: activeLedger.outboxRows() });
      }
      if (request.method === "GET" && url.pathname === "/v1/webhook_dead_letters") {
        return send(response, 200, { data: activeLedger.deadLetterRows() });
      }
      if (request.method === "POST" && url.pathname === "/v1/webhook_subscriptions") {
        const body = validateBody("webhookSubscription", await readJson(request));
        return send(
          response,
          201,
          activeLedger.addWebhookSubscription(body, validateIdempotencyKey(key)),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/webhooks/dispatch") {
        return send(response, 200, { data: await activeDispatcher.flush({ force: true }) });
      }
      if (request.method === "POST" && url.pathname === "/v1/quotes") {
        const body = validateBody("createQuote", await readJson(request));
        activeAccess.assertClaims(
          actor,
          { accountIds: [body.payee_account_id], agentIds: [body.seller_agent_id] },
          accessContext,
        );
        return send(
          response,
          201,
          await activeSandbox.createQuote(body, validateIdempotencyKey(key)),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/payment_intents") {
        const body = validateBody("createPaymentIntent", await readJson(request));
        activeAccess.assertClaims(
          actor,
          { accountIds: [body.payer_account_id], agentIds: [body.buyer_agent_id] },
          accessContext,
        );
        return send(
          response,
          201,
          await activeSandbox.createPaymentIntent(body, validateIdempotencyKey(key)),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/operations/support_bundles") {
        const body = validateBody("supportBundle", await readJson(request));
        const snapshot = activeLedger.healthSnapshot();
        let transaction = null;
        if (body.transaction_id) {
          const view = activeAccess.assertView(
            actor,
            activeSandbox.getTransaction(body.transaction_id),
            { ...accessContext, resourceId: body.transaction_id },
          );
          transaction = {
            id: view.transaction.id,
            status: view.transaction.status,
            receipt_present: view.receipt !== null,
            settlement_control_status: view.settlement_control?.status ?? null,
          };
        }
        return send(response, 201, {
          id: `sup_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
          schema_version: "1.0",
          generated_at: new Date().toISOString(),
          requested_by: actor.principal_id,
          reason: body.reason,
          environment: {
            name: environmentConfig.environment,
            contract_version: environmentConfig.environment_contract_version,
            execution_status: environmentConfig.execution_status,
            chain_id: environmentConfig.chain_id,
            network: environmentConfig.network,
          },
          service: {
            version: packageMetadata.version,
            api_contract_version: contractVersions.agent_payment_api,
          },
          correlation: {
            request_id: body.request_id ?? null,
            trace_id: body.trace_id ?? null,
            transaction_id: body.transaction_id ?? null,
          },
          diagnostics: {
            operational_status:
              snapshot.webhook_outbox.dead_letter > 0 ||
              snapshot.adapter_operations.unknown_results > 0
                ? "attention_required"
                : "healthy",
            webhook_dead_letters: snapshot.webhook_outbox.dead_letter,
            unknown_payment_results: snapshot.adapter_operations.unknown_results,
            access_decisions: activeLedger.accessDecisionSummary(environmentConfig.environment),
          },
          transaction,
          redaction: {
            applied: true,
            excluded: [
              "authorization_header",
              "api_key_material",
              "database_path",
              "private_payloads",
              "receipt_private_key",
              "webhook_secrets",
            ],
          },
        });
      }
      if (
        request.method === "POST" &&
        segments[0] === "v1" &&
        segments[1] === "operations" &&
        segments[2] === "tenants" &&
        segments[3] &&
        segments[4] === "resets" &&
        segments.length === 5
      ) {
        if (environmentConfig.environment !== "sandbox") {
          throw new ApiError(
            403,
            "authorization_error",
            "tenant_reset_sandbox_only",
            "Tenant credential reset is only available in Sandbox.",
          );
        }
        const tenantId = validateResourceId(segments[3], "ten", "tenant_id");
        if (tenantId === actor.tenant_id) {
          throw new ApiError(
            403,
            "authorization_error",
            "operator_tenant_reset_denied",
            "An operator cannot reset its own access tenant.",
          );
        }
        const body = validateBody("tenantAccessReset", await readJson(request));
        return send(
          response,
          201,
          activeLedger.resetTenantAccess({
            environment: environmentConfig.environment,
            target_tenant_id: tenantId,
            idempotency_key: validateIdempotencyKey(key),
            requested_by: actor.principal_id,
            reason: body.reason,
            request_id: id,
            trace_id: traceId,
          }),
        );
      }
      if (segments[0] === "v1" && segments[1] === "webhook_subscriptions" && segments[2]) {
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "secret_rotations"
        ) {
          const subscriptionId = validateResourceId(
            segments[2],
            "whsub",
            "subscription_id",
          );
          const body = validateBody("webhookSecretRotation", await readJson(request));
          return send(
            response,
            201,
            activeLedger.rotateWebhookSecret(
              subscriptionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "webhook_outbox" && segments[2]) {
        const outboxId = validateResourceId(segments[2], "out", "outbox_id");
        if (
          request.method === "GET" &&
          segments.length === 4 &&
          segments[3] === "attempts"
        ) {
          return send(response, 200, {
            data: activeLedger.webhookDeliveryAttempts(outboxId),
          });
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "replays"
        ) {
          const body = validateBody("webhookReplay", await readJson(request));
          return send(
            response,
            201,
            activeLedger.replayWebhook(
              outboxId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "payment_intents" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const paymentIntentId = validateResourceId(
            segments[2],
            "pi",
            "payment_intent_id",
          );
          const intent = activeSandbox.getPaymentIntent(paymentIntentId);
          activeAccess.assertView(actor, intent, {
            ...accessContext,
            resourceId: paymentIntentId,
          });
          return send(response, 200, intent);
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "authorization"
        ) {
          const paymentIntentId = validateResourceId(
            segments[2],
            "pi",
            "payment_intent_id",
          );
          const body = validateBody("authorizationDecision", await readJson(request));
          return send(
            response,
            200,
            await activeSandbox.decideAuthorization(
              paymentIntentId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "execution"
        ) {
          const paymentIntentId = validateResourceId(
            segments[2],
            "pi",
            "payment_intent_id",
          );
          const body = validateBody("executePaymentIntent", await readJson(request));
          const intent = activeSandbox.getPaymentIntent(paymentIntentId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [intent.payer_account_id], agentIds: [intent.buyer_agent_id] },
            { ...accessContext, resourceId: paymentIntentId },
          );
          return send(
            response,
            200,
            await activeSandbox.executePaymentIntent(
              paymentIntentId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "payment_mandates" && segments[2]) {
        const mandateId = validateResourceId(segments[2], "mdt", "mandate_id");
        if (request.method === "GET" && segments.length === 3) {
          const mandate = activeSandbox.getPaymentMandate(mandateId);
          activeAccess.assertClaims(actor, { accountIds: [mandate.account_id], agentIds: [mandate.agent_id] }, accessContext);
          return send(response, 200, mandate);
        }
        if (request.method === "POST" && segments.length === 4 && ["activate", "suspend", "revoke", "expire"].includes(segments[3])) {
          const mandate = activeSandbox.getPaymentMandate(mandateId);
          activeAccess.assertClaims(actor, { accountIds: [mandate.account_id], agentIds: [mandate.agent_id] }, accessContext);
          const body = validateBody("mandateTransition", await readJson(request));
          return send(response, 200, await activeSandbox.transitionPaymentMandate(mandateId, segments[3], body, validateIdempotencyKey(key)));
        }
      }
      if (segments[0] === "v1" && segments[1] === "receivables" && segments[2]) {
        const receivableId = validateResourceId(segments[2], "rcv", "receivable_id");
        if (request.method === "GET" && segments.length === 3) {
          const receivable = activeSandbox.getReceivable(receivableId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [receivable.account_id], agentIds: [receivable.agent_id] },
            { ...accessContext, resourceId: receivableId },
          );
          return send(response, 200, receivable);
        }
        if (request.method === "POST" && segments.length === 4 && segments[3] === "collections") {
          const body = validateBody("verifyInboundPayment", await readJson(request));
          const receivable = activeSandbox.getReceivable(receivableId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [receivable.account_id], agentIds: [receivable.agent_id] },
            { ...accessContext, resourceId: receivableId },
          );
          return send(
            response,
            201,
            await activeSandbox.verifyInboundPayment(receivableId, body, validateIdempotencyKey(key)),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "collections" && segments[2]) {
        const collectionId = validateResourceId(segments[2], "cpay", "collection_id");
        if (request.method === "GET" && segments.length === 3) {
          const collection = activeSandbox.getCollection(collectionId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [collection.account_id], agentIds: [collection.agent_id] },
            { ...accessContext, resourceId: collectionId },
          );
          return send(response, 200, collection);
        }
        if (request.method === "POST" && segments.length === 4 && segments[3] === "access_grants") {
          const collection = activeSandbox.getCollection(collectionId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [collection.account_id], agentIds: [collection.agent_id] },
            { ...accessContext, resourceId: collectionId },
          );
          const body = validateBody("createAccessGrant", await readJson(request));
          return send(
            response,
            201,
            await activeSandbox.createAccessGrant(
              collectionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "access_grants" && segments[2]) {
        const accessGrantId = validateResourceId(segments[2], "agr", "access_grant_id");
        if (request.method === "GET" && segments.length === 3) {
          const grant = activeSandbox.getAccessGrant(accessGrantId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [grant.account_id], agentIds: [grant.agent_id] },
            { ...accessContext, resourceId: accessGrantId },
          );
          return send(response, 200, grant);
        }
        if (request.method === "POST" && segments.length === 4 && segments[3] === "recover") {
          const grant = activeSandbox.getAccessGrant(accessGrantId);
          activeAccess.assertClaims(
            actor,
            { accountIds: [grant.account_id], agentIds: [grant.agent_id] },
            { ...accessContext, resourceId: accessGrantId },
          );
          const body = validateBody("recoverAccessGrant", await readJson(request));
          return send(
            response,
            200,
            await activeSandbox.recoverAccessGrant(
              accessGrantId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (segments[0] === "v1" && segments[1] === "budgets" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const budgetId = validateResourceId(segments[2], "bud", "budget_id");
          return send(response, 200, activeSandbox.budgetView(activeSandbox.getBudget(budgetId)));
        }
        if (
          request.method === "GET" &&
          segments.length === 4 &&
          segments[3] === "holds"
        ) {
          const budgetId = validateResourceId(segments[2], "bud", "budget_id");
          activeSandbox.getBudget(budgetId);
          return send(response, 200, { data: activeSandbox.listBudgetHolds(budgetId) });
        }
      }
      if (segments[0] === "v1" && segments[1] === "budget_holds" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const holdId = validateResourceId(segments[2], "hold", "budget_hold_id");
          return send(response, 200, activeSandbox.getBudgetHold(holdId));
        }
      }
      if (segments[0] === "v1" && segments[1] === "transactions" && segments[2]) {
        if (request.method === "GET" && segments.length === 3) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const view = activeSandbox.getTransaction(transactionId);
          activeAccess.assertView(actor, view, {
            ...accessContext,
            resourceId: transactionId,
          });
          return send(response, 200, view);
        }
        if (request.method === "POST" && segments.length === 4 && segments[3] === "deliveries") {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const view = activeSandbox.getTransaction(transactionId);
          activeAccess.assertClaims(
            actor,
            {
              accountIds: [view.quote.payee_account_id],
              agentIds: [view.quote.seller_agent_id],
            },
            { ...accessContext, resourceId: transactionId },
          );
          const body = validateBody("deliveryEvidence", await readJson(request));
          return send(
            response,
            201,
            await activeSandbox.submitDelivery(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "settlements"
        ) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const body = validateBody("settlement", await readJson(request));
          return send(
            response,
            201,
            await activeSandbox.settle(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
        if (
          request.method === "POST" &&
          segments.length === 4 &&
          segments[3] === "settlement_recoveries"
        ) {
          const transactionId = validateResourceId(segments[2], "txn", "transaction_id");
          const body = validateBody("settlementRecovery", await readJson(request));
          return send(
            response,
            200,
            await activeSandbox.recoverSettlement(
              transactionId,
              body,
              validateIdempotencyKey(key),
            ),
          );
        }
      }
      if (
        request.method === "GET" &&
        segments[0] === "v1" &&
        segments[1] === "receipts" &&
        segments[2]
      ) {
        const receiptId = validateResourceId(segments[2], "rcpt", "receipt_id");
        if (segments.length === 4 && segments[3] === "verify")
          return send(response, 200, activeSandbox.verifyReceipt(receiptId));
        if (segments.length === 3) {
          const receipt = activeSandbox.getReceipt(receiptId);
          const view = activeSandbox.getTransaction(receipt.transaction_id);
          activeAccess.assertView(actor, view, {
            ...accessContext,
            resourceId: receiptId,
          });
          return send(response, 200, receipt);
        }
      }
      throw new ApiError(404, "resource_not_found", "route_not_found", "Route was not found.");
      } catch (error) {
        observer.record(
          classifyOperationalError(error),
          "http.request.failed",
          {
            method: request.method,
            path: url.pathname,
            error_type: error.type ?? "internal_error",
            error_code: error.code ?? "unexpected_error",
            status: error.status ?? 500,
          },
        );
        const result = errorBody(error, id, traceId);
        if (result.status === 401) response.setHeader("www-authenticate", 'Bearer realm="bu2"');
        send(response, result.status, result.body);
      } finally {
        observer.record("request", "http.request.completed", {
          method: request.method,
          path: url.pathname,
          status: response.statusCode,
          duration_ms: Date.now() - startedAt,
        });
      }
    });
  });
  return {
    server,
    sandbox: activeSandbox,
    ledger: activeLedger,
    dispatcher: activeDispatcher,
    observer,
    environmentConfig,
    accessController: activeAccess,
  };
}

export async function listen({
  port = Number(process.env.BU2_SANDBOX_PORT ?? 3100),
  host = process.env.BU2_HOST ?? "127.0.0.1",
  dbPath = process.env.BU2_SANDBOX_DB ??
    fileURLToPath(new URL("./data/bu2-sandbox.sqlite", import.meta.url)),
  ledger,
  dispatcher,
  observer,
  logSink = null,
  adapterMode = process.env.BU2_PAYMENT_ADAPTER ?? "simulated",
  environment = process.env.BU2_ENVIRONMENT,
  chainId = process.env.BU2_CHAIN_ID,
  network = process.env.BU2_NETWORK,
  asset = process.env.BU2_USDC_ADDRESS,
  executionStatus = process.env.BU2_EXECUTION_STATUS,
  signerEnvironment = process.env.BU2_SIGNER_ENVIRONMENT,
  providerNetwork = process.env.BU2_PROVIDER_NETWORK,
  providerScheme = process.env.BU2_PROVIDER_SCHEME,
  rpcChainId = process.env.BU2_RPC_CHAIN_ID,
  rpcChainIdResolver = null,
  claimLegacyEnvironment = process.env.BU2_CLAIM_LEGACY_DB_ENVIRONMENT === "true",
  x402ResourceUrl = process.env.X402_RESOURCE_URL,
  x402BuyerPrivateKey = process.env.X402_BUYER_PRIVATE_KEY,
  x402PaidFetch = null,
  x402RecoveryQuery = null,
  accessMode = process.env.BU2_ACCESS_MODE,
  accessCredentialsJson = process.env.BU2_API_CREDENTIALS_JSON,
} = {}) {
  const environmentConfig = loadEnvironmentConfig({
    environment,
    paymentAdapter: adapterMode,
    chainId,
    network,
    asset,
    executionStatus,
    signerEnvironment,
    providerNetwork,
    providerScheme,
    rpcChainId,
  });
  await verifyRpcChain(environmentConfig, rpcChainIdResolver);
  if (x402BuyerPrivateKey || x402PaidFetch) {
    assertSignerBinding(environmentConfig, environmentConfig.signer_environment);
  }
  const activeObserver = observer ?? new Observability({ sink: logSink });
  const activeLedger =
    ledger ??
    new SqliteLedger(dbPath, {
      observer: activeObserver,
      environmentConfig,
      claimLegacyEnvironment,
    });
  if (ledger) {
    activeLedger.bindEnvironment(environmentConfig, { claimLegacyEnvironment });
  }
  activeLedger.observer = activeObserver;
  const adapter = buildPaymentAdapter({
    ledger: activeLedger,
    observer: activeObserver,
    mode: adapterMode,
    resourceUrl: x402ResourceUrl,
    buyerPrivateKey: x402BuyerPrivateKey,
    paidFetch: x402PaidFetch,
    recoveryQuery: x402RecoveryQuery,
    environmentConfig,
  });
  const initialWallet =
    adapterMode === "x402"
      ? { id: "wal_x402_buyer", available: 10_000, reserved: 0, currency: "USD" }
      : undefined;
  const instance = createBu2Server({
    ledger: activeLedger,
    dispatcher,
    adapter,
    initialWallet,
    observer: activeObserver,
    environmentConfig,
    accessSource: {
      ...process.env,
      ...(accessMode === undefined ? {} : { BU2_ACCESS_MODE: accessMode }),
      ...(accessCredentialsJson === undefined
        ? {}
        : { BU2_API_CREDENTIALS_JSON: accessCredentialsJson }),
    },
  });
  await new Promise((resolve, reject) => {
    instance.server.once("error", reject);
    instance.server.listen(port, host, resolve);
  });
  const address = instance.server.address();
  return { ...instance, url: `http://${host}:${address.port}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await listen({ logSink: (line) => console.log(line) });
  console.log(`BU2 Reference Server v${packageMetadata.version} listening on ${running.url}`);

  // 容器停止时先停止接收请求，再关闭数据库，避免 SQLite WAL 留下未完成写入。
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ category: "runtime", event: "shutdown.started", signal }));
    running.server.close(() => {
      running.ledger.close();
      console.log(JSON.stringify({ category: "runtime", event: "shutdown.completed", signal }));
      process.exitCode = 0;
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
