begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(11);

-- A janela autenticada de staging passou a conter tambem a prova de compatibilidade do rollback, que
-- so pode rodar enquanto as entidades criadas na UI existem. A lease do ator sintetico precisa
-- sobreviver a janela inteira, senao o watchdog varre um ator ainda em uso. Nada alem do prazo muda.

select ok(to_regprocedure('private.cms_capture_qa_actor_lease()') is not null,
  'the lease capture trigger function is installed');
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_qa_actor_lease()'::regprocedure
),'240 minutes') > 0,'the lease now outlives the complete authenticated window');
select is(strpos(pg_get_functiondef(
  'private.cms_capture_qa_actor_lease()'::regprocedure
),'119 minutes'),0,'the previous window no longer decides when a lease expires');

-- O gatilho continua no lugar e continua fechado.
select ok(exists(
  select 1 from pg_catalog.pg_trigger t
  where t.tgrelid = 'auth.users'::regclass
    and t.tgname = 'cms_capture_qa_actor_lease'
    and not t.tgisinternal
),'the lease is still captured on actor creation');
select isnt(has_function_privilege('authenticated',
  'private.cms_capture_qa_actor_lease()','EXECUTE'),true,
  'the trigger function stays unreachable to an authenticated caller');
select isnt(has_function_privilege('anon',
  'private.cms_capture_qa_actor_lease()','EXECUTE'),true,
  'the trigger function stays unreachable to anon');

-- O varredor de leases expiradas continua existindo: estender o prazo nao pode remover a recuperacao.
select ok(to_regprocedure('private.cms_sweep_expired_qa_actor_leases(integer)') is not null,
  'the expired lease sweeper is still installed');

-- A restricao da tabela e a barreira que recusa uma lease longa demais, e ela precisa acompanhar o
-- novo teto sem deixar de ser um limite superior fechado.
select ok((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_qa_actor_leases'::regclass
    and c.conname = 'cms_qa_actor_leases_check1') like '%04:01:00%',
  'the lease constraint accepts the window and still bounds it');

-- Reescrever o corpo antigo apagaria os reparos que 0086 aplicou a esta mesma funcao.
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_qa_actor_lease()'::regprocedure
),'transaction_timestamp()') > 0,'the 0086 timestamp repair survived the deadline change');
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_qa_actor_lease()'::regprocedure
),'CMS_QA_ACTOR_METADATA_INVALID') > 0,'the 0086 metadata guard survived the deadline change');

-- A janela dos overrides de feature flag deriva do prazo da lease e tinha teto proprio de 120
-- minutos, que recusava qualquer provisionamento depois da mudanca.
select ok(strpos(pg_get_functiondef(
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
),'241 minutes') > 0,'the override window follows the lease it derives from');

select * from finish();
rollback;
