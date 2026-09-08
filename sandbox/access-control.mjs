import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { ApiError } from "./domain.mjs";

export const ACCESS_CONTRACT = Object.freeze(
  JSON.parse(
    readFileSync(
      new URL("../docs/03-technical/access-contract.json", import.meta.url),
      "utf8",
    ),
  ),
);

const TOKEN_DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^(key|ten|usr|agt|acct)_[A-Za-z0-9_-]+$/;
const PERMISSIONS = new Set(Object.values(ACCESS_CONTRACT.roles).flat());
const ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(ACCESS_CONTRACT.roles).map(([role, permissions]) => [
      role,
      Object.freeze(new Set(permissions)),
    ]),
  ),
);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);
const authError = (status, code, message, details = {}) =>
  new ApiError(
    status,
    status === 401 ? "authentication_error" : "authorization_error",
    code,
    message,
    details,
  );
const configurationError = (code, message, details = {}) =>
  new ApiError(503, "configuration_error", code, message, details);

function requireIdentifier(value, field, prefixes = null) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw configurationError("access_credential_invalid", `${field} is invalid.`, { field });
  }
  if (prefixes && !prefixes.some((prefix) => value.startsWith(`${prefix}_`))) {
    throw configurationError("access_credential_invalid", `${field} has an invalid prefix.`, {
      field,
    });
  }
  return value;
}

function identifierList(value, field, prefix) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw configurationError("access_credential_invalid", `${field} must be an array.`, {
      field,
    });
  }
  return [...new Set(value.map((item) => requireIdentifier(item, field, [prefix])))].sort();
}

export function normalizeAccessCredential(input, environment) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw configurationError("access_credential_invalid", "Credential metadata must be an object.");
  }
  const rolePermissions = ROLE_PERMISSIONS[input.role];
  if (!rolePermissions) {
    throw configurationError("access_credential_invalid", "Credential role is invalid.", {
      field: "role",
    });
  }
  if (input.environment !== environment) {
    throw configurationError(
      "access_credential_environment_mismatch",
      "Credential metadata belongs to another service environment.",
      { expected_environment: environment, credential_environment: input.environment ?? null },
    );
  }
  if (typeof input.token_sha256 !== "string" || !TOKEN_DIGEST.test(input.token_sha256)) {
    throw configurationError(
      "access_credential_invalid",
      "Credential metadata must contain a lowercase SHA-256 token digest.",
      { field: "token_sha256" },
    );
  }
  const permissions = input.permissions ?? [...rolePermissions];
  if (
    !Array.isArray(permissions) ||
    permissions.length === 0 ||
    permissions.some(
      (permission) =>
        typeof permission !== "string" ||
        !PERMISSIONS.has(permission) ||
        !rolePermissions.has(permission),
    )
  ) {
    throw configurationError(
      "access_credential_permission_invalid",
      "Credential permissions must be a non-empty subset of its role permissions.",
    );
  }
  if (!Number.isInteger(input.generation ?? 1) || (input.generation ?? 1) < 1) {
    throw configurationError(
      "access_credential_invalid",
      "Credential generation must be a positive integer.",
      { field: "generation" },
    );
  }
  if (input.expires_at !== null && input.expires_at !== undefined) {
    if (typeof input.expires_at !== "string" || !Number.isFinite(Date.parse(input.expires_at))) {
      throw configurationError("access_credential_invalid", "Credential expiry is invalid.", {
        field: "expires_at",
      });
    }
  }
  if (!["active", "revoked"].includes(input.status ?? "active")) {
    throw configurationError("access_credential_invalid", "Credential status is invalid.", {
      field: "status",
    });
  }
  return Object.freeze({
    id: requireIdentifier(input.id, "id", ["key"]),
    token_sha256: input.token_sha256,
    environment,
    tenant_id: requireIdentifier(input.tenant_id, "tenant_id", ["ten"]),
    principal_id: requireIdentifier(input.principal_id, "principal_id", ["usr", "agt"]),
    role: input.role,
    permissions: Object.freeze(new Set(permissions)),
    account_ids: Object.freeze(identifierList(input.account_ids, "account_ids", "acct")),
    agent_ids: Object.freeze(identifierList(input.agent_ids, "agent_ids", "agt")),
    generation: input.generation ?? 1,
    expires_at: input.expires_at ?? null,
    status: input.status ?? "active",
  });
}

export function credentialMetadata({ token, ...metadata }, environment) {
  if (typeof token !== "string" || token.length < 32) {
    throw configurationError(
      "access_credential_invalid",
      "API key material must contain at least 32 characters.",
    );
  }
  const normalized = normalizeAccessCredential(
    { ...metadata, environment, token_sha256: sha256(token) },
    environment,
  );
  return Object.freeze({
    ...normalized,
    permissions: Object.freeze([...normalized.permissions].sort()),
    account_ids: Object.freeze([...normalized.account_ids]),
    agent_ids: Object.freeze([...normalized.agent_ids]),
  });
}

function loadCredentialArray(source) {
  const raw = source.BU2_API_CREDENTIALS_JSON;
  if (raw === undefined || raw === "") return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw configurationError(
      "access_credentials_invalid_json",
      "BU2_API_CREDENTIALS_JSON must be valid JSON.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw configurationError(
      "access_credentials_invalid_json",
      "BU2_API_CREDENTIALS_JSON must contain an array.",
    );
  }
  return parsed;
}

export function permissionForRequest(method, pathname) {
  if (method === "OPTIONS") return null;
  if (method === "GET" && (pathname === "/health" || pathname === "/v1/environment")) {
    return null;
  }
  if (method === "GET" && /^\/v1\/receipts\/[^/]+\/verify$/.test(pathname)) return null;
  if (method === "GET" && pathname === "/v1/access") return "identity:read";
  if (method === "GET" && pathname === "/v1/payment_mandates") return "mandates:read";
  if (method === "GET" && pathname === "/v1/receivables") return "receivables:read";
  if (method === "POST" && pathname === "/v1/receivables") return "receivables:create";
  if (method === "GET" && /^\/v1\/receivables\/[^/]+$/.test(pathname)) return "receivables:read";
  if (method === "GET" && pathname === "/v1/collections") return "collections:read";
  if (method === "GET" && /^\/v1\/collections\/[^/]+$/.test(pathname)) return "collections:read";
  if (method === "POST" && /^\/v1\/receivables\/[^/]+\/collections$/.test(pathname)) return "collections:create";
  if (method === "GET" && pathname === "/v1/access_grants") return "access_grants:read";
  if (method === "GET" && /^\/v1\/access_grants\/[^/]+$/.test(pathname)) return "access_grants:read";
  if (method === "POST" && /^\/v1\/collections\/[^/]+\/access_grants$/.test(pathname)) return "access_grants:create";
  if (method === "POST" && /^\/v1\/access_grants\/[^/]+\/recover$/.test(pathname)) return "access_grants:create";
  if (method === "POST" && pathname === "/v1/payment_mandates") return "mandates:manage";
  if (method === "GET" && /^\/v1\/payment_mandates\/[^/]+$/.test(pathname)) return "mandates:read";
  if (method === "POST" && /^\/v1\/payment_mandates\/[^/]+\/(activate|suspend|revoke|expire)$/.test(pathname)) return "mandates:manage";
  if (method === "POST" && /^\/v1\/payment_intents\/[^/]+\/execution$/.test(pathname)) {
    return "payment_intents:execute";
  }
  if (method === "POST" && pathname === "/v1/quotes") return "quotes:create";
  if (method === "POST" && pathname === "/v1/payment_intents") {
    return "payment_intents:create";
  }
  if (method === "GET" && /^\/v1\/payment_intents\/[^/]+$/.test(pathname)) {
    return "payment_intents:read";
  }
  if (method === "POST" && /^\/v1\/payment_intents\/[^/]+\/authorization$/.test(pathname)) {
    return "authorizations:decide";
  }
  if (method === "GET" && /^\/v1\/transactions(?:\/[^/]+)?$/.test(pathname)) {
    return "transactions:read";
  }
  if (method === "POST" && /^\/v1\/transactions\/[^/]+\/deliveries$/.test(pathname)) {
    return "deliveries:create";
  }
  if (method === "POST" && /^\/v1\/transactions\/[^/]+\/settlements$/.test(pathname)) {
    return "settlements:create";
  }
  if (
    method === "POST" &&
    /^\/v1\/transactions\/[^/]+\/settlement_recoveries$/.test(pathname)
  ) {
    return "settlements:recover";
  }
  if (method === "GET" && /^\/v1\/receipts\/[^/]+$/.test(pathname)) {
    return "receipts:read";
  }
  if (method === "GET" && ["/v1/events", "/v1/ledger"].includes(pathname)) {
    return "ledger:read";
  }
  if (
    method === "GET" &&
    (pathname === "/v1/webhook_outbox" ||
      pathname === "/v1/webhook_dead_letters" ||
      /^\/v1\/webhook_outbox\/[^/]+\/attempts$/.test(pathname))
  ) {
    return "webhooks:operate";
  }
  if (
    method === "POST" &&
    (pathname === "/v1/webhook_subscriptions" ||
      /^\/v1\/webhook_subscriptions\/[^/]+\/secret_rotations$/.test(pathname))
  ) {
    return "webhooks:manage";
  }
  if (
    method === "POST" &&
    (pathname === "/v1/webhooks/dispatch" ||
      /^\/v1\/webhook_outbox\/[^/]+\/replays$/.test(pathname))
  ) {
    return "webhooks:operate";
  }
  if (method === "POST" && pathname === "/v1/operations/support_bundles") {
    return "support:read";
  }
  if (method === "POST" && /^\/v1\/operations\/tenants\/[^/]+\/resets$/.test(pathname)) {
    return "tenants:reset";
  }
  return "route:unknown";
}

function bearerToken(headers) {
  const value = headers.authorization;
  if (typeof value !== "string") return null;
  const match = value.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  return match?.[1] ?? null;
}

function tokenMatches(tokenDigest, credentialDigest) {
  const left = Buffer.from(tokenDigest, "hex");
  const right = Buffer.from(credentialDigest, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

const localActor = Object.freeze({
  credential_id: "key_local_development",
  environment: "local",
  tenant_id: "ten_local_development",
  principal_id: "usr_local_developer",
  role: "operator",
  permissions: new Set(PERMISSIONS),
  account_ids: Object.freeze([]),
  agent_ids: Object.freeze([]),
  platform_access: true,
  development_open: true,
  generation: null,
});

export class AccessController {
  constructor({ environmentConfig, ledger, mode, credentials, now = () => Date.now() } = {}) {
    this.environment = environmentConfig?.environment ?? "local";
    this.ledger = ledger;
    this.now = now;
    this.mode = mode ?? (this.environment === "local" ? "development_open" : "authenticated");
    if (!ACCESS_CONTRACT.modes.includes(this.mode)) {
      throw configurationError("access_mode_invalid", "Access mode is invalid.", {
        mode: this.mode,
      });
    }
    if (this.mode === "development_open" && this.environment !== "local") {
      throw configurationError(
        "external_access_authentication_required",
        "Sandbox and Live cannot use development-open access.",
        { environment: this.environment },
      );
    }
    this.credentials = Object.freeze(
      (credentials ?? []).map((credential) =>
        credential.token_sha256
          ? normalizeAccessCredential(credential, this.environment)
          : credentialMetadata(credential, this.environment),
      ),
    );
    const ids = new Set();
    const digests = new Set();
    for (const credential of this.credentials) {
      if (ids.has(credential.id) || digests.has(credential.token_sha256)) {
        throw configurationError(
          "access_credential_duplicate",
          "Credential IDs and token digests must be unique inside one environment.",
        );
      }
      ids.add(credential.id);
      digests.add(credential.token_sha256);
    }
    try {
      for (const credential of this.credentials) {
        this.ledger?.reconcileAccessCredential(
          {
            ...credential,
            account_ids: [...credential.account_ids],
            agent_ids: [...credential.agent_ids],
          },
          this.environment,
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw configurationError(
          "access_identity_binding_conflict",
          "Configured credentials conflict with persisted identity ownership.",
          { code: error.code, details: error.details ?? {} },
        );
      }
      throw error;
    }
  }

  record({ context, permission, actor = null, outcome, reasonCode }) {
    this.ledger?.recordAccessDecision({
      id: `acd_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      environment: this.environment,
      credential_id: actor?.credential_id ?? null,
      tenant_id: actor?.tenant_id ?? null,
      principal_id: actor?.principal_id ?? null,
      role: actor?.role ?? null,
      permission,
      method: context.method,
      path: context.pathname,
      resource_id: context.resourceId ?? null,
      outcome,
      reason_code: reasonCode,
      request_id: context.requestId,
      trace_id: context.traceId,
      created_at: new Date(this.now()).toISOString(),
    });
  }

  authenticate(headers, context) {
    const permission = permissionForRequest(context.method, context.pathname);
    if (permission === null) return null;
    if (permission === "route:unknown") return this.mode === "development_open" ? localActor : null;
    if (this.mode === "development_open") return localActor;

    const token = bearerToken(headers);
    if (!token || token.length < 32) {
      this.record({ context, permission, outcome: "denied", reasonCode: "credential_missing" });
      throw authError(401, "credential_required", "A valid BU2 bearer API key is required.");
    }
    const tokenDigest = sha256(token);
    const credential = this.credentials.find((candidate) =>
      tokenMatches(tokenDigest, candidate.token_sha256),
    );
    if (!credential) {
      this.record({ context, permission, outcome: "denied", reasonCode: "credential_unknown" });
      throw authError(401, "credential_invalid", "The BU2 API key is invalid.");
    }
    const actor = {
      credential_id: credential.id,
      environment: credential.environment,
      tenant_id: credential.tenant_id,
      principal_id: credential.principal_id,
      role: credential.role,
      permissions: credential.permissions,
      account_ids: credential.account_ids,
      agent_ids: credential.agent_ids,
      platform_access: credential.role === "operator",
      development_open: false,
      generation: credential.generation,
    };
    const tenantState = this.ledger?.tenantAccessState(this.environment, credential.tenant_id) ?? {
      generation: 1,
      status: "active",
    };
    let reasonCode = null;
    if (credential.status !== "active") reasonCode = "credential_revoked";
    else if (credential.expires_at && Date.parse(credential.expires_at) <= this.now()) {
      reasonCode = "credential_expired";
    } else if (tenantState.status !== "active") reasonCode = "tenant_access_disabled";
    else if (tenantState.generation !== credential.generation) reasonCode = "credential_reset";
    const binding = this.ledger?.identityCredentialBinding(this.environment, credential.id);
    if (!reasonCode && (!binding || binding.token_sha256 !== credential.token_sha256)) {
      reasonCode = "credential_unbound";
    } else if (!reasonCode && binding.status !== credential.status) {
      reasonCode = "credential_binding_status_mismatch";
    } else if (!reasonCode && binding.generation !== credential.generation) {
      reasonCode = "credential_binding_generation_mismatch";
    }
    const identity = this.ledger?.identityBundleForActor(this.environment, {
      ...actor,
      development_open: false,
    });
    if (!reasonCode && !identity?.principal) reasonCode = "credential_unbound";
    else if (!reasonCode && identity.principal.status !== "active") {
      reasonCode = "identity_disabled";
    } else if (!reasonCode && identity.principal.generation !== credential.generation) {
      reasonCode = "identity_generation_mismatch";
    }
    if (reasonCode) {
      this.record({ context, permission, actor, outcome: "denied", reasonCode });
      throw authError(401, reasonCode, "The BU2 API key is no longer active.");
    }
    if (!credential.permissions.has(permission)) {
      this.record({
        context,
        permission,
        actor,
        outcome: "denied",
        reasonCode: "permission_denied",
      });
      throw authError(403, "permission_denied", "The caller cannot perform this operation.", {
        required_permission: permission,
      });
    }
    this.record({ context, permission, actor, outcome: "allowed", reasonCode: "permission_granted" });
    return actor;
  }

  publicActor(actor) {
    if (!actor) return null;
    return {
      mode: this.mode,
      authenticated: actor.development_open !== true,
      environment: actor.environment,
      tenant_id: actor.tenant_id,
      principal_id: actor.principal_id,
      role: actor.role,
      permissions: [...actor.permissions].sort(),
      account_ids: [...actor.account_ids],
      agent_ids: [...actor.agent_ids],
      credential_generation: actor.generation,
      identity: this.ledger?.identityBundleForActor(this.environment, actor) ?? null,
      wallet_bindings: this.ledger?.walletBindingsForActor(this.environment, actor) ?? null,
    };
  }

  assertClaims(actor, { accountIds = [], agentIds = [] } = {}, context = null) {
    if (!actor || actor.platform_access) return;
    const unknownAccounts = accountIds.filter((id) => !actor.account_ids.includes(id));
    const unknownAgents = agentIds.filter((id) => !actor.agent_ids.includes(id));
    if (unknownAccounts.length > 0 || unknownAgents.length > 0) {
      if (context) {
        this.record({
          context,
          permission: permissionForRequest(context.method, context.pathname),
          actor,
          outcome: "denied",
          reasonCode: "resource_scope_denied",
        });
      }
      throw authError(
        403,
        "resource_scope_denied",
        "The caller cannot act for one or more account or Agent identities.",
        {
          account_count: unknownAccounts.length,
          agent_count: unknownAgents.length,
        },
      );
    }
    this.ledger?.assertIdentityClaims(this.environment, actor, { accountIds, agentIds });
  }

  canAccessView(actor, view) {
    if (!actor || actor.platform_access) return true;
    const intent = view?.payment_intent ?? view;
    const quote = view?.quote ?? null;
    const accounts = new Set([
      intent?.payer_account_id,
      intent?.payee_account_id,
      quote?.payee_account_id,
    ]);
    const agents = new Set([
      intent?.buyer_agent_id,
      intent?.seller_agent_id,
      quote?.seller_agent_id,
    ]);
    return (
      actor.account_ids.some((id) => accounts.has(id)) ||
      actor.agent_ids.some((id) => agents.has(id))
    );
  }

  assertView(actor, view, context = null) {
    if (!this.canAccessView(actor, view)) {
      if (context) {
        this.record({
          context,
          permission: permissionForRequest(context.method, context.pathname),
          actor,
          outcome: "denied",
          reasonCode: "resource_scope_denied",
        });
      }
      throw authError(404, "resource_not_found", "The requested resource was not found.");
    }
    return view;
  }

  filterTransactionViews(actor, views) {
    return actor?.platform_access ? views : views.filter((view) => this.canAccessView(actor, view));
  }

  filterMandates(actor, mandates) {
    if (actor?.platform_access) return mandates;
    return mandates.filter((mandate) =>
      actor.account_ids.includes(mandate.account_id) || actor.agent_ids.includes(mandate.agent_id),
    );
  }

  filterReceivables(actor, receivables) {
    if (actor?.platform_access) return receivables;
    return receivables.filter((receivable) =>
      actor.account_ids.includes(receivable.account_id) || actor.agent_ids.includes(receivable.agent_id),
    );
  }

  filterCollections(actor, collections) {
    if (actor?.platform_access) return collections;
    return collections.filter((collection) =>
      actor.account_ids.includes(collection.account_id) || actor.agent_ids.includes(collection.agent_id),
    );
  }

  filterAccessGrants(actor, grants) {
    if (actor?.platform_access) return grants;
    return grants.filter((grant) =>
      actor.account_ids.includes(grant.account_id) || actor.agent_ids.includes(grant.agent_id),
    );
  }
}

export function loadAccessController({ environmentConfig, ledger, source = process.env } = {}) {
  const mode = source.BU2_ACCESS_MODE;
  return new AccessController({
    environmentConfig,
    ledger,
    mode,
    credentials: loadCredentialArray(source),
  });
}

export function sanitizedAccessContract() {
  return clone({
    schema_version: ACCESS_CONTRACT.schema_version,
    credential_type: ACCESS_CONTRACT.credential_type,
    roles: Object.keys(ACCESS_CONTRACT.roles),
  });
}
