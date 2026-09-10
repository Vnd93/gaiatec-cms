begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(9);

-- 0061 exigia blob_disposition = 'removed' para concluir a lease do ator sintetico, e 0063 proibe
-- exatamente essa transicao enquanto o fence canonico estiver ativo. 0090 aceita o estado que o fence
-- impoe, e apenas enquanto ele estiver de fato ativo. Este teste protege as duas metades: a nova
-- tolerancia existe, e nenhuma outra condicao de residuo foi afrouxada.

select ok(to_regprocedure('public.cms_complete_qa_actor_lease(uuid,text,text,text)') is not null,
  'the lease completion entry point is installed');

select ok(strpos(pg_get_functiondef(
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
),'canonical_cleanup_not_before > v_now') > 0,
  'the fenced state is accepted only while the fence is still in the future');
select ok(strpos(pg_get_functiondef(
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
),'access_revoked') > 0,
  'the accepted intermediate state is named explicitly');

-- As demais exigencias continuam intactas.
select ok(strpos(pg_get_functiondef(
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
),'upload_disposition not in') > 0,'the upload disposition requirement survives');
select ok(strpos(pg_get_functiondef(
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
),'CMS_QA_ACTOR_CLEANUP_INCOMPLETE') > 0,'an unclean actor is still refused');
select ok(strpos(pg_get_functiondef(
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
),'banned_until') > 0,'the actor must still be banned before the lease is closed');

-- O fence de 0063 nao pode ter sido tocado: ele continua sendo a regra que impede a escrita.
select ok(to_regprocedure('private.cms_document_canonical_write_fence()') is not null,
  'the canonical write fence is still installed');
select ok(strpos(pg_get_functiondef(
  'private.cms_document_canonical_write_fence()'::regprocedure
),'CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE') > 0,
  'the fence still refuses an early canonical removal');

-- A lease e uma superficie de service_role apenas.
select isnt(has_function_privilege('authenticated',
  'public.cms_complete_qa_actor_lease(uuid,text,text,text)','EXECUTE'),true,
  'lease completion is unreachable to an authenticated caller');

select * from finish();
rollback;
