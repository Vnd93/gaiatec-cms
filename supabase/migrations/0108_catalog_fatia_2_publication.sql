-- Fatia 2 / CAT-005..CAT-007 — revisão/publicação aditiva do catálogo novo.
-- Local/staging only: nenhum produto, snapshot ou evento é carregado.
-- A publicação permanece bloqueada enquanto ev2.catalog_v1 estiver desligada.

begin;

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:catalog.publish', 'Publicar ou retirar snapshots do catálogo novo.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, 'cms:catalog.publish'
from public.cms_roles
where role_key in ('super_admin', 'admin')
on conflict do nothing;

alter table public.cms_catalog_products
  add column publication_state text not null default 'draft',
  add column published_revision bigint,
  add column catalog_lifecycle_state text not null default 'active';

alter table public.cms_catalog_products
  add constraint cms_catalog_products_publication_state_check
    check (publication_state in ('draft', 'ready', 'published')),
  add constraint cms_catalog_products_published_revision_check
    check (published_revision is null or published_revision > 0),
  add constraint cms_catalog_products_catalog_lifecycle_check
    check (catalog_lifecycle_state in ('active', 'archived'));

alter table public.cms_catalog_product_revisions
  add column publication_state text not null default 'draft';

alter table public.cms_catalog_product_revisions
  add constraint cms_catalog_product_revisions_publication_state_check
    check (publication_state in ('draft', 'ready', 'published'));

alter table public.cms_catalog_audit_events
  drop constraint if exists cms_catalog_audit_events_action_check;

alter table public.cms_catalog_audit_events
  add constraint cms_catalog_audit_events_action_check
    check (action in ('created', 'updated', 'attached', 'published', 'unpublished'));

create table public.cms_catalog_product_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  revision bigint not null,
  slug text not null,
  title text not null,
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and not (content ?| array['sku', 'price', 'stock', 'inventory', 'availability'])
  ),
  published_by uuid not null references auth.users (id) on delete restrict,
  published_at timestamptz not null default now(),
  is_current boolean not null default true,
  superseded_at timestamptz,
  unique (product_id, revision),
  foreign key (product_id, revision)
    references public.cms_catalog_product_revisions (product_id, revision)
    on delete restrict,
  check ((is_current and superseded_at is null) or (not is_current and superseded_at is not null))
);

create table public.cms_catalog_publication_outbox (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  revision bigint not null,
  snapshot_id uuid references public.cms_catalog_product_snapshots (snapshot_id) on delete restrict,
  event_type text not null check (event_type in ('published', 'invalidated')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (product_id, revision, event_type)
);

create unique index cms_catalog_product_snapshots_current_idx
  on public.cms_catalog_product_snapshots (product_id)
  where is_current;
create index cms_catalog_publication_outbox_pending_idx
  on public.cms_catalog_publication_outbox (available_at, created_at)
  where status in ('pending', 'processing', 'failed');

create or replace function private.cms_catalog_snapshot_internal_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CMS_CATALOG_SNAPSHOT_IMMUTABLE' using errcode = '55000';
  end if;
  if current_setting('cms.catalog_snapshot_mutation', true) <> 'on'
     or new.snapshot_id is distinct from old.snapshot_id
     or new.product_id is distinct from old.product_id
     or new.revision is distinct from old.revision
     or new.slug is distinct from old.slug
     or new.title is distinct from old.title
     or new.content is distinct from old.content
     or new.published_by is distinct from old.published_by
     or new.published_at is distinct from old.published_at
     or new.is_current is not false
     or new.superseded_at is null then
    raise exception 'CMS_CATALOG_SNAPSHOT_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_validate_publication_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action text := current_setting('cms.catalog_publication_action', true);
begin
  if tg_op = 'INSERT' then
    if new.publication_state <> 'draft' or new.published_revision is not null then
      raise exception 'CMS_CATALOG_INITIAL_STATE_INVALID' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.publication_state is distinct from old.publication_state then
    if v_action = '' or v_action is null then
      raise exception 'CMS_CATALOG_PUBLICATION_COMMAND_REQUIRED' using errcode = '42501';
    end if;
    if old.publication_state = 'draft' and new.publication_state = 'ready'
       and v_action <> 'submit' then
      raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '22023';
    end if;
    if old.publication_state = 'ready' and new.publication_state = 'published'
       and v_action <> 'publish' then
      raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '22023';
    end if;
    if old.publication_state = 'published' and new.publication_state = 'draft'
       and v_action not in ('edit', 'unpublish') then
      raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '22023';
    end if;
    if old.publication_state = 'ready' and new.publication_state = 'draft'
       and v_action <> 'edit' then
      raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '22023';
    end if;
  end if;

  if new.publication_state = 'published' and new.published_revision is null then
    raise exception 'CMS_CATALOG_PUBLISHED_REVISION_REQUIRED' using errcode = '23514';
  end if;
  if new.publication_state <> 'published'
     and old.publication_state <> 'published'
     and new.published_revision is not null then
    raise exception 'CMS_CATALOG_PUBLISHED_REVISION_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A publicação e a invalidação são feitas somente pelos comandos protegidos abaixo.
-- Edição de publicado conserva o snapshot vigente e abre um novo rascunho.
create or replace function private.cms_catalog_record_publication()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_snapshot_id uuid;
  v_current_snapshot_id uuid;
  v_action text := current_setting('cms.catalog_publication_action', true);
begin
  if v_actor_id is null then
    raise exception 'CMS_CATALOG_ACTOR_REQUIRED' using errcode = '42501';
  end if;

  if old.publication_state <> 'published' and new.publication_state = 'published'
     and v_action = 'publish' then
    perform set_config('cms.catalog_snapshot_mutation', 'on', true);
    update public.cms_catalog_product_snapshots
    set is_current = false, superseded_at = now()
    where product_id = new.id and is_current
    returning snapshot_id into v_current_snapshot_id;

    insert into public.cms_catalog_product_snapshots (
      product_id, revision, slug, title, content, published_by
    ) values (
      new.id, new.revision, new.slug, new.title, new.content, v_actor_id
    ) returning snapshot_id into v_snapshot_id;

    insert into public.cms_catalog_publication_outbox (
      product_id, revision, snapshot_id, event_type
    ) values (new.id, new.revision, v_snapshot_id, 'published');

    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product', new.id::text, 'published', v_actor_id,
      nullif(auth.jwt() ->> 'request_id', ''), to_jsonb(old), to_jsonb(new)
    );
  elsif old.publication_state = 'published' and new.publication_state = 'draft'
        and v_action = 'unpublish' then
    perform set_config('cms.catalog_snapshot_mutation', 'on', true);
    update public.cms_catalog_product_snapshots
    set is_current = false, superseded_at = now()
    where product_id = new.id and is_current
    returning snapshot_id into v_current_snapshot_id;

    insert into public.cms_catalog_publication_outbox (
      product_id, revision, snapshot_id, event_type
    ) values (new.id, new.revision, v_current_snapshot_id, 'invalidated');

    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product', new.id::text, 'unpublished', v_actor_id,
      nullif(auth.jwt() ->> 'request_id', ''), to_jsonb(old), to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.cms_catalog_snapshot_internal_guard() from public, anon, authenticated;
revoke all on function private.cms_catalog_validate_publication_transition() from public, anon, authenticated;
revoke all on function private.cms_catalog_record_publication() from public, anon, authenticated;

create trigger cms_catalog_snapshot_internal_guard
before update or delete on public.cms_catalog_product_snapshots
for each row execute function private.cms_catalog_snapshot_internal_guard();

create trigger cms_catalog_products_publication_guard
before insert or update on public.cms_catalog_products
for each row execute function private.cms_catalog_validate_publication_transition();

create trigger cms_catalog_products_z_publication_record
after update on public.cms_catalog_products
for each row execute function private.cms_catalog_record_publication();

drop policy if exists cms_catalog_products_update on public.cms_catalog_products;
create policy cms_catalog_products_update
on public.cms_catalog_products for update to authenticated
using (
  public.cms_has_permission('cms:catalog.edit')
  and current_setting('cms.catalog_product_command', true) = 'on'
)
with check (
  public.cms_has_permission('cms:catalog.edit')
  and updated_by = (select auth.uid())
  and current_setting('cms.catalog_product_command', true) = 'on'
);

create policy cms_catalog_product_snapshots_public_read
on public.cms_catalog_product_snapshots for select to anon
using (is_current and superseded_at is null);

create policy cms_catalog_product_snapshots_read
on public.cms_catalog_product_snapshots for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_publication_outbox_read
on public.cms_catalog_publication_outbox for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

alter table public.cms_catalog_product_snapshots enable row level security;
alter table public.cms_catalog_publication_outbox enable row level security;

revoke all on table public.cms_catalog_product_snapshots, public.cms_catalog_publication_outbox
from public, anon, authenticated;
grant select (
  snapshot_id, product_id, revision, slug, title, content, published_at
) on table public.cms_catalog_product_snapshots to anon;
grant select on table public.cms_catalog_product_snapshots to authenticated;
grant select on table public.cms_catalog_publication_outbox to authenticated;

create view public.cms_catalog_current_snapshots
with (security_invoker = true)
as
select snapshot_id, product_id, revision, slug, title, content, published_at
from public.cms_catalog_product_snapshots
where is_current and superseded_at is null;

revoke all on public.cms_catalog_current_snapshots from public;
grant select on public.cms_catalog_current_snapshots to anon, authenticated;

create or replace function public.cms_catalog_update_product(
  p_product_id uuid,
  p_expected_revision bigint,
  p_slug text,
  p_title text,
  p_content jsonb
)
returns public.cms_catalog_products
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.cms_catalog_products;
begin
  if not public.cms_has_permission('cms:catalog.edit') then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'CMS_CATALOG_EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('cms.catalog_product_command', 'on', true);
  perform set_config('cms.catalog_publication_action', 'edit', true);
  update public.cms_catalog_products
  set slug = p_slug,
      title = p_title,
      content = p_content,
      publication_state = 'draft',
      revision = revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_product_id
    and revision = p_expected_revision
  returning * into v_product;

  if not found then
    if exists (select 1 from public.cms_catalog_products where id = p_product_id) then
      raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode = '40001';
    end if;
    raise exception 'CMS_CATALOG_PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_product;
end;
$$;

create or replace function public.cms_catalog_submit_product(
  p_product_id uuid,
  p_expected_revision bigint
)
returns public.cms_catalog_products
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.cms_catalog_products;
begin
  if not public.cms_has_permission('cms:catalog.edit') then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('cms.catalog_product_command', 'on', true);
  perform set_config('cms.catalog_publication_action', 'submit', true);
  update public.cms_catalog_products
  set publication_state = 'ready', revision = revision + 1,
      updated_by = (select auth.uid()), updated_at = now()
  where id = p_product_id and revision = p_expected_revision and publication_state = 'draft'
  returning * into v_product;
  if not found then
    raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '40001';
  end if;
  return v_product;
end;
$$;

create or replace function public.cms_catalog_publish_product(
  p_product_id uuid,
  p_expected_revision bigint
)
returns public.cms_catalog_products
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.cms_catalog_products;
  v_primary_count integer;
begin
  if not exists (
    select 1 from public.cms_feature_flags
    where flag_key = 'ev2.catalog_v1' and default_enabled = true
  ) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if not public.cms_has_permission('cms:catalog.publish') then
    raise exception 'CMS_CATALOG_PUBLISH_FORBIDDEN' using errcode = '42501';
  end if;
  select count(*)::integer into v_primary_count
  from public.cms_catalog_product_terms pt
  join public.cms_catalog_taxonomy_terms term on term.id = pt.term_id
  where pt.product_id = p_product_id
    and pt.relation_kind = 'category'
    and term.status = 'active';
  if v_primary_count <> 1 then
    raise exception 'CMS_CATALOG_PRIMARY_TERM_REQUIRED' using errcode = '23514';
  end if;

  perform set_config('cms.catalog_product_command', 'on', true);
  perform set_config('cms.catalog_publication_action', 'publish', true);
  update public.cms_catalog_products
  set publication_state = 'published', published_revision = revision + 1,
      revision = revision + 1, updated_by = (select auth.uid()), updated_at = now()
  where id = p_product_id and revision = p_expected_revision and publication_state = 'ready'
  returning * into v_product;
  if not found then
    raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '40001';
  end if;
  return v_product;
end;
$$;

create or replace function public.cms_catalog_unpublish_product(
  p_product_id uuid,
  p_expected_revision bigint
)
returns public.cms_catalog_products
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.cms_catalog_products;
begin
  if not public.cms_has_permission('cms:catalog.publish') then
    raise exception 'CMS_CATALOG_PUBLISH_FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('cms.catalog_product_command', 'on', true);
  perform set_config('cms.catalog_publication_action', 'unpublish', true);
  update public.cms_catalog_products
  set publication_state = 'draft', revision = revision + 1,
      updated_by = (select auth.uid()), updated_at = now()
  where id = p_product_id and revision = p_expected_revision and publication_state = 'published'
  returning * into v_product;
  if not found then
    raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode = '40001';
  end if;
  return v_product;
end;
$$;

revoke all on function public.cms_catalog_update_product(uuid, bigint, text, text, jsonb)
from public, anon;
revoke all on function public.cms_catalog_submit_product(uuid, bigint)
from public, anon;
revoke all on function public.cms_catalog_publish_product(uuid, bigint)
from public, anon;
revoke all on function public.cms_catalog_unpublish_product(uuid, bigint)
from public, anon;
grant execute on function public.cms_catalog_update_product(uuid, bigint, text, text, jsonb) to authenticated;
grant execute on function public.cms_catalog_submit_product(uuid, bigint) to authenticated;
grant execute on function public.cms_catalog_publish_product(uuid, bigint) to authenticated;
grant execute on function public.cms_catalog_unpublish_product(uuid, bigint) to authenticated;

create or replace function private.cms_catalog_record_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_action text := case when tg_op = 'INSERT' then 'created' else 'updated' end;
  v_request_id text := nullif(auth.jwt() ->> 'request_id', '');
begin
  if v_actor_id is null then
    raise exception 'CMS_CATALOG_ACTOR_REQUIRED' using errcode = '42501';
  end if;

  if tg_table_name = 'cms_catalog_products' then
    insert into public.cms_catalog_product_revisions (
      product_id, revision, slug, title, lifecycle_status, publication_state, content, changed_by
    ) values (
      new.id, new.revision, new.slug, new.title, new.lifecycle_status,
      new.publication_state, new.content, v_actor_id
    );
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product', new.id::text, v_action, v_actor_id, v_request_id,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_taxonomy_terms' then
    insert into public.cms_catalog_taxonomy_revisions (
      term_id, revision, term_type, slug, title, parent_id, status, changed_by
    ) values (
      new.id, new.revision, new.term_type, new.slug, new.title, new.parent_id, new.status, v_actor_id
    );
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'taxonomy_term', new.id::text, v_action, v_actor_id, v_request_id,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_product_terms' then
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product_term', new.product_id::text || ':' || new.term_id::text,
      'attached', v_actor_id, v_request_id, null, to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.cms_catalog_record_change() from public, anon, authenticated;

drop trigger if exists cms_catalog_products_record_change on public.cms_catalog_products;
create trigger cms_catalog_products_record_change
after insert or update on public.cms_catalog_products
for each row execute function private.cms_catalog_record_change();

comment on table public.cms_catalog_product_snapshots is
  'Append-only public snapshots; only the current approved snapshot is visible anonymously.';
comment on table public.cms_catalog_publication_outbox is
  'Publication events keyed by product revision; no public writes or deletes.';
comment on view public.cms_catalog_current_snapshots is
  'Current published catalog projection; empty until the feature flag and publication gates are enabled.';

commit;
