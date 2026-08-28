-- Fase 3 / CMS-004 — fundacao editorial versionada.
-- Nenhum conteudo, taxonomia ou midia real e criado por esta migration.

create table public.cms_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  taxonomy_type text not null check (taxonomy_type in ('segment', 'category', 'family', 'tag')),
  parent_id uuid references public.cms_taxonomy_terms (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (taxonomy_type, slug),
  check (parent_id is null or parent_id <> id)
);

create table public.cms_content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('product', 'service', 'post', 'page', 'homepage')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 160),
  workflow_status text not null default 'draft' check (workflow_status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (content_type, slug),
  check ((workflow_status = 'archived') = (archived_at is not null))
);

create table public.cms_content_drafts (
  item_id uuid primary key references public.cms_content_items (id) on delete restrict,
  schema_version integer not null default 1 check (schema_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  seo jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  lock_version bigint not null default 1 check (lock_version > 0),
  updated_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.cms_content_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  schema_version integer not null check (schema_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  seo jsonb not null check (jsonb_typeof(seo) = 'object'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  source_draft_version bigint not null check (source_draft_version > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (item_id, revision_number),
  unique (id, item_id)
);

create table public.cms_content_taxonomy (
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  term_id uuid not null references public.cms_taxonomy_terms (id) on delete restrict,
  assigned_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (item_id, term_id)
);

create table public.cms_publications (
  item_id uuid primary key references public.cms_content_items (id) on delete restrict,
  revision_id uuid not null,
  cache_tag text not null check (cache_tag ~ '^cms:[a-z0-9_-]+:[0-9a-f-]{36}$'),
  published_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  published_at timestamptz not null default now(),
  foreign key (revision_id, item_id) references public.cms_content_revisions (id, item_id) on delete restrict
);

create table public.cms_publication_outbox (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  revision_id uuid not null,
  event_type text not null check (event_type in ('publish', 'restore', 'unpublish')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (revision_id, item_id) references public.cms_content_revisions (id, item_id) on delete restrict,
  unique (item_id, revision_id, event_type)
);

create table public.cms_editorial_command_receipts (
  actor_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  action text not null check (action in ('create', 'save', 'submit', 'approve', 'publish', 'restore', 'archive')),
  idempotency_key uuid not null,
  item_id uuid references public.cms_content_items (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, action, idempotency_key)
);

create index cms_taxonomy_parent_idx on public.cms_taxonomy_terms (parent_id, status);
create index cms_content_items_workflow_idx on public.cms_content_items (content_type, workflow_status, updated_at desc);
create index cms_content_revisions_item_idx on public.cms_content_revisions (item_id, revision_number desc);
create index cms_content_taxonomy_term_idx on public.cms_content_taxonomy (term_id, item_id);
create index cms_outbox_ready_idx on public.cms_publication_outbox (status, available_at) where status in ('pending', 'failed');

create function public.cms_validate_taxonomy_parent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_type text;
begin
  if new.taxonomy_type in ('segment', 'tag') then
    if new.parent_id is not null then
      raise exception 'CMS_TAXONOMY_PARENT_INVALID' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'CMS_TAXONOMY_PARENT_REQUIRED' using errcode = '23514';
  end if;

  select taxonomy_type into parent_type from public.cms_taxonomy_terms where id = new.parent_id;
  if parent_type is null
     or (new.taxonomy_type = 'category' and parent_type <> 'segment')
     or (new.taxonomy_type = 'family' and parent_type <> 'category') then
    raise exception 'CMS_TAXONOMY_PARENT_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cms_taxonomy_validate_parent
before insert or update of taxonomy_type, parent_id on public.cms_taxonomy_terms
for each row execute function public.cms_validate_taxonomy_parent();

create trigger cms_taxonomy_touch_updated_at
before update on public.cms_taxonomy_terms
for each row execute function public.cms_touch_updated_at();

create trigger cms_content_items_touch_updated_at
before update on public.cms_content_items
for each row execute function public.cms_touch_updated_at();

create trigger cms_revisions_immutable
before update or delete on public.cms_content_revisions
for each row execute function public.cms_reject_immutable_mutation();

create function public.cms_content_permission(p_content_type text, p_action text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_content_type = 'product' and p_action in ('read', 'edit', 'publish') then 'cms:products.' || p_action
    when p_content_type = 'service' and p_action in ('read', 'edit', 'publish') then 'cms:services.' || p_action
    when p_content_type = 'post' and p_action in ('read', 'edit', 'review', 'approve', 'publish') then 'cms:posts.' || p_action
    when p_content_type in ('page', 'homepage') and p_action in ('read', 'edit', 'publish') then 'cms:homepage.' || p_action
    else null
  end;
$$;

create function public.cms_can_read_content(p_content_type text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.cms_has_permission(public.cms_content_permission(p_content_type, 'read')), false);
$$;

create function public.cms_editorial_transition_allowed(p_from text, p_action text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_action
    when 'save' then p_from in ('draft', 'in_review')
    when 'submit' then p_from = 'draft'
    when 'approve' then p_from = 'in_review'
    when 'publish' then p_from = 'approved'
    when 'restore' then p_from in ('published', 'archived')
    when 'archive' then p_from in ('draft', 'in_review', 'approved', 'published')
    else false
  end;
$$;

alter table public.cms_taxonomy_terms enable row level security;
alter table public.cms_content_items enable row level security;
alter table public.cms_content_drafts enable row level security;
alter table public.cms_content_revisions enable row level security;
alter table public.cms_content_taxonomy enable row level security;
alter table public.cms_publications enable row level security;
alter table public.cms_publication_outbox enable row level security;
alter table public.cms_editorial_command_receipts enable row level security;

create policy "cms_taxonomy_authorized_read" on public.cms_taxonomy_terms
for select to authenticated using (public.cms_has_permission('cms:taxonomy.read'));

create policy "cms_content_items_authorized_read" on public.cms_content_items
for select to authenticated using (public.cms_can_read_content(content_type));

create policy "cms_content_drafts_authorized_read" on public.cms_content_drafts
for select to authenticated using (
  exists (select 1 from public.cms_content_items i where i.id = item_id and public.cms_can_read_content(i.content_type))
);

create policy "cms_content_revisions_authorized_read" on public.cms_content_revisions
for select to authenticated using (
  exists (select 1 from public.cms_content_items i where i.id = item_id and public.cms_can_read_content(i.content_type))
);

create policy "cms_content_taxonomy_authorized_read" on public.cms_content_taxonomy
for select to authenticated using (
  exists (select 1 from public.cms_content_items i where i.id = item_id and public.cms_can_read_content(i.content_type))
);

create policy "cms_publications_authorized_read" on public.cms_publications
for select to authenticated using (
  exists (select 1 from public.cms_content_items i where i.id = item_id and public.cms_can_read_content(i.content_type))
);

create policy "cms_outbox_diagnostics_read" on public.cms_publication_outbox
for select to authenticated using (public.cms_has_permission('cms:diagnostics.read'));

revoke all on table
  public.cms_taxonomy_terms,
  public.cms_content_items,
  public.cms_content_drafts,
  public.cms_content_revisions,
  public.cms_content_taxonomy,
  public.cms_publications,
  public.cms_publication_outbox,
  public.cms_editorial_command_receipts
from public, anon, authenticated;

grant select on table
  public.cms_taxonomy_terms,
  public.cms_content_items,
  public.cms_content_drafts,
  public.cms_content_revisions,
  public.cms_content_taxonomy,
  public.cms_publications,
  public.cms_publication_outbox
to authenticated;

grant all on table
  public.cms_taxonomy_terms,
  public.cms_content_items,
  public.cms_content_drafts,
  public.cms_content_revisions,
  public.cms_content_taxonomy,
  public.cms_publications,
  public.cms_publication_outbox,
  public.cms_editorial_command_receipts
to service_role;

revoke all on function public.cms_validate_taxonomy_parent() from public, anon, authenticated;
revoke all on function public.cms_content_permission(text,text) from public, anon;
revoke all on function public.cms_can_read_content(text) from public, anon;
revoke all on function public.cms_editorial_transition_allowed(text,text) from public, anon;

grant execute on function public.cms_content_permission(text,text) to authenticated, service_role;
grant execute on function public.cms_can_read_content(text) to authenticated, service_role;
grant execute on function public.cms_editorial_transition_allowed(text,text) to authenticated, service_role;
