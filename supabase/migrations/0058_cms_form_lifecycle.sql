-- Homologacao final do CMS: retirada e restauracao governadas de formularios.
-- As definicoes e versoes continuam preservadas; somente o ponteiro publico muda.

alter table public.cms_form_definitions
  add column if not exists lock_version bigint not null default 1
  check (lock_version > 0);

alter table public.cms_form_definitions
  drop constraint if exists cms_form_definition_publication_consistency;
alter table public.cms_form_definitions
  add constraint cms_form_definition_publication_consistency
  check (
    (status = 'published' and active_version_id is not null)
    or (status in ('draft', 'retired') and active_version_id is null)
  ) not valid;
alter table public.cms_form_definitions
  validate constraint cms_form_definition_publication_consistency;

create or replace function public.cms_form_definition_advance_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.lock_version := old.lock_version + 1;
  return new;
end;
$$;

drop trigger if exists cms_forms_advance_lock on public.cms_form_definitions;
create trigger cms_forms_advance_lock
before update on public.cms_form_definitions
for each row execute function public.cms_form_definition_advance_lock();

-- Uma versao publicada pode ser retirada e posteriormente restaurada pela RPC
-- governada. O conteudo congelado da versao continua imutavel.
create or replace function public.cms_form_version_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CMS_IMMUTABLE_RECORD' using errcode = '55000';
  end if;
  if row(
       old.id, old.form_id, old.version, old.definition, old.consent_text,
       old.consent_version, old.privacy_path, old.sla_minutes,
       old.retention_days, old.reason, old.created_by, old.created_at
     ) is distinct from row(
       new.id, new.form_id, new.version, new.definition, new.consent_text,
       new.consent_version, new.privacy_path, new.sla_minutes,
       new.retention_days, new.reason, new.created_by, new.created_at
     ) then
    raise exception 'CMS_IMMUTABLE_RECORD' using errcode = '55000';
  end if;
  if (old.status = 'published' and new.status not in ('published', 'retired'))
     or (old.status = 'retired' and new.status not in ('retired', 'published')) then
    raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
  end if;
  if old.published_at is not null and new.published_at is distinct from old.published_at then
    raise exception 'CMS_IMMUTABLE_RECORD' using errcode = '55000';
  end if;
  return new;
end;
$$;

alter table public.cms_ev2_command_receipts
  drop constraint if exists cms_ev2_command_receipts_domain_check;
alter table public.cms_ev2_command_receipts
  add constraint cms_ev2_command_receipts_domain_check
  check (domain in ('release', 'collaboration', 'bulk', 'forms'));

create or replace function public.cms_execute_form_lifecycle_command(
  p_actor_id uuid,
  p_action text,
  p_form_id uuid,
  p_source_version_id uuid,
  p_expected_lock_version bigint,
  p_reason text,
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
  v_receipt public.cms_ev2_command_receipts%rowtype;
  v_form public.cms_form_definitions%rowtype;
  v_source public.cms_form_versions%rowtype;
  v_previous_status text;
  v_retired_version_id uuid;
  v_response jsonb;
  v_inserted integer;
begin
  if p_action not in ('archive_form', 'restore_form')
     or p_form_id is null
     or p_expected_lock_version is null
     or p_expected_lock_version < 1
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500
     or p_idempotency_key is null
     or p_correlation_id is null
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or (p_action = 'archive_form' and p_source_version_id is not null)
     or (p_action = 'restore_form' and p_source_version_id is null) then
    raise exception 'CMS_FORM_COMMAND_INVALID' using errcode = '22023';
  end if;

  if not public.cms_actor_authorized(
    p_actor_id, 'cms:forms.publish', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_FORM_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.cms_ev2_command_receipts (
    actor_id, domain, action, idempotency_key, command_id,
    request_hash, correlation_id
  ) values (
    p_actor_id, 'forms', p_action, p_idempotency_key, gen_random_uuid(),
    p_request_hash, p_correlation_id
  ) on conflict (actor_id, domain, action, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_receipt
    from public.cms_ev2_command_receipts
    where actor_id = p_actor_id
      and domain = 'forms'
      and action = p_action
      and idempotency_key = p_idempotency_key
    for update;
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_FORM_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_FORM_IDEMPOTENCY_CONFLICT_IN_PROGRESS' using errcode = '40001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed', true);
  end if;

  select * into v_form
  from public.cms_form_definitions
  where id = p_form_id
  for update;
  if not found then
    raise exception 'CMS_FORM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_form.lock_version <> p_expected_lock_version then
    raise exception 'CMS_FORM_VERSION_CONFLICT:%', v_form.lock_version using errcode = 'P0001';
  end if;

  if p_action = 'archive_form' then
    if v_form.status = 'retired' then
      raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_previous_status := v_form.status;
    v_retired_version_id := v_form.active_version_id;
    if v_form.status = 'published' then
      update public.cms_form_versions
      set status = 'retired'
      where id = v_form.active_version_id
        and form_id = v_form.id
        and status = 'published';
      if not found then
        raise exception 'CMS_FORM_STATE_INVALID' using errcode = '23514';
      end if;
    end if;
    update public.cms_form_definitions
    set status = 'retired', active_version_id = null, updated_by = p_actor_id
    where id = v_form.id
    returning * into v_form;
    v_response := jsonb_build_object(
      'formId', v_form.id,
      'status', v_form.status,
      'lockVersion', v_form.lock_version,
      'retiredVersionId', v_retired_version_id,
      'replayed', false
    );
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:form.archive', 'form', v_form.id::text,
      jsonb_build_object(
        'reason', btrim(p_reason),
        'previousStatus', v_previous_status,
        'retiredVersionId', v_retired_version_id,
        'lockVersion', v_form.lock_version
      ),
      p_correlation_id
    );
  else
    if v_form.status <> 'retired' then
      raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
    end if;
    select * into v_source
    from public.cms_form_versions
    where id = p_source_version_id and form_id = v_form.id
    for update;
    if not found then
      raise exception 'CMS_FORM_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_source.status = 'retired' then
      update public.cms_form_versions
      set status = 'published'
      where id = v_source.id;
      update public.cms_form_definitions
      set status = 'published', active_version_id = v_source.id, updated_by = p_actor_id
      where id = v_form.id
      returning * into v_form;
    elsif v_source.status = 'draft' then
      update public.cms_form_definitions
      set status = 'draft', active_version_id = null, updated_by = p_actor_id
      where id = v_form.id
      returning * into v_form;
    else
      raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_response := jsonb_build_object(
      'formId', v_form.id,
      'versionId', v_source.id,
      'status', v_form.status,
      'lockVersion', v_form.lock_version,
      'replayed', false
    );
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id, 'cms:form.restore', 'form', v_form.id::text,
      jsonb_build_object(
        'reason', btrim(p_reason),
        'versionId', v_source.id,
        'restoredStatus', v_form.status,
        'lockVersion', v_form.lock_version
      ),
      p_correlation_id
    );
  end if;

  update public.cms_ev2_command_receipts
  set response = v_response, completed_at = now()
  where actor_id = p_actor_id
    and domain = 'forms'
    and action = p_action
    and idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

-- Publicacao comum aceita somente rascunhos de definicoes ativas. Uma versao
-- retirada precisa passar pelo comando de restauracao, com motivo, lock e recibo.
create or replace function public.cms_publish_form_version(
  p_actor_id uuid,
  p_form_id uuid,
  p_version_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_version public.cms_form_versions%rowtype;
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:forms.publish', p_aal, p_session_id, p_issued_at
  ) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_form
  from public.cms_form_definitions
  where id = p_form_id
  for update;
  if not found then
    raise exception 'CMS_FORM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_form.status = 'retired' then
    raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
  end if;
  select * into v_version
  from public.cms_form_versions
  where id = p_version_id and form_id = p_form_id
  for update;
  if not found then
    raise exception 'CMS_FORM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode = '23514';
  end if;
  update public.cms_form_versions
  set status = 'retired'
  where form_id = p_form_id and status = 'published';
  update public.cms_form_versions
  set status = 'published', published_at = now()
  where id = p_version_id;
  update public.cms_form_definitions
  set status = 'published', active_version_id = p_version_id, updated_by = p_actor_id
  where id = p_form_id
  returning * into v_form;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:form.publish', 'form', p_form_id::text,
    jsonb_build_object(
      'versionId', p_version_id,
      'lockVersion', v_form.lock_version
    ),
    p_correlation_id
  );
  return jsonb_build_object(
    'formId', p_form_id,
    'versionId', p_version_id,
    'status', 'published',
    'lockVersion', v_form.lock_version
  );
end;
$$;

revoke all on function public.cms_execute_form_lifecycle_command(
  uuid, text, uuid, uuid, bigint, text, text, text, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.cms_execute_form_lifecycle_command(
  uuid, text, uuid, uuid, bigint, text, text, text, timestamptz, uuid, text, uuid
) to service_role;

revoke all on function public.cms_publish_form_version(
  uuid, uuid, uuid, text, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.cms_publish_form_version(
  uuid, uuid, uuid, text, text, timestamptz, uuid
) to service_role;
