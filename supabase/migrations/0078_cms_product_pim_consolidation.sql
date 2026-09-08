-- Product/content is the only writable catalog source.  The normalized PIM
-- remains available as a scoped, read-only compatibility graph.  Existing
-- rows are linked conservatively and are retired only after a complete,
-- reproducible equivalence check.

-- The original materialized projections assumed globally unique variant codes
-- and one value per attribute key. Canonical products scope both identities.
alter table public.cms_product_variant_projection
  drop constraint if exists cms_product_variant_projection_item_id_variant_code_key;
create unique index cms_product_variant_projection_item_model_code_uidx
  on public.cms_product_variant_projection (item_id, model_id, lower(variant_code));

alter table public.cms_product_attribute_projection
  drop constraint if exists cms_product_attribute_projection_item_id_attribute_key_key;
alter table public.cms_product_attribute_projection
  add column definition_id uuid,
  add column owner_scope text not null default 'product',
  add column owner_id uuid;
alter table public.cms_product_attribute_projection
  add constraint cms_product_attribute_projection_owner_scope_check
  check (
    (owner_scope = 'product' and owner_id is null)
    or (owner_scope in ('model', 'variant') and owner_id is not null)
  );
create unique index cms_product_attribute_projection_scoped_uidx
  on public.cms_product_attribute_projection (
    item_id,
    coalesce(definition_id::text, 'key:' || lower(attribute_key)),
    owner_scope,
    coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- definition_id/owner_id are internal reconciliation keys. Public consumers
-- receive the allowlisted payload from cms-public, never this internal table.
revoke select on table public.cms_product_attribute_projection
  from anon, authenticated;
drop policy if exists cms_product_attributes_public
  on public.cms_product_attribute_projection;

create table public.cms_pim_content_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  legacy_product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  content_item_id uuid references public.cms_content_items (id) on delete restrict,
  matched_by text not null check (matched_by in ('content_item_id', 'slug_unique', 'none')),
  result text not null check (
    result in (
      'archived_equivalent',
      'retired_acknowledged_gap',
      'linked_divergent',
      'already_archived',
      'unlinked_no_candidate',
      'unlinked_scope_mismatch',
      'unlinked_identity_conflict'
    )
  ),
  critical boolean not null,
  legacy_snapshot_sha256 text not null check (legacy_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_snapshot_sha256 text check (
    canonical_snapshot_sha256 is null or canonical_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index cms_pim_reconciliation_product_time_idx
  on public.cms_pim_content_reconciliation_events (legacy_product_id, occurred_at desc);
create index cms_pim_reconciliation_content_critical_idx
  on public.cms_pim_content_reconciliation_events (content_item_id, occurred_at desc)
  where critical;

alter table public.cms_pim_content_reconciliation_events enable row level security;
create trigger cms_pim_content_reconciliation_events_immutable
before update or delete on public.cms_pim_content_reconciliation_events
for each row execute function public.cms_reject_immutable_mutation();

revoke all on table public.cms_pim_content_reconciliation_events
  from public, anon, authenticated, service_role;
grant select on table public.cms_pim_content_reconciliation_events to service_role;

create table public.cms_pim_content_reconciliation_receipts (
  actor_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  legacy_product_id uuid not null references public.cms_pim_products (id) on delete restrict,
  content_item_id uuid not null references public.cms_content_items (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, idempotency_key)
);

alter table public.cms_pim_content_reconciliation_receipts enable row level security;
revoke all on table public.cms_pim_content_reconciliation_receipts
  from public, anon, authenticated, service_role;
grant select on table public.cms_pim_content_reconciliation_receipts to service_role;

create function private.cms_pim_content_scope_compatible_0078(
  p_product_id uuid,
  p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_pim_products product
    join public.cms_content_items item on item.id = p_item_id
    join public.cms_content_drafts draft on draft.item_id = item.id
    cross join lateral (
      select coalesce(
        (
          select lease.environment
          from private.cms_qa_actor_leases lease
          where lease.actor_id = product.created_by
        ),
        'local'
      ) as environment
    ) scope
    where product.id = p_product_id
      and item.content_type = 'product'
      and private.cms_content_actor_context_active(product.created_by, scope.environment)
      and private.cms_pim_product_graph_scope_allowed(
        product.created_by, product.id, scope.environment, product.site_key
      )
      and private.cms_content_actor_row_scope_allowed(
        product.created_by, item.created_by, item.created_at, scope.environment
      )
      and private.cms_content_actor_row_scope_allowed(
        product.created_by, item.updated_by, item.updated_at, scope.environment
      )
      and private.cms_content_actor_row_scope_allowed(
        product.created_by, draft.updated_by, draft.updated_at, scope.environment
      )
  );
$$;

create function private.cms_pim_canonical_identity_valid_0078(p_payload jsonb)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with canonical_models as (
    select model
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload -> 'models') = 'array'
        then p_payload -> 'models' else '[]'::jsonb end
    ) model
  ), canonical_variants as (
    select model, variant
    from canonical_models
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(model -> 'variants') = 'array'
        then model -> 'variants' else '[]'::jsonb end
    ) variant
  ), canonical_skus as (
    select nullif(lower(btrim(model ->> 'sku')), '') as value from canonical_models
    union all
    select nullif(lower(btrim(variant ->> 'sku')), '') from canonical_variants
  ), canonical_identifiers as (
    select identifier
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload -> 'externalIdentifiers') = 'array'
        then p_payload -> 'externalIdentifiers' else '[]'::jsonb end
    ) identifier
  )
  select jsonb_typeof(p_payload) = 'object'
    and jsonb_typeof(p_payload -> 'models') = 'array'
    and not exists (
      select 1 from canonical_models
      where model ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and not exists (
      select 1 from canonical_variants
      where variant ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and (select count(*) from canonical_models)
      = (select count(distinct lower(model ->> 'id')) from canonical_models)
    and (select count(*) from canonical_variants)
      = (select count(distinct lower(variant ->> 'id')) from canonical_variants)
    and not exists (
      select 1
      from canonical_models
      join canonical_variants
        on lower(canonical_variants.variant ->> 'id') = lower(canonical_models.model ->> 'id')
    )
    and (select count(*) from canonical_skus where value is not null)
      = (select count(distinct value) from canonical_skus where value is not null)
    and (select count(*) from canonical_variants)
      = (
        select count(distinct (
          lower(model ->> 'id'), lower(btrim(variant ->> 'code'))
        ))
        from canonical_variants
        where nullif(btrim(variant ->> 'code'), '') is not null
      )
    and not exists (
      select 1
      from canonical_identifiers
      where identifier ->> 'id'
              !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or identifier ->> 'kind' not in ('erp', 'gtin', 'ncm', 'other')
         or nullif(public.cms_normalize_master_name(identifier ->> 'value'), '') is null
         or (
           identifier ->> 'kind' = 'gtin'
           and identifier ->> 'value' !~ '^[0-9]{8}([0-9]{4}([0-9]{1,2})?)?$'
         )
         or (identifier ->> 'kind' = 'ncm' and identifier ->> 'value' !~ '^[0-9]{8}$')
         or identifier #>> '{owner,type}' not in ('product', 'model', 'variant')
         or (
           identifier #>> '{owner,type}' = 'product'
           and identifier #> '{owner,id}' is not null
         )
         or (
           identifier #>> '{owner,type}' = 'model'
           and not exists (
             select 1 from canonical_models model
             where lower(model.model ->> 'id') = lower(identifier #>> '{owner,id}')
           )
         )
         or (
           identifier #>> '{owner,type}' = 'variant'
           and not exists (
             select 1 from canonical_variants variant
             where lower(variant.variant ->> 'id') = lower(identifier #>> '{owner,id}')
           )
         )
    )
    and (select count(*) from canonical_identifiers)
      = (select count(distinct lower(identifier ->> 'id')) from canonical_identifiers)
    and (select count(*) from canonical_identifiers)
      = (
        select count(distinct (
          identifier ->> 'kind',
          public.cms_normalize_master_name(identifier ->> 'value')
        ))
        from canonical_identifiers
      );
$$;

create table public.cms_product_canonical_sku_registry (
  scope_key text not null check (char_length(scope_key) between 9 and 180),
  site_key text not null default 'main' check (site_key = 'main'),
  normalized_sku text not null check (char_length(normalized_sku) between 1 and 120),
  display_sku text not null check (char_length(btrim(display_sku)) between 1 and 120),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  first_owner_type text not null check (first_owner_type in ('model', 'variant')),
  first_owner_id uuid not null,
  claimed_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key (scope_key, site_key, normalized_sku)
);

create index cms_product_sku_registry_item_idx
  on public.cms_product_canonical_sku_registry (item_id, claimed_at);

create table public.cms_product_canonical_identifier_registry (
  scope_key text not null check (char_length(scope_key) between 9 and 180),
  site_key text not null default 'main' check (site_key = 'main'),
  identifier_kind text not null check (identifier_kind in ('erp', 'gtin', 'ncm', 'other')),
  normalized_value text not null check (char_length(normalized_value) between 1 and 180),
  display_value text not null check (char_length(btrim(display_value)) between 1 and 180),
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  first_owner_type text not null check (first_owner_type in ('product', 'model', 'variant')),
  first_owner_id uuid,
  claimed_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key (scope_key, site_key, identifier_kind, normalized_value),
  check ((first_owner_type = 'product') = (first_owner_id is null))
);

create index cms_product_identifier_registry_item_idx
  on public.cms_product_canonical_identifier_registry (item_id, claimed_at);

create table public.cms_product_canonical_registry_cleanup_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  run_tag text not null,
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  environment text not null check (environment in ('staging', 'production')),
  terminal_status text not null check (terminal_status in ('cleaned', 'expired')),
  sku_claim_count integer not null check (sku_claim_count >= 0),
  identifier_claim_count integer not null check (identifier_claim_count >= 0),
  claims_sha256 text not null check (claims_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (actor_id, run_tag, candidate_sha, environment)
);

create function private.cms_product_registry_immutable_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE'
     and old.scope_key like 'qa:%'
     and current_setting('cms.product_registry_terminal_scope_key', true) = old.scope_key then
    return old;
  end if;
  raise exception 'CMS_IMMUTABLE_RECORD' using errcode = '55000';
end;
$$;

alter table public.cms_product_canonical_sku_registry enable row level security;
alter table public.cms_product_canonical_identifier_registry enable row level security;
alter table public.cms_product_canonical_registry_cleanup_events enable row level security;
create trigger cms_product_canonical_sku_registry_immutable
before update or delete on public.cms_product_canonical_sku_registry
for each row execute function private.cms_product_registry_immutable_0078();
create trigger cms_product_canonical_identifier_registry_immutable
before update or delete on public.cms_product_canonical_identifier_registry
for each row execute function private.cms_product_registry_immutable_0078();
create trigger cms_product_canonical_registry_cleanup_events_immutable
before update or delete on public.cms_product_canonical_registry_cleanup_events
for each row execute function public.cms_reject_immutable_mutation();
revoke all on table
  public.cms_product_canonical_sku_registry,
  public.cms_product_canonical_identifier_registry,
  public.cms_product_canonical_registry_cleanup_events
from public, anon, authenticated, service_role;
grant select on table
  public.cms_product_canonical_sku_registry,
  public.cms_product_canonical_identifier_registry,
  public.cms_product_canonical_registry_cleanup_events
to service_role;

create function private.cms_cleanup_terminal_product_registry_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_scope_key text;
  v_sku_count integer;
  v_identifier_count integer;
  v_claims_sha text;
  v_previous_scope text := current_setting(
    'cms.product_registry_terminal_scope_key', true
  );
begin
  if old.status <> 'active'
     or new.status not in ('cleaned', 'expired')
     or new.status = old.status then
    return new;
  end if;

  -- A reviewer/operator pair can share one QA run. Keep the run namespace
  -- until its last non-expired lease is terminalized.
  if exists (
    select 1
    from private.cms_qa_actor_leases peer
    where peer.actor_id <> old.actor_id
      and peer.run_tag = old.run_tag
      and peer.candidate_sha = old.candidate_sha
      and peer.environment = old.environment
      and peer.status = 'active'
      and peer.expires_at > statement_timestamp()
      and private.cms_qa_actor_marker_is_exact(
        peer.actor_id, peer.run_tag, peer.candidate_sha, peer.environment
      )
  ) then
    return new;
  end if;

  v_scope_key := format(
    'qa:%s:%s:%s', old.environment, old.candidate_sha, old.run_tag
  );
  lock table
    public.cms_product_canonical_sku_registry,
    public.cms_product_canonical_identifier_registry
  in share row exclusive mode;

  select count(*)::integer into v_sku_count
  from public.cms_product_canonical_sku_registry registry
  where registry.scope_key = v_scope_key;
  select count(*)::integer into v_identifier_count
  from public.cms_product_canonical_identifier_registry registry
  where registry.scope_key = v_scope_key;
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'sku', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'itemId', registry.item_id,
                'ownerType', registry.first_owner_type,
                'ownerId', registry.first_owner_id,
                'valueSha256', encode(
                  extensions.digest(convert_to(registry.normalized_sku, 'UTF8'), 'sha256'),
                  'hex'
                )
              ) order by registry.item_id, registry.normalized_sku
            )
            from public.cms_product_canonical_sku_registry registry
            where registry.scope_key = v_scope_key
          ), '[]'::jsonb),
          'identifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'itemId', registry.item_id,
                'kind', registry.identifier_kind,
                'ownerType', registry.first_owner_type,
                'ownerId', registry.first_owner_id,
                'valueSha256', encode(
                  extensions.digest(convert_to(registry.normalized_value, 'UTF8'), 'sha256'),
                  'hex'
                )
              ) order by registry.item_id, registry.identifier_kind, registry.normalized_value
            )
            from public.cms_product_canonical_identifier_registry registry
            where registry.scope_key = v_scope_key
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_claims_sha;

  perform set_config('cms.product_registry_terminal_scope_key', v_scope_key, true);
  delete from public.cms_product_canonical_sku_registry
  where scope_key = v_scope_key;
  delete from public.cms_product_canonical_identifier_registry
  where scope_key = v_scope_key;
  perform set_config(
    'cms.product_registry_terminal_scope_key',
    coalesce(nullif(v_previous_scope, ''), 'off'),
    true
  );

  insert into public.cms_product_canonical_registry_cleanup_events (
    actor_id, run_tag, candidate_sha, environment, terminal_status,
    sku_claim_count, identifier_claim_count, claims_sha256
  ) values (
    old.actor_id, old.run_tag, old.candidate_sha, old.environment, new.status,
    v_sku_count, v_identifier_count, v_claims_sha
  ) on conflict (actor_id, run_tag, candidate_sha, environment) do nothing;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    old.actor_id,
    'cms:qa.product_registry_cleaned',
    'qa_fixture',
    old.run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'environment', old.environment,
      'candidateSha', old.candidate_sha,
      'terminalStatus', new.status,
      'skuClaimCount', v_sku_count,
      'identifierClaimCount', v_identifier_count,
      'claimsSha256', v_claims_sha,
      'containsPii', false
    ),
    gen_random_uuid()
  );
  return new;
exception when others then
  perform set_config(
    'cms.product_registry_terminal_scope_key',
    coalesce(nullif(v_previous_scope, ''), 'off'),
    true
  );
  raise;
end;
$$;

-- Runs before the broad 0064 compensation trigger so FK-restricted canonical
-- claims cannot prevent terminal cleanup of the synthetic content graph.
create trigger cms_00_product_registry_terminal_cleanup_0078
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_product_registry_0078();

create function private.cms_product_registry_scope_key_0078(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null then null
    when lease.actor_id is null then 'corporate'
    when private.cms_qa_actor_marker_is_exact(
      lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
    ) then format(
      'qa:%s:%s:%s', lease.environment, lease.candidate_sha, lease.run_tag
    )
    else null
  end
  from (select p_actor_id as actor_id) input
  left join private.cms_qa_actor_leases lease on lease.actor_id = input.actor_id
  where exists (select 1 from auth.users actor where actor.id = input.actor_id);
$$;

create function private.cms_claim_product_identifiers_0078(
  p_item_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item public.cms_content_items%rowtype;
  v_scope_key text;
  v_model jsonb;
  v_variant jsonb;
  v_identifier jsonb;
  v_normalized text;
  v_owner_type text;
  v_owner_id uuid;
begin
  select * into v_item from public.cms_content_items item where item.id = p_item_id;
  if not found then
    raise exception 'CMS_PIM_CANONICAL_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.content_type <> 'product' then return; end if;
  if p_payload ->> 'contentType' is distinct from 'product'
     or not private.cms_pim_canonical_identity_valid_0078(p_payload) then
    raise exception 'CMS_PIM_CANONICAL_IDENTITY_CONFLICT' using errcode = '23514';
  end if;

  v_scope_key := private.cms_product_registry_scope_key_0078(v_item.created_by);
  if v_scope_key is null then
    raise exception 'CMS_PIM_CANONICAL_SCOPE_INVALID' using errcode = '42501';
  end if;

  for v_model in
    select value from jsonb_array_elements(p_payload -> 'models')
  loop
    v_normalized := nullif(lower(btrim(v_model ->> 'sku')), '');
    if v_normalized is null then
      raise exception 'CMS_PIM_CANONICAL_SKU_REQUIRED' using errcode = '23514';
    end if;
    insert into public.cms_product_canonical_sku_registry (
      scope_key, normalized_sku, display_sku, item_id,
      first_owner_type, first_owner_id, claimed_by
    ) values (
      v_scope_key, v_normalized, btrim(v_model ->> 'sku'), v_item.id,
      'model', (v_model ->> 'id')::uuid, v_item.updated_by
    ) on conflict do nothing;
    if not exists (
      select 1 from public.cms_product_canonical_sku_registry registry
      where registry.scope_key = v_scope_key
        and registry.site_key = 'main'
        and registry.normalized_sku = v_normalized
        and registry.item_id = v_item.id
        and registry.first_owner_type = 'model'
        and registry.first_owner_id = (v_model ->> 'id')::uuid
    ) then
      raise exception 'CMS_PIM_CANONICAL_SKU_CONFLICT' using errcode = '23505';
    end if;

    for v_variant in
      select value from jsonb_array_elements(v_model -> 'variants')
    loop
      v_normalized := nullif(lower(btrim(v_variant ->> 'sku')), '');
      if v_normalized is not null then
        insert into public.cms_product_canonical_sku_registry (
          scope_key, normalized_sku, display_sku, item_id,
          first_owner_type, first_owner_id, claimed_by
        ) values (
          v_scope_key, v_normalized, btrim(v_variant ->> 'sku'), v_item.id,
          'variant', (v_variant ->> 'id')::uuid, v_item.updated_by
        ) on conflict do nothing;
        if not exists (
          select 1 from public.cms_product_canonical_sku_registry registry
          where registry.scope_key = v_scope_key
            and registry.site_key = 'main'
            and registry.normalized_sku = v_normalized
            and registry.item_id = v_item.id
            and registry.first_owner_type = 'variant'
            and registry.first_owner_id = (v_variant ->> 'id')::uuid
        ) then
          raise exception 'CMS_PIM_CANONICAL_SKU_CONFLICT' using errcode = '23505';
        end if;
      end if;
    end loop;
  end loop;

  for v_identifier in
    select value
    from jsonb_array_elements(
      case when jsonb_typeof(p_payload -> 'externalIdentifiers') = 'array'
        then p_payload -> 'externalIdentifiers' else '[]'::jsonb end
    )
  loop
    v_normalized := public.cms_normalize_master_name(v_identifier ->> 'value');
    v_owner_type := v_identifier #>> '{owner,type}';
    v_owner_id := case
      when v_owner_type = 'product' then null
      when v_identifier #>> '{owner,id}'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (v_identifier #>> '{owner,id}')::uuid
      else null
    end;
    if v_identifier ->> 'kind' not in ('erp', 'gtin', 'ncm', 'other')
       or nullif(v_normalized, '') is null
       or v_owner_type not in ('product', 'model', 'variant')
       or (v_owner_type <> 'product' and v_owner_id is null) then
      raise exception 'CMS_PIM_CANONICAL_IDENTIFIER_INVALID' using errcode = '23514';
    end if;
    insert into public.cms_product_canonical_identifier_registry (
      scope_key, identifier_kind, normalized_value, display_value, item_id,
      first_owner_type, first_owner_id, claimed_by
    ) values (
      v_scope_key, v_identifier ->> 'kind', v_normalized,
      btrim(v_identifier ->> 'value'), v_item.id,
      v_owner_type, v_owner_id, v_item.updated_by
    ) on conflict do nothing;
    if not exists (
      select 1 from public.cms_product_canonical_identifier_registry registry
      where registry.scope_key = v_scope_key
        and registry.site_key = 'main'
        and registry.identifier_kind = v_identifier ->> 'kind'
        and registry.normalized_value = v_normalized
        and registry.item_id = v_item.id
        and registry.first_owner_type = v_owner_type
        and registry.first_owner_id is not distinct from v_owner_id
    ) then
      raise exception 'CMS_PIM_CANONICAL_IDENTIFIER_CONFLICT' using errcode = '23505';
    end if;
  end loop;
end;
$$;

create function public.cms_claim_product_identifiers_trigger_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
begin
  perform private.cms_claim_product_identifiers_0078(new.item_id, new.payload);
  return new;
end;
$$;

-- Existing published projections are claimed before the trigger opens the
-- publication boundary. Draft typos never squat a corporate identifier, but
-- every revision that becomes public is claimed in that same transaction.
create trigger cms_claim_product_identifiers_0078
before insert or update of payload on public.cms_published_projection
for each row execute function public.cms_claim_product_identifiers_trigger_0078();

do $$
declare
  v_projection record;
begin
  for v_projection in
    select projection.item_id, projection.payload
    from public.cms_published_projection projection
    where projection.content_type = 'product'
    order by projection.item_id
  loop
    perform private.cms_claim_product_identifiers_0078(
      v_projection.item_id, v_projection.payload
    );
  end loop;
end;
$$;

revoke all on function private.cms_product_registry_scope_key_0078(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_product_registry_immutable_0078()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_cleanup_terminal_product_registry_0078()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_claim_product_identifiers_0078(uuid,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_claim_product_identifiers_trigger_0078()
  from public, anon, authenticated, service_role;

create function private.cms_pim_safe_timestamptz_equal_0078(
  p_value text,
  p_expected timestamptz
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_value is null then return p_expected is null; end if;
  begin
    return p_value::timestamptz is not distinct from p_expected;
  exception when others then
    return false;
  end;
end;
$$;

create function private.cms_pim_provenance_matches_0078(
  p_canonical jsonb,
  p_source_kind text,
  p_source_ref text,
  p_source_sha256 text,
  p_confidence numeric,
  p_rights_confirmed boolean,
  p_verified_at timestamptz
)
returns boolean
language sql
immutable
set search_path = pg_catalog, private, pg_temp
as $$
  select jsonb_typeof(p_canonical) = 'object'
    and p_canonical ->> 'sourceKind' = p_source_kind
    and p_source_ref in (
      p_canonical ->> 'sourcePath',
      p_canonical ->> 'sourceUrl',
      p_canonical ->> 'authorizationReference'
    )
    and coalesce(p_canonical ->> 'sourceSha256', '') = coalesce(p_source_sha256, '')
    and p_canonical -> 'rightsConfirmed' = to_jsonb(p_rights_confirmed)
    and coalesce(p_canonical -> 'confidence', to_jsonb(1::numeric)) = to_jsonb(p_confidence)
    and private.cms_pim_safe_timestamptz_equal_0078(
      p_canonical ->> 'verifiedAt', p_verified_at
    );
$$;

-- The canonical editor stores controlled-option UUIDs, whereas the EV2
-- attribute catalog and legacy PIM use master-entity UUIDs. Resolve that
-- boundary only through an exact, unambiguous label/slug match in the same
-- actor scope. A caller-supplied UUID is never treated as a master UUID.
--
-- The five product list rows are immutable namespace containers. Because
-- list_key is globally unique, a QA run cannot create a parallel container.
-- Only those five strictly-corporate containers may therefore be shared;
-- their options remain actor/run scoped and every master/set/definition stays
-- private to the exact run. No sixth list key receives this exception.
create function private.cms_product_shared_controlled_list_allowed_0078(
  p_actor_id uuid,
  p_list_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_controlled_lists list
    join private.cms_qa_actor_leases caller on caller.actor_id = p_actor_id
    where list.id = p_list_id
      and list.list_key in (
        'product.category',
        'product.application_magnitude',
        'product.technology',
        'product.installation_operation',
        'product.monitored_element'
      )
      and list.entity_type = 'product'
      and list.active
      and list.public_visible
      and caller.environment = p_environment
      and caller.status = 'active'
      and caller.expires_at > statement_timestamp()
      and private.cms_qa_actor_marker_is_exact(
        caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
      )
      and not exists (
        select 1 from private.cms_qa_actor_leases creator_history
        where creator_history.actor_id = list.created_by
      )
      and not exists (
        select 1 from private.cms_qa_actor_leases updater_history
        where updater_history.actor_id = list.updated_by
      )
  );
$$;

create function private.cms_product_controlled_option_scope_allowed_0078(
  p_actor_id uuid,
  p_option_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_controlled_options option
    join public.cms_controlled_lists list on list.id = option.list_id
    where option.id = p_option_id
      and option.active
      and list.active
      and (
        (
          exists (
            select 1 from private.cms_qa_actor_leases caller_history
            where caller_history.actor_id = p_actor_id
          )
          and private.cms_product_shared_controlled_list_allowed_0078(
            p_actor_id, list.id, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.created_by, option.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.updated_by, option.updated_at, p_environment
          )
        )
        or (
          not exists (
            select 1 from private.cms_qa_actor_leases caller_history
            where caller_history.actor_id = p_actor_id
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, list.created_by, list.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, list.updated_by, list.updated_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.created_by, option.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.updated_by, option.updated_at, p_environment
          )
        )
      )
  );
$$;

create function private.cms_resolve_controlled_master_entity_0078(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_list_key text,
  p_option_id uuid,
  p_master_type text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_resolved_id uuid;
  v_match_count integer;
begin
  if p_actor_id is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_option_id is null
     or (p_list_key, p_master_type) not in (
       ('product.category', 'category'),
       ('product.application_magnitude', 'magnitude'),
       ('product.technology', 'technology'),
       ('product.installation_operation', 'installation'),
       ('product.monitored_element', 'monitored_element')
     ) then
    return null;
  end if;

  select min(entity.id::text)::uuid, count(distinct entity.id)
  into v_resolved_id, v_match_count
  from public.cms_controlled_options option
  join public.cms_controlled_lists list on list.id = option.list_id
  join public.cms_master_entities entity
    on entity.site_key = p_site_key
   and entity.entity_type = p_master_type
   and entity.status = 'active'
   and (
     entity.normalized_name = public.cms_normalize_master_name(option.label)
     or option.slug = regexp_replace(entity.normalized_name, '[^a-z0-9]+', '-', 'g')
   )
  where option.id = p_option_id
    and option.active
    and list.active
    and list.list_key = p_list_key
    and private.cms_content_actor_context_active(p_actor_id, p_environment)
    and private.cms_product_controlled_option_scope_allowed_0078(
      p_actor_id, option.id, p_environment
    )
    and private.cms_master_entity_scope_allowed(
      p_actor_id, entity.id, p_environment, p_site_key
    );

  return case when v_match_count = 1 then v_resolved_id else null end;
end;
$$;

create function public.cms_product_attributes_catalog_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_category_option_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_master_category_id uuid;
  v_catalog jsonb;
  v_controlled_category jsonb;
  v_master_category jsonb;
begin
  v_master_category_id := private.cms_resolve_controlled_master_entity_0078(
    p_actor_id, p_environment, p_site_key,
    'product.category', p_category_option_id, 'category'
  );
  if v_master_category_id is null then
    raise exception 'CMS_PRODUCT_ATTRIBUTE_CATEGORY_UNRESOLVED' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'id', option.id,
    'slug', option.slug,
    'label', option.label,
    'listKey', list.list_key
  ) into v_controlled_category
  from public.cms_controlled_options option
  join public.cms_controlled_lists list on list.id = option.list_id
  where option.id = p_category_option_id and list.list_key = 'product.category';

  select jsonb_build_object(
    'id', entity.id,
    'name', entity.canonical_name,
    'entityType', entity.entity_type
  ) into v_master_category
  from public.cms_master_entities entity
  where entity.id = v_master_category_id;

  v_catalog := public.cms_attributes_catalog_scoped(
    p_actor_id, p_environment, p_site_key, v_master_category_id
  );
  return coalesce(v_catalog, '{}'::jsonb) || jsonb_build_object(
    'controlled_category', v_controlled_category,
    'master_category', v_master_category
  );
end;
$$;

create function public.cms_pim_master_controlled_options_scoped(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_entity_ids uuid[]
)
returns table (
  master_entity_id uuid,
  master_type text,
  list_key text,
  option_id uuid,
  option_slug text,
  option_label text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with mapping_types(master_type, list_key) as (
    values
      ('category'::text, 'product.category'::text),
      ('magnitude', 'product.application_magnitude'),
      ('technology', 'product.technology'),
      ('installation', 'product.installation_operation'),
      ('monitored_element', 'product.monitored_element')
  ), candidates as (
    select
      entity.id as master_entity_id,
      entity.entity_type as master_type,
      mapping.list_key,
      option.id as option_id,
      option.slug as option_slug,
      option.label as option_label,
      count(*) over (partition by entity.id) as match_count
    from public.cms_master_entities entity
    join mapping_types mapping on mapping.master_type = entity.entity_type
    join public.cms_controlled_lists list on list.list_key = mapping.list_key
    join public.cms_controlled_options option on option.list_id = list.id
    where entity.id = any(coalesce(p_entity_ids, '{}'::uuid[]))
      and coalesce(cardinality(p_entity_ids), 0) between 1 and 50
      and p_site_key = 'main'
      and p_environment in ('local', 'staging', 'production')
      and entity.site_key = p_site_key
      and entity.status = 'active'
      and list.active
      and option.active
      and (
        entity.normalized_name = public.cms_normalize_master_name(option.label)
        or option.slug = regexp_replace(entity.normalized_name, '[^a-z0-9]+', '-', 'g')
      )
      and private.cms_content_actor_context_active(p_actor_id, p_environment)
      and private.cms_product_controlled_option_scope_allowed_0078(
        p_actor_id, option.id, p_environment
      )
      and private.cms_master_entity_scope_allowed(
        p_actor_id, entity.id, p_environment, p_site_key
      )
  )
  select master_entity_id, master_type, list_key, option_id, option_slug, option_label
  from candidates
  where match_count = 1
  order by master_type, master_entity_id;
$$;

-- Preserve the canonical normalizer's exact list-key contract while allowing
-- a QA product to reference only an option owned by its exact active run inside
-- one of the five immutable corporate namespace containers.
create or replace function private.cms_content_payload_controlled_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_reference record;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  if p_payload ->> 'contentType' not in ('product','service') then return true; end if;

  for v_reference in
    select expected.list_key, expected.reference
    from (
      values
        ('product.category'::text,p_payload #> '{controlledClassification,productCategory}'),
        ('product.application_magnitude',p_payload #> '{controlledClassification,applicationMagnitude}'),
        ('product.technology',p_payload #> '{controlledClassification,technology}'),
        ('product.installation_operation',p_payload #> '{controlledClassification,installationOperation}'),
        ('product.monitored_element',p_payload #> '{controlledClassification,monitoredElement}'),
        ('service.category',p_payload -> 'serviceKindRef')
    ) expected(list_key,reference)
    where (p_payload ->> 'contentType'='product' and expected.list_key like 'product.%')
       or (p_payload ->> 'contentType'='service' and expected.list_key='service.category')
  loop
    if jsonb_typeof(v_reference.reference) is distinct from 'object'
       or coalesce(v_reference.reference ->> 'id','')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1
         from public.cms_controlled_options option
         join public.cms_controlled_lists list on list.id=option.list_id
         where option.id=(v_reference.reference ->> 'id')::uuid
           and list.list_key=v_reference.list_key
           and option.active and list.active
           and (
             (
               p_payload ->> 'contentType' = 'product'
               and private.cms_product_controlled_option_scope_allowed_0078(
                 p_actor_id, option.id, p_environment
               )
             )
             or (
               p_payload ->> 'contentType' = 'service'
               and private.cms_content_actor_row_scope_allowed(
                 p_actor_id,list.created_by,list.created_at,p_environment
               )
               and private.cms_content_actor_row_scope_allowed(
                 p_actor_id,list.updated_by,list.updated_at,p_environment
               )
               and private.cms_content_actor_row_scope_allowed(
                 p_actor_id,option.created_by,option.created_at,p_environment
               )
               and private.cms_content_actor_row_scope_allowed(
                 p_actor_id,option.updated_by,option.updated_at,p_environment
               )
             )
           )
       ) then return false; end if;
  end loop;
  return true;
end;
$$;

-- The list row is shared metadata; option rows are always filtered by the
-- caller's immutable lease history. Corporate callers never see QA options and
-- one QA run cannot observe another run's option UUID, label or slug.
create or replace function public.cms_controlled_vocabularies_scoped(
  p_actor_id uuid,
  p_environment text,
  p_entity_type text,
  p_include_inactive boolean,
  p_limit integer default 500
)
returns table (
  id uuid,
  list_key text,
  entity_type text,
  dimension_key text,
  label text,
  description text,
  public_visible boolean,
  active boolean,
  sort_order integer,
  lock_version bigint,
  updated_at timestamptz,
  cms_controlled_options jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    list.id,
    list.list_key,
    list.entity_type,
    list.dimension_key,
    list.label,
    list.description,
    list.public_visible,
    list.active,
    list.sort_order,
    list.lock_version,
    list.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', option.id,
            'slug', option.slug,
            'label', option.label,
            'description', option.description,
            'public_visible', option.public_visible,
            'active', option.active,
            'sort_order', option.sort_order,
            'lock_version', option.lock_version,
            'updated_at', option.updated_at
          ) order by option.sort_order, option.label, option.id
        )
        from public.cms_controlled_options option
        where option.list_id = list.id
          and (p_include_inactive or option.active)
          and (
            list.list_key not in (
              'product.category',
              'product.application_magnitude',
              'product.technology',
              'product.installation_operation',
              'product.monitored_element'
            )
            or private.cms_product_controlled_option_scope_allowed_0078(
              p_actor_id, option.id, p_environment
            )
          )
      ),
      '[]'::jsonb
    )
  from public.cms_controlled_lists list
  where p_environment in ('local', 'staging', 'production')
    and p_limit between 1 and 500
    and (p_entity_type is null or list.entity_type = p_entity_type)
    and (p_include_inactive or list.active)
    and private.cms_content_actor_context_active(p_actor_id, p_environment)
    and (
      private.cms_controlled_list_scope_allowed(p_actor_id, list.id, p_environment)
      or (
        list.list_key in (
          'product.category',
          'product.application_magnitude',
          'product.technology',
          'product.installation_operation',
          'product.monitored_element'
        )
        and list.entity_type = 'product'
        and list.active
        and list.public_visible
        and not exists (
          select 1 from private.cms_qa_actor_leases creator_history
          where creator_history.actor_id = list.created_by
        )
        and not exists (
          select 1 from private.cms_qa_actor_leases updater_history
          where updater_history.actor_id = list.updated_by
        )
      )
    )
  order by list.sort_order, list.label, list.id
  limit p_limit;
$$;

-- Preserve the existing mutation boundary for every normal case. The only
-- additional write is a QA-owned option inside a fixed corporate product
-- namespace container; the list row itself can never be changed by QA.
alter function public.cms_manage_controlled_vocabulary_scoped(
  uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid
) rename to cms_manage_controlled_vocabulary_scoped_pre_0078;

revoke all on function public.cms_manage_controlled_vocabulary_scoped_pre_0078(
  uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;

create function public.cms_manage_controlled_vocabulary_scoped(
  p_actor_id uuid,
  p_environment text,
  p_action text,
  p_list jsonb,
  p_option jsonb,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_list public.cms_controlled_lists%rowtype;
  v_option public.cms_controlled_options%rowtype;
  v_option_id uuid;
  v_expected_lock_version bigint;
  v_run_tag text;
  v_slug_prefix text;
  v_previous_compensating text;
  v_previous_mutation_actor text;
begin
  -- Lease lock always precedes the shared list/option lock.
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);

  if p_action = 'upsert_option'
     and jsonb_typeof(p_option) = 'object'
     and p_option ->> 'listId'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into v_list
    from public.cms_controlled_lists list
    where list.id = (p_option ->> 'listId')::uuid
    for update;

    if found and private.cms_product_shared_controlled_list_allowed_0078(
      p_actor_id, v_list.id, p_environment
    ) then
      if not public.cms_actor_authorized(
        p_actor_id, 'cms:vocabularies.manage', p_aal, p_session_id, p_issued_at
      ) then
        raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
      end if;

      select lease.run_tag into v_run_tag
      from private.cms_qa_actor_leases lease
      where lease.actor_id = p_actor_id
        and lease.environment = p_environment
        and lease.status = 'active'
        and lease.expires_at > statement_timestamp();
      v_slug_prefix := regexp_replace(lower(v_run_tag), '[^a-z0-9]+', '-', 'g');
      if nullif(btrim(p_option ->> 'label'), '') is null
         or strpos(p_option ->> 'label', v_run_tag) = 0
         or coalesce(p_option ->> 'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
         or p_option ->> 'slug' not like (v_slug_prefix || '%') then
        raise exception 'CMS_PRODUCT_QA_OPTION_MARKER_INVALID' using errcode = '23514';
      end if;

      if nullif(p_option ->> 'id', '') is not null then
        if p_option ->> 'id'
             !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'CMS_CONTROLLED_OPTION_INVALID' using errcode = '22023';
        end if;
        v_option_id := (p_option ->> 'id')::uuid;
        select * into v_option
        from public.cms_controlled_options option
        where option.id = v_option_id
        for update;
      end if;

      v_previous_compensating := current_setting('cms.qa_compensating', true);
      v_previous_mutation_actor := current_setting('cms.qa_mutation_actor_id', true);
      perform set_config('cms.qa_compensating', 'on', true);
      perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
      begin
        if v_option.id is null then
          insert into public.cms_controlled_options (
            id, list_id, slug, label, description, public_visible, active,
            sort_order, created_by, updated_by
          ) values (
            coalesce(v_option_id, gen_random_uuid()),
            v_list.id,
            p_option ->> 'slug',
            p_option ->> 'label',
            coalesce(p_option ->> 'description', ''),
            coalesce((p_option ->> 'publicVisible')::boolean, false),
            coalesce((p_option ->> 'active')::boolean, true),
            coalesce((p_option ->> 'sortOrder')::integer, 0),
            p_actor_id,
            p_actor_id
          ) returning * into v_option;
        else
          if v_option.list_id <> v_list.id
             or not private.cms_product_controlled_option_scope_allowed_0078(
               p_actor_id, v_option.id, p_environment
             ) then
            raise exception 'CMS_CONTROLLED_SCOPE_FORBIDDEN' using errcode = '42501';
          end if;
          v_expected_lock_version := nullif(p_option ->> 'lockVersion', '')::bigint;
          if v_expected_lock_version is null
             or v_option.lock_version <> v_expected_lock_version then
            raise exception 'CMS_CONTROLLED_VERSION_CONFLICT' using errcode = '40001';
          end if;
          update public.cms_controlled_options option
          set slug = p_option ->> 'slug',
              label = p_option ->> 'label',
              description = coalesce(p_option ->> 'description', ''),
              public_visible = coalesce((p_option ->> 'publicVisible')::boolean, false),
              active = coalesce((p_option ->> 'active')::boolean, true),
              sort_order = coalesce((p_option ->> 'sortOrder')::integer, 0),
              updated_by = p_actor_id,
              updated_at = clock_timestamp(),
              lock_version = option.lock_version + 1
          where option.id = v_option.id
            and option.lock_version = v_expected_lock_version
          returning * into v_option;
          if not found then
            raise exception 'CMS_CONTROLLED_VERSION_CONFLICT' using errcode = '40001';
          end if;
        end if;
      exception when others then
        perform set_config(
          'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
        );
        perform set_config(
          'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
        );
        raise;
      end;
      perform set_config(
        'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
      );
      perform set_config(
        'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
      );

      insert into public.cms_audit_log (
        actor_id, action, target_type, target_id, event_data, correlation_id
      ) values (
        p_actor_id,
        'cms:qa.product_controlled_option.upserted',
        'controlled_option',
        v_option.id::text,
        jsonb_build_object(
          'schemaVersion', 1,
          'syntheticOnly', true,
          'listKey', v_list.list_key,
          'optionSha256', encode(
            extensions.digest(
              convert_to(v_option.slug || ':' || v_option.label, 'UTF8'), 'sha256'
            ),
            'hex'
          ),
          'lockVersion', v_option.lock_version,
          'environment', p_environment
        ),
        p_correlation_id
      );

      return jsonb_build_object(
        'status', 'ok',
        'listId', v_list.id,
        'optionId', v_option.id,
        'usageCount', public.cms_controlled_option_usage_count(v_option.id),
        'lockVersion', v_option.lock_version
      );
    end if;
  end if;

  return public.cms_manage_controlled_vocabulary_scoped_pre_0078(
    p_actor_id, p_environment, p_action, p_list, p_option,
    p_aal, p_session_id, p_issued_at, p_correlation_id
  );
exception
  when unique_violation then
    raise exception 'CMS_CONTROLLED_NATURAL_KEY_CONFLICT' using errcode = '23505';
end;
$$;

revoke all on function public.cms_manage_controlled_vocabulary_scoped(
  uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function public.cms_manage_controlled_vocabulary_scoped(
  uuid,text,text,jsonb,jsonb,text,text,timestamptz,uuid
) to service_role;

create function private.cms_cleanup_terminal_product_shared_options_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_option_ids uuid[];
  v_removed integer := 0;
  v_claims_sha text;
  v_previous_compensating text;
  v_previous_mutation_actor text;
begin
  if old.status <> 'active'
     or new.status not in ('cleaned', 'expired')
     or new.status = old.status then
    return new;
  end if;

  select coalesce(array_agg(option.id order by option.id), '{}'::uuid[])
  into v_option_ids
  from public.cms_controlled_options option
  join public.cms_controlled_lists list on list.id = option.list_id
  where option.created_by = old.actor_id
    and option.updated_by = old.actor_id
    and list.list_key in (
      'product.category',
      'product.application_magnitude',
      'product.technology',
      'product.installation_operation',
      'product.monitored_element'
    )
    and list.entity_type = 'product'
    and not exists (
      select 1 from private.cms_qa_actor_leases creator_history
      where creator_history.actor_id = list.created_by
    )
    and not exists (
      select 1 from private.cms_qa_actor_leases updater_history
      where updater_history.actor_id = list.updated_by
    );

  if cardinality(v_option_ids) = 0 then return new; end if;

  perform 1
  from public.cms_controlled_options option
  where option.id = any(v_option_ids)
  order by option.id
  for update;

  -- The general 0064 compensator runs first and must have made every
  -- referencing QA product non-actionable. Immutable revisions may retain the
  -- historical UUID, but no draft/revision from another scope and no live
  -- projection may reference an option that is about to be removed.
  if exists (
       select 1
       from public.cms_published_projection projection
       where exists (
         select 1 from unnest(v_option_ids) option_id
         where projection.payload::text like ('%' || option_id::text || '%')
       )
     )
     or exists (
       select 1
       from (
         select draft.item_id, draft.payload from public.cms_content_drafts draft
         union all
         select revision.item_id, revision.payload from public.cms_content_revisions revision
       ) reference
       join public.cms_content_items item on item.id = reference.item_id
       where exists (
         select 1 from unnest(v_option_ids) option_id
         where reference.payload::text like ('%' || option_id::text || '%')
       )
         and (
           item.workflow_status <> 'archived'
           or not private.cms_content_item_graph_scope_allowed(
             old.actor_id, item.id, old.environment
           )
         )
     ) then
    raise exception 'CMS_QA_PRODUCT_OPTION_REFERENCE_ACTIVE' using errcode = '40001';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(string_agg(option.id::text, ':' order by option.id), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_claims_sha
  from public.cms_controlled_options option
  where option.id = any(v_option_ids);

  v_previous_compensating := current_setting('cms.qa_compensating', true);
  v_previous_mutation_actor := current_setting('cms.qa_mutation_actor_id', true);
  perform set_config('cms.qa_compensating', 'on', true);
  perform set_config('cms.qa_mutation_actor_id', old.actor_id::text, true);
  begin
    delete from public.cms_controlled_options option
    where option.id = any(v_option_ids)
      and option.created_by = old.actor_id
      and option.updated_by = old.actor_id;
    get diagnostics v_removed = row_count;
  exception when others then
    perform set_config(
      'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
    );
    perform set_config(
      'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
    );
    raise;
  end;
  perform set_config(
    'cms.qa_compensating', coalesce(nullif(v_previous_compensating, ''), 'off'), true
  );
  perform set_config(
    'cms.qa_mutation_actor_id', coalesce(v_previous_mutation_actor, ''), true
  );

  if v_removed <> cardinality(v_option_ids)
     or exists (
       select 1 from public.cms_controlled_options option
       where option.id = any(v_option_ids)
     ) then
    raise exception 'CMS_QA_PRODUCT_OPTION_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    old.actor_id,
    'cms:qa.product_controlled_options.compensated',
    'qa_fixture',
    old.run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'optionsRemoved', v_removed,
      'claimsSha256', v_claims_sha,
      'environment', old.environment,
      'candidateSha', old.candidate_sha,
      'terminalStatus', new.status
    ),
    gen_random_uuid()
  );
  return new;
end;
$$;

-- Alphabetically after the general 0064 compensation and before the 0071
-- vocabulary cleanup, so content is already archived and the older cleanup
-- never mistakes a QA option in a corporate container for cross-scope residue.
create trigger cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_product_shared_options_0078();

create function private.cms_pim_canonical_attributes_valid_0078(
  p_item_id uuid,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item public.cms_content_items%rowtype;
  v_definition record;
  v_unit public.cms_pim_units%rowtype;
  v_canonical_unit public.cms_pim_units%rowtype;
  v_specification jsonb;
  v_definition_id uuid;
  v_environment text;
  v_category_option_id uuid;
  v_category_id uuid;
begin
  select * into v_item from public.cms_content_items item where item.id = p_item_id;
  if not found or v_item.content_type <> 'product'
     or jsonb_typeof(p_payload -> 'specifications') <> 'array' then
    return false;
  end if;
  if p_payload #>> '{controlledClassification,productCategory,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_category_option_id := (p_payload #>> '{controlledClassification,productCategory,id}')::uuid;
  end if;
  v_environment := private.cms_content_actor_environment(v_item.created_by);
  v_category_id := private.cms_resolve_controlled_master_entity_0078(
    v_item.created_by, v_environment, 'main',
    'product.category', v_category_option_id, 'category'
  );

  if exists (
       select 1 from jsonb_array_elements(p_payload -> 'specifications') specification
       where specification ->> 'id'
               !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     )
     or (
       select count(*) from jsonb_array_elements(p_payload -> 'specifications')
     ) <> (
       select count(distinct lower(specification ->> 'id'))
       from jsonb_array_elements(p_payload -> 'specifications') specification
     )
     or (
       select count(*) from jsonb_array_elements(p_payload -> 'specifications')
     ) <> (
       select count(distinct (
         lower(specification ->> 'definitionId'),
         coalesce(specification ->> 'scope', 'product'),
         coalesce(lower(specification ->> 'ownerId'), '')
       ))
       from jsonb_array_elements(p_payload -> 'specifications') specification
     ) then
    return false;
  end if;

  for v_specification in
    select value from jsonb_array_elements(p_payload -> 'specifications')
  loop
    if v_specification -> 'homologated' is distinct from 'true'::jsonb then
      return false;
    end if;
    if coalesce(v_specification ->> 'sourceType', 'manual') in ('import', 'legacy')
       and nullif(btrim(v_specification ->> 'sourceRef'), '') is null then
      return false;
    end if;
    if not (v_specification ? 'definitionId') then return false; end if;
    if v_category_id is null
       or v_specification ->> 'definitionId'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    v_definition_id := (v_specification ->> 'definitionId')::uuid;
    select definition.*, member.required as member_required into v_definition
    from (
      select attribute_set.*
      from public.cms_pim_attribute_sets attribute_set
      where attribute_set.site_key = 'main'
        and attribute_set.status = 'active'
        and attribute_set.category_id = v_category_id
        and private.cms_pim_attribute_set_scope_allowed(
          v_item.created_by, attribute_set.id, v_environment, 'main'
        )
      order by attribute_set.id
      limit 1
    ) attribute_set
    join lateral (
      select version.*
      from public.cms_pim_attribute_set_versions version
      where version.attribute_set_id = attribute_set.id
        and version.status = 'active'
        and private.cms_content_actor_row_scope_allowed(
          v_item.created_by, version.created_by, version.created_at, v_environment
        )
      order by version.version desc, version.id
      limit 1
    ) version on true
    join public.cms_pim_attribute_set_definitions member
      on member.attribute_set_version_id = version.id
     and member.definition_id = v_definition_id
    join public.cms_pim_attribute_definitions definition
      on definition.id = member.definition_id
     and definition.status = 'active'
    where private.cms_pim_attribute_definition_scope_allowed(
        v_item.created_by, definition.id, v_environment, 'main'
      )
      and private.cms_content_actor_row_scope_allowed(
        v_item.created_by, definition.created_by, definition.created_at, v_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        v_item.created_by, definition.updated_by, definition.updated_at, v_environment
      );
    if not found
       or v_specification ->> 'key' is distinct from v_definition.attribute_key
       or v_specification ->> 'label' is distinct from v_definition.label
       or v_specification ->> 'type' is distinct from (
         case when v_definition.data_type = 'decimal'
           then 'number' else v_definition.data_type
         end
       )
       or v_specification -> 'filterable' is distinct from to_jsonb(v_definition.filterable)
       or v_specification -> 'comparable' is distinct from to_jsonb(v_definition.comparable)
       or v_specification -> 'searchable' is distinct from to_jsonb(v_definition.searchable)
       or v_specification -> 'required' is distinct from to_jsonb(v_definition.member_required)
       or coalesce(v_specification ->> 'scope', 'product')
            not in ('product', 'model', 'variant')
       or (
         coalesce(v_specification ->> 'scope', 'product') = 'product'
         and v_specification ? 'ownerId'
       )
       or (
         coalesce(v_specification ->> 'scope', 'product') = 'model'
         and not exists (
           select 1 from jsonb_array_elements(p_payload -> 'models') model
           where lower(model ->> 'id') = lower(v_specification ->> 'ownerId')
         )
       )
       or (
         coalesce(v_specification ->> 'scope', 'product') = 'variant'
         and not exists (
           select 1
           from jsonb_array_elements(p_payload -> 'models') model
           cross join lateral jsonb_array_elements(model -> 'variants') variant
           where lower(variant ->> 'id') = lower(v_specification ->> 'ownerId')
         )
       ) then
      return false;
    end if;

    begin
      perform *
      from public.cms_pim_validate_attribute_value(
        v_definition.id,
        v_specification -> 'value',
        nullif(btrim(v_specification ->> 'unit'), '')
      );
    exception when others then
      return false;
    end;

    if v_definition.canonical_unit_code is null then
      if nullif(btrim(v_specification ->> 'unit'), '') is not null then return false; end if;
    else
      select * into v_canonical_unit
      from public.cms_pim_units unit
      where unit.code = v_definition.canonical_unit_code and unit.active;
      select * into v_unit
      from public.cms_pim_units unit
      where unit.code = v_specification ->> 'unit' and unit.active;
      if v_canonical_unit.code is null
         or v_unit.code is null
         or v_unit.dimension_key <> v_canonical_unit.dimension_key
         or not private.cms_content_actor_row_scope_allowed(
           v_item.created_by, v_unit.created_by, v_unit.created_at, v_environment
         )
         or not private.cms_content_actor_row_scope_allowed(
           v_item.created_by, v_unit.updated_by, v_unit.updated_at, v_environment
         ) then
        return false;
      end if;
    end if;
  end loop;

  if v_category_id is null then return false; end if;
  if exists (
    select 1
    from (
      select scoped_set.*
      from public.cms_pim_attribute_sets scoped_set
      where scoped_set.site_key = 'main'
        and scoped_set.status = 'active'
        and scoped_set.category_id = v_category_id
        and private.cms_pim_attribute_set_scope_allowed(
          v_item.created_by, scoped_set.id, v_environment, 'main'
        )
      order by scoped_set.id
      limit 1
    ) attribute_set
    join lateral (
      select scoped_version.*
      from public.cms_pim_attribute_set_versions scoped_version
      where scoped_version.attribute_set_id = attribute_set.id
        and scoped_version.status = 'active'
        and private.cms_content_actor_row_scope_allowed(
          v_item.created_by,
          scoped_version.created_by,
          scoped_version.created_at,
          v_environment
        )
      order by scoped_version.version desc, scoped_version.id
      limit 1
    ) version on true
    join public.cms_pim_attribute_set_definitions member
      on member.attribute_set_version_id = version.id and member.required
    where not exists (
        select 1 from jsonb_array_elements(p_payload -> 'specifications') specification
        where lower(specification ->> 'definitionId') = member.definition_id::text
          and specification -> 'homologated' = 'true'::jsonb
      )
  ) then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;

create function private.cms_pim_content_equivalence_0078(
  p_product_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_product public.cms_pim_products%rowtype;
  v_item public.cms_content_items%rowtype;
  v_payload jsonb;
  v_legacy_snapshot jsonb;
  v_legacy_sha text;
  v_canonical_sha text;
  v_reasons text[] := '{}'::text[];
  v_environment text;
  v_category_master_id uuid;
  v_magnitude_master_id uuid;
  v_technology_master_id uuid;
  v_installation_master_id uuid;
  v_monitored_element_master_id uuid;
begin
  select * into v_product from public.cms_pim_products where id = p_product_id;
  if not found then
    raise exception 'CMS_PIM_RECONCILIATION_PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_item from public.cms_content_items where id = p_item_id;
  select draft.payload into v_payload
  from public.cms_content_drafts draft
  where draft.item_id = p_item_id;

  v_environment := private.cms_content_actor_environment(v_product.created_by);
  if v_payload #>> '{controlledClassification,productCategory,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_category_master_id := private.cms_resolve_controlled_master_entity_0078(
      v_product.created_by, v_environment, v_product.site_key,
      'product.category',
      (v_payload #>> '{controlledClassification,productCategory,id}')::uuid,
      'category'
    );
  end if;
  if v_payload #>> '{controlledClassification,applicationMagnitude,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_magnitude_master_id := private.cms_resolve_controlled_master_entity_0078(
      v_product.created_by, v_environment, v_product.site_key,
      'product.application_magnitude',
      (v_payload #>> '{controlledClassification,applicationMagnitude,id}')::uuid,
      'magnitude'
    );
  end if;
  if v_payload #>> '{controlledClassification,technology,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_technology_master_id := private.cms_resolve_controlled_master_entity_0078(
      v_product.created_by, v_environment, v_product.site_key,
      'product.technology',
      (v_payload #>> '{controlledClassification,technology,id}')::uuid,
      'technology'
    );
  end if;
  if v_payload #>> '{controlledClassification,installationOperation,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_installation_master_id := private.cms_resolve_controlled_master_entity_0078(
      v_product.created_by, v_environment, v_product.site_key,
      'product.installation_operation',
      (v_payload #>> '{controlledClassification,installationOperation,id}')::uuid,
      'installation'
    );
  end if;
  if v_payload #>> '{controlledClassification,monitoredElement,id}'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_monitored_element_master_id := private.cms_resolve_controlled_master_entity_0078(
      v_product.created_by, v_environment, v_product.site_key,
      'product.monitored_element',
      (v_payload #>> '{controlledClassification,monitoredElement,id}')::uuid,
      'monitored_element'
    );
  end if;

  v_legacy_snapshot := jsonb_build_object(
    'product', jsonb_build_object(
      'id', v_product.id,
      'contentItemId', v_product.content_item_id,
      'name', v_product.name,
      'slug', v_product.slug,
      'summary', v_product.summary,
      'valueProposition', v_product.value_proposition,
      'manufacturerId', v_product.manufacturer_id,
      'brandId', v_product.brand_id,
      'lineId', v_product.line_id,
      'categoryId', v_product.category_id,
      'status', v_product.status,
      'sourceType', v_product.source_type,
      'sourceRef', v_product.source_ref
    ),
    'masterLinks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'dimension', link.dimension,
          'entityId', link.entity_id,
          'status', link.status
        ) order by link.dimension, link.entity_id
      )
      from public.cms_pim_product_master_links link
      where link.product_id = v_product.id
    ), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', model.id,
          'name', model.name,
          'mpn', model.mpn,
          'status', model.status,
          'position', model.position
        ) order by model.position, model.id
      )
      from public.cms_pim_models model
      where model.product_id = v_product.id
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', variant.id,
          'modelId', variant.model_id,
          'name', variant.name,
          'code', variant.code,
          'status', variant.status,
          'position', variant.position,
          'axes', variant.axes
        ) order by variant.model_id, variant.position, variant.id
      )
      from public.cms_pim_variants variant
      where variant.product_id = v_product.id
    ), '[]'::jsonb),
    'skus', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sku.id,
          'modelId', sku.model_id,
          'variantId', sku.variant_id,
          'sku', sku.sku,
          'status', sku.status
        ) order by sku.model_id, sku.variant_id nulls first, sku.id
      )
      from public.cms_pim_skus sku
      where sku.product_id = v_product.id
    ), '[]'::jsonb),
    'attributes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', attribute_value.id,
          'definitionId', attribute_value.definition_id,
          'scope', attribute_value.owner_scope,
          'ownerId', attribute_value.owner_id,
          'value', attribute_value.value,
          'unit', attribute_value.unit_code,
          'active', attribute_value.active,
          'homologated', attribute_value.homologated
        ) order by attribute_value.id
      )
      from public.cms_pim_attribute_values attribute_value
      where attribute_value.product_id = v_product.id
    ), '[]'::jsonb),
    'externalIdentifiers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', identifier.id,
          'ownerType', identifier.owner_type,
          'ownerId', identifier.owner_id,
          'kind', identifier.identifier_kind,
          'value', identifier.identifier_value,
          'issuer', identifier.issuer,
          'sourceType', identifier.source_type,
          'sourceRef', identifier.source_ref
        ) order by identifier.id
      )
      from public.cms_pim_external_identifiers identifier
      where identifier.product_id = v_product.id
    ), '[]'::jsonb),
    'provenance', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', provenance.id,
          'sourceKind', provenance.source_kind,
          'sourceRef', provenance.source_ref,
          'sourceSha256', provenance.source_sha256,
          'rightsConfirmed', provenance.rights_confirmed,
          'active', provenance.active
        ) order by provenance.id
      )
      from public.cms_pim_provenance provenance
      where provenance.product_id = v_product.id
    ), '[]'::jsonb)
  );
  v_legacy_sha := encode(
    extensions.digest(convert_to(v_legacy_snapshot::text, 'UTF8'), 'sha256'), 'hex'
  );
  if v_payload is not null then
    v_canonical_sha := encode(
      extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
    );
  end if;

  if v_item.id is null or v_item.content_type <> 'product' then
    v_reasons := array_append(v_reasons, 'canonical_product_missing');
  end if;
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    v_reasons := array_append(v_reasons, 'canonical_draft_missing');
  end if;
  if v_item.slug is distinct from v_product.slug
     or v_payload ->> 'contentType' is distinct from 'product'
     or v_payload ->> 'consumerId' is distinct from 'cms.catalog-product.v1' then
    v_reasons := array_append(v_reasons, 'canonical_identity_mismatch');
  end if;
  if v_payload ->> 'title' is distinct from v_product.name
     or coalesce(v_payload ->> 'summary', '') is distinct from v_product.summary
     or coalesce(v_payload #>> '{commercial,valueProposition}', '')
          is distinct from v_product.value_proposition then
    v_reasons := array_append(v_reasons, 'commercial_fields_mismatch');
  end if;
  if v_product.brand_id is null
     or v_product.line_id is null
     or v_category_master_id is distinct from v_product.category_id
     or v_payload #>> '{manufacturer,name}' is distinct from (
       select entity.canonical_name from public.cms_master_entities entity
       where entity.id = v_product.manufacturer_id
     )
     or v_payload #>> '{brand,name}' is distinct from (
       select entity.canonical_name from public.cms_master_entities entity
       where entity.id = v_product.brand_id
     )
     or v_payload #>> '{productLine,name}' is distinct from (
       select entity.canonical_name from public.cms_master_entities entity
       where entity.id = v_product.line_id
     ) then
    v_reasons := array_append(v_reasons, 'master_identity_mismatch');
  end if;

  if exists (
       select 1
       from (
         values
           ('magnitude'::text, v_magnitude_master_id),
           ('technology', v_technology_master_id),
           ('installation', v_installation_master_id),
           ('monitored_element', v_monitored_element_master_id)
       ) expected(dimension, entity_id)
       where expected.entity_id is null
          or (
            select count(*)
            from public.cms_pim_product_master_links link
            where link.product_id = v_product.id
              and link.dimension = expected.dimension
              and link.status = 'active'
              and link.entity_id = expected.entity_id
          ) <> 1
          or (
            select count(*)
            from public.cms_pim_product_master_links link
            where link.product_id = v_product.id
              and link.dimension = expected.dimension
              and link.status = 'active'
          ) <> 1
     ) then
    v_reasons := array_append(v_reasons, 'controlled_classification_mismatch');
  end if;

  if not private.cms_pim_canonical_identity_valid_0078(v_payload) then
    v_reasons := array_append(v_reasons, 'canonical_identity_collision');
  end if;
  if not private.cms_pim_canonical_attributes_valid_0078(p_item_id, v_payload) then
    v_reasons := array_append(v_reasons, 'canonical_attribute_governance_mismatch');
  end if;

  if jsonb_typeof(v_payload -> 'models') is distinct from 'array'
     or jsonb_array_length(coalesce(v_payload -> 'models', '[]'::jsonb)) = 0
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'models') = 'array'
           then v_payload -> 'models' else '[]'::jsonb end
       ) with ordinality canonical_model(value, ordinality)
       where canonical_model.value ->> 'status' <> 'active'
          or not exists (
            select 1
            from public.cms_pim_models model
            where model.product_id = v_product.id
              and model.status = 'active'
              and model.id::text = lower(canonical_model.value ->> 'id')
              and model.name = canonical_model.value ->> 'model'
              and model.mpn = canonical_model.value ->> 'manufacturerReference'
              and model.position = canonical_model.ordinality - 1
              and model.is_primary = (canonical_model.ordinality = 1)
          )
     )
     or exists (
       select 1 from public.cms_pim_models model
       where model.product_id = v_product.id and model.status = 'active'
         and not exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(v_payload -> 'models') = 'array'
               then v_payload -> 'models' else '[]'::jsonb end
           ) with ordinality canonical_model(value, ordinality)
           where lower(canonical_model.value ->> 'id') = model.id::text
             and canonical_model.value ->> 'status' = 'active'
             and model.position = canonical_model.ordinality - 1
             and model.is_primary = (canonical_model.ordinality = 1)
         )
     ) then
    v_reasons := array_append(v_reasons, 'model_graph_mismatch');
  end if;

  if exists (
       select 1
       from public.cms_pim_variants variant
       join public.cms_pim_models model on model.id = variant.model_id
       where variant.product_id = v_product.id
         and variant.status = 'active'
         and model.status = 'active'
         and not exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(v_payload -> 'models') = 'array'
               then v_payload -> 'models' else '[]'::jsonb end
           ) canonical_model
           cross join lateral jsonb_array_elements(
             case when jsonb_typeof(canonical_model -> 'variants') = 'array'
               then canonical_model -> 'variants' else '[]'::jsonb end
           ) canonical_variant
           where lower(canonical_model ->> 'id') = model.id::text
             and lower(canonical_variant ->> 'id') = variant.id::text
             and canonical_variant ->> 'name' = variant.name
             and canonical_variant ->> 'code' = coalesce(
               variant.code,
               (
                 select string_agg(axis.value ->> 'optionKey', '-' order by axis.ordinality)
                 from jsonb_array_elements(variant.axes) with ordinality axis(value, ordinality)
               )
             )
             and canonical_variant ->> 'order' = variant.position::text
         )
     )
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'models') = 'array'
           then v_payload -> 'models' else '[]'::jsonb end
       ) canonical_model
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(canonical_model -> 'variants') = 'array'
           then canonical_model -> 'variants' else '[]'::jsonb end
       ) canonical_variant
       where not exists (
         select 1
         from public.cms_pim_variants variant
         where variant.product_id = v_product.id
           and variant.model_id::text = lower(canonical_model ->> 'id')
           and variant.id::text = lower(canonical_variant ->> 'id')
           and variant.status = 'active'
       )
     ) then
    v_reasons := array_append(v_reasons, 'variant_graph_mismatch');
  end if;

  if (
       select count(*)
       from (
         select
           lower(model ->> 'id') as model_id,
           null::text as variant_id,
           nullif(btrim(model ->> 'sku'), '') as sku
         from jsonb_array_elements(
           case when jsonb_typeof(v_payload -> 'models') = 'array'
             then v_payload -> 'models' else '[]'::jsonb end
         ) model
         union all
         select
           lower(model ->> 'id'),
           lower(variant ->> 'id'),
           nullif(btrim(variant ->> 'sku'), '')
         from jsonb_array_elements(
           case when jsonb_typeof(v_payload -> 'models') = 'array'
             then v_payload -> 'models' else '[]'::jsonb end
         ) model
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(model -> 'variants') = 'array'
             then model -> 'variants' else '[]'::jsonb end
         ) variant
       ) canonical_sku
       where canonical_sku.sku is not null
     ) <> (
       select count(*) from public.cms_pim_skus sku
       where sku.product_id = v_product.id and sku.status = 'active'
     )
     or exists (
       select 1 from public.cms_pim_skus sku
       where sku.product_id = v_product.id and sku.status = 'active'
         and not exists (
           select 1
           from (
             select
               lower(model ->> 'id') as model_id,
               null::text as variant_id,
               nullif(btrim(model ->> 'sku'), '') as sku
             from jsonb_array_elements(
               case when jsonb_typeof(v_payload -> 'models') = 'array'
                 then v_payload -> 'models' else '[]'::jsonb end
             ) model
             union all
             select
               lower(model ->> 'id'),
               lower(variant ->> 'id'),
               nullif(btrim(variant ->> 'sku'), '')
             from jsonb_array_elements(
               case when jsonb_typeof(v_payload -> 'models') = 'array'
                 then v_payload -> 'models' else '[]'::jsonb end
             ) model
             cross join lateral jsonb_array_elements(
               case when jsonb_typeof(model -> 'variants') = 'array'
                 then model -> 'variants' else '[]'::jsonb end
             ) variant
           ) canonical_sku
           where canonical_sku.sku = sku.sku
             and canonical_sku.model_id = sku.model_id::text
             and (
               (canonical_sku.variant_id is null and sku.variant_id is null)
               or canonical_sku.variant_id = sku.variant_id::text
             )
         )
     )
     or exists (
       select 1
       from (
         select
           lower(model ->> 'id') as model_id,
           null::text as variant_id,
           nullif(btrim(model ->> 'sku'), '') as sku
         from jsonb_array_elements(
           case when jsonb_typeof(v_payload -> 'models') = 'array'
             then v_payload -> 'models' else '[]'::jsonb end
         ) model
         union all
         select
           lower(model ->> 'id'),
           lower(variant ->> 'id'),
           nullif(btrim(variant ->> 'sku'), '')
         from jsonb_array_elements(
           case when jsonb_typeof(v_payload -> 'models') = 'array'
             then v_payload -> 'models' else '[]'::jsonb end
         ) model
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(model -> 'variants') = 'array'
             then model -> 'variants' else '[]'::jsonb end
         ) variant
       ) canonical_sku
       where canonical_sku.sku is not null
         and not exists (
           select 1
           from public.cms_pim_skus sku
           where sku.product_id = v_product.id
             and sku.status = 'active'
             and sku.sku = canonical_sku.sku
             and sku.model_id::text = canonical_sku.model_id
             and (
               (sku.variant_id is null and canonical_sku.variant_id is null)
               or sku.variant_id::text = canonical_sku.variant_id
             )
         )
     ) then
    v_reasons := array_append(v_reasons, 'active_sku_graph_mismatch');
  end if;

  if (
       select count(*)
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'externalIdentifiers') = 'array'
           then v_payload -> 'externalIdentifiers' else '[]'::jsonb end
       ) identifier
     ) <> (
       select count(*) from public.cms_pim_external_identifiers identifier
       where identifier.product_id = v_product.id
     )
     or exists (
       select 1 from public.cms_pim_external_identifiers identifier
       where identifier.product_id = v_product.id
         and not exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(v_payload -> 'externalIdentifiers') = 'array'
               then v_payload -> 'externalIdentifiers' else '[]'::jsonb end
           ) canonical_identifier
           where lower(canonical_identifier ->> 'id') = identifier.id::text
             and canonical_identifier ->> 'kind' = identifier.identifier_kind
             and canonical_identifier ->> 'value' = identifier.identifier_value
             and coalesce(canonical_identifier ->> 'issuer', '') = coalesce(identifier.issuer, '')
             and canonical_identifier #>> '{owner,type}' = identifier.owner_type
             and coalesce(canonical_identifier #>> '{owner,id}', v_product.id::text)
                  = identifier.owner_id::text
             and coalesce(canonical_identifier ->> 'sourceType', 'manual')
                  = identifier.source_type
             and coalesce(canonical_identifier ->> 'sourceRef', '')
                  = coalesce(identifier.source_ref, '')
         )
     ) then
    v_reasons := array_append(v_reasons, 'external_identifier_mismatch');
  end if;

  if (
       select count(*)
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'specifications') = 'array'
           then v_payload -> 'specifications' else '[]'::jsonb end
       ) specification
       where specification ? 'definitionId'
     ) <> (
       select count(*) from public.cms_pim_attribute_values attribute_value
       where attribute_value.product_id = v_product.id and attribute_value.active
     )
     or exists (
       select 1 from public.cms_pim_attribute_values attribute_value
       where attribute_value.product_id = v_product.id and attribute_value.active
         and not exists (
           select 1
           from jsonb_array_elements(
             case when jsonb_typeof(v_payload -> 'specifications') = 'array'
               then v_payload -> 'specifications' else '[]'::jsonb end
           ) specification
           join public.cms_pim_attribute_definitions definition
             on definition.id = attribute_value.definition_id
           where lower(specification ->> 'id') = attribute_value.id::text
             and lower(specification ->> 'definitionId') = attribute_value.definition_id::text
             and specification ->> 'key' = definition.attribute_key
             and specification ->> 'label' = definition.label
             and specification ->> 'type' = case definition.data_type
               when 'decimal' then 'number' else definition.data_type
             end
             and specification ->> 'filterable' = definition.filterable::text
             and specification ->> 'comparable' = definition.comparable::text
             and specification ->> 'searchable' = definition.searchable::text
             and definition.status = 'active'
              and coalesce(specification ->> 'scope', 'product') = attribute_value.owner_scope
              and case attribute_value.owner_scope
                when 'product' then
                  not (specification ? 'ownerId')
                  and attribute_value.owner_id = v_product.id
                else lower(specification ->> 'ownerId') = attribute_value.owner_id::text
              end
             and specification -> 'value' = attribute_value.value
             and coalesce(specification ->> 'unit', '') = coalesce(attribute_value.unit_code, '')
             and coalesce(specification ->> 'sourceType', 'manual')
                  = attribute_value.source_type
             and coalesce(specification ->> 'sourceRef', '')
                  = coalesce(attribute_value.source_ref, '')
             and case
               when specification ? 'confidence' then
                 specification -> 'confidence' = to_jsonb(attribute_value.confidence)
               else attribute_value.confidence = 1
             end
             and case
               when specification ? 'homologated' then
                 specification -> 'homologated' = to_jsonb(attribute_value.homologated)
               else attribute_value.homologated = false
             end
         )
     ) then
    v_reasons := array_append(v_reasons, 'attribute_graph_mismatch');
  end if;

  if (
       select count(*)
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'provenance') = 'array'
           then v_payload -> 'provenance' else '[]'::jsonb end
       ) canonical_provenance
     ) <> (
       select count(*) from public.cms_pim_provenance provenance
       where provenance.product_id = v_product.id and provenance.active
     )
     or exists (
       select 1 from public.cms_pim_provenance provenance
       where provenance.product_id = v_product.id and provenance.active
         and (
           select count(*)
           from jsonb_array_elements(
             case when jsonb_typeof(v_payload -> 'provenance') = 'array'
               then v_payload -> 'provenance' else '[]'::jsonb end
           ) canonical_provenance
           where private.cms_pim_provenance_matches_0078(
             canonical_provenance,
             provenance.source_kind,
             provenance.source_ref,
             provenance.source_sha256,
             provenance.confidence,
             provenance.rights_confirmed,
             provenance.verified_at
           )
         ) <> 1
     )
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(v_payload -> 'provenance') = 'array'
           then v_payload -> 'provenance' else '[]'::jsonb end
       ) canonical_provenance
       where (
         select count(*)
         from public.cms_pim_provenance provenance
         where provenance.product_id = v_product.id
           and provenance.active
           and private.cms_pim_provenance_matches_0078(
             canonical_provenance,
             provenance.source_kind,
             provenance.source_ref,
             provenance.source_sha256,
             provenance.confidence,
             provenance.rights_confirmed,
             provenance.verified_at
           )
       ) <> 1
     ) then
    v_reasons := array_append(v_reasons, 'provenance_mismatch');
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'equivalent', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons),
    'legacySnapshotSha256', v_legacy_sha,
    'canonicalSnapshotSha256', v_canonical_sha
  );
end;
$$;

create function private.cms_reconcile_legacy_pim_0078()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_product public.cms_pim_products%rowtype;
  v_item public.cms_content_items%rowtype;
  v_product_id uuid;
  v_candidate_id uuid;
  v_actor_ids uuid[];
  v_matched_by text;
  v_result text;
  v_critical boolean;
  v_equivalence jsonb;
  v_correlation_id uuid;
  v_linked integer := 0;
  v_archived integer := 0;
  v_critical_count integer := 0;
  v_previous_mode text := current_setting('cms.pim_consolidating', true);
begin
  perform pg_advisory_xact_lock(hashtextextended('cms:pim-content-consolidation:0078', 0));

  -- Freeze the immutable classifier before any resource lock.  Content and
  -- legacy writers then wait behind this one deterministic cutover snapshot.
  lock table private.cms_qa_actor_leases in share row exclusive mode;
  lock table
    public.cms_content_items,
    public.cms_content_drafts,
    public.cms_master_entities,
    public.cms_pim_products,
    public.cms_pim_product_master_links,
    public.cms_pim_models,
    public.cms_pim_variants,
    public.cms_pim_skus,
    public.cms_pim_external_identifiers,
    public.cms_pim_attribute_definitions,
    public.cms_pim_attribute_values,
    public.cms_pim_provenance,
    public.cms_pim_units
  in share row exclusive mode;

  select coalesce(array_agg(distinct actor_id order by actor_id), '{}'::uuid[])
  into v_actor_ids
  from (
    select product.created_by as actor_id from public.cms_pim_products product
    union select product.updated_by from public.cms_pim_products product
    union
    select item.created_by
    from public.cms_content_items item
    where item.content_type = 'product'
      and exists (
        select 1 from public.cms_pim_products product
        where product.content_item_id = item.id or product.slug = item.slug
      )
    union
    select item.updated_by
    from public.cms_content_items item
    where item.content_type = 'product'
      and exists (
        select 1 from public.cms_pim_products product
        where product.content_item_id = item.id or product.slug = item.slug
      )
  ) actors;
  perform private.cms_lock_active_qa_actor_leases(v_actor_ids);
  perform set_config('cms.pim_consolidating', '0078', true);

  for v_product_id in
    select product.id from public.cms_pim_products product order by product.id
  loop
    select * into strict v_product
    from public.cms_pim_products product
    where product.id = v_product_id
    for update;
    v_candidate_id := v_product.content_item_id;
    v_matched_by := case when v_candidate_id is null then 'none' else 'content_item_id' end;

    if v_candidate_id is null and v_product.status <> 'archived' then
      select item.id into v_candidate_id
      from public.cms_content_items item
      where item.content_type = 'product' and item.slug = v_product.slug;
      if found then v_matched_by := 'slug_unique'; end if;
    end if;

    if v_candidate_id is not null then
      select * into v_item
      from public.cms_content_items item
      where item.id = v_candidate_id
      for update;
    else
      v_item := null;
    end if;

    if v_product.status = 'archived' then
      v_result := 'already_archived';
      v_critical := false;
    elsif v_candidate_id is null then
      v_result := 'unlinked_no_candidate';
      v_critical := true;
    elsif v_item.id is null
       or v_item.content_type <> 'product'
       or exists (
         select 1 from public.cms_pim_products other_product
         where other_product.id <> v_product.id
           and other_product.content_item_id = v_candidate_id
       ) then
      v_result := 'unlinked_identity_conflict';
      v_critical := true;
    elsif not private.cms_pim_content_scope_compatible_0078(
      v_product.id, v_candidate_id
    ) then
      v_result := 'unlinked_scope_mismatch';
      v_critical := true;
    else
      if v_product.content_item_id is null then
        update public.cms_pim_products
        set content_item_id = v_candidate_id,
            lock_version = lock_version + 1
        where id = v_product.id;
        v_linked := v_linked + 1;
      end if;
      v_equivalence := private.cms_pim_content_equivalence_0078(
        v_product.id, v_candidate_id
      );
      if coalesce((v_equivalence ->> 'equivalent')::boolean, false) then
        update public.cms_pim_product_master_links
        set status = 'inactive', effective_to = coalesce(effective_to, now())
        where product_id = v_product.id and status = 'active';
        update public.cms_pim_models
        set status = 'discontinued', is_primary = false, lock_version = lock_version + 1
        where product_id = v_product.id and status = 'active';
        update public.cms_pim_variants
        set status = 'discontinued', lock_version = lock_version + 1
        where product_id = v_product.id and status = 'active';
        update public.cms_pim_skus
        set status = 'retired',
            retired_at = now(),
            retirement_reason = 'Superseded by canonical cms-content after 0078 equivalence proof'
        where product_id = v_product.id and status = 'active';
        update public.cms_pim_attribute_values
        set active = false, lock_version = lock_version + 1
        where product_id = v_product.id and active;
        update public.cms_pim_provenance
        set active = false
        where product_id = v_product.id and active;
        update public.cms_pim_products
        set status = 'archived', lock_version = lock_version + 1
        where id = v_product.id;
        v_result := 'archived_equivalent';
        v_critical := false;
        v_archived := v_archived + 1;
      else
        v_result := 'linked_divergent';
        v_critical := true;
      end if;
    end if;

    if v_equivalence is null then
      v_equivalence := private.cms_pim_content_equivalence_0078(
        v_product.id, v_candidate_id
      );
    end if;
    v_correlation_id := gen_random_uuid();
    if v_critical then v_critical_count := v_critical_count + 1; end if;
    insert into public.cms_pim_content_reconciliation_events (
      legacy_product_id, content_item_id, matched_by, result, critical,
      legacy_snapshot_sha256, canonical_snapshot_sha256, details, correlation_id
    ) values (
      v_product.id, v_candidate_id, v_matched_by, v_result, v_critical,
      v_equivalence ->> 'legacySnapshotSha256',
      nullif(v_equivalence ->> 'canonicalSnapshotSha256', ''),
      jsonb_build_object(
        'schemaVersion', 1,
        'reasons', coalesce(v_equivalence -> 'reasons', '[]'::jsonb),
        'legacyStatusBefore', v_product.status,
        'canonicalWriter', 'cms-content',
        'legacyWriteMode', 'read_only'
      ),
      v_correlation_id
    );
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      null,
      'cms:pim.consolidation.reconciled',
      'pim_product',
      v_product.id::text,
      jsonb_build_object(
        'schemaVersion', 1,
        'contentItemId', v_candidate_id,
        'matchedBy', v_matched_by,
        'result', v_result,
        'critical', v_critical,
        'legacySnapshotSha256', v_equivalence ->> 'legacySnapshotSha256',
        'canonicalSnapshotSha256', v_equivalence ->> 'canonicalSnapshotSha256',
        'containsPii', false
      ),
      v_correlation_id
    );
    v_equivalence := null;
  end loop;

  perform set_config(
    'cms.pim_consolidating', coalesce(nullif(v_previous_mode, ''), 'off'), true
  );
  return jsonb_build_object(
    'schemaVersion', 1,
    'linked', v_linked,
    'archivedEquivalent', v_archived,
    'critical', v_critical_count,
    'canonicalWriter', 'cms-content'
  );
exception when others then
  perform set_config(
    'cms.pim_consolidating', coalesce(nullif(v_previous_mode, ''), 'off'), true
  );
  raise;
end;
$$;

revoke all on function private.cms_pim_content_scope_compatible_0078(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_canonical_identity_valid_0078(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_safe_timestamptz_equal_0078(text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_provenance_matches_0078(
  jsonb,text,text,text,numeric,boolean,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.cms_product_shared_controlled_list_allowed_0078(
  uuid,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function private.cms_product_controlled_option_scope_allowed_0078(
  uuid,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function private.cms_cleanup_terminal_product_shared_options_0078()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_resolve_controlled_master_entity_0078(
  uuid,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
revoke all on function public.cms_product_attributes_catalog_scoped(
  uuid,text,text,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_product_attributes_catalog_scoped(
  uuid,text,text,uuid
) to service_role;
revoke all on function public.cms_pim_master_controlled_options_scoped(
  uuid,text,text,uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.cms_pim_master_controlled_options_scoped(
  uuid,text,text,uuid[]
) to service_role;
revoke all on function private.cms_pim_canonical_attributes_valid_0078(uuid,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_pim_content_equivalence_0078(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_reconcile_legacy_pim_0078()
  from public, anon, authenticated, service_role;

-- The migration owner performs the one-time conversion while locks prevent an
-- old Edge invocation from racing the read-only cutover.
select private.cms_reconcile_legacy_pim_0078();

create function public.cms_pim_legacy_graph_read_only_0078()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_id uuid := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
  v_row jsonb := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  v_product_id uuid;
begin
  v_product_id := case
    when tg_table_name = 'cms_pim_products' then (v_row ->> 'id')::uuid
    else (v_row ->> 'product_id')::uuid
  end;

  -- Only the migration owner can use the internal mode.  It is not an API
  -- capability and no executable function that sets it is granted externally.
  if current_setting('cms.pim_consolidating', true) = '0078'
     and session_user = current_user then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The narrowly granted reconciliation RPC is the only post-cutover writer.
  -- service_role has no graph DML grants, and the fence binds every row to the
  -- single product whose CAS/authorization was verified under table locks.
  if current_setting('cms.pim_reconcile_product_id', true) = v_product_id::text
     and nullif(current_setting('cms.pim_reconcile_actor_id', true), '')::uuid is not null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The terminal QA watchdog from 0064 remains able to retire its own graph.
  -- It cannot adopt a corporate/other-run parent and it never creates rows.
  if tg_op <> 'INSERT'
     and current_setting('cms.qa_compensating', true) = 'on'
     and v_actor_id is not null
     and v_row ->> 'created_by' = v_actor_id::text
     and v_row ->> 'updated_by' = v_actor_id::text
     and exists (
       select 1 from private.cms_qa_actor_leases lease
       where lease.actor_id = v_actor_id
         and lease.status in ('active', 'expired')
         and private.cms_qa_actor_marker_is_exact(
           lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
         )
     ) then
    if exists (
      select 1 from public.cms_pim_products product
      where product.id = v_product_id
        and product.created_by = v_actor_id
        and product.updated_by = v_actor_id
    ) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
  end if;

  raise exception 'CMS_PIM_LEGACY_READ_ONLY' using
    errcode = '42501',
    hint = 'Use cms-content as the canonical product writer.';
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'cms_pim_products',
    'cms_pim_product_master_links',
    'cms_pim_models',
    'cms_pim_variants',
    'cms_pim_skus',
    'cms_pim_external_identifiers',
    'cms_pim_attribute_values',
    'cms_pim_provenance'
  ] loop
    execute format('drop trigger if exists cms_pim_legacy_read_only_0078 on public.%I', v_table);
    execute format(
      'create trigger cms_pim_legacy_read_only_0078 before insert or update or delete on public.%I for each row execute function public.cms_pim_legacy_graph_read_only_0078()',
      v_table
    );
  end loop;
end;
$$;

revoke insert, update, delete on table
  public.cms_pim_products,
  public.cms_pim_product_master_links,
  public.cms_pim_models,
  public.cms_pim_variants,
  public.cms_pim_skus,
  public.cms_pim_external_identifiers,
  public.cms_pim_attribute_values,
  public.cms_pim_provenance
from service_role;
revoke usage, update on sequence public.cms_pim_sku_sequence from service_role;

create function public.cms_get_pim_reconciliation_plan(
  p_actor_id uuid,
  p_product_id uuid,
  p_content_item_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_product public.cms_pim_products%rowtype;
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_equivalence jsonb;
begin
  if p_actor_id is null
     or p_product_id is null
     or p_content_item_id is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_correlation_id is null then
    raise exception 'CMS_PIM_RECONCILIATION_INVALID' using errcode = '22023';
  end if;

  -- Classifier before resources, matching the command/watchdog lock order.
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  if not private.cms_content_actor_context_active(p_actor_id, p_environment)
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:pim.archive', p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_product
  from public.cms_pim_products product
  where product.id = p_product_id and product.site_key = p_site_key
  for share;
  select * into v_item
  from public.cms_content_items item
  where item.id = p_content_item_id and item.content_type = 'product'
  for share;
  select * into v_draft
  from public.cms_content_drafts draft
  where draft.item_id = p_content_item_id
  for share;
  if v_product.id is null or v_item.id is null or v_draft.item_id is null then
    raise exception 'CMS_PIM_RECONCILIATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_product.status = 'archived'
     or (v_product.content_item_id is not null and v_product.content_item_id <> v_item.id)
     or (v_product.content_item_id is null and v_product.slug <> v_item.slug)
     or exists (
       select 1 from public.cms_pim_products other_product
       where other_product.id <> v_product.id
         and other_product.content_item_id = v_item.id
     )
     or not private.cms_pim_product_graph_scope_allowed(
       p_actor_id, v_product.id, p_environment, p_site_key
     )
     or not private.cms_content_item_graph_scope_allowed(
       p_actor_id, v_item.id, p_environment
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_FORBIDDEN' using errcode = '42501';
  end if;

  v_equivalence := private.cms_pim_content_equivalence_0078(
    v_product.id, v_item.id
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:pim.reconciliation_plan_read',
    'pim_product',
    v_product.id::text,
    jsonb_build_object(
      'schemaVersion', 1,
      'contentItemId', v_item.id,
      'legacySnapshotSha256', v_equivalence ->> 'legacySnapshotSha256',
      'equivalent', v_equivalence -> 'equivalent',
      'containsPii', false
    ),
    p_correlation_id
  );
  return jsonb_build_object(
    'schemaVersion', 1,
    'correlationId', p_correlation_id,
    'productId', v_product.id,
    'contentItemId', v_item.id,
    'productVersion', v_product.lock_version,
    'draftVersion', v_draft.lock_version,
    'equivalent', v_equivalence -> 'equivalent',
    'reasons', coalesce(v_equivalence -> 'reasons', '[]'::jsonb),
    'legacySnapshotSha256', v_equivalence ->> 'legacySnapshotSha256',
    'canonicalSnapshotSha256', v_equivalence ->> 'canonicalSnapshotSha256',
    'acknowledgementRequiresAal2', true
  );
end;
$$;

revoke all on function public.cms_get_pim_reconciliation_plan(
  uuid,uuid,uuid,text,text,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_get_pim_reconciliation_plan(
  uuid,uuid,uuid,text,text,text,text,timestamptz,uuid
) to service_role;

create function public.cms_reconcile_legacy_pim_product(
  p_actor_id uuid,
  p_product_id uuid,
  p_content_item_id uuid,
  p_expected_product_version bigint,
  p_expected_draft_version bigint,
  p_resolution text,
  p_acknowledged_legacy_sha256 text,
  p_reason text,
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
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_product public.cms_pim_products%rowtype;
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_receipt public.cms_pim_content_reconciliation_receipts%rowtype;
  v_equivalence jsonb;
  v_legacy_sha text;
  v_matched_by text;
  v_result text;
  v_response jsonb;
  v_previous_product text := current_setting('cms.pim_reconcile_product_id', true);
  v_previous_actor text := current_setting('cms.pim_reconcile_actor_id', true);
begin
  if p_actor_id is null
     or p_product_id is null
     or p_content_item_id is null
     or p_expected_product_version is null or p_expected_product_version < 1
     or p_expected_draft_version is null or p_expected_draft_version < 1
     or p_resolution not in ('equivalence', 'retire_acknowledged_gap')
     or char_length(coalesce(btrim(p_reason), '')) not between 3 and 500
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_command_id is null or p_idempotency_key is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_correlation_id is null then
    raise exception 'CMS_PIM_RECONCILIATION_INVALID' using errcode = '22023';
  end if;
  if p_resolution = 'retire_acknowledged_gap'
     and (
       p_aal <> 'aal2'
       or p_acknowledged_legacy_sha256 is null
       or p_acknowledged_legacy_sha256 !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_ACK_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cms:pim-reconcile:' || p_product_id::text, 0)
  );
  -- A rare privileged convergence operation deliberately takes a classifier
  -- table lock before any catalog/content resource. This is heavy but removes
  -- lease/child-graph TOCTOU while the permanent write path remains cms-content.
  lock table private.cms_qa_actor_leases in share row exclusive mode;

  if not private.cms_content_actor_context_active(p_actor_id, p_environment)
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:pim.archive', p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.cms_pim_content_reconciliation_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> p_request_hash
       or v_receipt.command_id <> p_command_id
       or v_receipt.legacy_product_id <> p_product_id
       or v_receipt.content_item_id <> p_content_item_id then
      raise exception 'CMS_PIM_RECONCILIATION_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('replayed', true);
    end if;
  end if;

  lock table
    public.cms_content_items,
    public.cms_content_drafts,
    public.cms_master_entities,
    public.cms_pim_products,
    public.cms_pim_product_master_links,
    public.cms_pim_models,
    public.cms_pim_variants,
    public.cms_pim_skus,
    public.cms_pim_external_identifiers,
    public.cms_pim_attribute_definitions,
    public.cms_pim_attribute_values,
    public.cms_pim_provenance,
    public.cms_pim_units
  in share row exclusive mode;

  select * into v_product
  from public.cms_pim_products product
  where product.id = p_product_id and product.site_key = p_site_key
  for update;
  select * into v_item
  from public.cms_content_items item
  where item.id = p_content_item_id and item.content_type = 'product'
  for update;
  select * into v_draft
  from public.cms_content_drafts draft
  where draft.item_id = p_content_item_id
  for update;
  if v_product.id is null or v_item.id is null or v_draft.item_id is null then
    raise exception 'CMS_PIM_RECONCILIATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_product.lock_version <> p_expected_product_version
     or v_draft.lock_version <> p_expected_draft_version then
    raise exception 'CMS_PIM_RECONCILIATION_CONFLICT' using errcode = '40001';
  end if;
  if v_product.status = 'archived'
     or (v_product.content_item_id is not null and v_product.content_item_id <> v_item.id)
     or (v_product.content_item_id is null and v_product.slug <> v_item.slug)
     or exists (
       select 1 from public.cms_pim_products other_product
       where other_product.id <> v_product.id
         and other_product.content_item_id = v_item.id
     )
     or not private.cms_pim_product_graph_scope_allowed(
       p_actor_id, v_product.id, p_environment, p_site_key
     )
     or not private.cms_content_item_graph_scope_allowed(
       p_actor_id, v_item.id, p_environment
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_FORBIDDEN' using errcode = '42501';
  end if;

  -- Preserve how the candidate was originally discovered.  The governed
  -- archive below links a slug-matched row and refreshes v_product with
  -- UPDATE ... RETURNING, so deriving this evidence afterwards would
  -- incorrectly relabel every successful reconciliation as content_item_id.
  v_matched_by := case
    when v_product.content_item_id is null then 'slug_unique'
    else 'content_item_id'
  end;

  insert into public.cms_pim_content_reconciliation_receipts (
    actor_id, idempotency_key, command_id, request_hash,
    legacy_product_id, content_item_id, correlation_id
  ) values (
    p_actor_id, p_idempotency_key, p_command_id, p_request_hash,
    p_product_id, p_content_item_id, p_correlation_id
  ) on conflict (actor_id, idempotency_key) do nothing;
  select * into strict v_receipt
  from public.cms_pim_content_reconciliation_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.idempotency_key = p_idempotency_key
  for update;
  if v_receipt.request_hash <> p_request_hash
     or v_receipt.command_id <> p_command_id
     or v_receipt.legacy_product_id <> p_product_id
     or v_receipt.content_item_id <> p_content_item_id then
    raise exception 'CMS_PIM_RECONCILIATION_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  v_equivalence := private.cms_pim_content_equivalence_0078(
    v_product.id, v_item.id
  );
  v_legacy_sha := v_equivalence ->> 'legacySnapshotSha256';
  if p_resolution = 'equivalence'
     and coalesce((v_equivalence ->> 'equivalent')::boolean, false) is not true then
    raise exception 'CMS_PIM_RECONCILIATION_REQUIRED' using
      errcode = '23514', detail = v_legacy_sha;
  end if;
  if p_resolution = 'retire_acknowledged_gap'
     and p_acknowledged_legacy_sha256 is distinct from v_legacy_sha then
    raise exception 'CMS_PIM_RECONCILIATION_ACK_MISMATCH' using errcode = '40001';
  end if;

  perform set_config('cms.pim_reconcile_product_id', v_product.id::text, true);
  perform set_config('cms.pim_reconcile_actor_id', p_actor_id::text, true);
  if v_product.content_item_id is null then
    update public.cms_pim_products
    set content_item_id = v_item.id, lock_version = lock_version + 1
    where id = v_product.id and lock_version = p_expected_product_version;
    if not found then
      raise exception 'CMS_PIM_RECONCILIATION_CONFLICT' using errcode = '40001';
    end if;
  end if;
  update public.cms_pim_product_master_links
  set status = 'inactive', effective_to = coalesce(effective_to, now())
  where product_id = v_product.id and status = 'active';
  update public.cms_pim_models
  set status = 'discontinued', is_primary = false, lock_version = lock_version + 1
  where product_id = v_product.id and status = 'active';
  update public.cms_pim_variants
  set status = 'discontinued', lock_version = lock_version + 1
  where product_id = v_product.id and status = 'active';
  update public.cms_pim_skus
  set status = 'retired', retired_at = now(),
      retirement_reason = 'Superseded by canonical cms-content after governed 0078 reconciliation'
  where product_id = v_product.id and status = 'active';
  update public.cms_pim_attribute_values
  set active = false, lock_version = lock_version + 1
  where product_id = v_product.id and active;
  update public.cms_pim_provenance
  set active = false
  where product_id = v_product.id and active;
  update public.cms_pim_products
  set status = 'archived', lock_version = lock_version + 1
  where id = v_product.id and status <> 'archived'
  returning * into v_product;
  if not found then
    raise exception 'CMS_PIM_RECONCILIATION_CONFLICT' using errcode = '40001';
  end if;

  v_result := case p_resolution
    when 'equivalence' then 'archived_equivalent'
    else 'retired_acknowledged_gap'
  end;
  insert into public.cms_pim_content_reconciliation_events (
    legacy_product_id, content_item_id, matched_by, result, critical,
    legacy_snapshot_sha256, canonical_snapshot_sha256, details, correlation_id
  ) values (
    v_product.id, v_item.id, v_matched_by,
    v_result, false, v_legacy_sha,
    nullif(v_equivalence ->> 'canonicalSnapshotSha256', ''),
    jsonb_build_object(
      'schemaVersion', 1,
      'resolution', p_resolution,
      'reasons', coalesce(v_equivalence -> 'reasons', '[]'::jsonb),
      'legacyAcknowledgedByHash', p_resolution = 'retire_acknowledged_gap',
      'canonicalWriter', 'cms-content',
      'legacyWriteMode', 'read_only'
    ), p_correlation_id
  );

  v_response := jsonb_build_object(
    'schemaVersion', 1,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'productId', v_product.id,
    'contentItemId', v_item.id,
    'matchedBy', v_matched_by,
    'status', v_product.status,
    'lockVersion', v_product.lock_version,
    'result', v_result,
    'legacySnapshotSha256', v_legacy_sha,
    'replayed', false
  );
  update public.cms_pim_content_reconciliation_receipts
  set response = v_response, completed_at = clock_timestamp()
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:pim.reconcile_legacy', 'pim_product', v_product.id::text,
    jsonb_build_object(
      'schemaVersion', 1,
      'contentItemId', v_item.id,
      'matchedBy', v_matched_by,
      'resolution', p_resolution,
      'result', v_result,
      'legacySnapshotSha256', v_legacy_sha,
      'reason', btrim(p_reason),
      'containsPii', false
    ), p_correlation_id
  );
  perform set_config(
    'cms.pim_reconcile_product_id', coalesce(nullif(v_previous_product, ''), 'off'), true
  );
  perform set_config(
    'cms.pim_reconcile_actor_id', coalesce(nullif(v_previous_actor, ''), 'off'), true
  );
  return v_response;
exception when others then
  perform set_config(
    'cms.pim_reconcile_product_id', coalesce(nullif(v_previous_product, ''), 'off'), true
  );
  perform set_config(
    'cms.pim_reconcile_actor_id', coalesce(nullif(v_previous_actor, ''), 'off'), true
  );
  raise;
end;
$$;

revoke all on function public.cms_reconcile_legacy_pim_product(
  uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_reconcile_legacy_pim_product(
  uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,
  uuid,uuid,text,uuid
) to service_role;

create or replace function public.cms_execute_pim_command(
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
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if p_action not in ('save_product', 'generate_sku', 'archive_product') then
    raise exception 'CMS_PIM_COMMAND_INVALID' using errcode = '22023';
  end if;
  raise exception 'CMS_PIM_LEGACY_READ_ONLY' using
    errcode = '55000',
    detail = 'cms-content is the authoritative product writer',
    hint = 'Create, edit and archive products through cms-content.';
end;
$$;

revoke all on function public.cms_pim_legacy_graph_read_only_0078()
  from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_pim_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cms_execute_pim_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;

-- Keep the stable trigger/function name used by deploy probes, but validate
-- only canonical product data.  Any still-actionable legacy row is a critical
-- reconciliation divergence and blocks publication fail-closed.
create or replace function public.cms_require_pim_active_skus_for_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if new.content_type <> 'product' then return new; end if;

  if not private.cms_pim_canonical_identity_valid_0078(new.payload) then
    raise exception 'CMS_PIM_CANONICAL_IDENTITY_CONFLICT' using errcode = '23514';
  end if;
  if not private.cms_pim_canonical_attributes_valid_0078(new.item_id, new.payload) then
    raise exception 'CMS_PIM_CANONICAL_ATTRIBUTE_INVALID' using errcode = '23514';
  end if;

  if jsonb_typeof(new.payload -> 'models') is distinct from 'array'
     or jsonb_array_length(
       case when jsonb_typeof(new.payload -> 'models') = 'array'
         then new.payload -> 'models' else '[]'::jsonb end
     ) = 0
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(new.payload -> 'models') = 'array'
           then new.payload -> 'models' else '[]'::jsonb end
       ) model
       where nullif(btrim(model ->> 'id'), '') is null
          or nullif(btrim(model ->> 'model'), '') is null
          or nullif(btrim(model ->> 'manufacturerReference'), '') is null
          or nullif(btrim(model ->> 'sku'), '') is null
          or upper(btrim(model ->> 'sku')) = 'PENDENTE'
          or jsonb_typeof(model -> 'variants') is distinct from 'array'
          or jsonb_array_length(
            case when jsonb_typeof(model -> 'variants') = 'array'
              then model -> 'variants' else '[]'::jsonb end
          ) = 0
          or exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(model -> 'variants') = 'array'
                then model -> 'variants' else '[]'::jsonb end
            ) variant
            where nullif(btrim(variant ->> 'id'), '') is null
               or nullif(btrim(variant ->> 'name'), '') is null
               or nullif(btrim(variant ->> 'code'), '') is null
          )
     )
     or (
       select count(distinct lower(model ->> 'id'))
       from jsonb_array_elements(
         case when jsonb_typeof(new.payload -> 'models') = 'array'
           then new.payload -> 'models' else '[]'::jsonb end
       ) model
     ) <> jsonb_array_length(
       case when jsonb_typeof(new.payload -> 'models') = 'array'
         then new.payload -> 'models' else '[]'::jsonb end
     ) then
    raise exception 'CMS_PIM_CANONICAL_SKU_REQUIRED' using errcode = '23514';
  end if;

  if lower(btrim(coalesce(new.payload -> 'brand' ->> 'name', ''))) in
       ('marca não informada', 'marca nao informada', 'a confirmar', 'não informado', 'nao informado')
     or lower(btrim(coalesce(new.payload -> 'productLine' ->> 'name', ''))) in
       ('linha geral', 'a confirmar', 'não informado', 'nao informado') then
    raise exception 'CMS_PIM_PUBLIC_DATA_REQUIRED' using errcode = '23514';
  end if;

  if exists (
       select 1
       from public.cms_pim_products product
       where product.status <> 'archived'
         and (
           product.content_item_id = new.item_id
           or (product.content_item_id is null and product.slug = new.slug)
         )
     )
     or exists (
       select 1
       from public.cms_pim_content_reconciliation_events event
       join public.cms_pim_products product on product.id = event.legacy_product_id
       where event.content_item_id = new.item_id
         and event.critical
         and product.status <> 'archived'
     ) then
    raise exception 'CMS_PIM_RECONCILIATION_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.cms_require_pim_active_skus_for_publication()
  from public, anon, authenticated, service_role;

-- Preserve the legacy read projection for consumers, but retain canonical
-- model/variant and attribute-owner identity instead of collapsing it.
create or replace function public.cms_sync_product_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  p jsonb := new.payload;
  model jsonb;
  variant jsonb;
  spec jsonb;
  doc jsonb;
  relation_type text;
  target jsonb;
  term text;
begin
  if new.content_type <> 'product' then return new; end if;
  if p ->> 'consumerId' <> 'cms.catalog-product.v1'
     or jsonb_typeof(p -> 'models') <> 'array'
     or jsonb_array_length(p -> 'models') = 0
     or jsonb_typeof(p -> 'specifications') <> 'array'
     or jsonb_array_length(p -> 'specifications') = 0
     or nullif(p #>> '{brand,name}', '') is null
     or nullif(p #>> '{brand,slug}', '') is null
     or nullif(p #>> '{manufacturer,name}', '') is null
     or nullif(p #>> '{models,0,manufacturerReference}', '') is null
     or nullif(p #>> '{classification,category}', '') is null then
    raise exception 'CMS_PRODUCT_CONTRACT_INVALID' using errcode = '23514';
  end if;
  if p #> '{seo,indexable}' = 'true'::jsonb
     and (
       p ->> 'pilotState' <> 'homologated'
       or nullif(p #>> '{approval,homologatedAt}', '') is null
     ) then
    raise exception 'CMS_PRODUCT_OWNER_APPROVAL_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p #> '{relations,productIds}', '[]'::jsonb)) relation
    where not exists (
      select 1 from public.cms_published_projection published
      where published.item_id = (relation #>> '{}')::uuid
        and published.content_type = 'product'
    )
  ) then
    raise exception 'CMS_PRODUCT_RELATION_UNPUBLISHED' using errcode = '23514';
  end if;

  insert into public.cms_product_projection (
    item_id, revision_id, slug, pilot_state, title, brand_name, brand_slug,
    manufacturer_name, manufacturer_slug, product_line_name, product_line_slug,
    segment, category, subcategory, family, primary_model,
    primary_manufacturer_reference, technology, short_description,
    card_attributes, filter_facets, search_text, content_version, published_at
  ) values (
    new.item_id, new.revision_id, new.slug, p ->> 'pilotState', p ->> 'title',
    p #>> '{brand,name}', p #>> '{brand,slug}', p #>> '{manufacturer,name}',
    p #>> '{manufacturer,slug}', p #>> '{productLine,name}', p #>> '{productLine,slug}',
    p #>> '{classification,segment}', p #>> '{classification,category}',
    nullif(p #>> '{classification,subcategory}', ''), p #>> '{classification,family}',
    p #>> '{models,0,model}', p #>> '{models,0,manufacturerReference}',
    p ->> 'technology', p #>> '{commercial,shortDescription}',
    (
      select coalesce(jsonb_agg(card_spec), '[]'::jsonb)
      from (
        select value as card_spec
        from jsonb_array_elements(p -> 'specifications') value
        where value -> 'comparable' = 'true'::jsonb
        limit 3
      ) comparable_specs
    ),
    jsonb_build_object(
      'segment', p #>> '{classification,segment}',
      'category', p #>> '{classification,category}',
      'family', p #>> '{classification,family}',
      'technology', p ->> 'technology'
    ),
    concat_ws(
      ' ', p ->> 'title', p #>> '{brand,name}', p #>> '{manufacturer,name}',
      p #>> '{productLine,name}',
      (
        select string_agg(
          concat_ws(
            ' ', model_value ->> 'model', model_value ->> 'manufacturerReference',
            model_value ->> 'sku',
            (
              select string_agg(
                concat_ws(' ', variant_value ->> 'name', variant_value ->> 'code', variant_value ->> 'sku'),
                ' '
              )
              from jsonb_array_elements(model_value -> 'variants') variant_value
            )
          ),
          ' '
        )
        from jsonb_array_elements(p -> 'models') model_value
      ),
      p #>> '{classification,segment}', p #>> '{classification,category}',
      p #>> '{classification,family}', p ->> 'technology',
      (
        select string_agg(
          concat_ws(' ', value ->> 'label', value ->> 'key', value -> 'value' #>> '{}'),
          ' '
        )
        from jsonb_array_elements(p -> 'specifications') value
        where value -> 'searchable' = 'true'::jsonb
      ),
      (
        select string_agg(value #>> '{}', ' ')
        from jsonb_array_elements(coalesce(p #> '{search,synonyms}', '[]'::jsonb)) value
      ),
      (
        select string_agg(value #>> '{}', ' ')
        from jsonb_array_elements(coalesce(p #> '{search,keywords}', '[]'::jsonb)) value
      )
    ),
    new.content_version, new.published_at
  ) on conflict (item_id) do update set
    revision_id = excluded.revision_id,
    slug = excluded.slug,
    pilot_state = excluded.pilot_state,
    title = excluded.title,
    brand_name = excluded.brand_name,
    brand_slug = excluded.brand_slug,
    manufacturer_name = excluded.manufacturer_name,
    manufacturer_slug = excluded.manufacturer_slug,
    product_line_name = excluded.product_line_name,
    product_line_slug = excluded.product_line_slug,
    segment = excluded.segment,
    category = excluded.category,
    subcategory = excluded.subcategory,
    family = excluded.family,
    primary_model = excluded.primary_model,
    primary_manufacturer_reference = excluded.primary_manufacturer_reference,
    technology = excluded.technology,
    short_description = excluded.short_description,
    card_attributes = excluded.card_attributes,
    filter_facets = excluded.filter_facets,
    search_text = excluded.search_text,
    content_version = excluded.content_version,
    published_at = excluded.published_at;

  delete from public.cms_product_variant_projection where item_id = new.item_id;
  delete from public.cms_product_attribute_projection where item_id = new.item_id;
  delete from public.cms_product_document_projection where item_id = new.item_id;
  delete from public.cms_product_relation_projection where item_id = new.item_id;
  delete from public.cms_product_search_term_projection where item_id = new.item_id;
  delete from public.cms_redirects where item_id = new.item_id;

  for model in select value from jsonb_array_elements(p -> 'models') loop
    for variant in select value from jsonb_array_elements(model -> 'variants') loop
      insert into public.cms_product_variant_projection (
        id, item_id, model_id, model_name, manufacturer_reference, sku,
        variant_name, variant_code, status, display_order
      ) values (
        (variant ->> 'id')::uuid, new.item_id, (model ->> 'id')::uuid,
        model ->> 'model', model ->> 'manufacturerReference',
        coalesce(nullif(variant ->> 'sku', ''), model ->> 'sku'),
        variant ->> 'name', variant ->> 'code',
        coalesce(variant ->> 'status', model ->> 'status'),
        (variant ->> 'order')::integer
      );
    end loop;
  end loop;
  for spec in select value from jsonb_array_elements(p -> 'specifications') loop
    insert into public.cms_product_attribute_projection (
      id, item_id, attribute_key, label, data_type, value_json, unit,
      required, filterable, comparable, searchable,
      definition_id, owner_scope, owner_id
    ) values (
      (spec ->> 'id')::uuid, new.item_id, spec ->> 'key', spec ->> 'label',
      spec ->> 'type', spec -> 'value', nullif(spec ->> 'unit', ''),
      (spec ->> 'required')::boolean, (spec ->> 'filterable')::boolean,
      (spec ->> 'comparable')::boolean, (spec ->> 'searchable')::boolean,
      (spec ->> 'definitionId')::uuid,
      coalesce(spec ->> 'scope', 'product'),
      case
        when coalesce(spec ->> 'scope', 'product') = 'product' then null
        else (spec ->> 'ownerId')::uuid
      end
    );
  end loop;
  for doc in
    select value from jsonb_array_elements(coalesce(p -> 'documents', '[]'::jsonb))
  loop
    insert into public.cms_product_document_projection (
      id, item_id, kind, title, official_url, storage_path, sha256,
      revision, language, visibility, rights_confirmed
    ) values (
      (doc ->> 'id')::uuid, new.item_id, doc ->> 'kind', doc ->> 'title',
      nullif(doc ->> 'officialUrl', ''), nullif(doc ->> 'storagePath', ''),
      doc ->> 'sha256', doc ->> 'revision', doc ->> 'language',
      doc ->> 'visibility', (doc ->> 'rightsConfirmed')::boolean
    );
  end loop;
  foreach relation_type in array array['product', 'application', 'sector', 'service'] loop
    for target in
      select value
      from jsonb_array_elements(
        coalesce(p #> array['relations', relation_type || 'Ids'], '[]'::jsonb)
      )
    loop
      insert into public.cms_product_relation_projection
      values (new.item_id, relation_type, (target #>> '{}')::uuid);
    end loop;
  end loop;
  foreach term in array array(
    select jsonb_array_elements_text(coalesce(p #> '{search,synonyms}', '[]'::jsonb))
  ) loop
    insert into public.cms_product_search_term_projection values (new.item_id, term, 'synonym');
  end loop;
  foreach term in array array(
    select jsonb_array_elements_text(coalesce(p #> '{search,keywords}', '[]'::jsonb))
  ) loop
    insert into public.cms_product_search_term_projection values (new.item_id, term, 'keyword');
  end loop;
  for doc in
    select value from jsonb_array_elements(coalesce(p -> 'redirects', '[]'::jsonb))
  loop
    insert into public.cms_redirects(item_id, source_path, destination_path, status_code)
    values (
      new.item_id, doc ->> 'sourcePath', '/produtos/' || new.slug,
      (doc ->> 'statusCode')::integer
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.cms_sync_product_projection()
  from public, anon, authenticated, service_role;

comment on table public.cms_pim_content_reconciliation_events is
  'Immutable 0078 evidence: cms-content is canonical; cms-pim is read-only compatibility data.';
comment on function public.cms_execute_pim_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) is 'Read-only tombstone for legacy PIM mutations; use cms-content.';
