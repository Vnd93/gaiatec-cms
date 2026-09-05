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
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(details || "Supabase CLI falhou.");
  }
  return result.stdout.trim();
}

const migrationPath = "supabase/migrations/0046_ev2_conflict_transport_hardening.sql";
const migration = readFileSync(migrationPath, "utf8");
const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g7-hotfix-validation-"));
const file = path.join(directory, "validate.sql");
const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
const procedures = `array[
  'public.cms_execute_release_v2_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
  'public.cms_execute_collaboration_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
  'public.cms_execute_bulk_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure
]`;

const validation = `
begin;
${migration}
do $validation$
begin
  if exists (
    select 1 from pg_proc where oid = any(${procedures}) and position('''40001''' in prosrc) > 0
  ) or (
    select count(*) from pg_proc where oid = any(${procedures}) and position('''PT409''' in prosrc) > 0
  ) <> 3 then
    raise exception 'EV2_G7_CONFLICT_HOTFIX_VALIDATION_FAILED';
  end if;
end;
$validation$;
rollback;
select json_build_object(
  'rolledBack', (
    select bool_and(position('''40001''' in prosrc) > 0 and position('''PT409''' in prosrc) = 0)
    from pg_proc where oid = any(${procedures})
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
      { outcome: "G7_CONFLICT_HOTFIX_REHEARSAL_PASS", migration: migrationPath, ...evidence },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
