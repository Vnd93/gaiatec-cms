import { readFile } from "node:fs/promises";
import { evaluateFunctionInventory, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : "";
if (!file) throw new Error("G12_PRODUCTION_FUNCTION_VERIFICATION_FILE_REQUIRED");

const payload = JSON.parse(await readFile(file, "utf8"));
const result = evaluateFunctionInventory(payload);
if (!result.valid)
  throw new Error(`G12_PRODUCTION_FUNCTION_VERIFICATION_FAILED:${result.violations.join(",")}`);

console.log(
  JSON.stringify({
    event: "g12.production.functions.verified",
    total: result.records.length,
    publicFunctions: [...PUBLIC_FUNCTIONS].sort(),
  }),
);
