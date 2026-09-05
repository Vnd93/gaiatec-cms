-- Fase 4 — uma única sincronização de usos evita que triggers em ordem alfabética apaguem usos do produto.
drop trigger if exists cms_product_sync_media_usage on public.cms_published_projection;

create or replace function public.cms_sync_media_usages()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_block jsonb; v_media jsonb; v_media_id uuid; v_block_id uuid;
begin
  delete from public.cms_media_usages where item_id = new.item_id and revision_id = new.revision_id;

  for v_block in select value from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) loop
    begin
      v_media_id := nullif(v_block #>> '{data,mediaId}', '')::uuid;
      v_block_id := nullif(v_block ->> 'id', '')::uuid;
      if v_media_id is not null then
        if not exists (select 1 from public.cms_media_assets where id = v_media_id and processing_status = 'ready') then
          raise exception 'CMS_MEDIA_NOT_READY' using errcode = '23514';
        end if;
        insert into public.cms_media_usages (asset_id, item_id, revision_id, block_id, usage_kind)
        values (v_media_id, new.item_id, new.revision_id, v_block_id, 'content') on conflict do nothing;
      end if;
    exception when invalid_text_representation then
      raise exception 'CMS_MEDIA_ID_INVALID' using errcode = '23514';
    end;
  end loop;

  if new.content_type = 'product' then
    for v_media in select value from jsonb_array_elements(coalesce(new.payload -> 'media', '[]'::jsonb)) loop
      begin
        v_media_id := nullif(v_media ->> 'assetId', '')::uuid;
        if v_media_id is not null then
          if not exists (select 1 from public.cms_media_assets where id = v_media_id and processing_status = 'ready') then
            raise exception 'CMS_MEDIA_NOT_READY' using errcode = '23514';
          end if;
          insert into public.cms_media_usages (asset_id, item_id, revision_id, block_id, usage_kind)
          values (v_media_id, new.item_id, new.revision_id, null, 'content') on conflict do nothing;
        end if;
      exception when invalid_text_representation then
        raise exception 'CMS_MEDIA_ID_INVALID' using errcode = '23514';
      end;
    end loop;
  end if;

  begin
    v_media_id := nullif(new.seo ->> 'ogImageId', '')::uuid;
    if v_media_id is not null then
      if not exists (select 1 from public.cms_media_assets where id = v_media_id and processing_status = 'ready') then
        raise exception 'CMS_MEDIA_NOT_READY' using errcode = '23514';
      end if;
      insert into public.cms_media_usages (asset_id, item_id, revision_id, block_id, usage_kind)
      values (v_media_id, new.item_id, new.revision_id, null, 'seo') on conflict do nothing;
    end if;
  exception when invalid_text_representation then
    raise exception 'CMS_MEDIA_ID_INVALID' using errcode = '23514';
  end;
  return new;
end;
$$;

revoke all on function public.cms_sync_media_usages() from public, anon, authenticated;
