-- EV2.1 — fundação aditiva: flags fail-closed, command receipts e release vazio.
-- Nenhuma capacidade é ativada, nenhum conteúdo é publicado e nenhum dado real é criado.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:flags.read', 'Avaliar flags disponíveis no escopo do CMS.', false),
  ('cms:flags.manage', 'Alterar rollout e kill switches do CMS.', true),
  ('cms:releases.read', 'Consultar releases e seus estados.', false),
  ('cms:releases.create', 'Criar release sem publicar conteúdo.', false),
  ('cms:releases.cancel', 'Cancelar release ainda não publicado.', true),
  ('cms:releases.rollback', 'Executar rollback auditável de release.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, 'cms:flags.read'
from public.cms_roles
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select 'super_admin', permission_key
from public.cms_permissions
where permission_key in (
  'cms:flags.manage',
  'cms:releases.read',
  'cms:releases.create',
  'cms:releases.cancel',
  'cms:releases.rollback'
)
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('admin', 'cms:releases.read'),
  ('admin', 'cms:releases.create'),
  ('admin', 'cms:releases.cancel'),
  ('admin', 'cms:releases.rollback'),
  ('reviewer', 'cms:releases.read')
on conflict do nothing;

create table public.cms_feature_flags (
  flag_key text primary key check (flag_key ~ '^ev2\.[a-z][a-z0-9_]{1,63}$'),
  description text not null check (char_length(description) between 3 and 500),
  owner_key text not null check (char_length(owner_key) between 2 and 120),
  default_enabled boolean not null default false check (default_enabled is false),
  kill_switch boolean not null default false,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.cms_feature_flags (flag_key) on delete cascade,
  environment text not null check (environment in ('local', 'staging', 'production')),
  scope_type text not null check (scope_type in ('global', 'environment', 'site', 'user')),
  scope_key text not null check (char_length(scope_key) between 1 and 160),
  enabled boolean not null,
  reason text not null check (char_length(reason) between 3 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flag_key, environment, scope_type, scope_key),
  check (expires_at > starts_at),
  check (
    (scope_type = 'global' and scope_key = '*')
    or (scope_type = 'environment' and scope_key = environment)
    or scope_type in ('site', 'user')
  )
);

create table public.cms_release_packages (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  environment text not null check (environment in ('local', 'staging')),
  status text not null default 'draft' check (status in ('draft', 'canceled', 'rolled_back')),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) between 3 and 500),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  canceled_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'canceled') = (canceled_at is not null)),
  check ((status = 'rolled_back') = (rolled_back_at is not null))
);

create table public.cms_release_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('create', 'cancel', 'rollback')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  release_id uuid references public.cms_release_packages (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('created', 'canceled', 'rolled_back')),
  from_status text,
  to_status text not null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index cms_feature_flag_overrides_lookup_idx
  on public.cms_feature_flag_overrides (flag_key, environment, scope_type, scope_key, expires_at desc);
create index cms_release_packages_status_idx
  on public.cms_release_packages (environment, site_key, status, updated_at desc);
create index cms_release_events_release_idx
  on public.cms_release_events (release_id, occurred_at desc);

create trigger cms_feature_flags_touch_updated_at
before update on public.cms_feature_flags
for each row execute function public.cms_touch_updated_at();

create trigger cms_feature_flag_overrides_touch_updated_at
before update on public.cms_feature_flag_overrides
for each row execute function public.cms_touch_updated_at();

create trigger cms_release_packages_touch_updated_at
before update on public.cms_release_packages
for each row execute function public.cms_touch_updated_at();

create trigger cms_release_events_immutable
before update or delete on public.cms_release_events
for each row execute function public.cms_reject_immutable_mutation();

insert into public.cms_feature_flags (flag_key, description, owner_key)
values
  ('ev2.release_skeleton', 'Esqueleto de releases vazios da EV2.1.', 'tech_lead'),
  ('ev2.draft_v2', 'Rascunho progressivo e autosave v2.', 'product_owner'),
  ('ev2.master_data', 'Dados mestres e taxonomias versionadas.', 'data_steward'),
  ('ev2.pim_v2', 'Modelo PIM produto, modelo, variante e SKU.', 'data_steward'),
  ('ev2.dam', 'Biblioteca de mídia governada.', 'editorial_owner'),
  ('ev2.search_quality', 'Busca técnica e Centro de Qualidade.', 'tech_lead'),
  ('ev2.collaboration_bulk', 'Colaboração e operações em massa.', 'product_owner'),
  ('ev2.rbac_scoped', 'Permissões escopadas da EV2.', 'security_owner'),
  ('ev2.visual_studio', 'Estúdio Visual governado.', 'product_owner'),
  ('ev2.multisite', 'Capacidade multisite futura.', 'security_owner'),
  ('ev2.ai_assist', 'Assistência por IA com aprovação humana.', 'product_owner'),
  ('ev2.ai_execute', 'Execução transacional por IA.', 'security_owner')
on conflict (flag_key) do nothing;

create function public.cms_evaluate_feature_flag(
  p_actor_id uuid,
  p_flag_key text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_enabled boolean;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:flags.read', p_aal, p_session_id, p_issued_at
     ) then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'unavailable',
      'evaluatedAt', now()
    );
  end if;

  select * into v_flag
  from public.cms_feature_flags
  where flag_key = p_flag_key
    and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'unavailable',
      'evaluatedAt', now()
    );
  end if;

  if v_flag.kill_switch then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'kill_switch',
      'evaluatedAt', now()
    );
  end if;

  select override.enabled into v_enabled
  from public.cms_feature_flag_overrides override
  where override.flag_key = p_flag_key
    and override.environment = p_environment
    and override.starts_at <= now()
    and override.expires_at > now()
    and (
      (override.scope_type = 'user' and override.scope_key = p_actor_id::text)
      or (override.scope_type = 'site' and override.scope_key = p_site_key)
      or (override.scope_type = 'environment' and override.scope_key = p_environment)
      or (override.scope_type = 'global' and override.scope_key = '*')
    )
  order by case override.scope_type
    when 'user' then 40
    when 'site' then 30
    when 'environment' then 20
    else 10
  end desc, override.updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', v_enabled,
      'source', 'override',
      'evaluatedAt', now()
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'key', p_flag_key,
    'enabled', v_flag.default_enabled,
    'source', 'default',
    'evaluatedAt', now()
  );
end;
$$;

create function public.cms_execute_release_command(
  p_actor_id uuid,
  p_action text,
  p_release_id uuid,
  p_environment text,
  p_site_key text,
  p_expected_version bigint,
  p_reason text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_release_command_receipts%rowtype;
  v_release public.cms_release_packages%rowtype;
  v_from_status text;
  v_response jsonb;
  v_flag jsonb;
begin
  if p_action not in ('create', 'cancel', 'rollback')
     or p_environment not in ('local', 'staging')
     or p_site_key <> 'main'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'CMS_RELEASE_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_permission := case p_action
    when 'create' then 'cms:releases.create'
    when 'cancel' then 'cms:releases.cancel'
    when 'rollback' then 'cms:releases.rollback'
  end;
  if not public.cms_actor_authorized(
    p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_RELEASE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action = 'create' then
    v_flag := public.cms_evaluate_feature_flag(
      p_actor_id,
      'ev2.release_skeleton',
      p_environment,
      p_site_key,
      p_aal,
      p_session_id,
      p_issued_at
    );
    if coalesce((v_flag ->> 'enabled')::boolean, false) is not true then
      raise exception 'CMS_RELEASE_FEATURE_DISABLED' using errcode = '42501';
    end if;
    if p_release_id is not null or p_expected_version is not null then
      raise exception 'CMS_RELEASE_COMMAND_INVALID' using errcode = '22023';
    end if;
  elsif p_release_id is null or p_expected_version is null then
    raise exception 'CMS_RELEASE_COMMAND_INVALID' using errcode = '22023';
  end if;

  select * into v_receipt
  from public.cms_release_command_receipts
  where actor_id = p_actor_id
    and action = p_action
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_RELEASE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_RELEASE_COMMAND_IN_PROGRESS' using errcode = '40001';
    end if;
    return v_receipt.response;
  end if;

  insert into public.cms_release_command_receipts (
    actor_id,
    action,
    idempotency_key,
    command_id,
    request_hash,
    release_id,
    correlation_id
  ) values (
    p_actor_id,
    p_action,
    p_idempotency_key,
    p_command_id,
    p_request_hash,
    p_release_id,
    p_correlation_id
  );

  if p_action = 'create' then
    insert into public.cms_release_packages (
      site_key,
      environment,
      status,
      plan_hash,
      reason,
      created_by,
      updated_by,
      correlation_id
    ) values (
      p_site_key,
      p_environment,
      'draft',
      encode(extensions.digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
      btrim(p_reason),
      p_actor_id,
      p_actor_id,
      p_correlation_id
    ) returning * into v_release;

    update public.cms_release_command_receipts
    set release_id = v_release.id
    where actor_id = p_actor_id
      and action = p_action
      and idempotency_key = p_idempotency_key;
  else
    select * into v_release
    from public.cms_release_packages
    where id = p_release_id
      and environment = p_environment
      and site_key = p_site_key
    for update;
    if not found then
      raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_release.lock_version <> p_expected_version then
      raise exception 'CMS_RELEASE_CONFLICT' using errcode = '40001';
    end if;
    if p_action = 'cancel' and v_release.status <> 'draft' then
      raise exception 'CMS_RELEASE_TRANSITION_INVALID' using errcode = '23514';
    end if;
    if p_action = 'rollback' and v_release.status not in ('draft', 'canceled') then
      raise exception 'CMS_RELEASE_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_from_status := v_release.status;

    update public.cms_release_packages
    set status = case p_action when 'cancel' then 'canceled' else 'rolled_back' end,
      canceled_at = case p_action when 'cancel' then now() else null end,
      rolled_back_at = case p_action when 'rollback' then now() else null end,
      reason = btrim(p_reason),
      lock_version = lock_version + 1,
      updated_by = p_actor_id
    where id = v_release.id
    returning * into v_release;
  end if;

  insert into public.cms_release_events (
    release_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    event_data,
    correlation_id
  ) values (
    v_release.id,
    p_actor_id,
    case p_action
      when 'create' then 'created'
      when 'rollback' then 'rolled_back'
      else p_action
    end,
    v_from_status,
    v_release.status,
    jsonb_build_object('empty', true, 'lockVersion', v_release.lock_version),
    p_correlation_id
  );

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'releaseId', v_release.id,
    'status', v_release.status,
    'lockVersion', v_release.lock_version,
    'empty', true
  );

  update public.cms_release_command_receipts
  set release_id = v_release.id,
    response = v_response,
    completed_at = now()
  where actor_id = p_actor_id
    and action = p_action
    and idempotency_key = p_idempotency_key;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:releases.' || p_action,
    'release_package',
    v_release.id::text,
    jsonb_build_object('status', v_release.status, 'empty', true, 'lockVersion', v_release.lock_version),
    p_correlation_id
  );

  return v_response;
end;
$$;

create function public.cms_get_release_package(
  p_actor_id uuid,
  p_release_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_release public.cms_release_packages%rowtype;
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:releases.read', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_RELEASE_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_release
  from public.cms_release_packages
  where id = p_release_id
    and environment = p_environment
    and site_key = p_site_key;
  if not found then
    raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'releaseId', v_release.id,
    'status', v_release.status,
    'lockVersion', v_release.lock_version,
    'empty', true,
    'createdAt', v_release.created_at,
    'updatedAt', v_release.updated_at
  );
end;
$$;

alter table public.cms_feature_flags enable row level security;
alter table public.cms_feature_flag_overrides enable row level security;
alter table public.cms_release_packages enable row level security;
alter table public.cms_release_command_receipts enable row level security;
alter table public.cms_release_events enable row level security;

create policy "cms_feature_flags_authorized_read"
on public.cms_feature_flags for select to authenticated
using (public.cms_has_permission('cms:flags.read'));

create policy "cms_feature_flag_overrides_authorized_read"
on public.cms_feature_flag_overrides for select to authenticated
using (public.cms_has_permission('cms:flags.read'));

create policy "cms_release_packages_authorized_read"
on public.cms_release_packages for select to authenticated
using (public.cms_has_permission('cms:releases.read'));

create policy "cms_release_receipts_self_or_audit_read"
on public.cms_release_command_receipts for select to authenticated
using (actor_id = auth.uid() or public.cms_has_permission('cms:audit.read'));

create policy "cms_release_events_authorized_read"
on public.cms_release_events for select to authenticated
using (public.cms_has_permission('cms:releases.read'));

revoke all on table
  public.cms_feature_flags,
  public.cms_feature_flag_overrides,
  public.cms_release_packages,
  public.cms_release_command_receipts,
  public.cms_release_events
from public, anon, authenticated;

grant select on table
  public.cms_feature_flags,
  public.cms_feature_flag_overrides,
  public.cms_release_packages,
  public.cms_release_command_receipts,
  public.cms_release_events
to authenticated;

grant all on table
  public.cms_feature_flags,
  public.cms_feature_flag_overrides,
  public.cms_release_packages,
  public.cms_release_command_receipts,
  public.cms_release_events
to service_role;

revoke all on function public.cms_evaluate_feature_flag(uuid, text, text, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.cms_execute_release_command(uuid, text, uuid, text, text, bigint, text, text, text, timestamptz, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.cms_get_release_package(uuid, uuid, text, text, text, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.cms_evaluate_feature_flag(uuid, text, text, text, text, text, timestamptz)
to service_role;
grant execute on function public.cms_execute_release_command(uuid, text, uuid, text, text, bigint, text, text, text, timestamptz, uuid, uuid, text, uuid)
to service_role;
grant execute on function public.cms_get_release_package(uuid, uuid, text, text, text, text, timestamptz)
to service_role;
