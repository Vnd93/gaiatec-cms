import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
};
const migrationPath = "supabase/migrations/0053_ev2_runtime_eligibility.sql";

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runSupabase(args) {
  const binary = "npx";
  const pinned = ["--yes", "supabase@2.116.0", ...args];
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...pinned].map(quoteWindowsArgument).join(" ")]
      : pinned;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
if (!project || project.name !== TARGET.name || project.region !== TARGET.region || !project.linked)
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G13.");

const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g13-migration-validation-"));
const resolvedDirectory = path.resolve(directory);
if (
  path.dirname(resolvedDirectory) !== workspaceRoot ||
  !path.basename(resolvedDirectory).startsWith(".ev2-g13-migration-validation-")
)
  throw new Error("Diretório temporário G13 fora do workspace autorizado.");
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

const stateSql = `
select json_build_object(
  'manifestExists', to_regprocedure('public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)') is not null,
  'flagEvaluatorHash', md5(pg_get_functiondef('public.cms_evaluate_feature_flag(uuid,text,text,text,text,text,timestamp with time zone)'::regprocedure))
) as state;
`;
const rehearsalSql = `
begin;
${migration}
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51300000-0000-4000-8000-000000000102',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g13.rehearsal@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51300000-0000-4000-8000-000000000102',
  'Ator sintético rehearsal G13',
  'g13.rehearsal@example.test',
  'active',
  now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51300000-0000-4000-8000-000000000102', 'super_admin');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.dam', 'staging', 'user', '51300000-0000-4000-8000-000000000102', true,
  'Rehearsal transacional individual G13', now() - interval '1 minute', now() + interval '29 minutes',
  '51300000-0000-4000-8000-000000000102'
);
do $$
declare
  v_staging jsonb;
  v_production jsonb;
  v_individual jsonb;
  v_parallel_broad jsonb;
  v_long_ttl jsonb;
begin
  v_staging := public.cms_runtime_capability_manifest(
    null, 'staging', 'main', 'aal2', 'g13-rehearsal', now()
  );
  v_production := public.cms_runtime_capability_manifest(
    null, 'production', 'main', 'aal2', 'g13-rehearsal', now()
  );
  v_individual := public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000102', 'staging', 'main', 'aal2',
    'g13-rehearsal-individual', now()
  );
  if v_staging ->> 'status' <> 'unavailable'
     or (select count(*) from jsonb_object_keys(v_staging -> 'capabilities')) <> 13
     or exists (
       select 1 from jsonb_each(v_staging -> 'capabilities') item
       where (item.value ->> 'enabled')::boolean
     )
     or v_production ->> 'status' <> 'gated'
     or exists (
       select 1 from jsonb_each(v_production -> 'capabilities') item
       where (item.value ->> 'enabled')::boolean
     )
     or has_function_privilege(
       'anon',
       'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
       'EXECUTE'
     )
     or v_individual #>> '{capabilities,ev2.dam,enabled}' <> 'true' then
    raise exception 'EV2_G13_RUNTIME_REHEARSAL_FAILED';
  end if;

  insert into public.cms_feature_flag_overrides (
    flag_key, environment, scope_type, scope_key, enabled, reason,
    starts_at, expires_at, created_by
  ) values (
    'ev2.dam', 'staging', 'environment', 'staging', true,
    'Rehearsal negativo de escopo amplo paralelo G13',
    now() - interval '1 minute', now() + interval '5 minutes',
    '51300000-0000-4000-8000-000000000102'
  );
  v_parallel_broad := public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000102', 'staging', 'main', 'aal2',
    'g13-rehearsal-broad', now()
  );
  if v_parallel_broad #>> '{capabilities,ev2.dam,enabled}' <> 'false' then
    raise exception 'EV2_G13_PARALLEL_BROAD_OVERRIDE_NOT_CLOSED';
  end if;

  insert into public.cms_feature_flag_overrides (
    flag_key, environment, scope_type, scope_key, enabled, reason,
    starts_at, expires_at, created_by
  ) values (
    'ev2.ai_assist', 'staging', 'user', '51300000-0000-4000-8000-000000000102', true,
    'Rehearsal negativo de TTL longo G13',
    now() - interval '1 minute', now() + interval '30 minutes',
    '51300000-0000-4000-8000-000000000102'
  );
  v_long_ttl := public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000102', 'staging', 'main', 'aal2',
    'g13-rehearsal-long-ttl', now()
  );
  if v_long_ttl #>> '{capabilities,ev2.ai_assist,enabled}' <> 'false' then
    raise exception 'EV2_G13_LONG_TTL_NOT_CLOSED';
  end if;
end;
$$;
rollback;
`;

try {
  const before = queryFile(beforeFile, stateSql)[0]?.state;
  if (before?.manifestExists)
    throw new Error("Rehearsal recusado: a migration 0053 já está aplicada no staging.");
  queryFile(rehearsalFile, rehearsalSql);
  const after = queryFile(afterFile, stateSql)[0]?.state;
  const rolledBack =
    after?.manifestExists === false && before?.flagEvaluatorHash === after?.flagEvaluatorHash;
  if (!rolledBack) throw new Error(`Rollback não comprovado: ${JSON.stringify({ before, after })}`);
  console.log(
    JSON.stringify(
      {
        outcome: "G13_MIGRATION_REHEARSAL_PASS",
        migration: migrationPath,
        rolledBack,
        flagEvaluatorRestored: before.flagEvaluatorHash === after.flagEvaluatorHash,
        individualOverrideEligible: true,
        parallelBroadOverrideClosed: true,
        longTtlOverrideClosed: true,
        productionMutations: 0,
        realDataUsed: false,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
