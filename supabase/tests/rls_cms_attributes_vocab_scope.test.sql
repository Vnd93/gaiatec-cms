begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(40);

select has_function(
  'public', 'cms_attributes_catalog_scoped', array['uuid', 'text', 'text', 'uuid'],
  'attribute catalogs have an authoritative scoped reader'
);
select has_function(
  'public', 'cms_controlled_vocabularies_scoped',
  array['uuid', 'text', 'text', 'boolean', 'integer'],
  'controlled vocabularies have an authoritative scoped reader'
);
select has_function(
  'public', 'cms_manage_controlled_vocabulary_scoped',
  array['uuid', 'text', 'text', 'jsonb', 'jsonb', 'text', 'text', 'timestamptz', 'uuid'],
  'controlled-vocabulary mutations have an actor-scoped CAS boundary'
);
select isnt(
  has_function_privilege(
    'anon', 'public.cms_attributes_catalog_scoped(uuid,text,text,uuid)', 'EXECUTE'
  ),
  true,
  'anonymous callers cannot invoke the attribute reader'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot bypass the vocabulary Edge boundary'
);
select is(
  has_function_privilege(
    'service_role', 'public.cms_attributes_catalog_scoped(uuid,text,text,uuid)', 'EXECUTE'
  ),
  true,
  'the trusted Edge service role can invoke the attribute reader'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_controlled_lists', 'SELECT'),
  true,
  'authenticated users cannot directly list controlled natural keys'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_controlled_options', 'SELECT'),
  true,
  'authenticated users cannot directly list controlled options'
);
select isnt(
  has_function_privilege(
    'service_role',
    'public.cms_manage_controlled_vocabulary(uuid,text,jsonb,jsonb,text,text,timestamptz,uuid)',
    'EXECUTE'
  ),
  true,
  'the legacy unscoped mutation RPC is no longer callable by Edge'
);
select has_column(
  'public', 'cms_controlled_lists', 'lock_version',
  'controlled lists carry an optimistic lock version'
);
select has_column(
  'public', 'cms_controlled_options', 'lock_version',
  'controlled options carry an optimistic lock version'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'scope71-corporate@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}', now(), now()
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'scope71-qa-one@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-55555555","candidateSha":"5555555555555555555555555555555555555555","environment":"staging"}',
    now(), now()
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'scope71-qa-two@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-66666666","candidateSha":"6666666666666666666666666666666666666666","environment":"staging"}',
    now(), now()
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'scope71-qa-cleanup@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-77777777","candidateSha":"7777777777777777777777777777777777777777","environment":"staging"}',
    now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status)
values
  ('71000000-0000-4000-8000-000000000001', 'Scope 71 corporate', 'active'),
  ('71000000-0000-4000-8000-000000000002', 'Scope 71 QA one', 'active'),
  ('71000000-0000-4000-8000-000000000003', 'Scope 71 QA two', 'active'),
  ('71000000-0000-4000-8000-000000000004', 'Scope 71 QA cleanup', 'active');
insert into public.cms_user_roles (user_id, role_key)
values
  ('71000000-0000-4000-8000-000000000001', 'super_admin'),
  ('71000000-0000-4000-8000-000000000002', 'super_admin'),
  ('71000000-0000-4000-8000-000000000003', 'super_admin'),
  ('71000000-0000-4000-8000-000000000004', 'super_admin');

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, source_ref,
  created_by, updated_by, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000101', 'category',
    'Scope 71 Corporate Category', 'scope 71 corporate category', null,
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000201', 'category',
    'Scope 71 QA One Category', 'scope 71 qa one category',
    'QA-CMS-FINAL-20260907-55555555',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000301', 'category',
    'Scope 71 QA Two Category', 'scope 71 qa two category',
    'QA-CMS-FINAL-20260907-66666666',
    '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_pim_units (
  code, label, symbol, dimension_key, canonical_code,
  factor_to_canonical, offset_to_canonical, created_by, updated_by,
  created_at, updated_at
) values
  (
    'qa71-corp-u', 'Scope 71 Corporate Unit', 'CU', 'scope71_corp', 'qa71-corp-u',
    1, 0, '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    'qa71-q1-u', 'Scope 71 QA One Unit', 'Q1', 'scope71_q1', 'qa71-q1-u',
    1, 0, '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    'qa71-q2-u', 'Scope 71 QA Two Unit', 'Q2', 'scope71_q2', 'qa71-q2-u',
    1, 0, '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_pim_attribute_definitions (
  id, attribute_key, label, data_type, canonical_unit_code,
  created_by, updated_by, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000111', 'scope71_corp_attr',
    'Scope 71 Corporate Attribute', 'decimal', 'qa71-corp-u',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000211', 'scope71_q1_attr',
    'Scope 71 QA One Attribute', 'decimal', 'qa71-q1-u',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000311', 'scope71_q2_attr',
    'Scope 71 QA Two Attribute', 'decimal', 'qa71-q2-u',
    '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_pim_attribute_sets (
  id, category_id, name, created_by, updated_by, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000121', '71000000-0000-4000-8000-000000000101',
    'Scope 71 Corporate Set',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000221', '71000000-0000-4000-8000-000000000201',
    'Scope 71 QA One Set',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000321', '71000000-0000-4000-8000-000000000301',
    'Scope 71 QA Two Set',
    '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_pim_attribute_set_versions (
  id, attribute_set_id, version, status, effective_from, created_by, created_at
) values
  (
    '71000000-0000-4000-8000-000000000131', '71000000-0000-4000-8000-000000000121',
    1, 'active', clock_timestamp(), '71000000-0000-4000-8000-000000000001', clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000231', '71000000-0000-4000-8000-000000000221',
    1, 'active', clock_timestamp(), '71000000-0000-4000-8000-000000000002', clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000331', '71000000-0000-4000-8000-000000000321',
    1, 'active', clock_timestamp(), '71000000-0000-4000-8000-000000000003', clock_timestamp()
  );

insert into public.cms_pim_attribute_set_definitions (
  attribute_set_version_id, definition_id, required, inherited, position
) values
  ('71000000-0000-4000-8000-000000000131', '71000000-0000-4000-8000-000000000111', true, true, 0),
  ('71000000-0000-4000-8000-000000000231', '71000000-0000-4000-8000-000000000211', true, true, 0),
  ('71000000-0000-4000-8000-000000000331', '71000000-0000-4000-8000-000000000311', true, true, 0);

insert into public.cms_controlled_lists (
  id, list_key, entity_type, dimension_key, label,
  created_by, updated_by, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000401', 'qa71.corporate', 'product', 'qa71_corporate',
    'Scope 71 Corporate List',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000402', 'qa71.qa-one', 'product', 'qa71_qa_one',
    'Scope 71 QA One List',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000403', 'qa71.qa-two', 'product', 'qa71_qa_two',
    'Scope 71 QA Two List',
    '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000404', 'qa71.cleanup', 'product', 'qa71_cleanup',
    'Scope 71 QA Cleanup List',
    '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000004',
    clock_timestamp(), clock_timestamp()
  );

insert into public.cms_controlled_options (
  id, list_id, slug, label, created_by, updated_by, created_at, updated_at
) values
  (
    '71000000-0000-4000-8000-000000000411', '71000000-0000-4000-8000-000000000401',
    'corporate-option', 'Scope 71 Corporate Option',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000412', '71000000-0000-4000-8000-000000000402',
    'qa-one-option', 'Scope 71 QA One Option',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000413', '71000000-0000-4000-8000-000000000403',
    'qa-two-option', 'Scope 71 QA Two Option',
    '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
    clock_timestamp(), clock_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000414', '71000000-0000-4000-8000-000000000404',
    'qa-cleanup-option', 'Scope 71 QA Cleanup Option',
    '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000004',
    clock_timestamp(), clock_timestamp()
  );

select is(
  (
    select array_agg(value ->> 'code' order by value ->> 'code')::text
    from jsonb_array_elements(
      public.cms_attributes_catalog_scoped(
        '71000000-0000-4000-8000-000000000001', 'staging', 'main',
        '71000000-0000-4000-8000-000000000101'
      ) -> 'units'
    ) value
  ),
  array['qa71-corp-u']::text,
  'corporate attribute units exclude QA natural keys'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000001', 'staging', 'main',
    '71000000-0000-4000-8000-000000000101'
  ) #>> '{attribute_set,id}',
  '71000000-0000-4000-8000-000000000121',
  'corporate attribute catalog returns its own set'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000001', 'staging', 'main',
    '71000000-0000-4000-8000-000000000101'
  ) #>> '{definitions,0,id}',
  '71000000-0000-4000-8000-000000000111',
  'corporate attribute catalog returns its own definition'
);
select is(
  (
    select array_agg(value ->> 'code' order by value ->> 'code')::text
    from jsonb_array_elements(
      public.cms_attributes_catalog_scoped(
        '71000000-0000-4000-8000-000000000002', 'staging', 'main',
        '71000000-0000-4000-8000-000000000201'
      ) -> 'units'
    ) value
  ),
  array['qa71-q1-u']::text,
  'QA attribute units contain only the exact same-run natural key'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000002', 'staging', 'main',
    '71000000-0000-4000-8000-000000000201'
  ) #>> '{attribute_set,id}',
  '71000000-0000-4000-8000-000000000221',
  'QA attribute catalog returns its exact same-run set'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000002', 'staging', 'main',
    '71000000-0000-4000-8000-000000000201'
  ) #>> '{definitions,0,id}',
  '71000000-0000-4000-8000-000000000211',
  'QA attribute catalog returns its exact same-run definition'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000002', 'staging', 'main',
    '71000000-0000-4000-8000-000000000101'
  ) ->> 'attribute_set',
  null,
  'QA category IDOR cannot reveal a corporate attribute set'
);
select is(
  jsonb_array_length(
    public.cms_attributes_catalog_scoped(
      '71000000-0000-4000-8000-000000000002', 'production', 'main',
      '71000000-0000-4000-8000-000000000201'
    ) -> 'units'
  ),
  0,
  'attribute catalog rejects replay outside the QA lease environment'
);
select is(
  jsonb_array_length(
    public.cms_attributes_catalog_scoped(
      '71000000-0000-4000-8000-999999999999', 'staging', 'main',
      '71000000-0000-4000-8000-000000000101'
    ) -> 'units'
  ),
  0,
  'attribute catalog fails closed for an unknown actor'
);
select is(
  public.cms_attributes_catalog_scoped(
    '71000000-0000-4000-8000-000000000003', 'staging', 'main',
    '71000000-0000-4000-8000-000000000201'
  ) ->> 'attribute_set',
  null,
  'one QA run cannot address another run attribute set'
);

select is(
  (
    select array_agg(id order by id)::text
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-000000000001', 'staging', null, true, 500
    )
  ),
  array['71000000-0000-4000-8000-000000000401'::uuid]::text,
  'corporate vocabulary list excludes QA natural keys'
);
select is(
  (
    select array_agg(id order by id)::text
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', null, true, 500
    )
  ),
  array['71000000-0000-4000-8000-000000000402'::uuid]::text,
  'QA vocabulary list contains only the exact same-run graph'
);
select is(
  (
    select count(*)::integer
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-000000000002', 'production', null, true, 500
    )
  ),
  0,
  'vocabulary list rejects replay outside the QA lease environment'
);
select is(
  private.cms_controlled_list_scope_allowed(
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000402', 'staging'
  ),
  false,
  'corporate actor cannot read a QA vocabulary graph by UUID'
);
select is(
  private.cms_controlled_list_scope_allowed(
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000401', 'staging'
  ),
  false,
  'QA actor cannot read a corporate vocabulary graph by UUID'
);
select is(
  (
    select count(*)::integer
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-999999999999', 'staging', null, true, 500
    )
  ),
  0,
  'vocabulary list fails closed for an unknown actor'
);

select throws_ok(
  $call$
    select public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', 'upsert_list',
      jsonb_build_object(
        'id', '71000000-0000-4000-8000-000000000402',
        'lockVersion', 99,
        'listKey', 'qa71.qa-one',
        'entityType', 'product',
        'dimensionKey', 'qa71_qa_one',
        'label', 'Wrong CAS label',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      null, 'aal2', 'scope71-qa-one-session', now() - interval '1 minute', gen_random_uuid()
    )
  $call$,
  '40001', 'CMS_CONTROLLED_VERSION_CONFLICT',
  'a stale optimistic version is rejected'
);
select is(
  (select label from public.cms_controlled_lists where id = '71000000-0000-4000-8000-000000000402'),
  'Scope 71 QA One List',
  'wrong optimistic version preserves the vocabulary row'
);
select is(
  (
    public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', 'upsert_list',
      jsonb_build_object(
        'id', '71000000-0000-4000-8000-000000000402',
        'lockVersion', 1,
        'listKey', 'qa71.qa-one',
        'entityType', 'product',
        'dimensionKey', 'qa71_qa_one',
        'label', 'Scope 71 QA One List Revised',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      null, 'aal2', 'scope71-qa-one-session', now() - interval '1 minute', gen_random_uuid()
    ) ->> 'lockVersion'
  )::bigint,
  2::bigint,
  'a valid CAS update increments the list lock version'
);
select throws_ok(
  $call$
    select public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', 'upsert_list',
      jsonb_build_object(
        'id', '71000000-0000-4000-8000-000000000401',
        'lockVersion', 1,
        'listKey', 'qa71.corporate',
        'entityType', 'product',
        'dimensionKey', 'qa71_corporate',
        'label', 'QA overwrite attempt',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      null, 'aal2', 'scope71-qa-one-session', now() - interval '1 minute', gen_random_uuid()
    )
  $call$,
  '42501', 'CMS_CONTROLLED_SCOPE_FORBIDDEN',
  'QA cannot mutate a corporate list by UUID'
);
select throws_ok(
  $call$
    select public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000001', 'staging', 'upsert_option', null,
      jsonb_build_object(
        'id', '71000000-0000-4000-8000-000000000412',
        'lockVersion', 1,
        'listId', '71000000-0000-4000-8000-000000000402',
        'slug', 'qa-one-option',
        'label', 'Corporate overwrite attempt',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      'aal2', 'scope71-corporate-session', now() - interval '1 minute', gen_random_uuid()
    )
  $call$,
  '42501', 'CMS_CONTROLLED_SCOPE_FORBIDDEN',
  'corporate cannot mutate a QA option by UUID'
);
select throws_ok(
  $call$
    select public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', 'upsert_option', null,
      jsonb_build_object(
        'listId', '71000000-0000-4000-8000-000000000401',
        'slug', 'qa-adoption-attempt',
        'label', 'QA adoption attempt',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      'aal2', 'scope71-qa-one-session', now() - interval '1 minute', gen_random_uuid()
    )
  $call$,
  '42501', 'CMS_CONTROLLED_SCOPE_FORBIDDEN',
  'QA cannot attach a new option to a corporate list'
);
select throws_ok(
  $call$
    select public.cms_manage_controlled_vocabulary_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', 'upsert_list',
      jsonb_build_object(
        'listKey', 'qa71.corporate',
        'entityType', 'product',
        'dimensionKey', 'qa71_conflicting_key',
        'label', 'QA natural key collision',
        'description', '',
        'publicVisible', true,
        'active', true,
        'sortOrder', 0
      ),
      null, 'aal2', 'scope71-qa-one-session', now() - interval '1 minute', gen_random_uuid()
    )
  $call$,
  '23505', 'CMS_CONTROLLED_NATURAL_KEY_CONFLICT',
  'QA natural-key collision never updates the corporate row'
);

select set_config('cms.qa_compensating', 'on', true);
insert into public.cms_controlled_options (
  id, list_id, slug, label, created_by, updated_by, created_at, updated_at
) values (
  '71000000-0000-4000-8000-000000000499', '71000000-0000-4000-8000-000000000402',
  'cross-run-contamination', 'Cross-run contamination',
  '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003',
  clock_timestamp(), clock_timestamp()
);
select set_config('cms.qa_compensating', 'off', true);

select is(
  (
    select count(*)::integer
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-000000000002', 'staging', null, true, 500
    )
  ),
  0,
  'one cross-run option hides the entire vocabulary graph'
);
select is(
  (
    select count(*)::integer
    from public.cms_controlled_vocabularies_scoped(
      '71000000-0000-4000-8000-000000000004', 'staging', null, true, 500
    )
  ),
  1,
  'cleanup actor sees its synthetic vocabulary before terminalization'
);

update private.cms_qa_actor_leases
set status = 'cleaned', cleaned_at = clock_timestamp()
where actor_id = '71000000-0000-4000-8000-000000000004';

select is(
  (select count(*)::integer from public.cms_controlled_lists where id = '71000000-0000-4000-8000-000000000404'),
  0,
  'terminal cleanup removes the synthetic controlled list'
);
select is(
  (select count(*)::integer from public.cms_controlled_options where id = '71000000-0000-4000-8000-000000000414'),
  0,
  'terminal cleanup removes the synthetic controlled option first'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log audit
    where audit.actor_id = '71000000-0000-4000-8000-000000000004'
      and audit.action = 'cms:qa.controlled_vocabulary_compensated'
  ),
  1,
  'terminal cleanup preserves an immutable audit record'
);

insert into public.cms_controlled_lists (
  id, list_key, entity_type, dimension_key, label, created_by, updated_by
) values (
  '71000000-0000-4000-8000-000000000405', 'qa71.cleanup', 'product', 'qa71_cleanup',
  'Scope 71 Reused Corporate List',
  '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*)::integer from public.cms_controlled_lists where list_key = 'qa71.cleanup'),
  1,
  'terminal cleanup releases the QA natural key'
);

select * from finish();
rollback;
