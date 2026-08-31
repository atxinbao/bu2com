import { fileURLToPath } from "node:url";
import { listen } from "./server.mjs";
import { buyerAccount, readBuyerPrivateKey } from "./x402-wallet.mjs";

const running = await listen({
  port: Number(process.env.BU2_X402_PORT ?? 3101),
  dbPath:
    process.env.BU2_X402_DB ??
    fileURLToPath(new URL("./data/bu2-x402.sqlite", import.meta.url)),
  adapterMode: "x402",
  x402ResourceUrl: process.env.X402_RESOURCE_URL ?? "http://127.0.0.1:4021/premium-data",
  x402BuyerPrivateKey: readBuyerPrivateKey(),
});

console.log(`BU2 x402 Reference Server listening on ${running.url}`);
console.log(`Buyer address: ${buyerAccount().address}`);
