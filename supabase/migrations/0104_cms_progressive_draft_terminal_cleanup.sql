-- Fecha o rascunho progressivo privado de uma fixture QA quando a lease termina.
-- A compensacao nunca apaga historico: o draft vira discarded e recebe um
-- evento imutavel. A fronteira permanece owner-only e vinculada ao marcador
-- exato (ator, run, SHA e ambiente).

begin;

create or replace function private.cms_compensate_qa_progressive_drafts_0104(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text,
  p_terminal_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_draft_ids uuid[];
  v_discarded integer := 0;
  v_claims_sha text;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null
     or p_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or p_candidate_sha !~ '^[0-9a-f]{40}$'
     or right(p_run_tag, 9) <> ('-' || left(p_candidate_sha, 8))
     or p_environment not in ('staging', 'production')
     or p_terminal_status not in ('cleaned', 'expired') then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_INPUT_INVALID' using errcode = '22023';
  end if;

  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
  for update;

  if not found
     or v_lease.run_tag is distinct from p_run_tag
     or v_lease.candidate_sha is distinct from p_candidate_sha
     or v_lease.environment is distinct from p_environment
     or v_lease.status not in ('active', p_terminal_status)
     or not private.cms_qa_actor_marker_is_exact(
       v_lease.actor_id,
       v_lease.run_tag,
       v_lease.candidate_sha,
       v_lease.environment
     ) then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_LEASE_MISMATCH' using errcode = '42501';
  end if;

  select coalesce(array_agg(draft.id order by draft.id), '{}'::uuid[])
  into v_draft_ids
  from public.cms_content_drafts_v2 draft
  where draft.created_by = p_actor_id
    and draft.status = 'active';

  if cardinality(v_draft_ids) = 0 then
    return jsonb_build_object(
      'schemaVersion', 1,
      'status', 'noop',
      'discardedDrafts', 0,
      'terminalStatus', p_terminal_status
    );
  end if;

  perform 1
  from public.cms_content_drafts_v2 draft
  where draft.id = any(v_draft_ids)
  order by draft.id
  for update;

  if exists (
    select 1
    from public.cms_content_drafts_v2 draft
    where draft.id = any(v_draft_ids)
      and (
        draft.site_key <> 'main'
        or draft.environment <> p_environment
        or draft.created_by <> p_actor_id
        or draft.created_at not between v_lease.created_at and v_lease.expires_at
        or draft.discarded_at is not null
        or draft.promoted_at is not null
        or draft.promoted_item_id is not null
        or not (
          draft.updated_by = p_actor_id
          or exists (
            select 1
            from private.cms_qa_actor_leases updater
            where updater.actor_id = draft.updated_by
              and updater.run_tag = p_run_tag
              and updater.candidate_sha = p_candidate_sha
              and updater.environment = p_environment
              and private.cms_qa_actor_marker_is_exact(
                updater.actor_id,
                updater.run_tag,
                updater.candidate_sha,
                updater.environment
              )
          )
        )
      )
  ) then
    raise exception 'CMS_QA_DRAFT_V2_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(string_agg(draft.id::text, ':' order by draft.id), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_claims_sha
  from public.cms_content_drafts_v2 draft
  where draft.id = any(v_draft_ids);

  with changed as (
    update public.cms_content_drafts_v2 draft
    set status = 'discarded',
        discarded_at = v_now,
        lock_version = draft.lock_version + 1,
        updated_by = p_actor_id,
        correlation_id = pg_catalog.gen_random_uuid()
    where draft.id = any(v_draft_ids)
      and draft.created_by = p_actor_id
      and draft.status = 'active'
    returning
      draft.id,
      draft.lock_version - 1 as from_version,
      draft.lock_version as to_version,
      draft.fields_hash,
      draft.correlation_id
  ), appended as (
    insert into public.cms_draft_v2_events (
      draft_id,
      actor_id,
      event_type,
      from_version,
      to_version,
      changed_fields,
      fields_hash,
      correlation_id,
      occurred_at
    )
    select
      changed.id,
      p_actor_id,
      'discarded',
      changed.from_version,
      changed.to_version,
      '["status"]'::jsonb,
      changed.fields_hash,
      changed.correlation_id,
      v_now
    from changed
    returning draft_id
  )
  select count(*)::integer into v_discarded from appended;

  if v_discarded <> cardinality(v_draft_ids)
     or exists (
       select 1
       from public.cms_content_drafts_v2 draft
       where draft.id = any(v_draft_ids)
         and draft.status = 'active'
     ) then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:qa.progressive_drafts.compensated',
    'qa_fixture',
    p_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'discardedDrafts', v_discarded,
      'claimsSha256', v_claims_sha,
      'environment', p_environment,
      'candidateSha', p_candidate_sha,
      'terminalStatus', p_terminal_status
    ),
    pg_catalog.gen_random_uuid()
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', 'compensated',
    'discardedDrafts', v_discarded,
    'claimsSha256', v_claims_sha,
    'terminalStatus', p_terminal_status
  );
end;
$$;

revoke all on function private.cms_compensate_qa_progressive_drafts_0104(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function private.cms_cleanup_terminal_progressive_drafts_0104()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active'
     and new.status in ('cleaned', 'expired')
     and new.status <> old.status then
    perform private.cms_compensate_qa_progressive_drafts_0104(
      old.actor_id,
      old.run_tag,
      old.candidate_sha,
      old.environment,
      new.status
    );
  end if;
  return new;
end;
$$;

revoke all on function private.cms_cleanup_terminal_progressive_drafts_0104()
  from public, anon, authenticated, service_role;

drop trigger if exists cms_01_progressive_draft_terminal_cleanup_0104
  on private.cms_qa_actor_leases;
create trigger cms_01_progressive_draft_terminal_cleanup_0104
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_progressive_drafts_0104();

-- Repara apenas leases que ja eram terminais antes desta funcao existir.
-- Atores ainda ativos nunca sao antecipados nem assumidos como abandonados.
do $progressive_draft_terminal_backfill$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  for v_lease in
    select lease.*
    from private.cms_qa_actor_leases lease
    where lease.status in ('cleaned', 'expired')
      and exists (
        select 1
        from public.cms_content_drafts_v2 draft
        where draft.created_by = lease.actor_id
          and draft.status = 'active'
      )
    order by lease.actor_id
  loop
    perform private.cms_compensate_qa_progressive_drafts_0104(
      v_lease.actor_id,
      v_lease.run_tag,
      v_lease.candidate_sha,
      v_lease.environment,
      v_lease.status
    );
  end loop;
end;
$progressive_draft_terminal_backfill$;

do $progressive_draft_terminal_probe$
declare
  v_compensate regprocedure := to_regprocedure(
    'private.cms_compensate_qa_progressive_drafts_0104(uuid,text,text,text,text)'
  );
  v_trigger_function regprocedure := to_regprocedure(
    'private.cms_cleanup_terminal_progressive_drafts_0104()'
  );
begin
  if v_compensate is null or v_trigger_function is null then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_FUNCTION_MISSING' using errcode = '55000';
  end if;
  if has_function_privilege('anon', v_compensate, 'EXECUTE')
     or has_function_privilege('authenticated', v_compensate, 'EXECUTE')
     or has_function_privilege('service_role', v_compensate, 'EXECUTE')
     or has_function_privilege('anon', v_trigger_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_trigger_function, 'EXECUTE')
     or has_function_privilege('service_role', v_trigger_function, 'EXECUTE') then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_ACL_INVALID' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'private.cms_qa_actor_leases'::regclass
      and trigger.tgname = 'cms_01_progressive_draft_terminal_cleanup_0104'
      and trigger.tgfoid = v_trigger_function::oid
      and trigger.tgenabled = 'O'
      and not trigger.tgisinternal
  ) then
    raise exception 'CMS_QA_DRAFT_V2_CLEANUP_TRIGGER_INVALID' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.cms_content_drafts_v2 draft
    join private.cms_qa_actor_leases lease on lease.actor_id = draft.created_by
    where draft.status = 'active'
      and lease.status in ('cleaned', 'expired')
      and private.cms_qa_actor_marker_is_exact(
        lease.actor_id,
        lease.run_tag,
        lease.candidate_sha,
        lease.environment
      )
  ) then
    raise exception 'CMS_QA_DRAFT_V2_TERMINAL_RESIDUE_PRESENT' using errcode = '55000';
  end if;
end;
$progressive_draft_terminal_probe$;

commit;
