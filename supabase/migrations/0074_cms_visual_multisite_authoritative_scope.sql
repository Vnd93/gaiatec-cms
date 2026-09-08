-- Homologacao final: fronteira autoritativa do Estudio Visual e dos candidatos
-- multisite. A classificacao QA vem somente da lease imutavel de 0061; chaves,
-- UUIDs e payloads fornecidos pelo cliente nunca definem o escopo.

alter table public.cms_sites
  add column if not exists qa_actor_id uuid,
  add column if not exists qa_run_tag text,
  add column if not exists qa_candidate_sha text,
  add column if not exists qa_environment text;

-- Classifique somente candidatos historicos que possam ser provados como
-- criados dentro da janela exata. Registros ambiguos continuam fail-closed.
update public.cms_sites site
set qa_actor_id = lease.actor_id,
    qa_run_tag = lease.run_tag,
    qa_candidate_sha = lease.candidate_sha,
    qa_environment = lease.environment
from private.cms_qa_actor_leases lease
where site.site_key <> 'main'
  and site.is_synthetic
  and site.created_by = lease.actor_id
  and site.created_at between lease.created_at and lease.expires_at
  and private.cms_qa_actor_marker_is_exact(
    lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
  )
  and site.qa_actor_id is null;

alter table public.cms_sites
  drop constraint if exists cms_sites_qa_provenance_check;
alter table public.cms_sites
  add constraint cms_sites_qa_provenance_check check (
    (
      qa_actor_id is null and qa_run_tag is null
      and qa_candidate_sha is null and qa_environment is null
    ) or (
      site_key <> 'main'
      and is_synthetic
      and not is_primary
      and qa_actor_id = created_by
      and qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and qa_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(qa_run_tag, 9) = ('-' || left(qa_candidate_sha, 8))
      and qa_environment in ('staging', 'production')
    )
  ) not valid;
alter table public.cms_sites validate constraint cms_sites_qa_provenance_check;

create index if not exists cms_sites_qa_actor_idx
  on public.cms_sites (qa_actor_id, updated_at desc)
  where qa_actor_id is not null;

create or replace function private.cms_visual_normalize_actor_ids(p_actor_ids uuid[])
returns uuid[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(array_agg(distinct actor_id order by actor_id), '{}'::uuid[])
  from unnest(coalesce(p_actor_ids, '{}'::uuid[])) actor(actor_id)
  where actor_id is not null;
$$;

create or replace function private.cms_visual_lock_actor_scope(
  p_actor_id uuid,
  p_actor_ids uuid[],
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_actor_ids uuid[];
  v_subject_id uuid;
begin
  v_actor_ids := private.cms_visual_normalize_actor_ids(
    array_append(coalesce(p_actor_ids, '{}'::uuid[]), p_actor_id)
  );
  -- Sempre lease antes de qualquer lock de recurso. Leases terminais fazem a
  -- mutacao falhar; atores corporativos sem historico simplesmente nao geram linha.
  perform private.cms_lock_active_qa_actor_leases(v_actor_ids);
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_VISUAL_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  foreach v_subject_id in array v_actor_ids loop
    if not private.cms_crb_actor_identity_scope_allowed(
      p_actor_id, v_subject_id, p_environment
    ) then
      raise exception 'CMS_VISUAL_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
  end loop;
end;
$$;

create or replace function private.cms_visual_site_actor_ids(p_site_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_visual_normalize_actor_ids(array_agg(actor_id))
  from (
    select site.qa_actor_id as actor_id from public.cms_sites site where site.id = p_site_id
    union all select site.created_by from public.cms_sites site where site.id = p_site_id
    union all select site.updated_by from public.cms_sites site where site.id = p_site_id
    union all select environment.created_by
      from public.cms_site_environments environment where environment.site_id = p_site_id
    union all select domain.created_by
      from public.cms_site_domains domain where domain.site_id = p_site_id
    union all select theme.created_by
      from public.cms_themes theme where theme.site_id = p_site_id
    union all select theme.updated_by
      from public.cms_themes theme where theme.site_id = p_site_id
    union all select token.created_by
      from public.cms_design_tokens token
      join public.cms_themes theme on theme.id = token.theme_id
      where theme.site_id = p_site_id
    union all select event.actor_id
      from public.cms_site_events event where event.site_id = p_site_id
    union all select receipt.actor_id
      from public.cms_site_command_receipts receipt where receipt.site_id = p_site_id
  ) actors;
$$;

create or replace function private.cms_visual_site_scope_allowed(
  p_actor_id uuid,
  p_site_id uuid,
  p_environment text,
  p_allow_same_run_peer boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_site public.cms_sites%rowtype;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    return false;
  end if;
  select * into v_site from public.cms_sites site where site.id = p_site_id;
  if not found then return false; end if;

  -- O tenant principal e apenas raiz estrutural compartilhada. Nunca e um
  -- candidato mutavel do fluxo multisite.
  if v_site.site_key = 'main' then
    return v_site.is_primary and not v_site.is_synthetic
      and v_site.status = 'active' and not v_site.production_enabled
      and v_site.qa_actor_id is null and v_site.qa_run_tag is null
      and v_site.qa_candidate_sha is null and v_site.qa_environment is null;
  end if;
  if not v_site.is_synthetic or v_site.is_primary
     or v_site.site_key not like 'g9x-%' or v_site.production_enabled then
    return false;
  end if;

  if v_site.qa_actor_id is not null then
    return v_site.qa_environment = p_environment
      and (p_allow_same_run_peer or p_actor_id = v_site.qa_actor_id)
      and exists (
        select 1 from private.cms_qa_actor_leases owner
        where owner.actor_id = v_site.qa_actor_id
          and owner.run_tag = v_site.qa_run_tag
          and owner.candidate_sha = v_site.qa_candidate_sha
          and owner.environment = v_site.qa_environment
          and v_site.created_at between owner.created_at and owner.expires_at
          and private.cms_qa_actor_marker_is_exact(
            owner.actor_id, owner.run_tag, owner.candidate_sha, owner.environment
          )
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, v_site.created_by, v_site.created_at, p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, v_site.updated_by, v_site.updated_at, p_environment
      );
  end if;

  -- Candidato corporativo continua owner-only, como em 0048, mas qualquer
  -- historico QA no criador ou no ultimo editor o torna invisivel.
  return not exists (
      select 1 from private.cms_qa_actor_leases caller where caller.actor_id = p_actor_id
    )
    and v_site.created_by = p_actor_id
    and not exists (
      select 1 from private.cms_qa_actor_leases history
      where history.actor_id in (v_site.created_by, v_site.updated_by)
    );
end;
$$;

create or replace function private.cms_visual_main_catalog_row_allowed(
  p_created_by uuid,
  p_updated_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select not exists (
    select 1 from private.cms_qa_actor_leases lease
    where lease.actor_id in (p_created_by, p_updated_by)
  );
$$;

create or replace function private.cms_visual_symbol_actor_ids(p_symbol_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_visual_normalize_actor_ids(array_agg(actor_id))
  from (
    select symbol.created_by as actor_id
      from public.cms_visual_symbols symbol where symbol.id = p_symbol_id
    union all select symbol.updated_by
      from public.cms_visual_symbols symbol where symbol.id = p_symbol_id
    union all select branch.created_by
      from public.cms_visual_symbols symbol
      join public.cms_page_branches branch on branch.id = symbol.source_branch_id
      where symbol.id = p_symbol_id
    union all select branch.updated_by
      from public.cms_visual_symbols symbol
      join public.cms_page_branches branch on branch.id = symbol.source_branch_id
      where symbol.id = p_symbol_id
    union all
    select content_actor.actor_id
    from public.cms_visual_symbols symbol
    join public.cms_page_branches branch on branch.id = symbol.source_branch_id
    cross join lateral unnest(
      private.cms_content_graph_actor_ids(branch.item_id)
    ) content_actor(actor_id)
    where symbol.id = p_symbol_id
  ) actors;
$$;

create or replace function private.cms_visual_symbol_scope_allowed(
  p_actor_id uuid,
  p_symbol_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_symbol public.cms_visual_symbols%rowtype;
  v_branch public.cms_page_branches%rowtype;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    return false;
  end if;
  select * into v_symbol from public.cms_visual_symbols symbol where symbol.id = p_symbol_id;
  if not found or v_symbol.environment <> p_environment then return false; end if;
  select * into v_branch from public.cms_page_branches branch
  where branch.id = v_symbol.source_branch_id;
  if not found or v_branch.site_id <> v_symbol.site_id
     or v_branch.environment <> v_symbol.environment then return false; end if;
  return private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_symbol.created_by, v_symbol.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_symbol.updated_by, v_symbol.updated_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_branch.created_by, v_branch.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_branch.updated_by, v_branch.updated_at, p_environment
    )
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, v_branch.item_id, p_environment
    );
end;
$$;

create or replace function private.cms_visual_document_actor_ids(p_document jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_reference text;
  v_reference_id uuid;
begin
  if jsonb_typeof(p_document) is distinct from 'object' then return v_ids; end if;

  for v_reference in
    select distinct raw_id from (
      select value #>> '{}' as raw_id
      from jsonb_path_query(p_document, 'lax $.nodes[*].data.assetId') value
      union all
      select value #>> '{}'
      from jsonb_path_query(p_document, 'lax $.nodes[*].data.assetIds[*]') value
      union all
      select value #>> '{}'
      from jsonb_path_query(p_document, 'lax $.nodes[*].data.items[*].assetId') value
    ) references where nullif(raw_id, '') is not null
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select asset.created_by into v_reference_id
      from public.cms_media_assets asset where asset.id = v_reference::uuid;
      if found then v_ids := array_append(v_ids, v_reference_id); end if;
    end if;
  end loop;

  for v_reference in
    select distinct value #>> '{}'
    from jsonb_path_query(p_document, 'lax $.nodes[*].data.itemIds[*]') value
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_ids := array_cat(
        v_ids, private.cms_content_graph_actor_ids(v_reference::uuid)
      );
    end if;
  end loop;

  for v_reference in
    select distinct value #>> '{}'
    from jsonb_path_query(p_document, 'lax $.nodes[*].symbolId') value
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_ids := array_cat(
        v_ids, private.cms_visual_symbol_actor_ids(v_reference::uuid)
      );
    end if;
  end loop;

  for v_reference in
    select distinct value #>> '{}'
    from jsonb_path_query(p_document, 'lax $.nodes[*].data.formId') value
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select form.created_by into v_reference_id
      from public.cms_form_definitions form where form.id = v_reference::uuid;
      if found then v_ids := array_append(v_ids, v_reference_id); end if;
      select form.updated_by into v_reference_id
      from public.cms_form_definitions form where form.id = v_reference::uuid;
      if found then v_ids := array_append(v_ids, v_reference_id); end if;
    end if;
  end loop;

  for v_reference in
    select distinct binding ->> 'sourceId'
    from jsonb_array_elements(
      case when jsonb_typeof(p_document -> 'bindings') = 'array'
        then p_document -> 'bindings' else '[]'::jsonb end
    ) binding
    where binding ->> 'source' = 'content' and binding ? 'sourceId'
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_ids := array_cat(
        v_ids, private.cms_content_graph_actor_ids(v_reference::uuid)
      );
    end if;
  end loop;
  for v_reference in
    select distinct binding ->> 'sourceId'
    from jsonb_array_elements(
      case when jsonb_typeof(p_document -> 'bindings') = 'array'
        then p_document -> 'bindings' else '[]'::jsonb end
    ) binding
    where binding ->> 'source' = 'site' and binding ? 'sourceId'
  loop
    if v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_ids := array_cat(v_ids, private.cms_visual_site_actor_ids(v_reference::uuid));
    end if;
  end loop;
  return private.cms_visual_normalize_actor_ids(v_ids);
end;
$$;

create or replace function private.cms_visual_document_references_scope_allowed(
  p_actor_id uuid,
  p_document jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_payload jsonb;
  v_reference text;
  v_binding jsonb;
begin
  if jsonb_typeof(p_document) is distinct from 'object'
     or jsonb_typeof(p_document -> 'nodes') is distinct from 'array' then
    return false;
  end if;
  v_payload := jsonb_build_object('blocks', p_document -> 'nodes');
  if not private.cms_content_payload_asset_scope_allowed(
       p_actor_id, v_payload, p_environment
     )
     or not private.cms_content_payload_document_scope_allowed(p_actor_id, v_payload)
     or not private.cms_content_payload_controlled_scope_allowed(
       p_actor_id, v_payload, p_environment
     )
     or not private.cms_content_payload_link_scope_allowed(
       p_actor_id, v_payload, p_environment
     )
     or not private.cms_content_payload_form_scope_allowed(
       p_actor_id, v_payload, p_environment
     ) then return false; end if;

  for v_reference in
    select distinct value #>> '{}'
    from jsonb_path_query(p_document, 'lax $.nodes[*].symbolId') value
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not private.cms_visual_symbol_scope_allowed(
         p_actor_id, v_reference::uuid, p_environment
       ) then return false; end if;
  end loop;

  for v_binding in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_document -> 'bindings') = 'array'
        then p_document -> 'bindings' else '[]'::jsonb end
    )
  loop
    if v_binding ->> 'source' = 'content' and v_binding ? 'sourceId' then
      begin v_reference := (v_binding ->> 'sourceId')::uuid::text;
      exception when others then return false; end;
      if not private.cms_content_item_graph_scope_allowed(
        p_actor_id, v_reference::uuid, p_environment
      ) then return false; end if;
    elsif v_binding ->> 'source' = 'site' and v_binding ? 'sourceId' then
      begin v_reference := (v_binding ->> 'sourceId')::uuid::text;
      exception when others then return false; end;
      if not private.cms_visual_site_scope_allowed(
        p_actor_id, v_reference::uuid, p_environment, false
      ) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_visual_branch_actor_ids(p_branch_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_ids uuid[];
  v_document jsonb;
begin
  select private.cms_visual_normalize_actor_ids(array_agg(actor_id)) into v_ids
  from (
    select branch.created_by as actor_id
      from public.cms_page_branches branch where branch.id = p_branch_id
    union all select branch.updated_by
      from public.cms_page_branches branch where branch.id = p_branch_id
    union all select document.created_by
      from public.cms_visual_documents document where document.branch_id = p_branch_id
    union all select document.updated_by
      from public.cms_visual_documents document where document.branch_id = p_branch_id
    union all select symbol.created_by
      from public.cms_visual_symbols symbol where symbol.source_branch_id = p_branch_id
    union all select symbol.updated_by
      from public.cms_visual_symbols symbol where symbol.source_branch_id = p_branch_id
    union all select snapshot.created_by
      from public.cms_visual_snapshots snapshot where snapshot.branch_id = p_branch_id
    union all select event.actor_id
      from public.cms_visual_events event where event.branch_id = p_branch_id
    union all select receipt.actor_id
      from public.cms_visual_command_receipts receipt where receipt.branch_id = p_branch_id
    union all
    select content_actor.actor_id
    from public.cms_page_branches branch
    cross join lateral unnest(
      private.cms_content_graph_actor_ids(branch.item_id)
    ) content_actor(actor_id)
    where branch.id = p_branch_id
  ) actors;
  select document.document into v_document
  from public.cms_visual_documents document where document.branch_id = p_branch_id;
  if found then
    v_ids := array_cat(v_ids, private.cms_visual_document_actor_ids(v_document));
  end if;
  return private.cms_visual_normalize_actor_ids(v_ids);
end;
$$;

create or replace function private.cms_visual_branch_scope_allowed(
  p_actor_id uuid,
  p_branch_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_branch public.cms_page_branches%rowtype;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    return false;
  end if;
  select * into v_branch from public.cms_page_branches branch
  where branch.id = p_branch_id and branch.environment = p_environment;
  if not found then return false; end if;
  return private.cms_visual_site_scope_allowed(
      p_actor_id, v_branch.site_id, p_environment, true
    )
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, v_branch.item_id, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_branch.created_by, v_branch.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_branch.updated_by, v_branch.updated_at, p_environment
    )
    and not exists (
      select 1 from public.cms_visual_documents document
      where document.branch_id = p_branch_id and (
        document.site_id <> v_branch.site_id
        or document.environment <> v_branch.environment
        or not private.cms_content_actor_row_scope_allowed(
          p_actor_id, document.created_by, document.created_at, p_environment
        )
        or not private.cms_content_actor_row_scope_allowed(
          p_actor_id, document.updated_by, document.updated_at, p_environment
        )
        or not private.cms_visual_document_references_scope_allowed(
          p_actor_id, document.document, p_environment
        )
      )
    )
    and exists (
      select 1 from public.cms_visual_documents document
      where document.branch_id = p_branch_id
    )
    and not exists (
      select 1 from public.cms_visual_symbols symbol
      where symbol.source_branch_id = p_branch_id
        and not private.cms_visual_symbol_scope_allowed(
          p_actor_id, symbol.id, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_visual_snapshots snapshot
      where snapshot.branch_id = p_branch_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, snapshot.created_by, snapshot.created_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_visual_events event
      where event.branch_id = p_branch_id and event.actor_id is not null
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, event.actor_id, event.occurred_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_visual_command_receipts receipt
      where receipt.branch_id = p_branch_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, receipt.actor_id, receipt.created_at, p_environment
        )
    );
end;
$$;

create or replace function private.cms_visual_branch_core_scope_allowed(
  p_actor_id uuid,
  p_branch_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_visual_site_scope_allowed(
      p_actor_id, branch.site_id, p_environment, true
    )
    and branch.environment = p_environment
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, branch.item_id, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, branch.created_by, branch.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, branch.updated_by, branch.updated_at, p_environment
    )
  from public.cms_page_branches branch where branch.id = p_branch_id;
$$;

create or replace function private.cms_visual_lock_branch_for_actor(
  p_actor_id uuid,
  p_branch_id uuid,
  p_environment text,
  p_extra_actor_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
  v_seed_actor_ids uuid[];
  v_locked_actor_ids uuid[];
begin
  select branch.item_id into v_item_id
  from public.cms_page_branches branch
  where branch.id = p_branch_id and branch.environment = p_environment;
  if not found then raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode = 'P0002'; end if;
  v_seed_actor_ids := private.cms_visual_normalize_actor_ids(array_cat(
    private.cms_visual_branch_actor_ids(p_branch_id),
    coalesce(p_extra_actor_ids, '{}'::uuid[])
  ));
  perform private.cms_visual_lock_actor_scope(
    p_actor_id, v_seed_actor_ids, p_environment
  );
  perform private.cms_lock_content_item_for_actor(p_actor_id, v_item_id, p_environment);
  perform 1 from public.cms_page_branches branch
  where branch.id = p_branch_id and branch.environment = p_environment
  order by branch.id for update;
  if not found then raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode = 'P0002'; end if;
  perform 1 from public.cms_visual_documents document
  where document.branch_id = p_branch_id order by document.id for update;
  if not found then raise exception 'CMS_VISUAL_DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_locked_actor_ids := private.cms_visual_branch_actor_ids(p_branch_id);
  if exists (
    select 1 from unnest(v_locked_actor_ids) actor(actor_id)
    join private.cms_qa_actor_leases lease on lease.actor_id = actor.actor_id
    where not actor.actor_id = any(array_append(v_seed_actor_ids, p_actor_id))
  ) then raise exception 'CMS_VISUAL_SCOPE_RACE' using errcode = '40001'; end if;
  if not private.cms_visual_branch_scope_allowed(
    p_actor_id, p_branch_id, p_environment
  ) then raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

create or replace function private.cms_visual_lock_site_for_actor(
  p_actor_id uuid,
  p_site_id uuid,
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
  v_seed_actor_ids := private.cms_visual_site_actor_ids(p_site_id);
  if coalesce(cardinality(v_seed_actor_ids), 0) = 0 then
    raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_visual_lock_actor_scope(
    p_actor_id, v_seed_actor_ids, p_environment
  );
  perform 1 from public.cms_sites site where site.id = p_site_id
  order by site.id for update;
  if not found then raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002'; end if;
  v_locked_actor_ids := private.cms_visual_site_actor_ids(p_site_id);
  if exists (
    select 1 from unnest(v_locked_actor_ids) actor(actor_id)
    join private.cms_qa_actor_leases lease on lease.actor_id = actor.actor_id
    where not actor.actor_id = any(array_append(v_seed_actor_ids, p_actor_id))
  ) then raise exception 'CMS_SITES_SCOPE_RACE' using errcode = '40001'; end if;
  if not private.cms_visual_site_scope_allowed(
    p_actor_id, p_site_id, p_environment, false
  ) then raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

create or replace function private.cms_visual_guard_command(
  p_actor_id uuid,
  p_action text,
  p_branch_id uuid,
  p_item_id uuid,
  p_payload jsonb,
  p_environment text,
  p_site_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_ids uuid[] := array[p_actor_id];
  v_document jsonb;
  v_symbol_key text;
  v_existing_symbol_id uuid;
  v_site_id uuid;
begin
  if p_action not in (
    'create_branch', 'save_document', 'snapshot', 'create_symbol',
    'apply_to_draft', 'abandon'
  ) or p_environment not in ('local', 'staging') or p_site_key <> 'main'
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;
  select site.id into v_site_id from public.cms_sites site
  where site.site_key = 'main' and site.is_primary and not site.is_synthetic
    and site.status = 'active' and not site.production_enabled;
  if not found then raise exception 'CMS_VISUAL_SITE_INVALID' using errcode = '55000'; end if;

  if p_action = 'create_branch' then
    if p_branch_id is not null or p_item_id is null then
      raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
    end if;
    v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(p_item_id));
    perform private.cms_visual_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);
    perform private.cms_lock_content_item_for_actor(p_actor_id, p_item_id, p_environment);
    return;
  end if;
  if p_branch_id is null or p_item_id is not null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;

  if p_action = 'save_document' then
    v_document := p_payload -> 'document';
    v_actor_ids := array_cat(
      v_actor_ids, private.cms_visual_document_actor_ids(v_document)
    );
  elsif p_action = 'create_symbol' then
    v_symbol_key := p_payload ->> 'symbolKey';
    select symbol.id into v_existing_symbol_id
    from public.cms_visual_symbols symbol
    where symbol.site_id = v_site_id and symbol.environment = p_environment
      and symbol.symbol_key = v_symbol_key;
    if found then
      v_actor_ids := array_cat(
        v_actor_ids, private.cms_visual_symbol_actor_ids(v_existing_symbol_id)
      );
    end if;
  end if;
  perform private.cms_visual_lock_branch_for_actor(
    p_actor_id, p_branch_id, p_environment, v_actor_ids
  );
  if p_action = 'save_document' and not private.cms_visual_document_references_scope_allowed(
    p_actor_id, v_document, p_environment
  ) then raise exception 'CMS_VISUAL_REFERENCE_FORBIDDEN' using errcode = '42501'; end if;
  if v_existing_symbol_id is not null and not private.cms_visual_symbol_scope_allowed(
    p_actor_id, v_existing_symbol_id, p_environment
  ) then raise exception 'CMS_VISUAL_SYMBOL_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function private.cms_visual_guard_site_command(
  p_actor_id uuid,
  p_action text,
  p_target_site_key text,
  p_environment text,
  p_site_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_site_id uuid;
  v_actor_ids uuid[] := array[p_actor_id];
begin
  if p_action not in ('create_candidate','add_domain','update_tokens','suspend_candidate')
     or p_environment not in ('local','staging') or p_site_key <> 'main'
     or coalesce(p_target_site_key, '') !~ '^g9x-[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'CMS_SITES_COMMAND_INVALID' using errcode = '22023';
  end if;
  select site.id into v_site_id from public.cms_sites site
  where site.site_key = p_target_site_key;
  if p_action = 'create_candidate' then
    if v_site_id is not null then
      v_actor_ids := array_cat(v_actor_ids, private.cms_visual_site_actor_ids(v_site_id));
    end if;
    perform private.cms_visual_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);
    if v_site_id is not null and not private.cms_visual_site_scope_allowed(
      p_actor_id, v_site_id, p_environment, false
    ) then raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002'; end if;
    return;
  end if;
  if v_site_id is null then raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.cms_visual_lock_site_for_actor(p_actor_id, v_site_id, p_environment);
end;
$$;

-- O marcador do candidato e sempre calculado da lease travada. Qualquer valor
-- fornecido por SQL direto e rejeitado; update nunca pode reclassificar a linha.
create or replace function private.cms_visual_site_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_text text := nullif(current_setting('cms.qa_mutation_actor_id', true), '');
  v_actor_id uuid;
  v_lease private.cms_qa_actor_leases%rowtype;
  v_environment text;
begin
  if current_setting('cms.qa_visual_compensating', true) = 'on' then return new; end if;
  if v_actor_text is not null then
    begin v_actor_id := v_actor_text::uuid;
    exception when others then raise exception 'CMS_SITES_ACTOR_CONTEXT_INVALID' using errcode='42501'; end;
  end if;

  if new.site_key = 'main' then
    if new.qa_actor_id is not null or new.qa_run_tag is not null
       or new.qa_candidate_sha is not null or new.qa_environment is not null
       or exists (
         select 1 from private.cms_qa_actor_leases lease where lease.actor_id = v_actor_id
       ) then raise exception 'CMS_SITES_MAIN_IMMUTABLE_SCOPE' using errcode='42501'; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_actor_id is null or v_actor_id is distinct from new.created_by
       or new.updated_by is distinct from new.created_by then
      raise exception 'CMS_SITES_ACTOR_CONTEXT_REQUIRED' using errcode='42501';
    end if;
    perform private.cms_lock_active_qa_actor_leases(array[new.created_by]);
    select * into v_lease from private.cms_qa_actor_leases lease
    where lease.actor_id = new.created_by;
    if found then
      if new.qa_actor_id is not null or new.qa_run_tag is not null
         or new.qa_candidate_sha is not null or new.qa_environment is not null
         or not private.cms_qa_actor_marker_is_exact(
           v_lease.actor_id, v_lease.run_tag, v_lease.candidate_sha, v_lease.environment
         ) or new.created_at not between v_lease.created_at and v_lease.expires_at then
        raise exception 'CMS_SITES_QA_MARKER_SPOOFED' using errcode='42501';
      end if;
      new.qa_actor_id := v_lease.actor_id;
      new.qa_run_tag := v_lease.run_tag;
      new.qa_candidate_sha := v_lease.candidate_sha;
      new.qa_environment := v_lease.environment;
    elsif new.qa_actor_id is not null or new.qa_run_tag is not null
       or new.qa_candidate_sha is not null or new.qa_environment is not null then
      raise exception 'CMS_SITES_QA_MARKER_SPOOFED' using errcode='42501';
    end if;
    return new;
  end if;

  if row(new.qa_actor_id,new.qa_run_tag,new.qa_candidate_sha,new.qa_environment,new.created_by)
     is distinct from
     row(old.qa_actor_id,old.qa_run_tag,old.qa_candidate_sha,old.qa_environment,old.created_by) then
    raise exception 'CMS_SITES_QA_PROVENANCE_IMMUTABLE' using errcode='55000';
  end if;
  if row(new.site_key,new.display_name,new.purpose,new.is_primary,new.is_synthetic,
         new.default_language,new.timezone,new.production_enabled,new.created_at)
     is distinct from
     row(old.site_key,old.display_name,old.purpose,old.is_primary,old.is_synthetic,
         old.default_language,old.timezone,old.production_enabled,old.created_at) then
    raise exception 'CMS_SITES_IDENTITY_IMMUTABLE' using errcode='55000';
  end if;
  if v_actor_id is null or v_actor_id is distinct from new.updated_by then
    raise exception 'CMS_SITES_ACTOR_CONTEXT_REQUIRED' using errcode='42501';
  end if;
  v_environment := coalesce(old.qa_environment, private.cms_content_actor_environment(v_actor_id));
  perform private.cms_visual_lock_actor_scope(
    v_actor_id, private.cms_visual_site_actor_ids(old.id), v_environment
  );
  if not private.cms_visual_site_scope_allowed(v_actor_id, old.id, v_environment, false) then
    raise exception 'CMS_SITES_CROSS_SCOPE_MUTATION_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_visual_branch_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_id uuid;
begin
  if current_setting('cms.qa_visual_compensating', true) = 'on' then return new; end if;
  begin v_actor_id := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
  exception when others then raise exception 'CMS_VISUAL_ACTOR_CONTEXT_INVALID' using errcode='42501'; end;
  if v_actor_id is null then raise exception 'CMS_VISUAL_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if tg_op = 'INSERT' then
    if new.created_by <> v_actor_id or new.updated_by <> v_actor_id then
      raise exception 'CMS_VISUAL_ACTOR_CONTEXT_MISMATCH' using errcode='42501';
    end if;
    perform private.cms_visual_lock_actor_scope(
      v_actor_id, private.cms_content_graph_actor_ids(new.item_id), new.environment
    );
    perform private.cms_lock_content_item_for_actor(v_actor_id,new.item_id,new.environment);
    if not private.cms_visual_site_scope_allowed(v_actor_id,new.site_id,new.environment,true) then
      raise exception 'CMS_VISUAL_SITE_FORBIDDEN' using errcode='42501';
    end if;
    return new;
  end if;
  if row(new.site_id,new.environment,new.item_id,new.branch_key,new.base_revision_id,
         new.base_draft_version,new.created_by,new.created_at)
     is distinct from
     row(old.site_id,old.environment,old.item_id,old.branch_key,old.base_revision_id,
         old.base_draft_version,old.created_by,old.created_at) then
    raise exception 'CMS_VISUAL_BRANCH_PROVENANCE_IMMUTABLE' using errcode='55000';
  end if;
  perform private.cms_visual_lock_actor_scope(
    v_actor_id,private.cms_visual_branch_actor_ids(old.id),old.environment
  );
  perform private.cms_lock_content_item_for_actor(
    v_actor_id,old.item_id,old.environment
  );
  if new.updated_by <> v_actor_id or not private.cms_visual_branch_scope_allowed(
    v_actor_id, old.id, old.environment
  ) then raise exception 'CMS_VISUAL_BRANCH_CROSS_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  return new;
end;
$$;

create or replace function private.cms_visual_child_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_branch_id uuid;
  v_actor_id uuid;
  v_row_actor_id uuid;
  v_environment text;
begin
  if current_setting('cms.qa_visual_compensating', true) = 'on' then return new; end if;
  begin v_actor_id := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
  exception when others then raise exception 'CMS_VISUAL_ACTOR_CONTEXT_INVALID' using errcode='42501'; end;
  if v_actor_id is null then raise exception 'CMS_VISUAL_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;

  if tg_table_name = 'cms_visual_symbols' then
    v_branch_id := nullif(v_new ->> 'source_branch_id','')::uuid;
  else
    v_branch_id := nullif(v_new ->> 'branch_id','')::uuid;
  end if;
  v_row_actor_id := coalesce(
    nullif(v_new ->> 'updated_by','')::uuid,
    nullif(v_new ->> 'created_by','')::uuid,
    nullif(v_new ->> 'actor_id','')::uuid
  );
  if v_row_actor_id is not null and v_row_actor_id <> v_actor_id then
    raise exception 'CMS_VISUAL_ACTOR_CONTEXT_MISMATCH' using errcode='42501';
  end if;
  if tg_table_name in ('cms_visual_documents','cms_visual_symbols') and tg_op='UPDATE' then
    if nullif(v_new ->> 'created_by','')::uuid
       is distinct from nullif(v_old ->> 'created_by','')::uuid
       or (
         tg_table_name='cms_visual_documents' and row(
           v_new ->> 'branch_id',v_new ->> 'site_id',v_new ->> 'environment',
           v_new ->> 'schema_version',v_new ->> 'registry_version',v_new ->> 'created_at'
         ) is distinct from row(
           v_old ->> 'branch_id',v_old ->> 'site_id',v_old ->> 'environment',
           v_old ->> 'schema_version',v_old ->> 'registry_version',v_old ->> 'created_at'
         )
       )
       or (
         tg_table_name='cms_visual_symbols' and row(
           v_new ->> 'site_id',v_new ->> 'environment',v_new ->> 'symbol_key',
           v_new ->> 'name',v_new ->> 'component_key',v_new ->> 'component_version',
           v_new -> 'props',v_new ->> 'source_branch_id',v_new ->> 'source_node_id',
           v_new ->> 'created_at'
         ) is distinct from row(
           v_old ->> 'site_id',v_old ->> 'environment',v_old ->> 'symbol_key',
           v_old ->> 'name',v_old ->> 'component_key',v_old ->> 'component_version',
           v_old -> 'props',v_old ->> 'source_branch_id',v_old ->> 'source_node_id',
           v_old ->> 'created_at'
         )
       ) then raise exception 'CMS_VISUAL_CHILD_PROVENANCE_IMMUTABLE' using errcode='55000'; end if;
  end if;
  if tg_table_name='cms_visual_command_receipts' and tg_op='UPDATE'
     and row(v_new ->> 'actor_id',v_new ->> 'action',v_new ->> 'idempotency_key',
       v_new ->> 'command_id',v_new ->> 'request_hash',v_new ->> 'correlation_id',
       v_new ->> 'created_at') is distinct from
       row(v_old ->> 'actor_id',v_old ->> 'action',v_old ->> 'idempotency_key',
       v_old ->> 'command_id',v_old ->> 'request_hash',v_old ->> 'correlation_id',
       v_old ->> 'created_at') then
    raise exception 'CMS_VISUAL_RECEIPT_PROVENANCE_IMMUTABLE' using errcode='55000';
  end if;
  if v_branch_id is null then
    -- Somente o recibo de create_branch nasce antes de existir um branch.
    if tg_table_name <> 'cms_visual_command_receipts'
       or nullif(v_new ->> 'actor_id','')::uuid <> v_actor_id then
      raise exception 'CMS_VISUAL_BRANCH_CONTEXT_REQUIRED' using errcode='42501';
    end if;
    v_environment := private.cms_content_actor_environment(v_actor_id);
    perform private.cms_visual_lock_actor_scope(v_actor_id,array[v_actor_id],v_environment);
    return new;
  end if;
  select branch.environment into v_environment
  from public.cms_page_branches branch where branch.id=v_branch_id;
  if not found then raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode='P0002'; end if;
  perform private.cms_visual_lock_actor_scope(
    v_actor_id, private.cms_visual_branch_actor_ids(v_branch_id), v_environment
  );
  if tg_table_name='cms_visual_documents' and tg_op='INSERT' then
    if not private.cms_visual_branch_core_scope_allowed(
      v_actor_id,v_branch_id,v_environment
    ) or not private.cms_visual_document_references_scope_allowed(
      v_actor_id,new.document,v_environment
    ) then raise exception 'CMS_VISUAL_CHILD_CROSS_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  elsif tg_table_name='cms_visual_documents' and tg_op='UPDATE' then
    if not private.cms_visual_branch_scope_allowed(
      v_actor_id,v_branch_id,v_environment
    ) or not private.cms_visual_document_references_scope_allowed(
      v_actor_id,new.document,v_environment
    ) then raise exception 'CMS_VISUAL_CHILD_CROSS_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  elsif not private.cms_visual_branch_scope_allowed(
    v_actor_id,v_branch_id,v_environment
  ) then raise exception 'CMS_VISUAL_CHILD_CROSS_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  return new;
end;
$$;

create or replace function private.cms_visual_site_child_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_site_id uuid;
  v_actor_id uuid;
  v_row_actor_id uuid;
  v_environment text;
begin
  if current_setting('cms.qa_visual_compensating', true)='on' then return new; end if;
  begin v_actor_id := nullif(current_setting('cms.qa_mutation_actor_id',true),'')::uuid;
  exception when others then raise exception 'CMS_SITES_ACTOR_CONTEXT_INVALID' using errcode='42501'; end;
  v_row_actor_id := coalesce(
    nullif(v_row ->> 'updated_by','')::uuid,
    nullif(v_row ->> 'created_by','')::uuid,
    nullif(v_row ->> 'actor_id','')::uuid
  );
  if v_row_actor_id is not null and v_actor_id is distinct from v_row_actor_id then
    raise exception 'CMS_SITES_ACTOR_CONTEXT_MISMATCH' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (
       (tg_table_name='cms_site_environments' and row(
         v_row ->> 'site_id',v_row ->> 'environment',v_row ->> 'base_path',
         v_row ->> 'created_by',v_row ->> 'created_at'
       ) is distinct from row(
         v_old ->> 'site_id',v_old ->> 'environment',v_old ->> 'base_path',
         v_old ->> 'created_by',v_old ->> 'created_at'
       ))
       or (tg_table_name='cms_site_domains' and row(
         v_row ->> 'site_id',v_row ->> 'environment',v_row ->> 'hostname',
         v_row ->> 'verified',v_row ->> 'created_by',v_row ->> 'created_at'
       ) is distinct from row(
         v_old ->> 'site_id',v_old ->> 'environment',v_old ->> 'hostname',
         v_old ->> 'verified',v_old ->> 'created_by',v_old ->> 'created_at'
       ))
       or (tg_table_name='cms_themes' and row(
         v_row ->> 'site_id',v_row ->> 'theme_key',v_row ->> 'name',
         v_row ->> 'created_by',v_row ->> 'created_at'
       ) is distinct from row(
         v_old ->> 'site_id',v_old ->> 'theme_key',v_old ->> 'name',
         v_old ->> 'created_by',v_old ->> 'created_at'
       ))
       or (tg_table_name='cms_site_command_receipts' and row(
         v_row ->> 'actor_id',v_row ->> 'action',v_row ->> 'idempotency_key',
         v_row ->> 'command_id',v_row ->> 'request_hash',v_row ->> 'correlation_id',
         v_row ->> 'created_at'
       ) is distinct from row(
         v_old ->> 'actor_id',v_old ->> 'action',v_old ->> 'idempotency_key',
         v_old ->> 'command_id',v_old ->> 'request_hash',v_old ->> 'correlation_id',
         v_old ->> 'created_at'
       ))
     ) then raise exception 'CMS_SITES_CHILD_PROVENANCE_IMMUTABLE' using errcode='55000'; end if;
  if tg_table_name='cms_design_tokens' then
    select theme.site_id into v_site_id from public.cms_themes theme
    where theme.id=nullif(v_row ->> 'theme_id','')::uuid;
  else
    v_site_id := nullif(v_row ->> 'site_id','')::uuid;
  end if;
  if v_site_id is null then
    -- O recibo de create_candidate e reservado antes da criacao do site.
    if tg_table_name <> 'cms_site_command_receipts'
       or nullif(v_row ->> 'actor_id','')::uuid is distinct from v_actor_id
       or v_actor_id is null then
      raise exception 'CMS_SITES_CONTEXT_REQUIRED' using errcode='42501';
    end if;
    v_environment:=private.cms_content_actor_environment(v_actor_id);
    perform private.cms_visual_lock_actor_scope(v_actor_id,array[v_actor_id],v_environment);
    return new;
  end if;
  select coalesce(site.qa_environment,private.cms_content_actor_environment(v_actor_id))
  into v_environment from public.cms_sites site where site.id=v_site_id;
  if not found then raise exception 'CMS_SITES_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.cms_sites site where site.id=v_site_id and site.site_key='main') then
    if exists(
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id=v_actor_id
    ) then raise exception 'CMS_SITES_MAIN_IMMUTABLE_SCOPE' using errcode='42501'; end if;
    return new;
  end if;
  if v_actor_id is null then raise exception 'CMS_SITES_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
  perform private.cms_visual_lock_actor_scope(
    v_actor_id,private.cms_visual_site_actor_ids(v_site_id),v_environment
  );
  if not private.cms_visual_site_scope_allowed(v_actor_id,v_site_id,v_environment,false) then
    raise exception 'CMS_SITES_CHILD_CROSS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_visual_sites_provenance_guard on public.cms_sites;
create trigger cms_visual_sites_provenance_guard
before insert or update on public.cms_sites
for each row execute function private.cms_visual_site_provenance_guard();

drop trigger if exists cms_visual_branch_provenance_guard on public.cms_page_branches;
create trigger cms_visual_branch_provenance_guard
before insert or update on public.cms_page_branches
for each row execute function private.cms_visual_branch_provenance_guard();

drop trigger if exists cms_visual_document_scope_guard on public.cms_visual_documents;
create trigger cms_visual_document_scope_guard
before insert or update on public.cms_visual_documents
for each row execute function private.cms_visual_child_scope_guard();
drop trigger if exists cms_visual_symbol_scope_guard on public.cms_visual_symbols;
create trigger cms_visual_symbol_scope_guard
before insert or update on public.cms_visual_symbols
for each row execute function private.cms_visual_child_scope_guard();
drop trigger if exists cms_visual_snapshot_scope_guard on public.cms_visual_snapshots;
create trigger cms_visual_snapshot_scope_guard
before insert on public.cms_visual_snapshots
for each row execute function private.cms_visual_child_scope_guard();
drop trigger if exists cms_visual_event_scope_guard on public.cms_visual_events;
create trigger cms_visual_event_scope_guard
before insert on public.cms_visual_events
for each row execute function private.cms_visual_child_scope_guard();
drop trigger if exists cms_visual_receipt_scope_guard on public.cms_visual_command_receipts;
create trigger cms_visual_receipt_scope_guard
before insert or update on public.cms_visual_command_receipts
for each row execute function private.cms_visual_child_scope_guard();

drop trigger if exists cms_site_environment_scope_guard on public.cms_site_environments;
create trigger cms_site_environment_scope_guard
before insert or update on public.cms_site_environments
for each row execute function private.cms_visual_site_child_scope_guard();
drop trigger if exists cms_site_domain_scope_guard on public.cms_site_domains;
create trigger cms_site_domain_scope_guard
before insert or update on public.cms_site_domains
for each row execute function private.cms_visual_site_child_scope_guard();
drop trigger if exists cms_theme_scope_guard on public.cms_themes;
create trigger cms_theme_scope_guard
before insert or update on public.cms_themes
for each row execute function private.cms_visual_site_child_scope_guard();
drop trigger if exists cms_design_token_scope_guard on public.cms_design_tokens;
create trigger cms_design_token_scope_guard
before insert on public.cms_design_tokens
for each row execute function private.cms_visual_site_child_scope_guard();
drop trigger if exists cms_site_event_scope_guard on public.cms_site_events;
create trigger cms_site_event_scope_guard
before insert on public.cms_site_events
for each row execute function private.cms_visual_site_child_scope_guard();
drop trigger if exists cms_site_receipt_scope_guard on public.cms_site_command_receipts;
create trigger cms_site_receipt_scope_guard
before insert or update on public.cms_site_command_receipts
for each row execute function private.cms_visual_site_child_scope_guard();

-- Preserve as implementacoes de 0048 sem deixá-las chamaveis pelo service role.
alter function public.cms_get_visual_catalog(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_visual_catalog_unscoped_0074;
alter function public.cms_list_visual_branches(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) rename to cms_list_visual_branches_unscoped_0074;
alter function public.cms_get_visual_document(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_visual_document_unscoped_0074;
alter function public.cms_execute_visual_command(
  uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,
  timestamptz,uuid,uuid,text,uuid
) rename to cms_execute_visual_command_unscoped_0074;
alter function public.cms_get_site_registry(
  uuid,text,text,text,text,timestamptz,uuid
) rename to cms_get_site_registry_unscoped_0074;
alter function public.cms_execute_site_command(
  uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) rename to cms_execute_site_command_unscoped_0074;

create function public.cms_get_visual_catalog(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
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
  v_site_id uuid;
  v_theme record;
  v_components jsonb;
begin
  if p_correlation_id is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode='22023';
  end if;
  perform private.cms_visual_assert_available(
    p_actor_id,'cms:visual.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  perform private.cms_visual_lock_actor_scope(
    p_actor_id,array[p_actor_id],p_environment
  );
  select site.id into v_site_id from public.cms_sites site
  where site.site_key=p_site_key and site.site_key='main'
    and site.status='active' and site.is_primary and not site.is_synthetic
    and not site.production_enabled;
  if not found then raise exception 'CMS_VISUAL_SITE_INVALID' using errcode='55000'; end if;

  select theme.theme_key,token.version,token.tokens into v_theme
  from public.cms_themes theme
  join lateral (
    select design.version,design.tokens
    from public.cms_design_tokens design
    where design.theme_id=theme.id
      and private.cms_visual_main_catalog_row_allowed(design.created_by,null)
    order by design.version desc limit 1
  ) token on true
  where theme.site_id=v_site_id and theme.status='active'
    and private.cms_visual_main_catalog_row_allowed(theme.created_by,theme.updated_by)
  order by theme.created_at limit 1;
  if not found then raise exception 'CMS_VISUAL_THEME_INVALID' using errcode='55000'; end if;

  select jsonb_agg(jsonb_build_object(
    'key',definition.component_key,'name',definition.name,
    'category',definition.category,'version',version.version,
    'rendererKey',version.renderer_key,'allowedModes',to_jsonb(definition.allowed_modes),
    'budget',jsonb_build_object(
      'maxInstances',definition.max_instances,
      'maxPayloadBytes',definition.max_payload_bytes
    ),'defaultProps',definition.default_props
  ) order by definition.component_key) into v_components
  from public.cms_component_definitions definition
  join public.cms_component_versions version
    on version.component_key=definition.component_key and version.version=1
  where definition.active;
  if jsonb_array_length(coalesce(v_components,'[]'::jsonb))<>20 then
    raise exception 'CMS_VISUAL_REGISTRY_INCOMPLETE' using errcode='55000';
  end if;
  return jsonb_build_object(
    'schemaVersion',1,'registryVersion',1,'components',v_components,
    'theme',jsonb_build_object(
      'key',v_theme.theme_key,'version',v_theme.version,'tokens',v_theme.tokens
    ),'environment',p_environment,'siteKey',p_site_key,
    'correlationId',p_correlation_id
  );
end;
$$;

create function public.cms_list_visual_branches(
  p_actor_id uuid,
  p_item_id uuid,
  p_environment text,
  p_site_key text,
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
  v_branch_id uuid;
  v_branch_ids uuid[];
  v_actor_ids uuid[] := array[p_actor_id];
  v_result jsonb;
begin
  perform private.cms_visual_assert_available(
    p_actor_id,'cms:visual.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  if p_item_id is null or p_correlation_id is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode='22023';
  end if;
  perform private.cms_lock_content_item_for_actor(p_actor_id,p_item_id,p_environment);
  select coalesce(array_agg(branch.id order by branch.updated_at desc),'{}'::uuid[])
  into v_branch_ids
  from public.cms_page_branches branch
  join public.cms_sites site on site.id=branch.site_id
  where branch.item_id=p_item_id and branch.environment=p_environment
    and site.site_key=p_site_key
    and private.cms_visual_branch_scope_allowed(p_actor_id,branch.id,p_environment);
  foreach v_branch_id in array v_branch_ids loop
    v_actor_ids:=array_cat(v_actor_ids,private.cms_visual_branch_actor_ids(v_branch_id));
  end loop;
  perform private.cms_visual_lock_actor_scope(p_actor_id,v_actor_ids,p_environment);
  perform 1 from public.cms_page_branches branch
  where branch.id=any(v_branch_ids) order by branch.id for share;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',branch.id,'itemId',branch.item_id,'branchKey',branch.branch_key,
    'status',branch.status,'baseRevisionId',branch.base_revision_id,
    'lockVersion',branch.lock_version,'documentVersion',document.lock_version,
    'documentHash',document.document_hash,'updatedAt',document.updated_at
  ) order by document.updated_at desc),'[]'::jsonb) into v_result
  from public.cms_page_branches branch
  join public.cms_visual_documents document on document.branch_id=branch.id
  where branch.id=any(v_branch_ids)
    and private.cms_visual_branch_scope_allowed(p_actor_id,branch.id,p_environment);
  return jsonb_build_object(
    'schemaVersion',1,'branches',v_result,'correlationId',p_correlation_id
  );
end;
$$;

create function public.cms_get_visual_document(
  p_actor_id uuid,
  p_branch_id uuid,
  p_environment text,
  p_site_key text,
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
begin
  perform private.cms_visual_assert_available(
    p_actor_id,'cms:visual.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  if p_branch_id is null or p_correlation_id is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode='22023';
  end if;
  perform private.cms_visual_lock_branch_for_actor(
    p_actor_id,p_branch_id,p_environment,'{}'::uuid[]
  );
  if not exists(
    select 1 from public.cms_page_branches branch
    join public.cms_sites site on site.id=branch.site_id
    where branch.id=p_branch_id and site.site_key=p_site_key
  ) then raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode='P0002'; end if;
  return public.cms_get_visual_document_unscoped_0074(
    p_actor_id,p_branch_id,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_correlation_id
  );
end;
$$;

create function public.cms_get_site_registry(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
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
  v_site_id uuid;
  v_site_ids uuid[];
  v_actor_ids uuid[]:=array[p_actor_id];
  v_sites jsonb;
begin
  perform private.cms_sites_assert_available(
    p_actor_id,'cms:sites.read',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  if p_correlation_id is null then
    raise exception 'CMS_SITES_COMMAND_INVALID' using errcode='22023';
  end if;
  perform private.cms_visual_lock_actor_scope(p_actor_id,v_actor_ids,p_environment);
  select coalesce(array_agg(site.id order by site.site_key),'{}'::uuid[])
  into v_site_ids from public.cms_sites site
  where (
      site.site_key='main'
      and private.cms_visual_site_scope_allowed(p_actor_id,site.id,p_environment,true)
    ) or (
      site.site_key<>'main'
      and private.cms_visual_site_scope_allowed(p_actor_id,site.id,p_environment,false)
    );
  foreach v_site_id in array v_site_ids loop
    if exists(select 1 from public.cms_sites site where site.id=v_site_id and site.site_key<>'main') then
      v_actor_ids:=array_cat(v_actor_ids,private.cms_visual_site_actor_ids(v_site_id));
    end if;
  end loop;
  perform private.cms_visual_lock_actor_scope(p_actor_id,v_actor_ids,p_environment);
  perform 1 from public.cms_sites site where site.id=any(v_site_ids)
  order by site.id for share;

  select coalesce(jsonb_agg(site_result order by site_result->>'key'),'[]'::jsonb)
  into v_sites from (
    select jsonb_build_object(
      'id',site.id,'key',site.site_key,'name',site.display_name,
      'purpose',site.purpose,'status',site.status,'lockVersion',site.lock_version,
      'primary',site.is_primary,'synthetic',site.is_synthetic,
      'defaultLanguage',site.default_language,'timezone',site.timezone,
      'environments',coalesce((select jsonb_agg(jsonb_build_object(
        'id',environment.id,'key',environment.environment,'status',environment.status
      ) order by environment.environment)
        from public.cms_site_environments environment
        where environment.site_id=site.id and (
          site.site_key<>'main' or private.cms_visual_main_catalog_row_allowed(
            environment.created_by,null
          )
        )),'[]'::jsonb),
      'domains',coalesce((select jsonb_agg(jsonb_build_object(
        'id',domain.id,'environment',domain.environment,
        'hostname',domain.hostname,'status',domain.status
      ) order by domain.hostname)
        from public.cms_site_domains domain
        where domain.site_id=site.id and (
          site.site_key<>'main' or private.cms_visual_main_catalog_row_allowed(
            domain.created_by,null
          )
        )),'[]'::jsonb),
      'themeKey',(select theme.theme_key from public.cms_themes theme
        where theme.site_id=site.id and theme.status='active' and (
          site.site_key<>'main' or private.cms_visual_main_catalog_row_allowed(
            theme.created_by,theme.updated_by
          )
        ) order by theme.created_at limit 1)
    ) site_result from public.cms_sites site
    where site.id=any(v_site_ids) and (
      (site.site_key='main' and private.cms_visual_site_scope_allowed(
        p_actor_id,site.id,p_environment,true
      )) or private.cms_visual_site_scope_allowed(
        p_actor_id,site.id,p_environment,false
      )
    )
  ) registry;
  return jsonb_build_object(
    'schemaVersion',1,'sites',v_sites,'multisiteOperational',false,
    'productionEnabled',false,'correlationId',p_correlation_id
  );
end;
$$;

create function public.cms_execute_visual_command(
  p_actor_id uuid,
  p_action text,
  p_branch_id uuid,
  p_item_id uuid,
  p_payload jsonb,
  p_expected_version bigint,
  p_expected_draft_version bigint,
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
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_permission text;
begin
  v_permission:=case p_action when 'create_branch' then 'cms:visual.branch'
    when 'save_document' then 'cms:visual.edit'
    when 'snapshot' then 'cms:visual.snapshot'
    when 'create_symbol' then 'cms:visual.symbols'
    when 'apply_to_draft' then 'cms:visual.apply'
    when 'abandon' then 'cms:visual.branch' else null end;
  if v_permission is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode='22023';
  end if;
  perform private.cms_visual_assert_available(
    p_actor_id,v_permission,p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  perform private.cms_visual_guard_command(
    p_actor_id,p_action,p_branch_id,p_item_id,p_payload,p_environment,p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_execute_visual_command_unscoped_0074(
    p_actor_id,p_action,p_branch_id,p_item_id,p_payload,p_expected_version,
    p_expected_draft_version,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_command_id,p_idempotency_key,p_request_hash,p_correlation_id
  );
end;
$$;

create function public.cms_execute_site_command(
  p_actor_id uuid,
  p_action text,
  p_target_site_key text,
  p_payload jsonb,
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
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_sites_assert_available(
    p_actor_id,'cms:sites.manage',p_environment,p_site_key,
    p_aal,p_session_id,p_issued_at
  );
  perform private.cms_visual_guard_site_command(
    p_actor_id,p_action,p_target_site_key,p_environment,p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_execute_site_command_unscoped_0074(
    p_actor_id,p_action,p_target_site_key,p_payload,p_expected_version,
    p_environment,p_site_key,p_aal,p_session_id,p_issued_at,p_command_id,
    p_idempotency_key,p_request_hash,p_correlation_id
  );
end;
$$;

create or replace function private.cms_visual_lock_actor_leases_for_terminal(
  p_actor_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
begin
  perform 1 from private.cms_qa_actor_leases lease
  where lease.actor_id=any(private.cms_visual_normalize_actor_ids(p_actor_ids))
  order by lease.actor_id for share;
end;
$$;

create or replace function private.cms_visual_terminalize_qa_graph()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_site_ids uuid[];
  v_branch_ids uuid[];
  v_actor_ids uuid[]:=array[old.actor_id];
  v_id uuid;
  v_branch public.cms_page_branches%rowtype;
  v_site public.cms_sites%rowtype;
  v_document public.cms_visual_documents%rowtype;
  v_previous_actor text:=current_setting('cms.qa_mutation_actor_id',true);
  v_previous_compensating text:=current_setting('cms.qa_visual_compensating',true);
  v_sites integer:=0;
  v_branches integer:=0;
  v_symbols integer:=0;
  v_visual_receipts integer:=0;
  v_site_receipts integer:=0;
begin
  if old.status<>'active' or new.status='active' then return new; end if;

  select coalesce(array_agg(site.id order by site.id),'{}'::uuid[])
  into v_site_ids from public.cms_sites site
  where site.site_key<>'main' and site.is_synthetic and not site.is_primary
    and (
      site.qa_actor_id=old.actor_id
      or old.actor_id=any(private.cms_visual_site_actor_ids(site.id))
    );
  select coalesce(array_agg(branch.id order by branch.id),'{}'::uuid[])
  into v_branch_ids from public.cms_page_branches branch
  where old.actor_id=any(private.cms_visual_branch_actor_ids(branch.id));
  foreach v_id in array v_site_ids loop
    v_actor_ids:=array_cat(v_actor_ids,private.cms_visual_site_actor_ids(v_id));
  end loop;
  foreach v_id in array v_branch_ids loop
    v_actor_ids:=array_cat(v_actor_ids,private.cms_visual_branch_actor_ids(v_id));
  end loop;
  perform private.cms_visual_lock_actor_leases_for_terminal(v_actor_ids);
  perform set_config('cms.qa_mutation_actor_id',old.actor_id::text,true);
  perform set_config('cms.qa_visual_compensating','on',true);

  -- Depois das leases, trave pais em ordem deterministica. Documentos,
  -- snapshots e tokens imutaveis permanecem como evidencia, mas seus pais sao
  -- terminalizados e nenhum RPC/RLS volta a expô-los operacionalmente.
  perform 1 from public.cms_sites site where site.id=any(v_site_ids)
  order by site.id for update;
  perform 1 from public.cms_content_items item
  join public.cms_page_branches branch on branch.item_id=item.id
  where branch.id=any(v_branch_ids) order by item.id for update of item;
  perform 1 from public.cms_page_branches branch where branch.id=any(v_branch_ids)
  order by branch.id for update;
  perform 1 from public.cms_visual_documents document
  where document.branch_id=any(v_branch_ids) order by document.id for update;

  for v_branch in
    select * from public.cms_page_branches branch
    where branch.id=any(v_branch_ids) and branch.status in ('draft','submitted')
    order by branch.id for update
  loop
    select * into v_document from public.cms_visual_documents document
    where document.branch_id=v_branch.id;
    update public.cms_page_branches branch
    set status='abandoned',lock_version=branch.lock_version+1,
        updated_by=old.actor_id,correlation_id=gen_random_uuid()
    where branch.id=v_branch.id and branch.lock_version=v_branch.lock_version
      and branch.status in ('draft','submitted')
    returning * into v_branch;
    if found then
      insert into public.cms_visual_events(
        branch_id,document_id,actor_id,event_type,from_version,to_version,
        event_data,correlation_id
      ) values (
        v_branch.id,v_document.id,old.actor_id,'branch_abandoned',
        coalesce(v_document.lock_version,v_branch.lock_version),
        coalesce(v_document.lock_version,v_branch.lock_version),
        jsonb_build_object('reason','qa_lease_terminal','syntheticOnly',true),
        gen_random_uuid()
      );
      v_branches:=v_branches+1;
    end if;
  end loop;
  update public.cms_visual_symbols symbol
  set status='archived',lock_version=symbol.lock_version+1,
      updated_by=old.actor_id,correlation_id=gen_random_uuid()
  where symbol.source_branch_id=any(v_branch_ids) and symbol.status='active';
  get diagnostics v_symbols=row_count;
  update public.cms_visual_command_receipts receipt
  set response=jsonb_build_object(
        'schemaVersion',1,'status','canceled','code','CMS_QA_ACTOR_LEASE_TERMINAL'
      ),completed_at=statement_timestamp()
  where receipt.response is null and (
    receipt.branch_id=any(v_branch_ids)
    or (
      receipt.branch_id is null and receipt.actor_id=old.actor_id
      and receipt.created_at between old.created_at and old.expires_at
    )
  );
  get diagnostics v_visual_receipts=row_count;

  update public.cms_site_environments environment set status='locked'
  where environment.site_id=any(v_site_ids) and environment.status='active';
  update public.cms_site_domains domain set status='blocked'
  where domain.site_id=any(v_site_ids) and domain.status='pending';
  update public.cms_themes theme
  set status='archived',lock_version=theme.lock_version+1,updated_by=old.actor_id
  where theme.site_id=any(v_site_ids) and theme.status='active';
  for v_site in
    select * from public.cms_sites site
    where site.id=any(v_site_ids) and site.status in ('pilot','active')
    order by site.id for update
  loop
    update public.cms_sites site
    set status='suspended',lock_version=site.lock_version+1,updated_by=old.actor_id
    where site.id=v_site.id and site.lock_version=v_site.lock_version
      and site.status in ('pilot','active') returning * into v_site;
    if found then
      insert into public.cms_site_events(
        site_id,actor_id,event_type,event_data,correlation_id
      ) values (
        v_site.id,old.actor_id,'candidate_suspended',
        jsonb_build_object('reason','qa_lease_terminal','syntheticOnly',true),
        gen_random_uuid()
      );
      v_sites:=v_sites+1;
    end if;
  end loop;
  update public.cms_site_command_receipts receipt
  set response=jsonb_build_object(
        'schemaVersion',1,'status','canceled','code','CMS_QA_ACTOR_LEASE_TERMINAL'
      ),completed_at=statement_timestamp()
  where receipt.response is null and (
    receipt.site_id=any(v_site_ids)
    or (
      receipt.site_id is null and receipt.actor_id=old.actor_id
      and receipt.created_at between old.created_at and old.expires_at
    )
  );
  get diagnostics v_site_receipts=row_count;

  if exists(select 1 from public.cms_page_branches branch
       where branch.id=any(v_branch_ids) and branch.status in ('draft','submitted'))
     or exists(select 1 from public.cms_visual_symbols symbol
       where symbol.source_branch_id=any(v_branch_ids) and symbol.status='active')
     or exists(select 1 from public.cms_visual_command_receipts receipt
       where receipt.response is null and (
         receipt.branch_id=any(v_branch_ids)
         or (
           receipt.branch_id is null and receipt.actor_id=old.actor_id
           and receipt.created_at between old.created_at and old.expires_at
         )
       ))
     or exists(select 1 from public.cms_sites site
       where site.id=any(v_site_ids) and site.status in ('pilot','active'))
     or exists(select 1 from public.cms_site_environments environment
       where environment.site_id=any(v_site_ids) and environment.status='active')
     or exists(select 1 from public.cms_site_domains domain
       where domain.site_id=any(v_site_ids) and domain.status='pending')
     or exists(select 1 from public.cms_themes theme
       where theme.site_id=any(v_site_ids) and theme.status='active')
     or exists(select 1 from public.cms_site_command_receipts receipt
       where receipt.response is null and (
         receipt.site_id=any(v_site_ids)
         or (
           receipt.site_id is null and receipt.actor_id=old.actor_id
           and receipt.created_at between old.created_at and old.expires_at
         )
       )) then
    raise exception 'CMS_QA_VISUAL_CLEANUP_INCOMPLETE' using errcode='55000';
  end if;

  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values (
    old.actor_id,'cms:qa.visual_multisite_compensated','qa_actor',old.actor_id::text,
    jsonb_build_object(
      'schemaVersion',1,'syntheticOnly',true,'terminalStatus',new.status,
      'sitesSuspended',v_sites,'branchesAbandoned',v_branches,
      'symbolsArchived',v_symbols,'visualReceiptsTerminalized',v_visual_receipts,
      'siteReceiptsTerminalized',v_site_receipts,
      'documentsSnapshotsTokensRetainedInert',true,'immutableEventsRetained',true
    ),gen_random_uuid()
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);
  perform set_config('cms.qa_visual_compensating',coalesce(v_previous_compensating,''),true);
  return new;
end;
$$;

drop trigger if exists zy_cms_prepare_qa_actor_terminal_visual_cleanup
  on private.cms_qa_actor_leases;
create trigger zy_cms_prepare_qa_actor_terminal_visual_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_visual_terminalize_qa_graph();

create or replace function public.cms_visual_catalog_session_read_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_context_active(
    auth.uid(),private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_visual_site_session_read_allowed(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_visual_site_scope_allowed(
    auth.uid(),p_site_id,private.cms_content_actor_environment(auth.uid()),false
  );
$$;

create or replace function public.cms_visual_site_child_session_read_allowed(
  p_site_id uuid,
  p_created_by uuid,
  p_created_at timestamptz,
  p_updated_by uuid,
  p_updated_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_site public.cms_sites%rowtype;
  v_environment text:=private.cms_content_actor_environment(auth.uid());
begin
  select * into v_site from public.cms_sites site where site.id=p_site_id;
  if not found then return false; end if;
  if v_site.site_key='main' then
    return private.cms_visual_site_scope_allowed(auth.uid(),p_site_id,v_environment,true)
      and private.cms_visual_main_catalog_row_allowed(p_created_by,p_updated_by);
  end if;
  return private.cms_visual_site_scope_allowed(auth.uid(),p_site_id,v_environment,false)
    and p_created_by is not null
    and private.cms_content_actor_row_scope_allowed(
      auth.uid(),p_created_by,p_created_at,v_environment
    )
    and (p_updated_by is null or private.cms_content_actor_row_scope_allowed(
      auth.uid(),p_updated_by,coalesce(p_updated_at,p_created_at),v_environment
    ));
end;
$$;

create or replace function public.cms_visual_branch_session_read_allowed(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_visual_branch_scope_allowed(
    auth.uid(),p_branch_id,private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_visual_symbol_session_read_allowed(p_symbol_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_visual_symbol_scope_allowed(
    auth.uid(),p_symbol_id,private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_visual_actor_row_session_read_allowed(
  p_actor_id uuid,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_row_scope_allowed(
    auth.uid(),p_actor_id,p_created_at,private.cms_content_actor_environment(auth.uid())
  );
$$;

-- As tabelas continuam RPC-only por privilegio, mas as policies fecham tambem
-- qualquer grant futuro/acidental de PostgREST.
do $$
declare v_policy record;
begin
  for v_policy in
    select policy.schemaname,policy.tablename,policy.policyname
    from pg_catalog.pg_policies policy
    where policy.schemaname='public' and policy.tablename=any(array[
      'cms_sites','cms_site_environments','cms_site_domains','cms_themes',
      'cms_design_tokens','cms_component_definitions','cms_component_versions',
      'cms_page_branches','cms_visual_documents','cms_visual_symbols',
      'cms_visual_snapshots','cms_visual_events','cms_visual_command_receipts',
      'cms_site_events','cms_site_command_receipts'
    ])
  loop
    execute format('drop policy %I on %I.%I',
      v_policy.policyname,v_policy.schemaname,v_policy.tablename);
  end loop;
end;
$$;

create policy cms_sites_visual_scoped_read on public.cms_sites
for select to authenticated using (
  (public.cms_has_permission('cms:sites.read') or public.cms_has_permission('cms:visual.read'))
  and public.cms_visual_site_session_read_allowed(id)
);
create policy cms_site_environments_visual_scoped_read on public.cms_site_environments
for select to authenticated using (
  public.cms_has_permission('cms:sites.read')
  and public.cms_visual_site_child_session_read_allowed(
    site_id,created_by,created_at,null,created_at
  )
);
create policy cms_site_domains_visual_scoped_read on public.cms_site_domains
for select to authenticated using (
  public.cms_has_permission('cms:sites.read')
  and public.cms_visual_site_child_session_read_allowed(
    site_id,created_by,created_at,null,created_at
  )
);
create policy cms_themes_visual_scoped_read on public.cms_themes
for select to authenticated using (
  (public.cms_has_permission('cms:sites.read') or public.cms_has_permission('cms:visual.read'))
  and public.cms_visual_site_child_session_read_allowed(
    site_id,created_by,created_at,updated_by,updated_at
  )
);
create policy cms_design_tokens_visual_scoped_read on public.cms_design_tokens
for select to authenticated using (
  public.cms_has_permission('cms:visual.read') and exists(
    select 1 from public.cms_themes theme where theme.id=theme_id
      and public.cms_visual_site_child_session_read_allowed(
        theme.site_id,cms_design_tokens.created_by,cms_design_tokens.created_at,
        null,cms_design_tokens.created_at
      )
      and public.cms_visual_site_child_session_read_allowed(
        theme.site_id,theme.created_by,theme.created_at,theme.updated_by,theme.updated_at
      )
  )
);
create policy cms_component_definitions_visual_scoped_read
on public.cms_component_definitions for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_catalog_session_read_allowed()
);
create policy cms_component_versions_visual_scoped_read
on public.cms_component_versions for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_catalog_session_read_allowed()
);
create policy cms_page_branches_visual_scoped_read on public.cms_page_branches
for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_branch_session_read_allowed(id)
);
create policy cms_visual_documents_visual_scoped_read on public.cms_visual_documents
for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_branch_session_read_allowed(branch_id)
);
create policy cms_visual_symbols_visual_scoped_read on public.cms_visual_symbols
for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_symbol_session_read_allowed(id)
);
create policy cms_visual_snapshots_visual_scoped_read on public.cms_visual_snapshots
for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_branch_session_read_allowed(branch_id)
);
create policy cms_visual_events_visual_scoped_read on public.cms_visual_events
for select to authenticated using (
  public.cms_has_permission('cms:visual.read')
  and public.cms_visual_branch_session_read_allowed(branch_id)
);
create policy cms_visual_receipts_visual_scoped_read on public.cms_visual_command_receipts
for select to authenticated using (
  (actor_id=auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_visual_actor_row_session_read_allowed(actor_id,created_at)
  and (branch_id is null or public.cms_visual_branch_session_read_allowed(branch_id))
);
create policy cms_site_events_visual_scoped_read on public.cms_site_events
for select to authenticated using (
  public.cms_has_permission('cms:sites.read')
  and public.cms_visual_site_child_session_read_allowed(
    site_id,actor_id,occurred_at,null,occurred_at
  )
);
create policy cms_site_receipts_visual_scoped_read on public.cms_site_command_receipts
for select to authenticated using (
  (actor_id=auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_visual_actor_row_session_read_allowed(actor_id,created_at)
  and (site_id is null or public.cms_visual_site_session_read_allowed(site_id))
);

revoke all on function private.cms_visual_normalize_actor_ids(uuid[])
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_lock_actor_scope(uuid,uuid[],text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_site_actor_ids(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_site_scope_allowed(uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_main_catalog_row_allowed(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_symbol_actor_ids(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_symbol_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_document_actor_ids(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_document_references_scope_allowed(uuid,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_branch_actor_ids(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_branch_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_branch_core_scope_allowed(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_lock_branch_for_actor(uuid,uuid,text,uuid[])
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_lock_site_for_actor(uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_guard_command(uuid,text,uuid,uuid,jsonb,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_guard_site_command(uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_site_provenance_guard()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_branch_provenance_guard()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_child_scope_guard()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_site_child_scope_guard()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_lock_actor_leases_for_terminal(uuid[])
  from public,anon,authenticated,service_role;
revoke all on function private.cms_visual_terminalize_qa_graph()
  from public,anon,authenticated,service_role;
revoke all on function private.cms_validate_visual_document(jsonb,text,text,uuid,text)
  from service_role;
revoke all on function public.cms_validate_ev2_visual_publication()
  from service_role;

revoke all on function public.cms_visual_catalog_session_read_allowed()
  from public,anon,authenticated,service_role;
revoke all on function public.cms_visual_site_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_visual_site_child_session_read_allowed(
  uuid,uuid,timestamptz,uuid,timestamptz
) from public,anon,authenticated,service_role;
revoke all on function public.cms_visual_branch_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_visual_symbol_session_read_allowed(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.cms_visual_actor_row_session_read_allowed(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.cms_visual_catalog_session_read_allowed()
  to authenticated;
grant execute on function public.cms_visual_site_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_visual_site_child_session_read_allowed(
  uuid,uuid,timestamptz,uuid,timestamptz
) to authenticated;
grant execute on function public.cms_visual_branch_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_visual_symbol_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_visual_actor_row_session_read_allowed(uuid,timestamptz)
  to authenticated;

revoke all on function public.cms_get_visual_catalog_unscoped_0074(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_list_visual_branches_unscoped_0074(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_visual_document_unscoped_0074(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_visual_command_unscoped_0074(
  uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,
  timestamptz,uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_site_registry_unscoped_0074(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_site_command_unscoped_0074(
  uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;

revoke all on function public.cms_get_visual_catalog(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_list_visual_branches(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_visual_document(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_visual_command(
  uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,
  timestamptz,uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_get_site_registry(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_execute_site_command(
  uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.cms_get_visual_catalog(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_list_visual_branches(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_get_visual_document(
  uuid,uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_execute_visual_command(
  uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,
  timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_get_site_registry(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_execute_site_command(
  uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) to service_role;
