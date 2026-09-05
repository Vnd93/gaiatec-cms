import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
};
const migrationPath = "supabase/migrations/0054_ev2_ai_transactional.sql";
const authorization = process.env.EV2_G14_REHEARSAL_AUTHORIZED ?? "";

if (authorization !== "STAGING-0054-SYNTHETIC")
  throw new Error(
    "Rehearsal G14 bloqueado. Defina EV2_G14_REHEARSAL_AUTHORIZED=STAGING-0054-SYNTHETIC somente após autorização explícita.",
  );

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
    maxBuffer: 30 * 1024 * 1024,
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
  throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G14.");

const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g14-migration-validation-"));
const resolvedDirectory = path.resolve(directory);
if (
  path.dirname(resolvedDirectory) !== workspaceRoot ||
  !path.basename(resolvedDirectory).startsWith(".ev2-g14-migration-validation-")
)
  throw new Error("Diretório temporário G14 fora do workspace autorizado.");

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
  'toolsExists', to_regclass('public.cms_ai_execution_tools') is not null,
  'capabilityExists', to_regprocedure('public.cms_ai_execute_capability(uuid,text,text,text,text,timestamp with time zone)') is not null,
  'commandExists', to_regprocedure('public.cms_execute_ai_transaction_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)') is not null,
  'assistDefault', (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_assist'),
  'executeDefault', (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.ai_execute')
) as state;
`;

const rehearsalSql = `
begin;
${migration}

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '51400000-0000-4000-8000-000000000191',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g14.rehearsal.operator@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '51400000-0000-4000-8000-000000000192',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'g14.rehearsal.reviewer@example.test', '', now(), '{}', '{}', now(), now()
  );

insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values
  ('51400000-0000-4000-8000-000000000191', 'Operador rehearsal G14', 'g14.rehearsal.operator@example.test', 'active', now()),
  ('51400000-0000-4000-8000-000000000192', 'Revisor rehearsal G14', 'g14.rehearsal.reviewer@example.test', 'active', now());

insert into public.cms_user_roles (user_id, role_key)
values
  ('51400000-0000-4000-8000-000000000191', 'super_admin'),
  ('51400000-0000-4000-8000-000000000192', 'reviewer');

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
)
select flag_key, 'staging', 'user', actor_id::text, true,
       'Rehearsal transacional individual G14', now() - interval '1 minute',
       now() + interval '29 minutes', '51400000-0000-4000-8000-000000000191'
from (values
  ('ev2.ai_assist', '51400000-0000-4000-8000-000000000191'::uuid),
  ('ev2.ai_execute', '51400000-0000-4000-8000-000000000191'::uuid),
  ('ev2.ai_assist', '51400000-0000-4000-8000-000000000192'::uuid),
  ('ev2.ai_execute', '51400000-0000-4000-8000-000000000192'::uuid)
) flags(flag_key, actor_id);

do $$
declare
  v_operator constant uuid := '51400000-0000-4000-8000-000000000191';
  v_reviewer constant uuid := '51400000-0000-4000-8000-000000000192';
  v_plan jsonb;
  v_run jsonb;
  v_result jsonb;
begin
  if public.cms_ai_execute_capability(
    v_operator, 'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute'
  ) #>> '{enabled}' <> 'true' then
    raise exception 'EV2_G14_CAPABILITY_REHEARSAL_FAILED';
  end if;
  if public.cms_ai_execute_capability(
    v_operator, 'production', 'main', 'aal2', 'g14-rehearsal-production', now() - interval '1 minute'
  ) #>> '{enabled}' <> 'false' then
    raise exception 'EV2_G14_PRODUCTION_BOUNDARY_FAILED';
  end if;

  perform public.cms_execute_ai_transaction_command(
    v_operator, 'create_target',
    '{"targetRef":"g14x-rehearsal-target","title":"Alvo rehearsal G14","payload":{"summary":"Estado sintético inicial"}}',
    'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-target', repeat('1', 64)
  );
  v_plan := public.cms_execute_ai_transaction_command(
    v_operator, 'create_plan',
    '{"title":"Plano rehearsal G14","steps":[
      {"stepKey":"step-rehearsal-patch","toolKey":"draft.apply_patch","targetRef":"g14x-rehearsal-target","expectedVersion":1,"arguments":{"patch":{"summary":"Estado sintético revisado"}}},
      {"stepKey":"step-rehearsal-submit","toolKey":"workflow.submit","targetRef":"g14x-rehearsal-target","expectedVersion":2,"arguments":{}},
      {"stepKey":"step-rehearsal-publish","toolKey":"release.publish","targetRef":"g14x-rehearsal-target","expectedVersion":3,"arguments":{}}
    ]}',
    'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-plan', repeat('2', 64)
  );

  begin
    perform public.cms_execute_ai_transaction_command(
      v_operator, 'approve_plan',
      jsonb_build_object('planId', v_plan ->> 'planId', 'expectedPlanHash', v_plan ->> 'planHash',
        'decision', 'approved', 'rationale', 'Autoaprovação negativa'),
      'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute',
      gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-self-approval', repeat('3', 64)
    );
    raise exception 'EV2_G14_SELF_APPROVAL_BYPASS';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED' then raise; end if;
  end;

  perform public.cms_execute_ai_transaction_command(
    v_reviewer, 'approve_plan',
    jsonb_build_object('planId', v_plan ->> 'planId', 'expectedPlanHash', v_plan ->> 'planHash',
      'decision', 'approved', 'rationale', 'Plano sintético conferido'),
    'staging', 'main', 'aal2', 'g14-rehearsal-reviewer', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-approval', repeat('4', 64)
  );
  v_run := public.cms_execute_ai_transaction_command(
    v_operator, 'execute_plan',
    jsonb_build_object('planId', v_plan ->> 'planId', 'expectedPlanHash', v_plan ->> 'planHash'),
    'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-execute', repeat('5', 64)
  );
  if v_run ->> 'status' <> 'executed' or v_run ->> 'published' <> 'true' then
    raise exception 'EV2_G14_ATOMIC_EXECUTION_FAILED';
  end if;

  perform public.cms_execute_ai_transaction_command(
    v_reviewer, 'approve_compensation',
    jsonb_build_object('runId', v_run ->> 'runId', 'expectedPlanHash', v_plan ->> 'planHash',
      'rationale', 'Compensação sintética conferida'),
    'staging', 'main', 'aal2', 'g14-rehearsal-reviewer', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-compensation-approval', repeat('6', 64)
  );
  update public.cms_ai_execution_approvals
  set created_at = now() - interval '10 minutes',
      expires_at = now() - interval '1 second'
  where plan_id = (v_plan ->> 'planId')::uuid and purpose = 'compensate' and status = 'active';
  perform public.cms_execute_ai_transaction_command(
    v_reviewer, 'approve_compensation',
    jsonb_build_object('runId', v_run ->> 'runId', 'expectedPlanHash', v_plan ->> 'planHash',
      'rationale', 'Compensação sintética renovada após expiração'),
    'staging', 'main', 'aal2', 'g14-rehearsal-reviewer', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-compensation-renewal', repeat('8', 64)
  );
  if (select count(*) from public.cms_ai_execution_approvals
      where plan_id = (v_plan ->> 'planId')::uuid and purpose = 'compensate') <> 2
     or (select count(*) from public.cms_ai_execution_approvals
         where plan_id = (v_plan ->> 'planId')::uuid and purpose = 'compensate' and status = 'expired') <> 1
     or (select count(*) from public.cms_ai_execution_approvals
         where plan_id = (v_plan ->> 'planId')::uuid and purpose = 'compensate' and status = 'active') <> 1 then
    raise exception 'EV2_G14_COMPENSATION_RENEWAL_FAILED';
  end if;
  v_result := public.cms_execute_ai_transaction_command(
    v_operator, 'compensate_run',
    jsonb_build_object('runId', v_run ->> 'runId', 'expectedPlanHash', v_plan ->> 'planHash'),
    'staging', 'main', 'aal2', 'g14-rehearsal-operator', now() - interval '1 minute',
    gen_random_uuid(), gen_random_uuid(), 'g14-rehearsal-compensate', repeat('7', 64)
  );
  if v_result ->> 'status' <> 'compensated'
     or (select lifecycle from public.cms_ai_synthetic_targets where target_ref = 'g14x-rehearsal-target') <> 'draft'
     or (select version from public.cms_ai_synthetic_targets where target_ref = 'g14x-rehearsal-target') <> 5 then
    raise exception 'EV2_G14_COMPENSATION_REHEARSAL_FAILED';
  end if;
end;
$$;

rollback;
`;

try {
  const before = queryFile(beforeFile, stateSql)[0]?.state;
  if (before?.toolsExists || before?.capabilityExists || before?.commandExists)
    throw new Error("Rehearsal recusado: a migration 0054 já está aplicada no staging.");
  if (before?.assistDefault !== false || before?.executeDefault !== false)
    throw new Error("Rehearsal recusado: as flags-base não estão default-off.");

  queryFile(rehearsalFile, rehearsalSql);
  const after = queryFile(afterFile, stateSql)[0]?.state;
  const rolledBack = JSON.stringify(before) === JSON.stringify(after);
  if (!rolledBack) throw new Error(`Rollback não comprovado: ${JSON.stringify({ before, after })}`);

  console.log(
    JSON.stringify(
      {
        outcome: "G14_MIGRATION_REHEARSAL_PASS",
        target: TARGET,
        migration: migrationPath,
        rolledBack,
        twoPersonApproval: true,
        atomicExecution: true,
        renewableCompensation: true,
        monotonicCompensation: true,
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
