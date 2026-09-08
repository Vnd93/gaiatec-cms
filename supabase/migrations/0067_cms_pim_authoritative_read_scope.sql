-- PIM read segregation for the controlled QA browser actor.
--
-- A lease row is the immutable server-side classification boundary. An actor
-- that ever had a QA lease never falls back to corporate visibility after the
-- lease expires or its auth metadata changes. Active QA actors may only read a
-- graph wholly created/updated by that actor during the same lease, with an
-- exact run-tag provenance marker. Corporate actors may only read graphs whose
-- actors never had a QA lease.

create or replace function private.cms_actor_row_scope_allowed(
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
      or not exists (
        select 1 from auth.users actor where actor.id = p_actor_id
      ) then false
    when exists (
      select 1
      from private.cms_qa_actor_leases any_lease
      where any_lease.actor_id = p_actor_id
    ) then
      p_row_actor_id = p_actor_id
      and exists (
        select 1
        from private.cms_qa_actor_leases lease
        where lease.actor_id = p_actor_id
          and lease.environment = p_environment
          and lease.status = 'active'
          and lease.expires_at > statement_timestamp()
          and p_row_at >= lease.created_at
          and p_row_at <= lease.expires_at
          and private.cms_qa_actor_marker_is_exact(
            lease.actor_id,
            lease.run_tag,
            lease.candidate_sha,
            lease.environment
          )
      )
    else not exists (
      select 1
      from private.cms_qa_actor_leases row_actor_lease
      where row_actor_lease.actor_id = p_row_actor_id
    )
  end;
$$;

-- Compatibility wrapper keeps the PIM graph definition readable while the
-- generic primitive is shared by later CMS domains.
create or replace function private.cms_pim_actor_row_scope_allowed(
  p_actor_id uuid,
  p_row_actor_id uuid,
  p_row_at timestamptz,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_actor_row_scope_allowed(
    p_actor_id, p_row_actor_id, p_row_at, p_environment
  );
$$;

create or replace function public.cms_actor_scope_context(
  p_actor_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_active boolean := false;
begin
  if p_actor_id is null
     or p_environment not in ('local', 'staging', 'production')
     or not exists (select 1 from auth.users actor where actor.id = p_actor_id) then
    return jsonb_build_object(
      'schemaVersion', 1,
      'isQaActor', false,
      'active', false,
      'runTag', null,
      'status', 'invalid'
    );
  end if;

  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id;

  if not found then
    return jsonb_build_object(
      'schemaVersion', 1,
      'isQaActor', false,
      'active', true,
      'runTag', null,
      'status', null
    );
  end if;

  v_active := v_lease.environment = p_environment
    and v_lease.status = 'active'
    and v_lease.expires_at > statement_timestamp()
    and private.cms_qa_actor_marker_is_exact(
      v_lease.actor_id,
      v_lease.run_tag,
      v_lease.candidate_sha,
      v_lease.environment
    );

  return jsonb_build_object(
    'schemaVersion', 1,
    'isQaActor', true,
    'active', v_active,
    'runTag', v_lease.run_tag,
    'status', v_lease.status,
    'expiresAt', v_lease.expires_at
  );
end;
$$;

create or replace function private.cms_pim_product_graph_scope_allowed(
  p_actor_id uuid,
  p_product_id uuid,
  p_environment text,
  p_site_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_pim_products product
    where product.id = p_product_id
      and product.site_key = p_site_key
      and p_site_key = 'main'
      and p_environment in ('local', 'staging', 'production')
      and private.cms_pim_actor_row_scope_allowed(
        p_actor_id, product.created_by, product.created_at, p_environment
      )
      and private.cms_pim_actor_row_scope_allowed(
        p_actor_id, product.updated_by, product.updated_at, p_environment
      )
      -- A QA-owned product is synthetic only when its governed provenance
      -- carries the exact run tag from the active server-side lease.
      and (
        not exists (
          select 1 from private.cms_qa_actor_leases actor_lease
          where actor_lease.actor_id = p_actor_id
        )
        or exists (
          select 1
          from public.cms_pim_provenance marker
          join private.cms_qa_actor_leases lease
            on lease.actor_id = p_actor_id
           and lease.run_tag = marker.source_ref
          where marker.product_id = product.id
            and marker.active
            and lease.environment = p_environment
            and lease.status = 'active'
            and lease.expires_at > statement_timestamp()
            and marker.created_by = p_actor_id
            and marker.updated_by = p_actor_id
            and marker.created_at >= lease.created_at
            and marker.created_at <= lease.expires_at
            and marker.updated_at >= lease.created_at
            and marker.updated_at <= lease.expires_at
            and private.cms_qa_actor_marker_is_exact(
              lease.actor_id,
              lease.run_tag,
              lease.candidate_sha,
              lease.environment
            )
        )
      )
      and not exists (
        select 1
        from public.cms_pim_product_master_links link
        where link.product_id = product.id
          and (
            not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, link.created_by, link.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, link.updated_by, link.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_models model
        where model.product_id = product.id
          and (
            not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, model.created_by, model.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, model.updated_by, model.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_variants variant
        where variant.product_id = product.id
          and (
            not exists (
              select 1 from public.cms_pim_models model
              where model.id = variant.model_id and model.product_id = product.id
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, variant.created_by, variant.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, variant.updated_by, variant.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_skus sku
        where sku.product_id = product.id
          and (
            not exists (
              select 1 from public.cms_pim_models model
              where model.id = sku.model_id and model.product_id = product.id
            )
            or (
              sku.variant_id is not null
              and not exists (
                select 1 from public.cms_pim_variants variant
                where variant.id = sku.variant_id
                  and variant.product_id = product.id
                  and variant.model_id = sku.model_id
              )
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, sku.created_by, sku.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, sku.updated_by, sku.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_external_identifiers identifier
        where identifier.product_id = product.id
          and (
            not (
              (identifier.owner_type = 'product' and identifier.owner_id = product.id)
              or (
                identifier.owner_type = 'model'
                and exists (
                  select 1 from public.cms_pim_models model
                  where model.id = identifier.owner_id and model.product_id = product.id
                )
              )
              or (
                identifier.owner_type = 'variant'
                and exists (
                  select 1 from public.cms_pim_variants variant
                  where variant.id = identifier.owner_id and variant.product_id = product.id
                )
              )
              or (
                identifier.owner_type = 'sku'
                and exists (
                  select 1 from public.cms_pim_skus sku
                  where sku.id = identifier.owner_id and sku.product_id = product.id
                )
              )
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, identifier.created_by, identifier.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, identifier.updated_by, identifier.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_attribute_values attribute_value
        where attribute_value.product_id = product.id
          and (
            not (
              (attribute_value.owner_scope = 'product' and attribute_value.owner_id = product.id)
              or (
                attribute_value.owner_scope = 'model'
                and exists (
                  select 1 from public.cms_pim_models model
                  where model.id = attribute_value.owner_id and model.product_id = product.id
                )
              )
              or (
                attribute_value.owner_scope = 'variant'
                and exists (
                  select 1 from public.cms_pim_variants variant
                  where variant.id = attribute_value.owner_id and variant.product_id = product.id
                )
              )
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, attribute_value.created_by, attribute_value.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, attribute_value.updated_by, attribute_value.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from public.cms_pim_provenance provenance
        where provenance.product_id = product.id
          and (
            not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, provenance.created_by, provenance.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, provenance.updated_by, provenance.updated_at, p_environment
            )
          )
      )
      and (
        product.content_item_id is null
        or exists (
          select 1
          from public.cms_content_items item
          where item.id = product.content_item_id
            and private.cms_pim_actor_row_scope_allowed(
              p_actor_id, item.created_by, item.created_at, p_environment
            )
            and private.cms_pim_actor_row_scope_allowed(
              p_actor_id, item.updated_by, item.updated_at, p_environment
            )
        )
      )
      -- Master-data labels used by get/preview are part of the same closed
      -- graph. A dangling or cross-scope reference hides the whole product.
      and not exists (
        select 1
        from (
          select product.manufacturer_id as entity_id
          union select product.brand_id where product.brand_id is not null
          union select product.line_id where product.line_id is not null
          union select product.category_id
          union
          select link.entity_id
          from public.cms_pim_product_master_links link
          where link.product_id = product.id
          union
          select model.manufacturer_id
          from public.cms_pim_models model
          where model.product_id = product.id
        ) reference
        left join public.cms_master_entities entity on entity.id = reference.entity_id
        where entity.id is null
           or not private.cms_pim_actor_row_scope_allowed(
             p_actor_id, entity.created_by, entity.created_at, p_environment
           )
           or not private.cms_pim_actor_row_scope_allowed(
             p_actor_id, entity.updated_by, entity.updated_at, p_environment
           )
      )
      and not exists (
        select 1
        from public.cms_pim_attribute_values attribute_value
        join public.cms_pim_attribute_definitions definition
          on definition.id = attribute_value.definition_id
        where attribute_value.product_id = product.id
          and (
            not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, definition.created_by, definition.created_at, p_environment
            )
            or not private.cms_pim_actor_row_scope_allowed(
              p_actor_id, definition.updated_by, definition.updated_at, p_environment
            )
          )
      )
      and not exists (
        select 1
        from (
          select attribute_value.unit_code
          from public.cms_pim_attribute_values attribute_value
          where attribute_value.product_id = product.id
            and attribute_value.unit_code is not null
          union
          select definition.canonical_unit_code
          from public.cms_pim_attribute_values attribute_value
          join public.cms_pim_attribute_definitions definition
            on definition.id = attribute_value.definition_id
          where attribute_value.product_id = product.id
            and definition.canonical_unit_code is not null
        ) reference
        left join public.cms_pim_units unit on unit.code = reference.unit_code
        where unit.code is null
           or not private.cms_pim_actor_row_scope_allowed(
             p_actor_id, unit.created_by, unit.created_at, p_environment
           )
           or not private.cms_pim_actor_row_scope_allowed(
             p_actor_id, unit.updated_by, unit.updated_at, p_environment
           )
      )
  );
$$;

create or replace function public.cms_pim_product_read_allowed(
  p_actor_id uuid,
  p_product_id uuid,
  p_environment text,
  p_site_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_pim_product_graph_scope_allowed(
    p_actor_id, p_product_id, p_environment, p_site_key
  );
$$;

create or replace function public.cms_pim_list_products_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_query text,
  p_include_archived boolean,
  p_limit integer default 500
)
returns table (
  id uuid,
  content_item_id uuid,
  name text,
  slug text,
  status text,
  lock_version bigint,
  model_count integer,
  variant_count integer,
  sku_count integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    product.id,
    product.content_item_id,
    product.name,
    product.slug,
    product.status,
    product.lock_version,
    (select count(*)::integer from public.cms_pim_models model where model.product_id = product.id),
    (select count(*)::integer from public.cms_pim_variants variant where variant.product_id = product.id),
    (select count(*)::integer from public.cms_pim_skus sku where sku.product_id = product.id and sku.status = 'active'),
    product.updated_at
  from public.cms_pim_products product
  where p_site_key = 'main'
    and p_environment in ('local', 'staging', 'production')
    and p_limit between 1 and 500
    and product.site_key = p_site_key
    and (p_include_archived or product.status <> 'archived')
    and (
      nullif(btrim(p_query), '') is null
      or product.normalized_name like ('%' || btrim(p_query) || '%')
    )
    and private.cms_pim_product_graph_scope_allowed(
      p_actor_id, product.id, p_environment, p_site_key
    )
  order by product.updated_at desc, product.id
  limit p_limit;
$$;

create or replace function public.cms_pim_get_product_scoped(
  p_actor_id uuid,
  p_product_id uuid,
  p_environment text,
  p_site_key text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select to_jsonb(product) || jsonb_build_object(
    'cms_pim_product_master_links', coalesce(
      (
        select jsonb_agg(to_jsonb(link) order by link.dimension, link.entity_id)
        from public.cms_pim_product_master_links link
        where link.product_id = product.id
      ),
      '[]'::jsonb
    ),
    'cms_pim_models', coalesce(
      (
        select jsonb_agg(
          to_jsonb(model) || jsonb_build_object(
            'cms_pim_variants', coalesce(
              (
                select jsonb_agg(to_jsonb(variant) order by variant.position, variant.id)
                from public.cms_pim_variants variant
                where variant.product_id = product.id and variant.model_id = model.id
              ),
              '[]'::jsonb
            )
          ) order by model.position, model.id
        )
        from public.cms_pim_models model
        where model.product_id = product.id
      ),
      '[]'::jsonb
    ),
    'cms_pim_skus', coalesce(
      (
        select jsonb_agg(to_jsonb(sku) order by sku.created_at, sku.id)
        from public.cms_pim_skus sku
        where sku.product_id = product.id
      ),
      '[]'::jsonb
    ),
    'cms_pim_attribute_values', coalesce(
      (
        select jsonb_agg(to_jsonb(attribute_value) order by attribute_value.created_at, attribute_value.id)
        from public.cms_pim_attribute_values attribute_value
        where attribute_value.product_id = product.id
      ),
      '[]'::jsonb
    ),
    'cms_pim_external_identifiers', coalesce(
      (
        select jsonb_agg(to_jsonb(identifier) order by identifier.created_at, identifier.id)
        from public.cms_pim_external_identifiers identifier
        where identifier.product_id = product.id
      ),
      '[]'::jsonb
    ),
    'cms_pim_provenance', coalesce(
      (
        select jsonb_agg(to_jsonb(provenance) order by provenance.created_at, provenance.id)
        from public.cms_pim_provenance provenance
        where provenance.product_id = product.id
      ),
      '[]'::jsonb
    )
  )
  from public.cms_pim_products product
  where product.id = p_product_id
    and product.site_key = p_site_key
    and private.cms_pim_product_graph_scope_allowed(
      p_actor_id, product.id, p_environment, p_site_key
    );
$$;

create or replace function public.cms_pim_master_entities_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_entity_ids uuid[]
)
returns table (
  id uuid,
  canonical_name text,
  status text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select entity.id, entity.canonical_name, entity.status
  from public.cms_master_entities entity
  where p_site_key = 'main'
    and p_environment in ('local', 'staging', 'production')
    and coalesce(cardinality(p_entity_ids), 0) between 1 and 128
    and entity.site_key = p_site_key
    and entity.id = any(p_entity_ids)
    and private.cms_pim_actor_row_scope_allowed(
      p_actor_id, entity.created_by, entity.created_at, p_environment
    )
    and private.cms_pim_actor_row_scope_allowed(
      p_actor_id, entity.updated_by, entity.updated_at, p_environment
    )
  order by entity.id;
$$;

revoke all on function private.cms_actor_row_scope_allowed(uuid,uuid,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_actor_row_scope_allowed(uuid,uuid,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_product_graph_scope_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;

revoke all on function public.cms_actor_scope_context(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_pim_product_read_allowed(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_pim_list_products_scoped(uuid,text,text,text,boolean,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_pim_get_product_scoped(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_pim_master_entities_scoped(uuid,text,text,uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.cms_actor_scope_context(uuid,text) to service_role;
grant execute on function public.cms_pim_product_read_allowed(uuid,uuid,text,text) to service_role;
grant execute on function public.cms_pim_list_products_scoped(uuid,text,text,text,boolean,integer)
  to service_role;
grant execute on function public.cms_pim_get_product_scoped(uuid,uuid,text,text) to service_role;
grant execute on function public.cms_pim_master_entities_scoped(uuid,text,text,uuid[])
  to service_role;
