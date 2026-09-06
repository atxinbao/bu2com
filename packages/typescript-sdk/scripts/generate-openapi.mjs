import { mkdir, readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

const schemaUrl = new URL("../../../docs/03-technical/openapi.yaml", import.meta.url);
const outputUrl = new URL("../src/generated/openapi.ts", import.meta.url);
const environmentContractUrl = new URL(
  "../../../docs/03-technical/environment-contract.json",
  import.meta.url,
);
const environmentOutputUrl = new URL("../src/generated/environment.ts", import.meta.url);
const generated = astToString(await openapiTS(schemaUrl));
const environmentContract = JSON.parse(await readFile(environmentContractUrl, "utf8"));
const generatedEnvironment = `// Generated from docs/03-technical/environment-contract.json. Do not edit.\nexport const ENVIRONMENT_CONTRACT = ${JSON.stringify(environmentContract, null, 2)} as const;\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  const currentEnvironment = await readFile(environmentOutputUrl, "utf8").catch(() => "");
  if (current !== generated || currentEnvironment !== generatedEnvironment) {
    console.error("Generated SDK contracts do not match the OpenAPI or environment contract.");
    console.error("Run: npm --prefix packages/typescript-sdk run generate");
    process.exitCode = 1;
  } else {
    console.log("Generated SDK types match the frozen OpenAPI contract.");
  }
} else {
  await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
  await writeFile(outputUrl, generated, "utf8");
  await writeFile(environmentOutputUrl, generatedEnvironment, "utf8");
  console.log("Generated SDK types from the OpenAPI and environment contracts.");
}
