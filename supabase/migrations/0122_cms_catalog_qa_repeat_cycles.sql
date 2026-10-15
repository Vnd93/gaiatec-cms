-- CLI-generated migration, numbered to the canonical four-digit inventory.
-- A release may have successive QA cycles only after verified compensation.
-- Closed manifests/leases stay historical; no actor can join another manifest.
begin;
set local lock_timeout='5s';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));

create unique index cms_catalog_qa_recovery_open_cycle_uidx
  on private.cms_catalog_qa_recovery(run_tag,candidate_sha,environment)
  where state<>'cleaned';
create unique index cms_catalog_qa_recovery_actor_once_uidx
  on private.cms_catalog_qa_recovery_actors(actor_id);
alter table private.cms_catalog_qa_recovery
  drop constraint cms_catalog_qa_recovery_run_tag_candidate_sha_environment_key;

create or replace function private.cms_catalog_qa_terminal_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_manifest uuid; v_previous text:=current_setting('cms.catalog_terminal_actor',true);
begin
  if old.status='active' and new.status in ('cleaned','expired') and old.environment='staging' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));
    -- Never choose a historical manifest merely because its release tag matches.
    select m.manifest_id into strict v_manifest
      from private.cms_catalog_qa_recovery m
      join private.cms_catalog_qa_recovery_actors a using(manifest_id)
      where a.actor_id=old.actor_id and a.lease_created_at=old.created_at
        and a.lease_expires_at=old.expires_at and m.run_tag=old.run_tag
        and m.candidate_sha=old.candidate_sha and m.environment=old.environment
        and m.state='prepared';
    if not exists(select 1 from private.cms_qa_actor_leases
      where run_tag=old.run_tag and candidate_sha=old.candidate_sha and environment=old.environment
        and status='active' and actor_id<>old.actor_id) then
      perform set_config('cms.catalog_terminal_actor',old.actor_id::text,true);
      perform private.cms_catalog_compensate_qa_recovery(v_manifest);
      perform set_config('cms.catalog_terminal_actor',coalesce(v_previous,''),true);
    end if;
  end if;
  return new;
exception when no_data_found then
  -- Actors retired before catalog enrollment have no catalog state to recover.
  -- Any enrolled actor missing its exact prepared binding must fail closed.
  if exists(select 1 from private.cms_catalog_qa_recovery_actors where actor_id=old.actor_id) then
    raise exception 'CMS_CATALOG_RECOVERY_TERMINAL_BINDING_MISMATCH' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.cms_catalog_qa_terminal_recovery() from public,anon,authenticated,service_role;
commit;
