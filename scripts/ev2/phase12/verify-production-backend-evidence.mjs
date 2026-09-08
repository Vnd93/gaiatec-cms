import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";
import {
  digestFile,
  evaluateProductionBackendEvidence,
  normalizedFunctionRecords,
  sourceBackendSnapshot,
} from "./production-backend-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const source = argument("--source");
const manifestFile = argument("--manifest");
const sealedFunctionsFile = argument("--sealed-functions");
const sealedDatabaseFile = argument("--sealed-database");
const liveFunctionsFile = argument("--live-functions");
const expectedRelease = process.env.FORWARD_BACKEND_RELEASE ?? "";
const expectedRunId = process.env.FORWARD_BACKEND_RUN_ID ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const githubToken = process.env.GITHUB_TOKEN ?? "";
const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "";

if (!source || !manifestFile || !sealedFunctionsFile || !sealedDatabaseFile || !liveFunctionsFile)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_VERIFICATION_INPUT_REQUIRED");
if (!/^[a-f0-9]{40}$/.test(expectedRelease) || !/^[1-9]\d*$/.test(expectedRunId))
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_IDENTITY_INVALID");
if (
  !/^[^/]+\/[^/]+$/.test(repository) ||
  !githubToken ||
  !supabaseToken ||
  projectRef !== PRODUCTION_PROJECT_REF
)
  throw new Error("G12_PRODUCTION_BACKEND_EVIDENCE_CONTEXT_REQUIRED");

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) throw new Error(`G12_PRODUCTION_BACKEND_RUN_UNREADABLE:${response.status}`);
  return response.json();
}

const [manifest, sealedFunctionsPayload, liveFunctionsPayload, workflowRun, liveMigrations] =
  await Promise.all([
    readFile(resolve(manifestFile), "utf8").then(JSON.parse),
    readFile(resolve(sealedFunctionsFile), "utf8").then(JSON.parse),
    readFile(resolve(liveFunctionsFile), "utf8").then(JSON.parse),
    github(`/actions/runs/${expectedRunId}`),
    managementRequest(`/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      token: supabaseToken,
      body: {
        query: "select version::text as version from supabase_migrations.schema_migrations order by version",
      },
    }),
  ]);

const result = evaluateProductionBackendEvidence({
  manifest,
  expectedRelease,
  expectedRunId,
  expectedRepository: repository,
  expectedProjectRef: projectRef,
  sourceSnapshot: sourceBackendSnapshot(source),
  sealedFunctionsSha256: digestFile(resolve(sealedFunctionsFile)),
  sealedDatabaseSha256: digestFile(resolve(sealedDatabaseFile)),
  liveFunctionRecords: normalizedFunctionRecords(liveFunctionsPayload),
  liveMigrationVersions: liveMigrations.map(({ version }) => String(version)),
  workflowRun,
});
if (!result.valid) throw new Error(`G12_PRODUCTION_BACKEND_EVIDENCE_REJECTED:${result.violations.join(",")}`);

if (
  JSON.stringify(normalizedFunctionRecords(sealedFunctionsPayload)) !== JSON.stringify(manifest.liveFunctions)
)
  throw new Error("G12_PRODUCTION_BACKEND_SEALED_FUNCTIONS_MISMATCH");

console.log(
  JSON.stringify({
    event: "g12.production.backend.evidence.verified",
    release: expectedRelease,
    runId: expectedRunId,
    migrations: liveMigrations.length,
    functions: manifest.liveFunctions.length,
  }),
);
