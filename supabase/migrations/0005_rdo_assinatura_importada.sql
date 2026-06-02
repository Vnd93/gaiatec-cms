-- ============================================================================
-- RDO 0005 — Assinatura "por fora": o cliente baixa o PDF, assina em qualquer
-- assinador (gov.br, ICP-Brasil, etc.) e devolve o PDF assinado. Provider-
-- agnóstico: o app não integra nenhuma plataforma, só exporta/importa o PDF.
-- ============================================================================

alter table public.rdo_relatorios
  -- 'desenho' = assinou no canvas | 'importado' = enviou um PDF assinado por fora
  add column if not exists assinatura_cliente_metodo  text,
  add column if not exists assinatura_cliente_pdf_path text,  -- caminho no bucket rdo-assinados
  add column if not exists assinatura_cliente_arquivo  text;  -- nome original do arquivo enviado

-- ── Bucket PRIVADO para os PDFs assinados (contêm dados sensíveis: CPF, cert) ──
insert into storage.buckets (id, name, public)
values ('rdo-assinados', 'rdo-assinados', false)
on conflict (id) do update set public = false;

-- Acesso só a usuários AUTENTICADOS (equipe). O cliente (não autenticado) envia
-- via Edge Function rdo-sign, que usa service_role e ignora a RLS.
drop policy if exists "rdo_assinados_auth_read" on storage.objects;
create policy "rdo_assinados_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'rdo-assinados');

drop policy if exists "rdo_assinados_auth_insert" on storage.objects;
create policy "rdo_assinados_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'rdo-assinados');

drop policy if exists "rdo_assinados_auth_update" on storage.objects;
create policy "rdo_assinados_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'rdo-assinados')
  with check (bucket_id = 'rdo-assinados');

drop policy if exists "rdo_assinados_auth_delete" on storage.objects;
create policy "rdo_assinados_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'rdo-assinados');
