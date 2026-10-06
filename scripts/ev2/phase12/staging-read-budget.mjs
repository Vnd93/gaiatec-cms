// 2026-10-06 explicit approval: read p95 <= 2s in staging only.
// Production/local, sampling and every independent security gate stay unchanged.
export const STAGING_ADMIN_READ_P95_MS = 2000;
export const DEFAULT_ADMIN_READ_P95_MS = 500;

export function adminReadP95Budget(environment) {
  return environment === "staging" ? STAGING_ADMIN_READ_P95_MS : DEFAULT_ADMIN_READ_P95_MS;
}

export const STAGING_READ_BUDGET_SOURCES = Object.freeze([
  Object.freeze([
    "public.cms_system_capability_unscoped_0076(uuid,text,text,text,text,timestamptz)",
    "c7f2b54924d42eee69f1275323f980170d266cc9609d8e8669ae67d4ae3a70c0",
  ]),
  Object.freeze([
    "public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)",
    "dee24278b56cacaa1c72febbf12bcc9fb23e381b37a052620f1b8964996942cb",
  ]),
]);

export function stagingReadBudgetSemanticSql(alias) {
  if (typeof alias !== "string" || !/^[a-z][a-z0-9_]*$/.test(alias))
    throw new Error("CMS_STAGING_READ_BUDGET_ALIAS_INVALID");
  const rows = STAGING_READ_BUDGET_SOURCES.map(([signature, digest]) => `('${signature}', '${digest}')`).join(
    ",",
  );
  return `not exists (
    select 1 from (values ${rows}) as expected(signature, digest)
    left join pg_catalog.pg_proc p on p.oid = to_regprocedure(expected.signature)
    where p.oid is null or encode(extensions.digest(p.prosrc, 'sha256'), 'hex') <> expected.digest
      or p.prosecdef is not true
      or p.proconfig is distinct from array['search_path=public, private, pg_temp']::text[]
      or exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
                 where acl.grantee <> p.proowner)
  ) as ${alias}`;
}
