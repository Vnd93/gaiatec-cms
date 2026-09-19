begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

select ok(
  to_regprocedure('public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)') is not null,
  'timed limited lead retry boundary exists'
);
select ok(
  (
    select not prosecdef
    from pg_proc
    where oid = 'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
  ),
  'timed limited lead retry boundary uses the caller service role'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'service role can execute the internal timed boundary'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot execute the internal timed boundary'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the internal timed boundary'
);
select is(
  pg_get_function_identity_arguments(
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
  ),
  'p_actor_id uuid, p_event_id uuid, p_justification text, p_environment text, p_site_key text, p_aal text, p_session_id text, p_issued_at timestamp with time zone, p_correlation_id uuid, p_idempotency_key uuid, p_request_hash text, p_rate_limit_key_hash text',
  'timed boundary preserves the exact guarded retry arguments'
);
select ok(
  position(
    'public.consume_rate_limit' in pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    )
  ) > 0,
  'timed boundary preserves transactional rate limiting'
);
select ok(
  position(
    'public.consume_rate_limit' in pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    )
  ) < position(
    'public.cms_retry_lead_delivery_scoped' in pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    )
  ),
  'rate limiting remains ahead of the guarded retry core'
);
select is(
  (
    length(pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    )) - length(replace(pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    ), 'public.consume_rate_limit(', ''))
  ) / length('public.consume_rate_limit('),
  1,
  'timed boundary consumes the request budget exactly once'
);
select is(
  (
    length(pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    )) - length(replace(pg_get_functiondef(
      'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
    ), 'public.cms_retry_lead_delivery_scoped(', ''))
  ) / length('public.cms_retry_lead_delivery_scoped('),
  1,
  'timed boundary executes the guarded retry core exactly once'
);
select ok(
  position('clock_timestamp' in pg_get_functiondef(
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
  )) > 0,
  'database subphases use a clock that advances within the statement'
);
select ok(
  position('rateLimitMs' in pg_get_functiondef(
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
  )) > 0
  and position('commandCoreMs' in pg_get_functiondef(
    'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
  )) > 0,
  'internal envelope reports only the two bounded database subphases'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_retry_lead_delivery_limited(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'rollback-compatible limited retry remains executable by service role'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_retry_lead_delivery_limited(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'rollback-compatible limited retry remains unavailable to authenticated callers'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) acl
    where procedure.oid = 'public.cms_retry_lead_delivery_limited_timed(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,text)'::regprocedure
      and not (
        acl.grantee = procedure.proowner
        or (
          acl.grantee = (select oid from pg_catalog.pg_roles where rolname = 'service_role')
          and acl.grantor = procedure.proowner
          and acl.privilege_type = 'EXECUTE'
          and not acl.is_grantable
        )
      )
  ),
  'timed boundary has no unexpected grantees or grant options'
);

create temporary table timed_retry_guard_baseline(replay_count bigint) on commit drop;
insert into timed_retry_guard_baseline
select count(*) from public.cms_lead_outbox_replays;
insert into public.request_rate_limits (
  key_hash, action, window_started_at, request_count
) values (
  repeat('e', 64), 'cms_leads_retry_delivery', now(), 60
)
on conflict (key_hash, action) do update
set window_started_at = excluded.window_started_at,
    request_count = excluded.request_count;

set local role service_role;
select throws_ok(
  $$select public.cms_retry_lead_delivery_limited_timed(
    null,null,'retry','staging','main','aal2','session',now(),
    '51300000-0000-4000-8000-000000000001','51300000-0000-4000-8000-000000000002',
    repeat('a',64),'invalid'
  )$$,
  '22023',
  'CMS_RATE_LIMIT_KEY_INVALID',
  'invalid rate-limit identity fails before any guarded mutation'
);
select throws_ok(
  $$select public.cms_retry_lead_delivery_limited_timed(
    null,'51300000-0000-4000-8000-000000000003','retry','staging','main','aal2','session',now(),
    '51300000-0000-4000-8000-000000000004','51300000-0000-4000-8000-000000000005',
    repeat('a',64),repeat('e',64)
  )$$,
  'PT429',
  'CMS_RATE_LIMIT_EXCEEDED',
  'an exhausted bucket fails before the guarded retry core'
);
reset role;

select is(
  (select request_count::bigint
   from public.request_rate_limits
   where key_hash = repeat('e', 64)
     and action = 'cms_leads_retry_delivery'),
  60::bigint,
  'the rejected rate-limit increment rolls back atomically'
);
select is(
  (select count(*) from public.cms_lead_outbox_replays),
  (select replay_count from timed_retry_guard_baseline),
  'an exhausted bucket creates no replay mutation'
);

select * from finish();
rollback;
