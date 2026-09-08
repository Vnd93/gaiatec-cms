-- Homologacao final: lease server-side para identidades QA sinteticas.
-- A protecao e aditiva, nao cria identidades e nunca seleciona atores sem a
-- marcacao completa e exata gravada no proprio registro de Auth.

create extension if not exists pg_cron with schema pg_catalog;

create table private.cms_qa_actor_leases (
  actor_id uuid primary key references auth.users (id) on delete restrict,
  run_tag text not null check (
    run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
  ),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  environment text not null check (environment in ('staging', 'production')),
  status text not null default 'active' check (status in ('active', 'cleaned', 'expired')),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  cleaned_at timestamptz,
  swept_at timestamptz,
  last_attempt_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  check (right(run_tag, 9) = ('-' || left(candidate_sha, 8))),
  check (expires_at > created_at and expires_at <= created_at + interval '120 minutes'),
  check (
    (status = 'active' and cleaned_at is null and swept_at is null)
    or (status = 'expired' and cleaned_at is null and swept_at is not null)
    or (status = 'cleaned' and cleaned_at is not null)
  )
);

create index cms_qa_actor_leases_expiry_idx
  on private.cms_qa_actor_leases (expires_at, actor_id)
  where status = 'active';

revoke all on table private.cms_qa_actor_leases from public, anon, authenticated, service_role;

create or replace function private.cms_qa_actor_marker_is_exact(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth, pg_temp
as $$
  select exists (
    select 1
    from auth.users actor
    where actor.id = p_actor_id
      and actor.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
      and actor.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
      and actor.raw_user_meta_data ->> 'runTag' = p_run_tag
      and actor.raw_user_meta_data ->> 'candidateSha' = p_candidate_sha
      and actor.raw_user_meta_data ->> 'environment' = p_environment
      and p_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and p_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(p_run_tag, 9) = ('-' || left(p_candidate_sha, 8))
      and p_environment in ('staging', 'production')
  );
$$;

-- Uma unica pagina institucional sintetica pode permanecer publicamente
-- resolvivel depois do teardown, exclusivamente como prova terminal 410. O
-- predicado e deliberadamente mais restrito do que a mera propriedade pelo
-- ator: ele vincula rota, draft, runTag e SHA e exige que toda superficie de
-- publicacao/cache ja tenha convergido. Qualquer desvio volta a ser residuo.
create or replace function private.cms_qa_terminal_archived_tombstone_is_exact(
  p_route_id uuid,
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select
    private.cms_qa_actor_marker_is_exact(
      p_actor_id,
      p_run_tag,
      p_candidate_sha,
      p_environment
    )
    and (
      select count(*) = 1
      from public.cms_route_rules route
      join public.cms_content_items item on item.id = route.item_id
      join public.cms_content_drafts draft on draft.item_id = item.id
      where route.id = p_route_id
        and route.active
        and route.status_code = 410
        and route.destination_path is null
        and route.source_path = '/qa-cms-final-gone-' || left(p_candidate_sha, 8)
        and item.created_by = p_actor_id
        and item.updated_by = p_actor_id
        and item.content_type = 'page'
        and item.slug = 'qa-cms-final-gone-' || left(p_candidate_sha, 8)
        and item.workflow_status = 'archived'
        and item.archived_at is not null
        and draft.payload ->> 'contentType' = 'page'
        and draft.payload ->> 'consumerId' = 'cms.managed-page.v1'
        and draft.payload ->> 'pageKind' = 'institutional'
        and draft.payload ->> 'title' = p_run_tag || ' gone'
        and draft.payload ->> 'summary' = 'Página sintética para validar retirada gone.'
        and draft.payload #>> '{route,path}' = route.source_path
        and draft.payload #>> '{retirement,mode}' = 'gone'
        and draft.payload #> '{retirement,destinationPath}' is null
        and draft.seo ->> 'indexable' = 'false'
        and concat_ws(' ', draft.payload::text, draft.seo::text, draft.provenance::text)
              !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
        and not exists (
          select 1 from public.cms_publications publication
          where publication.item_id = item.id
        )
        and not exists (
          select 1 from public.cms_published_projection projection
          where projection.item_id = item.id
        )
        and not exists (
          select 1 from public.cms_publication_outbox outbox
          where outbox.item_id = item.id and outbox.status <> 'completed'
        )
    );
$$;

revoke all on function private.cms_qa_terminal_archived_tombstone_is_exact(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;

-- Toda mutacao iniciada por um ator QA trava a lease antes de qualquer recurso
-- do dominio. O encerramento/sweeper usa FOR UPDATE na mesma linha, portanto ou
-- observa a mutacao concluida e a compensa, ou a mutacao observa a lease
-- terminal e falha sem produzir residuo.
create or replace function private.cms_lock_active_qa_actor_leases(p_actor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  for v_lease in
    select lease.*
    from private.cms_qa_actor_leases lease
    where lease.actor_id = any(coalesce(p_actor_ids, '{}'::uuid[]))
    order by lease.actor_id
    for share
  loop
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
  end loop;
end;
$$;

revoke all on function private.cms_lock_active_qa_actor_leases(uuid[])
  from public, anon, authenticated, service_role;

-- Os overrides comuns continuam limitados a 30 minutos. A janela ampliada e
-- exclusiva dos atores QA exatos, permanece subordinada a uma lease ativa e
-- nunca pode ultrapassar o teto server-side de 120 minutos.
create or replace function private.cms_qa_override_window_is_valid(
  p_actor_id uuid,
  p_environment text,
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select
    p_actor_id is not null
    and p_environment in ('staging', 'production')
    and p_starts_at is not null
    and p_expires_at > p_starts_at
    and p_expires_at <= p_starts_at + interval '120 minutes'
    and exists (
      select 1
      from private.cms_qa_actor_leases lease
      where lease.actor_id = p_actor_id
        and lease.environment = p_environment
        and lease.status = 'active'
        and lease.expires_at > statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          lease.actor_id,
          lease.run_tag,
          lease.candidate_sha,
          lease.environment
        )
    );
$$;

-- Os avaliadores especializados historicamente aceitam no maximo 30 minutos.
-- A excecao abaixo nao amplia nenhum ator real: somente a lease QA exata pode
-- validar a janela maior, e a funcao auxiliar volta a falhar quando ela expira.
do $$
declare
  function_record record;
  original_definition text;
  qa_definition text;
  evaluator_count integer := 0;
  evaluator_old_fragment constant text := 'if v_expires_at > v_starts_at + interval ''30 minutes''
     or v_expires_at > now() + interval ''30 minutes'' then';
  evaluator_new_fragment constant text := 'if (v_expires_at > v_starts_at + interval ''30 minutes''
     or v_expires_at > now() + interval ''30 minutes'')
     and not private.cms_qa_override_window_is_valid(
       p_actor_id, p_environment, v_starts_at, v_expires_at
     ) then';
  manifest_old_fragment constant text :=
    'and override.expires_at - override.starts_at <= v_max_override_duration;';
  manifest_new_fragment constant text := 'and (
          override.expires_at - override.starts_at <= v_max_override_duration
          or private.cms_qa_override_window_is_valid(
            p_actor_id, p_environment, override.starts_at, override.expires_at
          )
        );';
begin
  for function_record in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'cms_ev2_individual_flag_context',
        'cms_ai_individual_flag_context',
        'cms_system_individual_flag_context',
        'cms_ai_execute_individual_flag_context'
      )
  loop
    evaluator_count := evaluator_count + 1;
    original_definition := pg_get_functiondef(function_record.oid);
    if length(original_definition) - length(replace(
      original_definition, evaluator_old_fragment, ''
    )) <> length(evaluator_old_fragment) then
      raise exception 'CMS_QA_OVERRIDE_EVALUATOR_DRIFT:%', function_record.proname
        using errcode = 'P0001';
    end if;
    qa_definition := replace(original_definition, evaluator_old_fragment, evaluator_new_fragment);
    execute qa_definition;
  end loop;
  if evaluator_count <> 4 then
    raise exception 'CMS_QA_OVERRIDE_EVALUATOR_SET_DRIFT:%', evaluator_count
      using errcode = 'P0001';
  end if;

  select pg_get_functiondef(
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into original_definition;
  if length(original_definition) - length(replace(
    original_definition, manifest_old_fragment, ''
  )) <> length(manifest_old_fragment) then
    raise exception 'CMS_QA_OVERRIDE_MANIFEST_DRIFT' using errcode = 'P0001';
  end if;
  qa_definition := replace(original_definition, manifest_old_fragment, manifest_new_fragment);
  execute qa_definition;
end;
$$;

create or replace function private.cms_capture_qa_actor_lease()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_run_tag text;
  v_candidate_sha text;
  v_environment text;
  v_created_at timestamptz := statement_timestamp();
begin
  if not (
    new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
    and new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
  ) then
    return new;
  end if;

  v_run_tag := new.raw_user_meta_data ->> 'runTag';
  v_candidate_sha := new.raw_user_meta_data ->> 'candidateSha';
  v_environment := new.raw_user_meta_data ->> 'environment';

  if v_run_tag is null
     or v_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or v_candidate_sha is null
     or v_candidate_sha !~ '^[0-9a-f]{40}$'
     or right(v_run_tag, 9) <> ('-' || left(v_candidate_sha, 8))
     or v_environment is null
     or v_environment not in ('staging', 'production') then
    raise exception 'CMS_QA_ACTOR_METADATA_INVALID' using errcode = '22023';
  end if;

  insert into private.cms_qa_actor_leases (
    actor_id,
    run_tag,
    candidate_sha,
    environment,
    created_at,
    expires_at
  ) values (
    new.id,
    v_run_tag,
    v_candidate_sha,
    v_environment,
    v_created_at,
    v_created_at + interval '119 minutes'
  );

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    new.id,
    'cms:qa.fixture_lease_created',
    'qa_fixture',
    v_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'environment', v_environment,
      'candidateSha', v_candidate_sha,
      'leaseMinutes', 119
    ),
    gen_random_uuid()
  );

  return new;
end;
$$;

drop trigger if exists cms_capture_qa_actor_lease on auth.users;
create trigger cms_capture_qa_actor_lease
after insert on auth.users
for each row execute function private.cms_capture_qa_actor_lease();

create or replace function private.cms_protect_active_qa_actor_marker()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = old.id and lease.status = 'active';

  if found and (
    new.raw_user_meta_data -> 'synthetic' is distinct from old.raw_user_meta_data -> 'synthetic'
    or new.raw_user_meta_data ->> 'purpose' is distinct from old.raw_user_meta_data ->> 'purpose'
    or new.raw_user_meta_data ->> 'runTag' is distinct from old.raw_user_meta_data ->> 'runTag'
    or new.raw_user_meta_data ->> 'candidateSha' is distinct from old.raw_user_meta_data ->> 'candidateSha'
    or new.raw_user_meta_data ->> 'environment' is distinct from old.raw_user_meta_data ->> 'environment'
  ) then
    raise exception 'CMS_QA_ACTOR_MARKER_IMMUTABLE' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists cms_protect_active_qa_actor_marker on auth.users;
create trigger cms_protect_active_qa_actor_marker
before update of raw_user_meta_data on auth.users
for each row execute function private.cms_protect_active_qa_actor_marker();

create or replace function public.cms_qa_actor_lease_status(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
    and lease.run_tag = p_run_tag
    and lease.candidate_sha = p_candidate_sha
    and lease.environment = p_environment;

  if not found
     or not private.cms_qa_actor_marker_is_exact(
       p_actor_id,
       p_run_tag,
       p_candidate_sha,
       p_environment
     ) then
    raise exception 'CMS_QA_ACTOR_LEASE_NOT_FOUND' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', v_lease.status,
    'environment', v_lease.environment,
    'candidateSha', v_lease.candidate_sha,
    'runTag', v_lease.run_tag,
    'ttlSeconds', extract(epoch from (v_lease.expires_at - v_lease.created_at))::integer,
    'expiresAt', v_lease.expires_at,
    'failureCount', v_lease.failure_count,
    'swept', v_lease.swept_at is not null
  );
end;
$$;

create or replace function public.cms_complete_qa_actor_lease(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_now timestamptz := clock_timestamp();
  v_replayed boolean;
begin
  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
    and lease.run_tag = p_run_tag
    and lease.candidate_sha = p_candidate_sha
    and lease.environment = p_environment
  for update;

  if not found
     or not private.cms_qa_actor_marker_is_exact(
       p_actor_id,
       p_run_tag,
       p_candidate_sha,
       p_environment
     ) then
    raise exception 'CMS_QA_ACTOR_LEASE_NOT_FOUND' using errcode = '42501';
  end if;

  v_replayed := v_lease.status = 'cleaned';
  if v_replayed then
    return jsonb_build_object('schemaVersion', 1, 'status', 'cleaned', 'replayed', true);
  end if;

  if exists (
       select 1 from public.cms_content_items item
       where item.created_by = p_actor_id and item.workflow_status <> 'archived'
     )
     or exists (
       select 1 from public.cms_publications publication
       join public.cms_content_items item on item.id = publication.item_id
       where item.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_published_projection projection
       join public.cms_content_items item on item.id = projection.item_id
       where item.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_route_rules route
       join public.cms_content_items item on item.id = route.item_id
       where item.created_by = p_actor_id
         and route.active
         and not private.cms_qa_terminal_archived_tombstone_is_exact(
           route.id,
           p_actor_id,
           p_run_tag,
           p_candidate_sha,
           p_environment
         )
     )
     or exists (
       select 1 from public.cms_feature_flag_overrides override
       where override.scope_type = 'user' and override.scope_key = p_actor_id::text
     )
     or exists (select 1 from public.cms_user_roles role where role.user_id = p_actor_id)
     or exists (
       select 1 from public.cms_scoped_role_assignments role
       where role.user_id = p_actor_id and role.revoked_at is null
     )
     or exists (
       select 1 from public.rdo_user_access access
       where access.user_id = p_actor_id and access.active
     )
     or exists (
       select 1 from public.cms_form_definitions form
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and form.status <> 'retired'
     )
     or exists (
       select 1 from public.cms_leads lead
       join public.cms_form_definitions form on form.id = lead.form_id
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and lead.anonymized_at is null
     )
     or exists (
       select 1 from public.cms_lead_outbox outbox
       join public.cms_leads lead on lead.id = outbox.lead_id
       join public.cms_form_definitions form on form.id = lead.form_id
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and outbox.status in ('pending', 'processing', 'failed', 'dead_letter')
     )
     or exists (
       select 1 from public.cms_ai_sessions session
       where session.actor_id = p_actor_id and session.status = 'active'
     )
     or exists (
       select 1 from public.cms_ai_synthetic_targets target
       where target.created_by = p_actor_id and target.lifecycle <> 'retired'
     )
     or exists (
       select 1 from public.cms_ai_execution_plans plan
       where plan.created_by = p_actor_id and plan.status in ('ready', 'approved', 'executing')
     )
     or exists (
       select 1 from public.cms_ai_execution_approvals approval
       join public.cms_ai_execution_plans plan on plan.id = approval.plan_id
       where plan.created_by = p_actor_id and approval.status = 'active'
     )
     or exists (
       select 1 from public.cms_document_assets document
       where document.created_by = p_actor_id
         and document.source_kind = 'synthetic_test'
         and document.source_reference = p_run_tag
         and (
           document.processing_status <> 'neutralized'
           or document.blob_disposition <> 'removed'
           or document.upload_disposition not in ('guarded', 'removed')
         )
     )
     or exists (
       select 1 from public.cms_profiles profile
       where profile.user_id = p_actor_id and profile.status <> 'suspended'
     )
     or exists (select 1 from auth.sessions session where session.user_id = p_actor_id)
     or not exists (
       select 1 from auth.users actor
       where actor.id = p_actor_id and actor.banned_until > v_now
     ) then
    raise exception 'CMS_QA_ACTOR_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  update private.cms_qa_actor_leases
  set status = 'cleaned',
      cleaned_at = v_now,
      last_attempt_at = v_now,
      last_error_code = null
  where actor_id = p_actor_id;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:qa.fixture_lease_cleaned',
    'qa_fixture',
    p_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'environment', p_environment,
      'candidateSha', p_candidate_sha,
      'watchdogPreviouslySwept', v_lease.swept_at is not null
    ),
    gen_random_uuid()
  );

  return jsonb_build_object('schemaVersion', 1, 'status', 'cleaned', 'replayed', false);
end;
$$;

create or replace function private.cms_sweep_expired_qa_actor_leases(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_now timestamptz;
  v_processed integer := 0;
  v_failed integer := 0;
  v_content integer;
  v_routes integer;
  v_outbox integer;
  v_publications integer;
  v_projections integer;
  v_overrides integer;
  v_legacy_roles integer;
  v_scoped_roles integer;
  v_rdo_access integer;
  v_sessions integer;
  v_forms integer;
  v_leads integer;
  v_lead_outbox integer;
  v_ai_sessions integer;
  v_ai_targets integer;
  v_ai_plans integer;
  v_ai_approvals integer;
  v_documents integer;
  v_document_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CMS_QA_SWEEP_LIMIT_INVALID' using errcode = '22023';
  end if;

  for v_lease in
    select lease.*
    from private.cms_qa_actor_leases lease
    where lease.status = 'active' and lease.expires_at <= clock_timestamp()
    order by lease.expires_at, lease.actor_id
    limit p_limit
    for update skip locked
  loop
    v_now := clock_timestamp();

    if not private.cms_qa_actor_marker_is_exact(
      v_lease.actor_id,
      v_lease.run_tag,
      v_lease.candidate_sha,
      v_lease.environment
    ) then
      update private.cms_qa_actor_leases
      set failure_count = failure_count + 1,
          last_attempt_at = v_now,
          last_error_code = 'actor_marker_mismatch'
      where actor_id = v_lease.actor_id and status = 'active';
      v_failed := v_failed + 1;
      -- A lease e a classificacao autoritativa. Divergencia de metadata nunca
      -- converte o ator em corporativo nem impede a revogacao fail-closed;
      -- o mesmo sweep abaixo remove papeis, sessoes e residuos pelo actor_id.
    end if;

    begin
      -- Serializa com o trigger de publicacao antes de retirar qualquer
      -- projecao. Assim nenhuma transacao consegue publicar o ativo entre a
      -- retirada da rota e a neutralizacao terminal.
      for v_document_id in
        select document.id
        from public.cms_document_assets document
        where document.created_by = v_lease.actor_id
          and document.source_kind = 'synthetic_test'
          and document.source_reference = v_lease.run_tag
        order by document.id
      loop
        perform pg_advisory_xact_lock(hashtextextended('cms-document:' || v_document_id::text, 0));
      end loop;

      update public.cms_content_items
      set workflow_status = 'archived',
          archived_at = v_now,
          scheduled_for = null,
          deleted_at = null,
          deleted_by = null,
          updated_by = v_lease.actor_id
      where created_by = v_lease.actor_id and workflow_status <> 'archived';
      get diagnostics v_content = row_count;

      insert into public.cms_publication_outbox (
        item_id,
        revision_id,
        event_type,
        correlation_id
      )
      select item.id, projection.revision_id, 'unpublish', gen_random_uuid()
      from public.cms_content_items item
      join public.cms_published_projection projection on projection.item_id = item.id
      where item.created_by = v_lease.actor_id
      on conflict do nothing;
      get diagnostics v_outbox = row_count;

      delete from public.cms_publications publication
      using public.cms_content_items item
      where publication.item_id = item.id and item.created_by = v_lease.actor_id;
      get diagnostics v_publications = row_count;

      delete from public.cms_published_projection projection
      using public.cms_content_items item
      where projection.item_id = item.id and item.created_by = v_lease.actor_id;
      get diagnostics v_projections = row_count;

      update public.cms_route_rules route
      set active = false
      where route.active
        and exists (
          select 1 from public.cms_content_items item
          where item.id = route.item_id and item.created_by = v_lease.actor_id
        )
        and not private.cms_qa_terminal_archived_tombstone_is_exact(
          route.id,
          v_lease.actor_id,
          v_lease.run_tag,
          v_lease.candidate_sha,
          v_lease.environment
        );
      get diagnostics v_routes = row_count;

      -- O scheduler nao possui uma credencial do Storage. Ele revoga o acesso
      -- no registro governado, tornando qualquer blob privado inacessivel. O
      -- teardown ativo usa a API do Storage e registra `removed` separadamente.
      update public.cms_document_assets document
      set processing_status = 'neutralized',
          archived_at = coalesce(document.archived_at, v_now),
          archived_by = v_lease.actor_id,
          neutralized_at = coalesce(document.neutralized_at, v_now),
          neutralized_by = v_lease.actor_id,
          upload_token_expires_at = case
            when document.upload_disposition = 'removed' then document.upload_token_expires_at
            else coalesce(document.upload_token_expires_at, v_now)
          end,
          upload_disposition = case
            when document.upload_disposition = 'removed' then 'removed'
            else 'guarded'
          end,
          blob_disposition = case
            when document.blob_disposition = 'removed' then 'removed'
            else 'access_revoked'
          end,
          finalization_claim_id = null,
          finalization_claimed_at = null,
          finalization_claim_expires_at = null,
          processed_at = coalesce(document.processed_at, v_now),
          lock_version = document.lock_version + 1,
          updated_at = v_now
      where document.created_by = v_lease.actor_id
        and document.source_kind = 'synthetic_test'
        and document.source_reference = v_lease.run_tag
        and (
          document.processing_status <> 'neutralized'
          or document.blob_disposition = 'available'
          or document.upload_disposition not in ('guarded', 'removed')
        );
      get diagnostics v_documents = row_count;

      delete from public.cms_feature_flag_overrides override
      where override.scope_type = 'user' and override.scope_key = v_lease.actor_id::text;
      get diagnostics v_overrides = row_count;

      update public.cms_scoped_role_assignments role
      set revoked_at = v_now,
          revoked_by = v_lease.actor_id,
          revocation_reason = 'QA synthetic lease expired',
          lock_version = role.lock_version + 1,
          updated_at = v_now
      where role.user_id = v_lease.actor_id and role.revoked_at is null;
      get diagnostics v_scoped_roles = row_count;

      delete from public.cms_user_roles role where role.user_id = v_lease.actor_id;
      get diagnostics v_legacy_roles = row_count;

      update public.rdo_user_access access
      set active = false,
          suspended_at = v_now,
          suspended_by = v_lease.actor_id,
          updated_at = v_now
      where access.user_id = v_lease.actor_id and access.active;
      get diagnostics v_rdo_access = row_count;

      update public.cms_ai_execution_approvals approval
      set status = 'expired'
      where approval.status = 'active'
        and exists (
          select 1 from public.cms_ai_execution_plans plan
          where plan.id = approval.plan_id and plan.created_by = v_lease.actor_id
        );
      get diagnostics v_ai_approvals = row_count;

      update public.cms_ai_execution_plans plan
      set status = 'canceled', updated_at = v_now
      where plan.created_by = v_lease.actor_id
        and plan.status in ('ready', 'approved', 'rejected', 'executing');
      get diagnostics v_ai_plans = row_count;

      update public.cms_ai_sessions session
      set status = 'closed', closed_at = v_now, updated_at = v_now
      where session.actor_id = v_lease.actor_id and session.status = 'active';
      get diagnostics v_ai_sessions = row_count;

      update public.cms_ai_synthetic_targets target
      set lifecycle = 'retired', updated_by = v_lease.actor_id, updated_at = v_now
      where target.created_by = v_lease.actor_id and target.lifecycle <> 'retired';
      get diagnostics v_ai_targets = row_count;

      insert into public.cms_lead_status_history (
        lead_id,
        from_status,
        to_status,
        reason,
        actor_id
      )
      select lead.id, lead.status, 'anonymized', 'QA synthetic lease expired', v_lease.actor_id
      from public.cms_leads lead
      join public.cms_form_definitions form on form.id = lead.form_id
      where form.created_by = v_lease.actor_id
        and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
        and form.title = v_lease.run_tag || ' Formulário operacional'
        and lead.anonymized_at is null;

      update public.cms_leads lead
      set payload = '{}'::jsonb,
          utm = '{}'::jsonb,
          assigned_to = null,
          status = 'anonymized',
          anonymized_at = v_now,
          last_activity_at = v_now
      where lead.anonymized_at is null
        and exists (
          select 1 from public.cms_form_definitions form
          where form.id = lead.form_id
            and form.created_by = v_lease.actor_id
            and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
            and form.title = v_lease.run_tag || ' Formulário operacional'
        );
      get diagnostics v_leads = row_count;

      update public.cms_lead_outbox outbox
      set status = 'completed',
          locked_at = null,
          completed_at = v_now,
          last_error_code = null
      where outbox.status <> 'completed'
        and exists (
          select 1
          from public.cms_leads lead
          join public.cms_form_definitions form on form.id = lead.form_id
          where lead.id = outbox.lead_id
            and form.created_by = v_lease.actor_id
            and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
            and form.title = v_lease.run_tag || ' Formulário operacional'
        );
      get diagnostics v_lead_outbox = row_count;

      update public.cms_form_versions version
      set status = 'retired'
      where version.status = 'published'
        and exists (
          select 1 from public.cms_form_definitions form
          where form.id = version.form_id
            and form.created_by = v_lease.actor_id
            and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
            and form.title = v_lease.run_tag || ' Formulário operacional'
        );

      update public.cms_form_definitions form
      set status = 'retired', active_version_id = null, updated_by = v_lease.actor_id
      where form.created_by = v_lease.actor_id
        and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
        and form.title = v_lease.run_tag || ' Formulário operacional'
        and form.status <> 'retired';
      get diagnostics v_forms = row_count;

      update public.cms_profiles profile
      set status = 'suspended',
          suspended_at = v_now,
          suspended_by = v_lease.actor_id,
          sessions_valid_after = v_now
      where profile.user_id = v_lease.actor_id and profile.status <> 'suspended';

      delete from auth.sessions session where session.user_id = v_lease.actor_id;
      get diagnostics v_sessions = row_count;

      update auth.users actor
      set banned_until = greatest(
            coalesce(actor.banned_until, '-infinity'::timestamptz),
            v_now + interval '100 years'
          ),
          updated_at = v_now
      where actor.id = v_lease.actor_id;

      if exists (
           select 1 from public.cms_content_items item
           where item.created_by = v_lease.actor_id and item.workflow_status <> 'archived'
         )
         or exists (
           select 1 from public.cms_publications publication
           join public.cms_content_items item on item.id = publication.item_id
           where item.created_by = v_lease.actor_id
         )
         or exists (
           select 1 from public.cms_published_projection projection
           join public.cms_content_items item on item.id = projection.item_id
           where item.created_by = v_lease.actor_id
         )
         or exists (
           select 1 from public.cms_route_rules route
           join public.cms_content_items item on item.id = route.item_id
           where item.created_by = v_lease.actor_id
             and route.active
             and not private.cms_qa_terminal_archived_tombstone_is_exact(
               route.id,
               v_lease.actor_id,
               v_lease.run_tag,
               v_lease.candidate_sha,
               v_lease.environment
             )
         )
         or exists (
           select 1 from public.cms_feature_flag_overrides override
           where override.scope_type = 'user'
             and override.scope_key = v_lease.actor_id::text
         )
         or exists (
           select 1 from public.cms_user_roles role where role.user_id = v_lease.actor_id
         )
         or exists (
           select 1 from public.cms_scoped_role_assignments role
           where role.user_id = v_lease.actor_id and role.revoked_at is null
         )
         or exists (
           select 1 from public.rdo_user_access access
           where access.user_id = v_lease.actor_id and access.active
         )
         or exists (
           select 1 from public.cms_form_definitions form
           where form.created_by = v_lease.actor_id
             and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
             and form.title = v_lease.run_tag || ' Formulário operacional'
             and form.status <> 'retired'
         )
         or exists (
           select 1 from public.cms_leads lead
           join public.cms_form_definitions form on form.id = lead.form_id
           where form.created_by = v_lease.actor_id
             and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
             and form.title = v_lease.run_tag || ' Formulário operacional'
             and lead.anonymized_at is null
         )
         or exists (
           select 1 from public.cms_lead_outbox outbox
           join public.cms_leads lead on lead.id = outbox.lead_id
           join public.cms_form_definitions form on form.id = lead.form_id
           where form.created_by = v_lease.actor_id
             and form.form_key like ('qa-ops-' || lower(v_lease.run_tag) || '-%')
             and form.title = v_lease.run_tag || ' Formulário operacional'
             and outbox.status in ('pending', 'processing', 'failed', 'dead_letter')
         )
         or exists (
           select 1 from public.cms_ai_sessions session
           where session.actor_id = v_lease.actor_id and session.status = 'active'
         )
         or exists (
           select 1 from public.cms_ai_synthetic_targets target
           where target.created_by = v_lease.actor_id and target.lifecycle <> 'retired'
         )
         or exists (
           select 1 from public.cms_ai_execution_plans plan
           where plan.created_by = v_lease.actor_id
             and plan.status in ('ready', 'approved', 'executing')
         )
         or exists (
           select 1 from public.cms_ai_execution_approvals approval
           join public.cms_ai_execution_plans plan on plan.id = approval.plan_id
           where plan.created_by = v_lease.actor_id and approval.status = 'active'
         )
         or exists (
           select 1 from public.cms_document_assets document
           where document.created_by = v_lease.actor_id
             and document.source_kind = 'synthetic_test'
             and document.source_reference = v_lease.run_tag
             and (
               document.processing_status <> 'neutralized'
               or document.blob_disposition = 'available'
               or document.upload_disposition not in ('guarded', 'removed')
             )
         )
         or exists (
           select 1 from public.cms_profiles profile
           where profile.user_id = v_lease.actor_id and profile.status <> 'suspended'
         )
         or exists (
           select 1 from auth.sessions session where session.user_id = v_lease.actor_id
         )
         or not exists (
           select 1 from auth.users actor
           where actor.id = v_lease.actor_id and actor.banned_until > v_now
         ) then
        raise exception 'CMS_QA_ACTOR_CLEANUP_INCOMPLETE' using errcode = '55000';
      end if;

      insert into public.cms_audit_log (
        actor_id,
        action,
        target_type,
        target_id,
        event_data,
        correlation_id
      ) values (
        v_lease.actor_id,
        'cms:qa.fixture_expired_cleanup',
        'qa_fixture',
        v_lease.run_tag,
        jsonb_build_object(
          'schemaVersion', 1,
          'syntheticOnly', true,
          'environment', v_lease.environment,
          'candidateSha', v_lease.candidate_sha,
          'archivedContent', v_content,
          'queuedUnpublications', v_outbox,
          'removedPublications', v_publications,
          'removedProjections', v_projections,
          'deactivatedRoutes', v_routes,
          'removedOverrides', v_overrides,
          'removedLegacyRoles', v_legacy_roles,
          'revokedScopedRoles', v_scoped_roles,
          'revokedRdoAccess', v_rdo_access,
          'retiredForms', v_forms,
          'anonymizedLeads', v_leads,
          'completedLeadOutbox', v_lead_outbox,
          'closedAiSessions', v_ai_sessions,
          'retiredAiTargets', v_ai_targets,
          'canceledAiPlans', v_ai_plans,
          'expiredAiApprovals', v_ai_approvals,
          'neutralizedDocuments', v_documents,
          'revokedSessions', v_sessions
        ),
        gen_random_uuid()
      );

      update private.cms_qa_actor_leases
      set status = 'expired',
          swept_at = v_now,
          last_attempt_at = v_now,
          last_error_code = null
      where actor_id = v_lease.actor_id and status = 'active';

      v_processed := v_processed + 1;
    exception when others then
      update private.cms_qa_actor_leases
      set failure_count = failure_count + 1,
          last_attempt_at = v_now,
          last_error_code = 'cleanup_failed'
      where actor_id = v_lease.actor_id and status = 'active';
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'processed', v_processed,
    'failed', v_failed
  );
end;
$$;

revoke all on function private.cms_qa_actor_marker_is_exact(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_capture_qa_actor_lease()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_protect_active_qa_actor_marker()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_sweep_expired_qa_actor_leases(integer)
  from public, anon, authenticated, service_role;

revoke all on function public.cms_qa_actor_lease_status(uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.cms_complete_qa_actor_lease(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.cms_qa_actor_lease_status(uuid,text,text,text) to service_role;
grant execute on function public.cms_complete_qa_actor_lease(uuid,text,text,text) to service_role;

create or replace function private.cms_qa_lease_sweeper_job_is_exact()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, cron, pg_temp
as $$
  select count(*) = 1
    and coalesce(bool_and(
      job.schedule = '* * * * *'
      and job.command = 'select private.cms_sweep_expired_qa_actor_leases(25);'
      and job.active
      and job.database = current_database()
      and job.username = current_user
    ), false)
  from cron.job job
  where job.jobname = 'cms-qa-actor-lease-sweeper-every-1m';
$$;

revoke all on function private.cms_qa_lease_sweeper_job_is_exact()
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_count integer;
begin
  select count(*)::integer into v_job_count
  from cron.job
  where jobname = 'cms-qa-actor-lease-sweeper-every-1m';

  if v_job_count > 0 and not private.cms_qa_lease_sweeper_job_is_exact() then
    raise exception 'CMS_QA_ACTOR_LEASE_JOB_CONFLICT' using errcode = '23514';
  end if;
  if v_job_count = 0 then
    perform cron.schedule(
      'cms-qa-actor-lease-sweeper-every-1m',
      '* * * * *',
      'select private.cms_sweep_expired_qa_actor_leases(25);'
    );
  end if;
  if not private.cms_qa_lease_sweeper_job_is_exact() then
    raise exception 'CMS_QA_ACTOR_LEASE_JOB_CONFLICT' using errcode = '23514';
  end if;
end;
$$;
