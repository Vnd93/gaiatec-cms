import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  normalizeFunctionRecord,
  PRODUCTION_FUNCTIONS,
  PRODUCTION_PROJECT_REF,
  PUBLIC_FUNCTIONS,
} from "./production-backend-lib.mjs";

const sourceIndex = process.argv.indexOf("--source");
const sourceRoot = resolve(sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "");
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;

if (sourceIndex < 0 || !process.argv[sourceIndex + 1])
  throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_SOURCE_REQUIRED");
if (projectRef !== PRODUCTION_PROJECT_REF || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_BLOCKED");

const baselineFunctions = readdirSync(join(sourceRoot, "supabase", "functions"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();

if (baselineFunctions.length === 0 || baselineFunctions.some((name) => !PRODUCTION_FUNCTIONS.includes(name)))
  throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_INVENTORY_INVALID");

function run(args, { cwd = sourceRoot, capture = false } = {}) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0)
    throw new Error(`G12_PRODUCTION_FUNCTION_ROLLBACK_COMMAND_FAILED:${args.slice(0, 3).join(":")}`);
  return capture ? result.stdout : "";
}

const beforePayload = JSON.parse(
  run(["functions", "list", "--project-ref", projectRef, "--output", "json"], { capture: true }),
);
const beforeNames = beforePayload.map(normalizeFunctionRecord).map((record) => record.name);
const unknown = beforeNames.filter((name) => !PRODUCTION_FUNCTIONS.includes(name));
if (unknown.length > 0) throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_LIVE_INVENTORY_UNMANAGED");

for (const name of baselineFunctions) {
  const args = ["functions", "deploy", name, "--project-ref", projectRef];
  if (PUBLIC_FUNCTIONS.has(name)) args.push("--no-verify-jwt");
  run(args);
}

for (const name of beforeNames.filter((name) => !baselineFunctions.includes(name)).sort())
  run(["functions", "delete", name, "--project-ref", projectRef, "--yes"]);

const afterPayload = JSON.parse(
  run(["functions", "list", "--project-ref", projectRef, "--output", "json"], { capture: true }),
);
const afterRecords = afterPayload.map(normalizeFunctionRecord);
const afterNames = afterRecords.map((record) => record.name).sort();
const violations = [];
if (JSON.stringify(afterNames) !== JSON.stringify(baselineFunctions)) violations.push("inventory_mismatch");
for (const record of afterRecords) {
  if (record.status !== "ACTIVE") violations.push(`${record.name}:inactive`);
  if (record.version < 1) violations.push(`${record.name}:version_invalid`);
  if (record.verifyJwt === PUBLIC_FUNCTIONS.has(record.name))
    violations.push(`${record.name}:verify_jwt_invalid`);
}
if (violations.length > 0)
  throw new Error(`G12_PRODUCTION_FUNCTION_ROLLBACK_VERIFICATION_FAILED:${violations.join(",")}`);

console.log(
  JSON.stringify({
    event: "g12.production.functions.rollback.completed",
    restored: baselineFunctions.length,
    retired: beforeNames.filter((name) => !baselineFunctions.includes(name)).length,
  }),
);
