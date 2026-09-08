-- RDO: administração de equipe isolada do CMS e serializada no banco.
-- Nenhuma identidade ou dado comercial é criado por esta migration.

alter table public.rdo_user_access
  add column lock_version bigint not null default 1 check (lock_version > 0);

create function public.rdo_apply_team_member_command(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_role text,
  p_operation_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.rdo_user_access%rowtype;
  v_target public.rdo_user_access%rowtype;
  v_result public.rdo_user_access%rowtype;
  v_active_admins integer;
begin
  if p_actor_id is null
     or p_target_id is null
     or p_action is null
     or p_action not in ('set_role', 'suspend', 'reactivate')
     or p_operation_id is null
     or p_correlation_id is null
     or (p_action = 'set_role' and p_role not in ('rdo_admin', 'rdo_member'))
     or (p_action <> 'set_role' and p_role is not null) then
    raise exception 'RDO_TEAM_COMMAND_INVALID' using errcode = '22023';
  end if;

  lock table public.rdo_user_access in share row exclusive mode;

  select * into v_actor
  from public.rdo_user_access
  where user_id = p_actor_id
  for update;
  if not found or not v_actor.active or v_actor.role <> 'rdo_admin' then
    raise exception 'RDO_TEAM_ACTOR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target
  from public.rdo_user_access
  where user_id = p_target_id
  for update;
  if not found then
    raise exception 'RDO_TEAM_TARGET_NOT_ALLOWLISTED' using errcode = '42501';
  end if;

  if v_target.active
     and v_target.role = 'rdo_admin'
     and (p_action = 'suspend' or (p_action = 'set_role' and p_role = 'rdo_member')) then
    select count(*)::integer into v_active_admins
    from public.rdo_user_access
    where active and role = 'rdo_admin';
    if v_active_admins <= 1 then
      raise exception 'RDO_TEAM_LAST_ADMIN_PROTECTED' using errcode = '42501';
    end if;
  end if;

  if p_target_id = p_actor_id
     and (p_action = 'suspend' or (p_action = 'set_role' and p_role <> 'rdo_admin')) then
    raise exception 'RDO_TEAM_SELF_PROTECTION' using errcode = '42501';
  end if;

  update public.rdo_user_access
  set role = case when p_action = 'set_role' then p_role else role end,
      active = case when p_action = 'suspend' then false when p_action = 'reactivate' then true else active end,
      suspended_at = case
        when p_action = 'suspend' then now()
        when p_action = 'reactivate' then null
        else suspended_at
      end,
      suspended_by = case
        when p_action = 'suspend' then p_actor_id
        when p_action = 'reactivate' then null
        else suspended_by
      end,
      lock_version = lock_version + 1,
      updated_at = now()
  where user_id = p_target_id
  returning * into v_result;

  insert into public.rdo_audit_events (actor_id, action, event_data)
  values (
    p_actor_id,
    'team.' || p_action || '.completed',
    jsonb_build_object(
      'targetUserId', p_target_id,
      'operationId', p_operation_id,
      'correlationId', p_correlation_id,
      'role', v_result.role,
      'active', v_result.active,
      'lockVersion', v_result.lock_version
    )
  );

  return jsonb_build_object(
    'userId', v_result.user_id,
    'role', v_result.role,
    'active', v_result.active,
    'lockVersion', v_result.lock_version,
    'operationId', p_operation_id,
    'replayed', false
  );
end;
$$;

revoke all on function public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)
  to service_role;

-- A trilha RDO é append-only inclusive para service_role. A identidade autora
-- permanece referenciada: remover a conta Auth exige uma decisão explícita de
-- retenção, nunca uma atualização silenciosa no evento imutável.
alter table public.rdo_audit_events
  drop constraint if exists rdo_audit_events_actor_id_fkey;
alter table public.rdo_audit_events
  add constraint rdo_audit_events_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete restrict;

create or replace function private.rdo_reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'RDO audit records are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists rdo_audit_events_immutable on public.rdo_audit_events;
create trigger rdo_audit_events_immutable
before update or delete on public.rdo_audit_events
for each row execute function private.rdo_reject_audit_mutation();

revoke all on function private.rdo_reject_audit_mutation()
  from public, anon, authenticated;
