begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(19);

-- Estrutura e alcance do instantaneo de rascunho (0094), lidos do banco migrado.
--
-- LIMITE DECLARADO: este arquivo prova ESTRUTURA e ALCANCE, nao comportamento. O exercicio
-- funcional — salvar duas vezes e conferir que o payload anterior sobreviveu — precisa de item e
-- rascunho semeados, e semear aqui produziria um teste que falha por motivo errado. Fica para a
-- camada de canario, onde a semeadura ja esta resolvida. Nao conte este arquivo como prova de que
-- a captura funciona.

select ok(to_regclass('public.cms_content_draft_snapshots') is not null,
  'the draft snapshot table is installed');

-- O gatilho precisa estar no caminho de escrita do rascunho, e disparar DEPOIS da atualizacao.
select ok(exists(
  select 1 from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.cms_content_drafts'::regclass
    and t.tgname = 'cms_capture_draft_snapshot'
    and not t.tgisinternal
),'the capture trigger is installed on the draft table');

select ok(strpos(pg_get_triggerdef(
  (select t.oid from pg_catalog.pg_trigger t
   where t.tgrelid='public.cms_content_drafts'::regclass and t.tgname='cms_capture_draft_snapshot')
),'AFTER UPDATE OF payload') > 0,'the trigger fires after the payload changes, not before');

select ok(strpos(pg_get_triggerdef(
  (select t.oid from pg_catalog.pg_trigger t
   where t.tgrelid='public.cms_content_drafts'::regclass and t.tgname='cms_capture_draft_snapshot')
),'IS DISTINCT FROM') > 0,'a save that does not change the payload captures nothing');

-- Os gatilhos que ja existiam no rascunho continuam la: acrescentar nao pode ter deslocado.
select ok(exists(
  select 1 from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.cms_content_drafts'::regclass
    and t.tgname = 'cms_draft_edit_opens_workflow'
    and not t.tgisinternal
),'the pre-existing workflow-opening trigger survived');

-- A captura engole a propria falha DE PROPOSITO. Se alguem remover o bloco, um erro de
-- instantaneo passa a derrubar todo salvamento de todo tipo de conteudo.
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_draft_snapshot()'::regprocedure
),'exception') > 0,'the capture swallows its own failure so a save is never blocked');

-- O gatilho precisa honrar o sinal de compensacao da QA, como o irmao instalado pela 0086. Sem
-- isso ele captura a propria reescrita compensatoria e deixa payload sintetico legivel no livro —
-- residuo, que e o que a compensacao existe para nao deixar.
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_draft_snapshot()'::regprocedure
),'cms.qa_compensating') > 0,'the capture honours the QA compensation signal like its sibling');

-- A retencao e lida DENTRO do bloco protegido. Inicializador de DECLARE roda fora do alcance do
-- handler, e um erro ali derrubaria todo salvamento de todo tipo de conteudo.
select is(strpos(
  substring(pg_get_functiondef('private.cms_capture_draft_snapshot()'::regprocedure)
            from 'declare(.*?)begin'),
  'cms_draft_snapshot_retention'),0,
  'the retention lookup is not in the declare section, where the handler cannot reach it');
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_draft_snapshot()'::regprocedure
),'CMS_DRAFT_SNAPSHOT_CAPTURE_FAILED') > 0,'a swallowed failure is still recorded, not silent');

-- Retencao e desfazer de curto prazo, nao historico. Historico e revisao.
select is((select private.cms_draft_snapshot_retention()),20,
  'the retention window is the declared twenty');
select ok(strpos(pg_get_functiondef(
  'private.cms_capture_draft_snapshot()'::regprocedure
),'delete from public.cms_content_draft_snapshots') > 0,
  'the capture prunes beyond the retention window');

-- Alcance: ler e permitido a quem ja podia ler o rascunho; escrever nao e permitido a ninguem
-- pela tabela.
select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.cms_content_draft_snapshots'::regclass),
  'row level security is enabled on the snapshot table');

-- Conferir a PRESENCA dos dois nomes nao prova o espelhamento: uma politica que ligasse as duas
-- condicoes por OR conteria os mesmos dois nomes e passaria — e um OR seria mais permissivo que a
-- politica do rascunho, vazando por caminho novo o conteudo que ela protege. O que importa e a
-- CONJUNCAO, e a ausencia de disjuncao no nivel de cima.
select ok(exists(
  select 1 from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename='cms_content_draft_snapshots'
    and p.policyname='cms_content_draft_snapshots_authorized_read'
    and p.qual like '%cms_content_item_session_read_allowed%'
    and p.qual like '%cms_can_read_content%'
),'the read policy names both conditions of the draft policy');

select is((select strpos(upper(p.qual), ' OR ') from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename='cms_content_draft_snapshots'
    and p.policyname='cms_content_draft_snapshots_authorized_read'),0,
  'the two conditions are conjoined, never disjoined -- an OR would be wider than the draft policy');

-- A politica so filtra quem ja pode SELECIONAR. Sem o grant ela e decorativa, e a tela de versoes
-- anteriores apareceria sempre vazia.
select is(has_table_privilege('authenticated','public.cms_content_draft_snapshots','SELECT'),true,
  'an authenticated caller can reach the table for the policy to filter');
select is(has_table_privilege('service_role','public.cms_content_draft_snapshots','INSERT'),true,
  'the service role can still write the table');

select isnt(has_table_privilege('authenticated','public.cms_content_draft_snapshots','INSERT'),true,
  'an authenticated caller cannot write a snapshot directly');
select isnt(has_table_privilege('authenticated','public.cms_content_draft_snapshots','DELETE'),true,
  'an authenticated caller cannot erase a snapshot');
select isnt(has_function_privilege('authenticated',
  'private.cms_capture_draft_snapshot()','EXECUTE'),true,
  'the capture function is unreachable to an authenticated caller');

select * from finish();
rollback;
