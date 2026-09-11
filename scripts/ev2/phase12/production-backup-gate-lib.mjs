import { createHash } from "node:crypto";
import {
  PRODUCTION_BACKUP_REPOSITORY,
  PRODUCTION_BACKUP_WORKFLOW,
  PRODUCTION_BACKUP_WORKFLOW_NAME,
  PRODUCTION_SUPABASE_PROJECT_REF,
  validateBackupEvidenceBinding,
} from "../phase16/readiness-lib.mjs";
import {
  backupTextSha256,
  validateProductionBackupManifest,
} from "../phase16/production-backup-evidence-lib.mjs";

const parseDate = (value) => (typeof value === "string" ? Date.parse(value) : Number.NaN);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const PRODUCTION_BACKUP_RESTORE_ARTIFACT_FILES = Object.freeze([
  "archive-seal.json",
  "backup-restore-scope.json",
  "manifest.json",
  "role-restore-report.json",
  "storage-restore-report.json",
]);

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateDownloadedReportBinding(binding, downloaded, expectedFile, violations) {
  if (
    binding?.file !== expectedFile ||
    downloaded?.file !== expectedFile ||
    !Number.isSafeInteger(downloaded?.bytes) ||
    downloaded.bytes <= 0 ||
    !SHA256_PATTERN.test(downloaded?.sha256 ?? "") ||
    downloaded.bytes !== binding?.bytes ||
    downloaded.sha256 !== binding?.sha256
  )
    violations.push("backup_downloaded_report_digest_mismatch");
}

export function validateGitHubBackupRun({ control, evidence, run, repository, now = new Date() }) {
  const violations = [];
  const nowAt = now instanceof Date ? now.getTime() : parseDate(now);
  const completedAt = parseDate(run?.updated_at);
  if (repository !== PRODUCTION_BACKUP_REPOSITORY) violations.push("backup_run_repository_input_invalid");
  if (String(run?.repository?.full_name ?? "").toLowerCase() !== PRODUCTION_BACKUP_REPOSITORY.toLowerCase())
    violations.push("backup_run_repository_invalid");
  if (String(run?.id ?? "") !== control?.backupRunId) violations.push("backup_run_id_mismatch");
  if (run?.run_attempt !== control?.backupRunAttempt) violations.push("backup_run_attempt_mismatch");
  if (
    run?.name !== PRODUCTION_BACKUP_WORKFLOW_NAME ||
    run?.path !== PRODUCTION_BACKUP_WORKFLOW ||
    evidence?.workflow?.name !== run?.name ||
    evidence?.workflow?.path !== run?.path
  )
    violations.push("backup_run_workflow_mismatch");
  if (
    run?.head_branch !== "main" ||
    control?.backupRef !== "refs/heads/main" ||
    run?.head_sha !== control?.backupSourceSha ||
    evidence?.run?.headSha !== run?.head_sha
  )
    violations.push("backup_run_main_sha_mismatch");
  if (run?.event !== control?.backupEvent || evidence?.run?.event !== run?.event)
    violations.push("backup_run_event_mismatch");
  if (run?.status !== "completed" || run?.conclusion !== "success")
    violations.push("backup_run_not_successful");
  if (!Number.isFinite(completedAt) || !Number.isFinite(nowAt) || completedAt > nowAt + 5 * 60_000)
    violations.push("backup_run_timestamp_invalid");
  if (run?.updated_at !== control?.runCompletedAt) violations.push("backup_run_completed_at_mismatch");
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function selectGitHubBackupArtifact({ control, run, artifacts, now = new Date() }) {
  const violations = [];
  const nowAt = now instanceof Date ? now.getTime() : parseDate(now);
  const matches = Array.isArray(artifacts)
    ? artifacts.filter((artifact) => artifact?.name === control?.artifactName)
    : [];
  if (matches.length !== 1) violations.push("backup_artifact_not_unique");
  const artifact = matches[0];
  const expiresAt = parseDate(artifact?.expires_at);
  if (!Number.isSafeInteger(artifact?.id) || artifact.id <= 0) violations.push("backup_artifact_id_invalid");
  else if (String(artifact.id) !== control?.artifactId) violations.push("backup_artifact_id_mismatch");
  if (
    artifact?.expired !== false ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(nowAt) ||
    expiresAt <= nowAt
  )
    violations.push("backup_artifact_expired");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes <= 0)
    violations.push("backup_artifact_size_invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? ""))
    violations.push("backup_artifact_zip_digest_invalid");
  else if (artifact.digest !== control?.artifactDigest)
    violations.push("backup_artifact_zip_digest_mismatch");
  if (
    String(artifact?.workflow_run?.id ?? "") !== control?.backupRunId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== control?.backupSourceSha ||
    String(run?.id ?? "") !== control?.backupRunId
  )
    violations.push("backup_artifact_run_binding_invalid");
  const expectedDownload = `https://api.github.com/repos/${PRODUCTION_BACKUP_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload)
    violations.push("backup_artifact_download_url_invalid");
  const uniqueViolations = [...new Set(violations)];
  return {
    valid: uniqueViolations.length === 0,
    violations: uniqueViolations,
    artifact: uniqueViolations.length === 0 ? artifact : null,
  };
}

export function verifyDownloadedProductionBackup({
  control,
  evidence,
  evidenceBytes,
  manifest,
  manifestBytes,
  archiveBytes,
  archiveDigest,
  archiveSeal,
  archiveSealBytes,
  restoreReports,
  now = new Date(),
}) {
  const violations = [];
  const evidenceResult = validateBackupEvidenceBinding(control, evidence, {
    evidenceSha256: backupTextSha256(evidenceBytes),
  });
  violations.push(...evidenceResult.violations);
  const manifestResult = validateProductionBackupManifest(manifest, {
    now,
    maxAgeMinutes: control?.rpoMinutes,
    rtoMinutes: control?.rtoMinutes,
  });
  violations.push(...manifestResult.violations);
  const manifestSha256 = backupTextSha256(manifestBytes);
  const archiveSha256 =
    archiveDigest?.sha256 ??
    createHash("sha256")
      .update(archiveBytes ?? Buffer.alloc(0))
      .digest("hex");
  const archiveByteLength = archiveDigest?.bytes ?? archiveBytes?.byteLength;
  const archiveSealSha256 = createHash("sha256")
    .update(archiveSealBytes ?? Buffer.alloc(0))
    .digest("hex");
  if (manifestSha256 !== control?.manifestSha256 || manifestSha256 !== evidence?.artifact?.manifestSha256)
    violations.push("backup_downloaded_manifest_digest_mismatch");
  if (
    archiveSha256 !== control?.encryptedArchiveSha256 ||
    archiveSha256 !== evidence?.artifact?.encryptedArchiveSha256 ||
    archiveSha256 !== manifest?.encryptedArchive?.sha256
  )
    violations.push("backup_downloaded_archive_digest_mismatch");
  if (
    archiveByteLength !== manifest?.encryptedArchive?.bytes ||
    archiveByteLength !== evidence?.artifact?.encryptedArchiveBytes
  )
    violations.push("backup_downloaded_archive_size_mismatch");
  if (
    archiveSeal?.schemaVersion !== 1 ||
    archiveSeal?.event !== "supabase.production-backup.archive-sealed" ||
    archiveSeal?.file !== manifest?.encryptedArchive?.file ||
    archiveSeal?.bytes !== archiveByteLength ||
    archiveSeal?.sha256 !== archiveSha256 ||
    archiveSeal?.hashedAt !== manifest?.archiveHashedAt ||
    archiveSealSha256 !== manifest?.encryptedArchive?.sealSha256 ||
    archiveSealSha256 !== evidence?.artifact?.encryptedArchiveSealSha256
  )
    violations.push("backup_downloaded_archive_seal_mismatch");

  const restoreScope = restoreReports?.scope?.value;
  const restoreStorage = restoreReports?.storage?.value;
  const restoreRoles = restoreReports?.roles?.value;
  validateDownloadedReportBinding(
    manifest?.reports?.restore?.scope,
    restoreReports?.scope,
    "backup-restore-scope.json",
    violations,
  );
  validateDownloadedReportBinding(
    manifest?.reports?.restore?.storagePayloads,
    restoreReports?.storage,
    "storage-restore-report.json",
    violations,
  );
  validateDownloadedReportBinding(
    manifest?.reports?.restore?.roles,
    restoreReports?.roles,
    "role-restore-report.json",
    violations,
  );
  if (
    restoreScope?.schemaVersion !== 2 ||
    restoreScope?.event !== "supabase.backup.scope.restore-verified" ||
    restoreScope?.phase !== "restore" ||
    restoreScope?.fingerprintMode !== "sha256-canonical-full-row-json-multiset" ||
    restoreScope?.tableInventoryComplete !== true ||
    restoreScope?.sessionReplicationRestoreVerified !== true ||
    restoreScope?.containsRawIdentifiers !== false ||
    restoreScope?.containsObjectNames !== false ||
    restoreScope?.auth?.scope !== "all-portable-auth-table-rows" ||
    restoreScope?.auth?.restoreVerified !== true ||
    restoreScope?.storage?.scope !== "all-portable-storage-table-rows" ||
    restoreScope?.storage?.restoreVerified !== true ||
    !sameJson(restoreScope?.auth, manifest?.coverage?.auth) ||
    !sameJson(restoreScope?.storage, manifest?.coverage?.storage?.metadata)
  )
    violations.push("backup_downloaded_restore_scope_invalid");
  if (
    restoreStorage?.schemaVersion !== 1 ||
    restoreStorage?.event !== "supabase.storage.payloads.restored-verified" ||
    restoreStorage?.phase !== "restored" ||
    restoreStorage?.exportVerified !== true ||
    restoreStorage?.payloadUploadVerified !== true ||
    restoreStorage?.restoreVerified !== true ||
    restoreStorage?.metadataReappliedAfterUpload !== true ||
    restoreStorage?.snapshotStabilityVerified !== true ||
    restoreStorage?.restoreTarget !== "ephemeral-local-supabase" ||
    restoreStorage?.containsObjectNames !== false ||
    restoreStorage?.containsBucketIdentifiers !== false ||
    restoreStorage?.snapshotAt !== manifest?.snapshotAt ||
    restoreStorage?.snapshotWalLsn !== manifest?.snapshotWalLsn ||
    restoreStorage?.metadataAggregateSha256 !== restoreScope?.storage?.aggregateSha256 ||
    !sameJson(restoreStorage, manifest?.coverage?.storage?.objectPayloads)
  )
    violations.push("backup_downloaded_storage_restore_invalid");
  if (
    restoreRoles?.schemaVersion !== 1 ||
    restoreRoles?.event !== "supabase.backup.roles.restore-verified" ||
    restoreRoles?.phase !== "restore" ||
    restoreRoles?.dumpGovernedRolesRestored !== true ||
    restoreRoles?.rolesChangedButNotConverged !== 0 ||
    restoreRoles?.rolesRestoredExactly !== false ||
    restoreRoles?.credentialsRestored !== false ||
    restoreRoles?.platformManagedGucSettingsRestored !== false ||
    restoreRoles?.limitation !== "role-passwords-and-role-settings-are-not-restored" ||
    restoreRoles?.containsRoleNames !== false ||
    !sameJson(restoreRoles, manifest?.coverage?.roles)
  )
    violations.push("backup_downloaded_role_restore_invalid");
  for (const [key, report] of Object.entries({
    scope: restoreReports?.scope,
    storagePayloads: restoreReports?.storage,
    roles: restoreReports?.roles,
  })) {
    if (
      report?.bytes !== evidence?.reportDigests?.restore?.[key]?.bytes ||
      report?.sha256 !== evidence?.reportDigests?.restore?.[key]?.sha256 ||
      report?.file !== evidence?.reportDigests?.restore?.[key]?.file
    )
      violations.push("backup_downloaded_evidence_report_mismatch");
  }
  if (
    manifest?.workflow?.runId !== control?.backupRunId ||
    manifest?.workflow?.runAttempt !== control?.backupRunAttempt ||
    manifest?.workflow?.event !== control?.backupEvent ||
    manifest?.workflow?.ref !== control?.backupRef ||
    manifest?.workflow?.headSha !== control?.backupSourceSha
  )
    violations.push("backup_downloaded_manifest_run_mismatch");
  if (
    manifest?.workflow?.name !== control?.backupWorkflowName ||
    manifest?.workflow?.path !== control?.backupWorkflow ||
    manifest?.repository !== PRODUCTION_BACKUP_REPOSITORY
  )
    violations.push("backup_downloaded_manifest_workflow_mismatch");
  if (
    manifest?.artifact?.name !== control?.artifactName ||
    manifest?.encryptedArchive?.file !== evidence?.artifact?.encryptedArchiveFile
  )
    violations.push("backup_downloaded_manifest_artifact_mismatch");
  if (
    manifest?.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
    manifest?.projectRef !== control?.projectRef ||
    manifest?.createdAt !== control?.completedAt ||
    manifest?.createdAt !== evidence?.backup?.createdAt
  )
    violations.push("backup_downloaded_manifest_backup_mismatch");
  const uniqueViolations = [...new Set(violations)];
  return {
    valid: uniqueViolations.length === 0,
    violations: uniqueViolations,
    summary: {
      runId: control?.backupRunId ?? null,
      runAttempt: control?.backupRunAttempt ?? null,
      sourceSha: control?.backupSourceSha ?? null,
      manifestSha256,
      encryptedArchiveSha256: archiveSha256,
      encryptedArchiveSealSha256: archiveSealSha256,
      restoreDurationSeconds: manifest?.restoreDrill?.durationSeconds ?? null,
      verifiedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
      secretsExposed: false,
    },
  };
}
