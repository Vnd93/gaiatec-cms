import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { isDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { materializeProductionDistArchive, verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";
import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  STAGING_ENVIRONMENT_SNAPSHOT,
  verifyStagingEnvironmentSnapshot,
} from "./staging-environment-snapshot-lib.mjs";
import {
  STAGING_EDGE_BASELINE_ARTIFACT,
  loadAndVerifyStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";
import {
  STAGING_FRONTEND_PACKAGE,
  STAGING_FRONTEND_PROFILE_KEYS,
  evaluateStagingFrontendPackageProvenance,
  stagingFrontendArtifactName,
} from "./staging-frontend-package-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROWSER_RUN_TAG = /^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/;

const STATE_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "workflow",
  "project",
  "branch",
  "markers",
  "candidateRelease",
  "original",
  "source",
  "dist",
  "recoveryArtifact",
  "environmentSnapshot",
  "edgeBaseline",
  "browserRecovery",
]);
export const STAGING_DEPLOY_RECOVERY = Object.freeze({
  repository: "Vnd93/gaiatec-cms",
  workflowName: "Deploy staging",
  workflowPath: ".github/workflows/deploy-staging.yml",
  project: "gaiatec-cms-staging",
  branch: "ev2-g17-canary",
  stateEvent: "g12.staging.deploy.prepared",
  archiveFile: STAGING_FRONTEND_PACKAGE.archiveFile,
  sealFile: "staging-baseline-dist-seal.json",
  provenanceFile: STAGING_FRONTEND_PACKAGE.provenanceFile,
  environmentSnapshotFile: STAGING_ENVIRONMENT_SNAPSHOT.fileName,
  environmentSnapshotArtifactPath: `outputs/${STAGING_ENVIRONMENT_SNAPSHOT.fileName}`,
  edgeBaselineDirectory: STAGING_EDGE_BASELINE_ARTIFACT.directory,
  edgeBaselineManifestPath: STAGING_EDGE_BASELINE_ARTIFACT.artifactManifestPath,
  maximumJsonBytes: 8 * 1024 * 1024,
  maximumArchiveBytes: 1024 * 1024 * 1024,
  minimumRemainingRetentionMs: 7 * 24 * 60 * 60 * 1000,
});

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactDigest(left, right) {
  if (!SHA256.test(String(left ?? "")) || !SHA256.test(String(right ?? ""))) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function sameCanonical(left, right) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function unique(values) {
  return [...new Set(values)];
}

export function normalizeStagingArtifactDigest(value) {
  const text = String(value ?? "");
  const normalized = text.startsWith("sha256:") ? text : `sha256:${text}`;
  if (!PREFIXED_SHA256.test(normalized)) throw new Error("G12_STAGING_DEPLOY_RECOVERY_DIGEST_REFUSED");
  return normalized;
}

function validInstant(value) {
  const parsed = Date.parse(value ?? "");
  return typeof value === "string" && Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateOriginal(value, violations, prefix = "original") {
  if (!exactKeys(value, ["deploymentId", "release", "createdOn", "commitMessage"])) {
    violations.push(`${prefix}_keys_invalid`);
    return;
  }
  if (!UUID.test(value.deploymentId ?? "")) violations.push(`${prefix}_deployment_id_invalid`);
  if (!FULL_SHA.test(value.release ?? "")) violations.push(`${prefix}_release_invalid`);
  if (!validInstant(value.createdOn)) violations.push(`${prefix}_created_on_invalid`);
  if (!isDeploymentCommitMessage(value.commitMessage)) violations.push(`${prefix}_commit_message_invalid`);
}

function validateSource(value, originalRelease, violations) {
  if (
    !exactKeys(value, [
      "ciRunId",
      "ciRunAttempt",
      "gateCiRunAttempt",
      "artifactId",
      "digest",
      "name",
      "profileSha256",
    ])
  ) {
    violations.push("source_keys_invalid");
    return;
  }
  if (!POSITIVE_INTEGER.test(value.ciRunId ?? "")) violations.push("source_ci_run_id_invalid");
  if (!Number.isSafeInteger(value.ciRunAttempt) || value.ciRunAttempt < 1 || value.ciRunAttempt > 100)
    violations.push("source_ci_run_attempt_invalid");
  if (
    !Number.isSafeInteger(value.gateCiRunAttempt) ||
    value.gateCiRunAttempt < value.ciRunAttempt ||
    value.gateCiRunAttempt > 100
  )
    violations.push("source_gate_ci_run_attempt_invalid");
  if (!POSITIVE_INTEGER.test(value.artifactId ?? "")) violations.push("source_artifact_id_invalid");
  if (!PREFIXED_SHA256.test(value.digest ?? "")) violations.push("source_digest_invalid");
  if (
    !FULL_SHA.test(originalRelease ?? "") ||
    value.name !== stagingFrontendArtifactName(originalRelease, value.ciRunId, value.ciRunAttempt)
  )
    violations.push("source_name_invalid");
  if (!SHA256.test(value.profileSha256 ?? "")) violations.push("source_profile_invalid");
}

function validateDist(value, violations) {
  if (!exactKeys(value, ["archiveSha256", "treeSha256", "archiveBytes", "fileCount", "byteCount"])) {
    violations.push("dist_keys_invalid");
    return;
  }
  if (!SHA256.test(value.archiveSha256 ?? "")) violations.push("dist_archive_digest_invalid");
  if (!SHA256.test(value.treeSha256 ?? "")) violations.push("dist_tree_digest_invalid");
  for (const key of ["archiveBytes", "fileCount", "byteCount"])
    if (!Number.isSafeInteger(value[key]) || value[key] < 1) violations.push(`dist_${key}_invalid`);
}

function validateEdgeBaseline(value, violations) {
  if (
    !exactKeys(value, [
      "manifestFile",
      "manifestSha256",
      "inventorySha256",
      "functionCount",
      "aggregateBytes",
      "aggregateRawEszipBytes",
    ])
  ) {
    violations.push("edge_baseline_keys_invalid");
    return;
  }
  if (value.manifestFile !== STAGING_DEPLOY_RECOVERY.edgeBaselineManifestPath)
    violations.push("edge_baseline_manifest_file_invalid");
  if (!SHA256.test(value.manifestSha256 ?? "")) violations.push("edge_baseline_manifest_digest_invalid");
  if (!SHA256.test(value.inventorySha256 ?? "")) violations.push("edge_baseline_inventory_digest_invalid");
  if (value.functionCount !== PRODUCTION_FUNCTIONS.length)
    violations.push("edge_baseline_function_count_invalid");
  if (
    !Number.isSafeInteger(value.aggregateBytes) ||
    value.aggregateBytes < 1 ||
    value.aggregateBytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateDeployableBytes
  )
    violations.push("edge_baseline_aggregate_bytes_invalid");
  if (
    !Number.isSafeInteger(value.aggregateRawEszipBytes) ||
    value.aggregateRawEszipBytes < 1 ||
    value.aggregateRawEszipBytes > STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateRawEszipBytes
  )
    violations.push("edge_baseline_aggregate_raw_eszip_bytes_invalid");
}

function expectedRunMarker(runId, attempt) {
  return `g12-staging-run-${runId}-${attempt}`;
}

function expectedCompensationMarker(runId, attempt) {
  return `g12-staging-deploy-compensation-${runId}-${attempt}`;
}

function expectedRecoveryArtifactName(runId, attempt) {
  return `staging-recovery-${runId}-${attempt}`;
}

function validateBrowserRecovery(value, candidateRelease, violations) {
  if (!exactKeys(value, ["environment", "runTag"])) {
    violations.push("browser_recovery_keys_invalid");
    return;
  }
  if (value.environment !== "staging") violations.push("browser_recovery_environment_invalid");
  if (!BROWSER_RUN_TAG.test(value.runTag ?? "")) {
    violations.push("browser_recovery_run_tag_invalid");
  } else if (
    !FULL_SHA.test(candidateRelease ?? "") ||
    !value.runTag.endsWith(`-${candidateRelease.slice(0, 8)}`)
  ) {
    violations.push("browser_recovery_candidate_mismatch");
  }
}

export function validateStagingDeployRecoveryState(value, expected = {}) {
  const violations = [];
  if (!exactKeys(value, STATE_KEYS)) violations.push("state_keys_invalid");
  if (value?.schemaVersion !== 4) violations.push("state_schema_invalid");
  if (value?.event !== STAGING_DEPLOY_RECOVERY.stateEvent) violations.push("state_event_invalid");
  if (!exactKeys(value?.workflow, ["runId", "attempt", "controlSha"]))
    violations.push("workflow_keys_invalid");
  if (!POSITIVE_INTEGER.test(value?.workflow?.runId ?? "")) violations.push("workflow_run_id_invalid");
  if (!Number.isSafeInteger(value?.workflow?.attempt) || value.workflow.attempt < 1)
    violations.push("workflow_attempt_invalid");
  if (!FULL_SHA.test(value?.workflow?.controlSha ?? "")) violations.push("workflow_control_sha_invalid");
  if (value?.project !== STAGING_DEPLOY_RECOVERY.project) violations.push("project_invalid");
  if (value?.branch !== STAGING_DEPLOY_RECOVERY.branch) violations.push("branch_invalid");
  if (!exactKeys(value?.markers, ["run", "compensation"])) violations.push("markers_keys_invalid");
  if (value?.markers?.run !== expectedRunMarker(value?.workflow?.runId, value?.workflow?.attempt))
    violations.push("run_marker_invalid");
  if (
    value?.markers?.compensation !==
    expectedCompensationMarker(value?.workflow?.runId, value?.workflow?.attempt)
  )
    violations.push("compensation_marker_invalid");
  if (!FULL_SHA.test(value?.candidateRelease ?? "")) violations.push("candidate_release_invalid");
  validateOriginal(value?.original, violations);
  validateSource(value?.source, value?.original?.release, violations);
  validateDist(value?.dist, violations);
  if (!exactKeys(value?.recoveryArtifact, ["id", "digest", "name"])) {
    violations.push("recovery_artifact_keys_invalid");
  } else {
    if (!POSITIVE_INTEGER.test(value.recoveryArtifact.id ?? ""))
      violations.push("recovery_artifact_id_invalid");
    if (!PREFIXED_SHA256.test(value.recoveryArtifact.digest ?? ""))
      violations.push("recovery_artifact_digest_invalid");
    if (
      value.recoveryArtifact.name !==
      expectedRecoveryArtifactName(value?.workflow?.runId, value?.workflow?.attempt)
    )
      violations.push("recovery_artifact_name_invalid");
  }
  if (!exactKeys(value?.environmentSnapshot, ["file", "sha256"])) {
    violations.push("environment_snapshot_keys_invalid");
  } else {
    if (value.environmentSnapshot.file !== STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath)
      violations.push("environment_snapshot_file_invalid");
    if (!SHA256.test(value.environmentSnapshot.sha256 ?? ""))
      violations.push("environment_snapshot_digest_invalid");
  }
  validateEdgeBaseline(value?.edgeBaseline, violations);
  validateBrowserRecovery(value?.browserRecovery, value?.candidateRelease, violations);

  for (const [name, actual, wanted] of [
    ["run_id", value?.workflow?.runId, expected.runId && String(expected.runId)],
    ["attempt", value?.workflow?.attempt, expected.attempt && Number(expected.attempt)],
    ["control_sha", value?.workflow?.controlSha, expected.controlSha],
    ["candidate_release", value?.candidateRelease, expected.candidateRelease],
    ["original_release", value?.original?.release, expected.originalRelease],
  ])
    if (wanted !== undefined && wanted !== "" && actual !== wanted) violations.push(`${name}_mismatch`);
  return { valid: violations.length === 0, violations: unique(violations), state: value };
}

export function buildStagingDeployRecoveryState({
  workflow,
  candidateRelease,
  original,
  source,
  dist,
  recoveryArtifact,
  environmentSnapshot,
  edgeBaseline,
  browserRecovery,
}) {
  const runId = String(workflow?.runId ?? "");
  const attempt = Number(workflow?.attempt);
  const state = {
    schemaVersion: 4,
    event: STAGING_DEPLOY_RECOVERY.stateEvent,
    workflow: {
      runId,
      attempt,
      controlSha: String(workflow?.controlSha ?? ""),
    },
    project: STAGING_DEPLOY_RECOVERY.project,
    branch: STAGING_DEPLOY_RECOVERY.branch,
    markers: {
      run: expectedRunMarker(runId, attempt),
      compensation: expectedCompensationMarker(runId, attempt),
    },
    candidateRelease,
    original,
    source,
    dist,
    recoveryArtifact: {
      id: String(recoveryArtifact?.id ?? ""),
      digest: normalizeStagingArtifactDigest(recoveryArtifact?.digest),
      name: String(recoveryArtifact?.name ?? ""),
    },
    environmentSnapshot,
    edgeBaseline,
    browserRecovery,
  };
  const result = validateStagingDeployRecoveryState(state);
  if (!result.valid)
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${result.violations.join(",")}`);
  return state;
}

export function stagingDeployRecoveryCheckpointContext(state, { profile, matrixSha256, policySha256 }) {
  const result = validateStagingDeployRecoveryState(state);
  if (!result.valid) {
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${result.violations.join(",")}`);
  }
  if (
    state.candidateRelease !== state.original.release ||
    !["frontend-only", "edge-only", "database-auth", "full-release"].includes(profile) ||
    !SHA256.test(matrixSha256 ?? "") ||
    !SHA256.test(policySha256 ?? "")
  ) {
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_CHECKPOINT_CONTEXT_REFUSED");
  }
  return {
    profile,
    matrixSha256,
    policySha256,
    candidateSha: state.candidateRelease,
    artifact: {
      id: state.source.artifactId,
      digest: state.source.digest,
      archiveSha256: state.dist.archiveSha256,
      treeSha256: state.dist.treeSha256,
      gateCiRunAttempt: state.source.gateCiRunAttempt,
    },
    deployment: { id: state.original.deploymentId },
    environment: {
      snapshotSha256: state.environmentSnapshot.sha256,
      edgeBaselineManifestSha256: state.edgeBaseline.manifestSha256,
    },
  };
}

async function readStableFile(path, maximumBytes = STAGING_DEPLOY_RECOVERY.maximumJsonBytes) {
  const target = resolve(path);
  const pathMetadata = await lstat(target);
  if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink())
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_FILE_TYPE_REFUSED");
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size < 1n || before.size > BigInt(maximumBytes))
      throw new Error("G12_STAGING_DEPLOY_RECOVERY_FILE_SIZE_REFUSED");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      BigInt(bytes.length) !== before.size
    )
      throw new Error("G12_STAGING_DEPLOY_RECOVERY_FILE_CHANGED_DURING_READ");
    return { bytes, byteCount: bytes.length, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

function parseJson(identity, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(identity.bytes);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_${label}_JSON_REFUSED`, { cause: error });
  }
}

export async function readStagingDeployRecoveryJson(path, label = "STATE") {
  const identity = await readStableFile(path);
  return { identity, value: parseJson(identity, label) };
}

function safeArtifactPath(root, child) {
  const base = resolve(root);
  const target = resolve(base, child);
  const relation = relative(base, target);
  if (!relation || relation.startsWith("..") || isAbsolute(relation))
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_PATH_REFUSED");
  return target;
}

async function requireDirectory(path, expectedEntries) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_DIRECTORY_REFUSED");
  const entries = await readdir(path, { withFileTypes: true });
  if (
    JSON.stringify(entries.map((entry) => entry.name).sort()) !== JSON.stringify([...expectedEntries].sort())
  )
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_CONTENTS_REFUSED");
  return entries;
}

function profileFingerprint(profile) {
  if (
    !exactKeys(profile, ["algorithm", "fingerprints", "sha256"]) ||
    profile.algorithm !== "sha256" ||
    !exactKeys(profile.fingerprints, STAGING_FRONTEND_PROFILE_KEYS)
  )
    return "";
  if (STAGING_FRONTEND_PROFILE_KEYS.some((key) => !SHA256.test(profile.fingerprints[key] ?? ""))) return "";
  return sha256(
    Buffer.from(
      JSON.stringify(STAGING_FRONTEND_PROFILE_KEYS.map((key) => [key, profile.fingerprints[key]])),
      "utf8",
    ),
  );
}

function validateProvenanceIdentity({ provenance, state, archiveIdentity, sealIdentity, seal, snapshot }) {
  const profileSha256 = profileFingerprint(provenance?.profile);
  const result = evaluateStagingFrontendPackageProvenance({
    provenance,
    expected: {
      candidateSha: state.original.release,
      runId: state.source.ciRunId,
      runAttempt: state.source.ciRunAttempt,
    },
    profile: provenance?.profile,
    archiveIdentity: { bytes: archiveIdentity.byteCount, sha256: archiveIdentity.sha256 },
    sealIdentity: { bytes: sealIdentity.byteCount, sha256: sealIdentity.sha256 },
    seal,
    snapshot,
  });
  const violations = [...result.violations];
  if (!exactDigest(profileSha256, provenance?.profile?.sha256))
    violations.push("provenance_profile_fingerprint_invalid");
  if (!exactDigest(profileSha256, state.source.profileSha256))
    violations.push("provenance_profile_state_mismatch");
  if (provenance?.artifactName !== state.source.name) violations.push("provenance_source_name_mismatch");
  return unique(violations);
}

function validateSealStateBinding(seal, state) {
  const violations = [];
  if (
    seal?.schemaVersion !== 2 ||
    seal?.event !== "g12.production.dist.sealed" ||
    seal?.candidateSha !== state.original.release ||
    seal?.archiveFile !== STAGING_DEPLOY_RECOVERY.archiveFile
  )
    violations.push("seal_identity_invalid");
  for (const [sealKey, stateKey] of [
    ["archiveSha256", "archiveSha256"],
    ["treeSha256", "treeSha256"],
    ["archiveBytes", "archiveBytes"],
    ["fileCount", "fileCount"],
    ["byteCount", "byteCount"],
  ])
    if (seal?.[sealKey] !== state.dist[stateKey]) violations.push(`seal_${sealKey}_mismatch`);
  return violations;
}

export function validateStagingDeployRecoverySourceFiles({
  seal,
  provenance,
  originalRelease,
  source,
  dist,
}) {
  const violations = [];
  validateSource(source, originalRelease, violations);
  validateDist(dist, violations);
  if (
    seal?.schemaVersion !== 2 ||
    seal?.event !== "g12.production.dist.sealed" ||
    seal?.candidateSha !== originalRelease ||
    seal?.archiveFile !== STAGING_DEPLOY_RECOVERY.archiveFile
  )
    violations.push("seal_identity_invalid");
  for (const key of ["archiveSha256", "treeSha256", "archiveBytes", "fileCount", "byteCount"])
    if (seal?.[key] !== dist?.[key]) violations.push(`seal_${key}_mismatch`);
  const profileSha256 = profileFingerprint(provenance?.profile);
  if (
    provenance?.schemaVersion !== 1 ||
    provenance?.event !== "g12.staging.frontend.package_provenance" ||
    provenance?.repository !== STAGING_DEPLOY_RECOVERY.repository ||
    !exactKeys(provenance?.workflow, ["name", "path"]) ||
    provenance?.workflow?.name !== STAGING_FRONTEND_PACKAGE.workflowName ||
    provenance?.workflow?.path !== STAGING_FRONTEND_PACKAGE.workflowPath ||
    provenance?.controlSha !== originalRelease ||
    provenance?.sourceRunId !== source?.ciRunId ||
    provenance?.sourceRunAttempt !== source?.ciRunAttempt ||
    provenance?.artifactName !== source?.name ||
    !exactDigest(profileSha256, provenance?.profile?.sha256) ||
    !exactDigest(profileSha256, source?.profileSha256) ||
    !exactKeys(provenance?.archive, ["file", "bytes", "sha256"]) ||
    provenance?.archive?.file !== STAGING_DEPLOY_RECOVERY.archiveFile ||
    provenance?.archive?.bytes !== dist?.archiveBytes ||
    !exactDigest(provenance?.archive?.sha256, dist?.archiveSha256) ||
    !exactKeys(provenance?.dist, ["treeSha256", "fileCount", "byteCount"]) ||
    !exactDigest(provenance?.dist?.treeSha256, dist?.treeSha256) ||
    provenance?.dist?.fileCount !== dist?.fileCount ||
    provenance?.dist?.byteCount !== dist?.byteCount ||
    !exactKeys(provenance?.seal, ["file", "bytes", "sha256"]) ||
    provenance?.seal?.file !== STAGING_FRONTEND_PACKAGE.sealFile ||
    !Number.isSafeInteger(provenance?.seal?.bytes) ||
    provenance.seal.bytes < 1 ||
    !SHA256.test(provenance?.seal?.sha256 ?? "")
  )
    violations.push("provenance_identity_invalid");
  return { valid: violations.length === 0, violations: unique(violations) };
}

export function validateStagingDeployRecoveryArtifactMetadata(artifact, run, state, now = Date.now()) {
  const stateResult = validateStagingDeployRecoveryState(state);
  const violations = [...stateResult.violations];
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  const runStartedAt = Date.parse(run?.run_started_at ?? "");
  if (
    String(artifact?.id ?? "") !== state?.recoveryArtifact?.id ||
    artifact?.name !== state?.recoveryArtifact?.name ||
    (() => {
      try {
        return normalizeStagingArtifactDigest(artifact?.digest) !== state?.recoveryArtifact?.digest;
      } catch {
        return true;
      }
    })() ||
    artifact?.expired !== false ||
    !Number.isSafeInteger(artifact?.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(runStartedAt) ||
    createdAt < runStartedAt ||
    createdAt > now + 5 * 60 * 1000 ||
    expiresAt - now < STAGING_DEPLOY_RECOVERY.minimumRemainingRetentionMs ||
    String(artifact?.workflow_run?.id ?? "") !== state?.workflow?.runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== state?.workflow?.controlSha
  )
    violations.push("recovery_artifact_metadata_invalid");
  if (
    String(run?.id ?? "") !== state?.workflow?.runId ||
    Number(run?.run_attempt) !== state?.workflow?.attempt ||
    run?.name !== STAGING_DEPLOY_RECOVERY.workflowName ||
    run?.path !== STAGING_DEPLOY_RECOVERY.workflowPath ||
    run?.event !== "workflow_dispatch" ||
    run?.head_branch !== "main" ||
    run?.head_sha !== state?.workflow?.controlSha ||
    run?.repository?.full_name !== STAGING_DEPLOY_RECOVERY.repository ||
    run?.head_repository?.full_name !== STAGING_DEPLOY_RECOVERY.repository
  )
    violations.push("recovery_artifact_run_invalid");
  return { valid: violations.length === 0, violations: unique(violations) };
}

export async function verifyStagingDeployRecoveryArtifact({ artifactDirectory, state }) {
  const stateResult = validateStagingDeployRecoveryState(state);
  if (!stateResult.valid)
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${stateResult.violations.join(",")}`);
  const root = resolve(artifactDirectory);
  await requireDirectory(root, ["dist", STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory, "outputs"]);
  const distPath = safeArtifactPath(root, "dist");
  const outputsPath = safeArtifactPath(root, "outputs");
  await requireDirectory(distPath, (await readdir(distPath)).map(String));
  const outputEntries = await requireDirectory(outputsPath, [
    STAGING_DEPLOY_RECOVERY.archiveFile,
    STAGING_DEPLOY_RECOVERY.sealFile,
    STAGING_DEPLOY_RECOVERY.provenanceFile,
    STAGING_DEPLOY_RECOVERY.environmentSnapshotFile,
  ]);
  if (outputEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()))
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_OUTPUT_TYPE_REFUSED");

  const archivePath = safeArtifactPath(outputsPath, STAGING_DEPLOY_RECOVERY.archiveFile);
  const sealPath = safeArtifactPath(outputsPath, STAGING_DEPLOY_RECOVERY.sealFile);
  const provenancePath = safeArtifactPath(outputsPath, STAGING_DEPLOY_RECOVERY.provenanceFile);
  const environmentPath = safeArtifactPath(outputsPath, STAGING_DEPLOY_RECOVERY.environmentSnapshotFile);
  const edgeBaselinePath = safeArtifactPath(root, STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory);
  const [archiveIdentity, sealRead, provenanceRead, environmentVerification] = await Promise.all([
    readStableFile(archivePath, STAGING_DEPLOY_RECOVERY.maximumArchiveBytes),
    readStagingDeployRecoveryJson(sealPath, "SEAL"),
    readStagingDeployRecoveryJson(provenancePath, "PROVENANCE"),
    verifyStagingEnvironmentSnapshot({
      snapshotPath: environmentPath,
      expected: {
        candidateSha: state.candidateRelease,
        controlSha: state.workflow.controlSha,
        projectRef: STAGING_ENVIRONMENT_SNAPSHOT.projectRef,
        pagesDeployment: {
          id: state.original.deploymentId,
          branch: STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch,
          commitSha: state.original.release,
          createdOn: state.original.createdOn,
        },
      },
    }),
  ]);
  const seal = sealRead.value;
  const provenance = provenanceRead.value;
  const violations = validateSealStateBinding(seal, state);
  let edgeBaseline;
  try {
    edgeBaseline = loadAndVerifyStagingEdgeBaselineArtifact({
      root: edgeBaselinePath,
      expectedManifestSha256: state.edgeBaseline.manifestSha256,
      expected: {
        projectRef: STAGING_EDGE_BASELINE_ARTIFACT.projectRef,
        candidateSha: state.candidateRelease,
        controlSha: state.workflow.controlSha,
        runId: state.workflow.runId,
        runAttempt: state.workflow.attempt,
      },
    });
    if (edgeBaseline.manifest.inventorySha256 !== state.edgeBaseline.inventorySha256)
      violations.push("edge_baseline_inventory_state_mismatch");
    if (edgeBaseline.manifest.functionCount !== state.edgeBaseline.functionCount)
      violations.push("edge_baseline_function_count_state_mismatch");
    if (edgeBaseline.manifest.aggregateBytes !== state.edgeBaseline.aggregateBytes)
      violations.push("edge_baseline_aggregate_bytes_state_mismatch");
    if (edgeBaseline.manifest.aggregateRawEszipBytes !== state.edgeBaseline.aggregateRawEszipBytes)
      violations.push("edge_baseline_aggregate_raw_eszip_bytes_state_mismatch");
  } catch (error) {
    violations.push(String(error instanceof Error ? error.message : error));
  }
  if (!exactDigest(archiveIdentity.sha256, state.dist.archiveSha256))
    violations.push("archive_state_digest_mismatch");
  if (archiveIdentity.byteCount !== state.dist.archiveBytes) violations.push("archive_state_size_mismatch");
  if (!exactDigest(environmentVerification.snapshotSha256, state.environmentSnapshot.sha256))
    violations.push("environment_snapshot_digest_mismatch");

  const distResult = await verifyProductionDistSeal(distPath, seal, state.original.release);
  if (!distResult.valid) violations.push(...distResult.violations.map((item) => `dist_${item}`));
  const temporary = await mkdtemp(join(tmpdir(), "g12-staging-recovery-verify-"));
  try {
    const archiveSnapshot = await materializeProductionDistArchive(
      archivePath,
      seal,
      state.original.release,
      resolve(temporary, "dist"),
    );
    if (distResult.snapshot && !sameCanonical(archiveSnapshot, distResult.snapshot))
      violations.push("archive_dist_snapshot_mismatch");
    violations.push(
      ...validateProvenanceIdentity({
        provenance,
        state,
        archiveIdentity,
        sealIdentity: sealRead.identity,
        seal,
        snapshot: archiveSnapshot,
      }),
    );
  } catch (error) {
    violations.push(String(error instanceof Error ? error.message : error));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const result = { valid: violations.length === 0, violations: unique(violations) };
  if (!result.valid)
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_ARTIFACT_REFUSED:${result.violations.join(",")}`);
  return {
    state,
    archiveSha256: archiveIdentity.sha256,
    environmentSnapshotSha256: environmentVerification.snapshotSha256,
    edgeBaselineManifestSha256: edgeBaseline?.manifestSha256,
    edgeBaselineInventorySha256: edgeBaseline?.manifest?.inventorySha256,
    edgeBaselineAggregateRawEszipBytes: edgeBaseline?.manifest?.aggregateRawEszipBytes,
  };
}

export function recoveryStateOutputs(state, statePath) {
  const result = validateStagingDeployRecoveryState(state);
  if (!result.valid)
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${result.violations.join(",")}`);
  return {
    candidate_release: state.candidateRelease,
    original_release: state.original.release,
    original_deployment: state.original.deploymentId,
    original_created_on: state.original.createdOn,
    original_commit_message_b64: Buffer.from(state.original.commitMessage, "utf8").toString("base64"),
    run_marker: state.markers.run,
    compensation_marker: state.markers.compensation,
    source_ci_run_id: state.source.ciRunId,
    source_ci_run_attempt: String(state.source.ciRunAttempt),
    gate_ci_run_attempt: String(state.source.gateCiRunAttempt),
    source_artifact_id: state.source.artifactId,
    source_artifact_digest: state.source.digest,
    source_artifact_name: state.source.name,
    source_profile_sha256: state.source.profileSha256,
    archive_sha256: state.dist.archiveSha256,
    tree_sha256: state.dist.treeSha256,
    archive_bytes: String(state.dist.archiveBytes),
    file_count: String(state.dist.fileCount),
    byte_count: String(state.dist.byteCount),
    recovery_artifact_id: state.recoveryArtifact.id,
    recovery_artifact_digest: state.recoveryArtifact.digest,
    recovery_artifact_name: state.recoveryArtifact.name,
    environment_snapshot_file: state.environmentSnapshot.file,
    environment_snapshot_sha256: state.environmentSnapshot.sha256,
    edge_baseline_manifest_file: state.edgeBaseline.manifestFile,
    edge_baseline_manifest_sha256: state.edgeBaseline.manifestSha256,
    edge_baseline_inventory_sha256: state.edgeBaseline.inventorySha256,
    edge_baseline_function_count: String(state.edgeBaseline.functionCount),
    edge_baseline_aggregate_bytes: String(state.edgeBaseline.aggregateBytes),
    edge_baseline_aggregate_raw_eszip_bytes: String(state.edgeBaseline.aggregateRawEszipBytes),
    browser_run_tag: state.browserRecovery.runTag,
    browser_environment: state.browserRecovery.environment,
    state_path: statePath,
  };
}

export function stagingDeployRecoveryIdentityFromSealAndProvenance({ seal, provenance }) {
  const source = {
    ciRunId: String(provenance?.sourceRunId ?? ""),
    ciRunAttempt: Number(provenance?.sourceRunAttempt),
    artifactId: "",
    digest: "",
    name: String(provenance?.artifactName ?? ""),
    profileSha256: String(provenance?.profile?.sha256 ?? ""),
  };
  const dist = {
    archiveSha256: String(seal?.archiveSha256 ?? ""),
    treeSha256: String(seal?.treeSha256 ?? ""),
    archiveBytes: Number(seal?.archiveBytes),
    fileCount: Number(seal?.fileCount),
    byteCount: Number(seal?.byteCount),
  };
  return { source, dist };
}
