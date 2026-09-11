import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  PRODUCTION_BACKUP_REPOSITORY,
  PRODUCTION_BACKUP_WORKFLOW,
  PRODUCTION_BACKUP_WORKFLOW_NAME,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "./readiness-lib.mjs";
import {
  backupFileSha256,
  validateProductionBackupManifest,
  verifyBackupArchiveSeal,
} from "./production-backup-evidence-lib.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

async function readReport(path, expectedFile) {
  if (!path || basename(path) !== expectedFile) throw new Error("BACKUP_REPORT_PATH_INVALID");
  const [bytes, digest] = await Promise.all([readFile(path), backupFileSha256(path)]);
  return {
    value: JSON.parse(bytes.toString("utf8")),
    binding: { file: expectedFile, bytes: digest.bytes, sha256: digest.sha256 },
  };
}

function sameCoverage(left, right) {
  return (
    left?.tableCount === right?.tableCount &&
    left?.rows === right?.rows &&
    left?.aggregateSha256 === right?.aggregateSha256 &&
    JSON.stringify(left?.tables) === JSON.stringify(right?.tables)
  );
}

const archivePath = process.env.BACKUP_ARCHIVE_PATH;
const archiveSealPath = process.env.BACKUP_ARCHIVE_SEAL_PATH;
const outputPath = process.env.BACKUP_MANIFEST_PATH;
if (!archivePath || !archiveSealPath || !outputPath) throw new Error("BACKUP_MANIFEST_PATHS_REQUIRED");

const [archiveSealBytes, sourceScope, sourceStorage, storageStability, sourceRoles] = await Promise.all([
  readFile(archiveSealPath),
  readReport(process.env.BACKUP_SOURCE_SCOPE_REPORT_PATH, "backup-source-scope.json"),
  readReport(process.env.STORAGE_SOURCE_REPORT_PATH, "storage-source-report.json"),
  readReport(process.env.STORAGE_STABILITY_REPORT_PATH, "storage-snapshot-stability.json"),
  readReport(process.env.ROLE_SOURCE_REPORT_PATH, "role-source-report.json"),
]);
const archiveSeal = JSON.parse(archiveSealBytes.toString("utf8"));
const archiveSealDigest = await backupFileSha256(archiveSealPath);
if (!(await verifyBackupArchiveSeal(archivePath, archiveSeal)).valid)
  throw new Error("BACKUP_ARCHIVE_SEAL_MISMATCH");

const restoreDrillPerformed = process.env.RESTORE_DRILL_PERFORMED === "true";
const restoreDrillPassed = process.env.RESTORE_DRILL_PASSED === "true";
if (restoreDrillPerformed && !restoreDrillPassed) throw new Error("RESTORE_DRILL_NOT_PASSED");
const restoreScope = restoreDrillPerformed
  ? await readReport(process.env.BACKUP_RESTORE_SCOPE_REPORT_PATH, "backup-restore-scope.json")
  : null;
const restoreStorage = restoreDrillPerformed
  ? await readReport(process.env.STORAGE_RESTORE_REPORT_PATH, "storage-restore-report.json")
  : null;
const restoreRoles = restoreDrillPerformed
  ? await readReport(process.env.ROLE_RESTORE_REPORT_PATH, "role-restore-report.json")
  : null;

const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
const workflowName = process.env.GITHUB_WORKFLOW;
const workflowRef = process.env.GITHUB_WORKFLOW_REF;
const gitRef = process.env.GITHUB_REF;
const sourceCommit = process.env.GITHUB_SHA;
const eventName = process.env.GITHUB_EVENT_NAME;
if (
  repository !== PRODUCTION_BACKUP_REPOSITORY ||
  workflowName !== PRODUCTION_BACKUP_WORKFLOW_NAME ||
  workflowRef !== `${PRODUCTION_BACKUP_REPOSITORY}/${PRODUCTION_BACKUP_WORKFLOW}@refs/heads/main` ||
  gitRef !== "refs/heads/main" ||
  !/^[a-f0-9]{40}$/.test(sourceCommit ?? "") ||
  !/^[1-9]\d{5,19}$/.test(runId ?? "") ||
  !Number.isSafeInteger(runAttempt) ||
  runAttempt <= 0 ||
  !["workflow_dispatch", "schedule"].includes(eventName)
)
  throw new Error("BACKUP_GITHUB_ACTIONS_CONTEXT_INVALID");

const artifactName = `supabase-production-backup-${runId}-${runAttempt}`;
const encryptedArchiveFile = `${artifactName}.tar.gz.gpg`;
if (basename(archivePath) !== encryptedArchiveFile || archiveSeal.file !== encryptedArchiveFile)
  throw new Error("BACKUP_ARCHIVE_FILENAME_INVALID");

const snapshotAt = process.env.BACKUP_SNAPSHOT_AT ?? "";
const snapshotWalLsn = process.env.BACKUP_SNAPSHOT_LSN ?? "";
const restoreDrillStartedAt = process.env.RESTORE_DRILL_STARTED_AT ?? "";
const restoreDrillCompletedAt = process.env.RESTORE_DRILL_COMPLETED_AT ?? "";
const restoreDrillDurationSeconds = Number(process.env.RESTORE_DRILL_DURATION_SECONDS);
if (!Number.isFinite(Date.parse(snapshotAt)) || !/^[0-9A-Fa-f]+\/[0-9A-Fa-f]+$/.test(snapshotWalLsn))
  throw new Error("BACKUP_SNAPSHOT_IDENTITY_INVALID");
if (
  restoreDrillPerformed &&
  (!Number.isFinite(Date.parse(restoreDrillStartedAt)) ||
    !Number.isFinite(Date.parse(restoreDrillCompletedAt)) ||
    !Number.isSafeInteger(restoreDrillDurationSeconds) ||
    restoreDrillDurationSeconds <= 0 ||
    Date.parse(restoreDrillCompletedAt) < Date.parse(restoreDrillStartedAt) ||
    Math.abs(
      restoreDrillDurationSeconds -
        Math.round((Date.parse(restoreDrillCompletedAt) - Date.parse(restoreDrillStartedAt)) / 1000),
    ) > 2)
)
  throw new Error("RESTORE_DRILL_TIMING_INVALID");

if (
  sourceScope.value?.schemaVersion !== 2 ||
  sourceScope.value?.phase !== "source" ||
  sourceScope.value?.tableInventoryComplete !== true ||
  sourceScope.value?.auth?.restoreVerified !== false ||
  sourceScope.value?.storage?.restoreVerified !== false ||
  sourceScope.value?.containsRawIdentifiers !== false ||
  sourceScope.value?.containsObjectNames !== false
)
  throw new Error("BACKUP_SOURCE_SCOPE_REPORT_INVALID");
if (
  sourceStorage.value?.schemaVersion !== 1 ||
  sourceStorage.value?.event !== "supabase.storage.payloads.source-verified" ||
  sourceStorage.value?.phase !== "source" ||
  sourceStorage.value?.exportVerified !== true ||
  sourceStorage.value?.payloadUploadVerified !== false ||
  sourceStorage.value?.restoreVerified !== false ||
  sourceStorage.value?.metadataReappliedAfterUpload !== false ||
  sourceStorage.value?.snapshotStabilityVerified !== true ||
  sourceStorage.value?.snapshotAt !== snapshotAt ||
  sourceStorage.value?.snapshotWalLsn !== snapshotWalLsn ||
  sourceStorage.value?.objects !== sourceScope.value?.storage?.objectRows ||
  sourceStorage.value?.containsObjectNames !== false ||
  sourceStorage.value?.containsBucketIdentifiers !== false
)
  throw new Error("STORAGE_SOURCE_REPORT_INVALID");
if (
  storageStability.value?.event !== "supabase.storage.snapshot-stability.verified" ||
  storageStability.value?.snapshotAt !== snapshotAt ||
  storageStability.value?.walLsn !== snapshotWalLsn ||
  storageStability.value?.beforeAfterExact !== true ||
  storageStability.value?.downloadsBoundToSnapshot !== true ||
  storageStability.value?.objects !== sourceStorage.value?.objects ||
  storageStability.value?.metadataAggregateSha256 !== sourceStorage.value?.snapshotMetadataAggregateSha256 ||
  JSON.stringify(storageStability.value?.metadataSignals) !==
    JSON.stringify(sourceStorage.value?.metadataSignals)
)
  throw new Error("STORAGE_STABILITY_REPORT_INVALID");
if (
  sourceRoles.value?.event !== "supabase.backup.roles.source-verified" ||
  sourceRoles.value?.raceVerified !== true ||
  sourceRoles.value?.beforeAfterExact !== true ||
  sourceRoles.value?.credentialsIncludedInFingerprint !== false ||
  !SHA256_PATTERN.test(sourceRoles.value?.portableCatalogSha256 ?? "")
)
  throw new Error("ROLE_SOURCE_REPORT_INVALID");

if (
  restoreDrillPerformed &&
  (restoreScope.value?.schemaVersion !== 2 ||
    restoreScope.value?.phase !== "restore" ||
    restoreScope.value?.sessionReplicationRestoreVerified !== true ||
    restoreScope.value?.auth?.restoreVerified !== true ||
    restoreScope.value?.storage?.restoreVerified !== true ||
    !sameCoverage(sourceScope.value.auth, restoreScope.value.auth) ||
    !sameCoverage(sourceScope.value.storage, restoreScope.value.storage))
)
  throw new Error("BACKUP_RESTORE_SCOPE_REPORT_INVALID");
if (
  restoreDrillPerformed &&
  (restoreStorage.value?.schemaVersion !== 1 ||
    restoreStorage.value?.event !== "supabase.storage.payloads.restored-verified" ||
    restoreStorage.value?.phase !== "restored" ||
    restoreStorage.value?.restoreVerified !== true ||
    restoreStorage.value?.payloadUploadVerified !== true ||
    restoreStorage.value?.metadataReappliedAfterUpload !== true ||
    restoreStorage.value?.metadataAggregateSha256 !== restoreScope.value.storage.aggregateSha256 ||
    restoreStorage.value?.objects !== sourceStorage.value.objects ||
    restoreStorage.value?.bytes !== sourceStorage.value.bytes ||
    restoreStorage.value?.aggregateSha256 !== sourceStorage.value.aggregateSha256 ||
    restoreStorage.value?.snapshotAt !== snapshotAt ||
    restoreStorage.value?.snapshotWalLsn !== snapshotWalLsn)
)
  throw new Error("STORAGE_RESTORE_REPORT_INVALID");
if (
  restoreDrillPerformed &&
  (restoreRoles.value?.event !== "supabase.backup.roles.restore-verified" ||
    restoreRoles.value?.dumpGovernedRolesRestored !== true ||
    restoreRoles.value?.rolesChangedButNotConverged !== 0 ||
    restoreRoles.value?.rolesRestoredExactly !== false ||
    restoreRoles.value?.credentialsRestored !== false ||
    restoreRoles.value?.platformManagedGucSettingsRestored !== false ||
    restoreRoles.value?.limitation !== "role-passwords-and-role-settings-are-not-restored" ||
    !Array.isArray(restoreRoles.value?.limitations) ||
    restoreRoles.value?.sourceCatalogSha256 !== sourceRoles.value.portableCatalogSha256)
)
  throw new Error("ROLE_RESTORE_REPORT_INVALID");

const sealedAt = new Date().toISOString();
if (
  Date.parse(snapshotAt) > Date.parse(archiveSeal.hashedAt) ||
  Date.parse(archiveSeal.hashedAt) > Date.parse(sealedAt) ||
  !Number.isFinite(Date.parse(sourceStorage.value?.snapshotVerifiedAt ?? "")) ||
  Date.parse(sourceStorage.value.snapshotVerifiedAt) < Date.parse(snapshotAt) ||
  Date.parse(sourceStorage.value.snapshotVerifiedAt) > Date.parse(archiveSeal.hashedAt) ||
  (restoreDrillPerformed &&
    (Date.parse(snapshotAt) > Date.parse(restoreDrillStartedAt) ||
      Date.parse(archiveSeal.hashedAt) > Date.parse(restoreDrillStartedAt) ||
      Date.parse(restoreDrillCompletedAt) > Date.parse(sealedAt)))
)
  throw new Error("BACKUP_SNAPSHOT_TIMELINE_INVALID");

const completeDataRestoreDrill =
  restoreDrillPerformed &&
  restoreDrillPassed &&
  restoreScope.value.auth.restoreVerified === true &&
  restoreScope.value.storage.restoreVerified === true &&
  restoreStorage.value.restoreVerified === true;
const restoreVerifications = {
  rolesRestored: false,
  dumpGovernedRolesRestored: restoreRoles?.value?.dumpGovernedRolesRestored === true,
  schemaRestored: completeDataRestoreDrill,
  publicTableInventoryMatched: completeDataRestoreDrill,
  publicRowCountsMatched: completeDataRestoreDrill,
  authMetadataMatched: completeDataRestoreDrill,
  authFullRowFingerprintsMatched: completeDataRestoreDrill,
  storageMetadataMatched: completeDataRestoreDrill,
  storageFullRowFingerprintsMatched: completeDataRestoreDrill,
  storageMetadataReappliedAfterUpload: restoreStorage?.value?.metadataReappliedAfterUpload === true,
  storagePayloadsByteIdentical: completeDataRestoreDrill,
  archiveDigestStable: true,
};

const manifest = {
  schemaVersion: 3,
  event: "supabase.external-backup.completed",
  backupId: randomUUID(),
  projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  createdAt: sealedAt,
  snapshotAt,
  snapshotWalLsn,
  archiveHashedAt: archiveSeal.hashedAt,
  sealedAt,
  repository,
  workflow: {
    name: workflowName,
    path: PRODUCTION_BACKUP_WORKFLOW,
    runId,
    runAttempt,
    event: eventName,
    ref: gitRef,
    headSha: sourceCommit,
  },
  sourceCommit,
  externalTarget: "github-actions-encrypted-artifact",
  encryption: "OpenPGP-AES256",
  artifact: { name: artifactName },
  encryptedArchive: {
    file: encryptedArchiveFile,
    bytes: archiveSeal.bytes,
    sha256: archiveSeal.sha256,
    sealSha256: archiveSealDigest.sha256,
  },
  reports: {
    source: {
      scope: sourceScope.binding,
      storagePayloads: sourceStorage.binding,
      storageSnapshotStability: storageStability.binding,
      roles: sourceRoles.binding,
    },
    restore: restoreDrillPerformed
      ? {
          scope: restoreScope.binding,
          storagePayloads: restoreStorage.binding,
          roles: restoreRoles.binding,
        }
      : null,
  },
  restoreDrill: {
    performed: restoreDrillPerformed,
    outcome: restoreDrillPerformed ? "passed" : "not_scheduled",
    target: restoreDrillPerformed ? "ephemeral-local-supabase" : null,
    startedAt: restoreDrillPerformed ? restoreDrillStartedAt : null,
    completedAt: restoreDrillPerformed ? restoreDrillCompletedAt : null,
    durationSeconds: restoreDrillPerformed ? restoreDrillDurationSeconds : null,
    verifications: restoreVerifications,
  },
  coverage: {
    database: "logical-schema-and-separate-application-auth-storage-data",
    auth: restoreDrillPerformed ? restoreScope.value.auth : sourceScope.value.auth,
    storage: {
      metadata: restoreDrillPerformed ? restoreScope.value.storage : sourceScope.value.storage,
      objectPayloads: restoreDrillPerformed ? restoreStorage.value : sourceStorage.value,
    },
    roles: restoreDrillPerformed ? restoreRoles.value : sourceRoles.value,
  },
  completeDataRestoreDrill,
  completeDisasterRecovery: false,
  // As limitacoes que o proprio relatorio de papeis declara entram aqui. A que importa hoje e a
  // existencia de papel: um dump sem CREATE ROLE nao recria um papel perdido, e isso e mais largo
  // do que a frase sobre senhas e settings que ja existia.
  intentionalLimitations: [
    "auth-runtime-credential-and-mfa-challenges-require-a-target-environment-drill",
    "role-passwords-and-role-settings-are-not-restored",
    "platform-schema-migration-ledgers-are-recreated-by-the-managed-runtime",
    ...(restoreRoles?.value?.limitations ?? []).filter(
      (limitation) => limitation !== "role-passwords-and-role-settings-are-not-restored",
    ),
  ],
  sensitiveValuesLogged: false,
};
// Vale para os dois modos. O manifesto sem drill afirma que a restauracao NAO foi provada, e essa
// afirmacao tambem precisa ser verificada: antes ela era selada e publicada sem validacao alguma.
const validation = validateProductionBackupManifest(manifest, {
  now: new Date(Date.parse(sealedAt) + 1),
});
if (!validation.valid) throw new Error(`BACKUP_MANIFEST_REFUSED:${validation.violations.join(",")}`);
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(
  JSON.stringify({
    event: "supabase.external-backup.manifest-written",
    backupId: manifest.backupId,
    archiveSha256: manifest.encryptedArchive.sha256,
    restoreDrill: manifest.restoreDrill.outcome,
    authTables: manifest.coverage.auth.tableCount,
    storageTables: manifest.coverage.storage.metadata.tableCount,
    storageObjects: manifest.coverage.storage.objectPayloads.objects,
    completeDataRestoreDrill,
    completeDisasterRecovery: false,
    sensitiveValuesLogged: false,
  }),
);
