import { decodePaymentRequiredHeader } from "@x402/core/http";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const merchantUrl = process.env.X402_RESOURCE_URL ?? "http://127.0.0.1:4021/premium-data";
const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const response = await fetch(merchantUrl, { headers: { accept: "application/json" } });
const encoded = response.headers.get("payment-required");
if (response.status !== 402 || !encoded) {
  throw new Error(`Expected x402 challenge, received HTTP ${response.status}`);
}
const challenge = decodePaymentRequiredHeader(encoded);
const supported = await new HTTPFacilitatorClient({ url: facilitatorUrl }).getSupported();
const capability = supported.kinds.find(
  (item) =>
    item.x402Version === 2 && item.scheme === "exact" && item.network === "eip155:84532",
);

const result = {
  protocol_ready: challenge.x402Version === 2 && Boolean(capability),
  merchant_status: response.status,
  challenge,
  facilitator_capability: capability ?? null,
  live_settlement: false,
  blocker: "X402_BUYER_PRIVATE_KEY is not configured with funded Base Sepolia USDC",
};

if (process.env.X402_BUYER_PRIVATE_KEY) {
  const account = privateKeyToAccount(process.env.X402_BUYER_PRIVATE_KEY);
  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(account) }],
  });
  const paid = await paidFetch(merchantUrl, { headers: { accept: "application/json" } });
  result.live_settlement = paid.ok && Boolean(paid.headers.get("payment-response"));
  result.blocker = result.live_settlement ? null : `Paid request returned HTTP ${paid.status}`;
  result.buyer_address = account.address;
  result.payment_response = paid.headers.get("payment-response");
}

console.log(JSON.stringify(result, null, 2));
