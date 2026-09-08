-- Homologacao final: compensacao transacional e persistente das mutacoes QA.
--
-- Os documentos globais sao singletons compartilhados. Por isso, depender do
-- `finally` de um navegador deixaria producao vulneravel a uma interrupcao do
-- runner. Esta migration captura o baseline antes da primeira escrita de um
-- ator QA exato e o restaura, com CAS, antes de a lease chegar a um estado
-- terminal. O mesmo gatilho arquiva/inativa residuos sinteticos de DAM, PIM e
-- dados mestres sem remover o historico imutavel.

create table private.cms_qa_global_mutation_journal (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references private.cms_qa_actor_leases (actor_id) on delete restrict,
  item_id uuid not null,
  content_type text not null check (content_type in ('navigation', 'site_settings')),
  baseline_item jsonb not null check (
    baseline_item = 'null'::jsonb or jsonb_typeof(baseline_item) = 'object'
  ),
  baseline_draft jsonb not null check (
    baseline_draft = 'null'::jsonb or jsonb_typeof(baseline_draft) = 'object'
  ),
  baseline_projection jsonb not null check (
    baseline_projection = 'null'::jsonb or jsonb_typeof(baseline_projection) = 'object'
  ),
  baseline_publication jsonb not null check (
    baseline_publication = 'null'::jsonb or jsonb_typeof(baseline_publication) = 'object'
  ),
  baseline_state_hash text not null check (baseline_state_hash ~ '^[0-9a-f]{64}$'),
  baseline_logical_hash text not null check (baseline_logical_hash ~ '^[0-9a-f]{64}$'),
  qa_state_hash text not null check (qa_state_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (
    status in ('active', 'baseline_present', 'restored', 'external_conflict')
  ),
  captured_at timestamptz not null default clock_timestamp(),
  last_qa_mutation_at timestamptz,
  restored_at timestamptz,
  conflict_at timestamptz,
  conflict_table text check (
    conflict_table is null
    or conflict_table in (
      'cms_content_items', 'cms_content_drafts', 'cms_content_revisions',
      'cms_published_projection', 'cms_publications'
    )
  ),
  conflict_operation text check (
    conflict_operation is null or conflict_operation in ('INSERT', 'UPDATE', 'DELETE', 'CAS')
  ),
  unique (actor_id, item_id),
  check (
    (status in ('active', 'restored') and conflict_at is null)
    or status = 'baseline_present'
    or (status = 'external_conflict' and conflict_at is not null)
  ),
  check (
    (status in ('baseline_present', 'restored') and restored_at is not null)
    or (status in ('active', 'external_conflict') and restored_at is null)
  )
);

create unique index cms_qa_global_mutation_one_open_item_idx
  on private.cms_qa_global_mutation_journal (item_id)
  where status in ('active', 'external_conflict');

create index cms_qa_global_mutation_actor_idx
  on private.cms_qa_global_mutation_journal (actor_id, status, captured_at);

create table private.cms_qa_global_mutation_revisions (
  journal_id uuid not null references private.cms_qa_global_mutation_journal (id) on delete restrict,
  revision_id uuid not null references public.cms_content_revisions (id) on delete restrict,
  actor_id uuid not null references private.cms_qa_actor_leases (actor_id) on delete restrict,
  revision_hash text not null check (revision_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default clock_timestamp(),
  primary key (journal_id, revision_id),
  unique (revision_id)
);

revoke all on table private.cms_qa_global_mutation_journal
  from public, anon, authenticated, service_role;
revoke all on table private.cms_qa_global_mutation_revisions
  from public, anon, authenticated, service_role;

create or replace function private.cms_qa_sha256_jsonb(p_value jsonb)
returns text
language sql
immutable
strict
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
  select encode(extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function private.cms_qa_global_state(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'item', coalesce(
      (select to_jsonb(item) from public.cms_content_items item where item.id = p_item_id),
      'null'::jsonb
    ),
    'draft', coalesce(
      (select to_jsonb(draft) from public.cms_content_drafts draft where draft.item_id = p_item_id),
      'null'::jsonb
    ),
    'projection', coalesce(
      (select to_jsonb(projection) from public.cms_published_projection projection where projection.item_id = p_item_id),
      'null'::jsonb
    ),
    'publication', coalesce(
      (select to_jsonb(publication) from public.cms_publications publication where publication.item_id = p_item_id),
      'null'::jsonb
    )
  );
$$;

create or replace function private.cms_qa_global_logical_state_from_snapshots(
  p_item jsonb,
  p_draft jsonb,
  p_projection jsonb,
  p_publication jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'item', case
      when p_item = 'null'::jsonb then jsonb_build_object('present', false)
      else jsonb_build_object(
        'present', true,
        'id', p_item -> 'id',
        'contentType', p_item -> 'content_type',
        'slug', p_item -> 'slug',
        'workflowStatus', p_item -> 'workflow_status',
        'scheduledFor', p_item -> 'scheduled_for'
      )
    end,
    'draft', case
      when p_draft = 'null'::jsonb then jsonb_build_object('present', false)
      else jsonb_build_object(
        'present', true,
        'schemaVersion', p_draft -> 'schema_version',
        'payload', p_draft -> 'payload',
        'seo', p_draft -> 'seo',
        'provenance', p_draft -> 'provenance'
      )
    end,
    'projection', case
      when p_projection = 'null'::jsonb then jsonb_build_object('present', false)
      else jsonb_build_object(
        'present', true,
        'contentType', p_projection -> 'content_type',
        'slug', p_projection -> 'slug',
        'schemaVersion', p_projection -> 'schema_version',
        'consumerId', p_projection -> 'consumer_id',
        'rendererKey', p_projection -> 'renderer_key',
        'payload', p_projection -> 'payload',
        'seo', p_projection -> 'seo',
        'cacheTag', p_projection -> 'cache_tag'
      )
    end,
    'publication', case
      when p_publication = 'null'::jsonb then jsonb_build_object('present', false)
      else jsonb_build_object(
        'present', true,
        'cacheTag', p_publication -> 'cache_tag'
      )
    end
  );
$$;

create or replace function private.cms_qa_global_state_hash(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, extensions, pg_temp
as $$
  select private.cms_qa_sha256_jsonb(private.cms_qa_global_state(p_item_id));
$$;

create or replace function private.cms_qa_global_logical_hash(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, extensions, pg_temp
as $$
  select private.cms_qa_sha256_jsonb(
    private.cms_qa_global_logical_state_from_snapshots(
      state -> 'item',
      state -> 'draft',
      state -> 'projection',
      state -> 'publication'
    )
  )
  from (select private.cms_qa_global_state(p_item_id) as state) current_state;
$$;

create or replace function private.cms_capture_qa_global_snapshot(
  p_item_id uuid,
  p_content_type text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_state jsonb;
  v_state_hash text;
  v_logical_hash text;
  v_journal_id uuid;
begin
  if p_item_id is null
     or p_actor_id is null
     or p_content_type not in ('navigation', 'site_settings') then
    return null;
  end if;

  select lease.* into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
  for share;

  if not found then
    return null;
  end if;
  if v_lease.status <> 'active'
     or v_lease.expires_at <= clock_timestamp()
     or not private.cms_qa_actor_marker_is_exact(
       v_lease.actor_id,
       v_lease.run_tag,
       v_lease.candidate_sha,
       v_lease.environment
     ) then
    raise exception 'CMS_QA_ACTOR_LEASE_EXPIRED' using errcode = '42501';
  end if;

  v_state := private.cms_qa_global_state(p_item_id);
  v_state_hash := private.cms_qa_sha256_jsonb(v_state);
  v_logical_hash := private.cms_qa_sha256_jsonb(
    private.cms_qa_global_logical_state_from_snapshots(
      v_state -> 'item',
      v_state -> 'draft',
      v_state -> 'projection',
      v_state -> 'publication'
    )
  );

  insert into private.cms_qa_global_mutation_journal (
    actor_id,
    item_id,
    content_type,
    baseline_item,
    baseline_draft,
    baseline_projection,
    baseline_publication,
    baseline_state_hash,
    baseline_logical_hash,
    qa_state_hash
  ) values (
    p_actor_id,
    p_item_id,
    p_content_type,
    v_state -> 'item',
    v_state -> 'draft',
    v_state -> 'projection',
    v_state -> 'publication',
    v_state_hash,
    v_logical_hash,
    v_state_hash
  )
  on conflict (actor_id, item_id) do nothing
  returning id into v_journal_id;

  if v_journal_id is null then
    select journal.id into v_journal_id
    from private.cms_qa_global_mutation_journal journal
    where journal.actor_id = p_actor_id and journal.item_id = p_item_id;
  end if;

  if v_journal_id is not null then
    insert into public.cms_audit_log (
      actor_id,
      action,
      target_type,
      target_id,
      event_data,
      correlation_id
    )
    select
      p_actor_id,
      'cms:qa.global_snapshot_captured',
      'content_item',
      p_item_id::text,
      jsonb_build_object(
        'schemaVersion', 1,
        'syntheticOnly', true,
        'contentType', p_content_type,
        'environment', v_lease.environment,
        'candidateSha', v_lease.candidate_sha
      ),
      gen_random_uuid()
    where not exists (
      select 1
      from public.cms_audit_log audit
      where audit.action = 'cms:qa.global_snapshot_captured'
        and audit.actor_id = p_actor_id
        and audit.target_id = p_item_id::text
    );
  end if;

  return v_journal_id;
exception
  when unique_violation then
    -- Outro ator ja possui o journal aberto para o singleton. A escrita real
    -- sera classificada como conflito pelo trigger chamador; jamais substitua o
    -- proprietario do snapshot.
    return null;
end;
$$;

create or replace function private.cms_mark_qa_global_conflict(
  p_journal_id uuid,
  p_table_name text,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_journal private.cms_qa_global_mutation_journal%rowtype;
begin
  select journal.* into v_journal
  from private.cms_qa_global_mutation_journal journal
  where journal.id = p_journal_id
  for update;

  if not found or v_journal.status = 'external_conflict' then
    return;
  end if;

  update private.cms_qa_global_mutation_journal
  set status = 'external_conflict',
      conflict_at = clock_timestamp(),
      conflict_table = p_table_name,
      conflict_operation = p_operation
  where id = p_journal_id and status = 'active';

  if found then
    insert into public.cms_audit_log (
      actor_id,
      action,
      target_type,
      target_id,
      event_data,
      correlation_id
    ) values (
      v_journal.actor_id,
      'cms:qa.global_external_conflict_detected',
      'content_item',
      v_journal.item_id::text,
      jsonb_build_object(
        'schemaVersion', 1,
        'syntheticOnly', true,
        'contentType', v_journal.content_type,
        'mutationTable', p_table_name,
        'mutationOperation', p_operation
      ),
      gen_random_uuid()
    );
  end if;
end;
$$;

create or replace function private.cms_qa_global_mutation_actor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
  v_content_type text;
  v_actor_id uuid;
  v_journal private.cms_qa_global_mutation_journal%rowtype;
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    -- The generic touch triggers run before this trigger alphabetically. During
    -- an internal restore, put the captured timestamp back so the persisted
    -- snapshot (not merely its business fields) is restored exactly.
    if tg_op = 'UPDATE' then
      if tg_table_name = 'cms_content_items' then
        if current_setting('cms.qa_restore_item', true) = new.id::text
           and nullif(current_setting('cms.qa_restore_item_updated_at', true), '') is not null then
          new.updated_at := current_setting('cms.qa_restore_item_updated_at', true)::timestamptz;
        end if;
      elsif tg_table_name = 'cms_content_drafts' then
        if current_setting('cms.qa_restore_item', true) = new.item_id::text
           and nullif(current_setting('cms.qa_restore_draft_updated_at', true), '') is not null then
          new.updated_at := current_setting('cms.qa_restore_draft_updated_at', true)::timestamptz;
        end if;
      end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'cms_content_items' then
    v_item_id := case when tg_op = 'DELETE' then old.id else new.id end;
    v_content_type := case when tg_op = 'DELETE' then old.content_type else new.content_type end;
    if tg_op <> 'DELETE' then
      v_actor_id := case when tg_op = 'INSERT' then new.created_by else new.updated_by end;
    end if;
  elsif tg_table_name = 'cms_content_drafts' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then v_actor_id := new.updated_by; end if;
  elsif tg_table_name = 'cms_published_projection' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then
      select revision.created_by into v_actor_id
      from public.cms_content_revisions revision
      where revision.id = new.revision_id and revision.item_id = new.item_id;
      v_content_type := new.content_type;
    end if;
  elsif tg_table_name = 'cms_publications' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then v_actor_id := new.published_by; end if;
  else
    raise exception 'CMS_QA_GLOBAL_TRIGGER_TABLE_INVALID' using errcode = '55000';
  end if;

  -- O trigger de arquivamento do site remove a projecao em cascata logica e a
  -- linha removida nao possui coluna de ator. Propague somente o ator QA exato
  -- e somente para o mesmo item, no escopo desta transacao.
  if tg_op = 'DELETE'
     and pg_trigger_depth() > 1
     and current_setting('cms.qa_mutation_item', true) = v_item_id::text
     and current_setting('cms.qa_mutation_actor', true)
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := current_setting('cms.qa_mutation_actor', true)::uuid;
  end if;

  if v_content_type is null then
    select item.content_type into v_content_type
    from public.cms_content_items item
    where item.id = v_item_id;
  end if;
  if v_content_type not in ('navigation', 'site_settings') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select journal.* into v_journal
  from private.cms_qa_global_mutation_journal journal
  where journal.item_id = v_item_id
    and journal.status in ('active', 'external_conflict')
  order by journal.captured_at
  limit 1;

  if found then
    if v_actor_id is null or v_actor_id <> v_journal.actor_id then
      perform private.cms_mark_qa_global_conflict(v_journal.id, tg_table_name, tg_op);
    else
      select lease.* into v_lease
      from private.cms_qa_actor_leases lease
      where lease.actor_id = v_actor_id
      for share;
      if not found
         or v_lease.status <> 'active'
         or v_lease.expires_at <= clock_timestamp()
         or not private.cms_qa_actor_marker_is_exact(
           v_lease.actor_id,
           v_lease.run_tag,
           v_lease.candidate_sha,
           v_lease.environment
         ) then
        raise exception 'CMS_QA_ACTOR_LEASE_EXPIRED' using errcode = '42501';
      end if;
    end if;
  elsif v_actor_id is not null then
    perform private.cms_capture_qa_global_snapshot(v_item_id, v_content_type, v_actor_id);
    select journal.* into v_journal
    from private.cms_qa_global_mutation_journal journal
    where journal.item_id = v_item_id
      and journal.status in ('active', 'external_conflict')
    order by journal.captured_at
    limit 1;
    if found and v_journal.actor_id <> v_actor_id then
      perform private.cms_mark_qa_global_conflict(v_journal.id, tg_table_name, tg_op);
    end if;
  end if;

  if v_journal.id is not null and v_actor_id = v_journal.actor_id then
    perform set_config('cms.qa_mutation_actor', v_actor_id::text, true);
    perform set_config('cms.qa_mutation_item', v_item_id::text, true);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.cms_qa_global_mutation_record_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
  v_actor_id uuid;
  v_journal private.cms_qa_global_mutation_journal%rowtype;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'cms_content_items' then
    v_item_id := case when tg_op = 'DELETE' then old.id else new.id end;
    if tg_op <> 'DELETE' then
      v_actor_id := case when tg_op = 'INSERT' then new.created_by else new.updated_by end;
    end if;
  elsif tg_table_name = 'cms_content_drafts' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then v_actor_id := new.updated_by; end if;
  elsif tg_table_name = 'cms_published_projection' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then
      select revision.created_by into v_actor_id
      from public.cms_content_revisions revision
      where revision.id = new.revision_id and revision.item_id = new.item_id;
    end if;
  elsif tg_table_name = 'cms_publications' then
    v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    if tg_op <> 'DELETE' then v_actor_id := new.published_by; end if;
  end if;

  -- Preserve ownership across the publication/projection deletes performed by
  -- cms_unpublish_archived_site_content(). Top-level deletes never inherit the
  -- transaction marker and are therefore treated as external mutations.
  if tg_op = 'DELETE'
     and pg_trigger_depth() > 1
     and current_setting('cms.qa_mutation_item', true) = v_item_id::text
     and current_setting('cms.qa_mutation_actor', true)
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := current_setting('cms.qa_mutation_actor', true)::uuid;
  end if;

  select journal.* into v_journal
  from private.cms_qa_global_mutation_journal journal
  where journal.item_id = v_item_id
    and journal.status in ('active', 'external_conflict')
  order by journal.captured_at
  limit 1;

  if v_journal.id is not null and v_actor_id = v_journal.actor_id then
    update private.cms_qa_global_mutation_journal
    set qa_state_hash = private.cms_qa_global_state_hash(v_item_id),
        last_qa_mutation_at = clock_timestamp()
    where id = v_journal.id;
  elsif v_journal.id is not null then
    perform private.cms_mark_qa_global_conflict(v_journal.id, tg_table_name, tg_op);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.cms_track_qa_global_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_content_type text;
  v_journal private.cms_qa_global_mutation_journal%rowtype;
  v_journal_id uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    return new;
  end if;

  select item.content_type into v_content_type
  from public.cms_content_items item
  where item.id = new.item_id;
  if v_content_type not in ('navigation', 'site_settings') then return new; end if;

  select journal.* into v_journal
  from private.cms_qa_global_mutation_journal journal
  where journal.item_id = new.item_id
    and journal.status in ('active', 'external_conflict')
  order by journal.captured_at
  limit 1;

  if not found then
    v_journal_id := private.cms_capture_qa_global_snapshot(
      new.item_id,
      v_content_type,
      new.created_by
    );
    if v_journal_id is not null then
      select journal.* into v_journal
      from private.cms_qa_global_mutation_journal journal
      where journal.id = v_journal_id;
    end if;
  end if;

  if found and v_journal.actor_id = new.created_by then
    insert into private.cms_qa_global_mutation_revisions (
      journal_id,
      revision_id,
      actor_id,
      revision_hash
    ) values (
      v_journal.id,
      new.id,
      new.created_by,
      private.cms_qa_sha256_jsonb(to_jsonb(new))
    ) on conflict do nothing;
  elsif found then
    perform private.cms_mark_qa_global_conflict(
      v_journal.id,
      'cms_content_revisions',
      'INSERT'
    );
  end if;
  return new;
end;
$$;

create trigger cms_qa_global_item_before_mutation
before insert or update or delete on public.cms_content_items
for each row execute function private.cms_qa_global_mutation_actor();
create trigger cms_qa_global_item_after_mutation
after insert or update or delete on public.cms_content_items
for each row execute function private.cms_qa_global_mutation_record_state();

create trigger cms_qa_global_draft_before_mutation
before insert or update or delete on public.cms_content_drafts
for each row execute function private.cms_qa_global_mutation_actor();
create trigger cms_qa_global_draft_after_mutation
after insert or update or delete on public.cms_content_drafts
for each row execute function private.cms_qa_global_mutation_record_state();

create trigger cms_qa_global_projection_before_mutation
before insert or update or delete on public.cms_published_projection
for each row execute function private.cms_qa_global_mutation_actor();
create trigger cms_qa_global_projection_after_mutation
after insert or update or delete on public.cms_published_projection
for each row execute function private.cms_qa_global_mutation_record_state();

create trigger cms_qa_global_publication_before_mutation
before insert or update or delete on public.cms_publications
for each row execute function private.cms_qa_global_mutation_actor();
create trigger cms_qa_global_publication_after_mutation
after insert or update or delete on public.cms_publications
for each row execute function private.cms_qa_global_mutation_record_state();

create trigger cms_qa_global_revision_track
after insert on public.cms_content_revisions
for each row execute function private.cms_track_qa_global_revision();

-- Os pais dos dominios DAM/PIM/dados mestres precisam participar do mesmo
-- protocolo lease -> recurso usado pelo encerramento. Sem este guard, um INSERT
-- iniciado antes do sweep poderia aparecer depois da enumeracao de residuos.
create or replace function private.cms_qa_domain_parent_lease_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_actor_id uuid;
  v_actor_ids uuid[] := '{}'::uuid[];
  v_parent_actor_ids uuid[] := '{}'::uuid[];
  v_new jsonb;
  v_old jsonb;
  v_bound_actor_id uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_new := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_bound_actor_id := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
  if v_bound_actor_id is not null then
    v_actor_ids := array_append(v_actor_ids, v_bound_actor_id);
  end if;

  -- Inclua tanto o dono quanto o ator da ultima alteracao. Isso fecha o caso
  -- em que o ator QA modifica uma linha corporativa e tenta esconder a
  -- mutacao mantendo o created_by original.
  foreach v_actor_id in array array[
    nullif(v_new ->> 'created_by', '')::uuid,
    nullif(v_new ->> 'updated_by', '')::uuid,
    nullif(v_new ->> 'rolled_back_by', '')::uuid,
    nullif(v_new ->> 'archived_by', '')::uuid,
    nullif(v_old ->> 'created_by', '')::uuid,
    nullif(v_old ->> 'updated_by', '')::uuid
  ] loop
    if v_actor_id is not null then v_actor_ids := array_append(v_actor_ids, v_actor_id); end if;
  end loop;

  -- Trave tambem a lease de todos os pais FK, dos dois lados de um UPDATE.
  -- Assim um filho cross-owner que aguardava o lock do pai nao pode aparecer
  -- depois da enumeracao/terminalizacao do sweeper.
  select coalesce(array_agg(distinct actors.actor_id order by actors.actor_id), '{}'::uuid[])
  into v_parent_actor_ids
  from (
    select asset.created_by as actor_id
    from public.cms_media_assets asset
    where (
      tg_table_name = 'cms_media_assets'
      and asset.id in (
        nullif(v_new ->> 'replaces_asset_id', '')::uuid,
        nullif(v_old ->> 'replaces_asset_id', '')::uuid
      )
    ) or (
      tg_table_name in (
        'cms_media_variants','cms_media_usages','cms_dam_gc_jobs','cms_dam_collection_assets',
        'cms_dam_asset_tags','cms_dam_crops'
      )
      and asset.id in (
        nullif(v_new ->> 'asset_id', '')::uuid,
        nullif(v_old ->> 'asset_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_dam_replacements'
      and asset.id in (
        nullif(v_new ->> 'source_asset_id', '')::uuid,
        nullif(v_new ->> 'target_asset_id', '')::uuid,
        nullif(v_old ->> 'source_asset_id', '')::uuid,
        nullif(v_old ->> 'target_asset_id', '')::uuid
      )
    )
    union all
    select collection.created_by
    from public.cms_dam_collections collection
    where tg_table_name = 'cms_dam_collection_assets'
      and collection.id in (
        nullif(v_new ->> 'collection_id', '')::uuid,
        nullif(v_old ->> 'collection_id', '')::uuid
      )
    union all
    select tag.created_by
    from public.cms_dam_tags tag
    where tg_table_name = 'cms_dam_asset_tags'
      and tag.id in (
        nullif(v_new ->> 'tag_id', '')::uuid,
        nullif(v_old ->> 'tag_id', '')::uuid
      )
    union all
    select product.created_by
    from public.cms_pim_products product
    where tg_table_name in (
      'cms_pim_product_master_links','cms_pim_models','cms_pim_variants',
      'cms_pim_skus','cms_pim_external_identifiers','cms_pim_attribute_values',
      'cms_pim_provenance'
    ) and product.id in (
      nullif(v_new ->> 'product_id', '')::uuid,
      nullif(v_old ->> 'product_id', '')::uuid
    )
    union all
    select model.created_by
    from public.cms_pim_models model
    where (
      tg_table_name in ('cms_pim_variants','cms_pim_skus')
      and model.id in (
        nullif(v_new ->> 'model_id', '')::uuid,
        nullif(v_old ->> 'model_id', '')::uuid
      )
    ) or (
      tg_table_name in ('cms_pim_external_identifiers','cms_pim_attribute_values')
      and (
        (v_new ->> 'owner_type' = 'model' and model.id = nullif(v_new ->> 'owner_id', '')::uuid)
        or (v_old ->> 'owner_type' = 'model' and model.id = nullif(v_old ->> 'owner_id', '')::uuid)
        or (v_new ->> 'owner_scope' = 'model' and model.id = nullif(v_new ->> 'owner_id', '')::uuid)
        or (v_old ->> 'owner_scope' = 'model' and model.id = nullif(v_old ->> 'owner_id', '')::uuid)
      )
    )
    union all
    select variant.created_by
    from public.cms_pim_variants variant
    where (
      tg_table_name = 'cms_pim_skus'
      and variant.id in (
        nullif(v_new ->> 'variant_id', '')::uuid,
        nullif(v_old ->> 'variant_id', '')::uuid
      )
    ) or (
      tg_table_name in ('cms_pim_external_identifiers','cms_pim_attribute_values')
      and (
        (v_new ->> 'owner_type' = 'variant' and variant.id = nullif(v_new ->> 'owner_id', '')::uuid)
        or (v_old ->> 'owner_type' = 'variant' and variant.id = nullif(v_old ->> 'owner_id', '')::uuid)
        or (v_new ->> 'owner_scope' = 'variant' and variant.id = nullif(v_new ->> 'owner_id', '')::uuid)
        or (v_old ->> 'owner_scope' = 'variant' and variant.id = nullif(v_old ->> 'owner_id', '')::uuid)
      )
    )
    union all
    select sku.created_by
    from public.cms_pim_skus sku
    where tg_table_name = 'cms_pim_external_identifiers'
      and (
        (v_new ->> 'owner_type' = 'sku' and sku.id = nullif(v_new ->> 'owner_id', '')::uuid)
        or (v_old ->> 'owner_type' = 'sku' and sku.id = nullif(v_old ->> 'owner_id', '')::uuid)
      )
    union all
    select unit.created_by
    from public.cms_pim_units unit
    where (
      tg_table_name = 'cms_pim_attribute_definitions'
      and unit.code in (v_new ->> 'canonical_unit_code', v_old ->> 'canonical_unit_code')
    ) or (
      tg_table_name = 'cms_pim_attribute_values'
      and unit.code in (v_new ->> 'unit_code', v_old ->> 'unit_code')
    )
    union all
    select definition.created_by
    from public.cms_pim_attribute_definitions definition
    where (
      tg_table_name in ('cms_pim_attribute_set_definitions','cms_pim_attribute_values')
      and definition.id in (
        nullif(v_new ->> 'definition_id', '')::uuid,
        nullif(v_old ->> 'definition_id', '')::uuid
      )
    )
    union all
    select attribute_set.created_by
    from public.cms_pim_attribute_sets attribute_set
    where tg_table_name = 'cms_pim_attribute_set_versions'
      and attribute_set.id in (
        nullif(v_new ->> 'attribute_set_id', '')::uuid,
        nullif(v_old ->> 'attribute_set_id', '')::uuid
      )
    union all
    select version.created_by
    from public.cms_pim_attribute_set_versions version
    where tg_table_name = 'cms_pim_attribute_set_definitions'
      and version.id in (
        nullif(v_new ->> 'attribute_set_version_id', '')::uuid,
        nullif(v_old ->> 'attribute_set_version_id', '')::uuid
      )
    union all
    select entity.created_by
    from public.cms_master_entities entity
    where (
      tg_table_name = 'cms_master_entities'
      and entity.id in (
        nullif(v_new ->> 'merged_into_id', '')::uuid,
        nullif(v_old ->> 'merged_into_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_pim_products'
      and entity.id in (
        nullif(v_new ->> 'manufacturer_id', '')::uuid,
        nullif(v_new ->> 'brand_id', '')::uuid,
        nullif(v_new ->> 'line_id', '')::uuid,
        nullif(v_new ->> 'category_id', '')::uuid,
        nullif(v_old ->> 'manufacturer_id', '')::uuid,
        nullif(v_old ->> 'brand_id', '')::uuid,
        nullif(v_old ->> 'line_id', '')::uuid,
        nullif(v_old ->> 'category_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_pim_product_master_links'
      and entity.id in (
        nullif(v_new ->> 'entity_id', '')::uuid,
        nullif(v_old ->> 'entity_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_pim_models'
      and entity.id in (
        nullif(v_new ->> 'manufacturer_id', '')::uuid,
        nullif(v_old ->> 'manufacturer_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_pim_attribute_sets'
      and entity.id in (
        nullif(v_new ->> 'category_id', '')::uuid,
        nullif(v_old ->> 'category_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_master_entity_aliases'
      and entity.id in (
        nullif(v_new ->> 'entity_id', '')::uuid,
        nullif(v_old ->> 'entity_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_master_compatibilities'
      and entity.id in (
        nullif(v_new ->> 'source_entity_id', '')::uuid,
        nullif(v_new ->> 'target_entity_id', '')::uuid,
        nullif(v_old ->> 'source_entity_id', '')::uuid,
        nullif(v_old ->> 'target_entity_id', '')::uuid
      )
    )
    union all
    select item.created_by
    from public.cms_content_items item
    where (
      tg_table_name = 'cms_media_usages'
      and item.id in (
        nullif(v_new ->> 'item_id', '')::uuid,
        nullif(v_old ->> 'item_id', '')::uuid
      )
    ) or (
      tg_table_name = 'cms_pim_products'
      and item.id in (
        nullif(v_new ->> 'content_item_id', '')::uuid,
        nullif(v_old ->> 'content_item_id', '')::uuid
      )
    )
    union all
    select revision.created_by
    from public.cms_content_revisions revision
    where tg_table_name = 'cms_media_usages'
      and revision.id in (
        nullif(v_new ->> 'revision_id', '')::uuid,
        nullif(v_old ->> 'revision_id', '')::uuid
      )
  ) actors
  where actors.actor_id is not null;

  v_actor_ids := array_cat(v_actor_ids, v_parent_actor_ids);

  perform private.cms_lock_active_qa_actor_leases(
    coalesce((select array_agg(distinct lease_actor.actor_id order by lease_actor.actor_id)
              from unnest(v_actor_ids) as lease_actor(actor_id)), '{}'::uuid[])
  );

  -- Fixtures de uma lease QA formam um grafo fechado. Nao permita que o ator
  -- sintetico altere/adote uma linha corporativa, nem que um operador comum
  -- conecte uma linha real a um pai sintetico. Sem essa segregacao o sweep
  -- teria de adivinhar como desfazer estado comercial legitimo.
  if exists (
       select 1
       from private.cms_qa_actor_leases lease
       where lease.actor_id = any(v_actor_ids)
     ) and (
       select count(distinct actor.actor_id)
       from unnest(v_actor_ids) as actor(actor_id)
       where actor.actor_id is not null
     ) <> 1 then
    raise exception 'CMS_QA_CROSS_SCOPE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger cms_qa_media_asset_parent_lease_guard
before insert or update on public.cms_media_assets
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_media_variant_lease_guard
before insert or update on public.cms_media_variants
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_media_usage_lease_guard
before insert or update on public.cms_media_usages
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_collection_parent_lease_guard
before insert or update on public.cms_dam_collections
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_product_parent_lease_guard
before insert or update on public.cms_pim_products
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_entity_parent_lease_guard
before insert or update on public.cms_master_entities
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_tag_lease_guard
before insert or update on public.cms_dam_tags
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_collection_asset_lease_guard
before insert or update on public.cms_dam_collection_assets
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_asset_tag_lease_guard
before insert or update on public.cms_dam_asset_tags
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_crop_lease_guard
before insert or update on public.cms_dam_crops
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_replacement_lease_guard
before insert or update on public.cms_dam_replacements
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_gc_job_lease_guard
before insert on public.cms_dam_gc_jobs
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_product_master_link_lease_guard
before insert or update on public.cms_pim_product_master_links
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_model_lease_guard
before insert or update on public.cms_pim_models
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_variant_lease_guard
before insert or update on public.cms_pim_variants
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_sku_lease_guard
before insert or update on public.cms_pim_skus
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_external_identifier_lease_guard
before insert or update on public.cms_pim_external_identifiers
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_unit_lease_guard
before insert or update on public.cms_pim_units
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_definition_lease_guard
before insert or update on public.cms_pim_attribute_definitions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_lease_guard
before insert or update on public.cms_pim_attribute_sets
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_version_lease_guard
before insert or update on public.cms_pim_attribute_set_versions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_definition_lease_guard
before insert or update on public.cms_pim_attribute_set_definitions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_value_lease_guard
before insert or update on public.cms_pim_attribute_values
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_provenance_lease_guard
before insert or update on public.cms_pim_provenance
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_entity_alias_lease_guard
before insert or update on public.cms_master_entity_aliases
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_compatibility_lease_guard
before insert or update on public.cms_master_compatibilities
for each row execute function private.cms_qa_domain_parent_lease_guard();

create trigger cms_qa_dam_collection_delete_lease_guard
before delete on public.cms_dam_collections
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_tag_delete_lease_guard
before delete on public.cms_dam_tags
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_collection_asset_delete_lease_guard
before delete on public.cms_dam_collection_assets
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_asset_tag_delete_lease_guard
before delete on public.cms_dam_asset_tags
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_crop_delete_lease_guard
before delete on public.cms_dam_crops
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_dam_replacement_delete_lease_guard
before delete on public.cms_dam_replacements
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_product_delete_lease_guard
before delete on public.cms_pim_products
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_product_master_link_delete_lease_guard
before delete on public.cms_pim_product_master_links
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_model_delete_lease_guard
before delete on public.cms_pim_models
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_variant_delete_lease_guard
before delete on public.cms_pim_variants
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_sku_delete_lease_guard
before delete on public.cms_pim_skus
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_external_identifier_delete_lease_guard
before delete on public.cms_pim_external_identifiers
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_unit_delete_lease_guard
before delete on public.cms_pim_units
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_definition_delete_lease_guard
before delete on public.cms_pim_attribute_definitions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_delete_lease_guard
before delete on public.cms_pim_attribute_sets
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_version_delete_lease_guard
before delete on public.cms_pim_attribute_set_versions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_set_definition_delete_lease_guard
before delete on public.cms_pim_attribute_set_definitions
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_attribute_value_delete_lease_guard
before delete on public.cms_pim_attribute_values
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_pim_provenance_delete_lease_guard
before delete on public.cms_pim_provenance
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_entity_delete_lease_guard
before delete on public.cms_master_entities
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_entity_alias_delete_lease_guard
before delete on public.cms_master_entity_aliases
for each row execute function private.cms_qa_domain_parent_lease_guard();
create trigger cms_qa_master_compatibility_delete_lease_guard
before delete on public.cms_master_compatibilities
for each row execute function private.cms_qa_domain_parent_lease_guard();

create or replace function private.cms_enqueue_qa_global_cache_event(
  p_item_id uuid,
  p_revision_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_item_id is null
     or p_revision_id is null
     or p_event_type not in ('restore', 'unpublish') then
    raise exception 'CMS_QA_GLOBAL_CACHE_EVENT_INVALID' using errcode = '22023';
  end if;

  insert into public.cms_publication_outbox (
    item_id,
    revision_id,
    event_type,
    status,
    attempts,
    available_at,
    locked_at,
    completed_at,
    last_error_code,
    correlation_id
  ) values (
    p_item_id,
    p_revision_id,
    p_event_type,
    'pending',
    0,
    clock_timestamp(),
    null,
    null,
    null,
    gen_random_uuid()
  )
  on conflict (item_id, revision_id, event_type) do update
  set status = 'pending',
      attempts = 0,
      available_at = excluded.available_at,
      locked_at = null,
      completed_at = null,
      last_error_code = null,
      correlation_id = excluded.correlation_id;
end;
$$;

create or replace function private.cms_restore_qa_global_snapshots(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_candidate record;
  v_journal private.cms_qa_global_mutation_journal%rowtype;
  v_item public.cms_content_items%rowtype;
  v_draft public.cms_content_drafts%rowtype;
  v_projection public.cms_published_projection%rowtype;
  v_publication public.cms_publications%rowtype;
  v_current_revision_id uuid;
  v_current_state_hash text;
  v_current_logical_hash text;
  v_revision_count integer;
  v_restored integer := 0;
  v_already_baseline integer := 0;
  v_previous_compensation_setting text;
  v_compensation_mode text;
begin
  for v_candidate in
    select journal.id, journal.item_id
    from private.cms_qa_global_mutation_journal journal
    where journal.actor_id = p_actor_id
      and journal.status in ('active', 'external_conflict')
    order by journal.item_id
  loop
    -- O item e bloqueado primeiro, a mesma ordem usada pelos comandos editoriais.
    -- Isso impede uma escrita concorrente entre o CAS e a restauracao.
    perform 1 from public.cms_content_items item
    where item.id = v_candidate.item_id for update;
    perform 1 from public.cms_content_drafts draft
    where draft.item_id = v_candidate.item_id for update;
    perform 1 from public.cms_published_projection projection
    where projection.item_id = v_candidate.item_id for update;
    perform 1 from public.cms_publications publication
    where publication.item_id = v_candidate.item_id for update;

    select journal.* into strict v_journal
    from private.cms_qa_global_mutation_journal journal
    where journal.id = v_candidate.id
    for update;

    v_current_logical_hash := private.cms_qa_global_logical_hash(v_journal.item_id);
    if v_current_logical_hash = v_journal.baseline_logical_hash
       or (
         v_journal.baseline_item = 'null'::jsonb
         and exists (
           select 1 from public.cms_content_items item
           where item.id = v_journal.item_id and item.workflow_status = 'archived'
         )
         and not exists (
           select 1 from public.cms_published_projection projection
           where projection.item_id = v_journal.item_id
         )
         and not exists (
           select 1 from public.cms_publications publication
           where publication.item_id = v_journal.item_id
         )
       ) then
      select projection.revision_id into v_current_revision_id
      from public.cms_published_projection projection
      where projection.item_id = v_journal.item_id;
      if v_current_revision_id is not null then
        perform private.cms_enqueue_qa_global_cache_event(
          v_journal.item_id,
          v_current_revision_id,
          'restore'
        );
      end if;
      update private.cms_qa_global_mutation_journal
      set status = 'baseline_present', restored_at = clock_timestamp()
      where id = v_journal.id;
      v_already_baseline := v_already_baseline + 1;
      v_compensation_mode := 'baseline_already_present';
    else
      if v_journal.status = 'external_conflict' then
        raise exception 'CMS_QA_GLOBAL_EXTERNAL_CONFLICT:%', v_journal.item_id
          using errcode = '40001';
      end if;

      v_current_state_hash := private.cms_qa_global_state_hash(v_journal.item_id);
      if v_current_state_hash <> v_journal.qa_state_hash then
        raise exception 'CMS_QA_GLOBAL_CAS_CONFLICT:%', v_journal.item_id
          using errcode = '40001';
      end if;

      v_previous_compensation_setting := current_setting('cms.qa_compensating', true);
      perform set_config('cms.qa_compensating', 'on', true);

      select projection.revision_id into v_current_revision_id
      from public.cms_published_projection projection
      where projection.item_id = v_journal.item_id;
      if v_current_revision_id is not null then
        perform private.cms_enqueue_qa_global_cache_event(
          v_journal.item_id,
          v_current_revision_id,
          'unpublish'
        );
      end if;

      delete from public.cms_publications publication
      where publication.item_id = v_journal.item_id;
      delete from public.cms_published_projection projection
      where projection.item_id = v_journal.item_id;

      if v_journal.baseline_item = 'null'::jsonb then
        update public.cms_content_items item
        set workflow_status = 'archived',
            archived_at = clock_timestamp(),
            scheduled_for = null,
            deleted_at = null,
            deleted_by = null,
            updated_by = p_actor_id
        where item.id = v_journal.item_id;
      else
        select * into strict v_item
        from jsonb_populate_record(
          null::public.cms_content_items,
          v_journal.baseline_item
        );
        perform set_config('cms.qa_restore_item', v_journal.item_id::text, true);
        perform set_config('cms.qa_restore_item_updated_at', v_item.updated_at::text, true);
        update public.cms_content_items item
        set content_type = v_item.content_type,
            slug = v_item.slug,
            workflow_status = v_item.workflow_status,
            created_by = v_item.created_by,
            updated_by = v_item.updated_by,
            created_at = v_item.created_at,
            updated_at = v_item.updated_at,
            archived_at = v_item.archived_at,
            scheduled_for = v_item.scheduled_for,
            deleted_at = v_item.deleted_at,
            deleted_by = v_item.deleted_by
        where item.id = v_journal.item_id;
      end if;

      if v_journal.baseline_draft = 'null'::jsonb then
        delete from public.cms_content_drafts draft
        where draft.item_id = v_journal.item_id;
      else
        select * into strict v_draft
        from jsonb_populate_record(
          null::public.cms_content_drafts,
          v_journal.baseline_draft
        );
        perform set_config('cms.qa_restore_item', v_journal.item_id::text, true);
        perform set_config('cms.qa_restore_draft_updated_at', v_draft.updated_at::text, true);
        insert into public.cms_content_drafts (
          item_id,
          schema_version,
          payload,
          seo,
          provenance,
          lock_version,
          updated_by,
          updated_at
        ) values (
          v_draft.item_id,
          v_draft.schema_version,
          v_draft.payload,
          v_draft.seo,
          v_draft.provenance,
          v_draft.lock_version,
          v_draft.updated_by,
          v_draft.updated_at
        )
        on conflict (item_id) do update
        set schema_version = excluded.schema_version,
            payload = excluded.payload,
            seo = excluded.seo,
            provenance = excluded.provenance,
            lock_version = excluded.lock_version,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at;
      end if;

      if v_journal.baseline_projection <> 'null'::jsonb then
        select * into strict v_projection
        from jsonb_populate_record(
          null::public.cms_published_projection,
          v_journal.baseline_projection
        );
        insert into public.cms_published_projection (
          item_id,
          revision_id,
          content_type,
          slug,
          schema_version,
          consumer_id,
          renderer_key,
          payload,
          seo,
          content_version,
          cache_tag,
          etag,
          published_at,
          updated_at
        ) values (
          v_projection.item_id,
          v_projection.revision_id,
          v_projection.content_type,
          v_projection.slug,
          v_projection.schema_version,
          v_projection.consumer_id,
          v_projection.renderer_key,
          v_projection.payload,
          v_projection.seo,
          v_projection.content_version,
          v_projection.cache_tag,
          v_projection.etag,
          v_projection.published_at,
          v_projection.updated_at
        );
      end if;

      if v_journal.baseline_publication <> 'null'::jsonb then
        select * into strict v_publication
        from jsonb_populate_record(
          null::public.cms_publications,
          v_journal.baseline_publication
        );
        insert into public.cms_publications (
          item_id,
          revision_id,
          cache_tag,
          published_by,
          published_at
        ) values (
          v_publication.item_id,
          v_publication.revision_id,
          v_publication.cache_tag,
          v_publication.published_by,
          v_publication.published_at
        );
      end if;

      if v_journal.baseline_projection <> 'null'::jsonb then
        perform private.cms_enqueue_qa_global_cache_event(
          v_journal.item_id,
          (v_journal.baseline_projection ->> 'revision_id')::uuid,
          'restore'
        );
      end if;

      if v_journal.baseline_item <> 'null'::jsonb
         and private.cms_qa_global_state_hash(v_journal.item_id)
           <> v_journal.baseline_state_hash then
        raise exception 'CMS_QA_GLOBAL_RESTORE_INTEGRITY:%', v_journal.item_id
          using errcode = '55000';
      end if;

      perform set_config(
        'cms.qa_compensating',
        coalesce(nullif(v_previous_compensation_setting, ''), 'off'),
        true
      );

      update private.cms_qa_global_mutation_journal
      set status = 'restored', restored_at = clock_timestamp()
      where id = v_journal.id;
      v_restored := v_restored + 1;
      v_compensation_mode := 'cas_snapshot_restore';
    end if;

    select count(*)::integer into v_revision_count
    from private.cms_qa_global_mutation_revisions revision
    where revision.journal_id = v_journal.id;

    insert into public.cms_audit_log (
      actor_id,
      action,
      target_type,
      target_id,
      event_data,
      correlation_id
    ) values (
      p_actor_id,
      'cms:qa.global_snapshot_compensated',
      'content_item',
      v_journal.item_id::text,
      jsonb_build_object(
        'schemaVersion', 1,
        'syntheticOnly', true,
        'contentType', v_journal.content_type,
        'mode', v_compensation_mode,
        'trackedQaRevisions', v_revision_count
      ),
      gen_random_uuid()
    );
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'restored', v_restored,
    'baselineAlreadyPresent', v_already_baseline
  );
end;
$$;

-- O modelo normal continua append-only. A unica excecao e a compensacao
-- interna de aliases sinteticos que, se retidos, sequestrariam uma chave
-- natural global depois do fim da lease. O trigger exige simultaneamente o
-- modo interno, o ator vinculado e uma lease QA autentica.
create or replace function public.cms_reject_master_data_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_id uuid := nullif(current_setting('cms.qa_mutation_actor_id', true), '')::uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on'
     and old.created_by = v_actor_id
     and exists (
       select 1
       from private.cms_qa_actor_leases lease
       where lease.actor_id = v_actor_id
         and lease.status in ('active', 'expired')
         and private.cms_qa_actor_marker_is_exact(
           lease.actor_id,
           lease.run_tag,
           lease.candidate_sha,
           lease.environment
         )
     ) then
    return old;
  end if;
  raise exception 'CMS_MASTER_DATA_DELETE_FORBIDDEN' using errcode = '42501';
end;
$$;

create or replace function private.cms_compensate_qa_domain_residue(
  p_actor_id uuid,
  p_run_tag text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_rows integer;
  v_dam integer := 0;
  v_dam_relationships_removed integer := 0;
  v_dam_tags_removed integer := 0;
  v_dam_gc_jobs_scheduled integer := 0;
  v_pim integer := 0;
  v_master integer := 0;
  v_dam_asset_ids uuid[];
  v_dam_collection_ids uuid[];
  v_pim_product_ids uuid[];
  v_pim_archived_ids uuid[];
  v_master_entity_ids uuid[];
  v_master_deactivated_ids uuid[];
  v_master_compatibility_ids uuid[];
begin
  -- Resolve e bloqueia primeiro os pais sinteticos. Alem de serializar a
  -- compensacao, os locks impedem a criacao concorrente de novos filhos por FK
  -- entre os pre-checks abaixo e as transicoes terminais.
  select coalesce(array_agg(asset.id), '{}'::uuid[])
  into v_dam_asset_ids
  from public.cms_media_assets asset
  where asset.created_by = p_actor_id;

  select coalesce(array_agg(collection.id), '{}'::uuid[])
  into v_dam_collection_ids
  from public.cms_dam_collections collection
  where collection.created_by = p_actor_id;

  select coalesce(array_agg(product.id), '{}'::uuid[])
  into v_pim_product_ids
  from public.cms_pim_products product
  where product.created_by = p_actor_id;

  select coalesce(array_agg(entity.id), '{}'::uuid[])
  into v_master_entity_ids
  from public.cms_master_entities entity
  where entity.created_by = p_actor_id;

  perform 1 from public.cms_media_assets asset
  where asset.id = any(v_dam_asset_ids) order by asset.id for update;
  perform 1 from public.cms_dam_collections collection
  where collection.id = any(v_dam_collection_ids) order by collection.id for update;
  perform 1 from public.cms_pim_products product
  where product.id = any(v_pim_product_ids) order by product.id for update;
  perform 1 from public.cms_master_entities entity
  where entity.id = any(v_master_entity_ids) order by entity.id for update;

  -- Replacements intentionally have no FK to media_assets. A short table lock
  -- closes the otherwise unavoidable insert race around the external-use check.
  lock table public.cms_dam_replacements in share row exclusive mode;
  perform 1 from public.cms_dam_crops crop
  where crop.created_by = p_actor_id or crop.asset_id = any(v_dam_asset_ids)
  order by crop.id for update;
  perform 1 from public.cms_media_variants variant
  where variant.asset_id = any(v_dam_asset_ids)
  order by variant.id for update;
  perform 1 from public.cms_media_usages usage
  where usage.asset_id = any(v_dam_asset_ids)
     or exists (
       select 1 from public.cms_content_items item
       where item.id = usage.item_id and item.created_by = p_actor_id
     )
  order by usage.id for update;
  perform 1 from public.cms_pim_product_master_links link
  where link.created_by = p_actor_id or link.product_id = any(v_pim_product_ids)
  order by link.id for update;
  perform 1 from public.cms_pim_models model
  where model.created_by = p_actor_id or model.product_id = any(v_pim_product_ids)
  order by model.id for update;
  perform 1 from public.cms_pim_variants variant
  where variant.created_by = p_actor_id or variant.product_id = any(v_pim_product_ids)
  order by variant.id for update;
  perform 1 from public.cms_pim_skus sku
  where sku.created_by = p_actor_id or sku.product_id = any(v_pim_product_ids)
  order by sku.id for update;
  perform 1 from public.cms_pim_external_identifiers identifier
  where identifier.created_by = p_actor_id
     or identifier.product_id = any(v_pim_product_ids)
  order by identifier.id for update;
  perform 1 from public.cms_pim_attribute_values attribute_value
  where attribute_value.created_by = p_actor_id
     or attribute_value.product_id = any(v_pim_product_ids)
  order by attribute_value.id for update;
  perform 1 from public.cms_pim_provenance provenance
  where provenance.created_by = p_actor_id or provenance.product_id = any(v_pim_product_ids)
  order by provenance.id for update;
  perform 1 from public.cms_pim_units unit
  where unit.created_by = p_actor_id order by unit.code for update;
  perform 1 from public.cms_pim_attribute_definitions definition
  where definition.created_by = p_actor_id order by definition.id for update;
  perform 1 from public.cms_pim_attribute_sets attribute_set
  where attribute_set.created_by = p_actor_id order by attribute_set.id for update;
  perform 1
  from public.cms_pim_attribute_set_versions version
  join public.cms_pim_attribute_sets attribute_set on attribute_set.id = version.attribute_set_id
  where version.created_by = p_actor_id or attribute_set.created_by = p_actor_id
  order by version.id for update of version;
  perform 1
  from public.cms_pim_attribute_set_definitions assignment
  join public.cms_pim_attribute_set_versions version
    on version.id = assignment.attribute_set_version_id
  join public.cms_pim_attribute_sets attribute_set
    on attribute_set.id = version.attribute_set_id
  join public.cms_pim_attribute_definitions definition
    on definition.id = assignment.definition_id
  where version.created_by = p_actor_id
     or attribute_set.created_by = p_actor_id
     or definition.created_by = p_actor_id
  order by assignment.attribute_set_version_id, assignment.definition_id
  for update of assignment;
  perform 1 from public.cms_master_entity_aliases alias
  where alias.entity_id = any(v_master_entity_ids) order by alias.id for update;
  perform 1 from public.cms_master_compatibilities compatibility
  where compatibility.created_by = p_actor_id
     or compatibility.source_entity_id = any(v_master_entity_ids)
     or compatibility.target_entity_id = any(v_master_entity_ids)
  order by compatibility.id for update;

  -- Relacoes de midia do proprio ensaio deixam de ter efeito depois que a
  -- compensacao global retirou o conteudo. Remova-as antes de avaliar adocao
  -- externa; a auditoria editorial e as revisoes permanecem preservadas.
  delete from public.cms_media_usages usage
  using public.cms_content_items item
  where item.id = usage.item_id
    and (
      (usage.asset_id = any(v_dam_asset_ids) and item.created_by = p_actor_id)
      or (
        item.created_by = p_actor_id
        and exists (
          select 1
          from private.cms_qa_global_mutation_journal journal
          where journal.actor_id = p_actor_id
            and journal.item_id = item.id
            and journal.baseline_item = 'null'::jsonb
        )
      )
    )
    and (
      usage.revision_id is null
      or exists (
        select 1 from public.cms_content_revisions revision
        where revision.id = usage.revision_id and revision.created_by = p_actor_id
      )
    );
  get diagnostics v_rows = row_count;
  v_dam_relationships_removed := v_dam_relationships_removed + v_rows;

  -- Fail closed if an ordinary operator adopted or edited synthetic domain
  -- state. The lease remains active because the terminal UPDATE is aborted.
  if exists (
       select 1
       from public.cms_media_usages usage
       join public.cms_content_items item on item.id = usage.item_id
       left join public.cms_content_revisions revision on revision.id = usage.revision_id
       where usage.asset_id = any(v_dam_asset_ids)
         and (
           item.created_by <> p_actor_id
           or (usage.revision_id is not null and revision.created_by is distinct from p_actor_id)
         )
     )
     or exists (
       select 1 from public.cms_media_assets asset
       where asset.replaces_asset_id = any(v_dam_asset_ids)
         and asset.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_dam_collection_assets link
       where (link.asset_id = any(v_dam_asset_ids)
              or link.collection_id = any(v_dam_collection_ids))
         and link.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_dam_asset_tags link
       where link.asset_id = any(v_dam_asset_ids) and link.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_dam_crops crop
       where crop.asset_id = any(v_dam_asset_ids)
         and (crop.created_by <> p_actor_id or crop.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_dam_replacements replacement
       where replacement.status = 'active'
         and (
           replacement.source_asset_id = any(v_dam_asset_ids)
           or replacement.target_asset_id = any(v_dam_asset_ids)
         )
         and replacement.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_dam_collections collection
       where collection.id = any(v_dam_collection_ids)
         and collection.updated_by <> p_actor_id
     ) then
    raise exception 'CMS_QA_DAM_EXTERNAL_CONFLICT' using errcode = '40001';
  end if;

  if exists (
       select 1 from public.cms_pim_products product
       where product.id = any(v_pim_product_ids) and product.updated_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_pim_product_master_links link
       where (link.created_by = p_actor_id or link.product_id = any(v_pim_product_ids))
         and (link.created_by <> p_actor_id or link.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_models model
       where (model.created_by = p_actor_id or model.product_id = any(v_pim_product_ids))
         and (model.created_by <> p_actor_id or model.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_variants variant
       where (variant.created_by = p_actor_id or variant.product_id = any(v_pim_product_ids))
         and (variant.created_by <> p_actor_id or variant.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_skus sku
       where (sku.created_by = p_actor_id or sku.product_id = any(v_pim_product_ids))
         and (sku.created_by <> p_actor_id or sku.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_external_identifiers identifier
       where (
           identifier.created_by = p_actor_id
           or identifier.product_id = any(v_pim_product_ids)
         )
         and (
           identifier.created_by <> p_actor_id
           or identifier.updated_by <> p_actor_id
           or identifier.product_id <> all(v_pim_product_ids)
         )
     )
     or exists (
       select 1 from public.cms_pim_attribute_values attribute_value
       where (attribute_value.created_by = p_actor_id
              or attribute_value.product_id = any(v_pim_product_ids))
         and (attribute_value.created_by <> p_actor_id or attribute_value.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_provenance provenance
       where (provenance.created_by = p_actor_id
              or provenance.product_id = any(v_pim_product_ids))
         and (provenance.created_by <> p_actor_id or provenance.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_units unit
       where unit.created_by = p_actor_id and unit.updated_by <> p_actor_id
     )
     or exists (
       select 1
       from public.cms_pim_units owner_unit
       join public.cms_pim_units qa_unit
         on qa_unit.code = owner_unit.canonical_code
       where qa_unit.created_by = p_actor_id
         and owner_unit.created_by <> p_actor_id
     )
     or exists (
       select 1
       from public.cms_pim_attribute_values attribute_value
       join public.cms_pim_units qa_unit on qa_unit.code = attribute_value.unit_code
       where qa_unit.created_by = p_actor_id
         and (
           attribute_value.created_by <> p_actor_id
           or attribute_value.updated_by <> p_actor_id
         )
     )
     or exists (
       select 1 from public.cms_pim_attribute_definitions definition
       where definition.created_by = p_actor_id and definition.updated_by <> p_actor_id
     )
     or exists (
       select 1
       from public.cms_pim_attribute_values attribute_value
       join public.cms_pim_attribute_definitions definition
         on definition.id = attribute_value.definition_id
       where definition.created_by = p_actor_id
         and (
           attribute_value.created_by <> p_actor_id
           or attribute_value.updated_by <> p_actor_id
         )
     )
     or exists (
       select 1 from public.cms_pim_attribute_sets attribute_set
       where attribute_set.created_by = p_actor_id and attribute_set.updated_by <> p_actor_id
     )
     or exists (
       select 1
       from public.cms_pim_attribute_set_versions version
       join public.cms_pim_attribute_sets attribute_set
         on attribute_set.id = version.attribute_set_id
       where (attribute_set.created_by = p_actor_id or version.created_by = p_actor_id)
         and (
           attribute_set.created_by <> p_actor_id
           or attribute_set.updated_by <> p_actor_id
           or version.created_by <> p_actor_id
         )
     )
     or exists (
       select 1
       from public.cms_pim_attribute_set_definitions assignment
       join public.cms_pim_attribute_set_versions version
         on version.id = assignment.attribute_set_version_id
       join public.cms_pim_attribute_sets attribute_set
         on attribute_set.id = version.attribute_set_id
       join public.cms_pim_attribute_definitions definition
         on definition.id = assignment.definition_id
       where (
           attribute_set.created_by = p_actor_id
           or version.created_by = p_actor_id
           or definition.created_by = p_actor_id
         )
         and not (
           attribute_set.created_by = p_actor_id
           and attribute_set.updated_by = p_actor_id
           and version.created_by = p_actor_id
           and definition.created_by = p_actor_id
           and definition.updated_by = p_actor_id
         )
     ) then
    raise exception 'CMS_QA_PIM_EXTERNAL_CONFLICT' using errcode = '40001';
  end if;

  if exists (
       select 1 from public.cms_master_entities entity
       where entity.id = any(v_master_entity_ids) and entity.updated_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_master_entity_aliases alias
       where alias.entity_id = any(v_master_entity_ids)
         and (alias.created_by <> p_actor_id or alias.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_master_compatibilities compatibility
       where (
           compatibility.created_by = p_actor_id
           or compatibility.source_entity_id = any(v_master_entity_ids)
           or compatibility.target_entity_id = any(v_master_entity_ids)
         )
         and (
           compatibility.created_by <> p_actor_id
           or compatibility.updated_by <> p_actor_id
         )
     )
     or exists (
       select 1 from public.cms_master_entities entity
       where entity.merged_into_id = any(v_master_entity_ids) and entity.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_pim_products product
       where product.status <> 'archived'
         and (
           product.manufacturer_id = any(v_master_entity_ids)
           or product.brand_id = any(v_master_entity_ids)
           or product.line_id = any(v_master_entity_ids)
           or product.category_id = any(v_master_entity_ids)
         )
         and (product.created_by <> p_actor_id or product.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_models model
       where model.status = 'active'
         and model.manufacturer_id = any(v_master_entity_ids)
         and (model.created_by <> p_actor_id or model.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_product_master_links link
       where link.status = 'active'
         and link.entity_id = any(v_master_entity_ids)
         and (link.created_by <> p_actor_id or link.updated_by <> p_actor_id)
     )
     or exists (
       select 1 from public.cms_pim_attribute_sets attribute_set
       where attribute_set.status = 'active'
         and attribute_set.category_id = any(v_master_entity_ids)
         and (attribute_set.created_by <> p_actor_id or attribute_set.updated_by <> p_actor_id)
     ) then
    raise exception 'CMS_QA_MASTER_EXTERNAL_CONFLICT' using errcode = '40001';
  end if;

  -- DAM: rollback de links ativos antes de arquivar os ativos e colecoes.

  update public.cms_dam_replacements replacement
  set status = 'rolled_back',
      rolled_back_by = p_actor_id,
      rolled_back_at = v_now,
      lock_version = replacement.lock_version + 1
  where replacement.created_by = p_actor_id and replacement.status = 'active';
  get diagnostics v_rows = row_count;
  v_dam := v_dam + v_rows;

  -- Relacionamentos e crops nao possuem lifecycle. Remova somente linhas
  -- criadas pelo ator QA. Qualquer associacao de terceiro ao asset/collection
  -- sintetico ja falhou no pre-check acima e jamais e sobrescrita.
  insert into public.cms_dam_events (
    asset_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    affected.asset_id,
    p_actor_id,
    'qa_relationships_detached',
    jsonb_build_object('schemaVersion', 1, 'syntheticOnly', true),
    gen_random_uuid()
  from (
    select link.asset_id
    from public.cms_dam_collection_assets link
    where link.created_by = p_actor_id
    union
    select link.asset_id
    from public.cms_dam_asset_tags link
    where link.created_by = p_actor_id
    union
    select crop.asset_id
    from public.cms_dam_crops crop
    where crop.created_by = p_actor_id
  ) affected;

  delete from public.cms_dam_collection_assets link
  where link.created_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_dam_relationships_removed := v_dam_relationships_removed + v_rows;

  delete from public.cms_dam_asset_tags link
  where link.created_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_dam_relationships_removed := v_dam_relationships_removed + v_rows;

  delete from public.cms_dam_crops crop
  where crop.created_by = p_actor_id and crop.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_dam_relationships_removed := v_dam_relationships_removed + v_rows;

  -- Tags sao globais. Apague uma tag criada pelo ator somente depois que todos
  -- os links QA foram removidos e apenas se nenhuma associacao externa restar.
  insert into public.cms_dam_events (
    asset_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    null,
    p_actor_id,
    'qa_orphan_tag_removed',
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'tagId', tag.id
    ),
    gen_random_uuid()
  from public.cms_dam_tags tag
  where tag.created_by = p_actor_id
    and not exists (
      select 1 from public.cms_dam_asset_tags link where link.tag_id = tag.id
    );

  delete from public.cms_dam_tags tag
  where tag.created_by = p_actor_id
    and not exists (
      select 1 from public.cms_dam_asset_tags link where link.tag_id = tag.id
    );
  get diagnostics v_dam_tags_removed = row_count;
  v_dam := v_dam + v_dam_relationships_removed + v_dam_tags_removed;

  insert into public.cms_dam_events (
    asset_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    asset.id,
    p_actor_id,
    'qa_lease_archived',
    jsonb_build_object('schemaVersion', 1, 'syntheticOnly', true),
    gen_random_uuid()
  from public.cms_media_assets asset
  where asset.created_by = p_actor_id and asset.archived_at is null;

  update public.cms_media_assets asset
  set archived_at = v_now,
      archived_by = p_actor_id,
      lock_version = asset.lock_version + 1
  where asset.created_by = p_actor_id and asset.archived_at is null;
  get diagnostics v_rows = row_count;
  v_dam := v_dam + v_rows;

  insert into public.cms_dam_gc_jobs (
    asset_id,
    asset_snapshot,
    execute_after,
    created_by
  )
  select
    asset.id,
    jsonb_build_object(
      'assetId', asset.id,
      'storagePath', asset.storage_path,
      'sha256', asset.sha256,
      'paths', jsonb_build_array(asset.storage_path) || coalesce(
        (
          select jsonb_agg(variant.transform_path order by variant.transform_path)
          from public.cms_media_variants variant
          where variant.asset_id = asset.id
        ),
        '[]'::jsonb
      )
    ),
    asset.archived_at + interval '30 days',
    p_actor_id
  from public.cms_media_assets asset
  where asset.created_by = p_actor_id
    and asset.archived_at is not null
    and not exists (
      select 1
      from public.cms_dam_gc_jobs job
      where job.asset_id = asset.id
        and job.status in ('pending', 'processing', 'blocked', 'failed')
    )
  on conflict (asset_id) where status in ('pending', 'processing', 'blocked', 'failed')
  do nothing;
  get diagnostics v_dam_gc_jobs_scheduled = row_count;
  v_dam := v_dam + v_dam_gc_jobs_scheduled;

  insert into public.cms_dam_events (
    asset_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    null,
    p_actor_id,
    'qa_collection_archived',
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'collectionId', collection.id
    ),
    gen_random_uuid()
  from public.cms_dam_collections collection
  where collection.created_by = p_actor_id and collection.status = 'active';

  update public.cms_dam_collections collection
  set status = 'archived',
      lock_version = collection.lock_version + 1,
      updated_by = p_actor_id
  where collection.created_by = p_actor_id and collection.status = 'active';
  get diagnostics v_rows = row_count;
  v_dam := v_dam + v_rows;

  -- PIM: todos os filhos sinteticos deixam de participar do grafo ativo. As
  -- linhas historicas com lifecycle sao aposentadas; chaves globais sem
  -- lifecycle sao removidas depois do pre-check, preservando eventos/auditoria.
  select coalesce(array_agg(product.id), '{}'::uuid[])
  into v_pim_archived_ids
  from public.cms_pim_products product
  where product.created_by = p_actor_id and product.status <> 'archived';

  -- Linhas sem lifecycle, ou com unicidade incondicional, nao podem virar
  -- tombstones de QA. O pre-check acima provou que todo o subgrafo continua
  -- pertencendo ao mesmo ator; os eventos/audit logs imutaveis permanecem.
  delete from public.cms_pim_external_identifiers identifier
  where identifier.created_by = p_actor_id
    and identifier.updated_by = p_actor_id
    and identifier.product_id = any(v_pim_product_ids);
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  delete from public.cms_pim_attribute_values attribute_value
  where attribute_value.created_by = p_actor_id
    and attribute_value.updated_by = p_actor_id
    and attribute_value.product_id = any(v_pim_product_ids);
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  delete from public.cms_pim_attribute_set_definitions assignment
  using public.cms_pim_attribute_set_versions version,
        public.cms_pim_attribute_sets attribute_set,
        public.cms_pim_attribute_definitions definition
  where version.id = assignment.attribute_set_version_id
    and attribute_set.id = version.attribute_set_id
    and definition.id = assignment.definition_id
    and version.created_by = p_actor_id
    and attribute_set.created_by = p_actor_id
    and attribute_set.updated_by = p_actor_id
    and definition.created_by = p_actor_id
    and definition.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  delete from public.cms_pim_attribute_set_versions version
  using public.cms_pim_attribute_sets attribute_set
  where attribute_set.id = version.attribute_set_id
    and version.created_by = p_actor_id
    and attribute_set.created_by = p_actor_id
    and attribute_set.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  delete from public.cms_pim_attribute_sets attribute_set
  where attribute_set.created_by = p_actor_id
    and attribute_set.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  delete from public.cms_pim_attribute_definitions definition
  where definition.created_by = p_actor_id
    and definition.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  set constraints cms_pim_units_canonical_code_fkey deferred;
  delete from public.cms_pim_units unit
  where unit.created_by = p_actor_id
    and unit.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;
  set constraints cms_pim_units_canonical_code_fkey immediate;

  update public.cms_pim_product_master_links link
  set status = 'inactive',
      effective_to = coalesce(link.effective_to, v_now),
      updated_by = p_actor_id
  where link.status = 'active'
    and (link.created_by = p_actor_id or link.product_id = any(v_pim_product_ids))
    and link.created_by = p_actor_id
    and link.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_models model
  set status = 'discontinued',
      is_primary = false,
      lock_version = model.lock_version + 1,
      updated_by = p_actor_id
  where model.status = 'active'
    and (model.created_by = p_actor_id or model.product_id = any(v_pim_product_ids))
    and model.created_by = p_actor_id
    and model.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_variants variant
  set status = 'discontinued',
      lock_version = variant.lock_version + 1,
      updated_by = p_actor_id
  where variant.status = 'active'
    and (variant.created_by = p_actor_id or variant.product_id = any(v_pim_product_ids))
    and variant.created_by = p_actor_id
    and variant.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_skus sku
  set status = 'retired',
      retired_at = v_now,
      retirement_reason = 'QA synthetic lease terminal compensation',
      updated_by = p_actor_id
  where sku.status = 'active'
    and (sku.created_by = p_actor_id or sku.product_id = any(v_pim_product_ids))
    and sku.created_by = p_actor_id
    and sku.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_attribute_values attribute_value
  set active = false,
      lock_version = attribute_value.lock_version + 1,
      updated_by = p_actor_id
  where attribute_value.active
    and (
      attribute_value.created_by = p_actor_id
      or attribute_value.product_id = any(v_pim_product_ids)
    )
    and attribute_value.created_by = p_actor_id
    and attribute_value.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_provenance provenance
  set active = false,
      updated_by = p_actor_id
  where provenance.active
    and (provenance.created_by = p_actor_id or provenance.product_id = any(v_pim_product_ids))
    and provenance.created_by = p_actor_id
    and provenance.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_attribute_set_versions version
  set status = 'retired'
  where version.status <> 'retired'
    and version.created_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_attribute_sets attribute_set
  set status = 'inactive',
      lock_version = attribute_set.lock_version + 1,
      updated_by = p_actor_id
  where attribute_set.created_by = p_actor_id
    and attribute_set.updated_by = p_actor_id
    and attribute_set.status = 'active';
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_attribute_definitions definition
  set status = 'inactive',
      lock_version = definition.lock_version + 1,
      updated_by = p_actor_id
  where definition.created_by = p_actor_id
    and definition.updated_by = p_actor_id
    and definition.status = 'active';
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  update public.cms_pim_units unit
  set active = false,
      lock_version = unit.lock_version + 1,
      updated_by = p_actor_id
  where unit.created_by = p_actor_id and unit.updated_by = p_actor_id and unit.active;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  insert into public.cms_pim_events (
    product_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    product_id,
    p_actor_id,
    'product_archived',
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'reason', 'qa_lease_terminal_compensation'
    ),
    gen_random_uuid()
  from unnest(v_pim_archived_ids) product_id;

  update public.cms_pim_products product
  set status = 'archived',
      lock_version = product.lock_version + 1,
      updated_by = p_actor_id
  where product.id = any(v_pim_archived_ids)
    and product.created_by = p_actor_id
    and product.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_pim := v_pim + v_rows;

  -- Dados mestres: compatibilidades deixam de valer antes das entidades. Os
  -- aliases permanecem como historia sob uma entidade inativa.
  select coalesce(array_agg(entity.id), '{}'::uuid[])
  into v_master_deactivated_ids
  from public.cms_master_entities entity
  where entity.created_by = p_actor_id and entity.status = 'active';

  select coalesce(array_agg(compatibility.id), '{}'::uuid[])
  into v_master_compatibility_ids
  from public.cms_master_compatibilities compatibility
  where compatibility.status = 'active'
    and (
      compatibility.created_by = p_actor_id
      or compatibility.source_entity_id = any(v_master_entity_ids)
      or compatibility.target_entity_id = any(v_master_entity_ids)
    );

  insert into public.cms_master_data_events (
    compatibility_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    compatibility_id,
    p_actor_id,
    'compatibility_status_changed',
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'status', 'inactive'
    ),
    gen_random_uuid()
  from unnest(v_master_compatibility_ids) compatibility_id;

  update public.cms_master_compatibilities compatibility
  set status = 'inactive',
      effective_to = coalesce(compatibility.effective_to, v_now),
      lock_version = compatibility.lock_version + 1,
      updated_by = p_actor_id
  where compatibility.id = any(v_master_compatibility_ids)
    and compatibility.created_by = p_actor_id
    and compatibility.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_master := v_master + v_rows;

  delete from public.cms_master_entity_aliases alias
  where alias.entity_id = any(v_master_entity_ids)
    and alias.created_by = p_actor_id
    and alias.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_master := v_master + v_rows;

  insert into public.cms_master_data_events (
    entity_id,
    actor_id,
    event_type,
    event_data,
    correlation_id
  )
  select
    entity_id,
    p_actor_id,
    'entity_status_changed',
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'status', 'inactive'
    ),
    gen_random_uuid()
  from unnest(v_master_deactivated_ids) entity_id;

  update public.cms_master_entities entity
  set status = 'inactive',
      lock_version = entity.lock_version + 1,
      updated_by = p_actor_id
  where entity.id = any(v_master_deactivated_ids)
    and entity.created_by = p_actor_id
    and entity.updated_by = p_actor_id;
  get diagnostics v_rows = row_count;
  v_master := v_master + v_rows;

  if exists (
       select 1 from public.cms_media_assets asset
       where asset.created_by = p_actor_id and asset.archived_at is null
     )
     or exists (
       select 1
       from public.cms_media_assets asset
       where asset.created_by = p_actor_id
         and asset.archived_at is not null
         and not exists (
           select 1
           from public.cms_dam_gc_jobs job
           where job.asset_id = asset.id
             and job.status in ('pending', 'processing', 'blocked', 'failed')
         )
     )
     or exists (
       select 1 from public.cms_media_usages usage
       where usage.asset_id = any(v_dam_asset_ids)
     )
     or exists (
       select 1 from public.cms_media_assets asset
       where asset.replaces_asset_id = any(v_dam_asset_ids)
         and asset.created_by <> p_actor_id
     )
     or exists (
       select 1 from public.cms_dam_collections collection
       where collection.created_by = p_actor_id and collection.status = 'active'
     )
     or exists (
       select 1 from public.cms_dam_replacements replacement
       where replacement.status = 'active'
         and (
           replacement.created_by = p_actor_id
           or replacement.source_asset_id = any(v_dam_asset_ids)
           or replacement.target_asset_id = any(v_dam_asset_ids)
         )
     )
     or exists (
       select 1
       from public.cms_dam_collection_assets link
       where link.created_by = p_actor_id or link.asset_id = any(v_dam_asset_ids)
     )
     or exists (
       select 1
       from public.cms_dam_asset_tags link
       where link.created_by = p_actor_id or link.asset_id = any(v_dam_asset_ids)
     )
     or exists (
       select 1
       from public.cms_dam_crops crop
       where crop.created_by = p_actor_id or crop.asset_id = any(v_dam_asset_ids)
     )
     or exists (
       select 1
       from public.cms_dam_tags tag
       where tag.created_by = p_actor_id
         and not exists (
           select 1 from public.cms_dam_asset_tags link where link.tag_id = tag.id
         )
     )
     or exists (
       select 1 from public.cms_pim_products product
       where product.created_by = p_actor_id and product.status <> 'archived'
     )
     or exists (
       select 1 from public.cms_pim_models model
       where model.status = 'active'
         and (model.created_by = p_actor_id or model.product_id = any(v_pim_product_ids))
     )
     or exists (
       select 1 from public.cms_pim_variants variant
       where variant.status = 'active'
         and (variant.created_by = p_actor_id or variant.product_id = any(v_pim_product_ids))
     )
     or exists (
       select 1 from public.cms_pim_skus sku
       where sku.status = 'active'
         and (sku.created_by = p_actor_id or sku.product_id = any(v_pim_product_ids))
     )
     or exists (
       select 1 from public.cms_pim_external_identifiers identifier
       where identifier.created_by = p_actor_id
          or identifier.product_id = any(v_pim_product_ids)
     )
     or exists (
       select 1 from public.cms_pim_product_master_links link
       where link.status = 'active'
         and (link.created_by = p_actor_id or link.product_id = any(v_pim_product_ids))
     )
     or exists (
       select 1 from public.cms_pim_attribute_values attribute_value
       where attribute_value.created_by = p_actor_id
          or attribute_value.product_id = any(v_pim_product_ids)
     )
     or exists (
       select 1 from public.cms_pim_provenance provenance
       where provenance.active
         and (provenance.created_by = p_actor_id or provenance.product_id = any(v_pim_product_ids))
     )
     or exists (
       select 1 from public.cms_pim_units unit
       where unit.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_pim_attribute_definitions definition
       where definition.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_pim_attribute_sets attribute_set
       where attribute_set.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_pim_attribute_set_versions version
       where (
           version.created_by = p_actor_id
           or exists (
             select 1 from public.cms_pim_attribute_sets attribute_set
             where attribute_set.id = version.attribute_set_id
               and attribute_set.created_by = p_actor_id
           )
         )
     )
     or exists (
       select 1
       from public.cms_pim_attribute_set_definitions assignment
       join public.cms_pim_attribute_set_versions version
         on version.id = assignment.attribute_set_version_id
       join public.cms_pim_attribute_sets attribute_set
         on attribute_set.id = version.attribute_set_id
       join public.cms_pim_attribute_definitions definition
         on definition.id = assignment.definition_id
       where version.created_by = p_actor_id
          or attribute_set.created_by = p_actor_id
          or definition.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_master_entities entity
       where entity.created_by = p_actor_id and entity.status = 'active'
     )
     or exists (
       select 1 from public.cms_master_entity_aliases alias
       where alias.created_by = p_actor_id
          or alias.entity_id = any(v_master_entity_ids)
     )
     or exists (
       select 1 from public.cms_master_compatibilities compatibility
       where compatibility.status = 'active'
         and (
           compatibility.created_by = p_actor_id
           or compatibility.source_entity_id = any(v_master_entity_ids)
           or compatibility.target_entity_id = any(v_master_entity_ids)
         )
     ) then
    raise exception 'CMS_QA_DOMAIN_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:qa.domain_residue_compensated',
    'qa_fixture',
    p_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'damTransitions', v_dam,
      'damRelationshipsRemoved', v_dam_relationships_removed,
      'damTagsRemoved', v_dam_tags_removed,
      'damGcJobsScheduled', v_dam_gc_jobs_scheduled,
      'pimTransitions', v_pim,
      'masterDataTransitions', v_master
    ),
    gen_random_uuid()
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'damTransitions', v_dam,
    'damRelationshipsRemoved', v_dam_relationships_removed,
    'damTagsRemoved', v_dam_tags_removed,
    'damGcJobsScheduled', v_dam_gc_jobs_scheduled,
    'pimTransitions', v_pim,
    'masterDataTransitions', v_master
  );
end;
$$;

create or replace function private.cms_prepare_qa_actor_terminal_compensation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_marker_exact boolean;
  v_previous_compensating text;
  v_previous_mutation_actor text;
begin
  if old.status <> 'active'
     or new.status not in ('cleaned', 'expired')
     or new.status = old.status then
    return new;
  end if;

  v_marker_exact := private.cms_qa_actor_marker_is_exact(
    old.actor_id,
    old.run_tag,
    old.candidate_sha,
    old.environment
  );

  perform private.cms_restore_qa_global_snapshots(old.actor_id);
  v_previous_compensating := current_setting('cms.qa_compensating', true);
  v_previous_mutation_actor := current_setting('cms.qa_mutation_actor_id', true);
  perform set_config('cms.qa_compensating', 'on', true);
  perform set_config('cms.qa_mutation_actor_id', old.actor_id::text, true);
  begin
    perform private.cms_compensate_qa_domain_residue(old.actor_id, old.run_tag);
  exception when others then
    perform set_config(
      'cms.qa_compensating',
      coalesce(nullif(v_previous_compensating, ''), 'off'),
      true
    );
    perform set_config(
      'cms.qa_mutation_actor_id',
      coalesce(nullif(v_previous_mutation_actor, ''), ''),
      true
    );
    raise;
  end;
  perform set_config(
    'cms.qa_compensating',
    coalesce(nullif(v_previous_compensating, ''), 'off'),
    true
  );
  perform set_config(
    'cms.qa_mutation_actor_id',
    coalesce(nullif(v_previous_mutation_actor, ''), ''),
    true
  );
  if not v_marker_exact then
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      old.actor_id,
      'cms:qa.marker_drift_terminalized',
      'qa_fixture',
      old.run_tag,
      jsonb_build_object(
        'schemaVersion', 1,
        'syntheticOnly', true,
        'environment', old.environment,
        'candidateSha', old.candidate_sha,
        'terminalStatus', new.status
      ),
      gen_random_uuid()
    );
  end if;
  return new;
end;
$$;

create trigger cms_prepare_qa_actor_terminal_compensation
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_prepare_qa_actor_terminal_compensation();

revoke all on function private.cms_qa_sha256_jsonb(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_logical_state_from_snapshots(jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_state_hash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_logical_hash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_capture_qa_global_snapshot(uuid,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_mark_qa_global_conflict(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_mutation_actor()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_global_mutation_record_state()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_track_qa_global_revision()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_domain_parent_lease_guard()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_enqueue_qa_global_cache_event(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_restore_qa_global_snapshots(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_compensate_qa_domain_residue(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_prepare_qa_actor_terminal_compensation()
  from public, anon, authenticated, service_role;
