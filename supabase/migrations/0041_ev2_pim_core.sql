-- EV2.4 — PIM shadow: produto, modelo, variante, SKU, atributos e proveniência.
-- A migration é aditiva, default-off e não altera conteúdo/projeções v1.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:pim.read', 'Consultar o PIM normalizado EV2.', false),
  ('cms:pim.manage', 'Manter produto, modelo, variante e SKU no PIM EV2.', false),
  ('cms:pim.archive', 'Arquivar identidades comerciais do PIM EV2.', true),
  ('cms:attributes.read', 'Consultar atributos e unidades do PIM EV2.', false),
  ('cms:attributes.manage', 'Manter atributos e unidades do PIM EV2.', false)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:pim.read'), ('super_admin', 'cms:pim.manage'), ('super_admin', 'cms:pim.archive'),
  ('super_admin', 'cms:attributes.read'), ('super_admin', 'cms:attributes.manage'),
  ('admin', 'cms:pim.read'), ('admin', 'cms:pim.manage'), ('admin', 'cms:pim.archive'),
  ('admin', 'cms:attributes.read'), ('admin', 'cms:attributes.manage'),
  ('technical', 'cms:pim.read'), ('technical', 'cms:pim.manage'),
  ('technical', 'cms:attributes.read'), ('technical', 'cms:attributes.manage'),
  ('editor', 'cms:pim.read'), ('editor', 'cms:pim.manage'), ('editor', 'cms:attributes.read'),
  ('commercial', 'cms:pim.read'), ('commercial', 'cms:pim.manage'), ('commercial', 'cms:attributes.read'),
  ('reviewer', 'cms:pim.read'), ('reviewer', 'cms:attributes.read')
on conflict do nothing;

create sequence public.cms_pim_sku_sequence start with 1 increment by 1 no cycle;

create table public.cms_pim_products (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  content_item_id uuid references public.cms_content_items (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  normalized_name text not null check (char_length(normalized_name) between 1 and 180),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text not null default '' check (char_length(summary) <= 500),
  value_proposition text not null default '' check (char_length(value_proposition) <= 500),
  manufacturer_id uuid not null references public.cms_master_entities (id) on delete restrict,
  brand_id uuid references public.cms_master_entities (id) on delete restrict,
  line_id uuid references public.cms_master_entities (id) on delete restrict,
  category_id uuid not null references public.cms_master_entities (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cms_pim_products_slug_active_uidx
  on public.cms_pim_products (site_key, slug) where status <> 'archived';
create unique index cms_pim_products_content_item_uidx
  on public.cms_pim_products (content_item_id) where content_item_id is not null;
create index cms_pim_products_lookup_idx
  on public.cms_pim_products (site_key, status, normalized_name);

create table public.cms_pim_product_master_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  dimension text not null check (dimension in ('magnitude', 'technology', 'installation', 'monitored_element')),
  entity_id uuid not null references public.cms_master_entities (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and effective_to is null)
    or (status = 'inactive' and effective_to is not null and effective_to >= effective_from)
  ),
  unique (product_id, dimension, entity_id)
);

create index cms_pim_product_master_links_lookup_idx
  on public.cms_pim_product_master_links (product_id, dimension, status);

create table public.cms_pim_models (
  id uuid primary key,
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  site_key text not null default 'main' check (site_key = 'main'),
  manufacturer_id uuid not null references public.cms_master_entities (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  normalized_name text not null check (char_length(normalized_name) between 1 and 160),
  mpn text check (mpn is null or char_length(btrim(mpn)) between 1 and 160),
  normalized_mpn text,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  is_primary boolean not null default false,
  position integer not null default 0 check (position between 0 and 999),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cms_pim_models_name_active_uidx
  on public.cms_pim_models (product_id, normalized_name) where status = 'active';
create unique index cms_pim_models_mpn_active_uidx
  on public.cms_pim_models (site_key, manufacturer_id, normalized_mpn)
  where normalized_mpn is not null and status = 'active';
create unique index cms_pim_models_primary_active_uidx
  on public.cms_pim_models (product_id) where is_primary and status = 'active';
create index cms_pim_models_product_idx on public.cms_pim_models (product_id, position);

create table public.cms_pim_variants (
  id uuid primary key,
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  model_id uuid not null references public.cms_pim_models (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  code text check (code is null or char_length(btrim(code)) between 1 and 120),
  axes jsonb not null default '[]'::jsonb check (jsonb_typeof(axes) = 'array' and jsonb_array_length(axes) between 1 and 12),
  axis_signature text generated always as (md5(axes::text)) stored,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  position integer not null default 0 check (position between 0 and 999),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, axis_signature)
);

create index cms_pim_variants_model_idx on public.cms_pim_variants (model_id, status, position);

create table public.cms_pim_skus (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  model_id uuid not null references public.cms_pim_models (id) on delete restrict,
  variant_id uuid references public.cms_pim_variants (id) on delete restrict,
  sku text not null check (sku ~ '^GAI-[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'retired')),
  retired_at timestamptz,
  retirement_reason text check (retirement_reason is null or char_length(retirement_reason) between 3 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and retired_at is null) or (status = 'retired' and retired_at is not null))
);

create unique index cms_pim_skus_code_uidx on public.cms_pim_skus (site_key, sku);
create unique index cms_pim_skus_owner_active_uidx
  on public.cms_pim_skus (model_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create table public.cms_pim_external_identifiers (
  id uuid primary key,
  site_key text not null default 'main' check (site_key = 'main'),
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  owner_type text not null check (owner_type in ('product', 'model', 'variant', 'sku')),
  owner_id uuid not null,
  identifier_kind text not null check (identifier_kind in ('erp', 'gtin', 'ncm', 'other')),
  identifier_value text not null check (char_length(btrim(identifier_value)) between 1 and 180),
  normalized_value text not null check (char_length(normalized_value) between 1 and 180),
  issuer text check (issuer is null or char_length(issuer) <= 160),
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, identifier_kind, normalized_value),
  unique (owner_type, owner_id, identifier_kind)
);

create table public.cms_pim_units (
  code text primary key check (code ~ '^[A-Za-z0-9%°/._-]{1,40}$'),
  label text not null check (char_length(label) between 1 and 120),
  symbol text not null check (char_length(symbol) between 1 and 40),
  dimension_key text not null check (dimension_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  canonical_code text not null references public.cms_pim_units (code) on delete restrict
    check (canonical_code ~ '^[A-Za-z0-9%°/._-]{1,40}$'),
  factor_to_canonical numeric(30,12) not null check (factor_to_canonical <> 0),
  offset_to_canonical numeric(30,12) not null default 0,
  active boolean not null default true,
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_pim_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  attribute_key text not null check (attribute_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  label text not null check (char_length(label) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  data_type text not null check (data_type in ('text', 'decimal', 'boolean', 'enum', 'range')),
  canonical_unit_code text references public.cms_pim_units (code) on delete restrict,
  enum_options jsonb not null default '[]'::jsonb check (jsonb_typeof(enum_options) = 'array'),
  filterable boolean not null default false,
  comparable boolean not null default false,
  searchable boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, attribute_key),
  check ((data_type in ('decimal', 'range')) or canonical_unit_code is null),
  check ((data_type = 'enum' and jsonb_array_length(enum_options) > 0) or (data_type <> 'enum' and jsonb_array_length(enum_options) = 0))
);

create table public.cms_pim_attribute_sets (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  category_id uuid not null references public.cms_master_entities (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'inactive')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, category_id, name)
);

create unique index cms_pim_attribute_sets_active_category_uidx
  on public.cms_pim_attribute_sets (site_key, category_id) where status = 'active';

create table public.cms_pim_attribute_set_versions (
  id uuid primary key default gen_random_uuid(),
  attribute_set_id uuid not null references public.cms_pim_attribute_sets (id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (attribute_set_id, version),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from))
);

create unique index cms_pim_attribute_set_active_version_uidx
  on public.cms_pim_attribute_set_versions (attribute_set_id) where status = 'active';

create table public.cms_pim_attribute_set_definitions (
  attribute_set_version_id uuid not null references public.cms_pim_attribute_set_versions (id) on delete restrict,
  definition_id uuid not null references public.cms_pim_attribute_definitions (id) on delete restrict,
  required boolean not null default false,
  inherited boolean not null default true,
  position integer not null default 0 check (position between 0 and 999),
  primary key (attribute_set_version_id, definition_id)
);

create table public.cms_pim_attribute_values (
  id uuid primary key,
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  definition_id uuid not null references public.cms_pim_attribute_definitions (id) on delete restrict,
  owner_scope text not null check (owner_scope in ('product', 'model', 'variant')),
  owner_id uuid not null,
  value jsonb not null,
  unit_code text references public.cms_pim_units (code) on delete restrict,
  canonical_min numeric,
  canonical_max numeric,
  source_type text not null default 'manual' check (source_type in ('manual', 'import', 'legacy')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  homologated boolean not null default false,
  active boolean not null default true,
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cms_pim_attribute_values_active_uidx
  on public.cms_pim_attribute_values (product_id, definition_id, owner_scope, owner_id) where active;
create index cms_pim_attribute_values_numeric_idx
  on public.cms_pim_attribute_values (definition_id, canonical_min, canonical_max) where active and homologated;

create table public.cms_pim_provenance (
  id uuid primary key,
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  source_kind text not null check (source_kind in ('official_manufacturer', 'owner_authored', 'import', 'legacy', 'other')),
  source_ref text not null check (char_length(source_ref) between 1 and 500),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  rights_confirmed boolean not null,
  verified_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cms_pim_provenance_active_uidx
  on public.cms_pim_provenance (product_id, source_kind, source_ref) where active;

create table public.cms_pim_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('save_product', 'archive_product', 'generate_sku')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  product_id uuid references public.cms_pim_products (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_pim_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('product_saved', 'product_archived', 'sku_generated')),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index cms_pim_events_product_idx on public.cms_pim_events (product_id, occurred_at desc);

create function public.cms_pim_reject_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'CMS_PIM_DELETE_FORBIDDEN' using errcode = '42501';
end;
$$;

create function public.cms_pim_sku_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.sku <> old.sku or new.product_id <> old.product_id or new.model_id <> old.model_id
     or new.variant_id is distinct from old.variant_id then
    raise exception 'CMS_PIM_SKU_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger cms_pim_products_no_delete before delete on public.cms_pim_products
for each row execute function public.cms_pim_reject_delete();
create trigger cms_pim_models_no_delete before delete on public.cms_pim_models
for each row execute function public.cms_pim_reject_delete();
create trigger cms_pim_variants_no_delete before delete on public.cms_pim_variants
for each row execute function public.cms_pim_reject_delete();
create trigger cms_pim_skus_no_delete before delete on public.cms_pim_skus
for each row execute function public.cms_pim_reject_delete();
create trigger cms_pim_skus_immutable before update on public.cms_pim_skus
for each row execute function public.cms_pim_sku_immutable();
create trigger cms_pim_events_immutable before update or delete on public.cms_pim_events
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_pim_products_touch before update on public.cms_pim_products
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_models_touch before update on public.cms_pim_models
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_variants_touch before update on public.cms_pim_variants
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_skus_touch before update on public.cms_pim_skus
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_product_master_links_touch before update on public.cms_pim_product_master_links
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_external_identifiers_touch before update on public.cms_pim_external_identifiers
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_units_touch before update on public.cms_pim_units
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_attribute_definitions_touch before update on public.cms_pim_attribute_definitions
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_attribute_sets_touch before update on public.cms_pim_attribute_sets
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_attribute_values_touch before update on public.cms_pim_attribute_values
for each row execute function public.cms_touch_updated_at();
create trigger cms_pim_provenance_touch before update on public.cms_pim_provenance
for each row execute function public.cms_touch_updated_at();

create function public.cms_pim_assert_master(p_id uuid, p_type text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_status text;
begin
  select status into v_status from public.cms_master_entities
  where id = p_id and site_key = 'main' and entity_type = p_type;
  if not found then raise exception 'CMS_PIM_MASTER_INVALID' using errcode = '23514'; end if;
  if v_status <> 'active' then raise exception 'CMS_PIM_MASTER_INACTIVE' using errcode = '23514'; end if;
end;
$$;

create function public.cms_pim_assert_compatibility(
  p_relation text, p_source uuid, p_target uuid
)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.cms_master_compatibilities
    where relation_type = p_relation and source_entity_id = p_source and target_entity_id = p_target and status = 'active'
  ) then
    raise exception 'CMS_PIM_COMPATIBILITY_INVALID' using errcode = '23514';
  end if;
end;
$$;

create function public.cms_pim_validate_owner(
  p_product_id uuid, p_owner_type text, p_owner_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case p_owner_type
    when 'product' then p_owner_id = p_product_id
    when 'model' then exists(select 1 from public.cms_pim_models where id=p_owner_id and product_id=p_product_id)
    when 'variant' then exists(select 1 from public.cms_pim_variants where id=p_owner_id and product_id=p_product_id)
    when 'sku' then exists(select 1 from public.cms_pim_skus where id=p_owner_id and product_id=p_product_id)
    else false end;
$$;

create function public.cms_pim_validate_attribute_value(
  p_definition_id uuid, p_value jsonb, p_unit_code text
)
returns table(canonical_min numeric, canonical_max numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_definition public.cms_pim_attribute_definitions%rowtype;
  v_unit public.cms_pim_units%rowtype;
  v_min numeric;
  v_max numeric;
begin
  select * into v_definition from public.cms_pim_attribute_definitions where id=p_definition_id and status='active';
  if not found then raise exception 'CMS_PIM_ATTRIBUTE_INVALID' using errcode='23514'; end if;
  if v_definition.data_type='text' and jsonb_typeof(p_value)<>'string'
     or v_definition.data_type='boolean' and jsonb_typeof(p_value)<>'boolean'
     or v_definition.data_type='decimal' and jsonb_typeof(p_value)<>'number'
     or v_definition.data_type='enum' and jsonb_typeof(p_value) not in ('string','array')
     or v_definition.data_type='range' and (jsonb_typeof(p_value)<>'object' or not (p_value ? 'min' and p_value ? 'max')) then
    raise exception 'CMS_PIM_ATTRIBUTE_TYPE_INVALID' using errcode='23514';
  end if;
  if v_definition.data_type='enum' and exists (
    select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(p_value)='array' then p_value else jsonb_build_array(p_value) end
    ) as x(value)
    where not (v_definition.enum_options ? x.value)
  ) then raise exception 'CMS_PIM_ATTRIBUTE_ENUM_INVALID' using errcode='23514'; end if;
  if v_definition.data_type in ('decimal','range') then
    if p_unit_code is null then raise exception 'CMS_PIM_UNIT_REQUIRED' using errcode='23514'; end if;
    select * into v_unit from public.cms_pim_units where code=p_unit_code and active;
    if not found or v_unit.canonical_code <> v_definition.canonical_unit_code then
      raise exception 'CMS_PIM_UNIT_INCOMPATIBLE' using errcode='23514';
    end if;
    if v_definition.data_type='decimal' then
      v_min := (p_value #>> '{}')::numeric * v_unit.factor_to_canonical + v_unit.offset_to_canonical;
      v_max := v_min;
    else
      v_min := (p_value->>'min')::numeric * v_unit.factor_to_canonical + v_unit.offset_to_canonical;
      v_max := (p_value->>'max')::numeric * v_unit.factor_to_canonical + v_unit.offset_to_canonical;
      if v_min > v_max then raise exception 'CMS_PIM_RANGE_INVALID' using errcode='23514'; end if;
    end if;
  elsif p_unit_code is not null then
    raise exception 'CMS_PIM_UNIT_UNEXPECTED' using errcode='23514';
  end if;
  return query select v_min, v_max;
end;
$$;

create function public.cms_execute_pim_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_permission text;
  v_flag jsonb;
  v_receipt public.cms_pim_command_receipts%rowtype;
  v_product public.cms_pim_products%rowtype;
  v_product_id uuid;
  v_model jsonb;
  v_variant jsonb;
  v_link jsonb;
  v_attribute jsonb;
  v_external jsonb;
  v_provenance jsonb;
  v_model_id uuid;
  v_variant_id uuid;
  v_model_ids uuid[] := '{}';
  v_variant_ids uuid[];
  v_link_ids uuid[] := '{}';
  v_attribute_ids uuid[] := '{}';
  v_external_ids uuid[] := '{}';
  v_provenance_ids uuid[] := '{}';
  v_dimension text;
  v_relation text;
  v_target_type text;
  v_target_id uuid;
  v_value_validation record;
  v_sku public.cms_pim_skus%rowtype;
  v_sku_code text;
  v_response jsonb;
  v_expected bigint;
begin
  if p_action not in ('save_product','archive_product','generate_sku')
     or p_environment not in ('local','staging') or p_site_key <> 'main'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_PIM_COMMAND_INVALID' using errcode='22023';
  end if;
  v_permission := case when p_action='archive_product' then 'cms:pim.archive' else 'cms:pim.manage' end;
  if not public.cms_actor_authorized(p_actor_id,v_permission,p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_PIM_FORBIDDEN' using errcode='42501';
  end if;
  v_flag := public.cms_evaluate_feature_flag(p_actor_id,'ev2.pim_v2',p_environment,p_site_key,p_aal,p_session_id,p_issued_at);
  if coalesce((v_flag->>'enabled')::boolean,false) is not true then
    raise exception 'CMS_PIM_FEATURE_DISABLED' using errcode='42501';
  end if;

  insert into public.cms_pim_command_receipts(
    actor_id,action,idempotency_key,command_id,request_hash,correlation_id
  ) values (p_actor_id,p_action,p_idempotency_key,p_command_id,p_request_hash,p_correlation_id)
  on conflict (actor_id,action,idempotency_key) do nothing;
  select * into v_receipt from public.cms_pim_command_receipts
  where actor_id=p_actor_id and action=p_action and idempotency_key=p_idempotency_key for update;
  if v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_PIM_IDEMPOTENCY_CONFLICT' using errcode='23505';
  end if;
  if v_receipt.response is not null then return v_receipt.response || jsonb_build_object('replayed',true); end if;

  if p_action='save_product' then
    if jsonb_typeof(p_payload->'product') is distinct from 'object'
       or coalesce(p_payload->>'mode','') not in ('create','update') then
      raise exception 'CMS_PIM_PRODUCT_INVALID' using errcode='23514';
    end if;
    v_product_id := (p_payload#>>'{product,id}')::uuid;
    perform public.cms_pim_assert_master((p_payload#>>'{product,masterData,manufacturerId}')::uuid,'manufacturer');
    perform public.cms_pim_assert_master((p_payload#>>'{product,masterData,categoryId}')::uuid,'category');
    if p_payload#>>'{product,masterData,brandId}' is not null then
      perform public.cms_pim_assert_master((p_payload#>>'{product,masterData,brandId}')::uuid,'brand');
      perform public.cms_pim_assert_compatibility('manufacturer_brand',(p_payload#>>'{product,masterData,manufacturerId}')::uuid,(p_payload#>>'{product,masterData,brandId}')::uuid);
    end if;
    if p_payload#>>'{product,masterData,lineId}' is not null then
      if p_payload#>>'{product,masterData,brandId}' is null then raise exception 'CMS_PIM_LINE_REQUIRES_BRAND' using errcode='23514'; end if;
      perform public.cms_pim_assert_master((p_payload#>>'{product,masterData,lineId}')::uuid,'line');
      perform public.cms_pim_assert_compatibility('brand_line',(p_payload#>>'{product,masterData,brandId}')::uuid,(p_payload#>>'{product,masterData,lineId}')::uuid);
    end if;
    if jsonb_array_length(coalesce(p_payload#>'{product,models}','[]'::jsonb)) < 1
       or (select count(*) from jsonb_array_elements(p_payload#>'{product,models}') m where coalesce((m->>'primary')::boolean,false) and coalesce(m->>'status','active')='active') <> 1 then
      raise exception 'CMS_PIM_PRIMARY_MODEL_INVALID' using errcode='23514';
    end if;
    if jsonb_array_length(coalesce(p_payload#>'{product,masterData,monitoredElementIds}','[]'::jsonb)) < 1
       or jsonb_array_length(coalesce(p_payload#>'{product,provenance}','[]'::jsonb)) < 1 then
      raise exception 'CMS_PIM_REQUIRED_RELATIONS_INVALID' using errcode='23514';
    end if;
    if p_payload#>>'{product,contentItemId}' is not null and not exists(
      select 1 from public.cms_content_items where id=(p_payload#>>'{product,contentItemId}')::uuid and content_type='product'
    ) then raise exception 'CMS_PIM_CONTENT_ITEM_INVALID' using errcode='23514'; end if;

    select * into v_product from public.cms_pim_products where id=v_product_id for update;
    if found then
      if p_payload->>'mode' <> 'update' then
        raise exception 'CMS_PIM_DUPLICATE' using errcode='23505';
      end if;
      v_expected := nullif(p_payload->>'expectedVersion','')::bigint;
      if v_expected is null or v_expected <> v_product.lock_version then
        raise exception 'CMS_PIM_CONFLICT' using errcode='40001';
      end if;
      update public.cms_pim_products set
        content_item_id=nullif(p_payload#>>'{product,contentItemId}','')::uuid,
        name=p_payload#>>'{product,name}', normalized_name=public.cms_normalize_master_name(p_payload#>>'{product,name}'),
        slug=p_payload#>>'{product,slug}', summary=coalesce(p_payload#>>'{product,summary}',''),
        value_proposition=coalesce(p_payload#>>'{product,valueProposition}',''),
        manufacturer_id=(p_payload#>>'{product,masterData,manufacturerId}')::uuid,
        brand_id=nullif(p_payload#>>'{product,masterData,brandId}','')::uuid,
        line_id=nullif(p_payload#>>'{product,masterData,lineId}','')::uuid,
        category_id=(p_payload#>>'{product,masterData,categoryId}')::uuid,
        status=coalesce(p_payload#>>'{product,status}','draft'), source_type=coalesce(p_payload#>>'{product,sourceType}','manual'),
        source_ref=nullif(p_payload#>>'{product,sourceRef}',''), updated_by=p_actor_id, lock_version=lock_version+1
      where id=v_product_id returning * into v_product;
    else
      if p_payload->>'mode' <> 'create' then
        raise exception 'CMS_PIM_NOT_FOUND' using errcode='P0002';
      end if;
      insert into public.cms_pim_products(
        id,content_item_id,name,normalized_name,slug,summary,value_proposition,manufacturer_id,brand_id,line_id,category_id,
        status,source_type,source_ref,created_by,updated_by
      ) values (
        v_product_id,nullif(p_payload#>>'{product,contentItemId}','')::uuid,p_payload#>>'{product,name}',
        public.cms_normalize_master_name(p_payload#>>'{product,name}'),p_payload#>>'{product,slug}',coalesce(p_payload#>>'{product,summary}',''),
        coalesce(p_payload#>>'{product,valueProposition}',''),(p_payload#>>'{product,masterData,manufacturerId}')::uuid,
        nullif(p_payload#>>'{product,masterData,brandId}','')::uuid,nullif(p_payload#>>'{product,masterData,lineId}','')::uuid,
        (p_payload#>>'{product,masterData,categoryId}')::uuid,coalesce(p_payload#>>'{product,status}','draft'),
        coalesce(p_payload#>>'{product,sourceType}','manual'),nullif(p_payload#>>'{product,sourceRef}',''),p_actor_id,p_actor_id
      ) returning * into v_product;
    end if;

    foreach v_dimension in array array['magnitude','technology','installation','monitored_element'] loop
      v_relation := case v_dimension when 'magnitude' then 'category_magnitude' when 'technology' then 'category_technology'
        when 'installation' then 'category_installation' else 'category_monitored_element' end;
      v_target_type := v_dimension;
      for v_link in select value from jsonb_array_elements(
        coalesce(p_payload#>array['product','masterData',case v_dimension when 'magnitude' then 'magnitudeIds' when 'technology' then 'technologyIds' when 'installation' then 'installationIds' else 'monitoredElementIds' end],'[]'::jsonb)
      ) loop
        v_target_id := (v_link#>>'{}')::uuid;
        perform public.cms_pim_assert_master(v_target_id,v_target_type);
        perform public.cms_pim_assert_compatibility(v_relation,v_product.category_id,v_target_id);
        insert into public.cms_pim_product_master_links(product_id,dimension,entity_id,created_by,updated_by)
        values(v_product_id,v_dimension,v_target_id,p_actor_id,p_actor_id)
        on conflict(product_id,dimension,entity_id) do update set status='active',effective_to=null,updated_by=p_actor_id;
        v_link_ids := array_append(v_link_ids,v_target_id);
      end loop;
      update public.cms_pim_product_master_links set status='inactive',effective_to=now(),updated_by=p_actor_id
      where product_id=v_product_id and dimension=v_dimension and status='active'
        and not (entity_id=any(v_link_ids));
      v_link_ids := '{}';
    end loop;

    update public.cms_pim_models set is_primary=false,updated_by=p_actor_id,lock_version=lock_version+1
    where product_id=v_product_id and is_primary;
    for v_model in select value from jsonb_array_elements(p_payload#>'{product,models}') loop
      v_model_id := (v_model->>'id')::uuid;
      v_model_ids := array_append(v_model_ids,v_model_id);
      insert into public.cms_pim_models(
        id,product_id,manufacturer_id,name,normalized_name,mpn,normalized_mpn,status,is_primary,position,created_by,updated_by
      ) values (
        v_model_id,v_product_id,v_product.manufacturer_id,v_model->>'name',public.cms_normalize_master_name(v_model->>'name'),
        nullif(v_model->>'mpn',''),case when nullif(v_model->>'mpn','') is null then null else public.cms_normalize_master_name(v_model->>'mpn') end,
        coalesce(v_model->>'status','active'),coalesce((v_model->>'primary')::boolean,false),coalesce((v_model->>'position')::integer,0),p_actor_id,p_actor_id
      ) on conflict(id) do update set
        manufacturer_id=excluded.manufacturer_id,name=excluded.name,normalized_name=excluded.normalized_name,mpn=excluded.mpn,
        normalized_mpn=excluded.normalized_mpn,status=excluded.status,is_primary=excluded.is_primary,position=excluded.position,
        updated_by=p_actor_id,lock_version=public.cms_pim_models.lock_version+1
      where public.cms_pim_models.product_id=v_product_id;
      if not found then raise exception 'CMS_PIM_MODEL_SCOPE_INVALID' using errcode='23514'; end if;
      v_variant_ids := '{}';
      for v_variant in select value from jsonb_array_elements(coalesce(v_model->'variants','[]'::jsonb)) loop
        v_variant_id := (v_variant->>'id')::uuid;
        v_variant_ids := array_append(v_variant_ids,v_variant_id);
        if jsonb_typeof(v_variant->'axes')<>'array' or jsonb_array_length(v_variant->'axes')<1
           or exists(select 1 from jsonb_array_elements(v_variant->'axes') a group by a->>'axisKey' having count(*)>1) then
          raise exception 'CMS_PIM_VARIANT_AXES_INVALID' using errcode='23514';
        end if;
        insert into public.cms_pim_variants(id,product_id,model_id,name,code,axes,status,position,created_by,updated_by)
        values(v_variant_id,v_product_id,v_model_id,v_variant->>'name',nullif(v_variant->>'code',''),v_variant->'axes',
          coalesce(v_variant->>'status','active'),coalesce((v_variant->>'position')::integer,0),p_actor_id,p_actor_id)
        on conflict(id) do update set name=excluded.name,code=excluded.code,axes=excluded.axes,status=excluded.status,
          position=excluded.position,updated_by=p_actor_id,lock_version=public.cms_pim_variants.lock_version+1
        where public.cms_pim_variants.product_id=v_product_id and public.cms_pim_variants.model_id=v_model_id;
        if not found then raise exception 'CMS_PIM_VARIANT_SCOPE_INVALID' using errcode='23514'; end if;
      end loop;
      update public.cms_pim_variants set status='discontinued',updated_by=p_actor_id,lock_version=lock_version+1
      where model_id=v_model_id and status='active' and not(id=any(v_variant_ids));
    end loop;
    update public.cms_pim_models set status='discontinued',is_primary=false,updated_by=p_actor_id,lock_version=lock_version+1
    where product_id=v_product_id and status='active' and not(id=any(v_model_ids));

    for v_attribute in select value from jsonb_array_elements(coalesce(p_payload#>'{product,attributes}','[]'::jsonb)) loop
      if not public.cms_pim_validate_owner(v_product_id,v_attribute->>'scope',(v_attribute->>'ownerId')::uuid) then
        raise exception 'CMS_PIM_ATTRIBUTE_OWNER_INVALID' using errcode='23514';
      end if;
      select * into v_value_validation from public.cms_pim_validate_attribute_value(
        (v_attribute->>'definitionId')::uuid,v_attribute->'value',nullif(v_attribute->>'unitCode','')
      );
      v_attribute_ids := array_append(v_attribute_ids,(v_attribute->>'id')::uuid);
      insert into public.cms_pim_attribute_values(
        id,product_id,definition_id,owner_scope,owner_id,value,unit_code,canonical_min,canonical_max,source_type,source_ref,
        confidence,homologated,active,created_by,updated_by
      ) values (
        (v_attribute->>'id')::uuid,v_product_id,(v_attribute->>'definitionId')::uuid,v_attribute->>'scope',(v_attribute->>'ownerId')::uuid,
        v_attribute->'value',nullif(v_attribute->>'unitCode',''),v_value_validation.canonical_min,v_value_validation.canonical_max,
        coalesce(v_attribute->>'sourceType','manual'),nullif(v_attribute->>'sourceRef',''),coalesce((v_attribute->>'confidence')::numeric,1),
        coalesce((v_attribute->>'homologated')::boolean,false),true,p_actor_id,p_actor_id
      ) on conflict(id) do update set value=excluded.value,unit_code=excluded.unit_code,canonical_min=excluded.canonical_min,
        canonical_max=excluded.canonical_max,source_type=excluded.source_type,source_ref=excluded.source_ref,
        confidence=excluded.confidence,homologated=excluded.homologated,active=true,updated_by=p_actor_id,
        lock_version=public.cms_pim_attribute_values.lock_version+1
      where public.cms_pim_attribute_values.product_id=v_product_id;
      if not found then raise exception 'CMS_PIM_ATTRIBUTE_SCOPE_INVALID' using errcode='23514'; end if;
    end loop;
    update public.cms_pim_attribute_values set active=false,updated_by=p_actor_id,lock_version=lock_version+1
    where product_id=v_product_id and active and not(id=any(v_attribute_ids));

    for v_external in select value from jsonb_array_elements(coalesce(p_payload#>'{product,externalIdentifiers}','[]'::jsonb)) loop
      if not public.cms_pim_validate_owner(v_product_id,v_external->>'ownerType',(v_external->>'ownerId')::uuid) then
        raise exception 'CMS_PIM_EXTERNAL_OWNER_INVALID' using errcode='23514';
      end if;
      v_external_ids := array_append(v_external_ids,(v_external->>'id')::uuid);
      insert into public.cms_pim_external_identifiers(
        id,product_id,owner_type,owner_id,identifier_kind,identifier_value,normalized_value,issuer,source_type,source_ref,created_by,updated_by
      ) values (
        (v_external->>'id')::uuid,v_product_id,v_external->>'ownerType',(v_external->>'ownerId')::uuid,v_external->>'kind',
        v_external->>'value',public.cms_normalize_master_name(v_external->>'value'),nullif(v_external->>'issuer',''),
        coalesce(v_external->>'sourceType','manual'),nullif(v_external->>'sourceRef',''),p_actor_id,p_actor_id
      ) on conflict(id) do update set identifier_value=excluded.identifier_value,normalized_value=excluded.normalized_value,
        issuer=excluded.issuer,source_type=excluded.source_type,source_ref=excluded.source_ref,updated_by=p_actor_id
      where public.cms_pim_external_identifiers.product_id=v_product_id;
      if not found then raise exception 'CMS_PIM_EXTERNAL_SCOPE_INVALID' using errcode='23514'; end if;
    end loop;
    if exists(select 1 from public.cms_pim_external_identifiers where product_id=v_product_id and not(id=any(v_external_ids))) then
      raise exception 'CMS_PIM_EXTERNAL_REMOVAL_REQUIRES_ARCHIVE' using errcode='23514';
    end if;

    for v_provenance in select value from jsonb_array_elements(p_payload#>'{product,provenance}') loop
      v_provenance_ids := array_append(v_provenance_ids,(v_provenance->>'id')::uuid);
      insert into public.cms_pim_provenance(
        id,product_id,source_kind,source_ref,source_sha256,confidence,rights_confirmed,verified_at,active,created_by,updated_by
      ) values (
        (v_provenance->>'id')::uuid,v_product_id,v_provenance->>'sourceKind',v_provenance->>'sourceRef',
        nullif(v_provenance->>'sourceSha256',''),coalesce((v_provenance->>'confidence')::numeric,1),
        coalesce((v_provenance->>'rightsConfirmed')::boolean,false),nullif(v_provenance->>'verifiedAt','')::timestamptz,true,p_actor_id,p_actor_id
      ) on conflict(id) do update set source_kind=excluded.source_kind,source_ref=excluded.source_ref,
        source_sha256=excluded.source_sha256,confidence=excluded.confidence,rights_confirmed=excluded.rights_confirmed,
        verified_at=excluded.verified_at,active=true,updated_by=p_actor_id
      where public.cms_pim_provenance.product_id=v_product_id;
      if not found then raise exception 'CMS_PIM_PROVENANCE_SCOPE_INVALID' using errcode='23514'; end if;
    end loop;
    update public.cms_pim_provenance set active=false,updated_by=p_actor_id
    where product_id=v_product_id and active and not(id=any(v_provenance_ids));
    v_response := jsonb_build_object('schemaVersion',1,'commandId',p_command_id,'correlationId',p_correlation_id,
      'productId',v_product_id,'status',v_product.status,'lockVersion',v_product.lock_version,'replayed',false);

  elsif p_action='archive_product' then
    v_product_id := (p_payload->>'productId')::uuid;
    select * into v_product from public.cms_pim_products where id=v_product_id for update;
    if not found then raise exception 'CMS_PIM_NOT_FOUND' using errcode='P0002'; end if;
    v_expected := nullif(p_payload->>'expectedVersion','')::bigint;
    if v_expected is null or v_expected<>v_product.lock_version then raise exception 'CMS_PIM_CONFLICT' using errcode='40001'; end if;
    update public.cms_pim_products set status='archived',updated_by=p_actor_id,lock_version=lock_version+1 where id=v_product_id returning * into v_product;
    update public.cms_pim_models set status='discontinued',is_primary=false,updated_by=p_actor_id,lock_version=lock_version+1 where product_id=v_product_id and status='active';
    update public.cms_pim_variants set status='discontinued',updated_by=p_actor_id,lock_version=lock_version+1 where product_id=v_product_id and status='active';
    update public.cms_pim_skus set status='retired',retired_at=now(),retirement_reason=p_payload->>'reason',updated_by=p_actor_id where product_id=v_product_id and status='active';
    v_response := jsonb_build_object('schemaVersion',1,'commandId',p_command_id,'correlationId',p_correlation_id,
      'productId',v_product_id,'status',v_product.status,'lockVersion',v_product.lock_version,'replayed',false);

  else
    v_product_id := (p_payload->>'productId')::uuid;
    select * into v_product from public.cms_pim_products where id=v_product_id and status<>'archived';
    if not found then raise exception 'CMS_PIM_NOT_FOUND' using errcode='P0002'; end if;
    v_model_id := (p_payload->>'modelId')::uuid;
    v_variant_id := nullif(p_payload->>'variantId','')::uuid;
    if not exists(select 1 from public.cms_pim_models where id=v_model_id and product_id=v_product_id and status='active')
       or (v_variant_id is not null and not exists(select 1 from public.cms_pim_variants where id=v_variant_id and model_id=v_model_id and status='active')) then
      raise exception 'CMS_PIM_SKU_OWNER_INVALID' using errcode='23514';
    end if;
    select * into v_sku from public.cms_pim_skus
      where model_id=v_model_id and variant_id is not distinct from v_variant_id and status='active';
    if not found then
      v_sku_code := 'GAI-' || upper(substr(regexp_replace(v_product.slug,'[^a-z0-9]','','g'),1,10)) || '-' ||
        lpad(nextval('public.cms_pim_sku_sequence')::text,6,'0');
      if exists(select 1 from public.cms_pim_models where id=v_model_id and upper(coalesce(mpn,''))=v_sku_code)
         or exists(select 1 from public.cms_pim_external_identifiers where product_id=v_product_id and upper(identifier_value)=v_sku_code) then
        raise exception 'CMS_PIM_SKU_EXTERNAL_CONFLICT' using errcode='23505';
      end if;
      insert into public.cms_pim_skus(product_id,model_id,variant_id,sku,created_by,updated_by)
      values(v_product_id,v_model_id,v_variant_id,v_sku_code,p_actor_id,p_actor_id) returning * into v_sku;
    end if;
    v_response := jsonb_build_object('schemaVersion',1,'commandId',p_command_id,'correlationId',p_correlation_id,
      'productId',v_product_id,'status',v_product.status,'lockVersion',v_product.lock_version,'replayed',false,
      'sku',jsonb_build_object('id',v_sku.id,'productId',v_sku.product_id,'modelId',v_sku.model_id,'variantId',v_sku.variant_id,
        'sku',v_sku.sku,'status',v_sku.status,'createdAt',v_sku.created_at,'retiredAt',v_sku.retired_at));
  end if;

  insert into public.cms_pim_events(product_id,actor_id,event_type,event_data,correlation_id)
  values(v_product_id,p_actor_id,case p_action when 'save_product' then 'product_saved' when 'archive_product' then 'product_archived' else 'sku_generated' end,
    jsonb_build_object('action',p_action,'lockVersion',v_product.lock_version),p_correlation_id);
  update public.cms_pim_command_receipts set product_id=v_product_id,response=v_response,completed_at=now()
  where actor_id=p_actor_id and action=p_action and idempotency_key=p_idempotency_key;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(
    p_actor_id,'cms:pim.'||p_action,'pim_product',v_product_id::text,
    jsonb_build_object('environment',p_environment),p_correlation_id
  );
  return v_response;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cms_pim_products','cms_pim_product_master_links','cms_pim_models','cms_pim_variants','cms_pim_skus',
    'cms_pim_external_identifiers','cms_pim_units','cms_pim_attribute_definitions','cms_pim_attribute_sets',
    'cms_pim_attribute_set_versions','cms_pim_attribute_set_definitions','cms_pim_attribute_values','cms_pim_provenance',
    'cms_pim_command_receipts','cms_pim_events'
  ] loop execute format('alter table public.%I enable row level security',table_name); end loop;
end;
$$;

revoke all on sequence public.cms_pim_sku_sequence from public, anon, authenticated;
grant usage, select on sequence public.cms_pim_sku_sequence to service_role;
revoke all on table
  public.cms_pim_products,public.cms_pim_product_master_links,public.cms_pim_models,public.cms_pim_variants,
  public.cms_pim_skus,public.cms_pim_external_identifiers,public.cms_pim_units,public.cms_pim_attribute_definitions,
  public.cms_pim_attribute_sets,public.cms_pim_attribute_set_versions,public.cms_pim_attribute_set_definitions,
  public.cms_pim_attribute_values,public.cms_pim_provenance,public.cms_pim_command_receipts,public.cms_pim_events
from public,anon,authenticated;
grant select,insert,update,delete on table
  public.cms_pim_products,public.cms_pim_product_master_links,public.cms_pim_models,public.cms_pim_variants,
  public.cms_pim_skus,public.cms_pim_external_identifiers,public.cms_pim_units,public.cms_pim_attribute_definitions,
  public.cms_pim_attribute_sets,public.cms_pim_attribute_set_versions,public.cms_pim_attribute_set_definitions,
  public.cms_pim_attribute_values,public.cms_pim_provenance,public.cms_pim_command_receipts,public.cms_pim_events
to service_role;

revoke all on function public.cms_pim_reject_delete() from public,anon,authenticated;
revoke all on function public.cms_pim_sku_immutable() from public,anon,authenticated;
revoke all on function public.cms_pim_assert_master(uuid,text) from public,anon,authenticated;
revoke all on function public.cms_pim_assert_compatibility(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.cms_pim_validate_owner(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.cms_pim_validate_attribute_value(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.cms_pim_assert_master(uuid,text) to service_role;
grant execute on function public.cms_pim_assert_compatibility(text,uuid,uuid) to service_role;
grant execute on function public.cms_pim_validate_owner(uuid,text,uuid) to service_role;
grant execute on function public.cms_pim_validate_attribute_value(uuid,jsonb,text) to service_role;
grant execute on function public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid) to service_role;
