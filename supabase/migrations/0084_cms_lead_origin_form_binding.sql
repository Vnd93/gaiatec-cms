-- Public lead context is authoritative only when the exact published origin
-- binds the same active form identity and version being submitted. Display
-- keys are deliberately not authoritative because they can be renamed while
-- the immutable UUID pair remains valid.

create or replace function private.cms_projection_binds_exact_form(
  p_item_id uuid,
  p_content_type text,
  p_form_id uuid,
  p_form_version_id uuid,
  p_actor_id uuid,
  p_environment text,
  p_origin_path text,
  p_origin_source text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_payload jsonb;
  v_slug text;
  v_route_path text;
  v_authoritative_path text;
  v_binding_exact boolean;
begin
  if p_item_id is null
     or p_content_type not in ('campaign', 'product')
     or p_form_id is null
     or p_form_version_id is null
     or p_actor_id is null
     or p_environment not in ('local', 'staging', 'production')
     or nullif(p_origin_path, '') is null
     or nullif(p_origin_source, '') is null then
    return false;
  end if;

  -- The locks keep a concurrent republish or withdrawal from changing the
  -- binding between authorization and the lead insert in this transaction.
  select projection.payload, projection.slug
  into v_payload, v_slug
  from public.cms_published_projection projection
  join public.cms_content_items item
    on item.id = projection.item_id
   and item.content_type = projection.content_type
  join public.cms_publications published
    on published.item_id = projection.item_id
   and published.revision_id = projection.revision_id
  where projection.item_id = p_item_id
    and projection.content_type = p_content_type
    and item.workflow_status = 'published'
    and private.cms_content_item_graph_scope_allowed(
      p_actor_id, projection.item_id, p_environment
    )
  for share of projection, item, published;

  if not found then return false; end if;

  v_binding_exact := coalesce((
    jsonb_typeof(v_payload -> 'form') = 'object'
    and v_payload #>> '{form,formId}' = p_form_id::text
    and v_payload #>> '{form,versionId}' = p_form_version_id::text
  ), false) or exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(v_payload -> 'blocks') = 'array'
        then v_payload -> 'blocks'
        else '[]'::jsonb
      end
    ) block
    where block ->> 'type' = 'form'
      and jsonb_typeof(block -> 'data') = 'object'
      and block #>> '{data,formId}' = p_form_id::text
      and block #>> '{data,formVersionId}' = p_form_version_id::text
  );
  if v_binding_exact is not true then return false; end if;

  v_route_path := nullif(v_payload #>> '{route,path}', '');
  if p_content_type = 'campaign' then
    return p_origin_source = 'campaign'
      and v_route_path is not null
      and v_route_path ~ '^/'
      and p_origin_path = v_route_path;
  end if;
  v_authoritative_path := '/produtos/' || v_slug;
  return p_origin_source = 'product' and p_origin_path = v_authoritative_path;
end;
$$;

create or replace function private.cms_form_capture_origin_allowed(
  p_form_id uuid,
  p_form_version_id uuid,
  p_origin jsonb,
  p_environment text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_path text := p_origin ->> 'path';
  v_source text := p_origin ->> 'source';
  v_campaign_id uuid;
  v_product_id uuid;
  v_scope_actor_id uuid;
begin
  if jsonb_typeof(p_origin) is distinct from 'object'
     or nullif(v_path, '') is null
     or v_path !~ '^/'
     or nullif(v_source, '') is null
     or p_environment not in ('local', 'staging', 'production') then
    return false;
  end if;
  begin
    v_campaign_id := nullif(p_origin ->> 'campaignId', '')::uuid;
    v_product_id := nullif(p_origin ->> 'productId', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if num_nonnulls(v_campaign_id, v_product_id) > 1 then return false; end if;

  select * into v_form
  from public.cms_form_definitions form
  where form.id = p_form_id
    and form.status = 'published'
    and form.active_version_id = p_form_version_id;
  if not found or not private.cms_form_public_allowed(p_form_id, p_environment) then
    return false;
  end if;

  if v_form.qa_actor_id is null then
    if v_source = 'qa_fixture'
       or v_path ~ '^/qa-cms-final/'
       or v_path ~ '^/campanhas/qa-lead-qa-cms-final-' then
      return false;
    end if;
    v_scope_actor_id := v_form.created_by;
  else
    -- Keep the synthetic browser-fixture bypass exactly context-free and
    -- restricted to the exact route owned by its active lease.
    if v_source = 'qa_fixture' then
      return v_campaign_id is null
        and v_product_id is null
        and v_path = '/qa-cms-final/' || lower(v_form.qa_run_tag);
    end if;
    if v_source <> 'campaign'
       or v_campaign_id is null
       or v_path !~ (
         '^/campanhas/qa-lead-' || lower(v_form.qa_run_tag) || '-[0-9a-f]{8}$'
       ) then
      return false;
    end if;
    v_scope_actor_id := v_form.qa_actor_id;
  end if;

  if v_campaign_id is not null
     and private.cms_projection_binds_exact_form(
       v_campaign_id, 'campaign', p_form_id, p_form_version_id,
       v_scope_actor_id, p_environment, v_path, v_source
     ) is not true then
    return false;
  end if;
  if v_product_id is not null
     and private.cms_projection_binds_exact_form(
       v_product_id, 'product', p_form_id, p_form_version_id,
       v_scope_actor_id, p_environment, v_path, v_source
     ) is not true then
    return false;
  end if;
  return v_campaign_id is not null
    or v_product_id is not null
    or v_source in ('site', 'contact', 'newsletter', 'website');
end;
$$;

revoke all on function private.cms_projection_binds_exact_form(
  uuid,text,uuid,uuid,uuid,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function private.cms_form_capture_origin_allowed(
  uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure(
       'private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)'
     ) is null
     or has_function_privilege(
       'service_role',
       'private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)',
       'execute'
     ) then
    raise exception 'CMS_LEAD_ORIGIN_BINDING_HELPER_EXPOSED';
  end if;
end;
$$;
