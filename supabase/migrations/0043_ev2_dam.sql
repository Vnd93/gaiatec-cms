-- EV2.5 — DAM contextual, direitos com vigência e substituição reversível.
-- A migration é aditiva, mantém cms_media_* v1 e não ativa a feature flag.

insert into public.cms_permissions (permission_key, description, critical)
values ('cms:media.edit', 'Editar metadados, coleções, tags e crops do DAM.', false)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:media.edit'),
  ('admin', 'cms:media.edit'),
  ('marketing', 'cms:media.edit'),
  ('technical', 'cms:media.edit'),
  ('editor', 'cms:media.edit')
on conflict do nothing;

alter table public.cms_media_assets
  add column rights_expires_at timestamptz,
  add column perceptual_hash text check (perceptual_hash is null or perceptual_hash ~ '^[0-9a-f]{16}$'),
  add column reservation_hash text check (reservation_hash is null or reservation_hash ~ '^[0-9a-f]{64}$'),
  add column lock_version bigint not null default 1 check (lock_version > 0),
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add constraint cms_media_rights_expiry_after_creation
    check (rights_expires_at is null or rights_expires_at > created_at);

create table public.cms_dam_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text not null check (char_length(normalized_name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cms_dam_collections_active_name_uidx
  on public.cms_dam_collections (normalized_name) where status = 'active';

create table public.cms_dam_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  normalized_name text not null unique check (char_length(normalized_name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_dam_collection_assets (
  collection_id uuid not null references public.cms_dam_collections (id) on delete restrict,
  asset_id uuid not null references public.cms_media_assets (id) on delete restrict,
  position integer not null default 0 check (position between 0 and 99999),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (collection_id, asset_id)
);

create table public.cms_dam_asset_tags (
  asset_id uuid not null references public.cms_media_assets (id) on delete restrict,
  tag_id uuid not null references public.cms_dam_tags (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (asset_id, tag_id)
);

create table public.cms_dam_crops (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.cms_media_assets (id) on delete restrict,
  crop_key text not null check (crop_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  aspect_width integer not null check (aspect_width between 1 and 10000),
  aspect_height integer not null check (aspect_height between 1 and 10000),
  crop_x numeric(7,6) not null check (crop_x between 0 and 1),
  crop_y numeric(7,6) not null check (crop_y between 0 and 1),
  crop_width numeric(7,6) not null check (crop_width > 0 and crop_width <= 1),
  crop_height numeric(7,6) not null check (crop_height > 0 and crop_height <= 1),
  focal_x numeric(7,6) not null check (focal_x between 0 and 1),
  focal_y numeric(7,6) not null check (focal_y between 0 and 1),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, crop_key),
  check (crop_x + crop_width <= 1 and crop_y + crop_height <= 1)
);

create table public.cms_dam_replacements (
  id uuid primary key default gen_random_uuid(),
  -- Keep both identifiers as immutable history. Active links are validated by the
  -- command function and GC refuses them; rolled-back links may outlive collected assets.
  source_asset_id uuid not null,
  target_asset_id uuid not null,
  status text not null default 'active' check (status in ('active', 'rolled_back')),
  impact_snapshot jsonb not null check (jsonb_typeof(impact_snapshot) = 'object'),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  rolled_back_by uuid references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  check (source_asset_id <> target_asset_id),
  check ((status = 'rolled_back') = (rolled_back_at is not null))
);

create unique index cms_dam_replacements_active_source_uidx
  on public.cms_dam_replacements (source_asset_id) where status = 'active';
create index cms_dam_replacements_target_idx
  on public.cms_dam_replacements (target_asset_id) where status = 'active';

create table public.cms_dam_gc_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.cms_media_assets (id) on delete set null,
  asset_snapshot jsonb not null check (jsonb_typeof(asset_snapshot) = 'object'),
  execute_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'blocked', 'failed', 'canceled')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  completed_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);

create unique index cms_dam_gc_jobs_pending_asset_uidx
  on public.cms_dam_gc_jobs (asset_id) where status in ('pending', 'processing', 'blocked', 'failed');
create index cms_dam_gc_jobs_due_idx
  on public.cms_dam_gc_jobs (execute_after, id) where status in ('pending', 'failed');

create table public.cms_dam_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null,
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create table public.cms_dam_events (
  id uuid primary key default gen_random_uuid(),
  -- Historical identifiers intentionally have no FK: immutable audit events must
  -- survive asset garbage collection and account removal without being updated.
  asset_id uuid,
  actor_id uuid,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,80}$'),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index cms_dam_asset_tags_tag_idx on public.cms_dam_asset_tags (tag_id, asset_id);
create index cms_dam_collection_assets_asset_idx on public.cms_dam_collection_assets (asset_id, collection_id);
create index cms_dam_events_asset_idx on public.cms_dam_events (asset_id, occurred_at desc);
create index cms_media_rights_expiry_idx on public.cms_media_assets (rights_expires_at)
  where archived_at is null and rights_expires_at is not null;
create index cms_media_perceptual_hash_idx on public.cms_media_assets (perceptual_hash)
  where archived_at is null and perceptual_hash is not null;

create trigger cms_media_assets_ev2_touch
before update on public.cms_media_assets
for each row execute function public.cms_touch_updated_at();
create trigger cms_dam_collections_touch
before update on public.cms_dam_collections
for each row execute function public.cms_touch_updated_at();
create trigger cms_dam_tags_touch
before update on public.cms_dam_tags
for each row execute function public.cms_touch_updated_at();
create trigger cms_dam_crops_touch
before update on public.cms_dam_crops
for each row execute function public.cms_touch_updated_at();
create trigger cms_dam_gc_jobs_touch
before update on public.cms_dam_gc_jobs
for each row execute function public.cms_touch_updated_at();
create trigger cms_dam_events_immutable
before update or delete on public.cms_dam_events
for each row execute function public.cms_reject_immutable_mutation();

create function public.cms_normalize_dam_term(p_value text)
returns text language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select btrim(
    regexp_replace(
      translate(
        lower(btrim(coalesce(p_value, ''))),
        'áàâãäåéèêëíìîïóòôõöúùûüçñ',
        'aaaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

create function public.cms_dam_hamming_distance(p_left text, p_right text)
returns integer language plpgsql immutable parallel safe
set search_path = public, pg_temp
as $$
declare
  v_index integer;
  v_distance integer := 0;
begin
  if p_left !~ '^[0-9a-f]{16}$' or p_right !~ '^[0-9a-f]{16}$' then
    raise exception 'CMS_DAM_PERCEPTUAL_HASH_INVALID' using errcode = '22023';
  end if;
  for v_index in 0..7 loop
    v_distance := v_distance + bit_count(
      (get_byte(decode(p_left, 'hex'), v_index) # get_byte(decode(p_right, 'hex'), v_index))::bit(8)
    );
  end loop;
  return v_distance;
end;
$$;

create function public.cms_resolve_dam_asset(p_asset_id uuid)
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select replacement.target_asset_id
     from public.cms_dam_replacements replacement
     where replacement.source_asset_id = p_asset_id and replacement.status = 'active'
     order by replacement.created_at desc limit 1),
    p_asset_id
  );
$$;

create function public.cms_dam_asset_publishable(p_asset_id uuid, p_at timestamptz default now())
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cms_media_assets asset
    where asset.id = public.cms_resolve_dam_asset(p_asset_id)
      and asset.processing_status = 'ready'
      and asset.scan_status = 'clean'
      and asset.rights_confirmed
      and asset.archived_at is null
      and (asset.rights_expires_at is null or asset.rights_expires_at > p_at)
  );
$$;

create or replace function public.cms_block_media_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.cms_media_usages where asset_id = old.id)
     or exists (
       select 1 from public.cms_dam_replacements
       where status = 'active' and (source_asset_id = old.id or target_asset_id = old.id)
     ) then
    raise exception 'CMS_MEDIA_IN_USE' using errcode = '23503';
  end if;
  if old.archived_at is not null and old.archived_at > now() - interval '30 days' then
    raise exception 'CMS_DAM_RETENTION_ACTIVE' using errcode = '23503';
  end if;
  return old;
end;
$$;

create function public.cms_validate_dam_publication()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_asset_text text;
  v_asset_id uuid;
begin
  for v_asset_text in
    select distinct candidate.asset_id
    from (
      select media ->> 'assetId' as asset_id
      from jsonb_array_elements(coalesce(new.payload -> 'media', '[]'::jsonb)) media
      union all
      select block #>> '{data,assetId}'
      from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) block
      union all
      select block #>> '{data,mediaId}'
      from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) block
      union all
      select asset.value
      from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) block,
           lateral jsonb_array_elements_text(coalesce(block #> '{data,assetIds}', '[]'::jsonb)) asset(value)
      union all
      select item ->> 'assetId'
      from jsonb_array_elements(coalesce(new.payload -> 'blocks', '[]'::jsonb)) block,
           lateral jsonb_array_elements(coalesce(block #> '{data,items}', '[]'::jsonb)) item
      union all
      select new.seo ->> 'ogImageId'
    ) candidate
    where candidate.asset_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  loop
    v_asset_id := v_asset_text::uuid;
    if not public.cms_dam_asset_publishable(v_asset_id, coalesce(new.published_at, now())) then
      raise exception 'CMS_DAM_RIGHTS_OR_ASSET_INVALID:%', v_asset_id using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger cms_validate_dam_publication
before insert or update of payload, seo on public.cms_published_projection
for each row execute function public.cms_validate_dam_publication();

create function public.cms_execute_dam_command(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_action text,
  p_payload jsonb,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_flag jsonb;
  v_receipt public.cms_dam_command_receipts%rowtype;
  v_asset public.cms_media_assets%rowtype;
  v_collection public.cms_dam_collections%rowtype;
  v_replacement public.cms_dam_replacements%rowtype;
  v_expected bigint := coalesce((p_payload ->> 'expectedVersion')::bigint, 0);
  v_response jsonb;
  v_patch jsonb := coalesce(p_payload -> 'patch', '{}'::jsonb);
  v_name text;
  v_tag_id uuid;
  v_collection_id uuid;
  v_usage_count integer;
  v_impact jsonb;
  v_permission text;
begin
  if p_action not in (
    'update_metadata', 'upsert_collection', 'archive_collection', 'set_organization',
    'save_crop', 'archive_asset', 'restore_asset', 'activate_replacement', 'rollback_replacement'
  ) or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CMS_DAM_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_environment = 'production' then
    raise exception 'CMS_DAM_PRODUCTION_GATED' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'staging') or p_site_key <> 'main' then
    raise exception 'CMS_DAM_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  v_flag := public.cms_evaluate_feature_flag(
    p_actor_id, 'ev2.dam', p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_DAM_FEATURE_DISABLED' using errcode = '42501';
  end if;
  v_permission := case
    when p_action in ('archive_collection', 'archive_asset', 'restore_asset', 'activate_replacement', 'rollback_replacement')
      then 'cms:media.manage'
    else 'cms:media.edit'
  end;
  if not public.cms_actor_authorized(
    p_actor_id, v_permission, p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DAM_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_dam_command_receipts
    (actor_id, action, idempotency_key, command_id, request_hash, correlation_id)
  values
    (p_actor_id, p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id)
  on conflict (actor_id, action, idempotency_key) do nothing;
  if not found then
    select * into v_receipt from public.cms_dam_command_receipts
    where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DAM_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_DAM_COMMAND_IN_PROGRESS' using errcode = 'P0001';
    end if;
    return v_receipt.response;
  end if;

  if p_action = 'upsert_collection' then
    if p_payload ->> 'collectionId' is null then
      insert into public.cms_dam_collections
        (name, normalized_name, description, created_by, updated_by)
      values
        (p_payload ->> 'name', public.cms_normalize_dam_term(p_payload ->> 'name'),
         coalesce(p_payload ->> 'description', ''), p_actor_id, p_actor_id)
      returning * into v_collection;
    else
      select * into v_collection from public.cms_dam_collections
      where id = (p_payload ->> 'collectionId')::uuid for update;
      if not found then raise exception 'CMS_DAM_COLLECTION_NOT_FOUND' using errcode = 'P0001'; end if;
      if v_collection.lock_version <> v_expected then
        raise exception 'CMS_DAM_CONFLICT:%', v_collection.lock_version using errcode = 'P0001';
      end if;
      update public.cms_dam_collections set
        name = p_payload ->> 'name',
        normalized_name = public.cms_normalize_dam_term(p_payload ->> 'name'),
        description = coalesce(p_payload ->> 'description', ''),
        status = 'active', lock_version = lock_version + 1, updated_by = p_actor_id
      where id = v_collection.id returning * into v_collection;
    end if;
    v_response := jsonb_build_object('collectionId', v_collection.id, 'lockVersion', v_collection.lock_version);

  elsif p_action = 'archive_collection' then
    select * into v_collection from public.cms_dam_collections
    where id = (p_payload ->> 'collectionId')::uuid for update;
    if not found then raise exception 'CMS_DAM_COLLECTION_NOT_FOUND' using errcode = 'P0001'; end if;
    if v_collection.lock_version <> v_expected then
      raise exception 'CMS_DAM_CONFLICT:%', v_collection.lock_version using errcode = 'P0001';
    end if;
    update public.cms_dam_collections set status = 'archived', lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_collection.id returning * into v_collection;
    v_response := jsonb_build_object('collectionId', v_collection.id, 'lockVersion', v_collection.lock_version, 'status', 'archived');

  elsif p_action = 'rollback_replacement' then
    select * into v_replacement from public.cms_dam_replacements
    where id = (p_payload ->> 'replacementId')::uuid for update;
    if not found then raise exception 'CMS_DAM_REPLACEMENT_NOT_FOUND' using errcode = 'P0001'; end if;
    if v_replacement.status <> 'active' then raise exception 'CMS_DAM_REPLACEMENT_INACTIVE' using errcode = 'P0001'; end if;
    if v_replacement.lock_version <> v_expected then
      raise exception 'CMS_DAM_CONFLICT:%', v_replacement.lock_version using errcode = 'P0001';
    end if;
    update public.cms_dam_replacements set
      status = 'rolled_back', lock_version = lock_version + 1,
      rolled_back_by = p_actor_id, rolled_back_at = now()
    where id = v_replacement.id returning * into v_replacement;
    update public.cms_media_assets set lock_version = lock_version + 1
    where id = v_replacement.source_asset_id;
    v_response := jsonb_build_object('replacementId', v_replacement.id, 'lockVersion', v_replacement.lock_version, 'status', 'rolled_back');

  else
    select * into v_asset from public.cms_media_assets
    where id = (p_payload ->> coalesce(
      case when p_action = 'activate_replacement' then 'sourceAssetId' else 'assetId' end,
      'assetId'
    ))::uuid for update;
    if not found then raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001'; end if;
    if v_asset.lock_version <> v_expected then
      raise exception 'CMS_DAM_CONFLICT:%', v_asset.lock_version using errcode = 'P0001';
    end if;

    if p_action = 'update_metadata' then
      update public.cms_media_assets set
        original_filename = case when v_patch ? 'originalFilename' then v_patch ->> 'originalFilename' else original_filename end,
        source_reference = case when v_patch ? 'sourceReference' then v_patch ->> 'sourceReference' else source_reference end,
        rights_expires_at = case when v_patch ? 'rightsExpiresAt' then (v_patch ->> 'rightsExpiresAt')::timestamptz else rights_expires_at end,
        license_name = case when v_patch ? 'licenseName' then v_patch ->> 'licenseName' else license_name end,
        owner_name = case when v_patch ? 'ownerName' then v_patch ->> 'ownerName' else owner_name end,
        alt_text = case when v_patch ? 'altText' then v_patch ->> 'altText' else alt_text end,
        caption = case when v_patch ? 'caption' then v_patch ->> 'caption' else caption end,
        credit = case when v_patch ? 'credit' then v_patch ->> 'credit' else credit end,
        focal_x = case when v_patch ? 'focalX' then (v_patch ->> 'focalX')::numeric else focal_x end,
        focal_y = case when v_patch ? 'focalY' then (v_patch ->> 'focalY')::numeric else focal_y end,
        lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      v_response := jsonb_build_object('assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', v_asset.processing_status);

    elsif p_action = 'set_organization' then
      if exists (
        select 1 from jsonb_array_elements_text(coalesce(p_payload -> 'collectionIds', '[]'::jsonb)) supplied(value)
        where not exists (
          select 1 from public.cms_dam_collections collection
          where collection.id = supplied.value::uuid and collection.status = 'active'
        )
      ) then raise exception 'CMS_DAM_COLLECTION_INVALID' using errcode = 'P0001'; end if;
      delete from public.cms_dam_collection_assets where asset_id = v_asset.id;
      for v_collection_id in
        select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload -> 'collectionIds', '[]'::jsonb)) supplied(value)
      loop
        insert into public.cms_dam_collection_assets (collection_id, asset_id, created_by)
        values (v_collection_id, v_asset.id, p_actor_id);
      end loop;
      delete from public.cms_dam_asset_tags where asset_id = v_asset.id;
      for v_name in
        select distinct btrim(value) from jsonb_array_elements_text(coalesce(p_payload -> 'tags', '[]'::jsonb)) supplied(value)
        where btrim(value) <> ''
      loop
        insert into public.cms_dam_tags (name, normalized_name, created_by)
        values (v_name, public.cms_normalize_dam_term(v_name), p_actor_id)
        on conflict (normalized_name) do update set name = excluded.name
        returning id into v_tag_id;
        insert into public.cms_dam_asset_tags (asset_id, tag_id, created_by)
        values (v_asset.id, v_tag_id, p_actor_id) on conflict do nothing;
      end loop;
      update public.cms_media_assets set lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      v_response := jsonb_build_object('assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', v_asset.processing_status);

    elsif p_action = 'save_crop' then
      if v_asset.processing_status <> 'ready' or v_asset.archived_at is not null then
        raise exception 'CMS_DAM_CROP_ASSET_INVALID' using errcode = 'P0001';
      end if;
      insert into public.cms_dam_crops
        (asset_id, crop_key, label, aspect_width, aspect_height, crop_x, crop_y, crop_width, crop_height,
         focal_x, focal_y, created_by, updated_by)
      values
        (v_asset.id, p_payload #>> '{crop,cropKey}', p_payload #>> '{crop,label}',
         (p_payload #>> '{crop,aspectWidth}')::integer, (p_payload #>> '{crop,aspectHeight}')::integer,
         (p_payload #>> '{crop,x}')::numeric, (p_payload #>> '{crop,y}')::numeric,
         (p_payload #>> '{crop,width}')::numeric, (p_payload #>> '{crop,height}')::numeric,
         (p_payload #>> '{crop,focalX}')::numeric, (p_payload #>> '{crop,focalY}')::numeric,
         p_actor_id, p_actor_id)
      on conflict (asset_id, crop_key) do update set
        label = excluded.label, aspect_width = excluded.aspect_width, aspect_height = excluded.aspect_height,
        crop_x = excluded.crop_x, crop_y = excluded.crop_y, crop_width = excluded.crop_width,
        crop_height = excluded.crop_height, focal_x = excluded.focal_x, focal_y = excluded.focal_y,
        updated_by = excluded.updated_by;
      update public.cms_media_assets set lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      v_response := jsonb_build_object('assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', v_asset.processing_status);

    elsif p_action = 'archive_asset' then
      if v_asset.archived_at is not null then raise exception 'CMS_DAM_ASSET_ALREADY_ARCHIVED' using errcode = 'P0001'; end if;
      if exists (select 1 from public.cms_media_usages where asset_id = v_asset.id)
         or exists (select 1 from public.cms_dam_replacements where status = 'active' and (source_asset_id = v_asset.id or target_asset_id = v_asset.id)) then
        raise exception 'CMS_MEDIA_IN_USE' using errcode = 'P0001';
      end if;
      update public.cms_media_assets set archived_at = now(), archived_by = p_actor_id, lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      insert into public.cms_dam_gc_jobs (asset_id, asset_snapshot, execute_after, created_by)
      values (
        v_asset.id,
        jsonb_build_object(
          'assetId', v_asset.id,
          'storagePath', v_asset.storage_path,
          'sha256', v_asset.sha256,
          'paths', jsonb_build_array(v_asset.storage_path) || coalesce(
            (select jsonb_agg(variant.transform_path order by variant.transform_path)
             from public.cms_media_variants variant where variant.asset_id = v_asset.id),
            '[]'::jsonb
          )
        ),
        now() + interval '30 days', p_actor_id
      ) on conflict (asset_id) where status in ('pending', 'processing', 'blocked', 'failed') do nothing;
      v_response := jsonb_build_object('assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', 'archived', 'gcAfter', v_asset.archived_at + interval '30 days');

    elsif p_action = 'restore_asset' then
      if v_asset.archived_at is null then raise exception 'CMS_DAM_ASSET_NOT_ARCHIVED' using errcode = 'P0001'; end if;
      update public.cms_media_assets set archived_at = null, archived_by = null, lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      update public.cms_dam_gc_jobs set status = 'canceled'
      where asset_id = v_asset.id and status in ('pending', 'failed', 'blocked');
      v_response := jsonb_build_object('assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', v_asset.processing_status);

    elsif p_action = 'activate_replacement' then
      if v_asset.processing_status <> 'ready' or v_asset.archived_at is not null then
        raise exception 'CMS_DAM_REPLACEMENT_SOURCE_INVALID' using errcode = 'P0001';
      end if;
      if not public.cms_dam_asset_publishable((p_payload ->> 'targetAssetId')::uuid, now()) then
        raise exception 'CMS_DAM_REPLACEMENT_TARGET_INVALID' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.cms_dam_replacements where status = 'active'
          and (source_asset_id in (v_asset.id, (p_payload ->> 'targetAssetId')::uuid)
            or target_asset_id in (v_asset.id, (p_payload ->> 'targetAssetId')::uuid))
      ) then raise exception 'CMS_DAM_REPLACEMENT_CHAIN_FORBIDDEN' using errcode = 'P0001'; end if;
      select count(*)::integer into v_usage_count from public.cms_media_usages where asset_id = v_asset.id;
      select jsonb_build_object(
        'usageCount', v_usage_count,
        'usages', coalesce(jsonb_agg(jsonb_build_object(
          'itemId', usage.item_id, 'revisionId', usage.revision_id, 'blockId', usage.block_id,
          'usageKind', usage.usage_kind, 'createdAt', usage.created_at
        )) filter (where usage.id is not null), '[]'::jsonb)
      ) into v_impact from public.cms_media_usages usage where usage.asset_id = v_asset.id;
      insert into public.cms_dam_replacements
        (source_asset_id, target_asset_id, impact_snapshot, reason, created_by, correlation_id)
      values
        (v_asset.id, (p_payload ->> 'targetAssetId')::uuid, v_impact, p_payload ->> 'reason', p_actor_id, p_correlation_id)
      returning * into v_replacement;
      -- O estado físico permanece ready para os validadores v1; a relação ativa é a fonte
      -- canônica do estado lógico "replaced" e o resolver público aplica o destino.
      update public.cms_media_assets set lock_version = lock_version + 1
      where id = v_asset.id returning * into v_asset;
      v_response := jsonb_build_object(
        'assetId', v_asset.id, 'lockVersion', v_asset.lock_version, 'status', 'replaced',
        'replacementId', v_replacement.id, 'replacementVersion', v_replacement.lock_version,
        'usageCount', v_usage_count
      );
    end if;
  end if;

  insert into public.cms_dam_events (asset_id, actor_id, event_type, event_data, correlation_id)
  values (
    case
      when p_action = 'rollback_replacement' then v_replacement.source_asset_id
      when p_action in ('upsert_collection', 'archive_collection') then null
      else v_asset.id
    end,
    p_actor_id, p_action, p_payload - 'patch', p_correlation_id
  );
  v_response := jsonb_build_object(
    'schemaVersion', 1, 'commandId', p_command_id, 'correlationId', p_correlation_id
  ) || coalesce(v_response, '{}'::jsonb);
  update public.cms_dam_command_receipts set response = v_response, completed_at = now()
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

create function public.cms_finalize_dam_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_detected_mime text,
  p_byte_size bigint,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_variants jsonb,
  p_correlation_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.cms_media_assets%rowtype;
  v_variant_count integer;
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:media.upload', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DAM_FORBIDDEN' using errcode = '42501';
  end if;
  if p_detected_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif')
     or p_byte_size not between 1 and 20971520
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_width not between 1 and 20000
     or p_height not between 1 and 20000
     or p_width::bigint * p_height::bigint > 80000000
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) <> 6 then
    raise exception 'CMS_DAM_FINALIZATION_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_variants) as variant(
      variant_key text, format text, width integer, height integer, transform_path text
    )
    where variant.variant_key not in ('thumbnail', 'medium', 'large')
       or variant.format not in ('webp', 'avif')
       or variant.width not between 1 and p_width
       or variant.height not between 1 and p_height
       or variant.width::bigint * variant.height::bigint > 80000000
       or variant.transform_path <> 'cms/' || p_asset_id::text || '/' || variant.variant_key || '.' || variant.format
  ) then
    raise exception 'CMS_DAM_VARIANT_INVALID' using errcode = '22023';
  end if;

  select * into v_asset from public.cms_media_assets where id = p_asset_id for update;
  if not found then raise exception 'CMS_DAM_ASSET_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_asset.reservation_hash is null
     or (
       v_asset.created_by <> p_actor_id
       and not public.cms_actor_authorized(
         p_actor_id, 'cms:media.manage', p_aal, p_session_id, p_issued_at
       )
     ) then
    raise exception 'CMS_DAM_FINALIZATION_OWNER_INVALID' using errcode = '42501';
  end if;
  if v_asset.processing_status = 'ready' then
    select count(*)::integer into v_variant_count from public.cms_media_variants where asset_id = p_asset_id;
    return jsonb_build_object(
      'assetId', v_asset.id, 'status', 'ready', 'sha256', v_asset.sha256,
      'width', v_asset.width, 'height', v_asset.height, 'variants', v_variant_count, 'replayed', true
    );
  end if;
  if v_asset.processing_status not in ('awaiting_upload', 'processing', 'failed')
     or v_asset.declared_mime <> p_detected_mime then
    raise exception 'CMS_DAM_FINALIZATION_CLOSED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cms_media_assets
    where sha256 = p_sha256 and id <> p_asset_id and archived_at is null
  ) then
    raise exception 'CMS_DAM_DUPLICATE' using errcode = '23505';
  end if;

  insert into public.cms_media_variants (asset_id, variant_key, format, width, height, transform_path)
  select p_asset_id, variant.variant_key, variant.format, variant.width, variant.height, variant.transform_path
  from jsonb_to_recordset(p_variants) as variant(
    variant_key text, format text, width integer, height integer, transform_path text
  )
  on conflict (asset_id, variant_key, format) do update set
    width = excluded.width,
    height = excluded.height,
    transform_path = excluded.transform_path;
  select count(*)::integer into v_variant_count from public.cms_media_variants where asset_id = p_asset_id;
  if v_variant_count <> 6 then
    raise exception 'CMS_DAM_VARIANT_SET_INCOMPLETE' using errcode = '23514';
  end if;

  update public.cms_media_assets set
    detected_mime = p_detected_mime,
    byte_size = p_byte_size,
    sha256 = p_sha256,
    width = p_width,
    height = p_height,
    processing_status = 'ready',
    scan_status = 'clean',
    scan_engine = 'raster-signature-v2',
    processed_at = now(),
    lock_version = lock_version + 1
  where id = p_asset_id returning * into v_asset;
  insert into public.cms_audit_log
    (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (
    p_actor_id, 'cms:media.finalize', 'media_asset', p_asset_id::text,
    jsonb_build_object('sha256', p_sha256, 'variants', v_variant_count), p_correlation_id
  );
  insert into public.cms_dam_events (asset_id, actor_id, event_type, event_data, correlation_id)
  values (
    p_asset_id, p_actor_id, 'finalize_upload',
    jsonb_build_object('sha256', p_sha256, 'variants', v_variant_count), p_correlation_id
  );
  return jsonb_build_object(
    'assetId', v_asset.id, 'status', 'ready', 'sha256', v_asset.sha256,
    'width', v_asset.width, 'height', v_asset.height, 'variants', v_variant_count, 'replayed', false
  );
end;
$$;

create function public.cms_prepare_dam_gc(p_job_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.cms_dam_gc_jobs%rowtype;
  v_asset public.cms_media_assets%rowtype;
begin
  select * into v_job from public.cms_dam_gc_jobs where id = p_job_id for update;
  if not found or v_job.status not in ('pending', 'failed', 'processing', 'blocked') or v_job.execute_after > now() then
    raise exception 'CMS_DAM_GC_JOB_INVALID' using errcode = 'P0001';
  end if;
  if v_job.asset_id is null then
    update public.cms_dam_gc_jobs set status = 'processing', attempts = attempts + 1 where id = v_job.id;
    return v_job.asset_snapshot;
  end if;
  select * into v_asset from public.cms_media_assets where id = v_job.asset_id for update;
  if not found then
    update public.cms_dam_gc_jobs set asset_id = null, status = 'processing', attempts = attempts + 1 where id = v_job.id;
    return v_job.asset_snapshot;
  end if;
  if v_asset.archived_at is null or v_asset.archived_at > now() - interval '30 days'
     or exists (select 1 from public.cms_media_usages where asset_id = v_asset.id)
     or exists (select 1 from public.cms_dam_replacements where status = 'active' and (source_asset_id = v_asset.id or target_asset_id = v_asset.id)) then
    raise exception 'CMS_DAM_GC_ASSET_BLOCKED' using errcode = 'P0001';
  end if;
  delete from public.cms_dam_collection_assets where asset_id = v_asset.id;
  delete from public.cms_dam_asset_tags where asset_id = v_asset.id;
  delete from public.cms_dam_crops where asset_id = v_asset.id;
  delete from public.cms_media_assets where id = v_asset.id;
  update public.cms_dam_gc_jobs set status = 'processing', attempts = attempts + 1 where id = v_job.id;
  return v_job.asset_snapshot;
end;
$$;

alter table public.cms_dam_collections enable row level security;
alter table public.cms_dam_tags enable row level security;
alter table public.cms_dam_collection_assets enable row level security;
alter table public.cms_dam_asset_tags enable row level security;
alter table public.cms_dam_crops enable row level security;
alter table public.cms_dam_replacements enable row level security;
alter table public.cms_dam_gc_jobs enable row level security;
alter table public.cms_dam_command_receipts enable row level security;
alter table public.cms_dam_events enable row level security;

create policy cms_dam_collections_authorized_read on public.cms_dam_collections
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_tags_authorized_read on public.cms_dam_tags
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_collection_assets_authorized_read on public.cms_dam_collection_assets
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_asset_tags_authorized_read on public.cms_dam_asset_tags
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_crops_authorized_read on public.cms_dam_crops
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_replacements_authorized_read on public.cms_dam_replacements
for select to authenticated using (public.cms_has_permission('cms:media.read'));
create policy cms_dam_gc_jobs_authorized_read on public.cms_dam_gc_jobs
for select to authenticated using (public.cms_has_permission('cms:media.manage'));
create policy cms_dam_receipts_own_read on public.cms_dam_command_receipts
for select to authenticated using (actor_id = auth.uid());
create policy cms_dam_events_authorized_read on public.cms_dam_events
for select to authenticated using (public.cms_has_permission('cms:media.read'));

revoke all on table
  public.cms_dam_collections, public.cms_dam_tags, public.cms_dam_collection_assets,
  public.cms_dam_asset_tags, public.cms_dam_crops, public.cms_dam_replacements,
  public.cms_dam_gc_jobs, public.cms_dam_command_receipts, public.cms_dam_events
from public, anon, authenticated;
grant select on table
  public.cms_dam_collections, public.cms_dam_tags, public.cms_dam_collection_assets,
  public.cms_dam_asset_tags, public.cms_dam_crops, public.cms_dam_replacements,
  public.cms_dam_events
to authenticated;
grant select on table public.cms_dam_gc_jobs to authenticated;
grant select on table public.cms_dam_command_receipts to authenticated;
grant all on table
  public.cms_dam_collections, public.cms_dam_tags, public.cms_dam_collection_assets,
  public.cms_dam_asset_tags, public.cms_dam_crops, public.cms_dam_replacements,
  public.cms_dam_gc_jobs, public.cms_dam_command_receipts, public.cms_dam_events
to service_role;

revoke all on function public.cms_normalize_dam_term(text) from public, anon, authenticated;
revoke all on function public.cms_dam_hamming_distance(text, text) from public, anon, authenticated;
revoke all on function public.cms_resolve_dam_asset(uuid) from public, anon, authenticated;
revoke all on function public.cms_dam_asset_publishable(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.cms_validate_dam_publication() from public, anon, authenticated;
revoke all on function public.cms_execute_dam_command(uuid, text, text, text, text, timestamptz, text, jsonb, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.cms_finalize_dam_asset(uuid, uuid, text, bigint, text, integer, integer, jsonb, uuid, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.cms_prepare_dam_gc(uuid) from public, anon, authenticated;

grant execute on function public.cms_resolve_dam_asset(uuid) to service_role;
grant execute on function public.cms_dam_asset_publishable(uuid, timestamptz) to service_role;
grant execute on function public.cms_execute_dam_command(uuid, text, text, text, text, timestamptz, text, jsonb, uuid, uuid, text, uuid)
to service_role;
grant execute on function public.cms_finalize_dam_asset(uuid, uuid, text, bigint, text, integer, integer, jsonb, uuid, text, text, timestamptz)
to service_role;
grant execute on function public.cms_prepare_dam_gc(uuid) to service_role;
