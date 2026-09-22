import { evaluateKnownFunctionInventory } from "./production-function-deployment-lib.mjs";
import {
  functionInventorySnapshot,
  normalizeFunctionTuple,
  sameFunctionTuple,
} from "./staging-cms-public-hotfix-lib.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const RECONCILIATION_MODES = new Set(["initial", "reconcile-candidate", "candidate"]);

function label(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 160);
}

function validTimestamp(value) {
  return Number.isFinite(Date.parse(String(value ?? "")));
}

export function evaluateExactFunctionInventoryPreflight({ payload, names, publicFunctions }) {
  if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length)
    throw new Error("G12_STAGING_EDGE_ARTIFACT_PREFLIGHT_ARGUMENT_REFUSED");
  const evaluated = evaluateKnownFunctionInventory(payload, names, publicFunctions);
  const violations = [...evaluated.violations];
  const counts = new Map();
  for (const record of evaluated.records) {
    counts.set(record.name, (counts.get(record.name) ?? 0) + 1);
    if (!SHA256.test(record.bundleSha256)) violations.push(`${record.name}:bundle_digest_invalid`);
    if (!validTimestamp(record.updatedAt)) violations.push(`${record.name}:updated_at_invalid`);
  }
  for (const name of names) {
    const count = counts.get(name) ?? 0;
    if (count === 0) violations.push(`${name}:missing`);
    if (count > 1) violations.push(`${name}:duplicate`);
  }
  if (evaluated.records.length !== names.length) violations.push("inventory_cardinality_invalid");
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    records: evaluated.records,
  };
}

function candidateTuple({ baselineTuple, liveTuple, artifact }) {
  return {
    ...normalizeFunctionTuple(baselineTuple),
    verifyJwt: artifact.verifyJwt,
    version: liveTuple.version,
    bundleSha256: artifact.deployable.sha256,
    updatedAt: liveTuple.updatedAt,
    entrypointPath: artifact.entrypointPath,
    importMapPath: artifact.importMapPath,
  };
}

function monotonicFromBaseline(liveTuple, baselineTuple) {
  return (
    liveTuple.version >= baselineTuple.version &&
    Date.parse(liveTuple.updatedAt) >= Date.parse(baselineTuple.updatedAt)
  );
}

export function evaluateStagingFunctionReconciliationPreflight({
  payload,
  functions,
  baselineFunctions,
  mode,
}) {
  const violations = [];
  if (!RECONCILIATION_MODES.has(mode))
    return {
      valid: false,
      violations: ["reconciliation_mode_invalid"],
      baselineNames: [],
      candidateNames: [],
      candidateOnlyNames: [],
      patchNames: [],
    };
  if (!Array.isArray(functions) || !Array.isArray(baselineFunctions) || functions.length === 0)
    return {
      valid: false,
      violations: ["reconciliation_artifacts_invalid"],
      baselineNames: [],
      candidateNames: [],
      candidateOnlyNames: [],
      patchNames: [],
    };
  const names = functions.map((record) => record?.slug);
  const baselineNames = baselineFunctions.map((record) => record?.slug);
  const sortedNames = [...names].sort();
  if (
    new Set(names).size !== names.length ||
    new Set(baselineNames).size !== baselineNames.length ||
    JSON.stringify([...baselineNames].sort()) !== JSON.stringify(sortedNames)
  )
    violations.push("reconciliation_function_cardinality_invalid");
  const publicFunctions = new Set(
    functions.filter((record) => record?.verifyJwt === false).map((record) => record.slug),
  );
  const liveSnapshot = functionInventorySnapshot(payload, {
    expectedNames: sortedNames,
    publicFunctions,
  });
  if (!liveSnapshot.valid) violations.push(...liveSnapshot.violations.map((item) => `live:${item}`));
  const baselineSnapshot = functionInventorySnapshot(
    baselineFunctions.map((record) => record?.tuple),
    { expectedNames: sortedNames, publicFunctions },
  );
  if (!baselineSnapshot.valid)
    violations.push(...baselineSnapshot.violations.map((item) => `baseline:${item}`));
  const artifactByName = new Map(functions.map((record) => [record?.slug, record]));
  const baselineByName = new Map(baselineSnapshot.records.map((record) => [record.name, record]));
  const liveByName = new Map(liveSnapshot.records.map((record) => [record.name, record]));
  const compatibleBaselineNames = [];
  const compatibleCandidateNames = [];
  const candidateOnlyNames = [];
  const patchNames = [];
  for (const name of sortedNames) {
    const artifact = artifactByName.get(name);
    const baselineTuple = baselineByName.get(name);
    const liveTuple = liveByName.get(name);
    if (
      !artifact ||
      !baselineTuple ||
      !liveTuple ||
      typeof artifact.verifyJwt !== "boolean" ||
      !SHA256.test(String(artifact.deployable?.sha256 ?? "")) ||
      typeof artifact.entrypointPath !== "string" ||
      !artifact.entrypointPath.startsWith("file:///") ||
      typeof artifact.importMapPath !== "string" ||
      !artifact.importMapPath.startsWith("file:///")
    ) {
      violations.push(`${name}:reconciliation_contract_invalid`);
      continue;
    }
    const monotonic = monotonicFromBaseline(liveTuple, baselineTuple);
    const candidateAtBaselineClock = candidateTuple({
      baselineTuple,
      liveTuple: baselineTuple,
      artifact,
    });
    const candidateChangesBaseline = !sameFunctionTuple(candidateAtBaselineClock, baselineTuple);
    const candidateMonotonic = candidateChangesBaseline
      ? liveTuple.version > baselineTuple.version &&
        Date.parse(liveTuple.updatedAt) > Date.parse(baselineTuple.updatedAt)
      : monotonic;
    const baselineCompatible =
      monotonic &&
      sameFunctionTuple(liveTuple, baselineTuple, {
        ignoreVersion: true,
        ignoreUpdatedAt: true,
      });
    const candidateCompatible =
      candidateMonotonic &&
      sameFunctionTuple(liveTuple, candidateTuple({ baselineTuple, liveTuple, artifact }));
    if (baselineCompatible) compatibleBaselineNames.push(name);
    if (candidateCompatible) compatibleCandidateNames.push(name);
    if (candidateCompatible && !baselineCompatible) candidateOnlyNames.push(name);
    if (!candidateCompatible) patchNames.push(name);
    if (mode === "initial" && !sameFunctionTuple(liveTuple, baselineTuple))
      violations.push(`${name}:initial_baseline_mismatch`);
    if (mode === "reconcile-candidate" && !baselineCompatible && !candidateCompatible)
      violations.push(`${name}:reconciliation_third_state`);
    if (mode === "candidate" && !candidateCompatible) violations.push(`${name}:candidate_state_mismatch`);
  }
  return {
    valid: violations.length === 0,
    violations: [...new Set(violations)],
    baselineNames: compatibleBaselineNames,
    candidateNames: compatibleCandidateNames,
    candidateOnlyNames,
    patchNames,
  };
}

export function evaluateExactEdgeArtifactDeployment({
  beforePayload,
  afterPayload,
  functions,
  candidateSourceDigests,
  baselineBundleDigests,
  mutatedNames,
  baselineFunctions,
}) {
  const managedFunctions = functions.map((record) => record.slug);
  const publicFunctions = new Set(
    functions.filter((record) => record.verifyJwt === false).map((record) => record.slug),
  );
  const before = evaluateKnownFunctionInventory(beforePayload, managedFunctions, publicFunctions);
  const after = evaluateKnownFunctionInventory(afterPayload, managedFunctions, publicFunctions);
  const violations = [
    ...before.violations.map((item) => `before:${item}`),
    ...after.violations.map((item) => `after:${item}`),
  ];
  const mutated = mutatedNames instanceof Set ? mutatedNames : new Set(mutatedNames ?? []);
  for (const name of mutated)
    if (!managedFunctions.includes(name)) violations.push(`${name}:unmanaged_mutation`);
  const beforeByName = new Map(before.records.map((record) => [record.name, record]));
  const afterByName = new Map(after.records.map((record) => [record.name, record]));
  const deployments = [];
  for (const artifact of functions) {
    const name = artifact.slug;
    const previous = beforeByName.get(name);
    const current = afterByName.get(name);
    const sourceSha256 = candidateSourceDigests?.[name];
    const baselineBundleSha256 = baselineBundleDigests?.[name];
    if (!SHA256.test(sourceSha256 ?? "")) violations.push(`${name}:source_digest_invalid`);
    if (!SHA256.test(baselineBundleSha256 ?? "")) violations.push(`${name}:baseline_bundle_digest_invalid`);
    if (!previous || !current) {
      violations.push(`${name}:transition_missing`);
      continue;
    }
    if (!SHA256.test(previous.bundleSha256)) violations.push(`${name}:before_bundle_digest_invalid`);
    if (current.bundleSha256 !== artifact.deployable.sha256)
      violations.push(`${name}:artifact_bundle_digest_mismatch`);
    if (current.verifyJwt !== artifact.verifyJwt) violations.push(`${name}:artifact_verify_jwt_mismatch`);
    if (!validTimestamp(previous.updatedAt) || !validTimestamp(current.updatedAt))
      violations.push(`${name}:updated_at_invalid`);
    if (mutated.has(name)) {
      if (current.version !== previous.version + 1) violations.push(`${name}:version_advance_invalid`);
      if (current.updatedAt === previous.updatedAt) violations.push(`${name}:updated_at_not_advanced`);
    } else if (
      current.version !== previous.version ||
      current.updatedAt !== previous.updatedAt ||
      current.bundleSha256 !== previous.bundleSha256 ||
      current.verifyJwt !== previous.verifyJwt
    ) {
      violations.push(`${name}:unexpected_remote_mutation`);
    }
    deployments.push({
      name,
      sourceSha256,
      baselineBundleSha256,
      rawEszipSha256: artifact.raw.sha256,
      rawEszipBytes: artifact.raw.bytes,
      bundleSha256: artifact.deployable.sha256,
      bundleBytes: artifact.deployable.bytes,
      previousVersion: previous.version,
      version: current.version,
      updatedAt: current.updatedAt,
      verifyJwt: artifact.verifyJwt,
      entrypointPath: artifact.entrypointPath,
      importMapPath: artifact.importMapPath,
      outcome: mutated.has(name) ? "patched" : "already-current",
    });
  }
  if (baselineFunctions !== undefined) {
    const candidateState = evaluateStagingFunctionReconciliationPreflight({
      payload: afterPayload,
      functions,
      baselineFunctions,
      mode: "candidate",
    });
    violations.push(...candidateState.violations.map((item) => `candidate_state:${item}`));
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)], deployments };
}

export function evaluateExactBaselineRestoration({
  expectedPayload,
  currentPayload,
  names,
  publicFunctions,
  baselineFunctions,
}) {
  const expected = evaluateKnownFunctionInventory(expectedPayload, names, publicFunctions);
  const current = evaluateKnownFunctionInventory(currentPayload, names, publicFunctions);
  const violations = [
    ...expected.violations.map((item) => `expected:${item}`),
    ...current.violations.map((item) => `current:${item}`),
  ];
  const expectedByName = new Map(expected.records.map((record) => [record.name, record]));
  const currentByName = new Map(current.records.map((record) => [record.name, record]));
  const currentSnapshot =
    baselineFunctions === undefined
      ? null
      : functionInventorySnapshot(currentPayload, {
          expectedNames: names,
          publicFunctions,
        });
  const currentTupleByName = new Map((currentSnapshot?.records ?? []).map((record) => [record.name, record]));
  const baselineByName = new Map((baselineFunctions ?? []).map((record) => [record.slug, record.tuple]));
  if (currentSnapshot && !currentSnapshot.valid)
    violations.push(...currentSnapshot.violations.map((item) => `current_tuple:${item}`));
  if (baselineFunctions !== undefined && baselineByName.size !== names.length)
    violations.push("baseline_function_cardinality_invalid");
  for (const name of names) {
    const before = expectedByName.get(name);
    const after = currentByName.get(name);
    if (!before || !after) {
      violations.push(`${name}:restoration_missing`);
      continue;
    }
    if (!SHA256.test(before.bundleSha256)) violations.push(`${name}:baseline_digest_invalid`);
    if (after.bundleSha256 !== before.bundleSha256) violations.push(`${name}:baseline_digest_mismatch`);
    if (after.verifyJwt !== before.verifyJwt) violations.push(`${name}:baseline_verify_jwt_mismatch`);
    if (after.version < before.version) violations.push(`${name}:baseline_version_regressed`);
    if (
      !validTimestamp(before.updatedAt) ||
      !validTimestamp(after.updatedAt) ||
      Date.parse(after.updatedAt) < Date.parse(before.updatedAt)
    )
      violations.push(`${name}:baseline_updated_at_regressed`);
    if (baselineFunctions !== undefined) {
      const baselineTuple = baselineByName.get(name);
      const currentTuple = currentTupleByName.get(name);
      if (
        !baselineTuple ||
        !currentTuple ||
        !sameFunctionTuple(baselineTuple, currentTuple, {
          ignoreVersion: true,
          ignoreUpdatedAt: true,
        })
      )
        violations.push(`${name}:baseline_metadata_mismatch`);
    }
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export async function pollForVerifiedFunctionState({
  readInventory,
  evaluate,
  attempts = 7,
  initialDelayMs = 500,
  maximumDelayMs = 8_000,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (
    typeof readInventory !== "function" ||
    typeof evaluate !== "function" ||
    !Number.isSafeInteger(attempts) ||
    attempts < 1 ||
    attempts > 10 ||
    !Number.isSafeInteger(initialDelayMs) ||
    initialDelayMs < 1 ||
    !Number.isSafeInteger(maximumDelayMs) ||
    maximumDelayMs < initialDelayMs
  )
    throw new Error("G12_STAGING_EDGE_ARTIFACT_POLL_ARGUMENT_REFUSED");
  let lastViolations = ["inventory_unavailable"];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const payload = await readInventory();
      const result = evaluate(payload);
      if (result?.valid === true) return { payload, result, attempts: attempt };
      lastViolations = Array.isArray(result?.violations) ? result.violations : ["evaluation_invalid"];
    } catch (error) {
      lastViolations = [`read:${label(error)}`];
    }
    if (attempt < attempts) await sleep(Math.min(initialDelayMs * 2 ** (attempt - 1), maximumDelayMs));
  }
  throw new Error(
    `G12_STAGING_EDGE_ARTIFACT_POLL_REFUSED:${lastViolations.map(label).join(",").slice(0, 1000)}`,
  );
}

export async function deployEdgeArtifactWithVerifiedCompensation({
  names,
  deployOne,
  verifyCandidate,
  restoreBaseline,
}) {
  let stage = "preflight";
  try {
    for (const name of names) {
      stage = name;
      await deployOne(name);
    }
    stage = "verification";
    return await verifyCandidate();
  } catch (deploymentError) {
    try {
      await restoreBaseline();
    } catch (compensationError) {
      throw new Error(`G12_STAGING_FUNCTION_COMPENSATION_FAILED:${stage}:${label(compensationError)}`, {
        cause: compensationError,
      });
    }
    throw new Error(`G12_STAGING_FUNCTION_DEPLOY_FAILED_COMPENSATED:${stage}`, {
      cause: deploymentError,
    });
  }
}
