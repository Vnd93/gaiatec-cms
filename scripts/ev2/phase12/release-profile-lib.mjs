import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const PROFILE_NAMES = ["frontend-only", "edge-only", "database-auth", "full-release"];
const CLASSIFIABLE_PROFILES = PROFILE_NAMES.filter((profile) => profile !== "full-release");
const SAFE_TOKEN = /^[a-z][a-z0-9-]{1,63}$/;
const PROFILE_JOB_CONTRACTS = Object.freeze({
  "frontend-only": Object.freeze(["quality", "package-staging", "browser"]),
  "edge-only": Object.freeze(["quality", "package-staging", "hotfix-bundle-smoke", "browser"]),
  "database-auth": Object.freeze(["quality", "package-staging", "database", "browser"]),
  "full-release": Object.freeze(["quality", "package-staging", "hotfix-bundle-smoke", "database", "browser"]),
});
const PROFILE_GATE_CONTRACTS = Object.freeze({
  "frontend-only": Object.freeze([
    "preflight",
    "supply-chain",
    "frontend-static",
    "frontend-unit",
    "browser-headless",
    "artifact-seal",
    "immutable-provenance",
    "recovery-ready",
    "rollback-compatibility",
    "security-regression",
    "pages-candidate",
    "postdeploy-http",
    "real-chrome-authenticated",
    "audit-terminal",
    "cleanup-zero",
  ]),
  "edge-only": Object.freeze([
    "preflight",
    "supply-chain",
    "frontend-static",
    "frontend-unit",
    "browser-headless",
    "edge-contract",
    "edge-runtime-smoke",
    "artifact-seal",
    "immutable-provenance",
    "recovery-ready",
    "rollback-compatibility",
    "security-regression",
    "pages-candidate",
    "edge-mutation",
    "postdeploy-http",
    "postdeploy-edge",
    "real-chrome-authenticated",
    "audit-terminal",
    "cleanup-zero",
  ]),
  "database-auth": Object.freeze([
    "preflight",
    "supply-chain",
    "frontend-static",
    "frontend-unit",
    "browser-headless",
    "migration-contract",
    "rls",
    "mfa-aal2",
    "artifact-seal",
    "immutable-provenance",
    "recovery-ready",
    "rollback-compatibility",
    "security-regression",
    "pages-candidate",
    "database-auth-mutation",
    "postdeploy-http",
    "postdeploy-database-auth",
    "real-chrome-authenticated",
    "audit-terminal",
    "cleanup-zero",
  ]),
  "full-release": Object.freeze([
    "preflight",
    "supply-chain",
    "frontend-static",
    "frontend-unit",
    "browser-headless",
    "edge-contract",
    "edge-runtime-smoke",
    "migration-contract",
    "rls",
    "mfa-aal2",
    "artifact-seal",
    "immutable-provenance",
    "recovery-ready",
    "rollback-compatibility",
    "security-regression",
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
  ]),
});
const ZERO_SHA = /^0{40}$/;
const FULL_SHA = /^[a-f0-9]{40}$/;
const CONTROL_PLANE_EXACT_PATHS = new Set([
  "scripts/ev2/phase12/release-profile-lib.mjs",
  "scripts/ev2/phase12/select-release-profile.mjs",
  ".github/release-controls/release-gate-matrix.json",
  ".github/workflows/ci.yml",
]);
const CONTROL_PLANE_PREFIXES = [".github/workflows/", ".github/release-controls/"];

export const RELEASE_PLAN_SCHEMA_VERSION = 2;
export const RELEASE_PROFILE_CONTROL_PATHS = Object.freeze({
  selector: "scripts/ev2/phase12/select-release-profile.mjs",
  library: "scripts/ev2/phase12/release-profile-lib.mjs",
  matrix: ".github/release-controls/release-gate-matrix.json",
  checkpointPolicy: ".github/release-controls/release-checkpoint-policy.json",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function hashReleaseProfileImplementation(selectorBytes, libraryBytes) {
  const hash = createHash("sha256");
  for (const [label, bytes] of [
    [RELEASE_PROFILE_CONTROL_PATHS.selector, Buffer.from(selectorBytes)],
    [RELEASE_PROFILE_CONTROL_PATHS.library, Buffer.from(libraryBytes)],
  ]) {
    hash.update(`${label}\0${bytes.length}\0`, "utf8");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export function createBootstrapReleaseGateMatrix() {
  return {
    schemaVersion: 1,
    defaultProfile: "full-release",
    ambiguityPolicy: "full-release",
    profiles: Object.fromEntries(
      PROFILE_NAMES.map((profile) => [
        profile,
        {
          jobs: [...PROFILE_JOB_CONTRACTS[profile]],
          gates: [...PROFILE_GATE_CONTRACTS[profile]],
        },
      ]),
    ),
    classification: {
      forceFullRelease: { exact: [], prefixes: [] },
      byProfile: Object.fromEntries(
        CLASSIFIABLE_PROFILES.map((profile) => [profile, { exact: [], prefixes: [] }]),
      ),
    },
  };
}

export function createBootstrapReleaseGateMatrixBytes() {
  return canonicalJsonBytes(createBootstrapReleaseGateMatrix());
}

export function createBootstrapReleaseCheckpointPolicyBytes() {
  return canonicalJsonBytes({
    schemaVersion: 1,
    environment: "staging",
    defaultDecision: "rerun",
    changeInvalidationOrder: ["source", "artifact", "deployment", "environment"],
    reusableGates: {
      "artifact-seal": { dependencies: ["source", "artifact"], maximumAgeSeconds: 1 },
      "immutable-provenance": {
        dependencies: ["source", "artifact"],
        maximumAgeSeconds: 1,
      },
    },
    neverReusable: [
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
    ],
  });
}

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function uniqueStrings(values, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  if (values.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new Error(`${label} entries must be non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} entries must be unique`);
  return values;
}

function validateMatcher(matcher, label) {
  if (!matcher || typeof matcher !== "object" || Array.isArray(matcher)) {
    throw new Error(`${label} must be an object`);
  }
  const exact = uniqueStrings(matcher.exact, `${label}.exact`, { allowEmpty: true });
  const prefixes = uniqueStrings(matcher.prefixes, `${label}.prefixes`, { allowEmpty: true });
  for (const value of [...exact, ...prefixes]) {
    if (
      value.includes("\\") ||
      value.includes("\0") ||
      value.startsWith("/") ||
      value.split("/").includes("..")
    ) {
      throw new Error(`${label} contains an unsafe repository path`);
    }
  }
  for (const prefix of prefixes) {
    if (!prefix.endsWith("/")) throw new Error(`${label}.prefixes entries must end with /`);
  }
  return { exact, prefixes };
}

export function validateReleaseGateMatrix(matrix) {
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    throw new Error("release gate matrix must be an object");
  }
  if (matrix.schemaVersion !== 1) throw new Error("unsupported release gate matrix schemaVersion");
  if (matrix.defaultProfile !== "full-release" || matrix.ambiguityPolicy !== "full-release") {
    throw new Error("release gate matrix must fail closed to full-release");
  }
  const profileKeys = Object.keys(matrix.profiles ?? {}).sort();
  if (JSON.stringify(profileKeys) !== JSON.stringify([...PROFILE_NAMES].sort())) {
    throw new Error("release gate matrix must define exactly the four supported profiles");
  }
  for (const profile of PROFILE_NAMES) {
    const definition = matrix.profiles[profile];
    const jobs = uniqueStrings(definition?.jobs, `profiles.${profile}.jobs`);
    const gates = uniqueStrings(definition?.gates, `profiles.${profile}.gates`);
    if (jobs.some((job) => !SAFE_TOKEN.test(job)) || gates.some((gate) => !SAFE_TOKEN.test(gate))) {
      throw new Error(`profiles.${profile} contains an invalid job or gate token`);
    }
    if (!sameMembers(jobs, PROFILE_JOB_CONTRACTS[profile])) {
      throw new Error(`profiles.${profile}.jobs violates the immutable safety contract`);
    }
    if (!sameMembers(gates, PROFILE_GATE_CONTRACTS[profile])) {
      throw new Error(`profiles.${profile}.gates violates the immutable safety contract`);
    }
    for (const mandatory of [
      "preflight",
      "supply-chain",
      "artifact-seal",
      "immutable-provenance",
      "recovery-ready",
      "rollback-compatibility",
      "security-regression",
      "real-chrome-authenticated",
      "audit-terminal",
      "cleanup-zero",
    ]) {
      if (!gates.includes(mandatory)) {
        throw new Error(`profiles.${profile}.gates is missing mandatory gate ${mandatory}`);
      }
    }
  }
  const classification = matrix.classification;
  const forceFullRelease = validateMatcher(
    classification?.forceFullRelease,
    "classification.forceFullRelease",
  );
  const classifierKeys = Object.keys(classification?.byProfile ?? {}).sort();
  if (JSON.stringify(classifierKeys) !== JSON.stringify([...CLASSIFIABLE_PROFILES].sort())) {
    throw new Error("classification.byProfile must define exactly the three narrow profiles");
  }
  const byProfile = Object.fromEntries(
    CLASSIFIABLE_PROFILES.map((profile) => [
      profile,
      validateMatcher(classification.byProfile[profile], `classification.byProfile.${profile}`),
    ]),
  );
  return { forceFullRelease, byProfile };
}

function normalizeRepositoryPath(value) {
  const path = String(value ?? "");
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return "";
  }
  return path;
}

function matches(path, matcher) {
  return matcher.exact.includes(path) || matcher.prefixes.some((prefix) => path.startsWith(prefix));
}

export function selectReleaseProfile({ matrix, changedFiles, upstreamViolations = [] }) {
  const classification = validateReleaseGateMatrix(matrix);
  const violations = uniqueStrings(upstreamViolations, "upstreamViolations", { allowEmpty: true });
  const normalized = [];
  for (const value of Array.isArray(changedFiles) ? changedFiles : []) {
    const path = normalizeRepositoryPath(value);
    if (!path) violations.push("changed_path_invalid");
    else normalized.push(path);
  }
  const files = [...new Set(normalized)].sort();
  if (files.length === 0) violations.push("changed_paths_empty");

  const matchesByFile = [];
  const narrowProfiles = new Set();
  for (const path of files) {
    if (matches(path, classification.forceFullRelease)) {
      matchesByFile.push({ path, profiles: ["full-release"], reason: "control-critical" });
      violations.push("control_critical_change");
      continue;
    }
    const profiles = CLASSIFIABLE_PROFILES.filter((profile) =>
      matches(path, classification.byProfile[profile]),
    );
    if (profiles.length !== 1) {
      matchesByFile.push({ path, profiles, reason: profiles.length === 0 ? "unmatched" : "overlap" });
      violations.push(profiles.length === 0 ? "unmatched_change" : "overlapping_change");
      continue;
    }
    narrowProfiles.add(profiles[0]);
    matchesByFile.push({ path, profiles, reason: "classified" });
  }
  if (narrowProfiles.size > 1) violations.push("mixed_release_domains");

  const uniqueViolations = [...new Set(violations)].sort();
  const selectedProfile =
    uniqueViolations.length === 0 && narrowProfiles.size === 1
      ? [...narrowProfiles][0]
      : matrix.defaultProfile;
  const definition = matrix.profiles[selectedProfile];
  return {
    schemaVersion: matrix.schemaVersion,
    selectedProfile,
    failClosed: selectedProfile === "full-release" && uniqueViolations.length > 0,
    violations: uniqueViolations,
    changedFiles: files,
    matchesByFile,
    jobs: [...definition.jobs],
    gates: [...definition.gates],
  };
}

function runGit(repositoryRoot, arguments_, options = {}) {
  return execFileSync("git", arguments_, {
    cwd: resolve(repositoryRoot),
    encoding: options.encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function collectReleaseProfileChangedFiles({ repositoryRoot, baseSha, candidateSha }) {
  const base = String(baseSha ?? "").toLowerCase();
  const candidate = String(candidateSha ?? "").toLowerCase();
  if (!FULL_SHA.test(candidate) || ZERO_SHA.test(candidate)) {
    return { changedFiles: [], violations: ["head_sha_invalid"] };
  }
  try {
    runGit(repositoryRoot, ["cat-file", "-e", `${candidate}^{commit}`]);
  } catch {
    return { changedFiles: [], violations: ["head_commit_missing"] };
  }
  if (!FULL_SHA.test(base)) return { changedFiles: [], violations: ["base_sha_invalid"] };
  try {
    if (ZERO_SHA.test(base)) {
      return {
        changedFiles: runGit(repositoryRoot, ["ls-tree", "-r", "--name-only", candidate], {
          encoding: "utf8",
        })
          .split(/\r?\n/u)
          .filter(Boolean),
        violations: [],
      };
    }
    runGit(repositoryRoot, ["cat-file", "-e", `${base}^{commit}`]);
    runGit(repositoryRoot, ["merge-base", "--is-ancestor", base, candidate]);
    return {
      changedFiles: runGit(
        repositoryRoot,
        ["diff", "--no-renames", "--name-only", "--diff-filter=ACDMRTUXB", base, candidate],
        { encoding: "utf8" },
      )
        .split(/\r?\n/u)
        .filter(Boolean),
      violations: [],
    };
  } catch {
    return { changedFiles: [], violations: ["change_range_untrusted"] };
  }
}

function changesReleaseProfileControls(path) {
  return (
    CONTROL_PLANE_EXACT_PATHS.has(path) || CONTROL_PLANE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function releasePlanControlFields({
  baseSha,
  candidateSha,
  trustMode,
  selectorBytes,
  libraryBytes,
  controlMatrixBytes,
  candidateMatrixBytes,
  controlCheckpointPolicyBytes,
  candidateCheckpointPolicyBytes,
}) {
  const controlMatrixSha256 = sha256(controlMatrixBytes);
  return {
    baseSha,
    candidateSha,
    controlSha: baseSha,
    trustMode,
    controlImplementationSha256: hashReleaseProfileImplementation(selectorBytes, libraryBytes),
    controlMatrixSha256,
    candidateMatrixSha256: candidateMatrixBytes ? sha256(candidateMatrixBytes) : null,
    controlCheckpointPolicySha256: sha256(controlCheckpointPolicyBytes),
    candidateCheckpointPolicySha256: candidateCheckpointPolicyBytes
      ? sha256(candidateCheckpointPolicyBytes)
      : null,
    checkpointPolicySha256: sha256(controlCheckpointPolicyBytes),
    matrixSha256: controlMatrixSha256,
  };
}

function parseTrustedMatrix(matrixBytes) {
  let matrix;
  try {
    matrix = JSON.parse(Buffer.from(matrixBytes).toString("utf8"));
  } catch {
    throw new Error("release gate matrix is not valid JSON");
  }
  validateReleaseGateMatrix(matrix);
  return matrix;
}

export function buildReleasePlanFromTrustedControls({
  repositoryRoot,
  baseSha,
  candidateSha,
  controlSelectorBytes,
  controlLibraryBytes,
  controlMatrixBytes,
  controlCheckpointPolicyBytes,
  candidateMatrixBytes = null,
  candidateCheckpointPolicyBytes = null,
}) {
  const base = String(baseSha ?? "").toLowerCase();
  const candidate = String(candidateSha ?? "").toLowerCase();
  if (!FULL_SHA.test(base) || ZERO_SHA.test(base)) {
    throw new Error("trusted release controls require a non-zero base SHA");
  }
  const matrix = parseTrustedMatrix(controlMatrixBytes);
  const changeSet = collectReleaseProfileChangedFiles({
    repositoryRoot,
    baseSha: base,
    candidateSha: candidate,
  });
  const controlChanged = changeSet.changedFiles.some(changesReleaseProfileControls);
  const selection = selectReleaseProfile({
    matrix,
    changedFiles: changeSet.changedFiles,
    upstreamViolations: [...changeSet.violations, ...(controlChanged ? ["control_plane_change"] : [])],
  });
  return {
    ...selection,
    schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
    ...releasePlanControlFields({
      baseSha: base,
      candidateSha: candidate,
      trustMode: "base-controls",
      selectorBytes: controlSelectorBytes,
      libraryBytes: controlLibraryBytes,
      controlMatrixBytes,
      candidateMatrixBytes,
      controlCheckpointPolicyBytes,
      candidateCheckpointPolicyBytes,
    }),
  };
}

export function buildBootstrapReleasePlan({
  repositoryRoot,
  baseSha,
  candidateSha,
  controlSelectorBytes,
  controlLibraryBytes,
  candidateMatrixBytes = null,
  candidateCheckpointPolicyBytes = null,
  upstreamViolations = [],
}) {
  const base = String(baseSha ?? "").toLowerCase();
  const candidate = String(candidateSha ?? "").toLowerCase();
  const controlMatrixBytes = createBootstrapReleaseGateMatrixBytes();
  const controlCheckpointPolicyBytes = createBootstrapReleaseCheckpointPolicyBytes();
  const matrix = parseTrustedMatrix(controlMatrixBytes);
  const changeSet = collectReleaseProfileChangedFiles({
    repositoryRoot,
    baseSha: base,
    candidateSha: candidate,
  });
  const selection = selectReleaseProfile({
    matrix,
    changedFiles: changeSet.changedFiles,
    upstreamViolations: [
      ...changeSet.violations,
      ...upstreamViolations,
      ...(changeSet.changedFiles.some(changesReleaseProfileControls) ? ["control_plane_change"] : []),
      "control_bootstrap_required",
    ],
  });
  if (selection.selectedProfile !== "full-release" || !selection.failClosed) {
    throw new Error("bootstrap release plan must fail closed to full-release");
  }
  return {
    ...selection,
    schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
    ...releasePlanControlFields({
      baseSha: base,
      candidateSha: candidate,
      trustMode: "bootstrap-full",
      selectorBytes: controlSelectorBytes,
      libraryBytes: controlLibraryBytes,
      controlMatrixBytes,
      candidateMatrixBytes,
      controlCheckpointPolicyBytes,
      candidateCheckpointPolicyBytes,
    }),
  };
}

export const RELEASE_PROFILE_NAMES = Object.freeze([...PROFILE_NAMES]);
