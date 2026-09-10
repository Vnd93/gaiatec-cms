begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(8);

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
    and c.conname = 'cms_qa_actor_leases_check1') like '%241 minutes%',
  'the lease constraint accepts the window and still bounds it');

select * from finish();
rollback;
