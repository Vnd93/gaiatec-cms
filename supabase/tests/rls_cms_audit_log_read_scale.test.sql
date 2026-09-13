begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(36);

select ok(to_regprocedure('public.cms_audit_session_scope_allowed()') is not null,
  'audit session predicate exists');
select ok(to_regprocedure('public.cms_audit_corporate_session_allowed()') is not null,
  'audit corporate-session predicate exists');
select ok(to_regprocedure('public.cms_audit_event_row_allowed(uuid)') is not null,
  'audit event-row predicate exists');

select is((select prosecdef from pg_proc
  where oid='public.cms_audit_session_scope_allowed()'::regprocedure),true,
  'audit session predicate runs as its definer');
select is((select prosecdef from pg_proc
  where oid='public.cms_audit_corporate_session_allowed()'::regprocedure),true,
  'audit corporate-session predicate runs as its definer');
select is((select prosecdef from pg_proc
  where oid='public.cms_audit_event_row_allowed(uuid)'::regprocedure),true,
  'audit event-row predicate runs as its definer');

select is((select provolatile::text from pg_proc
  where oid='public.cms_audit_session_scope_allowed()'::regprocedure),'s',
  'audit session predicate is stable');
select is((select provolatile::text from pg_proc
  where oid='public.cms_audit_corporate_session_allowed()'::regprocedure),'s',
  'audit corporate-session predicate is stable');
select is((select provolatile::text from pg_proc
  where oid='public.cms_audit_event_row_allowed(uuid)'::regprocedure),'s',
  'audit event-row predicate is stable');

select ok((select array_to_string(proconfig,',') from pg_proc
  where oid='public.cms_audit_session_scope_allowed()'::regprocedure)
  like '%search_path=pg_catalog, private, auth, pg_temp%',
  'audit session predicate has a locked search_path');
select ok((select array_to_string(proconfig,',') from pg_proc
  where oid='public.cms_audit_corporate_session_allowed()'::regprocedure)
  like '%search_path=pg_catalog, private, auth, pg_temp%',
  'audit corporate-session predicate has a locked search_path');
select ok((select array_to_string(proconfig,',') from pg_proc
  where oid='public.cms_audit_event_row_allowed(uuid)'::regprocedure)
  like '%search_path=pg_catalog, private, auth, pg_temp%',
  'audit event-row predicate has a locked search_path');

select ok(exists(select 1 from pg_proc routine
  join pg_language language_row on language_row.oid=routine.prolang
  where routine.oid='public.cms_audit_session_scope_allowed()'::regprocedure
    and routine.proowner='postgres'::regrole and language_row.lanname='sql'
    and routine.proconfig=array['search_path=pg_catalog, private, auth, pg_temp']::text[]
    and encode(extensions.digest(convert_to(replace(replace(
      routine.prosrc,E'\r\n',E'\n'),E'\r',E'\n'),'UTF8'),'sha256'),'hex')
      ='fd3421d2fbf30dc9a3d43553b389b0e6a11f097f2b23767edaddb5815ac87d71'),
  'audit session predicate retains its exact reviewed body and execution owner');
select ok(exists(select 1 from pg_proc routine
  join pg_language language_row on language_row.oid=routine.prolang
  where routine.oid='public.cms_audit_corporate_session_allowed()'::regprocedure
    and routine.proowner='postgres'::regrole and language_row.lanname='sql'
    and routine.proconfig=array['search_path=pg_catalog, private, auth, pg_temp']::text[]
    and encode(extensions.digest(convert_to(replace(replace(
      routine.prosrc,E'\r\n',E'\n'),E'\r',E'\n'),'UTF8'),'sha256'),'hex')
      ='fede1da9331eca631d0d3a7d57bf32b2333e1a571d7e5cbf23703079a68dd7c2'),
  'audit corporate predicate retains its exact reviewed body and execution owner');
select ok(exists(select 1 from pg_proc routine
  join pg_language language_row on language_row.oid=routine.prolang
  where routine.oid='public.cms_audit_event_row_allowed(uuid)'::regprocedure
    and routine.proowner='postgres'::regrole and language_row.lanname='sql'
    and routine.proconfig=array['search_path=pg_catalog, private, auth, pg_temp']::text[]
    and encode(extensions.digest(convert_to(replace(replace(
      routine.prosrc,E'\r\n',E'\n'),E'\r',E'\n'),'UTF8'),'sha256'),'hex')
      ='e3aa5ec8c4fa074e3f3df282911b500728c7ee742d8a61dce6db80a848efeb0a'),
  'audit row predicate retains its exact reviewed body and execution owner');

select isnt(has_function_privilege('anon','public.cms_audit_session_scope_allowed()','EXECUTE'),true,
  'anonymous callers cannot invoke the audit session predicate');
select isnt(has_function_privilege('anon','public.cms_audit_corporate_session_allowed()','EXECUTE'),true,
  'anonymous callers cannot invoke the audit corporate-session predicate');
select isnt(has_function_privilege('anon','public.cms_audit_event_row_allowed(uuid)','EXECUTE'),true,
  'anonymous callers cannot invoke the audit event-row predicate');
select isnt(has_function_privilege('service_role','public.cms_audit_session_scope_allowed()','EXECUTE'),true,
  'service role cannot invoke the audit session predicate');
select isnt(has_function_privilege('service_role','public.cms_audit_corporate_session_allowed()','EXECUTE'),true,
  'service role cannot invoke the audit corporate-session predicate');
select isnt(has_function_privilege('service_role','public.cms_audit_event_row_allowed(uuid)','EXECUTE'),true,
  'service role cannot invoke the audit event-row predicate');
select is(has_function_privilege('authenticated','public.cms_audit_session_scope_allowed()','EXECUTE'),true,
  'authenticated policy can invoke the audit session predicate');
select is(has_function_privilege('authenticated','public.cms_audit_corporate_session_allowed()','EXECUTE'),true,
  'authenticated policy can invoke the audit corporate-session predicate');
select is(has_function_privilege('authenticated','public.cms_audit_event_row_allowed(uuid)','EXECUTE'),true,
  'authenticated policy can invoke the audit event-row predicate');

select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_audit_log' and cmd in ('SELECT','ALL')),1,
  'the audit read policy remains single and select-only');
select ok((select polpermissive
    and polroles = array[(select oid from pg_roles where rolname='authenticated')]
  from pg_policy where polname='cms_audit_authorized_read'
    and polrelid='public.cms_audit_log'::regclass and polcmd='r'),
  'the only audit read policy is permissive only for authenticated');
select ok((select pg_get_expr(polqual,polrelid) from pg_policy
  where polname='cms_audit_authorized_read'
    and polrelid='public.cms_audit_log'::regclass)
  like '%cms_audit_session_scope_allowed%',
  'the audit policy requires the session predicate');
select ok((select pg_get_expr(polqual,polrelid) from pg_policy
  where polname='cms_audit_authorized_read'
    and polrelid='public.cms_audit_log'::regclass)
  like '%cms_audit_corporate_session_allowed%',
  'the audit policy retains complete corporate visibility');
select ok((select pg_get_expr(polqual,polrelid) from pg_policy
  where polname='cms_audit_authorized_read'
    and polrelid='public.cms_audit_log'::regclass)
  like '%cms_audit_event_row_allowed%',
  'the audit policy requires row scope for QA actors');
select is((select (
    length(upper(pg_get_expr(polqual,polrelid)))
    - length(replace(upper(pg_get_expr(polqual,polrelid))),'SELECT',''))
  ) / length('SELECT') from pg_policy
  where polname='cms_audit_authorized_read'
    and polrelid='public.cms_audit_log'::regclass),2,
  'both statement-invariant audit predicates are cached scalar subqueries');

select ok(strpos(pg_get_functiondef(
  'public.cms_audit_session_scope_allowed()'::regprocedure
),'cms_has_permission') > 0,
  'the session predicate retains the audit permission check');
select ok(strpos(pg_get_functiondef(
  'public.cms_audit_session_scope_allowed()'::regprocedure
),'auth.users') > 0,
  'the session predicate rejects missing Auth identities');
select ok(strpos(pg_get_functiondef(
  'public.cms_audit_corporate_session_allowed()'::regprocedure
),'cms_qa_actor_leases') > 0,
  'the corporate predicate is limited to identities that were never QA');
select ok(strpos(pg_get_functiondef(
  'public.cms_audit_event_row_allowed(uuid)'::regprocedure
),'cms_user_actor_target_scope_allowed') > 0,
  'the event predicate retains exact-run actor scoping');

select ok(exists(select 1
  from pg_class index_class
  join pg_namespace index_namespace on index_namespace.oid=index_class.relnamespace
  join pg_index index_record on index_record.indexrelid=index_class.oid
  join pg_am access_method on access_method.oid=index_class.relam
  where index_namespace.nspname='public'
    and index_class.relname='cms_audit_log_recent_idx'
    and index_record.indrelid='public.cms_audit_log'::regclass
    and index_record.indisvalid and index_record.indisready
    and not index_record.indisunique
    and index_record.indpred is null and index_record.indexprs is null
    and index_record.indnkeyatts=1 and index_record.indnatts=1
    and access_method.amname='btree'
    and index_record.indkey[0]=(select attribute.attnum from pg_attribute attribute
      where attribute.attrelid='public.cms_audit_log'::regclass
        and attribute.attname='occurred_at' and not attribute.attisdropped)
    and pg_index_column_has_property(index_record.indexrelid,1,'desc') is true
    and pg_index_column_has_property(index_record.indexrelid,1,'nulls_first') is true),
  'global audit recency is indexed for the admin home limit');
select is(has_table_privilege('anon','public.cms_audit_log','SELECT'),false,
  'audit records remain unreadable to anonymous callers before RLS');

select * from finish();
rollback;
