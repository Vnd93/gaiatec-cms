-- ============================================================================
-- RDO 0006 — Assinatura "por fora" também para a Gaiatec (simétrico ao cliente)
--   O responsável Gaiatec pode desenhar OU enviar um PDF assinado externamente
--   (gov.br, certificado ICP-Brasil, etc.). Reusa o bucket privado rdo-assinados.
-- ============================================================================

alter table public.rdo_relatorios
  add column if not exists assinatura_gaiatec_metodo   text,  -- 'desenho' | 'importado'
  add column if not exists assinatura_gaiatec_pdf_path  text,
  add column if not exists assinatura_gaiatec_arquivo   text;
