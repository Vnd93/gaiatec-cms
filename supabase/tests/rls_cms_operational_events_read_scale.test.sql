begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(21);

-- A politica de 0076 avaliava, dentro de um predicado por linha, duas condicoes que nao dependem de
-- linha. A 0089 separa onde cada uma e avaliada sem afrouxar nenhuma delas. O que este teste protege
-- e exatamente isso: as duas metades existem, continuam privilegiadas, continuam obrigatorias na
-- politica, e os indices que tornam o limite eficaz estao instalados.

select ok(to_regprocedure('public.cms_system_operational_session_scope_allowed()') is not null,
  'session half of the diagnostics predicate is installed');
select ok(to_regprocedure('public.cms_system_operational_event_row_allowed(uuid)') is not null,
  'row half of the diagnostics predicate is installed');

select is((select prosecdef from pg_proc
  where oid='public.cms_system_operational_session_scope_allowed()'::regprocedure),true,
  'session predicate runs as its definer');
select is((select prosecdef from pg_proc
  where oid='public.cms_system_operational_event_row_allowed(uuid)'::regprocedure),true,
  'row predicate runs as its definer');

-- Um predicado volatil nao pode ser icado para fora do laco, que e a razao de existir desta migration.
select is((select provolatile::text from pg_proc
  where oid='public.cms_system_operational_session_scope_allowed()'::regprocedure),'s',
  'session predicate is stable, so it is evaluated once per statement');
select is((select provolatile::text from pg_proc
  where oid='public.cms_system_operational_event_row_allowed(uuid)'::regprocedure),'s',
  'row predicate is stable');

select ok((select array_to_string(proconfig,',') from pg_proc
  where oid='public.cms_system_operational_session_scope_allowed()'::regprocedure)
  like '%search_path=pg_catalog, private, pg_temp%',
  'session predicate has a locked search_path');
select ok((select array_to_string(proconfig,',') from pg_proc
  where oid='public.cms_system_operational_event_row_allowed(uuid)'::regprocedure)
  like '%search_path=pg_catalog, private, pg_temp%',
  'row predicate has a locked search_path');

select isnt(has_function_privilege('anon',
  'public.cms_system_operational_session_scope_allowed()','EXECUTE'),true,
  'session predicate is unreachable to anon');
select isnt(has_function_privilege('anon',
  'public.cms_system_operational_event_row_allowed(uuid)','EXECUTE'),true,
  'row predicate is unreachable to anon');
select is(has_function_privilege('authenticated',
  'public.cms_system_operational_session_scope_allowed()','EXECUTE'),true,
  'session predicate is callable by the authenticated policy');
select is(has_function_privilege('authenticated',
  'public.cms_system_operational_event_row_allowed(uuid)','EXECUTE'),true,
  'row predicate is callable by the authenticated policy');

select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_operational_events'
    and policyname='cms_operational_events_authoritative_read' and cmd='SELECT'),1,
  'the authoritative read policy remains single and select-only');
select ok((select pg_get_expr(polqual,polrelid) from pg_policy
  where polname='cms_operational_events_authoritative_read'
    and polrelid='public.cms_operational_events'::regclass)
  like '%cms_system_operational_session_scope_allowed%',
  'the policy still requires the session half');
select ok((select pg_get_expr(polqual,polrelid) from pg_policy
  where polname='cms_operational_events_authoritative_read'
    and polrelid='public.cms_operational_events'::regclass)
  like '%cms_system_operational_event_row_allowed%',
  'the policy still requires the row half');

-- Nenhuma das tres condicoes originais pode ter desaparecido na separacao.
select ok(strpos(pg_get_functiondef(
  'public.cms_system_operational_session_scope_allowed()'::regprocedure
),'cms_system_permission_lineage_allowed') > 0,'permission lineage is still required');
select ok(strpos(pg_get_functiondef(
  'public.cms_system_operational_session_scope_allowed()'::regprocedure
),'cms:diagnostics.read') > 0,'the diagnostics permission is still required');
select ok(strpos(pg_get_functiondef(
  'public.cms_system_operational_event_row_allowed(uuid)'::regprocedure
),'cms_system_operational_event_scope_allowed') > 0,'row scoping is still delegated to the authoritative check');

-- Sem estes indices o limite so vale depois da ordenacao completa, e o predicado por linha volta a
-- rodar na tabela inteira, que foi o que estourou o statement_timeout.
select ok((select indexdef from pg_indexes where schemaname='public'
  and indexname='cms_operational_events_unresolved_recent_idx')
  like '%(created_at DESC)%WHERE (resolved_at IS NULL)%',
  'unresolved events are indexed newest first');
select ok((select indexdef from pg_indexes where schemaname='public'
  and indexname='cms_operational_events_recent_idx') like '%(created_at DESC)%',
  'historical events are indexed newest first');

-- A politica e "to authenticated", mas a barreira anterior a ela e mais forte e precisa continuar
-- existindo: anon nao tem sequer o privilegio de leitura na tabela, entao a tentativa nem chega a
-- ser avaliada pela politica.
select is(has_table_privilege('anon','public.cms_operational_events','SELECT'),false,
  'diagnostics stay closed to anonymous callers before RLS is even consulted');

select * from finish();
rollback;
