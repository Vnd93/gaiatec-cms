import { managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";
import {
  CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
  CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
  CMS_MEDIA_UPLOAD_ABORT_0082_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
  CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  exactMigrationHistorySql,
  leadOriginBindingSemanticSql,
  mediaUploadAbortSchemaContractSql,
  ownerOnlyFunctionContractSql,
  publicRelationLimitSemanticSql,
  sessionRefreshRevocationSemanticSql,
  serviceOnlyRpcContractSql,
  sourceMigrationManifest,
} from "./migration-manifest-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const sourceIndex = process.argv.indexOf("--source");
const sourceRoot = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "";
if (process.env.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_PROJECT_REF || !token || !sourceRoot)
  throw new Error("G12_PRODUCTION_DATABASE_VERIFICATION_BLOCKED");
const migrations = sourceMigrationManifest(sourceRoot);
const migrationHistorySql = exactMigrationHistorySql(migrations);

const [result] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
  method: "POST",
  token,
  body: {
    query: `select
      ${migrationHistorySql},
      (select count(*) > 0 from pg_catalog.pg_tables where schemaname = 'public') as public_schema_populated,
      not exists(
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      ) as all_public_tables_rls,
      exists(select 1 from storage.buckets where id = 'cms-documents-private' and public = false) as documents_bucket_private,
      exists(
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'cms_reserve_document_asset'
      ) as document_rpc_present,
      to_regprocedure('public.cms_review_document_security(uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,uuid)') is not null as document_security_review_rpc_present,
      to_regprocedure('public.cms_document_qa_attestation_allowed(uuid,uuid,text)') is not null as document_qa_attestation_gate_present,
      to_regprocedure('public.cms_prepare_synthetic_document_neutralization(uuid,uuid,text,text,text,timestamptz,uuid)') is not null as document_neutralization_prepare_present,
      to_regprocedure('public.cms_confirm_synthetic_document_removal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid)') is not null as document_neutralization_confirm_present,
      to_regprocedure('public.cms_fixture_neutralize_synthetic_document(uuid,uuid,text,text,text,boolean,uuid)') is not null as document_fixture_neutralization_present,
      exists(
        select 1 from pg_catalog.pg_class
        where oid = 'public.cms_document_security_reviews'::regclass and relrowsecurity
      ) as document_security_reviews_rls,
      to_regprocedure('public.cms_legacy_documents_promotion_ready()') is not null as legacy_document_promotion_gate_present,
      public.cms_legacy_documents_promotion_ready() as legacy_documents_reattested_for_promotion,
      to_regprocedure('public.cms_execute_form_lifecycle_command(uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid)') is not null as form_rpc_present,
      to_regprocedure('public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)') is not null as rdo_team_rpc_present,
      to_regprocedure('public.cms_require_pim_active_skus_for_publication()') is not null as pim_guard_present,
      to_regclass('private.cms_qa_actor_leases') is not null as qa_actor_lease_present,
      to_regprocedure('public.cms_qa_actor_lease_status(uuid,text,text,text)') is not null as qa_actor_lease_status_present,
      to_regprocedure('public.cms_complete_qa_actor_lease(uuid,text,text,text)') is not null as qa_actor_lease_completion_present,
      to_regprocedure('private.cms_sweep_expired_qa_actor_leases(integer)') is not null as qa_actor_watchdog_present,
      to_regclass('private.cms_qa_rate_limit_proof_buckets') is not null as qa_rate_limit_proof_buckets_present,
      to_regprocedure('public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)') is not null as qa_rate_limit_proof_rpc_present,
      has_function_privilege('service_role', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
        as qa_rate_limit_proof_privileges_exact,
      to_regprocedure('public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)') is not null
        as collaboration_assignee_directory_present,
      has_function_privilege(
        'service_role',
        'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
        'EXECUTE'
      )
        and not has_function_privilege(
          'authenticated',
          'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'anon',
          'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
          'EXECUTE'
      ) as collaboration_assignee_directory_privileges_exact,
      ${serviceOnlyRpcContractSql("media_upload_abort_0082_rpcs", CMS_MEDIA_UPLOAD_ABORT_0082_RPCS)},
      ${ownerOnlyFunctionContractSql(
        "media_upload_abort_0082_helpers_locked",
        CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
      )},
      ${serviceOnlyRpcContractSql(
        "session_refresh_revocation_0083_rpcs",
        CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
      )},
      ${mediaUploadAbortSchemaContractSql("media_upload_abort_0082_schema")},
      (
        select count(*) = 1
        from cron.job
        where jobname = 'cms-dam-stale-upload-watchdog-v1'
          and schedule = '*/15 * * * *'
          and command = 'select private.cms_watchdog_stale_dam_uploads(100);'
          and active
      ) as media_upload_watchdog_0082_exact,
      ${sessionRefreshRevocationSemanticSql("session_refresh_revocation_0083_semantics_exact")},
      ${ownerOnlyFunctionContractSql(
        "lead_origin_binding_0084_helpers_locked",
        CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
      )},
      ${leadOriginBindingSemanticSql("lead_origin_binding_0084_semantics_exact")},
      ${ownerOnlyFunctionContractSql(
        "public_relation_limit_0085_helpers_locked",
        CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
      )},
      ${publicRelationLimitSemanticSql("public_relation_limit_0085_semantics_exact")},
      not exists (
        select 1
        from public.cms_published_projection projection
        where private.cms_public_relation_count_0085(projection.payload) > 500
      ) as public_relation_limit_0085_existing_rows_valid,
      exists(
        select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'private.cms_qa_actor_leases'::regclass
          and t.tgname = 'cms_05_qa_rate_limit_proof_cleanup_0080'
          and not t.tgisinternal
      ) as qa_rate_limit_proof_cleanup_present,
      exists(
        select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'auth.users'::regclass
          and t.tgname = 'cms_capture_qa_actor_lease'
          and not t.tgisinternal
      ) as qa_actor_auth_trigger_present,
      exists(
        select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'auth.users'::regclass
          and t.tgname = 'cms_protect_active_qa_actor_marker'
          and not t.tgisinternal
      ) as qa_actor_marker_trigger_present,
      exists(
        select 1 from cron.job
        where jobname = 'cms-qa-actor-lease-sweeper-every-1m'
          and schedule = '* * * * *'
          and command = 'select private.cms_sweep_expired_qa_actor_leases(25);'
          and active
      ) as qa_actor_watchdog_cron_active,
      to_regprocedure('private.invoke_outbox_worker()') is not null as outbox_invoker_present,
      (
        select count(*) = 1
        from cron.job
        where jobname = 'cms-outbox-worker-every-5m'
          and schedule = '*/5 * * * *'
          and command = 'select private.invoke_outbox_worker();'
          and active
      ) as outbox_cron_exact,
      (select count(*) = 1 from vault.secrets where name = 'cms_outbox_worker_url') as worker_url_exact,
      (select count(*) = 1 from vault.secrets where name = 'cms_outbox_worker_secret') as worker_secret_exact`,
  },
});

const checks = [
  "migration_history_exact",
  "public_schema_populated",
  "all_public_tables_rls",
  "documents_bucket_private",
  "document_rpc_present",
  "document_security_review_rpc_present",
  "document_qa_attestation_gate_present",
  "document_neutralization_prepare_present",
  "document_neutralization_confirm_present",
  "document_fixture_neutralization_present",
  "document_security_reviews_rls",
  "legacy_document_promotion_gate_present",
  "legacy_documents_reattested_for_promotion",
  "form_rpc_present",
  "rdo_team_rpc_present",
  "pim_guard_present",
  "qa_actor_lease_present",
  "qa_actor_lease_status_present",
  "qa_actor_lease_completion_present",
  "qa_actor_watchdog_present",
  "qa_rate_limit_proof_buckets_present",
  "qa_rate_limit_proof_rpc_present",
  "qa_rate_limit_proof_privileges_exact",
  "collaboration_assignee_directory_present",
  "collaboration_assignee_directory_privileges_exact",
  "media_upload_abort_0082_rpcs_present",
  "media_upload_abort_0082_rpcs_privileges_exact",
  "media_upload_abort_0082_helpers_locked",
  "media_upload_abort_0082_schema_pixel_limit_exact",
  "media_upload_abort_0082_schema_upload_token_expiry_exact",
  "media_upload_abort_0082_schema_upload_token_column_exact",
  "media_upload_watchdog_0082_exact",
  "session_refresh_revocation_0083_rpcs_present",
  "session_refresh_revocation_0083_rpcs_privileges_exact",
  "session_refresh_revocation_0083_semantics_exact",
  "lead_origin_binding_0084_helpers_locked",
  "lead_origin_binding_0084_semantics_exact",
  "public_relation_limit_0085_helpers_locked",
  "public_relation_limit_0085_semantics_exact",
  "public_relation_limit_0085_existing_rows_valid",
  "qa_rate_limit_proof_cleanup_present",
  "qa_actor_auth_trigger_present",
  "qa_actor_marker_trigger_present",
  "qa_actor_watchdog_cron_active",
  "outbox_invoker_present",
  "outbox_cron_exact",
  "worker_url_exact",
  "worker_secret_exact",
];
const failed = checks.filter((name) => result?.[name] !== true);
if (failed.length) throw new Error(`G12_PRODUCTION_DATABASE_VERIFICATION_FAILED:${failed.join(",")}`);

console.log(
  JSON.stringify({
    event: "g12.production.database.verified",
    checks: checks.length,
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1)?.version,
  }),
);
