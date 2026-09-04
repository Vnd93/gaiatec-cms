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
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
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

const migrationPath = "supabase/migrations/0052_ev2_system_assurance_rate_limit_fusion.sql";
const migration = readFileSync(migrationPath, "utf8");
const workspaceRoot = path.resolve(process.cwd());
const directory = mkdtempSync(path.join(workspaceRoot, ".ev2-g11-rate-limit-validation-"));
const beforeFile = path.join(directory, "before.sql");
const rehearsalFile = path.join(directory, "rehearsal.sql");
const afterFile = path.join(directory, "after.sql");

function queryFile(file, sql) {
  writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  return rowsFrom(runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]));
}

const procedures = [
  "public.cms_system_capability_limited(uuid,text,text,text,text,timestamp with time zone,text)",
  "public.cms_get_system_snapshot_limited(uuid,text,text,text,text,timestamp with time zone,uuid,text)",
  "public.cms_retry_lead_delivery_limited(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)",
  "public.cms_execute_system_command_limited(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,uuid,text,text)",
];
const stateSql = `select json_build_object(
  'wrapperCount', (select count(*) from unnest(array[${procedures.map((value) => `'${value}'`).join(",")}]) signature where to_regprocedure(signature) is not null),
  'rateRows', (select count(*) from public.request_rate_limits where key_hash in (repeat('a', 64), repeat('e', 64), repeat('f', 64)))
) as state;`;

const rehearsalSql = `begin;
${migration}
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51200000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g11.rate-limit@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51200000-0000-4000-8000-000000000101', 'Rate limit G11',
  'g11.rate-limit@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51200000-0000-4000-8000-000000000101', 'super_admin');
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, starts_at, expires_at, created_by
) values (
  'ev2.system_assurance', 'staging', 'user', '51200000-0000-4000-8000-000000000101', true,
  'Ensaio transacional do rate limit G11', now() - interval '1 minute', now() + interval '29 minutes',
  '51200000-0000-4000-8000-000000000101'
);
do $validation$
declare
  v_rate_limited boolean := false;
  v_invalid_rejected boolean := false;
begin
  if exists (
    select 1 from unnest(array[${procedures.map((value) => `'${value}'`).join(",")}]) signature
    where to_regprocedure(signature) is null
  ) then
    raise exception 'EV2_G11_RATE_LIMIT_WRAPPER_MISSING';
  end if;
  if exists (
    select 1 from unnest(array[${procedures.map((value) => `'${value}'`).join(",")}]) signature
    where has_function_privilege('authenticated', signature, 'EXECUTE')
  ) then
    raise exception 'EV2_G11_RATE_LIMIT_WRAPPER_EXPOSED';
  end if;
  if (public.cms_system_capability_limited(
    '51200000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
    'g11-rate-limit-session', now() - interval '1 minute', repeat('a', 64)
  ) ->> 'enabled')::boolean is not true then
    raise exception 'EV2_G11_RATE_LIMIT_CAPABILITY_FAILED';
  end if;
  if public.cms_get_system_snapshot_limited(
    '51200000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
    'g11-rate-limit-session', now() - interval '1 minute', gen_random_uuid(), repeat('e', 64)
  ) ->> 'gateDecision' <> 'non_authoritative' then
    raise exception 'EV2_G11_RATE_LIMIT_SNAPSHOT_FAILED';
  end if;
  begin
    perform public.cms_system_capability_limited(
      '51200000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
      'g11-rate-limit-session', now() - interval '1 minute', 'invalid'
    );
  exception when sqlstate '22023' then
    v_invalid_rejected := true;
  end;
  insert into public.request_rate_limits (key_hash, action, window_started_at, request_count)
  values (repeat('f', 64), 'cms_system_capability', now(), 120)
  on conflict (key_hash, action) do update
  set window_started_at = excluded.window_started_at, request_count = excluded.request_count;
  begin
    perform public.cms_system_capability_limited(
      '51200000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
      'g11-rate-limit-session', now() - interval '1 minute', repeat('f', 64)
    );
  exception when sqlstate 'PT429' then
    v_rate_limited := true;
  end;
  if not v_invalid_rejected or not v_rate_limited then
    raise exception 'EV2_G11_RATE_LIMIT_FAIL_CLOSED_VALIDATION_FAILED';
  end if;
end;
$validation$;
rollback;`;

try {
  const before = queryFile(beforeFile, stateSql)[0]?.state;
  queryFile(rehearsalFile, rehearsalSql);
  const after = queryFile(afterFile, stateSql)[0]?.state;
  const rolledBack = JSON.stringify(before) === JSON.stringify(after);
  if (!rolledBack) throw new Error("Rollback não comprovado: " + JSON.stringify({ before, after }));
  console.log(
    JSON.stringify(
      {
        outcome: "G11_RATE_LIMIT_FUSION_REHEARSAL_PASS",
        migration: migrationPath,
        wrappers: procedures.length,
        rateLimitFailClosed: true,
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
    path.basename(resolvedDirectory).startsWith(".ev2-g11-rate-limit-validation-");
  if (!safeDirectory) {
    console.error("Diretório temporário de rehearsal fora do workspace autorizado.");
    process.exitCode = 1;
  } else {
    rmSync(directory, { recursive: true, force: true });
  }
}
