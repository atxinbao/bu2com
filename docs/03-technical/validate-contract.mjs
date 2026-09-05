import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flow = JSON.parse(
  readFileSync(join(here, 'examples/payment-flow.json'), 'utf8'),
);
const mcp = JSON.parse(readFileSync(join(here, 'mcp-tools.json'), 'utf8'));
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
  openapi.includes('x-bu2-contract-status: phase0-frozen'),
  'OpenAPI contract must be Phase 0 frozen',
);
assert(openapi.includes('PageCursor:'), 'OpenAPI must define cursor pagination');
assert(openapi.includes('TransactionPage:'), 'OpenAPI must define transaction pages');
assert(openapi.includes('X-Request-Id:'), 'OpenAPI must expose request correlation ids');
assert(
  openapi.includes('/receipts/{receipt_id}/verify:'),
  'OpenAPI must expose receipt verification',
);

console.log(
  `BU2 contract validation passed: ${assertions} invariants, ${mcp.tools.length} MCP tools.`,
);
