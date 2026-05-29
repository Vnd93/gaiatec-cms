-- ============================================================================
-- RDO 0003 — Dados do cliente via CNPJ (BrasilAPI) + CREA do engenheiro
--   cnpj/razao_social/nome_fantasia/endereco_cliente: preenchidos pela consulta
--   do CNPJ na BrasilAPI (Receita Federal). crea: registro do eng. responsável.
-- Todas as colunas são opcionais (o relatório pode ser salvo sem CNPJ/CREA).
-- ============================================================================

alter table public.rdo_relatorios
  add column if not exists cnpj             text,
  add column if not exists razao_social     text,
  add column if not exists nome_fantasia    text,
  add column if not exists endereco_cliente text,
  add column if not exists crea             text;
