import { walletStatus } from "./x402-wallet.mjs";

console.log(JSON.stringify(await walletStatus(), null, 2));
