-- Fase 4 — identidade comercial separada e projeções sem perda de campos.
-- Apenas projeções derivadas recebem backfill transitório; o payload editorial é atualizado pela API do CMS.

alter table public.cms_product_projection add column brand_name text;
alter table public.cms_product_projection add column brand_slug text;
alter table public.cms_product_projection add column primary_manufacturer_reference text;
alter table public.cms_product_variant_projection add column manufacturer_reference text;
alter table public.cms_product_attribute_projection add column required boolean;
alter table public.cms_product_document_projection add column storage_path text;

update public.cms_product_projection
set brand_name = 'A confirmar', brand_slug = 'a-confirmar', primary_manufacturer_reference = 'A confirmar';
update public.cms_product_variant_projection set manufacturer_reference = 'A confirmar';
update public.cms_product_attribute_projection attribute
set required = coalesce((spec.value ->> 'required')::boolean, false)
from public.cms_published_projection publication,
lateral jsonb_array_elements(publication.payload -> 'specifications') spec(value)
where publication.item_id = attribute.item_id and spec.value ->> 'id' = attribute.id::text;
update public.cms_product_document_projection document
set storage_path = nullif(source.value ->> 'storagePath', '')
from public.cms_published_projection publication,
lateral jsonb_array_elements(publication.payload -> 'documents') source(value)
where publication.item_id = document.item_id and source.value ->> 'id' = document.id::text;

alter table public.cms_product_projection alter column brand_name set not null;
alter table public.cms_product_projection alter column brand_slug set not null;
alter table public.cms_product_projection alter column primary_manufacturer_reference set not null;
alter table public.cms_product_projection add constraint cms_product_projection_brand_slug_check
  check (brand_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
alter table public.cms_product_variant_projection alter column manufacturer_reference set not null;
alter table public.cms_product_attribute_projection alter column required set not null;
alter table public.cms_product_document_projection add constraint cms_product_document_location_check
  check (official_url is not null or storage_path is not null);

create or replace function public.cms_validate_product_publication()
returns trigger language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare p jsonb := new.payload;
begin
  if new.content_type <> 'product' then return new; end if;

  if nullif(p #>> '{brand,name}', '') is null
     or nullif(p #>> '{brand,slug}', '') is null
     or jsonb_typeof(p -> 'media') <> 'array'
     or jsonb_typeof(p -> 'documents') <> 'array'
     or exists (
       select 1 from jsonb_array_elements(p -> 'models') model
       where nullif(model ->> 'manufacturerReference', '') is null
          or jsonb_typeof(model -> 'variants') <> 'array'
          or jsonb_array_length(model -> 'variants') = 0
     ) then
    raise exception 'CMS_PRODUCT_CONTRACT_INVALID' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'specifications') spec
    where (spec ->> 'type') not in ('text', 'number', 'boolean', 'enum', 'range')
       or ((spec ->> 'type') = 'text' and jsonb_typeof(spec -> 'value') <> 'string')
       or ((spec ->> 'type') = 'number' and jsonb_typeof(spec -> 'value') <> 'number')
       or ((spec ->> 'type') = 'boolean' and jsonb_typeof(spec -> 'value') <> 'boolean')
       or ((spec ->> 'type') = 'enum' and jsonb_typeof(spec -> 'value') <> 'array')
       or ((spec ->> 'type') = 'range' and (
         jsonb_typeof(spec -> 'value') <> 'object'
         or jsonb_typeof(spec #> '{value,min}') <> 'number'
         or jsonb_typeof(spec #> '{value,max}') <> 'number'
         or (spec #>> '{value,min}')::numeric > (spec #>> '{value,max}')::numeric
       ))
  ) then raise exception 'CMS_PRODUCT_ATTRIBUTE_TYPE_INVALID' using errcode = '23514'; end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'media') media
    where not exists (
      select 1 from public.cms_media_assets asset
      where asset.id = (media ->> 'assetId')::uuid
        and asset.processing_status = 'ready'
        and asset.scan_status = 'clean'
        and asset.rights_confirmed
    )
  ) then raise exception 'CMS_PRODUCT_MEDIA_NOT_READY' using errcode = '23514'; end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'documents') document
    where nullif(document ->> 'officialUrl', '') is null
      and (
        nullif(document ->> 'storagePath', '') is null
        or not exists (
          select 1 from storage.objects object
          where object.bucket_id = 'cms-documents-private'
            and object.name = document ->> 'storagePath'
        )
      )
  ) then raise exception 'CMS_PRODUCT_DOCUMENT_NOT_READY' using errcode = '23514'; end if;
  return new;
end;
$$;

create or replace function public.cms_sync_product_projection()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare p jsonb := new.payload; model jsonb; variant jsonb; spec jsonb; doc jsonb; relation_type text; target jsonb; term text;
begin
  if new.content_type <> 'product' then return new; end if;
  if p ->> 'consumerId' <> 'cms.catalog-product.v1'
     or jsonb_typeof(p -> 'models') <> 'array' or jsonb_array_length(p -> 'models') = 0
     or jsonb_typeof(p -> 'specifications') <> 'array' or jsonb_array_length(p -> 'specifications') = 0
     or nullif(p #>> '{brand,name}', '') is null
     or nullif(p #>> '{brand,slug}', '') is null
     or nullif(p #>> '{manufacturer,name}', '') is null
     or nullif(p #>> '{models,0,manufacturerReference}', '') is null
     or nullif(p #>> '{classification,category}', '') is null then
    raise exception 'CMS_PRODUCT_CONTRACT_INVALID' using errcode = '23514';
  end if;
  if coalesce((p #>> '{seo,indexable}')::boolean, false)
     and (p ->> 'pilotState' <> 'homologated' or nullif(p #>> '{approval,homologatedAt}', '') is null) then
    raise exception 'CMS_PRODUCT_OWNER_APPROVAL_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p #> '{relations,productIds}', '[]'::jsonb)) r
    where not exists (select 1 from public.cms_published_projection x where x.item_id = (r #>> '{}')::uuid and x.content_type = 'product')
  ) then raise exception 'CMS_PRODUCT_RELATION_UNPUBLISHED' using errcode = '23514'; end if;

  insert into public.cms_product_projection (
    item_id, revision_id, slug, pilot_state, title, brand_name, brand_slug, manufacturer_name, manufacturer_slug,
    product_line_name, product_line_slug, segment, category, subcategory, family, primary_model,
    primary_manufacturer_reference, technology, short_description, card_attributes, filter_facets, search_text,
    content_version, published_at
  ) values (
    new.item_id, new.revision_id, new.slug, p ->> 'pilotState', p ->> 'title', p #>> '{brand,name}', p #>> '{brand,slug}',
    p #>> '{manufacturer,name}', p #>> '{manufacturer,slug}', p #>> '{productLine,name}', p #>> '{productLine,slug}',
    p #>> '{classification,segment}', p #>> '{classification,category}', nullif(p #>> '{classification,subcategory}', ''),
    p #>> '{classification,family}', p #>> '{models,0,model}', p #>> '{models,0,manufacturerReference}', p ->> 'technology',
    p #>> '{commercial,shortDescription}',
    (select coalesce(jsonb_agg(s), '[]'::jsonb) from (select value as s from jsonb_array_elements(p -> 'specifications') value where coalesce((value ->> 'comparable')::boolean, false) limit 3) q),
    jsonb_build_object('segment', p #>> '{classification,segment}', 'category', p #>> '{classification,category}',
      'family', p #>> '{classification,family}', 'technology', p ->> 'technology'),
    concat_ws(' ', p ->> 'title', p #>> '{brand,name}', p #>> '{manufacturer,name}', p #>> '{productLine,name}',
      (select string_agg(concat_ws(' ', value ->> 'model', value ->> 'manufacturerReference', value ->> 'sku'), ' ') from jsonb_array_elements(p -> 'models')),
      p #>> '{classification,segment}', p #>> '{classification,category}', p #>> '{classification,family}', p ->> 'technology',
      (select string_agg(value #>> '{}', ' ') from jsonb_array_elements(coalesce(p #> '{search,synonyms}', '[]'::jsonb))),
      (select string_agg(value #>> '{}', ' ') from jsonb_array_elements(coalesce(p #> '{search,keywords}', '[]'::jsonb)))),
    new.content_version, new.published_at
  ) on conflict (item_id) do update set revision_id=excluded.revision_id, slug=excluded.slug, pilot_state=excluded.pilot_state,
    title=excluded.title, brand_name=excluded.brand_name, brand_slug=excluded.brand_slug,
    manufacturer_name=excluded.manufacturer_name, manufacturer_slug=excluded.manufacturer_slug,
    product_line_name=excluded.product_line_name, product_line_slug=excluded.product_line_slug, segment=excluded.segment,
    category=excluded.category, subcategory=excluded.subcategory, family=excluded.family, primary_model=excluded.primary_model,
    primary_manufacturer_reference=excluded.primary_manufacturer_reference, technology=excluded.technology,
    short_description=excluded.short_description, card_attributes=excluded.card_attributes,
    filter_facets=excluded.filter_facets, search_text=excluded.search_text, content_version=excluded.content_version,
    published_at=excluded.published_at;

  delete from public.cms_product_variant_projection where item_id = new.item_id;
  delete from public.cms_product_attribute_projection where item_id = new.item_id;
  delete from public.cms_product_document_projection where item_id = new.item_id;
  delete from public.cms_product_relation_projection where item_id = new.item_id;
  delete from public.cms_product_search_term_projection where item_id = new.item_id;
  delete from public.cms_redirects where item_id = new.item_id;

  for model in select value from jsonb_array_elements(p -> 'models') loop
    for variant in select value from jsonb_array_elements(model -> 'variants') loop
      insert into public.cms_product_variant_projection
        (id, item_id, model_id, model_name, manufacturer_reference, sku, variant_name, variant_code, status, display_order)
      values ((variant ->> 'id')::uuid, new.item_id, (model ->> 'id')::uuid, model ->> 'model',
        model ->> 'manufacturerReference', model ->> 'sku', variant ->> 'name', variant ->> 'code', model ->> 'status',
        (variant ->> 'order')::integer);
    end loop;
  end loop;
  for spec in select value from jsonb_array_elements(p -> 'specifications') loop
    insert into public.cms_product_attribute_projection
      (id, item_id, attribute_key, label, data_type, value_json, unit, required, filterable, comparable, searchable)
    values ((spec ->> 'id')::uuid, new.item_id, spec ->> 'key', spec ->> 'label', spec ->> 'type', spec -> 'value',
      nullif(spec ->> 'unit', ''), (spec ->> 'required')::boolean, (spec ->> 'filterable')::boolean,
      (spec ->> 'comparable')::boolean, (spec ->> 'searchable')::boolean);
  end loop;
  for doc in select value from jsonb_array_elements(coalesce(p -> 'documents', '[]'::jsonb)) loop
    insert into public.cms_product_document_projection
      (id, item_id, kind, title, official_url, storage_path, sha256, revision, language, visibility, rights_confirmed)
    values ((doc ->> 'id')::uuid, new.item_id, doc ->> 'kind', doc ->> 'title', nullif(doc ->> 'officialUrl', ''),
      nullif(doc ->> 'storagePath', ''), doc ->> 'sha256', doc ->> 'revision', doc ->> 'language', doc ->> 'visibility',
      (doc ->> 'rightsConfirmed')::boolean);
  end loop;
  foreach relation_type in array array['product','application','sector','service'] loop
    for target in select value from jsonb_array_elements(coalesce(p #> array['relations', relation_type || 'Ids'], '[]'::jsonb)) loop
      insert into public.cms_product_relation_projection values (new.item_id, relation_type, (target #>> '{}')::uuid);
    end loop;
  end loop;
  foreach term in array array(select jsonb_array_elements_text(coalesce(p #> '{search,synonyms}', '[]'::jsonb))) loop
    insert into public.cms_product_search_term_projection values (new.item_id, term, 'synonym');
  end loop;
  foreach term in array array(select jsonb_array_elements_text(coalesce(p #> '{search,keywords}', '[]'::jsonb))) loop
    insert into public.cms_product_search_term_projection values (new.item_id, term, 'keyword');
  end loop;
  for doc in select value from jsonb_array_elements(coalesce(p -> 'redirects', '[]'::jsonb)) loop
    insert into public.cms_redirects(item_id, source_path, destination_path, status_code)
    values (new.item_id, doc ->> 'sourcePath', '/produtos/' || new.slug, (doc ->> 'statusCode')::integer);
  end loop;
  return new;
end;
$$;

update public.cms_capability_registry
set validation_contract = validation_contract || '{"brand":true,"manufacturerReference":true,"governedJsonRoundTrip":true}'::jsonb,
    test_contract = test_contract || '{"fieldConsumerCoverage":true,"remoteRoundTrip":true}'::jsonb
where consumer_id = 'cms.catalog-product.v1';

revoke all on function public.cms_validate_product_publication() from public, anon, authenticated;
revoke all on function public.cms_sync_product_projection() from public, anon, authenticated;
