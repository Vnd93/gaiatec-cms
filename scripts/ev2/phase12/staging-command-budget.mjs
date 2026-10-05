// 2026-10-05 user-approved ceiling; no production/read/security budget changes.
export const STAGING_COMMAND_P95_MS = 2000;
export const DEFAULT_COMMAND_P95_MS = 800;

export function commandP95Budget(environment) {
  return environment === "staging" ? STAGING_COMMAND_P95_MS : DEFAULT_COMMAND_P95_MS;
}

export const STAGING_COMMAND_BUDGET_SOURCES = Object.freeze([
  Object.freeze([
    "public.cms_system_capability_unscoped_0076(uuid,text,text,text,text,timestamptz)",
    "d756d2f3d45ad9cd84b5597a83ae120b5d20912cb494667deaaf1805c98cc5cf",
  ]),
  Object.freeze([
    "public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)",
    "e771baa3f64069ac3ca1759ee83a47f95df85d1f1cce3af3310d5655ef43eff0",
  ]),
]);

export function stagingCommandBudgetSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("CMS_STAGING_COMMAND_BUDGET_ALIAS_INVALID");
  const rows = STAGING_COMMAND_BUDGET_SOURCES.map(
    ([signature, digest]) => `('${signature}', '${digest}')`,
  ).join(",");
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
