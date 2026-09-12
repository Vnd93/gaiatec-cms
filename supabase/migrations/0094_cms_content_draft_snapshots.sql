-- Rede de seguranca do rascunho: o que havia antes do ultimo salvamento.
--
-- O ramo `save` de cms_execute_editorial_command (0015 linhas 137 a 151, redefinido pela 0069)
-- faz `update cms_content_drafts set payload = p_payload` e incrementa lock_version. Ele NAO
-- congela revisao: revisao so nasce no `submit` (0015 linhas 153 a 165). Entre dois submits, cada
-- salvamento apaga os bytes anteriores. E a copia local do navegador e limpa justamente no
-- salvamento bem-sucedido (AdminPageBuilderPage.tsx, backup.clear()).
--
-- Resultado hoje: um salvamento errado nao tem desfazer em lugar nenhum.
--
-- POR QUE GATILHO, E NAO REMENDO NO COMANDO
-- O gatilho pega TODO caminho que escreve no rascunho, nao apenas a acao `save` — inclusive a
-- versao da 0069 e qualquer versao futura. Remendar uma funcao pegaria um caminho so, e esta base
-- ja mostrou que funcoes sao reescritas por baixo (0055 linhas 50 a 92).
--
-- POR QUE O GATILHO ENGOLE A PROPRIA FALHA
-- Ele roda no caminho quente de todo salvamento de todo tipo de conteudo. Se levantar excecao,
-- ninguem salva nada. Perder um instantaneo e ruim; impedir o operador de salvar e pior. A escolha
-- esta explicita no corpo, com o erro registrado em warning, para nao virar silencio.
--
-- RESTAURAR NAO GANHA CAMINHO NOVO
-- De proposito. A tela le o payload do instantaneo e chama o `save` que ja existe, herdando
-- validacao, permissao, trava de concorrencia e auditoria. Um caminho de escrita paralelo seria
-- superficie nova sem nenhuma dessas garantias.

create table public.cms_content_draft_snapshots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete cascade,
  lock_version bigint not null,
  schema_version integer not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  seo jsonb,
  provenance jsonb,
  displaced_by uuid references auth.users (id) on delete set null,
  captured_at timestamptz not null default statement_timestamp()
);

create index cms_content_draft_snapshots_item_idx
  on public.cms_content_draft_snapshots (item_id, captured_at desc, id desc);

alter table public.cms_content_draft_snapshots enable row level security;

-- Mesma visibilidade do proprio rascunho: espelha cms_content_drafts_authorized_read (0069:2294).
-- Nao e heranca automatica, e copia deliberada — se a politica do rascunho mudar, esta precisa
-- mudar junto, e o teste de contrato exige as duas condicoes aqui.
create policy cms_content_draft_snapshots_authorized_read
on public.cms_content_draft_snapshots
for select to authenticated using (
  public.cms_content_item_session_read_allowed(item_id)
  and exists (
    select 1 from public.cms_content_items item
    where item.id = item_id and public.cms_can_read_content(item.content_type)
  )
);

revoke insert, update, delete on public.cms_content_draft_snapshots from public, anon, authenticated;

-- Quantos instantaneos por item. Limite baixo de proposito: isto e desfazer de curto prazo, nao
-- historico editorial. Historico e revisao, e revisao nasce no submit.
create or replace function private.cms_draft_snapshot_retention()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 20 $$;

create or replace function private.cms_capture_draft_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_retention constant integer := private.cms_draft_snapshot_retention();
begin
  begin
    insert into public.cms_content_draft_snapshots (
      item_id, lock_version, schema_version, payload, seo, provenance, displaced_by
    ) values (
      old.item_id, old.lock_version, old.schema_version, old.payload, old.seo, old.provenance,
      new.updated_by
    );

    delete from public.cms_content_draft_snapshots snapshot
    where snapshot.item_id = old.item_id
      and snapshot.id not in (
        select keep.id from public.cms_content_draft_snapshots keep
        where keep.item_id = old.item_id
        order by keep.captured_at desc, keep.id desc
        limit v_retention
      );
  exception
    when others then
      -- Perder o instantaneo nao pode custar o salvamento. Registrado para nao virar silencio.
      raise warning 'CMS_DRAFT_SNAPSHOT_CAPTURE_FAILED:%:%', old.item_id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger cms_capture_draft_snapshot
after update of payload on public.cms_content_drafts
for each row
when (old.payload is distinct from new.payload)
execute function private.cms_capture_draft_snapshot();

revoke all on function private.cms_capture_draft_snapshot() from public, anon, authenticated;
revoke all on function private.cms_draft_snapshot_retention() from public, anon, authenticated;

comment on table public.cms_content_draft_snapshots is
  'O payload do rascunho imediatamente antes de cada salvamento que o alterou. Desfazer de curto prazo; historico editorial continua sendo cms_content_revisions.';
comment on function private.cms_capture_draft_snapshot() is
  'Gatilho no caminho quente do salvamento. Engole a propria falha de proposito: perder instantaneo e ruim, impedir o salvamento e pior.';
