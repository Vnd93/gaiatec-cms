-- Provisionamento operacional de producao vinculado ao G12. A identidade e
-- localizada somente por SHA-256 do e-mail normalizado; nenhum e-mail, segredo
-- TOTP ou credencial e aceito, persistido ou devolvido por esta fronteira.

create table private.cms_production_operator_provision_receipts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  environment text not null check (environment = 'production'),
  window_minutes integer not null check (window_minutes between 1440 and 525600),
  workflow_run_id text not null check (workflow_run_id ~ '^[1-9][0-9]{0,19}$'),
  approval_record_sha256 text not null check (approval_record_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_sha256 text not null unique check (authorization_sha256 ~ '^[0-9a-f]{64}$'),
  enabled_flags text[] not null check (
    enabled_flags = array[
      'ev2.release_skeleton','ev2.draft_v2','ev2.master_data','ev2.pim_v2',
      'ev2.dam','ev2.search_quality','ev2.collaboration_bulk','ev2.rbac_scoped',
      'ev2.visual_studio','ev2.ai_assist','ev2.system_assurance'
    ]::text[]
  ),
  disabled_flags text[] not null default '{}'::text[],
  override_expires_at timestamptz not null,
  correlation_id uuid not null,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  check (override_expires_at > created_at),
  check (override_expires_at <= created_at + interval '365 days'),
  check (not ('ev2.multisite' = any(enabled_flags))),
  check (not ('ev2.ai_execute' = any(enabled_flags)))
);

create index cms_production_operator_receipts_candidate_idx
  on private.cms_production_operator_provision_receipts(candidate_sha,created_at desc);

create or replace function private.cms_reject_production_operator_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,pg_temp
as $$
begin
  raise exception 'CMS_PRODUCTION_OPERATOR_RECEIPT_IMMUTABLE' using errcode='42501';
end;
$$;

create trigger cms_production_operator_receipts_immutable
before update or delete on private.cms_production_operator_provision_receipts
for each row execute function private.cms_reject_production_operator_receipt_mutation();

alter table private.cms_production_operator_provision_receipts enable row level security;
revoke all on table private.cms_production_operator_provision_receipts
  from public,anon,authenticated,service_role;

-- Materialize explicitamente a transformacao de producao introduzida em 0055.
-- Assim o gate nao depende de reescrita textual historica: um unico override
-- individual continua necessario e qualquer ativacao ampla permanece negada.
create or replace function private.cms_rbac_scope_context(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_user_count integer:=0;
  v_user_environment text;
  v_user_enabled boolean;
  v_broad_enabled boolean:=false;
begin
  select * into v_flag
  from public.cms_feature_flags
  where flag_key='ev2.rbac_scoped'
    and (expires_at is null or expires_at>statement_timestamp());
  if not found or v_flag.kill_switch then
    return jsonb_build_object(
      'mode','legacy','source',case when found then 'kill_switch' else 'unavailable' end
    );
  end if;

  select count(*),min(environment),bool_or(enabled)
  into v_user_count,v_user_environment,v_user_enabled
  from public.cms_feature_flag_overrides override
  where override.flag_key='ev2.rbac_scoped'
    and override.scope_type='user' and override.scope_key=p_actor_id::text
    and override.starts_at<=statement_timestamp()
    and override.expires_at>statement_timestamp();
  select exists(
    select 1 from public.cms_feature_flag_overrides override
    where override.flag_key='ev2.rbac_scoped'
      and override.scope_type<>'user' and override.enabled
      and override.starts_at<=statement_timestamp()
      and override.expires_at>statement_timestamp()
  ) into v_broad_enabled;

  if v_user_count>1 then
    return jsonb_build_object('mode','deny','source','ambiguous_user_overrides');
  end if;
  if v_broad_enabled then
    return jsonb_build_object('mode','deny','source','broad_activation_not_supported');
  end if;
  if v_user_count=1 and v_user_enabled then
    return jsonb_build_object(
      'mode','scoped','source','user_override',
      'environment',v_user_environment,'siteKey','main'
    );
  end if;
  if v_flag.default_enabled then
    return jsonb_build_object('mode','deny','source','broad_activation_not_supported');
  end if;
  return jsonb_build_object(
    'mode','legacy',
    'source',case when v_user_count=1 then 'user_override_off' else 'default' end
  );
end;
$$;

comment on function private.cms_rbac_scope_context(uuid)
is 'Fail-closed RBAC scope selector. Production is allowed only by one active individual override; broad activation is denied.';

-- A protecao cobre tambem mutacoes diretas acidentais pelo service role. Atores
-- que tiveram lease QA nunca contam como operador corporativo e continuam
-- removiveis pelo watchdog sintetico.
create or replace function private.cms_protect_last_corporate_legacy_superadmin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_removes_super boolean;
  v_other_supers integer;
begin
  if tg_op='DELETE' then
    v_removes_super:=old.role_key='super_admin';
  else
    v_removes_super:=old.role_key='super_admin' and (
      new.role_key<>'super_admin' or new.user_id<>old.user_id
    );
  end if;
  if not v_removes_super
     or exists(select 1 from private.cms_qa_actor_leases lease where lease.actor_id=old.user_id)
     or not exists(
       select 1 from public.cms_profiles profile
       where profile.user_id=old.user_id and profile.status='active'
     ) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms:last-corporate-superadmin',0));
  select count(*) into v_other_supers
  from public.cms_profiles profile
  join public.cms_user_roles role
    on role.user_id=profile.user_id and role.role_key='super_admin'
  where profile.status='active'
    and profile.user_id<>old.user_id
    and not exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=profile.user_id
    );
  if v_other_supers=0 then
    raise exception 'CMS_LAST_CORPORATE_SUPER_ADMIN' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cms_user_roles_last_corporate_superadmin_guard
  on public.cms_user_roles;
create trigger cms_user_roles_last_corporate_superadmin_guard
before update or delete on public.cms_user_roles
for each row execute function private.cms_protect_last_corporate_legacy_superadmin();

create or replace function private.cms_protect_last_corporate_scoped_superadmin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_was_active boolean;
  v_removes_super boolean;
  v_other_supers integer;
begin
  v_was_active := old.role_key='super_admin' and old.site_key='main'
    and old.environment='production' and old.revoked_at is null
    and old.valid_from<=statement_timestamp()
    and (old.expires_at is null or old.expires_at>statement_timestamp());
  if tg_op='DELETE' then
    v_removes_super:=true;
  else
    v_removes_super:=new.role_key<>'super_admin'
      or new.user_id<>old.user_id or new.site_key<>'main'
      or new.environment<>'production' or new.revoked_at is not null
      or new.valid_from>statement_timestamp()
      or (new.expires_at is not null and new.expires_at<=statement_timestamp());
  end if;
  if not v_was_active or not v_removes_super
     or exists(select 1 from private.cms_qa_actor_leases lease where lease.actor_id=old.user_id)
     or not exists(
       select 1 from public.cms_profiles profile
       where profile.user_id=old.user_id and profile.status='active'
     ) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms:last-corporate-superadmin',0));
  select count(*) into v_other_supers
  from public.cms_scoped_role_assignments assignment
  join public.cms_profiles profile on profile.user_id=assignment.user_id
  where assignment.role_key='super_admin' and assignment.site_key='main'
    and assignment.environment='production' and assignment.user_id<>old.user_id
    and assignment.revoked_at is null
    and assignment.valid_from<=statement_timestamp()
    and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
    and profile.status='active'
    and not exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=assignment.user_id
    );
  if v_other_supers=0 then
    raise exception 'CMS_LAST_CORPORATE_SCOPED_SUPER_ADMIN' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cms_scoped_roles_last_corporate_superadmin_guard
  on public.cms_scoped_role_assignments;
create trigger cms_scoped_roles_last_corporate_superadmin_guard
before update or delete on public.cms_scoped_role_assignments
for each row execute function private.cms_protect_last_corporate_scoped_superadmin();

create or replace function private.cms_protect_last_corporate_superadmin_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_deactivates boolean;
  v_is_super boolean;
  v_other_supers integer;
begin
  if tg_op='DELETE' then
    v_deactivates:=old.status='active';
  else
    v_deactivates:=old.status='active' and new.status<>'active';
  end if;
  if not v_deactivates
     or exists(select 1 from private.cms_qa_actor_leases lease where lease.actor_id=old.user_id) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  select exists(
    select 1 from public.cms_user_roles role
    where role.user_id=old.user_id and role.role_key='super_admin'
  ) or exists(
    select 1 from public.cms_scoped_role_assignments assignment
    where assignment.user_id=old.user_id and assignment.role_key='super_admin'
      and assignment.site_key='main' and assignment.environment='production'
      and assignment.revoked_at is null
      and assignment.valid_from<=statement_timestamp()
      and (assignment.expires_at is null or assignment.expires_at>statement_timestamp())
  ) into v_is_super;
  if not v_is_super then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms:last-corporate-superadmin',0));
  select count(distinct profile.user_id) into v_other_supers
  from public.cms_profiles profile
  where profile.status='active' and profile.user_id<>old.user_id
    and not exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=profile.user_id
    ) and (
      exists(select 1 from public.cms_user_roles role
        where role.user_id=profile.user_id and role.role_key='super_admin')
      or exists(select 1 from public.cms_scoped_role_assignments assignment
        where assignment.user_id=profile.user_id and assignment.role_key='super_admin'
          and assignment.site_key='main' and assignment.environment='production'
          and assignment.revoked_at is null
          and assignment.valid_from<=statement_timestamp()
          and (assignment.expires_at is null or assignment.expires_at>statement_timestamp()))
    );
  if v_other_supers=0 then
    raise exception 'CMS_LAST_CORPORATE_SUPER_ADMIN' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cms_profiles_last_corporate_superadmin_guard
  on public.cms_profiles;
create trigger cms_profiles_last_corporate_superadmin_guard
before update or delete on public.cms_profiles
for each row execute function private.cms_protect_last_corporate_superadmin_profile();

create or replace function public.cms_provision_production_operator(
  p_email_sha256 text,
  p_candidate_sha text,
  p_environment text,
  p_window_minutes integer,
  p_idempotency_key uuid,
  p_approval_record_sha256 text,
  p_authorization_sha256 text,
  p_correlation_id uuid,
  p_workflow_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions,pg_temp
as $$
declare
  v_allowed_flags constant text[]:=array[
    'ev2.release_skeleton','ev2.draft_v2','ev2.master_data','ev2.pim_v2',
    'ev2.dam','ev2.search_quality','ev2.collaboration_bulk','ev2.rbac_scoped',
    'ev2.visual_studio','ev2.ai_assist','ev2.system_assurance'
  ];
  v_forbidden_flags constant text[]:=array['ev2.multisite','ev2.ai_execute'];
  v_user_ids uuid[];
  v_user auth.users%rowtype;
  v_mfa_verified_at timestamptz;
  v_now timestamptz:=statement_timestamp();
  v_expires_at timestamptz;
  v_receipt private.cms_production_operator_provision_receipts%rowtype;
  v_receipt_id uuid:=gen_random_uuid();
  v_existing_profile public.cms_profiles%rowtype;
  v_existing_assignment public.cms_scoped_role_assignments%rowtype;
  v_profile_created boolean:=false;
  v_legacy_role_created boolean:=false;
  v_scoped_role_created boolean:=false;
  v_disabled_flags text[]:='{}'::text[];
  v_enabled_count integer;
  v_response jsonb;
  v_flag text;
  v_authorization_kind text;
begin
  if coalesce(auth.role()::text,'')<>'service_role' then
    raise exception 'CMS_PRODUCTION_OPERATOR_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if coalesce(p_email_sha256,'')!~'^[0-9a-f]{64}$'
     or coalesce(p_candidate_sha,'')!~'^[0-9a-f]{40}$'
     or p_environment is distinct from 'production'
     or p_window_minutes is null or p_window_minutes not between 1440 and 525600
     or p_window_minutes%1440<>0
     or p_idempotency_key is null or p_correlation_id is null
     or coalesce(p_workflow_run_id,'')!~'^[1-9][0-9]{0,19}$'
     or coalesce(p_approval_record_sha256,'')!~'^[0-9a-f]{64}$'
     or coalesce(p_authorization_sha256,'')!~'^[0-9a-f]{64}$' then
    raise exception 'CMS_PRODUCTION_OPERATOR_INPUT_INVALID' using errcode='22023';
  end if;
  if p_authorization_sha256=encode(extensions.digest(convert_to(
       'AUTORIZO-G12-PRODUCAO:'||p_candidate_sha,'UTF8'
     ),'sha256'),'hex') then
    v_authorization_kind:='release';
  elsif p_authorization_sha256=encode(extensions.digest(convert_to(
       'AUTORIZO-RENOVAR-OPERADOR-CMS:'||p_candidate_sha||':'||
       (p_window_minutes/1440)::text||'-DIAS','UTF8'
     ),'sha256'),'hex') then
    v_authorization_kind:='renewal';
  else
    raise exception 'CMS_PRODUCTION_OPERATOR_AUTHORIZATION_INVALID' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'cms:production-operator-idempotency:'||p_idempotency_key::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'cms:production-operator-email-hash:'||p_email_sha256,0
  ));

  -- Trave todas as identidades que casam antes de decidir elegibilidade. O RPC
  -- nunca recebe nem retorna o e-mail em claro.
  perform candidate.id
  from auth.users candidate
  where encode(extensions.digest(convert_to(
    lower(btrim(coalesce(candidate.email,''))),'UTF8'
  ),'sha256'),'hex')=p_email_sha256
  order by candidate.id for share;
  select coalesce(array_agg(candidate.id order by candidate.id),'{}'::uuid[])
  into v_user_ids
  from auth.users candidate
  where encode(extensions.digest(convert_to(
    lower(btrim(coalesce(candidate.email,''))),'UTF8'
  ),'sha256'),'hex')=p_email_sha256;
  if cardinality(v_user_ids)<>1 then
    raise exception 'CMS_PRODUCTION_OPERATOR_IDENTITY_NOT_ELIGIBLE' using errcode='42501';
  end if;
  select * into v_user from auth.users candidate where candidate.id=v_user_ids[1];
  if v_user.email_confirmed_at is null or v_user.deleted_at is not null
     or (v_user.banned_until is not null and v_user.banned_until>v_now)
     or exists(
       select 1 from private.cms_qa_actor_leases lease where lease.actor_id=v_user.id
     ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_IDENTITY_NOT_ELIGIBLE' using errcode='42501';
  end if;

  select factor.updated_at into v_mfa_verified_at
  from auth.mfa_factors factor
  where factor.user_id=v_user.id
    and factor.factor_type::text='totp' and factor.status::text='verified'
  order by factor.updated_at desc,factor.id
  limit 1 for share;
  if not found then
    raise exception 'CMS_PRODUCTION_OPERATOR_TOTP_REQUIRED' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'cms:production-operator:'||v_user.id::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended('cms:last-corporate-superadmin',0));

  select * into v_receipt
  from private.cms_production_operator_provision_receipts receipt
  where receipt.idempotency_key=p_idempotency_key for update;
  if found then
    if v_receipt.operator_user_id<>v_user.id
       or v_receipt.candidate_sha<>p_candidate_sha
       or v_receipt.environment<>p_environment
       or v_receipt.window_minutes<>p_window_minutes
       or v_receipt.workflow_run_id<>p_workflow_run_id
       or v_receipt.approval_record_sha256<>p_approval_record_sha256
       or v_receipt.authorization_sha256<>p_authorization_sha256 then
      raise exception 'CMS_PRODUCTION_OPERATOR_IDEMPOTENCY_CONFLICT' using errcode='PT409';
    end if;
    return v_receipt.response||jsonb_build_object('replayed',true);
  end if;

  if exists(
    select 1 from private.cms_production_operator_provision_receipts receipt
    where receipt.authorization_sha256=p_authorization_sha256
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_AUTHORIZATION_REPLAY' using errcode='42501';
  end if;

  v_expires_at:=v_now+(p_window_minutes*interval '1 minute');
  if v_expires_at>v_now+interval '365 days' then
    raise exception 'CMS_PRODUCTION_OPERATOR_WINDOW_INVALID' using errcode='22023';
  end if;
  if not exists(
       select 1 from public.cms_roles role
       where role.role_key='super_admin' and role.mfa_required
     ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_ROLE_INVALID' using errcode='55000';
  end if;
  select count(*) into v_enabled_count
  from public.cms_feature_flags flag
  where flag.flag_key=any(v_allowed_flags) and not flag.default_enabled
    and not flag.kill_switch and (flag.expires_at is null or flag.expires_at>v_now);
  if v_enabled_count<>cardinality(v_allowed_flags) then
    raise exception 'CMS_PRODUCTION_OPERATOR_FLAGS_UNAVAILABLE' using errcode='55000';
  end if;
  if exists(
    select 1 from public.cms_feature_flag_overrides override
    where override.environment='production'
      and override.flag_key=any(v_allowed_flags)
      and override.scope_type<>'user'
      and override.starts_at<=v_now and override.expires_at>v_now
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_BROAD_OVERRIDE_FORBIDDEN' using errcode='42501';
  end if;
  if exists(
    select 1 from public.cms_feature_flag_overrides override
    where override.scope_type='user' and override.scope_key=v_user.id::text
      and override.flag_key=any(v_allowed_flags)
      and override.environment<>'production'
      and (override.enabled or override.flag_key='ev2.rbac_scoped')
      and override.starts_at<=v_now and override.expires_at>v_now
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_ENVIRONMENT_CONFLICT' using errcode='42501';
  end if;
  if exists(
    select 1 from public.cms_feature_flag_overrides override
    where override.environment='production' and override.enabled
      and override.flag_key=any(v_forbidden_flags)
      and override.starts_at<=v_now and override.expires_at>v_now
      and not (
        override.scope_type='user' and override.scope_key=v_user.id::text
      )
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_FORBIDDEN_CAPABILITY_ACTIVE' using errcode='42501';
  end if;

  perform 1 from public.cms_profiles profile
    where profile.user_id=v_user.id for update;
  select * into v_existing_profile from public.cms_profiles profile
    where profile.user_id=v_user.id;
  if found and exists(
    select 1 from private.cms_qa_actor_leases lease
    where lease.actor_id in (v_existing_profile.invited_by,v_existing_profile.suspended_by)
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_PROFILE_TAINTED' using errcode='42501';
  end if;
  if exists(
    select 1 from public.cms_user_roles role
    join private.cms_qa_actor_leases lease on lease.actor_id=role.granted_by
    where role.user_id=v_user.id and role.role_key='super_admin'
  ) or exists(
    select 1 from public.cms_scoped_role_assignments assignment
    join private.cms_qa_actor_leases lease
      on lease.actor_id in (assignment.granted_by,assignment.revoked_by)
    where assignment.user_id=v_user.id and assignment.role_key='super_admin'
      and assignment.site_key='main' and assignment.environment='production'
  ) or exists(
    select 1 from public.cms_feature_flag_overrides override
    join private.cms_qa_actor_leases lease on lease.actor_id=override.created_by
    where override.environment='production' and override.scope_type='user'
      and override.scope_key=v_user.id::text and override.flag_key=any(v_allowed_flags)
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_CONTROL_TAINTED' using errcode='42501';
  end if;

  v_profile_created:=v_existing_profile.user_id is null;
  insert into public.cms_profiles(
    user_id,display_name,display_email,status,mfa_enrolled_at,
    suspended_at,suspended_by
  ) values (
    v_user.id,'Operador de producao',null,'active',v_mfa_verified_at,null,null
  ) on conflict(user_id) do update set
    status='active',mfa_enrolled_at=greatest(
      coalesce(cms_profiles.mfa_enrolled_at,excluded.mfa_enrolled_at),
      excluded.mfa_enrolled_at
    ),suspended_at=null,suspended_by=null;

  insert into public.cms_user_roles(user_id,role_key,granted_by,granted_at)
  values(v_user.id,'super_admin',null,v_now)
  on conflict(user_id,role_key) do nothing;
  get diagnostics v_enabled_count=row_count;
  v_legacy_role_created:=v_enabled_count=1;

  select * into v_existing_assignment
  from public.cms_scoped_role_assignments assignment
  where assignment.user_id=v_user.id and assignment.role_key='super_admin'
    and assignment.site_key='main' and assignment.environment='production'
  for update;
  v_scoped_role_created:=not found;
  insert into public.cms_scoped_role_assignments(
    user_id,role_key,site_key,environment,grant_type,reason,
    valid_from,expires_at,granted_by,granted_at,revoked_at,revoked_by,
    revocation_reason
  ) values (
    v_user.id,'super_admin','main','production','direct',
    'G12 production operator provisioning',v_now,null,null,v_now,null,null,null
  ) on conflict(user_id,role_key,site_key,environment) do update set
    grant_type='direct',reason='G12 production operator provisioning',
    valid_from=excluded.valid_from,expires_at=null,granted_by=null,
    granted_at=excluded.granted_at,revoked_at=null,revoked_by=null,
    revocation_reason=null,lock_version=cms_scoped_role_assignments.lock_version+1;

  select coalesce(array_agg(override.flag_key order by override.flag_key),'{}'::text[])
  into v_disabled_flags
  from public.cms_feature_flag_overrides override
  where override.environment='production' and override.scope_type='user'
    and override.scope_key=v_user.id::text and override.enabled
    and not (override.flag_key=any(v_allowed_flags));
  update public.cms_feature_flag_overrides override
  set enabled=false,reason='Disabled by G12 production operator provisioning',
      starts_at=v_now,expires_at=v_expires_at
  where override.environment='production' and override.scope_type='user'
    and override.scope_key=v_user.id::text and override.enabled
    and not (override.flag_key=any(v_allowed_flags));

  foreach v_flag in array v_allowed_flags loop
    insert into public.cms_feature_flag_overrides(
      flag_key,environment,scope_type,scope_key,enabled,reason,
      starts_at,expires_at,created_by
    ) values (
      v_flag,'production','user',v_user.id::text,true,
      'G12 production operator provisioning',v_now,v_expires_at,v_user.id
    ) on conflict(flag_key,environment,scope_type,scope_key) do update set
      enabled=true,reason='G12 production operator provisioning',
      starts_at=excluded.starts_at,expires_at=excluded.expires_at;
  end loop;
  select count(*) into v_enabled_count
  from public.cms_feature_flag_overrides override
  where override.environment='production' and override.scope_type='user'
    and override.scope_key=v_user.id::text and override.enabled
    and override.flag_key=any(v_allowed_flags)
    and override.starts_at=v_now and override.expires_at=v_expires_at;
  if v_enabled_count<>cardinality(v_allowed_flags) or exists(
    select 1 from public.cms_feature_flag_overrides override
    where override.environment='production' and override.scope_type='user'
      and override.scope_key=v_user.id::text and override.enabled
      and not (override.flag_key=any(v_allowed_flags))
  ) then
    raise exception 'CMS_PRODUCTION_OPERATOR_OVERRIDE_INCOMPLETE' using errcode='55000';
  end if;

  v_response:=jsonb_build_object(
    'schemaVersion',1,'status','provisioned','candidateSha',p_candidate_sha,
    'environment','production','receiptId',v_receipt_id,
    'authorizationKind',v_authorization_kind,
    'validityDays',p_window_minutes/1440,
    'workflowRunId',p_workflow_run_id,
    'overrideExpiresAt',v_expires_at,
    'enabledFlags',to_jsonb(v_allowed_flags),'disabledFlags',to_jsonb(v_disabled_flags),
    'totpVerified',true,'legacySuperAdmin',true,'scopedSuperAdmin',true,
    'replayed',false
  );
  insert into private.cms_production_operator_provision_receipts(
    id,idempotency_key,operator_user_id,candidate_sha,environment,window_minutes,workflow_run_id,
    approval_record_sha256,authorization_sha256,enabled_flags,disabled_flags,
    override_expires_at,correlation_id,response,created_at
  ) values (
    v_receipt_id,p_idempotency_key,v_user.id,p_candidate_sha,'production',
    p_window_minutes,p_workflow_run_id,p_approval_record_sha256,p_authorization_sha256,
    v_allowed_flags,v_disabled_flags,v_expires_at,p_correlation_id,v_response,v_now
  );
  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id,occurred_at
  ) values (
    null,'cms:production_operator.provision','production_operator',v_user.id::text,
    jsonb_build_object(
      'schemaVersion',1,'actorKind','service_role_workflow',
      'candidateSha',p_candidate_sha,'environment','production',
      'workflowRunId',p_workflow_run_id,
       'approvalRecordSha256',p_approval_record_sha256,'authorizationBound',true,
       'authorizationKind',v_authorization_kind,
       'validityDays',p_window_minutes/1440,
      'receiptId',v_receipt_id,'overrideExpiresAt',v_expires_at,
      'enabledFlags',to_jsonb(v_allowed_flags),'disabledFlags',to_jsonb(v_disabled_flags),
      'profileCreated',v_profile_created,'legacyRoleCreated',v_legacy_role_created,
      'scopedRoleCreated',v_scoped_role_created,'totpVerified',true,
      'containsPii',false
    ),p_correlation_id,v_now
  );
  return v_response;
end;
$$;

comment on function public.cms_provision_production_operator(
  text,text,text,integer,uuid,text,text,uuid,text
) is 'Service-role-only, SHA-bound and PII-free provisioning of one confirmed, unbanned, TOTP-verified production CMS operator.';

revoke all on function private.cms_reject_production_operator_receipt_mutation()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_rbac_scope_context(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_protect_last_corporate_legacy_superadmin()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_protect_last_corporate_scoped_superadmin()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_protect_last_corporate_superadmin_profile()
  from public,anon,authenticated,service_role;
revoke all on function public.cms_provision_production_operator(
  text,text,text,integer,uuid,text,text,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.cms_provision_production_operator(
  text,text,text,integer,uuid,text,text,uuid,text
) to service_role;
