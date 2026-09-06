import { managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (process.env.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_PROJECT_REF || !token)
  throw new Error("G12_PRODUCTION_DATABASE_VERIFICATION_BLOCKED");

const [result] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
  method: "POST",
  token,
  body: {
    query: `select
      (select count(*) = 54 from supabase_migrations.schema_migrations where version between '0001' and '0054') as migration_count_ok,
      (select max(version) = '0054' from supabase_migrations.schema_migrations) as latest_migration_ok,
      (select count(*) > 0 from pg_catalog.pg_tables where schemaname = 'public') as public_schema_populated,
      not exists(
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      ) as all_public_tables_rls,
      exists(select 1 from cron.job where jobname = 'cms-outbox-worker-every-5m' and active) as outbox_cron_active,
      exists(select 1 from vault.secrets where name = 'cms_outbox_worker_url') as worker_url_present,
      exists(select 1 from vault.secrets where name = 'cms_outbox_worker_secret') as worker_secret_present`,
  },
});

const checks = [
  "migration_count_ok",
  "latest_migration_ok",
  "public_schema_populated",
  "all_public_tables_rls",
  "outbox_cron_active",
  "worker_url_present",
  "worker_secret_present",
];
const failed = checks.filter((name) => result?.[name] !== true);
if (failed.length) throw new Error(`G12_PRODUCTION_DATABASE_VERIFICATION_FAILED:${failed.join(",")}`);

console.log(JSON.stringify({ event: "g12.production.database.verified", checks: checks.length }));
