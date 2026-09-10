begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(6);

-- A janela das sobreposicoes de flag deriva do prazo da lease, estendido em 0091, e tinha teto proprio
-- ainda no valor antigo. Com os dois em desacordo o manifesto de capacidades marcava toda flag como
-- indisponivel e o provisionamento do ator sintetico reprovava com sessao valida e nenhuma capacidade.

select ok(to_regprocedure('private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)') is not null,
  'the override window validator is installed');
select ok(strpos(pg_get_functiondef(
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
),'241 minutes') > 0,'the override window follows the lease it derives from');
select is(strpos(pg_get_functiondef(
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
),'120 minutes'),0,'the previous ceiling no longer decides the window');

-- A excecao continua valendo apenas para a lease QA exata: nada disso pode ter sido perdido.
select ok(strpos(pg_get_functiondef(
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
),'cms_qa_actor_marker_is_exact') > 0,'the exact synthetic marker is still required');
select ok(strpos(pg_get_functiondef(
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
),'p_expires_at > p_starts_at') > 0,'the window is still a real interval');
select isnt(has_function_privilege('authenticated',
  'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)','EXECUTE'),true,
  'the validator stays unreachable to an authenticated caller');

select * from finish();
rollback;
