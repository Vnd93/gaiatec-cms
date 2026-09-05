import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MANAGED_ROLE_SETTING = /^[\t ]*ALTER[\t ]+ROLE\b[^;]*\bSET\b[^;]*;[\t ]*(?:\r?\n|$)/gim;
const MANAGED_DATABASE_SETTING =
  /^[\t ]*ALTER[\t ]+DATABASE\b[^;]*\bSET[\t ]+"?log_min_messages\b"?[^;]*;[\t ]*(?:\r?\n|$)/gim;
const MANAGED_SESSION_SETTING =
  /^[\t ]*(?:SET[\t ]+(?:(?:SESSION|LOCAL)[\t ]+)?"?log_min_messages"?[\t ]*(?:TO|=)[^;]*|SELECT[\t ]+(?:pg_catalog\.)?set_config[\t ]*\([\t ]*['"]log_min_messages['"][^;]*\))[\t ]*;[\t ]*(?:\r?\n|$)/gim;

export function prepareRoleRestore(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("ROLE_DUMP_EMPTY");

  const removedRoleSettings = source.match(MANAGED_ROLE_SETTING)?.length ?? 0;
  const withoutRoleSettings = source.replace(MANAGED_ROLE_SETTING, "");
  const removedDatabaseSettings = withoutRoleSettings.match(MANAGED_DATABASE_SETTING)?.length ?? 0;
  const withoutDatabaseSettings = withoutRoleSettings.replace(MANAGED_DATABASE_SETTING, "");
  const removedSessionSettings = withoutDatabaseSettings.match(MANAGED_SESSION_SETTING)?.length ?? 0;
  const sql = withoutDatabaseSettings.replace(MANAGED_SESSION_SETTING, "");
  if (
    MANAGED_ROLE_SETTING.test(sql) ||
    MANAGED_DATABASE_SETTING.test(sql) ||
    MANAGED_SESSION_SETTING.test(sql)
  )
    throw new Error("MANAGED_ROLE_SETTING_REMAINED");

  return { sql, removedRoleSettings, removedDatabaseSettings, removedSessionSettings };
}

async function main() {
  const [sourcePath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !targetPath) throw new Error("ROLE_RESTORE_PATHS_REQUIRED");

  const result = prepareRoleRestore(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, result.sql, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify({
      event: "supabase.role_restore.prepared",
      removedRoleSettings: result.removedRoleSettings,
      removedDatabaseSettings: result.removedDatabaseSettings,
      removedSessionSettings: result.removedSessionSettings,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
