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
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G10.");

const migrationPath = "supabase/migrations/0049_ev2_ai_assist.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g10-migration-validation-"));
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

const beforeSql = [
  "select json_build_object(",
  "  'flags', (",
  "    select jsonb_agg(jsonb_build_object(",
  "      'key', flag_key, 'defaultEnabled', default_enabled, 'killSwitch', kill_switch",
  "    ) order by flag_key)",
  "    from public.cms_feature_flags",
  "    where flag_key in ('ev2.ai_assist', 'ev2.ai_execute')",
  "  ),",
  "  'permissions', (",
  "    select count(*) from public.cms_permissions where permission_key like 'cms:ai.%'",
  "  ),",
  "  'retentionJobs', (",
  "    select count(*) from cron.job where jobname = 'cms-ai-retention-every-5m'",
  "  )",
  ") as baseline;",
].join("\n");

const rehearsalChecks = [
  "do $$",
  "begin",
  "  if to_regclass('public.cms_ai_sessions') is null",
  "     or to_regclass('public.cms_ai_proposals') is null",
  "     or to_regclass('public.cms_ai_tool_calls') is null",
  "     or to_regclass('public.cms_ai_eval_runs') is null",
  "     or to_regclass('public.cms_ai_command_receipts') is null",
  "     or to_regprocedure('public.cms_ai_capability(uuid,text,text,text,text,timestamp with time zone)') is null",
  "     or to_regprocedure('public.cms_get_ai_workspace(uuid,text,text,text,text,timestamp with time zone,uuid)') is null",
  "     or to_regprocedure('public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)') is null",
  "     or to_regprocedure('private.cms_purge_expired_ai_data(integer)') is null",
  "     or (select count(*) from cron.job where jobname = 'cms-ai-retention-every-5m') <> 1",
  "     or (select count(*) from public.cms_ai_tools where active) <> 4",
  "     or exists (select 1 from public.cms_ai_tools where mutates_cms or not synthetic_only)",
  "     or exists (select 1 from public.cms_ai_policy_versions where external_provider_enabled)",
  "     or exists (select 1 from public.cms_ai_policy_versions where provider_mode <> 'synthetic')",
  "     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_assist')",
  "     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_execute') then",
  "    raise exception 'EV2_G10_VALIDATION_FAILED';",
  "  end if;",
  "end;",
  "$$;",
].join("\n");
const rehearsalSql = "begin;\n" + migration + "\n" + rehearsalChecks + "\nrollback;\n";

const afterSql = [
  "select json_build_object(",
  "  'rolledBack',",
  "    to_regclass('public.cms_ai_sessions') is null",
  "    and to_regclass('public.cms_ai_proposals') is null",
  "    and to_regclass('public.cms_ai_tool_calls') is null",
  "    and to_regclass('public.cms_ai_eval_runs') is null",
  "    and to_regclass('public.cms_ai_command_receipts') is null",
  "    and to_regprocedure('private.cms_purge_expired_ai_data(integer)') is null",
  "    and not exists (select 1 from public.cms_permissions where permission_key like 'cms:ai.%'),",
  "  'flags', (",
  "    select jsonb_agg(jsonb_build_object(",
  "      'key', flag_key, 'defaultEnabled', default_enabled, 'killSwitch', kill_switch",
  "    ) order by flag_key)",
  "    from public.cms_feature_flags",
  "    where flag_key in ('ev2.ai_assist', 'ev2.ai_execute')",
  "  ),",
  "  'retentionJobs', (",
  "    select count(*) from cron.job where jobname = 'cms-ai-retention-every-5m'",
  "  ),",
  "  'productionMutations', 0,",
  "  'externalProviderCalls', 0",
  ") as evidence;",
].join("\n");

try {
  const before = queryFile(beforeFile, beforeSql)[0]?.baseline;
  queryFile(rehearsalFile, rehearsalSql);
  const evidence = queryFile(afterFile, afterSql)[0]?.evidence;
  const flagsRestored = JSON.stringify(before?.flags) === JSON.stringify(evidence?.flags);
  const retentionScheduleRestored = before?.retentionJobs === evidence?.retentionJobs;
  const restored = flagsRestored && retentionScheduleRestored;
  if (evidence?.rolledBack !== true || !restored)
    throw new Error("Rollback não comprovado: " + JSON.stringify({ before, evidence }));
  console.log(
    JSON.stringify(
      {
        outcome: "G10_MIGRATION_REHEARSAL_PASS",
        migration: migrationPath,
        rolledBack: evidence.rolledBack,
        foundationFlagsRestored: flagsRestored,
        retentionScheduleRestored,
        productionMutations: evidence.productionMutations,
        externalProviderCalls: evidence.externalProviderCalls,
      },
      null,
      2,
    ),
  );
} finally {
  const resolvedDirectory = path.resolve(directory);
  const unsafeToRemove =
    path.dirname(resolvedDirectory) !== workspaceRoot ||
    !path.basename(resolvedDirectory).startsWith(".ev2-g10-migration-validation-");
  if (unsafeToRemove) {
    console.error("Diretório temporário de rehearsal fora do workspace autorizado.");
    process.exitCode = 1;
  } else {
    rmSync(directory, { recursive: true, force: true });
  }
}
