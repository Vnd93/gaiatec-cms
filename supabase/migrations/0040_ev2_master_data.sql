-- EV2.3 — dados mestres aditivos, aliases e compatibilidades N:N versionadas.
-- A capacidade permanece default-off, não faz backfill e não altera contratos/publicação v1.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:masterdata.read', 'Consultar dados mestres EV2.', false),
  ('cms:masterdata.manage', 'Criar e versionar dados mestres EV2.', false),
  ('cms:masterdata.merge', 'Mesclar entidades duplicadas de dados mestres EV2.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:masterdata.read'),
  ('super_admin', 'cms:masterdata.manage'),
  ('super_admin', 'cms:masterdata.merge'),
  ('admin', 'cms:masterdata.read'),
  ('admin', 'cms:masterdata.manage'),
  ('admin', 'cms:masterdata.merge'),
  ('technical', 'cms:masterdata.read'),
  ('technical', 'cms:masterdata.manage'),
  ('editor', 'cms:masterdata.read'),
  ('reviewer', 'cms:masterdata.read'),
  ('commercial', 'cms:masterdata.read'),
  ('marketing', 'cms:masterdata.read')
on conflict do nothing;

create function public.cms_normalize_master_name(p_value text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select btrim(
    regexp_replace(
      translate(
        lower(btrim(p_value)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñ',
        'aaaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create table public.cms_master_entities (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  entity_type text not null check (
    entity_type in (
      'manufacturer', 'brand', 'line', 'category', 'magnitude',
      'technology', 'installation', 'monitored_element'
    )
  ),
  canonical_name text not null check (char_length(btrim(canonical_name)) between 1 and 180),
  normalized_name text not null check (char_length(normalized_name) between 1 and 180),
  description text not null default '' check (char_length(description) <= 1000),
  external_domain text check (
    external_domain is null
    or external_domain ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
  ),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  status text not null default 'active' check (status in ('active', 'inactive', 'merged')),
  merged_into_id uuid references public.cms_master_entities (id) on delete restrict,
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'merged' and merged_into_id is not null and merged_into_id <> id)
    or (status <> 'merged' and merged_into_id is null)
  )
);

create unique index cms_master_entities_name_active_uidx
  on public.cms_master_entities (site_key, entity_type, normalized_name)
  where status <> 'merged';
create unique index cms_master_entities_domain_active_uidx
  on public.cms_master_entities (site_key, entity_type, external_domain)
  where external_domain is not null and status <> 'merged';
create index cms_master_entities_lookup_idx
  on public.cms_master_entities (site_key, entity_type, status, normalized_name);

create table public.cms_master_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.cms_master_entities (id) on delete restrict,
  site_key text not null check (site_key = 'main'),
  entity_type text not null check (
    entity_type in (
      'manufacturer', 'brand', 'line', 'category', 'magnitude',
      'technology', 'installation', 'monitored_element'
    )
  ),
  alias text not null check (char_length(btrim(alias)) between 1 and 180),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 180),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy', 'merge')),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, entity_type, normalized_alias)
);

create index cms_master_aliases_entity_idx
  on public.cms_master_entity_aliases (entity_id, normalized_alias);

create table public.cms_master_relation_rules (
  relation_type text primary key check (relation_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  source_type text not null check (
    source_type in (
      'manufacturer', 'brand', 'line', 'category', 'magnitude',
      'technology', 'installation', 'monitored_element'
    )
  ),
  target_type text not null check (
    target_type in (
      'manufacturer', 'brand', 'line', 'category', 'magnitude',
      'technology', 'installation', 'monitored_element'
    )
  ),
  label text not null check (char_length(label) between 3 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (source_type <> target_type)
);

insert into public.cms_master_relation_rules (relation_type, source_type, target_type, label)
values
  ('manufacturer_brand', 'manufacturer', 'brand', 'Marcas do fabricante'),
  ('brand_line', 'brand', 'line', 'Linhas da marca'),
  ('category_magnitude', 'category', 'magnitude', 'Grandezas da categoria'),
  ('category_technology', 'category', 'technology', 'Tecnologias da categoria'),
  ('category_installation', 'category', 'installation', 'Instalações da categoria'),
  ('category_monitored_element', 'category', 'monitored_element', 'Elementos monitorados da categoria')
on conflict (relation_type) do nothing;

create table public.cms_master_compatibilities (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  relation_type text not null references public.cms_master_relation_rules (relation_type) on delete restrict,
  source_entity_id uuid not null references public.cms_master_entities (id) on delete restrict,
  target_entity_id uuid not null references public.cms_master_entities (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  version bigint not null default 1 check (version > 0),
  lock_version bigint not null default 1 check (lock_version > 0),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_entity_id <> target_entity_id),
  check (
    (status = 'active' and effective_to is null)
    or (status = 'inactive' and effective_to is not null and effective_to >= effective_from)
  )
);

create unique index cms_master_compatibilities_active_uidx
  on public.cms_master_compatibilities (site_key, relation_type, source_entity_id, target_entity_id)
  where status = 'active';
create index cms_master_compatibilities_source_idx
  on public.cms_master_compatibilities (site_key, relation_type, source_entity_id, status, effective_from desc);

create table public.cms_master_data_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (
    action in (
      'create_entity', 'update_entity', 'set_entity_status', 'merge_entities', 'restore_merge',
      'upsert_alias', 'upsert_compatibility', 'set_compatibility_status'
    )
  ),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_master_data_events (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.cms_master_entities (id) on delete restrict,
  compatibility_id uuid references public.cms_master_compatibilities (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in (
      'entity_created', 'entity_updated', 'entity_status_changed', 'entities_merged',
      'entity_merge_restored',
      'alias_upserted', 'compatibility_upserted', 'compatibility_status_changed'
    )
  ),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  check (entity_id is not null or compatibility_id is not null)
);

create index cms_master_data_events_entity_idx
  on public.cms_master_data_events (entity_id, occurred_at desc);
create index cms_master_data_events_compatibility_idx
  on public.cms_master_data_events (compatibility_id, occurred_at desc);

create function public.cms_prepare_master_entity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.canonical_name := btrim(new.canonical_name);
  new.normalized_name := public.cms_normalize_master_name(new.canonical_name);
  new.external_domain := nullif(lower(btrim(new.external_domain)), '');
  return new;
end;
$$;

create function public.cms_prepare_master_alias()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entity public.cms_master_entities%rowtype;
begin
  select * into v_entity from public.cms_master_entities where id = new.entity_id;
  if not found or v_entity.status = 'merged' then
    raise exception 'CMS_MASTER_DATA_ENTITY_INVALID' using errcode = '23514';
  end if;
  new.site_key := v_entity.site_key;
  new.entity_type := v_entity.entity_type;
  new.alias := btrim(new.alias);
  new.normalized_alias := public.cms_normalize_master_name(new.alias);
  if new.normalized_alias = v_entity.normalized_name then
    raise exception 'CMS_MASTER_DATA_ALIAS_REDUNDANT' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.cms_master_entities entity
    where entity.site_key = new.site_key
      and entity.entity_type = new.entity_type
      and entity.normalized_name = new.normalized_alias
      and entity.status <> 'merged'
      and entity.id <> new.entity_id
  ) then
    raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function public.cms_validate_master_compatibility()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rule public.cms_master_relation_rules%rowtype;
  v_source public.cms_master_entities%rowtype;
  v_target public.cms_master_entities%rowtype;
begin
  select * into v_rule
  from public.cms_master_relation_rules
  where relation_type = new.relation_type and active;
  select * into v_source from public.cms_master_entities where id = new.source_entity_id;
  select * into v_target from public.cms_master_entities where id = new.target_entity_id;
  if v_rule.relation_type is null
     or v_source.id is null
     or v_target.id is null
     or v_source.site_key <> new.site_key
     or v_target.site_key <> new.site_key
     or v_source.entity_type <> v_rule.source_type
     or v_target.entity_type <> v_rule.target_type
     or (new.status = 'active' and (v_source.status <> 'active' or v_target.status <> 'active')) then
    raise exception 'CMS_MASTER_DATA_RELATION_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cms_master_entities_prepare
before insert or update of canonical_name, external_domain on public.cms_master_entities
for each row execute function public.cms_prepare_master_entity();

create trigger cms_master_entities_touch_updated_at
before update on public.cms_master_entities
for each row execute function public.cms_touch_updated_at();

create trigger cms_master_aliases_prepare
before insert or update of entity_id, alias on public.cms_master_entity_aliases
for each row execute function public.cms_prepare_master_alias();

create trigger cms_master_aliases_touch_updated_at
before update on public.cms_master_entity_aliases
for each row execute function public.cms_touch_updated_at();

create trigger cms_master_compatibilities_validate
before insert or update of site_key, relation_type, source_entity_id, target_entity_id, status
on public.cms_master_compatibilities
for each row execute function public.cms_validate_master_compatibility();

create trigger cms_master_compatibilities_touch_updated_at
before update on public.cms_master_compatibilities
for each row execute function public.cms_touch_updated_at();

create trigger cms_master_data_events_immutable
before update or delete on public.cms_master_data_events
for each row execute function public.cms_reject_immutable_mutation();

create function public.cms_reject_master_data_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'CMS_MASTER_DATA_DELETE_FORBIDDEN' using errcode = '42501';
end;
$$;

create trigger cms_master_entities_no_delete
before delete on public.cms_master_entities
for each row execute function public.cms_reject_master_data_delete();
create trigger cms_master_aliases_no_delete
before delete on public.cms_master_entity_aliases
for each row execute function public.cms_reject_master_data_delete();
create trigger cms_master_compatibilities_no_delete
before delete on public.cms_master_compatibilities
for each row execute function public.cms_reject_master_data_delete();

create function public.cms_execute_master_data_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
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
set search_path = public, pg_temp
as $$
declare
  v_permission text;
  v_flag jsonb;
  v_receipt public.cms_master_data_command_receipts%rowtype;
  v_entity public.cms_master_entities%rowtype;
  v_target public.cms_master_entities%rowtype;
  v_alias public.cms_master_entity_aliases%rowtype;
  v_compatibility public.cms_master_compatibilities%rowtype;
  v_expected_version bigint;
  v_entity_id uuid;
  v_target_id uuid;
  v_compatibility_id uuid;
  v_normalized text;
  v_response jsonb;
begin
  if p_action is null
     or p_action not in (
       'create_entity', 'update_entity', 'set_entity_status', 'merge_entities', 'restore_merge',
       'upsert_alias', 'upsert_compatibility', 'set_compatibility_status'
     )
     or p_environment is null
     or p_environment not in ('local', 'staging')
     or p_site_key is null
     or p_site_key <> 'main'
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
  end if;

  if (
       p_action in (
         'update_entity', 'set_entity_status', 'merge_entities', 'restore_merge',
         'upsert_alias', 'set_compatibility_status'
       )
       or (p_action = 'upsert_compatibility' and p_payload ? 'compatibilityId')
     ) and (
       not (p_payload ? 'expectedVersion')
       or nullif(p_payload ->> 'expectedVersion', '') is null
     ) then
    raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_action in (
       'set_entity_status', 'merge_entities', 'restore_merge', 'set_compatibility_status'
     ) and char_length(btrim(coalesce(p_payload ->> 'reason', ''))) < 3 then
    raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_permission := case when p_action in ('merge_entities', 'restore_merge')
    then 'cms:masterdata.merge' else 'cms:masterdata.manage' end;
  if not public.cms_actor_authorized(
    p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_MASTER_DATA_FORBIDDEN' using errcode = '42501';
  end if;

  v_flag := public.cms_evaluate_feature_flag(
    p_actor_id, 'ev2.master_data', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_MASTER_DATA_FEATURE_DISABLED' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.cms_master_data_command_receipts
  where actor_id = p_actor_id
    and action = p_action
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_MASTER_DATA_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_MASTER_DATA_COMMAND_IN_PROGRESS' using errcode = '40001';
    end if;
    return v_receipt.response;
  end if;

  insert into public.cms_master_data_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  );

  if p_action = 'create_entity' then
    v_normalized := public.cms_normalize_master_name(p_payload ->> 'name');
    if exists (
      select 1 from public.cms_master_entities entity
      where entity.site_key = p_site_key
        and entity.entity_type = p_payload ->> 'entityType'
        and entity.normalized_name = v_normalized
        and entity.status <> 'merged'
    ) or exists (
      select 1 from public.cms_master_entity_aliases alias
      where alias.site_key = p_site_key
        and alias.entity_type = p_payload ->> 'entityType'
        and alias.normalized_alias = v_normalized
    ) then
      raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
    end if;
    insert into public.cms_master_entities (
      site_key, entity_type, canonical_name, normalized_name, description,
      external_domain, source_type, source_ref, created_by, updated_by
    ) values (
      p_site_key,
      p_payload ->> 'entityType',
      p_payload ->> 'name',
      v_normalized,
      coalesce(p_payload ->> 'description', ''),
      nullif(p_payload ->> 'externalDomain', ''),
      coalesce(p_payload ->> 'sourceType', 'manual'),
      nullif(p_payload ->> 'sourceRef', ''),
      p_actor_id,
      p_actor_id
    ) returning * into v_entity;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'entityId', v_entity.id, 'status', v_entity.status,
      'lockVersion', v_entity.lock_version, 'replayed', false
    );

  elsif p_action in ('update_entity', 'set_entity_status') then
    v_entity_id := (p_payload ->> 'entityId')::uuid;
    v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    select * into v_entity
    from public.cms_master_entities
    where id = v_entity_id and site_key = p_site_key
    for update;
    if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_entity.lock_version <> v_expected_version then
      raise exception 'CMS_MASTER_DATA_CONFLICT' using errcode = 'P0001';
    end if;
    if v_entity.status = 'merged' then
      raise exception 'CMS_MASTER_DATA_ENTITY_MERGED' using errcode = '23514';
    end if;

    if p_action = 'update_entity' then
      v_normalized := public.cms_normalize_master_name(p_payload ->> 'name');
      if exists (
        select 1 from public.cms_master_entities entity
        where entity.site_key = p_site_key
          and entity.entity_type = v_entity.entity_type
          and entity.normalized_name = v_normalized
          and entity.status <> 'merged'
          and entity.id <> v_entity.id
      ) or exists (
        select 1 from public.cms_master_entity_aliases alias
        where alias.site_key = p_site_key
          and alias.entity_type = v_entity.entity_type
          and alias.normalized_alias = v_normalized
          and alias.entity_id <> v_entity.id
      ) then
        raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
      end if;
      update public.cms_master_entities
      set canonical_name = p_payload ->> 'name',
        description = coalesce(p_payload ->> 'description', ''),
        external_domain = nullif(p_payload ->> 'externalDomain', ''),
        source_type = coalesce(p_payload ->> 'sourceType', source_type),
        source_ref = nullif(p_payload ->> 'sourceRef', ''),
        lock_version = lock_version + 1,
        updated_by = p_actor_id
      where id = v_entity.id
      returning * into v_entity;
    else
      if p_payload ->> 'status' not in ('active', 'inactive') then
        raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
      end if;
      if p_payload ->> 'status' = 'active' and exists (
        select 1 from public.cms_master_entities entity
        where entity.site_key = p_site_key
          and entity.entity_type = v_entity.entity_type
          and entity.normalized_name = v_entity.normalized_name
          and entity.status <> 'merged'
          and entity.id <> v_entity.id
      ) then
        raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
      end if;
      update public.cms_master_entities
      set status = p_payload ->> 'status',
        lock_version = lock_version + 1,
        updated_by = p_actor_id
      where id = v_entity.id
      returning * into v_entity;
    end if;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'entityId', v_entity.id, 'status', v_entity.status,
      'lockVersion', v_entity.lock_version, 'replayed', false
    );

  elsif p_action = 'merge_entities' then
    v_entity_id := (p_payload ->> 'sourceEntityId')::uuid;
    v_target_id := (p_payload ->> 'targetEntityId')::uuid;
    v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    if v_entity_id = v_target_id then
      raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
    end if;
    select * into v_entity from public.cms_master_entities
    where id = v_entity_id and site_key = p_site_key for update;
    if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    select * into v_target from public.cms_master_entities
    where id = v_target_id and site_key = p_site_key for update;
    if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_entity.lock_version <> v_expected_version then
      raise exception 'CMS_MASTER_DATA_CONFLICT' using errcode = 'P0001';
    end if;
    if v_entity.status = 'merged'
       or v_target.status <> 'active'
       or v_entity.entity_type <> v_target.entity_type then
      raise exception 'CMS_MASTER_DATA_MERGE_INVALID' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.cms_master_entity_aliases alias
      where alias.site_key = p_site_key
        and alias.entity_type = v_entity.entity_type
        and alias.normalized_alias = v_entity.normalized_name
        and alias.entity_id not in (v_entity.id, v_target.id)
    ) then
      raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
    end if;
    -- Keep aliases and compatibility references attached to the archived source.
    -- Reads resolve merged sources to their active target, which makes the merge
    -- reversible without deleting or rewriting historical identities.
    update public.cms_master_entities
    set status = 'merged', merged_into_id = v_target.id,
      lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_entity.id
    returning * into v_entity;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'entityId', v_entity.id, 'targetEntityId', v_target.id,
      'status', v_entity.status, 'lockVersion', v_entity.lock_version, 'replayed', false
    );

  elsif p_action = 'restore_merge' then
    v_entity_id := (p_payload ->> 'sourceEntityId')::uuid;
    v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    select * into v_entity from public.cms_master_entities
    where id = v_entity_id and site_key = p_site_key for update;
    if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_entity.lock_version <> v_expected_version then
      raise exception 'CMS_MASTER_DATA_CONFLICT' using errcode = 'P0001';
    end if;
    if v_entity.status <> 'merged' or v_entity.merged_into_id is null then
      raise exception 'CMS_MASTER_DATA_RESTORE_INVALID' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.cms_master_entities entity
      where entity.site_key = p_site_key
        and entity.entity_type = v_entity.entity_type
        and entity.normalized_name = v_entity.normalized_name
        and entity.status <> 'merged'
        and entity.id <> v_entity.id
    ) or exists (
      select 1 from public.cms_master_entity_aliases alias
      where alias.site_key = p_site_key
        and alias.entity_type = v_entity.entity_type
        and alias.normalized_alias = v_entity.normalized_name
        and alias.entity_id <> v_entity.id
    ) then
      raise exception 'CMS_MASTER_DATA_DUPLICATE' using errcode = 'P0001';
    end if;
    v_target_id := v_entity.merged_into_id;
    update public.cms_master_entities
    set status = 'active', merged_into_id = null,
      lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_entity.id
    returning * into v_entity;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'entityId', v_entity.id, 'targetEntityId', v_target_id,
      'status', v_entity.status, 'lockVersion', v_entity.lock_version, 'replayed', false
    );

  elsif p_action = 'upsert_alias' then
    v_entity_id := (p_payload ->> 'entityId')::uuid;
    v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    select * into v_entity from public.cms_master_entities
    where id = v_entity_id and site_key = p_site_key for update;
    if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_entity.lock_version <> v_expected_version then
      raise exception 'CMS_MASTER_DATA_CONFLICT' using errcode = 'P0001';
    end if;
    if p_payload ? 'aliasId' then
      update public.cms_master_entity_aliases
      set alias = p_payload ->> 'alias',
        source_type = coalesce(p_payload ->> 'sourceType', source_type),
        updated_by = p_actor_id
      where id = (p_payload ->> 'aliasId')::uuid and entity_id = v_entity.id
      returning * into v_alias;
      if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
    else
      insert into public.cms_master_entity_aliases (
        entity_id, site_key, entity_type, alias, normalized_alias,
        source_type, created_by, updated_by
      ) values (
        v_entity.id, p_site_key, v_entity.entity_type, p_payload ->> 'alias',
        public.cms_normalize_master_name(p_payload ->> 'alias'),
        coalesce(p_payload ->> 'sourceType', 'manual'), p_actor_id, p_actor_id
      ) returning * into v_alias;
    end if;
    update public.cms_master_entities
    set lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_entity.id returning * into v_entity;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'entityId', v_entity.id, 'aliasId', v_alias.id,
      'status', v_entity.status, 'lockVersion', v_entity.lock_version, 'replayed', false
    );

  elsif p_action in ('upsert_compatibility', 'set_compatibility_status') then
    if p_payload ? 'compatibilityId' then
      v_compatibility_id := (p_payload ->> 'compatibilityId')::uuid;
      v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
      select * into v_compatibility from public.cms_master_compatibilities
      where id = v_compatibility_id and site_key = p_site_key for update;
      if not found then raise exception 'CMS_MASTER_DATA_NOT_FOUND' using errcode = 'P0002'; end if;
      if v_compatibility.lock_version <> v_expected_version then
        raise exception 'CMS_MASTER_DATA_CONFLICT' using errcode = 'P0001';
      end if;
      update public.cms_master_compatibilities
      set status = case when p_action = 'set_compatibility_status'
          then p_payload ->> 'status' else 'active' end,
        effective_to = case
          when p_action = 'set_compatibility_status' and p_payload ->> 'status' = 'inactive' then now()
          else null end,
        source_ref = case when p_action = 'upsert_compatibility'
          then nullif(p_payload ->> 'sourceRef', '') else source_ref end,
        version = version + 1,
        lock_version = lock_version + 1,
        updated_by = p_actor_id
      where id = v_compatibility.id
      returning * into v_compatibility;
    else
      if p_action <> 'upsert_compatibility' then
        raise exception 'CMS_MASTER_DATA_COMMAND_INVALID' using errcode = '22023';
      end if;
      insert into public.cms_master_compatibilities (
        site_key, relation_type, source_entity_id, target_entity_id,
        source_type, source_ref, created_by, updated_by
      ) values (
        p_site_key, p_payload ->> 'relationType',
        (p_payload ->> 'sourceEntityId')::uuid,
        (p_payload ->> 'targetEntityId')::uuid,
        coalesce(p_payload ->> 'sourceType', 'manual'),
        nullif(p_payload ->> 'sourceRef', ''), p_actor_id, p_actor_id
      ) returning * into v_compatibility;
    end if;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id,
      'compatibilityId', v_compatibility.id, 'status', v_compatibility.status,
      'lockVersion', v_compatibility.lock_version,
      'version', v_compatibility.version, 'replayed', false
    );
  end if;

  insert into public.cms_master_data_events (
    entity_id, compatibility_id, actor_id, event_type, event_data, correlation_id
  ) values (
    case when p_action in ('upsert_compatibility', 'set_compatibility_status')
      then null else v_entity.id end,
    case when p_action in ('upsert_compatibility', 'set_compatibility_status')
      then v_compatibility.id else null end,
    p_actor_id,
    case p_action
      when 'create_entity' then 'entity_created'
      when 'update_entity' then 'entity_updated'
      when 'set_entity_status' then 'entity_status_changed'
      when 'merge_entities' then 'entities_merged'
      when 'restore_merge' then 'entity_merge_restored'
      when 'upsert_alias' then 'alias_upserted'
      when 'upsert_compatibility' then 'compatibility_upserted'
      else 'compatibility_status_changed'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'status', coalesce(v_entity.status, v_compatibility.status),
      'lockVersion', coalesce(v_entity.lock_version, v_compatibility.lock_version),
      'targetEntityId', case
        when p_action = 'merge_entities' then v_target.id
        when p_action = 'restore_merge' then v_target_id
        else null
      end,
      'reason', nullif(p_payload ->> 'reason', '')
    )),
    p_correlation_id
  );

  update public.cms_master_data_command_receipts
  set response = v_response, completed_at = now()
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:masterdata.' || p_action,
    case when p_action in ('upsert_compatibility', 'set_compatibility_status')
      then 'master_compatibility' else 'master_entity' end,
    coalesce(v_entity.id, v_compatibility.id)::text,
    jsonb_build_object(
      'status', coalesce(v_entity.status, v_compatibility.status),
      'lockVersion', coalesce(v_entity.lock_version, v_compatibility.lock_version)
    ),
    p_correlation_id
  );

  return v_response;
end;
$$;

alter table public.cms_master_entities enable row level security;
alter table public.cms_master_entity_aliases enable row level security;
alter table public.cms_master_relation_rules enable row level security;
alter table public.cms_master_compatibilities enable row level security;
alter table public.cms_master_data_command_receipts enable row level security;
alter table public.cms_master_data_events enable row level security;

revoke all on table
  public.cms_master_entities,
  public.cms_master_entity_aliases,
  public.cms_master_relation_rules,
  public.cms_master_compatibilities,
  public.cms_master_data_command_receipts,
  public.cms_master_data_events
from public, anon, authenticated;

grant all on table
  public.cms_master_entities,
  public.cms_master_entity_aliases,
  public.cms_master_relation_rules,
  public.cms_master_compatibilities,
  public.cms_master_data_command_receipts,
  public.cms_master_data_events
to service_role;

revoke all on function public.cms_normalize_master_name(text) from public, anon, authenticated;
revoke all on function public.cms_prepare_master_entity() from public, anon, authenticated;
revoke all on function public.cms_prepare_master_alias() from public, anon, authenticated;
revoke all on function public.cms_validate_master_compatibility() from public, anon, authenticated;
revoke all on function public.cms_reject_master_data_delete() from public, anon, authenticated;
revoke all on function public.cms_execute_master_data_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
from public, anon, authenticated;

grant execute on function public.cms_execute_master_data_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
to service_role;
