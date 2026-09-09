import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  evaluateFunctionInventory,
  PRODUCTION_FUNCTIONS,
  PUBLIC_FUNCTIONS,
} from "./production-backend-lib.mjs";
import {
  classifyFunctionDeploymentOutput,
  deployWithVerifiedCompensation,
  evaluateCandidateFunctionDeployment,
  evaluateKnownFunctionInventory,
  mergeFunctionDeploymentOutcome,
  sourceDigestInventory,
} from "./production-function-deployment-lib.mjs";

const STAGING_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";

function argument(name, validationError) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(validationError);
  return value;
}

const sourceRoot = resolve(argument("--source", "G12_STAGING_FUNCTION_SOURCE_REQUIRED"));
const rollbackSourceRoot = resolve(
  argument("--rollback-source", "G12_STAGING_FUNCTION_ROLLBACK_SOURCE_REQUIRED"),
);
const candidateSha = argument("--candidate", "G12_STAGING_FUNCTION_CANDIDATE_REQUIRED");
const reportPath = resolve(argument("--report", "G12_STAGING_FUNCTION_REPORT_REQUIRED"));
if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw new Error("G12_STAGING_FUNCTION_CANDIDATE_REQUIRED");
const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
if (projectRef !== STAGING_PROJECT_REF || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("G12_STAGING_FUNCTION_DEPLOY_BLOCKED");

function sourceFunctions(root) {
  return readdirSync(join(root, "supabase", "functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

const actualFunctions = sourceFunctions(sourceRoot);
if (JSON.stringify(actualFunctions) !== JSON.stringify(PRODUCTION_FUNCTIONS))
  throw new Error("G12_STAGING_FUNCTION_INVENTORY_MISMATCH");
const rollbackFunctions = sourceFunctions(rollbackSourceRoot);
if (rollbackFunctions.length === 0 || rollbackFunctions.some((name) => !PRODUCTION_FUNCTIONS.includes(name)))
  throw new Error("G12_STAGING_FUNCTION_ROLLBACK_INVENTORY_INVALID");

const candidateSourceDigests = sourceDigestInventory(sourceRoot, PRODUCTION_FUNCTIONS);
const baselineSourceDigests = sourceDigestInventory(rollbackSourceRoot, rollbackFunctions);

function run(args, { capture = false, captureAll = false } = {}) {
  const captureOutput = capture || captureAll;
  const result = spawnSync("supabase", args, {
    cwd: sourceRoot,
    encoding: captureOutput ? "utf8" : undefined,
    stdio: captureAll ? ["ignore", "pipe", "pipe"] : capture ? ["ignore", "pipe", "inherit"] : "inherit",
    timeout: 5 * 60 * 1000,
  });
  if (captureAll) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.error || result.status !== 0)
    throw new Error(`SUPABASE_COMMAND_FAILED:${args.slice(0, 3).join(":")}`);
  if (captureAll) return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  return capture ? result.stdout : "";
}

const liveBefore = JSON.parse(
  run(["functions", "list", "--project-ref", projectRef, "--output", "json"], { capture: true }),
);
const liveBeforeResult = evaluateKnownFunctionInventory(liveBefore, PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS);
if (!liveBeforeResult.valid)
  throw new Error(`G12_STAGING_FUNCTION_LIVE_INVENTORY_UNSAFE:${liveBeforeResult.violations.join(",")}`);

const deploymentOutcomes = {};

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
  const output = run(args, { captureAll: true });
  deploymentOutcomes[name] = mergeFunctionDeploymentOutcome(
    deploymentOutcomes[name],
    classifyFunctionDeploymentOutput({ ...output, name, projectRef }),
  );
}

let verifiedDeployment;
function verifyCandidate() {
  const payload = JSON.parse(
    run(["functions", "list", "--project-ref", projectRef, "--output", "json"], { capture: true }),
  );
  const inventory = evaluateFunctionInventory(payload);
  const result = evaluateCandidateFunctionDeployment({
    beforePayload: liveBefore,
    afterPayload: payload,
    managedFunctions: PRODUCTION_FUNCTIONS,
    publicFunctions: PUBLIC_FUNCTIONS,
    candidateSourceDigests,
    baselineSourceDigests,
    deploymentOutcomes,
  });
  const violations = [...inventory.violations, ...result.violations];
  if (violations.length > 0)
    throw new Error(`G12_STAGING_FUNCTION_DEPLOY_VERIFICATION_FAILED:${violations.join(",")}`);
  verifiedDeployment = result;
}

function reconvergeCandidate() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      for (const name of PRODUCTION_FUNCTIONS) deployOne(name);
      verifyCandidate();
      return;
    } catch {
      // The second bounded pass is the terminal convergence attempt.
    }
  }
  throw new Error("STAGING_CANDIDATE_RECONVERGENCE_OR_VERIFICATION_FAILED");
}

deployWithVerifiedCompensation({
  names: PRODUCTION_FUNCTIONS,
  deployOne,
  verifyCandidate,
  restoreBaseline: reconvergeCandidate,
  errorPrefix: "G12_STAGING_FUNCTION",
});

if (!verifiedDeployment) throw new Error("G12_STAGING_FUNCTION_DEPLOYMENT_RECEIPT_UNAVAILABLE");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      event: "g12.staging.functions.deployment_verified",
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
    event: "g12.staging.functions.deployed",
    total: PRODUCTION_FUNCTIONS.length,
    publicFunctions: [...PUBLIC_FUNCTIONS].sort(),
    candidateSha,
    target: "candidate",
    remoteDigestsVerified: PRODUCTION_FUNCTIONS.length,
  }),
);
