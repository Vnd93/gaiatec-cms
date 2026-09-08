import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createBackupArchiveSeal, verifyBackupArchiveSeal } from "./production-backup-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? "" : process.argv[index + 1];
}

async function main() {
  const mode = process.argv[2];
  const archive = argument("--archive");
  const sealPath = argument("--seal");
  if (!archive || !sealPath) throw new Error("BACKUP_ARCHIVE_SEAL_PATHS_REQUIRED");
  if (mode === "create") {
    const seal = await createBackupArchiveSeal(archive);
    await writeFile(sealPath, `${JSON.stringify(seal, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        event: seal.event,
        bytes: seal.bytes,
        sha256: seal.sha256,
        sensitiveValuesLogged: false,
      }),
    );
    return;
  }
  if (mode === "verify") {
    const seal = JSON.parse(await readFile(sealPath, "utf8"));
    const result = await verifyBackupArchiveSeal(archive, seal);
    if (!result.valid) throw new Error("BACKUP_ARCHIVE_SEAL_MISMATCH");
    console.log(
      JSON.stringify({
        event: "supabase.production-backup.archive-seal-verified",
        bytes: result.current.bytes,
        sha256: result.current.sha256,
        sensitiveValuesLogged: false,
      }),
    );
    return;
  }
  throw new Error("BACKUP_ARCHIVE_SEAL_MODE_INVALID");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
