-- Fase 3 — comandos editoriais atômicos, preview e outbox/projeção.

create or replace function public.cms_editorial_transition_allowed(p_from text, p_action text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p_action
    when 'save' then p_from in ('draft', 'in_review')
    when 'submit' then p_from = 'draft'
    when 'approve' then p_from = 'in_review'
    when 'schedule' then p_from = 'approved'
    when 'publish' then p_from in ('approved', 'scheduled')
    when 'restore' then p_from in ('published', 'archived')
    when 'archive' then p_from in ('draft', 'in_review', 'approved', 'scheduled', 'published')
    when 'trash' then p_from in ('draft', 'archived')
    else false
  end;
$$;

create function public.cms_editorial_required_permission(p_content_type text, p_action text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_action in ('create', 'save', 'submit', 'archive', 'trash', 'preview')
      then public.cms_content_permission(p_content_type, 'edit')
    when p_action = 'approve' and p_content_type = 'post' then 'cms:posts.approve'
    when p_action in ('schedule', 'publish', 'restore')
      then public.cms_content_permission(p_content_type, 'publish')
    else null
  end;
$$;

create function public.cms_validate_registered_content(
  p_content_type text,
  p_schema_version integer,
  p_payload jsonb
)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_consumer_id text := p_payload ->> 'consumerId';
  v_capability public.cms_capability_registry%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object'
     or p_payload ->> 'contentType' is distinct from p_content_type
     or coalesce((p_payload ->> 'schemaVersion')::integer, 0) <> p_schema_version then
    raise exception 'CMS_CONTENT_SCHEMA_INVALID' using errcode = '23514';
  end if;
  select * into v_capability from public.cms_capability_registry
  where consumer_id = v_consumer_id and content_type = p_content_type
    and schema_version = p_schema_version and enabled;
  if not found then raise exception 'CMS_CONSUMER_UNAVAILABLE' using errcode = '23514'; end if;
  if jsonb_typeof(p_payload -> 'blocks') <> 'array'
     or jsonb_array_length(p_payload -> 'blocks') > 80
     or jsonb_typeof(p_payload -> 'provenance') <> 'array'
     or jsonb_array_length(p_payload -> 'provenance') = 0
     or exists (
       select 1 from jsonb_array_elements(p_payload -> 'provenance') p
       where coalesce((p ->> 'rightsConfirmed')::boolean, false) is not true
     ) then
    raise exception 'CMS_CONTENT_PROVENANCE_INVALID' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'blocks') b
    where not ((v_capability.validation_contract -> 'blocks') ? (b ->> 'type'))
  ) then raise exception 'CMS_BLOCK_WITHOUT_RENDERER' using errcode = '23514'; end if;
  return v_consumer_id;
end;
$$;

create function public.cms_execute_editorial_command(
  p_actor_id uuid,
  p_action text,
  p_item_id uuid,
  p_content_type text,
  p_slug text,
  p_payload jsonb,
  p_expected_lock_version bigint,
  p_revision_id uuid,
  p_reason text,
  p_publish_at timestamptz,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_revision public.cms_content_revisions%rowtype;
  v_permission text;
  v_response jsonb;
  v_consumer_id text;
  v_renderer_key text;
  v_revision_number integer;
  v_content_version bigint;
  v_cache_tag text;
  v_etag text;
  v_changed integer;
begin
  if p_actor_id is null or p_idempotency_key is null or p_correlation_id is null then
    raise exception 'CMS_COMMAND_INVALID' using errcode = '22023';
  end if;

  if p_action = 'create' then
    v_permission := public.cms_editorial_required_permission(p_content_type, p_action);
  else
    select * into v_item from public.cms_content_items where id = p_item_id for update;
    if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_permission := public.cms_editorial_required_permission(v_item.content_type, p_action);
  end if;
  if v_permission is null or not public.cms_actor_authorized(p_actor_id, v_permission, p_aal, p_session_id, p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  select response into v_response from public.cms_editorial_command_receipts
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  if found and v_response is not null then return v_response; end if;

  insert into public.cms_editorial_command_receipts
    (actor_id, action, idempotency_key, item_id, correlation_id)
  values (p_actor_id, p_action, p_idempotency_key, p_item_id, p_correlation_id)
  on conflict do nothing;

  if p_action = 'create' then
    if p_item_id is not null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'CMS_COMMAND_INVALID' using errcode = '22023';
    end if;
    v_consumer_id := public.cms_validate_registered_content(p_content_type, 1, p_payload);
    insert into public.cms_content_items (content_type, slug, created_by, updated_by)
    values (p_content_type, p_slug, p_actor_id, p_actor_id) returning * into v_item;
    insert into public.cms_content_drafts (item_id, schema_version, payload, seo, provenance, updated_by)
    values (v_item.id, 1, p_payload, p_payload -> 'seo', p_payload -> 'provenance', p_actor_id)
    returning * into v_draft;
    update public.cms_editorial_command_receipts set item_id = v_item.id
    where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'draft', 'lockVersion', v_draft.lock_version, 'consumerId', v_consumer_id);

  elsif p_action = 'save' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'save') then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    select * into v_draft from public.cms_content_drafts where item_id = v_item.id for update;
    v_consumer_id := public.cms_validate_registered_content(v_item.content_type, v_draft.schema_version, p_payload);
    update public.cms_content_drafts set payload = p_payload, seo = p_payload -> 'seo',
      provenance = p_payload -> 'provenance', lock_version = lock_version + 1,
      updated_by = p_actor_id, updated_at = now()
    where item_id = v_item.id and lock_version = p_expected_lock_version
    returning * into v_draft;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then raise exception 'CMS_CONTENT_CONFLICT' using errcode = '40001'; end if;
    update public.cms_content_items set slug = coalesce(nullif(p_slug, ''), slug), updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', v_item.workflow_status, 'lockVersion', v_draft.lock_version, 'consumerId', v_consumer_id);

  elsif p_action = 'submit' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'submit') then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    select * into v_draft from public.cms_content_drafts where item_id = v_item.id for update;
    if v_draft.lock_version <> p_expected_lock_version then raise exception 'CMS_CONTENT_CONFLICT' using errcode = '40001'; end if;
    perform public.cms_validate_registered_content(v_item.content_type, v_draft.schema_version, v_draft.payload);
    select coalesce(max(revision_number), 0) + 1 into v_revision_number from public.cms_content_revisions where item_id = v_item.id;
    insert into public.cms_content_revisions
      (item_id, revision_number, schema_version, payload, seo, provenance, source_draft_version, reason, created_by)
    values (v_item.id, v_revision_number, v_draft.schema_version, v_draft.payload, v_draft.seo,
      v_draft.provenance, v_draft.lock_version, p_reason, p_actor_id) returning * into v_revision;
    update public.cms_content_items set workflow_status = 'in_review', updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'in_review', 'revisionId', v_revision.id, 'revisionNumber', v_revision.revision_number);

  elsif p_action = 'approve' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'approve') then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    select * into v_revision from public.cms_content_revisions
      where item_id = v_item.id and (p_revision_id is null or id = p_revision_id)
      order by revision_number desc limit 1;
    if not found then raise exception 'CMS_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    insert into public.cms_content_approvals (item_id, revision_id, reviewer_id, decision, note)
    values (v_item.id, v_revision.id, p_actor_id, 'approved', p_reason);
    update public.cms_content_items set workflow_status = 'approved', updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'approved', 'revisionId', v_revision.id);

  elsif p_action = 'schedule' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'schedule') or p_publish_at <= now() then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    update public.cms_content_items set workflow_status = 'scheduled', scheduled_for = p_publish_at, updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'scheduled', 'scheduledFor', p_publish_at);

  elsif p_action in ('publish', 'restore') then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, p_action)
       or (v_item.workflow_status = 'scheduled' and v_item.scheduled_for > now()) then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    select * into v_revision from public.cms_content_revisions
      where item_id = v_item.id and (p_revision_id is null or id = p_revision_id)
      order by revision_number desc limit 1;
    if not found then raise exception 'CMS_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    if p_action = 'restore' then
      select coalesce(max(revision_number), 0) + 1 into v_revision_number from public.cms_content_revisions where item_id = v_item.id;
      insert into public.cms_content_revisions
        (item_id, revision_number, schema_version, payload, seo, provenance, source_draft_version, reason, created_by)
      values (v_item.id, v_revision_number, v_revision.schema_version, v_revision.payload, v_revision.seo,
        v_revision.provenance, v_revision.source_draft_version, p_reason, p_actor_id) returning * into v_revision;
      update public.cms_content_drafts set schema_version = v_revision.schema_version, payload = v_revision.payload,
        seo = v_revision.seo, provenance = v_revision.provenance, lock_version = lock_version + 1,
        updated_by = p_actor_id, updated_at = now() where item_id = v_item.id;
    end if;
    v_consumer_id := public.cms_validate_registered_content(v_item.content_type, v_revision.schema_version, v_revision.payload);
    select renderer_key into v_renderer_key from public.cms_capability_registry where consumer_id = v_consumer_id;
    select coalesce(content_version, 0) + 1 into v_content_version from public.cms_published_projection where item_id = v_item.id;
    v_content_version := coalesce(v_content_version, 1);
    v_cache_tag := 'cms:' || v_item.content_type || ':' || v_item.id;
    v_etag := '"' || encode(extensions.digest(convert_to(v_revision.id::text || ':' || v_content_version::text, 'UTF8'), 'sha256'), 'hex') || '"';
    insert into public.cms_published_projection
      (item_id, revision_id, content_type, slug, schema_version, consumer_id, renderer_key, payload, seo,
       content_version, cache_tag, etag, published_at)
    values (v_item.id, v_revision.id, v_item.content_type, v_item.slug, v_revision.schema_version,
      v_consumer_id, v_renderer_key, v_revision.payload, v_revision.seo, v_content_version, v_cache_tag, v_etag, now())
    on conflict (item_id) do update set revision_id = excluded.revision_id, slug = excluded.slug,
      schema_version = excluded.schema_version, consumer_id = excluded.consumer_id, renderer_key = excluded.renderer_key,
      payload = excluded.payload, seo = excluded.seo, content_version = excluded.content_version,
      cache_tag = excluded.cache_tag, etag = excluded.etag, published_at = excluded.published_at;
    insert into public.cms_publications (item_id, revision_id, cache_tag, published_by, published_at)
    values (v_item.id, v_revision.id, v_cache_tag, p_actor_id, now())
    on conflict (item_id) do update set revision_id = excluded.revision_id, cache_tag = excluded.cache_tag,
      published_by = excluded.published_by, published_at = excluded.published_at;
    insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
    values (v_item.id, v_revision.id, p_action, p_correlation_id) on conflict do nothing;
    update public.cms_content_items set workflow_status = 'published', scheduled_for = null,
      archived_at = null, updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'published', 'revisionId', v_revision.id,
      'contentVersion', v_content_version, 'cacheTag', v_cache_tag, 'etag', v_etag);

  elsif p_action = 'archive' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'archive') then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    update public.cms_content_items set workflow_status = 'archived', archived_at = now(), scheduled_for = null,
      updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'archived');

  elsif p_action = 'trash' then
    if not public.cms_editorial_transition_allowed(v_item.workflow_status, 'trash') then
      raise exception 'CMS_TRANSITION_INVALID' using errcode = '23514';
    end if;
    update public.cms_content_items set workflow_status = 'trashed', deleted_at = now(), deleted_by = p_actor_id,
      archived_at = null, updated_by = p_actor_id where id = v_item.id;
    v_response := jsonb_build_object('itemId', v_item.id, 'status', 'trashed');
  else
    raise exception 'CMS_COMMAND_INVALID' using errcode = '22023';
  end if;

  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (p_actor_id, 'cms:content.' || p_action, 'content_item', coalesce(v_item.id, p_item_id)::text,
    jsonb_build_object('status', v_response ->> 'status', 'revisionId', v_response ->> 'revisionId'), p_correlation_id);
  update public.cms_editorial_command_receipts set response = v_response
  where actor_id = p_actor_id and action = p_action and idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

create function public.cms_issue_preview(
  p_actor_id uuid, p_item_id uuid, p_revision_id uuid, p_token_hash text,
  p_expires_at timestamptz, p_max_uses integer, p_aal text, p_session_id text,
  p_issued_at timestamptz, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.cms_content_items%rowtype; v_draft public.cms_content_drafts%rowtype; v_revision public.cms_content_revisions%rowtype;
begin
  select * into v_item from public.cms_content_items where id = p_item_id;
  if not found or not public.cms_actor_authorized(p_actor_id,
      public.cms_editorial_required_permission(v_item.content_type, 'preview'), p_aal, p_session_id, p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at > now() + interval '30 minutes'
     or p_expires_at <= now() or p_max_uses not between 1 and 50 then
    raise exception 'CMS_PREVIEW_TOKEN_INVALID' using errcode = '22023';
  end if;
  if p_revision_id is null then
    select * into v_draft from public.cms_content_drafts where item_id = p_item_id;
    insert into public.cms_preview_tokens (token_hash, item_id, snapshot_payload, snapshot_seo, created_by, expires_at, max_uses)
    values (p_token_hash, p_item_id, v_draft.payload, v_draft.seo, p_actor_id, p_expires_at, p_max_uses);
  else
    select * into v_revision from public.cms_content_revisions where id = p_revision_id and item_id = p_item_id;
    if not found then raise exception 'CMS_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
    insert into public.cms_preview_tokens (token_hash, item_id, revision_id, snapshot_payload, snapshot_seo, created_by, expires_at, max_uses)
    values (p_token_hash, p_item_id, p_revision_id, v_revision.payload, v_revision.seo, p_actor_id, p_expires_at, p_max_uses);
  end if;
  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (p_actor_id, 'cms:content.preview', 'content_item', p_item_id::text,
    jsonb_build_object('expiresAt', p_expires_at, 'maxUses', p_max_uses), p_correlation_id);
  return jsonb_build_object('expiresAt', p_expires_at, 'maxUses', p_max_uses);
end;
$$;

create function public.cms_consume_preview(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token public.cms_preview_tokens%rowtype; v_item public.cms_content_items%rowtype; v_cap public.cms_capability_registry%rowtype;
begin
  select * into v_token from public.cms_preview_tokens where token_hash = p_token_hash for update;
  if not found or v_token.revoked_at is not null or v_token.expires_at <= now() or v_token.use_count >= v_token.max_uses then
    raise exception 'CMS_PREVIEW_EXPIRED' using errcode = '42501';
  end if;
  select * into v_item from public.cms_content_items where id = v_token.item_id;
  select * into v_cap from public.cms_capability_registry where consumer_id = v_token.snapshot_payload ->> 'consumerId' and enabled;
  if not found then raise exception 'CMS_CONSUMER_UNAVAILABLE' using errcode = '23514'; end if;
  update public.cms_preview_tokens set use_count = use_count + 1, last_used_at = now() where token_hash = p_token_hash;
  return jsonb_build_object('itemId', v_item.id, 'slug', v_item.slug, 'contentType', v_item.content_type,
    'revisionId', v_token.revision_id, 'rendererKey', v_cap.preview_renderer_key,
    'payload', v_token.snapshot_payload, 'seo', v_token.snapshot_seo,
    'expiresAt', v_token.expires_at, 'remainingUses', v_token.max_uses - v_token.use_count - 1);
end;
$$;

revoke all on function public.cms_editorial_required_permission(text,text) from public, anon;
revoke all on function public.cms_validate_registered_content(text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.cms_execute_editorial_command(uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,text,text,timestamptz,uuid,uuid) from public, anon, authenticated;
revoke all on function public.cms_issue_preview(uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.cms_consume_preview(text) from public, anon, authenticated;
grant execute on function public.cms_editorial_required_permission(text,text) to authenticated, service_role;
grant execute on function public.cms_execute_editorial_command(uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamptz,text,text,timestamptz,uuid,uuid) to service_role;
grant execute on function public.cms_issue_preview(uuid,uuid,uuid,text,timestamptz,integer,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_consume_preview(text) to service_role;
