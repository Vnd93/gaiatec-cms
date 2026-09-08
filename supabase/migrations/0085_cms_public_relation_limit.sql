-- Fail closed at the publication boundary instead of silently truncating the
-- relation graph consumed by cms-public. The limit applies to the distinct
-- UUIDs aggregated from top-level relations and related_content blocks.

create or replace function private.cms_public_relation_ids_0085(p_payload jsonb)
returns table(relation_id uuid)
language plpgsql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_relation_array jsonb;
  v_candidate jsonb;
  v_block jsonb;
  v_raw text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
  end if;

  if p_payload ? 'relations' then
    if jsonb_typeof(p_payload -> 'relations') is distinct from 'object' then
      raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
    end if;
    for v_relation_array in
      select value from jsonb_each(p_payload -> 'relations')
    loop
      if jsonb_typeof(v_relation_array) is distinct from 'array' then
        raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
      end if;
      for v_candidate in select value from jsonb_array_elements(v_relation_array)
      loop
        if jsonb_typeof(v_candidate) is distinct from 'string' then
          raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
        end if;
        v_raw := v_candidate #>> '{}';
        if v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
        end if;
        relation_id := v_raw::uuid;
        return next;
      end loop;
    end loop;
  end if;

  if p_payload ? 'blocks' then
    if jsonb_typeof(p_payload -> 'blocks') is distinct from 'array' then
      raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
    end if;
    for v_block in select value from jsonb_array_elements(p_payload -> 'blocks')
    loop
      if jsonb_typeof(v_block) is distinct from 'object' then
        raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
      end if;
      if v_block ->> 'type' = 'related_content'
         and v_block #> '{data,itemIds}' is not null then
        v_relation_array := v_block #> '{data,itemIds}';
        if jsonb_typeof(v_relation_array) is distinct from 'array' then
          raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
        end if;
        for v_candidate in select value from jsonb_array_elements(v_relation_array)
        loop
          if jsonb_typeof(v_candidate) is distinct from 'string' then
            raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
          end if;
          v_raw := v_candidate #>> '{}';
          if v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
            raise exception 'CMS_PUBLIC_RELATION_INVALID' using errcode = '23514';
          end if;
          relation_id := v_raw::uuid;
          return next;
        end loop;
      end if;
    end loop;
  end if;
end;
$$;

create or replace function private.cms_public_relation_count_0085(p_payload jsonb)
returns integer
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(distinct relation_id)::integer
  from private.cms_public_relation_ids_0085(p_payload)
$$;

create or replace function private.cms_enforce_public_relation_limit_0085()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if private.cms_public_relation_count_0085(new.payload) > 500 then
    raise exception 'CMS_PUBLIC_RELATION_LIMIT_EXCEEDED' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.cms_public_relation_ids_0085(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_public_relation_count_0085(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_enforce_public_relation_limit_0085()
  from public, anon, authenticated, service_role;

-- Install the central write gate before auditing legacy rows. CREATE TRIGGER's
-- table lock closes the scan/install race for individual, release, scheduled,
-- restore and rollback publication paths, which all write this projection.
drop trigger if exists cms_00_enforce_public_relation_limit_0085
  on public.cms_published_projection;
create trigger cms_00_enforce_public_relation_limit_0085
before insert or update of payload on public.cms_published_projection
for each row execute function private.cms_enforce_public_relation_limit_0085();

-- Existing rows must satisfy the same invariant in the installation
-- transaction. A malformed or oversized projection aborts the migration.
do $$
declare
  v_projection record;
begin
  for v_projection in
    select projection.payload
    from public.cms_published_projection projection
    order by projection.item_id
  loop
    if private.cms_public_relation_count_0085(v_projection.payload) > 500 then
      raise exception 'CMS_PUBLIC_RELATION_LIMIT_EXCEEDED' using errcode = '23514';
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regprocedure('private.cms_public_relation_ids_0085(jsonb)') is null
     or to_regprocedure('private.cms_public_relation_count_0085(jsonb)') is null
     or to_regprocedure('private.cms_enforce_public_relation_limit_0085()') is null
     or has_function_privilege(
       'service_role','private.cms_public_relation_ids_0085(jsonb)','execute'
     )
     or has_function_privilege(
       'authenticated','private.cms_public_relation_ids_0085(jsonb)','execute'
     )
     or has_function_privilege(
       'anon','private.cms_public_relation_ids_0085(jsonb)','execute'
     )
     or not exists (
       select 1 from pg_catalog.pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.cms_published_projection'::regclass
         and trigger_row.tgname = 'cms_00_enforce_public_relation_limit_0085'
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled = 'O'
     ) then
    raise exception 'CMS_PUBLIC_RELATION_GATE_INCOMPLETE';
  end if;
end;
$$;
