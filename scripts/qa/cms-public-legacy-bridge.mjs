import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_FUNCTIONS } from "../ev2/phase12/production-backend-lib.mjs";
import { productionFunctionSourceDigest } from "../ev2/phase12/production-function-deployment-lib.mjs";
import {
  assertEngagePlan,
  assertRestorePlan,
  buildLegacyBridgeState,
  isPublicV2FormContract,
  LEGACY_BRIDGE_ENVIRONMENT,
  LEGACY_BRIDGE_FUNCTION_SLUG,
  LEGACY_BRIDGE_PROJECT_REF,
  legacyBridgeMarkers,
  legacyBridgeRefusal,
  restoredVersionAdvanced,
} from "./cms-public-legacy-bridge-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MODES = new Set(["prepare", "engage", "restore"]);

const mode = process.argv[2] ?? "";
const environment = process.env.QA_CMS_LEGACY_BRIDGE_ENVIRONMENT ?? "";
const candidateSha = process.env.QA_CMS_LEGACY_BRIDGE_CANDIDATE_SHA ?? "";
const legacySha = process.env.QA_CMS_LEGACY_BRIDGE_LEGACY_SHA ?? "";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const workflowRunId = process.env.QA_CMS_LEGACY_BRIDGE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "";
const workflowRunAttempt =
  process.env.QA_CMS_LEGACY_BRIDGE_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT ?? "";
const controlSha = process.env.QA_CMS_LEGACY_BRIDGE_CONTROL_SHA ?? process.env.GITHUB_SHA ?? "";
const root = resolve(process.cwd());

function refuse(code) {
  throw legacyBridgeRefusal(code);
}

function argument(name, { required = true } = {}) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value && required) refuse("ARGUMENT_REQUIRED");
  return value;
}

function assertContained(pathname) {
  const fromRoot = relative(root, resolve(pathname));
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
    refuse("PATH_REFUSED");
}

// The bridge is only ever allowed to touch the staging public read surface. Production and any other
// function slug are refused before a single remote call is made.
function validateRuntime() {
  if (!MODES.has(mode)) refuse("MODE_INVALID");
  if (environment !== LEGACY_BRIDGE_ENVIRONMENT) refuse("ENVIRONMENT_REFUSED");
  if (!PUBLIC_FUNCTIONS.has(LEGACY_BRIDGE_FUNCTION_SLUG)) refuse("FUNCTION_SLUG_REFUSED");
  if (!FULL_SHA.test(candidateSha) || !FULL_SHA.test(legacySha) || candidateSha === legacySha)
    refuse("SHA_INVALID");
  if (!FULL_SHA.test(controlSha)) refuse("WORKFLOW_BINDING_INVALID");
  if (!POSITIVE_INTEGER.test(workflowRunId) || !POSITIVE_INTEGER.test(workflowRunAttempt))
    refuse("WORKFLOW_BINDING_INVALID");
  if (!accessToken.startsWith("sbp_") || accessToken.length < 24) refuse("ACCESS_TOKEN_INVALID");
}

function supabase(args, { capture = false, cwd = root } = {}) {
  const result = spawnSync("supabase", args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    timeout: 5 * 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) refuse("SUPABASE_COMMAND_FAILED");
  return capture ? (result.stdout ?? "") : "";
}

function liveFunction() {
  const payload = JSON.parse(
    supabase(["functions", "list", "--project-ref", LEGACY_BRIDGE_PROJECT_REF, "--output", "json"], {
      capture: true,
    }),
  );
  if (!Array.isArray(payload)) refuse("FUNCTION_INVENTORY_INVALID");
  const record = payload.find((entry) => entry?.slug === LEGACY_BRIDGE_FUNCTION_SLUG);
  const version = Number(record?.version ?? 0);
  if (
    String(record?.status ?? "").toUpperCase() !== "ACTIVE" ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    refuse("FUNCTION_INVENTORY_INVALID");
  return { version, status: "ACTIVE" };
}

// The legacy checkout predates the import map, so the map is only passed when the source tree carries
// one. Handing candidate module resolution to legacy bytes would change what is actually proven.
function deployFunction(sourceRoot) {
  const args = [
    "functions",
    "deploy",
    LEGACY_BRIDGE_FUNCTION_SLUG,
    "--project-ref",
    LEGACY_BRIDGE_PROJECT_REF,
  ];
  const importMap = resolve(sourceRoot, "supabase", "functions", "import_map.json");
  if (existsSync(importMap)) args.push("--import-map", importMap);
  args.push("--no-verify-jwt");
  // The CLI resolves supabase/functions relative to its own working directory, so the deploy has to
  // run from the checkout that owns the bytes being deployed.
  supabase(args, { cwd: sourceRoot });
}

function anonKey() {
  const keys = JSON.parse(
    supabase(
      ["projects", "api-keys", "--project-ref", LEGACY_BRIDGE_PROJECT_REF, "--reveal", "--output", "json"],
      { capture: true },
    ),
  );
  const value = Array.isArray(keys) ? keys.find((entry) => entry?.id === "anon")?.api_key : "";
  if (!value) refuse("KEYS_UNAVAILABLE");
  return value;
}

async function readPublicForm(key) {
  const endpoint = new URL(
    `/functions/v1/${LEGACY_BRIDGE_FUNCTION_SLUG}`,
    `https://${LEGACY_BRIDGE_PROJECT_REF}.supabase.co`,
  );
  endpoint.searchParams.set("type", "form");
  endpoint.searchParams.set("key", key);
  const response = await fetch(endpoint, {
    headers: { apikey: anonKey() },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 200) return { status: response.status, body: null };
  return { status: 200, body: await response.json().catch(() => null) };
}

function writeJson(path, value) {
  assertContained(path);
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

// prepare performs no remote mutation. It exists so the workflow can take the exclusive recovery
// lease on a complete restore plan before the swap is allowed to happen.
async function prepare() {
  const candidateSource = resolve(argument("--candidate-source"));
  const legacySource = resolve(argument("--legacy-source"));
  const statePath = argument("--state");
  const reportPath = argument("--report");
  assertContained(statePath);
  assertContained(reportPath);
  if (existsSync(resolve(statePath))) refuse("STATE_ALREADY_EXISTS");

  const candidateSourceSha256 = productionFunctionSourceDigest(candidateSource, LEGACY_BRIDGE_FUNCTION_SLUG);
  const legacySourceSha256 = productionFunctionSourceDigest(legacySource, LEGACY_BRIDGE_FUNCTION_SLUG);
  const before = liveFunction();
  const state = buildLegacyBridgeState({
    runId: workflowRunId,
    runAttempt: workflowRunAttempt,
    controlSha,
    projectRef: LEGACY_BRIDGE_PROJECT_REF,
    environment,
    candidateSha,
    legacySha,
    candidateSourceSha256,
    legacySourceSha256,
    liveVersion: before.version,
  });
  // The durable state is written before any swap so an interrupted runner still leaves the watchdog a
  // complete restore plan.
  writeJson(statePath, state);

  writeJson(reportPath, {
    schemaVersion: 1,
    event: "g12.staging.cms_public_legacy",
    phase: "prepare",
    status: "prepared",
    environment,
    projectRef: LEGACY_BRIDGE_PROJECT_REF,
    functionSlug: LEGACY_BRIDGE_FUNCTION_SLUG,
    candidateSha,
    legacySha,
    capturedVersion: before.version,
    candidateSourceSha256,
    legacySourceSha256,
    ...legacyBridgeMarkers(workflowRunId, workflowRunAttempt),
    remoteMutated: false,
    productionTouched: false,
    secretsPersisted: false,
  });
}

async function engage() {
  const candidateSource = resolve(argument("--candidate-source"));
  const legacySource = resolve(argument("--legacy-source"));
  const statePath = argument("--state");
  const reportPath = argument("--report");
  assertContained(statePath);
  assertContained(reportPath);
  if (!existsSync(resolve(statePath))) refuse("STATE_MISSING");

  const state = readJson(statePath);
  const observedLegacy = productionFunctionSourceDigest(legacySource, LEGACY_BRIDGE_FUNCTION_SLUG);
  const observedCandidate = productionFunctionSourceDigest(candidateSource, LEGACY_BRIDGE_FUNCTION_SLUG);
  const plan = assertEngagePlan(state, observedLegacy);
  // The restore plan has to still be satisfiable before the swap is allowed to start.
  assertRestorePlan(state, observedCandidate);
  const before = liveFunction();
  if (before.version !== state.capturedLiveVersion) refuse("LIVE_VERSION_DRIFTED");

  deployFunction(legacySource);
  const after = liveFunction();
  if (after.version <= before.version) refuse("LEGACY_DEPLOYMENT_NOT_APPLIED");

  writeJson(reportPath, {
    schemaVersion: 1,
    event: "g12.staging.cms_public_legacy",
    phase: "engage",
    status: "engaged",
    environment,
    projectRef: plan.projectRef,
    functionSlug: plan.slug,
    candidateSha,
    legacySha: plan.sha,
    capturedVersion: before.version,
    legacyVersion: after.version,
    candidateSourceSha256: state.candidate.sourceSha256,
    legacySourceSha256: plan.sourceSha256,
    ...legacyBridgeMarkers(workflowRunId, workflowRunAttempt),
    remoteMutated: true,
    productionTouched: false,
    secretsPersisted: false,
  });
}

async function restore() {
  const candidateSource = resolve(argument("--candidate-source"));
  const statePath = argument("--state");
  const reportPath = argument("--report");
  const probeStatePath = argument("--probe-state", { required: false });
  const requireContractProbe = process.argv.includes("--require-contract-probe");
  assertContained(statePath);
  assertContained(reportPath);
  if (!existsSync(resolve(statePath))) refuse("STATE_MISSING");

  const state = readJson(statePath);
  const observed = productionFunctionSourceDigest(candidateSource, LEGACY_BRIDGE_FUNCTION_SLUG);
  const plan = assertRestorePlan(state, observed);
  const before = liveFunction();

  deployFunction(candidateSource);
  const after = liveFunction();
  // The live version must never regress and must sit past the version captured before the swap. An
  // equal version here means the candidate bytes were already live, which is what a watchdog rerun
  // over an already-restored function looks like.
  if (after.version < before.version || !restoredVersionAdvanced(state, after.version))
    refuse("RESTORE_NOT_APPLIED");

  let contractProbe = "skipped";
  let probedKey = null;
  if (probeStatePath && existsSync(resolve(probeStatePath))) {
    const probeState = readJson(probeStatePath);
    probedKey = typeof probeState?.form?.key === "string" ? probeState.form.key : null;
    if (probedKey) {
      const result = await readPublicForm(probedKey);
      if (result.status === 200) {
        contractProbe = isPublicV2FormContract(result.body, {
          key: probedKey,
          version: result.body?.version,
        })
          ? "public-v2"
          : "violated";
      } else {
        contractProbe = "unavailable";
      }
    }
  }
  if (contractProbe === "violated") refuse("PUBLIC_V2_CONTRACT_NOT_RESTORED");
  if (requireContractProbe && contractProbe !== "public-v2") refuse("PUBLIC_V2_CONTRACT_UNPROVEN");

  writeJson(reportPath, {
    schemaVersion: 1,
    event: "g12.staging.cms_public_legacy",
    phase: "restore",
    status: "restored",
    environment,
    projectRef: plan.projectRef,
    functionSlug: plan.slug,
    candidateSha: plan.sha,
    legacySha,
    capturedVersion: state.capturedLiveVersion,
    legacyVersion: before.version,
    restoredVersion: after.version,
    candidateSourceSha256: plan.sourceSha256,
    contractProbe,
    contractProbeFormKey: probedKey,
    internalIdentifiersExposed: false,
    productionTouched: false,
    secretsPersisted: false,
    ...legacyBridgeMarkers(workflowRunId, workflowRunAttempt),
  });
}

export async function main() {
  validateRuntime();
  if (mode === "prepare") await prepare();
  else if (mode === "engage") await engage();
  else await restore();
  console.log(
    JSON.stringify({
      event: "g12.staging.cms_public_legacy.completed",
      mode,
      environment,
      candidateSha,
      legacySha,
      secretsExposed: false,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
