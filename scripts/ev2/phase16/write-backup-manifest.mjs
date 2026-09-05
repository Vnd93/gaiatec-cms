import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "./readiness-lib.mjs";

const archivePath = process.env.BACKUP_ARCHIVE_PATH;
const outputPath = process.env.BACKUP_MANIFEST_PATH;
if (!archivePath || !outputPath) throw new Error("BACKUP_MANIFEST_PATHS_REQUIRED");
const bytes = await readFile(archivePath);
const restoreDrillPerformed = process.env.RESTORE_DRILL_PERFORMED === "true";
const restoreDrillPassed = process.env.RESTORE_DRILL_PASSED === "true";
if (restoreDrillPerformed && !restoreDrillPassed) throw new Error("RESTORE_DRILL_NOT_PASSED");

const manifest = {
  schemaVersion: 1,
  event: "supabase.external-backup.completed",
  backupId: randomUUID(),
  projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  createdAt: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA ?? null,
  externalTarget: "github-actions-encrypted-artifact",
  encryption: "OpenPGP-AES256",
  encryptedArchive: {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  },
  restoreDrill: {
    performed: restoreDrillPerformed,
    outcome: restoreDrillPerformed ? "passed" : "not_scheduled",
    target: restoreDrillPerformed ? "ephemeral-local-supabase" : null,
  },
  sensitiveValuesLogged: false,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    event: manifest.event,
    backupId: manifest.backupId,
    archiveSha256: manifest.encryptedArchive.sha256,
    restoreDrill: manifest.restoreDrill.outcome,
  }),
);
