import { ApiError } from "./domain.mjs";

const ID = {
  tenant: /^ten_[A-Za-z0-9_-]+$/,
  principal: /^(usr|agt)_[A-Za-z0-9_-]+$/,
  account: /^acct_[A-Za-z0-9_-]+$/,
  agent: /^agt_[A-Za-z0-9_-]+$/,
  credential: /^key_[A-Za-z0-9_-]+$/,
  digest: /^[a-f0-9]{64}$/,
};

const ROLES = new Set(["agent", "developer", "operator"]);
const STATUSES = new Set(["active", "disabled", "revoked"]);
const PRINCIPAL_KINDS = new Set(["human", "service"]);

const invalid = (code, message, details = {}) =>
  new ApiError(400, "validation_error", code, message, details);

const requiredString = (value, field, maxLength = 255) => {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw invalid("identity_field_invalid", `${field} must be a non-empty string.`, { field });
  }
  return value;
};

const identifier = (value, field, pattern) => {
  if (typeof value !== "string" || !pattern.test(value) || value.length > 255) {
    throw invalid("identity_identifier_invalid", `${field} has an invalid identifier.`, { field });
  }
  return value;
};

const uniqueIdentifiers = (values, field, pattern) => {
  if (!Array.isArray(values)) {
    throw invalid("identity_field_invalid", `${field} must be an array.`, { field });
  }
  return [...new Set(values.map((value) => identifier(value, field, pattern)))].sort();
};

const normalizeStatus = (value, field, allowed = STATUSES) => {
  const status = value ?? "active";
  if (!allowed.has(status)) {
    throw invalid("identity_status_invalid", `${field} has an invalid status.`, { field });
  }
  return status;
};

const normalizePrincipal = (value, tenantId) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("identity_principal_invalid", "principal must be an object.");
  }
  const id = identifier(value.id, "principal.id", ID.principal);
  const kind = value.kind ?? (id.startsWith("usr_") ? "human" : "service");
  if (!PRINCIPAL_KINDS.has(kind)) {
    throw invalid("identity_principal_kind_invalid", "principal.kind is invalid.");
  }
  return {
    id,
    tenant_id: tenantId,
    kind,
    display_name: requiredString(value.display_name ?? id, "principal.display_name", 200),
    status: normalizeStatus(value.status, "principal.status", new Set(["active", "disabled"])),
    generation: Number.isInteger(value.generation) && value.generation >= 1 ? value.generation : 1,
  };
};

const normalizeAccount = (value, tenantId, ownerPrincipalId) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("identity_account_invalid", "accounts entries must be objects.");
  }
  const id = identifier(value.id, "account.id", ID.account);
  if (value.owner_principal_id !== undefined && value.owner_principal_id !== ownerPrincipalId) {
    throw invalid("identity_owner_mismatch", "Account owner must match the onboarding principal.", {
      account_id: id,
    });
  }
  return {
    id,
    tenant_id: tenantId,
    owner_principal_id: ownerPrincipalId,
    display_name: requiredString(value.display_name ?? id, "account.display_name", 200),
    status: normalizeStatus(value.status, "account.status", new Set(["active", "disabled"])),
    generation: Number.isInteger(value.generation) && value.generation >= 1 ? value.generation : 1,
  };
};

const normalizeAgent = (value, tenantId, ownerPrincipalId) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("identity_agent_invalid", "agents entries must be objects.");
  }
  const id = identifier(value.id, "agent.id", ID.agent);
  if (value.owner_principal_id !== undefined && value.owner_principal_id !== ownerPrincipalId) {
    throw invalid("identity_owner_mismatch", "Agent owner must match the onboarding principal.", {
      agent_id: id,
    });
  }
  return {
    id,
    tenant_id: tenantId,
    owner_principal_id: ownerPrincipalId,
    display_name: requiredString(value.display_name ?? id, "agent.display_name", 200),
    status: normalizeStatus(value.status, "agent.status", new Set(["active", "disabled"])),
    generation: Number.isInteger(value.generation) && value.generation >= 1 ? value.generation : 1,
  };
};

const normalizeCredential = (value, tenantId, ownerPrincipalId, accountIds, agentIds) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("identity_credential_invalid", "credentials entries must be objects.");
  }
  if (Object.hasOwn(value, "token")) {
    throw invalid(
      "onboarding_token_material_forbidden",
      "Onboarding accepts token digests only; raw token material must not be persisted or submitted.",
    );
  }
  const id = identifier(value.id, "credential.id", ID.credential);
  const tokenSha256 = value.token_sha256;
  if (typeof tokenSha256 !== "string" || !ID.digest.test(tokenSha256)) {
    throw invalid(
      "identity_credential_digest_invalid",
      "credential.token_sha256 must be a lowercase SHA-256 digest.",
    );
  }
  if (!ROLES.has(value.role)) {
    throw invalid("identity_credential_role_invalid", "credential.role is invalid.");
  }
  if (
    value.expires_at !== undefined &&
    value.expires_at !== null &&
    (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at)))
  ) {
    throw invalid("identity_credential_expiry_invalid", "credential.expires_at is invalid.");
  }
  const claimedAccounts = uniqueIdentifiers(value.account_ids ?? [], "credential.account_ids", ID.account);
  const claimedAgents = uniqueIdentifiers(value.agent_ids ?? [], "credential.agent_ids", ID.agent);
  if (claimedAccounts.some((accountId) => !accountIds.has(accountId))) {
    throw invalid(
      "identity_credential_claim_unknown",
      "Credential account claims must refer to accounts in the same onboarding bundle.",
      { credential_id: id },
    );
  }
  if (claimedAgents.some((agentId) => !agentIds.has(agentId))) {
    throw invalid(
      "identity_credential_claim_unknown",
      "Credential Agent claims must refer to Agents in the same onboarding bundle.",
      { credential_id: id },
    );
  }
  const principalId = value.principal_id ?? (value.role === "agent" ? claimedAgents[0] : ownerPrincipalId);
  identifier(principalId, "credential.principal_id", ID.principal);
  if (
    value.role === "agent" &&
    principalId !== ownerPrincipalId &&
    !claimedAgents.includes(principalId)
  ) {
    throw invalid(
      "identity_credential_principal_invalid",
      "Agent credentials must use an Agent identity from the same onboarding bundle.",
      { credential_id: id },
    );
  }
  if (value.role !== "agent" && principalId !== ownerPrincipalId) {
    throw invalid(
      "identity_owner_mismatch",
      "Developer and operator credentials must use the onboarding owner Principal.",
      { credential_id: id },
    );
  }
  return {
    id,
    tenant_id: tenantId,
    principal_id: principalId,
    role: value.role,
    token_sha256: tokenSha256,
    account_ids: claimedAccounts,
    agent_ids: claimedAgents,
    generation: Number.isInteger(value.generation) && value.generation >= 1 ? value.generation : 1,
    expires_at: value.expires_at ?? null,
    status: normalizeStatus(value.status, "credential.status"),
  };
};

export function normalizeOnboardingDocument(input, expectedEnvironment = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("onboarding_document_invalid", "Onboarding document must be an object.");
  }
  const environment = input.environment;
  if (!["local", "sandbox", "live"].includes(environment) || environment !== expectedEnvironment && expectedEnvironment !== null) {
    throw invalid("onboarding_environment_invalid", "Onboarding environment is invalid or mismatched.", {
      environment,
      expected_environment: expectedEnvironment,
    });
  }
  if (environment === "live") {
    throw invalid(
      "onboarding_live_forbidden",
      "F06a onboarding is limited to local or Sandbox and cannot provision Live identities.",
    );
  }
  const requestedBy = identifier(input.requested_by ?? "usr_local_operator", "requested_by", ID.principal);
  const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key", 255);
  if (!Array.isArray(input.tenants) || input.tenants.length === 0) {
    throw invalid("onboarding_tenants_required", "Onboarding document must contain at least one tenant.");
  }
  const tenants = input.tenants.map((tenant) => {
    if (!tenant || typeof tenant !== "object" || Array.isArray(tenant)) {
      throw invalid("onboarding_tenant_invalid", "Each onboarding tenant must be an object.");
    }
    const tenantId = identifier(tenant.tenant_id, "tenant_id", ID.tenant);
    const principal = normalizePrincipal(tenant.principal, tenantId);
    const accounts = (tenant.accounts ?? []).map((account) =>
      normalizeAccount(account, tenantId, principal.id),
    );
    const agents = (tenant.agents ?? []).map((agent) =>
      normalizeAgent(agent, tenantId, principal.id),
    );
    const accountIds = new Set(accounts.map((account) => account.id));
    const agentIds = new Set(agents.map((agent) => agent.id));
    const credentials = (tenant.credentials ?? []).map((credential) =>
      normalizeCredential(credential, tenantId, principal.id, accountIds, agentIds),
    );
    if (new Set(accounts.map((account) => account.id)).size !== accounts.length) {
      throw invalid("onboarding_duplicate_account", "Account IDs must be unique in one tenant.");
    }
    if (new Set(agents.map((agent) => agent.id)).size !== agents.length) {
      throw invalid("onboarding_duplicate_agent", "Agent IDs must be unique in one tenant.");
    }
    if (new Set(credentials.map((credential) => credential.id)).size !== credentials.length) {
      throw invalid("onboarding_duplicate_credential", "Credential IDs must be unique in one tenant.");
    }
    return { tenant_id: tenantId, principal, accounts, agents, credentials };
  });
  if (new Set(tenants.map((tenant) => tenant.tenant_id)).size !== tenants.length) {
    throw invalid("onboarding_duplicate_tenant", "Tenant IDs must be unique in one document.");
  }
  return {
    environment,
    requested_by: requestedBy,
    idempotency_key: idempotencyKey,
    tenants,
  };
}

export function credentialOnboardingBundle(credential, environment) {
  const principalId = credential.principal_id;
  const agentIds = [...(credential.agent_ids ?? [])];
  if (principalId.startsWith("agt_") && !agentIds.includes(principalId)) {
    agentIds.push(principalId);
  }
  return {
    tenant_id: credential.tenant_id,
    principal: {
      id: principalId,
      display_name: principalId,
      kind: principalId.startsWith("usr_") ? "human" : "service",
      status: "active",
      generation: credential.generation ?? 1,
    },
    accounts: [...(credential.account_ids ?? [])].map((id) => ({
      id,
      display_name: id,
      status: "active",
      generation: 1,
    })),
    agents: agentIds.map((id) => ({
      id,
      display_name: id,
      status: "active",
      generation: 1,
    })),
    credentials: [
      {
        id: credential.id,
        principal_id: credential.principal_id,
        role: credential.role,
        token_sha256: credential.token_sha256,
        account_ids: [...(credential.account_ids ?? [])],
        agent_ids: agentIds,
        generation: credential.generation ?? 1,
        expires_at: credential.expires_at ?? null,
        status: credential.status ?? "active",
      },
    ],
    environment,
  };
}
