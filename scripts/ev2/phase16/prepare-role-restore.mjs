import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MANAGED_ROLE_SETTING = /^[\t ]*ALTER[\t ]+ROLE\b[^;]*\bSET\b[^;]*;[\t ]*(?:\r?\n|$)/gim;

export function prepareRoleRestore(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("ROLE_DUMP_EMPTY");

  const removedStatements = source.match(MANAGED_ROLE_SETTING)?.length ?? 0;
  const sql = source.replace(MANAGED_ROLE_SETTING, "");
  if (MANAGED_ROLE_SETTING.test(sql)) throw new Error("MANAGED_ROLE_SETTING_REMAINED");

  return { sql, removedStatements };
}

async function main() {
  const [sourcePath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !targetPath) throw new Error("ROLE_RESTORE_PATHS_REQUIRED");

  const result = prepareRoleRestore(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, result.sql, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify({
      event: "supabase.role_restore.prepared",
      removedManagedSettings: result.removedStatements,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
