-- Authoritative master-data read segregation for controlled QA browser actors.
--
-- The immutable QA lease is the classification boundary. Active QA actors may
-- only read rows wholly owned by their current lease and bearing its exact run
-- tag. Corporate actors exclude every row touched by an actor that ever held a
-- QA lease. All public readers below are service-role-only RPC boundaries.

create or replace function private.cms_master_run_scope_allowed(
  p_actor_id uuid,
  p_environment text,
  p_source_ref text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select case
    when exists (
      select 1
      from private.cms_qa_actor_leases any_lease
      where any_lease.actor_id = p_actor_id
    ) then exists (
      select 1
      from private.cms_qa_actor_leases lease
      where lease.actor_id = p_actor_id
        and lease.environment = p_environment
        and lease.status = 'active'
        and lease.expires_at > statement_timestamp()
        and p_source_ref = lease.run_tag
        and private.cms_qa_actor_marker_is_exact(
          lease.actor_id,
          lease.run_tag,
          lease.candidate_sha,
          lease.environment
        )
    )
    else true
  end;
$$;

create or replace function private.cms_master_entity_base_scope_allowed(
  p_actor_id uuid,
  p_entity_id uuid,
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
    from public.cms_master_entities entity
    where entity.id = p_entity_id
      and p_site_key = 'main'
      and p_environment in ('local', 'staging', 'production')
      and entity.site_key = p_site_key
      and private.cms_actor_row_scope_allowed(
        p_actor_id, entity.created_by, entity.created_at, p_environment
      )
      and private.cms_actor_row_scope_allowed(
        p_actor_id, entity.updated_by, entity.updated_at, p_environment
      )
      and private.cms_master_run_scope_allowed(
        p_actor_id, p_environment, entity.source_ref
      )
      and not exists (
        select 1
        from public.cms_master_entity_aliases alias
        where alias.entity_id = entity.id
          and (
            alias.site_key <> entity.site_key
            or alias.entity_type <> entity.entity_type
            or not private.cms_actor_row_scope_allowed(
              p_actor_id, alias.created_by, alias.created_at, p_environment
            )
            or not private.cms_actor_row_scope_allowed(
              p_actor_id, alias.updated_by, alias.updated_at, p_environment
            )
          )
      )
  );
$$;

create or replace function private.cms_master_entity_scope_allowed(
  p_actor_id uuid,
  p_entity_id uuid,
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
    from public.cms_master_entities entity
    where entity.id = p_entity_id
      and private.cms_master_entity_base_scope_allowed(
        p_actor_id, entity.id, p_environment, p_site_key
      )
      and (
        entity.merged_into_id is null
        or private.cms_master_entity_base_scope_allowed(
          p_actor_id, entity.merged_into_id, p_environment, p_site_key
        )
      )
  );
$$;

create or replace function public.cms_master_list_rules_scoped(
  p_actor_id uuid,
  p_environment text
)
returns table (
  relation_type text,
  source_type text,
  target_type text,
  label text,
  active boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    rule.relation_type,
    rule.source_type,
    rule.target_type,
    rule.label,
    rule.active
  from public.cms_master_relation_rules rule
  where rule.active
    and public.cms_actor_scope_context(p_actor_id, p_environment) ->> 'active' = 'true'
  order by rule.label, rule.relation_type;
$$;

create or replace function public.cms_master_list_entities_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_entity_type text,
  p_query text,
  p_include_inactive boolean,
  p_limit integer default 500
)
returns table (
  id uuid,
  entity_type text,
  canonical_name text,
  normalized_name text,
  description text,
  external_domain text,
  source_type text,
  source_ref text,
  status text,
  merged_into_id uuid,
  lock_version bigint,
  updated_at timestamptz,
  cms_master_entity_aliases jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    entity.id,
    entity.entity_type,
    entity.canonical_name,
    entity.normalized_name,
    entity.description,
    entity.external_domain,
    entity.source_type,
    entity.source_ref,
    entity.status,
    entity.merged_into_id,
    entity.lock_version,
    entity.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', alias.id,
            'alias', alias.alias,
            'normalized_alias', alias.normalized_alias,
            'source_type', alias.source_type,
            'updated_at', alias.updated_at
          ) order by alias.normalized_alias, alias.id
        )
        from public.cms_master_entity_aliases alias
        where alias.entity_id = entity.id
      ),
      '[]'::jsonb
    )
  from public.cms_master_entities entity
  where p_site_key = 'main'
    and p_environment in ('local', 'staging', 'production')
    and p_limit between 1 and 500
    and entity.site_key = p_site_key
    and (p_entity_type is null or entity.entity_type = p_entity_type)
    and (p_include_inactive or entity.status = 'active')
    and private.cms_master_entity_scope_allowed(
      p_actor_id, entity.id, p_environment, p_site_key
    )
    and (
      nullif(public.cms_normalize_master_name(coalesce(p_query, '')), '') is null
      or entity.normalized_name like (
        '%' || public.cms_normalize_master_name(coalesce(p_query, '')) || '%'
      )
      or exists (
        select 1
        from public.cms_master_entity_aliases alias
        where alias.entity_id = entity.id
          and alias.normalized_alias like (
            '%' || public.cms_normalize_master_name(coalesce(p_query, '')) || '%'
          )
      )
      or exists (
        select 1
        from public.cms_master_entities merged_source
        where merged_source.site_key = entity.site_key
          and merged_source.status = 'merged'
          and merged_source.merged_into_id = entity.id
          and private.cms_master_entity_scope_allowed(
            p_actor_id, merged_source.id, p_environment, p_site_key
          )
          and (
            merged_source.normalized_name like (
              '%' || public.cms_normalize_master_name(coalesce(p_query, '')) || '%'
            )
            or exists (
              select 1
              from public.cms_master_entity_aliases merged_alias
              where merged_alias.entity_id = merged_source.id
                and merged_alias.normalized_alias like (
                  '%' || public.cms_normalize_master_name(coalesce(p_query, '')) || '%'
                )
            )
          )
      )
    )
  order by entity.canonical_name, entity.id
  limit p_limit;
$$;

create or replace function public.cms_master_get_dependencies_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_relation_type text,
  p_source_entity_id uuid,
  p_include_inactive boolean
)
returns table (
  id uuid,
  relation_type text,
  source_entity_id uuid,
  target_entity_id uuid,
  status text,
  effective_from timestamptz,
  effective_to timestamptz,
  version bigint,
  lock_version bigint,
  source_type text,
  source_ref text,
  updated_at timestamptz,
  target jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with requested_source as (
    select entity.id
    from public.cms_master_entities entity
    where entity.id = p_source_entity_id
      and entity.site_key = p_site_key
      and private.cms_master_entity_scope_allowed(
        p_actor_id, entity.id, p_environment, p_site_key
      )
  ),
  permitted_sources as (
    select source.id
    from requested_source source
    union all
    select merged_source.id
    from public.cms_master_entities merged_source
    join requested_source requested on merged_source.merged_into_id = requested.id
    where merged_source.site_key = p_site_key
      and merged_source.status = 'merged'
      and private.cms_master_entity_scope_allowed(
        p_actor_id, merged_source.id, p_environment, p_site_key
      )
  )
  select
    compatibility.id,
    compatibility.relation_type,
    compatibility.source_entity_id,
    compatibility.target_entity_id,
    compatibility.status,
    compatibility.effective_from,
    compatibility.effective_to,
    compatibility.version,
    compatibility.lock_version,
    compatibility.source_type,
    compatibility.source_ref,
    compatibility.updated_at,
    jsonb_build_object(
      'id', resolved_target.id,
      'entity_type', resolved_target.entity_type,
      'canonical_name', resolved_target.canonical_name,
      'status', resolved_target.status,
      'lock_version', resolved_target.lock_version
    )
  from public.cms_master_compatibilities compatibility
  join permitted_sources source on source.id = compatibility.source_entity_id
  join public.cms_master_entities historical_target
    on historical_target.id = compatibility.target_entity_id
   and historical_target.site_key = p_site_key
  join public.cms_master_entities resolved_target
    on resolved_target.id = coalesce(historical_target.merged_into_id, historical_target.id)
   and resolved_target.site_key = p_site_key
  where p_site_key = 'main'
    and p_environment in ('local', 'staging', 'production')
    and compatibility.site_key = p_site_key
    and compatibility.relation_type = p_relation_type
    and (p_include_inactive or compatibility.status = 'active')
    and (p_include_inactive or resolved_target.status = 'active')
    and private.cms_actor_row_scope_allowed(
      p_actor_id, compatibility.created_by, compatibility.created_at, p_environment
    )
    and private.cms_actor_row_scope_allowed(
      p_actor_id, compatibility.updated_by, compatibility.updated_at, p_environment
    )
    and private.cms_master_run_scope_allowed(
      p_actor_id, p_environment, compatibility.source_ref
    )
    and private.cms_master_entity_scope_allowed(
      p_actor_id, historical_target.id, p_environment, p_site_key
    )
    and private.cms_master_entity_scope_allowed(
      p_actor_id, resolved_target.id, p_environment, p_site_key
    )
  order by compatibility.effective_from desc, compatibility.id;
$$;

revoke all on function private.cms_master_run_scope_allowed(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_master_entity_base_scope_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_master_entity_scope_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;

revoke all on function public.cms_master_list_rules_scoped(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_master_list_entities_scoped(uuid,text,text,text,text,boolean,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_master_get_dependencies_scoped(uuid,text,text,text,uuid,boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.cms_master_list_rules_scoped(uuid,text) to service_role;
grant execute on function public.cms_master_list_entities_scoped(uuid,text,text,text,text,boolean,integer)
  to service_role;
grant execute on function public.cms_master_get_dependencies_scoped(uuid,text,text,text,uuid,boolean)
  to service_role;
