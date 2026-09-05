-- Fase 3 — capacidades, preview, mídia privada e projeção publicada.
-- O único registro inserido é um contrato técnico sintético; não há conteúdo editorial real.

alter table public.cms_content_items
  drop constraint if exists cms_content_items_workflow_status_check;
alter table public.cms_content_items
  add constraint cms_content_items_workflow_status_check
  check (workflow_status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'archived', 'trashed'));
alter table public.cms_content_items
  add column scheduled_for timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.cms_profiles (user_id) on delete restrict;
alter table public.cms_content_items
  add constraint cms_content_items_deleted_consistency
  check ((workflow_status = 'trashed') = (deleted_at is not null));

alter table public.cms_editorial_command_receipts
  drop constraint if exists cms_editorial_command_receipts_action_check;
alter table public.cms_editorial_command_receipts
  add constraint cms_editorial_command_receipts_action_check
  check (action in ('create', 'save', 'submit', 'approve', 'schedule', 'publish', 'restore', 'archive', 'trash', 'preview'));

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:media.read', 'Consultar a biblioteca de mídia nova.', false),
  ('cms:media.upload', 'Enviar mídia sintética ou autorizada.', false),
  ('cms:media.manage', 'Processar, substituir e remover mídia.', true),
  ('cms:capabilities.read', 'Consultar contratos de consumidores.', false),
  ('cms:capabilities.manage', 'Alterar contratos de consumidores.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select 'super_admin', permission_key from public.cms_permissions
where permission_key like 'cms:media.%' or permission_key like 'cms:capabilities.%'
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('admin', 'cms:media.read'), ('admin', 'cms:media.upload'), ('admin', 'cms:media.manage'),
  ('admin', 'cms:capabilities.read'),
  ('marketing', 'cms:media.read'), ('marketing', 'cms:media.upload'), ('marketing', 'cms:media.manage'),
  ('marketing', 'cms:capabilities.read'),
  ('commercial', 'cms:media.read'), ('commercial', 'cms:media.upload'),
  ('technical', 'cms:media.read'), ('technical', 'cms:media.upload'),
  ('editor', 'cms:media.read'), ('editor', 'cms:media.upload'),
  ('reviewer', 'cms:media.read'), ('reviewer', 'cms:capabilities.read')
on conflict do nothing;

create table public.cms_capability_registry (
  consumer_id text primary key check (consumer_id ~ '^cms\.[a-z][a-z0-9_.-]+\.v[0-9]+$'),
  content_type text not null check (content_type in ('product', 'service', 'post', 'page', 'homepage')),
  schema_name text not null,
  schema_version integer not null check (schema_version > 0),
  renderer_key text not null check (renderer_key ~ '^[a-z][a-z0-9_-]+$'),
  preview_renderer_key text not null check (preview_renderer_key ~ '^[a-z][a-z0-9_-]+$'),
  route_pattern text not null check (route_pattern like '/%'),
  permissions jsonb not null check (jsonb_typeof(permissions) = 'object'),
  validation_contract jsonb not null check (jsonb_typeof(validation_contract) = 'object'),
  fixture_contract jsonb not null check (jsonb_typeof(fixture_contract) = 'object'),
  test_contract jsonb not null check (jsonb_typeof(test_contract) = 'object'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, schema_version, renderer_key)
);

insert into public.cms_capability_registry (
  consumer_id, content_type, schema_name, schema_version, renderer_key, preview_renderer_key,
  route_pattern, permissions, validation_contract, fixture_contract, test_contract
)
values (
  'cms.synthetic-article.v1', 'post', 'CmsPostContentSchema', 1, 'structured-article', 'structured-article',
  '/cms/conteudo/:slug',
  '{"read":"cms:posts.read","edit":"cms:posts.edit","review":"cms:posts.review","approve":"cms:posts.approve","publish":"cms:posts.publish"}',
  '{"blocks":["rich_text","image","gallery","cta","specifications","related_content"],"links":"absolute-path-or-https","seo":true,"provenance":true}',
  '{"kind":"synthetic-only","viewports":["mobile","tablet","desktop"]}',
  '{"contract":true,"renderer":true,"preview":true,"permissions":true,"e2e":true}'
);

create table public.cms_content_approvals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  revision_id uuid not null,
  reviewer_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text not null check (char_length(btrim(note)) between 3 and 500),
  created_at timestamptz not null default now(),
  foreign key (revision_id, item_id) references public.cms_content_revisions (id, item_id) on delete restrict
);

create table public.cms_published_projection (
  item_id uuid primary key references public.cms_content_items (id) on delete restrict,
  revision_id uuid not null,
  content_type text not null,
  slug text not null,
  schema_version integer not null,
  consumer_id text not null references public.cms_capability_registry (consumer_id) on delete restrict,
  renderer_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  seo jsonb not null check (jsonb_typeof(seo) = 'object'),
  content_version bigint not null check (content_version > 0),
  cache_tag text not null,
  etag text not null check (etag ~ '^"[0-9a-f]{64}"$'),
  published_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (content_type, slug),
  foreign key (revision_id, item_id) references public.cms_content_revisions (id, item_id) on delete restrict
);

create table public.cms_preview_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  item_id uuid not null references public.cms_content_items (id) on delete cascade,
  revision_id uuid references public.cms_content_revisions (id) on delete cascade,
  snapshot_payload jsonb not null check (jsonb_typeof(snapshot_payload) = 'object'),
  snapshot_seo jsonb not null check (jsonb_typeof(snapshot_seo) = 'object'),
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null default 10 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.cms_media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path ~ '^cms/[0-9a-f-]{36}/original\.[a-z0-9]+$'),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  declared_mime text not null,
  detected_mime text,
  byte_size bigint check (byte_size is null or byte_size between 1 and 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  processing_status text not null default 'awaiting_upload' check (processing_status in ('awaiting_upload', 'processing', 'ready', 'rejected', 'failed', 'replaced')),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'rejected', 'failed')),
  scan_engine text,
  source_kind text not null check (source_kind in ('synthetic_test', 'owner_authored', 'official_manufacturer', 'official_company')),
  source_reference text not null check (char_length(source_reference) between 3 and 500),
  rights_confirmed boolean not null check (rights_confirmed),
  license_name text not null check (char_length(license_name) between 2 and 120),
  owner_name text not null check (char_length(owner_name) between 2 and 120),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 300),
  caption text check (caption is null or char_length(caption) <= 500),
  credit text check (credit is null or char_length(credit) <= 200),
  focal_x numeric(5,4) not null default 0.5 check (focal_x between 0 and 1),
  focal_y numeric(5,4) not null default 0.5 check (focal_y between 0 and 1),
  version integer not null default 1 check (version > 0),
  replaces_asset_id uuid references public.cms_media_assets (id) on delete restrict,
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index cms_media_sha256_uidx on public.cms_media_assets (sha256) where sha256 is not null and processing_status <> 'replaced';

create table public.cms_media_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.cms_media_assets (id) on delete cascade,
  variant_key text not null check (variant_key in ('thumbnail', 'medium', 'large')),
  format text not null check (format in ('webp', 'avif')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  transform_path text not null,
  created_at timestamptz not null default now(),
  unique (asset_id, variant_key, format)
);

create table public.cms_media_usages (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.cms_media_assets (id) on delete restrict,
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  revision_id uuid references public.cms_content_revisions (id) on delete restrict,
  block_id uuid,
  usage_kind text not null check (usage_kind in ('content', 'seo', 'gallery', 'document')),
  created_at timestamptz not null default now(),
  unique nulls not distinct (asset_id, item_id, revision_id, usage_kind, block_id)
);

create table public.cms_operational_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  event_type text not null check (event_type ~ '^cms\.[a-z][a-z0-9_.]+$'),
  item_id uuid references public.cms_content_items (id) on delete set null,
  correlation_id uuid not null,
  error_code text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cms-media-private', 'cms-media-private', false, 20971520, array['image/png','image/jpeg','image/webp','image/avif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.cms_block_media_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.cms_media_usages where asset_id = old.id) then
    raise exception 'CMS_MEDIA_IN_USE' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger cms_media_delete_guard before delete on public.cms_media_assets
for each row execute function public.cms_block_media_delete();
create trigger cms_capability_touch before update on public.cms_capability_registry
for each row execute function public.cms_touch_updated_at();
create trigger cms_projection_touch before update on public.cms_published_projection
for each row execute function public.cms_touch_updated_at();
create trigger cms_approvals_immutable before update or delete on public.cms_content_approvals
for each row execute function public.cms_reject_immutable_mutation();

alter table public.cms_capability_registry enable row level security;
alter table public.cms_content_approvals enable row level security;
alter table public.cms_published_projection enable row level security;
alter table public.cms_preview_tokens enable row level security;
alter table public.cms_media_assets enable row level security;
alter table public.cms_media_variants enable row level security;
alter table public.cms_media_usages enable row level security;
alter table public.cms_operational_events enable row level security;

create policy cms_capabilities_authorized_read on public.cms_capability_registry
for select to authenticated using (public.cms_has_permission('cms:capabilities.read'));
create policy cms_approvals_authorized_read on public.cms_content_approvals
for select to authenticated using (public.cms_can_read_content((select content_type from public.cms_content_items where id = item_id)));
create policy cms_projection_public_read on public.cms_published_projection
for select to anon, authenticated using (true);
create policy cms_media_authorized_read on public.cms_media_assets
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_media_variants_authorized_read on public.cms_media_variants
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_media_usages_authorized_read on public.cms_media_usages
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_events_diagnostics_read on public.cms_operational_events
for select to authenticated using (public.cms_has_permission('cms:diagnostics.read'));

revoke all on table public.cms_capability_registry, public.cms_content_approvals,
  public.cms_published_projection, public.cms_preview_tokens, public.cms_media_assets,
  public.cms_media_variants, public.cms_media_usages, public.cms_operational_events
from public, anon, authenticated;
grant select on public.cms_published_projection to anon, authenticated;
grant select on public.cms_capability_registry, public.cms_content_approvals,
  public.cms_media_assets, public.cms_media_variants, public.cms_media_usages,
  public.cms_operational_events to authenticated;
grant all on public.cms_capability_registry, public.cms_content_approvals,
  public.cms_published_projection, public.cms_preview_tokens, public.cms_media_assets,
  public.cms_media_variants, public.cms_media_usages, public.cms_operational_events to service_role;

revoke all on function public.cms_block_media_delete() from public, anon, authenticated;
