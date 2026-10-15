import { ownerOnlyFunctionContractSql } from "./migration-manifest-lib.mjs";

export const CATALOG_RECOVERY_OWNER_ONLY_FUNCTIONS = Object.freeze([
  "private.cms_catalog_prepare_qa_recovery(text,text,text,uuid,text,text,uuid[])",
  "private.cms_catalog_qa_manifest_for_actor(uuid)",
  "private.cms_catalog_recovery_actor(text,uuid)",
  "private.cms_catalog_qa_mutation_guard()",
  "private.cms_catalog_qa_override_guard()",
  "private.cms_catalog_compensate_qa_recovery(uuid)",
  "private.cms_catalog_qa_terminal_recovery()",
]);

export function catalogRecoveryPreflightSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("G12_CATALOG_RECOVERY_ALIAS_REFUSED");
  const authority = "private.cms_catalog_recovery_actor(text,uuid)";
  const manifest = "private.cms_catalog_qa_manifest_for_actor(uuid)";
  const terminal = "private.cms_catalog_qa_terminal_recovery()";
  const normalized = (signature) =>
    `regexp_replace(lower(pg_get_functiondef(to_regprocedure('${signature}'))), '[[:space:]]+', '', 'g')`;
  const acl = ownerOnlyFunctionContractSql(
    "catalog_recovery_internal_acl",
    CATALOG_RECOVERY_OWNER_ONLY_FUNCTIONS,
  );
  return `coalesce((select catalog_recovery_internal_acl from (select ${acl}) acl)
    and not exists(select 1 from (values
      ('private.cms_catalog_qa_recovery'),('private.cms_catalog_qa_recovery_actors'),
      ('private.cms_catalog_qa_owned_entities')) required(name)
      where to_regclass(required.name) is null
        or not coalesce((select relrowsecurity from pg_catalog.pg_class where oid=to_regclass(required.name)),false)
        or exists(select 1 from (values ('anon'),('authenticated'),('service_role')) client(role)
          where has_table_privilege(client.role,to_regclass(required.name),'SELECT,INSERT,UPDATE,DELETE')))
    and ${normalized(authority)} like '%m.compensation_pid=pg_catalog.pg_backend_pid()%'
    and ${normalized(authority)} like '%m.state=''compensating''%'
    and ${normalized(authority)} like '%m.environment=''staging''%'
    and ${normalized(manifest)} like '%m.prepared_xid<>pg_catalog.pg_current_xact_id()%'
    and exists(select 1 from pg_catalog.pg_index i
      where i.indexrelid=to_regclass('private.cms_catalog_qa_recovery_open_cycle_uidx')
        and i.indrelid='private.cms_catalog_qa_recovery'::regclass
        and i.indisunique and i.indisvalid and i.indisready and i.indnkeyatts=3
        and pg_get_indexdef(i.indexrelid,1,true)='run_tag'
        and pg_get_indexdef(i.indexrelid,2,true)='candidate_sha'
        and pg_get_indexdef(i.indexrelid,3,true)='environment'
        and regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[()[:space:]]+','','g')='state<>''cleaned''::text')
    and exists(select 1 from pg_catalog.pg_index i
      where i.indexrelid=to_regclass('private.cms_catalog_qa_recovery_actor_once_uidx')
        and i.indrelid='private.cms_catalog_qa_recovery_actors'::regclass
        and i.indisunique and i.indisvalid and i.indisready and i.indnkeyatts=1
        and i.indpred is null and pg_get_indexdef(i.indexrelid,1,true)='actor_id')
    and ${normalized(terminal)} like '%a.actor_id=old.actor_id%'
    and ${normalized(terminal)} like '%a.lease_created_at=old.created_at%'
    and ${normalized(terminal)} like '%a.lease_expires_at=old.expires_at%'
    and ${normalized(terminal)} like '%m.state=''prepared''%'
    and ${normalized(terminal)} like '%cms_catalog_recovery_terminal_binding_mismatch%'
    and (select count(*)=6 from pg_catalog.pg_trigger t
      where t.tgname='catalog_qa_recovery_fence' and t.tgtype=23 and t.tgenabled='O' and not t.tgisinternal
        and t.tgfoid=to_regprocedure('private.cms_catalog_qa_mutation_guard()')
        and t.tgrelid in ('public.cms_catalog_products'::regclass,'public.cms_catalog_taxonomy_terms'::regclass,
          'public.cms_catalog_product_relation_revisions'::regclass,'public.cms_catalog_product_hierarchy_revisions'::regclass,
          'public.cms_catalog_product_terms'::regclass,'public.cms_catalog_editorial_revisions'::regclass))
    and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='private.cms_qa_actor_leases'::regclass
      and t.tgname='zzy_catalog_durable_terminal_recovery' and t.tgtype=19 and t.tgenabled='O' and not t.tgisinternal
      and t.tgfoid=to_regprocedure('private.cms_catalog_qa_terminal_recovery()'))
    and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.cms_feature_flag_overrides'::regclass
      and t.tgname='catalog_qa_override_recovery_fence' and t.tgtype=23 and t.tgenabled='O' and not t.tgisinternal
      and t.tgfoid=to_regprocedure('private.cms_catalog_qa_override_guard()')),
    false) as ${alias}`;
}
