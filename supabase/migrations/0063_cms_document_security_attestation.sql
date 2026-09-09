-- Documentos novos permanecem em quarentena depois do pre-filtro estrutural.
-- Somente uma atestacao AAL2 de segundo ator, ligada ao SHA-256 observado e a
-- evidencia de um scanner corporativo permitido, pode torna-los publicaveis.

-- A existencia da lease e a classificacao imutavel do ator. Expirar, limpar
-- ou adulterar o metadata nunca transforma uma identidade QA em identidade
-- corporativa. Somente uma lease ativa, exata e do mesmo run autoriza o ativo
-- sintetico; quem nunca teve lease so pode operar ativos reais.
create or replace function private.cms_document_actor_scope_allowed(
  p_actor_id uuid,
  p_source_kind text,
  p_source_reference text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when exists (
      select 1 from private.cms_qa_actor_leases any_lease
      where any_lease.actor_id = p_actor_id
    ) then
      p_source_kind = 'synthetic_test'
      and exists (
        select 1
        from private.cms_qa_actor_leases lease
        where lease.actor_id = p_actor_id
          and lease.run_tag = p_source_reference
          and lease.status = 'active'
          and lease.expires_at > statement_timestamp()
          and private.cms_qa_actor_marker_is_exact(
            lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
          )
      )
    else p_source_kind <> 'synthetic_test'
  end;
$$;

create or replace function public.cms_document_actor_scope_context(
  p_actor_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_active boolean := false;
begin
  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id;
  if not found then
    return jsonb_build_object(
      'schemaVersion', 1, 'isQaActor', false, 'active', true,
      'runTag', null, 'status', null
    );
  end if;
  v_active := v_lease.environment = p_environment
    and v_lease.status = 'active'
    and v_lease.expires_at > statement_timestamp()
    and private.cms_qa_actor_marker_is_exact(
      v_lease.actor_id, v_lease.run_tag, v_lease.candidate_sha, v_lease.environment
    );
  return jsonb_build_object(
    'schemaVersion', 1,
    'isQaActor', true,
    'active', v_active,
    'runTag', v_lease.run_tag,
    'status', v_lease.status,
    'expiresAt', v_lease.expires_at
  );
end;
$$;

create or replace function private.cms_official_https_url_allowed(p_url text)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with parsed_authority as (
    select split_part(
      split_part(split_part(substr(coalesce(p_url, ''), 9), '/', 1), '?', 1),
      '#',
      1
    ) as authority
  ), parsed as (
    select
      authority,
      lower(regexp_replace(authority, ':[0-9]{1,5}$', '')) as host,
      substring(authority from ':([0-9]{1,5})$') as port
    from parsed_authority
  )
  select coalesce(
    char_length(p_url) between 1 and 500
    and p_url ~* '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?$'
    and position('@' in authority) = 0
    and char_length(host) <= 253
    and host like '%.%'
    and host <> 'localhost'
    and host not like '%.localhost'
    and host not like '%.local'
    and host not like '%.internal'
    and not exists (
      select 1
      from unnest(string_to_array(host, '.')) as label(value)
      where label.value !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    )
    and not (
      host ~ '^[0-9.]+$'
      and (
        host !~ '^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$'
        or exists (
          select 1
          from unnest(string_to_array(host, '.')) as octet(value)
          where case
            when octet.value ~ '^[0-9]{1,3}$'
              then octet.value::integer not between 0 and 255
            else true
          end
        )
      )
    )
    and host !~ '^(0|10|127)\.'
    and host !~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'
    and host !~ '^169\.254\.'
    and host !~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
    and host !~ '^192\.168\.'
    and host !~ '^(22[4-9]|23[0-9]|24[0-9]|25[0-5])\.'
    and case
      when port ~ '^[0-9]{1,5}$' then port::integer <= 65535
      else true
    end,
    false
  )
  from parsed;
$$;

create or replace function private.cms_product_document_reference_shape_allowed(p_document jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
begin
  if jsonb_typeof(p_document) is distinct from 'object' then return false; end if;
  return coalesce(
    not exists (
      select 1
      from jsonb_object_keys(p_document) as keys(name)
      where name <> all(array[
        'id','kind','title','storagePath','sha256',
        'revision','language','visibility','rightsConfirmed'
      ])
    )
    and jsonb_typeof(p_document -> 'id') = 'string'
    and (p_document ->> 'id')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(p_document -> 'kind') = 'string'
    and p_document ->> 'kind' in ('datasheet','manual','certificate','drawing','software','other')
    and jsonb_typeof(p_document -> 'title') = 'string'
    and char_length(btrim(p_document ->> 'title')) between 1 and 180
    and jsonb_typeof(p_document -> 'sha256') = 'string'
    and p_document ->> 'sha256' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(p_document -> 'revision') = 'string'
    and char_length(btrim(p_document ->> 'revision')) between 1 and 80
    and jsonb_typeof(p_document -> 'language') = 'string'
    and p_document ->> 'language' ~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$'
    and jsonb_typeof(p_document -> 'visibility') = 'string'
    and p_document ->> 'visibility' in ('public','private')
    and p_document -> 'rightsConfirmed' = 'true'::jsonb
    and jsonb_typeof(p_document -> 'storagePath') = 'string'
    and p_document ->> 'storagePath'
      ~ '^cms-documents/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'
    and split_part(p_document ->> 'storagePath', '/', 2) = lower(p_document ->> 'id'),
    false
  );
end;
$$;

create or replace function private.cms_product_document_collection_allowed(p_documents jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_length integer;
begin
  if jsonb_typeof(p_documents) is distinct from 'array' then return false; end if;
  v_length := jsonb_array_length(p_documents);
  if v_length > 30 then return false; end if;
  return coalesce(
    not exists (
      select 1
      from jsonb_array_elements(p_documents) document
      where not private.cms_product_document_reference_shape_allowed(document)
    )
    and (
      select count(distinct lower(document ->> 'id')) = v_length
      from jsonb_array_elements(p_documents) document
    ),
    false
  );
end;
$$;

-- O snapshot de preview e imutavel e pode ser consumido sem a sessao do
-- emissor. Por isso todo documento privado e validado e autorizado antes de o
-- token existir; o resolver nunca usa o service role para ampliar esse escopo.
create or replace function private.cms_validate_preview_document_scope(
  p_actor_id uuid,
  p_content_type text,
  p_payload jsonb,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_document jsonb;
  v_asset public.cms_document_assets%rowtype;
  v_has_governed_document boolean := false;
begin
  if p_content_type <> 'product' then return; end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or not private.cms_product_document_collection_allowed(
       coalesce(p_payload -> 'documents', '[]'::jsonb)
     ) then
    raise exception 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID' using errcode = '23514';
  end if;
  if p_payload #> '{manufacturer,officialUrl}' is not null
     and (
       jsonb_typeof(p_payload #> '{manufacturer,officialUrl}') <> 'string'
       or not private.cms_official_https_url_allowed(
         coalesce(p_payload #>> '{manufacturer,officialUrl}', '')
       )
     ) then
    raise exception 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID' using errcode = '23514';
  end if;

  for v_document in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'documents', '[]'::jsonb))
  loop
    if not private.cms_product_document_reference_shape_allowed(v_document) then
      raise exception 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID' using errcode = '23514';
    end if;
    v_has_governed_document := true;
    perform pg_advisory_xact_lock(hashtextextended(
      'cms-document:' || ((v_document ->> 'id')::uuid)::text, 0
    ));
    select asset.* into v_asset
    from public.cms_document_assets asset
    where asset.id = (v_document ->> 'id')::uuid
      and asset.storage_path = v_document ->> 'storagePath'
      and asset.kind = v_document ->> 'kind'
      and asset.sha256 = v_document ->> 'sha256'
      and asset.revision = v_document ->> 'revision'
      and asset.language = lower(v_document ->> 'language')
      and asset.visibility = v_document ->> 'visibility'
      and asset.rights_confirmed
      and asset.processing_status = 'ready'
      and asset.scan_status = 'clean'
      and asset.blob_disposition = 'available'
      and asset.archived_at is null;
    if not found or not private.cms_document_actor_scope_allowed(
      p_actor_id, v_asset.source_kind, v_asset.source_reference
    ) then
      raise exception 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID' using errcode = '42501';
    end if;
  end loop;

  if v_has_governed_document and not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.read', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.cms_validate_preview_media_scope(
  p_actor_id uuid,
  p_payload jsonb,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_asset_id_text text;
  v_source public.cms_media_assets%rowtype;
  v_target public.cms_media_assets%rowtype;
  v_target_id uuid;
  v_has_media boolean := false;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'CMS_PREVIEW_MEDIA_SCOPE_INVALID' using errcode = '23514';
  end if;
  for v_asset_id_text in
    with blocks as (
      select value as block
      from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'blocks') = 'array'
          then p_payload -> 'blocks' else '[]'::jsonb end
      )
    ), refs as (
      select entry ->> 'assetId' as asset_id
      from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'media') = 'array'
          then p_payload -> 'media' else '[]'::jsonb end
      ) entry
      union all
      select block #>> '{data,assetId}' from blocks
      union all
      select asset #>> '{}'
      from blocks
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(block #> '{data,assetIds}') = 'array'
          then block #> '{data,assetIds}' else '[]'::jsonb end
      ) asset
      union all
      select item ->> 'assetId'
      from blocks
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(block #> '{data,items}') = 'array'
          then block #> '{data,items}' else '[]'::jsonb end
      ) item
      union all
      select p_payload #>> '{seo,ogImageId}'
    )
    select distinct asset_id
    from refs
    where asset_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  loop
    v_has_media := true;
    select * into v_source
    from public.cms_media_assets
    where id = v_asset_id_text::uuid;
    if not found then continue; end if;
    if not private.cms_document_actor_scope_allowed(
      p_actor_id, v_source.source_kind, v_source.source_reference
    ) then
      raise exception 'CMS_PREVIEW_MEDIA_SCOPE_INVALID' using errcode = '42501';
    end if;
    select replacement.target_asset_id into v_target_id
    from public.cms_dam_replacements replacement
    where replacement.source_asset_id = v_source.id and replacement.status = 'active'
    limit 1;
    v_target_id := coalesce(v_target_id, v_source.id);
    select * into v_target
    from public.cms_media_assets
    where id = v_target_id;
    if found and not private.cms_document_actor_scope_allowed(
      p_actor_id, v_target.source_kind, v_target.source_reference
    ) then
      raise exception 'CMS_PREVIEW_MEDIA_SCOPE_INVALID' using errcode = '42501';
    end if;
  end loop;
  if v_has_media and not public.cms_actor_authorized(
    p_actor_id, 'cms:media.read', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_PREVIEW_MEDIA_SCOPE_INVALID' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cms_issue_preview(
  p_actor_id uuid,
  p_item_id uuid,
  p_revision_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_revision public.cms_content_revisions%rowtype;
  v_qa_lease private.cms_qa_actor_leases%rowtype;
  v_item_lease private.cms_qa_actor_leases%rowtype;
  v_payload_lease private.cms_qa_actor_leases%rowtype;
  v_actor_is_qa boolean := false;
  v_item_is_qa boolean := false;
  v_payload_is_qa boolean := false;
  v_payload_actor_id uuid;
  v_payload jsonb;
  v_seo jsonb;
begin
  select * into v_item from public.cms_content_items where id = p_item_id;
  if not found or not public.cms_actor_authorized(
    p_actor_id,
    public.cms_editorial_required_permission(v_item.content_type, 'preview'),
    p_aal,
    p_session_id,
    p_issued_at
  ) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at > now() + interval '30 minutes'
     or p_expires_at <= now()
     or p_max_uses not between 1 and 50 then
    raise exception 'CMS_PREVIEW_TOKEN_INVALID' using errcode = '22023';
  end if;

  -- Uma identidade que ja foi classificada como QA nunca pode emitir uma
  -- capacidade anonima que sobreviva a sua lease server-side. A existencia
  -- historica da lease e autoritativa e falha fechada mesmo apos o termino.
  select lease.* into v_qa_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
  for share;
  v_actor_is_qa := found;
  if v_actor_is_qa and (
    v_qa_lease.status <> 'active'
    or v_qa_lease.expires_at <= statement_timestamp()
    or p_expires_at > v_qa_lease.expires_at
    or not private.cms_qa_actor_marker_is_exact(
      v_qa_lease.actor_id,
      v_qa_lease.run_tag,
      v_qa_lease.candidate_sha,
      v_qa_lease.environment
    )
  ) then
    raise exception 'CMS_PREVIEW_TOKEN_INVALID' using errcode = '22023';
  end if;

  if p_revision_id is null then
    select * into v_draft
    from public.cms_content_drafts
    where item_id = p_item_id;
    if not found then raise exception 'CMS_DRAFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_payload := v_draft.payload;
    v_seo := v_draft.seo;
    v_payload_actor_id := v_draft.updated_by;
  else
    select * into v_revision
    from public.cms_content_revisions
    where id = p_revision_id and item_id = p_item_id;
    if not found then raise exception 'CMS_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    v_payload := v_revision.payload;
    v_seo := v_revision.seo;
    v_payload_actor_id := v_revision.created_by;
  end if;

  perform private.cms_lock_active_qa_actor_leases(array[
    p_actor_id,
    v_item.created_by,
    v_payload_actor_id
  ]);
  select lease.* into v_item_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = v_item.created_by
  for share;
  v_item_is_qa := found;
  select lease.* into v_payload_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = v_payload_actor_id
  for share;
  v_payload_is_qa := found;

  if v_actor_is_qa then
    if not v_item_is_qa
       or not v_payload_is_qa
       or v_item_lease.status <> 'active'
       or v_payload_lease.status <> 'active'
       or v_item_lease.expires_at <= statement_timestamp()
       or v_payload_lease.expires_at <= statement_timestamp()
       or p_expires_at > least(
         v_qa_lease.expires_at,
         v_item_lease.expires_at,
         v_payload_lease.expires_at
       )
       or v_item_lease.run_tag <> v_qa_lease.run_tag
       or v_payload_lease.run_tag <> v_qa_lease.run_tag
       or v_item_lease.candidate_sha <> v_qa_lease.candidate_sha
       or v_payload_lease.candidate_sha <> v_qa_lease.candidate_sha
       or v_item_lease.environment <> v_qa_lease.environment
       or v_payload_lease.environment <> v_qa_lease.environment
       or not private.cms_qa_actor_marker_is_exact(
         v_item_lease.actor_id,
         v_item_lease.run_tag,
         v_item_lease.candidate_sha,
         v_item_lease.environment
       )
       or not private.cms_qa_actor_marker_is_exact(
         v_payload_lease.actor_id,
         v_payload_lease.run_tag,
         v_payload_lease.candidate_sha,
         v_payload_lease.environment
       ) then
      raise exception 'CMS_PREVIEW_ACTOR_SCOPE_INVALID' using errcode = '42501';
    end if;
  elsif v_item_is_qa or v_payload_is_qa then
    raise exception 'CMS_PREVIEW_ACTOR_SCOPE_INVALID' using errcode = '42501';
  end if;

  perform private.cms_validate_preview_document_scope(
    p_actor_id, v_item.content_type, v_payload, p_aal, p_session_id, p_issued_at
  );
  perform private.cms_validate_preview_media_scope(
    p_actor_id, v_payload, p_aal, p_session_id, p_issued_at
  );
  insert into public.cms_preview_tokens (
    token_hash, item_id, revision_id, snapshot_payload, snapshot_seo,
    created_by, expires_at, max_uses
  ) values (
    p_token_hash, p_item_id, p_revision_id, v_payload, v_seo,
    p_actor_id, p_expires_at, p_max_uses
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:content.preview', 'content_item', p_item_id::text,
    jsonb_build_object('expiresAt', p_expires_at, 'maxUses', p_max_uses),
    p_correlation_id
  );
  return jsonb_build_object('expiresAt', p_expires_at, 'maxUses', p_max_uses);
end;
$$;

revoke all on function private.cms_validate_preview_document_scope(
  uuid,text,jsonb,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.cms_validate_preview_media_scope(
  uuid,jsonb,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.cms_official_https_url_allowed(text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_product_document_reference_shape_allowed(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_product_document_collection_allowed(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_issue_preview(
  uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function public.cms_issue_preview(
  uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid
) to service_role;

-- Encerrar ou expirar uma lease revoga imediatamente todo preview ainda
-- utilizavel daquele ator. O evento agrega somente a contagem e nunca grava
-- hashes de token ou snapshots editoriais na auditoria.
create or replace function private.cms_revoke_qa_preview_tokens_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_revoked integer := 0;
begin
  if old.status = 'active'
     and new.status in ('cleaned', 'expired')
     and new.status <> old.status then
    update public.cms_preview_tokens preview
    set revoked_at = coalesce(preview.revoked_at, statement_timestamp())
    where preview.created_by in (
        select lease.actor_id
        from private.cms_qa_actor_leases lease
        where lease.run_tag = old.run_tag
          and lease.candidate_sha = old.candidate_sha
          and lease.environment = old.environment
      )
      and preview.revoked_at is null;
    get diagnostics v_revoked = row_count;

    if v_revoked > 0 then
      insert into public.cms_audit_log (
        actor_id, action, target_type, target_id, event_data, correlation_id
      ) values (
        old.actor_id,
        'cms:preview.qa_lease_revoke',
        'qa_fixture',
        old.run_tag,
        jsonb_build_object(
          'schemaVersion', 1,
          'syntheticOnly', true,
          'terminalStatus', new.status,
          'revokedPreviewCount', v_revoked
        ),
        gen_random_uuid()
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cms_revoke_qa_preview_tokens_on_terminal
  on private.cms_qa_actor_leases;
create trigger cms_revoke_qa_preview_tokens_on_terminal
after update of status on private.cms_qa_actor_leases
for each row execute function private.cms_revoke_qa_preview_tokens_on_terminal();

revoke all on function private.cms_revoke_qa_preview_tokens_on_terminal()
  from public, anon, authenticated, service_role;

-- Tokens emitidos antes da validacao de escopo nao podem sobreviver a esta
-- mudanca de fronteira. O hash do token nunca entra na auditoria.
with revoked as (
  update public.cms_preview_tokens
  set revoked_at = now()
  where revoked_at is null and expires_at > now()
  returning item_id, created_by
)
insert into public.cms_audit_log (
  actor_id, action, target_type, target_id, event_data, correlation_id
)
select
  revoked.created_by,
  'cms:preview.security_revoke',
  'content_item',
  revoked.item_id::text,
  jsonb_build_object('reasonCode', 'preview_asset_scope_hardening'),
  gen_random_uuid()
from revoked;

create or replace function private.cms_validate_synthetic_document_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_is_qa_actor boolean;
begin
  select exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = new.created_by
  ) into v_is_qa_actor;
  select lease.* into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = new.created_by
    and lease.status = 'active'
    and lease.expires_at > statement_timestamp()
    and private.cms_qa_actor_marker_is_exact(
      lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
    )
  limit 1
  for share;

  if new.source_kind = 'synthetic_test' then
    if new.source_reference !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
       or not found
       or v_lease.run_tag <> new.source_reference then
      raise exception 'CMS_DOCUMENT_SYNTHETIC_SCOPE_INVALID' using errcode = '42501';
    end if;
    new.synthetic_expires_at := v_lease.expires_at;
  elsif v_is_qa_actor then
    raise exception 'CMS_DOCUMENT_QA_REAL_SOURCE_FORBIDDEN' using errcode = '42501';
  else
    new.synthetic_expires_at := null;
  end if;
  return new;
end;
$$;

alter table public.cms_document_assets
  add constraint cms_document_synthetic_expiry_bound
  check (
    (source_kind = 'synthetic_test' and synthetic_expires_at is not null)
    or (source_kind <> 'synthetic_test' and synthetic_expires_at is null)
  );

drop trigger if exists cms_validate_synthetic_document_scope on public.cms_document_assets;
create trigger cms_validate_synthetic_document_scope
before insert or update of source_kind, source_reference, created_by
on public.cms_document_assets
for each row execute function private.cms_validate_synthetic_document_scope();

-- Reforca o trigger criado em 0057 agora que a lease QA existe. Um ativo
-- sintetico somente pode entrar na projecao do produto sintetico do mesmo ator,
-- durante a mesma lease, em rota explicitamente noindex.
create or replace function public.cms_validate_governed_product_documents()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_document jsonb;
  v_asset public.cms_document_assets%rowtype;
  v_item_creator uuid;
  v_item_creator_is_qa boolean;
  v_revision_creator uuid;
  v_revision_creator_is_qa boolean;
begin
  select item.created_by into v_item_creator
  from public.cms_content_items item
  where item.id = new.item_id;
  select exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = v_item_creator
  ) into v_item_creator_is_qa;
  select revision.created_by into v_revision_creator
  from public.cms_content_revisions revision
  where revision.id = new.revision_id;
  -- Serializa publicacao com complete/sweep. Se esta transacao vencer, o
  -- watchdog aguardara e vera/removera a projecao; se o terminal vencer, as
  -- consultas abaixo observarao a lease fechada e recusarao a publicacao.
  perform lease.actor_id
  from private.cms_qa_actor_leases lease
  where lease.actor_id in (v_item_creator, v_revision_creator)
  order by lease.actor_id
  for share;
  select exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = v_revision_creator
  ) into v_revision_creator_is_qa;
  if new.content_type = 'product'
     and not private.cms_product_document_collection_allowed(
       coalesce(new.payload -> 'documents', '[]'::jsonb)
     ) then
    raise exception 'CMS_PRODUCT_DOCUMENT_SHAPE_INVALID' using errcode = '23514';
  end if;
  if new.content_type = 'product'
     and new.payload #> '{manufacturer,officialUrl}' is not null
     and (
       jsonb_typeof(new.payload #> '{manufacturer,officialUrl}') <> 'string'
       or not private.cms_official_https_url_allowed(
         coalesce(new.payload #>> '{manufacturer,officialUrl}', '')
       )
     ) then
    raise exception 'CMS_PRODUCT_OFFICIAL_URL_INVALID' using errcode = '23514';
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
    if not private.cms_product_document_reference_shape_allowed(v_document) then
      raise exception 'CMS_PRODUCT_DOCUMENT_SHAPE_INVALID' using errcode = '23514';
    end if;
    if nullif(v_document ->> 'id', '') is not null then
      perform pg_advisory_xact_lock(hashtextextended(
        'cms-document:' || ((v_document ->> 'id')::uuid)::text,
        0
      ));
    end if;
    select asset.* into v_asset
    from public.cms_document_assets asset
    where asset.id = (v_document ->> 'id')::uuid
      and asset.storage_path = v_document ->> 'storagePath'
      and asset.kind = v_document ->> 'kind'
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
    if (v_item_creator_is_qa or v_revision_creator_is_qa) and (
      v_asset.source_kind <> 'synthetic_test'
      or v_asset.created_by is distinct from v_item_creator
    ) then
      raise exception 'CMS_PRODUCT_QA_REAL_DOCUMENT_FORBIDDEN' using errcode = '42501';
    end if;
    if v_asset.source_kind = 'synthetic_test' and not exists (
      select 1
      from public.cms_content_items item
      join public.cms_content_revisions revision on revision.id = new.revision_id
      join private.cms_qa_actor_leases lease
        on lease.actor_id = v_asset.created_by
       and lease.run_tag = v_asset.source_reference
      join private.cms_qa_actor_leases revision_lease
        on revision_lease.actor_id = revision.created_by
       and revision_lease.run_tag = lease.run_tag
       and revision_lease.candidate_sha = lease.candidate_sha
       and revision_lease.environment = lease.environment
      where item.id = new.item_id
        and item.created_by = v_asset.created_by
        and item.slug like 'qa-%'
        and new.payload ->> 'pilotState' = 'synthetic_test'
        and new.payload #>> '{seo,indexable}' = 'false'
        and new.payload ->> 'title' like ('%' || v_asset.source_reference || '%')
        and lease.status = 'active'
        and revision_lease.status = 'active'
        and lease.expires_at > statement_timestamp()
        and revision_lease.expires_at > statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          revision_lease.actor_id,
          revision_lease.run_tag,
          revision_lease.candidate_sha,
          revision_lease.environment
        )
    ) then
      raise exception 'CMS_PRODUCT_SYNTHETIC_DOCUMENT_SCOPE_INVALID' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.cms_mark_document_upload_token_issued(
  p_document_id uuid,
  p_upload_path text,
  p_token_expires_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
begin
  if p_token_expires_at <= statement_timestamp() + interval '110 minutes'
     or p_token_expires_at > statement_timestamp() + interval '130 minutes' then
    raise exception 'CMS_DOCUMENT_UPLOAD_TOKEN_EXPIRY_INVALID' using errcode = '22023';
  end if;
  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset from public.cms_document_assets where id = p_document_id for update;
  if not found
     or v_asset.created_by is distinct from v_asset_creator
     or v_asset.upload_path is distinct from p_upload_path then
    raise exception 'CMS_DOCUMENT_UPLOAD_SCOPE_INVALID' using errcode = '42501';
  end if;
  if v_asset.processing_status <> 'awaiting_upload'
     or v_asset.upload_disposition not in ('reserved', 'accepting') then
    raise exception 'CMS_DOCUMENT_UPLOAD_TOKEN_CLOSED' using errcode = '23514';
  end if;
  update public.cms_document_assets set
    upload_token_expires_at = greatest(
      coalesce(upload_token_expires_at, p_token_expires_at), p_token_expires_at
    ),
    upload_disposition = 'accepting',
    upload_cleanup_last_error_code = null,
    updated_at = now()
  where id = p_document_id
  returning * into v_asset;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    v_asset.created_by, 'cms:documents.upload_token_issued', 'document_asset', p_document_id::text,
    jsonb_build_object('expiresAt', v_asset.upload_token_expires_at), p_correlation_id
  );
  return jsonb_build_object(
    'documentId', v_asset.id,
    'uploadDisposition', v_asset.upload_disposition,
    'expiresAt', v_asset.upload_token_expires_at
  );
end;
$$;

-- Compatibilidade de rollout: 0057 ainda nao continha estes campos nos
-- ambientes que a aplicaram antes desta revisao. O fence e deliberadamente
-- independente de processing_status, pois precisa sobreviver ao watchdog.
alter table public.cms_document_assets
  add column if not exists canonical_write_claim_id uuid,
  add column if not exists canonical_write_claim_expires_at timestamptz,
  add column if not exists canonical_cleanup_not_before timestamptz,
  add column if not exists canonical_cleanup_verify_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cms_document_assets'::regclass
      and conname = 'cms_document_assets_canonical_write_claim_pair'
  ) then
    alter table public.cms_document_assets
      add constraint cms_document_assets_canonical_write_claim_pair check (
        (canonical_write_claim_id is null and canonical_write_claim_expires_at is null)
        or (canonical_write_claim_id is not null and canonical_write_claim_expires_at is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cms_document_assets'::regclass
      and conname = 'cms_document_assets_canonical_cleanup_window'
  ) then
    alter table public.cms_document_assets
      add constraint cms_document_assets_canonical_cleanup_window check (
        canonical_cleanup_verify_until is null
        or (
          canonical_cleanup_not_before is not null
          and canonical_cleanup_verify_until > canonical_cleanup_not_before
        )
      );
  end if;
end;
$$;

-- Storage e Postgres nao compartilham transacao. Este trigger transforma a
-- claim de finalizacao em um tombstone duravel. Uma transicao concorrente pode
-- revogar acesso imediatamente, mas a ausencia fisica so se torna final depois
-- do vencimento da claim, do token e de uma margem superior ao hard timeout da
-- Edge. A janela posterior faz o worker verificar repetidamente o caminho.
create or replace function private.cms_document_canonical_write_fence()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_not_before timestamptz;
begin
  if new.processing_status = 'finalizing'
     and new.finalization_claim_id is not null
     and new.finalization_claim_expires_at is not null then
    new.canonical_write_claim_id := new.finalization_claim_id;
    new.canonical_write_claim_expires_at := new.finalization_claim_expires_at;
    new.canonical_cleanup_not_before := null;
    new.canonical_cleanup_verify_until := null;
  elsif old.processing_status = 'finalizing'
        and new.processing_status in ('quarantined', 'ready')
        and new.blob_disposition = 'available' then
    -- O commit DB nao prova que uma repeticao concorrente da mesma claim ja
    -- terminou. Preserve o tombstone; se houver rejeicao logo em seguida, ele
    -- ainda cerca a remocao contra a segunda escrita.
    new.canonical_write_claim_id := coalesce(
      old.canonical_write_claim_id,
      old.finalization_claim_id
    );
    new.canonical_write_claim_expires_at := coalesce(
      old.canonical_write_claim_expires_at,
      old.finalization_claim_expires_at
    );
    new.canonical_cleanup_not_before := null;
    new.canonical_cleanup_verify_until := null;
  elsif (
      old.processing_status = 'finalizing'
      or old.canonical_write_claim_id is not null
    ) and new.blob_disposition in ('access_revoked', 'removed') then
    new.canonical_write_claim_id := coalesce(
      old.canonical_write_claim_id,
      old.finalization_claim_id
    );
    new.canonical_write_claim_expires_at := coalesce(
      old.canonical_write_claim_expires_at,
      old.finalization_claim_expires_at
    );
    if old.canonical_cleanup_not_before is null then
      v_not_before := greatest(
        coalesce(old.upload_token_expires_at, '-infinity'::timestamptz),
        coalesce(old.finalization_claim_expires_at, '-infinity'::timestamptz),
        coalesce(old.canonical_write_claim_expires_at, '-infinity'::timestamptz),
        coalesce(
          new.neutralized_at,
          new.processed_at,
          new.archived_at,
          v_now
        )
      ) + interval '30 minutes';
      new.canonical_cleanup_not_before := v_not_before;
      new.canonical_cleanup_verify_until := v_not_before + interval '60 minutes';
    else
      -- Deadline monotono: retries/falhas do worker jamais renovam o fence.
      new.canonical_cleanup_not_before := old.canonical_cleanup_not_before;
      new.canonical_cleanup_verify_until := old.canonical_cleanup_verify_until;
    end if;
  elsif old.blob_disposition = 'available'
        and new.blob_disposition in ('access_revoked', 'removed') then
    new.canonical_cleanup_not_before := coalesce(
      old.canonical_cleanup_not_before,
      v_now
    );
    new.canonical_cleanup_verify_until := coalesce(
      old.canonical_cleanup_verify_until,
      new.canonical_cleanup_not_before + interval '60 minutes'
    );
  end if;

  if old.blob_disposition <> 'removed'
     and new.blob_disposition = 'removed'
     and coalesce(
       new.canonical_cleanup_not_before,
       old.canonical_cleanup_not_before,
       '-infinity'::timestamptz
     ) > v_now then
    raise exception 'CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_document_canonical_write_fence on public.cms_document_assets;
create trigger cms_document_canonical_write_fence
before update on public.cms_document_assets
for each row execute function private.cms_document_canonical_write_fence();

revoke all on function private.cms_document_canonical_write_fence()
from public, anon, authenticated, service_role;

create or replace function public.cms_claim_document_finalization(
  p_actor_id uuid,
  p_document_id uuid,
  p_claim_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
  v_now timestamptz := statement_timestamp();
  v_replayed boolean := false;
begin
  if p_aal <> 'aal2' or not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.upload', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501';
  end if;
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
    return jsonb_build_object(
      'documentId', v_asset.id, 'storagePath', v_asset.storage_path,
      'uploadPath', v_asset.upload_path, 'status', v_asset.processing_status,
      'sha256', v_asset.sha256, 'byteSize', v_asset.byte_size, 'replayed', true
    );
  end if;
  if v_asset.processing_status = 'finalizing' then
    if v_asset.finalization_claim_id = p_claim_id
       and v_asset.finalization_claim_expires_at > v_now then
      v_replayed := true;
    elsif v_asset.finalization_claim_expires_at <= v_now
          and v_asset.upload_token_expires_at > v_now then
      update public.cms_document_assets set
        finalization_claim_id = p_claim_id,
        finalization_claimed_at = v_now,
        finalization_claim_expires_at = v_now + interval '5 minutes',
        updated_at = now()
      where id = p_document_id returning * into v_asset;
    else
      raise exception 'CMS_DOCUMENT_FINALIZATION_BUSY' using errcode = '40001';
    end if;
  elsif v_asset.processing_status = 'awaiting_upload'
        and v_asset.upload_disposition = 'accepting'
        and v_asset.upload_token_expires_at > v_now then
    update public.cms_document_assets set
      processing_status = 'finalizing',
      finalization_claim_id = p_claim_id,
      finalization_claimed_at = v_now,
      finalization_claim_expires_at = v_now + interval '5 minutes',
      updated_at = now()
    where id = p_document_id returning * into v_asset;
  else
    raise exception 'CMS_DOCUMENT_FINALIZATION_CLOSED' using errcode = '23514';
  end if;
  if not v_replayed then
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:documents.finalization_claimed', 'document_asset', p_document_id::text,
      jsonb_build_object('claimExpiresAt', v_asset.finalization_claim_expires_at),
      p_correlation_id
    );
  end if;
  return jsonb_build_object(
    'documentId', v_asset.id,
    'storagePath', v_asset.storage_path,
    'uploadPath', v_asset.upload_path,
    'status', v_asset.processing_status,
    'claimExpiresAt', v_asset.finalization_claim_expires_at,
    'replayed', v_replayed
  );
end;
$$;

create or replace function public.cms_mark_document_upload_retired(
  p_document_id uuid,
  p_upload_path text,
  p_token_expires_at timestamptz,
  p_guarded boolean,
  p_error_code text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
begin
  if p_guarded and p_error_code is not null then
    raise exception 'CMS_DOCUMENT_UPLOAD_RETIREMENT_INVALID' using errcode = '22023';
  end if;
  if not p_guarded and p_error_code not in ('storage_guard_failed', 'storage_guard_verify_failed') then
    raise exception 'CMS_DOCUMENT_UPLOAD_RETIREMENT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset from public.cms_document_assets where id = p_document_id for update;
  if not found or v_asset.upload_path is distinct from p_upload_path then
    raise exception 'CMS_DOCUMENT_UPLOAD_SCOPE_INVALID' using errcode = '42501';
  end if;
  if p_token_expires_at is null
     or (
       v_asset.upload_token_expires_at is not null
       and v_asset.upload_token_expires_at is distinct from p_token_expires_at
     )
     or (
       v_asset.upload_token_expires_at is null
       and (
         v_asset.processing_status <> 'rejected'
         or p_token_expires_at <= statement_timestamp() + interval '110 minutes'
         or p_token_expires_at > statement_timestamp() + interval '130 minutes'
       )
     ) then
    raise exception 'CMS_DOCUMENT_UPLOAD_TOKEN_EXPIRY_INVALID' using errcode = '22023';
  end if;
  if v_asset.upload_disposition = 'removed' then
    return jsonb_build_object(
      'documentId', v_asset.id, 'uploadDisposition', 'removed', 'replayed', true
    );
  end if;
  update public.cms_document_assets set
    upload_token_expires_at = coalesce(upload_token_expires_at, p_token_expires_at),
    upload_disposition = case when p_guarded then 'guarded' else 'cleanup_pending' end,
    upload_cleanup_attempts = upload_cleanup_attempts + 1,
    upload_cleanup_last_attempt_at = now(),
    upload_cleanup_last_error_code = p_error_code,
    updated_at = now()
  where id = p_document_id returning * into v_asset;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    v_asset.created_by,
    case when p_guarded then 'cms:documents.upload_path_guarded'
      else 'cms:documents.upload_path_cleanup_pending' end,
    'document_asset', p_document_id::text,
    jsonb_build_object(
      'uploadDisposition', v_asset.upload_disposition,
      'errorCode', p_error_code,
      'tokenExpiresAt', v_asset.upload_token_expires_at
    ),
    p_correlation_id
  );
  return jsonb_build_object(
    'documentId', v_asset.id,
    'uploadDisposition', v_asset.upload_disposition,
    'replayed', false
  );
end;
$$;

create or replace function public.cms_review_document_security(
  p_actor_id uuid,
  p_document_id uuid,
  p_expected_sha256 text,
  p_decision text,
  p_scanner_engine text,
  p_scanner_verdict text,
  p_evidence_sha256 text,
  p_evidence_reference text,
  p_environment text,
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
set search_path = public, private, pg_temp
as $$
declare
  v_receipt public.cms_document_command_receipts%rowtype;
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
  v_response jsonb;
  v_qa_attestation_valid boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'cms-document-command:' || p_actor_id::text || ':security_review:' || p_idempotency_key::text,
    0
  ));
  select * into v_receipt
  from public.cms_document_command_receipts
  where actor_id = p_actor_id
    and action = 'security_review'
    and idempotency_key = p_idempotency_key;
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
    p_actor_id, 'cms:documents.security_review', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_expected_sha256 !~ '^[0-9a-f]{64}$'
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_DOCUMENT_SECURITY_HASH_INVALID' using errcode = '22023';
  end if;
  if p_decision not in ('approve', 'reject')
     or p_scanner_verdict not in ('clean', 'malicious', 'suspicious', 'scan_failed')
     or (p_decision = 'approve' and p_scanner_verdict <> 'clean')
     or (p_decision = 'reject' and p_scanner_verdict = 'clean') then
    raise exception 'CMS_DOCUMENT_SECURITY_DECISION_INVALID' using errcode = '22023';
  end if;
  if p_scanner_engine not in (
    'clamav-corporate-v1',
    'microsoft-defender-corporate-v1',
    'qa-synthetic-attestation-v1'
  ) then
    raise exception 'CMS_DOCUMENT_SCANNER_ENGINE_INVALID' using errcode = '22023';
  end if;
  if p_evidence_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,179}$' then
    raise exception 'CMS_DOCUMENT_SCANNER_EVIDENCE_INVALID' using errcode = '22023';
  end if;
  if p_environment not in ('staging', 'production') then
    raise exception 'CMS_DOCUMENT_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;

  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found or v_asset_creator is null then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found or v_asset.created_by is distinct from v_asset_creator then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.cms_document_actor_scope_allowed(
    p_actor_id, v_asset.source_kind, v_asset.source_reference
  ) then
    raise exception 'CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_asset.created_by is null or v_asset.created_by = p_actor_id then
    raise exception 'CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED' using errcode = '42501';
  end if;
  if (v_asset.source_kind = 'synthetic_test') is distinct from
     (p_scanner_engine = 'qa-synthetic-attestation-v1') then
    raise exception 'CMS_DOCUMENT_QA_ATTESTATION_INVALID' using errcode = '42501';
  end if;
  if v_asset.sha256 is distinct from p_expected_sha256 then
    raise exception 'CMS_DOCUMENT_REVIEW_SHA_MISMATCH' using errcode = '40001';
  end if;
  if v_asset.processing_status <> 'quarantined'
     or v_asset.scan_status <> 'pending'
     or v_asset.archived_at is not null then
    raise exception 'CMS_DOCUMENT_REVIEW_CLOSED' using errcode = '23514';
  end if;

  if p_scanner_engine = 'qa-synthetic-attestation-v1' then
    select exists (
      select 1
      from private.cms_qa_actor_leases uploader
      join private.cms_qa_actor_leases reviewer
        on reviewer.run_tag = uploader.run_tag
       and reviewer.candidate_sha = uploader.candidate_sha
       and reviewer.environment = uploader.environment
      where uploader.actor_id = v_asset.created_by
        and reviewer.actor_id = p_actor_id
        and uploader.run_tag = v_asset.source_reference
        and uploader.environment = p_environment
        and uploader.status = 'active'
        and reviewer.status = 'active'
        and uploader.expires_at > statement_timestamp()
        and reviewer.expires_at > statement_timestamp()
        and v_asset.source_kind = 'synthetic_test'
        and private.cms_qa_actor_marker_is_exact(
          uploader.actor_id, uploader.run_tag, uploader.candidate_sha, uploader.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          reviewer.actor_id, reviewer.run_tag, reviewer.candidate_sha, reviewer.environment
        )
    ) into v_qa_attestation_valid;
    if not v_qa_attestation_valid then
      raise exception 'CMS_DOCUMENT_QA_ATTESTATION_INVALID' using errcode = '42501';
    end if;
  end if;

  insert into public.cms_document_security_reviews (
    document_id, document_sha256, reviewer_id, decision, scanner_engine,
    scanner_verdict, evidence_sha256, evidence_reference, correlation_id
  ) values (
    p_document_id, p_expected_sha256, p_actor_id, p_decision, p_scanner_engine,
    p_scanner_verdict, p_evidence_sha256, btrim(p_evidence_reference), p_correlation_id
  );

  if p_decision = 'approve' then
    update public.cms_document_assets set
      processing_status = 'ready',
      scan_status = 'clean',
      scan_engine = p_scanner_engine,
      security_reviewed_by = p_actor_id,
      security_reviewed_at = now(),
      scanner_evidence_sha256 = p_evidence_sha256,
      scanner_evidence_reference = btrim(p_evidence_reference),
      processed_at = now(),
      lock_version = lock_version + 1,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
  else
    update public.cms_document_assets set
      processing_status = 'rejected',
      scan_status = 'rejected',
      scan_engine = p_scanner_engine,
      blob_disposition = 'access_revoked',
      security_reviewed_by = p_actor_id,
      security_reviewed_at = now(),
      scanner_evidence_sha256 = p_evidence_sha256,
      scanner_evidence_reference = btrim(p_evidence_reference),
      processed_at = now(),
      lock_version = lock_version + 1,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
  end if;

  v_response := jsonb_build_object(
    'documentId', v_asset.id,
    'expectedSha256', v_asset.sha256,
    'status', v_asset.processing_status,
    'scanStatus', v_asset.scan_status,
    'lockVersion', v_asset.lock_version,
    'correlationId', p_correlation_id,
    'replayed', false
  );
  insert into public.cms_document_command_receipts (
    actor_id, action, idempotency_key, request_hash, document_id, correlation_id, response
  ) values (
    p_actor_id, 'security_review', p_idempotency_key, p_request_hash,
    p_document_id, p_correlation_id, v_response
  );
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    case p_decision
      when 'approve' then 'cms:documents.security_approve'
      else 'cms:documents.security_reject'
    end,
    'document_asset', p_document_id::text,
    jsonb_build_object(
      'documentSha256', p_expected_sha256,
      'decision', p_decision,
      'scannerEngine', p_scanner_engine,
      'scannerVerdict', p_scanner_verdict,
      'evidenceSha256', p_evidence_sha256,
      'evidenceReference', btrim(p_evidence_reference),
      'prefilterEngine', v_asset.prefilter_engine
    ),
    p_correlation_id
  );
  return v_response;
end;
$$;

revoke all on function public.cms_review_document_security(
  uuid, uuid, text, text, text, text, text, text, text, text, text,
  timestamptz, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.cms_review_document_security(
  uuid, uuid, text, text, text, text, text, text, text, text, text,
  timestamptz, uuid, text, uuid
) to service_role;
revoke all on function public.cms_document_actor_scope_context(uuid,text)
  from public, anon, authenticated;
revoke all on function public.cms_mark_document_upload_token_issued(uuid,text,timestamptz,uuid)
  from public, anon, authenticated;
revoke all on function public.cms_claim_document_finalization(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) from public, anon, authenticated;
revoke all on function public.cms_mark_document_upload_retired(uuid,text,timestamptz,boolean,text,uuid)
  from public, anon, authenticated;
revoke all on function private.cms_document_actor_scope_allowed(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.cms_document_actor_scope_context(uuid,text) to service_role;
grant execute on function public.cms_mark_document_upload_token_issued(uuid,text,timestamptz,uuid)
  to service_role;
grant execute on function public.cms_claim_document_finalization(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_mark_document_upload_retired(uuid,text,timestamptz,boolean,text,uuid)
  to service_role;

-- A UI so oferece o engine sintetico quando os dois atores pertencem ao
-- mesmo fixture ainda ativo. A validacao e repetida no comando decisorio.
create or replace function public.cms_document_qa_attestation_allowed(
  p_actor_id uuid,
  p_document_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p_environment in ('staging', 'production') and exists (
    select 1
    from public.cms_document_assets asset
    join private.cms_qa_actor_leases uploader
      on uploader.actor_id = asset.created_by
     and uploader.run_tag = asset.source_reference
     and uploader.environment = p_environment
    join private.cms_qa_actor_leases reviewer
      on reviewer.actor_id = p_actor_id
     and reviewer.run_tag = uploader.run_tag
     and reviewer.candidate_sha = uploader.candidate_sha
     and reviewer.environment = uploader.environment
    where asset.id = p_document_id
      and asset.source_kind = 'synthetic_test'
      and asset.processing_status = 'quarantined'
      and asset.scan_status = 'pending'
      and asset.archived_at is null
      and asset.created_by <> p_actor_id
      and uploader.status = 'active'
      and reviewer.status = 'active'
      and uploader.expires_at > statement_timestamp()
      and reviewer.expires_at > statement_timestamp()
      and private.cms_qa_actor_marker_is_exact(
        uploader.actor_id, uploader.run_tag, uploader.candidate_sha, uploader.environment
      )
      and private.cms_qa_actor_marker_is_exact(
        reviewer.actor_id, reviewer.run_tag, reviewer.candidate_sha, reviewer.environment
      )
  );
$$;

revoke all on function public.cms_document_qa_attestation_allowed(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.cms_document_qa_attestation_allowed(uuid, uuid, text)
to service_role;

-- O teardown sintetico e um lifecycle governado: primeiro torna o registro
-- terminal e revoga qualquer emissao de URL; depois o Storage remove o blob e
-- confirma a disposicao final. Auditoria e atestacoes permanecem imutaveis.
create or replace function public.cms_prepare_synthetic_document_neutralization(
  p_actor_id uuid,
  p_document_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_asset_creator uuid;
  v_previous_status text;
begin
  if p_aal <> 'aal2' or not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.manage', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_NEUTRALIZE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_environment not in ('staging', 'production') then
    raise exception 'CMS_DOCUMENT_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;

  select asset.created_by into v_asset_creator
  from public.cms_document_assets asset
  where asset.id = p_document_id;
  if not found or v_asset_creator is null then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_asset_creator]);
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found or v_asset.created_by is distinct from v_asset_creator then
    raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_asset.source_kind <> 'synthetic_test'
     or v_asset.created_by is null
     or v_asset.sha256 is null
     or v_asset.processing_status not in ('quarantined', 'ready', 'rejected', 'neutralized')
     or v_asset.source_reference !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or not exists (
       select 1
       from private.cms_qa_actor_leases uploader
       join private.cms_qa_actor_leases cleaner
         on cleaner.run_tag = uploader.run_tag
        and cleaner.candidate_sha = uploader.candidate_sha
        and cleaner.environment = uploader.environment
       where uploader.actor_id = v_asset.created_by
         and cleaner.actor_id = p_actor_id
         and uploader.run_tag = v_asset.source_reference
         and uploader.environment = p_environment
         and uploader.status = 'active'
         and cleaner.status = 'active'
         and uploader.expires_at > statement_timestamp()
         and cleaner.expires_at > statement_timestamp()
         and private.cms_qa_actor_marker_is_exact(
           uploader.actor_id, uploader.run_tag, uploader.candidate_sha, uploader.environment
         )
         and private.cms_qa_actor_marker_is_exact(
           cleaner.actor_id, cleaner.run_tag, cleaner.candidate_sha, cleaner.environment
         )
     ) then
    raise exception 'CMS_DOCUMENT_NEUTRALIZE_SYNTHETIC_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.cms_published_projection publication
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(publication.payload -> 'documents') = 'array'
        then publication.payload -> 'documents' else '[]'::jsonb end
    ) document
    where lower(document ->> 'id') = p_document_id::text
      and document ->> 'storagePath' = v_asset.storage_path
  ) then
    raise exception 'CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS' using errcode = '23514';
  end if;

  v_previous_status := v_asset.processing_status;
  if v_asset.processing_status <> 'neutralized' then
    update public.cms_document_assets set
      processing_status = 'neutralized',
      archived_at = coalesce(archived_at, now()),
      archived_by = p_actor_id,
      neutralized_at = now(),
      neutralized_by = p_actor_id,
      blob_disposition = case
        when blob_disposition = 'removed' then 'removed'
        else 'access_revoked'
      end,
      finalization_claim_id = null,
      finalization_claimed_at = null,
      finalization_claim_expires_at = null,
      processed_at = coalesce(processed_at, now()),
      lock_version = lock_version + 1,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;

    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:documents.qa_neutralize', 'document_asset', p_document_id::text,
      jsonb_build_object(
        'previousStatus', v_previous_status,
        'documentSha256', v_asset.sha256,
        'blobDisposition', v_asset.blob_disposition,
        'storageRemovalRequired', v_asset.blob_disposition <> 'removed',
        'syntheticOnly', true
      ),
      p_correlation_id
    );
  end if;

  return jsonb_build_object(
    'documentId', v_asset.id,
    'expectedSha256', v_asset.sha256,
    'storagePath', v_asset.storage_path,
    'status', 'neutralized',
    'blobDisposition', v_asset.blob_disposition,
    'correlationId', p_correlation_id
  );
end;
$$;

create or replace function public.cms_confirm_synthetic_document_removal(
  p_actor_id uuid,
  p_document_id uuid,
  p_expected_sha256 text,
  p_environment text,
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
set search_path = public, private, pg_temp
as $$
declare
  v_receipt public.cms_document_command_receipts%rowtype;
  v_asset public.cms_document_assets%rowtype;
  v_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'cms-document-command:' || p_actor_id::text || ':neutralize_document:' ||
      p_idempotency_key::text,
    0
  ));
  select * into v_receipt
  from public.cms_document_command_receipts
  where actor_id = p_actor_id
    and action = 'neutralize_document'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;
  if p_expected_sha256 !~ '^[0-9a-f]{64}$' or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_DOCUMENT_SECURITY_HASH_INVALID' using errcode = '22023';
  end if;
  if p_aal <> 'aal2' or not public.cms_actor_authorized(
    p_actor_id, 'cms:documents.manage', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_DOCUMENT_NEUTRALIZE_FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found then raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_asset.processing_status <> 'neutralized'
     or v_asset.source_kind <> 'synthetic_test'
     or v_asset.sha256 is distinct from p_expected_sha256
     or p_environment not in ('staging', 'production') then
    raise exception 'CMS_DOCUMENT_NEUTRALIZE_CONFIRMATION_INVALID' using errcode = '23514';
  end if;

  if v_asset.blob_disposition <> 'removed' then
    update public.cms_document_assets set
      blob_disposition = 'removed',
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:documents.qa_blob_removed', 'document_asset', p_document_id::text,
      jsonb_build_object(
        'documentSha256', v_asset.sha256,
        'blobDisposition', 'removed',
        'syntheticOnly', true
      ),
      p_correlation_id
    );
  end if;

  v_response := jsonb_build_object(
    'documentId', v_asset.id,
    'status', 'neutralized',
    'blobDisposition', 'removed',
    'lockVersion', v_asset.lock_version,
    'correlationId', p_correlation_id,
    'replayed', false
  );
  insert into public.cms_document_command_receipts (
    actor_id, action, idempotency_key, request_hash, document_id, correlation_id, response
  ) values (
    p_actor_id, 'neutralize_document', p_idempotency_key, p_request_hash,
    p_document_id, p_correlation_id, v_response
  );
  return v_response;
end;
$$;

revoke all on function public.cms_prepare_synthetic_document_neutralization(
  uuid, uuid, text, text, text, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.cms_confirm_synthetic_document_removal(
  uuid, uuid, text, text, text, text, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.cms_prepare_synthetic_document_neutralization(
  uuid, uuid, text, text, text, timestamptz, uuid
) to service_role;
grant execute on function public.cms_confirm_synthetic_document_removal(
  uuid, uuid, text, text, text, text, timestamptz, uuid, text, uuid
) to service_role;

create or replace function public.cms_fixture_neutralize_synthetic_document(
  p_actor_id uuid,
  p_document_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text,
  p_blob_removed boolean,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_previous_status text;
begin
  if p_blob_removed is null
     or p_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or p_candidate_sha !~ '^[0-9a-f]{40}$'
     or p_environment not in ('staging', 'production')
     or right(p_run_tag, 9) <> ('-' || left(p_candidate_sha, 8)) then
    raise exception 'CMS_DOCUMENT_FIXTURE_NEUTRALIZATION_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.cms_qa_actor_leases cleaner
    where cleaner.actor_id = p_actor_id
      and cleaner.run_tag = p_run_tag
      and cleaner.candidate_sha = p_candidate_sha
      and cleaner.environment = p_environment
      and cleaner.status in ('active', 'expired')
      and private.cms_qa_actor_marker_is_exact(
        cleaner.actor_id, cleaner.run_tag, cleaner.candidate_sha, cleaner.environment
      )
  ) then
    raise exception 'CMS_DOCUMENT_FIXTURE_LEASE_INVALID' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found then raise exception 'CMS_DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_asset.created_by is null
     or v_asset.source_kind <> 'synthetic_test'
     or v_asset.source_reference <> p_run_tag
     or not exists (
       select 1 from private.cms_qa_actor_leases uploader
       where uploader.actor_id = v_asset.created_by
         and uploader.run_tag = p_run_tag
         and uploader.candidate_sha = p_candidate_sha
         and uploader.environment = p_environment
         and uploader.status in ('active', 'expired')
         and private.cms_qa_actor_marker_is_exact(
           uploader.actor_id, uploader.run_tag, uploader.candidate_sha, uploader.environment
         )
     ) then
    raise exception 'CMS_DOCUMENT_FIXTURE_SCOPE_INVALID' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.cms_published_projection publication
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(publication.payload -> 'documents') = 'array'
        then publication.payload -> 'documents' else '[]'::jsonb end
    ) document
    where lower(document ->> 'id') = p_document_id::text
      and document ->> 'storagePath' = v_asset.storage_path
  ) then
    raise exception 'CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS' using errcode = '23514';
  end if;

  v_previous_status := v_asset.processing_status;
  if not p_blob_removed
     and (v_asset.processing_status <> 'neutralized' or v_asset.blob_disposition = 'available') then
    update public.cms_document_assets set
      processing_status = 'neutralized',
      archived_at = coalesce(archived_at, now()),
      archived_by = p_actor_id,
      neutralized_at = coalesce(neutralized_at, now()),
      neutralized_by = p_actor_id,
      blob_disposition = case
        when blob_disposition = 'removed' then 'removed'
        else 'access_revoked'
      end,
      finalization_claim_id = null,
      finalization_claimed_at = null,
      finalization_claim_expires_at = null,
      processed_at = coalesce(processed_at, now()),
      lock_version = lock_version + 1,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:documents.qa_fixture_access_revoked', 'document_asset', p_document_id::text,
      jsonb_build_object(
        'previousStatus', v_previous_status,
        'documentSha256', v_asset.sha256,
        'blobDisposition', v_asset.blob_disposition,
        'storageRemovalRequired', v_asset.blob_disposition <> 'removed',
        'syntheticOnly', true
      ),
      p_correlation_id
    );
  elsif p_blob_removed and v_asset.blob_disposition = 'access_revoked' then
    if v_asset.processing_status <> 'neutralized' then
      raise exception 'CMS_DOCUMENT_FIXTURE_REMOVAL_NOT_PREPARED' using errcode = '23514';
    end if;
    update public.cms_document_assets set
      blob_disposition = 'removed',
      blob_cleanup_attempts = blob_cleanup_attempts + 1,
      blob_cleanup_last_attempt_at = now(),
      blob_cleanup_last_error_code = null,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:documents.qa_fixture_blob_removed', 'document_asset', p_document_id::text,
      jsonb_build_object(
        'documentSha256', v_asset.sha256,
        'blobDisposition', 'removed',
        'syntheticOnly', true
      ),
      p_correlation_id
    );
  elsif p_blob_removed and v_asset.blob_disposition <> 'removed' then
    raise exception 'CMS_DOCUMENT_FIXTURE_REMOVAL_NOT_PREPARED' using errcode = '23514';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'documentId', v_asset.id,
    'status', v_asset.processing_status,
    'blobDisposition', v_asset.blob_disposition
  );
end;
$$;

revoke all on function public.cms_fixture_neutralize_synthetic_document(
  uuid, uuid, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.cms_fixture_neutralize_synthetic_document(
  uuid, uuid, text, text, text, boolean, uuid
) to service_role;

-- O publico nunca recebe uma URL direta do Storage. Cada download e mediado
-- pela Edge Function, que consulta este alvo novamente antes e depois de ler
-- os bytes; uma retirada ou um archive invalida imediatamente o mesmo href.
create or replace function public.cms_public_document_download_target(
  p_document_id uuid,
  p_expected_sha256 text
)
returns table (
  storage_path text,
  original_filename text,
  expected_sha256 text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select asset.storage_path, asset.original_filename, asset.sha256
  from public.cms_document_assets asset
  where asset.id = p_document_id
    and asset.sha256 = p_expected_sha256
    and asset.visibility = 'public'
    and asset.processing_status = 'ready'
    and asset.scan_status = 'clean'
    and asset.blob_disposition = 'available'
    and asset.archived_at is null
    and (
      (
        asset.source_kind = 'synthetic_test'
        and asset.scan_engine = 'qa-synthetic-attestation-v1'
        and asset.synthetic_expires_at > statement_timestamp()
      )
      or (
        asset.source_kind <> 'synthetic_test'
        and asset.scan_engine <> 'qa-synthetic-attestation-v1'
      )
    )
    and exists (
      select 1
      from public.cms_published_projection projection
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(projection.payload -> 'documents') = 'array'
          then projection.payload -> 'documents' else '[]'::jsonb end
      ) document
      where projection.content_type = 'product'
        and lower(document ->> 'id') = asset.id::text
        and document ->> 'storagePath' = asset.storage_path
        and document ->> 'kind' = asset.kind
        and document ->> 'sha256' = asset.sha256
        and document ->> 'revision' = asset.revision
        and lower(document ->> 'language') = asset.language
        and document ->> 'visibility' = 'public'
        and document ->> 'rightsConfirmed' = 'true'
    )
  limit 1;
$$;

revoke all on function public.cms_public_document_download_target(uuid,text)
  from public, anon, authenticated;
grant execute on function public.cms_public_document_download_target(uuid,text) to service_role;

-- O worker de outbox ja possui uma chamada autenticada pelo Vault e roda a
-- cada cinco minutos. Ele tambem reconcilia blobs cujo acesso foi revogado,
-- inclusive quando o watchdog expirou a lease antes da remocao fisica.
create or replace function public.cms_list_pending_document_blob_cleanup(
  p_limit integer default 20
)
returns table (
  document_id uuid,
  storage_path text,
  processing_status text,
  source_kind text,
  source_reference text,
  expected_sha256 text,
  actor_id uuid,
  candidate_sha text,
  environment text
)
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_LIMIT_INVALID' using errcode = '22023';
  end if;
  return query
  select
    pending.document_id,
    pending.storage_path,
    pending.processing_status,
    pending.source_kind,
    pending.source_reference,
    pending.expected_sha256,
    pending.actor_id,
    pending.candidate_sha,
    pending.environment
  from (
    select
      asset.id as document_id,
      asset.upload_path as storage_path,
      asset.processing_status,
      asset.source_kind,
      asset.source_reference,
      asset.sha256 as expected_sha256,
      asset.created_by as actor_id,
      lease.candidate_sha,
      lease.environment,
      0 as path_order,
      asset.upload_cleanup_last_attempt_at as last_attempt_at,
      asset.created_at
    from public.cms_document_assets asset
    left join private.cms_qa_actor_leases lease
      on lease.actor_id = asset.created_by and lease.run_tag = asset.source_reference
    where asset.upload_disposition <> 'removed'
      and (
        (
          asset.upload_token_expires_at is null
          and asset.processing_status = 'rejected'
          and asset.scan_engine = 'upload_signing_failed'
        )
        or coalesce(
          asset.upload_token_expires_at,
          asset.created_at + interval '120 minutes'
        ) + interval '5 minutes' <= statement_timestamp()
      )

    union all

    select
      asset.id,
      asset.storage_path,
      asset.processing_status,
      asset.source_kind,
      asset.source_reference,
      asset.sha256,
      asset.created_by,
      lease.candidate_sha,
      lease.environment,
      1,
      asset.blob_cleanup_last_attempt_at,
      asset.created_at
    from public.cms_document_assets asset
    left join private.cms_qa_actor_leases lease
      on lease.actor_id = asset.created_by and lease.run_tag = asset.source_reference
    where (
        asset.blob_disposition <> 'removed'
        or (
          asset.blob_disposition = 'removed'
          and asset.canonical_cleanup_verify_until > statement_timestamp()
        )
      )
      and coalesce(
        asset.canonical_cleanup_not_before,
        '-infinity'::timestamptz
      ) <= statement_timestamp()
      and (
        asset.blob_cleanup_last_attempt_at is null
        or asset.blob_cleanup_last_attempt_at + interval '5 minutes' <= statement_timestamp()
      )
      and (
        (
          asset.blob_disposition in ('access_revoked', 'removed')
          and asset.processing_status in ('rejected', 'neutralized')
        )
        or (
          asset.processing_status in ('awaiting_upload', 'finalizing')
          and greatest(
            coalesce(
              asset.upload_token_expires_at,
              asset.created_at + interval '120 minutes'
            ) + interval '5 minutes',
            coalesce(
              asset.canonical_write_claim_expires_at,
              asset.created_at
            ) + interval '30 minutes'
          ) <= statement_timestamp()
        )
      )
  ) pending
  order by pending.last_attempt_at nulls first,
    pending.created_at,
    pending.document_id,
    pending.path_order
  limit p_limit;
end;
$$;

create or replace function public.cms_record_document_blob_cleanup_failure(
  p_document_id uuid,
  p_storage_path text,
  p_error_code text,
  p_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_is_upload boolean;
begin
  if p_error_code not in (
    'storage_remove_failed', 'storage_verify_failed', 'storage_residue', 'database_confirm_failed'
  ) then
    raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_ERROR_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found or p_storage_path not in (v_asset.storage_path, v_asset.upload_path) then
    raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_SCOPE_INVALID' using errcode = '42501';
  end if;
  v_is_upload := p_storage_path = v_asset.upload_path;
  if v_is_upload then
    if v_asset.upload_disposition = 'removed' then
      raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_STATE_INVALID' using errcode = '23514';
    end if;
    update public.cms_document_assets set
      upload_cleanup_attempts = upload_cleanup_attempts + 1,
      upload_cleanup_last_attempt_at = now(),
      upload_cleanup_last_error_code = p_error_code,
      updated_at = now()
    where id = p_document_id;
  else
    if not (
      (v_asset.blob_disposition = 'access_revoked'
        and v_asset.processing_status in ('rejected', 'neutralized'))
      or v_asset.processing_status in ('awaiting_upload', 'finalizing')
    ) then
      raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_STATE_INVALID' using errcode = '23514';
    end if;
    update public.cms_document_assets set
      blob_cleanup_attempts = blob_cleanup_attempts + 1,
      blob_cleanup_last_attempt_at = now(),
      blob_cleanup_last_error_code = p_error_code,
      updated_at = now()
    where id = p_document_id;
  end if;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    v_asset.created_by,
    'cms:documents.blob_cleanup_pending',
    'document_asset',
    p_document_id::text,
    jsonb_build_object(
      'errorCode', p_error_code,
      'pathKind', case when v_is_upload then 'upload' else 'canonical' end,
      'processingStatus', v_asset.processing_status,
      'syntheticOnly', v_asset.source_kind = 'synthetic_test'
    ),
    p_correlation_id
  );
end;
$$;

create or replace function public.cms_confirm_document_blob_removal(
  p_document_id uuid,
  p_storage_path text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_asset public.cms_document_assets%rowtype;
  v_is_upload boolean;
  v_cleanup_allowed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('cms-document:' || p_document_id::text, 0));
  select * into v_asset
  from public.cms_document_assets
  where id = p_document_id
  for update;
  if not found or p_storage_path not in (v_asset.storage_path, v_asset.upload_path) then
    raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_SCOPE_INVALID' using errcode = '42501';
  end if;
  v_is_upload := p_storage_path = v_asset.upload_path;
  v_cleanup_allowed_at := coalesce(
    v_asset.upload_token_expires_at,
    v_asset.created_at + interval '120 minutes'
  ) + interval '5 minutes';
  if not v_is_upload then
    v_cleanup_allowed_at := greatest(
      v_cleanup_allowed_at,
      coalesce(v_asset.canonical_cleanup_not_before, '-infinity'::timestamptz),
      coalesce(
        v_asset.canonical_write_claim_expires_at,
        v_asset.finalization_claim_expires_at,
        '-infinity'::timestamptz
      ) + interval '30 minutes'
    );
  end if;
  if not v_is_upload and v_cleanup_allowed_at > statement_timestamp() then
    raise exception 'CMS_DOCUMENT_FINALIZATION_BUSY' using errcode = '40001';
  end if;
  if v_is_upload then
    if v_asset.upload_disposition = 'removed' then
      return jsonb_build_object(
        'schemaVersion', 1,
        'documentId', v_asset.id,
        'uploadDisposition', 'removed',
        'replayed', true
      );
    end if;
    if not (
      statement_timestamp() >= v_cleanup_allowed_at
      or (
        v_asset.upload_token_expires_at is null
        and v_asset.processing_status = 'rejected'
        and v_asset.scan_engine = 'upload_signing_failed'
      )
    ) then
      raise exception 'CMS_DOCUMENT_UPLOAD_TOKEN_STILL_ACTIVE' using errcode = '23514';
    end if;
    update public.cms_document_assets set
      upload_disposition = 'removed',
      upload_cleanup_attempts = upload_cleanup_attempts + 1,
      upload_cleanup_last_attempt_at = now(),
      upload_cleanup_last_error_code = null,
      processing_status = case
        when processing_status in ('awaiting_upload', 'finalizing') then 'rejected'
        else processing_status
      end,
      scan_status = case
        when processing_status in ('awaiting_upload', 'finalizing') then 'rejected'
        else scan_status
      end,
      scan_engine = case
        when processing_status in ('awaiting_upload', 'finalizing') then 'upload_expired'
        else scan_engine
      end,
      blob_disposition = case
        when processing_status in ('awaiting_upload', 'finalizing') then 'access_revoked'
        else blob_disposition
      end,
      processed_at = case
        when processing_status in ('awaiting_upload', 'finalizing') then now()
        else processed_at
      end,
      finalization_claim_id = null,
      finalization_claimed_at = null,
      finalization_claim_expires_at = null,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      v_asset.created_by,
      'cms:documents.upload_path_removed',
      'document_asset',
      p_document_id::text,
      jsonb_build_object(
        'processingStatus', v_asset.processing_status,
        'uploadDisposition', 'removed',
        'syntheticOnly', v_asset.source_kind = 'synthetic_test'
      ),
      p_correlation_id
    );
    return jsonb_build_object(
      'schemaVersion', 1,
      'documentId', v_asset.id,
      'uploadDisposition', 'removed',
      'replayed', false
    );
  end if;

  if v_asset.processing_status in ('awaiting_upload', 'finalizing')
     and statement_timestamp() >= v_cleanup_allowed_at then
    update public.cms_document_assets set
      processing_status = 'rejected',
      scan_status = 'rejected',
      scan_engine = 'upload_expired',
      blob_disposition = 'access_revoked',
      processed_at = now(),
      finalization_claim_id = null,
      finalization_claimed_at = null,
      finalization_claim_expires_at = null,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
  end if;
  if v_asset.blob_disposition = 'removed' then
    update public.cms_document_assets set
      blob_cleanup_attempts = blob_cleanup_attempts + 1,
      blob_cleanup_last_attempt_at = now(),
      blob_cleanup_last_error_code = null,
      updated_at = now()
    where id = p_document_id
    returning * into v_asset;
    return jsonb_build_object(
      'schemaVersion', 1,
      'documentId', v_asset.id,
      'blobDisposition', 'removed',
      'replayed', true
    );
  end if;
  if coalesce(
       v_asset.canonical_cleanup_not_before,
       '-infinity'::timestamptz
     ) > statement_timestamp() then
    return jsonb_build_object(
      'schemaVersion', 1,
      'documentId', v_asset.id,
      'blobDisposition', v_asset.blob_disposition,
      'cleanupDeferred', true,
      'replayed', false
    );
  end if;
  if v_asset.blob_disposition <> 'access_revoked'
     or not (
       v_asset.processing_status = 'rejected'
       or (
         v_asset.processing_status = 'neutralized'
         and v_asset.source_kind = 'synthetic_test'
         and v_asset.created_by is not null
         and exists (
           select 1
           from private.cms_qa_actor_leases lease
           where lease.actor_id = v_asset.created_by
             and lease.run_tag = v_asset.source_reference
             and lease.status in ('active', 'expired', 'cleaned')
         )
       )
     ) then
    raise exception 'CMS_DOCUMENT_BLOB_CLEANUP_STATE_INVALID' using errcode = '23514';
  end if;
  if v_asset.processing_status <> 'rejected' and exists (
    select 1
    from public.cms_published_projection publication
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(publication.payload -> 'documents') = 'array'
        then publication.payload -> 'documents' else '[]'::jsonb end
    ) document
    where lower(document ->> 'id') = p_document_id::text
      and document ->> 'storagePath' = v_asset.storage_path
  ) then
    raise exception 'CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS' using errcode = '23514';
  end if;
  update public.cms_document_assets set
    blob_disposition = 'removed',
    blob_cleanup_attempts = blob_cleanup_attempts + 1,
    blob_cleanup_last_attempt_at = now(),
    blob_cleanup_last_error_code = null,
    updated_at = now()
  where id = p_document_id
  returning * into v_asset;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    v_asset.created_by,
    'cms:documents.blob_removed',
    'document_asset',
    p_document_id::text,
    jsonb_build_object(
      'processingStatus', v_asset.processing_status,
      'documentSha256', v_asset.sha256,
      'blobDisposition', 'removed',
      'syntheticOnly', v_asset.source_kind = 'synthetic_test'
    ),
    p_correlation_id
  );
  return jsonb_build_object(
    'schemaVersion', 1,
    'documentId', v_asset.id,
    'blobDisposition', 'removed',
    'replayed', false
  );
end;
$$;

revoke all on function public.cms_list_pending_document_blob_cleanup(integer)
  from public, anon, authenticated;
revoke all on function public.cms_record_document_blob_cleanup_failure(uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.cms_confirm_document_blob_removal(uuid,text,uuid)
  from public, anon, authenticated;
revoke all on function private.cms_validate_synthetic_document_scope()
  from public, anon, authenticated, service_role;
grant execute on function public.cms_list_pending_document_blob_cleanup(integer) to service_role;
grant execute on function public.cms_record_document_blob_cleanup_failure(uuid,text,text,uuid) to service_role;
grant execute on function public.cms_confirm_document_blob_removal(uuid,text,uuid) to service_role;
