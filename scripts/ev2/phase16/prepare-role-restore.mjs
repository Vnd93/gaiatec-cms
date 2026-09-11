import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MANAGED_ROLE_SETTING = /^[\t ]*ALTER[\t ]+ROLE\b[^;]*\bSET\b[^;]*;[\t ]*(?:\r?\n|$)/gim;
const MANAGED_DATABASE_SETTING =
  /^[\t ]*ALTER[\t ]+DATABASE\b[^;]*\bSET[\t ]+"?log_min_messages\b"?[^;]*;[\t ]*(?:\r?\n|$)/gim;
const MANAGED_SESSION_SETTING =
  /^[\t ]*(?:SET[\t ]+(?:(?:SESSION|LOCAL)[\t ]+)?"?log_min_messages"?[\t ]*(?:TO|=)[^;]*|SELECT[\t ]+(?:pg_catalog\.)?set_config[\t ]*\([\t ]*['"]log_min_messages['"][^;]*\))[\t ]*;[\t ]*(?:\r?\n|$)/gim;
const MANAGED_GUC_NAME = /\blog_min_messages\b/i;
// Classes de declaracao do dump de papeis. So contagens saem daqui: um `supabase db dump
// --role-only` que nao emita nenhum CREATE ROLE nao consegue, por construcao, reconstruir um
// papel que o alvo nao tenha — e isso e um limite do backup que precisa ser medido, nao suposto.
const CREATE_ROLE_STATEMENT = /^[\t ]*CREATE[\t ]+ROLE\b/gim;
const ALTER_ROLE_STATEMENT = /^[\t ]*ALTER[\t ]+ROLE\b/gim;
const GRANT_STATEMENT = /^[\t ]*GRANT\b/gim;
const SQL_STATEMENT = /[^;]*;/gim;
const LEADING_DUMP_TRIVIA = /^(?:(?:[\t ]*(?:--[^\r\n]*|\\[^\r\n]*))[\t ]*(?:\r?\n|$)|[\t ]*(?:\r?\n|$))*/;

function removeRemainingManagedGucStatements(source) {
  let removedManagedGucStatements = 0;
  const sql = source.replace(SQL_STATEMENT, (statement) => {
    const executable = statement.replace(/^[\t ]*--[^\r\n]*(?:\r?\n|$)/gm, "");
    if (!MANAGED_GUC_NAME.test(executable)) return statement;

    removedManagedGucStatements += 1;
    const leadingTrivia = statement.match(LEADING_DUMP_TRIVIA)?.[0] ?? "";
    return leadingTrivia;
  });

  if (MANAGED_GUC_NAME.test(sql.replace(/^[\t ]*--[^\r\n]*(?:\r?\n|$)/gm, "")))
    throw new Error("MANAGED_GUC_REMAINED");

  return { sql, removedManagedGucStatements };
}

export function prepareRoleRestore(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("ROLE_DUMP_EMPTY");

  const removedRoleSettings = source.match(MANAGED_ROLE_SETTING)?.length ?? 0;
  const withoutRoleSettings = source.replace(MANAGED_ROLE_SETTING, "");
  const removedDatabaseSettings = withoutRoleSettings.match(MANAGED_DATABASE_SETTING)?.length ?? 0;
  const withoutDatabaseSettings = withoutRoleSettings.replace(MANAGED_DATABASE_SETTING, "");
  const removedSessionSettings = withoutDatabaseSettings.match(MANAGED_SESSION_SETTING)?.length ?? 0;
  const withoutSessionSettings = withoutDatabaseSettings.replace(MANAGED_SESSION_SETTING, "");
  const { sql, removedManagedGucStatements } = removeRemainingManagedGucStatements(withoutSessionSettings);
  if (
    MANAGED_ROLE_SETTING.test(sql) ||
    MANAGED_DATABASE_SETTING.test(sql) ||
    MANAGED_SESSION_SETTING.test(sql)
  )
    throw new Error("MANAGED_ROLE_SETTING_REMAINED");

  return {
    sql,
    removedRoleSettings,
    removedDatabaseSettings,
    removedSessionSettings,
    removedManagedGucStatements,
    createRoleStatements: source.match(CREATE_ROLE_STATEMENT)?.length ?? 0,
    alterRoleStatements: source.match(ALTER_ROLE_STATEMENT)?.length ?? 0,
    grantStatements: source.match(GRANT_STATEMENT)?.length ?? 0,
  };
}

async function main() {
  const [sourcePath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !targetPath) throw new Error("ROLE_RESTORE_PATHS_REQUIRED");

  const result = prepareRoleRestore(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, result.sql, { encoding: "utf8", mode: 0o600 });
  console.log(
    JSON.stringify({
      event: "supabase.role_restore.prepared",
      createRoleStatements: result.createRoleStatements,
      alterRoleStatements: result.alterRoleStatements,
      grantStatements: result.grantStatements,
      removedRoleSettings: result.removedRoleSettings,
      removedDatabaseSettings: result.removedDatabaseSettings,
      removedSessionSettings: result.removedSessionSettings,
      removedManagedGucStatements: result.removedManagedGucStatements,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
