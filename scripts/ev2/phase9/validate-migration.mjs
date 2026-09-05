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
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G9.");

const migrationPath = "supabase/migrations/0048_ev2_visual_studio_multisite.sql";
const migration = readFileSync(migrationPath, "utf8");
const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g9-migration-validation-"));
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
  throw new Error(`Resposta SQL sem linhas: ${JSON.stringify(parsed)}`);
}

const beforeSql = `
select json_build_object(
  'validatorHash', md5(pg_get_functiondef('public.cms_validate_site_builder_publication()'::regprocedure)),
  'managedContract', (
    select validation_contract from public.cms_capability_registry
    where consumer_id = 'cms.managed-page.v1'
  ),
  'homepageContract', (
    select validation_contract from public.cms_capability_registry
    where consumer_id = 'cms.homepage-builder.v1'
  )
) as baseline;
`;

const rehearsalSql = `
begin;
${migration}
do $$
begin
  if to_regclass('public.cms_sites') is null
     or to_regclass('public.cms_visual_documents') is null
     or to_regclass('public.cms_visual_snapshots') is null
     or to_regclass('public.cms_site_command_receipts') is null
     or to_regprocedure('public.cms_visual_capability(uuid,text,text,text,text,timestamp with time zone)') is null
     or to_regprocedure('public.cms_execute_visual_command(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)') is null
     or to_regprocedure('public.cms_execute_site_command(uuid,text,text,jsonb,bigint,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)') is null
     or (select count(*) from public.cms_component_definitions where active) <> 20
     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.visual_studio')
     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.multisite')
     or exists (select 1 from public.cms_sites where production_enabled)
     or exists (select 1 from public.cms_site_domains) then
    raise exception 'EV2_G9_VALIDATION_FAILED';
  end if;
end;
$$;
rollback;
`;

const afterSql = `
select json_build_object(
  'rolledBack',
    to_regclass('public.cms_sites') is null
    and to_regclass('public.cms_visual_documents') is null
    and to_regclass('public.cms_visual_snapshots') is null
    and to_regclass('public.cms_site_command_receipts') is null
    and not exists (select 1 from public.cms_roles where role_key = 'designer')
    and not exists (select 1 from public.cms_permissions where permission_key like 'cms:visual.%')
    and not exists (select 1 from public.cms_permissions where permission_key like 'cms:sites.%'),
  'validatorHash', md5(pg_get_functiondef('public.cms_validate_site_builder_publication()'::regprocedure)),
  'managedContract', (
    select validation_contract from public.cms_capability_registry
    where consumer_id = 'cms.managed-page.v1'
  ),
  'homepageContract', (
    select validation_contract from public.cms_capability_registry
    where consumer_id = 'cms.homepage-builder.v1'
  ),
  'productionMutations', 0
) as evidence;
`;

try {
  const before = queryFile(beforeFile, beforeSql)[0]?.baseline;
  queryFile(rehearsalFile, rehearsalSql);
  const evidence = queryFile(afterFile, afterSql)[0]?.evidence;
  const restored =
    before?.validatorHash === evidence?.validatorHash &&
    JSON.stringify(before?.managedContract) === JSON.stringify(evidence?.managedContract) &&
    JSON.stringify(before?.homepageContract) === JSON.stringify(evidence?.homepageContract);
  if (evidence?.rolledBack !== true || !restored)
    throw new Error(`Rollback não comprovado: ${JSON.stringify({ before, evidence })}`);
  console.log(
    JSON.stringify(
      {
        outcome: "G9_MIGRATION_REHEARSAL_PASS",
        migration: migrationPath,
        rolledBack: evidence.rolledBack,
        legacyValidatorAndContractsRestored: restored,
        productionMutations: evidence.productionMutations,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
