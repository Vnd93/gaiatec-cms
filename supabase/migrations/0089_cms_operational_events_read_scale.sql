begin;

-- A superficie de diagnosticos do admin respondia HTTP 500 com SQLSTATE 57014, statement timeout,
-- ao ler os eventos operacionais nao resolvidos mais recentes. A tabela tinha 1.107 linhas, entao o
-- volume nao era a causa: a leitura sem ordenacao respondia em 557 ms e a mesma leitura com
-- "order by created_at desc" estourava em 8.228 ms.
--
-- Duas causas somadas. A politica instalada em 0076 avalia um unico predicado que recebe o id da
-- linha, e dentro dele reavalia a linhagem de permissao e a permissao da sessao, que nao dependem de
-- linha alguma. Como o predicado inteiro depende da linha, o planejador nao consegue ica-las para
-- fora do laco e as reexecuta para cada linha. Alem disso a tabela nao possuia indice algum alem da
-- chave primaria, entao "order by ... limit" precisava varrer e ordenar tudo antes de o limite valer,
-- levando o predicado caro a rodar nas 1.107 linhas em vez de nas 50 retornadas.
--
-- A conjuncao autorizadora permanece exatamente a mesma. Nada e afrouxado: as tres condicoes
-- continuam obrigatorias, apenas deixam de ser reavaliadas onde nao mudam.

create or replace function public.cms_system_operational_session_scope_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_permission_lineage_allowed(
      auth.uid(),'cms:diagnostics.read',private.cms_user_actor_environment(auth.uid())
    )
    and public.cms_has_permission('cms:diagnostics.read');
$$;

create or replace function public.cms_system_operational_event_row_allowed(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select private.cms_system_operational_event_scope_allowed(
    auth.uid(),p_event_id,private.cms_user_actor_environment(auth.uid())
  );
$$;

revoke all on function public.cms_system_operational_session_scope_allowed()
  from public,anon,authenticated;
grant execute on function public.cms_system_operational_session_scope_allowed() to authenticated;
revoke all on function public.cms_system_operational_event_row_allowed(uuid)
  from public,anon,authenticated;
grant execute on function public.cms_system_operational_event_row_allowed(uuid) to authenticated;

drop policy if exists cms_operational_events_authoritative_read on public.cms_operational_events;
create policy cms_operational_events_authoritative_read
on public.cms_operational_events for select to authenticated
using (
  public.cms_system_operational_session_scope_allowed()
  and public.cms_system_operational_event_row_allowed(id)
);

-- A leitura canonica da tela e "nao resolvidos, mais recentes primeiro". O indice parcial cobre
-- exatamente essa forma, de modo que o limite passa a ser aplicado durante a varredura do indice e o
-- predicado por linha roda apenas nas linhas efetivamente devolvidas.
create index if not exists cms_operational_events_unresolved_recent_idx
  on public.cms_operational_events (created_at desc)
  where resolved_at is null;

-- Leituras historicas, que incluem eventos ja resolvidos, tambem ordenam por recencia.
create index if not exists cms_operational_events_recent_idx
  on public.cms_operational_events (created_at desc);

do $operational_events_read_scale_probe$
declare
  v_policy text;
begin
  select pg_get_expr(polqual, polrelid) into v_policy
  from pg_policy
  where polname = 'cms_operational_events_authoritative_read'
    and polrelid = 'public.cms_operational_events'::regclass;
  if v_policy is null
     or v_policy !~ 'cms_system_operational_session_scope_allowed'
     or v_policy !~ 'cms_system_operational_event_row_allowed' then
    raise exception 'CMS_OPERATIONAL_EVENTS_POLICY_NOT_SPLIT' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'cms_operational_events'
      and indexname = 'cms_operational_events_unresolved_recent_idx'
  ) then
    raise exception 'CMS_OPERATIONAL_EVENTS_INDEX_MISSING' using errcode = '55000';
  end if;
end;
$operational_events_read_scale_probe$;

commit;
