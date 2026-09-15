begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select ok(
  to_regprocedure(
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'
  ) is not null,
  'scoped lead retry remains installed'
);

select ok(
  (
    with definition(value) as (
      select regexp_replace(
        lower(pg_catalog.pg_get_functiondef(
          'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'::regprocedure
        )),
        '[[:space:]]+', '', 'g'
      )
    )
    select position('cms_system_assert_available' in value) > 0
      and position('cms_system_assert_available' in value)
        < position('cms_lock_active_qa_actor_leases' in value)
      and position('cms_lock_active_qa_actor_leases' in value)
        < position('pg_advisory_xact_lock' in value)
      and position('pg_advisory_xact_lock' in value) < position('forupdate' in value)
      and position('forupdate' in value) < position('cms_lead_scope_allowed' in value)
      and position('cms_lead_scope_allowed' in value) < position('''duplicate'',true' in value)
      and position('''duplicate'',true' in value)
        < position('cms_retry_lead_delivery_scoped_core_0088' in value)
    from definition
  ),
  'exact replay is gated, scope-checked and returned before the mutation core'
);

select is(
  (
    select pg_catalog.regexp_count(lower(pg_catalog.pg_get_functiondef(oid)), 'for[[:space:]]+update')
    from pg_catalog.pg_proc
    where oid = 'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)'::regprocedure
  ),
  1,
  'replay wrapper locks only its immutable receipt row'
);

select is(
  has_function_privilege(
    'service_role',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'service role may invoke the scoped retry boundary'
);

select is(
  has_function_privilege(
    'anon',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot invoke scoped retry'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot bypass the Edge retry boundary'
);

select is(
  has_function_privilege(
    'service_role',
    'public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'historical retry core remains owner-only'
);

select ok(
  to_regprocedure(
    'private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamp with time zone)'
  ) is not null,
  'archived product reference predicate is installed'
);

select ok(
  (
    select position('cms_qa_actor_marker_is_exact' in definition) > 0
      and position('item.content_type=''product''' in definition) > 0
      and position('item.workflow_status=''archived''' in definition) > 0
      and position('item.created_by=p_actor_id' in definition) > 0
      and position('item.created_atbetweenlease.created_atandlease.expires_at' in definition) > 0
      and position('p_reference_actor_id=p_actor_id' in definition) > 0
      and position('p_reference_atbetweenlease.created_atandlease.expires_at' in definition) > 0
      and position('lease.status=''active''' in definition) = 0
      and position('lease.expires_at>' in definition) = 0
    from (
      select regexp_replace(
        lower(pg_catalog.pg_get_functiondef(
          'private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamp with time zone)'::regprocedure
        )),
        '[[:space:]]+', '', 'g'
      ) as definition
    ) exact
  ),
  'historical reference requires exact marker, actor, archived product and lease window'
);

select is(
  has_function_privilege(
    'service_role',
    'private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  false,
  'historical reference predicate remains owner-only'
);

select ok(
  (
    select position('strpos(lower(projection.payload::text),option_id::text)>0' in definition) > 0
      and position('strpos(lower(reference.payload::text),option_id::text)>0' in definition) > 0
      and position('cms_qa_archived_product_reference_exact_0101' in definition) > 0
      and position('cms_qa_product_option_reference_active' in definition) > 0
    from (
      select regexp_replace(
        lower(pg_catalog.pg_get_functiondef(
          'private.cms_cleanup_terminal_product_shared_options_0078()'::regprocedure
        )),
        '[[:space:]]+', '', 'g'
      ) as definition
    ) cleanup
  ),
  'shared option cleanup detects UUID case-insensitively and gates historical references'
);

select is(
  (
    select pg_catalog.regexp_count(lower(pg_catalog.pg_get_functiondef(oid)), 'for[[:space:]]+update')
    from pg_catalog.pg_proc
    where oid = 'private.cms_cleanup_terminal_product_shared_options_0078()'::regprocedure
  ),
  1,
  'shared option cleanup retains only the narrow option-row lock'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger installed
    where installed.tgrelid='private.cms_qa_actor_leases'::regclass
      and installed.tgname='cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup'
      and installed.tgfoid='private.cms_cleanup_terminal_product_shared_options_0078()'::regprocedure
      and installed.tgenabled='O'
      and not installed.tgisinternal
  ),
  'shared option terminal trigger still targets the hardened function'
);

select ok(
  (
    select position('candidate_correlations' in definition) > 0
      and position('asmaterialized' in definition) > 0
      and position('candidate_event_ids' in definition) > 0
      and position('allowed_event_ids' in definition) > 0
      and position('cms_system_operational_event_scope_allowed' in definition) > 0
      and position('usingallowed_event_ids' in definition) > 0
      and position('v_previous_cleanup_actor' in definition) > 0
      and position('exceptionwhenothersthen' in definition) > 0
      and position('coalesce(v_previous_cleanup_actor,'''')' in definition) > 0
    from (
      select regexp_replace(
        lower(pg_catalog.pg_get_functiondef('private.cms_system_rbac_terminal_cleanup()'::regprocedure)),
        '[[:space:]]+', '', 'g'
      ) as definition
    ) cleanup
  ),
  'RBAC terminal cleanup materializes candidates before the authoritative scope gate'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger installed
    where installed.tgrelid='private.cms_qa_actor_leases'::regclass
      and installed.tgname='zzzz_cms_system_rbac_terminal_cleanup'
      and installed.tgfoid='private.cms_system_rbac_terminal_cleanup()'::regprocedure
      and installed.tgenabled='O'
      and not installed.tgisinternal
  ),
  'RBAC terminal trigger still targets the candidate-first function'
);

select is(
  has_function_privilege(
    'service_role',
    'private.cms_system_rbac_terminal_cleanup()',
    'EXECUTE'
  ),
  false,
  'RBAC terminal cleanup remains owner-only'
);

select * from finish();
rollback;
