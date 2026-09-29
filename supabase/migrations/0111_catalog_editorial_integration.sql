-- CAT-010 editorial pages: append-only revisions, explicit opt-in, isolated staging reader.
-- Empty schema only. No override, approval, product load, publication or cutover is inserted.
begin;

create table public.cms_catalog_editorial_revisions (
  term_id uuid not null references public.cms_catalog_taxonomy_terms(id) on delete restrict,
  revision bigint not null check(revision>0),
  status text not null check(status in ('draft','published','unpublished','redirect')),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  summary text not null check(char_length(btrim(summary)) between 1 and 600),
  blocks jsonb not null check(jsonb_typeof(blocks)='array' and jsonb_array_length(blocks) between 1 and 50),
  term_kind text not null check(term_kind in ('technology','industry','application')),
  slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug)<=160),
  index_requested boolean not null default false,
  redirect_term_id uuid references public.cms_catalog_taxonomy_terms(id) on delete restrict,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  reason text not null check(char_length(btrim(reason)) between 3 and 240),
  correlation_id uuid not null,
  primary key(term_id,revision),
  check((status='redirect')=(redirect_term_id is not null)),
  check(redirect_term_id is distinct from term_id)
);
create view public.cms_catalog_current_editorial with(security_invoker=true) as
  select distinct on(term_id) * from public.cms_catalog_editorial_revisions order by term_id,revision desc;

-- Only the evidence pipeline may record indexing approval; CMS authors cannot self-attest UAT.
-- A new page revision or deployment SHA invalidates approval automatically.
create table public.cms_catalog_editorial_index_approvals (
  term_id uuid not null,
  revision bigint not null,
  environment text not null check(environment in ('local','staging')),
  release_sha text not null check(release_sha ~ '^[0-9a-f]{40}$'),
  evidence_id text not null check(evidence_id ~ '^CAT-UAT-[A-Z0-9-]{3,80}$'),
  evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
  valid_until timestamptz not null,
  primary key(term_id,revision,environment,release_sha),
  foreign key(term_id,revision) references public.cms_catalog_editorial_revisions(term_id,revision) on delete restrict
);
alter table public.cms_catalog_editorial_revisions enable row level security;
alter table public.cms_catalog_editorial_index_approvals enable row level security;
revoke all on public.cms_catalog_editorial_revisions, public.cms_catalog_current_editorial,
  public.cms_catalog_editorial_index_approvals from public,anon,authenticated;
grant select,insert on public.cms_catalog_editorial_revisions to authenticated;
grant select on public.cms_catalog_current_editorial to authenticated;
grant select,insert on public.cms_catalog_editorial_revisions,public.cms_catalog_editorial_index_approvals to service_role;
grant select on public.cms_catalog_current_editorial to service_role;
create policy catalog_editorial_read on public.cms_catalog_editorial_revisions for select to authenticated
using(private.cms_catalog_access() and private.cms_catalog_row_allowed(changed_by,changed_at)
  and exists(select 1 from public.cms_catalog_taxonomy_terms t where t.id=term_id));
create policy catalog_editorial_insert on public.cms_catalog_editorial_revisions for insert to authenticated
with check(private.cms_catalog_access() and public.cms_has_permission('cms:catalog.edit') and changed_by=auth.uid()
  and current_setting('cms.catalog_editorial_command',true)=auth.uid()::text
  and exists(select 1 from public.cms_catalog_taxonomy_terms t where t.id=term_id));

create function private.cms_catalog_editorial_immutable() returns trigger language plpgsql
security invoker set search_path=pg_catalog as $$
begin raise exception 'CMS_CATALOG_EDITORIAL_IMMUTABLE' using errcode='55000'; end;
$$;
create trigger catalog_editorial_immutable before update or delete on public.cms_catalog_editorial_revisions
for each row execute function private.cms_catalog_editorial_immutable();
create trigger catalog_editorial_approval_immutable before update or delete on public.cms_catalog_editorial_index_approvals
for each row execute function private.cms_catalog_editorial_immutable();
revoke all on function private.cms_catalog_editorial_immutable() from public,anon,authenticated;

create function private.cms_catalog_guard_editorial_lifecycle() returns trigger language plpgsql
security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v_page public.cms_catalog_editorial_revisions;
begin
  select * into v_page from public.cms_catalog_editorial_revisions where term_id=old.id and status<>'draft'
    order by revision desc limit 1;
  if found and (new.slug<>old.slug or (v_page.status='published' and new.status in ('inactive','merged'))) then
    raise exception 'CMS_CATALOG_EDITORIAL_DISPOSITION_REQUIRED' using errcode='23514';
  end if;
  if found and new.status='merged' and v_page.status='redirect' and v_page.redirect_term_id is distinct from new.replacement_id then
    raise exception 'CMS_CATALOG_EDITORIAL_REDIRECT_INVALID' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger catalog_editorial_term_lifecycle before update on public.cms_catalog_taxonomy_terms
for each row execute function private.cms_catalog_guard_editorial_lifecycle();
revoke all on function private.cms_catalog_guard_editorial_lifecycle() from public,anon,authenticated;

create function public.cms_catalog_editorial_workspace(p_environment text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_result jsonb;
begin
  if not coalesce((private.cms_catalog_capability(p_environment)->>'enabled')::boolean,false) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode='42501';
  end if;
  perform set_config('cms.catalog_environment',p_environment,true);
  if (select count(*)>200 from public.cms_catalog_current_editorial) then
    raise exception 'CMS_CATALOG_WORKSPACE_LIMIT' using errcode='54000';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e)-'changed_by'-'correlation_id'-'reason' order by e.title,e.term_id),'[]')
    into v_result from public.cms_catalog_current_editorial e;
  perform set_config('cms.catalog_environment','',true);
  return v_result;
end;
$$;

create function public.cms_catalog_editorial_command(p_environment text,p_command jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_action text:=p_command->>'action'; v_id uuid:=(p_command->>'termId')::uuid;
  v_expected bigint:=(p_command->>'expectedVersion')::bigint; v_term public.cms_catalog_taxonomy_terms;
  v_previous public.cms_catalog_editorial_revisions; v_blocks jsonb; v_block jsonb; v_target uuid;
begin
  if not coalesce((private.cms_catalog_capability(p_environment)->>'enabled')::boolean,false)
    or not public.cms_has_permission('cms:catalog.edit') then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  if v_action is null or v_action not in ('save','publish','unpublish','redirect') or v_id is null
    or v_expected is null or v_expected<0 or p_correlation_id is null
    or coalesce(char_length(btrim(p_command->>'reason')),0) not between 3 and 240
    or jsonb_typeof(p_command) is distinct from 'object' then
    raise exception 'CMS_CATALOG_COMMAND_INVALID' using errcode='22023';
  end if;
  if v_action<>'save' and (not public.cms_has_permission('cms:catalog.administer')
    or not public.cms_has_permission('cms:catalog.publish')) then
    raise exception 'CMS_CATALOG_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if (p_command - case when v_action='save' then array['action','termId','expectedVersion','reason','title','summary','blocks']
      when v_action='publish' then array['action','termId','expectedVersion','reason','indexRequested']
      when v_action='redirect' then array['action','termId','expectedVersion','reason','targetTermId']
      else array['action','termId','expectedVersion','reason'] end)<>'{}'::jsonb then
    raise exception 'CMS_CATALOG_COMMAND_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cms.catalog.workspace',0));
  perform set_config('cms.catalog_environment',p_environment,true);
  select * into v_term from public.cms_catalog_taxonomy_terms where id=v_id;
  if not found or v_term.term_type not in ('technology','industry','application') then
    raise exception 'CMS_CATALOG_EDITORIAL_TERM_REQUIRED' using errcode='23514';
  end if;
  select * into v_previous from public.cms_catalog_current_editorial where term_id=v_id;
  if coalesce(v_previous.revision,0)<>v_expected then
    raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode='40001',
      detail=private.cms_catalog_conflict_detail(v_previous.changed_by,v_previous.changed_at,v_previous.correlation_id::text);
  end if;
  if v_action<>'save' and v_previous.revision is null then
    raise exception 'CMS_CATALOG_EDITORIAL_DRAFT_REQUIRED' using errcode='23514';
  end if;
  if v_action='save' then
    if v_term.status<>'active' then raise exception 'CMS_CATALOG_EDITORIAL_TERM_REQUIRED' using errcode='23514'; end if;
    v_blocks:=p_command->'blocks';
    if jsonb_typeof(v_blocks) is distinct from 'array' or jsonb_array_length(v_blocks) not between 1 and 50 then
      raise exception 'CMS_CATALOG_EDITORIAL_CONTENT_INVALID' using errcode='22023';
    end if;
    for v_block in select value from jsonb_array_elements(v_blocks) loop
      if jsonb_typeof(v_block) is distinct from 'object' or (v_block-array['heading','paragraphs'])<>'{}'::jsonb
        or jsonb_typeof(v_block->'heading') is distinct from 'string'
        or coalesce(char_length(btrim(v_block->>'heading')),0) not between 1 and 160
        or jsonb_typeof(v_block->'paragraphs') is distinct from 'array'
        or jsonb_array_length(v_block->'paragraphs') not between 1 and 20 then
        raise exception 'CMS_CATALOG_EDITORIAL_CONTENT_INVALID' using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements(v_block->'paragraphs') p(value)
        where jsonb_typeof(p.value) is distinct from 'string' or char_length(btrim(p.value#>>'{}')) not between 1 and 2000) then
        raise exception 'CMS_CATALOG_EDITORIAL_CONTENT_INVALID' using errcode='22023';
      end if;
    end loop;
  end if;
  if v_action='publish' then
    if v_previous.status<>'draft' or v_term.status<>'active'
      or jsonb_typeof(p_command->'indexRequested') is distinct from 'boolean'
      or not exists(select 1 from public.cms_catalog_product_snapshots s where s.is_current and v_id=any(s.term_ids)) then
      raise exception 'CMS_CATALOG_EDITORIAL_PUBLISH_GATES_REQUIRED' using errcode='23514';
    end if;
  end if;
  if v_action='redirect' then
    v_target:=(p_command->>'targetTermId')::uuid;
    -- The destination must be a live page, never another redirect. This also prevents loops.
    if v_target is null or v_target=v_id or not exists(select 1 from public.cms_catalog_taxonomy_terms t
      join public.cms_catalog_current_editorial e on e.term_id=t.id
      where t.id=v_target and t.term_type=v_term.term_type and t.status='active' and e.status='published') then
      raise exception 'CMS_CATALOG_EDITORIAL_REDIRECT_INVALID' using errcode='23514';
    end if;
  end if;
  perform set_config('cms.catalog_editorial_command',auth.uid()::text,true);
  insert into public.cms_catalog_editorial_revisions(term_id,revision,status,title,summary,blocks,term_kind,slug,
    index_requested,redirect_term_id,changed_by,reason,correlation_id)
  values(v_id,v_expected+1,case v_action when 'save' then 'draft' when 'publish' then 'published' when 'unpublish' then 'unpublished' else 'redirect' end,
    case when v_action='save' then p_command->>'title' else v_previous.title end,
    case when v_action='save' then p_command->>'summary' else v_previous.summary end,
    case when v_action='save' then v_blocks else v_previous.blocks end,v_term.term_type,
    case when v_action='save' then v_term.slug else v_previous.slug end,
    case when v_action='publish' then (p_command->>'indexRequested')::boolean else false end,
    v_target,auth.uid(),p_command->>'reason',p_correlation_id);
  perform set_config('cms.catalog_editorial_command','',true);
  perform set_config('cms.catalog_environment','',true);
  return jsonb_build_object('revision',v_expected+1);
end;
$$;
revoke all on function public.cms_catalog_editorial_workspace(text),public.cms_catalog_editorial_command(text,jsonb,uuid) from public,anon;
grant execute on function public.cms_catalog_editorial_workspace(text),public.cms_catalog_editorial_command(text,jsonb,uuid) to authenticated;

-- No direct anonymous table access: the service reader rechecks the live flag on every request.
create policy catalog_snapshot_no_direct_public_read on public.cms_catalog_product_snapshots as restrictive for select to anon using(false);
create function private.cms_catalog_corporate_actor(p_actor uuid) returns boolean language sql stable
security definer set search_path=pg_catalog,private,auth,pg_temp as $$
  select p_actor is not null and exists(select 1 from auth.users where id=p_actor)
    and not exists(select 1 from private.cms_qa_actor_leases where actor_id=p_actor);
$$;
revoke all on function private.cms_catalog_corporate_actor(uuid) from public,anon,authenticated;
grant execute on function private.cms_catalog_corporate_actor(uuid) to service_role;

create function public.cms_catalog_public_capability(p_environment text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v_flag public.cms_feature_flags; v_override public.cms_feature_flag_overrides;
begin
  -- Production/cutover is intentionally outside this implementation's authority.
  if p_environment is null or p_environment not in ('local','staging') then
    return jsonb_build_object('key','ev2.catalog_v1','enabled',false,'source','unavailable');
  end if;
  select * into v_flag from public.cms_feature_flags where flag_key='ev2.catalog_v1';
  if not found or (v_flag.expires_at is not null and v_flag.expires_at<=now()) then
    return jsonb_build_object('key','ev2.catalog_v1','enabled',false,'source','unavailable');
  end if;
  if v_flag.kill_switch then return jsonb_build_object('key','ev2.catalog_v1','enabled',false,'source','kill_switch'); end if;
  select * into v_override from public.cms_feature_flag_overrides
    where flag_key='ev2.catalog_v1' and environment=p_environment and starts_at<=now() and expires_at>now()
      and ((scope_type='site' and scope_key='main') or (scope_type='environment' and scope_key=p_environment) or (scope_type='global' and scope_key='*'))
    order by case scope_type when 'site' then 3 when 'environment' then 2 else 1 end desc limit 1;
  return jsonb_build_object('key','ev2.catalog_v1','enabled',coalesce(v_override.enabled,false),
    'source',case when v_override.id is null then 'default' else 'override' end);
end;
$$;

create function public.cms_catalog_public_read(p_environment text,p_release_sha text,p_kind text,p_slug text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_page public.cms_catalog_editorial_revisions; v_product public.cms_catalog_product_snapshots;
  v_prefix text; v_path text; v_items jsonb; v_index boolean;
begin
  if not coalesce((public.cms_catalog_public_capability(p_environment)->>'enabled')::boolean,false)
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug)>160 then return null; end if;
  if p_kind='product' then
    select s.* into v_product from public.cms_catalog_product_snapshots s
      join public.cms_catalog_products p on p.id=s.product_id
      where s.slug=p_slug and s.is_current and private.cms_catalog_corporate_actor(s.published_by)
        and private.cms_catalog_corporate_actor(p.created_by) and private.cms_catalog_corporate_actor(p.updated_by);
    if not found then return null; end if;
    return jsonb_build_object('slug',v_product.slug,'title',v_product.title,'summary',v_product.content->>'summary',
      'description',v_product.content->>'description','path','/catalogo/itens/'||v_product.slug,'indexable',false);
  end if;
  if p_kind not in ('technology','industry','application') or p_kind is null then return null; end if;
  -- Ignore later drafts: a published revision is immutable until an explicit unpublish/redirect.
  select e.* into v_page from public.cms_catalog_editorial_revisions e
    join public.cms_catalog_taxonomy_terms t on t.id=e.term_id
    where e.term_kind=p_kind and e.slug=p_slug and e.status<>'draft'
      and private.cms_catalog_corporate_actor(e.changed_by) and private.cms_catalog_corporate_actor(t.created_by)
      and private.cms_catalog_corporate_actor(t.updated_by)
    order by e.revision desc limit 1;
  if not found or v_page.status='unpublished' then return null; end if;
  v_prefix:=case p_kind when 'technology' then 'tecnologia' when 'industry' then 'industria' else 'aplicacao' end;
  if v_page.status='redirect' then
    if not exists(select 1 from public.cms_catalog_taxonomy_terms t join public.cms_catalog_current_editorial e on e.term_id=t.id
      where t.id=v_page.redirect_term_id and t.status='active' and e.status='published'
        and private.cms_catalog_corporate_actor(e.changed_by) and private.cms_catalog_corporate_actor(t.created_by)
        and private.cms_catalog_corporate_actor(t.updated_by)) then return null; end if;
    return jsonb_build_object('kind','redirect','status',301,'path','/catalogo/'||v_prefix||'/'||
      (select slug from public.cms_catalog_current_editorial where term_id=v_page.redirect_term_id));
  end if;
  if not exists(select 1 from public.cms_catalog_taxonomy_terms where id=v_page.term_id and status='active') then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('title',s.title,'summary',s.content->>'summary','path','/catalogo/itens/'||s.slug) order by s.title,s.slug),'[]')
    into v_items from public.cms_catalog_product_snapshots s join public.cms_catalog_products p on p.id=s.product_id
    where s.is_current and v_page.term_id=any(s.term_ids) and private.cms_catalog_corporate_actor(s.published_by)
      and private.cms_catalog_corporate_actor(p.created_by) and private.cms_catalog_corporate_actor(p.updated_by);
  if jsonb_array_length(v_items)=0 or jsonb_array_length(v_items)>200 then return null; end if;
  v_path:='/catalogo/'||v_prefix||'/'||v_page.slug;
  v_index:=v_page.index_requested and exists(select 1 from public.cms_catalog_editorial_index_approvals a
    where a.term_id=v_page.term_id and a.revision=v_page.revision and a.environment=p_environment
      and a.release_sha=p_release_sha and a.valid_until>now());
  return jsonb_build_object('kind','catalog-term','slug',v_page.slug,'path',v_path,'publishedAt',v_page.changed_at,
    'payload',jsonb_build_object('kind',p_kind,'slug',v_page.slug,'path',v_path,'title',v_page.title,'summary',v_page.summary,
      'blocks',v_page.blocks,'products',v_items,'seo',jsonb_build_object('canonicalPath',v_path,'indexable',v_index)));
end;
$$;
revoke all on function public.cms_catalog_public_capability(text),public.cms_catalog_public_read(text,text,text,text) from public,anon,authenticated;
grant execute on function public.cms_catalog_public_capability(text),public.cms_catalog_public_read(text,text,text,text) to service_role;

create function public.cms_catalog_public_sitemap(p_environment text,p_release_sha text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v_item record; v_page jsonb; v_result jsonb:='[]';
begin
  if not coalesce((public.cms_catalog_public_capability(p_environment)->>'enabled')::boolean,false) then return v_result; end if;
  if (select count(distinct term_id)>200 from public.cms_catalog_editorial_revisions) then
    raise exception 'CMS_CATALOG_WORKSPACE_LIMIT' using errcode='54000';
  end if;
  for v_item in select distinct term_kind,slug from public.cms_catalog_editorial_revisions loop
    v_page:=public.cms_catalog_public_read(p_environment,p_release_sha,v_item.term_kind,v_item.slug);
    if coalesce((v_page#>>'{payload,seo,indexable}')::boolean,false) then
      v_result:=v_result||jsonb_build_array(jsonb_build_object('path',v_page->>'path','lastModified',v_page->>'publishedAt'));
    end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function public.cms_catalog_public_sitemap(text,text) from public,anon,authenticated;
grant execute on function public.cms_catalog_public_sitemap(text,text) to service_role;

-- Public readers use the transactional snapshot directly with no-store. The worker
-- acknowledges those exact bytes; it never rebuilds content or republishes old events.
alter table public.cms_catalog_publication_outbox drop constraint cms_catalog_publication_outbox_status_check;
alter table public.cms_catalog_publication_outbox add constraint cms_catalog_publication_outbox_status_check
  check(status in ('pending','processing','processed','failed','superseded'));
create function public.cms_catalog_reconcile_publication_outbox(p_environment text,p_limit integer default 20)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_event public.cms_catalog_publication_outbox; v_processed integer:=0; v_superseded integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'CMS_CATALOG_LIMIT_INVALID' using errcode='22023'; end if;
  if not coalesce((public.cms_catalog_public_capability(p_environment)->>'enabled')::boolean,false) then
    return jsonb_build_object('enabled',false,'processed',0,'superseded',0,'busy',false);
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('cms.catalog.workspace',0)) then
    return jsonb_build_object('enabled',true,'processed',0,'superseded',0,'busy',true);
  end if;
  for v_event in select o.* from public.cms_catalog_publication_outbox o
    join public.cms_catalog_products p on p.id=o.product_id
    where o.status in ('pending','failed') and o.available_at<=now()
      and private.cms_catalog_corporate_actor(p.created_by) and private.cms_catalog_corporate_actor(p.updated_by)
    order by o.created_at,o.id limit p_limit for update of o skip locked loop
    if not exists(select 1 from public.cms_catalog_product_snapshots s where s.snapshot_id=v_event.snapshot_id
      and s.product_id=v_event.product_id and (v_event.event_type='invalidated' or s.revision=v_event.revision)) then
      raise exception 'CMS_CATALOG_OUTBOX_MISMATCH' using errcode='40001';
    end if;
    if v_event.event_type='published' and not exists(select 1 from public.cms_catalog_product_snapshots s
      where s.snapshot_id=v_event.snapshot_id and s.is_current) then
      update public.cms_catalog_publication_outbox set status='superseded',processed_at=now(),
        attempt_count=attempt_count+1,last_error=null where id=v_event.id;
      v_superseded:=v_superseded+1;
    else
      perform public.cms_catalog_ack_publication(v_event.id,v_event.snapshot_id,v_event.revision);
      v_processed:=v_processed+1;
    end if;
  end loop;
  return jsonb_build_object('enabled',true,'processed',v_processed,'superseded',v_superseded,'busy',false);
end;
$$;
revoke all on function public.cms_catalog_reconcile_publication_outbox(text,integer) from public,anon,authenticated;
grant execute on function public.cms_catalog_reconcile_publication_outbox(text,integer) to service_role;
commit;
