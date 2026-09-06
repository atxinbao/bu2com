import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flow = JSON.parse(
  readFileSync(join(here, 'examples/payment-flow.json'), 'utf8'),
);
const mcp = JSON.parse(readFileSync(join(here, 'mcp-tools.json'), 'utf8'));
const versions = JSON.parse(
  readFileSync(join(here, 'contract-versions.json'), 'utf8'),
);
const doctor = JSON.parse(
  readFileSync(join(here, 'doctor-result.schema.json'), 'utf8'),
);
const cleanRoom = JSON.parse(
  readFileSync(join(here, 'clean-room-evidence.schema.json'), 'utf8'),
);
const environmentContract = JSON.parse(
  readFileSync(join(here, 'environment-contract.json'), 'utf8'),
);
const openapi = readFileSync(join(here, 'openapi.yaml'), 'utf8');

let assertions = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  assertions += 1;
}

assert(flow.quote.id.startsWith('quo_'), 'quote id prefix');
assert(flow.payment_intent.id.startsWith('pi_'), 'payment intent id prefix');
assert(flow.transaction.id.startsWith('txn_'), 'transaction id prefix');
assert(flow.receipt.id.startsWith('rcpt_'), 'receipt id prefix');
assert(
  flow.payment_intent.quote_id === flow.quote.id,
  'payment intent must bind to quote',
);
assert(
  flow.transaction.payment_intent_id === flow.payment_intent.id,
  'transaction must bind to payment intent',
);
assert(
  flow.delivery.transaction_id === flow.transaction.id,
  'delivery must bind to transaction',
);
assert(
  flow.receipt.transaction_id === flow.transaction.id,
  'receipt must bind to transaction',
);
assert(
  flow.receipt.schema_version === versions.receipt_current &&
    flow.receipt.canonicalization_version === 'RFC8785-JCS-1',
  'receipt example must use the current trusted canonicalization',
);
assert(
  flow.receipt.environment_contract_version === environmentContract.schema_version &&
    flow.receipt.environment === 'local' &&
    flow.receipt.execution_backend === 'simulated' &&
    flow.receipt.chain_id === null &&
    flow.receipt.network === null,
  'receipt example must bind the local simulated environment contract',
);
const { authorized_amount, reserved_amount, settled_amount, refunded_amount } =
  flow.transaction;
assert(
  refunded_amount.value <= settled_amount.value &&
    settled_amount.value <= reserved_amount.value &&
    reserved_amount.value <= authorized_amount.value,
  'amount invariant: refunded <= settled <= reserved <= authorized',
);
assert(
  [authorized_amount, reserved_amount, settled_amount, refunded_amount].every(
    (amount) => Number.isInteger(amount.value) && amount.currency === 'CNY',
  ),
  'amounts must use integer minor units and one currency',
);
assert(
  flow.receipt.amount.value === settled_amount.value &&
    flow.receipt.amount.currency === settled_amount.currency,
  'receipt amount must bind to settled amount',
);
assert(mcp.tools.length === 6, 'MCP contract must expose 6 bounded tools');
assert(
  new Set(mcp.tools.map((tool) => tool.name)).size === mcp.tools.length,
  'MCP tool names must be unique',
);
assert(
  mcp.tools.every(
    (tool) =>
      tool.inputSchema.type === 'object' &&
      tool.inputSchema.additionalProperties === false,
  ),
  'MCP inputs must be closed object schemas',
);
assert(mcp.contract_status === 'phase0-frozen', 'MCP contract must be Phase 0 frozen');
assert(
  mcp.version === versions.mcp_tools,
  'MCP runtime version manifest must match mcp-tools.json',
);
assert(
  openapi.includes(`version: ${versions.agent_payment_api}`),
  'API runtime version manifest must match OpenAPI',
);
assert(versions.api_base_path === '/v1', 'API base path must remain /v1');
assert(
  doctor.properties.schema_version.const === versions.doctor_result,
  'Doctor result schema version must match the runtime manifest',
);
assert(
  doctor.properties.checks.minItems === 7 &&
    doctor.properties.checks.maxItems === 7,
  'Doctor result must preserve all seven integration stages',
);
assert(
  doctor.properties.analytics.properties.remote_enabled.const === false &&
    doctor.properties.analytics.properties.persistence.const === 'none',
  'Doctor analytics must keep remote upload and persistence disabled',
);
assert(
  cleanRoom.properties.schema_version.const === versions.clean_room_evidence,
  'Clean-room evidence schema version must match the runtime manifest',
);
assert(
  cleanRoom.properties.paths.minItems === 3 && cleanRoom.properties.paths.maxItems === 3,
  'Clean-room evidence must preserve exactly three integration paths',
);
assert(
  cleanRoom.properties.environment.const === 'local' &&
    cleanRoom.properties.environment_contract_version.const ===
      environmentContract.schema_version &&
    cleanRoom.properties.execution_backend.const === 'simulated' &&
    cleanRoom.properties.max_elapsed_ms.const === 900000,
  'Clean-room evidence must remain local simulated and bounded to 15 minutes',
);
assert(
  environmentContract.public_environments.join(',') === 'sandbox,live',
  'Public environment contract must expose only sandbox and live',
);
assert(
  environmentContract.environments.local.payment_adapter === 'simulated' &&
    environmentContract.environments.sandbox.network === 'eip155:84532' &&
    environmentContract.environments.live.network === 'eip155:8453',
  'Environment contract must preserve the three approved runtime combinations',
);
assert(
  versions.environment_contract === environmentContract.schema_version &&
    JSON.stringify(versions.receipt_supported) ===
      JSON.stringify(environmentContract.receipt_schema_versions),
  'Version manifest must match environment and Receipt compatibility contracts',
);
assert(openapi.includes('/environment:'), 'OpenAPI must expose environment preflight');
assert(
  cleanRoom.properties.analytics.properties.remote_enabled.const === false &&
    cleanRoom.properties.analytics.properties.persistence.const === 'none',
  'Clean-room evidence must keep remote upload and persistence disabled',
);
assert(
  openapi.includes('x-bu2-contract-status: phase0-frozen'),
  'OpenAPI contract must be Phase 0 frozen',
);
assert(openapi.includes('PageCursor:'), 'OpenAPI must define cursor pagination');
assert(openapi.includes('TransactionPage:'), 'OpenAPI must define transaction pages');
assert(openapi.includes('X-Request-Id:'), 'OpenAPI must expose request correlation ids');
assert(openapi.includes('X-Trace-Id:'), 'OpenAPI must expose trace correlation ids');
assert(openapi.includes('TraceId:'), 'OpenAPI must define trace identifier headers');
assert(openapi.includes('trace_id:'), 'OpenAPI errors and records must expose trace ids');
assert(
  openapi.includes('/receipts/{receipt_id}/verify:'),
  'OpenAPI must expose receipt verification',
);
assert(
  ['signature_valid', 'issuer_trusted', 'settlement_confirmed', 'environment_valid'].every((field) =>
    openapi.includes(`${field}:`),
  ),
  'OpenAPI must separate signature, issuer trust, and settlement confirmation',
);
assert(
  openapi.includes('/webhook_dead_letters:'),
  'OpenAPI must expose Webhook dead-letter inspection',
);
assert(
  openapi.includes('/webhook_subscriptions/{subscription_id}/secret_rotations:'),
  'OpenAPI must expose versioned Webhook secret rotation',
);
assert(
  openapi.includes('/webhook_outbox/{outbox_id}/replays:'),
  'OpenAPI must expose audited Webhook replay',
);
assert(
  openapi.includes('WebhookDeliveryAttempt:'),
  'OpenAPI must define immutable delivery-attempt audit records',
);
assert(
  openapi.includes('/transactions/{transaction_id}/settlement_recoveries:'),
  'OpenAPI must expose explicit settlement recovery',
);
assert(
  openapi.includes('SettlementRecoveryResult:'),
  'OpenAPI must define unknown and settled recovery results',
);
assert(
  (openapi.match(/secret: \{[^\n]+writeOnly: true \}/g) ?? []).length === 2,
  'OpenAPI must accept secrets only as write-only input',
);

console.log(
  `BU2 contract validation passed: ${assertions} invariants, ${mcp.tools.length} MCP tools.`,
);
