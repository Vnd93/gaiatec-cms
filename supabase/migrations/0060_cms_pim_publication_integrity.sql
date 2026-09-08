-- A projeção editorial nunca pode materializar SKU provisório nem publicar um
-- grafo PIM ativo incompleto. Produtos legados sem vínculo PIM continuam sob o
-- contrato v1; quando há vínculo, modelo e variante ativos precisam estar
-- integralmente representados por SKUs ativos do mesmo modelo.
create or replace function public.cms_require_pim_active_skus_for_publication()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pim_product_id uuid;
  v_payload_models jsonb;
  v_active_model_count integer;
begin
  if new.content_type <> 'product' then
    return new;
  end if;

  if jsonb_typeof(new.payload -> 'models') = 'array'
     and exists (
       select 1
       from jsonb_array_elements(new.payload -> 'models') payload_model
       where nullif(btrim(payload_model ->> 'sku'), '') is null
          or upper(btrim(payload_model ->> 'sku')) = 'PENDENTE'
     ) then
    raise exception 'CMS_PIM_ACTIVE_SKU_REQUIRED' using errcode = '23514';
  end if;

  if lower(btrim(coalesce(new.payload -> 'brand' ->> 'name', ''))) in
       ('marca não informada', 'marca nao informada', 'a confirmar', 'não informado', 'nao informado')
     or lower(btrim(coalesce(new.payload -> 'productLine' ->> 'name', ''))) in
       ('linha geral', 'a confirmar', 'não informado', 'nao informado')
     or exists (
       select 1
       from jsonb_array_elements(
         case
           when jsonb_typeof(new.payload -> 'models') = 'array' then new.payload -> 'models'
           else '[]'::jsonb
         end
       ) payload_model(value)
       where lower(btrim(coalesce(payload_model.value ->> 'manufacturerReference', ''))) in
         ('a confirmar', 'não informado', 'nao informado', 'n/a', 'pendente')
     ) then
    raise exception 'CMS_PIM_PUBLIC_DATA_REQUIRED' using errcode = '23514';
  end if;

  select product.id
  into v_pim_product_id
  from public.cms_pim_products product
  where product.content_item_id = new.item_id
    and product.status <> 'archived'
  limit 1;

  if v_pim_product_id is null then
    return new;
  end if;

  if exists (
       select 1
       from public.cms_pim_products product
       where product.id = v_pim_product_id
         and (product.brand_id is null or product.line_id is null)
     )
     or exists (
       select 1
       from public.cms_pim_models model
       where model.product_id = v_pim_product_id
         and model.status = 'active'
         and nullif(btrim(model.mpn), '') is null
     )
     or exists (
       select 1
       from unnest(array['magnitude','technology','installation','monitored_element']) required_dimension
       where not exists (
         select 1
         from public.cms_pim_product_master_links link
         where link.product_id = v_pim_product_id
           and link.dimension = required_dimension
           and link.status = 'active'
       )
     ) then
    raise exception 'CMS_PIM_PUBLIC_DATA_REQUIRED' using errcode = '23514';
  end if;

  v_payload_models := new.payload -> 'models';
  select count(*)::integer
  into v_active_model_count
  from public.cms_pim_models model
  where model.product_id = v_pim_product_id
    and model.status = 'active';

  -- Once a content item is linked to PIM, its public model graph is an exact
  -- projection of the active governed graph. Cardinality plus distinct IDs
  -- prevents duplicate/missing models from being disguised by valid entries.
  if jsonb_typeof(v_payload_models) is distinct from 'array' then
    raise exception 'CMS_PIM_ACTIVE_SKU_REQUIRED' using errcode = '23514';
  end if;

  if v_active_model_count = 0
     or jsonb_array_length(v_payload_models) <> v_active_model_count
     or (
       select count(distinct lower(payload_model.value ->> 'id'))
       from jsonb_array_elements(v_payload_models) payload_model(value)
     ) <> v_active_model_count
     or exists (
       select 1
       from jsonb_array_elements(v_payload_models) payload_model(value)
       left join public.cms_pim_models model
         on model.id::text = lower(payload_model.value ->> 'id')
        and model.product_id = v_pim_product_id
        and model.status = 'active'
       where jsonb_typeof(payload_model.value) is distinct from 'object'
          or model.id is null
          or payload_model.value ->> 'model' is distinct from model.name
          or payload_model.value ->> 'manufacturerReference'
               is distinct from model.mpn
          or payload_model.value ->> 'status' is distinct from model.status
          or not exists (
            select 1
            from public.cms_pim_skus sku
            where sku.product_id = v_pim_product_id
              and sku.model_id = model.id
              and sku.status = 'active'
              and sku.sku = payload_model.value ->> 'sku'
              and (
                sku.variant_id is null
                or exists (
                  select 1
                  from public.cms_pim_variants sku_variant
                  where sku_variant.id = sku.variant_id
                    and sku_variant.product_id = v_pim_product_id
                    and sku_variant.model_id = model.id
                    and sku_variant.status = 'active'
                )
              )
          )
     )
     -- Every active SKU must belong to this product's active model and, when
     -- variant-owned, to an active variant of that same model and product.
     or exists (
       select 1
       from public.cms_pim_skus sku
       left join public.cms_pim_models model
         on model.id = sku.model_id
        and model.product_id = v_pim_product_id
        and model.status = 'active'
       left join public.cms_pim_variants variant
         on variant.id = sku.variant_id
        and variant.product_id = v_pim_product_id
        and variant.model_id = sku.model_id
        and variant.status = 'active'
       where sku.product_id = v_pim_product_id
         and sku.status = 'active'
         and (model.id is null or (sku.variant_id is not null and variant.id is null))
     )
     -- A model without variants owns one model SKU. A model with variants
     -- requires one active SKU per active variant.
     or exists (
       select 1
       from public.cms_pim_models model
       where model.product_id = v_pim_product_id
         and model.status = 'active'
         and (
           (
             not exists (
               select 1
               from public.cms_pim_variants variant
               where variant.product_id = v_pim_product_id
                 and variant.model_id = model.id
                 and variant.status = 'active'
             )
             and not exists (
               select 1
               from public.cms_pim_skus sku
               where sku.product_id = v_pim_product_id
                 and sku.model_id = model.id
                 and sku.variant_id is null
                 and sku.status = 'active'
             )
           )
           or exists (
             select 1
             from public.cms_pim_variants variant
             where variant.product_id = v_pim_product_id
               and variant.model_id = model.id
               and variant.status = 'active'
               and not exists (
                 select 1
                 from public.cms_pim_skus sku
                 where sku.product_id = v_pim_product_id
                   and sku.model_id = model.id
                   and sku.variant_id = variant.id
                   and sku.status = 'active'
               )
           )
         )
     )
     -- Variant cardinality and every public display field must exactly match
     -- the active PIM variant set. Variant-less models use the adapter's single
     -- deterministic synthetic variant.
     or exists (
       select 1
       from public.cms_pim_models model
       join lateral (
         select payload_model.value
         from jsonb_array_elements(v_payload_models) payload_model(value)
         where lower(payload_model.value ->> 'id') = model.id::text
       ) payload_model on true
       cross join lateral (
         select count(*)::integer as active_variant_count
         from public.cms_pim_variants variant
         where variant.product_id = v_pim_product_id
           and variant.model_id = model.id
           and variant.status = 'active'
       ) variant_count
       where model.product_id = v_pim_product_id
         and model.status = 'active'
         and (
           jsonb_typeof(payload_model.value -> 'variants') is distinct from 'array'
           or jsonb_array_length(
             case
               when jsonb_typeof(payload_model.value -> 'variants') = 'array'
                 then payload_model.value -> 'variants'
               else '[]'::jsonb
             end
           ) <> greatest(variant_count.active_variant_count, 1)
           or (
             select count(distinct lower(payload_variant.value ->> 'id'))
             from jsonb_array_elements(
               case
                 when jsonb_typeof(payload_model.value -> 'variants') = 'array'
                   then payload_model.value -> 'variants'
                 else '[]'::jsonb
               end
             ) payload_variant(value)
           ) <> greatest(variant_count.active_variant_count, 1)
           or (
             variant_count.active_variant_count > 0
             and exists (
               select 1
               from jsonb_array_elements(
                 case
                   when jsonb_typeof(payload_model.value -> 'variants') = 'array'
                     then payload_model.value -> 'variants'
                   else '[]'::jsonb
                 end
               ) payload_variant(value)
               where jsonb_typeof(payload_variant.value) is distinct from 'object'
                  or not exists (
                    select 1
                    from public.cms_pim_variants variant
                    where variant.id::text = lower(payload_variant.value ->> 'id')
                      and variant.product_id = v_pim_product_id
                      and variant.model_id = model.id
                      and variant.status = 'active'
                      and payload_variant.value ->> 'name' = variant.name
                      and payload_variant.value ->> 'code' = coalesce(
                        variant.code,
                        (
                          select string_agg(
                            coalesce(axis.value ->> 'optionKey', ''),
                            '-' order by axis.ordinality
                          )
                          from jsonb_array_elements(variant.axes)
                            with ordinality axis(value, ordinality)
                        )
                      )
                      and payload_variant.value ->> 'order' = variant.position::text
                  )
             )
           )
           or (
             variant_count.active_variant_count = 0
             and exists (
               select 1
               from jsonb_array_elements(
                 case
                   when jsonb_typeof(payload_model.value -> 'variants') = 'array'
                     then payload_model.value -> 'variants'
                   else '[]'::jsonb
                 end
               ) payload_variant(value)
               where jsonb_typeof(payload_variant.value) is distinct from 'object'
                  or lower(payload_variant.value ->> 'id') <> model.id::text
                  or payload_variant.value ->> 'name' is distinct from model.name
                  or payload_variant.value ->> 'code'
                       is distinct from coalesce(model.mpn, model.name)
                  or payload_variant.value ->> 'order' is distinct from model.position::text
             )
           )
         )
     ) then
    raise exception 'CMS_PIM_ACTIVE_SKU_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists cms_pim_active_skus_before_publication on public.cms_published_projection;
create trigger cms_pim_active_skus_before_publication
before insert or update on public.cms_published_projection
for each row execute function public.cms_require_pim_active_skus_for_publication();

revoke all on function public.cms_require_pim_active_skus_for_publication()
  from public, anon, authenticated;
