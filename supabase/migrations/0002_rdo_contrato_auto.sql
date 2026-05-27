-- ============================================================================
-- RDO 0002 — Nº de contrato automático (RDO-####) + número do endereço (GPS)
-- ============================================================================

-- Sequência para o número do contrato. Começa em 101 -> "RDO-0101".
create sequence if not exists public.rdo_contrato_seq start 101;

-- A coluna contrato passa a ser preenchida automaticamente no insert.
alter table public.rdo_relatorios
  alter column contrato set default ('RDO-' || lpad(nextval('public.rdo_contrato_seq')::text, 4, '0'));

-- Número do endereço (complemento do GPS / endereço), opcional.
alter table public.rdo_relatorios
  add column if not exists local_numero text;
