import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  evaluateFunctionInventory,
  PRODUCTION_FUNCTIONS,
  PRODUCTION_PROJECT_REF,
} from "./production-backend-lib.mjs";
import {
  digestFile,
  normalizedFunctionRecords,
  sourceBackendSnapshot,
} from "./production-backend-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const source = argument("--source");
const functionsFile = argument("--functions");
const databaseFile = argument("--database");
const output = argument("--output");
const release = process.env.CANDIDATE_SHA ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const controlSha = process.env.GITHUB_SHA ?? "";
const runId = process.env.GITHUB_RUN_ID ?? "";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "";
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "";

if (!source || !functionsFile || !databaseFile || !output)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_INPUT_REQUIRED");
if (
  !/^[a-f0-9]{40}$/.test(release) ||
  !/^[a-f0-9]{40}$/.test(controlSha) ||
  !/^\d+$/.test(runId) ||
  !/^\d+$/.test(runAttempt)
)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_GITHUB_CONTEXT_INVALID");
if (!/^[^/]+\/[^/]+$/.test(repository) || projectRef !== PRODUCTION_PROJECT_REF)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_ENVIRONMENT_INVALID");

const sourceSnapshot = sourceBackendSnapshot(source);
if (JSON.stringify(sourceSnapshot.functions) !== JSON.stringify(PRODUCTION_FUNCTIONS))
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_FUNCTION_SOURCE_MISMATCH");

const functionsPayload = JSON.parse(await readFile(resolve(functionsFile), "utf8"));
const functionResult = evaluateFunctionInventory(functionsPayload);
if (!functionResult.valid)
  throw new Error(`G12_PRODUCTION_BACKEND_EVIDENCE_FUNCTIONS_INVALID:${functionResult.violations.join(",")}`);

const databaseText = await readFile(resolve(databaseFile), "utf8");
const databaseEvents = databaseText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
if (
  !databaseEvents.some(
    (event) => event.event === "g12.production.database.verified" && Number(event.checks) > 0,
  )
)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_DATABASE_INVALID");

const manifest = {
  schemaVersion: 1,
  event: "g12.production.backend.sealed",
  outcome: "active",
  environment: "production",
  projectRef,
  release,
  github: {
    repository,
    controlSha,
    runId,
    runAttempt: Number(runAttempt),
    workflow: ".github/workflows/deploy-production.yml",
  },
  source: sourceSnapshot,
  liveFunctions: normalizedFunctionRecords(functionsPayload),
  evidence: {
    functionsSha256: digestFile(resolve(functionsFile)),
    databaseSha256: digestFile(resolve(databaseFile)),
  },
  sealedAt: new Date().toISOString(),
};
const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(
  JSON.stringify({
    event: "g12.production.backend.evidence.created",
    release,
    runId,
    migrations: sourceSnapshot.migrations.length,
    functions: sourceSnapshot.functions.length,
  }),
);
