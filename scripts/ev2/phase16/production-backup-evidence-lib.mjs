import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import {
  PRODUCTION_BACKUP_REPOSITORY,
  PRODUCTION_BACKUP_WORKFLOW,
  PRODUCTION_BACKUP_WORKFLOW_NAME,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "./readiness-lib.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[1-9]\d{5,19}$/;
const ARCHIVE_FILE_PATTERN = /^supabase-production-backup-([1-9]\d{5,19})-([1-9]\d*)\.tar\.gz\.gpg$/;
const RESTORE_CHECKS = Object.freeze([
  "portableRoleCatalogMatched",
  "schemaRestored",
  "publicTableInventoryMatched",
  "publicRowCountsMatched",
  "authMetadataMatched",
  "authFullRowFingerprintsMatched",
  "storageMetadataMatched",
  "storageFullRowFingerprintsMatched",
  "storageMetadataReappliedAfterUpload",
  "storagePayloadsByteIdentical",
  "archiveDigestStable",
]);
const REPORT_FILES = Object.freeze({
  source: {
    scope: "backup-source-scope.json",
    storagePayloads: "storage-source-report.json",
    storageSnapshotStability: "storage-snapshot-stability.json",
    roles: "role-source-report.json",
  },
  restore: {
    scope: "backup-restore-scope.json",
    storagePayloads: "storage-restore-report.json",
    roles: "role-restore-report.json",
  },
});

const parseDate = (value) => (typeof value === "string" ? Date.parse(value) : Number.NaN);
const canonicalText = (value) => {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return text.replace(/\r\n?/g, "\n");
};

export function backupTextSha256(value) {
  return createHash("sha256").update(canonicalText(value), "utf8").digest("hex");
}

export async function backupFileSha256(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function createBackupArchiveSeal(path, { now = new Date() } = {}) {
  const archive = await backupFileSha256(path);
  const hashedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return {
    schemaVersion: 1,
    event: "supabase.production-backup.archive-sealed",
    file: basename(path),
    bytes: archive.bytes,
    sha256: archive.sha256,
    hashedAt,
  };
}

export async function verifyBackupArchiveSeal(path, seal) {
  const current = await backupFileSha256(path);
  const valid =
    seal?.schemaVersion === 1 &&
    seal?.event === "supabase.production-backup.archive-sealed" &&
    seal?.file === basename(path) &&
    Number.isSafeInteger(seal?.bytes) &&
    seal.bytes > 0 &&
    SHA256_PATTERN.test(seal?.sha256 ?? "") &&
    Number.isFinite(parseDate(seal?.hashedAt)) &&
    current.bytes === seal.bytes &&
    current.sha256 === seal.sha256;
  return { valid, current };
}

function validReportBindings(reports, { drillPerformed }) {
  // Sem drill nao existe fase de restauracao, e um vinculo de relatorio de restauracao presente
  // nesse caso nao seria um extra inofensivo: seria evidencia de restauracao sem restauracao.
  if (!drillPerformed && reports?.restore !== null) return false;
  const phases = drillPerformed ? Object.entries(REPORT_FILES) : [["source", REPORT_FILES.source]];
  return phases.every(([phase, expected]) =>
    Object.entries(expected).every(([key, file]) => {
      const binding = reports?.[phase]?.[key];
      return (
        binding?.file === file &&
        Number.isSafeInteger(binding?.bytes) &&
        binding.bytes > 0 &&
        SHA256_PATTERN.test(binding?.sha256 ?? "")
      );
    }),
  );
}

export function validateProductionBackupManifest(
  manifest,
  { now = new Date(), maxAgeMinutes, rtoMinutes } = {},
) {
  const violations = [];
  const workflow = manifest?.workflow;
  const drill = manifest?.restoreDrill;
  const runId = workflow?.runId;
  const runAttempt = workflow?.runAttempt;
  const artifactName = `supabase-production-backup-${runId}-${runAttempt}`;
  const archiveMatch = String(manifest?.encryptedArchive?.file ?? "").match(ARCHIVE_FILE_PATTERN);

  if (manifest?.schemaVersion !== 3) violations.push("backup_manifest_schema_invalid");
  if (manifest?.event !== "supabase.external-backup.completed")
    violations.push("backup_manifest_event_invalid");
  if (!UUID_PATTERN.test(manifest?.backupId ?? "")) violations.push("backup_manifest_id_invalid");
  if (manifest?.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF)
    violations.push("backup_manifest_project_invalid");
  if (manifest?.repository !== PRODUCTION_BACKUP_REPOSITORY)
    violations.push("backup_manifest_repository_invalid");
  if (
    workflow?.name !== PRODUCTION_BACKUP_WORKFLOW_NAME ||
    workflow?.path !== PRODUCTION_BACKUP_WORKFLOW ||
    workflow?.ref !== "refs/heads/main"
  )
    violations.push("backup_manifest_workflow_invalid");
  if (
    !RUN_ID_PATTERN.test(runId ?? "") ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0 ||
    !["workflow_dispatch", "schedule"].includes(workflow?.event) ||
    !FULL_SHA_PATTERN.test(workflow?.headSha ?? "") ||
    manifest?.sourceCommit !== workflow?.headSha
  )
    violations.push("backup_manifest_run_invalid");
  if (manifest?.artifact?.name !== artifactName) violations.push("backup_manifest_artifact_name_invalid");
  if (
    !archiveMatch ||
    archiveMatch[1] !== runId ||
    Number(archiveMatch[2]) !== runAttempt ||
    !Number.isSafeInteger(manifest?.encryptedArchive?.bytes) ||
    manifest.encryptedArchive.bytes <= 0 ||
    !SHA256_PATTERN.test(manifest?.encryptedArchive?.sha256 ?? "")
  )
    violations.push("backup_manifest_archive_invalid");
  if (
    manifest?.externalTarget !== "github-actions-encrypted-artifact" ||
    manifest?.encryption !== "OpenPGP-AES256"
  )
    violations.push("backup_manifest_storage_invalid");

  const createdAt = parseDate(manifest?.createdAt);
  const snapshotAt = parseDate(manifest?.snapshotAt);
  const sealedAt = parseDate(manifest?.sealedAt);
  const archiveHashedAt = parseDate(manifest?.archiveHashedAt);
  const drillStartedAt = parseDate(drill?.startedAt);
  const drillCompletedAt = parseDate(drill?.completedAt);
  const nowAt = now instanceof Date ? now.getTime() : parseDate(now);
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(snapshotAt) ||
    !Number.isFinite(archiveHashedAt) ||
    !Number.isFinite(sealedAt) ||
    !Number.isFinite(nowAt) ||
    manifest?.createdAt !== manifest?.sealedAt ||
    !/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/.test(manifest?.snapshotWalLsn ?? "")
  ) {
    violations.push("backup_manifest_timestamp_invalid");
  } else {
    if (snapshotAt > archiveHashedAt || archiveHashedAt > sealedAt || sealedAt > nowAt + 5 * 60_000)
      violations.push("backup_manifest_timestamp_in_future");
    if (Number.isFinite(maxAgeMinutes) && (maxAgeMinutes <= 0 || nowAt - snapshotAt > maxAgeMinutes * 60_000))
      violations.push("backup_manifest_rpo_expired");
  }
  // Um manifesto sem drill nao e um manifesto pela metade: e a afirmacao de que a restauracao NAO
  // foi provada. Ate aqui ele nao era validado de forma nenhuma, entao a unica coisa que
  // sustentava essa afirmacao era a convencao de quem escreve o arquivo.
  const drillPerformed = drill?.performed === true;
  if (
    drillPerformed &&
    (drill?.outcome !== "passed" ||
    drill?.target !== "ephemeral-local-supabase" ||
    !Number.isFinite(drillStartedAt) ||
    !Number.isFinite(drillCompletedAt) ||
    drillCompletedAt < drillStartedAt ||
    !Number.isSafeInteger(drill?.durationSeconds) ||
    drill.durationSeconds <= 0 ||
    Math.abs(drill.durationSeconds - Math.round((drillCompletedAt - drillStartedAt) / 1000)) > 2)
  )
    violations.push("backup_manifest_restore_drill_invalid");
  if (
    !drillPerformed &&
    (drill?.performed !== false ||
      drill?.outcome !== "not_scheduled" ||
      drill?.target !== null ||
      drill?.startedAt !== null ||
      drill?.completedAt !== null ||
      drill?.durationSeconds !== null)
  )
    violations.push("backup_manifest_unproven_restore_shape_invalid");
  if (Number.isFinite(createdAt) && Number.isFinite(drillCompletedAt) && createdAt < drillCompletedAt)
    violations.push("backup_manifest_created_before_restore_completed");
  if (Number.isFinite(snapshotAt) && Number.isFinite(drillStartedAt) && snapshotAt > drillStartedAt)
    violations.push("backup_manifest_snapshot_after_restore_started");
  if (Number.isFinite(archiveHashedAt) && Number.isFinite(drillStartedAt) && archiveHashedAt > drillStartedAt)
    violations.push("backup_manifest_archive_hashed_after_restore_started");
  if (Number.isFinite(rtoMinutes) && (rtoMinutes <= 0 || drill?.durationSeconds > rtoMinutes * 60))
    violations.push("backup_manifest_rto_exceeded");
  if (drillPerformed && RESTORE_CHECKS.some((key) => drill?.verifications?.[key] !== true))
    violations.push("backup_manifest_restore_checks_incomplete");
  // Sem drill, a unica verificacao que pode sair verdadeira e a estabilidade do digest do
  // arquivo, que nao depende de restaurar nada.
  if (
    !drillPerformed &&
    RESTORE_CHECKS.some(
      (key) => drill?.verifications?.[key] !== (key === "archiveDigestStable"),
    )
  )
    violations.push("backup_manifest_unproven_restore_checks_invalid");
  if (drill?.verifications?.rolesRestored !== false)
    violations.push("backup_manifest_role_restore_claim_invalid");
  if (drillPerformed && manifest?.completeDataRestoreDrill !== true)
    violations.push("backup_manifest_complete_restore_missing");
  if (!drillPerformed && manifest?.completeDataRestoreDrill !== false)
    violations.push("backup_manifest_complete_restore_claimed_without_drill");
  if (
    drillPerformed &&
    (manifest?.coverage?.auth?.tableInventoryComplete !== true ||
    !Number.isSafeInteger(manifest?.coverage?.auth?.tableCount) ||
    manifest.coverage.auth.tableCount < 3 ||
    !SHA256_PATTERN.test(manifest?.coverage?.auth?.aggregateSha256 ?? "") ||
    manifest?.coverage?.auth?.restoreVerified !== true ||
    manifest?.coverage?.storage?.metadata?.fullRowMetadataFingerprint !== true ||
    !Number.isSafeInteger(manifest?.coverage?.storage?.metadata?.tableCount) ||
    manifest.coverage.storage.metadata.tableCount < 2 ||
    !SHA256_PATTERN.test(manifest?.coverage?.storage?.metadata?.aggregateSha256 ?? "") ||
    manifest?.coverage?.storage?.metadata?.restoreVerified !== true ||
    manifest?.coverage?.storage?.objectPayloads?.restoreVerified !== true ||
    manifest?.coverage?.storage?.objectPayloads?.exportVerified !== true ||
    manifest?.coverage?.storage?.objectPayloads?.payloadUploadVerified !== true ||
    manifest?.coverage?.storage?.objectPayloads?.metadataReappliedAfterUpload !== true ||
    manifest?.coverage?.storage?.objectPayloads?.metadataAggregateSha256 !==
      manifest?.coverage?.storage?.metadata?.aggregateSha256 ||
    manifest?.coverage?.storage?.objectPayloads?.snapshotStabilityVerified !== true ||
    manifest?.coverage?.storage?.objectPayloads?.metadataSignals?.updatedAt !==
      manifest?.coverage?.storage?.objectPayloads?.objects ||
    manifest?.coverage?.storage?.objectPayloads?.metadataSignals?.strongFingerprint !==
      manifest?.coverage?.storage?.objectPayloads?.objects ||
    manifest?.coverage?.storage?.objectPayloads?.metadataSignals?.contentFingerprint !==
      manifest?.coverage?.storage?.objectPayloads?.objects ||
    manifest?.coverage?.storage?.objectPayloads?.snapshotAt !== manifest?.snapshotAt ||
    manifest?.coverage?.storage?.objectPayloads?.snapshotWalLsn !== manifest?.snapshotWalLsn ||
    !Number.isFinite(parseDate(manifest?.coverage?.storage?.objectPayloads?.snapshotVerifiedAt)) ||
    parseDate(manifest?.coverage?.storage?.objectPayloads?.snapshotVerifiedAt) < snapshotAt ||
    parseDate(manifest?.coverage?.storage?.objectPayloads?.snapshotVerifiedAt) > sealedAt)
  )
    violations.push("backup_manifest_coverage_incomplete");
  // Sem drill a cobertura vem dos relatorios de ORIGEM, e eles tem de continuar dizendo que nada
  // foi restaurado. Cobertura de origem carimbada como restaurada seria a mentira que esta
  // validacao existe para impedir.
  if (
    !drillPerformed &&
    (manifest?.coverage?.auth?.tableInventoryComplete !== true ||
      !SHA256_PATTERN.test(manifest?.coverage?.auth?.aggregateSha256 ?? "") ||
      manifest?.coverage?.auth?.restoreVerified !== false ||
      manifest?.coverage?.storage?.metadata?.restoreVerified !== false ||
      manifest?.coverage?.storage?.objectPayloads?.restoreVerified !== false ||
      manifest?.coverage?.storage?.objectPayloads?.exportVerified !== true ||
      manifest?.coverage?.storage?.objectPayloads?.snapshotStabilityVerified !== true)
  )
    violations.push("backup_manifest_unproven_coverage_invalid");
  if (
    drillPerformed &&
    (manifest?.coverage?.roles?.portableRoleCatalogMatched !== true ||
      manifest?.coverage?.roles?.rolesRestoredExactly !== false ||
      manifest?.coverage?.roles?.credentialsRestored !== false ||
      !SHA256_PATTERN.test(manifest?.coverage?.roles?.portableCatalogSha256 ?? ""))
  )
    violations.push("backup_manifest_role_scope_invalid");
  if (
    !drillPerformed &&
    (manifest?.coverage?.roles?.event !== "supabase.backup.roles.source-verified" ||
      manifest?.coverage?.roles?.credentialsIncludedInFingerprint !== false ||
      !SHA256_PATTERN.test(manifest?.coverage?.roles?.portableCatalogSha256 ?? "") ||
      "portableRoleCatalogMatched" in (manifest?.coverage?.roles ?? {}))
  )
    violations.push("backup_manifest_unproven_role_scope_invalid");
  if (!validReportBindings(manifest?.reports, { drillPerformed }))
    violations.push("backup_manifest_report_binding_invalid");
  if (!SHA256_PATTERN.test(manifest?.encryptedArchive?.sealSha256 ?? ""))
    violations.push("backup_manifest_archive_seal_invalid");
  if (
    manifest?.completeDisasterRecovery !== false ||
    !Array.isArray(manifest?.intentionalLimitations) ||
    !manifest.intentionalLimitations.includes("role-passwords-and-role-settings-are-not-restored")
  )
    violations.push("backup_manifest_limitations_invalid");
  if (manifest?.sensitiveValuesLogged !== false) violations.push("backup_manifest_sensitive_logging_invalid");

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function buildProductionBackupEvidence(manifest, { manifestBytes, now } = {}) {
  const manifestResult = validateProductionBackupManifest(manifest, { now });
  if (!manifestResult.valid)
    throw new Error(`BACKUP_MANIFEST_REFUSED:${manifestResult.violations.join(",")}`);
  const manifestSha256 = backupTextSha256(manifestBytes ?? JSON.stringify(manifest));
  return {
    schemaVersion: 1,
    event: "supabase.production-backup.restore-evidence",
    repository: manifest.repository,
    workflow: {
      name: manifest.workflow.name,
      path: manifest.workflow.path,
    },
    run: {
      id: manifest.workflow.runId,
      attempt: manifest.workflow.runAttempt,
      event: manifest.workflow.event,
      ref: manifest.workflow.ref,
      headSha: manifest.workflow.headSha,
    },
    artifact: {
      name: manifest.artifact.name,
      encryptedArchiveFile: manifest.encryptedArchive.file,
      encryptedArchiveBytes: manifest.encryptedArchive.bytes,
      encryptedArchiveSha256: manifest.encryptedArchive.sha256,
      encryptedArchiveSealSha256: manifest.encryptedArchive.sealSha256,
      manifestSha256,
    },
    backup: {
      id: manifest.backupId,
      projectRef: manifest.projectRef,
      createdAt: manifest.createdAt,
      snapshotAt: manifest.snapshotAt,
      snapshotWalLsn: manifest.snapshotWalLsn,
      snapshotVerifiedAt: manifest.coverage.storage.objectPayloads.snapshotVerifiedAt,
      sealedAt: manifest.sealedAt,
      externalTarget: manifest.externalTarget,
    },
    restoreDrill: {
      performed: manifest.restoreDrill.performed,
      outcome: manifest.restoreDrill.outcome,
      target: manifest.restoreDrill.target,
      startedAt: manifest.restoreDrill.startedAt,
      completedAt: manifest.restoreDrill.completedAt,
      durationSeconds: manifest.restoreDrill.durationSeconds,
      verifications: manifest.restoreDrill.verifications,
      completeDataRestoreDrill: manifest.completeDataRestoreDrill,
    },
    reportDigests: manifest.reports,
    roleRestore: {
      portableRoleCatalogMatched: manifest.coverage.roles.portableRoleCatalogMatched,
      rolesRestoredExactly: manifest.coverage.roles.rolesRestoredExactly,
      credentialsRestored: manifest.coverage.roles.credentialsRestored,
      limitation: manifest.coverage.roles.limitation,
    },
    sensitiveValuesLogged: false,
  };
}
