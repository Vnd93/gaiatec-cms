-- Homologacao final: isolamento autoritativo de releases, colaboracao e bulk.
-- A classificacao QA vem exclusivamente da lease persistente criada em 0061.
-- Nenhum UUID, actorContext ou payload enviado pelo cliente altera essa classe.

create or replace function private.cms_crb_normalize_actor_ids(p_actor_ids uuid[])
returns uuid[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(array_agg(distinct actor_id order by actor_id), '{}'::uuid[])
  from unnest(coalesce(p_actor_ids, '{}'::uuid[])) actor(actor_id)
  where actor_id is not null;
$$;

create or replace function private.cms_crb_actor_identity_scope_allowed(
  p_actor_id uuid,
  p_subject_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select case
    when p_actor_id is null
      or p_subject_id is null
      or p_environment not in ('local', 'staging', 'production')
      or not exists (select 1 from auth.users actor where actor.id = p_actor_id)
      or not exists (select 1 from auth.users subject where subject.id = p_subject_id)
      then false
    when exists (
      select 1 from private.cms_qa_actor_leases history where history.actor_id = p_actor_id
    ) then exists (
      select 1
      from private.cms_qa_actor_leases caller
      join private.cms_qa_actor_leases subject
        on subject.actor_id = p_subject_id
       and subject.run_tag = caller.run_tag
       and subject.candidate_sha = caller.candidate_sha
       and subject.environment = caller.environment
      where caller.actor_id = p_actor_id
        and caller.environment = p_environment
        and caller.status = 'active'
        and subject.status = 'active'
        and caller.expires_at > statement_timestamp()
        and subject.expires_at > statement_timestamp()
        and private.cms_qa_actor_marker_is_exact(
          caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          subject.actor_id, subject.run_tag, subject.candidate_sha, subject.environment
        )
    )
    else not exists (
      select 1 from private.cms_qa_actor_leases history where history.actor_id = p_subject_id
    )
  end;
$$;

create or replace function private.cms_crb_lock_actor_scope(
  p_actor_id uuid,
  p_actor_ids uuid[],
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
declare
  v_actor_ids uuid[];
  v_subject_id uuid;
begin
  v_actor_ids := private.cms_crb_normalize_actor_ids(
    array_append(coalesce(p_actor_ids, '{}'::uuid[]), p_actor_id)
  );

  -- Esta chamada faz FOR SHARE nas leases (inclusive terminais) antes de
  -- qualquer lock de recurso. O teardown toma FOR UPDATE na mesma linha.
  perform private.cms_lock_active_qa_actor_leases(v_actor_ids);

  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_CRB_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;

  foreach v_subject_id in array v_actor_ids loop
    if not private.cms_crb_actor_identity_scope_allowed(
      p_actor_id, v_subject_id, p_environment
    ) then
      raise exception 'CMS_CRB_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
  end loop;
end;
$$;

create or replace function private.cms_crb_release_actor_ids(p_release_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.cms_crb_normalize_actor_ids(array_agg(actor_id))
  from (
    select package.created_by as actor_id
    from public.cms_release_packages package where package.id = p_release_id
    union all
    select package.updated_by
    from public.cms_release_packages package where package.id = p_release_id
    union all
    select item.added_by from public.cms_release_items item where item.release_id = p_release_id
    union all
    select run.validated_by
    from public.cms_release_validation_runs run where run.release_id = p_release_id
    union all
    select approval.approver_id
    from public.cms_release_approvals approval where approval.release_id = p_release_id
    union all
    select event.actor_id
    from public.cms_release_events event where event.release_id = p_release_id
    union all
    select content_actor.actor_id
    from public.cms_release_items release_item
    cross join lateral unnest(
      private.cms_content_graph_actor_ids(release_item.item_id)
    ) content_actor(actor_id)
    where release_item.release_id = p_release_id
  ) actors;
$$;

create or replace function private.cms_crb_release_scope_allowed(
  p_actor_id uuid,
  p_release_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_release public.cms_release_packages%rowtype;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    return false;
  end if;

  select * into v_release
  from public.cms_release_packages package
  where package.id = p_release_id and package.environment = p_environment;
  if not found then return false; end if;

  return private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_release.created_by, v_release.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_release.updated_by, v_release.updated_at, p_environment
    )
    and not exists (
      select 1
      from public.cms_release_items item
      where item.release_id = p_release_id and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id, item.added_by, item.added_at, p_environment
        )
        or not private.cms_content_item_graph_scope_allowed(
          p_actor_id, item.item_id, p_environment
        )
        or not exists (
          select 1 from public.cms_content_revisions revision
          where revision.id = item.revision_id and revision.item_id = item.item_id
        )
        or exists (
          select 1
          from unnest(item.dependency_ids) dependency(dependency_id)
          where not exists (
            select 1 from public.cms_release_items dependency_item
            where dependency_item.id = dependency.dependency_id
              and dependency_item.release_id = p_release_id
          )
        )
      )
    )
    and not exists (
      select 1 from public.cms_release_validation_runs run
      where run.release_id = p_release_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, run.validated_by, run.validated_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_release_approvals approval
      where approval.release_id = p_release_id
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, approval.approver_id, approval.created_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_release_events event
      where event.release_id = p_release_id
        and event.actor_id is not null
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, event.actor_id, event.occurred_at, p_environment
        )
    );
end;
$$;

create or replace function private.cms_crb_anchor_scope_allowed(
  p_actor_id uuid,
  p_anchor jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
  v_revision_id uuid;
  v_release_id uuid;
  v_release_environment text;
begin
  if p_anchor is null or jsonb_typeof(p_anchor) <> 'object' then return false; end if;
  begin
    v_item_id := nullif(p_anchor ->> 'itemId', '')::uuid;
    v_revision_id := nullif(p_anchor ->> 'revisionId', '')::uuid;
    v_release_id := nullif(p_anchor ->> 'releaseId', '')::uuid;
  exception when others then
    return false;
  end;

  if v_item_id is not null and not private.cms_content_item_graph_scope_allowed(
    p_actor_id, v_item_id, p_environment
  ) then return false; end if;
  if v_revision_id is not null and not exists (
    select 1 from public.cms_content_revisions revision
    where revision.id = v_revision_id
      and (v_item_id is null or revision.item_id = v_item_id)
      and private.cms_content_item_graph_scope_allowed(
        p_actor_id, revision.item_id, p_environment
      )
  ) then return false; end if;
  if v_release_id is not null then
    select package.environment into v_release_environment
    from public.cms_release_packages package where package.id = v_release_id;
    if exists (
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
    ) then v_release_environment := p_environment; end if;
    if not private.cms_crb_release_scope_allowed(
      p_actor_id, v_release_id, v_release_environment
    ) then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function private.cms_crb_source_scope_allowed(
  p_actor_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
  v_task_id uuid;
  v_release_environment text;
begin
  if p_source_kind = 'manual' then return p_source_id is null; end if;
  if p_source_id is null then return false; end if;
  if p_source_kind in ('release', 'release_validation', 'delivery_failure') then
    select package.environment into v_release_environment
    from public.cms_release_packages package where package.id = p_source_id;
    if exists (
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
    ) then v_release_environment := p_environment; end if;
    return private.cms_crb_release_scope_allowed(
      p_actor_id, p_source_id, v_release_environment
    );
  end if;
  if p_source_kind = 'review' then
    return private.cms_content_item_graph_scope_allowed(p_actor_id, p_source_id, p_environment);
  end if;
  if p_source_kind = 'quality' then
    select run.item_id into v_item_id
    from public.cms_quality_runs run where run.id = p_source_id;
    return v_item_id is not null and private.cms_content_item_graph_scope_allowed(
      p_actor_id, v_item_id, p_environment
    );
  end if;
  if p_source_kind = 'comment' then
    select comment.task_id into v_task_id
    from public.cms_work_comments comment
    where comment.id = p_source_id
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, comment.author_id, comment.created_at, p_environment
      );
    return v_task_id is not null and exists (
      select 1 from public.cms_work_tasks task
      where task.id = v_task_id
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, task.created_by, task.created_at, p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, task.updated_by, task.updated_at, p_environment
        )
    );
  end if;
  return false;
end;
$$;

create or replace function private.cms_crb_task_actor_ids(p_task_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_task public.cms_work_tasks%rowtype;
  v_ids uuid[];
  v_reference_id uuid;
begin
  select * into v_task from public.cms_work_tasks task where task.id = p_task_id;
  if not found then return '{}'::uuid[]; end if;

  select private.cms_crb_normalize_actor_ids(array_agg(actor_id)) into v_ids
  from (
    select task.created_by as actor_id from public.cms_work_tasks task where task.id = p_task_id
    union all select task.updated_by from public.cms_work_tasks task where task.id = p_task_id
    union all select task.assigned_to from public.cms_work_tasks task where task.id = p_task_id
    union all select comment.author_id from public.cms_work_comments comment where comment.task_id = p_task_id
    union all
    select mention.mentioned_user_id
    from public.cms_work_mentions mention
    join public.cms_work_comments comment on comment.id = mention.comment_id
    where comment.task_id = p_task_id
    union all select event.actor_id from public.cms_work_task_events event where event.task_id = p_task_id
    union all select outbox.recipient_id from public.cms_collaboration_outbox outbox where outbox.task_id = p_task_id
  ) actors;
  if v_task.source_id is not null then
    if v_task.source_kind in ('release', 'release_validation', 'delivery_failure') then
      v_ids := array_cat(v_ids, private.cms_crb_release_actor_ids(v_task.source_id));
    elsif v_task.source_kind = 'review' then
      v_ids := array_cat(v_ids, private.cms_content_graph_actor_ids(v_task.source_id));
    elsif v_task.source_kind = 'quality' then
      select run.item_id into v_reference_id
      from public.cms_quality_runs run where run.id = v_task.source_id;
      v_ids := array_cat(v_ids, private.cms_content_graph_actor_ids(v_reference_id));
    elsif v_task.source_kind = 'comment' then
      select comment.task_id into v_reference_id
      from public.cms_work_comments comment where comment.id = v_task.source_id;
      select array_cat(v_ids, private.cms_crb_normalize_actor_ids(array_agg(actor_id))) into v_ids
      from (
        select comment.author_id as actor_id
        from public.cms_work_comments comment where comment.id = v_task.source_id
        union all select source_task.created_by
        from public.cms_work_tasks source_task where source_task.id = v_reference_id
        union all select source_task.updated_by
        from public.cms_work_tasks source_task where source_task.id = v_reference_id
      ) source_actors;
    end if;
  end if;

  begin
    v_reference_id := nullif(v_task.anchor ->> 'itemId', '')::uuid;
  exception when others then v_reference_id := null; end;
  if v_reference_id is not null then
    v_ids := array_cat(v_ids, private.cms_content_graph_actor_ids(v_reference_id));
  end if;
  begin
    v_reference_id := nullif(v_task.anchor ->> 'revisionId', '')::uuid;
  exception when others then v_reference_id := null; end;
  if v_reference_id is not null then
    select revision.item_id into v_reference_id
    from public.cms_content_revisions revision where revision.id = v_reference_id;
    v_ids := array_cat(v_ids, private.cms_content_graph_actor_ids(v_reference_id));
  end if;
  begin
    v_reference_id := nullif(v_task.anchor ->> 'releaseId', '')::uuid;
  exception when others then v_reference_id := null; end;
  if v_reference_id is not null then
    v_ids := array_cat(v_ids, private.cms_crb_release_actor_ids(v_reference_id));
  end if;

  return private.cms_crb_normalize_actor_ids(v_ids);
end;
$$;

create or replace function private.cms_crb_task_scope_allowed(
  p_actor_id uuid,
  p_task_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_task public.cms_work_tasks%rowtype;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then return false; end if;
  select * into v_task from public.cms_work_tasks task where task.id = p_task_id;
  if not found then return false; end if;

  return private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_task.created_by, v_task.created_at, p_environment
    )
    and private.cms_content_actor_row_scope_allowed(
      p_actor_id, v_task.updated_by, v_task.updated_at, p_environment
    )
    and (v_task.assigned_to is null or private.cms_crb_actor_identity_scope_allowed(
      p_actor_id, v_task.assigned_to, p_environment
    ))
    and private.cms_crb_source_scope_allowed(
      p_actor_id, v_task.source_kind, v_task.source_id, p_environment
    )
    and private.cms_crb_anchor_scope_allowed(p_actor_id, v_task.anchor, p_environment)
    and not exists (
      select 1 from public.cms_work_comments comment
      where comment.task_id = p_task_id and (
        not private.cms_content_actor_row_scope_allowed(
          p_actor_id, comment.author_id, comment.created_at, p_environment
        )
        or (comment.parent_comment_id is not null and not exists (
          select 1 from public.cms_work_comments parent
          where parent.id = comment.parent_comment_id and parent.task_id = p_task_id
        ))
        or not private.cms_crb_anchor_scope_allowed(p_actor_id, comment.anchor, p_environment)
      )
    )
    and not exists (
      select 1
      from public.cms_work_mentions mention
      join public.cms_work_comments comment on comment.id = mention.comment_id
      where comment.task_id = p_task_id
        and not private.cms_crb_actor_identity_scope_allowed(
          p_actor_id, mention.mentioned_user_id, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_work_task_events event
      where event.task_id = p_task_id and event.actor_id is not null
        and not private.cms_content_actor_row_scope_allowed(
          p_actor_id, event.actor_id, event.occurred_at, p_environment
        )
    )
    and not exists (
      select 1 from public.cms_collaboration_outbox outbox
      where outbox.task_id = p_task_id
        and not private.cms_crb_actor_identity_scope_allowed(
          p_actor_id, outbox.recipient_id, p_environment
        )
    );
end;
$$;

create or replace function private.cms_crb_bulk_job_actor_ids(p_job_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_ids uuid[];
  v_item record;
  v_reference_id uuid;
begin
  select private.cms_crb_normalize_actor_ids(array_agg(actor_id)) into v_ids
  from (
    select job.requested_by as actor_id from public.cms_bulk_jobs job where job.id = p_job_id
    union all select job.executed_by from public.cms_bulk_jobs job where job.id = p_job_id
  ) actors;
  for v_item in select * from public.cms_bulk_job_items item where item.job_id = p_job_id loop
    if v_item.target_type = 'content_item' then
      v_ids := array_cat(v_ids, private.cms_content_graph_actor_ids(v_item.target_id));
      begin v_reference_id := nullif(v_item.requested_change ->> 'releaseId', '')::uuid;
      exception when others then v_reference_id := null; end;
      if v_reference_id is not null then
        v_ids := array_cat(v_ids, private.cms_crb_release_actor_ids(v_reference_id));
      end if;
    elsif v_item.target_type = 'work_task' then
      v_ids := array_cat(v_ids, private.cms_crb_task_actor_ids(v_item.target_id));
      begin v_reference_id := nullif(v_item.requested_change ->> 'assignedTo', '')::uuid;
      exception when others then v_reference_id := null; end;
      if v_reference_id is not null then v_ids := array_append(v_ids, v_reference_id); end if;
    end if;
  end loop;
  return private.cms_crb_normalize_actor_ids(v_ids);
end;
$$;

create or replace function private.cms_crb_bulk_job_scope_allowed(
  p_actor_id uuid,
  p_job_id uuid,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_job public.cms_bulk_jobs%rowtype;
  v_item record;
  v_release_id uuid;
  v_assignee uuid;
begin
  if not private.cms_content_actor_context_active(p_actor_id, p_environment) then return false; end if;
  select * into v_job from public.cms_bulk_jobs job
  where job.id = p_job_id and job.environment = p_environment;
  if not found then return false; end if;
  if not private.cms_content_actor_row_scope_allowed(
    p_actor_id, v_job.requested_by, v_job.created_at, p_environment
  ) then return false; end if;
  if v_job.executed_by is not null and not private.cms_content_actor_row_scope_allowed(
    p_actor_id, v_job.executed_by,
    coalesce(v_job.started_at, v_job.completed_at, v_job.updated_at), p_environment
  ) then return false; end if;

  for v_item in select * from public.cms_bulk_job_items item where item.job_id = p_job_id loop
    if v_item.target_type = 'content_item' then
      if not private.cms_content_item_graph_scope_allowed(
        p_actor_id, v_item.target_id, p_environment
      ) then return false; end if;
      begin v_release_id := nullif(v_item.requested_change ->> 'releaseId', '')::uuid;
      exception when others then return false; end;
      if v_release_id is not null and not private.cms_crb_release_scope_allowed(
        p_actor_id, v_release_id, p_environment
      ) then return false; end if;
    elsif v_item.target_type = 'work_task' then
      if not private.cms_crb_task_scope_allowed(
        p_actor_id, v_item.target_id, p_environment
      ) then return false; end if;
      begin v_assignee := nullif(v_item.requested_change ->> 'assignedTo', '')::uuid;
      exception when others then return false; end;
      if v_assignee is not null and not private.cms_crb_actor_identity_scope_allowed(
        p_actor_id, v_assignee, p_environment
      ) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.cms_crb_guard_release_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_ids uuid[] := array[p_actor_id];
  v_release_id uuid;
  v_item_id uuid;
  v_revision_id uuid;
  v_dependency_id uuid;
begin
  if p_action not in (
    'create', 'add_item', 'validate', 'submit', 'approve', 'schedule',
    'publish', 'cancel', 'rollback'
  ) or p_site_key <> 'main' or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
  end if;

  if p_action <> 'create' then
    begin v_release_id := (p_payload ->> 'releaseId')::uuid;
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    if v_release_id is null then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_release_id));
  end if;

  if p_action = 'add_item' then
    begin
      v_item_id := (p_payload ->> 'itemId')::uuid;
      v_revision_id := (p_payload ->> 'revisionId')::uuid;
      for v_dependency_id in
        select value::text::uuid
        from jsonb_array_elements(coalesce(p_payload -> 'dependencyIds', '[]'::jsonb)) value
      loop
        null;
      end loop;
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_item_id));
  end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  if v_release_id is not null then
    perform 1 from public.cms_release_packages package
    where package.id = v_release_id order by package.id for update;
    if not found
      or not private.cms_crb_release_scope_allowed(p_actor_id, v_release_id, p_environment)
      or not exists (
        select 1 from public.cms_release_packages package
        where package.id = v_release_id and package.site_key = p_site_key
      ) then
      raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if v_item_id is not null then
    perform 1 from public.cms_content_items item
    where item.id = v_item_id order by item.id for update;
    if not found
      or not private.cms_content_item_graph_scope_allowed(
        p_actor_id, v_item_id, p_environment
      )
      or not exists (
        select 1 from public.cms_content_revisions revision
        where revision.id = v_revision_id and revision.item_id = v_item_id
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(p_payload -> 'dependencyIds', '[]'::jsonb)) value
        where not exists (
          select 1 from public.cms_release_items dependency
          where dependency.id = (value #>> '{}')::uuid
            and dependency.release_id = v_release_id
        )
      ) then
      raise exception 'CMS_RELEASE_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

create or replace function private.cms_crb_guard_collaboration_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_ids uuid[] := array[p_actor_id];
  v_task_id uuid;
  v_source_id uuid;
  v_source_kind text;
  v_source_task_id uuid;
  v_source_item_id uuid;
  v_item_id uuid;
  v_revision_id uuid;
  v_release_id uuid;
  v_assignee uuid;
  v_parent_comment_id uuid;
  v_mention jsonb;
  v_mentioned_id uuid;
begin
  if p_action not in (
    'create_task', 'add_comment', 'assign_task', 'resolve_task', 'reopen_task', 'save_view'
  ) or p_site_key <> 'main' or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
  end if;

  begin
    v_task_id := nullif(p_payload ->> 'taskId', '')::uuid;
    v_source_id := nullif(p_payload ->> 'sourceId', '')::uuid;
    v_assignee := nullif(p_payload ->> 'assignedTo', '')::uuid;
    v_parent_comment_id := nullif(p_payload ->> 'parentCommentId', '')::uuid;
    if jsonb_typeof(p_payload -> 'anchor') = 'object' then
      v_item_id := nullif(p_payload #>> '{anchor,itemId}', '')::uuid;
      v_revision_id := nullif(p_payload #>> '{anchor,revisionId}', '')::uuid;
      v_release_id := nullif(p_payload #>> '{anchor,releaseId}', '')::uuid;
    end if;
  exception when others then
    raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
  end;

  if v_task_id is not null then
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_task_actor_ids(v_task_id));
  end if;
  if v_assignee is not null then v_actor_ids := array_append(v_actor_ids, v_assignee); end if;
  if v_item_id is not null then
    v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_item_id));
  elsif v_revision_id is not null then
    select revision.item_id into v_item_id
    from public.cms_content_revisions revision where revision.id = v_revision_id;
    v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_item_id));
  end if;
  if v_release_id is not null then
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_release_id));
  end if;

  v_source_kind := coalesce(p_payload ->> 'sourceKind', 'manual');
  if v_source_id is not null then
    if v_source_kind in ('release', 'release_validation', 'delivery_failure') then
      v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_source_id));
    elsif v_source_kind = 'review' then
      v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_source_id));
    elsif v_source_kind = 'quality' then
      select run.item_id into v_source_item_id
      from public.cms_quality_runs run where run.id = v_source_id;
      v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_source_item_id));
    elsif v_source_kind = 'comment' then
      select comment.task_id into v_source_task_id
      from public.cms_work_comments comment where comment.id = v_source_id;
      v_actor_ids := array_cat(v_actor_ids, private.cms_crb_task_actor_ids(v_source_task_id));
    end if;
  end if;

  if p_action = 'add_comment' then
    if jsonb_typeof(coalesce(p_payload -> 'mentions', '[]'::jsonb)) <> 'array' then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end if;
    begin
      for v_mention in select value from jsonb_array_elements(p_payload -> 'mentions') loop
        v_mentioned_id := (v_mention #>> '{}')::uuid;
        v_actor_ids := array_append(v_actor_ids, v_mentioned_id);
      end loop;
    exception when others then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end;
  end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  if v_release_id is not null then
    perform 1 from public.cms_release_packages package
    where package.id = v_release_id order by package.id for update;
  end if;
  if v_source_kind in ('release', 'release_validation', 'delivery_failure')
     and v_source_id is not null and v_source_id is distinct from v_release_id then
    perform 1 from public.cms_release_packages package
    where package.id = v_source_id order by package.id for update;
  end if;
  if v_item_id is not null then
    perform 1 from public.cms_content_items item
    where item.id = v_item_id order by item.id for update;
  end if;
  if v_source_kind = 'review' and v_source_id is not null
     and v_source_id is distinct from v_item_id then
    perform 1 from public.cms_content_items item
    where item.id = v_source_id order by item.id for update;
  end if;
  if v_source_item_id is not null and v_source_item_id is distinct from v_item_id then
    perform 1 from public.cms_content_items item
    where item.id = v_source_item_id order by item.id for update;
  end if;
  if v_source_task_id is not null then
    perform 1 from public.cms_work_tasks task
    where task.id = v_source_task_id order by task.id for update;
  end if;
  if v_task_id is not null and v_task_id is distinct from v_source_task_id then
    perform 1 from public.cms_work_tasks task
    where task.id = v_task_id order by task.id for update;
  end if;

  if p_action = 'create_task' then
    if not private.cms_crb_source_scope_allowed(
      p_actor_id, v_source_kind, v_source_id, p_environment
    ) or not private.cms_crb_anchor_scope_allowed(
      p_actor_id, p_payload -> 'anchor', p_environment
    ) then
      raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
    end if;
  elsif p_action <> 'save_view' then
    if v_task_id is null or not private.cms_crb_task_scope_allowed(
      p_actor_id, v_task_id, p_environment
    ) then
      raise exception 'CMS_WORK_TASK_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if v_assignee is not null and not private.cms_crb_actor_identity_scope_allowed(
    p_actor_id, v_assignee, p_environment
  ) then
    raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_action = 'add_comment' then
    if v_parent_comment_id is not null and not exists (
      select 1 from public.cms_work_comments parent
      where parent.id = v_parent_comment_id and parent.task_id = v_task_id
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, parent.author_id, parent.created_at, p_environment
        )
    ) then
      raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
    end if;
    for v_mention in select value from jsonb_array_elements(p_payload -> 'mentions') loop
      v_mentioned_id := (v_mention #>> '{}')::uuid;
      if not private.cms_crb_actor_identity_scope_allowed(
        p_actor_id, v_mentioned_id, p_environment
      ) then
        raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
      end if;
    end loop;
    if p_payload ? 'anchor' and not private.cms_crb_anchor_scope_allowed(
      p_actor_id, p_payload -> 'anchor', p_environment
    ) then
      raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
    end if;
  end if;
end;
$$;

create or replace function private.cms_crb_guard_bulk_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_ids uuid[] := array[p_actor_id];
  v_job_id uuid;
  v_operation text;
  v_release_id uuid;
  v_assignee uuid;
  v_target jsonb;
  v_target_id uuid;
  v_revision_id uuid;
begin
  if p_action not in ('dry_run', 'execute', 'cancel')
     or p_site_key <> 'main' or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
  end if;

  if p_action = 'dry_run' then
    v_operation := p_payload ->> 'operation';
    if v_operation not in ('add_to_release', 'assign_tasks', 'resolve_tasks')
       or jsonb_typeof(p_payload -> 'targets') <> 'array' then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end if;
    begin
      v_release_id := nullif(p_payload #>> '{changes,releaseId}', '')::uuid;
      v_assignee := nullif(p_payload #>> '{changes,assignedTo}', '')::uuid;
    exception when others then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end;
    if v_release_id is not null then
      v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_release_id));
    end if;
    if v_assignee is not null then v_actor_ids := array_append(v_actor_ids, v_assignee); end if;
    begin
      for v_target in select value from jsonb_array_elements(p_payload -> 'targets') loop
        v_target_id := (v_target ->> 'id')::uuid;
        if v_operation = 'add_to_release' then
          v_revision_id := (v_target ->> 'revisionId')::uuid;
          v_actor_ids := array_cat(v_actor_ids, private.cms_content_graph_actor_ids(v_target_id));
        else
          v_actor_ids := array_cat(v_actor_ids, private.cms_crb_task_actor_ids(v_target_id));
        end if;
      end loop;
    exception when others then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end;
  else
    begin v_job_id := (p_payload ->> 'jobId')::uuid;
    exception when others then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end;
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_bulk_job_actor_ids(v_job_id));
  end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  if v_job_id is not null then
    perform 1 from public.cms_bulk_jobs job
    where job.id = v_job_id order by job.id for update;
    if not found
      or not private.cms_crb_bulk_job_scope_allowed(p_actor_id, v_job_id, p_environment)
      or not exists (
        select 1 from public.cms_bulk_jobs job
        where job.id = v_job_id and job.site_key = p_site_key
      ) then
      raise exception 'CMS_BULK_JOB_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform 1
    from public.cms_content_items item
    join public.cms_bulk_job_items job_item on job_item.target_id = item.id
    where job_item.job_id = v_job_id and job_item.target_type = 'content_item'
    order by item.id for update of item;
    perform 1
    from public.cms_work_tasks task
    join public.cms_bulk_job_items job_item on job_item.target_id = task.id
    where job_item.job_id = v_job_id and job_item.target_type = 'work_task'
    order by task.id for update of task;
    return;
  end if;

  if v_release_id is not null then
    perform 1 from public.cms_release_packages package
    where package.id = v_release_id order by package.id for update;
    if not found or not private.cms_crb_release_scope_allowed(
      p_actor_id, v_release_id, p_environment
    ) then raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501'; end if;
  end if;
  if v_assignee is not null and not private.cms_crb_actor_identity_scope_allowed(
    p_actor_id, v_assignee, p_environment
  ) then raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501'; end if;

  for v_target in select value from jsonb_array_elements(p_payload -> 'targets') loop
    v_target_id := (v_target ->> 'id')::uuid;
    if v_operation = 'add_to_release' then
      v_revision_id := (v_target ->> 'revisionId')::uuid;
      perform 1 from public.cms_content_items item
      where item.id = v_target_id order by item.id for update;
      if not found
        or not private.cms_content_item_graph_scope_allowed(
          p_actor_id, v_target_id, p_environment
        )
        or not exists (
          select 1 from public.cms_content_revisions revision
          where revision.id = v_revision_id and revision.item_id = v_target_id
        ) then raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501'; end if;
    else
      perform 1 from public.cms_work_tasks task
      where task.id = v_target_id order by task.id for update;
      if not found or not private.cms_crb_task_scope_allowed(
        p_actor_id, v_target_id, p_environment
      ) then raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501'; end if;
    end if;
  end loop;
end;
$$;

-- Preserve the original implementations behind non-granted names. The public
-- signatures remain unchanged for the deployed Edge Functions.
alter function public.cms_execute_release_command(
  uuid, text, uuid, text, text, bigint, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) rename to cms_execute_release_command_unscoped_0073;
alter function public.cms_get_release_package(
  uuid, uuid, text, text, text, text, timestamptz
) rename to cms_get_release_package_unscoped_0073;
alter function public.cms_get_release_workspace(
  uuid, uuid, text, text, text, text, timestamptz
) rename to cms_get_release_workspace_unscoped_0073;
alter function public.cms_execute_release_v2_command(
  uuid, text, jsonb, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) rename to cms_execute_release_v2_command_unscoped_0073;
alter function public.cms_get_work_inbox(
  uuid, text, text, text, text, timestamptz, uuid, text, boolean, integer
) rename to cms_get_work_inbox_unscoped_0073;
alter function public.cms_execute_collaboration_command(
  uuid, text, jsonb, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) rename to cms_execute_collaboration_command_unscoped_0073;
alter function public.cms_get_bulk_jobs(
  uuid, text, text, text, text, timestamptz, integer
) rename to cms_get_bulk_jobs_unscoped_0073;
alter function public.cms_execute_bulk_command(
  uuid, text, jsonb, text, text, text, text, timestamptz,
  uuid, uuid, text, uuid
) rename to cms_execute_bulk_command_unscoped_0073;
alter function public.cms_publish_due_releases(integer, uuid)
  rename to cms_publish_due_releases_unscoped_0073;
alter function public.cms_claim_collaboration_outbox(integer, uuid)
  rename to cms_claim_collaboration_outbox_unscoped_0073;
alter function public.cms_finish_collaboration_outbox(uuid, boolean, text)
  rename to cms_finish_collaboration_outbox_unscoped_0073;

create function public.cms_execute_release_command(
  p_actor_id uuid,
  p_action text,
  p_release_id uuid,
  p_environment text,
  p_site_key text,
  p_expected_version bigint,
  p_reason text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_crb_guard_release_command(
    p_actor_id,
    p_action,
    case when p_action = 'create' then '{}'::jsonb
      else jsonb_build_object('releaseId', p_release_id) end,
    p_environment,
    p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  return public.cms_execute_release_command_unscoped_0073(
    p_actor_id, p_action, p_release_id, p_environment, p_site_key,
    p_expected_version, p_reason, p_aal, p_session_id, p_issued_at,
    p_command_id, p_idempotency_key, p_request_hash, p_correlation_id
  );
end;
$$;

create function public.cms_get_release_package(
  p_actor_id uuid,
  p_release_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_crb_lock_actor_scope(
    p_actor_id, private.cms_crb_release_actor_ids(p_release_id), p_environment
  );
  perform 1 from public.cms_release_packages package
  where package.id = p_release_id order by package.id for share;
  if not found
    or not private.cms_crb_release_scope_allowed(p_actor_id, p_release_id, p_environment)
    or not exists (
      select 1 from public.cms_release_packages package
      where package.id = p_release_id and package.site_key = p_site_key
    ) then
    raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return public.cms_get_release_package_unscoped_0073(
    p_actor_id, p_release_id, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
end;
$$;

create function public.cms_get_release_workspace(
  p_actor_id uuid,
  p_release_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_release_id uuid;
  v_release_ids uuid[];
  v_actor_ids uuid[] := array[p_actor_id];
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:releases.read', p_aal, p_session_id, p_issued_at
  ) or not public.cms_ev2_collaboration_enabled(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_RELEASE_V2_FORBIDDEN' using errcode = '42501'; end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);
  if p_release_id is not null then
    perform private.cms_crb_lock_actor_scope(
      p_actor_id, private.cms_crb_release_actor_ids(p_release_id), p_environment
    );
    perform 1 from public.cms_release_packages package
    where package.id = p_release_id order by package.id for share;
    if not found
      or not private.cms_crb_release_scope_allowed(p_actor_id, p_release_id, p_environment)
      or not exists (
        select 1 from public.cms_release_packages package
        where package.id = p_release_id and package.site_key = p_site_key
      ) then raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002'; end if;
    return public.cms_get_release_workspace_unscoped_0073(
      p_actor_id, p_release_id, p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;

  select coalesce(array_agg(id order by updated_at desc), '{}'::uuid[]) into v_release_ids
  from (
    select package.id, package.updated_at
    from public.cms_release_packages package
    where package.environment = p_environment and package.site_key = p_site_key
      and private.cms_crb_release_scope_allowed(p_actor_id, package.id, p_environment)
    order by package.updated_at desc
    limit 50
  ) visible;
  foreach v_release_id in array v_release_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_release_id));
  end loop;
  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  return jsonb_build_object(
    'schemaVersion', 2,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'releaseId', package.id,
        'title', package.title,
        'status', package.status,
        'planHash', package.plan_hash,
        'lockVersion', package.lock_version,
        'scheduledFor', package.scheduled_for,
        'approvedAt', package.approved_at,
        'publishedAt', package.published_at,
        'updatedAt', package.updated_at,
        'itemCount', (select count(*) from public.cms_release_items item where item.release_id = package.id)
      ) order by package.updated_at desc)
      from public.cms_release_packages package
      where package.id = any(v_release_ids)
        and private.cms_crb_release_scope_allowed(p_actor_id, package.id, p_environment)
    ), '[]'::jsonb)
  );
end;
$$;

create function public.cms_execute_release_v2_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_crb_guard_release_command(
    p_actor_id, p_action, p_payload, p_environment, p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  return public.cms_execute_release_v2_command_unscoped_0073(
    p_actor_id, p_action, p_payload, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at, p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
end;
$$;

create function public.cms_get_work_inbox(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_task_id uuid default null,
  p_status text default null,
  p_assigned_to_me boolean default false,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_task_id uuid;
  v_task_ids uuid[];
  v_actor_ids uuid[] := array[p_actor_id];
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:collaboration.read', p_aal, p_session_id, p_issued_at
  ) or not public.cms_ev2_collaboration_enabled(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'resolved') then
    raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
  end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_task_ids
  from (
    select task.id
    from public.cms_work_tasks task
    where task.site_key = p_site_key
      and (p_task_id is null or task.id = p_task_id)
      and (p_status is null or task.status = p_status)
      and (not p_assigned_to_me or task.assigned_to = p_actor_id)
      and private.cms_crb_task_scope_allowed(p_actor_id, task.id, p_environment)
    order by
      case task.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
      task.due_at nulls last,
      task.updated_at desc
    limit least(greatest(p_limit, 1), 100)
  ) visible;
  foreach v_task_id in array v_task_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_task_actor_ids(v_task_id));
  end loop;
  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  return jsonb_build_object(
    'schemaVersion', 1,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.id,
        'sourceKind', task.source_kind,
        'sourceId', task.source_id,
        'title', task.title,
        'description', task.description,
        'status', task.status,
        'priority', task.priority,
        'anchor', task.anchor,
        'assignedTo', task.assigned_to,
        'dueAt', task.due_at,
        'lockVersion', task.lock_version,
        'updatedAt', task.updated_at,
        'commentCount', (select count(*) from public.cms_work_comments comment where comment.task_id = task.id),
        'comments', case when p_task_id is null then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', comment.id,
            'parentCommentId', comment.parent_comment_id,
            'authorId', comment.author_id,
            'body', comment.body,
            'anchor', comment.anchor,
            'createdAt', comment.created_at
          ) order by comment.created_at)
          from public.cms_work_comments comment where comment.task_id = task.id
        ), '[]'::jsonb) end,
        'history', case when p_task_id is null then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', event.id,
            'actorId', event.actor_id,
            'eventType', event.event_type,
            'eventData', event.event_data,
            'occurredAt', event.occurred_at
          ) order by event.occurred_at)
          from public.cms_work_task_events event where event.task_id = task.id
        ), '[]'::jsonb) end
      ) order by
        case task.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        task.due_at nulls last,
        task.updated_at desc)
      from public.cms_work_tasks task
      where task.id = any(v_task_ids)
        and private.cms_crb_task_scope_allowed(p_actor_id, task.id, p_environment)
    ), '[]'::jsonb),
    'savedViews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', view.id,
        'name', view.name,
        'filters', view.filters,
        'sort', view.sort,
        'favorite', view.favorite,
        'updatedAt', view.updated_at
      ) order by view.favorite desc, view.name)
      from public.cms_saved_inbox_views view
      where view.owner_id = p_actor_id
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, view.owner_id, view.created_at, p_environment
        )
        and private.cms_content_actor_row_scope_allowed(
          p_actor_id, view.owner_id, view.updated_at, p_environment
        )
    ), '[]'::jsonb)
  );
end;
$$;

create function public.cms_execute_collaboration_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_crb_guard_collaboration_command(
    p_actor_id, p_action, p_payload, p_environment, p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  return public.cms_execute_collaboration_command_unscoped_0073(
    p_actor_id, p_action, p_payload, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at, p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
end;
$$;

create function public.cms_get_bulk_jobs(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_job_ids uuid[];
  v_actor_ids uuid[] := array[p_actor_id];
begin
  if not public.cms_actor_authorized(
    p_actor_id, 'cms:bulk.read', p_aal, p_session_id, p_issued_at
  ) or not public.cms_ev2_collaboration_enabled(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  ) then raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501'; end if;
  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  select coalesce(array_agg(id order by updated_at desc), '{}'::uuid[]) into v_job_ids
  from (
    select job.id, job.updated_at
    from public.cms_bulk_jobs job
    where job.environment = p_environment and job.site_key = p_site_key
      and (job.requested_by = p_actor_id or public.cms_actor_authorized(
        p_actor_id, 'cms:audit.read', p_aal, p_session_id, p_issued_at
      ))
      and private.cms_crb_bulk_job_scope_allowed(p_actor_id, job.id, p_environment)
    order by job.updated_at desc
    limit least(greatest(p_limit, 1), 100)
  ) visible;
  foreach v_job_id in array v_job_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_bulk_job_actor_ids(v_job_id));
  end loop;
  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  return jsonb_build_object(
    'schemaVersion', 1,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobId', job.id,
        'operation', job.operation,
        'status', job.status,
        'atomic', job.atomic,
        'targetCount', job.target_count,
        'report', job.dry_run_report,
        'lockVersion', job.lock_version,
        'correlationId', job.correlation_id,
        'createdAt', job.created_at,
        'updatedAt', job.updated_at
      ) order by job.updated_at desc)
      from public.cms_bulk_jobs job
      where job.id = any(v_job_ids)
        and private.cms_crb_bulk_job_scope_allowed(p_actor_id, job.id, p_environment)
    ), '[]'::jsonb)
  );
end;
$$;

create function public.cms_execute_bulk_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform private.cms_crb_guard_bulk_command(
    p_actor_id, p_action, p_payload, p_environment, p_site_key
  );
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  return public.cms_execute_bulk_command_unscoped_0073(
    p_actor_id, p_action, p_payload, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at, p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
end;
$$;

create function public.cms_publish_due_releases(p_limit integer, p_correlation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_candidate_id uuid;
  v_release public.cms_release_packages%rowtype;
  v_actor_ids uuid[];
  v_command_id uuid;
  v_idempotency_key uuid;
  v_payload jsonb;
  v_request_hash text;
  v_processed integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'CMS_RELEASE_WORKER_LIMIT_INVALID' using errcode = '22023';
  end if;

  for v_candidate_id in
    select package.id
    from public.cms_release_packages package
    where package.status = 'scheduled'
      and package.scheduled_for <= statement_timestamp()
      and package.environment in ('local', 'staging')
    order by package.scheduled_for, package.id
    limit p_limit
  loop
    begin
      v_actor_ids := private.cms_crb_release_actor_ids(v_candidate_id);
      select * into v_release from public.cms_release_packages package
      where package.id = v_candidate_id;
      if not found then continue; end if;
      perform private.cms_crb_lock_actor_scope(
        v_release.updated_by, v_actor_ids, v_release.environment
      );
      select * into v_release from public.cms_release_packages package
      where package.id = v_candidate_id
        and package.status = 'scheduled'
        and package.scheduled_for <= statement_timestamp()
      for update skip locked;
      if not found then continue; end if;
      if not private.cms_crb_release_scope_allowed(
        v_release.updated_by, v_release.id, v_release.environment
      ) then
        raise exception 'CMS_RELEASE_WORKER_SCOPE_FORBIDDEN' using errcode = '42501';
      end if;

      v_command_id := gen_random_uuid();
      v_idempotency_key := gen_random_uuid();
      v_payload := jsonb_build_object(
        'releaseId', v_release.id,
        'expectedVersion', v_release.lock_version,
        'scheduledWorker', true
      );
      v_request_hash := encode(
        extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'
      );
      perform public.cms_execute_release_v2_command(
        v_release.updated_by,
        'publish',
        v_payload,
        v_release.environment,
        v_release.site_key,
        'aal2',
        'ev2-release-scheduler',
        statement_timestamp(),
        v_command_id,
        v_idempotency_key,
        v_request_hash,
        coalesce(p_correlation_id, gen_random_uuid())
      );
      v_processed := v_processed + 1;
    exception when sqlstate '42501' then
      -- A lease terminal nunca autoriza o worker a tocar o release. O trigger
      -- de teardown, serializado pela mesma lease, faz a transicao terminal.
      v_skipped := v_skipped + 1;
    when others then
      begin
        select * into v_release from public.cms_release_packages package
        where package.id = v_candidate_id;
        if not found then continue; end if;
        v_actor_ids := private.cms_crb_release_actor_ids(v_candidate_id);
        perform private.cms_crb_lock_actor_scope(
          v_release.updated_by, v_actor_ids, v_release.environment
        );
        select * into v_release from public.cms_release_packages package
        where package.id = v_candidate_id and package.status = 'scheduled'
        for update;
        if not found or not private.cms_crb_release_scope_allowed(
          v_release.updated_by, v_release.id, v_release.environment
        ) then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        update public.cms_release_packages package
        set status = 'failed',
            failed_at = statement_timestamp(),
            last_error_code = 'scheduled_release_failed',
            lock_version = package.lock_version + 1,
            scheduled_for = null
        where package.id = v_release.id
          and package.status = 'scheduled'
          and package.lock_version = v_release.lock_version
        returning * into v_release;
        if found then
          insert into public.cms_release_events (
            release_id, actor_id, event_type, from_status, to_status,
            event_data, correlation_id
          ) values (
            v_release.id, v_release.updated_by, 'failed', 'scheduled', 'failed',
            jsonb_build_object('errorCode', 'scheduled_release_failed', 'partialWrites', 0),
            coalesce(p_correlation_id, gen_random_uuid())
          );
          insert into public.cms_work_tasks (
            source_kind, source_id, title, description, priority, anchor,
            assigned_to, created_by, updated_by
          ) values (
            'delivery_failure', v_release.id, 'Falha no release agendado',
            'A publicação foi abortada sem alteração parcial. Revise o pacote e execute novamente.',
            'critical', jsonb_build_object('releaseId', v_release.id),
            v_release.updated_by, v_release.updated_by, v_release.updated_by
          ) on conflict do nothing;
          v_failed := v_failed + 1;
        end if;
      exception when sqlstate '42501' then
        v_skipped := v_skipped + 1;
      end;
    end;
  end loop;
  return jsonb_build_object(
    'processed', v_processed,
    'failed', v_failed,
    'skippedOutOfScope', v_skipped,
    'partialWrites', 0
  );
end;
$$;

create function private.cms_crb_outbox_worker_scope_allowed(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_event public.cms_collaboration_outbox%rowtype;
  v_environment text;
begin
  select * into v_event from public.cms_collaboration_outbox event where event.id = p_event_id;
  if not found then return false; end if;
  v_environment := private.cms_content_actor_environment(v_event.recipient_id);
  return exists (
      select 1 from public.cms_profiles profile
      where profile.user_id = v_event.recipient_id and profile.status = 'active'
    )
    and private.cms_crb_actor_identity_scope_allowed(
      v_event.recipient_id, v_event.recipient_id, v_environment
    )
    and private.cms_crb_task_scope_allowed(
      v_event.recipient_id, v_event.task_id, v_environment
    );
end;
$$;

create function public.cms_claim_collaboration_outbox(p_limit integer, p_worker_id uuid)
returns setof public.cms_collaboration_outbox
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_candidate_id uuid;
  v_event public.cms_collaboration_outbox%rowtype;
  v_environment text;
  v_actor_ids uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_worker_id is null then
    raise exception 'CMS_COLLABORATION_WORKER_INVALID' using errcode = '22023';
  end if;
  for v_candidate_id in
    select event.id
    from public.cms_collaboration_outbox event
    where event.status in ('pending', 'failed')
      and event.available_at <= statement_timestamp()
      and event.attempts < 20
    order by event.available_at, event.created_at, event.id
    limit p_limit
  loop
    begin
      select * into v_event from public.cms_collaboration_outbox event
      where event.id = v_candidate_id;
      if not found then continue; end if;
      v_environment := private.cms_content_actor_environment(v_event.recipient_id);
      v_actor_ids := array_cat(
        private.cms_crb_task_actor_ids(v_event.task_id), array[v_event.recipient_id]
      );
      perform private.cms_crb_lock_actor_scope(
        v_event.recipient_id, v_actor_ids, v_environment
      );
      if not private.cms_crb_outbox_worker_scope_allowed(v_event.id) then
        raise exception 'CMS_COLLABORATION_WORKER_SCOPE_FORBIDDEN' using errcode = '42501';
      end if;
      update public.cms_collaboration_outbox event
      set status = 'processing',
          locked_at = statement_timestamp(),
          attempts = event.attempts + 1
      where event.id = v_candidate_id
        and event.status in ('pending', 'failed')
        and event.available_at <= statement_timestamp()
        and event.attempts < 20
      returning event.* into v_event;
      if found then return next v_event; end if;
    exception when sqlstate '42501' then
      null;
    end;
  end loop;
  return;
end;
$$;

create function public.cms_finish_collaboration_outbox(
  p_id uuid,
  p_success boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_event public.cms_collaboration_outbox%rowtype;
  v_environment text;
  v_actor_ids uuid[];
begin
  if p_id is null or p_success is null
     or (not p_success and coalesce(p_error_code, '') !~ '^[a-z][a-z0-9_]{1,63}$') then
    raise exception 'CMS_COLLABORATION_WORKER_INVALID' using errcode = '22023';
  end if;
  select * into v_event from public.cms_collaboration_outbox event where event.id = p_id;
  if not found then return; end if;
  v_environment := private.cms_content_actor_environment(v_event.recipient_id);
  v_actor_ids := array_cat(
    private.cms_crb_task_actor_ids(v_event.task_id), array[v_event.recipient_id]
  );
  perform private.cms_crb_lock_actor_scope(
    v_event.recipient_id, v_actor_ids, v_environment
  );
  if not private.cms_crb_outbox_worker_scope_allowed(v_event.id) then
    raise exception 'CMS_COLLABORATION_WORKER_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  update public.cms_collaboration_outbox event
  set status = case when p_success then 'completed'
      when event.attempts >= 20 then 'dead_letter' else 'failed' end,
    completed_at = case when p_success then statement_timestamp() else null end,
    locked_at = null,
    available_at = case when p_success then event.available_at
      else statement_timestamp() + least(
        interval '30 minutes', interval '30 seconds' * power(2, least(event.attempts, 6))
      ) end,
    last_error_code = case when p_success then null else p_error_code end
  where event.id = p_id and event.status = 'processing'
  returning event.* into v_event;
  if not found then return; end if;
  if p_success and v_event.event_type = 'mentioned' then
    update public.cms_work_mentions mention
    set delivery_status = 'delivered', delivered_at = statement_timestamp()
    where mention.comment_id = v_event.comment_id
      and mention.mentioned_user_id = v_event.recipient_id
      and mention.delivery_status = 'pending';
  end if;
end;
$$;

create or replace function private.cms_crb_lock_actor_leases_for_terminal(p_actor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
begin
  perform 1
  from private.cms_qa_actor_leases lease
  where lease.actor_id = any(private.cms_crb_normalize_actor_ids(p_actor_ids))
  order by lease.actor_id
  for share;
end;
$$;

create or replace function private.cms_crb_terminalize_qa_graph()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_release_ids uuid[];
  v_task_ids uuid[];
  v_job_ids uuid[];
  v_actor_ids uuid[] := array[old.actor_id];
  v_id uuid;
  v_release public.cms_release_packages%rowtype;
  v_task public.cms_work_tasks%rowtype;
  v_from_status text;
  v_releases integer := 0;
  v_tasks integer := 0;
  v_jobs integer := 0;
  v_outbox integer := 0;
  v_receipts integer := 0;
  v_rows integer := 0;
begin
  if old.status <> 'active' or new.status = 'active' then return new; end if;

  select coalesce(array_agg(package.id order by package.id), '{}'::uuid[])
  into v_release_ids
  from public.cms_release_packages package
  where old.actor_id = any(private.cms_crb_release_actor_ids(package.id));
  select coalesce(array_agg(task.id order by task.id), '{}'::uuid[])
  into v_task_ids
  from public.cms_work_tasks task
  where old.actor_id = any(private.cms_crb_task_actor_ids(task.id));
  select coalesce(array_agg(job.id order by job.id), '{}'::uuid[])
  into v_job_ids
  from public.cms_bulk_jobs job
  where old.actor_id = any(private.cms_crb_bulk_job_actor_ids(job.id));

  foreach v_id in array v_release_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_release_actor_ids(v_id));
  end loop;
  foreach v_id in array v_task_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_task_actor_ids(v_id));
  end loop;
  foreach v_id in array v_job_ids loop
    v_actor_ids := array_cat(v_actor_ids, private.cms_crb_bulk_job_actor_ids(v_id));
  end loop;
  -- O watchdog chega aqui com a lease expirada ainda em status active. Por
  -- isso o teardown somente trava a classificacao imutavel; ele nao exige que
  -- peers expirados voltem a ser ativos para poder neutralizar o grafo.
  perform private.cms_crb_lock_actor_leases_for_terminal(v_actor_ids);
  perform set_config('cms.qa_mutation_actor_id', old.actor_id::text, true);

  for v_release in
    select * from public.cms_release_packages package
    where package.id = any(v_release_ids)
      and package.status not in ('canceled', 'rolled_back')
    order by package.id
    for update
  loop
    v_from_status := v_release.status;
    if v_release.status = 'published' then
      update public.cms_release_packages package
      set status = 'rolled_back',
          rolled_back_at = statement_timestamp(),
          canceled_at = null,
          scheduled_for = null,
          compensated_at = statement_timestamp(),
          lock_version = package.lock_version + 1,
          updated_by = old.actor_id,
          last_error_code = null
      where package.id = v_release.id and package.lock_version = v_release.lock_version;
      insert into public.cms_release_events (
        release_id, actor_id, event_type, from_status, to_status,
        event_data, correlation_id
      ) values (
        v_release.id, old.actor_id, 'rolled_back', v_from_status, 'rolled_back',
        jsonb_build_object('reason', 'qa_lease_terminal', 'syntheticOnly', true),
        gen_random_uuid()
      );
    else
      update public.cms_release_packages package
      set status = 'canceled',
          canceled_at = statement_timestamp(),
          rolled_back_at = null,
          scheduled_for = null,
          lock_version = package.lock_version + 1,
          updated_by = old.actor_id,
          last_error_code = 'qa_lease_terminal'
      where package.id = v_release.id and package.lock_version = v_release.lock_version;
      insert into public.cms_release_events (
        release_id, actor_id, event_type, from_status, to_status,
        event_data, correlation_id
      ) values (
        v_release.id, old.actor_id, 'canceled', v_from_status, 'canceled',
        jsonb_build_object('reason', 'qa_lease_terminal', 'syntheticOnly', true),
        gen_random_uuid()
      );
    end if;
    v_releases := v_releases + 1;
  end loop;

  for v_task in
    select * from public.cms_work_tasks task
    where task.id = any(v_task_ids) and task.status <> 'resolved'
    order by task.id
    for update
  loop
    update public.cms_work_tasks task
    set status = 'resolved',
        resolved_at = statement_timestamp(),
        lock_version = task.lock_version + 1,
        updated_by = old.actor_id
    where task.id = v_task.id and task.lock_version = v_task.lock_version;
    insert into public.cms_work_task_events (
      task_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_task.id, old.actor_id, 'resolved',
      jsonb_build_object('reason', 'qa_lease_terminal', 'syntheticOnly', true),
      gen_random_uuid()
    );
    v_tasks := v_tasks + 1;
  end loop;

  update public.cms_collaboration_outbox outbox
  set status = 'dead_letter',
      locked_at = null,
      completed_at = statement_timestamp(),
      last_error_code = 'qa_lease_terminal'
  where outbox.task_id = any(v_task_ids)
    and outbox.status in ('pending', 'processing', 'failed');
  get diagnostics v_outbox = row_count;
  update public.cms_work_mentions mention
  set delivery_status = 'failed', delivered_at = null
  where mention.delivery_status = 'pending'
    and exists (
      select 1 from public.cms_work_comments comment
      where comment.id = mention.comment_id and comment.task_id = any(v_task_ids)
    );

  update public.cms_bulk_jobs job
  set status = 'canceled',
      canceled_at = statement_timestamp(),
      completed_at = coalesce(job.completed_at, statement_timestamp()),
      lock_version = job.lock_version + 1,
      dry_run_report = job.dry_run_report || jsonb_build_object(
        'terminalReason', 'qa_lease_terminal', 'syntheticOnly', true
      )
  where job.id = any(v_job_ids)
    and job.status in ('validating', 'validated', 'running', 'failed');
  get diagnostics v_jobs = row_count;

  update public.cms_release_command_receipts receipt
  set response = jsonb_build_object(
        'schemaVersion', 1,
        'status', 'canceled',
        'code', 'CMS_QA_ACTOR_LEASE_TERMINAL'
      ),
      completed_at = statement_timestamp()
  where receipt.actor_id = old.actor_id and receipt.response is null;
  get diagnostics v_receipts = row_count;
  update public.cms_ev2_command_receipts receipt
  set response = jsonb_build_object(
        'schemaVersion', 1,
        'status', 'canceled',
        'code', 'CMS_QA_ACTOR_LEASE_TERMINAL'
      ),
      completed_at = statement_timestamp()
  where receipt.actor_id = old.actor_id and receipt.response is null;
  get diagnostics v_rows = row_count;
  v_receipts := v_receipts + v_rows;

  if exists (
       select 1 from public.cms_release_packages package
       where package.id = any(v_release_ids)
         and package.status not in ('canceled', 'rolled_back')
     ) or exists (
       select 1 from public.cms_work_tasks task
       where task.id = any(v_task_ids) and task.status <> 'resolved'
     ) or exists (
       select 1 from public.cms_bulk_jobs job
       where job.id = any(v_job_ids)
         and job.status in ('validating', 'validated', 'running', 'failed')
     ) or exists (
       select 1 from public.cms_collaboration_outbox outbox
       where outbox.task_id = any(v_task_ids)
         and outbox.status in ('pending', 'processing', 'failed')
     ) then
    raise exception 'CMS_QA_CRB_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    old.actor_id,
    'cms:qa.collaboration_release_bulk_compensated',
    'qa_actor',
    old.actor_id::text,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'terminalStatus', new.status,
      'releasesTerminalized', v_releases,
      'tasksResolved', v_tasks,
      'bulkJobsCanceled', v_jobs,
      'outboxDeadLettered', v_outbox,
      'receiptsTerminalized', v_receipts,
      'eventsApprovalsSnapshotsRetained', true
    ),
    gen_random_uuid()
  );
  return new;
end;
$$;

drop trigger if exists cms_prepare_qa_actor_terminal_crb_cleanup
  on private.cms_qa_actor_leases;
create trigger cms_prepare_qa_actor_terminal_crb_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_crb_terminalize_qa_graph();

create or replace function private.cms_crb_feature_flag_scope_allowed(
  p_actor_id uuid,
  p_created_by uuid,
  p_updated_by uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select case
    when exists (
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
    ) then p_created_by is not null and p_updated_by is not null
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, p_created_by, p_created_at,
        private.cms_content_actor_environment(p_actor_id)
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, p_updated_by, p_updated_at,
        private.cms_content_actor_environment(p_actor_id)
      )
    else not exists (
      select 1 from private.cms_qa_actor_leases lease
      where lease.actor_id in (p_created_by, p_updated_by)
    )
  end;
$$;

create or replace function private.cms_crb_flag_override_scope_allowed(
  p_actor_id uuid,
  p_created_by uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_environment text,
  p_scope_type text,
  p_scope_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_subject_id uuid;
  v_actor_environment text := private.cms_content_actor_environment(p_actor_id);
begin
  if not private.cms_content_actor_row_scope_allowed(
    p_actor_id, p_created_by, p_created_at, v_actor_environment
  ) or not private.cms_content_actor_row_scope_allowed(
    p_actor_id, p_created_by, p_updated_at, v_actor_environment
  ) then return false; end if;
  if exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = p_actor_id
  ) then
    if p_scope_type <> 'user' or p_environment <> v_actor_environment then return false; end if;
  end if;
  if p_scope_type = 'user' then
    begin v_subject_id := p_scope_key::uuid;
    exception when others then return false; end;
    return private.cms_crb_actor_identity_scope_allowed(
      p_actor_id, v_subject_id, v_actor_environment
    );
  end if;
  return true;
end;
$$;

create or replace function public.cms_crb_actor_row_session_read_allowed(
  p_row_actor_id uuid,
  p_row_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_row_scope_allowed(
    auth.uid(), p_row_actor_id, p_row_at,
    private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_crb_actor_identity_session_allowed(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_crb_actor_identity_scope_allowed(
    auth.uid(), p_subject_id, private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_crb_release_session_read_allowed(p_release_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select private.cms_crb_release_scope_allowed(
    auth.uid(), package.id,
    case when exists (
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id = auth.uid()
    ) then private.cms_content_actor_environment(auth.uid()) else package.environment end
  )
  from public.cms_release_packages package where package.id = p_release_id;
$$;

create or replace function public.cms_crb_task_session_read_allowed(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_crb_task_scope_allowed(
    auth.uid(), p_task_id, private.cms_content_actor_environment(auth.uid())
  );
$$;

create or replace function public.cms_crb_bulk_job_session_read_allowed(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select private.cms_crb_bulk_job_scope_allowed(
    auth.uid(), job.id,
    case when exists (
      select 1 from private.cms_qa_actor_leases lease where lease.actor_id = auth.uid()
    ) then private.cms_content_actor_environment(auth.uid()) else job.environment end
  )
  from public.cms_bulk_jobs job where job.id = p_job_id;
$$;

create or replace function public.cms_crb_feature_flag_session_read_allowed(
  p_created_by uuid,
  p_updated_by uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_crb_feature_flag_scope_allowed(
    auth.uid(), p_created_by, p_updated_by, p_created_at, p_updated_at
  );
$$;

create or replace function public.cms_crb_flag_override_session_read_allowed(
  p_created_by uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_environment text,
  p_scope_type text,
  p_scope_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_crb_flag_override_scope_allowed(
    auth.uid(), p_created_by, p_created_at, p_updated_at,
    p_environment, p_scope_type, p_scope_key
  );
$$;

-- Replace every direct authenticated policy from 0037/0045. Service-role
-- workers remain explicit RPC callers; cms_audit_log is deliberately untouched
-- so corporate auditors retain the immutable audit trail for QA operations.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policy.schemaname, policy.tablename, policy.policyname
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'cms_feature_flags', 'cms_feature_flag_overrides',
        'cms_release_packages', 'cms_release_command_receipts', 'cms_release_events',
        'cms_release_items', 'cms_release_validation_runs', 'cms_release_validations',
        'cms_release_approvals', 'cms_release_snapshots', 'cms_work_tasks',
        'cms_work_comments', 'cms_work_mentions', 'cms_saved_inbox_views',
        'cms_work_task_events', 'cms_collaboration_outbox', 'cms_bulk_jobs',
        'cms_bulk_job_items', 'cms_ev2_command_receipts'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  end loop;
end;
$$;

create policy cms_feature_flags_scoped_read on public.cms_feature_flags
for select to authenticated using (
  public.cms_has_permission('cms:flags.read')
  and public.cms_crb_feature_flag_session_read_allowed(
    created_by, updated_by, created_at, updated_at
  )
);
create policy cms_feature_flag_overrides_scoped_read on public.cms_feature_flag_overrides
for select to authenticated using (
  public.cms_has_permission('cms:flags.read')
  and public.cms_crb_flag_override_session_read_allowed(
    created_by, created_at, updated_at, environment, scope_type, scope_key
  )
);
create policy cms_release_packages_scoped_read on public.cms_release_packages
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(id)
);
create policy cms_release_receipts_scoped_read on public.cms_release_command_receipts
for select to authenticated using (
  (actor_id = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_crb_actor_row_session_read_allowed(actor_id, created_at)
  and (release_id is null or public.cms_crb_release_session_read_allowed(release_id))
);
create policy cms_release_events_scoped_read on public.cms_release_events
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_release_items_scoped_read on public.cms_release_items
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_release_validation_runs_scoped_read on public.cms_release_validation_runs
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_release_validations_scoped_read on public.cms_release_validations
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_release_approvals_scoped_read on public.cms_release_approvals
for select to authenticated using (
  public.cms_has_permission('cms:releases.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_release_snapshots_scoped_read on public.cms_release_snapshots
for select to authenticated using (
  public.cms_has_permission('cms:audit.read')
  and public.cms_crb_release_session_read_allowed(release_id)
);
create policy cms_work_tasks_scoped_read on public.cms_work_tasks
for select to authenticated using (
  public.cms_has_permission('cms:collaboration.read')
  and public.cms_crb_task_session_read_allowed(id)
);
create policy cms_work_comments_scoped_read on public.cms_work_comments
for select to authenticated using (
  public.cms_has_permission('cms:collaboration.read')
  and public.cms_crb_task_session_read_allowed(task_id)
);
create policy cms_work_mentions_scoped_read on public.cms_work_mentions
for select to authenticated using (
  (mentioned_user_id = auth.uid() or public.cms_has_permission('cms:collaboration.read'))
  and public.cms_crb_actor_identity_session_allowed(mentioned_user_id)
  and exists (
    select 1 from public.cms_work_comments comment
    where comment.id = comment_id
      and public.cms_crb_task_session_read_allowed(comment.task_id)
  )
);
create policy cms_saved_inbox_views_scoped_read on public.cms_saved_inbox_views
for select to authenticated using (
  owner_id = auth.uid()
  and public.cms_crb_actor_row_session_read_allowed(owner_id, created_at)
  and public.cms_crb_actor_row_session_read_allowed(owner_id, updated_at)
);
create policy cms_work_task_events_scoped_read on public.cms_work_task_events
for select to authenticated using (
  public.cms_has_permission('cms:collaboration.read')
  and public.cms_crb_task_session_read_allowed(task_id)
);
create policy cms_collaboration_outbox_scoped_read on public.cms_collaboration_outbox
for select to authenticated using (
  (recipient_id = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_crb_actor_identity_session_allowed(recipient_id)
  and public.cms_crb_task_session_read_allowed(task_id)
);
create policy cms_bulk_jobs_scoped_read on public.cms_bulk_jobs
for select to authenticated using (
  (requested_by = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_crb_bulk_job_session_read_allowed(id)
);
create policy cms_bulk_job_items_scoped_read on public.cms_bulk_job_items
for select to authenticated using (
  exists (
    select 1 from public.cms_bulk_jobs job
    where job.id = job_id
      and (job.requested_by = auth.uid() or public.cms_has_permission('cms:audit.read'))
      and public.cms_crb_bulk_job_session_read_allowed(job.id)
  )
);
create policy cms_ev2_receipts_scoped_read on public.cms_ev2_command_receipts
for select to authenticated using (
  (actor_id = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_crb_actor_row_session_read_allowed(actor_id, created_at)
);

revoke all on function private.cms_crb_normalize_actor_ids(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_actor_identity_scope_allowed(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_lock_actor_scope(uuid,uuid[],text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_release_actor_ids(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_release_scope_allowed(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_anchor_scope_allowed(uuid,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_source_scope_allowed(uuid,text,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_task_actor_ids(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_task_scope_allowed(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_bulk_job_actor_ids(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_bulk_job_scope_allowed(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_guard_release_command(uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_guard_collaboration_command(uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_guard_bulk_command(uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_outbox_worker_scope_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_lock_actor_leases_for_terminal(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_terminalize_qa_graph()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_feature_flag_scope_allowed(
  uuid,uuid,uuid,timestamptz,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.cms_crb_flag_override_scope_allowed(
  uuid,uuid,timestamptz,timestamptz,text,text,text
) from public, anon, authenticated, service_role;

revoke all on function public.cms_crb_actor_row_session_read_allowed(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_actor_identity_session_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_release_session_read_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_task_session_read_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_bulk_job_session_read_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_feature_flag_session_read_allowed(
  uuid,uuid,timestamptz,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_crb_flag_override_session_read_allowed(
  uuid,timestamptz,timestamptz,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.cms_crb_actor_row_session_read_allowed(uuid,timestamptz)
  to authenticated;
grant execute on function public.cms_crb_actor_identity_session_allowed(uuid)
  to authenticated;
grant execute on function public.cms_crb_release_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_crb_task_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_crb_bulk_job_session_read_allowed(uuid)
  to authenticated;
grant execute on function public.cms_crb_feature_flag_session_read_allowed(
  uuid,uuid,timestamptz,timestamptz
) to authenticated;
grant execute on function public.cms_crb_flag_override_session_read_allowed(
  uuid,timestamptz,timestamptz,text,text,text
) to authenticated;

revoke all on function public.cms_execute_release_command_unscoped_0073(
  uuid,text,uuid,text,text,bigint,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_release_package_unscoped_0073(
  uuid,uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_release_workspace_unscoped_0073(
  uuid,uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_release_v2_command_unscoped_0073(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_work_inbox_unscoped_0073(
  uuid,text,text,text,text,timestamptz,uuid,text,boolean,integer
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_collaboration_command_unscoped_0073(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_bulk_jobs_unscoped_0073(
  uuid,text,text,text,text,timestamptz,integer
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_bulk_command_unscoped_0073(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_publish_due_releases_unscoped_0073(integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_claim_collaboration_outbox_unscoped_0073(integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_finish_collaboration_outbox_unscoped_0073(uuid,boolean,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_release_plan_hash(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.cms_execute_release_command(
  uuid,text,uuid,text,text,bigint,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_release_package(
  uuid,uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_release_workspace(
  uuid,uuid,text,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_release_v2_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_work_inbox(
  uuid,text,text,text,text,timestamptz,uuid,text,boolean,integer
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_collaboration_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_get_bulk_jobs(
  uuid,text,text,text,text,timestamptz,integer
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_bulk_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_publish_due_releases(integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_claim_collaboration_outbox(integer,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cms_finish_collaboration_outbox(uuid,boolean,text)
  from public, anon, authenticated, service_role;

grant execute on function public.cms_execute_release_command(
  uuid,text,uuid,text,text,bigint,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_get_release_package(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.cms_get_release_workspace(
  uuid,uuid,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.cms_execute_release_v2_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_get_work_inbox(
  uuid,text,text,text,text,timestamptz,uuid,text,boolean,integer
) to service_role;
grant execute on function public.cms_execute_collaboration_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_get_bulk_jobs(
  uuid,text,text,text,text,timestamptz,integer
) to service_role;
grant execute on function public.cms_execute_bulk_command(
  uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid
) to service_role;
grant execute on function public.cms_publish_due_releases(integer,uuid)
  to service_role;
grant execute on function public.cms_claim_collaboration_outbox(integer,uuid)
  to service_role;
grant execute on function public.cms_finish_collaboration_outbox(uuid,boolean,text)
  to service_role;
