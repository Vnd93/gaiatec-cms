begin;

select plan(37);

select has_table('public', 'cms_catalog_product_snapshots', 'published snapshot table exists');
select has_table('public', 'cms_catalog_publication_outbox', 'publication outbox table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_product_snapshots'::regclass),
  'published snapshots have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_publication_outbox'::regclass),
  'publication outbox has RLS enabled'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.catalog_v1'),
  false,
  'publication remains disabled by default'
);
select is(
  (select count(*)::integer from public.cms_catalog_product_snapshots),
  0,
  'fatia 2 migration does not load snapshots'
);
select is(
  (select count(*)::integer from public.cms_catalog_publication_outbox),
  0,
  'fatia 2 migration does not load outbox events'
);

select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'cms_catalog_product_snapshots'
     and column_name in ('sku', 'price', 'stock', 'inventory', 'availability')),
  0,
  'published snapshots have no commercial or SKU columns'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_products_publication_state_check'),
  'product publication state constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_revisions_publication_state_check'),
  'revision publication state constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_publication_outbox_event_type_check'),
  'outbox event type constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_publication_outbox_status_check'),
  'outbox processing state constraint exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_products_publication_guard'),
  'publication transition guard exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_products_z_publication_record'),
  'publication projection trigger exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_snapshot_internal_guard'),
  'snapshot history guard exists'
);
select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_submit_product'),
  'submit-to-ready function exists'
);
select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_publish_product'),
  'publish function exists'
);
select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_unpublish_product'),
  'unpublish function exists'
);
select ok(
  (select prosecdef = false from pg_proc where proname = 'cms_catalog_publish_product'),
  'publish function is security invoker'
);
select ok(
  (select prosecdef = false from pg_proc where proname = 'cms_catalog_unpublish_product'),
  'unpublish function is security invoker'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cms_catalog_product_snapshots'
      and policyname = 'cms_catalog_product_snapshots_public_read'
      and roles = array['anon']::name[]
  ),
  'anonymous readers only see current snapshots through RLS'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('cms_catalog_product_snapshots', 'cms_catalog_publication_outbox')
      and cmd = 'DELETE'
  ),
  'publication tables expose no delete policy'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cms_catalog_publish_product(uuid,bigint)',
    'EXECUTE'
  ),
  'authenticated can call the guarded publish contract'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cms_catalog_publish_product(uuid,bigint)',
    'EXECUTE'
  ),
  'anonymous cannot publish'
);
select ok(
  (select position('CMS_CATALOG_FEATURE_DISABLED' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_publish_product'),
  'publish is fail-closed while the feature flag is off'
);
select ok(
  (select position('CMS_CATALOG_PRIMARY_TERM_REQUIRED' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_publish_product'),
  'publish requires exactly one active primary term'
);
select ok(
  (select position('publication_state = ''draft''' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_update_product'),
  'editing a product creates a new draft'
);
select ok(
  (select position('cms.catalog_product_command' in with_check) > 0
   from pg_policies
   where schemaname = 'public'
     and tablename = 'cms_catalog_products'
     and policyname = 'cms_catalog_products_update'),
  'direct product updates require the guarded command context'
);
select ok(
  exists (select 1 from pg_views where schemaname = 'public' and viewname = 'cms_catalog_current_snapshots'),
  'current snapshot view exists'
);
select ok(
  has_column_privilege('anon', 'public.cms_catalog_product_snapshots', 'content', 'SELECT'),
  'anonymous can read only the public snapshot columns'
);
select ok(
  not has_column_privilege('anon', 'public.cms_catalog_product_snapshots', 'published_by', 'SELECT'),
  'anonymous cannot read the publishing actor identifier'
);
select ok(
  not has_table_privilege('anon', 'public.cms_catalog_publication_outbox', 'SELECT'),
  'anonymous cannot read the publication outbox'
);
select ok(
  (select position('security definer' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_record_publication'),
  'projection writer is private security definer'
);
select ok(
  not exists (
    select 1 from pg_proc
    where proname = 'cms_catalog_record_publication'
      and has_function_privilege('public', oid, 'EXECUTE')
  ),
  'projection writer is not executable by public'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_snapshots_product_id_revision_fkey'),
  'snapshot references the immutable product revision'
);
select ok(
  exists (select 1 from pg_index where indexrelid::regclass::text = 'public.cms_catalog_product_snapshots_current_idx'),
  'current snapshot index exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_publication_outbox_product_id_revision_event_type_key'),
  'outbox deduplicates product revision events'
);

select * from finish();
rollback;
