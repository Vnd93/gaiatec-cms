-- Fase 5 — catalogo, servicos e descoberta. Estrutura exclusivamente vazia.
-- Nenhum conteudo, taxonomia, sinonimo editorial ou midia e carregado por esta migration.

alter table public.cms_content_items drop constraint if exists cms_content_items_content_type_check;
alter table public.cms_content_items add constraint cms_content_items_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage'));
alter table public.cms_capability_registry drop constraint if exists cms_capability_registry_content_type_check;
alter table public.cms_capability_registry add constraint cms_capability_registry_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage'));

insert into public.cms_permissions(permission_key, description, critical) values
  ('cms:services.approve','Aprovar servicos.',false),
  ('cms:industries.read','Consultar industrias.',false),('cms:industries.edit','Editar industrias.',false),
  ('cms:industries.approve','Aprovar industrias.',false),('cms:industries.publish','Publicar industrias.',true),
  ('cms:applications.read','Consultar aplicacoes.',false),('cms:applications.edit','Editar aplicacoes.',false),
  ('cms:applications.approve','Aprovar aplicacoes.',false),('cms:applications.publish','Publicar aplicacoes.',true),
  ('cms:solutions.read','Consultar solucoes.',false),('cms:solutions.edit','Editar solucoes.',false),
  ('cms:solutions.approve','Aprovar solucoes.',false),('cms:solutions.publish','Publicar solucoes.',true),
  ('cms:search.read','Consultar governanca da busca.',false),('cms:search.manage','Administrar sinonimos da busca.',false),
  ('cms:search.analytics','Consultar analytics anonimos da busca.',false)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions(role_key, permission_key)
select 'super_admin', permission_key from public.cms_permissions
where permission_key like 'cms:industries.%' or permission_key like 'cms:applications.%'
   or permission_key like 'cms:solutions.%' or permission_key like 'cms:search.%'
   or permission_key = 'cms:services.approve'
on conflict do nothing;
insert into public.cms_role_permissions(role_key, permission_key)
select 'admin', permission_key from public.cms_permissions
where permission_key like 'cms:industries.%' or permission_key like 'cms:applications.%'
   or permission_key like 'cms:solutions.%' or permission_key like 'cms:search.%'
   or permission_key = 'cms:services.approve'
on conflict do nothing;
insert into public.cms_role_permissions(role_key, permission_key) values
  ('commercial','cms:services.approve'),
  ('commercial','cms:industries.read'),('commercial','cms:industries.edit'),('commercial','cms:industries.publish'),
  ('commercial','cms:applications.read'),('commercial','cms:applications.edit'),('commercial','cms:applications.publish'),
  ('commercial','cms:solutions.read'),('commercial','cms:solutions.edit'),('commercial','cms:solutions.publish'),
  ('commercial','cms:search.read'),('commercial','cms:search.analytics'),
  ('marketing','cms:industries.read'),('marketing','cms:industries.edit'),
  ('marketing','cms:applications.read'),('marketing','cms:applications.edit'),
  ('marketing','cms:solutions.read'),('marketing','cms:solutions.edit'),
  ('marketing','cms:search.read'),('marketing','cms:search.manage'),('marketing','cms:search.analytics'),
  ('technical','cms:industries.read'),('technical','cms:industries.edit'),
  ('technical','cms:applications.read'),('technical','cms:applications.edit'),
  ('technical','cms:solutions.read'),('technical','cms:solutions.edit'),('technical','cms:search.read'),
  ('editor','cms:industries.read'),('editor','cms:industries.edit'),
  ('editor','cms:applications.read'),('editor','cms:applications.edit'),
  ('editor','cms:solutions.read'),('editor','cms:solutions.edit'),('editor','cms:search.read'),
  ('reviewer','cms:services.approve'),
  ('reviewer','cms:industries.read'),('reviewer','cms:industries.approve'),
  ('reviewer','cms:applications.read'),('reviewer','cms:applications.approve'),
  ('reviewer','cms:solutions.read'),('reviewer','cms:solutions.approve'),('reviewer','cms:search.read')
on conflict do nothing;

create or replace function public.cms_content_permission(p_content_type text, p_action text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_content_type = 'product' and p_action in ('read','edit','publish') then 'cms:products.' || p_action
    when p_content_type = 'service' and p_action in ('read','edit','publish') then 'cms:services.' || p_action
    when p_content_type = 'industry' and p_action in ('read','edit','publish') then 'cms:industries.' || p_action
    when p_content_type = 'application' and p_action in ('read','edit','publish') then 'cms:applications.' || p_action
    when p_content_type = 'solution' and p_action in ('read','edit','publish') then 'cms:solutions.' || p_action
    when p_content_type = 'post' and p_action in ('read','edit','review','approve','publish') then 'cms:posts.' || p_action
    when p_content_type in ('page','homepage') and p_action in ('read','edit','publish') then 'cms:homepage.' || p_action
    else null end;
$$;
create or replace function public.cms_editorial_required_permission(p_content_type text, p_action text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_action in ('create','save','submit','archive','trash','preview') then public.cms_content_permission(p_content_type,'edit')
    when p_action = 'approve' and p_content_type = 'post' then 'cms:posts.approve'
    when p_action = 'approve' and p_content_type = 'product' then 'cms:products.approve'
    when p_action = 'approve' and p_content_type = 'service' then 'cms:services.approve'
    when p_action = 'approve' and p_content_type = 'industry' then 'cms:industries.approve'
    when p_action = 'approve' and p_content_type = 'application' then 'cms:applications.approve'
    when p_action = 'approve' and p_content_type = 'solution' then 'cms:solutions.approve'
    when p_action in ('schedule','publish','restore') then public.cms_content_permission(p_content_type,'publish')
    else null end;
$$;

insert into public.cms_capability_registry(
  consumer_id,content_type,schema_name,schema_version,renderer_key,preview_renderer_key,
  route_pattern,permissions,validation_contract,fixture_contract,test_contract
) values
('cms.service.v1','service','CmsServiceContentSchema',1,'discovery-entity','discovery-entity','/servicos/:slug',
 '{"read":"cms:services.read","edit":"cms:services.edit","approve":"cms:services.approve","publish":"cms:services.publish"}',
 '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"seo":true,"provenance":true,"relations":true,"media":true}',
 '{"kind":"synthetic-only","viewports":["mobile","desktop"]}',
 '{"contract":true,"roundtrip":true,"list":true,"detail":true,"filters":true,"relations":true,"seo":true,"e2e":true}'),
('cms.industry.v1','industry','CmsIndustryContentSchema',1,'discovery-entity','discovery-entity','/industrias/:slug',
 '{"read":"cms:industries.read","edit":"cms:industries.edit","approve":"cms:industries.approve","publish":"cms:industries.publish"}',
 '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"seo":true,"provenance":true,"relations":true,"media":true}',
 '{"kind":"synthetic-only","viewports":["mobile","desktop"]}',
 '{"contract":true,"roundtrip":true,"list":true,"detail":true,"filters":true,"relations":true,"seo":true,"e2e":true}'),
('cms.application.v1','application','CmsApplicationContentSchema',1,'discovery-entity','discovery-entity','/aplicacoes/:slug',
 '{"read":"cms:applications.read","edit":"cms:applications.edit","approve":"cms:applications.approve","publish":"cms:applications.publish"}',
 '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"seo":true,"provenance":true,"relations":true,"media":true,"points":true}',
 '{"kind":"synthetic-only","viewports":["mobile","desktop"]}',
 '{"contract":true,"roundtrip":true,"list":true,"detail":true,"filters":true,"relations":true,"seo":true,"e2e":true}'),
('cms.solution.v1','solution','CmsSolutionContentSchema',1,'discovery-entity','discovery-entity','/solucoes/:slug',
 '{"read":"cms:solutions.read","edit":"cms:solutions.edit","approve":"cms:solutions.approve","publish":"cms:solutions.publish"}',
 '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"seo":true,"provenance":true,"relations":true,"media":true,"gasDetectionModel":"integrated_master_catalog"}',
 '{"kind":"synthetic-only","viewports":["mobile","desktop"]}',
 '{"contract":true,"roundtrip":true,"list":true,"detail":true,"filters":true,"relations":true,"seo":true,"e2e":true}')
on conflict (consumer_id) do update set validation_contract=excluded.validation_contract,test_contract=excluded.test_contract,updated_at=now();

create table public.cms_discovery_projection(
  item_id uuid primary key references public.cms_content_items(id) on delete restrict,
  revision_id uuid not null references public.cms_content_revisions(id) on delete restrict,
  content_type text not null check (content_type in ('service','industry','application','solution')),
  slug text not null, title text not null, summary text,
  governance_state text not null check (governance_state in ('synthetic_test','awaiting_owner','homologated')),
  category text, payload jsonb not null, seo jsonb not null,
  relation_ids jsonb not null default '{}'::jsonb,
  search_text text not null, search_document tsvector generated always as (to_tsvector('simple',search_text)) stored,
  published_at timestamptz not null, unique(content_type,slug)
);
create index cms_discovery_search_idx on public.cms_discovery_projection using gin(search_document);
create index cms_discovery_filter_idx on public.cms_discovery_projection(content_type,category,published_at desc);

create table public.cms_search_synonyms(
  id uuid primary key default gen_random_uuid(), canonical_term text not null,
  aliases text[] not null check (cardinality(aliases) between 1 and 50),
  scope text not null default 'all' check (scope in ('all','product','service','industry','application','solution')),
  active boolean not null default true, source_reference text not null,
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(canonical_term,scope)
);
create table public.cms_search_events(
  id bigint generated always as identity primary key,
  normalized_query text not null check (char_length(normalized_query) between 1 and 300),
  result_count integer not null check (result_count >= 0),
  content_types text[] not null default '{}', refinements jsonb not null default '{}'::jsonb,
  correlation_id uuid not null, occurred_at timestamptz not null default now()
);
create index cms_search_zero_idx on public.cms_search_events(occurred_at desc) where result_count=0;

create function public.cms_validate_f5_publication() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pair record; target uuid;
begin
  if new.content_type not in ('product','service','industry','application','solution') then return new; end if;
  if coalesce(new.payload->>'governanceState',new.payload->>'pilotState') = 'homologated'
     and coalesce(new.payload#>>'{approval,homologatedAt}','') = '' then
    raise exception 'CMS_F5_HOMOLOGATION_REQUIRED' using errcode='23514';
  end if;
  if coalesce((new.seo->>'indexable')::boolean,false)
     and coalesce(new.payload->>'governanceState',new.payload->>'pilotState') <> 'homologated' then
    raise exception 'CMS_F5_INDEXABILITY_REQUIRES_HOMOLOGATION' using errcode='23514';
  end if;
  for pair in select * from (values
    ('productIds','product'),('serviceIds','service'),('industryIds','industry'),
    ('applicationIds','application'),('solutionIds','solution'),('sectorIds','industry')) v(key,kind)
  loop
    for target in select jsonb_array_elements_text(coalesce(new.payload#>array['relations',pair.key],'[]'::jsonb))::uuid loop
      if not exists(select 1 from public.cms_published_projection p where p.item_id=target and p.content_type=pair.kind) then
        raise exception 'CMS_F5_ORPHAN_RELATION:%:%',pair.key,target using errcode='23514';
      end if;
    end loop;
  end loop;
  return new;
end $$;
create trigger cms_f5_validate_publication before insert or update of payload,seo on public.cms_published_projection
for each row execute function public.cms_validate_f5_publication();

create function public.cms_sync_discovery_projection() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=new.payload; search_terms text;
begin
  if new.content_type not in ('service','industry','application','solution') then return new; end if;
  search_terms:=concat_ws(' ',p->>'title',p->>'summary',p->>'serviceKind',p->>'marketName',p->>'process',p->>'problem',p->>'approach',
    array_to_string(array(select jsonb_array_elements_text(coalesce(p#>'{search,synonyms}','[]'::jsonb))),' '),
    array_to_string(array(select jsonb_array_elements_text(coalesce(p#>'{search,keywords}','[]'::jsonb))),' '));
  insert into public.cms_discovery_projection(item_id,revision_id,content_type,slug,title,summary,governance_state,category,payload,seo,relation_ids,search_text,published_at)
  values(new.item_id,new.revision_id,new.content_type,new.slug,p->>'title',p->>'summary',p->>'governanceState',
    coalesce(p->>'serviceKind',p->>'marketName',p->>'process'),p,new.seo,coalesce(p->'relations','{}'::jsonb),search_terms,new.published_at)
  on conflict(item_id) do update set revision_id=excluded.revision_id,slug=excluded.slug,title=excluded.title,summary=excluded.summary,
    governance_state=excluded.governance_state,category=excluded.category,payload=excluded.payload,seo=excluded.seo,
    relation_ids=excluded.relation_ids,search_text=excluded.search_text,published_at=excluded.published_at;
  return new;
end $$;
create trigger cms_projection_sync_discovery after insert or update on public.cms_published_projection
for each row execute function public.cms_sync_discovery_projection();

create function public.cms_sync_discovery_media_usage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare m jsonb; asset uuid;
begin
  if new.content_type not in ('service','industry','application','solution') then return new; end if;
  for m in select value from jsonb_array_elements(coalesce(new.payload->'media','[]'::jsonb)) loop
    asset:=(m->>'assetId')::uuid;
    if not exists(select 1 from public.cms_media_assets where id=asset and processing_status='ready' and rights_confirmed) then
      raise exception 'CMS_MEDIA_NOT_READY' using errcode='23514';
    end if;
    insert into public.cms_media_usages(asset_id,item_id,revision_id,usage_kind)
    values(asset,new.item_id,new.revision_id,'gallery') on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger cms_projection_sync_discovery_media after insert or update of revision_id,payload on public.cms_published_projection
for each row execute function public.cms_sync_discovery_media_usage();

alter table public.cms_discovery_projection enable row level security;
alter table public.cms_search_synonyms enable row level security;
alter table public.cms_search_events enable row level security;
create policy cms_discovery_public_read on public.cms_discovery_projection for select to anon,authenticated using(true);
create policy cms_search_synonyms_cms_read on public.cms_search_synonyms for select to authenticated using(public.cms_has_permission('cms:search.read'));
create policy cms_search_events_cms_read on public.cms_search_events for select to authenticated using(public.cms_has_permission('cms:search.analytics'));
revoke all on public.cms_discovery_projection,public.cms_search_synonyms,public.cms_search_events from public,anon,authenticated;
grant select on public.cms_discovery_projection to anon,authenticated;
grant select on public.cms_search_synonyms,public.cms_search_events to authenticated;
grant all on public.cms_discovery_projection,public.cms_search_synonyms,public.cms_search_events to service_role;
grant usage,select on sequence public.cms_search_events_id_seq to service_role;
revoke all on function public.cms_validate_f5_publication(),public.cms_sync_discovery_projection(),public.cms_sync_discovery_media_usage() from public,anon,authenticated;
