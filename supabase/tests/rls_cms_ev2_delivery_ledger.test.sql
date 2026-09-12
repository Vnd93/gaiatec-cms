begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(40);

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

-- ------------------------------------------------------- o predicado NUNCA pode devolver NULL
-- Com o livro vazio, a subconsulta da ultima palavra devolve NULL e `NULL = 'delivered'` e NULL.
-- Sem coalesce o predicado inteiro vira NULL, e a logica de tres valores do SQL faz o estrago:
-- `false or NULL` e NULL, `and not NULL` e NULL. Foi assim que uma versao anterior desta migration
-- tornou ELEGIVEL uma habilitacao individual de mais de 30 minutos — o oposto do que ela protege.
-- Estas cinco asserticoes existem para que isso nao volte em silencio.

select ok((select private.cms_ev2_delivery_active('ev2.draft_v2','local','main','aal1')) is not null,
  'the predicate never returns null with an empty ledger');
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','local','main','aal1')),false,
  'an empty ledger means not delivered, not unknown');
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal1')),false,
  'single factor in production is refused as false, never as null');
select is((select private.cms_ev2_delivery_active(null,'local','main','aal1')),false,
  'a null flag key is refused as false, never as null');
select is((select private.cms_ev2_delivery_active('ev2.dam','local','main','aal2')),false,
  'a flag that can never be delivered still answers false, not null');

-- ------------------------------------------------- as travas DECIDEM, e nao apenas aparecem
-- Tudo acima roda com o livro VAZIO, onde a resposta e false por AUSENCIA DE LINHA, qualquer que
-- seja a trava. E as tres asserticoes de "o predicado carrega as travas" sao strpos sobre o texto
-- do corpo: provam que os nomes aparecem, nao que decidem. Um predicado em que a conjuncao de
-- aal2 virasse disjuncao, ou o veto amplo virasse `and exists`, mantem todos os nomes e passa.
--
-- Concluir por presenca de nome e exatamente o que a regra de metodo deste projeto proibe. As
-- asserticoes abaixo semeiam o livro e exercitam cada trava contra um estado em que a resposta
-- SO pode ser false se a trava funcionar.

insert into private.cms_ev2_delivery_ledger (
  flag_key, environment, state, reason, candidate_sha, workflow_run_id,
  approval_record_sha256, idempotency_key, correlation_id, review_due_at
) values (
  'ev2.draft_v2', 'production', 'delivered', 'Entrega sintetica exclusiva deste teste.',
  repeat('a', 40), '1', repeat('b', 64),
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2',
  statement_timestamp() + interval '90 days'
);

select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal2')),true,
  'with a delivered row and strong authentication the predicate says yes');
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal1')),false,
  'single factor is refused even with the row present -- the AAL lock decides');
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','outro','aal2')),false,
  'another site is refused even with the row present -- the site lock decides');
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','staging','main','aal2')),false,
  'the row belongs to production only -- the environment is part of the key');

-- Interruptor de emergencia: soberano mesmo sobre uma entrega declarada.
update public.cms_feature_flags set kill_switch = true where flag_key = 'ev2.draft_v2';
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal2')),false,
  'the emergency switch overrides a declared delivery');
update public.cms_feature_flags set kill_switch = false where flag_key = 'ev2.draft_v2';

-- Habilitacao de escopo amplo continua sendo VETO, inclusive contra uma entrega.
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, starts_at, expires_at, created_by
) values (
  'ev2.draft_v2', 'production', 'site', 'main', true, 'Override amplo sintetico deste teste.',
  statement_timestamp() - interval '1 minute', statement_timestamp() + interval '1 hour',
  (select id from auth.users limit 1)
);
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal2')),false,
  'a broad override still vetoes, even against a declared delivery');
delete from public.cms_feature_flag_overrides
where flag_key = 'ev2.draft_v2' and scope_type = 'site';

-- A ultima palavra manda: suspender depois de entregar desliga.
insert into private.cms_ev2_delivery_ledger (
  flag_key, environment, state, reason, candidate_sha, workflow_run_id,
  approval_record_sha256, idempotency_key, correlation_id, review_due_at
) values (
  'ev2.draft_v2', 'production', 'suspended', 'Suspensao sintetica exclusiva deste teste.',
  repeat('a', 40), '2', repeat('b', 64),
  '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f4', null
);
select is((select private.cms_ev2_delivery_active('ev2.draft_v2','production','main','aal2')),false,
  'the last word wins: a suspension after a delivery turns it off');

-- As duas escritas governadas precisam ser ALCANCAVEIS pelo service_role. Sem grant, revogar uma
-- entrega seria impossivel — o oposto de "revogar leva segundos e nao exige deploy".
select is(has_function_privilege('service_role',
  'public.cms_ev2_suspend_delivery(text,text,text,text,text,text,uuid,uuid)','EXECUTE'),true,
  'the service role can actually suspend a delivery');
select is(has_function_privilege('service_role',
  'public.cms_ev2_declare_delivery(text,text,text,text,text,text,uuid,uuid,timestamptz)','EXECUTE'),true,
  'the service role can actually declare a delivery');
select isnt(has_function_privilege('authenticated',
  'public.cms_ev2_suspend_delivery(text,text,text,text,text,text,uuid,uuid)','EXECUTE'),true,
  'an authenticated caller cannot suspend a delivery');

select * from finish();
rollback;
