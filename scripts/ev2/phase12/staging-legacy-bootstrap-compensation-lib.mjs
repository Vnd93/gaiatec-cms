import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { materializeProductionDistArchive, verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";
import { validateStagingBaselineBootstrapRecord } from "./staging-baseline-bootstrap-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const STAGING_LEGACY_BOOTSTRAP_COMPENSATION = Object.freeze({
  mode: "legacy-bootstrap-compensation",
  stateFile: "staging-deploy-state.json",
  archiveFile: "staging-baseline-dist.tar",
  sealFile: "staging-baseline-dist-seal.json",
  project: "gaiatec-cms-staging",
  branch: "ev2-g17-canary",
  stateEvent: "g12.staging.deploy.prepared",
  maximumJsonBytes: 8 * 1024 * 1024,
  maximumArchiveBytes: 1024 * 1024 * 1024,
});

const LEGACY_STATE_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "workflow",
  "project",
  "branch",
  "runMarker",
  "compensationMarker",
  "candidateRelease",
  "original",
]);

const SEAL_KEYS = Object.freeze([
  "schemaVersion",
  "event",
  "candidateSha",
  "fileCount",
  "byteCount",
  "treeSha256",
  "files",
  "archiveFile",
  "archiveBytes",
  "archiveSha256",
]);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function unique(values) {
  return [...new Set(values)];
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

function expectedStateArtifactName(runId, runAttempt) {
  return `staging-deploy-state-${runId}-${runAttempt}`;
}

function expectedRecoveryArtifactName(runId, runAttempt) {
  return `staging-recovery-${runId}-${runAttempt}`;
}

export function validateStagingLegacyBootstrapCompensationIdentity({
  record,
  candidateSha,
  controlSha,
  runId,
  runAttempt,
}) {
  const recordResult = validateStagingBaselineBootstrapRecord(record);
  const violations = recordResult.violations.map((item) => `record_${item}`);
  if (record?.schemaVersion !== 1) violations.push("record_schema_version_invalid");
  if (!FULL_SHA.test(candidateSha ?? "") || candidateSha !== record?.candidateSha)
    violations.push("candidate_sha_mismatch");
  if (
    !FULL_SHA.test(controlSha ?? "") ||
    controlSha !== record?.source?.controlSha ||
    controlSha !== record?.candidateSha
  )
    violations.push("control_sha_mismatch");
  if (!POSITIVE_INTEGER.test(String(runId ?? "")) || String(runId) !== record?.source?.runId)
    violations.push("run_id_mismatch");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt !== record?.source?.runAttempt)
    violations.push("run_attempt_mismatch");
  return { valid: violations.length === 0, violations: unique(violations) };
}

export function validateStagingLegacyBootstrapCompensationState({
  record,
  state,
  candidateSha,
  controlSha,
  runId,
  runAttempt,
}) {
  const identity = validateStagingLegacyBootstrapCompensationIdentity({
    record,
    candidateSha,
    controlSha,
    runId,
    runAttempt,
  });
  const violations = [...identity.violations];
  if (
    !exactKeys(state, LEGACY_STATE_KEYS) ||
    state?.schemaVersion !== 1 ||
    state?.event !== STAGING_LEGACY_BOOTSTRAP_COMPENSATION.stateEvent ||
    state?.project !== STAGING_LEGACY_BOOTSTRAP_COMPENSATION.project ||
    state?.branch !== STAGING_LEGACY_BOOTSTRAP_COMPENSATION.branch
  )
    violations.push("state_schema_invalid");
  if (
    !exactKeys(state?.workflow, ["runId", "runAttempt", "controlSha"]) ||
    String(state?.workflow?.runId ?? "") !== String(runId ?? "") ||
    state?.workflow?.runAttempt !== runAttempt ||
    state?.workflow?.controlSha !== controlSha
  )
    violations.push("state_workflow_mismatch");
  if (
    state?.runMarker !== `g12-staging-run-${runId}-${runAttempt}` ||
    state?.compensationMarker !== `g12-staging-deploy-compensation-${runId}-${runAttempt}`
  )
    violations.push("state_marker_mismatch");
  if (state?.candidateRelease !== candidateSha || state?.candidateRelease !== record?.candidateSha)
    violations.push("state_candidate_mismatch");
  if (
    !exactKeys(state?.original, ["deploymentId", "release", "createdOn", "commitMessage"]) ||
    state?.original?.deploymentId !== record?.canonical?.deploymentId ||
    state?.original?.release !== record?.candidateSha ||
    state?.original?.createdOn !== record?.canonical?.createdOn ||
    state?.original?.commitMessage !== record?.canonical?.commitMessage
  )
    violations.push("state_original_mismatch");
  return { valid: violations.length === 0, violations: unique(violations) };
}

export function validateStagingLegacyBootstrapCompensationArtifactMetadata({
  runId,
  runAttempt,
  stateArtifact,
  recoveryArtifact,
}) {
  const violations = [];
  if (!POSITIVE_INTEGER.test(String(runId ?? ""))) violations.push("metadata_run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) violations.push("metadata_run_attempt_invalid");
  if (
    !exactKeys(stateArtifact, ["id", "digest", "name"]) ||
    !POSITIVE_INTEGER.test(String(stateArtifact?.id ?? "")) ||
    !PREFIXED_SHA256.test(stateArtifact?.digest ?? "") ||
    stateArtifact?.name !== expectedStateArtifactName(runId, runAttempt)
  )
    violations.push("state_artifact_metadata_invalid");
  if (
    !exactKeys(recoveryArtifact, ["id", "digest", "name"]) ||
    !POSITIVE_INTEGER.test(String(recoveryArtifact?.id ?? "")) ||
    !PREFIXED_SHA256.test(recoveryArtifact?.digest ?? "") ||
    recoveryArtifact?.name !== expectedRecoveryArtifactName(runId, runAttempt)
  )
    violations.push("recovery_artifact_metadata_invalid");
  if (String(stateArtifact?.id ?? "") === String(recoveryArtifact?.id ?? ""))
    violations.push("artifact_ids_not_distinct");
  return { valid: violations.length === 0, violations: unique(violations) };
}

function refuse(reason, cause) {
  throw new Error(`G12_STAGING_LEGACY_BOOTSTRAP_COMPENSATION_REFUSED:${reason}`, { cause });
}

async function stableReadRegularFile(path, label, maximumBytes) {
  const source = resolve(path);
  let metadata;
  try {
    metadata = await lstat(source);
  } catch (error) {
    refuse(`${label}_missing`, error);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) refuse(`${label}_not_regular`);
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 1 || metadata.size > maximumBytes)
    refuse(`${label}_size_invalid`);
  let handle;
  try {
    handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      BigInt(bytes.length) !== before.size
    )
      refuse(`${label}_changed_while_reading`);
    return {
      bytes,
      byteCount: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (String(error?.message ?? "").startsWith("G12_STAGING_LEGACY_BOOTSTRAP_COMPENSATION_REFUSED:"))
      throw error;
    refuse(`${label}_read_invalid`, error);
  } finally {
    await handle?.close();
  }
}

function parseJson(read, label) {
  try {
    return JSON.parse(read.bytes.toString("utf8"));
  } catch (error) {
    refuse(`${label}_json_invalid`, error);
  }
}

async function exactDirectory(path, expected, label) {
  const root = resolve(path);
  let metadata;
  try {
    metadata = await lstat(root);
  } catch (error) {
    refuse(`${label}_missing`, error);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) refuse(`${label}_root_invalid`);
  const entries = await readdir(root, { withFileTypes: true });
  if (
    JSON.stringify(entries.map((entry) => entry.name).sort()) !== JSON.stringify([...expected].sort()) ||
    entries.some((entry) => entry.isSymbolicLink())
  )
    refuse(`${label}_contents_invalid`);
  return { root, entries };
}

function requireEntryType(directory, name, type, label) {
  const entry = directory.entries.find((value) => value.name === name);
  if (!entry || entry.isSymbolicLink() || !entry[type]()) refuse(`${label}_type_invalid`);
}

async function verifyExactTopology({ stateArtifactDirectory, recoveryArtifactDirectory }) {
  const stateRoot = await exactDirectory(
    stateArtifactDirectory,
    [STAGING_LEGACY_BOOTSTRAP_COMPENSATION.stateFile],
    "state_artifact",
  );
  requireEntryType(stateRoot, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.stateFile, "isFile", "state_file");
  const recoveryRoot = await exactDirectory(recoveryArtifactDirectory, ["dist", "outputs"], "recovery");
  requireEntryType(recoveryRoot, "dist", "isDirectory", "recovery_dist");
  requireEntryType(recoveryRoot, "outputs", "isDirectory", "recovery_outputs");
  const outputs = await exactDirectory(
    join(recoveryRoot.root, "outputs"),
    [STAGING_LEGACY_BOOTSTRAP_COMPENSATION.archiveFile, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.sealFile],
    "recovery_outputs",
  );
  requireEntryType(outputs, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.archiveFile, "isFile", "recovery_archive");
  requireEntryType(outputs, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.sealFile, "isFile", "recovery_seal");
  return {
    stateFile: join(stateRoot.root, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.stateFile),
    dist: join(recoveryRoot.root, "dist"),
    archive: join(outputs.root, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.archiveFile),
    seal: join(outputs.root, STAGING_LEGACY_BOOTSTRAP_COMPENSATION.sealFile),
  };
}

function validateSealAgainstRecord(seal, record) {
  const violations = [];
  if (
    !exactKeys(seal, SEAL_KEYS) ||
    seal?.schemaVersion !== 2 ||
    seal?.event !== "g12.production.dist.sealed" ||
    seal?.candidateSha !== record?.candidateSha ||
    seal?.archiveFile !== STAGING_LEGACY_BOOTSTRAP_COMPENSATION.archiveFile ||
    !Array.isArray(seal?.files) ||
    seal.files.length < 1
  )
    violations.push("seal_schema_invalid");
  for (const key of ["archiveSha256", "treeSha256"])
    if (!exactDigest(seal?.[key], record?.dist?.[key])) violations.push(`seal_${key}_mismatch`);
  for (const key of ["archiveBytes", "fileCount", "byteCount"])
    if (seal?.[key] !== record?.dist?.[key]) violations.push(`seal_${key}_mismatch`);
  return { valid: violations.length === 0, violations: unique(violations) };
}

export async function verifyStagingLegacyBootstrapCompensation({
  recordPath,
  stateArtifactDirectory,
  recoveryArtifactDirectory,
  candidateSha,
  controlSha,
  runId,
  runAttempt,
  stateArtifact,
  recoveryArtifact,
  temporaryRoot = tmpdir(),
}) {
  const recordRead = await stableReadRegularFile(
    recordPath,
    "record",
    STAGING_LEGACY_BOOTSTRAP_COMPENSATION.maximumJsonBytes,
  );
  const record = parseJson(recordRead, "record");
  const identity = validateStagingLegacyBootstrapCompensationIdentity({
    record,
    candidateSha,
    controlSha,
    runId,
    runAttempt,
  });
  if (!identity.valid) refuse(`identity_invalid:${identity.violations.join(",")}`);
  const metadata = validateStagingLegacyBootstrapCompensationArtifactMetadata({
    runId,
    runAttempt,
    stateArtifact,
    recoveryArtifact,
  });
  if (!metadata.valid) refuse(`artifact_metadata_invalid:${metadata.violations.join(",")}`);

  const paths = await verifyExactTopology({ stateArtifactDirectory, recoveryArtifactDirectory });
  const stateRead = await stableReadRegularFile(
    paths.stateFile,
    "state",
    STAGING_LEGACY_BOOTSTRAP_COMPENSATION.maximumJsonBytes,
  );
  const state = parseJson(stateRead, "state");
  const stateResult = validateStagingLegacyBootstrapCompensationState({
    record,
    state,
    candidateSha,
    controlSha,
    runId,
    runAttempt,
  });
  if (!stateResult.valid) refuse(`state_invalid:${stateResult.violations.join(",")}`);

  const [sealRead, archiveRead] = await Promise.all([
    stableReadRegularFile(
      paths.seal,
      "recovery_seal",
      STAGING_LEGACY_BOOTSTRAP_COMPENSATION.maximumJsonBytes,
    ),
    stableReadRegularFile(
      paths.archive,
      "recovery_archive",
      STAGING_LEGACY_BOOTSTRAP_COMPENSATION.maximumArchiveBytes,
    ),
  ]);
  const seal = parseJson(sealRead, "recovery_seal");
  const sealResult = validateSealAgainstRecord(seal, record);
  if (!sealResult.valid) refuse(`seal_invalid:${sealResult.violations.join(",")}`);
  if (
    archiveRead.byteCount !== record.dist.archiveBytes ||
    !exactDigest(archiveRead.sha256, record.dist.archiveSha256)
  )
    refuse("archive_record_mismatch");

  const liveDist = await verifyProductionDistSeal(paths.dist, seal, record.candidateSha);
  if (!liveDist.valid) refuse(`dist_invalid:${liveDist.violations.join(",")}`);

  const privateRoot = await mkdtemp(join(resolve(temporaryRoot), "g12-legacy-bootstrap-compensation-"));
  let archiveSnapshot;
  try {
    archiveSnapshot = await materializeProductionDistArchive(
      paths.archive,
      seal,
      record.candidateSha,
      join(privateRoot, "dist"),
    );
  } catch (error) {
    refuse("archive_materialization_invalid", error);
  } finally {
    await rm(privateRoot, { recursive: true, force: true });
  }
  if (!sameCanonical(archiveSnapshot, liveDist.snapshot)) refuse("archive_dist_snapshot_mismatch");

  const finalDist = await verifyProductionDistSeal(paths.dist, seal, record.candidateSha);
  if (!finalDist.valid || !sameCanonical(finalDist.snapshot, liveDist.snapshot))
    refuse("dist_changed_while_verifying");
  await verifyExactTopology({ stateArtifactDirectory, recoveryArtifactDirectory });

  return {
    mode: STAGING_LEGACY_BOOTSTRAP_COMPENSATION.mode,
    candidateSha,
    controlSha,
    runId: String(runId),
    runAttempt,
    stateArtifact,
    recoveryArtifact,
    archiveSha256: archiveRead.sha256,
    treeSha256: liveDist.snapshot.treeSha256,
    archiveBytes: archiveRead.byteCount,
    fileCount: liveDist.snapshot.fileCount,
    byteCount: liveDist.snapshot.byteCount,
  };
}
