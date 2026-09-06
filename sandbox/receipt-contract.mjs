import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import canonicalize from "canonicalize";

const environmentContract = JSON.parse(
  readFileSync(
    new URL("../docs/03-technical/environment-contract.json", import.meta.url),
    "utf8",
  ),
);

export const CURRENT_RECEIPT_SCHEMA_VERSION = "0.3";
export const RECEIPT_CANONICALIZATION_VERSION = "RFC8785-JCS-1";
export const RECEIPT_SIGNATURE_ALGORITHM = "Ed25519";

const legacyCanonical = (value) => JSON.stringify(value, Object.keys(value).sort());

const schemaRegistry = Object.freeze({
  "0.1": Object.freeze({ canonicalization_version: "BU2-LEGACY-0.1", canonicalize: legacyCanonical }),
  "0.2": Object.freeze({
    canonicalization_version: RECEIPT_CANONICALIZATION_VERSION,
    canonicalize,
  }),
  "0.3": Object.freeze({
    canonicalization_version: RECEIPT_CANONICALIZATION_VERSION,
    canonicalize,
  }),
});

export const RECEIPT_SCHEMA_REGISTRY = schemaRegistry;

export function receiptPayload(receipt) {
  const {
    id: _id,
    signature: _signature,
    signature_algorithm: _algorithm,
    verification_key_id: _keyId,
    public_key: _publicKey,
    valid: _valid,
    signature_valid: _signatureValid,
    issuer_trusted: _issuerTrusted,
    settlement_confirmed: _settlementConfirmed,
    environment_valid: _environmentValid,
    environment_interpretation: _environmentInterpretation,
    ...payload
  } = receipt;
  return payload;
}

export function canonicalReceiptPayload(payload, schemaVersion = CURRENT_RECEIPT_SCHEMA_VERSION) {
  const schema = schemaRegistry[schemaVersion];
  if (!schema) throw new Error(`Unsupported Receipt schema version: ${schemaVersion}`);
  return schema.canonicalize(payload);
}

export function verifyReceiptSignature(receipt) {
  const schemaVersion = receipt.schema_version ?? receipt.version ?? "0.1";
  const schema = schemaRegistry[schemaVersion];
  const canonicalizationVersion =
    receipt.canonicalization_version ?? "BU2-LEGACY-0.1";
  if (
    !schema ||
    schema.canonicalization_version !== canonicalizationVersion ||
    receipt.signature_algorithm !== RECEIPT_SIGNATURE_ALGORITHM
  ) {
    return {
      schema_supported: Boolean(schema),
      signature_valid: false,
      schema_version: schemaVersion,
      canonicalization_version: canonicalizationVersion,
    };
  }
  let signatureValid = false;
  try {
    const receiptPublicKey = createPublicKey({
      key: Buffer.from(receipt.public_key, "base64"),
      type: "spki",
      format: "der",
    });
    signatureValid = verify(
      null,
      Buffer.from(schema.canonicalize(receiptPayload(receipt))),
      receiptPublicKey,
      Buffer.from(receipt.signature, "base64"),
    );
  } catch {
    signatureValid = false;
  }
  return {
    schema_supported: true,
    signature_valid: signatureValid,
    schema_version: schemaVersion,
    canonicalization_version: canonicalizationVersion,
  };
}

export function interpretReceiptEnvironment(receipt) {
  const schemaVersion = receipt.schema_version ?? receipt.version ?? "0.1";
  if (schemaVersion === "0.3") {
    const expected = environmentContract.environments[receipt.environment];
    const valid = Boolean(
      expected &&
        receipt.environment_contract_version === environmentContract.schema_version &&
        receipt.execution_backend === expected.payment_adapter &&
        receipt.chain_id === expected.chain_id &&
        receipt.network === expected.network &&
        receipt.receipt_issuer_id === `bu2-reference-server:${expected.environment}`,
    );
    return {
      source: "native",
      original: receipt.environment ?? null,
      derived: valid ? receipt.environment : null,
      evidence: valid ? "receipt_v0.3_signed_environment_binding" : "environment_binding_invalid",
    };
  }
  if (schemaVersion === "0.2" && receipt.environment === "simulation") {
    return {
      source: "legacy",
      original: "simulation",
      derived: "local",
      evidence: "legacy_simulation_is_local_only",
    };
  }
  if (
    schemaVersion === "0.2" &&
    receipt.environment === "testnet" &&
    receipt.payment_channel === "x402_exact_base_sepolia" &&
    typeof receipt.provider_reference === "string" &&
    receipt.provider_reference.length > 0
  ) {
    return {
      source: "legacy",
      original: "testnet",
      derived: "sandbox",
      evidence: "legacy_testnet_base_sepolia_provider_evidence",
    };
  }
  return {
    source: schemaVersion === "0.2" ? "legacy" : "unknown",
    original: receipt.environment ?? null,
    derived: null,
    evidence: "environment_evidence_insufficient",
  };
}

export function receiptEnvironmentMatches(receipt, activeEnvironment) {
  return interpretReceiptEnvironment(receipt).derived === activeEnvironment.environment;
}
