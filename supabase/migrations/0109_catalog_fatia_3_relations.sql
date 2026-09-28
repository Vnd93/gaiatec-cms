-- Fatia 3 / CAT-008..CAT-009 — relações, composição e herança aditivas.
-- Local/staging only: nenhum produto ou relação é carregado e a flag permanece desligada.
-- Não publica, importa, copia ou substitui dados do catálogo legado.

begin;

alter table public.cms_catalog_products
  add column catalog_entity_kind text not null default 'product';

alter table public.cms_catalog_products
  add constraint cms_catalog_products_entity_kind_check
    check (catalog_entity_kind in ('product', 'model', 'variant', 'kit'));

-- Revisões anteriores continuam válidas; a nova coluna permite preservar o tipo
-- quando a rotina de auditoria registra uma revisão futura.
alter table public.cms_catalog_product_revisions
  add column catalog_entity_kind text not null default 'product';

alter table public.cms_catalog_product_revisions
  add constraint cms_catalog_product_revisions_entity_kind_check
    check (catalog_entity_kind in ('product', 'model', 'variant', 'kit'));

create table public.cms_catalog_composition_units (
  unit_code text primary key check (unit_code ~ '^[a-z][a-z0-9_]{0,15}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  active boolean not null default true
);

insert into public.cms_catalog_composition_units (unit_code, label)
values
  ('un', 'Unidade'),
  ('set', 'Conjunto'),
  ('g', 'Grama'),
  ('kg', 'Quilograma'),
  ('ml', 'Mililitro'),
  ('l', 'Litro'),
  ('mm', 'Milímetro'),
  ('cm', 'Centímetro'),
  ('m', 'Metro')
on conflict (unit_code) do nothing;

create table public.cms_catalog_product_hierarchy_revisions (
  hierarchy_key uuid not null,
  revision bigint not null check (revision > 0),
  child_product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  parent_product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  hierarchy_kind text not null check (hierarchy_kind in ('variant_model', 'model_product')),
  status text not null default 'active' check (status in ('active', 'retracted')),
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  change_reason text not null check (char_length(btrim(change_reason)) between 1 and 240),
  primary key (hierarchy_key, revision),
  check (child_product_id <> parent_product_id)
);

create index cms_catalog_product_hierarchy_latest_idx
  on public.cms_catalog_product_hierarchy_revisions (child_product_id, hierarchy_kind, revision desc);

create table public.cms_catalog_product_relation_revisions (
  relation_key uuid not null,
  revision bigint not null check (revision > 0),
  source_product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  target_product_id uuid not null references public.cms_catalog_products (id) on delete restrict,
  relation_kind text not null check (relation_kind in (
    'contains', 'required_component', 'optional_component', 'accessory',
    'compatible', 'alternative', 'substitutes', 'successor', 'local_exclusion'
  )),
  quantity numeric(20, 6),
  unit_code text references public.cms_catalog_composition_units (unit_code) on delete restrict,
  status text not null default 'active' check (status in ('active', 'retracted')),
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  change_reason text not null check (char_length(btrim(change_reason)) between 1 and 240),
  primary key (relation_key, revision),
  check (source_product_id <> target_product_id),
  check (quantity is null or quantity > 0),
  check (
    (relation_kind in ('contains', 'required_component', 'optional_component')
      and quantity is not null and unit_code is not null)
    or
    (relation_kind not in ('contains', 'required_component', 'optional_component')
      and quantity is null and unit_code is null)
  )
);

alter table public.cms_catalog_audit_events
  drop constraint if exists cms_catalog_audit_events_entity_type_check;

alter table public.cms_catalog_audit_events
  add constraint cms_catalog_audit_events_entity_type_check
    check (entity_type in (
      'product', 'taxonomy_term', 'product_term', 'product_relation', 'product_hierarchy'
    ));

alter table public.cms_catalog_audit_events
  drop constraint if exists cms_catalog_audit_events_action_check;

alter table public.cms_catalog_audit_events
  add constraint cms_catalog_audit_events_action_check
    check (action in (
      'created', 'updated', 'attached', 'published', 'unpublished',
      'relation_changed', 'hierarchy_changed'
    ));

create index cms_catalog_product_relation_latest_idx
  on public.cms_catalog_product_relation_revisions (source_product_id, target_product_id, relation_kind, revision desc);

create or replace view public.cms_catalog_current_product_hierarchy
with (security_invoker = true)
as
select distinct on (hierarchy_key)
  hierarchy_key, revision, child_product_id, parent_product_id, hierarchy_kind,
  status, changed_by, changed_at, change_reason
from public.cms_catalog_product_hierarchy_revisions
order by hierarchy_key, revision desc;

create or replace view public.cms_catalog_current_product_relations
with (security_invoker = true)
as
select distinct on (relation_key)
  relation_key, revision, source_product_id, target_product_id, relation_kind,
  quantity, unit_code, status, changed_by, changed_at, change_reason
from public.cms_catalog_product_relation_revisions
order by relation_key, revision desc;

create or replace function private.cms_catalog_latest_hierarchy_rows()
returns table (
  hierarchy_key uuid,
  revision bigint,
  child_product_id uuid,
  parent_product_id uuid,
  hierarchy_kind text,
  status text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select current_row.hierarchy_key, current_row.revision, current_row.child_product_id,
         current_row.parent_product_id, current_row.hierarchy_kind, current_row.status
  from public.cms_catalog_current_product_hierarchy current_row;
$$;

create or replace function private.cms_catalog_latest_relation_rows()
returns table (
  relation_key uuid,
  revision bigint,
  source_product_id uuid,
  target_product_id uuid,
  relation_kind text,
  quantity numeric,
  unit_code text,
  status text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select current_row.relation_key, current_row.revision, current_row.source_product_id,
         current_row.target_product_id, current_row.relation_kind, current_row.quantity,
         current_row.unit_code, current_row.status
  from public.cms_catalog_current_product_relations current_row;
$$;

create or replace function private.cms_catalog_validate_hierarchy_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_child_kind text;
  v_parent_kind text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'CMS_CATALOG_HIERARCHY_IMMUTABLE' using errcode = '55000';
  end if;

  if new.revision <> coalesce((
    select max(previous.revision) + 1
    from public.cms_catalog_product_hierarchy_revisions previous
    where previous.hierarchy_key = new.hierarchy_key
  ), 1) then
    raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode = '40001';
  end if;

  select catalog_entity_kind into v_child_kind
  from public.cms_catalog_products where id = new.child_product_id;
  select catalog_entity_kind into v_parent_kind
  from public.cms_catalog_products where id = new.parent_product_id;

  if new.hierarchy_kind = 'variant_model'
     and (v_child_kind <> 'variant' or v_parent_kind <> 'model') then
    raise exception 'CMS_CATALOG_HIERARCHY_KIND_MISMATCH' using errcode = '23514';
  end if;
  if new.hierarchy_kind = 'model_product'
     and (v_child_kind <> 'model' or v_parent_kind not in ('product', 'kit')) then
    raise exception 'CMS_CATALOG_HIERARCHY_KIND_MISMATCH' using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    with recursive ancestors(product_id, depth) as (
      select new.parent_product_id, 1
      union all
      select hierarchy.parent_product_id, ancestors.depth + 1
      from ancestors
      join public.cms_catalog_current_product_hierarchy hierarchy
        on hierarchy.child_product_id = ancestors.product_id
       and hierarchy.status = 'active'
      where ancestors.depth < 8
    )
    select 1 from ancestors where product_id = new.child_product_id
  ) then
    raise exception 'CMS_CATALOG_HIERARCHY_CYCLE' using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1
    from public.cms_catalog_current_product_hierarchy current_row
    where current_row.status = 'active'
      and current_row.child_product_id = new.child_product_id
      and current_row.hierarchy_kind = new.hierarchy_kind
      and current_row.hierarchy_key <> new.hierarchy_key
  ) then
    raise exception 'CMS_CATALOG_HIERARCHY_PARENT_DUPLICATE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_validate_product_relation_revision()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source_kind text;
  v_target_kind text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'CMS_CATALOG_RELATION_IMMUTABLE' using errcode = '55000';
  end if;

  if new.revision <> coalesce((
    select max(previous.revision) + 1
    from public.cms_catalog_product_relation_revisions previous
    where previous.relation_key = new.relation_key
  ), 1) then
    raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode = '40001';
  end if;

  select catalog_entity_kind into v_source_kind
  from public.cms_catalog_products where id = new.source_product_id;
  select catalog_entity_kind into v_target_kind
  from public.cms_catalog_products where id = new.target_product_id;

  if v_source_kind = 'kit' and v_target_kind = 'kit' then
    raise exception 'CMS_CATALOG_NESTED_KIT' using errcode = '23514';
  end if;

  if new.relation_kind in ('accessory', 'compatible', 'alternative')
     and new.source_product_id > new.target_product_id then
    raise exception 'CMS_CATALOG_SYMMETRIC_RELATION_CANONICAL_ORDER' using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1
    from public.cms_catalog_current_product_relations current_row
    where current_row.status = 'active'
      and current_row.source_product_id = new.source_product_id
      and current_row.target_product_id = new.target_product_id
      and current_row.relation_kind = new.relation_kind
      and current_row.relation_key <> new.relation_key
  ) then
    raise exception 'CMS_CATALOG_RELATION_DUPLICATE' using errcode = '23514';
  end if;

  if new.status = 'active' and new.relation_kind in (
    'contains', 'required_component', 'optional_component', 'substitutes', 'successor'
  ) and exists (
    with recursive reachable(product_id, depth) as (
      select new.target_product_id, 1
      union all
      select current_row.target_product_id, reachable.depth + 1
      from reachable
      join public.cms_catalog_current_product_relations current_row
        on current_row.source_product_id = reachable.product_id
       and current_row.status = 'active'
       and current_row.relation_kind in (
         'contains', 'required_component', 'optional_component', 'substitutes', 'successor'
       )
      where reachable.depth < 256
    )
    select 1 from reachable where product_id = new.source_product_id
  ) then
    raise exception 'CMS_CATALOG_RELATION_CYCLE' using errcode = '23514';
  end if;

  return new;
end;
$$;

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
      product_id, revision, slug, title, lifecycle_status, content,
      changed_by, catalog_entity_kind
    ) values (
      new.id, new.revision, new.slug, new.title, new.lifecycle_status,
      new.content, v_actor_id, new.catalog_entity_kind
    );
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product', new.id::text, v_action, v_actor_id, v_request_id,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_taxonomy_terms' then
    insert into public.cms_catalog_taxonomy_revisions (
      term_id, revision, term_type, slug, title, parent_id, status, changed_by
    ) values (
      new.id, new.revision, new.term_type, new.slug, new.title, new.parent_id,
      new.status, v_actor_id
    );
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'taxonomy_term', new.id::text, v_action, v_actor_id, v_request_id,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_product_terms' then
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product_term', new.product_id::text || ':' || new.term_id::text,
      'attached', v_actor_id, v_request_id, null, to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_product_relation_revisions' then
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product_relation', new.relation_key::text || ':' || new.revision::text,
      'relation_changed', v_actor_id, v_request_id, null, to_jsonb(new)
    );
  elsif tg_table_name = 'cms_catalog_product_hierarchy_revisions' then
    insert into public.cms_catalog_audit_events (
      entity_type, entity_id, action, actor_id, request_id, before_state, after_state
    ) values (
      'product_hierarchy', new.hierarchy_key::text || ':' || new.revision::text,
      'hierarchy_changed', v_actor_id, v_request_id, null, to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

create or replace function public.cms_catalog_record_relation_revision(
  p_relation_key uuid,
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_relation_kind text,
  p_quantity numeric,
  p_unit_code text,
  p_expected_revision bigint,
  p_change_reason text
)
returns public.cms_catalog_product_relation_revisions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_relation public.cms_catalog_product_relation_revisions;
  v_relation_key uuid := coalesce(p_relation_key, gen_random_uuid());
  v_revision bigint := coalesce((
    select max(revision) + 1
    from public.cms_catalog_product_relation_revisions
    where relation_key = v_relation_key
  ), 1);
begin
  if not exists (
    select 1 from public.cms_feature_flags
    where flag_key = 'ev2.catalog_v1' and default_enabled = true
  ) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if not public.cms_has_permission('cms:catalog.edit') then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if p_relation_key is not null and p_expected_revision is distinct from v_revision - 1 then
    raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode = '40001';
  end if;
  perform set_config('cms.catalog_relation_command', 'on', true);
  insert into public.cms_catalog_product_relation_revisions (
    relation_key, revision, source_product_id, target_product_id,
    relation_kind, quantity, unit_code, changed_by, change_reason
  ) values (
    v_relation_key, v_revision, p_source_product_id, p_target_product_id,
    p_relation_kind, p_quantity, p_unit_code, auth.uid(), p_change_reason
  ) returning * into v_relation;
  return v_relation;
end;
$$;

create or replace function public.cms_catalog_record_hierarchy_revision(
  p_hierarchy_key uuid,
  p_child_product_id uuid,
  p_parent_product_id uuid,
  p_hierarchy_kind text,
  p_expected_revision bigint,
  p_change_reason text
)
returns public.cms_catalog_product_hierarchy_revisions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hierarchy public.cms_catalog_product_hierarchy_revisions;
  v_hierarchy_key uuid := coalesce(p_hierarchy_key, gen_random_uuid());
  v_revision bigint := coalesce((
    select max(revision) + 1
    from public.cms_catalog_product_hierarchy_revisions
    where hierarchy_key = v_hierarchy_key
  ), 1);
begin
  if not exists (
    select 1 from public.cms_feature_flags
    where flag_key = 'ev2.catalog_v1' and default_enabled = true
  ) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if not public.cms_has_permission('cms:catalog.edit') then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if p_hierarchy_key is not null and p_expected_revision is distinct from v_revision - 1 then
    raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode = '40001';
  end if;
  perform set_config('cms.catalog_relation_command', 'on', true);
  insert into public.cms_catalog_product_hierarchy_revisions (
    hierarchy_key, revision, child_product_id, parent_product_id,
    hierarchy_kind, changed_by, change_reason
  ) values (
    v_hierarchy_key, v_revision, p_child_product_id, p_parent_product_id,
    p_hierarchy_kind, auth.uid(), p_change_reason
  ) returning * into v_hierarchy;
  return v_hierarchy;
end;
$$;

create or replace view public.cms_catalog_effective_relations
with (security_invoker = true)
as
with recursive subject_ancestors(subject_product_id, origin_product_id, origin_level) as (
  select product.id, product.id, 0
  from public.cms_catalog_products product
  union all
  select ancestors.subject_product_id, hierarchy.parent_product_id, ancestors.origin_level + 1
  from subject_ancestors ancestors
  join public.cms_catalog_current_product_hierarchy hierarchy
    on hierarchy.child_product_id = ancestors.origin_product_id
   and hierarchy.status = 'active'
  where ancestors.origin_level < 2
), ranked as (
  select ancestors.subject_product_id,
         relations.target_product_id,
         relations.relation_kind,
         relations.quantity,
         relations.unit_code,
         ancestors.origin_product_id as relation_origin_product_id,
         ancestors.origin_level as relation_origin_level,
         row_number() over (
           partition by ancestors.subject_product_id, relations.target_product_id
           order by ancestors.origin_level,
             case when relations.relation_kind = 'local_exclusion' then 0 else 1 end,
             relations.revision desc
         ) as precedence_rank
  from subject_ancestors ancestors
  join public.cms_catalog_current_product_relations relations
    on relations.source_product_id = ancestors.origin_product_id
   and relations.status = 'active'
)
select subject_product_id, target_product_id, relation_kind, quantity, unit_code,
       relation_origin_product_id, relation_origin_level,
       (relation_kind = 'local_exclusion') as is_local_exclusion
from ranked
where precedence_rank = 1;

create trigger cms_catalog_hierarchy_revision_guard
before insert on public.cms_catalog_product_hierarchy_revisions
for each row execute function private.cms_catalog_validate_hierarchy_revision();

create trigger cms_catalog_relation_revision_guard
before insert on public.cms_catalog_product_relation_revisions
for each row execute function private.cms_catalog_validate_product_relation_revision();

create trigger cms_catalog_hierarchy_revision_immutable
before update or delete on public.cms_catalog_product_hierarchy_revisions
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_catalog_relation_revision_immutable
before update or delete on public.cms_catalog_product_relation_revisions
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_catalog_relation_revision_audit
after insert on public.cms_catalog_product_relation_revisions
for each row execute function private.cms_catalog_record_change();

create trigger cms_catalog_hierarchy_revision_audit
after insert on public.cms_catalog_product_hierarchy_revisions
for each row execute function private.cms_catalog_record_change();

alter table public.cms_catalog_composition_units enable row level security;
alter table public.cms_catalog_product_hierarchy_revisions enable row level security;
alter table public.cms_catalog_product_relation_revisions enable row level security;

create policy cms_catalog_composition_units_read
on public.cms_catalog_composition_units for select to authenticated
using (public.cms_has_permission('cms:catalog.read') and active);

create policy cms_catalog_hierarchy_read
on public.cms_catalog_product_hierarchy_revisions for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_relation_read
on public.cms_catalog_product_relation_revisions for select to authenticated
using (public.cms_has_permission('cms:catalog.read'));

create policy cms_catalog_hierarchy_insert
on public.cms_catalog_product_hierarchy_revisions for insert to authenticated
with check (
  public.cms_has_permission('cms:catalog.edit')
  and changed_by = (select auth.uid())
  and current_setting('cms.catalog_relation_command', true) = 'on'
);

create policy cms_catalog_relation_insert
on public.cms_catalog_product_relation_revisions for insert to authenticated
with check (
  public.cms_has_permission('cms:catalog.edit')
  and changed_by = (select auth.uid())
  and current_setting('cms.catalog_relation_command', true) = 'on'
);

revoke all on table
  public.cms_catalog_composition_units,
  public.cms_catalog_product_hierarchy_revisions,
  public.cms_catalog_product_relation_revisions
from public, anon, authenticated;

grant select on table public.cms_catalog_composition_units to authenticated;
grant select, insert on table
  public.cms_catalog_product_hierarchy_revisions,
  public.cms_catalog_product_relation_revisions
to authenticated;

revoke all on function private.cms_catalog_latest_hierarchy_rows() from public, anon, authenticated;
revoke all on function private.cms_catalog_latest_relation_rows() from public, anon, authenticated;
revoke all on function private.cms_catalog_validate_hierarchy_revision() from public, anon, authenticated;
revoke all on function private.cms_catalog_validate_product_relation_revision() from public, anon, authenticated;
revoke all on function private.cms_catalog_record_change() from public, anon, authenticated;
revoke all on function public.cms_catalog_record_relation_revision(uuid, uuid, uuid, text, numeric, text, bigint, text)
from public, anon;
grant execute on function public.cms_catalog_record_relation_revision(uuid, uuid, uuid, text, numeric, text, bigint, text)
to authenticated;
revoke all on function public.cms_catalog_record_hierarchy_revision(uuid, uuid, uuid, text, bigint, text)
from public, anon;
grant execute on function public.cms_catalog_record_hierarchy_revision(uuid, uuid, uuid, text, bigint, text)
to authenticated;

revoke all on public.cms_catalog_current_product_hierarchy from public, anon;
revoke all on public.cms_catalog_current_product_relations from public, anon;
revoke all on public.cms_catalog_effective_relations from public, anon;
grant select on public.cms_catalog_current_product_hierarchy,
  public.cms_catalog_current_product_relations,
  public.cms_catalog_effective_relations to authenticated;

comment on table public.cms_catalog_product_relation_revisions is
  'Append-only typed relations; composition requires positive quantity and controlled unit.';
comment on table public.cms_catalog_product_hierarchy_revisions is
  'Append-only Variant->Model->Product inheritance links; one active parent per level.';
comment on view public.cms_catalog_effective_relations is
  'Deterministic relation projection: direct wins inherited, local exclusion wins at the same level, origin is exposed.';

commit;
