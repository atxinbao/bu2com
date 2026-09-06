#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  createHostedSandboxCandidate,
  validateHostedSandboxEvidence,
} from "./hosted-sandbox.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const [command, ...paths] = process.argv.slice(2);

let result;
if (command === "candidate" && paths.length === 1) {
  result = createHostedSandboxCandidate(readJson(paths[0]));
} else if (command === "verify-evidence" && paths.length === 3) {
  result = validateHostedSandboxEvidence(
    readJson(paths[2]),
    readJson(paths[0]),
    readJson(paths[1]),
  );
} else {
  throw new Error(
    "Usage: hosted-sandbox-cli.mjs candidate <input.json> | verify-evidence <candidate.json> <activation.json> <evidence.json>",
  );
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
