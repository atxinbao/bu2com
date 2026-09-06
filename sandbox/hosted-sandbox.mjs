import { pathToFileURL } from "node:url";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { ENVIRONMENT_REGISTRY } from "./environment-config.mjs";
import { listen } from "./server.mjs";
import { readHostedSandboxSecrets } from "./runtime-secrets.mjs";

const REQUIRED = Object.freeze({
  environment: "sandbox",
  adapterMode: "x402",
  chainId: baseSepolia.id,
  network: `eip155:${baseSepolia.id}`,
  asset: ENVIRONMENT_REGISTRY.sandbox.asset,
  executionStatus: "execution_enabled",
  signerEnvironment: "sandbox",
  providerNetwork: `eip155:${baseSepolia.id}`,
  providerScheme: "exact",
  accessMode: "authenticated",
});

function resourceUrl(source) {
  let parsed;
  try {
    parsed = new URL(source.X402_RESOURCE_URL);
  } catch {
    throw new Error("X402_RESOURCE_URL must be an explicit HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("X402_RESOURCE_URL must use HTTP or HTTPS.");
  }
  return parsed.href;
}

export async function startHostedSandbox(source = process.env) {
  const secrets = readHostedSandboxSecrets(source);
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(secrets.rpcUrl),
  });
  return listen({
    ...REQUIRED,
    host: source.BU2_HOST ?? "0.0.0.0",
    port: Number(source.BU2_SANDBOX_PORT ?? 3100),
    dbPath: source.BU2_SANDBOX_DB,
    x402ResourceUrl: resourceUrl(source),
    x402BuyerPrivateKey: secrets.buyerPrivateKey,
    accessCredentialsJson: secrets.accessCredentialsJson,
    rpcChainId: baseSepolia.id,
    rpcChainIdResolver: () => client.getChainId(),
    logSink: (line) => console.log(line),
  });
}

function installShutdown(running) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ category: "runtime", event: "shutdown.started", signal }));
    running.server.close(() => {
      running.ledger.close();
      console.log(JSON.stringify({ category: "runtime", event: "shutdown.completed", signal }));
      process.exitCode = 0;
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await startHostedSandbox();
  console.log(
    JSON.stringify({
      category: "runtime",
      event: "hosted_sandbox.started",
      environment: "sandbox",
      chain_id: baseSepolia.id,
      access_mode: "authenticated",
      execution_status: "execution_enabled",
      url: running.url,
    }),
  );
  installShutdown(running);
}
