import { mkdir, readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

const schemaUrl = new URL("../../../docs/03-technical/openapi.yaml", import.meta.url);
const outputUrl = new URL("../src/generated/openapi.ts", import.meta.url);
const generated = astToString(await openapiTS(schemaUrl));

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("Generated SDK types do not match docs/03-technical/openapi.yaml.");
    console.error("Run: npm --prefix packages/typescript-sdk run generate");
    process.exitCode = 1;
  } else {
    console.log("Generated SDK types match the frozen OpenAPI contract.");
  }
} else {
  await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
  await writeFile(outputUrl, generated, "utf8");
  console.log("Generated SDK types from docs/03-technical/openapi.yaml.");
}
