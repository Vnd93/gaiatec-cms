import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRODUCTION_FUNCTIONS, PRODUCTION_PROJECT_REF, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";

const sourceIndex = process.argv.indexOf("--source");
const sourceRoot = resolve(sourceIndex >= 0 ? process.argv[sourceIndex + 1] : ".");
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
if (projectRef !== PRODUCTION_PROJECT_REF || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("G12_PRODUCTION_FUNCTION_DEPLOY_BLOCKED");

const actualFunctions = readdirSync(join(sourceRoot, "supabase", "functions"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(actualFunctions) !== JSON.stringify(PRODUCTION_FUNCTIONS))
  throw new Error("G12_PRODUCTION_FUNCTION_INVENTORY_MISMATCH");

for (const name of PRODUCTION_FUNCTIONS) {
  const args = ["functions", "deploy", name, "--project-ref", projectRef];
  if (PUBLIC_FUNCTIONS.has(name)) args.push("--no-verify-jwt");
  const result = spawnSync("supabase", args, { cwd: sourceRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`G12_PRODUCTION_FUNCTION_DEPLOY_FAILED:${name}`);
}

console.log(
  JSON.stringify({
    event: "g12.production.functions.deployed",
    total: PRODUCTION_FUNCTIONS.length,
    publicFunctions: [...PUBLIC_FUNCTIONS].sort(),
  }),
);
