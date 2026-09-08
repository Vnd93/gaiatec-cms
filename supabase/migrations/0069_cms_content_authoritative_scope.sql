-- Homologacao final: fronteira autoritativa entre conteudo corporativo e
-- fixtures criadas por identidades QA. A classificacao depende somente da
-- lease server-side; metadata do cliente nunca decide visibilidade.

create or replace function private.cms_content_actor_row_scope_allowed(
  p_actor_id uuid,
  p_row_actor_id uuid,
  p_row_at timestamptz,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_row_actor_id is null
      or p_row_at is null
      or p_environment not in ('local', 'staging', 'production')
      or not exists (select 1 from auth.users actor where actor.id = p_actor_id)
      then false
    when exists (
      select 1 from private.cms_qa_actor_leases caller_history
      where caller_history.actor_id = p_actor_id
    ) then exists (
      select 1
      from private.cms_qa_actor_leases caller
      join private.cms_qa_actor_leases row_actor
        on row_actor.actor_id = p_row_actor_id
       and row_actor.run_tag = caller.run_tag
       and row_actor.candidate_sha = caller.candidate_sha
       and row_actor.environment = caller.environment
      where caller.actor_id = p_actor_id
        and caller.environment = p_environment
        and caller.status = 'active'
        and row_actor.status = 'active'
        and caller.expires_at > statement_timestamp()
        and row_actor.expires_at > statement_timestamp()
        and p_row_at >= row_actor.created_at
        and p_row_at <= row_actor.expires_at
        and private.cms_qa_actor_marker_is_exact(
          caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          row_actor.actor_id, row_actor.run_tag, row_actor.candidate_sha, row_actor.environment
        )
    )
    else not exists (
      select 1 from private.cms_qa_actor_leases row_history
      where row_history.actor_id = p_row_actor_id
    )
  end;
$$;

create or replace function private.cms_content_actor_environment(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select coalesce(
    (select lease.environment from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id),
    'local'
  );
$$;

create or replace function private.cms_content_actor_context_active(
  p_actor_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_environment not in ('local', 'staging', 'production')
      or not exists (select 1 from auth.users actor where actor.id = p_actor_id)
      then false
    when exists (
      select 1 from private.cms_qa_actor_leases history where history.actor_id = p_actor_id
    ) then exists (
      select 1
      from private.cms_qa_actor_leases lease
      where lease.actor_id = p_actor_id
        and lease.environment = p_environment
        and lease.status = 'active'
        and lease.expires_at > statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
        )
    )
    else true
  end;
$$;

create or replace function private.cms_content_payload_asset_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_reference text;
  v_asset public.cms_media_assets%rowtype;
  v_target public.cms_media_assets%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;

  for v_reference in
    with blocks as (
      select value as block
      from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'blocks') = 'array'
          then p_payload -> 'blocks' else '[]'::jsonb end
      )
    ), refs as (
      select entry ->> 'assetId' as asset_id
      from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'media') = 'array'
          then p_payload -> 'media' else '[]'::jsonb end
      ) entry
      union all select block #>> '{data,assetId}' from blocks
      union all
      select asset #>> '{}'
      from blocks
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(block #> '{data,assetIds}') = 'array'
          then block #> '{data,assetIds}' else '[]'::jsonb end
      ) asset
      union all
      select item ->> 'assetId'
      from blocks
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(block #> '{data,items}') = 'array'
          then block #> '{data,items}' else '[]'::jsonb end
      ) item
      union all select p_payload #>> '{seo,ogImageId}'
    )
    select distinct asset_id from refs where nullif(asset_id, '') is not null
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return false;
    end if;
    select * into v_asset from public.cms_media_assets where id = v_reference::uuid;
    if not found
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id, v_asset.created_by, v_asset.created_at, p_environment
       )
       or not private.cms_document_actor_scope_allowed(
         p_actor_id, v_asset.source_kind, v_asset.source_reference
       ) then
      return false;
    end if;
    select target.* into v_target
    from public.cms_dam_replacements replacement
    join public.cms_media_assets target on target.id = replacement.target_asset_id
    where replacement.source_asset_id = v_asset.id and replacement.status = 'active'
    order by replacement.created_at desc
    limit 1;
    if found and (
      not private.cms_content_actor_row_scope_allowed(
        p_actor_id, v_target.created_by, v_target.created_at, p_environment
      )
      or not private.cms_document_actor_scope_allowed(
        p_actor_id, v_target.source_kind, v_target.source_reference
      )
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_content_payload_document_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_typeof(p_payload) = 'object'
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'documents') = 'array'
          then p_payload -> 'documents' else '[]'::jsonb end
      ) reference
      left join public.cms_document_assets asset
        on asset.id = case
          when reference ->> 'id'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (reference ->> 'id')::uuid
          else null
        end
      where not private.cms_product_document_reference_shape_allowed(reference)
         or asset.id is null
         or asset.storage_path is distinct from reference ->> 'storagePath'
         or asset.sha256 is distinct from reference ->> 'sha256'
         or not private.cms_document_actor_scope_allowed(
           p_actor_id, asset.source_kind, asset.source_reference
         )
    );
$$;

-- Controlled vocabulary IDs are part of the content graph. Normalizing a
-- payload must not allow a QA actor to adopt a corporate term (or vice versa)
-- merely because the caller supplied a valid UUID.
create or replace function private.cms_content_payload_controlled_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_reference record;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  if p_payload ->> 'contentType' not in ('product','service') then return true; end if;

  for v_reference in
    select expected.list_key, expected.reference
    from (
      values
        ('product.category'::text,p_payload #> '{controlledClassification,productCategory}'),
        ('product.application_magnitude',p_payload #> '{controlledClassification,applicationMagnitude}'),
        ('product.technology',p_payload #> '{controlledClassification,technology}'),
        ('product.installation_operation',p_payload #> '{controlledClassification,installationOperation}'),
        ('product.monitored_element',p_payload #> '{controlledClassification,monitoredElement}'),
        ('service.category',p_payload -> 'serviceKindRef')
    ) expected(list_key,reference)
    where (p_payload ->> 'contentType'='product' and expected.list_key like 'product.%')
       or (p_payload ->> 'contentType'='service' and expected.list_key='service.category')
  loop
    if jsonb_typeof(v_reference.reference) is distinct from 'object'
       or coalesce(v_reference.reference ->> 'id','')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1
         from public.cms_controlled_options option
         join public.cms_controlled_lists list on list.id=option.list_id
         where option.id=(v_reference.reference ->> 'id')::uuid
           and list.list_key=v_reference.list_key
           and option.active and list.active
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,list.created_by,list.created_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,list.updated_by,list.updated_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,option.created_by,option.created_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,option.updated_by,option.updated_at,p_environment
           )
       ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_content_payload_link_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_reference record;
  v_item public.cms_content_items%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  for v_reference in
    with linked_references as (
      select 'product'::text as expected_type,value #>> '{}' as raw_id
      from jsonb_path_query(p_payload,'lax $.**.productIds[*]') value
      union all select 'service',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.serviceIds[*]') value
      union all select 'industry',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.industryIds[*]') value
      union all select 'industry',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.sectorIds[*]') value
      union all select 'application',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.applicationIds[*]') value
      union all select 'solution',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.solutionIds[*]') value
      union all select 'post',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.postIds[*]') value
      union all select 'page',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.pageIds[*]') value
      union all select null,value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.itemIds[*]') value
      union all select 'campaign',value #>> '{}'
      from jsonb_path_query(p_payload,'lax $.**.fallbackCampaignId') value
      union all
      select placement ->> 'targetType',placement ->> 'targetId'
      from jsonb_path_query(p_payload,'lax $.**.placements[*]') placement
      where placement ? 'targetId'
      union all
      select case when placement ->> 'contextType'='global' then null
        else placement ->> 'contextType' end,placement ->> 'contextId'
      from jsonb_path_query(p_payload,'lax $.**.placements[*]') placement
      where placement ? 'contextId' and placement ->> 'contextType'<>'global'
    )
    select distinct expected_type,raw_id from linked_references where nullif(raw_id,'') is not null
  loop
    if v_reference.raw_id
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return false;
    end if;
    select * into v_item from public.cms_content_items item
    where item.id=v_reference.raw_id::uuid;
    if not found
       or (v_reference.expected_type is not null
         and v_item.content_type<>v_reference.expected_type)
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_item.created_by,v_item.created_at,p_environment
       )
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_item.updated_by,v_item.updated_at,p_environment
       ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_content_payload_form_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_reference text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  for v_reference in
    select distinct value #>> '{}'
    from jsonb_path_query(p_payload,'lax $.**.formId') value
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists(
         select 1 from public.cms_form_definitions form
         where form.id=v_reference::uuid
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,form.created_by,form.created_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,form.updated_by,form.updated_at,p_environment
           )
       ) then return false; end if;
  end loop;
  for v_reference in
    select distinct value #>> '{}'
    from (
      select value from jsonb_path_query(p_payload,'lax $.**.formVersionId') value
      union all select value from jsonb_path_query(p_payload,'lax $.form.versionId') value
    ) versions
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists(
         select 1
         from public.cms_form_versions version
         join public.cms_form_definitions form on form.id=version.form_id
         where version.id=v_reference::uuid
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,version.created_by,version.created_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,form.created_by,form.created_at,p_environment
           )
           and private.cms_content_actor_row_scope_allowed(
             p_actor_id,form.updated_by,form.updated_at,p_environment
           )
       ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_content_graph_actor_ids(p_item_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select coalesce(array_agg(distinct actor_id order by actor_id), '{}'::uuid[])
  from (
    select item.created_by as actor_id from public.cms_content_items item where item.id = p_item_id
    union all select item.updated_by from public.cms_content_items item where item.id = p_item_id
    union all select draft.updated_by from public.cms_content_drafts draft where draft.item_id = p_item_id
    union all
    select revision.created_by
    from public.cms_content_revisions revision
    where revision.item_id = p_item_id
      and not exists (
        select 1 from public.cms_content_items global_item
        where global_item.id = p_item_id
          and global_item.content_type in ('navigation', 'site_settings')
      )
    union all
    select approval.reviewer_id
    from public.cms_content_approvals approval
    where approval.item_id = p_item_id
      and not exists (
        select 1 from public.cms_content_items global_item
        where global_item.id = p_item_id
          and global_item.content_type in ('navigation', 'site_settings')
      )
    union all
    select taxonomy.assigned_by
    from public.cms_content_taxonomy taxonomy
    where taxonomy.item_id = p_item_id
      and not exists (
        select 1 from public.cms_content_items global_item
        where global_item.id = p_item_id
          and global_item.content_type in ('navigation', 'site_settings')
      )
    union all select publication.published_by from public.cms_publications publication where publication.item_id = p_item_id
    union all
    select run.actor_id
    from public.cms_quality_runs run
    where run.item_id = p_item_id
      and not exists (
        select 1 from public.cms_content_items global_item
        where global_item.id = p_item_id
          and global_item.content_type in ('navigation', 'site_settings')
      )
    union all
    select waiver.created_by
    from public.cms_quality_waivers waiver
    where waiver.item_id = p_item_id
      and not exists (
        select 1 from public.cms_content_items global_item
        where global_item.id = p_item_id
          and global_item.content_type in ('navigation', 'site_settings')
      )
    union all
    select asset.created_by
    from public.cms_media_usages usage
    join public.cms_media_assets asset on asset.id = usage.asset_id
    where usage.item_id = p_item_id
  ) actors
  where actor_id is not null;
$$;

create or replace function private.cms_content_item_graph_scope_allowed(
  p_actor_id uuid,
  p_item_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_item public.cms_content_items%rowtype;
  v_actor_is_qa boolean;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then return false; end if;
  select * into v_item from public.cms_content_items item where item.id = p_item_id;
  if not found then return false; end if;
  select exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
  ) into v_actor_is_qa;

  -- navigation/site_settings sao singletons corporativos. A unica excecao QA
  -- e uma lease ativa que possua (ou possa adquirir) o journal CAS de 0064.
  if v_item.content_type in ('navigation', 'site_settings') then
    if v_actor_is_qa then
      return not exists (
        select 1
        from private.cms_qa_global_mutation_journal journal
        where journal.item_id = p_item_id
          and journal.status in ('active', 'external_conflict')
          and journal.actor_id <> p_actor_id
      );
    end if;
    return private.cms_content_actor_row_scope_allowed(
        p_actor_id, v_item.created_by, v_item.created_at, p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, v_item.updated_by, v_item.updated_at, p_environment
      )
      and not exists (
        select 1 from private.cms_qa_global_mutation_journal journal
        where journal.item_id = p_item_id
          and journal.status in ('active', 'external_conflict')
      )
      and not exists (
        select 1 from public.cms_content_drafts draft
        where draft.item_id = p_item_id
          and not private.cms_content_actor_row_scope_allowed(
            p_actor_id, draft.updated_by, draft.updated_at, p_environment
          )
      )
      and not exists (
        select 1 from public.cms_publications publication
        where publication.item_id = p_item_id
          and not private.cms_content_actor_row_scope_allowed(
            p_actor_id, publication.published_by, publication.published_at, p_environment
          )
      );
  end if;

  return private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_item.created_by, v_item.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_item.updated_by, v_item.updated_at, p_environment
    )
    and not exists (
      select 1 from public.cms_content_drafts draft
      where draft.item_id = p_item_id and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id, draft.updated_by, draft.updated_at, p_environment
        )
        or not private.cms_content_payload_asset_scope_allowed(
          p_actor_id, draft.payload, p_environment
        )
        or not private.cms_content_payload_document_scope_allowed(p_actor_id, draft.payload)
        or not private.cms_content_payload_controlled_scope_allowed(
          p_actor_id, draft.payload, p_environment
        )
        or not private.cms_content_payload_link_scope_allowed(
          p_actor_id, draft.payload, p_environment
        )
        or not private.cms_content_payload_form_scope_allowed(
          p_actor_id, draft.payload, p_environment
        )
      )
    )
    and not exists (
      select 1 from public.cms_content_revisions revision
      where revision.item_id = p_item_id and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id, revision.created_by, revision.created_at, p_environment
        )
        or not private.cms_content_payload_asset_scope_allowed(
          p_actor_id, revision.payload, p_environment
        )
        or not private.cms_content_payload_document_scope_allowed(p_actor_id, revision.payload)
        or not private.cms_content_payload_controlled_scope_allowed(
          p_actor_id, revision.payload, p_environment
        )
        or not private.cms_content_payload_link_scope_allowed(
          p_actor_id, revision.payload, p_environment
        )
        or not private.cms_content_payload_form_scope_allowed(
          p_actor_id, revision.payload, p_environment
        )
      )
    )
    and not exists (
      select 1 from public.cms_content_approvals approval
      where approval.item_id = p_item_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, approval.reviewer_id, approval.created_at, p_environment
        )
    )
    and not exists (
      select 1
      from public.cms_content_taxonomy assignment
      join public.cms_taxonomy_terms term on term.id = assignment.term_id
      where assignment.item_id = p_item_id and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id, assignment.assigned_by, assignment.assigned_at, p_environment
        )
        or not private.cms_content_actor_row_scope_allowed(
          p_actor_id, term.created_by, term.created_at, p_environment
        )
        or not private.cms_content_actor_row_scope_allowed(
          p_actor_id, term.updated_by, term.updated_at, p_environment
        )
      )
    )
    and not exists (
      select 1 from public.cms_publications publication
      where publication.item_id = p_item_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, publication.published_by, publication.published_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_quality_runs run
      where run.item_id = p_item_id and run.actor_id is not null
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, run.actor_id, run.checked_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_quality_waivers waiver
      where waiver.item_id = p_item_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, waiver.created_by, waiver.created_at, p_environment
        )
    )
    and not exists (
      select 1
      from public.cms_media_usages usage
      left join public.cms_media_assets asset on asset.id = usage.asset_id
      where usage.item_id = p_item_id and (
        asset.id is null
        or not private.cms_content_actor_row_scope_allowed(
          p_actor_id, asset.created_by, asset.created_at, p_environment
        )
        or not private.cms_document_actor_scope_allowed(
          p_actor_id, asset.source_kind, asset.source_reference
        )
      )
    );
end;
$$;

create or replace function public.cms_content_item_read_allowed(
  p_actor_id uuid,
  p_item_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_content_item_graph_scope_allowed(p_actor_id, p_item_id, p_environment);
$$;

create or replace function public.cms_content_item_session_read_allowed(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_item_graph_scope_allowed(
    auth.uid(), p_item_id, private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_content_actor_row_session_read_allowed(
  p_row_actor_id uuid,
  p_row_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_row_scope_allowed(
    auth.uid(), p_row_actor_id, p_row_at,
    private.cms_content_actor_environment(auth.uid())
  );
$$;

-- Mutacoes usam sempre lease -> item. A primeira leitura serve apenas para
-- descobrir quais leases devem ser travadas; depois do lock do item o conjunto
-- e relido e qualquer troca concorrente de ator falha e deve ser repetida.
create or replace function private.cms_lock_content_item_for_actor(
  p_actor_id uuid,
  p_item_id uuid,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_seed_actor_ids uuid[];
  v_locked_actor_ids uuid[];
begin
  if p_actor_id is null or p_item_id is null
     or not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  v_seed_actor_ids := private.cms_content_graph_actor_ids(p_item_id);
  if coalesce(cardinality(v_seed_actor_ids), 0) = 0 then
    raise exception 'CMS_CONTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_lock_active_qa_actor_leases(
    coalesce((
      select array_agg(distinct actor_id order by actor_id)
      from unnest(array_append(v_seed_actor_ids, p_actor_id)) actor(actor_id)
      where actor_id is not null
    ), '{}'::uuid[])
  );

  perform 1 from public.cms_content_items item where item.id = p_item_id for update;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_locked_actor_ids := private.cms_content_graph_actor_ids(p_item_id);

  if exists (
    select 1
    from unnest(v_locked_actor_ids) current_actor(actor_id)
    join private.cms_qa_actor_leases lease on lease.actor_id = current_actor.actor_id
    where not current_actor.actor_id = any(array_append(v_seed_actor_ids, p_actor_id))
  ) then
    raise exception 'CMS_CONTENT_SCOPE_RACE' using errcode = '40001';
  end if;
  if not private.cms_content_item_graph_scope_allowed(
    p_actor_id, p_item_id, p_environment
  ) then
    raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cms_content_read_bundle_scoped(
  p_actor_id uuid,
  p_item_id uuid,
  p_revision_id uuid,
  p_environment text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'item', to_jsonb(item),
    'draft', coalesce(
      (select to_jsonb(draft) from public.cms_content_drafts draft where draft.item_id = item.id),
      'null'::jsonb
    ),
    'revision', coalesce(
      (
        select to_jsonb(revision)
        from public.cms_content_revisions revision
        where revision.item_id = item.id
          and (p_revision_id is null or revision.id = p_revision_id)
        order by revision.revision_number desc
        limit 1
      ),
      'null'::jsonb
    ),
    'waiverRuleKeys', coalesce(
      (
        select jsonb_agg(waiver.rule_key order by waiver.rule_key)
        from public.cms_quality_waivers waiver
        where waiver.item_id = item.id and waiver.expires_at > statement_timestamp()
      ),
      '[]'::jsonb
    )
  )
  from public.cms_content_items item
  where item.id = p_item_id
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, item.id, p_environment
    );
$$;

create or replace function public.cms_content_list_scoped(
  p_actor_id uuid,
  p_environment text,
  p_content_types text[],
  p_workflow_statuses text[],
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  content_type text,
  slug text,
  workflow_status text,
  updated_at timestamptz,
  draft_payload jsonb,
  draft_lock_version bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select item.id, item.content_type, item.slug, item.workflow_status, item.updated_at,
    draft.payload, draft.lock_version, count(*) over()
  from public.cms_content_items item
  left join public.cms_content_drafts draft on draft.item_id = item.id
  where p_environment in ('local', 'staging', 'production')
    and coalesce(cardinality(p_content_types), 0) between 0 and 20
    and coalesce(cardinality(p_workflow_statuses), 0) between 0 and 20
    and p_limit between 1 and 500
    and p_offset between 0 and 100000
    and (coalesce(cardinality(p_content_types),0) = 0 or item.content_type = any(p_content_types))
    and (coalesce(cardinality(p_workflow_statuses),0) = 0 or item.workflow_status = any(p_workflow_statuses))
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, item.id, p_environment
    )
  order by item.updated_at desc, item.id
  limit p_limit offset p_offset;
$$;

create or replace function public.cms_search_admin_scoped(
  p_actor_id uuid,
  p_environment text,
  p_query text,
  p_content_types text[] default '{}',
  p_facets jsonb default '{}'::jsonb,
  p_ranges jsonb default '{}'::jsonb,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  item_id uuid,
  revision_id uuid,
  content_type text,
  slug text,
  public_path text,
  title text,
  summary text,
  score real,
  matched_by text,
  facets jsonb,
  technical_ranges jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
  with input as (
    select trim(lower(coalesce(p_query,''))) as q
    where p_environment in ('local','staging','production')
      and coalesce(cardinality(p_content_types),0) between 0 and 20
      and jsonb_typeof(p_facets)='object'
      and jsonb_typeof(p_ranges)='object'
      and p_limit between 1 and 100 and p_offset between 0 and 100000
  ), matching_synonyms as (
    select synonym.canonical_term,synonym.aliases,synonym.scope
    from public.cms_search_synonyms synonym cross join input
    where synonym.active and statement_timestamp() >= synonym.starts_at
      and (synonym.expires_at is null or synonym.expires_at > statement_timestamp())
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,synonym.created_by,synonym.created_at,p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,synonym.updated_by,synonym.updated_at,p_environment
      )
      and (input.q=synonym.canonical_term or input.q=any(synonym.aliases)
        or position(synonym.canonical_term in input.q)>0
        or exists(select 1 from unnest(synonym.aliases) alias where position(alias in input.q)>0))
  ), terms as (
    select q as term,true as direct,'all'::text as scope from input where q<>''
    union select canonical_term,false,scope from matching_synonyms
    union select unnest(aliases),false,scope from matching_synonyms
  ), candidates as (
    select document.*,
      case when input.q='' then 1.0 when lower(document.title)=input.q then 100.0
        else (coalesce(matched.text_rank,0)*20+coalesce(matched.title_similarity,0)*10)::real end as rank_score,
      case when lower(document.title)=input.q then 'exact_title'
        when matched.direct_match then 'full_text'
        when matched.synonym_match then 'governed_synonym'
        else 'similar_title' end as reason
    from public.cms_search_documents document cross join input
    cross join lateral (
      select max(ts_rank_cd(document.search_document,plainto_tsquery('simple',terms.term))) as text_rank,
        max(similarity(lower(document.title),terms.term)) as title_similarity,
        bool_or(terms.direct and document.search_document@@plainto_tsquery('simple',terms.term)) as direct_match,
        bool_or(not terms.direct and document.search_document@@plainto_tsquery('simple',terms.term)) as synonym_match,
        bool_or(document.search_document@@plainto_tsquery('simple',terms.term)
          or similarity(lower(document.title),terms.term)>=0.18) as matches
      from terms where terms.term<>'' and (terms.scope='all' or terms.scope=document.content_type)
    ) matched
    where (coalesce(cardinality(p_content_types),0)=0 or document.content_type=any(p_content_types))
      and (input.q='' or matched.matches)
      and private.cms_content_item_graph_scope_allowed(
        p_actor_id,document.item_id,p_environment
      )
      and not exists (
        select 1 from jsonb_each(p_facets) requested
        where not exists (
          select 1
          from jsonb_array_elements_text(coalesce(document.facets->requested.key,'[]'::jsonb)) available(value)
          where available.value in (
            select selected.value
            from jsonb_array_elements_text(
              case when jsonb_typeof(requested.value)='array' then requested.value else '[]'::jsonb end
            ) selected(value)
          )
        )
      )
      and not exists (
        select 1 from jsonb_each(p_ranges) requested
        where not exists (
          select 1
          from jsonb_array_elements(coalesce(document.technical_ranges->requested.key,'[]'::jsonb)) available
          where (requested.value->>'unit' is null or available->>'unit'=requested.value->>'unit')
            and (requested.value->>'min' is null or (available->>'max')::numeric >= (requested.value->>'min')::numeric)
            and (requested.value->>'max' is null or (available->>'min')::numeric <= (requested.value->>'max')::numeric)
        )
      )
  ), governed as (
    select candidates.*,
      case rule.rule_kind when 'pin' then 1000 when 'bury' then -1000 else 0 end as governance_boost
    from candidates
    left join lateral (
      select governed_rule.rule_kind
      from public.cms_search_rules governed_rule
      where governed_rule.target_item_id=candidates.item_id
        and governed_rule.normalized_query=(select q from input)
        and governed_rule.active
        and statement_timestamp() between governed_rule.starts_at and governed_rule.expires_at
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id,governed_rule.created_by,governed_rule.created_at,p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id,governed_rule.updated_by,governed_rule.updated_at,p_environment
        )
      order by governed_rule.updated_at desc limit 1
    ) rule on true
  )
  select governed.item_id,governed.revision_id,governed.content_type,governed.slug,
    governed.public_path,governed.title,governed.summary,
    (governed.rank_score+governed.governance_boost)::real,governed.reason,
    governed.facets,governed.technical_ranges,count(*) over()
  from governed
  order by governed.rank_score+governed.governance_boost desc,governed.title,governed.item_id
  limit p_limit offset p_offset;
$$;

create or replace function public.cms_quality_list_runs_scoped(
  p_actor_id uuid,
  p_environment text,
  p_item_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  item_id uuid,
  ruleset_version text,
  trigger_kind text,
  status text,
  finding_counts jsonb,
  checked_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select run.id, run.item_id, run.ruleset_version, run.trigger_kind,
    run.status, run.finding_counts, run.checked_at
  from public.cms_quality_runs run
  where p_environment in ('local', 'staging', 'production')
    and p_limit between 1 and 100
    and (p_item_id is null or run.item_id = p_item_id)
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, run.item_id, p_environment
    )
  order by run.checked_at desc, run.id
  limit p_limit;
$$;

create or replace function public.cms_blog_taxonomy_resolve_scoped(
  p_actor_id uuid,
  p_environment text,
  p_author_slug text,
  p_category_slug text,
  p_tag_slugs text[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'authorId', (
      select author.id
      from public.cms_blog_authors author
      where author.slug = p_author_slug
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, author.created_by, author.created_at, p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, author.updated_by, author.updated_at, p_environment
        )
    ),
    'categoryId', (
      select category.id
      from public.cms_blog_categories category
      where category.slug = p_category_slug
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, category.created_by, category.created_at, p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, category.updated_by, category.updated_at, p_environment
        )
    ),
    'tags', coalesce((
      select jsonb_object_agg(tag.slug, tag.id)
      from public.cms_blog_tags tag
      where tag.slug = any(coalesce(p_tag_slugs, '{}'::text[]))
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, tag.created_by, tag.created_at, p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, tag.updated_by, tag.updated_at, p_environment
        )
    ), '{}'::jsonb)
  )
  where private.cms_content_actor_context_active(p_actor_id, p_environment)
    and coalesce(cardinality(p_tag_slugs), 0) between 0 and 100;
$$;

create or replace function public.cms_normalize_controlled_payload_scoped(
  p_actor_id uuid,
  p_environment text,
  p_content_type text,
  p_payload jsonb,
  p_require_active boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if not private.cms_content_actor_context_active(p_actor_id,p_environment)
     or not private.cms_content_payload_controlled_scope_allowed(
       p_actor_id,p_payload,p_environment
     ) then
    raise exception 'CMS_CONTROLLED_TERM_INVALID' using errcode='22023';
  end if;
  return public.cms_normalize_controlled_payload(
    p_content_type,p_payload,p_require_active
  );
end;
$$;

create or replace function public.cms_search_governance_list_scoped(
  p_actor_id uuid,
  p_environment text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'rules',coalesce((
      select jsonb_agg(to_jsonb(rule) order by rule.updated_at desc,rule.id)
      from public.cms_search_rules rule
      where private.cms_content_actor_row_scope_allowed(
          p_actor_id,rule.created_by,rule.created_at,p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id,rule.updated_by,rule.updated_at,p_environment
        )
        and (rule.target_item_id is null or private.cms_content_item_graph_scope_allowed(
          p_actor_id,rule.target_item_id,p_environment
        ))
    ),'[]'::jsonb),
    'synonyms',coalesce((
      select jsonb_agg(to_jsonb(synonym) order by synonym.canonical_term,synonym.id)
      from public.cms_search_synonyms synonym
      where private.cms_content_actor_row_scope_allowed(
          p_actor_id,synonym.created_by,synonym.created_at,p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id,synonym.updated_by,synonym.updated_at,p_environment
        )
    ),'[]'::jsonb),
    'jobs',coalesce((
      select jsonb_agg(to_jsonb(job) order by job.created_at desc,job.id)
      from (
        select scoped_job.*
        from public.cms_search_index_jobs scoped_job
        where scoped_job.requested_by is not null
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id,scoped_job.requested_by,scoped_job.created_at,p_environment
          )
        order by scoped_job.created_at desc,scoped_job.id
        limit 10
      ) job
    ),'[]'::jsonb)
  )
  where private.cms_content_actor_context_active(p_actor_id,p_environment);
$$;

create or replace function public.cms_search_governance_command_scoped(
  p_actor_id uuid,
  p_environment text,
  p_action text,
  p_payload jsonb,
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
  v_id uuid:=case when nullif(p_payload->>'id','') is null then null
    else (p_payload->>'id')::uuid end;
  v_expected bigint:=case when nullif(p_payload->>'expectedVersion','') is null then null
    else (p_payload->>'expectedVersion')::bigint end;
  v_target_item_id uuid:=case when nullif(p_payload->>'targetItemId','') is null then null
    else (p_payload->>'targetItemId')::uuid end;
  v_actor_ids uuid[]:=array[p_actor_id];
  v_existing_target_item_id uuid;
  v_synonym public.cms_search_synonyms%rowtype;
  v_rule public.cms_search_rules%rowtype;
begin
  if p_action not in ('upsert_synonym','upsert_rule')
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_correlation_id is null
     or not public.cms_actor_authorized(
       p_actor_id,'cms:search.manage',p_aal,p_session_id,p_issued_at
     )
     or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_SEARCH_FORBIDDEN' using errcode='42501';
  end if;

  if p_action='upsert_synonym' and v_id is not null then
    select array_cat(v_actor_ids,array[synonym.created_by,synonym.updated_by])
    into v_actor_ids from public.cms_search_synonyms synonym where synonym.id=v_id;
  elsif p_action='upsert_rule' and v_id is not null then
    select array_cat(v_actor_ids,array[rule.created_by,rule.updated_by]),rule.target_item_id
    into v_actor_ids,v_existing_target_item_id
    from public.cms_search_rules rule where rule.id=v_id;
  end if;
  if v_existing_target_item_id is not null then
    v_actor_ids:=array_cat(
      v_actor_ids,private.cms_content_graph_actor_ids(v_existing_target_item_id)
    );
  end if;
  if p_action='upsert_rule' and v_target_item_id is not null then
    v_actor_ids:=array_cat(v_actor_ids,private.cms_content_graph_actor_ids(v_target_item_id));
  end if;
  perform private.cms_lock_active_qa_actor_leases(coalesce((
    select array_agg(distinct actor_id order by actor_id)
    from unnest(v_actor_ids) actor(actor_id) where actor_id is not null
  ),'{}'::uuid[]));

  if p_action='upsert_synonym' then
    if coalesce(array_length(array(select jsonb_array_elements_text(p_payload->'aliases')),1),0)
         not between 1 and 50
       or char_length(btrim(coalesce(p_payload->>'canonicalTerm',''))) not between 1 and 120
       or p_payload->>'scope' not in ('all','product','service','industry','application','solution')
       or char_length(btrim(coalesce(p_payload->>'sourceReference',''))) not between 3 and 300
       or char_length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500
       or char_length(btrim(coalesce(p_payload->>'owner',''))) not between 2 and 120
       or (p_payload->>'startsAt')::timestamptz >= (p_payload->>'expiresAt')::timestamptz then
      raise exception 'CMS_SEARCH_INVALID' using errcode='22023';
    end if;
    if v_id is null then
      insert into public.cms_search_synonyms(
        canonical_term,aliases,scope,source_reference,reason,owner_key,
        starts_at,expires_at,active,created_by,updated_by
      ) values(
        p_payload->>'canonicalTerm',array(select jsonb_array_elements_text(p_payload->'aliases')),
        p_payload->>'scope',p_payload->>'sourceReference',p_payload->>'reason',
        p_payload->>'owner',(p_payload->>'startsAt')::timestamptz,
        (p_payload->>'expiresAt')::timestamptz,coalesce((p_payload->>'active')::boolean,true),
        p_actor_id,p_actor_id
      ) returning * into v_synonym;
    else
      select * into v_synonym from public.cms_search_synonyms synonym
      where synonym.id=v_id for update;
      if not found
         or not private.cms_content_actor_row_scope_allowed(
           p_actor_id,v_synonym.created_by,v_synonym.created_at,p_environment
         )
         or not private.cms_content_actor_row_scope_allowed(
           p_actor_id,v_synonym.updated_by,v_synonym.updated_at,p_environment
         ) then raise exception 'CMS_SEARCH_NOT_FOUND' using errcode='P0002'; end if;
      if v_expected is null or v_synonym.lock_version<>v_expected then
        raise exception 'CMS_SEARCH_CONFLICT' using errcode='40001';
      end if;
      update public.cms_search_synonyms set
        canonical_term=p_payload->>'canonicalTerm',
        aliases=array(select jsonb_array_elements_text(p_payload->'aliases')),
        scope=p_payload->>'scope',source_reference=p_payload->>'sourceReference',
        reason=p_payload->>'reason',owner_key=p_payload->>'owner',
        starts_at=(p_payload->>'startsAt')::timestamptz,
        expires_at=(p_payload->>'expiresAt')::timestamptz,
        active=coalesce((p_payload->>'active')::boolean,true),
        updated_by=p_actor_id,lock_version=v_synonym.lock_version+1
      where id=v_id returning * into v_synonym;
    end if;
    insert into public.cms_audit_log(actor_id,action,target_type,target_id,correlation_id,event_data)
    values(p_actor_id,'cms:search.synonym_saved','search_synonym',v_synonym.id::text,
      p_correlation_id,jsonb_build_object('scope',v_synonym.scope,'reason',v_synonym.reason,
        'owner',v_synonym.owner_key,'startsAt',v_synonym.starts_at,'expiresAt',v_synonym.expires_at));
    return jsonb_build_object('item',to_jsonb(v_synonym));
  end if;

  if char_length(btrim(coalesce(p_payload->>'normalizedQuery',''))) not between 1 and 300
     or p_payload->>'kind' not in ('pin','bury','redirect')
     or char_length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500
     or char_length(btrim(coalesce(p_payload->>'owner',''))) not between 2 and 120
     or (p_payload->>'startsAt')::timestamptz >= (p_payload->>'expiresAt')::timestamptz
     or ((p_payload->>'kind'='redirect') <> (v_target_item_id is null)) then
    raise exception 'CMS_SEARCH_INVALID' using errcode='22023';
  end if;
  if v_target_item_id is not null then
    perform 1 from public.cms_content_items item where item.id=v_target_item_id for share;
    if not found or not private.cms_content_item_graph_scope_allowed(
      p_actor_id,v_target_item_id,p_environment
    ) then raise exception 'CMS_SEARCH_NOT_FOUND' using errcode='P0002'; end if;
  end if;
  if v_id is null then
    insert into public.cms_search_rules(
      rule_kind,normalized_query,target_item_id,redirect_path,reason,owner_key,
      starts_at,expires_at,active,created_by,updated_by
    ) values(
      p_payload->>'kind',p_payload->>'normalizedQuery',v_target_item_id,
      nullif(p_payload->>'redirectPath',''),p_payload->>'reason',p_payload->>'owner',
      (p_payload->>'startsAt')::timestamptz,(p_payload->>'expiresAt')::timestamptz,
      coalesce((p_payload->>'active')::boolean,true),p_actor_id,p_actor_id
    ) returning * into v_rule;
  else
    select * into v_rule from public.cms_search_rules rule where rule.id=v_id for update;
    if not found
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_rule.created_by,v_rule.created_at,p_environment
       )
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_rule.updated_by,v_rule.updated_at,p_environment
       )
       or (v_rule.target_item_id is not null and not private.cms_content_item_graph_scope_allowed(
         p_actor_id,v_rule.target_item_id,p_environment
       )) then raise exception 'CMS_SEARCH_NOT_FOUND' using errcode='P0002'; end if;
    if v_expected is null or v_rule.lock_version<>v_expected then
      raise exception 'CMS_SEARCH_CONFLICT' using errcode='40001';
    end if;
    update public.cms_search_rules set
      rule_kind=p_payload->>'kind',normalized_query=p_payload->>'normalizedQuery',
      target_item_id=v_target_item_id,redirect_path=nullif(p_payload->>'redirectPath',''),
      reason=p_payload->>'reason',owner_key=p_payload->>'owner',
      starts_at=(p_payload->>'startsAt')::timestamptz,
      expires_at=(p_payload->>'expiresAt')::timestamptz,
      active=coalesce((p_payload->>'active')::boolean,true),
      updated_by=p_actor_id,lock_version=v_rule.lock_version+1
    where id=v_id returning * into v_rule;
  end if;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,correlation_id,event_data)
  values(p_actor_id,'cms:search.rule_saved','search_rule',v_rule.id::text,p_correlation_id,
    jsonb_build_object('kind',v_rule.rule_kind,'reason',v_rule.reason,'owner',v_rule.owner_key,
      'startsAt',v_rule.starts_at,'expiresAt',v_rule.expires_at));
  return jsonb_build_object('item',to_jsonb(v_rule));
end;
$$;

create or replace function public.cms_search_global_operation_allowed(
  p_actor_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_context_active(p_actor_id,p_environment)
    and not exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=p_actor_id
    );
$$;

create or replace function public.cms_search_begin_global_reindex(
  p_actor_id uuid,
  p_environment text,
  p_reason text,
  p_correlation_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_job public.cms_search_index_jobs%rowtype;
begin
  if not public.cms_search_global_operation_allowed(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,'cms:search.reindex',p_aal,p_session_id,p_issued_at
     )
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500
     or p_correlation_id is null then
    raise exception 'CMS_SEARCH_GLOBAL_FORBIDDEN' using errcode='42501';
  end if;
  select * into v_job from public.cms_search_index_jobs job
  where job.status in ('pending','running')
  order by job.created_at,job.id limit 1 for update;
  if found then
    if v_job.requested_by is null or exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=v_job.requested_by
    ) or v_job.status='running' then
      raise exception 'CMS_SEARCH_REINDEX_IN_PROGRESS' using errcode='55P03';
    end if;
    update public.cms_search_index_jobs set status='running',reason=p_reason,
      requested_by=p_actor_id,correlation_id=p_correlation_id,
      started_at=clock_timestamp(),completed_at=null,error_code=null
    where id=v_job.id returning * into v_job;
  else
    insert into public.cms_search_index_jobs(
      status,reason,requested_by,correlation_id,started_at
    ) values('running',p_reason,p_actor_id,p_correlation_id,clock_timestamp())
    returning * into v_job;
  end if;
  return jsonb_build_object('jobId',v_job.id,'startedAt',v_job.started_at);
end;
$$;

create or replace function public.cms_search_finish_global_reindex(
  p_actor_id uuid,
  p_environment text,
  p_job_id uuid,
  p_status text,
  p_documents_indexed integer,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_job public.cms_search_index_jobs%rowtype;
begin
  if not public.cms_search_global_operation_allowed(p_actor_id,p_environment)
     or p_status not in ('completed','failed')
     or p_documents_indexed<0 then
    raise exception 'CMS_SEARCH_GLOBAL_FORBIDDEN' using errcode='42501';
  end if;
  select * into v_job from public.cms_search_index_jobs job
  where job.id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.requested_by is null
     or exists(
       select 1 from private.cms_qa_actor_leases lease where lease.actor_id=v_job.requested_by
     ) then raise exception 'CMS_SEARCH_JOB_NOT_FOUND' using errcode='P0002'; end if;
  update public.cms_search_index_jobs set status=p_status,
    documents_indexed=p_documents_indexed,
    error_code=case when p_status='failed' then coalesce(p_error_code,'CMS_SEARCH_REINDEX_FAILED') else null end,
    completed_at=clock_timestamp()
  where id=p_job_id;
end;
$$;

-- Preserve the battle-tested editorial state machine behind a non-executable
-- implementation function. The public entry point establishes actor scope and
-- lock order before delegating to it.
alter function public.cms_execute_editorial_command(
  uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,
  text,text,timestamptz,uuid,uuid
) rename to cms_execute_editorial_command_unscoped_0069;
revoke all on function public.cms_execute_editorial_command_unscoped_0069(
  uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,
  text,text,timestamptz,uuid,uuid
) from public, anon, authenticated, service_role;

create function public.cms_execute_editorial_command(
  p_actor_id uuid,
  p_action text,
  p_item_id uuid,
  p_content_type text,
  p_slug text,
  p_payload jsonb,
  p_expected_lock_version bigint,
  p_revision_id uuid,
  p_reason text,
  p_publish_at timestamptz,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_environment text := private.cms_content_actor_environment(p_actor_id);
  v_result jsonb;
  v_created_item_id uuid;
  v_actor_is_qa boolean;
begin
  select exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
  ) into v_actor_is_qa;
  if not private.cms_content_actor_context_active(p_actor_id, v_environment) then
    raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_action = 'create' then
    perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
    if v_actor_is_qa and p_content_type in ('navigation', 'site_settings') then
      raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
  else
    perform private.cms_lock_content_item_for_actor(
      p_actor_id, p_item_id, v_environment
    );
  end if;
  perform set_config('cms.content_mutation_actor_id', p_actor_id::text, true);
  v_result := public.cms_execute_editorial_command_unscoped_0069(
    p_actor_id, p_action, p_item_id, p_content_type, p_slug, p_payload,
    p_expected_lock_version, p_revision_id, p_reason, p_publish_at, p_aal,
    p_session_id, p_issued_at, p_idempotency_key, p_correlation_id
  );
  v_created_item_id := nullif(v_result ->> 'itemId', '')::uuid;
  if v_created_item_id is not null
     and not private.cms_content_item_graph_scope_allowed(
       p_actor_id, v_created_item_id, v_environment
     ) then
    raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  return v_result;
end;
$$;

alter function public.cms_reopen_site_builder(
  uuid,uuid,text,text,text,timestamptz,uuid,uuid
) rename to cms_reopen_site_builder_unscoped_0069;
revoke all on function public.cms_reopen_site_builder_unscoped_0069(
  uuid,uuid,text,text,text,timestamptz,uuid,uuid
) from public, anon, authenticated, service_role;
create function public.cms_reopen_site_builder(
  p_actor_id uuid,p_item_id uuid,p_reason text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_idempotency_key uuid,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare v_environment text := private.cms_content_actor_environment(p_actor_id);
begin
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,v_environment);
  perform set_config('cms.content_mutation_actor_id',p_actor_id::text,true);
  return public.cms_reopen_site_builder_unscoped_0069(
    p_actor_id,p_item_id,p_reason,p_aal,p_session_id,p_issued_at,
    p_idempotency_key,p_correlation_id
  );
end;
$$;

alter function public.cms_hard_delete_draft(
  uuid,uuid,text,text,text,timestamptz,uuid,uuid
) rename to cms_hard_delete_draft_unscoped_0069;
revoke all on function public.cms_hard_delete_draft_unscoped_0069(
  uuid,uuid,text,text,text,timestamptz,uuid,uuid
) from public, anon, authenticated, service_role;
create function public.cms_hard_delete_draft(
  p_actor_id uuid,p_item_id uuid,p_reason text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_idempotency_key uuid,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare v_environment text := private.cms_content_actor_environment(p_actor_id);
begin
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,v_environment);
  perform set_config('cms.content_mutation_actor_id',p_actor_id::text,true);
  return public.cms_hard_delete_draft_unscoped_0069(
    p_actor_id,p_item_id,p_reason,p_aal,p_session_id,p_issued_at,
    p_idempotency_key,p_correlation_id
  );
end;
$$;

alter function public.cms_retire_managed_page(
  uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid
) rename to cms_retire_managed_page_unscoped_0069;
revoke all on function public.cms_retire_managed_page_unscoped_0069(
  uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid
) from public, anon, authenticated, service_role;
create function public.cms_retire_managed_page(
  p_actor_id uuid,p_item_id uuid,p_slug text,p_payload jsonb,
  p_expected_lock_version bigint,p_reason text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_idempotency_key uuid,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare
  v_environment text := private.cms_content_actor_environment(p_actor_id);
  v_result jsonb;
begin
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,v_environment);
  perform set_config('cms.content_mutation_actor_id',p_actor_id::text,true);
  v_result := public.cms_retire_managed_page_unscoped_0069(
    p_actor_id,p_item_id,p_slug,p_payload,p_expected_lock_version,p_reason,
    p_aal,p_session_id,p_issued_at,p_idempotency_key,p_correlation_id
  );
  if not private.cms_content_item_graph_scope_allowed(
    p_actor_id,p_item_id,v_environment
  ) then raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  return v_result;
end;
$$;

-- Blog references are mutable governed rows too; an upsert by UUID must never
-- adopt a corporate row from QA or an ever-QA row from a corporate session.
alter function public.cms_sync_blog_taxonomy(
  uuid,jsonb,text,text,timestamptz
) rename to cms_sync_blog_taxonomy_unscoped_0069;
revoke all on function public.cms_sync_blog_taxonomy_unscoped_0069(
  uuid,jsonb,text,text,timestamptz
) from public, anon, authenticated, service_role;
create function public.cms_sync_blog_taxonomy(
  p_actor_id uuid,p_payload jsonb,p_aal text,p_session_id text,p_issued_at timestamptz
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare
  v_environment text := private.cms_content_actor_environment(p_actor_id);
  v_actor_ids uuid[] := array[p_actor_id];
  v_lock_key text;
  v_tag jsonb;
begin
  if not private.cms_content_actor_context_active(p_actor_id,v_environment) then
    raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  -- Existing rows can be protected with row locks, but a UUID that does not yet
  -- exist has no tuple to lock. All writers enter through this wrapper, so a
  -- canonical, ordered advisory fence closes the create/create ON CONFLICT race
  -- between QA and corporate actors without changing legacy UUID casing support.
  for v_lock_key in
    select reference.lock_key
    from (
      select 'author:' || (nullif(p_payload #>> '{author,id}','')::uuid)::text as lock_key
      union all
      select 'category:' || (nullif(p_payload #>> '{category,id}','')::uuid)::text
      union all
      select 'tag:' || ((entry ->> 'id')::uuid)::text
      from jsonb_array_elements(coalesce(p_payload -> 'tags','[]'::jsonb)) entry
    ) reference
    where reference.lock_key is not null
    order by reference.lock_key
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('cms-blog-taxonomy:' || v_lock_key,0)
    );
  end loop;
  select array_cat(v_actor_ids,coalesce(array_agg(actor_id),'{}'::uuid[]))
  into v_actor_ids
  from (
    select author.created_by as actor_id
    from public.cms_blog_authors author
    where author.id = nullif(p_payload #>> '{author,id}','')::uuid
    union all select author.updated_by from public.cms_blog_authors author
    where author.id = nullif(p_payload #>> '{author,id}','')::uuid
    union all select category.created_by from public.cms_blog_categories category
    where category.id = nullif(p_payload #>> '{category,id}','')::uuid
    union all select category.updated_by from public.cms_blog_categories category
    where category.id = nullif(p_payload #>> '{category,id}','')::uuid
    union all
    select tag.created_by
    from public.cms_blog_tags tag
    where tag.id in (
      select (entry ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_payload -> 'tags','[]'::jsonb)) entry
    )
    union all
    select tag.updated_by
    from public.cms_blog_tags tag
    where tag.id in (
      select (entry ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_payload -> 'tags','[]'::jsonb)) entry
    )
  ) actors;
  perform private.cms_lock_active_qa_actor_leases(
    coalesce((select array_agg(distinct actor_id order by actor_id)
      from unnest(v_actor_ids) actor(actor_id)), '{}'::uuid[])
  );
  if exists (
    select 1 from public.cms_blog_authors author
    where author.id = nullif(p_payload #>> '{author,id}','')::uuid
      and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id,author.created_by,author.created_at,v_environment
        ) or not private.cms_content_actor_row_scope_allowed(
          p_actor_id,author.updated_by,author.updated_at,v_environment
        )
      )
  ) or exists (
    select 1 from public.cms_blog_categories category
    where category.id = nullif(p_payload #>> '{category,id}','')::uuid
      and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id,category.created_by,category.created_at,v_environment
        ) or not private.cms_content_actor_row_scope_allowed(
          p_actor_id,category.updated_by,category.updated_at,v_environment
        )
      )
  ) then raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  for v_tag in select value from jsonb_array_elements(coalesce(p_payload -> 'tags','[]'::jsonb)) loop
    if exists (
      select 1 from public.cms_blog_tags tag
      where tag.id=(v_tag->>'id')::uuid and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id,tag.created_by,tag.created_at,v_environment
        ) or not private.cms_content_actor_row_scope_allowed(
          p_actor_id,tag.updated_by,tag.updated_at,v_environment
        )
      )
    ) then raise exception 'CMS_CONTENT_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  end loop;
  perform set_config('cms.content_mutation_actor_id',p_actor_id::text,true);
  perform public.cms_sync_blog_taxonomy_unscoped_0069(
    p_actor_id,p_payload,p_aal,p_session_id,p_issued_at
  );
end;
$$;

create or replace function public.cms_issue_preview(
  p_actor_id uuid,
  p_item_id uuid,
  p_revision_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer,
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
  v_environment text := private.cms_content_actor_environment(p_actor_id);
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_revision public.cms_content_revisions%rowtype;
  v_payload jsonb;
  v_seo jsonb;
  v_payload_actor uuid;
  v_payload_at timestamptz;
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= statement_timestamp()
     or p_expires_at > statement_timestamp() + interval '30 minutes'
     or p_max_uses not between 1 and 50 then
    raise exception 'CMS_PREVIEW_TOKEN_INVALID' using errcode='22023';
  end if;
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,v_environment);
  select * into v_item from public.cms_content_items where id=p_item_id;
  if not public.cms_actor_authorized(
    p_actor_id,public.cms_editorial_required_permission(v_item.content_type,'preview'),
    p_aal,p_session_id,p_issued_at
  ) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;

  if p_revision_id is null then
    select * into v_draft
    from public.cms_content_drafts where item_id=p_item_id for share;
    if not found then raise exception 'CMS_DRAFT_NOT_FOUND' using errcode='P0002'; end if;
    v_payload:=v_draft.payload; v_seo:=v_draft.seo;
    v_payload_actor:=v_draft.updated_by; v_payload_at:=v_draft.updated_at;
  else
    select * into v_revision
    from public.cms_content_revisions
    where id=p_revision_id and item_id=p_item_id for share;
    if not found then raise exception 'CMS_REVISION_NOT_FOUND' using errcode='P0002'; end if;
    v_payload:=v_revision.payload; v_seo:=v_revision.seo;
    v_payload_actor:=v_revision.created_by; v_payload_at:=v_revision.created_at;
  end if;
  if not private.cms_content_actor_row_scope_allowed(
    p_actor_id,v_payload_actor,v_payload_at,v_environment
  ) then raise exception 'CMS_PREVIEW_ACTOR_SCOPE_INVALID' using errcode='42501'; end if;

  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id=p_actor_id for share;
  if found and p_expires_at > v_lease.expires_at then
    raise exception 'CMS_PREVIEW_TOKEN_INVALID' using errcode='22023';
  end if;
  perform private.cms_validate_preview_document_scope(
    p_actor_id,v_item.content_type,v_payload,p_aal,p_session_id,p_issued_at
  );
  perform private.cms_validate_preview_media_scope(
    p_actor_id,v_payload,p_aal,p_session_id,p_issued_at
  );
  insert into public.cms_preview_tokens(
    token_hash,item_id,revision_id,snapshot_payload,snapshot_seo,
    created_by,expires_at,max_uses
  ) values(
    p_token_hash,p_item_id,p_revision_id,v_payload,v_seo,
    p_actor_id,p_expires_at,p_max_uses
  );
  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values(
    p_actor_id,'cms:content.preview','content_item',p_item_id::text,
    jsonb_build_object('expiresAt',p_expires_at,'maxUses',p_max_uses),p_correlation_id
  );
  return jsonb_build_object('expiresAt',p_expires_at,'maxUses',p_max_uses);
end;
$$;

alter function public.cms_execute_draft_v2_command(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) rename to cms_execute_draft_v2_command_unscoped_0069;
revoke all on function public.cms_execute_draft_v2_command_unscoped_0069(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;

create function public.cms_execute_draft_v2_command(
  p_actor_id uuid,
  p_action text,
  p_draft_id uuid,
  p_content_type text,
  p_working_title text,
  p_patch jsonb,
  p_reason text,
  p_expected_version bigint,
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
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_seed public.cms_content_drafts_v2%rowtype;
  v_locked public.cms_content_drafts_v2%rowtype;
  v_result jsonb;
  v_result_id uuid;
begin
  if p_environment not in ('local','staging','production')
     or p_site_key <> 'main'
     or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode='42501';
  end if;
  if p_action='create' then
    perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  else
    select * into v_seed from public.cms_content_drafts_v2 where id=p_draft_id;
    if not found then raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode='P0002'; end if;
    perform private.cms_lock_active_qa_actor_leases(array[
      p_actor_id,v_seed.created_by,v_seed.updated_by
    ]);
    select * into v_locked
    from public.cms_content_drafts_v2 where id=p_draft_id for update;
    if not found then raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode='P0002'; end if;
    if v_locked.created_by is distinct from v_seed.created_by
       or v_locked.updated_by is distinct from v_seed.updated_by then
      raise exception 'CMS_DRAFT_V2_SCOPE_RACE' using errcode='40001';
    end if;
    if v_locked.environment <> p_environment or v_locked.site_key <> p_site_key
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_locked.created_by,v_locked.created_at,p_environment
       )
       or not private.cms_content_actor_row_scope_allowed(
         p_actor_id,v_locked.updated_by,v_locked.updated_at,p_environment
       ) then
      raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  perform set_config('cms.content_mutation_actor_id',p_actor_id::text,true);
  v_result:=public.cms_execute_draft_v2_command_unscoped_0069(
    p_actor_id,p_action,p_draft_id,p_content_type,p_working_title,p_patch,p_reason,
    p_expected_version,p_environment,p_site_key,p_aal,p_session_id,p_issued_at,
    p_command_id,p_idempotency_key,p_request_hash,p_correlation_id
  );
  v_result_id:=nullif(v_result->>'draftId','')::uuid;
  if v_result_id is not null and not exists(
    select 1 from public.cms_content_drafts_v2 draft
    where draft.id=v_result_id
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.created_by,draft.created_at,p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.updated_by,draft.updated_at,p_environment
      )
  ) then raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode='42501'; end if;
  return v_result;
end;
$$;

create or replace function public.cms_get_draft_v2(
  p_actor_id uuid,
  p_draft_id uuid,
  p_content_type text,
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
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_draft public.cms_content_drafts_v2%rowtype;
  v_permission text;
begin
  perform public.cms_draft_v2_assert_available(
    p_actor_id,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  if not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode='42501';
  end if;
  if p_draft_id is not null then
    select * into v_draft
    from public.cms_content_drafts_v2 draft
    where draft.id=p_draft_id
      and draft.environment=p_environment
      and draft.site_key=p_site_key
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.created_by,draft.created_at,p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.updated_by,draft.updated_at,p_environment
      );
  elsif p_content_type is not null then
    select * into v_draft
    from public.cms_content_drafts_v2 draft
    where draft.content_type=p_content_type
      and draft.environment=p_environment
      and draft.site_key=p_site_key
      and draft.status='active'
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.created_by,draft.created_at,p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id,draft.updated_by,draft.updated_at,p_environment
      )
    order by draft.updated_at desc,draft.id limit 1;
  else raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode='22023'; end if;
  if not found then
    if p_draft_id is null then return null; end if;
    raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode='P0002';
  end if;
  v_permission:=public.cms_editorial_required_permission(v_draft.content_type,'save');
  if v_permission is null or not public.cms_actor_authorized(
    p_actor_id,v_permission,p_aal,p_session_id,p_issued_at
  ) then raise exception 'CMS_DRAFT_V2_FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'schemaVersion',2,'draftId',v_draft.id,'contentType',v_draft.content_type,
    'workingTitle',v_draft.working_title,'fields',v_draft.fields,
    'fieldsHash',v_draft.fields_hash,'status',v_draft.status,
    'lockVersion',v_draft.lock_version,'createdAt',v_draft.created_at,
    'updatedAt',v_draft.updated_at
  );
end;
$$;

alter function public.cms_record_quality_run(
  uuid,uuid,text,text,jsonb,jsonb,uuid,uuid
) rename to cms_record_quality_run_unscoped_0069;
revoke all on function public.cms_record_quality_run_unscoped_0069(
  uuid,uuid,text,text,jsonb,jsonb,uuid,uuid
) from public, anon, authenticated, service_role;
create function public.cms_record_quality_run(
  p_item_id uuid,p_revision_id uuid,p_trigger_kind text,p_status text,
  p_counts jsonb,p_findings jsonb,p_actor_id uuid,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare v_environment text:=private.cms_content_actor_environment(p_actor_id);
begin
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,v_environment);
  if p_revision_id is not null and not exists(
    select 1 from public.cms_content_revisions revision
    where revision.id=p_revision_id and revision.item_id=p_item_id
  ) then raise exception 'CMS_REVISION_NOT_FOUND' using errcode='P0002'; end if;
  return public.cms_record_quality_run_unscoped_0069(
    p_item_id,p_revision_id,p_trigger_kind,p_status,p_counts,p_findings,
    p_actor_id,p_correlation_id
  );
end;
$$;

create or replace function public.cms_create_quality_waiver_scoped(
  p_actor_id uuid,p_item_id uuid,p_rule_key text,p_reason text,
  p_expires_at timestamptz,p_environment text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare v_waiver public.cms_quality_waivers%rowtype;
begin
  if not public.cms_actor_authorized(
    p_actor_id,'cms:quality.waive',p_aal,p_session_id,p_issued_at
  ) then raise exception 'CMS_QUALITY_FORBIDDEN' using errcode='42501'; end if;
  if p_environment <> private.cms_content_actor_environment(p_actor_id)
     and exists(select 1 from private.cms_qa_actor_leases lease where lease.actor_id=p_actor_id) then
    raise exception 'CMS_QUALITY_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,p_environment);
  insert into public.cms_quality_waivers(
    item_id,rule_key,reason,expires_at,created_by,correlation_id
  ) values(
    p_item_id,p_rule_key,p_reason,p_expires_at,p_actor_id,p_correlation_id
  ) returning * into v_waiver;
  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,correlation_id,event_data
  ) values(
    p_actor_id,'cms:quality.waived','content_item',p_item_id::text,p_correlation_id,
    jsonb_build_object('ruleKey',p_rule_key,'expiresAt',p_expires_at,'reason',p_reason)
  );
  return to_jsonb(v_waiver);
end;
$$;

-- Bind every quality receipt to the exact content graph/environment. Existing
-- receipts remain readable only after the requested item passes the new scope
-- check; null legacy bindings are upgraded under the receipt row lock.
alter table public.cms_quality_command_receipts
  add column if not exists item_id uuid,
  add column if not exists environment text;
alter table public.cms_quality_command_receipts
  drop constraint if exists cms_quality_receipt_scope_pair_check;
alter table public.cms_quality_command_receipts
  add constraint cms_quality_receipt_scope_pair_check check(
    (item_id is null and environment is null)
    or (item_id is not null and environment in ('local','staging','production'))
  );
create index if not exists cms_quality_receipts_item_idx
  on public.cms_quality_command_receipts(item_id,created_at desc)
  where item_id is not null;

create or replace function public.cms_execute_quality_command_scoped(
  p_actor_id uuid,
  p_action text,
  p_item_id uuid,
  p_environment text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_payload jsonb,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_quality_command_receipts%rowtype;
  v_run public.cms_quality_runs%rowtype;
  v_run_result jsonb;
  v_waiver public.cms_quality_waivers%rowtype;
  v_response jsonb;
  v_findings jsonb;
begin
  v_permission:=case p_action
    when 'run' then 'cms:quality.run'
    when 'waive' then 'cms:quality.waive'
    else null
  end;
  if v_permission is null
     or p_idempotency_key is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_correlation_id is null
     or not private.cms_content_actor_context_active(p_actor_id,p_environment)
     or not public.cms_actor_authorized(
       p_actor_id,v_permission,p_aal,p_session_id,p_issued_at
     ) then
    raise exception 'CMS_QUALITY_FORBIDDEN' using errcode='42501';
  end if;

  -- private.cms_lock_content_item_for_actor establishes lease -> item order.
  -- The receipt is locked only afterwards, so lease teardown cannot race a
  -- completed response into another actor scope.
  perform private.cms_lock_content_item_for_actor(
    p_actor_id,p_item_id,p_environment
  );
  select * into v_receipt
  from public.cms_quality_command_receipts receipt
  where receipt.actor_id=p_actor_id
    and receipt.action=p_action
    and receipt.idempotency_key=p_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash<>p_request_hash
       or (v_receipt.item_id is not null and v_receipt.item_id<>p_item_id)
       or (v_receipt.environment is not null and v_receipt.environment<>p_environment) then
      raise exception 'CMS_QUALITY_IDEMPOTENCY_CONFLICT' using errcode='40001';
    end if;
    if v_receipt.item_id is null then
      update public.cms_quality_command_receipts receipt
      set item_id=p_item_id,environment=p_environment
      where receipt.actor_id=p_actor_id
        and receipt.action=p_action
        and receipt.idempotency_key=p_idempotency_key;
    end if;
    if v_receipt.response is not null then return v_receipt.response; end if;

    -- Reconcile an in-flight receipt left by the pre-0069 Edge implementation.
    if p_action='run' then
      select * into v_run from public.cms_quality_runs run
      where run.item_id=p_item_id
        and run.actor_id=p_actor_id
        and run.correlation_id=p_correlation_id
      order by run.checked_at desc,run.id desc limit 1;
      if found then
        select coalesce(jsonb_agg(jsonb_build_object(
          'ruleKey',finding.rule_key,'category',finding.category,
          'severity',finding.severity,'fieldPath',finding.field_path,
          'message',finding.message,'waived',finding.waived
        ) order by finding.created_at,finding.id),'[]'::jsonb)
        into v_findings from public.cms_quality_findings finding
        where finding.run_id=v_run.id;
        v_response:=jsonb_build_object(
          'schemaVersion',1,'runId',v_run.id,'itemId',p_item_id,
          'rulesetVersion',v_run.ruleset_version,'status',v_run.status,
          'counts',v_run.finding_counts,'findings',v_findings,
          'checkedAt',v_run.checked_at,'correlationId',p_correlation_id
        );
      end if;
    else
      select * into v_waiver from public.cms_quality_waivers waiver
      where waiver.item_id=p_item_id
        and waiver.created_by=p_actor_id
        and waiver.correlation_id=p_correlation_id
      order by waiver.created_at desc,waiver.id desc limit 1;
      if found then
        v_response:=jsonb_build_object(
          'waiver',to_jsonb(v_waiver),'correlationId',p_correlation_id
        );
      end if;
    end if;
  else
    insert into public.cms_quality_command_receipts(
      actor_id,action,idempotency_key,request_hash,item_id,environment
    ) values(
      p_actor_id,p_action,p_idempotency_key,p_request_hash,p_item_id,p_environment
    );
  end if;

  if v_response is null and p_action='run' then
    if p_payload->>'trigger' not in ('manual','release')
       or p_payload->>'status' not in ('passed','warning','blocked')
       or jsonb_typeof(p_payload->'counts') is distinct from 'object'
       or jsonb_typeof(p_payload->'findings') is distinct from 'array' then
      raise exception 'CMS_QUALITY_RUN_INVALID' using errcode='22023';
    end if;
    v_run_result:=public.cms_record_quality_run_unscoped_0069(
      p_item_id,null,p_payload->>'trigger',p_payload->>'status',
      p_payload->'counts',p_payload->'findings',p_actor_id,p_correlation_id
    );
    v_response:=jsonb_build_object(
      'schemaVersion',1,'runId',v_run_result->'runId','itemId',p_item_id,
      'rulesetVersion','v1','status',p_payload->>'status',
      'counts',p_payload->'counts','findings',p_payload->'findings',
      'checkedAt',v_run_result->'checkedAt','correlationId',p_correlation_id
    );
  elsif v_response is null then
    if char_length(btrim(coalesce(p_payload->>'ruleKey',''))) not between 3 and 120
       or char_length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500
       or nullif(p_payload->>'expiresAt','') is null
       or (p_payload->>'expiresAt')::timestamptz<=statement_timestamp() then
      raise exception 'CMS_QUALITY_WAIVER_INVALID' using errcode='22023';
    end if;
    insert into public.cms_quality_waivers(
      item_id,rule_key,reason,expires_at,created_by,correlation_id
    ) values(
      p_item_id,p_payload->>'ruleKey',p_payload->>'reason',
      (p_payload->>'expiresAt')::timestamptz,p_actor_id,p_correlation_id
    ) returning * into v_waiver;
    insert into public.cms_audit_log(
      actor_id,action,target_type,target_id,correlation_id,event_data
    ) values(
      p_actor_id,'cms:quality.waived','content_item',p_item_id::text,
      p_correlation_id,jsonb_build_object(
        'ruleKey',v_waiver.rule_key,'expiresAt',v_waiver.expires_at,
        'reason',v_waiver.reason
      )
    );
    v_response:=jsonb_build_object(
      'waiver',to_jsonb(v_waiver),'correlationId',p_correlation_id
    );
  end if;

  update public.cms_quality_command_receipts receipt
  set response=v_response,completed_at=coalesce(receipt.completed_at,clock_timestamp()),
      item_id=p_item_id,environment=p_environment
  where receipt.actor_id=p_actor_id
    and receipt.action=p_action
    and receipt.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.cms_draft_v2_conflict_scoped(
  p_actor_id uuid,p_draft_id uuid,p_environment text,p_site_key text,
  p_aal text,p_session_id text,p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,pg_temp
as $$
declare
  v_seed public.cms_content_drafts_v2%rowtype;
  v_draft public.cms_content_drafts_v2%rowtype;
  v_event_id uuid;
begin
  select * into v_seed from public.cms_content_drafts_v2 draft
  where draft.id=p_draft_id;
  if not found then raise exception 'CMS_DRAFT_V2_NOT_FOUND' using errcode='P0002'; end if;
  perform private.cms_lock_active_qa_actor_leases(
    array[p_actor_id,v_seed.created_by,v_seed.updated_by]
  );
  select * into v_draft from public.cms_content_drafts_v2 draft
  where draft.id=p_draft_id for share;
  if not found
     or v_draft.created_by is distinct from v_seed.created_by
     or v_draft.updated_by is distinct from v_seed.updated_by then
    raise exception 'CMS_DRAFT_V2_SCOPE_RACE' using errcode='40001';
  end if;
  perform public.cms_get_draft_v2(
    p_actor_id,p_draft_id,null,p_environment,p_site_key,p_aal,p_session_id,p_issued_at
  );
  select event.id into v_event_id from public.cms_draft_v2_events event
  where event.draft_id=p_draft_id
  order by event.occurred_at desc,event.id desc limit 1;
  return jsonb_build_object('currentVersion',v_draft.lock_version,'diffRef',v_event_id);
end;
$$;

alter function public.cms_publish_due_schedule(uuid,uuid)
  rename to cms_publish_due_schedule_unscoped_0069;
revoke all on function public.cms_publish_due_schedule_unscoped_0069(uuid,uuid)
  from public, anon, authenticated, service_role;
create function public.cms_publish_due_schedule(p_item_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, pg_temp as $$
declare v_actor_id uuid; v_environment text;
begin
  select item.updated_by into v_actor_id
  from public.cms_content_items item where item.id=p_item_id;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode='P0002'; end if;
  v_environment:=private.cms_content_actor_environment(v_actor_id);
  perform private.cms_lock_content_item_for_actor(v_actor_id,p_item_id,v_environment);
  return public.cms_publish_due_schedule_unscoped_0069(p_item_id,p_correlation_id);
end;
$$;

-- Browser cleanup is not a correctness boundary. If the runner dies, the
-- lease transition archives every non-singleton fixture and the existing
-- unpublish trigger removes its public/derived/search projections atomically.
create or replace function private.cms_cleanup_qa_content_before_terminal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_archived integer := 0;
  v_drafts_discarded integer := 0;
  v_quality_receipts integer := 0;
begin
  if old.status <> 'active' or new.status = 'active' then return new; end if;
  perform set_config('cms.content_mutation_actor_id',old.actor_id::text,true);

  update public.cms_content_items item
  set workflow_status='archived',archived_at=clock_timestamp(),scheduled_for=null,
      deleted_at=null,deleted_by=null,updated_by=old.actor_id
  where item.created_by=old.actor_id
    and item.content_type not in ('navigation','site_settings')
    and item.workflow_status <> 'archived';
  get diagnostics v_archived = row_count;

  -- Defensive reconciliation for legacy rows that were already marked
  -- terminal without running the publication trigger.
  delete from public.cms_publications publication
  using public.cms_content_items item
  where publication.item_id=item.id
    and item.created_by=old.actor_id
    and item.content_type not in ('navigation','site_settings');
  delete from public.cms_published_projection projection
  using public.cms_content_items item
  where projection.item_id=item.id
    and item.created_by=old.actor_id
    and item.content_type not in ('navigation','site_settings');

  update public.cms_content_drafts_v2 draft
  set status='discarded',discarded_at=coalesce(draft.discarded_at,clock_timestamp()),
      lock_version=draft.lock_version+1,updated_by=old.actor_id
  where draft.created_by=old.actor_id and draft.status='active';
  get diagnostics v_drafts_discarded = row_count;

  update public.cms_search_rules rule
  set active=false,lock_version=rule.lock_version+1,updated_by=old.actor_id
  where rule.created_by=old.actor_id and rule.active;
  update public.cms_search_synonyms synonym
  set active=false,lock_version=synonym.lock_version+1,updated_by=old.actor_id
  where synonym.created_by=old.actor_id and synonym.active;
  update public.cms_search_index_jobs job
  set status='failed',error_code='cms_qa_lease_terminal',
      completed_at=clock_timestamp()
  where job.requested_by=old.actor_id and job.status in ('pending','running');

  delete from public.cms_quality_command_receipts receipt
  where receipt.actor_id=old.actor_id;
  get diagnostics v_quality_receipts = row_count;

  if exists(
    select 1 from public.cms_published_projection projection
    join public.cms_content_items item on item.id=projection.item_id
    where item.created_by=old.actor_id
      and item.content_type not in ('navigation','site_settings')
  ) or exists(
    select 1 from public.cms_content_drafts_v2 draft
    where draft.created_by=old.actor_id and draft.status='active'
  ) then
    raise exception 'CMS_QA_CONTENT_CLEANUP_INCOMPLETE' using errcode='55000';
  end if;

  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values(
    old.actor_id,'cms:qa.content_compensated','qa_actor',old.actor_id::text,
    jsonb_build_object(
      'schemaVersion',1,'syntheticOnly',true,'itemsArchived',v_archived,
      'draftsV2Discarded',v_drafts_discarded,
      'qualityReceiptsRemoved',v_quality_receipts,'terminalStatus',new.status
    ),gen_random_uuid()
  );
  return new;
end;
$$;

drop trigger if exists zz_cms_cleanup_qa_content_before_terminal
  on private.cms_qa_actor_leases;
create trigger zz_cms_cleanup_qa_content_before_terminal
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_qa_content_before_terminal();

-- Direct PostgREST reads use the same authoritative graph predicate as Edge.
drop policy if exists cms_content_items_authorized_read on public.cms_content_items;
create policy cms_content_items_authorized_read on public.cms_content_items
for select to authenticated using (
  public.cms_can_read_content(content_type)
  and public.cms_content_item_session_read_allowed(id)
);

drop policy if exists cms_content_drafts_authorized_read on public.cms_content_drafts;
create policy cms_content_drafts_authorized_read on public.cms_content_drafts
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
  and exists (
    select 1 from public.cms_content_items item
    where item.id=item_id and public.cms_can_read_content(item.content_type)
  )
);

drop policy if exists cms_content_revisions_authorized_read on public.cms_content_revisions;
create policy cms_content_revisions_authorized_read on public.cms_content_revisions
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
  and exists (
    select 1 from public.cms_content_items item
    where item.id=item_id and public.cms_can_read_content(item.content_type)
  )
);

drop policy if exists cms_content_taxonomy_authorized_read on public.cms_content_taxonomy;
create policy cms_content_taxonomy_authorized_read on public.cms_content_taxonomy
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
  and public.cms_content_actor_row_session_read_allowed(assigned_by,assigned_at)
);

drop policy if exists cms_publications_authorized_read on public.cms_publications;
create policy cms_publications_authorized_read on public.cms_publications
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_outbox_diagnostics_read on public.cms_publication_outbox;
create policy cms_outbox_diagnostics_read on public.cms_publication_outbox
for select to authenticated using (
  public.cms_has_permission('cms:diagnostics.read')
  and public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_approvals_authorized_read on public.cms_content_approvals;
create policy cms_approvals_authorized_read on public.cms_content_approvals
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_projection_authorized_read on public.cms_published_projection;
drop policy if exists cms_projection_public_read on public.cms_published_projection;
create policy cms_projection_authorized_read on public.cms_published_projection
for select to authenticated using (
  public.cms_can_read_content(content_type)
  and public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_taxonomy_authorized_read on public.cms_taxonomy_terms;
create policy cms_taxonomy_authorized_read on public.cms_taxonomy_terms
for select to authenticated using (
  public.cms_has_permission('cms:taxonomy.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
);

drop policy if exists cms_blog_authors_read on public.cms_blog_authors;
create policy cms_blog_authors_read on public.cms_blog_authors
for select to authenticated using (
  public.cms_has_permission('cms:posts.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
);
drop policy if exists cms_blog_categories_read on public.cms_blog_categories;
create policy cms_blog_categories_read on public.cms_blog_categories
for select to authenticated using (
  public.cms_has_permission('cms:posts.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
);
drop policy if exists cms_blog_tags_read on public.cms_blog_tags;
create policy cms_blog_tags_read on public.cms_blog_tags
for select to authenticated using (
  public.cms_has_permission('cms:posts.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
);

drop policy if exists cms_product_projection_authorized on public.cms_product_projection;
create policy cms_product_projection_authorized on public.cms_product_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_product_variants_authorized on public.cms_product_variant_projection;
create policy cms_product_variants_authorized on public.cms_product_variant_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_product_attributes_authorized on public.cms_product_attribute_projection;
create policy cms_product_attributes_authorized on public.cms_product_attribute_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_product_documents_authorized on public.cms_product_document_projection;
create policy cms_product_documents_authorized on public.cms_product_document_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_product_relations_authorized on public.cms_product_relation_projection;
create policy cms_product_relations_authorized on public.cms_product_relation_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_product_search_terms_authorized on public.cms_product_search_term_projection;
create policy cms_product_search_terms_authorized on public.cms_product_search_term_projection
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_redirects_authorized on public.cms_redirects;
create policy cms_redirects_authorized on public.cms_redirects
for select to authenticated using (
  public.cms_has_permission('cms:products.read')
  and public.cms_content_item_session_read_allowed(item_id)
);

revoke select on table public.cms_discovery_projection from anon;
drop policy if exists cms_discovery_public_read on public.cms_discovery_projection;
create policy cms_discovery_authorized_read on public.cms_discovery_projection
for select to authenticated using (
  public.cms_can_read_content(content_type)
  and public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_route_rules_public on public.cms_route_rules;
create policy cms_route_rules_public on public.cms_route_rules
for select to anon using (active);
create policy cms_route_rules_authorized on public.cms_route_rules
for select to authenticated using (
  active and public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_quality_runs_read on public.cms_quality_runs;
create policy cms_quality_runs_read on public.cms_quality_runs
for select to authenticated using (
  public.cms_has_permission('cms:quality.read')
  and public.cms_content_item_session_read_allowed(item_id)
);
drop policy if exists cms_quality_findings_read on public.cms_quality_findings;
create policy cms_quality_findings_read on public.cms_quality_findings
for select to authenticated using (
  public.cms_has_permission('cms:quality.read')
  and exists (
    select 1 from public.cms_quality_runs run
    where run.id=run_id and public.cms_content_item_session_read_allowed(run.item_id)
  )
);
drop policy if exists cms_quality_waivers_read on public.cms_quality_waivers;
create policy cms_quality_waivers_read on public.cms_quality_waivers
for select to authenticated using (
  public.cms_has_permission('cms:quality.read')
  and public.cms_content_item_session_read_allowed(item_id)
);

drop policy if exists cms_search_synonyms_cms_read on public.cms_search_synonyms;
create policy cms_search_synonyms_cms_read on public.cms_search_synonyms
for select to authenticated using (
  public.cms_has_permission('cms:search.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
);
drop policy if exists cms_search_rules_read on public.cms_search_rules;
create policy cms_search_rules_read on public.cms_search_rules
for select to authenticated using (
  public.cms_has_permission('cms:search.read')
  and public.cms_content_actor_row_session_read_allowed(created_by,created_at)
  and public.cms_content_actor_row_session_read_allowed(updated_by,updated_at)
  and (target_item_id is null or public.cms_content_item_session_read_allowed(target_item_id))
);
drop policy if exists cms_search_jobs_read on public.cms_search_index_jobs;
create policy cms_search_jobs_read on public.cms_search_index_jobs
for select to authenticated using (
  public.cms_has_permission('cms:search.read')
  and requested_by is not null
  and public.cms_content_actor_row_session_read_allowed(requested_by,created_at)
);

-- Private primitives are never callable across the PostgREST boundary.
revoke all on function private.cms_content_actor_row_scope_allowed(uuid,uuid,timestamptz,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_actor_environment(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_actor_context_active(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_payload_asset_scope_allowed(uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_payload_document_scope_allowed(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_payload_controlled_scope_allowed(uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_payload_link_scope_allowed(uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_payload_form_scope_allowed(uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_graph_actor_ids(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_content_item_graph_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_lock_content_item_for_actor(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_cleanup_qa_content_before_terminal()
  from public,anon,authenticated,service_role;

revoke all on function public.cms_content_item_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_content_item_session_read_allowed(uuid) to authenticated;
revoke all on function public.cms_content_actor_row_session_read_allowed(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_content_actor_row_session_read_allowed(uuid,timestamptz)
  to authenticated;

revoke all on function public.cms_content_item_read_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_content_read_bundle_scoped(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_content_list_scoped(uuid,text,text[],text[],integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_search_admin_scoped(uuid,text,text,text[],jsonb,jsonb,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_quality_list_runs_scoped(uuid,text,uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_blog_taxonomy_resolve_scoped(uuid,text,text,text,text[])
  from public,anon,authenticated,service_role;
revoke all on function public.cms_normalize_controlled_payload_scoped(uuid,text,text,jsonb,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_search_governance_list_scoped(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_search_governance_command_scoped(
  uuid,text,text,jsonb,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_search_global_operation_allowed(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_search_begin_global_reindex(
  uuid,text,text,uuid,text,text,timestamptz
) from public,anon,authenticated,service_role;
revoke all on function public.cms_search_finish_global_reindex(
  uuid,text,uuid,text,integer,text
) from public,anon,authenticated,service_role;
revoke all on function public.cms_create_quality_waiver_scoped(
  uuid,uuid,text,text,timestamptz,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_quality_command_scoped(
  uuid,text,uuid,text,uuid,text,jsonb,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_draft_v2_conflict_scoped(
  uuid,uuid,text,text,text,text,timestamptz
) from public,anon,authenticated,service_role;
grant execute on function public.cms_content_item_read_allowed(uuid,uuid,text) to service_role;
grant execute on function public.cms_content_read_bundle_scoped(uuid,uuid,uuid,text) to service_role;
grant execute on function public.cms_content_list_scoped(uuid,text,text[],text[],integer,integer) to service_role;
grant execute on function public.cms_search_admin_scoped(uuid,text,text,text[],jsonb,jsonb,integer,integer) to service_role;
grant execute on function public.cms_quality_list_runs_scoped(uuid,text,uuid,integer) to service_role;
grant execute on function public.cms_blog_taxonomy_resolve_scoped(uuid,text,text,text,text[]) to service_role;
grant execute on function public.cms_normalize_controlled_payload_scoped(uuid,text,text,jsonb,boolean)
  to service_role;
grant execute on function public.cms_search_governance_list_scoped(uuid,text) to service_role;
grant execute on function public.cms_search_governance_command_scoped(
  uuid,text,text,jsonb,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_search_global_operation_allowed(uuid,text) to service_role;
grant execute on function public.cms_search_begin_global_reindex(
  uuid,text,text,uuid,text,text,timestamptz
) to service_role;
grant execute on function public.cms_search_finish_global_reindex(
  uuid,text,uuid,text,integer,text
) to service_role;
grant execute on function public.cms_create_quality_waiver_scoped(
  uuid,uuid,text,text,timestamptz,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_execute_quality_command_scoped(
  uuid,text,uuid,text,uuid,text,jsonb,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_draft_v2_conflict_scoped(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;

-- Receipt contents are reachable only through the scoped transactional RPC.
revoke all on table public.cms_quality_command_receipts
  from public,anon,authenticated,service_role;

revoke all on function public.cms_execute_editorial_command(
  uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,
  text,text,timestamptz,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.cms_execute_editorial_command(
  uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,
  text,text,timestamptz,uuid,uuid
) to service_role;
revoke all on function public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid)
  to service_role;
revoke all on function public.cms_hard_delete_draft(uuid,uuid,text,text,text,timestamptz,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_hard_delete_draft(uuid,uuid,text,text,text,timestamptz,uuid,uuid)
  to service_role;
revoke all on function public.cms_retire_managed_page(uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_retire_managed_page(uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid)
  to service_role;
revoke all on function public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_issue_preview(uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_issue_preview(uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid)
  to service_role;
revoke all on function public.cms_execute_draft_v2_command(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.cms_execute_draft_v2_command(
  uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) to service_role;
revoke all on function public.cms_get_draft_v2(uuid,uuid,text,text,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_get_draft_v2(uuid,uuid,text,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.cms_record_quality_run(uuid,uuid,text,text,jsonb,jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_record_quality_run(uuid,uuid,text,text,jsonb,jsonb,uuid,uuid)
  to service_role;
revoke all on function public.cms_publish_due_schedule(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_publish_due_schedule(uuid,uuid) to service_role;
