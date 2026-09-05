-- Fase 3 — alinha a persistência ao contrato runtime: proveniência é lista não vazia.

alter table public.cms_content_drafts drop constraint if exists cms_content_drafts_provenance_check;
alter table public.cms_content_drafts add constraint cms_content_drafts_provenance_check
  check (jsonb_typeof(provenance) = 'array' and jsonb_array_length(provenance) > 0);

alter table public.cms_content_revisions drop constraint if exists cms_content_revisions_provenance_check;
alter table public.cms_content_revisions add constraint cms_content_revisions_provenance_check
  check (jsonb_typeof(provenance) = 'array' and jsonb_array_length(provenance) > 0);
