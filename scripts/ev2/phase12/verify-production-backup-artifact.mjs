import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { backupEvidenceRepositoryPath } from "../phase16/readiness-lib.mjs";
import { backupFileSha256 } from "../phase16/production-backup-evidence-lib.mjs";
import {
  PRODUCTION_BACKUP_RESTORE_ARTIFACT_FILES,
  verifyDownloadedProductionBackup,
} from "./production-backup-gate-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const artifactDirectory = argument("artifact-dir");
const reportPath = argument("report");
if (!relativeFile || !artifactDirectory) throw new Error("PRODUCTION_BACKUP_ARTIFACT_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`))
  throw new Error("PRODUCTION_BACKUP_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("PRODUCTION_BACKUP_APPROVAL_SCHEMA_REFUSED");
const control = record?.productionReadiness?.backupRestore;
const evidenceRepositoryPath = backupEvidenceRepositoryPath(control);
if (!evidenceRepositoryPath) throw new Error("PRODUCTION_BACKUP_EVIDENCE_PATH_REFUSED");
const evidencePath = resolve(evidenceRepositoryPath);
if (dirname(evidencePath) !== resolve(".github/release-controls/evidence"))
  throw new Error("PRODUCTION_BACKUP_EVIDENCE_PATH_REFUSED");
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));

const artifactRoot = resolve(artifactDirectory);
const entries = await readdir(artifactRoot, { withFileTypes: true });
const expectedFiles = new Set([
  ...PRODUCTION_BACKUP_RESTORE_ARTIFACT_FILES,
  evidence?.artifact?.encryptedArchiveFile,
]);
if (
  entries.length !== expectedFiles.size ||
  entries.some((entry) => !entry.isFile() || !expectedFiles.has(entry.name))
)
  throw new Error("PRODUCTION_BACKUP_ARTIFACT_CONTENTS_REFUSED");
const archivePath = resolve(artifactRoot, evidence.artifact.encryptedArchiveFile);
const reportFile = async (file) => {
  const path = resolve(artifactRoot, file);
  const [bytes, digest] = await Promise.all([readFile(path), backupFileSha256(path)]);
  return { file, bytes: digest.bytes, sha256: digest.sha256, value: JSON.parse(bytes.toString("utf8")) };
};
const [manifestBytes, archiveDigest, archiveSealBytes, scopeReport, storageReport, roleReport] =
  await Promise.all([
    readFile(resolve(artifactRoot, "manifest.json")),
    backupFileSha256(archivePath),
    readFile(resolve(artifactRoot, "archive-seal.json")),
    reportFile("backup-restore-scope.json"),
    reportFile("storage-restore-report.json"),
    reportFile("role-restore-report.json"),
  ]);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const archiveSeal = JSON.parse(archiveSealBytes.toString("utf8"));
const result = verifyDownloadedProductionBackup({
  control,
  evidence,
  evidenceBytes,
  manifest,
  manifestBytes,
  archiveDigest,
  archiveSeal,
  archiveSealBytes,
  restoreReports: { scope: scopeReport, storage: storageReport, roles: roleReport },
});
if (!result.valid) throw new Error(`PRODUCTION_BACKUP_ARTIFACT_REFUSED:${result.violations.join(",")}`);
if (reportPath) await writeFile(reportPath, `${JSON.stringify(result.summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ event: "production.backup.artifact.verified", ...result.summary }));
