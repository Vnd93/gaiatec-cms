-- Fase 6 — site builder governado, navegacao, configuracoes e posicionamentos.
-- Migration estrutural e vazia: nenhum conteudo editorial ou midia e criado.

alter table public.cms_content_items drop constraint if exists cms_content_items_content_type_check;
alter table public.cms_content_items add constraint cms_content_items_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage','navigation','site_settings','placement'));
alter table public.cms_capability_registry drop constraint if exists cms_capability_registry_content_type_check;
alter table public.cms_capability_registry add constraint cms_capability_registry_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage','navigation','site_settings','placement'));

insert into public.cms_permissions(permission_key,description,critical) values
  ('cms:pages.read','Consultar paginas administradas.',false),
  ('cms:pages.edit','Criar e editar paginas administradas.',false),
  ('cms:pages.approve','Aprovar paginas administradas.',false),
  ('cms:pages.publish','Publicar, retirar e restaurar paginas administradas.',true),
  ('cms:homepage.read','Consultar homepage.',false),
  ('cms:homepage.edit','Editar homepage.',false),
  ('cms:homepage.approve','Aprovar homepage.',false),
  ('cms:homepage.publish','Publicar, retirar e restaurar homepage.',true),
  ('cms:navigation.read','Consultar navegacao do site.',false),
  ('cms:navigation.edit','Editar navegacao do site.',false),
  ('cms:navigation.approve','Aprovar navegacao do site.',false),
  ('cms:navigation.publish','Publicar navegacao do site.',true),
  ('cms:settings.read','Consultar configuracoes globais.',false),
  ('cms:settings.edit','Editar configuracoes globais.',false),
  ('cms:settings.approve','Aprovar configuracoes globais.',false),
  ('cms:settings.publish','Publicar configuracoes globais.',true),
  ('cms:placements.read','Consultar destaques e posicionamentos.',false),
  ('cms:placements.edit','Editar destaques e posicionamentos.',false),
  ('cms:placements.approve','Aprovar destaques e posicionamentos.',false),
  ('cms:placements.publish','Publicar destaques e posicionamentos.',true),
  ('cms:content.hard_delete','Excluir definitivamente rascunho nunca publicado.',true)
on conflict(permission_key) do nothing;

alter table public.cms_editorial_command_receipts
  drop constraint if exists cms_editorial_command_receipts_action_check;
alter table public.cms_editorial_command_receipts
  add constraint cms_editorial_command_receipts_action_check
  check (action in ('create','save','submit','approve','schedule','publish','restore','archive','trash','preview','reopen','retire','hard_delete'));

insert into public.cms_role_permissions(role_key,permission_key)
select 'super_admin',permission_key from public.cms_permissions
where permission_key like 'cms:pages.%' or permission_key like 'cms:navigation.%'
   or permission_key like 'cms:settings.%' or permission_key like 'cms:placements.%'
   or permission_key like 'cms:homepage.%' or permission_key='cms:content.hard_delete'
on conflict do nothing;
insert into public.cms_role_permissions(role_key,permission_key)
select 'admin',permission_key from public.cms_permissions
where permission_key like 'cms:pages.%' or permission_key like 'cms:navigation.%'
   or permission_key like 'cms:settings.%' or permission_key like 'cms:placements.%'
   or permission_key like 'cms:homepage.%'
on conflict do nothing;
insert into public.cms_role_permissions(role_key,permission_key) values
  ('marketing','cms:pages.read'),('marketing','cms:pages.edit'),('marketing','cms:pages.publish'),
  ('marketing','cms:homepage.read'),('marketing','cms:homepage.edit'),('marketing','cms:homepage.publish'),
  ('marketing','cms:navigation.read'),('marketing','cms:navigation.edit'),
  ('marketing','cms:settings.read'),('marketing','cms:settings.edit'),
  ('marketing','cms:placements.read'),('marketing','cms:placements.edit'),('marketing','cms:placements.publish'),
  ('commercial','cms:pages.read'),('commercial','cms:pages.edit'),('commercial','cms:homepage.read'),
  ('commercial','cms:navigation.read'),
  ('commercial','cms:settings.read'),('commercial','cms:placements.read'),('commercial','cms:placements.edit'),
  ('editor','cms:pages.read'),('editor','cms:pages.edit'),('editor','cms:homepage.read'),
  ('editor','cms:homepage.edit'),('editor','cms:navigation.read'),
  ('editor','cms:navigation.edit'),('editor','cms:settings.read'),('editor','cms:placements.read'),
  ('reviewer','cms:pages.read'),('reviewer','cms:pages.approve'),('reviewer','cms:homepage.read'),
  ('reviewer','cms:homepage.approve'),('reviewer','cms:navigation.read'),
  ('reviewer','cms:navigation.approve'),('reviewer','cms:settings.read'),('reviewer','cms:settings.approve'),
  ('reviewer','cms:placements.read'),('reviewer','cms:placements.approve')
on conflict do nothing;

create or replace function public.cms_content_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_content_type='product' and p_action in ('read','edit','publish') then 'cms:products.'||p_action
    when p_content_type='service' and p_action in ('read','edit','publish') then 'cms:services.'||p_action
    when p_content_type='industry' and p_action in ('read','edit','publish') then 'cms:industries.'||p_action
    when p_content_type='application' and p_action in ('read','edit','publish') then 'cms:applications.'||p_action
    when p_content_type='solution' and p_action in ('read','edit','publish') then 'cms:solutions.'||p_action
    when p_content_type='post' and p_action in ('read','edit','review','approve','publish') then 'cms:posts.'||p_action
    when p_content_type='page' and p_action in ('read','edit','publish') then 'cms:pages.'||p_action
    when p_content_type='homepage' and p_action in ('read','edit','publish') then 'cms:homepage.'||p_action
    when p_content_type='navigation' and p_action in ('read','edit','publish') then 'cms:navigation.'||p_action
    when p_content_type='site_settings' and p_action in ('read','edit','publish') then 'cms:settings.'||p_action
    when p_content_type='placement' and p_action in ('read','edit','publish') then 'cms:placements.'||p_action
    else null end;
$$;

create or replace function public.cms_editorial_required_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_action in ('create','save','submit','trash','preview') then public.cms_content_permission(p_content_type,'edit')
    when p_action='archive' and p_content_type in ('page','homepage','navigation','site_settings','placement')
      then public.cms_content_permission(p_content_type,'publish')
    when p_action='archive' then public.cms_content_permission(p_content_type,'edit')
    when p_action='approve' and p_content_type='post' then 'cms:posts.approve'
    when p_action='approve' and p_content_type='product' then 'cms:products.approve'
    when p_action='approve' and p_content_type='service' then 'cms:services.approve'
    when p_action='approve' and p_content_type='industry' then 'cms:industries.approve'
    when p_action='approve' and p_content_type='application' then 'cms:applications.approve'
    when p_action='approve' and p_content_type='solution' then 'cms:solutions.approve'
    when p_action='approve' and p_content_type='page' then 'cms:pages.approve'
    when p_action='approve' and p_content_type='homepage' then 'cms:homepage.approve'
    when p_action='approve' and p_content_type='navigation' then 'cms:navigation.approve'
    when p_action='approve' and p_content_type='site_settings' then 'cms:settings.approve'
    when p_action='approve' and p_content_type='placement' then 'cms:placements.approve'
    when p_action in ('schedule','publish','restore') then public.cms_content_permission(p_content_type,'publish')
    else null end;
$$;

insert into public.cms_capability_registry(
  consumer_id,content_type,schema_name,schema_version,renderer_key,preview_renderer_key,
  route_pattern,permissions,validation_contract,fixture_contract,test_contract
) values
('cms.managed-page.v1','page','CmsManagedPageContentSchema',1,'managed-page','managed-page','/:managedPath',
 '{"read":"cms:pages.read","edit":"cms:pages.edit","approve":"cms:pages.approve","publish":"cms:pages.publish"}',
 '{"blocks":["hero","rich_text","image","gallery","benefit_grid","content_grid","steps","metrics","testimonial","faq","form","cta","related_content"],"seo":true,"provenance":true,"relations":true,"retirement":true}',
 '{"kind":"synthetic-only","viewports":["mobile","tablet","desktop"]}',
 '{"contract":true,"builder":true,"preview":true,"routing":true,"retirement":true,"a11y":true,"e2e":true}'),
('cms.homepage-builder.v1','homepage','CmsHomepageContentSchema',1,'managed-page','managed-page','/',
 '{"read":"cms:homepage.read","edit":"cms:homepage.edit","approve":"cms:homepage.approve","publish":"cms:homepage.publish"}',
 '{"blocks":["hero","rich_text","image","gallery","benefit_grid","content_grid","steps","metrics","testimonial","faq","form","cta","related_content"],"seo":true,"provenance":true,"relations":true,"retirement":true}',
 '{"kind":"synthetic-only","viewports":["mobile","tablet","desktop"]}',
 '{"contract":true,"builder":true,"preview":true,"routing":true,"a11y":true,"e2e":true}'),
('cms.site-navigation.v1','navigation','CmsNavigationContentSchema',1,'site-navigation','site-navigation','/_site/navigation',
 '{"read":"cms:navigation.read","edit":"cms:navigation.edit","approve":"cms:navigation.approve","publish":"cms:navigation.publish"}',
 '{"blocks":[],"tree":true,"links":true,"locations":["header","footer"]}',
 '{"kind":"synthetic-only"}',
 '{"contract":true,"editor":true,"header":true,"mobile":true,"footer":true,"e2e":true}'),
('cms.site-settings.v1','site_settings','CmsSiteSettingsContentSchema',1,'site-settings','site-settings','/_site/settings',
 '{"read":"cms:settings.read","edit":"cms:settings.edit","approve":"cms:settings.approve","publish":"cms:settings.publish"}',
 '{"blocks":[],"company":true,"contact":true,"social":true,"cta":true}',
 '{"kind":"synthetic-only"}',
 '{"contract":true,"editor":true,"publicConsumers":true,"e2e":true}'),
('cms.site-placements.v1','placement','CmsPlacementContentSchema',1,'site-placements','site-placements','/_site/placements',
 '{"read":"cms:placements.read","edit":"cms:placements.edit","approve":"cms:placements.approve","publish":"cms:placements.publish"}',
 '{"blocks":[],"schedule":true,"priority":true,"relations":true}',
 '{"kind":"synthetic-only"}',
 '{"contract":true,"editor":true,"schedule":true,"expiry":true,"e2e":true}')
on conflict(consumer_id) do update set validation_contract=excluded.validation_contract,
  test_contract=excluded.test_contract,permissions=excluded.permissions,updated_at=now();

create unique index cms_singleton_site_document_idx on public.cms_published_projection(content_type)
where content_type in ('homepage','navigation','site_settings','placement');
create unique index cms_managed_route_unique_idx on public.cms_published_projection((payload#>>'{route,path}'))
where content_type in ('page','homepage');

create table public.cms_route_rules(
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items(id) on delete cascade,
  source_path text not null unique check(source_path ~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'),
  destination_path text check(destination_path is null or destination_path ~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'),
  status_code integer not null check(status_code in (301,302,404,410)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check((status_code in (301,302))=(destination_path is not null)),
  check(destination_path is null
    or regexp_replace(source_path,'/$','')<>regexp_replace(destination_path,'/$',''))
);

create function public.cms_public_route_exists(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  with normalized as (
    select case when p_path='/' then '/' else regexp_replace(p_path,'/$','') end as path
  )
  select normalized.path=any(array[
      '/','/sobre','/blog','/busca','/contato','/setores','/servicos','/produtos','/industrias',
      '/aplicacoes','/solucoes','/deteccao-de-gas','/politica-de-privacidade','/termos-de-uso',
      '/produtos/comparador','/biodigestor','/biodigestor/como-funciona','/biodigestor/portes',
      '/biodigestor/beneficios','/biodigestor/monitoramento','/biodigestor/biogas-biometano',
      '/biodigestor/automacao','/biodigestor/escolas'
    ])
    or exists(
      select 1 from public.cms_published_projection projection
      where case projection.content_type
        when 'product' then '/produtos/'||projection.slug
        when 'service' then '/servicos/'||projection.slug
        when 'industry' then '/industrias/'||projection.slug
        when 'application' then '/aplicacoes/'||projection.slug
        when 'solution' then '/solucoes/'||projection.slug
        when 'page' then projection.payload#>>'{route,path}'
        when 'homepage' then projection.payload#>>'{route,path}'
        else null
      end=normalized.path
    )
  from normalized;
$$;

create function public.cms_public_link_valid(p_href text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(p_href ~ '^https?://',false)
    or (coalesce(p_href ~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$',false)
      and public.cms_public_route_exists(p_href));
$$;

create function public.cms_validate_site_builder_publication()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p jsonb:=new.payload;
  route_path text;
  relation_id uuid;
  relation_key text;
  block jsonb;
  asset_id uuid;
  nav_item jsonb;
  parent_item jsonb;
  cursor_id text;
  visited text[];
  depth integer;
  placement jsonb;
begin
  if new.content_type not in ('page','homepage','navigation','site_settings','placement') then return new; end if;
  if new.content_type in ('page','homepage') then
    route_path:=p#>>'{route,path}';
    if coalesce(p->>'title','')='' or coalesce(p->>'governanceState','') not in ('synthetic_test','awaiting_owner','homologated')
       or coalesce(p#>>'{approval,businessOwner}','')='' or coalesce(p#>>'{approval,editorialReviewer}','')=''
       or coalesce(p#>>'{retirement,mode}','') not in ('not_found','gone','redirect')
       or jsonb_typeof(p->'blocks') is distinct from 'array'
       or jsonb_array_length(p->'blocks')=0 or jsonb_array_length(p->'blocks')>80
       or coalesce(new.seo->>'title','')='' or coalesce(new.seo->>'description','')='' then
      raise exception 'CMS_PAGE_SCHEMA_INVALID' using errcode='23514';
    end if;
    if route_path is null or route_path !~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'
       or route_path ~ '^/(admin|preview|relatorio-de-obra|assets|functions|cms|produtos|servicos|industrias|aplicacoes|solucoes|busca)(/|$)' then
      raise exception 'CMS_ROUTE_RESERVED_OR_INVALID' using errcode='23514';
    end if;
    if (new.content_type='homepage' and route_path<>'/')
       or (new.content_type='page' and route_path='/') then
      raise exception 'CMS_ROUTE_KIND_MISMATCH' using errcode='23514';
    end if;
    if new.seo->>'canonicalPath' is distinct from route_path then
      raise exception 'CMS_ROUTE_CANONICAL_MISMATCH' using errcode='23514';
    end if;
    if coalesce((new.seo->>'indexable')::boolean,false)
       and coalesce(p->>'governanceState','')<>'homologated' then
      raise exception 'CMS_PAGE_HOMOLOGATION_REQUIRED' using errcode='23514';
    end if;
    if coalesce(p->>'governanceState','')='homologated'
       and coalesce(p#>>'{approval,approvedAt}','')='' then
      raise exception 'CMS_PAGE_APPROVAL_REQUIRED' using errcode='23514';
    end if;
    if exists(
      select 1 from jsonb_array_elements(coalesce(p->'provenance','[]'::jsonb)) source
      where source->>'sourceKind'<>'owner_authored'
        and (coalesce(source->>'sourceSha256','') !~ '^[0-9a-f]{64}$'
          or (coalesce(source->>'sourceUrl','')='' and coalesce(source->>'sourcePath','')=''))
    ) then raise exception 'CMS_PAGE_PROVENANCE_INVALID' using errcode='23514'; end if;
    if p#>>'{retirement,mode}'='redirect'
       and (coalesce(p#>>'{retirement,destinationPath}','') !~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'
         or regexp_replace(p#>>'{retirement,destinationPath}','/$','')=regexp_replace(route_path,'/$','')
         or not public.cms_public_route_exists(p#>>'{retirement,destinationPath}')) then
      raise exception 'CMS_PAGE_RETIREMENT_INVALID' using errcode='23514';
    end if;
    for relation_key,relation_id in
      select relation_group.key,relation.value::uuid
      from jsonb_each(coalesce(p->'relations','{}'::jsonb)) relation_group(key,relation_values)
      cross join lateral jsonb_array_elements_text(relation_group.relation_values) relation(value)
    loop
      if relation_key not in ('productIds','serviceIds','industryIds','applicationIds','solutionIds')
         or not exists(
           select 1 from public.cms_published_projection x
           where x.item_id=relation_id
             and x.content_type=case relation_key
               when 'productIds' then 'product'
               when 'serviceIds' then 'service'
               when 'industryIds' then 'industry'
               when 'applicationIds' then 'application'
               when 'solutionIds' then 'solution'
             end
         ) then
        raise exception 'CMS_PAGE_ORPHAN_RELATION:%',relation_id using errcode='23514';
      end if;
    end loop;
    for block in select value from jsonb_array_elements(coalesce(p->'blocks','[]'::jsonb)) loop
      if coalesce(block->>'type','') not in ('hero','rich_text','image','gallery','benefit_grid','content_grid','steps','metrics','testimonial','faq','form','cta','related_content')
         or coalesce(block->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(block->>'width','') not in ('content','wide','full')
         or coalesce(block->>'tone','') not in ('light','muted','dark','brand')
         or jsonb_typeof(block->'data') is distinct from 'object' then
        raise exception 'CMS_PAGE_BLOCK_INVALID' using errcode='23514';
      end if;
      if (block->>'type'='hero' and (coalesce(block#>>'{data,title}','')='' or coalesce(block#>>'{data,alignment}','') not in ('left','center')
           or (block#>>'{data,assetId}' is not null and coalesce(block#>>'{data,alt}','')='')
           or (block#>>'{data,primaryCta,href}' is not null and not public.cms_public_link_valid(block#>>'{data,primaryCta,href}'))
           or (block#>>'{data,secondaryCta,href}' is not null and not public.cms_public_link_valid(block#>>'{data,secondaryCta,href}'))))
         or (block->>'type'='rich_text' and coalesce(block#>>'{data,text}','')='')
         or (block->>'type'='image' and (coalesce(block#>>'{data,assetId}','')='' or coalesce(block#>>'{data,alt}','')=''))
         or (block->>'type'='gallery' and (jsonb_typeof(block#>'{data,assetIds}') is distinct from 'array' or jsonb_array_length(block#>'{data,assetIds}')=0))
         or (block->>'type' in ('benefit_grid','content_grid','steps','faq') and (coalesce(block#>>'{data,heading}','')='' or jsonb_typeof(block#>'{data,items}') is distinct from 'array' or jsonb_array_length(block#>'{data,items}')=0))
         or (block->>'type'='content_grid' and exists(
           select 1 from jsonb_array_elements(block#>'{data,items}') grid_item
           where grid_item->>'href' is not null and not public.cms_public_link_valid(grid_item->>'href')))
         or (block->>'type'='metrics' and (jsonb_typeof(block#>'{data,items}') is distinct from 'array' or jsonb_array_length(block#>'{data,items}')=0))
         or (block->>'type'='testimonial' and (coalesce(block#>>'{data,quote}','')='' or coalesce(block#>>'{data,author}','')=''))
         or (block->>'type'='form' and (coalesce(block#>>'{data,heading}','')='' or coalesce(block#>>'{data,formKey}','') not in ('contact','newsletter','lead') or coalesce(block#>>'{data,buttonLabel}','')=''))
         or (block->>'type'='cta' and (coalesce(block#>>'{data,heading}','')='' or coalesce(block#>>'{data,link,label}','')='' or not public.cms_public_link_valid(block#>>'{data,link,href}')))
         or (block->>'type'='related_content' and (coalesce(block#>>'{data,heading}','')='' or jsonb_typeof(block#>'{data,itemIds}') is distinct from 'array' or jsonb_array_length(block#>'{data,itemIds}')=0)) then
        raise exception 'CMS_PAGE_BLOCK_INVALID:%',block->>'type' using errcode='23514';
      end if;
      if block->>'type'='related_content' then
        for relation_id in select related.value::uuid from jsonb_array_elements_text(block#>'{data,itemIds}') related(value)
        loop
          if not exists(select 1 from public.cms_published_projection x where x.item_id=relation_id) then
            raise exception 'CMS_PAGE_ORPHAN_RELATION:%',relation_id using errcode='23514';
          end if;
        end loop;
      end if;
      for asset_id in
        select asset.value::uuid from jsonb_array_elements_text(
          case when block->>'type'='gallery' then coalesce(block#>'{data,assetIds}','[]'::jsonb)
               when block#>>'{data,assetId}' is not null then jsonb_build_array(block#>>'{data,assetId}')
               else '[]'::jsonb end) asset(value)
        union
        select (item->>'assetId')::uuid from jsonb_array_elements(coalesce(block#>'{data,items}','[]'::jsonb)) item
        where item->>'assetId' is not null
      loop
        if not exists(select 1 from public.cms_media_assets m where m.id=asset_id and m.processing_status='ready' and m.rights_confirmed) then
          raise exception 'CMS_MEDIA_NOT_READY:%',asset_id using errcode='23514';
        end if;
      end loop;
    end loop;
    if new.seo->>'ogImageId' is not null
       and not exists(select 1 from public.cms_media_assets m
         where m.id=(new.seo->>'ogImageId')::uuid and m.processing_status='ready' and m.rights_confirmed) then
      raise exception 'CMS_MEDIA_NOT_READY:%',new.seo->>'ogImageId' using errcode='23514';
    end if;
  elsif new.content_type='navigation' then
    if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items')>200 then
      raise exception 'CMS_NAVIGATION_INVALID' using errcode='23514';
    end if;
    if (select count(*) from jsonb_array_elements(p->'items')) <>
       (select count(distinct value->>'id') from jsonb_array_elements(p->'items')) then
      raise exception 'CMS_NAVIGATION_DUPLICATE_ID' using errcode='23514';
    end if;
    for nav_item in select value from jsonb_array_elements(p->'items') loop
      if coalesce(nav_item->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(nav_item->>'label','')=''
         or coalesce(nav_item->>'location','') not in ('header','footer')
         or not public.cms_public_link_valid(nav_item->>'href') then
        raise exception 'CMS_NAVIGATION_ITEM_INVALID' using errcode='23514';
      end if;
      cursor_id:=nullif(nav_item->>'parentId','');
      visited:=array[nav_item->>'id'];
      depth:=0;
      while cursor_id is not null loop
        if cursor_id=any(visited) then
          raise exception 'CMS_NAVIGATION_CYCLE' using errcode='23514';
        end if;
        select value into parent_item from jsonb_array_elements(p->'items') where value->>'id'=cursor_id;
        if parent_item is null then raise exception 'CMS_NAVIGATION_PARENT_NOT_FOUND' using errcode='23514'; end if;
        if parent_item->>'location'<>nav_item->>'location' then
          raise exception 'CMS_NAVIGATION_LOCATION_MISMATCH' using errcode='23514';
        end if;
        visited:=array_append(visited,cursor_id);
        depth:=depth+1;
        if depth>2 then raise exception 'CMS_NAVIGATION_DEPTH_EXCEEDED' using errcode='23514'; end if;
        cursor_id:=nullif(parent_item->>'parentId','');
        parent_item:=null;
      end loop;
    end loop;
  elsif new.content_type='site_settings' then
    if coalesce(p#>>'{company,name}','')='' or coalesce(p#>>'{company,email}','')=''
       or jsonb_typeof(p#>'{company,phone}') is distinct from 'string'
       or jsonb_typeof(p#>'{company,whatsapp}') is distinct from 'string'
       or jsonb_typeof(p#>'{company,address}') is distinct from 'string'
       or p#>>'{company,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or not public.cms_public_link_valid(p#>>'{defaultCta,href}')
       or jsonb_typeof(p->'socialLinks') is distinct from 'array'
       or exists(select 1 from jsonb_array_elements(p->'socialLinks') social
         where coalesce(social->>'network','')='' or coalesce(social->>'url','') !~ '^https?://') then
      raise exception 'CMS_SITE_SETTINGS_INVALID' using errcode='23514';
    end if;
  elsif new.content_type='placement' then
    if jsonb_typeof(p->'placements') is distinct from 'array' or jsonb_array_length(p->'placements')>100 then
      raise exception 'CMS_PLACEMENTS_INVALID' using errcode='23514';
    end if;
    for placement in select value from jsonb_array_elements(p->'placements') loop
      if coalesce(placement->>'slot','') not in ('home_hero','home_featured','catalog_featured','global_announcement')
         or coalesce(placement->>'targetType','') not in ('product','service','industry','application','solution','page')
         or (placement->>'startsAt')::timestamptz >= (placement->>'endsAt')::timestamptz then
        raise exception 'CMS_PLACEMENT_ITEM_INVALID' using errcode='23514';
      end if;
      if coalesce((placement->>'enabled')::boolean,false)
         and not exists(select 1 from public.cms_published_projection target
           where target.item_id=(placement->>'targetId')::uuid
             and target.content_type=placement->>'targetType') then
        raise exception 'CMS_PLACEMENT_TARGET_NOT_PUBLISHED:%',placement->>'targetId' using errcode='23514';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger cms_site_builder_validate before insert or update of payload,seo on public.cms_published_projection
for each row execute function public.cms_validate_site_builder_publication();

create function public.cms_sync_site_builder_projection()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare block jsonb; asset_id uuid; route_path text;
begin
  if new.content_type not in ('page','homepage') then return new; end if;
  route_path:=new.payload#>>'{route,path}';
  delete from public.cms_route_rules where source_path=route_path;
  for block in select value from jsonb_array_elements(coalesce(new.payload->'blocks','[]'::jsonb)) loop
    for asset_id in
      select asset.value::uuid from jsonb_array_elements_text(
        case when block->>'type'='gallery' then coalesce(block#>'{data,assetIds}','[]'::jsonb)
             when block#>>'{data,assetId}' is not null then jsonb_build_array(block#>>'{data,assetId}')
             else '[]'::jsonb end) asset(value)
      union
      select (item->>'assetId')::uuid from jsonb_array_elements(coalesce(block#>'{data,items}','[]'::jsonb)) item
      where item->>'assetId' is not null
    loop
      insert into public.cms_media_usages(asset_id,item_id,revision_id,block_id,usage_kind)
      values(asset_id,new.item_id,new.revision_id,(block->>'id')::uuid,'content') on conflict do nothing;
    end loop;
  end loop;
  if new.seo->>'ogImageId' is not null then
    insert into public.cms_media_usages(asset_id,item_id,revision_id,usage_kind)
    values((new.seo->>'ogImageId')::uuid,new.item_id,new.revision_id,'seo') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger cms_site_builder_sync after insert or update of payload,revision_id on public.cms_published_projection
for each row execute function public.cms_sync_site_builder_projection();

create function public.cms_unpublish_archived_site_content()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare published public.cms_published_projection%rowtype; retirement jsonb; route_path text; code integer; destination text;
begin
  if new.workflow_status not in ('archived','trashed') or old.workflow_status=new.workflow_status
     or new.content_type not in ('page','homepage','navigation','site_settings','placement') then return new; end if;
  select * into published from public.cms_published_projection where item_id=new.id;
  if not found then return new; end if;
  if new.content_type in ('page','homepage') then
    route_path:=published.payload#>>'{route,path}';
    select draft.payload->'retirement' into retirement
    from public.cms_content_drafts draft where draft.item_id=new.id;
    retirement:=coalesce(retirement,published.payload->'retirement');
    code:=case retirement->>'mode' when 'redirect' then 301 when 'gone' then 410 else 404 end;
    destination:=case when code in (301,302) then retirement->>'destinationPath' else null end;
    insert into public.cms_route_rules(item_id,source_path,destination_path,status_code)
    values(new.id,route_path,destination,code)
    on conflict(source_path) do update set item_id=excluded.item_id,destination_path=excluded.destination_path,
      status_code=excluded.status_code,active=true,created_at=now();
  end if;
  insert into public.cms_publication_outbox(item_id,revision_id,event_type,correlation_id)
  values(new.id,published.revision_id,'unpublish',gen_random_uuid()) on conflict do nothing;
  delete from public.cms_published_projection where item_id=new.id;
  return new;
end $$;
create trigger cms_site_builder_unpublish after update of workflow_status on public.cms_content_items
for each row execute function public.cms_unpublish_archived_site_content();

create function public.cms_reopen_site_builder(
  p_actor_id uuid,p_item_id uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_idempotency_key uuid,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.cms_content_items%rowtype; result jsonb; permission text;
begin
  select * into item from public.cms_content_items where id=p_item_id for update;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode='P0002'; end if;
  permission:=public.cms_content_permission(item.content_type,'edit');
  if item.content_type not in ('page','homepage','navigation','site_settings','placement')
     or permission is null
     or not public.cms_actor_authorized(p_actor_id,permission,p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  select response into result from public.cms_editorial_command_receipts
  where actor_id=p_actor_id and action='reopen' and idempotency_key=p_idempotency_key;
  if found and result is not null then return result; end if;
  if item.workflow_status<>'published'
     or not exists(select 1 from public.cms_published_projection projection where projection.item_id=item.id) then
    raise exception 'CMS_TRANSITION_INVALID' using errcode='23514';
  end if;
  insert into public.cms_editorial_command_receipts(actor_id,action,idempotency_key,item_id,correlation_id)
  values(p_actor_id,'reopen',p_idempotency_key,item.id,p_correlation_id) on conflict do nothing;
  update public.cms_content_items set workflow_status='draft',updated_by=p_actor_id,updated_at=now()
  where id=item.id;
  result:=jsonb_build_object('itemId',item.id,'status','draft','liveProjectionPreserved',true);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:content.reopen','content_item',item.id::text,
    jsonb_build_object('reason',p_reason,'liveProjectionPreserved',true),p_correlation_id);
  update public.cms_editorial_command_receipts set response=result
  where actor_id=p_actor_id and action='reopen' and idempotency_key=p_idempotency_key;
  return result;
end $$;

create function public.cms_hard_delete_draft(
  p_actor_id uuid,p_item_id uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_idempotency_key uuid,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.cms_content_items%rowtype; result jsonb;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:content.hard_delete',p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  select response into result from public.cms_editorial_command_receipts
  where actor_id=p_actor_id and action='hard_delete' and idempotency_key=p_idempotency_key;
  if found and result is not null then return result; end if;
  insert into public.cms_editorial_command_receipts(actor_id,action,idempotency_key,correlation_id)
  values(p_actor_id,'hard_delete',p_idempotency_key,p_correlation_id) on conflict do nothing;
  select * into item from public.cms_content_items where id=p_item_id for update;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode='P0002'; end if;
  if item.workflow_status not in ('draft','trashed')
     or exists(select 1 from public.cms_content_revisions where item_id=item.id)
     or exists(select 1 from public.cms_publications where item_id=item.id) then
    raise exception 'CMS_HARD_DELETE_NOT_ALLOWED' using errcode='23514';
  end if;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:content.hard_delete','content_item',item.id::text,
    jsonb_build_object('contentType',item.content_type,'slug',item.slug,'reason',p_reason),p_correlation_id);
  delete from public.cms_media_usages usage where usage.item_id=item.id;
  delete from public.cms_content_taxonomy taxonomy where taxonomy.item_id=item.id;
  delete from public.cms_content_drafts draft where draft.item_id=item.id;
  update public.cms_editorial_command_receipts receipt set item_id=null where receipt.item_id=item.id;
  delete from public.cms_content_items where id=item.id;
  result:=jsonb_build_object('itemId',item.id,'status','deleted');
  update public.cms_editorial_command_receipts set response=result
  where actor_id=p_actor_id and action='hard_delete' and idempotency_key=p_idempotency_key;
  return result;
end $$;

create function public.cms_retire_managed_page(
  p_actor_id uuid,p_item_id uuid,p_slug text,p_payload jsonb,p_expected_lock_version bigint,p_reason text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_idempotency_key uuid,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.cms_content_items%rowtype; draft public.cms_content_drafts%rowtype; result jsonb;
begin
  select * into item from public.cms_content_items where id=p_item_id for update;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode='P0002'; end if;
  if item.content_type not in ('page','homepage')
     or not public.cms_actor_authorized(p_actor_id,public.cms_content_permission(item.content_type,'publish'),
       p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  select response into result from public.cms_editorial_command_receipts
  where actor_id=p_actor_id and action='retire' and idempotency_key=p_idempotency_key;
  if found and result is not null then return result; end if;
  if item.workflow_status<>'published'
     or not exists(select 1 from public.cms_published_projection projection where projection.item_id=item.id) then
    raise exception 'CMS_TRANSITION_INVALID' using errcode='23514';
  end if;
  select * into draft from public.cms_content_drafts where item_id=item.id for update;
  if draft.lock_version<>p_expected_lock_version then
    raise exception 'CMS_CONTENT_CONFLICT' using errcode='40001';
  end if;
  perform public.cms_validate_registered_content(item.content_type,draft.schema_version,p_payload);
  if coalesce(p_payload#>>'{retirement,mode}','') not in ('not_found','gone','redirect')
     or (p_payload#>>'{retirement,mode}'='redirect'
       and (coalesce(p_payload#>>'{retirement,destinationPath}','') !~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'
         or regexp_replace(p_payload#>>'{retirement,destinationPath}','/$','')=
           regexp_replace(p_payload#>>'{route,path}','/$','')
         or not public.cms_public_route_exists(p_payload#>>'{retirement,destinationPath}'))) then
    raise exception 'CMS_PAGE_RETIREMENT_INVALID' using errcode='23514';
  end if;
  insert into public.cms_editorial_command_receipts(actor_id,action,idempotency_key,item_id,correlation_id)
  values(p_actor_id,'retire',p_idempotency_key,item.id,p_correlation_id) on conflict do nothing;
  update public.cms_content_drafts set payload=p_payload,seo=p_payload->'seo',provenance=p_payload->'provenance',
    lock_version=lock_version+1,updated_by=p_actor_id,updated_at=now() where item_id=item.id;
  update public.cms_content_items set slug=coalesce(nullif(p_slug,''),slug),workflow_status='archived',
    archived_at=now(),scheduled_for=null,updated_by=p_actor_id where id=item.id;
  result:=jsonb_build_object('itemId',item.id,'status','archived','retirement',p_payload->'retirement');
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:content.retire','content_item',item.id::text,
    jsonb_build_object('reason',p_reason,'retirement',p_payload->'retirement'),p_correlation_id);
  update public.cms_editorial_command_receipts set response=result
  where actor_id=p_actor_id and action='retire' and idempotency_key=p_idempotency_key;
  return result;
end $$;

alter table public.cms_route_rules enable row level security;
create policy cms_route_rules_public on public.cms_route_rules for select to anon,authenticated using(active);
revoke all on public.cms_route_rules from public,anon,authenticated;
grant select on public.cms_route_rules to anon,authenticated;
grant all on public.cms_route_rules to service_role;

revoke all on function public.cms_public_route_exists(text),public.cms_public_link_valid(text),
  public.cms_validate_site_builder_publication(),public.cms_sync_site_builder_projection(),
  public.cms_unpublish_archived_site_content(),
  public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid),
  public.cms_retire_managed_page(uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid),
  public.cms_hard_delete_draft(uuid,uuid,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid) to service_role;
grant execute on function public.cms_retire_managed_page(uuid,uuid,text,jsonb,bigint,text,text,text,timestamptz,uuid,uuid) to service_role;
grant execute on function public.cms_hard_delete_draft(uuid,uuid,text,text,text,timestamptz,uuid,uuid) to service_role;
