-- Biblioteca privada e governada de documentos do CMS.
-- O upload ocorre somente por URL assinada emitida pela Edge Function cms-documents;
-- clientes autenticados podem ler metadados autorizados, mas nunca gravar tabelas ou Storage diretamente.

-- O inventario legado precisa ser estavel entre a validacao e o backfill. Sem
-- estes locks, uma publicacao ou troca de objeto concorrente poderia entrar
-- depois do preflight e antes da criacao do ativo governado.
lock table public.cms_content_items, public.cms_content_drafts,
  public.cms_content_revisions, public.cms_published_projection,
  storage.objects in share mode;

-- Falha antes de qualquer mutacao persistente quando um documento legado nao
-- pode ser convertido sem ambiguidade. O erro inclui somente contagens por
-- classe (nunca nomes, caminhos ou conteudo) e nenhum registro e descartado.
do $$
declare
  v_issue_count bigint;
  v_issue_summary jsonb;
begin
  with legacy_content_versions as (
    select
      publication.item_id,
      publication.payload,
      revision.created_by as observed_by,
      publication.published_at as observed_at,
      3 as source_priority,
      'published:' || publication.item_id::text as source_scope
    from public.cms_published_projection publication
    join public.cms_content_revisions revision
      on revision.id = publication.revision_id
    where publication.content_type = 'product'
    union all
    select
      draft.item_id,
      draft.payload,
      draft.updated_by,
      draft.updated_at,
      2,
      'draft:' || draft.item_id::text
    from public.cms_content_drafts draft
    join public.cms_content_items item on item.id = draft.item_id
    where item.content_type = 'product'
    union all
    select
      revision.item_id,
      revision.payload,
      revision.created_by,
      revision.created_at,
      1,
      'revision:' || revision.id::text
    from public.cms_content_revisions revision
    join public.cms_content_items item on item.id = revision.item_id
    where item.content_type = 'product'
  ), malformed_arrays as (
    select content.item_id
    from legacy_content_versions content
    where content.payload ? 'documents'
      and jsonb_typeof(content.payload -> 'documents') is distinct from 'array'
  ), oversized_arrays as (
    select content.item_id
    from legacy_content_versions content
    where jsonb_array_length(
      case
        when jsonb_typeof(content.payload -> 'documents') = 'array'
          then content.payload -> 'documents'
        else '[]'::jsonb
      end
    ) > 30
  ), document_references as (
    select
      content.item_id,
      content.observed_by,
      content.observed_at,
      content.source_priority,
      content.source_scope,
      document.ordinality,
      document.value,
      lower(nullif(document.value ->> 'id', '')) as id_text,
      nullif(document.value ->> 'storagePath', '') as storage_path,
      nullif(document.value ->> 'officialUrl', '') as official_url
    from legacy_content_versions content
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(content.payload -> 'documents') = 'array'
          then content.payload -> 'documents'
        else '[]'::jsonb
      end
    ) with ordinality as document(value, ordinality)
  ), stored_references as (
    select
      reference.*,
      object.id as object_id,
      object.metadata as object_metadata
    from document_references reference
    left join storage.objects object
      on object.bucket_id = 'cms-documents-private'
     and object.name = reference.storage_path
    where reference.storage_path is not null
  ), external_url_candidates as (
    select
      'document_external_url_invalid'::text as reason,
      jsonb_typeof(reference.value -> 'officialUrl') as url_json_type,
      reference.official_url
    from document_references reference
    where reference.value ? 'officialUrl'
    union all
    select
      'manufacturer_official_url_invalid',
      jsonb_typeof(content.payload #> '{manufacturer,officialUrl}'),
      nullif(content.payload #>> '{manufacturer,officialUrl}', '')
    from legacy_content_versions content
    where content.payload #> '{manufacturer,officialUrl}' is not null
  ), external_references as (
    select
      candidate.*,
      authority.value as url_authority,
      lower(regexp_replace(authority.value, ':[0-9]{1,5}$', '')) as url_host,
      substring(authority.value from ':([0-9]{1,5})$') as url_port
    from external_url_candidates candidate
    cross join lateral (
      select split_part(
        split_part(split_part(substr(coalesce(candidate.official_url, ''), 9), '/', 1), '?', 1),
        '#',
        1
      ) as value
    ) authority
  ), issue_rows as (
    select 'documents_not_array'::text as reason from malformed_arrays
    union all
    select 'documents_limit_exceeded' from oversized_arrays
    union all
    select 'document_not_object' from document_references
      where jsonb_typeof(value) is distinct from 'object'
    union all
    select 'document_unknown_field' from document_references
      where jsonb_typeof(value) = 'object'
        and exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end
          ) as key
          where key <> all(array[
            'id','kind','title','officialUrl','storagePath','sha256',
            'revision','language','visibility','rightsConfirmed'
          ])
        )
    union all
    select 'document_external_reference_ungoverned' from document_references
      where source_scope like 'published:%'
        and jsonb_typeof(value) = 'object'
        and value ? 'officialUrl'
    union all
    select 'document_location_invalid' from document_references
      where jsonb_typeof(value) = 'object'
        and not (
          (
            not (value ? 'storagePath')
            and jsonb_typeof(value -> 'officialUrl') = 'string'
            and official_url is not null
          )
          or (
            not (value ? 'officialUrl')
            and jsonb_typeof(value -> 'storagePath') = 'string'
            and storage_path is not null
          )
        )
    union all
    select 'document_id_invalid' from document_references
      where jsonb_typeof(value -> 'id') is distinct from 'string'
         or id_text is null
         or id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    union all
    select reason from external_references
      where url_json_type is distinct from 'string'
         or official_url is null
         or char_length(official_url) > 500
         or official_url !~* '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?$'
         or position('@' in url_authority) > 0
         or char_length(url_host) > 253
         or url_host not like '%.%'
         or url_host = 'localhost'
         or url_host like '%.localhost'
         or url_host like '%.local'
         or url_host like '%.internal'
         or exists (
           select 1
           from unnest(string_to_array(url_host, '.')) as label(value)
           where label.value !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
         )
         or (
           url_host ~ '^[0-9.]+$'
           and (
             url_host !~ '^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$'
             or exists (
               select 1
               from unnest(string_to_array(url_host, '.')) as octet(value)
               where case
                 when octet.value ~ '^[0-9]{1,3}$'
                   then octet.value::integer not between 0 and 255
                 else true
               end
             )
           )
         )
         or url_host ~ '^(0|10|127)\.'
         or url_host ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'
         or url_host ~ '^169\.254\.'
         or url_host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
         or url_host ~ '^192\.168\.'
         or url_host ~ '^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\.'
         or case
           when url_port ~ '^[0-9]{1,5}$' then url_port::integer > 65535
           else false
         end
    union all
    select 'document_storage_path_invalid' from stored_references
      where jsonb_typeof(value -> 'storagePath') is distinct from 'string'
         or storage_path !~ '^cms-documents/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'
         or split_part(storage_path, '/', 2) is distinct from id_text
         or char_length(split_part(storage_path, '/', 3)) not between 1 and 180
    union all
    select 'document_storage_object_missing' from stored_references
      where object_id is null
    union all
    select 'document_storage_mime_invalid' from stored_references
      where lower(coalesce(object_metadata ->> 'mimetype', '')) <> 'application/pdf'
    union all
    select 'document_storage_size_invalid' from stored_references
      where case
        when coalesce(object_metadata ->> 'size', '') ~ '^[0-9]{1,8}$'
          then (object_metadata ->> 'size')::bigint between 8 and 20971520
        else false
      end is not true
    union all
    select 'document_kind_invalid' from document_references
      where jsonb_typeof(value -> 'kind') is distinct from 'string'
         or coalesce(value ->> 'kind', '') not in (
        'datasheet', 'manual', 'certificate', 'drawing', 'software', 'other'
      )
    union all
    select 'document_title_invalid' from document_references
      where jsonb_typeof(value -> 'title') is distinct from 'string'
         or char_length(btrim(coalesce(value ->> 'title', ''))) not between 1 and 180
    union all
    select 'document_revision_invalid' from document_references
      where jsonb_typeof(value -> 'revision') is distinct from 'string'
         or char_length(btrim(coalesce(value ->> 'revision', ''))) not between 1 and 80
    union all
    select 'document_language_invalid' from document_references
      where jsonb_typeof(value -> 'language') is distinct from 'string'
         or coalesce(value ->> 'language', '') !~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$'
    union all
    select 'document_visibility_invalid' from document_references
      where jsonb_typeof(value -> 'visibility') is distinct from 'string'
         or coalesce(value ->> 'visibility', '') not in ('public', 'private')
    union all
    select 'document_sha256_invalid' from document_references
      where jsonb_typeof(value -> 'sha256') is distinct from 'string'
         or coalesce(value ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
    union all
    select 'document_rights_unconfirmed' from document_references
      where jsonb_typeof(value -> 'rightsConfirmed') is distinct from 'boolean'
         or value -> 'rightsConfirmed' is distinct from 'true'::jsonb
    union all
    select 'document_duplicate_in_version'
    from document_references
    group by source_scope, id_text
    having count(*) > 1
    union all
    select 'document_id_conflict'
    from stored_references
    group by id_text
    having count(distinct jsonb_build_array(
      storage_path,
      value ->> 'kind',
      value ->> 'title',
      value ->> 'revision',
      lower(value ->> 'language'),
      value ->> 'visibility',
      value ->> 'sha256',
      value ->> 'rightsConfirmed'
    )) > 1
    union all
    select 'document_storage_identity_conflict'
    from stored_references
    group by storage_path
    having count(distinct id_text) > 1
  ), issue_counts as (
    select reason, count(*)::bigint as total
    from issue_rows
    group by reason
  )
  select
    coalesce(sum(total), 0),
    coalesce(jsonb_object_agg(reason, total order by reason), '{}'::jsonb)
  into v_issue_count, v_issue_summary
  from issue_counts;

  if v_issue_count > 0 then
    raise exception 'CMS_LEGACY_DOCUMENT_BACKFILL_PREFLIGHT_FAILED'
      using
        errcode = '23514',
        detail = format(
          'validation_issue_count=%s reason_counts=%s',
          v_issue_count,
          v_issue_summary::text
        ),
        hint = 'Corrija os metadados legados sem apagar os registros e reaplique a migration 0057.';
  end if;
end;
$$;

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:documents.read', 'Consultar documentos privados governados do CMS.', false),
  ('cms:documents.upload', 'Enviar documentos privados para quarentena e pre-filtro estrutural.', true),
  ('cms:documents.manage', 'Arquivar e administrar documentos privados do CMS.', true),
  ('cms:documents.security_review', 'Atestar em segundo ator o resultado de scanner corporativo para documentos.', true)
on conflict (permission_key) do update set
  description = excluded.description,
  critical = excluded.critical;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('super_admin', 'cms:documents.read'),
  ('super_admin', 'cms:documents.upload'),
  ('super_admin', 'cms:documents.manage'),
  ('super_admin', 'cms:documents.security_review'),
  ('admin', 'cms:documents.read'),
  ('admin', 'cms:documents.upload'),
  ('admin', 'cms:documents.manage'),
  ('commercial', 'cms:documents.read'),
  ('commercial', 'cms:documents.upload'),
  ('technical', 'cms:documents.read'),
  ('technical', 'cms:documents.upload'),
  ('editor', 'cms:documents.read'),
  ('editor', 'cms:documents.upload'),
  ('marketing', 'cms:documents.read'),
  ('reviewer', 'cms:documents.read'),
  ('reviewer', 'cms:documents.security_review')
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cms-documents-private', 'cms-documents-private', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Um documento governado pode ser reutilizado por mais de um produto. A
-- identidade da projecao e o par produto/documento, nao o UUID do ativo.
alter table public.cms_product_document_projection
  drop constraint if exists cms_product_document_projection_pkey;
alter table public.cms_product_document_projection
  add constraint cms_product_document_projection_pkey primary key (item_id, id);
create index if not exists cms_product_document_projection_document_idx
  on public.cms_product_document_projection (id, item_id);

create table public.cms_document_assets (
  id uuid primary key,
  storage_path text not null unique
    check (storage_path ~ '^cms-documents/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'),
  upload_path text not null unique
    check (upload_path ~ '^cms-document-uploads/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'),
  upload_token_expires_at timestamptz,
  upload_disposition text not null default 'reserved'
    check (upload_disposition in ('reserved', 'accepting', 'guarded', 'cleanup_pending', 'removed')),
  upload_cleanup_attempts integer not null default 0 check (upload_cleanup_attempts >= 0),
  upload_cleanup_last_attempt_at timestamptz,
  upload_cleanup_last_error_code text check (
    upload_cleanup_last_error_code is null
    or upload_cleanup_last_error_code in (
      'storage_remove_failed', 'storage_verify_failed', 'storage_residue',
      'storage_guard_failed', 'storage_guard_verify_failed', 'database_confirm_failed'
    )
  ),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  kind text not null check (kind in ('datasheet', 'manual', 'certificate', 'drawing', 'software', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  revision text not null check (char_length(btrim(revision)) between 1 and 80),
  language text not null check (language ~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$'),
  visibility text not null check (visibility in ('public', 'private')),
  declared_mime text not null default 'application/pdf' check (declared_mime = 'application/pdf'),
  detected_mime text check (detected_mime is null or detected_mime = 'application/pdf'),
  byte_size bigint check (byte_size is null or byte_size between 8 and 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'awaiting_upload'
    check (processing_status in ('awaiting_upload', 'finalizing', 'quarantined', 'ready', 'rejected', 'neutralized')),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'rejected')),
  scan_engine text,
  prefilter_engine text,
  prefiltered_at timestamptz,
  security_reviewed_by uuid references public.cms_profiles (user_id) on delete set null,
  security_reviewed_at timestamptz,
  scanner_evidence_sha256 text check (
    scanner_evidence_sha256 is null or scanner_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  scanner_evidence_reference text check (
    scanner_evidence_reference is null
    or char_length(btrim(scanner_evidence_reference)) between 3 and 180
  ),
  source_kind text not null
    check (source_kind in ('synthetic_test', 'owner_authored', 'official_manufacturer', 'official_company', 'legacy_import')),
  source_reference text not null check (char_length(btrim(source_reference)) between 3 and 500),
  synthetic_expires_at timestamptz,
  license_name text not null check (char_length(btrim(license_name)) between 2 and 120),
  owner_name text not null check (char_length(btrim(owner_name)) between 2 and 120),
  rights_confirmed boolean not null check (rights_confirmed),
  created_by uuid references public.cms_profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.cms_profiles (user_id) on delete set null,
  neutralized_at timestamptz,
  neutralized_by uuid references public.cms_profiles (user_id) on delete set null,
  blob_disposition text not null default 'available'
    check (blob_disposition in ('available', 'access_revoked', 'removed')),
  blob_cleanup_attempts integer not null default 0 check (blob_cleanup_attempts >= 0),
  blob_cleanup_last_attempt_at timestamptz,
  blob_cleanup_last_error_code text check (
    blob_cleanup_last_error_code is null
    or blob_cleanup_last_error_code in (
      'storage_remove_failed', 'storage_verify_failed', 'storage_residue', 'database_confirm_failed'
    )
  ),
  finalization_claim_id uuid,
  finalization_claimed_at timestamptz,
  finalization_claim_expires_at timestamptz,
  -- Fence separado do estado editorial. Ele sobrevive a uma neutralizacao ou
  -- rejeicao concorrente para que o reconciliador nunca declare o caminho
  -- canonico ausente enquanto uma Edge Function ainda possa conclui-lo.
  canonical_write_claim_id uuid,
  canonical_write_claim_expires_at timestamptz,
  canonical_cleanup_not_before timestamptz,
  canonical_cleanup_verify_until timestamptz,
  lock_version bigint not null default 1 check (lock_version > 0),
  updated_at timestamptz not null default now(),
  check (processing_status not in ('quarantined', 'ready') or (
    detected_mime = 'application/pdf' and byte_size is not null and sha256 is not null
    and prefilter_engine in ('pdf-passive-prefilter-v2', 'legacy-unverified-import-v1')
    and prefiltered_at is not null
  )),
  check (processing_status <> 'quarantined' or (
    scan_status = 'pending' and scan_engine is null and security_reviewed_at is null
    and security_reviewed_by is null and scanner_evidence_sha256 is null
    and scanner_evidence_reference is null and processed_at is null
  )),
  check (processing_status <> 'ready' or (
    (scan_status = 'clean' and scan_engine in (
      'clamav-corporate-v1', 'microsoft-defender-corporate-v1', 'qa-synthetic-attestation-v1'
    ) and security_reviewed_by is not null and security_reviewed_at is not null
      and scanner_evidence_sha256 is not null and scanner_evidence_reference is not null
      and processed_at is not null)
  )),
  check (processing_status <> 'neutralized' or (
    source_kind = 'synthetic_test'
    and archived_at is not null
    and neutralized_at is not null
    and neutralized_by is not null
    and blob_disposition in ('access_revoked', 'removed')
  )),
  check (processing_status <> 'rejected' or blob_disposition in ('access_revoked', 'removed')),
  check (
    (upload_disposition = 'reserved' and upload_token_expires_at is null)
    or (upload_disposition in ('accepting', 'guarded', 'cleanup_pending') and upload_token_expires_at is not null)
    or upload_disposition = 'removed'
  ),
  check (
    (processing_status = 'finalizing'
      and finalization_claim_id is not null
      and finalization_claimed_at is not null
      and finalization_claim_expires_at > finalization_claimed_at)
    or (processing_status <> 'finalizing'
      and finalization_claim_id is null
      and finalization_claimed_at is null
      and finalization_claim_expires_at is null)
  ),
  check (
    (canonical_write_claim_id is null and canonical_write_claim_expires_at is null)
    or (canonical_write_claim_id is not null and canonical_write_claim_expires_at is not null)
  ),
  check (
    canonical_cleanup_verify_until is null
    or (
      canonical_cleanup_not_before is not null
      and canonical_cleanup_verify_until > canonical_cleanup_not_before
    )
  )
);

create table public.cms_document_security_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.cms_document_assets (id) on delete restrict,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  reviewer_id uuid references public.cms_profiles (user_id) on delete set null,
  decision text not null check (decision in ('approve', 'reject')),
  scanner_engine text not null check (scanner_engine in (
    'clamav-corporate-v1', 'microsoft-defender-corporate-v1', 'qa-synthetic-attestation-v1'
  )),
  scanner_verdict text not null check (scanner_verdict in ('clean', 'malicious', 'suspicious', 'scan_failed')),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 3 and 180),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, document_sha256),
  check (
    (decision = 'approve' and scanner_verdict = 'clean')
    or (decision = 'reject' and scanner_verdict <> 'clean')
  )
);

create or replace function public.cms_document_security_review_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'CMS_DOCUMENT_SECURITY_REVIEW_IMMUTABLE' using errcode = '42501';
end;
$$;

create trigger cms_document_security_review_immutable
before update or delete on public.cms_document_security_reviews
for each row execute function public.cms_document_security_review_immutable();

create index cms_document_assets_sha256_idx
on public.cms_document_assets (sha256)
where processing_status in ('quarantined', 'ready') and archived_at is null;

create index cms_document_assets_library_idx
on public.cms_document_assets (processing_status, archived_at, created_at desc);

create table public.cms_document_command_receipts (
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in (
    'reserve_upload', 'finalize_upload', 'reject_upload', 'security_review', 'neutralize_document',
    'archive_document', 'restore_document'
  )),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  document_id uuid references public.cms_document_assets (id) on delete restrict,
  correlation_id uuid not null,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_id, action, idempotency_key)
);

alter table public.cms_document_assets enable row level security;
alter table public.cms_document_command_receipts enable row level security;
alter table public.cms_document_security_reviews enable row level security;

revoke all on table public.cms_document_assets, public.cms_document_command_receipts,
  public.cms_document_security_reviews
from public, anon, authenticated;
grant all on public.cms_document_assets, public.cms_document_command_receipts,
  public.cms_document_security_reviews to service_role;

-- Implementacao conservadora usada enquanto a migration de leases QA ainda
-- nao foi aplicada. A migration 0063 substitui esta funcao por uma decisao
-- server-side que classifica para sempre qualquer ator que possua lease QA.
create or replace function private.cms_document_actor_scope_allowed(
  p_actor_id uuid,
  p_source_kind text,
  p_source_reference text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p_actor_id is not null
    and p_source_kind <> 'synthetic_test'
    and nullif(btrim(p_source_reference), '') is not null;
$$;

-- Bridge para o conjunto de migrations: antes de 0061 ainda nao existem
-- identidades QA com lease. A implementacao real substitui esta funcao assim
-- que a tabela de leases e criada, sem deixar os RPCs de 0057 temporariamente
-- irresoluveis durante um db push incremental.
create or replace function private.cms_lock_active_qa_actor_leases(p_actor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
begin
  return;
end;
$$;

revoke all on function private.cms_lock_active_qa_actor_leases(uuid[])
  from public, anon, authenticated, service_role;

revoke all on function private.cms_document_actor_scope_allowed(uuid,text,text)
from public, anon, authenticated, service_role;

create or replace function public.cms_reserve_document_asset(
  p_actor_id uuid,
  p_document_id uuid,
  p_storage_path text,
  p_upload_path text,
  p_original_filename text,
  p_kind text,
  p_title text,
  p_revision text,
  p_language text,
  p_visibility text,
  p_source_kind text,
  p_source_reference text,
  p_license_name text,
  p_owner_name text,
  p_rights_confirmed boolean,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.cms_document_command_receipts%rowtype;
  v_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'cms-document-command:' || p_actor_id::text || ':reserve_upload:' || p_idempotency_key::text,
    0
  ));
  select * into v_receipt
  from public.cms_document_command_receipts
  where actor_id = p_actor_id and action = 'reserve_upload' and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_aal <> 'aal2' then
    raise exception 'CMS_DOCUMENT_MFA_REQUIRED' using errcode = '42501';
  end if;
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.upload', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  if not private.cms_document_actor_scope_allowed(
    p_actor_id, p_source_kind, p_source_reference
  ) then
    raise exception 'CMS_DOCUMENT_SYNTHETIC_SCOPE_INVALID' using errcode = '42501';
  end if;
  if p_storage_path !~ ('^cms-documents/' || p_document_id::text || '/[A-Za-z0-9._-]+\.pdf$') then
    raise exception 'CMS_DOCUMENT_PATH_INVALID' using errcode = '22023';
  end if;
  if p_upload_path !~ ('^cms-document-uploads/' || p_document_id::text || '/[A-Za-z0-9._-]+\.pdf$') then
    raise exception 'CMS_DOCUMENT_UPLOAD_PATH_INVALID' using errcode = '22023';
  end if;

  insert into public.cms_document_assets (
    id, storage_path, upload_path, original_filename, kind, title, revision, language, visibility,
    source_kind, source_reference, license_name, owner_name, rights_confirmed, created_by
  ) values (
    p_document_id, p_storage_path, p_upload_path, btrim(p_original_filename), p_kind, btrim(p_title),
    btrim(p_revision), lower(btrim(p_language)), p_visibility, p_source_kind,
    btrim(p_source_reference), btrim(p_license_name), btrim(p_owner_name),
    p_rights_confirmed, p_actor_id
  );

  v_response := jsonb_build_object(
    'document', jsonb_build_object(
      'id', p_document_id,
      'kind', p_kind,
      'title', btrim(p_title),
      'storagePath', p_storage_path,
      'uploadPath', p_upload_path,
      'revision', btrim(p_revision),
      'language', lower(btrim(p_language)),
      'visibility', p_visibility,
      'rightsConfirmed', true
    ),
    'status', 'awaiting_upload',
    'correlationId', p_correlation_id,
    'replayed', false
  );
  insert into public.cms_document_command_receipts (
    actor_id, action, idempotency_key, request_hash, document_id, correlation_id, response
  ) values (
    p_actor_id, 'reserve_upload', p_idempotency_key, p_request_hash,
    p_document_id, p_correlation_id, v_response
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:documents.reserve', 'document_asset', p_document_id::text,
    jsonb_build_object('kind', p_kind, 'visibility', p_visibility), p_correlation_id
  );
  return v_response;
end;
$$;

create or replace function public.cms_finalize_document_asset(
  p_actor_id uuid,
  p_document_id uuid,
  p_byte_size bigint,
  p_sha256 text,
  p_scan_engine text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.cms_document_command_receipts%rowtype;
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
  v_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'cms-document-command:' || p_actor_id::text || ':finalize_upload:' || p_idempotency_key::text,
    0
  ));
  select * into v_receipt
  from public.cms_document_command_receipts
  where actor_id = p_actor_id and action = 'finalize_upload' and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_aal <> 'aal2' then
    raise exception 'CMS_DOCUMENT_MFA_REQUIRED' using errcode = '42501';
  end if;
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.upload', p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501'; end if;

  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found then raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset from public.cms_document_assets where id = p_document_id for update;
  if not found or v_asset.created_by is distinct from v_asset_creator then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.cms_document_actor_scope_allowed(
    p_actor_id, v_asset.source_kind, v_asset.source_reference
  ) then
    raise exception 'CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_asset.created_by is distinct from p_actor_id and not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.manage', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_asset.processing_status in ('quarantined', 'ready') then
    if v_asset.sha256 <> p_sha256 then
      raise exception 'CMS_DOCUMENT_ALREADY_FINALIZED' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'document', jsonb_build_object(
        'id', v_asset.id, 'kind', v_asset.kind, 'title', v_asset.title,
        'storagePath', v_asset.storage_path, 'sha256', v_asset.sha256,
        'revision', v_asset.revision, 'language', v_asset.language,
        'visibility', v_asset.visibility, 'rightsConfirmed', true
      ),
      'status', v_asset.processing_status, 'correlationId', p_correlation_id, 'replayed', true
    );
  end if;
  if v_asset.processing_status <> 'finalizing'
     or v_asset.finalization_claim_id is distinct from p_idempotency_key
     or v_asset.finalization_claim_expires_at <= statement_timestamp() then
    raise exception 'CMS_DOCUMENT_FINALIZATION_CLOSED' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sha256, 0));
  if exists (
    select 1 from public.cms_document_assets duplicate
    where duplicate.sha256 = p_sha256
      and duplicate.id <> p_document_id
      and duplicate.processing_status in ('quarantined', 'ready')
      and duplicate.archived_at is null
      and private.cms_document_actor_scope_allowed(
        p_actor_id,
        duplicate.source_kind,
        duplicate.source_reference
      )
  ) then
    raise exception 'CMS_DOCUMENT_DUPLICATE' using errcode = '23505';
  end if;

  update public.cms_document_assets set
    detected_mime = 'application/pdf', byte_size = p_byte_size, sha256 = p_sha256,
    processing_status = 'quarantined', scan_status = 'pending', scan_engine = null,
    prefilter_engine = p_scan_engine, prefiltered_at = now(), processed_at = null,
    finalization_claim_id = null, finalization_claimed_at = null,
    finalization_claim_expires_at = null, updated_at = now()
  where id = p_document_id returning * into v_asset;

  v_response := jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_asset.id, 'kind', v_asset.kind, 'title', v_asset.title,
      'storagePath', v_asset.storage_path, 'sha256', v_asset.sha256,
      'revision', v_asset.revision, 'language', v_asset.language,
      'visibility', v_asset.visibility, 'rightsConfirmed', true
    ),
    'status', 'quarantined',
    'correlationId', p_correlation_id,
    'replayed', false
  );
  insert into public.cms_document_command_receipts (
    actor_id, action, idempotency_key, request_hash, document_id, correlation_id, response
  ) values (
    p_actor_id, 'finalize_upload', p_idempotency_key, p_request_hash,
    p_document_id, p_correlation_id, v_response
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:documents.finalize', 'document_asset', p_document_id::text,
    jsonb_build_object(
      'byteSize', p_byte_size, 'sha256', p_sha256,
       'kind', v_asset.kind, 'visibility', v_asset.visibility,
       'prefilterEngine', p_scan_engine, 'securityReviewRequired', true
    ), p_correlation_id
  );
  return v_response;
end;
$$;

create or replace function public.cms_reject_document_asset(
  p_actor_id uuid,
  p_document_id uuid,
  p_reason_code text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_finalization_claim_id uuid,
  p_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
begin
  if p_aal <> 'aal2' then
    raise exception 'CMS_DOCUMENT_MFA_REQUIRED' using errcode = '42501';
  end if;
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.upload', p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501'; end if;
  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found then return; end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset from public.cms_document_assets where id = p_document_id for update;
  if not found or v_asset.created_by is distinct from v_asset_creator then return; end if;
  if not private.cms_document_actor_scope_allowed(
    p_actor_id, v_asset.source_kind, v_asset.source_reference
  ) then
    raise exception 'CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_asset.created_by is distinct from p_actor_id and not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.manage', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_asset.processing_status not in ('awaiting_upload', 'finalizing') then return; end if;
  if v_asset.processing_status = 'finalizing'
     and v_asset.finalization_claim_id is distinct from p_finalization_claim_id then
    raise exception 'CMS_DOCUMENT_FINALIZATION_CLAIM_INVALID' using errcode = '42501';
  end if;
  update public.cms_document_assets set
    processing_status = 'rejected', scan_status = 'rejected', scan_engine = p_reason_code,
    blob_disposition = 'access_revoked', processed_at = now(),
    finalization_claim_id = null, finalization_claimed_at = null,
    finalization_claim_expires_at = null, updated_at = now()
  where id = p_document_id;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:documents.reject', 'document_asset', p_document_id::text,
    jsonb_build_object('reasonCode', p_reason_code), p_correlation_id
  );
end;
$$;

create or replace function public.cms_transition_document_asset(
  p_actor_id uuid,
  p_document_id uuid,
  p_action text,
  p_expected_lock_version bigint,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.cms_document_command_receipts%rowtype;
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
  v_response jsonb;
  v_target_state text;
begin
  if p_action not in ('archive_document', 'restore_document') then
    raise exception 'CMS_DOCUMENT_TRANSITION_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'cms-document-command:' || p_actor_id::text || ':' || p_action || ':' || p_idempotency_key::text,
    0
  ));
  select * into v_receipt
  from public.cms_document_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  if p_aal <> 'aal2' then
    raise exception 'CMS_DOCUMENT_MFA_REQUIRED' using errcode = '42501';
  end if;
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.manage', p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501'; end if;

  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found then raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset from public.cms_document_assets where id = p_document_id for update;
  if not found or v_asset.created_by is distinct from v_asset_creator then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.cms_document_actor_scope_allowed(
    p_actor_id, v_asset.source_kind, v_asset.source_reference
  ) then
    raise exception 'CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_asset.lock_version <> p_expected_lock_version then
    raise exception 'CMS_DOCUMENT_LOCK_CONFLICT' using errcode = '40001';
  end if;
  if v_asset.processing_status <> 'ready' or v_asset.scan_status <> 'clean' then
    raise exception 'CMS_DOCUMENT_TRANSITION_INVALID' using errcode = '23514';
  end if;

  if p_action = 'archive_document' then
    if v_asset.archived_at is not null then
      raise exception 'CMS_DOCUMENT_ALREADY_ARCHIVED' using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.cms_published_projection publication
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(publication.payload -> 'documents') = 'array'
            then publication.payload -> 'documents'
          else '[]'::jsonb
        end
      ) document
      where lower(document ->> 'id') = p_document_id::text
        and document ->> 'storagePath' = v_asset.storage_path
    ) then
      raise exception 'CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS' using errcode = '23514';
    end if;
    update public.cms_document_assets set
      archived_at = now(), archived_by = p_actor_id,
      lock_version = lock_version + 1, updated_at = now()
    where id = p_document_id returning * into v_asset;
    v_target_state := 'archived';
  else
    if v_asset.archived_at is null then
      raise exception 'CMS_DOCUMENT_NOT_ARCHIVED' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_asset.sha256, 0));
    if exists (
      select 1 from public.cms_document_assets duplicate
      where duplicate.sha256 = v_asset.sha256
        and duplicate.id <> v_asset.id
        and duplicate.processing_status = 'ready'
        and duplicate.archived_at is null
        and private.cms_document_actor_scope_allowed(
          p_actor_id,
          duplicate.source_kind,
          duplicate.source_reference
        )
    ) then
      raise exception 'CMS_DOCUMENT_DUPLICATE' using errcode = '23505';
    end if;
    update public.cms_document_assets set
      archived_at = null, archived_by = null,
      lock_version = lock_version + 1, updated_at = now()
    where id = p_document_id returning * into v_asset;
    v_target_state := 'ready';
  end if;

  v_response := jsonb_build_object(
    'documentId', v_asset.id,
    'status', v_target_state,
    'archived', v_asset.archived_at is not null,
    'lockVersion', v_asset.lock_version,
    'correlationId', p_correlation_id,
    'replayed', false
  );
  insert into public.cms_document_command_receipts (
    actor_id, action, idempotency_key, request_hash, document_id, correlation_id, response
  ) values (
    p_actor_id, p_action, p_idempotency_key, p_request_hash,
    p_document_id, p_correlation_id, v_response
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    case p_action
      when 'archive_document' then 'cms:documents.archive'
      else 'cms:documents.restore'
    end,
    'document_asset', p_document_id::text,
    jsonb_build_object('status', v_target_state, 'lockVersion', v_asset.lock_version),
    p_correlation_id
  );
  return v_response;
end;
$$;

-- O conteúdo publicado só pode apontar para o mesmo ativo validado. Isso impede
-- troca de UUID, caminho, hash ou metadados no payload antes da publicação.
create or replace function public.cms_validate_governed_product_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document jsonb;
  v_asset public.cms_document_assets%rowtype;
begin
  if new.content_type = 'product'
     and jsonb_typeof(coalesce(new.payload -> 'documents', '[]'::jsonb)) <> 'array' then
    raise exception 'CMS_PRODUCT_DOCUMENT_SHAPE_INVALID' using errcode = '23514';
  end if;
  for v_document in
    select value from jsonb_array_elements(
      case
        when jsonb_typeof(new.payload -> 'documents') = 'array' then new.payload -> 'documents'
        else '[]'::jsonb
      end
    )
    order by value ->> 'id'
  loop
    if new.content_type <> 'product' then continue; end if;
    if v_document ? 'officialUrl'
       or nullif(v_document ->> 'storagePath', '') is null then
      raise exception 'CMS_PRODUCT_DOCUMENT_LOCATION_INVALID' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'cms-document:' || ((v_document ->> 'id')::uuid)::text,
      0
    ));
    select asset.* into v_asset
      from public.cms_document_assets asset
      where asset.id = (v_document ->> 'id')::uuid
        and asset.storage_path = v_document ->> 'storagePath'
        and asset.kind = v_document ->> 'kind'
        and asset.title = v_document ->> 'title'
        and asset.sha256 = v_document ->> 'sha256'
        and asset.revision = v_document ->> 'revision'
        and asset.language = lower(v_document ->> 'language')
        and asset.visibility = v_document ->> 'visibility'
        and asset.rights_confirmed
        and asset.processing_status = 'ready'
        and asset.scan_status = 'clean'
        and asset.archived_at is null;
    if not found then
      raise exception 'CMS_PRODUCT_DOCUMENT_ASSET_INVALID' using errcode = '23514';
    end if;
    if v_asset.source_kind = 'synthetic_test' and not exists (
      select 1
      from public.cms_content_items item
      where item.id = new.item_id
        and item.created_by = v_asset.created_by
        and item.slug like 'qa-%'
        and new.payload ->> 'pilotState' = 'synthetic_test'
        and new.payload #>> '{seo,indexable}' = 'false'
        and new.payload ->> 'title' like ('%' || v_asset.source_reference || '%')
    ) then
      raise exception 'CMS_PRODUCT_SYNTHETIC_DOCUMENT_SCOPE_INVALID' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger cms_governed_product_documents_validate
before insert or update of payload on public.cms_published_projection
for each row execute function public.cms_validate_governed_product_documents();

-- Registros legados são inventariados, mas entram fail-closed em quarentena.
-- Eles não voltam a ser públicos sem download isolado e atestação corporativa
-- de segundo ator vinculada ao SHA-256 importado.
with legacy_content_versions as (
  select
    publication.payload,
    revision.created_by as observed_by,
    publication.published_at as observed_at,
    3 as source_priority
  from public.cms_published_projection publication
  join public.cms_content_revisions revision on revision.id = publication.revision_id
  where publication.content_type = 'product'
  union all
  select draft.payload, draft.updated_by, draft.updated_at, 2
  from public.cms_content_drafts draft
  join public.cms_content_items item on item.id = draft.item_id
  where item.content_type = 'product'
  union all
  select revision.payload, revision.created_by, revision.created_at, 1
  from public.cms_content_revisions revision
  join public.cms_content_items item on item.id = revision.item_id
  where item.content_type = 'product'
), legacy_document_references as (
  select
    content.observed_at,
    content.source_priority,
    document.value,
    lower(nullif(document.value ->> 'id', '')) as id_text,
    nullif(object.metadata ->> 'size', '') as byte_size_text,
    content.observed_by,
    object.created_at
  from legacy_content_versions content
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(content.payload -> 'documents') = 'array'
        then content.payload -> 'documents'
      else '[]'::jsonb
    end
  ) document(value)
  join storage.objects object
    on object.bucket_id = 'cms-documents-private'
   and object.name = document.value ->> 'storagePath'
  where nullif(document.value ->> 'storagePath', '') is not null
), legacy_documents as (
  select distinct on (converted.id)
    converted.id,
    reference.value,
    reference.observed_by as created_by,
    reference.created_at,
    converted.byte_size
  from legacy_document_references reference
  cross join lateral (
    select
      case
        when reference.id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then reference.id_text::uuid
        else null
      end as id,
      case
        when reference.byte_size_text ~ '^[0-9]{1,8}$'
          then reference.byte_size_text::bigint
        else null
      end as byte_size
  ) converted
  where converted.id is not null
    and converted.byte_size between 8 and 20971520
  order by converted.id, reference.observed_at desc, reference.source_priority desc,
    reference.observed_by::text
)
insert into public.cms_document_assets (
  id, storage_path, upload_path, upload_disposition,
  original_filename, kind, title, revision, language, visibility,
  detected_mime, byte_size, sha256, processing_status, scan_status, scan_engine,
  prefilter_engine, prefiltered_at,
  source_kind, source_reference, license_name, owner_name, rights_confirmed,
  created_by, created_at, processed_at
)
select
  id,
  value ->> 'storagePath',
  'cms-document-uploads/' || id::text || '/legacy-sealed.pdf',
  'removed',
  split_part(value ->> 'storagePath', '/', 3),
  value ->> 'kind',
  value ->> 'title',
  value ->> 'revision',
  lower(value ->> 'language'),
  value ->> 'visibility',
  'application/pdf',
  byte_size,
  value ->> 'sha256',
  'quarantined',
  'pending',
  null,
  'legacy-unverified-import-v1',
  created_at,
  'legacy_import',
  'Importado do histórico editorial anterior à biblioteca governada.',
  'Direitos confirmados no conteúdo editorial legado.',
  'Proprietário registrado no histórico editorial.',
  true,
  created_by,
  created_at,
  null
from legacy_documents;

insert into public.cms_audit_log (
  actor_id, action, target_type, target_id, event_data, correlation_id
)
select
  null,
  'cms:documents.legacy_quarantined',
  'document_asset',
  asset.id::text,
  jsonb_build_object(
    'scanStatus', 'pending',
    'prefilterEngine', 'legacy-unverified-import-v1',
    'securityReviewRequired', true
  ),
  gen_random_uuid()
from public.cms_document_assets asset
where asset.source_kind = 'legacy_import'
  and asset.processing_status = 'quarantined'
  and asset.scan_status = 'pending'
  and not exists (
    select 1 from public.cms_audit_log audit
    where audit.action = 'cms:documents.legacy_quarantined'
      and audit.target_type = 'document_asset'
      and audit.target_id = asset.id::text
  );

-- Gate unico usado pelos canaries de staging e producao. Quarentena e o estado
-- seguro de importacao, mas nao e autorizacao de promocao: cada ativo legado
-- precisa de uma decisao corporativa imutavel, de segundo ator e ligada ao hash.
create or replace function public.cms_legacy_documents_promotion_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with content_versions as (
    select publication.payload
    from public.cms_published_projection publication
    where publication.content_type = 'product'
    union all
    select draft.payload
    from public.cms_content_drafts draft
    join public.cms_content_items item on item.id = draft.item_id
    where item.content_type = 'product'
    union all
    select revision.payload
    from public.cms_content_revisions revision
    join public.cms_content_items item on item.id = revision.item_id
    where item.content_type = 'product'
  ), stored_references as (
    select document.value
    from content_versions content
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(content.payload -> 'documents') = 'array'
          then content.payload -> 'documents'
        else '[]'::jsonb
      end
    ) document(value)
    where nullif(document.value ->> 'storagePath', '') is not null
  )
  select not exists (
    select 1
    from stored_references reference
    left join public.cms_document_assets asset
      on asset.id::text = lower(reference.value ->> 'id')
     and asset.storage_path = reference.value ->> 'storagePath'
     and asset.kind = reference.value ->> 'kind'
     and asset.title = reference.value ->> 'title'
     and asset.sha256 = reference.value ->> 'sha256'
     and asset.revision = reference.value ->> 'revision'
     and asset.language = lower(reference.value ->> 'language')
     and asset.visibility = reference.value ->> 'visibility'
     and asset.rights_confirmed
     and reference.value ->> 'rightsConfirmed' = 'true'
    where asset.id is null
  ) and not exists (
    select 1
    from public.cms_document_assets asset
    where asset.source_kind = 'legacy_import'
      and not (
        asset.processing_status = 'ready'
        and asset.scan_status = 'clean'
        and asset.scan_engine in ('clamav-corporate-v1', 'microsoft-defender-corporate-v1')
        and asset.prefilter_engine = 'legacy-unverified-import-v1'
        and asset.security_reviewed_by is not null
        and asset.security_reviewed_by is distinct from asset.created_by
        and asset.security_reviewed_at is not null
        and asset.scanner_evidence_sha256 is not null
        and asset.scanner_evidence_reference is not null
        and asset.processed_at is not null
        and asset.blob_disposition = 'available'
        and exists (
          select 1
          from public.cms_audit_log quarantine_audit
          where quarantine_audit.action = 'cms:documents.legacy_quarantined'
            and quarantine_audit.target_type = 'document_asset'
            and quarantine_audit.target_id = asset.id::text
            and quarantine_audit.event_data ->> 'securityReviewRequired' = 'true'
        )
        and exists (
          select 1
          from public.cms_document_security_reviews review
          where review.document_id = asset.id
            and review.document_sha256 = asset.sha256
            and review.reviewer_id = asset.security_reviewed_by
            and review.created_at = asset.security_reviewed_at
            and review.decision = 'approve'
            and review.scanner_engine = asset.scan_engine
            and review.scanner_verdict = 'clean'
            and review.evidence_sha256 = asset.scanner_evidence_sha256
            and review.evidence_reference = asset.scanner_evidence_reference
            and exists (
              select 1
              from public.cms_audit_log approval_audit
              where approval_audit.actor_id = review.reviewer_id
                and approval_audit.action = 'cms:documents.security_approve'
                and approval_audit.target_type = 'document_asset'
                and approval_audit.target_id = asset.id::text
                and approval_audit.correlation_id = review.correlation_id
                and approval_audit.event_data ->> 'documentSha256' = review.document_sha256
                and approval_audit.event_data ->> 'scannerEngine' = review.scanner_engine
                and approval_audit.event_data ->> 'scannerVerdict' = 'clean'
                and approval_audit.event_data ->> 'evidenceSha256' = review.evidence_sha256
                and approval_audit.event_data ->> 'evidenceReference' = review.evidence_reference
            )
        )
      )
  );
$$;

revoke all on function public.cms_reserve_document_asset(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.cms_finalize_document_asset(
  uuid, uuid, bigint, text, text, text, text, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.cms_reject_document_asset(
  uuid, uuid, text, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.cms_transition_document_asset(
  uuid, uuid, text, bigint, text, text, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.cms_validate_governed_product_documents()
from public, anon, authenticated;
revoke all on function public.cms_document_security_review_immutable()
from public, anon, authenticated;
revoke all on function public.cms_legacy_documents_promotion_ready()
from public, anon, authenticated;
grant execute on function public.cms_reserve_document_asset(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, timestamptz, uuid, text, uuid
) to service_role;
grant execute on function public.cms_finalize_document_asset(
  uuid, uuid, bigint, text, text, text, text, timestamptz, uuid, text, uuid
) to service_role;
grant execute on function public.cms_reject_document_asset(
  uuid, uuid, text, text, text, timestamptz, uuid, uuid
) to service_role;
grant execute on function public.cms_transition_document_asset(
  uuid, uuid, text, bigint, text, text, timestamptz, uuid, text, uuid
) to service_role;
grant execute on function public.cms_legacy_documents_promotion_ready()
to service_role;
