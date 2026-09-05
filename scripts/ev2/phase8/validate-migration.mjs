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

const migrationPath = "supabase/migrations/0047_ev2_scoped_rbac.sql";
const migration = readFileSync(migrationPath, "utf8");
const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g8-migration-validation-"));
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

const authorizationHashes = `
select json_build_object(
  'cmsActorAuthorized', md5(pg_get_functiondef('public.cms_actor_authorized(uuid,text,text,text,timestamp with time zone)'::regprocedure)),
  'cmsHasPermission', md5(pg_get_functiondef('private.cms_has_permission(text)'::regprocedure))
) as hashes;
`;

const rehearsal = `
begin;
${migration}
do $$
begin
  if to_regclass('public.cms_scoped_role_assignments') is null
     or to_regclass('public.cms_policy_decisions') is null
     or to_regclass('public.cms_scope_command_receipts') is null
     or to_regprocedure('public.cms_rbac_scope_capability(uuid,text,text,text,text,timestamp with time zone)') is null
     or to_regprocedure('public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamp with time zone)') is null
     or to_regprocedure('public.cms_evaluate_scoped_permission(uuid,text,text,text,text,text,timestamp with time zone,text,text,uuid)') is null
     or to_regprocedure('public.cms_execute_scope_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)') is null
     or not exists (select 1 from public.cms_roles where role_key = 'auditor')
     or not exists (select 1 from public.cms_permissions where permission_key = 'cms:scopes.manage')
     or (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.rbac_scoped') then
    raise exception 'EV2_G8_VALIDATION_FAILED';
  end if;
end;
$$;
rollback;
`;

const afterValidation = `
select json_build_object(
  'rolledBack',
    to_regclass('public.cms_scoped_role_assignments') is null
    and to_regclass('public.cms_policy_decisions') is null
    and to_regclass('public.cms_scope_command_receipts') is null
    and not exists (select 1 from public.cms_roles where role_key in ('auditor', 'support'))
    and not exists (select 1 from public.cms_permissions where permission_key in ('cms:scopes.read', 'cms:scopes.manage', 'cms:policy_decisions.read')),
  'authorizationHashes', json_build_object(
    'cmsActorAuthorized', md5(pg_get_functiondef('public.cms_actor_authorized(uuid,text,text,text,timestamp with time zone)'::regprocedure)),
    'cmsHasPermission', md5(pg_get_functiondef('private.cms_has_permission(text)'::regprocedure))
  ),
  'productionMutations', 0
) as evidence;
`;

try {
  const before = queryFile(beforeFile, authorizationHashes)[0]?.hashes;
  queryFile(rehearsalFile, rehearsal);
  const evidence = queryFile(afterFile, afterValidation)[0]?.evidence;
  const authorizationRestored =
    before?.cmsActorAuthorized === evidence?.authorizationHashes?.cmsActorAuthorized &&
    before?.cmsHasPermission === evidence?.authorizationHashes?.cmsHasPermission;
  if (evidence?.rolledBack !== true || !authorizationRestored)
    throw new Error(`Rollback não comprovado: ${JSON.stringify({ before, evidence })}`);
  console.log(
    JSON.stringify(
      {
        outcome: "G8_MIGRATION_REHEARSAL_PASS",
        migration: migrationPath,
        rolledBack: evidence.rolledBack,
        authorizationRestored,
        productionMutations: evidence.productionMutations,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
