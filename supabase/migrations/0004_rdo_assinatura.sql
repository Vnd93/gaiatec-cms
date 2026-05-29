-- ============================================================================
-- RDO 0004 — Assinatura eletrônica (Gaiatec + cliente) + dados do eng. cliente
--   Finalizar passa a ser um ato de assinatura: o responsável Gaiatec assina e
--   aceita os termos; o cliente assina na hora OU recebe link p/ assinar remoto.
-- Todas as colunas são opcionais / têm default — relatórios antigos seguem ok.
-- ============================================================================

alter table public.rdo_relatorios
  -- Engenheiro do cliente
  add column if not exists crea_cliente            text,
  add column if not exists email_cliente           text,
  -- Status agregado da assinatura
  add column if not exists assinatura_status        text not null default 'nao_assinado',
  -- Assinatura do responsável Gaiatec (PNG base64 data URL)
  add column if not exists assinatura_gaiatec       text,
  add column if not exists assinatura_gaiatec_nome  text,
  add column if not exists assinatura_gaiatec_em    timestamptz,
  -- Assinatura do cliente (PNG base64 data URL)
  add column if not exists assinatura_cliente       text,
  add column if not exists assinatura_cliente_nome  text,
  add column if not exists assinatura_cliente_em    timestamptz,
  -- Aceite de termos
  add column if not exists termos_aceitos           boolean not null default false,
  add column if not exists termos_versao            text,
  add column if not exists termos_aceito_em         timestamptz,
  -- Fluxo / assinatura remota do cliente
  add column if not exists cliente_assina_na_hora   boolean,
  add column if not exists assinatura_token         uuid,
  add column if not exists assinatura_token_expira  timestamptz;

-- valores de assinatura_status: nao_assinado | aguardando_cliente | assinado_gaiatec | assinado
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rdo_assinatura_status_check'
  ) then
    alter table public.rdo_relatorios
      add constraint rdo_assinatura_status_check
      check (assinatura_status in ('nao_assinado','aguardando_cliente','assinado_gaiatec','assinado'));
  end if;
end$$;

-- Busca por token (página pública de assinatura) — parcial p/ ignorar nulos.
create index if not exists rdo_relatorios_assinatura_token_idx
  on public.rdo_relatorios (assinatura_token)
  where assinatura_token is not null;
