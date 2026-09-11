import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildProductionBackupEvidence,
  backupTextSha256,
} from "../phase16/production-backup-evidence-lib.mjs";
import {
  PRODUCTION_BACKUP_RESTORE_ARTIFACT_FILES,
  selectGitHubBackupArtifact,
  validateGitHubBackupRun,
  verifyDownloadedProductionBackup,
} from "./production-backup-gate-lib.mjs";

const now = new Date("2026-09-07T12:00:00.000Z");
const runId = "34000214134";
const runAttempt = 2;
const sourceSha = "f".repeat(40);
const artifactName = `supabase-production-backup-${runId}-${runAttempt}`;
const archiveFile = `${artifactName}.tar.gz.gpg`;
const archiveBytes = Buffer.from("synthetic-encrypted-archive-without-personal-data");

function jsonArtifact(file, value) {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return {
    file,
    value,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
  };
}

function fixture() {
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  const archiveSeal = {
    schemaVersion: 1,
    event: "supabase.production-backup.archive-sealed",
    file: archiveFile,
    bytes: archiveBytes.byteLength,
    sha256: archiveSha256,
    hashedAt: "2026-09-07T11:24:00.000Z",
  };
  const archiveSealBytes = Buffer.from(`${JSON.stringify(archiveSeal, null, 2)}\n`);
  const authCoverage = {
    tables: ["auth.identities", "auth.mfa_factors", "auth.users"],
    tableCount: 3,
    rows: 6,
    aggregateSha256: "8".repeat(64),
    tableInventoryComplete: true,
    dumpContainsAllTables: true,
    restoreVerified: true,
    scope: "all-portable-auth-table-rows",
    runtimeCredentialChallengeVerified: false,
  };
  const storageMetadataCoverage = {
    tables: ["storage.buckets", "storage.objects"],
    tableCount: 2,
    rows: 4,
    aggregateSha256: "9".repeat(64),
    tableInventoryComplete: true,
    dumpContainsAllTables: true,
    restoreVerified: true,
    scope: "all-portable-storage-table-rows",
    bucketRows: 2,
    objectRows: 2,
    objectPayloadsIncluded: false,
    objectPayloadRestoreVerified: false,
    fullRowMetadataFingerprint: true,
  };
  const storagePayloadCoverage = {
    schemaVersion: 1,
    event: "supabase.storage.payloads.restored-verified",
    phase: "restored",
    objects: 2,
    bytes: 2048,
    aggregateSha256: "0".repeat(64),
    exportVerified: true,
    payloadUploadVerified: true,
    restoreVerified: true,
    metadataReappliedAfterUpload: true,
    metadataAggregateSha256: storageMetadataCoverage.aggregateSha256,
    snapshotStabilityVerified: true,
    snapshotAt: "2026-09-07T11:20:00.000Z",
    snapshotWalLsn: "0/16B6C50",
    snapshotVerifiedAt: "2026-09-07T11:21:00.000Z",
    snapshotMetadataAggregateSha256: storageMetadataCoverage.aggregateSha256,
    metadataSignals: {
      version: 2,
      etag: 2,
      checksum: 2,
      updatedAt: 2,
      strongFingerprint: 2,
      contentFingerprint: 2,
    },
    restoreTarget: "ephemeral-local-supabase",
    containsObjectNames: false,
    containsBucketIdentifiers: false,
  };
  const roleCoverage = {
    schemaVersion: 1,
    event: "supabase.backup.roles.restore-verified",
    phase: "restore",
    roleCount: 8,
    portableCatalogSha256: "a".repeat(64),
    sourceRoleDumpSha256: "d".repeat(64),
    portableRoleCatalogMatched: false,
    dumpGovernedRolesRestored: true,
    rolesChangedButNotConverged: 0,
    rolesNotReconstructableFromDump: 1,
    rolesDivergingFromTargetBaseline: 1,
    dumpCreateRoleStatements: 0,
    rolesRestoredExactly: false,
    credentialsRestored: false,
    platformManagedGucSettingsRestored: false,
    limitation: "role-passwords-and-role-settings-are-not-restored",
    containsRoleNames: false,
  };
  const restoreScope = jsonArtifact("backup-restore-scope.json", {
    schemaVersion: 2,
    event: "supabase.backup.scope.restore-verified",
    phase: "restore",
    fingerprintMode: "sha256-canonical-full-row-json-multiset",
    tableInventoryComplete: true,
    auth: authCoverage,
    storage: storageMetadataCoverage,
    excludedPlatformTables: ["auth.schema_migrations", "storage.migrations", "storage.schema_migrations"],
    sessionReplicationRestoreVerified: true,
    containsRawIdentifiers: false,
    containsObjectNames: false,
  });
  const restoreStorage = jsonArtifact("storage-restore-report.json", storagePayloadCoverage);
  const restoreRoles = jsonArtifact("role-restore-report.json", roleCoverage);
  const restoreReports = { scope: restoreScope, storage: restoreStorage, roles: restoreRoles };
  const manifest = {
    schemaVersion: 3,
    event: "supabase.external-backup.completed",
    backupId: "12345678-1234-4234-9234-123456789abc",
    projectRef: "chfuhctnhqgyjowkvllv",
    createdAt: "2026-09-07T11:30:00.000Z",
    snapshotAt: "2026-09-07T11:20:00.000Z",
    archiveHashedAt: "2026-09-07T11:24:00.000Z",
    sealedAt: "2026-09-07T11:30:00.000Z",
    snapshotWalLsn: "0/16B6C50",
    repository: "Vnd93/gaiatec-cms",
    workflow: {
      name: "Backup Supabase production",
      path: ".github/workflows/backup-supabase-production.yml",
      runId,
      runAttempt,
      event: "workflow_dispatch",
      ref: "refs/heads/main",
      headSha: sourceSha,
    },
    sourceCommit: sourceSha,
    externalTarget: "github-actions-encrypted-artifact",
    encryption: "OpenPGP-AES256",
    artifact: { name: artifactName },
    encryptedArchive: {
      file: archiveFile,
      bytes: archiveBytes.byteLength,
      sha256: archiveSha256,
      sealSha256: createHash("sha256").update(archiveSealBytes).digest("hex"),
    },
    reports: {
      source: {
        scope: { file: "backup-source-scope.json", bytes: 101, sha256: "1".repeat(64) },
        storagePayloads: { file: "storage-source-report.json", bytes: 102, sha256: "2".repeat(64) },
        storageSnapshotStability: {
          file: "storage-snapshot-stability.json",
          bytes: 103,
          sha256: "3".repeat(64),
        },
        roles: { file: "role-source-report.json", bytes: 104, sha256: "4".repeat(64) },
      },
      restore: {
        scope: { file: restoreScope.file, bytes: restoreScope.bytes, sha256: restoreScope.sha256 },
        storagePayloads: {
          file: restoreStorage.file,
          bytes: restoreStorage.bytes,
          sha256: restoreStorage.sha256,
        },
        roles: { file: restoreRoles.file, bytes: restoreRoles.bytes, sha256: restoreRoles.sha256 },
      },
    },
    restoreDrill: {
      performed: true,
      outcome: "passed",
      target: "ephemeral-local-supabase",
      startedAt: "2026-09-07T11:25:00.000Z",
      completedAt: "2026-09-07T11:29:00.000Z",
      durationSeconds: 240,
      verifications: {
        rolesRestored: false,
        dumpGovernedRolesRestored: true,
        schemaRestored: true,
        publicTableInventoryMatched: true,
        publicRowCountsMatched: true,
        authMetadataMatched: true,
        authFullRowFingerprintsMatched: true,
        storageMetadataMatched: true,
        storageFullRowFingerprintsMatched: true,
        storageMetadataReappliedAfterUpload: true,
        storagePayloadsByteIdentical: true,
        archiveDigestStable: true,
      },
    },
    coverage: {
      database: "logical-schema-and-separate-application-auth-storage-data",
      auth: authCoverage,
      storage: {
        metadata: storageMetadataCoverage,
        objectPayloads: storagePayloadCoverage,
      },
      roles: roleCoverage,
    },
    completeDataRestoreDrill: true,
    completeDisasterRecovery: false,
    intentionalLimitations: [
      "auth-runtime-credential-and-mfa-challenges-require-a-target-environment-drill",
      "role-passwords-and-role-settings-are-not-restored",
      "platform-schema-migration-ledgers-are-recreated-by-the-managed-runtime",
      "role-existence-is-not-restored-by-the-role-dump",
    ],
    sensitiveValuesLogged: false,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const evidence = buildProductionBackupEvidence(manifest, { manifestBytes, now });
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const control = {
    status: "passed",
    projectRef: manifest.projectRef,
    externalTarget: manifest.externalTarget,
    encryptedArchiveSha256: manifest.encryptedArchive.sha256,
    backupRunId: runId,
    backupRunAttempt: runAttempt,
    restoreDrillRunId: runId,
    backupWorkflow: manifest.workflow.path,
    backupWorkflowName: manifest.workflow.name,
    backupEvent: manifest.workflow.event,
    backupRef: manifest.workflow.ref,
    backupSourceSha: sourceSha,
    artifactName,
    artifactId: "987654321",
    artifactDigest: `sha256:${"a".repeat(64)}`,
    manifestSha256: backupTextSha256(manifestBytes),
    rpoMinutes: 60,
    rtoMinutes: 10,
    evidenceReference: `.github/release-controls/evidence/BACKUP_RESTORE_${runId}_${runAttempt}.json`,
    evidenceSha256: backupTextSha256(evidenceBytes),
    completedAt: manifest.createdAt,
    runCompletedAt: "2026-09-07T11:31:00.000Z",
  };
  const run = {
    id: Number(runId),
    run_attempt: runAttempt,
    name: manifest.workflow.name,
    path: manifest.workflow.path,
    head_branch: "main",
    head_sha: sourceSha,
    event: manifest.workflow.event,
    status: "completed",
    conclusion: "success",
    updated_at: "2026-09-07T11:31:00.000Z",
    repository: { full_name: "Vnd93/gaiatec-cms" },
  };
  const artifact = {
    id: 987654321,
    name: artifactName,
    expired: false,
    expires_at: "2026-10-07T11:31:00.000Z",
    size_in_bytes: 4096,
    digest: `sha256:${"a".repeat(64)}`,
    archive_download_url: "https://api.github.com/repos/Vnd93/gaiatec-cms/actions/artifacts/987654321/zip",
    workflow_run: { id: Number(runId), head_branch: "main", head_sha: sourceSha },
  };
  return {
    manifest,
    manifestBytes,
    evidence,
    evidenceBytes,
    control,
    run,
    artifact,
    archiveSeal,
    archiveSealBytes,
    restoreReports,
  };
}

test("production backup gate binds the exact successful workflow run on main and its live artifact", () => {
  const { control, evidence, run, artifact } = fixture();
  assert.deepEqual(
    validateGitHubBackupRun({
      control,
      evidence,
      run,
      repository: "Vnd93/gaiatec-cms",
      now,
    }),
    { valid: true, violations: [] },
  );
  const selected = selectGitHubBackupArtifact({ control, run, artifacts: [artifact], now });
  assert.equal(selected.valid, true);
  assert.equal(selected.artifact.id, artifact.id);

  const runCases = [
    ["run id", { id: Number(runId) + 1 }, /backup_run_id_mismatch/],
    ["workflow", { name: "Other workflow" }, /backup_run_workflow_mismatch/],
    ["branch", { head_branch: "feature" }, /backup_run_main_sha_mismatch/],
    ["sha", { head_sha: "0".repeat(40) }, /backup_run_main_sha_mismatch/],
    ["conclusion", { conclusion: "failure" }, /backup_run_not_successful/],
  ];
  for (const [label, change, expected] of runCases) {
    const result = validateGitHubBackupRun({
      control,
      evidence,
      run: { ...run, ...change },
      repository: "Vnd93/gaiatec-cms",
      now,
    });
    assert.match(result.violations.join(","), expected, label);
  }
  assert.match(
    selectGitHubBackupArtifact({
      control,
      run,
      artifacts: [{ ...artifact, expired: true }],
      now,
    }).violations.join(","),
    /backup_artifact_expired/,
  );
  assert.match(
    selectGitHubBackupArtifact({ control, run, artifacts: [artifact, { ...artifact }], now }).violations.join(
      ",",
    ),
    /backup_artifact_not_unique/,
  );
  assert.match(
    selectGitHubBackupArtifact({
      control,
      run,
      artifacts: [{ ...artifact, archive_download_url: "https://attacker.invalid/archive.zip" }],
      now,
    }).violations.join(","),
    /backup_artifact_download_url_invalid/,
  );
});

test("downloaded backup gate proves evidence, seal, restore reports, freshness and restore duration", () => {
  const {
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveSeal,
    archiveSealBytes,
    restoreReports,
  } = fixture();
  const downloaded = {
    archiveSeal,
    archiveSealBytes,
    restoreReports,
  };
  const valid = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    now,
  });
  assert.equal(valid.valid, true, valid.violations.join(","));
  assert.equal(valid.summary.restoreDurationSeconds, 240);
  assert.deepEqual(PRODUCTION_BACKUP_RESTORE_ARTIFACT_FILES, [
    "archive-seal.json",
    "backup-restore-scope.json",
    "manifest.json",
    "role-restore-report.json",
    "storage-restore-report.json",
  ]);

  const tamperedSeal = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    archiveSeal: { ...archiveSeal, sha256: "0".repeat(64) },
  });
  assert.match(tamperedSeal.violations.join(","), /backup_downloaded_archive_seal_mismatch/);

  const tamperedStorageRestore = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    restoreReports: {
      ...restoreReports,
      storage: {
        ...restoreReports.storage,
        value: { ...restoreReports.storage.value, payloadUploadVerified: false },
      },
    },
  });
  assert.match(tamperedStorageRestore.violations.join(","), /backup_downloaded_storage_restore_invalid/);

  const tamperedManifest = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes: Buffer.concat([manifestBytes, Buffer.from(" ")]),
    archiveBytes,
    ...downloaded,
    now,
  });
  assert.match(tamperedManifest.violations.join(","), /backup_downloaded_manifest_digest_mismatch/);

  const tamperedEvidenceControl = { ...control, evidenceSha256: "0".repeat(64) };
  const tamperedEvidence = verifyDownloadedProductionBackup({
    control: tamperedEvidenceControl,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    now,
  });
  assert.match(tamperedEvidence.violations.join(","), /backup_evidence_digest_mismatch/);

  const tamperedArchive = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes: Buffer.from("tampered"),
    ...downloaded,
    now,
  });
  assert.match(tamperedArchive.violations.join(","), /backup_downloaded_archive_digest_mismatch/);

  const stale = verifyDownloadedProductionBackup({
    control,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    now: new Date("2026-09-07T13:00:01.000Z"),
  });
  assert.match(stale.violations.join(","), /backup_manifest_rpo_expired/);

  const slowControl = { ...control, rtoMinutes: 3 };
  const slow = verifyDownloadedProductionBackup({
    control: slowControl,
    evidence,
    evidenceBytes,
    manifest,
    manifestBytes,
    archiveBytes,
    ...downloaded,
    now,
  });
  assert.match(slow.violations.join(","), /backup_manifest_rto_exceeded/);
});
