begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

select has_function(
  'public',
  'cms_master_list_entities_scoped',
  array['uuid', 'text', 'text', 'text', 'text', 'boolean', 'integer'],
  'master entities have an authoritative scoped list reader'
);
select has_function(
  'public',
  'cms_master_list_rules_scoped',
  array['uuid', 'text'],
  'master relation rules have an actor-aware reader'
);
select has_function(
  'public',
  'cms_master_get_dependencies_scoped',
  array['uuid', 'text', 'text', 'text', 'uuid', 'boolean'],
  'master dependencies have an authoritative scoped reader'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_master_list_entities_scoped(uuid,text,text,text,text,boolean,integer)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot invoke the scoped entity reader'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_master_get_dependencies_scoped(uuid,text,text,text,uuid,boolean)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the Edge dependency boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_master_list_entities_scoped(uuid,text,text,text,text,boolean,integer)',
    'EXECUTE'
  ),
  true,
  'the trusted Edge service role may invoke the scoped entity reader'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '68000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'master-scope-corporate@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}', now(), now()
  ),
  (
    '68000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'master-scope-qa-one@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-33333333","candidateSha":"3333333333333333333333333333333333333333","environment":"staging"}',
    now(), now()
  ),
  (
    '68000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'master-scope-qa-two@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-44444444","candidateSha":"4444444444444444444444444444444444444444","environment":"staging"}',
    now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status)
values
  ('68000000-0000-4000-8000-000000000001', 'Master scope corporate', 'active'),
  ('68000000-0000-4000-8000-000000000002', 'Master scope QA one', 'active'),
  ('68000000-0000-4000-8000-000000000003', 'Master scope QA two', 'active');

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, source_ref,
  created_by, updated_by, created_at, updated_at
) values
  (
    '68000000-0000-4000-8000-000000000101', 'manufacturer',
    'Master Scope Corporate Manufacturer', 'master scope corporate manufacturer', null,
    '68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000102', 'brand',
    'Master Scope Corporate Brand', 'master scope corporate brand', null,
    '68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000201', 'manufacturer',
    'Master Scope QA One Manufacturer', 'master scope qa one manufacturer',
    'QA-CMS-FINAL-20260907-33333333',
    '68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000202', 'brand',
    'Master Scope QA One Brand', 'master scope qa one brand',
    'QA-CMS-FINAL-20260907-33333333',
    '68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000203', 'technology',
    'Master Scope QA One Wrong Marker', 'master scope qa one wrong marker',
    'QA-CMS-FINAL-20260907-44444444',
    '68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000301', 'manufacturer',
    'Master Scope QA Two Manufacturer', 'master scope qa two manufacturer',
    'QA-CMS-FINAL-20260907-44444444',
    '68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000302', 'brand',
    'Master Scope QA Two Brand', 'master scope qa two brand',
    'QA-CMS-FINAL-20260907-44444444',
    '68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_master_entity_aliases (
  id, entity_id, site_key, entity_type, alias, normalized_alias,
  created_by, updated_by, created_at, updated_at
) values
  (
    '68000000-0000-4000-8000-000000000401',
    '68000000-0000-4000-8000-000000000101', 'main', 'manufacturer',
    'Corporate OEM Alias', 'corporate oem alias',
    '68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000402',
    '68000000-0000-4000-8000-000000000201', 'main', 'manufacturer',
    'QA One OEM Alias', 'qa one oem alias',
    '68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000403',
    '68000000-0000-4000-8000-000000000301', 'main', 'manufacturer',
    'QA Two OEM Alias', 'qa two oem alias',
    '68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_master_compatibilities (
  id, relation_type, source_entity_id, target_entity_id, source_ref,
  created_by, updated_by, created_at, updated_at
) values
  (
    '68000000-0000-4000-8000-000000000501', 'manufacturer_brand',
    '68000000-0000-4000-8000-000000000101', '68000000-0000-4000-8000-000000000102', null,
    '68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000502', 'manufacturer_brand',
    '68000000-0000-4000-8000-000000000201', '68000000-0000-4000-8000-000000000202',
    'QA-CMS-FINAL-20260907-33333333',
    '68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '68000000-0000-4000-8000-000000000503', 'manufacturer_brand',
    '68000000-0000-4000-8000-000000000301', '68000000-0000-4000-8000-000000000302',
    'QA-CMS-FINAL-20260907-44444444',
    '68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

select is(
  (
    select array_agg(id order by id)::text
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main', null, '', true, 500
    )
  ),
  array[
    '68000000-0000-4000-8000-000000000101'::uuid,
    '68000000-0000-4000-8000-000000000102'::uuid
  ]::text,
  'corporate listing excludes all entities owned by ever-QA actors'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main', null, 'QA One', true, 500
    )
  ),
  0,
  'corporate search cannot discover QA natural keys'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main', null, '', true, 500
    )
  ),
  array[
    '68000000-0000-4000-8000-000000000201'::uuid,
    '68000000-0000-4000-8000-000000000202'::uuid
  ]::text,
  'QA listing contains only exact same-run entities'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main', null, 'QA Two', true, 500
    )
  ),
  0,
  'QA search cannot discover another run natural keys'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'production', 'main', null, '', true, 500
    )
  ),
  0,
  'a staging QA lease cannot be replayed in production'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main', null, 'QA One OEM Alias', true, 500
    )
  ),
  1,
  'QA alias search resolves only its same-run entity'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main', 'technology', '', true, 500
    )
  ),
  0,
  'QA entity with another run tag is fail-closed'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main', null, 'Corporate OEM Alias', true, 500
    )
  ),
  1,
  'corporate alias search preserves ordinary behavior'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000101', false
    )
  ),
  1,
  'corporate dependencies preserve the ordinary graph'
);
select is(
  (
    select target ->> 'id'
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000101', false
    )
  ),
  '68000000-0000-4000-8000-000000000102',
  'corporate dependency returns its permitted target'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000201', false
    )
  ),
  0,
  'corporate dependency IDOR cannot address a QA source'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000201', false
    )
  ),
  1,
  'QA dependencies return the exact same-run graph'
);
select is(
  (
    select target ->> 'id'
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000201', false
    )
  ),
  '68000000-0000-4000-8000-000000000202',
  'QA dependency cannot substitute a target from another scope'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000101', false
    )
  ),
  0,
  'QA dependency IDOR cannot address a corporate source'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000301', false
    )
  ),
  0,
  'QA dependency IDOR cannot address another run source'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_rules_scoped(
      '68000000-0000-4000-8000-000000000001', 'staging'
    )
  ),
  6,
  'corporate readers retain the active relation rules'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_rules_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging'
    )
  ),
  6,
  'an active QA reader can use shared relation rules'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_rules_scoped(
      '68000000-0000-4000-8000-000000000002', 'production'
    )
  ),
  0,
  'relation rules fail closed outside the QA lease environment'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-999999999999', 'staging', 'main', null, '', true, 500
    )
  ),
  0,
  'an unknown actor receives no entity projection'
);
select is(
  private.cms_master_entity_scope_allowed(
    '68000000-0000-4000-8000-000000000002',
    '68000000-0000-4000-8000-000000000201', 'staging', 'main'
  ),
  true,
  'the exact same-run QA entity graph is allowed before contamination'
);
select is(
  private.cms_master_entity_scope_allowed(
    '68000000-0000-4000-8000-000000000002',
    '68000000-0000-4000-8000-000000000203', 'staging', 'main'
  ),
  false,
  'a QA-owned entity with a foreign run marker is rejected'
);

select set_config('cms.qa_compensating', 'on', true);
update public.cms_master_compatibilities
set source_ref = 'QA-CMS-FINAL-20260907-44444444'
where id = '68000000-0000-4000-8000-000000000502';
select set_config('cms.qa_compensating', 'off', true);

select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000201', true
    )
  ),
  0,
  'a compatibility with another run marker is fail-closed'
);

select set_config('cms.qa_compensating', 'on', true);
update public.cms_master_compatibilities
set source_ref = 'QA-CMS-FINAL-20260907-33333333'
where id = '68000000-0000-4000-8000-000000000502';
insert into public.cms_master_entity_aliases (
  id, entity_id, site_key, entity_type, alias, normalized_alias,
  created_by, updated_by, created_at, updated_at
) values (
  '68000000-0000-4000-8000-000000000499',
  '68000000-0000-4000-8000-000000000201', 'main', 'manufacturer',
  'Cross Run Contamination', 'cross run contamination',
  '68000000-0000-4000-8000-000000000003', '68000000-0000-4000-8000-000000000003',
  clock_timestamp(), clock_timestamp()
);
select set_config('cms.qa_compensating', 'off', true);

select is(
  (
    select count(*)::integer
    from public.cms_master_list_entities_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer', 'Master Scope QA One Manufacturer', true, 500
    )
  ),
  0,
  'one cross-run alias hides the entire entity graph'
);
select is(
  (
    select count(*)::integer
    from public.cms_master_get_dependencies_scoped(
      '68000000-0000-4000-8000-000000000002', 'staging', 'main',
      'manufacturer_brand', '68000000-0000-4000-8000-000000000201', true
    )
  ),
  0,
  'dependency reads fail closed when the requested source graph is mixed'
);

select * from finish();
rollback;
