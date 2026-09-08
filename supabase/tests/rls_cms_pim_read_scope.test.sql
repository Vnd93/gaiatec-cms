begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

select has_function(
  'public',
  'cms_actor_scope_context',
  array['uuid', 'text'],
  'PIM actor classification is resolved by a server-side lease function'
);
select has_function(
  'public',
  'cms_pim_get_product_scoped',
  array['uuid', 'uuid', 'text', 'text'],
  'PIM product graphs have an authoritative scoped reader'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_pim_get_product_scoped(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot invoke the scoped graph reader'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_pim_get_product_scoped(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the Edge session boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_pim_get_product_scoped(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'the trusted Edge service role may invoke the scoped graph reader'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '67000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pim-scope-corporate@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}', now(), now()
  ),
  (
    '67000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pim-scope-qa-one@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-11111111","candidateSha":"1111111111111111111111111111111111111111","environment":"staging"}',
    now(), now()
  ),
  (
    '67000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pim-scope-qa-two@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-22222222","candidateSha":"2222222222222222222222222222222222222222","environment":"staging"}',
    now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status)
values
  ('67000000-0000-4000-8000-000000000001', 'PIM scope corporate', 'active'),
  ('67000000-0000-4000-8000-000000000002', 'PIM scope QA one', 'active'),
  ('67000000-0000-4000-8000-000000000003', 'PIM scope QA two', 'active');

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, created_by, updated_by,
  created_at, updated_at
) values
  (
    '67000000-0000-4000-8000-000000000101', 'manufacturer',
    'PIM Scope Corporate Manufacturer', 'pim scope corporate manufacturer',
    '67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000102', 'category',
    'PIM Scope Corporate Category', 'pim scope corporate category',
    '67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000201', 'manufacturer',
    'PIM Scope QA One Manufacturer', 'pim scope qa one manufacturer',
    '67000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000202', 'category',
    'PIM Scope QA One Category', 'pim scope qa one category',
    '67000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000301', 'manufacturer',
    'PIM Scope QA Two Manufacturer', 'pim scope qa two manufacturer',
    '67000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000302', 'category',
    'PIM Scope QA Two Category', 'pim scope qa two category',
    '67000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

select throws_ok(
  $$
    insert into public.cms_pim_products (
      id, name, normalized_name, slug, manufacturer_id, category_id,
      status, source_type, created_by, updated_by
    ) values (
      '67000000-0000-4000-8000-000000000499',
      'PIM forbidden runtime write', 'pim forbidden runtime write',
      'pim-forbidden-runtime-write',
      '67000000-0000-4000-8000-000000000101',
      '67000000-0000-4000-8000-000000000102',
      'draft', 'manual',
      '67000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'CMS_PIM_LEGACY_READ_ONLY',
  'legacy graph writes fail closed outside the migration-owner test harness'
);

-- Test-only fixture mode. Migration 0078 accepts it solely when
-- session_user=current_user (the database owner); no runtime role can set a
-- granted RPC path that reaches this branch.
select set_config('cms.pim_consolidating', '0078', true);

insert into public.cms_pim_products (
  id, name, normalized_name, slug, manufacturer_id, category_id,
  status, source_type, created_by, updated_by, created_at, updated_at
) values
  (
    '67000000-0000-4000-8000-000000000401',
    'PIM Scope Corporate Product', 'pim scope corporate product', 'pim-scope-corporate-product',
    '67000000-0000-4000-8000-000000000101', '67000000-0000-4000-8000-000000000102',
    'draft', 'manual',
    '67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000402',
    'PIM Scope QA One Product', 'pim scope qa one product', 'pim-scope-qa-one-product',
    '67000000-0000-4000-8000-000000000201', '67000000-0000-4000-8000-000000000202',
    'draft', 'manual',
    '67000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000403',
    'PIM Scope QA Two Product', 'pim scope qa two product', 'pim-scope-qa-two-product',
    '67000000-0000-4000-8000-000000000301', '67000000-0000-4000-8000-000000000302',
    'draft', 'manual',
    '67000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_pim_provenance (
  id, product_id, source_kind, source_ref, confidence, rights_confirmed,
  verified_at, created_by, updated_by, created_at, updated_at
) values
  (
    '67000000-0000-4000-8000-000000000501',
    '67000000-0000-4000-8000-000000000401', 'owner_authored',
    'Corporate governed source', 1, true, now(),
    '67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000502',
    '67000000-0000-4000-8000-000000000402', 'owner_authored',
    'QA-CMS-FINAL-20260907-11111111', 1, true, now(),
    '67000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '67000000-0000-4000-8000-000000000503',
    '67000000-0000-4000-8000-000000000403', 'owner_authored',
    'QA-CMS-FINAL-20260907-22222222', 1, true, now(),
    '67000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

select is(
  public.cms_actor_scope_context(
    '67000000-0000-4000-8000-000000000001', 'staging'
  ) ->> 'isQaActor',
  'false',
  'an actor without a lease is classified as corporate'
);
select is(
  public.cms_actor_scope_context(
    '67000000-0000-4000-8000-000000000002', 'staging'
  ) ->> 'isQaActor',
  'true',
  'lease existence classifies the QA actor server-side'
);
select is(
  public.cms_actor_scope_context(
    '67000000-0000-4000-8000-000000000002', 'staging'
  ) ->> 'active',
  'true',
  'the exact current-environment QA lease is active'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000401', 'staging', 'main'
  ),
  true,
  'a corporate actor can read a wholly corporate product graph'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ),
  false,
  'a corporate actor never reads a product owned by an ever-QA actor'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ),
  true,
  'an active QA actor can read its exact same-run synthetic product'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000401', 'staging', 'main'
  ),
  false,
  'a QA actor cannot read a corporate product by UUID'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000403', 'staging', 'main'
  ),
  false,
  'a QA actor cannot read another QA run by UUID'
);
select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000402', 'production', 'main'
  ),
  false,
  'a staging QA lease cannot be replayed in production'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_pim_list_products_scoped(
      '67000000-0000-4000-8000-000000000001', 'staging', 'main', '', true, 500
    )
  ),
  array['67000000-0000-4000-8000-000000000401'::uuid]::text,
  'corporate listing excludes every synthetic QA product'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_pim_list_products_scoped(
      '67000000-0000-4000-8000-000000000002', 'staging', 'main', '', true, 500
    )
  ),
  array['67000000-0000-4000-8000-000000000402'::uuid]::text,
  'QA listing contains only the exact same-run product'
);
select is(
  public.cms_pim_get_product_scoped(
    '67000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000401', 'staging', 'main'
  ) ->> 'id',
  '67000000-0000-4000-8000-000000000401',
  'corporate get returns its permitted graph'
);
select is(
  public.cms_pim_get_product_scoped(
    '67000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ),
  null,
  'corporate get makes a QA UUID indistinguishable from missing'
);
select is(
  public.cms_pim_get_product_scoped(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ) ->> 'id',
  '67000000-0000-4000-8000-000000000402',
  'QA get returns its exact same-run graph'
);
select is(
  public.cms_pim_get_product_scoped(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000401', 'staging', 'main'
  ),
  null,
  'QA get makes a corporate UUID indistinguishable from missing'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_pim_master_entities_scoped(
      '67000000-0000-4000-8000-000000000001', 'staging', 'main',
      array[
        '67000000-0000-4000-8000-000000000101'::uuid,
        '67000000-0000-4000-8000-000000000201'::uuid
      ]
    )
  ),
  array['67000000-0000-4000-8000-000000000101'::uuid]::text,
  'corporate auxiliary master-data reads exclude QA entities'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_pim_master_entities_scoped(
      '67000000-0000-4000-8000-000000000002', 'staging', 'main',
      array[
        '67000000-0000-4000-8000-000000000101'::uuid,
        '67000000-0000-4000-8000-000000000201'::uuid,
        '67000000-0000-4000-8000-000000000301'::uuid
      ]
    )
  ),
  array['67000000-0000-4000-8000-000000000201'::uuid]::text,
  'QA auxiliary master-data reads are restricted to the same lease actor and run'
);
select is(
  private.cms_actor_row_scope_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000002',
    (
      select lease.created_at - interval '1 second'
      from private.cms_qa_actor_leases lease
      where lease.actor_id = '67000000-0000-4000-8000-000000000002'
    ),
    'staging'
  ),
  false,
  'QA cannot adopt data created before its current lease run'
);

select set_config('cms.qa_compensating', 'on', true);
insert into public.cms_pim_models (
  id, product_id, manufacturer_id, name, normalized_name, mpn,
  status, is_primary, position, created_by, updated_by, created_at, updated_at
) values (
  '67000000-0000-4000-8000-000000000601',
  '67000000-0000-4000-8000-000000000402',
  '67000000-0000-4000-8000-000000000201',
  'Cross-run model', 'cross run model', 'CROSS-RUN',
  'active', true, 0,
  '67000000-0000-4000-8000-000000000003',
  '67000000-0000-4000-8000-000000000003',
  clock_timestamp(), clock_timestamp()
);
select set_config('cms.qa_compensating', 'off', true);
select set_config('cms.pim_consolidating', 'off', true);

select is(
  public.cms_pim_product_read_allowed(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ),
  false,
  'one cross-run child hides the entire product graph'
);
select is(
  public.cms_pim_get_product_scoped(
    '67000000-0000-4000-8000-000000000002',
    '67000000-0000-4000-8000-000000000402', 'staging', 'main'
  ),
  null,
  'scoped get cannot leak a mixed graph after an IDOR attempt'
);
select is(
  (
    select count(*)::integer
    from public.cms_pim_list_products_scoped(
      '67000000-0000-4000-8000-000000000002', 'staging', 'main', '', true, 500
    )
  ),
  0,
  'scoped listing also excludes a mixed graph'
);

select * from finish();
rollback;
