import express from "express";
import { pathToFileURL } from "node:url";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { merchantAccount } from "./x402-wallet.mjs";

export const X402_NETWORK = "eip155:84532";
export const X402_PRICE = "$0.01";
export const X402_FACILITATOR = "https://x402.org/facilitator";

function defaultPayTo() {
  if (process.env.X402_PAY_TO) return process.env.X402_PAY_TO;
  try {
    return merchantAccount().address;
  } catch {
    return privateKeyToAccount(generatePrivateKey()).address;
  }
}

export function createX402Merchant({
  payTo = defaultPayTo(),
  facilitatorUrl = process.env.X402_FACILITATOR_URL ?? X402_FACILITATOR,
  facilitatorClient = null,
  syncFacilitatorOnStart = true,
} = {}) {
  const app = express();
  const facilitator = facilitatorClient ?? new HTTPFacilitatorClient({ url: facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    X402_NETWORK,
    new ExactEvmScheme(),
  );

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "bu2-x402-merchant",
      protocol_version: 2,
      network: X402_NETWORK,
      facilitator: facilitatorUrl,
      pay_to: payTo,
    });
  });

  app.use(
    paymentMiddleware(
      {
        "GET /premium-data": {
          accepts: {
            scheme: "exact",
            price: X402_PRICE,
            network: X402_NETWORK,
            payTo,
            maxTimeoutSeconds: 60,
          },
          description: "BU2 x402 sandbox premium dataset",
          mimeType: "application/json",
        },
      },
      resourceServer,
      undefined,
      undefined,
      syncFacilitatorOnStart,
    ),
  );

  app.get("/premium-data", (_request, response) => {
    response.json({
      dataset_id: "bu2_sandbox_market_001",
      delivered_at: new Date().toISOString(),
      rows: [{ market: "agent-payments", signal: "sandbox" }],
    });
  });

  return { app, payTo, facilitator };
}

export async function listenX402Merchant({
  port = Number(process.env.X402_MERCHANT_PORT ?? 4021),
  host = "127.0.0.1",
  ...options
} = {}) {
  const merchant = createX402Merchant(options);
  const server = await new Promise((resolve, reject) => {
    const candidate = merchant.app.listen(port, host, () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  return { ...merchant, server, url: `http://${host}:${address.port}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await listenX402Merchant();
  console.log(`BU2 x402 merchant listening on ${running.url}`);
  console.log(`Protected resource: ${running.url}/premium-data`);
  console.log(`Base Sepolia receiver: ${running.payTo}`);
}
