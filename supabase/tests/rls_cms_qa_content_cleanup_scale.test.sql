begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

select ok(
  to_regclass('public.cms_content_items_created_by_workflow_idx') is not null,
  'the QA content owner cleanup index is installed'
);
select ok(
  (select index_row.indisvalid and index_row.indisready
   from pg_catalog.pg_index index_row
   where index_row.indexrelid = 'public.cms_content_items_created_by_workflow_idx'::regclass),
  'the QA content owner cleanup index is valid and ready'
);
select ok(
  (select not index_row.indisunique
          and index_row.indpred is null
          and index_row.indnkeyatts = 2
          and index_row.indnatts = 3
   from pg_catalog.pg_index index_row
   where index_row.indexrelid = 'public.cms_content_items_created_by_workflow_idx'::regclass),
  'the index has two unrestricted keys and one included column'
);
select is(
  pg_catalog.pg_get_indexdef('public.cms_content_items_created_by_workflow_idx'::regclass, 1, false),
  'created_by',
  'created_by is the leading cleanup key'
);
select is(
  pg_catalog.pg_get_indexdef('public.cms_content_items_created_by_workflow_idx'::regclass, 2, false),
  'workflow_status',
  'workflow_status is the second cleanup key'
);
select is(
  pg_catalog.pg_get_indexdef('public.cms_content_items_created_by_workflow_idx'::regclass, 3, false),
  'id',
  'id is included for residue inventories and dependent joins'
);

select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.cms_content_items'::regclass),
  true,
  'content item RLS remains enabled'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'cms_content_items' and cmd = 'SELECT'),
  1,
  'the authoritative content read policy remains the only content policy'
);
select is(
  has_table_privilege('anon', 'public.cms_content_items', 'UPDATE'),
  false,
  'anonymous callers still cannot update content directly'
);
select is(
  has_table_privilege('authenticated', 'public.cms_content_items', 'UPDATE'),
  false,
  'authenticated callers still cannot update content directly'
);
select is(
  has_table_privilege('service_role', 'public.cms_content_items', 'UPDATE'),
  true,
  'the trusted service boundary retains its existing cleanup privilege'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '96000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-cleanup-owner@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-cleanup-other@example.test', '', now(), '{}', '{}', now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status) values
  ('96000000-0000-4000-8000-000000000001', 'QA cleanup owner', 'active'),
  ('96000000-0000-4000-8000-000000000002', 'QA cleanup other', 'active');

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by, archived_at, updated_at
) values
  (
    '96000000-0000-4000-8000-000000000011', 'product', 'qa-cleanup-active', 'draft',
    '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', null,
    '2026-01-01 00:00:00+00'
  ),
  (
    '96000000-0000-4000-8000-000000000012', 'product', 'qa-cleanup-retained', 'archived',
    '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001',
    '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'
  ),
  (
    '96000000-0000-4000-8000-000000000013', 'product', 'qa-cleanup-foreign', 'draft',
    '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000002', null,
    '2026-01-01 00:00:00+00'
  );

create temporary table qa_content_cleanup_counts (
  first_pass integer not null,
  replay_pass integer not null
) on commit drop;

do $cleanup$
declare
  v_first integer;
  v_replay integer;
begin
  update public.cms_content_items item
  set workflow_status = 'archived',
      archived_at = clock_timestamp(),
      scheduled_for = null,
      deleted_at = null,
      deleted_by = null,
      updated_by = '96000000-0000-4000-8000-000000000001'
  where item.created_by = '96000000-0000-4000-8000-000000000001'
    and item.workflow_status <> 'archived';
  get diagnostics v_first = row_count;

  update public.cms_content_items item
  set workflow_status = 'archived',
      archived_at = clock_timestamp(),
      scheduled_for = null,
      deleted_at = null,
      deleted_by = null,
      updated_by = '96000000-0000-4000-8000-000000000001'
  where item.created_by = '96000000-0000-4000-8000-000000000001'
    and item.workflow_status <> 'archived';
  get diagnostics v_replay = row_count;

  insert into qa_content_cleanup_counts values (v_first, v_replay);
end;
$cleanup$;

select is(
  (select first_pass from qa_content_cleanup_counts),
  1,
  'the first cleanup archives only the active row owned by the target actor'
);
select is(
  (select replay_pass from qa_content_cleanup_counts),
  0,
  'replaying the same cleanup is idempotent'
);
select is(
  (select count(*)::integer from public.cms_content_items
   where created_by = '96000000-0000-4000-8000-000000000001'
     and workflow_status <> 'archived'),
  0,
  'the target actor has zero active content residue'
);
select is(
  (select workflow_status from public.cms_content_items
   where id = '96000000-0000-4000-8000-000000000013'),
  'draft',
  'cleanup does not archive content owned by another actor'
);
select is(
  (select archived_at from public.cms_content_items
   where id = '96000000-0000-4000-8000-000000000012'),
  '2026-01-01 00:00:00+00'::timestamptz,
  'cleanup does not rewrite an already archived tombstone'
);
select is(
  (select count(*)::integer from public.cms_content_items
   where created_by = '96000000-0000-4000-8000-000000000002'
     and workflow_status <> 'archived'),
  1,
  'another actor remains independently addressable after cleanup'
);
select is(
  (select count(*)::integer from public.cms_content_items
   where created_by = '96000000-0000-4000-8000-000000000001'),
  2,
  'terminal proof can still inventory both active and retained owner history'
);

select * from finish();
rollback;
