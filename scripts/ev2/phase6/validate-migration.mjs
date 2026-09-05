import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runSupabase(args) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", ["npx", "supabase", ...args].map(quoteWindowsArgument).join(" ")]
      : ["supabase", ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(details || "Supabase CLI falhou.");
  }
  return result.stdout.trim();
}

const migrationPath = "supabase/migrations/0044_ev2_search_quality.sql";
const migration = readFileSync(migrationPath, "utf8");
const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g6-migration-validation-"));
const file = path.join(directory, "validate.sql");
const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");

const validation = `
begin;
${migration}
do $$
begin
  if to_regclass('public.cms_search_documents') is null
     or to_regclass('public.cms_quality_runs') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'cms_search_synonyms' and column_name = 'reason'
     ) then
    raise exception 'EV2_G6_VALIDATION_FAILED';
  end if;
end;
$$;
rollback;
select json_build_object(
  'rolledBack',
  to_regclass('public.cms_search_documents') is null
    and to_regclass('public.cms_quality_runs') is null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cms_search_synonyms' and column_name = 'reason'
    )
) as evidence;
`;

try {
  writeFileSync(file, validation, { encoding: "utf8", mode: 0o600 });
  const output = runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]);
  const parsed = JSON.parse(output);
  const evidence = parsed?.rows?.[0]?.evidence ?? parsed?.[0]?.evidence ?? parsed?.result?.[0]?.evidence;
  if (evidence?.rolledBack !== true) throw new Error(`Rollback não comprovado: ${output}`);
  console.log(
    JSON.stringify(
      { outcome: "G6_MIGRATION_REHEARSAL_PASS", migration: migrationPath, ...evidence },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
