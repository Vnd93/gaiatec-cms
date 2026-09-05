-- Fase 3 — consumo idempotente da outbox, agendamento server-side e mapa de usos.

create function public.cms_sync_media_usages()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_block jsonb; v_media_id uuid; v_block_id uuid;
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

create trigger cms_projection_sync_media after insert or update of revision_id, payload, seo
on public.cms_published_projection for each row execute function public.cms_sync_media_usages();

create function public.cms_claim_outbox(p_limit integer, p_worker_id uuid)
returns setof public.cms_publication_outbox language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with claimed as (
    select id from public.cms_publication_outbox
    where status in ('pending', 'failed') and available_at <= now() and attempts < 20
    order by available_at, created_at for update skip locked limit least(greatest(p_limit, 1), 50)
  )
  update public.cms_publication_outbox o set status = 'processing', locked_at = now(), attempts = attempts + 1,
    correlation_id = coalesce(o.correlation_id, p_worker_id)
  from claimed where o.id = claimed.id returning o.*;
end;
$$;

create function public.cms_finish_outbox(p_id uuid, p_success boolean, p_error_code text, p_correlation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item_id uuid;
begin
  update public.cms_publication_outbox set status = case when p_success then 'completed' else 'failed' end,
    completed_at = case when p_success then now() else null end,
    locked_at = null, last_error_code = case when p_success then null else p_error_code end,
    available_at = case when p_success then available_at else now() + interval '2 minutes' end
  where id = p_id and status = 'processing' returning item_id into v_item_id;
  if not found then raise exception 'CMS_OUTBOX_NOT_CLAIMED' using errcode = '40001'; end if;
  if not p_success then
    insert into public.cms_operational_events (severity, event_type, item_id, correlation_id, error_code)
    values ('critical', 'cms.outbox.failed', v_item_id, p_correlation_id, p_error_code);
  end if;
end;
$$;

create function public.cms_publish_due_schedule(p_item_id uuid, p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_item public.cms_content_items%rowtype; v_revision public.cms_content_revisions%rowtype;
  v_consumer text; v_renderer text; v_version bigint; v_tag text; v_etag text;
begin
  select * into v_item from public.cms_content_items where id = p_item_id for update;
  if not found or v_item.workflow_status <> 'scheduled' or v_item.scheduled_for > now() then
    raise exception 'CMS_SCHEDULE_NOT_DUE' using errcode = '23514';
  end if;
  select r.* into v_revision from public.cms_content_revisions r
  join public.cms_content_approvals a on a.revision_id = r.id and a.item_id = r.item_id and a.decision = 'approved'
  where r.item_id = v_item.id order by r.revision_number desc limit 1;
  if not found then raise exception 'CMS_APPROVED_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
  v_consumer := public.cms_validate_registered_content(v_item.content_type, v_revision.schema_version, v_revision.payload);
  select renderer_key into v_renderer from public.cms_capability_registry where consumer_id = v_consumer;
  select coalesce(content_version, 0) + 1 into v_version from public.cms_published_projection where item_id = v_item.id;
  v_version := coalesce(v_version, 1); v_tag := 'cms:' || v_item.content_type || ':' || v_item.id;
  v_etag := '"' || encode(extensions.digest(convert_to(v_revision.id::text || ':' || v_version::text, 'UTF8'), 'sha256'), 'hex') || '"';
  insert into public.cms_published_projection
    (item_id, revision_id, content_type, slug, schema_version, consumer_id, renderer_key, payload, seo, content_version, cache_tag, etag, published_at)
  values (v_item.id, v_revision.id, v_item.content_type, v_item.slug, v_revision.schema_version, v_consumer,
    v_renderer, v_revision.payload, v_revision.seo, v_version, v_tag, v_etag, now())
  on conflict (item_id) do update set revision_id=excluded.revision_id, slug=excluded.slug,
    payload=excluded.payload, seo=excluded.seo, content_version=excluded.content_version, cache_tag=excluded.cache_tag,
    etag=excluded.etag, published_at=excluded.published_at;
  insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
  values (v_item.id, v_revision.id, v_tag, v_item.updated_by)
  on conflict (item_id) do update set revision_id=excluded.revision_id, cache_tag=excluded.cache_tag,
    published_by=excluded.published_by, published_at=now();
  insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
  values (v_item.id, v_revision.id, 'publish', p_correlation_id) on conflict do nothing;
  update public.cms_content_items set workflow_status='published', scheduled_for=null, updated_at=now() where id=v_item.id;
  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (v_item.updated_by, 'cms:content.publish', 'content_item', v_item.id::text,
    jsonb_build_object('scheduled', true, 'revisionId', v_revision.id, 'contentVersion', v_version), p_correlation_id);
  return jsonb_build_object('itemId', v_item.id, 'revisionId', v_revision.id, 'contentVersion', v_version, 'etag', v_etag);
end;
$$;

revoke all on function public.cms_sync_media_usages() from public, anon, authenticated;
revoke all on function public.cms_claim_outbox(integer,uuid) from public, anon, authenticated;
revoke all on function public.cms_finish_outbox(uuid,boolean,text,uuid) from public, anon, authenticated;
revoke all on function public.cms_publish_due_schedule(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cms_claim_outbox(integer,uuid) to service_role;
grant execute on function public.cms_finish_outbox(uuid,boolean,text,uuid) to service_role;
grant execute on function public.cms_publish_due_schedule(uuid,uuid) to service_role;
