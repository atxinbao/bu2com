import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { normalizeAccessCredential } from "./access-control.mjs";

const MAX_SECRET_BYTES = 65_536;
const EVM_PRIVATE_KEY = /^0x[a-fA-F0-9]{64}$/;

export class RuntimeSecretError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = "RuntimeSecretError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code, message, field) => {
  throw new RuntimeSecretError(code, message, field);
};

function readSecretFile(path, field) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    fail("secret_file_invalid", `${field} must reference an absolute file path.`, field);
  }
  let status;
  try {
    status = lstatSync(path);
  } catch {
    fail("secret_file_unavailable", `${field} could not be read.`, field);
  }
  if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_SECRET_BYTES) {
    fail(
      "secret_file_invalid",
      `${field} must reference a bounded regular file and cannot be a symbolic link.`,
      field,
    );
  }
  const value = readFileSync(path, "utf8").trim();
  if (!value) fail("secret_file_empty", `${field} cannot be empty.`, field);
  return value;
}

export function readHostedSandboxSecrets(source = process.env) {
  for (const field of ["BU2_API_CREDENTIALS_JSON", "X402_BUYER_PRIVATE_KEY", "BU2_RPC_URL"]) {
    if (source[field] !== undefined) {
      fail(
        "direct_secret_environment_forbidden",
        `${field} cannot be injected directly into a hosted Sandbox process.`,
        field,
      );
    }
  }

  const credentialsJson = readSecretFile(
    source.BU2_API_CREDENTIALS_FILE,
    "BU2_API_CREDENTIALS_FILE",
  );
  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    fail(
      "access_credentials_invalid_json",
      "BU2_API_CREDENTIALS_FILE must contain valid JSON.",
      "BU2_API_CREDENTIALS_FILE",
    );
  }
  if (!Array.isArray(credentials) || credentials.length === 0) {
    fail(
      "access_credentials_invalid",
      "BU2_API_CREDENTIALS_FILE must contain at least one credential metadata record.",
      "BU2_API_CREDENTIALS_FILE",
    );
  }
  if (
    credentials.some(
      (credential) => credential?.token !== undefined || credential?.api_key !== undefined,
    )
  ) {
    fail(
      "raw_access_token_forbidden",
      "Credential metadata must contain digests only, never raw API keys.",
      "BU2_API_CREDENTIALS_FILE",
    );
  }
  for (const credential of credentials) normalizeAccessCredential(credential, "sandbox");

  const buyerPrivateKey = readSecretFile(
    source.X402_BUYER_PRIVATE_KEY_FILE,
    "X402_BUYER_PRIVATE_KEY_FILE",
  );
  if (!EVM_PRIVATE_KEY.test(buyerPrivateKey)) {
    fail(
      "buyer_private_key_invalid",
      "X402_BUYER_PRIVATE_KEY_FILE does not contain a valid EVM private key.",
      "X402_BUYER_PRIVATE_KEY_FILE",
    );
  }

  const rpcUrl = readSecretFile(source.BU2_RPC_URL_FILE, "BU2_RPC_URL_FILE");
  let parsedRpcUrl;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    fail("rpc_url_invalid", "BU2_RPC_URL_FILE must contain a valid HTTP or HTTPS URL.", "BU2_RPC_URL_FILE");
  }
  if (!["http:", "https:"].includes(parsedRpcUrl.protocol)) {
    fail("rpc_url_invalid", "BU2_RPC_URL_FILE must contain a valid HTTP or HTTPS URL.", "BU2_RPC_URL_FILE");
  }

  return Object.freeze({
    accessCredentialsJson: credentialsJson,
    buyerPrivateKey,
    rpcUrl: parsedRpcUrl.href,
  });
}
