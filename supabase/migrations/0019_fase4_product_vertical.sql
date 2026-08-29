-- Fase 4 — produto piloto vertical. Estrutura e projeções começam vazias.
-- Nenhum produto, taxonomia, mídia, documento ou redirect real é inserido.

insert into public.cms_permissions(permission_key, description, critical) values
  ('cms:products.approve', 'Aprovar revisão técnica/comercial de produto.', false)
on conflict (permission_key) do nothing;
insert into public.cms_role_permissions(role_key, permission_key) values
  ('super_admin', 'cms:products.approve'), ('reviewer', 'cms:products.approve')
on conflict do nothing;

create or replace function public.cms_editorial_required_permission(p_content_type text, p_action text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_action in ('create', 'save', 'submit', 'archive', 'trash', 'preview')
      then public.cms_content_permission(p_content_type, 'edit')
    when p_action = 'approve' and p_content_type = 'post' then 'cms:posts.approve'
    when p_action = 'approve' and p_content_type = 'product' then 'cms:products.approve'
    when p_action in ('schedule', 'publish', 'restore')
      then public.cms_content_permission(p_content_type, 'publish')
    else null
  end;
$$;

alter table public.cms_taxonomy_terms drop constraint if exists cms_taxonomy_terms_taxonomy_type_check;
alter table public.cms_taxonomy_terms add constraint cms_taxonomy_terms_taxonomy_type_check
  check (taxonomy_type in ('segment', 'category', 'subcategory', 'family', 'tag'));

create or replace function public.cms_validate_taxonomy_parent()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare parent_type text;
begin
  if new.taxonomy_type in ('segment', 'tag') then
    if new.parent_id is not null then raise exception 'CMS_TAXONOMY_PARENT_INVALID' using errcode = '23514'; end if;
    return new;
  end if;
  if new.parent_id is null then raise exception 'CMS_TAXONOMY_PARENT_REQUIRED' using errcode = '23514'; end if;
  select taxonomy_type into parent_type from public.cms_taxonomy_terms where id = new.parent_id;
  if parent_type is null
     or (new.taxonomy_type = 'category' and parent_type <> 'segment')
     or (new.taxonomy_type = 'subcategory' and parent_type <> 'category')
     or (new.taxonomy_type = 'family' and parent_type not in ('category', 'subcategory')) then
    raise exception 'CMS_TAXONOMY_PARENT_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.cms_product_manufacturers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  official_url text check (official_url is null or official_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'array' and jsonb_array_length(provenance) > 0),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.cms_product_lines (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.cms_product_manufacturers(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (manufacturer_id, slug)
);

create table public.cms_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  category_term_id uuid not null references public.cms_taxonomy_terms(id) on delete restrict,
  attribute_key text not null check (attribute_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  data_type text not null check (data_type in ('text', 'number', 'boolean', 'enum', 'range')),
  unit text check (unit is null or char_length(unit) <= 40),
  enum_options jsonb not null default '[]'::jsonb check (jsonb_typeof(enum_options) = 'array'),
  required boolean not null default false,
  filterable boolean not null default false,
  comparable boolean not null default false,
  searchable boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 999),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (category_term_id, attribute_key)
);

create table public.cms_product_projection (
  item_id uuid primary key references public.cms_published_projection(item_id) on delete cascade,
  revision_id uuid not null,
  slug text not null unique,
  pilot_state text not null check (pilot_state in ('synthetic_test', 'awaiting_owner', 'homologated')),
  title text not null,
  manufacturer_name text not null,
  manufacturer_slug text not null,
  product_line_name text not null,
  product_line_slug text not null,
  segment text not null,
  category text not null,
  subcategory text,
  family text not null,
  primary_model text not null,
  technology text not null,
  short_description text not null,
  card_attributes jsonb not null check (jsonb_typeof(card_attributes) = 'array'),
  filter_facets jsonb not null check (jsonb_typeof(filter_facets) = 'object'),
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple', search_text)) stored,
  content_version bigint not null,
  published_at timestamptz not null
);

create table public.cms_product_variant_projection (
  id uuid primary key,
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  model_id uuid not null,
  model_name text not null,
  sku text not null,
  variant_name text not null,
  variant_code text not null,
  status text not null check (status in ('active', 'discontinued')),
  display_order integer not null check (display_order between 0 and 999),
  unique (item_id, variant_code)
);

create table public.cms_product_attribute_projection (
  id uuid primary key,
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  attribute_key text not null,
  label text not null,
  data_type text not null check (data_type in ('text', 'number', 'boolean', 'enum', 'range')),
  value_json jsonb not null,
  unit text,
  filterable boolean not null,
  comparable boolean not null,
  searchable boolean not null,
  unique (item_id, attribute_key)
);

create table public.cms_product_document_projection (
  id uuid primary key,
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  kind text not null,
  title text not null,
  official_url text not null check (official_url ~ '^https://'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  revision text not null,
  language text not null,
  visibility text not null check (visibility in ('public', 'private')),
  rights_confirmed boolean not null check (rights_confirmed)
);

create table public.cms_product_relation_projection (
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  relation_type text not null check (relation_type in ('product', 'application', 'sector', 'service')),
  target_id uuid not null,
  primary key (item_id, relation_type, target_id)
);

create table public.cms_product_search_term_projection (
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  term text not null check (char_length(btrim(term)) between 1 and 120),
  term_type text not null check (term_type in ('synonym', 'keyword')),
  primary key (item_id, term, term_type)
);

create table public.cms_redirects (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_product_projection(item_id) on delete cascade,
  source_path text not null unique check (source_path ~ '^/[a-z0-9/_-]+$'),
  destination_path text not null check (destination_path ~ '^/produtos/[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status_code integer not null check (status_code in (301, 302)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (source_path <> destination_path)
);

create index cms_product_projection_search_idx on public.cms_product_projection using gin(search_document);
create index cms_product_projection_facets_idx on public.cms_product_projection using gin(filter_facets);
create index cms_product_projection_classification_idx on public.cms_product_projection(segment, category, family);
create index cms_product_variant_item_idx on public.cms_product_variant_projection(item_id, display_order);
create index cms_product_attribute_item_idx on public.cms_product_attribute_projection(item_id, attribute_key);

create function public.cms_sync_product_projection()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare p jsonb := new.payload; model jsonb; variant jsonb; spec jsonb; doc jsonb; relation_type text; target jsonb; term text;
begin
  if new.content_type <> 'product' then return new; end if;
  if p ->> 'consumerId' <> 'cms.catalog-product.v1'
     or jsonb_typeof(p -> 'models') <> 'array' or jsonb_array_length(p -> 'models') = 0
     or jsonb_typeof(p -> 'specifications') <> 'array' or jsonb_array_length(p -> 'specifications') = 0
     or nullif(p #>> '{manufacturer,name}', '') is null
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
    item_id, revision_id, slug, pilot_state, title, manufacturer_name, manufacturer_slug,
    product_line_name, product_line_slug, segment, category, subcategory, family, primary_model,
    technology, short_description, card_attributes, filter_facets, search_text, content_version, published_at
  ) values (
    new.item_id, new.revision_id, new.slug, p ->> 'pilotState', p ->> 'title', p #>> '{manufacturer,name}', p #>> '{manufacturer,slug}',
    p #>> '{productLine,name}', p #>> '{productLine,slug}', p #>> '{classification,segment}', p #>> '{classification,category}',
    nullif(p #>> '{classification,subcategory}', ''), p #>> '{classification,family}', p #>> '{models,0,model}',
    p ->> 'technology', p #>> '{commercial,shortDescription}',
    (select coalesce(jsonb_agg(s), '[]'::jsonb) from (select value as s from jsonb_array_elements(p -> 'specifications') value where coalesce((value ->> 'comparable')::boolean, false) limit 3) q),
    jsonb_build_object('segment', p #>> '{classification,segment}', 'category', p #>> '{classification,category}',
      'family', p #>> '{classification,family}', 'technology', p ->> 'technology'),
    concat_ws(' ', p ->> 'title', p #>> '{manufacturer,name}', p #>> '{productLine,name}', p #>> '{models,0,model}',
      p #>> '{classification,segment}', p #>> '{classification,category}', p #>> '{classification,family}', p ->> 'technology',
      (select string_agg(value #>> '{}', ' ') from jsonb_array_elements(coalesce(p #> '{search,synonyms}', '[]'::jsonb))),
      (select string_agg(value #>> '{}', ' ') from jsonb_array_elements(coalesce(p #> '{search,keywords}', '[]'::jsonb)))),
    new.content_version, new.published_at
  ) on conflict (item_id) do update set revision_id=excluded.revision_id, slug=excluded.slug, pilot_state=excluded.pilot_state,
    title=excluded.title, manufacturer_name=excluded.manufacturer_name, manufacturer_slug=excluded.manufacturer_slug,
    product_line_name=excluded.product_line_name, product_line_slug=excluded.product_line_slug, segment=excluded.segment,
    category=excluded.category, subcategory=excluded.subcategory, family=excluded.family, primary_model=excluded.primary_model,
    technology=excluded.technology, short_description=excluded.short_description, card_attributes=excluded.card_attributes,
    filter_facets=excluded.filter_facets, search_text=excluded.search_text, content_version=excluded.content_version, published_at=excluded.published_at;

  delete from public.cms_product_variant_projection where item_id = new.item_id;
  delete from public.cms_product_attribute_projection where item_id = new.item_id;
  delete from public.cms_product_document_projection where item_id = new.item_id;
  delete from public.cms_product_relation_projection where item_id = new.item_id;
  delete from public.cms_product_search_term_projection where item_id = new.item_id;
  delete from public.cms_redirects where item_id = new.item_id;

  for model in select value from jsonb_array_elements(p -> 'models') loop
    for variant in select value from jsonb_array_elements(model -> 'variants') loop
      insert into public.cms_product_variant_projection values ((variant ->> 'id')::uuid, new.item_id, (model ->> 'id')::uuid,
        model ->> 'model', model ->> 'sku', variant ->> 'name', variant ->> 'code', model ->> 'status', (variant ->> 'order')::integer);
    end loop;
  end loop;
  for spec in select value from jsonb_array_elements(p -> 'specifications') loop
    insert into public.cms_product_attribute_projection values ((spec ->> 'id')::uuid, new.item_id, spec ->> 'key', spec ->> 'label',
      spec ->> 'type', spec -> 'value', nullif(spec ->> 'unit', ''), (spec ->> 'filterable')::boolean,
      (spec ->> 'comparable')::boolean, (spec ->> 'searchable')::boolean);
  end loop;
  for doc in select value from jsonb_array_elements(coalesce(p -> 'documents', '[]'::jsonb)) loop
    insert into public.cms_product_document_projection values ((doc ->> 'id')::uuid, new.item_id, doc ->> 'kind', doc ->> 'title',
      doc ->> 'officialUrl', doc ->> 'sha256', doc ->> 'revision', doc ->> 'language', doc ->> 'visibility', (doc ->> 'rightsConfirmed')::boolean);
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

create trigger cms_projection_sync_product after insert or update on public.cms_published_projection
for each row execute function public.cms_sync_product_projection();

insert into public.cms_capability_registry (
  consumer_id, content_type, schema_name, schema_version, renderer_key, preview_renderer_key,
  route_pattern, permissions, validation_contract, fixture_contract, test_contract
) values (
  'cms.catalog-product.v1', 'product', 'CmsProductContentSchema', 1, 'catalog-product', 'catalog-product', '/produtos/:slug',
  '{"read":"cms:products.read","edit":"cms:products.edit","technical":"cms:products.technical","publish":"cms:products.publish"}',
  '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"typedAttributes":true,"variants":true,"media":true,"documents":true,"relations":true,"search":true,"seo":true,"provenance":true}',
  '{"kind":"synthetic-or-owner-approved","viewports":["mobile","tablet","desktop"]}',
  '{"contract":true,"renderer":true,"preview":true,"permissions":true,"list":true,"detail":true,"filters":true,"compare":true,"search":true,"seo":true,"e2e":true}'
);

alter table public.cms_product_manufacturers enable row level security;
alter table public.cms_product_lines enable row level security;
alter table public.cms_attribute_definitions enable row level security;
alter table public.cms_product_projection enable row level security;
alter table public.cms_product_variant_projection enable row level security;
alter table public.cms_product_attribute_projection enable row level security;
alter table public.cms_product_document_projection enable row level security;
alter table public.cms_product_relation_projection enable row level security;
alter table public.cms_product_search_term_projection enable row level security;
alter table public.cms_redirects enable row level security;

create policy cms_product_reference_read on public.cms_product_manufacturers for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_lines_read on public.cms_product_lines for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_attribute_definitions_read on public.cms_attribute_definitions for select to authenticated using (public.cms_has_permission('cms:taxonomy.read'));
create policy cms_product_projection_public on public.cms_product_projection for select to anon, authenticated using (true);
create policy cms_product_variants_public on public.cms_product_variant_projection for select to anon, authenticated using (true);
create policy cms_product_attributes_public on public.cms_product_attribute_projection for select to anon, authenticated using (true);
create policy cms_product_documents_public on public.cms_product_document_projection for select to anon, authenticated using (visibility = 'public');
create policy cms_product_relations_public on public.cms_product_relation_projection for select to anon, authenticated using (true);
create policy cms_product_search_terms_public on public.cms_product_search_term_projection for select to anon, authenticated using (true);
create policy cms_redirects_public on public.cms_redirects for select to anon, authenticated using (active);

revoke all on table public.cms_product_manufacturers, public.cms_product_lines, public.cms_attribute_definitions,
  public.cms_product_projection, public.cms_product_variant_projection, public.cms_product_attribute_projection,
  public.cms_product_document_projection, public.cms_product_relation_projection, public.cms_product_search_term_projection,
  public.cms_redirects from public, anon, authenticated;
grant select on table public.cms_product_manufacturers, public.cms_product_lines, public.cms_attribute_definitions to authenticated;
grant select on table public.cms_product_projection, public.cms_product_variant_projection, public.cms_product_attribute_projection,
  public.cms_product_document_projection, public.cms_product_relation_projection, public.cms_product_search_term_projection,
  public.cms_redirects to anon, authenticated;
grant all on table public.cms_product_manufacturers, public.cms_product_lines, public.cms_attribute_definitions,
  public.cms_product_projection, public.cms_product_variant_projection, public.cms_product_attribute_projection,
  public.cms_product_document_projection, public.cms_product_relation_projection, public.cms_product_search_term_projection,
  public.cms_redirects to service_role;
revoke all on function public.cms_sync_product_projection() from public, anon, authenticated;
