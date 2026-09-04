begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '51300000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g13.runtime@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '51300000-0000-4000-8000-000000000101',
  'Operador runtime G13',
  'g13.runtime@example.test',
  'active',
  now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('51300000-0000-4000-8000-000000000101', 'super_admin');

select has_function(
  'public',
  'cms_runtime_capability_manifest',
  array['uuid', 'text', 'text', 'text', 'text', 'timestamp with time zone'],
  'the aggregate runtime capability boundary exists'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the runtime manifest directly'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot bypass cms-session'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  true,
  'only the trusted session boundary can evaluate the manifest'
);
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) ->> 'status',
  'ready',
  'local runtime evaluation is available'
);
select is(
  (
    select count(*)::integer
    from jsonb_object_keys(
      public.cms_runtime_capability_manifest(
        '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
        'g13-runtime-session', now() - interval '1 minute'
      ) -> 'capabilities'
    )
  ),
  13,
  'the versioned manifest contains every EV2 capability'
);
select ok(
  not exists (
    select 1
    from jsonb_each(
      public.cms_runtime_capability_manifest(
        '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
        'g13-runtime-session', now() - interval '1 minute'
      ) -> 'capabilities'
    ) entry
    where (entry.value ->> 'enabled')::boolean
  ),
  'all capabilities remain disabled without an individual override'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values
  (
    'ev2.dam', 'local', 'user', '51300000-0000-4000-8000-000000000101', true,
    'Override individual sintético G13', now() - interval '1 minute', now() + interval '29 minutes',
    '51300000-0000-4000-8000-000000000101'
  ),
  (
    'ev2.master_data', 'local', 'environment', 'local', true,
    'Teste negativo de escopo amplo G13', now() - interval '1 minute', now() + interval '5 minutes',
    '51300000-0000-4000-8000-000000000101'
  );

select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) #>> '{capabilities,ev2.dam,enabled}',
  'true',
  'an active per-user override enables only its capability'
);
select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.cms_feature_flag_overrides'::regclass
      and c.contype = 'u'
      and position(
        'UNIQUE (flag_key, environment, scope_type, scope_key)'
        in pg_get_constraintdef(c.oid)
      ) > 0
  ),
  'the database rejects duplicate overrides for one identity and capability'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.dam', 'local', 'environment', 'local', true,
  'Escopo amplo paralelo deve bloquear o manifesto G13',
  now() - interval '1 minute', now() + interval '5 minutes',
  '51300000-0000-4000-8000-000000000101'
);
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) #>> '{capabilities,ev2.dam,enabled}',
  'false',
  'a parallel broad override invalidates an otherwise eligible individual grant'
);
delete from public.cms_feature_flag_overrides
where flag_key = 'ev2.dam'
  and environment = 'local'
  and scope_type = 'environment';

select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) #>> '{capabilities,ev2.master_data,enabled}',
  'false',
  'an environment-wide override cannot activate the frontend manifest'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.ai_assist', 'local', 'user', '51300000-0000-4000-8000-000000000101', true,
  'TTL acima do limite deve falhar fechado no G13',
  now() - interval '1 minute', now() + interval '30 minutes',
  '51300000-0000-4000-8000-000000000101'
);
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) #>> '{capabilities,ev2.ai_assist,enabled}',
  'false',
  'an individual override longer than 30 minutes is ineligible'
);

update public.cms_feature_flags set kill_switch = true where flag_key = 'ev2.dam';
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) #>> '{capabilities,ev2.dam,enabled}',
  'false',
  'the kill switch overrides an individual grant'
);
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) ->> 'status',
  'gated',
  'production remains explicitly gated'
);
select ok(
  not exists (
    select 1
    from jsonb_each(
      public.cms_runtime_capability_manifest(
        '51300000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
        'g13-runtime-session', now() - interval '1 minute'
      ) -> 'capabilities'
    ) entry
    where (entry.value ->> 'enabled')::boolean
  ),
  'a production manifest cannot enable any capability'
);
select is(
  public.cms_runtime_capability_manifest(
    '51300000-0000-4000-8000-000000000101', 'local', 'other', 'aal2',
    'g13-runtime-session', now() - interval '1 minute'
  ) ->> 'status',
  'unavailable',
  'an unexpected site fails closed'
);

select * from finish();
rollback;
