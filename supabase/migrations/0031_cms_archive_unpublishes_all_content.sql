-- Archiving any public editorial entity must remove its live projection.
-- Pages and campaigns also preserve their explicit retirement route policy.

create or replace function public.cms_unpublish_archived_site_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  published public.cms_published_projection%rowtype;
  retirement jsonb;
  route_path text;
  code integer;
  destination text;
begin
  if new.workflow_status not in ('archived', 'trashed')
     or old.workflow_status = new.workflow_status then
    return new;
  end if;

  select * into published
  from public.cms_published_projection
  where item_id = new.id;
  if not found then return new; end if;

  if new.content_type in ('page', 'homepage') then
    route_path := published.payload #>> '{route,path}';
    select draft.payload -> 'retirement' into retirement
    from public.cms_content_drafts draft
    where draft.item_id = new.id;
    retirement := coalesce(retirement, published.payload -> 'retirement');
    code := case retirement ->> 'mode' when 'redirect' then 301 when 'gone' then 410 else 404 end;
    destination := case when code in (301, 302) then retirement ->> 'destinationPath' else null end;
  elsif new.content_type = 'campaign' then
    route_path := published.payload #>> '{route,path}';
    code := case published.payload #>> '{expiry,mode}'
      when 'redirect' then 301
      when 'fallback' then 302
      when 'gone' then 410
      else 404
    end;
    if code = 301 then
      destination := published.payload #>> '{expiry,destinationPath}';
    elsif code = 302 then
      select fallback.payload #>> '{route,path}' into destination
      from public.cms_published_projection fallback
      where fallback.item_id = (published.payload #>> '{expiry,fallbackCampaignId}')::uuid
        and fallback.content_type = 'campaign';
    end if;
  end if;

  if route_path is not null then
    insert into public.cms_route_rules(item_id, source_path, destination_path, status_code)
    values(new.id, route_path, destination, code)
    on conflict(source_path) do update
      set item_id = excluded.item_id,
          destination_path = excluded.destination_path,
          status_code = excluded.status_code,
          active = true,
          created_at = now();
  end if;

  insert into public.cms_publication_outbox(item_id, revision_id, event_type, correlation_id)
  values(new.id, published.revision_id, 'unpublish', gen_random_uuid())
  on conflict do nothing;
  delete from public.cms_publications where item_id = new.id;
  delete from public.cms_published_projection where item_id = new.id;
  return new;
end;
$$;

revoke all on function public.cms_unpublish_archived_site_content()
  from public, anon, authenticated;
grant execute on function public.cms_unpublish_archived_site_content()
  to service_role;
