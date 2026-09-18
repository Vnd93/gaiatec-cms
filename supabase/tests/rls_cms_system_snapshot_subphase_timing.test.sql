begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

select ok(
  to_regprocedure('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)') is not null,
  'timed authenticated snapshot boundary exists'
);
select ok(
  (select prosecdef from pg_proc where oid='public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure),
  'timed authenticated snapshot boundary is security definer'
);
select is(
  has_function_privilege('authenticated','public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)','EXECUTE'),
  true,
  'authenticated sessions can call the timed snapshot boundary'
);
select isnt(
  has_function_privilege('anon','public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)','EXECUTE'),
  true,
  'anonymous callers cannot execute the timed snapshot boundary'
);
select isnt(
  has_function_privilege('service_role','public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)','EXECUTE'),
  true,
  'service role cannot impersonate a timed authenticated snapshot caller'
);
select is(
  pg_get_function_identity_arguments('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure),
  'p_environment text, p_site_key text, p_correlation_id uuid',
  'callers cannot supply actor, AAL, session or issued-at claims'
);
select ok(
  position('auth.uid()' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'actor identity comes from the verified PostgREST request'
);
select ok(
  position('auth.jwt()' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'MFA and session claims come from the verified PostgREST request'
);
select ok(
  position('extensions.digest' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'rate identity is derived server-side from the verified actor'
);
select ok(
  position('consume_rate_limit' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'the timed boundary preserves server-side rate limiting'
);
select ok(
  position('v_snapshot := public.cms_get_system_snapshot(' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) >
  position('consume_rate_limit' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)),
  'rate limiting remains before the authoritative snapshot read'
);
select ok(
  position('clock_timestamp' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'database subphases use a wall clock that advances within the statement'
);
select ok(
  position('rateLimitMs' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'the internal envelope reports bounded rate-limit timing only'
);
select ok(
  position('snapshotCoreMs' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)'::regprocedure)) > 0,
  'the internal envelope reports bounded snapshot-core timing only'
);
select is(
  has_function_privilege('authenticated','public.cms_get_system_snapshot_authenticated(text,text,uuid)','EXECUTE'),
  true,
  'the rollback-compatible authenticated boundary remains executable'
);
select isnt(
  has_function_privilege('service_role','public.cms_get_system_snapshot_authenticated(text,text,uuid)','EXECUTE'),
  true,
  'the rollback-compatible authenticated boundary remains unavailable to service role'
);
select ok(
  position('cms_get_system_snapshot_limited' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure)) > 0,
  'the rollback-compatible boundary keeps its original limited implementation'
);

set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select throws_ok(
  $$select public.cms_get_system_snapshot_authenticated_timed('staging','main','51200000-0000-4000-8000-000000000199')$$,
  '42501',
  'CMS_SYSTEM_AUTH_INVALID',
  'missing verified JWT identity fails closed'
);

select * from finish();
rollback;
