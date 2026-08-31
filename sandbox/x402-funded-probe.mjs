import { readBuyerPrivateKey } from "./x402-wallet.mjs";

process.env.X402_BUYER_PRIVATE_KEY = readBuyerPrivateKey();
await import("./x402-probe.mjs");
