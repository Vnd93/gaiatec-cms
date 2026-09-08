import { basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { backupTextSha256, buildProductionBackupEvidence } from "./production-backup-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = argument("manifest");
const outputPath = argument("output");
if (!manifestPath || !outputPath) throw new Error("BACKUP_EVIDENCE_PATHS_REQUIRED");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const expectedBasename = `BACKUP_RESTORE_${manifest?.workflow?.runId}_${manifest?.workflow?.runAttempt}.json`;
if (basename(outputPath) !== expectedBasename) throw new Error("BACKUP_EVIDENCE_FILENAME_INVALID");
const evidence = buildProductionBackupEvidence(manifest, { manifestBytes });
const evidenceBytes = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(outputPath, evidenceBytes, { encoding: "utf8", flag: "wx" });
console.log(
  JSON.stringify({
    event: "supabase.production-backup.evidence-written",
    runId: evidence.run.id,
    runAttempt: evidence.run.attempt,
    evidenceFile: basename(outputPath),
    evidenceSha256: backupTextSha256(evidenceBytes),
    secretsExposed: false,
  }),
);
