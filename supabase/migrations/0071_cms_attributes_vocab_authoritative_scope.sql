-- Authoritative QA/corporate segregation for attribute catalogs and controlled
-- vocabularies. This migration also closes the legacy vocabulary upsert/IDOR
-- boundary, adds optimistic versions and compensates QA-only natural keys when
-- the immutable actor lease becomes terminal.

create or replace function private.cms_pim_unit_scope_allowed(
  p_actor_id uuid,
  p_unit_code text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_pim_units unit
    join public.cms_pim_units canonical on canonical.code = unit.canonical_code
    where unit.code = p_unit_code
      and private.cms_actor_row_scope_allowed(
        p_actor_id, unit.created_by, unit.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, unit.updated_by, unit.updated_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, canonical.created_by, canonical.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, canonical.updated_by, canonical.updated_at, p_environment
      )
  );
$$;

create or replace function private.cms_pim_attribute_definition_scope_allowed(
  p_actor_id uuid,
  p_definition_id uuid,
  p_environment text,
  p_site_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_pim_attribute_definitions definition
    where definition.id = p_definition_id
      and p_site_key = 'main'
      and definition.site_key = p_site_key
      and private.cms_actor_row_scope_allowed(
        p_actor_id, definition.created_by, definition.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, definition.updated_by, definition.updated_at, p_environment
      )
      and (
        definition.canonical_unit_code is null
        or private.cms_pim_unit_scope_allowed(
          p_actor_id, definition.canonical_unit_code, p_environment
        )
      )
  );
$$;

create or replace function private.cms_pim_attribute_set_scope_allowed(
  p_actor_id uuid,
  p_attribute_set_id uuid,
  p_environment text,
  p_site_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_pim_attribute_sets attribute_set
    where attribute_set.id = p_attribute_set_id
      and p_site_key = 'main'
      and attribute_set.site_key = p_site_key
      and private.cms_actor_row_scope_allowed(
        p_actor_id, attribute_set.created_by, attribute_set.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, attribute_set.updated_by, attribute_set.updated_at, p_environment
      )
      and private.cms_master_entity_scope_allowed(
        p_actor_id, attribute_set.category_id, p_environment, p_site_key
      )
      and not exists (
        select 1
        from public.cms_pim_attribute_set_versions version
        where version.attribute_set_id = attribute_set.id
          and not private.cms_actor_row_scope_allowed(
            p_actor_id, version.created_by, version.created_at, p_environment
          )
      )
      and not exists (
        select 1
        from public.cms_pim_attribute_set_versions version
        join public.cms_pim_attribute_set_definitions assignment
          on assignment.attribute_set_version_id = version.id
        where version.attribute_set_id = attribute_set.id
          and not private.cms_pim_attribute_definition_scope_allowed(
            p_actor_id, assignment.definition_id, p_environment, p_site_key
          )
      )
  );
$$;

create or replace function public.cms_attributes_catalog_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_category_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with scoped_set as (
    select attribute_set.*
    from public.cms_pim_attribute_sets attribute_set
    where attribute_set.site_key = p_site_key
      and attribute_set.category_id = p_category_id
      and attribute_set.status = 'active'
      and private.cms_pim_attribute_set_scope_allowed(
        p_actor_id, attribute_set.id, p_environment, p_site_key
      )
    order by attribute_set.id
    limit 1
  ),
  scoped_version as (
    select version.*
    from public.cms_pim_attribute_set_versions version
    join scoped_set attribute_set on attribute_set.id = version.attribute_set_id
    where version.status = 'active'
      and private.cms_actor_row_scope_allowed(
        p_actor_id, version.created_by, version.created_at, p_environment
      )
    order by version.version desc, version.id
    limit 1
  )
  select jsonb_build_object(
    'attribute_set', (
      select jsonb_build_object(
        'id', attribute_set.id,
        'category_id', attribute_set.category_id,
        'name', attribute_set.name,
        'version_id', version.id,
        'version', version.version
      )
      from scoped_set attribute_set
      join scoped_version version on version.attribute_set_id = attribute_set.id
    ),
    'definitions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', definition.id,
            'attribute_key', definition.attribute_key,
            'label', definition.label,
            'description', definition.description,
            'data_type', definition.data_type,
            'canonical_unit_code', definition.canonical_unit_code,
            'enum_options', definition.enum_options,
            'filterable', definition.filterable,
            'comparable', definition.comparable,
            'searchable', definition.searchable,
            'required', assignment.required,
            'inherited', assignment.inherited,
            'position', assignment.position
          ) order by assignment.position, definition.id
        )
        from scoped_version version
        join public.cms_pim_attribute_set_definitions assignment
          on assignment.attribute_set_version_id = version.id
        join public.cms_pim_attribute_definitions definition
          on definition.id = assignment.definition_id
        where definition.status = 'active'
          and private.cms_pim_attribute_definition_scope_allowed(
            p_actor_id, definition.id, p_environment, p_site_key
          )
      ),
      '[]'::jsonb
    ),
    'units', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', unit.code,
            'label', unit.label,
            'symbol', unit.symbol,
            'dimension_key', unit.dimension_key,
            'canonical_code', unit.canonical_code,
            'factor_to_canonical', unit.factor_to_canonical,
            'offset_to_canonical', unit.offset_to_canonical
          ) order by unit.dimension_key, unit.code
        )
        from public.cms_pim_units unit
        where unit.active
          and private.cms_pim_unit_scope_allowed(
            p_actor_id, unit.code, p_environment
          )
      ),
      '[]'::jsonb
    )
  )
  where p_site_key = 'main'
    and p_environment in ('local', 'staging', 'production');
$$;

alter table public.cms_controlled_lists
  add column if not exists lock_version bigint not null default 1
  check (lock_version > 0);
alter table public.cms_controlled_options
  add column if not exists lock_version bigint not null default 1
  check (lock_version > 0);

create or replace function private.cms_controlled_list_scope_allowed(
  p_actor_id uuid,
  p_list_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_controlled_lists list
    where list.id = p_list_id
      and p_environment in ('local', 'staging', 'production')
      and private.cms_actor_row_scope_allowed(
        p_actor_id, list.created_by, list.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, list.updated_by, list.updated_at, p_environment
      )
      and not exists (
        select 1
        from public.cms_controlled_options option
        where option.list_id = list.id
          and (
            not private.cms_actor_row_scope_allowed(
              p_actor_id, option.created_by, option.created_at, p_environment
            )
            or not private.cms_actor_row_scope_allowed(
              p_actor_id, option.updated_by, option.updated_at, p_environment
            )
          )
      )
  );
$$;

create or replace function public.cms_controlled_vocabularies_scoped(
  p_actor_id uuid,
  p_environment text,
  p_entity_type text,
  p_include_inactive boolean,
  p_limit integer default 500
)
returns table (
  id uuid,
  list_key text,
  entity_type text,
  dimension_key text,
  label text,
  description text,
  public_visible boolean,
  active boolean,
  sort_order integer,
  lock_version bigint,
  updated_at timestamptz,
  cms_controlled_options jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    list.id,
    list.list_key,
    list.entity_type,
    list.dimension_key,
    list.label,
    list.description,
    list.public_visible,
    list.active,
    list.sort_order,
    list.lock_version,
    list.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', option.id,
            'slug', option.slug,
            'label', option.label,
            'description', option.description,
            'public_visible', option.public_visible,
            'active', option.active,
            'sort_order', option.sort_order,
            'lock_version', option.lock_version,
            'updated_at', option.updated_at
          ) order by option.sort_order, option.label, option.id
        )
        from public.cms_controlled_options option
        where option.list_id = list.id
          and (p_include_inactive or option.active)
      ),
      '[]'::jsonb
    )
  from public.cms_controlled_lists list
  where p_environment in ('local', 'staging', 'production')
    and p_limit between 1 and 500
    and (p_entity_type is null or list.entity_type = p_entity_type)
    and (p_include_inactive or list.active)
    and private.cms_controlled_list_scope_allowed(
      p_actor_id, list.id, p_environment
    )
  order by list.sort_order, list.label, list.id
  limit p_limit;
$$;

-- The old policies exposed the whole vocabulary to any authenticated principal
-- with the broad read permission. The Edge RPC is now the only client reader.
revoke select on table public.cms_controlled_lists, public.cms_controlled_options
  from authenticated;

create or replace function private.cms_controlled_option_parent_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_actor_ids uuid[] := '{}'::uuid[];
  v_list_ids uuid[] := '{}'::uuid[];
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_actor_ids := array[
    nullif(v_new ->> 'created_by', '')::uuid,
    nullif(v_new ->> 'updated_by', '')::uuid,
    nullif(v_old ->> 'created_by', '')::uuid,
    nullif(v_old ->> 'updated_by', '')::uuid
  ];
  v_list_ids := array[
    nullif(v_new ->> 'list_id', '')::uuid,
    nullif(v_old ->> 'list_id', '')::uuid
  ];

  select array_cat(
    v_actor_ids,
    coalesce(array_agg(actor_id), '{}'::uuid[])
  ) into v_actor_ids
  from (
    select list.created_by as actor_id
    from public.cms_controlled_lists list
    where list.id = any(v_list_ids)
    union all
    select list.updated_by
    from public.cms_controlled_lists list
    where list.id = any(v_list_ids)
  ) parent_actors;

  perform private.cms_lock_active_qa_actor_leases(
    coalesce(
      (
        select array_agg(distinct actor_id order by actor_id)
        from unnest(v_actor_ids) actor(actor_id)
        where actor_id is not null
      ),
      '{}'::uuid[]
    )
  );

  if exists (
       select 1
       from private.cms_qa_actor_leases lease
       where lease.actor_id = any(v_actor_ids)
     ) and (
       select count(distinct actor_id)
       from unnest(v_actor_ids) actor(actor_id)
       where actor_id is not null
     ) <> 1 then
    raise exception 'CMS_CONTROLLED_CROSS_SCOPE_MUTATION_FORBIDDEN'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger cms_qa_controlled_list_lease_guard
before insert or update on public.cms_controlled_lists
for each row execute function private.cms_qa_domain_parent_lease_guard();

create trigger cms_qa_controlled_option_lease_guard
before insert or update on public.cms_controlled_options
for each row execute function private.cms_qa_domain_parent_lease_guard();

create trigger cms_qa_controlled_option_parent_scope_guard
before insert or update on public.cms_controlled_options
for each row execute function private.cms_controlled_option_parent_scope_guard();

create or replace function public.cms_manage_controlled_vocabulary_scoped(
  p_actor_id uuid,
  p_environment text,
  p_action text,
  p_list jsonb,
  p_option jsonb,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_list public.cms_controlled_lists%rowtype;
  v_option public.cms_controlled_options%rowtype;
  v_id uuid;
  v_list_id uuid;
  v_expected_lock_version bigint;
  v_usage integer := 0;
begin
  if not public.cms_actor_authorized(
    p_actor_id,
    'cms:vocabularies.manage',
    p_aal,
    p_session_id,
    p_issued_at
  ) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  if public.cms_actor_scope_context(p_actor_id, p_environment) ->> 'active' is distinct from 'true' then
    raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);

  if p_action = 'upsert_list' then
    v_id := nullif(p_list ->> 'id', '')::uuid;
    v_expected_lock_version := nullif(p_list ->> 'lockVersion', '')::bigint;

    if v_id is null then
      insert into public.cms_controlled_lists (
        list_key,
        entity_type,
        dimension_key,
        label,
        description,
        public_visible,
        active,
        sort_order,
        created_by,
        updated_by
      ) values (
        p_list ->> 'listKey',
        p_list ->> 'entityType',
        p_list ->> 'dimensionKey',
        p_list ->> 'label',
        coalesce(p_list ->> 'description', ''),
        coalesce((p_list ->> 'publicVisible')::boolean, true),
        coalesce((p_list ->> 'active')::boolean, true),
        coalesce((p_list ->> 'sortOrder')::integer, 0),
        p_actor_id,
        p_actor_id
      ) returning * into v_list;
    else
      select list.* into v_list
      from public.cms_controlled_lists list
      where list.id = v_id
      for update;

      if not found
         or not private.cms_controlled_list_scope_allowed(
           p_actor_id, v_id, p_environment
         ) then
        raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
      end if;
      if v_expected_lock_version is null then
        raise exception 'CMS_CONTROLLED_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
      end if;
      if v_list.list_key <> p_list ->> 'listKey'
         or v_list.entity_type <> p_list ->> 'entityType'
         or v_list.dimension_key <> p_list ->> 'dimensionKey' then
        raise exception 'CMS_CONTROLLED_IDENTITY_IMMUTABLE' using errcode = '22023';
      end if;

      update public.cms_controlled_lists list
      set label = p_list ->> 'label',
          description = coalesce(p_list ->> 'description', ''),
          public_visible = coalesce((p_list ->> 'publicVisible')::boolean, true),
          active = coalesce((p_list ->> 'active')::boolean, true),
          sort_order = coalesce((p_list ->> 'sortOrder')::integer, 0),
          updated_by = p_actor_id,
          updated_at = clock_timestamp(),
          lock_version = list.lock_version + 1
      where list.id = v_id
        and list.lock_version = v_expected_lock_version
      returning * into v_list;
      if not found then
        raise exception 'CMS_CONTROLLED_VERSION_CONFLICT' using errcode = '40001';
      end if;
    end if;

  elsif p_action = 'upsert_option' then
    v_id := nullif(p_option ->> 'id', '')::uuid;
    v_list_id := nullif(p_option ->> 'listId', '')::uuid;
    v_expected_lock_version := nullif(p_option ->> 'lockVersion', '')::bigint;

    select list.* into v_list
    from public.cms_controlled_lists list
    where list.id = v_list_id
    for update;
    if not found
       or not private.cms_controlled_list_scope_allowed(
         p_actor_id, v_list_id, p_environment
       ) then
      raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;

    if v_id is null then
      insert into public.cms_controlled_options (
        list_id,
        slug,
        label,
        description,
        public_visible,
        active,
        sort_order,
        created_by,
        updated_by
      ) values (
        v_list_id,
        p_option ->> 'slug',
        p_option ->> 'label',
        coalesce(p_option ->> 'description', ''),
        coalesce((p_option ->> 'publicVisible')::boolean, true),
        coalesce((p_option ->> 'active')::boolean, true),
        coalesce((p_option ->> 'sortOrder')::integer, 0),
        p_actor_id,
        p_actor_id
      ) returning * into v_option;
    else
      select option.* into v_option
      from public.cms_controlled_options option
      where option.id = v_id
      for update;
      if not found
         or v_option.list_id <> v_list_id
         or v_option.slug <> p_option ->> 'slug' then
        raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
      end if;
      if v_expected_lock_version is null then
        raise exception 'CMS_CONTROLLED_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
      end if;

      update public.cms_controlled_options option
      set label = p_option ->> 'label',
          description = coalesce(p_option ->> 'description', ''),
          public_visible = coalesce((p_option ->> 'publicVisible')::boolean, true),
          active = coalesce((p_option ->> 'active')::boolean, true),
          sort_order = coalesce((p_option ->> 'sortOrder')::integer, 0),
          updated_by = p_actor_id,
          updated_at = clock_timestamp(),
          lock_version = option.lock_version + 1
      where option.id = v_id
        and option.lock_version = v_expected_lock_version
      returning * into v_option;
      if not found then
        raise exception 'CMS_CONTROLLED_VERSION_CONFLICT' using errcode = '40001';
      end if;
    end if;
    v_usage := public.cms_controlled_option_usage_count(v_option.id);

  elsif p_action = 'set_option_active' then
    v_id := nullif(p_option ->> 'id', '')::uuid;
    v_expected_lock_version := nullif(p_option ->> 'lockVersion', '')::bigint;
    if v_expected_lock_version is null then
      raise exception 'CMS_CONTROLLED_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
    end if;

    select option.list_id into v_list_id
    from public.cms_controlled_options option
    where option.id = v_id;
    if not found then
      raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
    select list.* into v_list
    from public.cms_controlled_lists list
    where list.id = v_list_id
    for update;
    if not found
       or not private.cms_controlled_list_scope_allowed(
         p_actor_id, v_list_id, p_environment
       ) then
      raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;

    update public.cms_controlled_options option
    set active = (p_option ->> 'active')::boolean,
        updated_by = p_actor_id,
        updated_at = clock_timestamp(),
        lock_version = option.lock_version + 1
    where option.id = v_id
      and option.list_id = v_list_id
      and option.lock_version = v_expected_lock_version
    returning * into v_option;
    if not found then
      raise exception 'CMS_CONTROLLED_VERSION_CONFLICT' using errcode = '40001';
    end if;
    v_usage := public.cms_controlled_option_usage_count(v_option.id);
  else
    raise exception 'CMS_CONTROLLED_ACTION_INVALID' using errcode = '22023';
  end if;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:vocabularies.' || p_action,
    'controlled_vocabulary',
    coalesce(v_option.id::text, v_list.id::text),
    jsonb_build_object(
      'listKey', v_list.list_key,
      'usageCount', v_usage,
      'lockVersion', coalesce(v_option.lock_version, v_list.lock_version),
      'environment', p_environment
    ),
    p_correlation_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'listId', v_list.id,
    'optionId', v_option.id,
    'usageCount', v_usage,
    'lockVersion', coalesce(v_option.lock_version, v_list.lock_version)
  );
exception
  when unique_violation then
    raise exception 'CMS_CONTROLLED_NATURAL_KEY_CONFLICT' using errcode = '23505';
end;
$$;

-- Preserve the normal append-only rule while allowing the trusted terminal
-- compensator to remove same-lease synthetic rows and release global keys.
create or replace function public.cms_no_controlled_vocabulary_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_actor_id uuid := nullif(
    current_setting('cms.qa_mutation_actor_id', true), ''
  )::uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on'
     and old.created_by = v_actor_id
     and old.updated_by = v_actor_id
     and exists (
       select 1
       from private.cms_qa_actor_leases lease
       where lease.actor_id = v_actor_id
         and lease.status in ('active', 'expired', 'cleaned')
     ) then
    return old;
  end if;
  raise exception 'CMS_CONTROLLED_DELETE_FORBIDDEN' using errcode = '42501';
end;
$$;

create or replace function private.cms_prepare_qa_actor_terminal_vocab_cleanup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_list_ids uuid[];
  v_option_ids uuid[];
  v_lists_removed integer := 0;
  v_options_removed integer := 0;
  v_previous_compensating text;
  v_previous_mutation_actor text;
begin
  if old.status <> 'active'
     or new.status not in ('cleaned', 'expired')
     or new.status = old.status then
    return new;
  end if;

  select coalesce(array_agg(list.id order by list.id), '{}'::uuid[])
  into v_list_ids
  from public.cms_controlled_lists list
  where list.created_by = old.actor_id
     or list.updated_by = old.actor_id;

  select coalesce(array_agg(option.id order by option.id), '{}'::uuid[])
  into v_option_ids
  from public.cms_controlled_options option
  where option.created_by = old.actor_id
     or option.updated_by = old.actor_id
     or option.list_id = any(v_list_ids);

  perform 1
  from public.cms_controlled_lists list
  where list.id = any(v_list_ids)
  order by list.id
  for update;
  perform 1
  from public.cms_controlled_options option
  where option.id = any(v_option_ids)
  order by option.id
  for update;

  if exists (
       select 1
       from public.cms_controlled_lists list
       where list.id = any(v_list_ids)
         and (
           list.created_by <> old.actor_id
           or list.updated_by <> old.actor_id
         )
     )
     or exists (
       select 1
       from public.cms_controlled_options option
       where option.id = any(v_option_ids)
         and (
           option.created_by <> old.actor_id
           or option.updated_by <> old.actor_id
           or not exists (
             select 1
             from public.cms_controlled_lists list
             where list.id = option.list_id
               and list.created_by = old.actor_id
               and list.updated_by = old.actor_id
           )
         )
     ) then
    raise exception 'CMS_QA_CONTROLLED_VOCAB_EXTERNAL_CONFLICT'
      using errcode = '40001';
  end if;

  -- A synthetic option adopted by non-synthetic content is an external conflict;
  -- never erase that evidence or silently break a corporate reference.
  if exists (
       select 1
       from public.cms_content_drafts draft
       join public.cms_content_items item on item.id = draft.item_id
       where (item.created_by <> old.actor_id or item.updated_by <> old.actor_id)
         and exists (
           select 1
           from unnest(v_option_ids) option_id
           where draft.payload::text like ('%' || option_id::text || '%')
         )
     )
     or exists (
       select 1
       from public.cms_published_projection projection
       join public.cms_content_items item on item.id = projection.item_id
       where (item.created_by <> old.actor_id or item.updated_by <> old.actor_id)
         and exists (
           select 1
           from unnest(v_option_ids) option_id
           where projection.payload::text like ('%' || option_id::text || '%')
         )
     ) then
    raise exception 'CMS_QA_CONTROLLED_VOCAB_EXTERNAL_REFERENCE'
      using errcode = '40001';
  end if;

  v_previous_compensating := current_setting('cms.qa_compensating', true);
  v_previous_mutation_actor := current_setting('cms.qa_mutation_actor_id', true);
  perform set_config('cms.qa_compensating', 'on', true);
  perform set_config('cms.qa_mutation_actor_id', old.actor_id::text, true);
  begin
    delete from public.cms_controlled_options option
    where option.id = any(v_option_ids)
      and option.created_by = old.actor_id
      and option.updated_by = old.actor_id;
    get diagnostics v_options_removed = row_count;

    delete from public.cms_controlled_lists list
    where list.id = any(v_list_ids)
      and list.created_by = old.actor_id
      and list.updated_by = old.actor_id;
    get diagnostics v_lists_removed = row_count;
  exception when others then
    perform set_config(
      'cms.qa_compensating',
      coalesce(nullif(v_previous_compensating, ''), 'off'),
      true
    );
    perform set_config(
      'cms.qa_mutation_actor_id',
      coalesce(nullif(v_previous_mutation_actor, ''), ''),
      true
    );
    raise;
  end;
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  perform set_config(
    'cms.qa_mutation_actor_id',
    coalesce(nullif(v_previous_mutation_actor, ''), ''),
    true
  );

  if exists (
       select 1 from public.cms_controlled_lists list
       where list.created_by = old.actor_id or list.updated_by = old.actor_id
     )
     or exists (
       select 1 from public.cms_controlled_options option
       where option.created_by = old.actor_id or option.updated_by = old.actor_id
     ) then
    raise exception 'CMS_QA_CONTROLLED_VOCAB_CLEANUP_INCOMPLETE'
      using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    old.actor_id,
    'cms:qa.controlled_vocabulary_compensated',
    'qa_fixture',
    old.run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'listsRemoved', v_lists_removed,
      'optionsRemoved', v_options_removed,
      'environment', old.environment
    ),
    gen_random_uuid()
  );

  return new;
end;
$$;

create trigger cms_prepare_qa_actor_terminal_vocab_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_prepare_qa_actor_terminal_vocab_cleanup();

revoke all on function private.cms_pim_unit_scope_allowed(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_attribute_definition_scope_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_attribute_set_scope_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_controlled_list_scope_allowed(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_controlled_option_parent_scope_guard()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_prepare_qa_actor_terminal_vocab_cleanup()
  from public, anon, authenticated, service_role;

revoke all on function public.cms_attributes_catalog_scoped(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_manage_controlled_vocabulary(uuid,text,jsonb,jsonb,text,text,timestamptz,uuid)
  from service_role;
revoke all on function public.cms_no_controlled_vocabulary_delete()
  from public, anon, authenticated, service_role;

grant execute on function public.cms_attributes_catalog_scoped(uuid,text,text,uuid)
  to service_role;
grant execute on function public.cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)
  to service_role;
grant execute on function public.cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid)
  to service_role;
