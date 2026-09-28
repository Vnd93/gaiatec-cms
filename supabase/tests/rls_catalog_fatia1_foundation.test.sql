begin;

select plan(26);

select has_table('public', 'cms_catalog_products', 'catalog products table exists');
select has_table('public', 'cms_catalog_product_revisions', 'product revisions table exists');
select has_table('public', 'cms_catalog_taxonomy_terms', 'taxonomy terms table exists');
select has_table('public', 'cms_catalog_taxonomy_revisions', 'taxonomy revisions table exists');
select has_table('public', 'cms_catalog_product_terms', 'product terms table exists');
select has_table('public', 'cms_catalog_audit_events', 'catalog audit table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_products'::regclass),
  'product table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_taxonomy_terms'::regclass),
  'taxonomy table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_product_terms'::regclass),
  'product-term table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_audit_events'::regclass),
  'audit table has RLS enabled'
);

select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'cms_catalog_products'
     and column_name in ('sku', 'price', 'stock', 'inventory', 'availability')),
  0,
  'catalog foundation has no commercial or SKU columns'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.catalog_v1'),
  false,
  'catalog flag remains default-off'
);
select is(
  (select count(*)::integer from public.cms_catalog_products),
  0,
  'foundation migration does not load products'
);
select is(
  (select count(*)::integer from public.cms_catalog_taxonomy_terms),
  0,
  'foundation migration does not load taxonomy'
);

select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_products_slug_check'),
  'product slug constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_taxonomy_terms_term_type_check'),
  'taxonomy term type constraint exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_taxonomy_cycle'),
  'taxonomy cycle guard exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_products_revision_guard'),
  'product revision guard exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_product_terms_kind_guard'),
  'product-term kind guard exists'
);
select ok(
  (select position('CMS_CATALOG_TAXONOMY_PARENT_TYPE_MISMATCH' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_reject_taxonomy_cycle'),
  'taxonomy parent type guard exists'
);

select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_update_product'),
  'optimistic product update function exists'
);
select ok(
  (select prosecdef = false from pg_proc where proname = 'cms_catalog_update_product'),
  'optimistic update is security invoker'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cms_catalog_products'
      and policyname = 'cms_catalog_products_update'
      and cmd = 'UPDATE'
      and with_check is not null
  ),
  'product update policy has a WITH CHECK guard'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in (
        'cms_catalog_products',
        'cms_catalog_product_revisions',
        'cms_catalog_taxonomy_terms',
        'cms_catalog_taxonomy_revisions',
        'cms_catalog_product_terms',
        'cms_catalog_audit_events'
      )
      and cmd = 'DELETE'
  ),
  'catalog foundation exposes no delete policy'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.cms_catalog_update_product(uuid,bigint,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated can call the guarded update contract'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cms_catalog_update_product(uuid,bigint,text,text,jsonb)',
    'EXECUTE'
  ),
  'anon cannot call the update contract'
);

select * from finish();
rollback;
