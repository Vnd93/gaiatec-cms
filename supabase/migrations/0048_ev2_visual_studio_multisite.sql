-- EV2.9 — Estúdio Visual governado e preparação multisite isolada.
-- Estritamente aditiva/default-off. A migration não ativa flags, produção, domínios
-- reais, conteúdo real ou um segundo tenant operacional.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:visual.read', 'Consultar catálogo, documentos e snapshots do Estúdio Visual.', false),
  ('cms:visual.edit', 'Editar documento visual governado.', true),
  ('cms:visual.branch', 'Criar e abandonar branches visuais.', true),
  ('cms:visual.snapshot', 'Gerar snapshots responsivos imutáveis.', true),
  ('cms:visual.design', 'Usar controles avançados do Modo Designer.', true),
  ('cms:visual.symbols', 'Criar símbolos reutilizáveis dentro do mesmo site.', true),
  ('cms:visual.apply', 'Aplicar documento visual ao rascunho editorial sem publicar.', true),
  ('cms:sites.read', 'Consultar registro de sites, ambientes, domínios e temas.', false),
  ('cms:sites.manage', 'Preparar sites sintéticos sem ativação operacional.', true)
on conflict (permission_key) do update
set description = excluded.description,
    critical = excluded.critical;

insert into public.cms_roles (role_key, name, description, mfa_required, system_role)
values
  (
    'designer',
    'Designer',
    'Criação visual governada sem código arbitrário e sem permissão de publicação.',
    true,
    true
  ),
  (
    'site_pilot_manager',
    'Gestor de site piloto',
    'Gerencia exclusivamente candidatos multisite sintéticos de sua própria identidade.',
    true,
    true
  )
on conflict (role_key) do nothing;

do $$
begin
  if not exists (
    select 1 from public.cms_roles
    where role_key = 'designer'
      and name = 'Designer'
      and mfa_required
      and system_role
  ) then
    raise exception 'CMS_VISUAL_DESIGNER_ROLE_COLLISION' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.cms_roles
    where role_key = 'site_pilot_manager'
      and name = 'Gestor de site piloto'
      and mfa_required
      and system_role
  ) then
    raise exception 'CMS_SITES_PILOT_ROLE_COLLISION' using errcode = '23514';
  end if;
end;
$$;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, permission_key
from (values ('super_admin'), ('admin')) as roles(role_key)
cross join public.cms_permissions
where permission_key like 'cms:visual.%' or permission_key like 'cms:sites.%'
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('designer', 'cms:visual.read'),
  ('designer', 'cms:visual.edit'),
  ('designer', 'cms:visual.branch'),
  ('designer', 'cms:visual.snapshot'),
  ('designer', 'cms:visual.design'),
  ('designer', 'cms:visual.symbols'),
  ('designer', 'cms:visual.apply'),
  ('designer', 'cms:pages.read'),
  ('designer', 'cms:pages.edit'),
  ('designer', 'cms:homepage.read'),
  ('designer', 'cms:homepage.edit'),
  ('designer', 'cms:media.read'),
  ('editor', 'cms:visual.read'),
  ('editor', 'cms:visual.edit'),
  ('editor', 'cms:visual.branch'),
  ('editor', 'cms:visual.snapshot'),
  ('editor', 'cms:visual.apply'),
  ('marketing', 'cms:visual.read'),
  ('marketing', 'cms:visual.edit'),
  ('marketing', 'cms:visual.branch'),
  ('marketing', 'cms:visual.snapshot'),
  ('marketing', 'cms:visual.apply'),
  ('reviewer', 'cms:visual.read'),
  ('auditor', 'cms:sites.read'),
  ('site_pilot_manager', 'cms:sites.read'),
  ('site_pilot_manager', 'cms:sites.manage')
on conflict do nothing;

create table public.cms_sites (
  id uuid primary key default gen_random_uuid(),
  site_key text not null unique
    check (site_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 3 and 500),
  status text not null check (status in ('pilot', 'active', 'suspended', 'archived')),
  is_primary boolean not null default false,
  is_synthetic boolean not null default true,
  default_language text not null default 'pt-BR' check (default_language ~ '^[a-z]{2}-[A-Z]{2}$'),
  timezone text not null default 'America/Sao_Paulo'
    check (char_length(timezone) between 3 and 80),
  production_enabled boolean not null default false check (production_enabled is false),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_primary or (site_key = 'main' and not is_synthetic and status = 'active')),
  check (site_key = 'main' or (is_synthetic and site_key like 'g9x-%')),
  check (is_primary or created_by is not null)
);

create unique index cms_sites_single_primary_idx on public.cms_sites (is_primary) where is_primary;

create table public.cms_site_environments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  status text not null default 'locked' check (status in ('active', 'locked')),
  base_path text not null default '/' check (base_path = '/'),
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (site_id, environment)
);

create table public.cms_site_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  environment text not null check (environment in ('local', 'staging')),
  hostname text not null check (
    hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    and hostname like '%.invalid'
  ),
  status text not null default 'pending' check (status in ('pending', 'blocked')),
  verified boolean not null default false check (verified is false),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (site_id, environment)
    references public.cms_site_environments (site_id, environment) on delete restrict,
  unique (environment, hostname)
);

create table public.cms_themes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  theme_key text not null check (theme_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'archived')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, theme_key)
);

create table public.cms_design_tokens (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.cms_themes (id) on delete restrict,
  version integer not null check (version > 0),
  tokens jsonb not null check (jsonb_typeof(tokens) = 'array' and jsonb_array_length(tokens) between 1 and 100),
  tokens_hash text not null check (tokens_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete restrict,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  unique (theme_id, version)
);

create table public.cms_component_definitions (
  component_key text primary key check (component_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null unique check (char_length(btrim(name)) between 2 and 120),
  category text not null check (category in ('structure', 'content', 'media', 'conversion', 'data')),
  renderer_key text not null unique check (renderer_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  allowed_modes text[] not null check (
    cardinality(allowed_modes) between 1 and 2
    and allowed_modes <@ array['guided', 'designer']::text[]
  ),
  max_instances integer not null check (max_instances between 1 and 80),
  max_payload_bytes integer not null check (max_payload_bytes between 256 and 262144),
  default_props jsonb not null default '{}'::jsonb check (jsonb_typeof(default_props) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_component_versions (
  component_key text not null references public.cms_component_definitions (component_key) on delete restrict,
  version integer not null check (version > 0),
  schema_contract jsonb not null check (jsonb_typeof(schema_contract) = 'object'),
  renderer_key text not null check (renderer_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  created_at timestamptz not null default now(),
  primary key (component_key, version)
);

create table public.cms_page_branches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  branch_key text not null check (branch_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'abandoned')),
  base_revision_id uuid,
  base_draft_version bigint not null check (base_draft_version > 0),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (base_revision_id, item_id)
    references public.cms_content_revisions (id, item_id) on delete restrict,
  unique (site_id, environment, item_id, branch_key),
  unique (id, site_id, environment)
);

create unique index cms_page_branches_one_draft_idx
  on public.cms_page_branches (site_id, environment, item_id)
  where status = 'draft';

create table public.cms_visual_documents (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique,
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  schema_version integer not null default 1 check (schema_version = 1),
  registry_version integer not null default 1 check (registry_version = 1),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 1048576),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, site_id, environment)
    references public.cms_page_branches (id, site_id, environment) on delete restrict,
  unique (id, branch_id),
  unique (id, branch_id, site_id, environment)
);

create table public.cms_visual_symbols (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  symbol_key text not null check (symbol_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  component_key text not null,
  component_version integer not null,
  props jsonb not null check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 262144),
  source_branch_id uuid not null,
  source_node_id uuid not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (component_key, component_version)
    references public.cms_component_versions (component_key, version) on delete restrict,
  foreign key (source_branch_id, site_id, environment)
    references public.cms_page_branches (id, site_id, environment) on delete restrict,
  unique (site_id, environment, symbol_key)
);

create table public.cms_visual_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_group_id uuid not null,
  branch_id uuid not null,
  document_id uuid not null,
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  breakpoint text not null check (breakpoint in ('desktop', 'tablet', 'mobile')),
  source_version bigint not null check (source_version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (branch_id, site_id, environment)
    references public.cms_page_branches (id, site_id, environment) on delete restrict,
  foreign key (document_id, branch_id, site_id, environment)
    references public.cms_visual_documents (id, branch_id, site_id, environment) on delete restrict,
  unique (snapshot_group_id, breakpoint)
);

create table public.cms_visual_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.cms_page_branches (id) on delete restrict,
  document_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in (
    'branch_created', 'document_saved', 'document_conflict_replaced', 'snapshot_created',
    'symbol_created', 'applied_to_draft', 'branch_abandoned'
  )),
  from_version bigint,
  to_version bigint not null check (to_version > 0),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (document_id, branch_id)
    references public.cms_visual_documents (id, branch_id) on delete restrict
);

create table public.cms_visual_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in (
    'create_branch', 'save_document', 'snapshot', 'create_symbol', 'apply_to_draft', 'abandon'
  )),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  branch_id uuid references public.cms_page_branches (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_site_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.cms_sites (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('candidate_created', 'domain_added', 'tokens_versioned', 'candidate_suspended')),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create table public.cms_site_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('create_candidate', 'add_domain', 'update_tokens', 'suspend_candidate')),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  site_id uuid references public.cms_sites (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create index cms_visual_documents_scope_idx
  on public.cms_visual_documents (site_id, environment, updated_at desc);
create index cms_visual_snapshots_branch_idx
  on public.cms_visual_snapshots (branch_id, source_version desc, created_at desc);
create index cms_visual_symbols_scope_idx
  on public.cms_visual_symbols (site_id, environment, status, symbol_key);
create index cms_site_events_site_idx on public.cms_site_events (site_id, occurred_at desc);

create trigger cms_sites_touch_updated_at before update on public.cms_sites
for each row execute function public.cms_touch_updated_at();
create trigger cms_themes_touch_updated_at before update on public.cms_themes
for each row execute function public.cms_touch_updated_at();
create trigger cms_component_definitions_touch_updated_at before update on public.cms_component_definitions
for each row execute function public.cms_touch_updated_at();
create trigger cms_page_branches_touch_updated_at before update on public.cms_page_branches
for each row execute function public.cms_touch_updated_at();
create trigger cms_visual_documents_touch_updated_at before update on public.cms_visual_documents
for each row execute function public.cms_touch_updated_at();
create trigger cms_visual_symbols_touch_updated_at before update on public.cms_visual_symbols
for each row execute function public.cms_touch_updated_at();

create trigger cms_component_versions_immutable before update or delete on public.cms_component_versions
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_design_tokens_immutable before update or delete on public.cms_design_tokens
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_visual_snapshots_immutable before update or delete on public.cms_visual_snapshots
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_visual_events_immutable before update or delete on public.cms_visual_events
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_site_events_immutable before update or delete on public.cms_site_events
for each row execute function public.cms_reject_immutable_mutation();

insert into public.cms_sites (
  id, site_key, display_name, purpose, status, is_primary, is_synthetic,
  default_language, timezone, production_enabled
) values (
  '49000000-0000-4000-8000-000000000001',
  'main',
  'Site principal GAIATEC',
  'Tenant estrutural atual; permanece o único site operacional nesta fase.',
  'active',
  true,
  false,
  'pt-BR',
  'America/Sao_Paulo',
  false
) on conflict (site_key) do nothing;

do $$
begin
  if not exists (
    select 1 from public.cms_sites
    where id = '49000000-0000-4000-8000-000000000001'
      and site_key = 'main'
      and is_primary
      and not is_synthetic
      and status = 'active'
      and not production_enabled
  ) then
    raise exception 'CMS_VISUAL_MAIN_SITE_COLLISION' using errcode = '23514';
  end if;
end;
$$;

insert into public.cms_site_environments (id, site_id, environment, status)
values
  ('49000000-0000-4000-8000-000000000002', '49000000-0000-4000-8000-000000000001', 'local', 'active'),
  ('49000000-0000-4000-8000-000000000003', '49000000-0000-4000-8000-000000000001', 'staging', 'active')
on conflict (site_id, environment) do nothing;

insert into public.cms_themes (id, site_id, theme_key, name, status)
values (
  '49000000-0000-4000-8000-000000000004',
  '49000000-0000-4000-8000-000000000001',
  'gaiatec-default',
  'GAIATEC padrão',
  'active'
) on conflict (site_id, theme_key) do nothing;

with seed(tokens) as (
  values ('[
    {"key":"color.brand","kind":"color","value":"#0057de"},
    {"key":"color.text","kind":"color","value":"#13233a"},
    {"key":"color.surface","kind":"color","value":"#ffffff"},
    {"key":"space.section","kind":"space","value":"clamp(3rem,7vw,7rem)"},
    {"key":"radius.card","kind":"radius","value":"1rem"},
    {"key":"type.body","kind":"type","value":"Montserrat, sans-serif"}
  ]'::jsonb)
)
insert into public.cms_design_tokens (id, theme_id, version, tokens, tokens_hash)
select
  '49000000-0000-4000-8000-000000000005',
  '49000000-0000-4000-8000-000000000004',
  1,
  tokens,
  encode(extensions.digest(convert_to(tokens::text, 'UTF8'), 'sha256'), 'hex')
from seed
on conflict (theme_id, version) do nothing;

insert into public.cms_component_definitions (
  component_key, name, category, renderer_key, allowed_modes,
  max_instances, max_payload_bytes, default_props
)
values
  ('hero', 'Hero', 'structure', 'hero', array['guided','designer'], 1, 65536, '{}'),
  ('rich_text', 'Texto rico seguro', 'content', 'rich-text', array['guided','designer'], 30, 131072, '{}'),
  ('image', 'Imagem', 'media', 'image', array['guided','designer'], 30, 32768, '{}'),
  ('gallery', 'Galeria', 'media', 'gallery', array['guided','designer'], 10, 131072, '{}'),
  ('benefit_grid', 'Grade de benefícios', 'content', 'benefit-grid', array['guided','designer'], 10, 131072, '{}'),
  ('content_grid', 'Grade de conteúdo', 'content', 'content-grid', array['guided','designer'], 10, 131072, '{}'),
  ('steps', 'Etapas', 'content', 'steps', array['guided','designer'], 10, 131072, '{}'),
  ('metrics', 'Métricas', 'data', 'metrics', array['guided','designer'], 10, 65536, '{}'),
  ('testimonial', 'Depoimento', 'content', 'testimonial', array['guided','designer'], 10, 65536, '{}'),
  ('faq', 'Perguntas frequentes', 'content', 'faq', array['guided','designer'], 10, 131072, '{}'),
  ('form', 'Formulário governado', 'conversion', 'form', array['guided','designer'], 5, 32768, '{}'),
  ('cta', 'Chamada para ação', 'conversion', 'cta', array['guided','designer'], 10, 32768, '{}'),
  ('related_content', 'Conteúdo relacionado', 'data', 'related-content', array['guided','designer'], 10, 65536, '{}'),
  ('split_content', 'Conteúdo dividido', 'structure', 'split-content', array['guided','designer'], 15, 65536, '{}'),
  ('logo_cloud', 'Nuvem de marcas', 'media', 'logo-cloud', array['guided','designer'], 5, 131072, '{}'),
  ('tabs', 'Abas', 'content', 'tabs', array['guided','designer'], 8, 131072, '{}'),
  ('comparison_table', 'Tabela comparativa', 'data', 'comparison-table', array['guided','designer'], 5, 196608, '{}'),
  ('alert', 'Aviso', 'content', 'alert', array['guided','designer'], 10, 32768, '{}'),
  ('timeline', 'Linha do tempo', 'content', 'timeline', array['guided','designer'], 8, 131072, '{}'),
  ('link_list', 'Lista de links', 'content', 'link-list', array['guided','designer'], 10, 131072, '{}')
on conflict (component_key) do nothing;

insert into public.cms_component_versions (component_key, version, schema_contract, renderer_key)
select
  component_key,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'layout', jsonb_build_object('desktop', 12, 'tablet', 8, 'mobile', 4),
    'arbitraryCode', false,
    'sanitizedLinks', true
  ),
  renderer_key
from public.cms_component_definitions
where component_key in (
  'hero','rich_text','image','gallery','benefit_grid','content_grid','steps','metrics',
  'testimonial','faq','form','cta','related_content','split_content','logo_cloud','tabs',
  'comparison_table','alert','timeline','link_list'
)
on conflict (component_key, version) do nothing;

create function private.cms_ev2_individual_flag_context(
  p_actor_id uuid,
  p_flag_key text,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_user_count integer := 0;
  v_matching_count integer := 0;
  v_broad_count integer := 0;
  v_enabled boolean := false;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_actor_id is null
     or p_flag_key not in ('ev2.visual_studio', 'ev2.multisite')
     or p_environment not in ('local', 'staging') then
    return jsonb_build_object('enabled', false, 'source', 'scope_invalid');
  end if;

  select * into v_flag
  from public.cms_feature_flags
  where flag_key = p_flag_key
    and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object('enabled', false, 'source', 'flag_unavailable');
  end if;
  if v_flag.kill_switch then
    return jsonb_build_object('enabled', false, 'source', 'kill_switch');
  end if;
  if v_flag.default_enabled then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;

  select count(*) into v_broad_count
  from public.cms_feature_flag_overrides
  where flag_key = p_flag_key
    and scope_type <> 'user'
    and enabled
    and starts_at <= now()
    and expires_at > now();

  if v_broad_count > 0 then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;

  select
    count(*),
    count(*) filter (where environment = p_environment),
    bool_or(enabled) filter (where environment = p_environment),
    min(starts_at) filter (where environment = p_environment),
    min(expires_at) filter (where environment = p_environment)
  into v_user_count, v_matching_count, v_enabled, v_starts_at, v_expires_at
  from public.cms_feature_flag_overrides
  where flag_key = p_flag_key
    and scope_type = 'user'
    and scope_key = p_actor_id::text
    and starts_at <= now()
    and expires_at > now();

  if v_user_count <> 1 or v_matching_count <> 1 then
    return jsonb_build_object(
      'enabled', false,
      'source', case when v_user_count > 1 then 'ambiguous_user_overrides' else 'individual_override_required' end
    );
  end if;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('enabled', false, 'source', 'user_override_off');
  end if;
  if v_expires_at > v_starts_at + interval '30 minutes'
     or v_expires_at > now() + interval '30 minutes' then
    return jsonb_build_object('enabled', false, 'source', 'override_window_invalid');
  end if;

  return jsonb_build_object(
    'enabled', true,
    'source', 'individual_override',
    'environment', p_environment,
    'expiresAt', v_expires_at
  );
end;
$$;

create function private.cms_json_contains_unsafe_visual_value(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_item jsonb;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value) = 'string' then
    return trim(both '"' from p_value::text) ~*
      '<\s*/?\s*(script|style|iframe|object|embed|svg|math|link|meta|base|template)\y|(?:javascript|vbscript)\s*:|data\s*:\s*text/html|\yon[a-z]+\s*=';
  end if;
  if jsonb_typeof(p_value) = 'array' then
    for v_item in select value from jsonb_array_elements(p_value)
    loop
      if private.cms_json_contains_unsafe_visual_value(v_item) then return true; end if;
    end loop;
    return false;
  end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_item in select key, value from jsonb_each(p_value)
    loop
      if lower(v_key) in (
        'html', 'rawhtml', 'css', 'javascript', 'script', 'style',
        'srcdoc', 'dangerouslysetinnerhtml', 'object', 'embed', 'svg',
        'math', 'link', 'meta', 'base', 'template'
      ) or lower(v_key) ~ '^on[a-z]+$' then
        return true;
      end if;
      if private.cms_json_contains_unsafe_visual_value(v_item) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create function private.cms_validate_visual_document(
  p_document jsonb,
  p_site_key text,
  p_environment text,
  p_item_id uuid,
  p_branch_key text
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_node jsonb;
  v_item jsonb;
  v_row jsonb;
  v_breakpoint text;
  v_columns integer;
  v_span integer;
  v_start integer;
  v_type text;
  v_definition public.cms_component_definitions%rowtype;
  v_group record;
  v_group_span integer;
  v_group_has_start boolean;
begin
  if jsonb_typeof(p_document) is distinct from 'object'
     or coalesce(p_document ->> 'schemaVersion', '') <> '1'
     or coalesce(p_document ->> 'registryVersion', '') <> '1'
     or p_document ->> 'itemId' is distinct from p_item_id::text
     or p_document ->> 'siteKey' is distinct from p_site_key
     or p_document ->> 'environment' is distinct from p_environment
     or p_document ->> 'branchKey' is distinct from p_branch_key
     or coalesce(p_document ->> 'themeKey', '') !~ '^[a-z][a-z0-9-]{1,63}$'
     or coalesce(p_document ->> 'mode', '') not in ('guided', 'designer')
     or p_document #>> '{grid,desktop}' is distinct from '12'
     or p_document #>> '{grid,tablet}' is distinct from '8'
     or p_document #>> '{grid,mobile}' is distinct from '4'
     or jsonb_typeof(p_document -> 'nodes') is distinct from 'array'
     or jsonb_array_length(p_document -> 'nodes') not between 1 and 80
     or jsonb_typeof(p_document -> 'bindings') is distinct from 'array'
     or jsonb_array_length(p_document -> 'bindings') > 200
     or octet_length(p_document::text) > 1048576
     or private.cms_json_contains_unsafe_visual_value(p_document) then
    raise exception 'CMS_VISUAL_DOCUMENT_INVALID' using errcode = '23514';
  end if;

  if (select count(*) from jsonb_array_elements(p_document -> 'nodes')) <>
     (select count(distinct value ->> 'id') from jsonb_array_elements(p_document -> 'nodes')) then
    raise exception 'CMS_VISUAL_NODE_ID_DUPLICATE' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_array_elements(p_document -> 'nodes') where value ->> 'type' = 'hero') > 1 then
    raise exception 'CMS_VISUAL_HERO_LIMIT' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.cms_themes theme
    join public.cms_sites site on site.id = theme.site_id
    where site.site_key = p_site_key
      and theme.theme_key = p_document ->> 'themeKey'
      and theme.status = 'active'
  ) then
    raise exception 'CMS_VISUAL_THEME_INVALID' using errcode = '23514';
  end if;

  for v_node in select value from jsonb_array_elements(p_document -> 'nodes')
  loop
    v_type := v_node ->> 'type';
    if coalesce(v_node ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_type, '') not in (
         'hero','rich_text','image','gallery','benefit_grid','content_grid','steps','metrics',
         'testimonial','faq','form','cta','related_content','split_content','logo_cloud','tabs',
         'comparison_table','alert','timeline','link_list'
       )
       or coalesce(v_node ->> 'componentVersion', '') <> '1'
       or coalesce(v_node ->> 'hidden', '') not in ('true', 'false')
       or (v_node ->> 'anchor' is not null and v_node ->> 'anchor' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
       or (v_node ->> 'groupId' is not null and v_node ->> 'groupId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or (v_node ->> 'symbolId' is not null and v_node ->> 'symbolId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or coalesce(v_node ->> 'width', '') not in ('content', 'wide', 'full')
       or coalesce(v_node ->> 'tone', '') not in ('light', 'muted', 'dark', 'brand')
       or jsonb_typeof(v_node -> 'data') is distinct from 'object'
       or jsonb_typeof(v_node -> 'layout') is distinct from 'object' then
      raise exception 'CMS_VISUAL_NODE_INVALID:%', coalesce(v_type, 'unknown') using errcode = '23514';
    end if;

    select * into v_definition
    from public.cms_component_definitions definition
    where definition.component_key = v_type and definition.active;
    if not found
       or not (p_document ->> 'mode' = any(v_definition.allowed_modes))
       or octet_length((v_node -> 'data')::text) > v_definition.max_payload_bytes
       or not exists (
         select 1 from public.cms_component_versions version
         where version.component_key = v_type
           and version.version = (v_node ->> 'componentVersion')::integer
       )
       or (
         select count(*) from jsonb_array_elements(p_document -> 'nodes') candidate
         where candidate ->> 'type' = v_type
       ) > v_definition.max_instances then
      raise exception 'CMS_VISUAL_COMPONENT_BUDGET_INVALID:%', v_type using errcode = '23514';
    end if;

    foreach v_breakpoint in array array['desktop', 'tablet', 'mobile']
    loop
      v_columns := case v_breakpoint when 'desktop' then 12 when 'tablet' then 8 else 4 end;
      if jsonb_typeof(v_node #> array['layout', v_breakpoint]) is distinct from 'object'
         or coalesce(v_node #>> array['layout', v_breakpoint, 'span'], '') !~ '^[0-9]+$'
         or (
           v_node #>> array['layout', v_breakpoint, 'start'] is not null
           and v_node #>> array['layout', v_breakpoint, 'start'] !~ '^[0-9]+$'
         )
         or coalesce(v_node #>> array['layout', v_breakpoint, 'hidden'], '') not in ('true', 'false') then
        raise exception 'CMS_VISUAL_LAYOUT_INVALID:%', v_breakpoint using errcode = '23514';
      end if;
      v_span := (v_node #>> array['layout', v_breakpoint, 'span'])::integer;
      v_start := nullif(v_node #>> array['layout', v_breakpoint, 'start'], '')::integer;
      if v_span not between 1 and v_columns
         or (v_start is not null and (v_start not between 1 and v_columns or v_start + v_span - 1 > v_columns)) then
        raise exception 'CMS_VISUAL_LAYOUT_INVALID:%', v_breakpoint using errcode = '23514';
      end if;
    end loop;

    if jsonb_typeof(v_node #> '{data,items}') = 'array' and exists (
      select 1
      from jsonb_array_elements(v_node #> '{data,items}') item
      where coalesce(item ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception 'CMS_VISUAL_ITEM_ID_INVALID:%', v_type using errcode = '23514';
    end if;
    if jsonb_typeof(v_node #> '{data,items}') = 'array' and (
      select count(*) from jsonb_array_elements(v_node #> '{data,items}')
    ) <> (
      select count(distinct item ->> 'id') from jsonb_array_elements(v_node #> '{data,items}') item
    ) then
      raise exception 'CMS_VISUAL_ITEM_ID_DUPLICATE:%', v_type using errcode = '23514';
    end if;

    if v_type = 'hero' and (
         char_length(btrim(coalesce(v_node #>> '{data,title}', ''))) not between 1 and 220
         or char_length(coalesce(v_node #>> '{data,text}', '')) > 1200
         or coalesce(v_node #>> '{data,alignment}', '') not in ('left', 'center')
         or (v_node #>> '{data,assetId}' is not null and v_node #>> '{data,assetId}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
         or (v_node #> '{data,primaryCta}' is not null and not coalesce(public.cms_public_link_valid(v_node #>> '{data,primaryCta,href}'), false))
         or (v_node #> '{data,secondaryCta}' is not null and not coalesce(public.cms_public_link_valid(v_node #>> '{data,secondaryCta,href}'), false))
       ) then
      raise exception 'CMS_VISUAL_HERO_INVALID' using errcode = '23514';
    elsif v_type = 'rich_text' and (
      char_length(btrim(coalesce(v_node #>> '{data,text}', ''))) not between 1 and 20000
      or char_length(coalesce(v_node #>> '{data,heading}', '')) > 220
    ) then
      raise exception 'CMS_VISUAL_RICH_TEXT_INVALID' using errcode = '23514';
    elsif v_type = 'image' and (
      coalesce(v_node #>> '{data,assetId}', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or char_length(btrim(coalesce(v_node #>> '{data,alt}', ''))) not between 1 and 300
      or coalesce(v_node #>> '{data,fit}', '') not in ('cover', 'contain')
    ) then
      raise exception 'CMS_VISUAL_IMAGE_INVALID' using errcode = '23514';
    elsif v_type = 'gallery' and (
      jsonb_typeof(v_node #> '{data,assetIds}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,assetIds}') not between 1 and 24
      or coalesce(v_node #>> '{data,columns}', '') !~ '^[2-4]$'
      or exists (
        select 1 from jsonb_array_elements_text(v_node #> '{data,assetIds}') as assets(asset_id)
        where asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    ) then
      raise exception 'CMS_VISUAL_GALLERY_INVALID' using errcode = '23514';
    elsif v_type in ('benefit_grid', 'steps') and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,items}') not between 1 and
        (case when v_type = 'benefit_grid' then 12 else 20 end)
      or exists (
        select 1 from jsonb_array_elements(v_node #> '{data,items}') item
        where char_length(btrim(coalesce(item ->> 'title', ''))) not between 1 and 160
          or char_length(btrim(coalesce(item ->> 'text', ''))) not between 1 and 800
      )
    ) then
      raise exception 'CMS_VISUAL_ITEMS_INVALID:%', v_type using errcode = '23514';
    elsif v_type = 'content_grid' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,items}') not between 1 and 24
      or coalesce(v_node #>> '{data,columns}', '') !~ '^[2-4]$'
      or exists (
        select 1 from jsonb_array_elements(v_node #> '{data,items}') item
        where char_length(btrim(coalesce(item ->> 'title', ''))) not between 1 and 160
          or char_length(coalesce(item ->> 'text', '')) > 800
          or (item ->> 'href' is not null and item ->> 'href' !~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$')
          or (item ->> 'assetId' is not null and item ->> 'assetId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      )
    ) then
      raise exception 'CMS_VISUAL_CONTENT_GRID_INVALID' using errcode = '23514';
    elsif v_type = 'metrics' and (
      jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,items}') not between 1 and 12
      or exists (
        select 1 from jsonb_array_elements(v_node #> '{data,items}') item
        where char_length(btrim(coalesce(item ->> 'value', ''))) not between 1 and 80
          or char_length(btrim(coalesce(item ->> 'label', ''))) not between 1 and 160
      )
    ) then
      raise exception 'CMS_VISUAL_METRICS_INVALID' using errcode = '23514';
    elsif v_type = 'testimonial' and (
      char_length(btrim(coalesce(v_node #>> '{data,quote}', ''))) not between 1 and 2000
      or char_length(btrim(coalesce(v_node #>> '{data,author}', ''))) not between 1 and 160
      or char_length(coalesce(v_node #>> '{data,role}', '')) > 160
    ) then
      raise exception 'CMS_VISUAL_TESTIMONIAL_INVALID' using errcode = '23514';
    elsif v_type = 'faq' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,items}') not between 1 and 30
      or exists (
        select 1 from jsonb_array_elements(v_node #> '{data,items}') item
        where char_length(btrim(coalesce(item ->> 'question', ''))) not between 1 and 300
          or char_length(btrim(coalesce(item ->> 'answer', ''))) not between 1 and 3000
      )
    ) then
      raise exception 'CMS_VISUAL_FAQ_INVALID' using errcode = '23514';
    elsif v_type = 'form' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or coalesce(v_node #>> '{data,formKey}', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(btrim(coalesce(v_node #>> '{data,buttonLabel}', ''))) not between 1 and 120
      or (v_node #>> '{data,formId}' is not null and v_node #>> '{data,formId}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (v_node #>> '{data,formVersionId}' is not null and v_node #>> '{data,formVersionId}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    ) then
      raise exception 'CMS_VISUAL_FORM_INVALID' using errcode = '23514';
    elsif v_type = 'cta' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or char_length(btrim(coalesce(v_node #>> '{data,link,label}', ''))) not between 1 and 120
      or not coalesce(public.cms_public_link_valid(v_node #>> '{data,link,href}'), false)
    ) then
      raise exception 'CMS_VISUAL_CTA_INVALID' using errcode = '23514';
    elsif v_type = 'related_content' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or jsonb_typeof(v_node #> '{data,itemIds}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,itemIds}') not between 1 and 24
      or coalesce(v_node #>> '{data,presentation}', '') not in ('cards', 'list')
      or exists (
        select 1 from jsonb_array_elements_text(v_node #> '{data,itemIds}') as items(item_id)
        where item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    ) then
      raise exception 'CMS_VISUAL_RELATED_CONTENT_INVALID' using errcode = '23514';
    elsif v_type = 'split_content' and (
         char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
         or char_length(btrim(coalesce(v_node #>> '{data,text}', ''))) not between 1 and 5000
         or coalesce(v_node #>> '{data,assetId}', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or char_length(btrim(coalesce(v_node #>> '{data,alt}', ''))) not between 1 and 300
         or coalesce(v_node #>> '{data,imagePosition}', '') not in ('left', 'right')
         or (v_node #>> '{data,link,href}' is not null and not coalesce(public.cms_public_link_valid(v_node #>> '{data,link,href}'), false))
       ) then
      raise exception 'CMS_VISUAL_SPLIT_INVALID' using errcode = '23514';
    elsif v_type = 'logo_cloud' then
      if jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
         or jsonb_array_length(v_node #> '{data,items}') not between 1 and 24 then
        raise exception 'CMS_VISUAL_LOGO_CLOUD_INVALID' using errcode = '23514';
      end if;
      for v_item in select value from jsonb_array_elements(v_node #> '{data,items}')
      loop
        if coalesce(v_item ->> 'assetId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or char_length(btrim(coalesce(v_item ->> 'alt', ''))) not between 1 and 300
           or (v_item ->> 'href' is not null and not coalesce(public.cms_public_link_valid(v_item ->> 'href'), false)) then
          raise exception 'CMS_VISUAL_LOGO_CLOUD_INVALID' using errcode = '23514';
        end if;
      end loop;
    elsif v_type = 'tabs' then
      if jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
         or jsonb_array_length(v_node #> '{data,items}') not between 2 and 8
         or exists (
           select 1 from jsonb_array_elements(v_node #> '{data,items}') x
           where char_length(btrim(coalesce(x ->> 'label', ''))) not between 1 and 80
             or char_length(btrim(coalesce(x ->> 'heading', ''))) not between 1 and 180
             or char_length(btrim(coalesce(x ->> 'text', ''))) not between 1 and 3000
         ) then
        raise exception 'CMS_VISUAL_TABS_INVALID' using errcode = '23514';
      end if;
    elsif v_type = 'comparison_table' then
      if char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
         or char_length(btrim(coalesce(v_node #>> '{data,caption}', ''))) not between 1 and 500
         or jsonb_typeof(v_node #> '{data,columns}') is distinct from 'array'
         or jsonb_array_length(v_node #> '{data,columns}') not between 2 and 5
         or jsonb_typeof(v_node #> '{data,rows}') is distinct from 'array'
         or jsonb_array_length(v_node #> '{data,rows}') not between 1 and 30 then
        raise exception 'CMS_VISUAL_COMPARISON_INVALID' using errcode = '23514';
      end if;
      if (
        select count(*) from jsonb_array_elements_text(v_node #> '{data,columns}')
      ) <> (
        select count(distinct lower(btrim(column_name)))
        from jsonb_array_elements_text(v_node #> '{data,columns}') as columns_list(column_name)
      ) or exists (
        select 1 from jsonb_array_elements_text(v_node #> '{data,columns}') as columns_list(column_name)
        where char_length(btrim(column_name)) not between 1 and 100
      ) then
        raise exception 'CMS_VISUAL_COMPARISON_COLUMNS_INVALID' using errcode = '23514';
      end if;
      for v_row in select value from jsonb_array_elements(v_node #> '{data,rows}')
      loop
        if coalesce(v_row ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or char_length(btrim(coalesce(v_row ->> 'label', ''))) not between 1 and 160
           or jsonb_typeof(v_row -> 'values') is distinct from 'array'
           or jsonb_array_length(v_row -> 'values') <> jsonb_array_length(v_node #> '{data,columns}')
           or exists (
             select 1 from jsonb_array_elements_text(v_row -> 'values') as values_list(cell_value)
             where char_length(cell_value) > 500
           ) then
          raise exception 'CMS_VISUAL_COMPARISON_INVALID' using errcode = '23514';
        end if;
      end loop;
      if (
        select count(*) from jsonb_array_elements(v_node #> '{data,rows}')
      ) <> (
        select count(distinct row_value ->> 'id') from jsonb_array_elements(v_node #> '{data,rows}') row_value
      ) then
        raise exception 'CMS_VISUAL_COMPARISON_ROW_DUPLICATE' using errcode = '23514';
      end if;
    elsif v_type = 'alert' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 180
      or char_length(btrim(coalesce(v_node #>> '{data,text}', ''))) not between 1 and 2000
      or coalesce(v_node #>> '{data,severity}', '') not in ('info', 'success', 'warning')
      or (v_node #>> '{data,link,href}' is not null and not coalesce(public.cms_public_link_valid(v_node #>> '{data,link,href}'), false))
    ) then
      raise exception 'CMS_VISUAL_ALERT_INVALID' using errcode = '23514';
    elsif v_type = 'timeline' and (
      char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
      or jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
      or jsonb_array_length(v_node #> '{data,items}') not between 2 and 20
      or exists (
        select 1 from jsonb_array_elements(v_node #> '{data,items}') x
        where char_length(btrim(coalesce(x ->> 'label', ''))) not between 1 and 80
          or char_length(btrim(coalesce(x ->> 'title', ''))) not between 1 and 180
          or char_length(btrim(coalesce(x ->> 'text', ''))) not between 1 and 1500
      )
    ) then
      raise exception 'CMS_VISUAL_TIMELINE_INVALID' using errcode = '23514';
    elsif v_type = 'link_list' then
      if char_length(btrim(coalesce(v_node #>> '{data,heading}', ''))) not between 1 and 220
         or jsonb_typeof(v_node #> '{data,items}') is distinct from 'array'
         or jsonb_array_length(v_node #> '{data,items}') not between 1 and 30
         or exists (
           select 1 from jsonb_array_elements(v_node #> '{data,items}') x
           where char_length(btrim(coalesce(x ->> 'label', ''))) not between 1 and 160
             or not coalesce(public.cms_public_link_valid(x ->> 'href'), false)
             or char_length(coalesce(x ->> 'description', '')) > 500
         ) then
        raise exception 'CMS_VISUAL_LINK_LIST_INVALID' using errcode = '23514';
      end if;
    end if;
  end loop;

  if exists (
    with referenced_assets(asset_id) as (
      select (node #>> '{data,assetId}')::uuid
      from jsonb_array_elements(p_document -> 'nodes') node
      where node ->> 'type' in ('hero', 'image', 'split_content')
        and node #>> '{data,assetId}' is not null
      union all
      select asset_id::uuid
      from jsonb_array_elements(p_document -> 'nodes') node
      cross join lateral jsonb_array_elements_text(node #> '{data,assetIds}') assets(asset_id)
      where node ->> 'type' = 'gallery'
      union all
      select (item ->> 'assetId')::uuid
      from jsonb_array_elements(p_document -> 'nodes') node
      cross join lateral jsonb_array_elements(node #> '{data,items}') item
      where node ->> 'type' in ('content_grid', 'logo_cloud')
        and item ->> 'assetId' is not null
    )
    select 1
    from referenced_assets referenced
    where not public.cms_dam_asset_publishable(referenced.asset_id, now())
  ) then
    raise exception 'CMS_VISUAL_MEDIA_REFERENCE_INVALID' using errcode = '23514';
  end if;

  if exists (
    with referenced_items(item_id) as (
      select item_id::uuid
      from jsonb_array_elements(p_document -> 'nodes') node
      cross join lateral jsonb_array_elements_text(node #> '{data,itemIds}') items(item_id)
      where node ->> 'type' = 'related_content'
    )
    select 1
    from referenced_items referenced
    left join public.cms_content_items item on item.id = referenced.item_id
    where item.id is null
       or item.id = p_item_id
       or item.content_type not in ('product', 'service', 'industry', 'application', 'solution', 'page')
       or item.workflow_status = 'trashed'
  ) then
    raise exception 'CMS_VISUAL_CONTENT_REFERENCE_INVALID' using errcode = '23514';
  end if;

  for v_group in
    select
      node ->> 'groupId' as group_id,
      min(ordinality)::integer as first_position,
      max(ordinality)::integer as last_position,
      count(*)::integer as member_count
    from jsonb_array_elements(p_document -> 'nodes') with ordinality grouped(node, ordinality)
    where node ->> 'groupId' is not null
    group by node ->> 'groupId'
  loop
    if v_group.member_count < 2
       or v_group.last_position - v_group.first_position + 1 <> v_group.member_count then
      raise exception 'CMS_VISUAL_GROUP_INVALID:%', v_group.group_id using errcode = '23514';
    end if;
    foreach v_breakpoint in array array['desktop', 'tablet', 'mobile']
    loop
      v_columns := case v_breakpoint when 'desktop' then 12 when 'tablet' then 8 else 4 end;
      select
        coalesce(sum((node #>> array['layout', v_breakpoint, 'span'])::integer), 0),
        bool_or(node #>> array['layout', v_breakpoint, 'start'] is not null)
      into v_group_span, v_group_has_start
      from jsonb_array_elements(p_document -> 'nodes') node
      where node ->> 'groupId' = v_group.group_id;
      if v_group_span > v_columns or coalesce(v_group_has_start, false) then
        raise exception 'CMS_VISUAL_GROUP_LAYOUT_INVALID:%', v_group.group_id using errcode = '23514';
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_document -> 'bindings') binding
    where jsonb_typeof(binding) is distinct from 'object'
       or coalesce(binding ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(binding ->> 'nodeId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(binding ->> 'property', '') !~ '^[a-z][a-zA-Z0-9.]{0,119}$'
       or coalesce(binding ->> 'source', '') not in ('content', 'site', 'static')
       or (binding ->> 'sourceId' is not null and binding ->> 'sourceId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or coalesce(binding ->> 'path', '') !~ '^[a-z][a-zA-Z0-9.\[\]_-]{0,199}$'
       or not exists (
         select 1 from jsonb_array_elements(p_document -> 'nodes') node
         where node ->> 'id' = binding ->> 'nodeId'
       )
  ) then
    raise exception 'CMS_VISUAL_BINDING_INVALID' using errcode = '23514';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_document -> 'bindings')
  ) <> (
    select count(distinct binding ->> 'id') from jsonb_array_elements(p_document -> 'bindings') binding
  ) or (
    select count(*) from jsonb_array_elements(p_document -> 'bindings')
  ) <> (
    select count(distinct (binding ->> 'nodeId', binding ->> 'property'))
    from jsonb_array_elements(p_document -> 'bindings') binding
  ) then
    raise exception 'CMS_VISUAL_BINDING_DUPLICATE' using errcode = '23514';
  end if;
end;
$$;

create function private.cms_ev2_actor_authorized_for_scope(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_environment not in ('local', 'staging') or p_site_key <> 'main' then return false; end if;
  v_result := private.cms_actor_authorization_result(
    p_actor_id, p_permission, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_result ->> 'allowed')::boolean, false) is not true then return false; end if;
  if v_result ->> 'scopeSource' = 'legacy' then return true; end if;
  return v_result ->> 'environment' is not distinct from p_environment
    and v_result ->> 'siteKey' is not distinct from p_site_key;
end;
$$;

create function public.cms_visual_capability(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_context jsonb;
  v_authorized boolean := false;
begin
  v_context := private.cms_ev2_individual_flag_context(
    p_actor_id, 'ev2.visual_studio', p_environment
  );
  if p_site_key = 'main' and coalesce((v_context ->> 'enabled')::boolean, false) then
    v_authorized := private.cms_ev2_actor_authorized_for_scope(
      p_actor_id, 'cms:visual.read', p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', v_authorized,
    'source', case when v_authorized then 'individual_override' else coalesce(v_context ->> 'source', 'forbidden') end,
    'siteKey', p_site_key,
    'environment', p_environment,
    'registryVersion', 1,
    'componentCount', 20,
    'multisiteOperational', false
  );
end;
$$;

create function private.cms_visual_assert_available(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_capability jsonb;
begin
  v_capability := public.cms_visual_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_VISUAL_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if p_permission !~ '^cms:visual\.[a-z_]+$'
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_VISUAL_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create function public.cms_get_visual_catalog(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_id uuid;
  v_theme record;
  v_components jsonb;
begin
  if p_correlation_id is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;
  perform private.cms_visual_assert_available(
    p_actor_id, 'cms:visual.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  select id into strict v_site_id from public.cms_sites where site_key = p_site_key and status = 'active';
  select theme.theme_key, token.version, token.tokens
  into strict v_theme
  from public.cms_themes theme
  join lateral (
    select version, tokens from public.cms_design_tokens
    where theme_id = theme.id order by version desc limit 1
  ) token on true
  where theme.site_id = v_site_id and theme.status = 'active'
  order by theme.created_at
  limit 1;

  select jsonb_agg(
    jsonb_build_object(
      'key', definition.component_key,
      'name', definition.name,
      'category', definition.category,
      'version', version.version,
      'rendererKey', version.renderer_key,
      'allowedModes', to_jsonb(definition.allowed_modes),
      'budget', jsonb_build_object(
        'maxInstances', definition.max_instances,
        'maxPayloadBytes', definition.max_payload_bytes
      ),
      'defaultProps', definition.default_props
    ) order by definition.component_key
  ) into v_components
  from public.cms_component_definitions definition
  join public.cms_component_versions version
    on version.component_key = definition.component_key and version.version = 1
  where definition.active;

  if jsonb_array_length(coalesce(v_components, '[]'::jsonb)) <> 20 then
    raise exception 'CMS_VISUAL_REGISTRY_INCOMPLETE' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'registryVersion', 1,
    'components', v_components,
    'theme', jsonb_build_object(
      'key', v_theme.theme_key,
      'version', v_theme.version,
      'tokens', v_theme.tokens
    ),
    'environment', p_environment,
    'siteKey', p_site_key,
    'correlationId', p_correlation_id
  );
end;
$$;

create function public.cms_list_visual_branches(
  p_actor_id uuid,
  p_item_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform private.cms_visual_assert_available(
    p_actor_id, 'cms:visual.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if p_item_id is null or p_correlation_id is null then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', branch.id,
      'itemId', branch.item_id,
      'branchKey', branch.branch_key,
      'status', branch.status,
      'baseRevisionId', branch.base_revision_id,
      'lockVersion', branch.lock_version,
      'documentVersion', document.lock_version,
      'documentHash', document.document_hash,
      'updatedAt', document.updated_at
    ) order by document.updated_at desc
  ), '[]'::jsonb) into v_result
  from public.cms_page_branches branch
  join public.cms_visual_documents document on document.branch_id = branch.id
  join public.cms_sites site on site.id = branch.site_id
  where branch.item_id = p_item_id
    and site.site_key = p_site_key
    and branch.environment = p_environment;
  return jsonb_build_object(
    'schemaVersion', 1,
    'branches', v_result,
    'correlationId', p_correlation_id
  );
end;
$$;

create function public.cms_get_visual_document(
  p_actor_id uuid,
  p_branch_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch public.cms_page_branches%rowtype;
  v_document public.cms_visual_documents%rowtype;
  v_snapshots jsonb;
begin
  perform private.cms_visual_assert_available(
    p_actor_id, 'cms:visual.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  select branch.* into strict v_branch
  from public.cms_page_branches branch
  join public.cms_sites site on site.id = branch.site_id
  where branch.id = p_branch_id
    and branch.environment = p_environment
    and site.site_key = p_site_key;
  select * into strict v_document
  from public.cms_visual_documents
  where branch_id = v_branch.id
    and site_id = v_branch.site_id
    and environment = v_branch.environment;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', snapshot.id,
      'breakpoint', snapshot.breakpoint,
      'sourceVersion', snapshot.source_version,
      'snapshotHash', snapshot.snapshot_hash,
      'createdAt', snapshot.created_at
    ) order by snapshot.created_at desc, snapshot.breakpoint
  ), '[]'::jsonb) into v_snapshots
  from public.cms_visual_snapshots snapshot
  where snapshot.branch_id = v_branch.id;
  return jsonb_build_object(
    'schemaVersion', 1,
    'branch', jsonb_build_object(
      'id', v_branch.id,
      'itemId', v_branch.item_id,
      'branchKey', v_branch.branch_key,
      'status', v_branch.status,
      'baseRevisionId', v_branch.base_revision_id,
      'lockVersion', v_branch.lock_version,
      'documentVersion', v_document.lock_version,
      'documentHash', v_document.document_hash,
      'updatedAt', v_document.updated_at
    ),
    'document', v_document.document,
    'snapshots', v_snapshots,
    'correlationId', p_correlation_id
  );
end;
$$;

create function public.cms_sites_capability(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_context jsonb;
  v_authorized boolean := false;
begin
  v_context := private.cms_ev2_individual_flag_context(
    p_actor_id, 'ev2.multisite', p_environment
  );
  if p_site_key = 'main' and coalesce((v_context ->> 'enabled')::boolean, false) then
    v_authorized := private.cms_ev2_actor_authorized_for_scope(
      p_actor_id, 'cms:sites.read', p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', v_authorized,
    'source', case when v_authorized then 'individual_override' else coalesce(v_context ->> 'source', 'forbidden') end,
    'siteKey', p_site_key,
    'environment', p_environment,
    'multisiteOperational', false,
    'productionEnabled', false
  );
end;
$$;

create function private.cms_sites_assert_available(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_capability jsonb;
begin
  v_capability := public.cms_sites_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_SITES_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if p_permission !~ '^cms:sites\.[a-z_]+$'
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_SITES_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create function public.cms_get_site_registry(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sites jsonb;
begin
  perform private.cms_sites_assert_available(
    p_actor_id, 'cms:sites.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  select coalesce(jsonb_agg(site_result order by site_result ->> 'key'), '[]'::jsonb)
  into v_sites
  from (
    select jsonb_build_object(
      'id', site.id,
      'key', site.site_key,
      'name', site.display_name,
      'purpose', site.purpose,
      'status', site.status,
      'lockVersion', site.lock_version,
      'primary', site.is_primary,
      'synthetic', site.is_synthetic,
      'defaultLanguage', site.default_language,
      'timezone', site.timezone,
      'environments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', environment.id,
          'key', environment.environment,
          'status', environment.status
        ) order by environment.environment)
        from public.cms_site_environments environment
        where environment.site_id = site.id
      ), '[]'::jsonb),
      'domains', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', domain.id,
          'environment', domain.environment,
          'hostname', domain.hostname,
          'status', domain.status
        ) order by domain.hostname)
        from public.cms_site_domains domain
        where domain.site_id = site.id
      ), '[]'::jsonb),
      'themeKey', (
        select theme.theme_key from public.cms_themes theme
        where theme.site_id = site.id and theme.status = 'active'
        order by theme.created_at limit 1
      )
    ) as site_result
    from public.cms_sites site
    where site.site_key = 'main'
       or (
         site.is_synthetic
         and site.site_key like 'g9x-%'
         and site.created_by = p_actor_id
       )
  ) registry;
  return jsonb_build_object(
    'schemaVersion', 1,
    'sites', v_sites,
    'multisiteOperational', false,
    'productionEnabled', false,
    'correlationId', p_correlation_id
  );
end;
$$;

create function public.cms_execute_visual_command(
  p_actor_id uuid,
  p_action text,
  p_branch_id uuid,
  p_item_id uuid,
  p_payload jsonb,
  p_expected_version bigint,
  p_expected_draft_version bigint,
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
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_visual_command_receipts%rowtype;
  v_site public.cms_sites%rowtype;
  v_branch public.cms_page_branches%rowtype;
  v_document public.cms_visual_documents%rowtype;
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_branch_key text;
  v_mode text;
  v_document_json jsonb;
  v_nodes jsonb;
  v_node jsonb;
  v_hash text;
  v_response jsonb;
  v_snapshot_group_id uuid;
  v_breakpoint text;
  v_snapshot jsonb;
  v_symbol public.cms_visual_symbols%rowtype;
  v_new_payload jsonb;
  v_base_revision_id uuid;
  v_conflict_resolution jsonb;
  v_event_type text;
begin
  if p_actor_id is null
     or p_action not in ('create_branch', 'save_document', 'snapshot', 'create_symbol', 'apply_to_draft', 'abandon')
     or p_environment not in ('local', 'staging')
     or p_site_key <> 'main'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_aal is distinct from 'aal2' then
    raise exception 'CMS_VISUAL_MFA_REQUIRED' using errcode = '42501';
  end if;

  v_permission := case p_action
    when 'create_branch' then 'cms:visual.branch'
    when 'save_document' then 'cms:visual.edit'
    when 'snapshot' then 'cms:visual.snapshot'
    when 'create_symbol' then 'cms:visual.symbols'
    when 'apply_to_draft' then 'cms:visual.apply'
    when 'abandon' then 'cms:visual.branch'
  end;
  perform private.cms_visual_assert_available(
    p_actor_id, v_permission, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  select * into strict v_site
  from public.cms_sites
  where site_key = p_site_key and status = 'active' and is_primary and not is_synthetic;

  insert into public.cms_visual_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash,
    branch_id, correlation_id
  ) values (
    p_actor_id, p_action, p_idempotency_key, p_command_id, p_request_hash,
    p_branch_id, p_correlation_id
  ) on conflict (actor_id, action, idempotency_key) do nothing;

  select * into strict v_receipt
  from public.cms_visual_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key
  for update;
  if v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_VISUAL_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  if v_receipt.command_id <> p_command_id and v_receipt.response is null then
    raise exception 'CMS_VISUAL_COMMAND_IN_PROGRESS' using errcode = 'PT409';
  end if;
  if v_receipt.response is not null then
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'create_branch' then
    v_branch_key := p_payload ->> 'branchKey';
    v_mode := coalesce(p_payload ->> 'mode', 'guided');
    if p_branch_id is not null
       or p_item_id is null
       or p_expected_version is not null
       or p_expected_draft_version is not null
       or coalesce(v_branch_key, '') !~ '^[a-z][a-z0-9-]{1,63}$'
       or v_mode not in ('guided', 'designer') then
      raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
    end if;
    if v_mode = 'designer' then
      perform private.cms_visual_assert_available(
        p_actor_id, 'cms:visual.design', p_environment, p_site_key,
        p_aal, p_session_id, p_issued_at
      );
    end if;

    select * into v_item
    from public.cms_content_items
    where id = p_item_id and content_type in ('page', 'homepage') and workflow_status <> 'trashed';
    if not found then
      raise exception 'CMS_VISUAL_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not private.cms_ev2_actor_authorized_for_scope(
      p_actor_id,
      public.cms_editorial_required_permission(v_item.content_type, 'save'),
      p_environment,
      p_site_key,
      p_aal,
      p_session_id,
      p_issued_at
    ) then
      raise exception 'CMS_VISUAL_FORBIDDEN' using errcode = '42501';
    end if;
    select * into v_draft from public.cms_content_drafts where item_id = v_item.id;
    if not found then
      raise exception 'CMS_VISUAL_DRAFT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if jsonb_typeof(v_draft.payload -> 'blocks') is distinct from 'array'
       or jsonb_array_length(v_draft.payload -> 'blocks') not between 1 and 80 then
      raise exception 'CMS_VISUAL_SOURCE_INVALID' using errcode = '23514';
    end if;

    v_branch.id := gen_random_uuid();
    select revision_id into v_base_revision_id
    from public.cms_publications where item_id = v_item.id;
    select jsonb_agg(
      jsonb_set(
        jsonb_set(block, '{componentVersion}', '1'::jsonb, true),
        '{layout}',
        coalesce(block -> 'layout', '{
          "desktop":{"span":12,"hidden":false},
          "tablet":{"span":8,"hidden":false},
          "mobile":{"span":4,"hidden":false}
        }'::jsonb),
        true
      ) order by ordinal
    ) into v_nodes
    from jsonb_array_elements(v_draft.payload -> 'blocks') with ordinality source(block, ordinal);
    v_document_json := jsonb_build_object(
      'schemaVersion', 1,
      'registryVersion', 1,
      'itemId', v_item.id,
      'siteKey', p_site_key,
      'environment', p_environment,
      'branchKey', v_branch_key,
      'themeKey', 'gaiatec-default',
      'mode', v_mode,
      'grid', jsonb_build_object('desktop', 12, 'tablet', 8, 'mobile', 4),
      'nodes', v_nodes,
      'bindings', '[]'::jsonb
    );
    perform private.cms_validate_visual_document(
      v_document_json, p_site_key, p_environment, v_item.id, v_branch_key
    );
    v_hash := encode(digest(convert_to(v_document_json::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.cms_page_branches (
      id, site_id, environment, item_id, branch_key, status,
      base_revision_id, base_draft_version, created_by, updated_by, correlation_id
    ) values (
      v_branch.id, v_site.id, p_environment, v_item.id, v_branch_key, 'draft',
      v_base_revision_id, v_draft.lock_version, p_actor_id, p_actor_id, p_correlation_id
    ) returning * into v_branch;
    insert into public.cms_visual_documents (
      branch_id, site_id, environment, document, document_hash,
      created_by, updated_by, correlation_id
    ) values (
      v_branch.id, v_site.id, p_environment, v_document_json, v_hash,
      p_actor_id, p_actor_id, p_correlation_id
    ) returning * into v_document;
    update public.cms_visual_command_receipts
    set branch_id = v_branch.id
    where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
    insert into public.cms_visual_events (
      branch_id, document_id, actor_id, event_type, from_version, to_version,
      event_data, correlation_id
    ) values (
      v_branch.id, v_document.id, p_actor_id, 'branch_created', null, 1,
      jsonb_build_object('documentHash', v_hash, 'sourceDraftVersion', v_draft.lock_version),
      p_correlation_id
    );
    v_response := jsonb_build_object(
      'schemaVersion', 1,
      'branchId', v_branch.id,
      'status', v_branch.status,
      'branchLockVersion', v_branch.lock_version,
      'documentVersion', v_document.lock_version,
      'documentHash', v_document.document_hash,
      'correlationId', p_correlation_id,
      'replayed', false
    );
  else
    if p_branch_id is null or p_item_id is not null then
      raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
    end if;
    select branch.* into v_branch
    from public.cms_page_branches branch
    where branch.id = p_branch_id
      and branch.site_id = v_site.id
      and branch.environment = p_environment
    for update;
    if not found then
      raise exception 'CMS_VISUAL_BRANCH_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into strict v_document
    from public.cms_visual_documents
    where branch_id = v_branch.id and site_id = v_site.id and environment = p_environment
    for update;
    if v_branch.status <> 'draft'
       or p_expected_version is null
       or v_document.lock_version <> p_expected_version then
      raise exception 'CMS_VISUAL_CONFLICT' using errcode = 'PT409';
    end if;

    if p_action = 'save_document' then
      v_document_json := p_payload -> 'document';
      v_conflict_resolution := p_payload -> 'conflictResolution';
      if exists (
        select 1 from jsonb_object_keys(p_payload) as field(key)
        where field.key not in ('document', 'conflictResolution')
      ) then
        raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
      end if;
      if v_conflict_resolution is not null then
        if jsonb_typeof(v_conflict_resolution) is distinct from 'object'
           or (select count(*) from jsonb_object_keys(v_conflict_resolution)) <> 3
           or v_conflict_resolution ->> 'strategy' <> 'replace_remote'
           or coalesce(v_conflict_resolution ->> 'staleVersion', '') !~ '^[1-9][0-9]*$'
           or coalesce(v_conflict_resolution ->> 'remoteVersion', '') !~ '^[1-9][0-9]*$'
           or (v_conflict_resolution ->> 'remoteVersion')::bigint <> p_expected_version
           or (v_conflict_resolution ->> 'staleVersion')::bigint >= p_expected_version then
          raise exception 'CMS_VISUAL_CONFLICT_RESOLUTION_INVALID' using errcode = '22023';
        end if;
        perform private.cms_visual_assert_available(
          p_actor_id, 'cms:visual.design', p_environment, p_site_key,
          p_aal, p_session_id, p_issued_at
        );
        v_event_type := 'document_conflict_replaced';
      else
        v_event_type := 'document_saved';
      end if;
      perform private.cms_validate_visual_document(
        v_document_json, p_site_key, p_environment, v_branch.item_id, v_branch.branch_key
      );
      if v_document_json ->> 'mode' = 'designer' then
        perform private.cms_visual_assert_available(
          p_actor_id, 'cms:visual.design', p_environment, p_site_key,
          p_aal, p_session_id, p_issued_at
        );
      end if;
      v_hash := encode(digest(convert_to(v_document_json::text, 'UTF8'), 'sha256'), 'hex');
      update public.cms_visual_documents
      set document = v_document_json,
        document_hash = v_hash,
        lock_version = lock_version + 1,
        updated_by = p_actor_id,
        correlation_id = p_correlation_id
      where id = v_document.id and lock_version = p_expected_version
      returning * into v_document;
      if not found then raise exception 'CMS_VISUAL_CONFLICT' using errcode = 'PT409'; end if;
      update public.cms_page_branches
      set lock_version = lock_version + 1,
        updated_by = p_actor_id,
        correlation_id = p_correlation_id
      where id = v_branch.id
      returning * into v_branch;
      insert into public.cms_visual_events (
        branch_id, document_id, actor_id, event_type, from_version, to_version,
        event_data, correlation_id
      ) values (
        v_branch.id, v_document.id, p_actor_id, v_event_type, p_expected_version,
        v_document.lock_version,
        jsonb_strip_nulls(jsonb_build_object(
          'documentHash', v_hash,
          'conflictResolution', v_conflict_resolution
        )),
        p_correlation_id
      );
      v_response := jsonb_build_object(
        'schemaVersion', 1,
        'branchId', v_branch.id,
        'status', v_branch.status,
        'branchLockVersion', v_branch.lock_version,
        'documentVersion', v_document.lock_version,
        'documentHash', v_document.document_hash,
        'correlationId', p_correlation_id,
        'replayed', false
      );
    elsif p_action = 'snapshot' then
      if p_payload <> '{}'::jsonb then
        raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
      end if;
      v_snapshot_group_id := gen_random_uuid();
      foreach v_breakpoint in array array['desktop', 'tablet', 'mobile']
      loop
        v_snapshot := jsonb_build_object(
          'schemaVersion', 1,
          'breakpoint', v_breakpoint,
          'sourceVersion', v_document.lock_version,
          'document', v_document.document
        );
        v_hash := encode(digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');
        insert into public.cms_visual_snapshots (
          snapshot_group_id, branch_id, document_id, site_id, environment,
          breakpoint, source_version, snapshot, snapshot_hash, created_by, correlation_id
        ) values (
          v_snapshot_group_id, v_branch.id, v_document.id, v_site.id, p_environment,
          v_breakpoint, v_document.lock_version, v_snapshot, v_hash, p_actor_id, p_correlation_id
        );
      end loop;
      insert into public.cms_visual_events (
        branch_id, document_id, actor_id, event_type, from_version, to_version,
        event_data, correlation_id
      ) values (
        v_branch.id, v_document.id, p_actor_id, 'snapshot_created', v_document.lock_version,
        v_document.lock_version,
        jsonb_build_object('snapshotGroupId', v_snapshot_group_id, 'breakpoints', array['desktop','tablet','mobile']),
        p_correlation_id
      );
      v_response := jsonb_build_object(
        'schemaVersion', 1,
        'branchId', v_branch.id,
        'status', v_branch.status,
        'documentVersion', v_document.lock_version,
        'documentHash', v_document.document_hash,
        'snapshotGroupId', v_snapshot_group_id,
        'snapshotCount', 3,
        'correlationId', p_correlation_id,
        'replayed', false
      );
    elsif p_action = 'create_symbol' then
      select value into v_node
      from jsonb_array_elements(v_document.document -> 'nodes')
      where value ->> 'id' = p_payload ->> 'nodeId';
      if v_node is null
         or coalesce(p_payload ->> 'symbolKey', '') !~ '^[a-z][a-z0-9-]{1,63}$'
         or char_length(coalesce(btrim(p_payload ->> 'name'), '')) not between 2 and 120 then
        raise exception 'CMS_VISUAL_SYMBOL_INVALID' using errcode = '22023';
      end if;
      insert into public.cms_visual_symbols (
        site_id, environment, symbol_key, name, component_key, component_version,
        props, source_branch_id, source_node_id, created_by, updated_by, correlation_id
      ) values (
        v_site.id, p_environment, p_payload ->> 'symbolKey', btrim(p_payload ->> 'name'),
        v_node ->> 'type', (v_node ->> 'componentVersion')::integer,
        v_node, v_branch.id, (v_node ->> 'id')::uuid,
        p_actor_id, p_actor_id, p_correlation_id
      ) returning * into v_symbol;
      insert into public.cms_visual_events (
        branch_id, document_id, actor_id, event_type, from_version, to_version,
        event_data, correlation_id
      ) values (
        v_branch.id, v_document.id, p_actor_id, 'symbol_created', v_document.lock_version,
        v_document.lock_version,
        jsonb_build_object('symbolId', v_symbol.id, 'symbolKey', v_symbol.symbol_key),
        p_correlation_id
      );
      v_response := jsonb_build_object(
        'schemaVersion', 1,
        'branchId', v_branch.id,
        'status', v_branch.status,
        'documentVersion', v_document.lock_version,
        'documentHash', v_document.document_hash,
        'symbolId', v_symbol.id,
        'correlationId', p_correlation_id,
        'replayed', false
      );
    elsif p_action = 'apply_to_draft' then
      if p_expected_draft_version is null or p_payload <> '{}'::jsonb then
        raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
      end if;
      select * into v_item from public.cms_content_items
      where id = v_branch.item_id and content_type in ('page', 'homepage');
      if not private.cms_ev2_actor_authorized_for_scope(
        p_actor_id,
        public.cms_editorial_required_permission(v_item.content_type, 'save'),
        p_environment,
        p_site_key,
        p_aal,
        p_session_id,
        p_issued_at
      ) then
        raise exception 'CMS_VISUAL_FORBIDDEN' using errcode = '42501';
      end if;
      select * into v_draft from public.cms_content_drafts
      where item_id = v_branch.item_id for update;
      if not found
         or v_draft.lock_version <> p_expected_draft_version
         or v_branch.base_draft_version <> p_expected_draft_version then
        raise exception 'CMS_VISUAL_DRAFT_CONFLICT' using errcode = 'PT409';
      end if;
      perform private.cms_validate_visual_document(
        v_document.document, p_site_key, p_environment, v_branch.item_id, v_branch.branch_key
      );
      v_new_payload := jsonb_set(
        jsonb_set(v_draft.payload, '{blocks}', v_document.document -> 'nodes', true),
        '{visual}',
        jsonb_build_object(
          'schemaVersion', 1,
          'branchId', v_branch.id,
          'documentHash', v_document.document_hash,
          'registryVersion', 1,
          'themeKey', v_document.document ->> 'themeKey',
          'mode', v_document.document ->> 'mode',
          'grid', v_document.document -> 'grid'
        ),
        true
      );
      update public.cms_content_drafts
      set payload = v_new_payload,
        lock_version = lock_version + 1,
        updated_by = p_actor_id,
        updated_at = now()
      where item_id = v_branch.item_id and lock_version = p_expected_draft_version
      returning * into v_draft;
      if not found then raise exception 'CMS_VISUAL_DRAFT_CONFLICT' using errcode = 'PT409'; end if;
      update public.cms_page_branches
      set status = 'submitted',
        lock_version = lock_version + 1,
        updated_by = p_actor_id,
        correlation_id = p_correlation_id
      where id = v_branch.id
      returning * into v_branch;
      insert into public.cms_visual_events (
        branch_id, document_id, actor_id, event_type, from_version, to_version,
        event_data, correlation_id
      ) values (
        v_branch.id, v_document.id, p_actor_id, 'applied_to_draft', v_document.lock_version,
        v_document.lock_version,
        jsonb_build_object(
          'draftVersionBefore', p_expected_draft_version,
          'draftVersionAfter', v_draft.lock_version,
          'published', false
        ),
        p_correlation_id
      );
      v_response := jsonb_build_object(
        'schemaVersion', 1,
        'branchId', v_branch.id,
        'status', v_branch.status,
        'branchLockVersion', v_branch.lock_version,
        'documentVersion', v_document.lock_version,
        'documentHash', v_document.document_hash,
        'draftLockVersion', v_draft.lock_version,
        'published', false,
        'correlationId', p_correlation_id,
        'replayed', false
      );
    else
      if p_expected_draft_version is not null or p_payload <> '{}'::jsonb then
        raise exception 'CMS_VISUAL_COMMAND_INVALID' using errcode = '22023';
      end if;
      update public.cms_page_branches
      set status = 'abandoned',
        lock_version = lock_version + 1,
        updated_by = p_actor_id,
        correlation_id = p_correlation_id
      where id = v_branch.id
      returning * into v_branch;
      insert into public.cms_visual_events (
        branch_id, document_id, actor_id, event_type, from_version, to_version,
        event_data, correlation_id
      ) values (
        v_branch.id, v_document.id, p_actor_id, 'branch_abandoned', v_document.lock_version,
        v_document.lock_version, jsonb_build_object('published', false), p_correlation_id
      );
      v_response := jsonb_build_object(
        'schemaVersion', 1,
        'branchId', v_branch.id,
        'status', v_branch.status,
        'branchLockVersion', v_branch.lock_version,
        'documentVersion', v_document.lock_version,
        'documentHash', v_document.document_hash,
        'correlationId', p_correlation_id,
        'replayed', false
      );
    end if;
  end if;

  update public.cms_visual_command_receipts
  set branch_id = coalesce(branch_id, v_branch.id),
    response = v_response,
    completed_at = now()
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:visual.' || p_action,
    'visual_branch',
    v_branch.id::text,
    jsonb_build_object(
      'siteKey', p_site_key,
      'environment', p_environment,
      'documentVersion', v_document.lock_version,
      'documentHash', v_document.document_hash,
      'published', false
    ),
    p_correlation_id
  );
  return v_response;
end;
$$;

create function public.cms_execute_site_command(
  p_actor_id uuid,
  p_action text,
  p_target_site_key text,
  p_payload jsonb,
  p_expected_version bigint,
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
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_receipt public.cms_site_command_receipts%rowtype;
  v_site public.cms_sites%rowtype;
  v_theme public.cms_themes%rowtype;
  v_domain public.cms_site_domains%rowtype;
  v_tokens jsonb;
  v_tokens_hash text;
  v_tokens_version integer;
  v_response jsonb;
begin
  if p_actor_id is null
     or p_action not in ('create_candidate', 'add_domain', 'update_tokens', 'suspend_candidate')
     or p_environment not in ('local', 'staging')
     or p_site_key <> 'main'
     or coalesce(p_target_site_key, '') !~ '^g9x-[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'CMS_SITES_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_aal is distinct from 'aal2' then
    raise exception 'CMS_SITES_MFA_REQUIRED' using errcode = '42501';
  end if;
  perform private.cms_sites_assert_available(
    p_actor_id, 'cms:sites.manage', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );

  insert into public.cms_site_command_receipts (
    actor_id, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  ) on conflict (actor_id, action, idempotency_key) do nothing;
  select * into strict v_receipt
  from public.cms_site_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key
  for update;
  if v_receipt.request_hash <> p_request_hash then
    raise exception 'CMS_SITES_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  if v_receipt.response is not null then
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'create_candidate' then
    if p_expected_version is not null
       or char_length(coalesce(btrim(p_payload ->> 'name'), '')) not between 2 and 120
       or char_length(coalesce(btrim(p_payload ->> 'purpose'), '')) not between 3 and 500 then
      raise exception 'CMS_SITES_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_sites (
      site_key, display_name, purpose, status, is_primary, is_synthetic,
      production_enabled, created_by, updated_by
    ) values (
      p_target_site_key, btrim(p_payload ->> 'name'), btrim(p_payload ->> 'purpose'),
      'pilot', false, true, false, p_actor_id, p_actor_id
    ) returning * into v_site;
    insert into public.cms_site_environments (site_id, environment, status, created_by)
    values
      (v_site.id, 'local', 'locked', p_actor_id),
      (v_site.id, 'staging', 'locked', p_actor_id);
    insert into public.cms_themes (
      site_id, theme_key, name, status, created_by, updated_by
    ) values (
      v_site.id, 'gaiatec-default', 'GAIATEC padrão isolado', 'active', p_actor_id, p_actor_id
    ) returning * into v_theme;
    select tokens into v_tokens
    from public.cms_design_tokens
    where theme_id = '49000000-0000-4000-8000-000000000004'
    order by version desc limit 1;
    v_tokens_hash := encode(digest(convert_to(v_tokens::text, 'UTF8'), 'sha256'), 'hex');
    v_tokens_version := 1;
    insert into public.cms_design_tokens (
      theme_id, version, tokens, tokens_hash, created_by, correlation_id
    ) values (v_theme.id, 1, v_tokens, v_tokens_hash, p_actor_id, p_correlation_id);
  else
    select * into v_site
    from public.cms_sites
    where site_key = p_target_site_key
      and is_synthetic
      and not is_primary
      and created_by = p_actor_id
    for update;
    if not found then raise exception 'CMS_SITES_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_site.status not in ('pilot', 'suspended')
       or p_expected_version is null
       or v_site.lock_version <> p_expected_version then
      raise exception 'CMS_SITES_CONFLICT' using errcode = 'PT409';
    end if;
    if p_action = 'add_domain' then
      if v_site.status <> 'pilot'
         or coalesce(p_payload ->> 'environment', '') <> p_environment
         or coalesce(p_payload ->> 'hostname', '') not like '%.invalid'
         or coalesce(p_payload ->> 'hostname', '') !~ '^[a-z0-9][a-z0-9.-]{1,250}[a-z0-9]$' then
        raise exception 'CMS_SITES_DOMAIN_INVALID' using errcode = '22023';
      end if;
      insert into public.cms_site_domains (
        site_id, environment, hostname, status, verified, created_by
      ) values (
        v_site.id, p_environment, lower(p_payload ->> 'hostname'), 'pending', false, p_actor_id
      ) returning * into v_domain;
      update public.cms_sites
      set lock_version = lock_version + 1, updated_by = p_actor_id
      where id = v_site.id and lock_version = p_expected_version
      returning * into v_site;
    elsif p_action = 'update_tokens' then
      v_tokens := p_payload -> 'tokens';
      if v_site.status <> 'pilot'
         or jsonb_typeof(v_tokens) is distinct from 'array'
         or jsonb_array_length(v_tokens) not between 1 and 100
         or octet_length(v_tokens::text) > 131072
         or private.cms_json_contains_unsafe_visual_value(v_tokens)
         or exists (
           select 1 from jsonb_array_elements(v_tokens) token
           where jsonb_typeof(token) is distinct from 'object'
             or coalesce(token ->> 'key', '') !~ '^(color|space|radius|type)\.[a-z][a-z0-9.-]{0,62}$'
             or coalesce(token ->> 'kind', '') not in ('color', 'space', 'radius', 'type')
             or split_part(token ->> 'key', '.', 1) is distinct from token ->> 'kind'
             or char_length(coalesce(token ->> 'value', '')) not between 1 and 200
         )
         or exists (
           select 1
           from jsonb_array_elements(v_tokens) token
           group by token ->> 'key'
           having count(*) > 1
         ) then
        raise exception 'CMS_SITES_TOKENS_INVALID' using errcode = '23514';
      end if;
      select * into strict v_theme
      from public.cms_themes where site_id = v_site.id and status = 'active'
      order by created_at limit 1;
      select coalesce(max(version), 0) + 1 into v_tokens_version
      from public.cms_design_tokens where theme_id = v_theme.id;
      v_tokens_hash := encode(digest(convert_to(v_tokens::text, 'UTF8'), 'sha256'), 'hex');
      insert into public.cms_design_tokens (
        theme_id, version, tokens, tokens_hash, created_by, correlation_id
      ) values (
        v_theme.id, v_tokens_version, v_tokens, v_tokens_hash, p_actor_id, p_correlation_id
      );
      update public.cms_sites
      set lock_version = lock_version + 1, updated_by = p_actor_id
      where id = v_site.id and lock_version = p_expected_version
      returning * into v_site;
    else
      if v_site.status <> 'pilot' or p_payload <> '{}'::jsonb then
        raise exception 'CMS_SITES_COMMAND_INVALID' using errcode = '22023';
      end if;
      update public.cms_sites
      set status = 'suspended', lock_version = lock_version + 1, updated_by = p_actor_id
      where id = v_site.id and lock_version = p_expected_version
      returning * into v_site;
    end if;
  end if;

  insert into public.cms_site_events (
    site_id, actor_id, event_type, event_data, correlation_id
  ) values (
    v_site.id,
    p_actor_id,
    case p_action
      when 'create_candidate' then 'candidate_created'
      when 'add_domain' then 'domain_added'
      when 'update_tokens' then 'tokens_versioned'
      else 'candidate_suspended'
    end,
    jsonb_build_object(
      'siteKey', v_site.site_key,
      'environment', p_environment,
      'synthetic', true,
      'productionEnabled', false,
      'domainId', v_domain.id,
      'tokenVersion', v_tokens_version
    ),
    p_correlation_id
  );
  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'siteId', v_site.id,
    'siteKey', v_site.site_key,
    'status', v_site.status,
    'lockVersion', v_site.lock_version,
    'productionEnabled', false,
    'multisiteOperational', false,
    'domainId', v_domain.id,
    'tokenVersion', v_tokens_version,
    'correlationId', p_correlation_id,
    'replayed', false
  );
  update public.cms_site_command_receipts
  set site_id = v_site.id, response = v_response, completed_at = now()
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:sites.' || p_action,
    'site',
    v_site.id::text,
    jsonb_build_object(
      'siteKey', v_site.site_key,
      'synthetic', true,
      'productionEnabled', false,
      'multisiteOperational', false
    ),
    p_correlation_id
  );
  return v_response;
end;
$$;

-- O validador v1 continua sendo a primeira barreira. Apenas sua allowlist recebe
-- os sete componentes versionados; todas as novas invariantes são verificadas por
-- um segundo trigger fail-closed abaixo.
do $migration$
declare
  v_definition text;
  v_rewritten text;
  v_old text := '''hero'',''rich_text'',''image'',''gallery'',''benefit_grid'',''content_grid'',''steps'',''metrics'',''testimonial'',''faq'',''form'',''cta'',''related_content''';
  v_new text := '''hero'',''rich_text'',''image'',''gallery'',''benefit_grid'',''content_grid'',''steps'',''metrics'',''testimonial'',''faq'',''form'',''cta'',''related_content'',''split_content'',''logo_cloud'',''tabs'',''comparison_table'',''alert'',''timeline'',''link_list''';
begin
  select pg_get_functiondef(
    'public.cms_validate_site_builder_publication()'::regprocedure
  ) into strict v_definition;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'EV2_VISUAL_V1_VALIDATOR_DEFINITION_MISMATCH';
  end if;
  v_rewritten := replace(v_definition, v_old, v_new);
  execute v_rewritten;
end;
$migration$;

create function public.cms_validate_ev2_visual_publication()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch public.cms_page_branches%rowtype;
  v_document public.cms_visual_documents%rowtype;
  v_site_key text;
  v_has_visual_components boolean;
begin
  if new.content_type not in ('page', 'homepage') then return new; end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) block
    where block ->> 'type' in (
      'split_content', 'logo_cloud', 'tabs', 'comparison_table', 'alert', 'timeline', 'link_list'
    )
  ) into v_has_visual_components;

  if not (new.payload ? 'visual') then
    if v_has_visual_components then
      raise exception 'CMS_VISUAL_METADATA_REQUIRED' using errcode = '23514';
    end if;
    return new;
  end if;
  if coalesce(new.payload #>> '{visual,schemaVersion}', '') <> '1'
     or coalesce(new.payload #>> '{visual,registryVersion}', '') <> '1'
     or coalesce(new.payload #>> '{visual,branchId}', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(new.payload #>> '{visual,documentHash}', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_VISUAL_METADATA_INVALID' using errcode = '23514';
  end if;
  select * into v_branch
  from public.cms_page_branches
  where id = (new.payload #>> '{visual,branchId}')::uuid
    and item_id = new.item_id
    and status = 'submitted';
  if not found then raise exception 'CMS_VISUAL_BRANCH_NOT_SUBMITTED' using errcode = '23514'; end if;
  select * into strict v_document
  from public.cms_visual_documents where branch_id = v_branch.id;
  select site_key into strict v_site_key from public.cms_sites where id = v_branch.site_id;
  if v_site_key <> 'main'
     or v_document.document_hash <> new.payload #>> '{visual,documentHash}'
     or v_document.document -> 'nodes' is distinct from new.payload -> 'blocks'
     or v_document.document ->> 'themeKey' is distinct from new.payload #>> '{visual,themeKey}'
     or v_document.document ->> 'mode' is distinct from new.payload #>> '{visual,mode}'
     or v_document.document -> 'grid' is distinct from new.payload #> '{visual,grid}' then
    raise exception 'CMS_VISUAL_PUBLICATION_DRIFT' using errcode = '23514';
  end if;
  perform private.cms_validate_visual_document(
    v_document.document, v_site_key, v_branch.environment, new.item_id, v_branch.branch_key
  );
  return new;
end;
$$;

create trigger cms_ev2_visual_validate
before insert or update of payload on public.cms_published_projection
for each row execute function public.cms_validate_ev2_visual_publication();

update public.cms_capability_registry
set validation_contract = jsonb_set(
      validation_contract,
      '{blocks}',
      '["hero","rich_text","image","gallery","benefit_grid","content_grid","steps","metrics","testimonial","faq","form","cta","related_content","split_content","logo_cloud","tabs","comparison_table","alert","timeline","link_list"]'::jsonb,
      true
    ) || '{
      "visualDocument":true,
      "registryVersion":1,
      "responsiveGrid":{"desktop":12,"tablet":8,"mobile":4},
      "arbitraryCode":false,
      "multisiteOperational":false
    }'::jsonb,
    test_contract = test_contract || '{
      "visualContract":true,
      "snapshotThreeBreakpoints":true,
      "tenantEscapeNegative":true,
      "legacyRendererRegression":true
    }'::jsonb,
    updated_at = now()
where consumer_id in ('cms.managed-page.v1', 'cms.homepage-builder.v1');

alter table public.cms_sites enable row level security;
alter table public.cms_site_environments enable row level security;
alter table public.cms_site_domains enable row level security;
alter table public.cms_themes enable row level security;
alter table public.cms_design_tokens enable row level security;
alter table public.cms_component_definitions enable row level security;
alter table public.cms_component_versions enable row level security;
alter table public.cms_page_branches enable row level security;
alter table public.cms_visual_documents enable row level security;
alter table public.cms_visual_symbols enable row level security;
alter table public.cms_visual_snapshots enable row level security;
alter table public.cms_visual_events enable row level security;
alter table public.cms_visual_command_receipts enable row level security;
alter table public.cms_site_events enable row level security;
alter table public.cms_site_command_receipts enable row level security;

revoke all on table
  public.cms_sites,
  public.cms_site_environments,
  public.cms_site_domains,
  public.cms_themes,
  public.cms_design_tokens,
  public.cms_component_definitions,
  public.cms_component_versions,
  public.cms_page_branches,
  public.cms_visual_documents,
  public.cms_visual_symbols,
  public.cms_visual_snapshots,
  public.cms_visual_events,
  public.cms_visual_command_receipts,
  public.cms_site_events,
  public.cms_site_command_receipts
from public, anon, authenticated;

grant all on table
  public.cms_sites,
  public.cms_site_environments,
  public.cms_site_domains,
  public.cms_themes,
  public.cms_design_tokens,
  public.cms_component_definitions,
  public.cms_component_versions,
  public.cms_page_branches,
  public.cms_visual_documents,
  public.cms_visual_symbols,
  public.cms_visual_snapshots,
  public.cms_visual_events,
  public.cms_visual_command_receipts,
  public.cms_site_events,
  public.cms_site_command_receipts
to service_role;

revoke all on function private.cms_ev2_individual_flag_context(uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.cms_json_contains_unsafe_visual_value(jsonb)
  from public, anon, authenticated;
revoke all on function private.cms_validate_visual_document(jsonb, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function private.cms_ev2_actor_authorized_for_scope(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.cms_visual_assert_available(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.cms_sites_assert_available(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_validate_ev2_visual_publication()
  from public, anon, authenticated;
revoke all on function public.cms_visual_capability(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_get_visual_catalog(uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_list_visual_branches(uuid, uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_get_visual_document(uuid, uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_sites_capability(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_get_site_registry(uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_execute_visual_command(
  uuid, text, uuid, uuid, jsonb, bigint, bigint, text, text, text, text,
  timestamptz, uuid, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.cms_execute_site_command(
  uuid, text, text, jsonb, bigint, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.cms_visual_capability(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.cms_get_visual_catalog(uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_list_visual_branches(uuid, uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_get_visual_document(uuid, uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_sites_capability(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.cms_get_site_registry(uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_execute_visual_command(
  uuid, text, uuid, uuid, jsonb, bigint, bigint, text, text, text, text,
  timestamptz, uuid, uuid, text, uuid
) to service_role;
grant execute on function public.cms_execute_site_command(
  uuid, text, text, jsonb, bigint, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) to service_role;
