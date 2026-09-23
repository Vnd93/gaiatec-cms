import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { loadAndVerifyAllEdgeRuntimeArtifact } from "./all-edge-runtime-artifact-lib.mjs";
import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { sourceDigestInventory } from "./production-function-deployment-lib.mjs";
import { functionInventorySnapshot } from "./staging-cms-public-hotfix-lib.mjs";
import { loadAndVerifyStagingEdgeBaselineArtifact } from "./staging-edge-baseline-artifact-lib.mjs";
import {
  deployEdgeArtifactWithVerifiedCompensation,
  evaluateExactBaselineRestoration,
  evaluateExactEdgeArtifactDeployment,
  evaluateExactFunctionInventoryPreflight,
  evaluateStagingFunctionReconciliationPreflight,
  pollForVerifiedFunctionState,
} from "./staging-edge-artifact-deployment-lib.mjs";

const STAGING_PROJECT_REF = "glcqsosxwgmlhzgcsnzv";

function argument(name, validationError) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(validationError);
  return value;
}

function optionalArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : fallback;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireExactFunctions(root, label) {
  const entries = readdirSync(join(root, "supabase", "functions"), { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const expectedNames = [...PRODUCTION_FUNCTIONS, "_shared", "import_map.json"].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    JSON.stringify(entries.map((entry) => entry.name)) !== JSON.stringify(expectedNames) ||
    entries.some((entry) => {
      if (entry.isSymbolicLink()) return true;
      return entry.name === "import_map.json" ? !entry.isFile() : !entry.isDirectory();
    })
  )
    throw new Error(`G12_STAGING_FUNCTION_${label}_INVENTORY_MISMATCH`);
}

function supabaseToken() {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!token.startsWith("sbp_") || token.length < 24) throw new Error("G12_STAGING_FUNCTION_DEPLOY_BLOCKED");
  return token;
}

function managementUrl(path, query = {}) {
  const url = new URL(`https://api.supabase.com${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
  return url;
}

async function managementRequest(path, { method = "GET", query, body, contentType } = {}) {
  const response = await fetch(managementUrl(path, query), {
    method,
    headers: {
      Authorization: `Bearer ${supabaseToken()}`,
      Accept: "application/json",
      "Accept-Encoding": "identity",
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.timeout(method === "GET" ? 30_000 : 90_000),
  });
  if (!response.ok)
    throw new Error(`G12_STAGING_FUNCTION_MANAGEMENT_REQUEST_FAILED:${method}:HTTP_${response.status}`);
  if (method === "GET") return response.json();
  await response.arrayBuffer();
  return null;
}

function livePreflight(payload) {
  return evaluateExactFunctionInventoryPreflight({
    payload,
    names: PRODUCTION_FUNCTIONS,
    publicFunctions: PUBLIC_FUNCTIONS,
  });
}

async function main() {
  const candidateArtifactRoot = resolve(
    argument("--candidate-artifact", "G12_STAGING_FUNCTION_CANDIDATE_ARTIFACT_REQUIRED"),
  );
  const artifactManifestSha256 = argument(
    "--artifact-manifest-sha256",
    "G12_STAGING_FUNCTION_ARTIFACT_MANIFEST_SHA256_REQUIRED",
  );
  const baselineArtifactRoot = resolve(
    argument("--baseline-artifact", "G12_STAGING_FUNCTION_BASELINE_ARTIFACT_REQUIRED"),
  );
  const baselineManifestSha256 = argument(
    "--baseline-manifest-sha256",
    "G12_STAGING_FUNCTION_BASELINE_MANIFEST_SHA256_REQUIRED",
  );
  const candidateSha = argument("--candidate", "G12_STAGING_FUNCTION_CANDIDATE_REQUIRED");
  const reportPath = resolve(argument("--report", "G12_STAGING_FUNCTION_REPORT_REQUIRED"));
  const deploymentMode = optionalArgument("--mode", "initial");
  if (!new Set(["initial", "reconcile-candidate"]).has(deploymentMode))
    throw new Error("G12_STAGING_FUNCTION_DEPLOYMENT_MODE_REFUSED");
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw new Error("G12_STAGING_FUNCTION_CANDIDATE_REQUIRED");
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
  if (projectRef !== STAGING_PROJECT_REF) throw new Error("G12_STAGING_FUNCTION_DEPLOY_BLOCKED");
  supabaseToken();

  const artifact = loadAndVerifyAllEdgeRuntimeArtifact({
    root: candidateArtifactRoot,
    candidateSha,
    manifestSha256: artifactManifestSha256,
  });
  const baseline = loadAndVerifyStagingEdgeBaselineArtifact({
    root: baselineArtifactRoot,
    expectedManifestSha256: baselineManifestSha256,
    expected: { projectRef, candidateSha },
  });
  requireExactFunctions(artifact.sourceRoot, "ARTIFACT_SOURCE");
  const candidateSourceDigests = sourceDigestInventory(artifact.sourceRoot, PRODUCTION_FUNCTIONS);
  const baselineBundleDigests = Object.fromEntries(
    baseline.functions.map((record) => [record.slug, record.tuple.bundleSha256]),
  );
  const functionsPath = `/v1/projects/${projectRef}/functions`;
  const readLiveInventory = () => managementRequest(functionsPath);

  const preflight = await pollForVerifiedFunctionState({
    readInventory: readLiveInventory,
    evaluate: livePreflight,
  });
  const liveBefore = preflight.payload;
  const liveSnapshot = functionInventorySnapshot(liveBefore, {
    expectedNames: PRODUCTION_FUNCTIONS,
    publicFunctions: PUBLIC_FUNCTIONS,
  });
  if (!liveSnapshot.valid) throw new Error("G12_STAGING_FUNCTION_BASELINE_LIVE_DRIFT");
  if (deploymentMode === "initial" && liveSnapshot.inventorySha256 !== baseline.manifest.inventorySha256)
    throw new Error("G12_STAGING_FUNCTION_BASELINE_LIVE_DRIFT");
  const reconciliation = evaluateStagingFunctionReconciliationPreflight({
    payload: liveBefore,
    functions: artifact.functions,
    baselineFunctions: baseline.functions,
    mode: deploymentMode,
  });
  if (!reconciliation.valid)
    throw new Error(
      `G12_STAGING_FUNCTION_RECONCILIATION_REFUSED:${reconciliation.violations.join(",").slice(0, 1000)}`,
    );
  const artifactByName = new Map(artifact.functions.map((record) => [record.slug, record]));
  const mutatedNames = new Set(reconciliation.patchNames);
  const candidateOnlyNames = new Set(reconciliation.candidateOnlyNames);

  let verifiedDeployment;
  let verificationAttempts = 0;
  const attemptedNames = new Set();
  async function patchFunction(record, errorLabel) {
    const body = readFileSync(record.bodyPath ?? record.deployablePath);
    const expectedBody = record.body ?? record.deployable;
    if (
      body.byteLength !== expectedBody.bytes ||
      sha256(body) !== expectedBody.sha256 ||
      body.subarray(0, 4).toString("ascii") !== "EZBR"
    )
      throw new Error(`${errorLabel}:${record.slug}`);
    await managementRequest(`${functionsPath}/${encodeURIComponent(record.slug)}`, {
      method: "PATCH",
      query: {
        verify_jwt: String(record.verifyJwt ?? record.tuple.verifyJwt),
        entrypoint_path: record.entrypointPath ?? record.tuple.entrypointPath,
        import_map_path: record.importMapPath ?? record.tuple.importMapPath,
        ezbr_sha256: expectedBody.sha256,
      },
      body,
      contentType: "application/vnd.denoland.eszip",
    });
  }
  async function patchCandidate(name) {
    if (!mutatedNames.has(name)) return;
    const record = artifactByName.get(name);
    if (!record) throw new Error(`G12_STAGING_FUNCTION_ARTIFACT_FUNCTION_MISSING:${name}`);
    attemptedNames.add(name);
    await patchFunction(record, "G12_STAGING_FUNCTION_ARTIFACT_BODY_DRIFT");
  }

  async function verifyCandidate() {
    const verified = await pollForVerifiedFunctionState({
      readInventory: readLiveInventory,
      evaluate: (payload) =>
        evaluateExactEdgeArtifactDeployment({
          beforePayload: liveBefore,
          afterPayload: payload,
          functions: artifact.functions,
          candidateSourceDigests,
          baselineBundleDigests,
          mutatedNames,
          baselineFunctions: baseline.functions,
        }),
    });
    verifiedDeployment = verified.result;
    verificationAttempts = verified.attempts;
    return verified.result;
  }

  async function restoreBaseline() {
    const patchFailures = [];
    const baselineByName = new Map(baseline.functions.map((record) => [record.slug, record]));
    const restoreNames = new Set([...candidateOnlyNames, ...attemptedNames]);
    for (const name of restoreNames) {
      try {
        const record = baselineByName.get(name);
        if (!record) throw new Error(`G12_STAGING_FUNCTION_BASELINE_MISSING:${name}`);
        await patchFunction(record, "G12_STAGING_FUNCTION_BASELINE_BODY_DRIFT");
      } catch {
        // A failed request can still be an ambiguous server-side success. Continue
        // through every attempted candidate mutation, then prove the full live state.
        patchFailures.push(name);
      }
    }
    try {
      await pollForVerifiedFunctionState({
        readInventory: readLiveInventory,
        evaluate: (payload) =>
          evaluateExactBaselineRestoration({
            expectedPayload: baseline.functions.map((record) => record.tuple),
            currentPayload: payload,
            names: PRODUCTION_FUNCTIONS,
            publicFunctions: PUBLIC_FUNCTIONS,
            baselineFunctions: baseline.functions,
          }),
      });
    } catch (error) {
      throw new Error(`G12_STAGING_FUNCTION_BASELINE_NOT_RESTORED:patch_failures_${patchFailures.length}`, {
        cause: error,
      });
    }
  }

  await deployEdgeArtifactWithVerifiedCompensation({
    names: PRODUCTION_FUNCTIONS,
    deployOne: patchCandidate,
    verifyCandidate,
    restoreBaseline,
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
        deploymentMode,
        transport: "management-api-ezbr",
        artifact: {
          manifestSha256: artifact.manifestSha256,
          inventorySha256: artifact.manifest.input.inventorySha256,
          functionCount: artifact.functions.length,
        },
        baselineArtifact: {
          manifestSha256: baseline.manifestSha256,
          inventorySha256: baseline.manifest.inventorySha256,
          functionCount: baseline.manifest.functionCount,
          aggregateBytes: baseline.manifest.aggregateBytes,
          aggregateRawEszipBytes: baseline.manifest.aggregateRawEszipBytes,
        },
        mutatedFunctionCount: mutatedNames.size,
        reconciledCandidateFunctionCount: candidateOnlyNames.size,
        verificationAttempts,
        deployments: verifiedDeployment.deployments,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write(
    `${JSON.stringify({
      event: "g12.staging.functions.deployed",
      total: PRODUCTION_FUNCTIONS.length,
      candidateSha,
      target: "candidate",
      deploymentMode,
      transport: "management-api-ezbr",
      mutatedFunctionCount: mutatedNames.size,
      remoteDigestsVerified: PRODUCTION_FUNCTIONS.length,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
