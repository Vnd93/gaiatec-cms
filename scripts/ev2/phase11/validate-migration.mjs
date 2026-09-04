import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
};

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return '"' + value.replaceAll("%", "%%").replaceAll('"', '""') + '"';
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
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(details || "Supabase CLI falhou.");
  }
  return result.stdout.trim();
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
if (!project || project.name !== TARGET.name || project.region !== TARGET.region || project.linked !== true)
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G11.");

const migrationPath = "supabase/migrations/0050_ev2_system_assurance.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g11-migration-validation-"));
const beforeFile = path.join(directory, "before.sql");
const rehearsalFile = path.join(directory, "rehearsal.sql");
const afterFile = path.join(directory, "after.sql");

function queryFile(file, sql) {
  writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  const parsed = JSON.parse(
    runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]),
  );
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.result)) return parsed.result;
  if (Array.isArray(parsed)) return parsed;
  throw new Error("Resposta SQL sem linhas: " + JSON.stringify(parsed));
}

const stateSql = [
  "select json_build_object(",
  "  'flagCount', (select count(*) from public.cms_feature_flags where flag_key = 'ev2.system_assurance'),",
  "  'permissionCount', (select count(*) from public.cms_permissions where permission_key in ('cms:leads.retry_delivery','cms:diagnostics.assure')),",
  "  'leadFinishHash', md5(pg_get_functiondef('public.cms_finish_lead_outbox(uuid,boolean,text)'::regprocedure))",
  ") as state;",
].join("\n");

const rehearsalChecks = [
  "do $$",
  "begin",
  "  if to_regclass('public.cms_lead_outbox_replays') is null",
  "     or to_regclass('public.cms_assurance_runs') is null",
  "     or to_regclass('public.cms_assurance_events') is null",
  "     or to_regclass('public.cms_system_command_receipts') is null",
  "     or to_regprocedure('public.cms_system_capability(uuid,text,text,text,text,timestamp with time zone)') is null",
  "     or to_regprocedure('public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)') is null",
  "     or to_regprocedure('public.cms_retry_lead_delivery(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)') is null",
  "     or to_regprocedure('public.cms_execute_system_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,uuid,text)') is null",
  "     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.system_assurance')",
  "     or (select count(*) from public.cms_permissions where permission_key in ('cms:leads.retry_delivery','cms:diagnostics.assure') and critical) <> 2",
  "     or exists (select 1 from public.cms_assurance_runs where real_data_used or not synthetic_only) then",
  "    raise exception 'EV2_G11_VALIDATION_FAILED';",
  "  end if;",
  "end;",
  "$$;",
].join("\n");
const rehearsalSql = "begin;\n" + migration + "\n" + rehearsalChecks + "\nrollback;\n";

try {
  const before = queryFile(beforeFile, stateSql)[0]?.state;
  queryFile(rehearsalFile, rehearsalSql);
  const after = queryFile(afterFile, stateSql)[0]?.state;
  const rolledBack =
    before?.flagCount === after?.flagCount &&
    before?.permissionCount === after?.permissionCount &&
    before?.leadFinishHash === after?.leadFinishHash;
  if (!rolledBack) throw new Error("Rollback não comprovado: " + JSON.stringify({ before, after }));
  console.log(
    JSON.stringify(
      {
        outcome: "G11_MIGRATION_REHEARSAL_PASS",
        migration: migrationPath,
        rolledBack,
        leadWorkerContractRestored: before.leadFinishHash === after.leadFinishHash,
        productionMutations: 0,
        realDataUsed: false,
      },
      null,
      2,
    ),
  );
} finally {
  const resolvedDirectory = path.resolve(directory);
  const safeDirectory =
    path.dirname(resolvedDirectory) === workspaceRoot &&
    path.basename(resolvedDirectory).startsWith(".ev2-g11-migration-validation-");
  if (!safeDirectory) {
    console.error("Diretório temporário de rehearsal fora do workspace autorizado.");
    process.exitCode = 1;
  } else {
    rmSync(directory, { recursive: true, force: true });
  }
}
