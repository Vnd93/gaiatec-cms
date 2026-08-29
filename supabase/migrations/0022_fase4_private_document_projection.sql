-- Fase 4 — documentos podem ser servidos por URL oficial ou pelo bucket privado.
alter table public.cms_product_document_projection
  alter column official_url drop not null;

alter table public.cms_product_document_projection
  drop constraint if exists cms_product_document_projection_official_url_check;

alter table public.cms_product_document_projection
  add constraint cms_product_document_projection_official_url_check
  check (official_url is null or official_url ~ '^https://');
