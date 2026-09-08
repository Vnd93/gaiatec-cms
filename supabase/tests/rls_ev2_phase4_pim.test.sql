-- Current executable contract: the mutating EV2.4 backend was superseded by
-- the canonical cms-content consolidation in migration 0078.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

select has_table(
  'public',
  'cms_pim_products',
  'the legacy PIM tables remain available for governed compatibility reads'
);
select is(
  obj_description(
    'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
    'pg_proc'
  ),
  'Read-only tombstone for legacy PIM mutations; use cms-content.',
  'the legacy command is explicitly documented as a read-only tombstone'
);
select isnt(
  has_table_privilege('service_role', 'public.cms_pim_products', 'INSERT'),
  true,
  'the service role cannot insert legacy products directly'
);
select isnt(
  has_table_privilege('service_role', 'public.cms_pim_products', 'UPDATE'),
  true,
  'the service role cannot update legacy products directly'
);
select isnt(
  has_table_privilege('service_role', 'public.cms_pim_products', 'DELETE'),
  true,
  'the service role cannot delete legacy products directly'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot invoke the legacy command directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'the Edge service role reaches the explicit compatibility tombstone'
);

select throws_ok(
  $$
    select public.cms_execute_pim_command(
      gen_random_uuid(), 'save_product', '{}'::jsonb, 'local', 'main',
      'aal2', 'historical-pim-test', now(), gen_random_uuid(),
      gen_random_uuid(), repeat('a', 64), gen_random_uuid()
    )
  $$,
  '55000',
  'CMS_PIM_LEGACY_READ_ONLY',
  'save_product is blocked by the authoritative legacy tombstone'
);
select throws_ok(
  $$
    select public.cms_execute_pim_command(
      gen_random_uuid(), 'generate_sku', '{}'::jsonb, 'local', 'main',
      'aal2', 'historical-pim-test', now(), gen_random_uuid(),
      gen_random_uuid(), repeat('b', 64), gen_random_uuid()
    )
  $$,
  '55000',
  'CMS_PIM_LEGACY_READ_ONLY',
  'generate_sku is blocked by the authoritative legacy tombstone'
);
select throws_ok(
  $$
    select public.cms_execute_pim_command(
      gen_random_uuid(), 'archive_product', '{}'::jsonb, 'local', 'main',
      'aal2', 'historical-pim-test', now(), gen_random_uuid(),
      gen_random_uuid(), repeat('c', 64), gen_random_uuid()
    )
  $$,
  '55000',
  'CMS_PIM_LEGACY_READ_ONLY',
  'archive_product is blocked by the authoritative legacy tombstone'
);
select throws_ok(
  $$
    select public.cms_execute_pim_command(
      gen_random_uuid(), 'delete_product', '{}'::jsonb, 'local', 'main',
      'aal2', 'historical-pim-test', now(), gen_random_uuid(),
      gen_random_uuid(), repeat('d', 64), gen_random_uuid()
    )
  $$,
  '22023',
  'CMS_PIM_COMMAND_INVALID',
  'unknown legacy actions remain fail-closed'
);

select has_function(
  'public',
  'cms_get_pim_reconciliation_plan',
  array['uuid','uuid','uuid','text','text','text','text','timestamptz','uuid'],
  'operators have a scoped server-derived reconciliation plan'
);
select has_function(
  'public',
  'cms_reconcile_legacy_pim_product',
  array[
    'uuid','uuid','uuid','bigint','bigint','text','text','text','text','text',
    'text','text','timestamptz','uuid','uuid','text','uuid'
  ],
  'legacy retirement uses the governed CAS reconciliation command'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the reconciliation Edge boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'the Edge service role can invoke the governed reconciliation command'
);
select has_trigger(
  'public',
  'cms_published_projection',
  'cms_pim_active_skus_before_publication',
  'the stable publication trigger validates canonical product data'
);
select has_trigger(
  'public',
  'cms_published_projection',
  'cms_claim_product_identifiers_0078',
  'canonical identifiers are claimed atomically at publication'
);
select has_table(
  'public',
  'cms_product_canonical_sku_registry',
  'canonical publication preserves cross-product SKU uniqueness'
);
select has_table(
  'public',
  'cms_product_canonical_identifier_registry',
  'canonical publication preserves cross-product external identifier uniqueness'
);
select isnt(
  has_function_privilege(
    'service_role',
    'public.cms_pim_legacy_graph_read_only_0078()',
    'EXECUTE'
  ),
  true,
  'the internal row trigger cannot be invoked as a runtime bypass'
);

select * from finish();
rollback;
