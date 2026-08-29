-- Fase 4 — guardas server-side que impedem publicação de atributo ou mídia inválidos.

create function public.cms_validate_product_publication()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare p jsonb := new.payload;
begin
  if new.content_type <> 'product' then return new; end if;

  if jsonb_typeof(p -> 'media') <> 'array'
     or jsonb_typeof(p -> 'documents') <> 'array'
     or exists (
       select 1 from jsonb_array_elements(p -> 'models') model
       where jsonb_typeof(model -> 'variants') <> 'array' or jsonb_array_length(model -> 'variants') = 0
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

  return new;
end;
$$;

create trigger cms_product_validate_publication
before insert or update on public.cms_published_projection
for each row execute function public.cms_validate_product_publication();

create function public.cms_sync_product_media_usage()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare media jsonb;
begin
  if new.content_type <> 'product' then return new; end if;
  for media in select value from jsonb_array_elements(new.payload -> 'media') loop
    insert into public.cms_media_usages(asset_id, item_id, revision_id, usage_kind)
    values ((media ->> 'assetId')::uuid, new.item_id, new.revision_id, 'content')
    on conflict do nothing;
  end loop;
  return new;
end;
$$;

create trigger cms_product_sync_media_usage
after insert or update on public.cms_published_projection
for each row execute function public.cms_sync_product_media_usage();

revoke all on function public.cms_validate_product_publication() from public, anon, authenticated;
revoke all on function public.cms_sync_product_media_usage() from public, anon, authenticated;
