import { execFileSync } from "node:child_process";
import { createPublicClient, formatEther, formatUnits, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export const KEYCHAIN_SERVICE = "bu2-x402-base-sepolia";
export const KEYCHAIN_ACCOUNT = "buyer-private-key";
export const MERCHANT_KEYCHAIN_ACCOUNT = "merchant-private-key";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export function readKeychainPrivateKey(account) {
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    throw new Error(`Missing macOS Keychain item: ${KEYCHAIN_SERVICE}/${account}`);
  }
}

export function readBuyerPrivateKey() {
  return readKeychainPrivateKey(KEYCHAIN_ACCOUNT);
}

export function buyerAccount() {
  return privateKeyToAccount(readBuyerPrivateKey());
}

export function merchantAccount() {
  return privateKeyToAccount(readKeychainPrivateKey(MERCHANT_KEYCHAIN_ACCOUNT));
}

export async function walletStatus() {
  const address = buyerAccount().address;
  const client = createPublicClient({ chain: baseSepolia, transport: http() });
  const [eth, usdc] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  return {
    address,
    network: "Base Sepolia",
    eth: formatEther(eth),
    usdc: formatUnits(usdc, 6),
    ready: usdc >= 10_000n,
  };
}
