-- Fatia 1 / CAT-001..CAT-004 — fundação aditiva do catálogo novo.
-- Local/staging only: cria o contrato vazio e a flag continua desligada.
-- Não insere produtos, SKU, preço, estoque, disponibilidade ou publicação.

begin;

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:catalog.read', 'Consultar a fundação do catálogo novo.', false),
  ('cms:catalog.edit', 'Editar rascunhos do catálogo novo.', false),
  ('cms:catalog.taxonomy.edit', 'Editar a taxonomia do catálogo novo.', false)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, 'cms:catalog.read'
from public.cms_roles
where role_key in ('super_admin', 'admin', 'commercial', 'technical', 'editor', 'reviewer')
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, 'cms:catalog.edit'
from public.cms_roles
where role_key in ('super_admin', 'admin', 'commercial', 'technical', 'editor')
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, 'cms:catalog.taxonomy.edit'
from public.cms_roles
where role_key in ('super_admin', 'admin', 'technical')
on conflict do nothing;

-- A chave física mantém o namespace EV2 já protegido pelo contrato existente;
-- o nome lógico catalog_v1 continua default-off no contrato da aplicação.
insert into public.cms_feature_flags (flag_key, description, owner_key)
values (
  'ev2.catalog_v1',
  'Fundação do Núcleo de Catálogo, ainda desligada por padrão.',
  'product_owner'
)
on conflict (flag_key) do nothing;

create table public.cms_catalog_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft', 'in_review', 'approved')),
  revision bigint not null default 1 check (revision > 0),
  content jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(content) = 'object'
      and not (content ?| array['sku', 'price', 'stock', 'inventory', 'availability'])
    ),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_catalog_product_revisions (
  product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  revision bigint not null check (revision > 0),
  slug text not null,
  title text not null,
  lifecycle_status text not null check (lifecycle_status in ('draft', 'in_review', 'approved')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  primary key (product_id, revision),
  check (not (content ?| array['sku', 'price', 'stock', 'inventory', 'availability']))
);

create table public.cms_catalog_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  term_type text not null check (term_type in ('category', 'family')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  parent_id uuid references public.cms_catalog_taxonomy_terms (id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft', 'active')),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_type, slug)
);

create table public.cms_catalog_taxonomy_revisions (
  term_id uuid not null references public.cms_catalog_taxonomy_terms (id) on delete restrict,
  revision bigint not null check (revision > 0),
  term_type text not null check (term_type in ('category', 'family')),
  slug text not null,
  title text not null,
  parent_id uuid,
  status text not null check (status in ('draft', 'active')),
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  primary key (term_id, revision)
);

create table public.cms_catalog_product_terms (
  product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  term_id uuid not null references public.cms_catalog_taxonomy_terms (id) on delete restrict,
  relation_kind text not null check (relation_kind in ('category', 'family')),
  attached_by uuid not null references auth.users (id) on delete restrict,
  attached_at timestamptz not null default now(),
  primary key (product_id, term_id, relation_kind)
);

create table public.cms_catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product', 'taxonomy_term', 'product_term')),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  action text not null check (action in ('created', 'updated', 'attached')),
  actor_id uuid not null references auth.users (id) on delete restrict,
  request_id text,
  before_state jsonb,
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  occurred_at timestamptz not null default now()
);

create index cms_catalog_products_status_idx
  on public.cms_catalog_products (lifecycle_status, updated_at desc);
create index cms_catalog_product_revisions_product_idx
  on public.cms_catalog_product_revisions (product_id, revision desc);
create index cms_catalog_taxonomy_terms_parent_idx
  on public.cms_catalog_taxonomy_terms (term_type, parent_id, status);
create index cms_catalog_taxonomy_revisions_term_idx
  on public.cms_catalog_taxonomy_revisions (term_id, revision desc);
create index cms_catalog_product_terms_term_idx
  on public.cms_catalog_product_terms (term_id, relation_kind, product_id);
create index cms_catalog_audit_events_entity_idx
  on public.cms_catalog_audit_events (entity_type, entity_id, occurred_at desc);

create or replace function private.cms_catalog_reject_taxonomy_cycle()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'CMS_CATALOG_TAXONOMY_CYCLE' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.cms_catalog_taxonomy_terms parent
    where parent.id = new.parent_id
      and parent.term_type = new.term_type
  ) then
    raise exception 'CMS_CATALOG_TAXONOMY_PARENT_TYPE_MISMATCH' using errcode = '23514';
  end if;

  if exists (
    with recursive ancestors(id, parent_id, depth) as (
      select term.id, term.parent_id, 1
      from public.cms_catalog_taxonomy_terms term
      where term.id = new.parent_id
      union all
      select parent.id, parent.parent_id, ancestors.depth + 1
      from ancestors
      join public.cms_catalog_taxonomy_terms parent on parent.id = ancestors.parent_id
      where ancestors.parent_id is not null and ancestors.depth < 256
    )
    select 1 from ancestors where ancestors.id = new.id
  ) then
    raise exception 'CMS_CATALOG_TAXONOMY_CYCLE' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.cms_catalog_validate_product_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.revision <> old.revision + 1 then
      raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode = '40001';
    end if;
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'CMS_CATALOG_IMMUTABLE_CREATOR' using errcode = '23514';
    end if;
  elsif new.revision <> 1 then
    raise exception 'CMS_CATALOG_REVISION_INITIAL_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_validate_taxonomy_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.revision <> old.revision + 1 then
      raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode = '40001';
    end if;
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'CMS_CATALOG_IMMUTABLE_CREATOR' using errcode = '23514';
    end if;
  elsif new.revision <> 1 then
    raise exception 'CMS_CATALOG_REVISION_INITIAL_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_validate_product_term()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.cms_catalog_taxonomy_terms term
    where term.id = new.term_id
      and term.term_type = new.relation_kind
  ) then
    raise exception 'CMS_CATALOG_TERM_KIND_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- O append-only de revisões/auditoria é o único uso de SECURITY DEFINER nesta
-- migration: o trigger precisa gravar histórico mesmo sem grant de INSERT ao
-- operador. A função fica no schema privado, valida auth.uid() e não é uma API.
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
      product_id, revision, slug, title, lifecycle_status, content, changed_by
    ) values (
      new.id, new.revision, new.slug, new.title, new.lifecycle_status, new.content, v_actor_id
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

create trigger cms_catalog_taxonomy_cycle
before insert or update of parent_id on public.cms_catalog_taxonomy_terms
for each row execute function private.cms_catalog_reject_taxonomy_cycle();

create trigger cms_catalog_products_revision_guard
before insert or update on public.cms_catalog_products
for each row execute function private.cms_catalog_validate_product_revision();

create trigger cms_catalog_taxonomy_revision_guard
before insert or update on public.cms_catalog_taxonomy_terms
for each row execute function private.cms_catalog_validate_taxonomy_revision();

create trigger cms_catalog_product_terms_kind_guard
before insert on public.cms_catalog_product_terms
for each row execute function private.cms_catalog_validate_product_term();

create trigger cms_catalog_products_touch_updated_at
before update on public.cms_catalog_products
for each row execute function public.cms_touch_updated_at();

create trigger cms_catalog_taxonomy_terms_touch_updated_at
before update on public.cms_catalog_taxonomy_terms
for each row execute function public.cms_touch_updated_at();

create trigger cms_catalog_products_record_change
after insert or update on public.cms_catalog_products
for each row execute function private.cms_catalog_record_change();

create trigger cms_catalog_taxonomy_record_change
after insert or update on public.cms_catalog_taxonomy_terms
for each row execute function private.cms_catalog_record_change();

create trigger cms_catalog_product_terms_record_change
after insert on public.cms_catalog_product_terms
for each row execute function private.cms_catalog_record_change();

create trigger cms_catalog_product_revisions_immutable
before update or delete on public.cms_catalog_product_revisions
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_catalog_taxonomy_revisions_immutable
before update or delete on public.cms_catalog_taxonomy_revisions
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_catalog_audit_events_immutable
before update or delete on public.cms_catalog_audit_events
for each row execute function public.cms_reject_immutable_mutation();

alter table public.cms_catalog_products enable row level security;
alter table public.cms_catalog_product_revisions enable row level security;
alter table public.cms_catalog_taxonomy_terms enable row level security;
alter table public.cms_catalog_taxonomy_revisions enable row level security;
alter table public.cms_catalog_product_terms enable row level security;
alter table public.cms_catalog_audit_events enable row level security;

create policy cms_catalog_products_read
on public.cms_catalog_products for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_products_insert
on public.cms_catalog_products for insert to authenticated
with check (
  public.cms_has_permission('cms:catalog.edit')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy cms_catalog_products_update
on public.cms_catalog_products for update to authenticated
using (public.cms_has_permission('cms:catalog.edit'))
with check (
  public.cms_has_permission('cms:catalog.edit')
  and updated_by = (select auth.uid())
);

create policy cms_catalog_product_revisions_read
on public.cms_catalog_product_revisions for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_taxonomy_terms_read
on public.cms_catalog_taxonomy_terms for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_taxonomy_terms_insert
on public.cms_catalog_taxonomy_terms for insert to authenticated
with check (
  public.cms_has_permission('cms:catalog.taxonomy.edit')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy cms_catalog_taxonomy_terms_update
on public.cms_catalog_taxonomy_terms for update to authenticated
using (public.cms_has_permission('cms:catalog.taxonomy.edit'))
with check (
  public.cms_has_permission('cms:catalog.taxonomy.edit')
  and updated_by = (select auth.uid())
);

create policy cms_catalog_taxonomy_revisions_read
on public.cms_catalog_taxonomy_revisions for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_product_terms_read
on public.cms_catalog_product_terms for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_product_terms_insert
on public.cms_catalog_product_terms for insert to authenticated
with check (
  public.cms_has_permission('cms:catalog.edit')
  and attached_by = (select auth.uid())
);

create policy cms_catalog_audit_events_read
on public.cms_catalog_audit_events for select to authenticated
using (public.cms_has_permission('cms:audit.read'));

revoke all on table
  public.cms_catalog_products,
  public.cms_catalog_product_revisions,
  public.cms_catalog_taxonomy_terms,
  public.cms_catalog_taxonomy_revisions,
  public.cms_catalog_product_terms,
  public.cms_catalog_audit_events
from public, anon, authenticated;

grant select, insert, update on table
  public.cms_catalog_products,
  public.cms_catalog_taxonomy_terms
to authenticated;

grant select, insert on table public.cms_catalog_product_terms to authenticated;
grant select on table
  public.cms_catalog_product_revisions,
  public.cms_catalog_taxonomy_revisions,
  public.cms_catalog_audit_events
to authenticated;

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

  update public.cms_catalog_products
  set slug = p_slug,
      title = p_title,
      content = p_content,
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

revoke all on function public.cms_catalog_update_product(uuid, bigint, text, text, jsonb)
from public, anon;
grant execute on function public.cms_catalog_update_product(uuid, bigint, text, text, jsonb)
to authenticated;

comment on table public.cms_catalog_products is
  'Fatia 1 foundation; draft/review/approved only, no publication or commercial fields.';
comment on table public.cms_catalog_product_revisions is
  'Append-only optimistic revisions for catalog products.';
comment on table public.cms_catalog_taxonomy_terms is
  'Category/family hierarchy with one parent and cycle protection.';
comment on table public.cms_catalog_audit_events is
  'Append-only audit trail for catalog foundation mutations.';

commit;
