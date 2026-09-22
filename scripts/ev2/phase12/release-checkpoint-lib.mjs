const FULL_SHA = /^[a-f0-9]{40}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const SAFE_NAME = /^[a-z][a-z0-9-]{1,63}$/;
const DEPENDENCIES = Object.freeze(["source", "artifact", "deployment", "environment"]);
const PROFILES = new Set(["frontend-only", "edge-only", "database-auth", "full-release"]);
const SAFE_REUSABLE = Object.freeze({
  "artifact-seal": ["source", "artifact"],
  "immutable-provenance": ["source", "artifact"],
});
const MANDATORY_NEVER_REUSABLE = Object.freeze([
  "browser-headless",
  "edge-runtime-smoke",
  "rls",
  "mfa-aal2",
  "recovery-ready",
  "pages-candidate",
  "edge-mutation",
  "database-auth-mutation",
  "serial-exclusive-mutation",
  "postdeploy-http",
  "postdeploy-edge",
  "postdeploy-database-auth",
  "real-chrome-authenticated",
  "audit-terminal",
  "cleanup-zero",
]);
const POLICY_KEYS = Object.freeze([
  "schemaVersion",
  "environment",
  "defaultDecision",
  "changeInvalidationOrder",
  "reusableGates",
  "neverReusable",
]);
const CHECKPOINT_KEYS = Object.freeze([
  "schemaVersion",
  "environment",
  "profile",
  "matrixSha256",
  "policySha256",
  "createdAt",
  "binding",
  "gates",
]);
const BINDING_KEYS = Object.freeze(["candidateSha", "artifact", "deployment", "environment"]);
const GATE_KEYS = Object.freeze(["name", "status", "completedAt", "expiresAt", "bindings"]);

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
}

export function validateReleaseCheckpointPolicy(policy) {
  if (!exactKeys(policy, POLICY_KEYS) || policy.schemaVersion !== 1) {
    throw new Error("release checkpoint policy schema is invalid");
  }
  if (policy.environment !== "staging" || policy.defaultDecision !== "rerun") {
    throw new Error("release checkpoint policy must fail closed in staging");
  }
  if (JSON.stringify(policy.changeInvalidationOrder) !== JSON.stringify(DEPENDENCIES)) {
    throw new Error("release checkpoint dependency order is invalid");
  }
  if (
    !Array.isArray(policy.neverReusable) ||
    new Set(policy.neverReusable).size !== policy.neverReusable.length ||
    policy.neverReusable.some((name) => typeof name !== "string" || !SAFE_NAME.test(name))
  ) {
    throw new Error("release checkpoint neverReusable gates are invalid");
  }
  const neverReusable = new Set(policy.neverReusable);
  for (const mandatory of MANDATORY_NEVER_REUSABLE) {
    if (!neverReusable.has(mandatory)) {
      throw new Error(`mandatory gate ${mandatory} must never be reusable`);
    }
  }
  const reusable = policy.reusableGates;
  if (!reusable || typeof reusable !== "object" || Array.isArray(reusable)) {
    throw new Error("release checkpoint reusableGates is invalid");
  }
  if (JSON.stringify(Object.keys(reusable).sort()) !== JSON.stringify(Object.keys(SAFE_REUSABLE).sort())) {
    throw new Error("release checkpoint reusable gate allowlist is invalid");
  }
  for (const [name, definition] of Object.entries(reusable)) {
    if (neverReusable.has(name)) throw new Error(`gate ${name} has conflicting reuse policy`);
    if (
      !exactKeys(definition, ["dependencies", "maximumAgeSeconds"]) ||
      JSON.stringify(definition.dependencies) !== JSON.stringify(SAFE_REUSABLE[name]) ||
      !Number.isSafeInteger(definition.maximumAgeSeconds) ||
      definition.maximumAgeSeconds < 1 ||
      definition.maximumAgeSeconds > 604800
    ) {
      throw new Error(`gate ${name} reuse policy is invalid`);
    }
  }
  return policy;
}

function validateBinding(binding) {
  if (
    !exactKeys(binding, BINDING_KEYS) ||
    !FULL_SHA.test(binding?.candidateSha ?? "") ||
    !exactKeys(binding?.artifact, ["id", "digest", "archiveSha256", "treeSha256", "gateCiRunAttempt"]) ||
    !POSITIVE_INTEGER.test(binding?.artifact?.id ?? "") ||
    !PREFIXED_SHA256.test(binding?.artifact?.digest ?? "") ||
    !HEX_SHA256.test(binding?.artifact?.archiveSha256 ?? "") ||
    !HEX_SHA256.test(binding?.artifact?.treeSha256 ?? "") ||
    !Number.isSafeInteger(binding?.artifact?.gateCiRunAttempt) ||
    binding.artifact.gateCiRunAttempt < 1 ||
    binding.artifact.gateCiRunAttempt > 100 ||
    !exactKeys(binding?.deployment, ["id"]) ||
    !UUID.test(binding?.deployment?.id ?? "") ||
    !exactKeys(binding?.environment, ["snapshotSha256", "edgeBaselineManifestSha256"]) ||
    !HEX_SHA256.test(binding?.environment?.snapshotSha256 ?? "") ||
    !HEX_SHA256.test(binding?.environment?.edgeBaselineManifestSha256 ?? "")
  ) {
    throw new Error("release checkpoint binding is invalid");
  }
  return binding;
}

function validateContext(context) {
  if (
    !PROFILES.has(context?.profile) ||
    !HEX_SHA256.test(context?.matrixSha256 ?? "") ||
    !HEX_SHA256.test(context?.policySha256 ?? "")
  ) {
    throw new Error("release checkpoint context is invalid");
  }
  validateBinding({
    candidateSha: context?.candidateSha,
    artifact: context?.artifact,
    deployment: context?.deployment,
    environment: context?.environment,
  });
  return context;
}

export function releaseCheckpointBinding(context) {
  validateContext(context);
  return {
    candidateSha: context.candidateSha,
    artifact: {
      id: context.artifact.id,
      digest: context.artifact.digest,
      archiveSha256: context.artifact.archiveSha256,
      treeSha256: context.artifact.treeSha256,
      gateCiRunAttempt: context.artifact.gateCiRunAttempt,
    },
    deployment: { id: context.deployment.id },
    environment: {
      snapshotSha256: context.environment.snapshotSha256,
      edgeBaselineManifestSha256: context.environment.edgeBaselineManifestSha256,
    },
  };
}

function expectedBindings(binding, dependencies) {
  const bindings = {};
  if (dependencies.includes("source")) bindings.candidateSha = binding.candidateSha;
  if (dependencies.includes("artifact")) {
    bindings.artifactId = binding.artifact.id;
    bindings.artifactDigest = binding.artifact.digest;
    bindings.archiveSha256 = binding.artifact.archiveSha256;
    bindings.treeSha256 = binding.artifact.treeSha256;
    bindings.gateCiRunAttempt = binding.artifact.gateCiRunAttempt;
  }
  if (dependencies.includes("deployment")) bindings.deploymentId = binding.deployment.id;
  if (dependencies.includes("environment")) {
    bindings.environmentSnapshotSha256 = binding.environment.snapshotSha256;
    bindings.edgeBaselineManifestSha256 = binding.environment.edgeBaselineManifestSha256;
  }
  return bindings;
}

function changedDependencies(stored, current) {
  const changed = [];
  if (stored.candidateSha !== current.candidateSha) changed.push("source");
  if (
    stored.artifact.id !== current.artifact.id ||
    stored.artifact.digest !== current.artifact.digest ||
    stored.artifact.archiveSha256 !== current.artifact.archiveSha256 ||
    stored.artifact.treeSha256 !== current.artifact.treeSha256 ||
    stored.artifact.gateCiRunAttempt !== current.artifact.gateCiRunAttempt
  ) {
    changed.push("artifact");
  }
  if (stored.deployment.id !== current.deployment.id) changed.push("deployment");
  if (
    stored.environment.snapshotSha256 !== current.environment.snapshotSha256 ||
    stored.environment.edgeBaselineManifestSha256 !== current.environment.edgeBaselineManifestSha256
  ) {
    changed.push("environment");
  }
  return changed;
}

export function validateReleaseCheckpointDocument(checkpoint, policy) {
  validateReleaseCheckpointPolicy(policy);
  if (!exactKeys(checkpoint, CHECKPOINT_KEYS) || checkpoint.schemaVersion !== 2) {
    throw new Error("release checkpoint document is invalid");
  }
  if (
    checkpoint.environment !== policy.environment ||
    !PROFILES.has(checkpoint.profile) ||
    !HEX_SHA256.test(checkpoint.matrixSha256 ?? "") ||
    !HEX_SHA256.test(checkpoint.policySha256 ?? "") ||
    !Number.isFinite(timestamp(checkpoint.createdAt)) ||
    !Array.isArray(checkpoint.gates)
  ) {
    throw new Error("release checkpoint controls or creation time are invalid");
  }
  validateBinding(checkpoint.binding);
  const names = new Set();
  for (const gate of checkpoint.gates) {
    if (
      !exactKeys(gate, GATE_KEYS) ||
      typeof gate.name !== "string" ||
      names.has(gate.name) ||
      !policy.reusableGates[gate.name]
    ) {
      throw new Error("release checkpoint gate record is invalid or duplicated");
    }
    names.add(gate.name);
    const expected = expectedBindings(checkpoint.binding, policy.reusableGates[gate.name].dependencies);
    if (
      !exactKeys(gate.bindings, Object.keys(expected)) ||
      Object.entries(expected).some(([key, value]) => gate.bindings[key] !== value)
    ) {
      throw new Error("release checkpoint gate binding does not match stored context");
    }
  }
  return checkpoint;
}

export function createReleaseCheckpoint({ policy, context, createdAt, gateNames }) {
  validateReleaseCheckpointPolicy(policy);
  validateContext(context);
  const created = timestamp(createdAt);
  if (
    !Number.isFinite(created) ||
    !Array.isArray(gateNames) ||
    new Set(gateNames).size !== gateNames.length
  ) {
    throw new Error("release checkpoint creation input is invalid");
  }
  const binding = releaseCheckpointBinding(context);
  const checkpoint = {
    schemaVersion: 2,
    environment: policy.environment,
    profile: context.profile,
    matrixSha256: context.matrixSha256,
    policySha256: context.policySha256,
    createdAt,
    binding,
    gates: gateNames.map((name) => {
      const definition = policy.reusableGates[name];
      if (!definition) throw new Error(`release checkpoint gate ${name} is not reusable`);
      return {
        name,
        status: "success",
        completedAt: createdAt,
        expiresAt: new Date(created + definition.maximumAgeSeconds * 1000).toISOString(),
        bindings: expectedBindings(binding, definition.dependencies),
      };
    }),
  };
  return validateReleaseCheckpointDocument(checkpoint, policy);
}

export function evaluateReleaseCheckpoints({ policy, checkpoint, context, now }) {
  validateReleaseCheckpointPolicy(policy);
  validateContext(context);
  validateReleaseCheckpointDocument(checkpoint, policy);
  const observedAt = timestamp(now);
  if (!Number.isFinite(observedAt)) throw new Error("release checkpoint clock is invalid");
  const createdAt = timestamp(checkpoint.createdAt);
  if (createdAt > observedAt) throw new Error("release checkpoint creation time is in the future");

  const currentBinding = releaseCheckpointBinding(context);
  const changed = changedDependencies(checkpoint.binding, currentBinding);
  const globalInvalidation =
    checkpoint.profile !== context.profile
      ? "profile_changed"
      : checkpoint.matrixSha256 !== context.matrixSha256 || checkpoint.policySha256 !== context.policySha256
        ? "release_controls_changed"
        : "";
  const reusable = [];
  const rerun = [];
  for (const gate of checkpoint.gates) {
    if (globalInvalidation) {
      rerun.push({ name: gate.name, reason: globalInvalidation });
      continue;
    }
    const definition = policy.reusableGates[gate.name];
    const dependencyChanged = definition.dependencies.find((dependency) => changed.includes(dependency));
    if (dependencyChanged) {
      rerun.push({ name: gate.name, reason: `${dependencyChanged}_changed` });
      continue;
    }
    const completedAt = timestamp(gate.completedAt);
    const expiresAt = timestamp(gate.expiresAt);
    if (
      gate.status !== "success" ||
      !Number.isFinite(completedAt) ||
      !Number.isFinite(expiresAt) ||
      completedAt > createdAt ||
      completedAt > observedAt ||
      expiresAt <= completedAt ||
      expiresAt - completedAt > definition.maximumAgeSeconds * 1000 ||
      observedAt >= expiresAt
    ) {
      rerun.push({ name: gate.name, reason: "checkpoint_expired_or_unsuccessful" });
      continue;
    }
    reusable.push({
      name: gate.name,
      expiresAt: gate.expiresAt,
      dependencies: definition.dependencies,
    });
  }
  return {
    schemaVersion: 2,
    environment: policy.environment,
    profile: context.profile,
    matrixSha256: context.matrixSha256,
    policySha256: context.policySha256,
    candidateSha: context.candidateSha,
    bindingMatches: changed.length === 0,
    changedDependencies: changed,
    reusable,
    rerun,
    mutationGatesReused: false,
  };
}

export const RELEASE_CHECKPOINT_SAFE_REUSABLE = Object.freeze(Object.keys(SAFE_REUSABLE));
export const RELEASE_CHECKPOINT_NEVER_REUSABLE = MANDATORY_NEVER_REUSABLE;
