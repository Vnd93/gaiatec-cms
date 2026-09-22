begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(29);

select has_function(
  'private',
  'cms_compensate_qa_progressive_drafts_0104',
  array['uuid', 'text', 'text', 'text', 'text'],
  'the owner-only progressive draft compensator exists'
);
select has_function(
  'private',
  'cms_cleanup_terminal_progressive_drafts_0104',
  array[]::text[],
  'the terminal lease trigger function exists'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'cms_01_progressive_draft_terminal_cleanup_0104',
  'the progressive draft cleanup runs in the ordered terminal lane'
);

select isnt(
  has_function_privilege(
    'anon',
    'private.cms_compensate_qa_progressive_drafts_0104(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the compensator'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'private.cms_compensate_qa_progressive_drafts_0104(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot execute the compensator'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_compensate_qa_progressive_drafts_0104(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'the Edge service role cannot execute the internal compensator'
);
select isnt(
  has_function_privilege(
    'anon',
    'private.cms_cleanup_terminal_progressive_drafts_0104()',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the trigger function'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'private.cms_cleanup_terminal_progressive_drafts_0104()',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot execute the trigger function'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_cleanup_terminal_progressive_drafts_0104()',
    'EXECUTE'
  ),
  true,
  'the Edge service role cannot execute the trigger function'
);
select ok(
  (
    select procedure.prosecdef
      and 'search_path=""' = any(coalesce(procedure.proconfig, array[]::text[]))
    from pg_catalog.pg_proc procedure
    where procedure.oid = to_regprocedure(
      'private.cms_compensate_qa_progressive_drafts_0104(uuid,text,text,text,text)'
    )
  ),
  'the compensator is SECURITY DEFINER with an empty search path'
);
select ok(
  (
    select procedure.prosecdef
      and 'search_path=""' = any(coalesce(procedure.proconfig, array[]::text[]))
    from pg_catalog.pg_proc procedure
    where procedure.oid = to_regprocedure(
      'private.cms_cleanup_terminal_progressive_drafts_0104()'
    )
  ),
  'the trigger function is SECURITY DEFINER with an empty search path'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1040000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-draft-terminal-owner@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260921-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    'a1040000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-draft-terminal-peer@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260921-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    'a1040000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-draft-terminal-refused@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260921-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    'a1040000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-draft-owner@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}',
    now(), now()
  );

insert into public.cms_content_drafts_v2 (
  id, environment, content_type, working_title, created_by, updated_by, correlation_id
) values
  (
    'a1040000-0000-4000-8000-000000000101', 'staging', 'post',
    'QA progressive terminal owner',
    'a1040000-0000-4000-8000-000000000001',
    'a1040000-0000-4000-8000-000000000001',
    'a1040000-0000-4000-8000-000000000201'
  ),
  (
    'a1040000-0000-4000-8000-000000000102', 'staging', 'page',
    'QA progressive terminal same-run peer',
    'a1040000-0000-4000-8000-000000000001',
    'a1040000-0000-4000-8000-000000000002',
    'a1040000-0000-4000-8000-000000000202'
  ),
  (
    'a1040000-0000-4000-8000-000000000103', 'staging', 'post',
    'QA progressive active peer',
    'a1040000-0000-4000-8000-000000000002',
    'a1040000-0000-4000-8000-000000000002',
    'a1040000-0000-4000-8000-000000000203'
  ),
  (
    'a1040000-0000-4000-8000-000000000104', 'staging', 'post',
    'Ordinary progressive active draft',
    'a1040000-0000-4000-8000-000000000004',
    'a1040000-0000-4000-8000-000000000004',
    'a1040000-0000-4000-8000-000000000204'
  ),
  (
    'a1040000-0000-4000-8000-000000000105', 'staging', 'post',
    'QA progressive refused cross-owner draft',
    'a1040000-0000-4000-8000-000000000003',
    'a1040000-0000-4000-8000-000000000004',
    'a1040000-0000-4000-8000-000000000205'
  );

select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where actor_id = 'a1040000-0000-4000-8000-000000000001'$$,
  'terminalizing an exact QA lease atomically compensates its progressive drafts'
);
select is(
  (
    select count(*)::integer
    from public.cms_content_drafts_v2
    where created_by = 'a1040000-0000-4000-8000-000000000001'
      and status = 'discarded'
  ),
  2,
  'all active progressive drafts owned by the terminal actor are discarded'
);
select ok(
  not exists (
    select 1
    from public.cms_content_drafts_v2
    where created_by = 'a1040000-0000-4000-8000-000000000001'
      and (lock_version <> 2 or discarded_at is null or promoted_at is not null or promoted_item_id is not null)
  ),
  'compensation advances the CAS version and preserves the non-promoted terminal state'
);
select is(
  (
    select count(*)::integer
    from public.cms_draft_v2_events event
    join public.cms_content_drafts_v2 draft on draft.id = event.draft_id
    where draft.created_by = 'a1040000-0000-4000-8000-000000000001'
      and event.event_type = 'discarded'
  ),
  2,
  'every compensated draft appends one immutable discarded event'
);
select ok(
  not exists (
    select 1
    from public.cms_draft_v2_events event
    join public.cms_content_drafts_v2 draft on draft.id = event.draft_id
    where draft.created_by = 'a1040000-0000-4000-8000-000000000001'
      and (
        event.actor_id <> 'a1040000-0000-4000-8000-000000000001'
        or event.event_type <> 'discarded'
        or event.from_version <> 1
        or event.to_version <> 2
        or event.changed_fields <> '["status"]'::jsonb
        or event.fields_hash <> draft.fields_hash
      )
  ),
  'discard events bind the exact actor, versions, changed field and bytes'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where actor_id = 'a1040000-0000-4000-8000-000000000001'
      and action = 'cms:qa.progressive_drafts.compensated'
      and target_id = 'QA-CMS-FINAL-20260921-aaaaaaaa'
  ),
  1,
  'one immutable audit receipt records the terminal compensation'
);
select ok(
  (
    select event_data ->> 'discardedDrafts' = '2'
      and event_data ->> 'candidateSha' = repeat('a', 40)
      and event_data ->> 'environment' = 'staging'
      and event_data ->> 'terminalStatus' = 'cleaned'
      and event_data ->> 'claimsSha256' ~ '^[0-9a-f]{64}$'
    from public.cms_audit_log
    where actor_id = 'a1040000-0000-4000-8000-000000000001'
      and action = 'cms:qa.progressive_drafts.compensated'
  ),
  'the audit receipt binds count, SHA, environment, terminal status and claims digest'
);
select is(
  (select status from public.cms_content_drafts_v2 where id = 'a1040000-0000-4000-8000-000000000103'),
  'active',
  'a same-run peer actor remains untouched'
);
select is(
  (select status from public.cms_content_drafts_v2 where id = 'a1040000-0000-4000-8000-000000000104'),
  'active',
  'an ordinary actor remains untouched'
);
select throws_ok(
  $$delete from public.cms_draft_v2_events
    where draft_id = 'a1040000-0000-4000-8000-000000000101'$$,
  '42501',
  'CMS audit records are immutable',
  'discard evidence cannot be deleted'
);
select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = status
    where actor_id = 'a1040000-0000-4000-8000-000000000001'$$,
  'replaying a terminal status update is a no-op'
);
select is(
  (
    select count(*)::integer
    from public.cms_draft_v2_events event
    join public.cms_content_drafts_v2 draft on draft.id = event.draft_id
    where draft.created_by = 'a1040000-0000-4000-8000-000000000001'
      and event.event_type = 'discarded'
  ),
  2,
  'terminal replay does not duplicate discarded events'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where actor_id = 'a1040000-0000-4000-8000-000000000001'
      and action = 'cms:qa.progressive_drafts.compensated'
  ),
  1,
  'terminal replay does not duplicate the audit receipt'
);
select throws_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where actor_id = 'a1040000-0000-4000-8000-000000000003'$$,
  '42501',
  'CMS_QA_DRAFT_V2_SCOPE_MISMATCH',
  'cross-owner progressive state fails closed before terminalization'
);
select is(
  (select status from private.cms_qa_actor_leases where actor_id = 'a1040000-0000-4000-8000-000000000003'),
  'active',
  'a refused terminal transition rolls the lease back to active'
);
select is(
  (select status from public.cms_content_drafts_v2 where id = 'a1040000-0000-4000-8000-000000000105'),
  'active',
  'a refused terminal transition leaves the ambiguous draft untouched'
);
select is(
  private.cms_compensate_qa_progressive_drafts_0104(
    'a1040000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260921-aaaaaaaa',
    repeat('a', 40),
    'staging',
    'cleaned'
  ) ->> 'status',
  'noop',
  'the owner-only compensator is idempotent after terminal cleanup'
);
select ok(
  not exists (
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
  ),
  'no exact terminal lease retains active progressive draft residue'
);

select * from finish();
rollback;
