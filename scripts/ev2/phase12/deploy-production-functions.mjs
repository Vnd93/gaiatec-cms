import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  evaluateFunctionInventory,
  PRODUCTION_FUNCTIONS,
  PRODUCTION_PROJECT_REF,
  PUBLIC_FUNCTIONS,
} from "./production-backend-lib.mjs";
import {
  deployWithVerifiedCompensation,
  evaluateCandidateFunctionDeployment,
  evaluateKnownFunctionInventory,
  sourceDigestInventory,
} from "./production-function-deployment-lib.mjs";

const sourceIndex = process.argv.indexOf("--source");
const rollbackSourceIndex = process.argv.indexOf("--rollback-source");
const candidateIndex = process.argv.indexOf("--candidate");
const reportIndex = process.argv.indexOf("--report");
if (sourceIndex < 0 || !process.argv[sourceIndex + 1])
  throw new Error("G12_PRODUCTION_FUNCTION_SOURCE_REQUIRED");
if (rollbackSourceIndex < 0 || !process.argv[rollbackSourceIndex + 1])
  throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_SOURCE_REQUIRED");
if (candidateIndex < 0 || !/^[a-f0-9]{40}$/.test(process.argv[candidateIndex + 1] ?? ""))
  throw new Error("G12_PRODUCTION_FUNCTION_CANDIDATE_REQUIRED");
if (reportIndex < 0 || !process.argv[reportIndex + 1])
  throw new Error("G12_PRODUCTION_FUNCTION_REPORT_REQUIRED");

const sourceRoot = resolve(process.argv[sourceIndex + 1]);
const rollbackSourceRoot = resolve(process.argv[rollbackSourceIndex + 1]);
const candidateSha = process.argv[candidateIndex + 1];
const reportPath = resolve(process.argv[reportIndex + 1]);
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
if (projectRef !== PRODUCTION_PROJECT_REF || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("G12_PRODUCTION_FUNCTION_DEPLOY_BLOCKED");

function sourceFunctions(root) {
  return readdirSync(join(root, "supabase", "functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

const actualFunctions = sourceFunctions(sourceRoot);
if (JSON.stringify(actualFunctions) !== JSON.stringify(PRODUCTION_FUNCTIONS))
  throw new Error("G12_PRODUCTION_FUNCTION_INVENTORY_MISMATCH");

const rollbackFunctions = sourceFunctions(rollbackSourceRoot);
if (rollbackFunctions.length === 0 || rollbackFunctions.some((name) => !PRODUCTION_FUNCTIONS.includes(name)))
  throw new Error("G12_PRODUCTION_FUNCTION_ROLLBACK_INVENTORY_INVALID");
const candidateSourceDigests = sourceDigestInventory(sourceRoot, PRODUCTION_FUNCTIONS);
const baselineSourceDigests = sourceDigestInventory(rollbackSourceRoot, rollbackFunctions);

function run(args, { cwd = sourceRoot, capture = false } = {}) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`SUPABASE_COMMAND_FAILED:${args.slice(0, 3).join(":")}`);
  return capture ? result.stdout : "";
}

const liveBefore = JSON.parse(
  run(["functions", "list", "--project-ref", projectRef, "--output", "json"], { capture: true }),
);
const liveBeforeResult = evaluateKnownFunctionInventory(liveBefore, PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS);
if (!liveBeforeResult.valid)
  throw new Error(`G12_PRODUCTION_FUNCTION_LIVE_INVENTORY_UNSAFE:${liveBeforeResult.violations.join(",")}`);

function deployOne(name) {
  const args = [
    "functions",
    "deploy",
    name,
    "--project-ref",
    projectRef,
    "--import-map",
    join(sourceRoot, "supabase", "functions", "import_map.json"),
  ];
  if (PUBLIC_FUNCTIONS.has(name)) args.push("--no-verify-jwt");
  run(args);
}

let verifiedDeployment;
function verifyCandidate() {
  const payload = JSON.parse(
    run(["functions", "list", "--project-ref", projectRef, "--output", "json"], {
      capture: true,
    }),
  );
  const inventory = evaluateFunctionInventory(payload);
  const result = evaluateCandidateFunctionDeployment({
    beforePayload: liveBefore,
    afterPayload: payload,
    managedFunctions: PRODUCTION_FUNCTIONS,
    publicFunctions: PUBLIC_FUNCTIONS,
    candidateSourceDigests,
    baselineSourceDigests,
  });
  const violations = [...inventory.violations, ...result.violations];
  if (violations.length > 0)
    throw new Error(`G12_PRODUCTION_FUNCTION_DEPLOY_VERIFICATION_FAILED:${violations.join(",")}`);
  verifiedDeployment = result;
}

function restoreBaseline() {
  // Database migrations are expand-only and already point forward. Compensation therefore
  // reconverges every function to one candidate target instead of creating a split backend.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      for (const name of PRODUCTION_FUNCTIONS) deployOne(name);
      verifyCandidate();
      return;
    } catch {
      // A bounded second pass is the terminal compensation attempt.
    }
  }
  throw new Error("CANDIDATE_RECONVERGENCE_OR_VERIFICATION_FAILED");
}

deployWithVerifiedCompensation({
  names: PRODUCTION_FUNCTIONS,
  deployOne,
  verifyCandidate,
  restoreBaseline,
});

if (!verifiedDeployment) throw new Error("G12_PRODUCTION_FUNCTION_DEPLOYMENT_RECEIPT_UNAVAILABLE");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      event: "g12.production.functions.deployment_verified",
      candidateSha,
      projectRef,
      target: "candidate",
      deployments: verifiedDeployment.deployments,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", mode: 0o600 },
);

console.log(
  JSON.stringify({
    event: "g12.production.functions.deployed",
    total: PRODUCTION_FUNCTIONS.length,
    publicFunctions: [...PUBLIC_FUNCTIONS].sort(),
    candidateSha,
    target: "candidate",
    remoteDigestsVerified: PRODUCTION_FUNCTIONS.length,
  }),
);
