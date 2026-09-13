begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

select ok(
  to_regprocedure('public.cms_get_system_snapshot_authenticated(text,text,uuid)') is not null,
  'authenticated snapshot boundary exists'
);
select ok(
  (select prosecdef from pg_proc where oid='public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure),
  'authenticated snapshot boundary is security definer'
);
select is(
  has_function_privilege('authenticated','public.cms_get_system_snapshot_authenticated(text,text,uuid)','EXECUTE'),
  true,
  'authenticated sessions can call the fused snapshot boundary'
);
select isnt(
  has_function_privilege('anon','public.cms_get_system_snapshot_authenticated(text,text,uuid)','EXECUTE'),
  true,
  'anonymous callers cannot execute the fused snapshot boundary'
);
select isnt(
  has_function_privilege('service_role','public.cms_get_system_snapshot_authenticated(text,text,uuid)','EXECUTE'),
  true,
  'service role cannot impersonate an authenticated snapshot caller'
);
select isnt(
  has_function_privilege('authenticated','public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)','EXECUTE'),
  true,
  'authenticated callers cannot bypass the derived identity boundary'
);
select ok(
  position('auth.uid()' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure)) > 0,
  'actor identity comes from the verified PostgREST request'
);
select ok(
  position('auth.jwt()' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure)) > 0,
  'MFA and session claims come from the verified PostgREST request'
);
select ok(
  position('cms_get_system_snapshot_limited' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure)) > 0,
  'authenticated boundary preserves fused rate limiting'
);
select ok(
  position('extensions.digest' in pg_get_functiondef('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure)) > 0,
  'rate identity is derived server-side from the verified actor'
);
select is(
  pg_get_function_identity_arguments('public.cms_get_system_snapshot_authenticated(text,text,uuid)'::regprocedure),
  'p_environment text, p_site_key text, p_correlation_id uuid',
  'callers cannot supply actor, AAL, session or issued-at claims'
);
select ok(
  position('MATERIALIZED' in upper(pg_get_functiondef('public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure))) > 0,
  'QA candidates are materialized before deep graph checks'
);
select ok(
  position('cms_content_item_graph_scope_allowed' in pg_get_functiondef('public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure)) > 0,
  'deep content scope remains the final authorization check'
);

set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select throws_ok(
  $$select public.cms_get_system_snapshot_authenticated('staging','main','51100000-0000-4000-8000-000000000199')$$,
  '42501',
  'CMS_SYSTEM_AUTH_INVALID',
  'missing verified JWT identity fails closed'
);

select * from finish();
rollback;
