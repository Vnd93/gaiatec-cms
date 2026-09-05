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

function rowsFrom(output) {
  const parsed = JSON.parse(output);
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.result)) return parsed.result;
  if (Array.isArray(parsed)) return parsed;
  throw new Error("Resposta SQL sem linhas: " + output);
}

const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
if (!project || project.name !== TARGET.name || project.region !== TARGET.region || project.linked !== true)
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G11.");

const migrationPath = "supabase/migrations/0051_ev2_system_assurance_projection_reconciliation.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g11-reconciliation-validation-"));
const beforeFile = path.join(directory, "before.sql");
const rehearsalFile = path.join(directory, "rehearsal.sql");
const afterFile = path.join(directory, "after.sql");

function queryFile(file, sql) {
  writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  return rowsFrom(runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]));
}

const snapshotProcedure =
  "public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)";
const stateSql = `select json_build_object(
  'snapshotHash', md5(pg_get_functiondef('${snapshotProcedure}'::regprocedure))
) as state;`;

const reconciliationSql = `
select (
  (select count(*)
     from public.cms_publications publication
     join public.cms_content_items item on item.id = publication.item_id
    where not exists (
      select 1 from public.cms_published_projection projection
      where projection.item_id = publication.item_id
        and projection.revision_id = publication.revision_id
    )
      and not (
        item.workflow_status in ('archived', 'trashed')
        and item.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
      ))
  +
  (select count(*)
     from public.cms_published_projection projection
     join public.cms_content_items item on item.id = projection.item_id
    where not exists (
      select 1 from public.cms_publications publication
      where publication.item_id = projection.item_id
        and publication.revision_id = projection.revision_id
    )
       or (
        item.workflow_status in ('archived', 'trashed')
        and item.content_type in ('page', 'homepage', 'navigation', 'site_settings', 'placement')
      ))
)::integer`;

const rehearsalSql = `begin;
${migration}
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51110000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g11.reconciliation@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51110000-0000-4000-8000-000000000101', 'Reconciliation G11',
  'g11.reconciliation@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51110000-0000-4000-8000-000000000101', 'super_admin');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.system_assurance', 'staging', 'user', '51110000-0000-4000-8000-000000000101', true,
  'Ensaio transacional da reconciliação G11', now() - interval '1 minute', now() + interval '29 minutes',
  '51110000-0000-4000-8000-000000000101'
);
insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by, archived_at
) values (
  '51110000-0000-4000-8000-000000000201', 'page', 'g11-reconciliation-retired', 'archived',
  '51110000-0000-4000-8000-000000000101', '51110000-0000-4000-8000-000000000101', now()
);
insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values (
  '51110000-0000-4000-8000-000000000202', '51110000-0000-4000-8000-000000000201',
  1, 1, '{}', '{}', '[{"sourceKind":"synthetic_test","rightsConfirmed":true}]',
  1, 'Ensaio sintético G11', '51110000-0000-4000-8000-000000000101'
);
insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
values (
  '51110000-0000-4000-8000-000000000201', '51110000-0000-4000-8000-000000000202',
  'cms:page:51110000-0000-4000-8000-000000000201', '51110000-0000-4000-8000-000000000101'
);
do $validation$
declare
  v_divergence integer;
  v_retired_snapshot integer;
  v_active_snapshot integer;
  v_source text;
begin
  v_divergence := (${reconciliationSql});
  v_retired_snapshot := (
    public.cms_get_system_snapshot(
      '51110000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
      'g11-reconciliation-session', now() - interval '1 minute', gen_random_uuid()
    ) #>> '{metrics,projectionDivergence}'
  )::integer;
  update public.cms_content_items
  set workflow_status = 'draft', archived_at = null
  where id = '51110000-0000-4000-8000-000000000201';
  v_active_snapshot := (
    public.cms_get_system_snapshot(
      '51110000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
      'g11-reconciliation-session', now() - interval '1 minute', gen_random_uuid()
    ) #>> '{metrics,projectionDivergence}'
  )::integer;
  select prosrc into v_source from pg_proc where oid = '${snapshotProcedure}'::regprocedure;
  if v_divergence <> 0
     or v_retired_snapshot <> 0
     or v_active_snapshot <> 1
     or position('private.cms_system_assert_available' in v_source) = 0
     or position($needle$item.workflow_status in ('archived', 'trashed')$needle$ in v_source) = 0 then
    raise exception 'EV2_G11_RECONCILIATION_VALIDATION_FAILED';
  end if;
end;
$validation$;
rollback;`;

try {
  const before = queryFile(beforeFile, stateSql)[0]?.state;
  queryFile(rehearsalFile, rehearsalSql);
  const after = queryFile(afterFile, stateSql)[0]?.state;
  const rolledBack = before?.snapshotHash === after?.snapshotHash;
  if (!rolledBack) throw new Error("Rollback não comprovado: " + JSON.stringify({ before, after }));
  console.log(
    JSON.stringify(
      {
        outcome: "G11_PROJECTION_RECONCILIATION_REHEARSAL_PASS",
        migration: migrationPath,
        projectionDivergenceAfterPatch: 0,
        rolledBack,
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
    path.basename(resolvedDirectory).startsWith(".ev2-g11-reconciliation-validation-");
  if (!safeDirectory) {
    console.error("Diretório temporário de rehearsal fora do workspace autorizado.");
    process.exitCode = 1;
  } else {
    rmSync(directory, { recursive: true, force: true });
  }
}
