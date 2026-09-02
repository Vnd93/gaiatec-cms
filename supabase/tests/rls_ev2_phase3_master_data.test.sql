begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '43000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ev2.master.steward@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.cms_profiles (user_id, display_name, display_email, status)
values (
  '43000000-0000-4000-8000-000000000001',
  'Steward EV2 master data', 'ev2.master.steward@example.test', 'active'
);
insert into public.cms_user_roles (user_id, role_key)
values ('43000000-0000-4000-8000-000000000001', 'super_admin');

create function pg_temp.execute_master_command(
  p_action text,
  p_payload jsonb,
  p_aal text default 'aal2',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a', 64),
  p_correlation_id uuid default gen_random_uuid()
)
returns jsonb
language sql
as $$
  select public.cms_execute_master_data_command(
    '43000000-0000-4000-8000-000000000001', p_action, p_payload,
    'local', 'main', p_aal, 'ev2-master-data-session', now() - interval '1 minute',
    p_command_id, p_idempotency_key, p_request_hash, p_correlation_id
  );
$$;

select is(
  (
    select count(*)::integer from pg_class
    where oid in (
      'public.cms_master_entities'::regclass,
      'public.cms_master_entity_aliases'::regclass,
      'public.cms_master_relation_rules'::regclass,
      'public.cms_master_compatibilities'::regclass,
      'public.cms_master_data_command_receipts'::regclass,
      'public.cms_master_data_events'::regclass
    ) and relrowsecurity
  ),
  6,
  'all EV2.3 tables enable RLS'
);
select isnt(
  has_table_privilege('anon', 'public.cms_master_entities', 'SELECT'),
  true,
  'anonymous clients cannot read master data directly'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_master_entities', 'SELECT'),
  true,
  'authenticated clients cannot bypass the Edge query boundary'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot bypass the Edge command boundary'
);
select is(
  (select critical from public.cms_permissions where permission_key = 'cms:masterdata.merge'),
  true,
  'merges are critical operations'
);
select is(
  (
    public.cms_evaluate_feature_flag(
      '43000000-0000-4000-8000-000000000001', 'ev2.master_data', 'local', 'main',
      'aal2', 'ev2-master-data-session', now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  false,
  'master data remains disabled by default'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"manufacturer","name":"Acme"}'::jsonb
  )$$,
  '42501',
  'CMS_MASTER_DATA_FEATURE_DISABLED',
  'a disabled feature cannot create master data'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, expires_at, created_by
) values (
  'ev2.master_data', 'local', 'user', '43000000-0000-4000-8000-000000000001', true,
  'Teste transacional local do Gate G3', now() + interval '1 hour',
  '43000000-0000-4000-8000-000000000001'
);

select is(
  (
    public.cms_evaluate_feature_flag(
      '43000000-0000-4000-8000-000000000001', 'ev2.master_data', 'local', 'main',
      'aal2', 'ev2-master-data-session', now() - interval '1 minute'
    ) ->> 'enabled'
  )::boolean,
  true,
  'an explicit local steward override enables EV2.3'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'create_entity',
    '{"entityType":"manufacturer","name":"Ácme Industrial","externalDomain":"acme.example"}'::jsonb
  )$$,
  'an authorized steward creates a manufacturer'
);
select is(
  (select normalized_name from public.cms_master_entities where canonical_name = 'Ácme Industrial'),
  'acme industrial',
  'canonical names are normalized accent-insensitively'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"category","name":"Detecção de gases"}'::jsonb
  )$$,
  'a category is created'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"technology","name":"Infravermelho"}'::jsonb
  )$$,
  'a first technology is created'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"technology","name":"Laser"}'::jsonb
  )$$,
  'a second technology is created'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'set_entity_status',
    jsonb_build_object(
      'entityId', (select id from public.cms_master_entities where normalized_name = 'laser'),
      'status', 'inactive', 'reason', 'Sem versão esperada'
    )
  )$$,
  '22023',
  'CMS_MASTER_DATA_COMMAND_INVALID',
  'the database boundary also requires optimistic concurrency'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"technology","name":"Láser"}'::jsonb
  )$$,
  'P0001',
  'CMS_MASTER_DATA_DUPLICATE',
  'normalization prevents duplicate canonical names'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'create_entity',
    '{"entityType":"manufacturer","name":"Outro fabricante","externalDomain":"acme.example"}'::jsonb
  )$$,
  '23505',
  null,
  'active external domains are unique within an entity type'
);

select lives_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"brand","name":"Marca controlada"}'::jsonb,
    p_command_id => '43000000-0000-4000-8000-000000000010',
    p_idempotency_key => '43000000-0000-4000-8000-000000000011',
    p_request_hash => repeat('b', 64),
    p_correlation_id => '43000000-0000-4000-8000-000000000012'
  )$$,
  'an idempotent entity command is accepted'
);
select is(
  (
    pg_temp.execute_master_command(
      'create_entity', '{"entityType":"brand","name":"Marca controlada"}'::jsonb,
      p_command_id => '43000000-0000-4000-8000-000000000010',
      p_idempotency_key => '43000000-0000-4000-8000-000000000011',
      p_request_hash => repeat('b', 64),
      p_correlation_id => '43000000-0000-4000-8000-000000000012'
    ) ->> 'lockVersion'
  )::bigint,
  1::bigint,
  'an identical retry replays the first receipt'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"brand","name":"Marca alterada"}'::jsonb,
    p_idempotency_key => '43000000-0000-4000-8000-000000000011',
    p_request_hash => repeat('c', 64)
  )$$,
  '23505',
  'CMS_MASTER_DATA_IDEMPOTENCY_CONFLICT',
  'an idempotency key cannot represent a different request'
);

select lives_ok(
  $$select pg_temp.execute_master_command(
    'upsert_alias',
    jsonb_build_object(
      'entityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho'),
      'alias', 'IR', 'expectedVersion', 1
    )
  )$$,
  'an alias is attached to an active entity'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'upsert_alias',
    jsonb_build_object(
      'entityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho'),
      'alias', 'Laser', 'expectedVersion', 2
    )
  )$$,
  'P0001',
  'CMS_MASTER_DATA_DUPLICATE',
  'an alias cannot shadow another canonical name'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'upsert_compatibility',
    jsonb_build_object(
      'relationType', 'category_technology',
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'deteccao de gases'),
      'targetEntityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho')
    )
  )$$,
  'a valid category-to-technology compatibility is created'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'upsert_compatibility',
    jsonb_build_object(
      'relationType', 'manufacturer_brand',
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'deteccao de gases'),
      'targetEntityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho')
    )
  )$$,
  '23514',
  'CMS_MASTER_DATA_RELATION_INVALID',
  'relation rules reject mismatched entity types'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'set_entity_status',
    jsonb_build_object(
      'entityId', (select id from public.cms_master_entities where normalized_name = 'laser'),
      'status', 'inactive', 'reason', 'Tecnologia descontinuada', 'expectedVersion', 1
    )
  )$$,
  'an unused technology can be inactivated without deletion'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'upsert_compatibility',
    jsonb_build_object(
      'relationType', 'category_technology',
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'deteccao de gases'),
      'targetEntityId', (select id from public.cms_master_entities where normalized_name = 'laser')
    )
  )$$,
  '23514',
  'CMS_MASTER_DATA_RELATION_INVALID',
  'inactive values cannot receive new active compatibility links'
);
select is(
  (
    select count(*)::integer from public.cms_master_compatibilities compatibility
    join public.cms_master_entities target on target.id = compatibility.target_entity_id
    where target.normalized_name = 'infravermelho'
  ),
  1,
  'existing compatibility references remain intact'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'set_entity_status',
    jsonb_build_object(
      'entityId', (select id from public.cms_master_entities where normalized_name = 'deteccao de gases'),
      'status', 'inactive', 'reason', 'Versão obsoleta', 'expectedVersion', 99
    )
  )$$,
  'P0001',
  'CMS_MASTER_DATA_CONFLICT',
  'optimistic concurrency prevents a stale update'
);
select throws_ok(
  $$select pg_temp.execute_master_command(
    'merge_entities',
    jsonb_build_object(
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'laser'),
      'targetEntityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho'),
      'reason', 'Duplicidade confirmada', 'expectedVersion', 2
    ),
    p_aal => 'aal1'
  )$$,
  '42501',
  'CMS_MASTER_DATA_FORBIDDEN',
  'a critical merge requires an AAL2 session'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'merge_entities',
    jsonb_build_object(
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'laser'),
      'targetEntityId', (select id from public.cms_master_entities where normalized_name = 'infravermelho'),
      'reason', 'Duplicidade confirmada', 'expectedVersion', 2
    )
  )$$,
  'an AAL2 steward can archive a duplicate through a reversible merge'
);
select is(
  (select status from public.cms_master_entities where normalized_name = 'laser'),
  'merged',
  'a merged source remains stored as a historical identity'
);
select lives_ok(
  $$select pg_temp.execute_master_command(
    'restore_merge',
    jsonb_build_object(
      'sourceEntityId', (select id from public.cms_master_entities where normalized_name = 'laser'),
      'reason', 'Revisão do steward', 'expectedVersion', 3
    )
  )$$,
  'a merge can be restored without reconstructing references'
);
select is(
  (select status from public.cms_master_entities where normalized_name = 'laser'),
  'active',
  'restoration reactivates the same stable identity'
);
select is(
  (select count(*)::integer from public.cms_master_data_events),
  10,
  'successful mutations append one immutable event each'
);
select is(
  (select count(*)::integer from public.cms_audit_log where action like 'cms:masterdata.%'),
  10,
  'successful mutations append one central audit record each'
);
select throws_ok(
  $$delete from public.cms_master_data_events$$,
  '42501',
  'CMS audit records are immutable',
  'master-data events cannot be deleted'
);
select throws_ok(
  $$delete from public.cms_master_entities where normalized_name = 'laser'$$,
  '42501',
  'CMS_MASTER_DATA_DELETE_FORBIDDEN',
  'master entities are never hard-deleted'
);

update public.cms_feature_flags
set kill_switch = true,
  updated_by = '43000000-0000-4000-8000-000000000001'
where flag_key = 'ev2.master_data';
select throws_ok(
  $$select pg_temp.execute_master_command(
    'create_entity', '{"entityType":"line","name":"Bloqueada"}'::jsonb
  )$$,
  '42501',
  'CMS_MASTER_DATA_FEATURE_DISABLED',
  'the kill switch blocks mutations without erasing master data'
);

select * from finish();
rollback;
