begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(25);

-- Este teste le a definicao VIVA das funcoes, nao o texto das migrations. A distincao nao e
-- preciosismo: a 0055, linhas 50-92, tem um bloco DO que varre pg_proc e reescreve o corpo de toda
-- funcao cms_*, trocando listas de ambiente e apagando dois ramos inteiros por regexp. Depois dela,
-- o arquivo e o banco divergem por construcao. Qualquer conferencia feita sobre o arquivo responde
-- sobre uma coisa que nao roda.

-- ---------------------------------------------------------------- o livro existe e e fechado
select ok(to_regclass('private.cms_ev2_delivery_ledger') is not null,
  'the delivery ledger table is installed');

select ok(exists(
  select 1 from pg_catalog.pg_trigger t
  where t.tgrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and t.tgname = 'cms_ev2_delivery_ledger_no_update'
    and not t.tgisinternal
),'the append-only trigger is installed');

select isnt(has_table_privilege('authenticated','private.cms_ev2_delivery_ledger','SELECT'),true,
  'an authenticated caller cannot read the ledger');
select isnt(has_table_privilege('anon','private.cms_ev2_delivery_ledger','SELECT'),true,
  'anon cannot read the ledger');
select isnt(has_table_privilege('authenticated','private.cms_ev2_delivery_ledger','INSERT'),true,
  'an authenticated caller cannot write the ledger');

-- ------------------------------------------- a lista de entregaveis e restricao, nao convencao
select ok((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel') like '%ev2.draft_v2%',
  'progressive draft is deliverable');
select ok((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel') like '%ev2.master_data%',
  'master data is deliverable');
select ok((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel') like '%ev2.pim_v2%',
  'the product catalogue is deliverable');

-- As tres que abririam item da lista fechada, e os dois adiamentos declarados. Sao inalcancaveis
-- por ausencia de caminho, nao por alguem lembrar de nao usar.
select is(strpos((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel'),'ev2.dam'),0,
  'media curation cannot be delivered through this path');
select is(strpos((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel'),'ev2.search_quality'),0,
  'search governance cannot be delivered through this path');
select is(strpos((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel'),'ev2.collaboration_bulk'),0,
  'editorial package publishing cannot be delivered through this path');
select is(strpos((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel'),'ev2.multisite'),0,
  'the declared multisite deferral cannot be delivered');
select is(strpos((select pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
  where c.conrelid = 'private.cms_ev2_delivery_ledger'::regclass
    and c.conname = 'cms_ev2_delivery_ledger_flag_elegivel'),'ev2.ai_execute'),0,
  'the declared transactional AI deferral cannot be delivered');

-- ------------------------------------------------ o predicado carrega as travas dentro de si
select ok(to_regprocedure('private.cms_ev2_delivery_active(text,text,text,text)') is not null,
  'the delivery predicate is installed');
select ok(strpos(pg_get_functiondef(
  'private.cms_ev2_delivery_active(text,text,text,text)'::regprocedure
),'aal2') > 0,'the predicate itself demands strong authentication in production');
select ok(strpos(pg_get_functiondef(
  'private.cms_ev2_delivery_active(text,text,text,text)'::regprocedure
),'kill_switch') > 0,'the emergency switch still overrides a delivery');
select ok(strpos(pg_get_functiondef(
  'private.cms_ev2_delivery_active(text,text,text,text)'::regprocedure
),'scope_type in') > 0,'a broad override still vetoes a delivery');
select isnt(has_function_privilege('authenticated',
  'private.cms_ev2_delivery_active(text,text,text,text)','EXECUTE'),true,
  'the predicate is unreachable to an authenticated caller');

-- -------------------------------- os tres pontos de decisao consultam o livro, e nao perderam nada
-- Criterio 3d. Cada funcao precisa CONTER a chamada nova e CONTINUAR contendo o que a protegia.

select ok(strpos(pg_get_functiondef(
  'public.cms_evaluate_feature_flag(uuid,text,text,text,text,text,timestamptz)'::regprocedure
),'cms_ev2_delivery_active') > 0,'the evaluator consults the ledger');
select ok(strpos(pg_get_functiondef(
  'public.cms_evaluate_feature_flag(uuid,text,text,text,text,text,timestamptz)'::regprocedure
),'kill_switch') > 0,'the evaluator did not lose the emergency switch');

select ok(strpos(pg_get_functiondef(
  'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
),'cms_ev2_delivery_active') > 0,'the manifest consults the ledger');
select ok(strpos(pg_get_functiondef(
  'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
),'v_broad_override_count') > 0,'the manifest did not lose the broad-override veto');
select ok(strpos(pg_get_functiondef(
  'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
),'aal2') > 0,'the manifest did not lose the production MFA requirement');

-- A excecao de janela do ator de QA foi instalada pela 0061 por reescrita textual do mesmo corpo.
-- O remendo da 0093 nao pode te-la levado junto.
select ok(strpos(pg_get_functiondef(
  'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
),'cms_qa_override_window_is_valid') > 0,
  'the QA window exception installed by 0061 survived the 0093 patch');

select ok(strpos(pg_get_functiondef(
  'public.cms_draft_v2_assert_available(uuid,text,text,text,text,timestamptz)'::regprocedure
),'cms_ev2_delivery_active') > 0,'the progressive draft guard consults the ledger');

select * from finish();
rollback;
