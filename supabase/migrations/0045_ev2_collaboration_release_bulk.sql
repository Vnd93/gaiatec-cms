-- EV2.7 — releases compostos, inbox colaborativa e operações em massa atômicas.
-- Migration estritamente aditiva/default-off. Nenhum conteúdo ou usuário real é criado.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:releases.edit', 'Montar e validar releases compostos.', false),
  ('cms:releases.approve', 'Aprovar release composto com segregação de função.', true),
  ('cms:releases.publish', 'Publicar release composto aprovado.', true),
  ('cms:collaboration.read', 'Consultar inbox, tarefas e comentários editoriais.', false),
  ('cms:collaboration.comment', 'Criar comentários editoriais ancorados.', false),
  ('cms:collaboration.assign', 'Criar e atribuir tarefas editoriais.', false),
  ('cms:collaboration.resolve', 'Resolver e reabrir tarefas editoriais.', false),
  ('cms:collaboration.views', 'Salvar visões privadas da inbox.', false),
  ('cms:bulk.read', 'Consultar jobs e recibos de operações em massa.', false),
  ('cms:bulk.dry_run', 'Simular operação em massa sem alterar o domínio.', false),
  ('cms:bulk.execute', 'Executar operação em massa previamente validada.', true),
  ('cms:bulk.cancel', 'Cancelar operação em massa ainda não executada.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, permission_key
from (values ('super_admin'), ('admin')) as roles(role_key)
cross join public.cms_permissions
where permission_key in (
  'cms:releases.edit', 'cms:releases.approve', 'cms:releases.publish',
  'cms:collaboration.read', 'cms:collaboration.comment', 'cms:collaboration.assign',
  'cms:collaboration.resolve', 'cms:collaboration.views', 'cms:bulk.read',
  'cms:bulk.dry_run', 'cms:bulk.execute', 'cms:bulk.cancel'
)
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('editor', 'cms:releases.read'),
  ('editor', 'cms:releases.create'),
  ('marketing', 'cms:releases.read'),
  ('marketing', 'cms:releases.create'),
  ('commercial', 'cms:releases.read'),
  ('commercial', 'cms:releases.create'),
  ('technical', 'cms:releases.read'),
  ('technical', 'cms:releases.create'),
  ('reviewer', 'cms:releases.edit'),
  ('reviewer', 'cms:releases.approve'),
  ('reviewer', 'cms:collaboration.read'),
  ('reviewer', 'cms:collaboration.comment'),
  ('reviewer', 'cms:collaboration.assign'),
  ('reviewer', 'cms:collaboration.resolve'),
  ('reviewer', 'cms:collaboration.views'),
  ('editor', 'cms:releases.edit'),
  ('editor', 'cms:collaboration.read'),
  ('editor', 'cms:collaboration.comment'),
  ('editor', 'cms:collaboration.assign'),
  ('editor', 'cms:collaboration.resolve'),
  ('editor', 'cms:collaboration.views'),
  ('editor', 'cms:bulk.read'),
  ('editor', 'cms:bulk.dry_run'),
  ('marketing', 'cms:releases.edit'),
  ('marketing', 'cms:collaboration.read'),
  ('marketing', 'cms:collaboration.comment'),
  ('marketing', 'cms:collaboration.assign'),
  ('marketing', 'cms:collaboration.resolve'),
  ('marketing', 'cms:collaboration.views'),
  ('marketing', 'cms:bulk.read'),
  ('marketing', 'cms:bulk.dry_run'),
  ('commercial', 'cms:releases.edit'),
  ('commercial', 'cms:collaboration.read'),
  ('commercial', 'cms:collaboration.comment'),
  ('commercial', 'cms:collaboration.assign'),
  ('commercial', 'cms:collaboration.resolve'),
  ('commercial', 'cms:collaboration.views'),
  ('commercial', 'cms:bulk.read'),
  ('commercial', 'cms:bulk.dry_run'),
  ('technical', 'cms:releases.edit'),
  ('technical', 'cms:collaboration.read'),
  ('technical', 'cms:collaboration.comment'),
  ('technical', 'cms:collaboration.assign'),
  ('technical', 'cms:collaboration.resolve'),
  ('technical', 'cms:collaboration.views'),
  ('technical', 'cms:bulk.read'),
  ('technical', 'cms:bulk.dry_run')
on conflict do nothing;

alter table public.cms_release_packages
  add column title text not null default 'Release sem título'
    check (char_length(btrim(title)) between 3 and 160),
  add column scheduled_for timestamptz,
  add column approved_at timestamptz,
  add column published_at timestamptz,
  add column failed_at timestamptz,
  add column compensated_at timestamptz,
  add column last_error_code text
    check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{1,63}$');

alter table public.cms_release_packages
  drop constraint if exists cms_release_packages_status_check;
alter table public.cms_release_packages
  add constraint cms_release_packages_status_check check (status in (
    'draft', 'validated', 'ready_for_review', 'approved', 'scheduled',
    'published', 'failed', 'canceled', 'rolled_back'
  ));

alter table public.cms_release_events
  drop constraint if exists cms_release_events_event_type_check;
alter table public.cms_release_events
  add constraint cms_release_events_event_type_check check (event_type in (
    'created', 'item_added', 'validated', 'submitted', 'approved', 'scheduled',
    'published', 'failed', 'canceled', 'rollback_started', 'rolled_back'
  ));

create table public.cms_release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  revision_id uuid not null,
  content_type text not null,
  slug text not null,
  operation text not null default 'publish' check (operation = 'publish'),
  position integer not null check (position between 1 and 500),
  dependency_ids uuid[] not null default '{}'::uuid[],
  frozen_hash text not null check (frozen_hash ~ '^[0-9a-f]{64}$'),
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'passed', 'failed')),
  added_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  added_at timestamptz not null default now(),
  unique (release_id, item_id),
  unique (release_id, position),
  foreign key (revision_id, item_id)
    references public.cms_content_revisions (id, item_id) on delete restrict
);

create table public.cms_release_validation_runs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('passed', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  validated_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  correlation_id uuid not null,
  validated_at timestamptz not null default now()
);

create table public.cms_release_validations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cms_release_validation_runs (id) on delete restrict,
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  release_item_id uuid references public.cms_release_items (id) on delete restrict,
  validation_key text not null check (validation_key ~ '^[a-z][a-z0-9_.]{1,95}$'),
  severity text not null check (severity in ('error', 'warning', 'info')),
  status text not null check (status in ('passed', 'failed')),
  field_path text,
  message text not null check (char_length(message) between 3 and 500),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create table public.cms_release_approvals (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  validation_run_id uuid not null references public.cms_release_validation_runs (id) on delete restrict,
  approver_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (release_id, approver_id, plan_hash),
  check (expires_at > created_at)
);

create table public.cms_release_snapshots (
  release_id uuid not null references public.cms_release_packages (id) on delete restrict,
  release_item_id uuid not null references public.cms_release_items (id) on delete restrict,
  item_id uuid not null references public.cms_content_items (id) on delete restrict,
  previous_workflow_status text not null,
  previous_projection jsonb,
  previous_publication jsonb,
  previous_route_rules jsonb not null default '[]'::jsonb
    check (jsonb_typeof(previous_route_rules) = 'array'),
  captured_at timestamptz not null default now(),
  primary key (release_id, item_id),
  unique (release_id, release_item_id),
  check (previous_projection is null or jsonb_typeof(previous_projection) = 'object'),
  check (previous_publication is null or jsonb_typeof(previous_publication) = 'object')
);

create table public.cms_work_tasks (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  source_kind text not null check (source_kind in (
    'manual', 'review', 'comment', 'quality', 'release', 'release_validation', 'delivery_failure'
  )),
  source_id uuid,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  anchor jsonb not null check (jsonb_typeof(anchor) = 'object'),
  assigned_to uuid references public.cms_profiles (user_id) on delete restrict,
  due_at timestamptz,
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null))
);

create table public.cms_work_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cms_work_tasks (id) on delete restrict,
  parent_comment_id uuid references public.cms_work_comments (id) on delete restrict,
  author_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  anchor jsonb not null check (jsonb_typeof(anchor) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.cms_work_mentions (
  comment_id uuid not null references public.cms_work_comments (id) on delete restrict,
  mentioned_user_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivered', 'failed')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id),
  check ((delivery_status = 'delivered') = (delivered_at is not null))
);

create table public.cms_saved_inbox_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  sort jsonb not null default '{"field":"updated_at","direction":"desc"}'::jsonb
    check (jsonb_typeof(sort) = 'object'),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.cms_work_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cms_work_tasks (id) on delete restrict,
  actor_id uuid references public.cms_profiles (user_id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'assigned', 'commented', 'resolved', 'reopened', 'status_changed'
  )),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create table public.cms_collaboration_outbox (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cms_work_tasks (id) on delete restrict,
  comment_id uuid references public.cms_work_comments (id) on delete restrict,
  recipient_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  event_type text not null check (event_type in ('task_assigned', 'mentioned', 'release_failed')),
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.cms_bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  site_key text not null default 'main' check (site_key = 'main'),
  environment text not null check (environment in ('local', 'staging')),
  operation text not null check (operation in ('add_to_release', 'assign_tasks', 'resolve_tasks')),
  status text not null default 'validating'
    check (status in ('validating', 'validated', 'running', 'completed', 'failed', 'canceled')),
  atomic boolean not null default true check (atomic is true),
  target_count integer not null check (target_count between 1 and 500),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  dry_run_report jsonb not null default '{}'::jsonb check (jsonb_typeof(dry_run_report) = 'object'),
  lock_version bigint not null default 1 check (lock_version > 0),
  requested_by uuid not null references public.cms_profiles (user_id) on delete restrict,
  executed_by uuid references public.cms_profiles (user_id) on delete restrict,
  correlation_id uuid not null,
  started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_bulk_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cms_bulk_jobs (id) on delete restrict,
  position integer not null check (position between 1 and 500),
  target_type text not null check (target_type in ('content_item', 'work_task')),
  target_id uuid not null,
  expected_version bigint,
  requested_change jsonb not null default '{}'::jsonb check (jsonb_typeof(requested_change) = 'object'),
  validation_status text not null check (validation_status in ('valid', 'error')),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  before_snapshot jsonb,
  result jsonb,
  executed_at timestamptz,
  unique (job_id, position),
  check (before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'),
  check (result is null or jsonb_typeof(result) = 'object')
);

create table public.cms_ev2_command_receipts (
  actor_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  domain text not null check (domain in ('release', 'collaboration', 'bulk')),
  action text not null check (action ~ '^[a-z][a-z0-9_]{1,63}$'),
  idempotency_key uuid not null,
  command_id uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, domain, action, idempotency_key)
);

create index cms_release_items_release_idx on public.cms_release_items (release_id, position);
create index cms_release_validation_runs_idx on public.cms_release_validation_runs (release_id, validated_at desc);
create index cms_release_validations_run_idx on public.cms_release_validations (run_id, status, severity);
create index cms_release_approvals_current_idx on public.cms_release_approvals (release_id, created_at desc, expires_at);
create index cms_work_tasks_inbox_idx on public.cms_work_tasks (assigned_to, status, priority, due_at, updated_at desc);
create unique index cms_work_tasks_source_open_idx on public.cms_work_tasks (source_kind, source_id)
  where source_id is not null and status <> 'resolved';
create index cms_work_comments_task_idx on public.cms_work_comments (task_id, created_at);
create index cms_mentions_recipient_idx on public.cms_work_mentions (mentioned_user_id, delivery_status, created_at desc);
create index cms_collaboration_outbox_ready_idx on public.cms_collaboration_outbox (status, available_at)
  where status in ('pending', 'failed');
create unique index cms_collaboration_outbox_mention_once_idx
  on public.cms_collaboration_outbox (comment_id, recipient_id, event_type, channel)
  where comment_id is not null and event_type = 'mentioned';
create index cms_bulk_jobs_actor_idx on public.cms_bulk_jobs (requested_by, status, updated_at desc);
create index cms_bulk_job_items_job_idx on public.cms_bulk_job_items (job_id, position);

create trigger cms_work_tasks_touch_updated_at
before update on public.cms_work_tasks
for each row execute function public.cms_touch_updated_at();
create trigger cms_saved_inbox_views_touch_updated_at
before update on public.cms_saved_inbox_views
for each row execute function public.cms_touch_updated_at();
create trigger cms_bulk_jobs_touch_updated_at
before update on public.cms_bulk_jobs
for each row execute function public.cms_touch_updated_at();
create trigger cms_release_validations_immutable
before update or delete on public.cms_release_validations
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_release_approvals_immutable
before update or delete on public.cms_release_approvals
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_release_snapshots_immutable
before update or delete on public.cms_release_snapshots
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_work_comments_immutable
before update or delete on public.cms_work_comments
for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_work_task_events_immutable
before update or delete on public.cms_work_task_events
for each row execute function public.cms_reject_immutable_mutation();

create function public.cms_ev2_collaboration_enabled(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((public.cms_evaluate_feature_flag(
    p_actor_id,
    'ev2.collaboration_bulk',
    p_environment,
    p_site_key,
    p_aal,
    p_session_id,
    p_issued_at
  ) ->> 'enabled')::boolean, false);
$$;

create function public.cms_release_plan_hash(p_release_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'itemId', item_id,
      'revisionId', revision_id,
      'operation', operation,
      'position', position,
      'dependencies', dependency_ids,
      'frozenHash', frozen_hash
    ) order by position
  ), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
  from public.cms_release_items
  where release_id = p_release_id;
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
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.cms_actor_authorized(p_actor_id, 'cms:releases.read', p_aal, p_session_id, p_issued_at)
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_RELEASE_V2_FORBIDDEN' using errcode = '42501';
  end if;

  if p_release_id is null then
    select jsonb_build_object(
      'schemaVersion', 2,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'releaseId', r.id,
        'title', r.title,
        'status', r.status,
        'planHash', r.plan_hash,
        'lockVersion', r.lock_version,
        'scheduledFor', r.scheduled_for,
        'approvedAt', r.approved_at,
        'publishedAt', r.published_at,
        'updatedAt', r.updated_at,
        'itemCount', (select count(*) from public.cms_release_items i where i.release_id = r.id)
      ) order by r.updated_at desc), '[]'::jsonb)
    ) into v_result
    from (
      select * from public.cms_release_packages
      where environment = p_environment and site_key = p_site_key
      order by updated_at desc limit 50
    ) r;
    return v_result;
  end if;

  select jsonb_build_object(
    'schemaVersion', 2,
    'releaseId', r.id,
    'title', r.title,
    'reason', r.reason,
    'status', r.status,
    'planHash', r.plan_hash,
    'lockVersion', r.lock_version,
    'scheduledFor', r.scheduled_for,
    'approvedAt', r.approved_at,
    'publishedAt', r.published_at,
    'updatedAt', r.updated_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'itemId', i.item_id,
      'revisionId', i.revision_id,
      'contentType', i.content_type,
      'slug', i.slug,
      'position', i.position,
      'dependencies', i.dependency_ids,
      'frozenHash', i.frozen_hash,
      'validationStatus', i.validation_status,
      'diff', jsonb_build_object(
        'fromRevisionId', projection.revision_id,
        'toRevisionId', i.revision_id,
        'changedFields', coalesce((select jsonb_agg(fields.field_key order by fields.field_key)
          from (
            select jsonb_object_keys(coalesce(projection.payload, '{}'::jsonb)) as field_key
            union
            select jsonb_object_keys(revision.payload) as field_key
          ) fields
          where projection.payload -> fields.field_key is distinct from revision.payload -> fields.field_key
        ), '[]'::jsonb),
        'seoChanged', projection.seo is distinct from revision.seo
      )
    ) order by i.position)
      from public.cms_release_items i
      join public.cms_content_revisions revision
        on revision.id = i.revision_id and revision.item_id = i.item_id
      left join public.cms_published_projection projection on projection.item_id = i.item_id
      where i.release_id = r.id), '[]'::jsonb),
    'validations', coalesce((select jsonb_agg(jsonb_build_object(
      'validationKey', v.validation_key,
      'severity', v.severity,
      'status', v.status,
      'fieldPath', v.field_path,
      'message', v.message,
      'createdAt', v.created_at
    ) order by v.created_at, v.validation_key)
      from public.cms_release_validations v
      where v.run_id = (select id from public.cms_release_validation_runs
        where release_id = r.id order by validated_at desc limit 1)), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object(
      'approverId', a.approver_id,
      'decision', a.decision,
      'reason', a.reason,
      'expiresAt', a.expires_at,
      'createdAt', a.created_at
    ) order by a.created_at desc) from public.cms_release_approvals a where a.release_id = r.id), '[]'::jsonb)
  ) into v_result
  from public.cms_release_packages r
  where r.id = p_release_id and r.environment = p_environment and r.site_key = p_site_key;
  if v_result is null then raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_result;
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
set search_path = public, extensions, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_ev2_command_receipts%rowtype;
  v_release public.cms_release_packages%rowtype;
  v_release_item public.cms_release_items%rowtype;
  v_item record;
  v_snapshot public.cms_release_snapshots%rowtype;
  v_release_id uuid;
  v_revision_id uuid;
  v_expected_version bigint;
  v_position integer;
  v_frozen_hash text;
  v_plan_hash text;
  v_consumer_id text;
  v_renderer_key text;
  v_content_version bigint;
  v_cache_tag text;
  v_etag text;
  v_validation_run_id uuid;
  v_failure_count integer := 0;
  v_warning_count integer := 0;
  v_approval_expires timestamptz;
  v_schedule timestamptz;
  v_response jsonb;
  v_from_status text;
  v_previous_revision_id uuid;
begin
  if p_action not in ('create', 'add_item', 'validate', 'submit', 'approve', 'schedule', 'publish', 'cancel', 'rollback')
     or p_environment not in ('local', 'staging')
     or p_site_key <> 'main'
     or jsonb_typeof(p_payload) <> 'object'
     or p_command_id is null
     or p_idempotency_key is null
     or p_correlation_id is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_permission := case p_action
    when 'create' then 'cms:releases.create'
    when 'add_item' then 'cms:releases.edit'
    when 'validate' then 'cms:releases.edit'
    when 'submit' then 'cms:releases.edit'
    when 'approve' then 'cms:releases.approve'
    when 'schedule' then 'cms:releases.publish'
    when 'publish' then 'cms:releases.publish'
    when 'cancel' then 'cms:releases.cancel'
    when 'rollback' then 'cms:releases.rollback'
  end;
  if not public.cms_actor_authorized(p_actor_id, v_permission, p_aal, p_session_id, p_issued_at)
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_RELEASE_V2_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_receipt
  from public.cms_ev2_command_receipts
  where actor_id = p_actor_id
    and domain = 'release'
    and action = p_action
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_RELEASE_V2_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_RELEASE_V2_IN_PROGRESS' using errcode = '40001';
    end if;
    return v_receipt.response;
  end if;

  insert into public.cms_ev2_command_receipts (
    actor_id, domain, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, 'release', p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  );

  if p_action = 'create' then
    if char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 3 and 160
       or char_length(btrim(coalesce(p_payload ->> 'reason', ''))) not between 3 and 500 then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_release_packages (
      site_key, environment, status, title, plan_hash, reason,
      created_by, updated_by, correlation_id
    ) values (
      p_site_key,
      p_environment,
      'draft',
      btrim(p_payload ->> 'title'),
      encode(extensions.digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
      btrim(p_payload ->> 'reason'),
      p_actor_id,
      p_actor_id,
      p_correlation_id
    ) returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'created', 'draft', jsonb_build_object('schemaVersion', 2), p_correlation_id
    );
  else
    begin
      v_release_id := (p_payload ->> 'releaseId')::uuid;
      v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    if v_release_id is null or v_expected_version is null then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    select * into v_release
    from public.cms_release_packages
    where id = v_release_id and environment = p_environment and site_key = p_site_key
    for update;
    if not found then raise exception 'CMS_RELEASE_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_release.lock_version <> v_expected_version then
      raise exception 'CMS_RELEASE_V2_CONFLICT' using errcode = '40001';
    end if;
  end if;

  if p_action = 'add_item' then
    if v_release.status <> 'draft' then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    begin
      v_revision_id := (p_payload ->> 'revisionId')::uuid;
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    select i.id, i.content_type, i.slug, i.workflow_status,
      r.id as revision_id, r.payload, r.seo, r.schema_version, r.created_by as revision_created_by
    into v_item
    from public.cms_content_items i
    join public.cms_content_revisions r on r.item_id = i.id
    where i.id = (p_payload ->> 'itemId')::uuid and r.id = v_revision_id
    for update of i;
    if not found then raise exception 'CMS_RELEASE_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
    if not public.cms_actor_authorized(
      p_actor_id,
      public.cms_content_permission(v_item.content_type, 'read'),
      p_aal,
      p_session_id,
      p_issued_at
    ) then
      raise exception 'CMS_RELEASE_ITEM_READ_FORBIDDEN' using errcode = '42501';
    end if;
    if v_item.workflow_status <> 'approved' then
      raise exception 'CMS_RELEASE_ITEM_NOT_APPROVED' using errcode = '23514';
    end if;
    v_frozen_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'itemId', v_item.id,
      'revisionId', v_item.revision_id,
      'contentType', v_item.content_type,
      'slug', v_item.slug,
      'schemaVersion', v_item.schema_version,
      'payload', v_item.payload,
      'seo', v_item.seo
    )::text, 'UTF8'), 'sha256'), 'hex');
    select coalesce(max(position), 0) + 1 into v_position
    from public.cms_release_items where release_id = v_release.id;
    if v_position > 500 then raise exception 'CMS_RELEASE_ITEM_LIMIT' using errcode = '54000'; end if;
    insert into public.cms_release_items (
      release_id, item_id, revision_id, content_type, slug, position,
      dependency_ids, frozen_hash, added_by
    ) values (
      v_release.id,
      v_item.id,
      v_item.revision_id,
      v_item.content_type,
      v_item.slug,
      v_position,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'dependencyIds', '[]'::jsonb))::uuid), '{}'::uuid[]),
      v_frozen_hash,
      p_actor_id
    ) returning * into v_release_item;
    v_plan_hash := public.cms_release_plan_hash(v_release.id);
    update public.cms_release_packages
    set plan_hash = v_plan_hash, lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'item_added', 'draft', 'draft',
      jsonb_build_object('itemId', v_item.id, 'revisionId', v_item.revision_id, 'position', v_position),
      p_correlation_id
    );
  elsif p_action = 'validate' then
    if v_release.status not in ('draft', 'validated')
       or not exists (select 1 from public.cms_release_items where release_id = v_release.id) then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_plan_hash := public.cms_release_plan_hash(v_release.id);
    if v_plan_hash <> v_release.plan_hash then
      raise exception 'CMS_RELEASE_PLAN_CHANGED' using errcode = '40001';
    end if;
    insert into public.cms_release_validation_runs (
      release_id, plan_hash, status, validated_by, correlation_id
    ) values (
      v_release.id, v_plan_hash, 'failed', p_actor_id, p_correlation_id
    ) returning id into v_validation_run_id;

    for v_item in
      select ri.*, ci.workflow_status, ci.slug as current_slug,
        ci.content_type as current_content_type, cr.payload, cr.seo, cr.schema_version,
        cr.created_by as revision_created_by
      from public.cms_release_items ri
      join public.cms_content_items ci on ci.id = ri.item_id
      join public.cms_content_revisions cr on cr.id = ri.revision_id and cr.item_id = ri.item_id
      where ri.release_id = v_release.id
      order by ri.position
    loop
      v_frozen_hash := encode(extensions.digest(convert_to(jsonb_build_object(
        'itemId', v_item.item_id,
        'revisionId', v_item.revision_id,
        'contentType', v_item.current_content_type,
        'slug', v_item.current_slug,
        'schemaVersion', v_item.schema_version,
        'payload', v_item.payload,
        'seo', v_item.seo
      )::text, 'UTF8'), 'sha256'), 'hex');

      if v_item.workflow_status <> 'approved' then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'workflow.approved', 'error', 'failed',
          'workflow_status', 'O item precisa estar aprovado antes de entrar no release.'
        );
        v_failure_count := v_failure_count + 1;
      elsif not public.cms_actor_authorized(
        p_actor_id,
        public.cms_content_permission(v_item.content_type, 'read'),
        p_aal,
        p_session_id,
        p_issued_at
      ) then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'permission.read', 'error', 'failed',
          'permission', 'O operador não pode consultar este tipo de conteúdo.'
        );
        v_failure_count := v_failure_count + 1;
      elsif v_frozen_hash <> v_item.frozen_hash then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'revision.frozen_hash', 'error', 'failed',
          'revision', 'A revisão congelada divergiu do plano; remonte o release.'
        );
        v_failure_count := v_failure_count + 1;
      elsif not exists (
        select 1 from public.cms_content_approvals approval
        where approval.item_id = v_item.item_id
          and approval.revision_id = v_item.revision_id
          and approval.decision = 'approved'
          and approval.reviewer_id <> v_item.revision_created_by
      ) then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'approval.segregated', 'error', 'failed',
          'approval', 'A revisão exige aprovação por pessoa diferente do autor.'
        );
        v_failure_count := v_failure_count + 1;
      elsif exists (
        select 1 from unnest(v_item.dependency_ids) dependency_id
        where not exists (
          select 1 from public.cms_release_items dependency
          where dependency.release_id = v_release.id and dependency.item_id = dependency_id
        )
      ) then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'dependency.complete', 'error', 'failed',
          'dependencies', 'Há dependência obrigatória fora do release.'
        );
        v_failure_count := v_failure_count + 1;
      elsif exists (
        select 1 from unnest(v_item.dependency_ids) dependency_id
        join public.cms_release_items dependency
          on dependency.release_id = v_release.id and dependency.item_id = dependency_id
        where dependency.position >= v_item.position
      ) then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'dependency.order', 'error', 'failed',
          'dependencies', 'Cada dependência precisa aparecer antes do consumidor no pacote.'
        );
        v_failure_count := v_failure_count + 1;
      elsif exists (
        select 1 from (
          select status from public.cms_quality_runs
          where item_id = v_item.item_id and revision_id = v_item.revision_id
          order by checked_at desc limit 1
        ) latest where latest.status = 'blocked'
      ) then
        insert into public.cms_release_validations (
          run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
        ) values (
          v_validation_run_id, v_release.id, v_item.id, 'quality.blocking', 'error', 'failed',
          'quality', 'O Centro de Qualidade mantém erro bloqueante para esta revisão.'
        );
        v_failure_count := v_failure_count + 1;
      else
        begin
          perform public.cms_validate_registered_content(v_item.content_type, v_item.schema_version, v_item.payload);
          insert into public.cms_release_validations (
            run_id, release_id, release_item_id, validation_key, severity, status, field_path, message
          ) values (
            v_validation_run_id, v_release.id, v_item.id, 'contract.registered', 'info', 'passed',
            'payload', 'Contrato, revisão, aprovação e dependências estão íntegros.'
          );
          update public.cms_release_items set validation_status = 'passed' where id = v_item.id;
        exception when others then
          insert into public.cms_release_validations (
            run_id, release_id, release_item_id, validation_key, severity, status, field_path, message,
            evidence
          ) values (
            v_validation_run_id, v_release.id, v_item.id, 'contract.registered', 'error', 'failed',
            'payload', 'A revisão não atende ao contrato de conteúdo registrado.',
            jsonb_build_object('sqlstate', sqlstate)
          );
          update public.cms_release_items set validation_status = 'failed' where id = v_item.id;
          v_failure_count := v_failure_count + 1;
        end;
      end if;
      if v_failure_count > 0 and not exists (
        select 1 from public.cms_release_validations
        where run_id = v_validation_run_id and release_item_id = v_item.id and status = 'passed'
      ) then
        update public.cms_release_items set validation_status = 'failed' where id = v_item.id;
      end if;
    end loop;

    update public.cms_release_validation_runs
    set status = case when v_failure_count = 0 then 'passed' else 'failed' end,
      failure_count = v_failure_count,
      warning_count = v_warning_count
    where id = v_validation_run_id;
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = case when v_failure_count = 0 then 'validated' else 'draft' end,
      lock_version = lock_version + 1,
      updated_by = p_actor_id,
      last_error_code = case when v_failure_count = 0 then null else 'release_validation_failed' end
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'validated', v_from_status, v_release.status,
      jsonb_build_object('runId', v_validation_run_id, 'failureCount', v_failure_count), p_correlation_id
    );
    if v_failure_count > 0 then
      insert into public.cms_work_tasks (
        source_kind, source_id, title, description, priority, anchor, assigned_to, created_by, updated_by
      ) values (
        'release_validation', v_release.id, 'Corrigir validação do release',
        'O release possui itens bloqueados. Abra o pacote para navegar até cada validação.',
        'high', jsonb_build_object('releaseId', v_release.id, 'validationRunId', v_validation_run_id),
        v_release.created_by, p_actor_id, p_actor_id
      ) on conflict do nothing;
    end if;
  elsif p_action = 'submit' then
    if v_release.status <> 'validated' then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = 'ready_for_review', lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'submitted', v_from_status, v_release.status,
      jsonb_build_object('planHash', v_release.plan_hash), p_correlation_id
    );
  elsif p_action = 'approve' then
    if v_release.status <> 'ready_for_review' or v_release.created_by = p_actor_id
       or exists (
         select 1 from public.cms_release_items ri
         join public.cms_content_revisions cr on cr.id = ri.revision_id
         where ri.release_id = v_release.id and cr.created_by = p_actor_id
       ) then
      raise exception 'CMS_RELEASE_SEGREGATION_CONFLICT' using errcode = '23514';
    end if;
    select id into v_validation_run_id
    from public.cms_release_validation_runs
    where release_id = v_release.id and plan_hash = v_release.plan_hash and status = 'passed'
    order by validated_at desc limit 1;
    if v_validation_run_id is null then
      raise exception 'CMS_RELEASE_VALIDATION_REQUIRED' using errcode = '23514';
    end if;
    begin
      v_approval_expires := coalesce((p_payload ->> 'expiresAt')::timestamptz, now() + interval '4 hours');
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    if v_approval_expires < now() + interval '5 minutes'
       or v_approval_expires > now() + interval '24 hours'
       or char_length(btrim(coalesce(p_payload ->> 'reason', ''))) not between 3 and 500 then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_release_approvals (
      release_id, validation_run_id, approver_id, decision, reason,
      plan_hash, expires_at, correlation_id
    ) values (
      v_release.id, v_validation_run_id, p_actor_id, 'approved', btrim(p_payload ->> 'reason'),
      v_release.plan_hash, v_approval_expires, p_correlation_id
    );
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = 'approved', approved_at = now(), lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'approved', v_from_status, v_release.status,
      jsonb_build_object('expiresAt', v_approval_expires, 'planHash', v_release.plan_hash), p_correlation_id
    );
  elsif p_action = 'schedule' then
    begin
      v_schedule := (p_payload ->> 'scheduledFor')::timestamptz;
    exception when others then
      raise exception 'CMS_RELEASE_V2_COMMAND_INVALID' using errcode = '22023';
    end;
    if v_release.status <> 'approved' or v_schedule <= now() or v_schedule > now() + interval '90 days' then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = 'scheduled', scheduled_for = v_schedule, lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'scheduled', v_from_status, v_release.status,
      jsonb_build_object('scheduledFor', v_schedule), p_correlation_id
    );
  elsif p_action = 'publish' then
    if v_release.status not in ('approved', 'scheduled')
       or (v_release.status = 'scheduled' and v_release.scheduled_for > now())
       or public.cms_release_plan_hash(v_release.id) <> v_release.plan_hash
       or not exists (
         select 1 from public.cms_release_approvals a
         where a.release_id = v_release.id and a.plan_hash = v_release.plan_hash
           and a.decision = 'approved' and a.expires_at > now()
       )
       or exists (
         select 1 from public.cms_release_items
         where release_id = v_release.id and validation_status <> 'passed'
       ) then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;

    perform 1
    from public.cms_content_items ci
    join public.cms_release_items ri on ri.item_id = ci.id
    where ri.release_id = v_release.id
    order by ci.id
    for update of ci;
    for v_item in
      select ri.*, ci.workflow_status, ci.slug as current_slug,
        ci.content_type as current_content_type, cr.payload, cr.seo, cr.schema_version,
        cr.created_by as revision_created_by
      from public.cms_release_items ri
      join public.cms_content_items ci on ci.id = ri.item_id
      join public.cms_content_revisions cr on cr.id = ri.revision_id and cr.item_id = ri.item_id
      where ri.release_id = v_release.id
      order by ri.position
    loop
      if v_item.workflow_status <> 'approved' then
        raise exception 'CMS_RELEASE_ITEM_NOT_APPROVED' using errcode = '23514';
      end if;
      if not public.cms_actor_authorized(
        p_actor_id,
        public.cms_content_permission(v_item.current_content_type, 'publish'),
        p_aal,
        p_session_id,
        p_issued_at
      ) then
        raise exception 'CMS_RELEASE_ITEM_PUBLISH_FORBIDDEN' using errcode = '42501';
      end if;
      v_frozen_hash := encode(extensions.digest(convert_to(jsonb_build_object(
        'itemId', v_item.item_id, 'revisionId', v_item.revision_id,
        'contentType', v_item.current_content_type, 'slug', v_item.current_slug,
        'schemaVersion', v_item.schema_version, 'payload', v_item.payload, 'seo', v_item.seo
      )::text, 'UTF8'), 'sha256'), 'hex');
      if v_frozen_hash <> v_item.frozen_hash then
        raise exception 'CMS_RELEASE_PLAN_CHANGED' using errcode = '40001';
      end if;
      if not exists (
           select 1 from public.cms_content_approvals approval
           where approval.item_id = v_item.item_id
             and approval.revision_id = v_item.revision_id
             and approval.decision = 'approved'
             and approval.reviewer_id <> v_item.revision_created_by
         ) or exists (
           select 1 from (
             select status from public.cms_quality_runs
             where item_id = v_item.item_id and revision_id = v_item.revision_id
             order by checked_at desc limit 1
           ) latest where latest.status = 'blocked'
         ) then
        raise exception 'CMS_RELEASE_ITEM_GATE_CHANGED' using errcode = '23514';
      end if;

      insert into public.cms_release_snapshots (
        release_id, release_item_id, item_id, previous_workflow_status,
        previous_projection, previous_publication, previous_route_rules
      ) values (
        v_release.id,
        v_item.id,
        v_item.item_id,
        case when exists (
          select 1 from public.cms_published_projection current_projection
          where current_projection.item_id = v_item.item_id
        ) then 'published' else v_item.workflow_status end,
        (select to_jsonb(p) from public.cms_published_projection p where p.item_id = v_item.item_id),
        (select to_jsonb(p) from public.cms_publications p where p.item_id = v_item.item_id),
        coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
          from public.cms_route_rules r where r.item_id = v_item.item_id), '[]'::jsonb)
      );

      v_consumer_id := public.cms_validate_registered_content(
        v_item.content_type, v_item.schema_version, v_item.payload
      );
      select renderer_key into v_renderer_key
      from public.cms_capability_registry where consumer_id = v_consumer_id;
      select coalesce(content_version, 0) + 1 into v_content_version
      from public.cms_published_projection where item_id = v_item.item_id;
      v_content_version := coalesce(v_content_version, 1);
      v_cache_tag := 'cms:' || v_item.content_type || ':' || v_item.item_id;
      v_etag := '"' || encode(extensions.digest(convert_to(
        v_item.revision_id::text || ':' || v_content_version::text, 'UTF8'
      ), 'sha256'), 'hex') || '"';

      insert into public.cms_published_projection (
        item_id, revision_id, content_type, slug, schema_version, consumer_id,
        renderer_key, payload, seo, content_version, cache_tag, etag, published_at
      ) values (
        v_item.item_id, v_item.revision_id, v_item.content_type, v_item.slug,
        v_item.schema_version, v_consumer_id, v_renderer_key, v_item.payload, v_item.seo,
        v_content_version, v_cache_tag, v_etag, now()
      ) on conflict (item_id) do update set
        revision_id = excluded.revision_id,
        content_type = excluded.content_type,
        slug = excluded.slug,
        schema_version = excluded.schema_version,
        consumer_id = excluded.consumer_id,
        renderer_key = excluded.renderer_key,
        payload = excluded.payload,
        seo = excluded.seo,
        content_version = excluded.content_version,
        cache_tag = excluded.cache_tag,
        etag = excluded.etag,
        published_at = excluded.published_at;
      insert into public.cms_publications (item_id, revision_id, cache_tag, published_by, published_at)
      values (v_item.item_id, v_item.revision_id, v_cache_tag, p_actor_id, now())
      on conflict (item_id) do update set
        revision_id = excluded.revision_id,
        cache_tag = excluded.cache_tag,
        published_by = excluded.published_by,
        published_at = excluded.published_at;
      insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
      values (v_item.item_id, v_item.revision_id, 'publish', p_correlation_id)
      on conflict do nothing;
      update public.cms_content_items
      set workflow_status = 'published', scheduled_for = null, archived_at = null,
        updated_by = p_actor_id, updated_at = now()
      where id = v_item.item_id;
    end loop;
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = 'published', published_at = now(), scheduled_for = null,
      lock_version = lock_version + 1, updated_by = p_actor_id, last_error_code = null
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'published', v_from_status, v_release.status,
      jsonb_build_object('planHash', v_release.plan_hash, 'atomic', true,
        'itemCount', (select count(*) from public.cms_release_items where release_id = v_release.id)),
      p_correlation_id
    );
  elsif p_action = 'rollback' then
    if v_release.status <> 'published'
       or not exists (select 1 from public.cms_release_snapshots where release_id = v_release.id) then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'rollback_started', 'published', 'published',
      jsonb_build_object('atomic', true), p_correlation_id
    );
    for v_snapshot in
      select * from public.cms_release_snapshots where release_id = v_release.id order by item_id
    loop
      select revision_id into v_revision_id
      from public.cms_release_items
      where release_id = v_release.id and item_id = v_snapshot.item_id;
      delete from public.cms_route_rules where item_id = v_snapshot.item_id;
      delete from public.cms_publications where item_id = v_snapshot.item_id;
      delete from public.cms_published_projection where item_id = v_snapshot.item_id;
      if v_snapshot.previous_projection is not null then
        insert into public.cms_published_projection
        select * from jsonb_populate_record(null::public.cms_published_projection, v_snapshot.previous_projection);
      end if;
      if v_snapshot.previous_publication is not null then
        insert into public.cms_publications
        select * from jsonb_populate_record(null::public.cms_publications, v_snapshot.previous_publication);
        v_previous_revision_id := (v_snapshot.previous_publication ->> 'revision_id')::uuid;
      else
        v_previous_revision_id := null;
      end if;
      if jsonb_array_length(v_snapshot.previous_route_rules) > 0 then
        insert into public.cms_route_rules
        select * from jsonb_populate_recordset(null::public.cms_route_rules, v_snapshot.previous_route_rules);
      end if;
      update public.cms_content_items
      set workflow_status = v_snapshot.previous_workflow_status,
        updated_by = p_actor_id,
        updated_at = now()
      where id = v_snapshot.item_id;
      if v_previous_revision_id is not null then
        insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
        values (v_snapshot.item_id, v_previous_revision_id, 'restore', p_correlation_id)
        on conflict do nothing;
      else
        insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
        values (v_snapshot.item_id, v_revision_id, 'unpublish', p_correlation_id)
        on conflict do nothing;
      end if;
    end loop;
    update public.cms_release_packages
    set status = 'rolled_back', rolled_back_at = now(), compensated_at = now(),
      lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'rolled_back', 'published', 'rolled_back',
      jsonb_build_object('atomic', true, 'rpo', 0), p_correlation_id
    );
  elsif p_action = 'cancel' then
    if v_release.status not in ('draft', 'validated', 'ready_for_review', 'approved', 'scheduled', 'failed') then
      raise exception 'CMS_RELEASE_V2_TRANSITION_INVALID' using errcode = '23514';
    end if;
    v_from_status := v_release.status;
    update public.cms_release_packages
    set status = 'canceled', canceled_at = now(), scheduled_for = null,
      lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_release.id returning * into v_release;
    insert into public.cms_release_events (
      release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
    ) values (
      v_release.id, p_actor_id, 'canceled', v_from_status, 'canceled',
      jsonb_build_object('reason', p_payload ->> 'reason'), p_correlation_id
    );
  end if;

  v_response := jsonb_build_object(
    'schemaVersion', 2,
    'commandId', p_command_id,
    'correlationId', p_correlation_id,
    'releaseId', v_release.id,
    'status', v_release.status,
    'lockVersion', v_release.lock_version,
    'planHash', v_release.plan_hash,
    'validationRunId', v_validation_run_id,
    'failureCount', v_failure_count,
    'atomic', true
  );
  update public.cms_ev2_command_receipts
  set response = v_response, completed_at = now()
  where actor_id = p_actor_id and domain = 'release'
    and action = p_action and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id, 'cms:releases.' || p_action, 'release_package', v_release.id::text,
    jsonb_build_object('status', v_release.status, 'planHash', v_release.plan_hash,
      'lockVersion', v_release.lock_version, 'atomic', true), p_correlation_id
  );
  return v_response;
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
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.cms_actor_authorized(
       p_actor_id, 'cms:collaboration.read', p_aal, p_session_id, p_issued_at
     ) or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'resolved') then
    raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
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
      'commentCount', (select count(*) from public.cms_work_comments c where c.task_id = task.id),
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
    from (select * from public.cms_work_tasks
      where site_key = p_site_key
        and (p_task_id is null or id = p_task_id)
        and (p_status is null or status = p_status)
        and (not p_assigned_to_me or assigned_to = p_actor_id)
      limit least(greatest(p_limit, 1), 100)) task), '[]'::jsonb),
    'savedViews', coalesce((select jsonb_agg(jsonb_build_object(
      'id', view.id, 'name', view.name, 'filters', view.filters,
      'sort', view.sort, 'favorite', view.favorite, 'updatedAt', view.updated_at
    ) order by view.favorite desc, view.name)
    from public.cms_saved_inbox_views view where view.owner_id = p_actor_id), '[]'::jsonb)
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
set search_path = public, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_ev2_command_receipts%rowtype;
  v_task public.cms_work_tasks%rowtype;
  v_comment public.cms_work_comments%rowtype;
  v_view public.cms_saved_inbox_views%rowtype;
  v_task_id uuid;
  v_expected_version bigint;
  v_mention jsonb;
  v_assignee uuid;
  v_response jsonb;
begin
  if p_action not in ('create_task', 'add_comment', 'assign_task', 'resolve_task', 'reopen_task', 'save_view')
     or jsonb_typeof(p_payload) <> 'object'
     or p_environment not in ('local', 'staging') or p_site_key <> 'main'
     or p_command_id is null or p_idempotency_key is null or p_correlation_id is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
  end if;
  v_permission := case
    when p_action = 'add_comment' then 'cms:collaboration.comment'
    when p_action in ('resolve_task', 'reopen_task') then 'cms:collaboration.resolve'
    when p_action = 'save_view' then 'cms:collaboration.views'
    else 'cms:collaboration.assign'
  end;
  if not public.cms_actor_authorized(p_actor_id, v_permission, p_aal, p_session_id, p_issued_at)
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_COLLABORATION_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_receipt from public.cms_ev2_command_receipts
  where actor_id = p_actor_id and domain = 'collaboration' and action = p_action
    and idempotency_key = p_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_COLLABORATION_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_COLLABORATION_IN_PROGRESS' using errcode = '40001';
    end if;
    return v_receipt.response;
  end if;
  insert into public.cms_ev2_command_receipts (
    actor_id, domain, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, 'collaboration', p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  );

  if p_action = 'create_task' then
    begin v_assignee := nullif(p_payload ->> 'assignedTo', '')::uuid;
    exception when others then raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023'; end;
    if char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 3 and 160
       or jsonb_typeof(p_payload -> 'anchor') <> 'object'
       or (v_assignee is not null and not exists (
         select 1 from public.cms_profiles where user_id = v_assignee and status = 'active'
       )) then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_work_tasks (
      source_kind, source_id, title, description, priority, anchor, assigned_to,
      due_at, created_by, updated_by
    ) values (
      coalesce(p_payload ->> 'sourceKind', 'manual'),
      nullif(p_payload ->> 'sourceId', '')::uuid,
      btrim(p_payload ->> 'title'),
      coalesce(p_payload ->> 'description', ''),
      coalesce(p_payload ->> 'priority', 'normal'),
      p_payload -> 'anchor',
      v_assignee,
      nullif(p_payload ->> 'dueAt', '')::timestamptz,
      p_actor_id,
      p_actor_id
    ) returning * into v_task;
    insert into public.cms_work_task_events (
      task_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_task.id, p_actor_id, 'created', jsonb_build_object('assignedTo', v_assignee), p_correlation_id
    );
    if v_assignee is not null and v_assignee <> p_actor_id then
      insert into public.cms_collaboration_outbox (
        task_id, recipient_id, event_type, correlation_id
      ) values (v_task.id, v_assignee, 'task_assigned', p_correlation_id);
    end if;
  else
    begin
      v_task_id := (p_payload ->> 'taskId')::uuid;
      v_expected_version := nullif(p_payload ->> 'expectedVersion', '')::bigint;
    exception when others then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end;
    if p_action <> 'save_view' then
      select * into v_task from public.cms_work_tasks where id = v_task_id for update;
      if not found then raise exception 'CMS_WORK_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    end if;
  end if;

  if p_action = 'add_comment' then
    if jsonb_typeof(coalesce(p_payload -> 'anchor', v_task.anchor)) <> 'object'
       or char_length(btrim(coalesce(p_payload ->> 'body', ''))) not between 1 and 4000 then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_work_comments (
      task_id, parent_comment_id, author_id, body, anchor, correlation_id
    ) values (
      v_task.id, nullif(p_payload ->> 'parentCommentId', '')::uuid, p_actor_id,
      btrim(p_payload ->> 'body'), coalesce(p_payload -> 'anchor', v_task.anchor), p_correlation_id
    ) returning * into v_comment;
    for v_mention in select value from jsonb_array_elements(coalesce(p_payload -> 'mentions', '[]'::jsonb))
    loop
      insert into public.cms_work_mentions (comment_id, mentioned_user_id)
      select v_comment.id, (v_mention #>> '{}')::uuid
      where (v_mention #>> '{}')::uuid <> p_actor_id
        and exists (select 1 from public.cms_profiles
          where user_id = (v_mention #>> '{}')::uuid and status = 'active')
      on conflict do nothing;
      insert into public.cms_collaboration_outbox (
        task_id, comment_id, recipient_id, event_type, correlation_id
      ) select v_task.id, v_comment.id, (v_mention #>> '{}')::uuid, 'mentioned', p_correlation_id
      where (v_mention #>> '{}')::uuid <> p_actor_id
        and exists (select 1 from public.cms_profiles
          where user_id = (v_mention #>> '{}')::uuid and status = 'active')
      on conflict do nothing;
    end loop;
    insert into public.cms_work_task_events (
      task_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_task.id, p_actor_id, 'commented', jsonb_build_object('commentId', v_comment.id), p_correlation_id
    );
    update public.cms_work_tasks set updated_by = p_actor_id where id = v_task.id returning * into v_task;
  elsif p_action = 'assign_task' then
    begin v_assignee := (p_payload ->> 'assignedTo')::uuid;
    exception when others then raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023'; end;
    if v_expected_version is null or v_task.lock_version <> v_expected_version
       or not exists (select 1 from public.cms_profiles where user_id = v_assignee and status = 'active') then
      raise exception 'CMS_WORK_TASK_CONFLICT' using errcode = '40001';
    end if;
    update public.cms_work_tasks set assigned_to = v_assignee,
      status = case when status = 'open' then 'in_progress' else status end,
      lock_version = lock_version + 1, updated_by = p_actor_id
    where id = v_task.id returning * into v_task;
    insert into public.cms_work_task_events (
      task_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_task.id, p_actor_id, 'assigned', jsonb_build_object('assignedTo', v_assignee), p_correlation_id
    );
    if v_assignee <> p_actor_id then
      insert into public.cms_collaboration_outbox (
        task_id, recipient_id, event_type, correlation_id
      ) values (v_task.id, v_assignee, 'task_assigned', p_correlation_id);
    end if;
  elsif p_action in ('resolve_task', 'reopen_task') then
    if v_expected_version is null or v_task.lock_version <> v_expected_version
       or (p_action = 'resolve_task' and v_task.status = 'resolved')
       or (p_action = 'reopen_task' and v_task.status <> 'resolved') then
      raise exception 'CMS_WORK_TASK_CONFLICT' using errcode = '40001';
    end if;
    update public.cms_work_tasks
    set status = case when p_action = 'resolve_task' then 'resolved' else 'open' end,
      resolved_at = case when p_action = 'resolve_task' then now() else null end,
      lock_version = lock_version + 1,
      updated_by = p_actor_id
    where id = v_task.id returning * into v_task;
    insert into public.cms_work_task_events (
      task_id, actor_id, event_type, event_data, correlation_id
    ) values (
      v_task.id, p_actor_id, case when p_action = 'resolve_task' then 'resolved' else 'reopened' end,
      jsonb_build_object('reason', p_payload ->> 'reason'), p_correlation_id
    );
  elsif p_action = 'save_view' then
    if char_length(btrim(coalesce(p_payload ->> 'name', ''))) not between 2 and 80
       or jsonb_typeof(coalesce(p_payload -> 'filters', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(p_payload -> 'sort', '{}'::jsonb)) <> 'object' then
      raise exception 'CMS_COLLABORATION_COMMAND_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_saved_inbox_views (owner_id, name, filters, sort, favorite)
    values (
      p_actor_id, btrim(p_payload ->> 'name'), coalesce(p_payload -> 'filters', '{}'::jsonb),
      coalesce(p_payload -> 'sort', '{"field":"updated_at","direction":"desc"}'::jsonb),
      coalesce((p_payload ->> 'favorite')::boolean, false)
    ) on conflict (owner_id, name) do update set
      filters = excluded.filters, sort = excluded.sort, favorite = excluded.favorite
    returning * into v_view;
  end if;

  v_response := case when p_action = 'save_view' then jsonb_build_object(
    'schemaVersion', 1, 'viewId', v_view.id, 'name', v_view.name,
    'commandId', p_command_id, 'correlationId', p_correlation_id
  ) when p_action = 'add_comment' then jsonb_build_object(
    'schemaVersion', 1, 'taskId', v_task.id, 'commentId', v_comment.id,
    'lockVersion', v_task.lock_version, 'commandId', p_command_id, 'correlationId', p_correlation_id
  ) else jsonb_build_object(
    'schemaVersion', 1, 'taskId', v_task.id, 'status', v_task.status,
    'assignedTo', v_task.assigned_to, 'lockVersion', v_task.lock_version,
    'commandId', p_command_id, 'correlationId', p_correlation_id
  ) end;
  update public.cms_ev2_command_receipts set response = v_response, completed_at = now()
  where actor_id = p_actor_id and domain = 'collaboration'
    and action = p_action and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (
    p_actor_id, 'cms:collaboration.' || p_action,
    case when p_action = 'save_view' then 'saved_inbox_view' else 'work_task' end,
    case when p_action = 'save_view' then v_view.id::text else v_task.id::text end,
    jsonb_build_object('commandId', p_command_id), p_correlation_id
  );
  return v_response;
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
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.cms_actor_authorized(p_actor_id, 'cms:bulk.read', p_aal, p_session_id, p_issued_at)
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object('schemaVersion', 1, 'items', coalesce((select jsonb_agg(
    jsonb_build_object(
      'jobId', job.id, 'operation', job.operation, 'status', job.status,
      'atomic', job.atomic, 'targetCount', job.target_count, 'report', job.dry_run_report,
      'lockVersion', job.lock_version, 'correlationId', job.correlation_id,
      'createdAt', job.created_at, 'updatedAt', job.updated_at
    ) order by job.updated_at desc
  ) from (select * from public.cms_bulk_jobs
    where environment = p_environment and site_key = p_site_key
      and (requested_by = p_actor_id or public.cms_actor_authorized(
        p_actor_id, 'cms:audit.read', p_aal, p_session_id, p_issued_at
      ))
    limit least(greatest(p_limit, 1), 100)) job), '[]'::jsonb));
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
set search_path = public, extensions, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_ev2_command_receipts%rowtype;
  v_job public.cms_bulk_jobs%rowtype;
  v_job_item public.cms_bulk_job_items%rowtype;
  v_release public.cms_release_packages%rowtype;
  v_target jsonb;
  v_target_id uuid;
  v_revision_id uuid;
  v_release_id uuid;
  v_assignee uuid;
  v_expected_version bigint;
  v_release_lock_version bigint;
  v_target_updated_at timestamptz;
  v_target_content_type text;
  v_position integer := 0;
  v_error_count integer := 0;
  v_frozen_hash text;
  v_response jsonb;
begin
  if p_action not in ('dry_run', 'execute', 'cancel')
     or p_environment not in ('local', 'staging') or p_site_key <> 'main'
     or jsonb_typeof(p_payload) <> 'object'
     or p_command_id is null or p_idempotency_key is null or p_correlation_id is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
  end if;
  v_permission := case p_action when 'dry_run' then 'cms:bulk.dry_run'
    when 'execute' then 'cms:bulk.execute' else 'cms:bulk.cancel' end;
  if not public.cms_actor_authorized(p_actor_id, v_permission, p_aal, p_session_id, p_issued_at)
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_receipt from public.cms_ev2_command_receipts
  where actor_id = p_actor_id and domain = 'bulk' and action = p_action
    and idempotency_key = p_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      raise exception 'CMS_BULK_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_receipt.response is null then raise exception 'CMS_BULK_IN_PROGRESS' using errcode = '40001'; end if;
    return v_receipt.response;
  end if;
  insert into public.cms_ev2_command_receipts (
    actor_id, domain, action, idempotency_key, command_id, request_hash, correlation_id
  ) values (
    p_actor_id, 'bulk', p_action, p_idempotency_key, p_command_id, p_request_hash, p_correlation_id
  );

  if p_action = 'dry_run' then
    if coalesce(p_payload ->> 'operation', '') not in ('add_to_release', 'assign_tasks', 'resolve_tasks')
       or jsonb_typeof(p_payload -> 'targets') <> 'array'
       or jsonb_array_length(p_payload -> 'targets') not between 1 and 500
       or char_length(btrim(coalesce(p_payload ->> 'reason', ''))) not between 3 and 500 then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end if;
    begin
      v_release_id := nullif(p_payload #>> '{changes,releaseId}', '')::uuid;
      v_assignee := nullif(p_payload #>> '{changes,assignedTo}', '')::uuid;
    exception when others then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end;
    if p_payload ->> 'operation' = 'add_to_release' then
      select lock_version into v_release_lock_version
      from public.cms_release_packages
      where id = v_release_id and environment = p_environment
        and site_key = p_site_key and status = 'draft';
    end if;
    if (p_payload ->> 'operation' = 'add_to_release' and not public.cms_actor_authorized(
          p_actor_id, 'cms:releases.edit', p_aal, p_session_id, p_issued_at
        ))
       or (p_payload ->> 'operation' = 'assign_tasks' and not public.cms_actor_authorized(
          p_actor_id, 'cms:collaboration.assign', p_aal, p_session_id, p_issued_at
        ))
       or (p_payload ->> 'operation' = 'resolve_tasks' and not public.cms_actor_authorized(
          p_actor_id, 'cms:collaboration.resolve', p_aal, p_session_id, p_issued_at
        )) then
      raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.cms_bulk_jobs (
      environment, operation, target_count, input_hash, reason, requested_by, correlation_id
    ) values (
      p_environment, p_payload ->> 'operation', jsonb_array_length(p_payload -> 'targets'),
      p_request_hash, btrim(p_payload ->> 'reason'), p_actor_id, p_correlation_id
    ) returning * into v_job;

    for v_target in select value from jsonb_array_elements(p_payload -> 'targets')
    loop
      v_position := v_position + 1;
      begin
        v_target_id := (v_target ->> 'id')::uuid;
        v_revision_id := nullif(v_target ->> 'revisionId', '')::uuid;
        v_expected_version := nullif(v_target ->> 'expectedVersion', '')::bigint;
      exception when others then
        raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
      end;
      if p_payload ->> 'operation' = 'add_to_release' then
        v_target_updated_at := null;
        v_target_content_type := null;
        select i.updated_at, i.content_type into v_target_updated_at, v_target_content_type
        from public.cms_content_revisions revision
        join public.cms_content_items i on i.id = revision.item_id
        where i.id = v_target_id and revision.id = v_revision_id
          and i.workflow_status = 'approved';
        if v_release_id is null or v_release_lock_version is null
           or exists (select 1 from public.cms_bulk_job_items duplicate
             where duplicate.job_id = v_job.id and duplicate.target_id = v_target_id)
           or v_target_updated_at is null
           or not public.cms_actor_authorized(
             p_actor_id,
             public.cms_content_permission(v_target_content_type, 'read'),
             p_aal,
             p_session_id,
             p_issued_at
           )
           or exists (select 1 from public.cms_release_items
             where release_id = v_release_id and item_id = v_target_id) then
          v_error_count := v_error_count + 1;
          insert into public.cms_bulk_job_items (
            job_id, position, target_type, target_id, requested_change,
            validation_status, validation_errors
          ) values (
            v_job.id, v_position, 'content_item', v_target_id,
            jsonb_build_object(
              'releaseId', v_release_id,
              'revisionId', v_revision_id,
              'expectedReleaseVersion', v_release_lock_version,
              'expectedUpdatedAt', v_target_updated_at
            ),
            'error', jsonb_build_array(jsonb_build_object(
              'field', 'targets[' || (v_position - 1) || ']',
              'code', 'release_item_invalid',
              'correction', 'Use item aprovado, revisão válida e release em rascunho sem duplicidade.'
            ))
          );
        else
          insert into public.cms_bulk_job_items (
            job_id, position, target_type, target_id, requested_change,
            validation_status, validation_errors, before_snapshot
          ) values (
            v_job.id, v_position, 'content_item', v_target_id,
            jsonb_build_object(
              'releaseId', v_release_id,
              'revisionId', v_revision_id,
              'expectedReleaseVersion', v_release_lock_version,
              'expectedUpdatedAt', v_target_updated_at
            ),
            'valid', '[]'::jsonb,
            (select jsonb_build_object('workflowStatus', i.workflow_status, 'slug', i.slug)
              from public.cms_content_items i where i.id = v_target_id)
          );
        end if;
      else
        if exists (select 1 from public.cms_bulk_job_items duplicate
             where duplicate.job_id = v_job.id and duplicate.target_id = v_target_id)
           or (p_payload ->> 'operation' = 'assign_tasks' and (
              v_assignee is null
              or not exists (select 1 from public.cms_profiles where user_id = v_assignee and status = 'active')
           ))
           or not exists (select 1 from public.cms_work_tasks
             where id = v_target_id and lock_version = v_expected_version
               and (p_payload ->> 'operation' <> 'resolve_tasks' or status <> 'resolved')) then
          v_error_count := v_error_count + 1;
          insert into public.cms_bulk_job_items (
            job_id, position, target_type, target_id, expected_version, requested_change,
            validation_status, validation_errors
          ) values (
            v_job.id, v_position, 'work_task', v_target_id, v_expected_version,
            coalesce(p_payload -> 'changes', '{}'::jsonb), 'error',
            jsonb_build_array(jsonb_build_object(
              'field', 'targets[' || (v_position - 1) || ']',
              'code', 'task_invalid_or_conflict',
              'correction', 'Atualize a inbox e selecione tarefa elegível com versão atual.'
            ))
          );
        else
          insert into public.cms_bulk_job_items (
            job_id, position, target_type, target_id, expected_version, requested_change,
            validation_status, validation_errors, before_snapshot
          ) values (
            v_job.id, v_position, 'work_task', v_target_id, v_expected_version,
            coalesce(p_payload -> 'changes', '{}'::jsonb), 'valid', '[]'::jsonb,
            (select jsonb_build_object('status', t.status, 'assignedTo', t.assigned_to,
              'lockVersion', t.lock_version) from public.cms_work_tasks t where t.id = v_target_id)
          );
        end if;
      end if;
    end loop;
    update public.cms_bulk_jobs
    set status = case when v_error_count = 0 then 'validated' else 'failed' end,
      dry_run_report = jsonb_build_object(
        'valid', v_error_count = 0,
        'total', v_position,
        'validItems', v_position - v_error_count,
        'errors', v_error_count,
        'writes', 0
      ),
      lock_version = lock_version + 1
    where id = v_job.id returning * into v_job;
  else
    begin
      select * into v_job from public.cms_bulk_jobs
      where id = (p_payload ->> 'jobId')::uuid
        and environment = p_environment and site_key = p_site_key
      for update;
      v_expected_version := (p_payload ->> 'expectedVersion')::bigint;
    exception when others then
      raise exception 'CMS_BULK_COMMAND_INVALID' using errcode = '22023';
    end;
    if not found then raise exception 'CMS_BULK_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_job.lock_version <> v_expected_version then
      raise exception 'CMS_BULK_CONFLICT' using errcode = '40001';
    end if;
    if p_action = 'cancel' then
      if v_job.status not in ('validated', 'failed') then
        raise exception 'CMS_BULK_TRANSITION_INVALID' using errcode = '23514';
      end if;
      update public.cms_bulk_jobs set status = 'canceled', canceled_at = now(),
        lock_version = lock_version + 1
      where id = v_job.id returning * into v_job;
    else
      if (v_job.operation = 'add_to_release' and not public.cms_actor_authorized(
            p_actor_id, 'cms:releases.edit', p_aal, p_session_id, p_issued_at
          ))
         or (v_job.operation = 'assign_tasks' and not public.cms_actor_authorized(
            p_actor_id, 'cms:collaboration.assign', p_aal, p_session_id, p_issued_at
          ))
         or (v_job.operation = 'resolve_tasks' and not public.cms_actor_authorized(
            p_actor_id, 'cms:collaboration.resolve', p_aal, p_session_id, p_issued_at
          )) then
        raise exception 'CMS_BULK_FORBIDDEN' using errcode = '42501';
      end if;
      if v_job.status <> 'validated'
         or exists (select 1 from public.cms_bulk_job_items
           where job_id = v_job.id and validation_status = 'error') then
        raise exception 'CMS_BULK_TRANSITION_INVALID' using errcode = '23514';
      end if;
      update public.cms_bulk_jobs
      set status = 'running', started_at = now(), executed_by = p_actor_id
      where id = v_job.id returning * into v_job;
      for v_job_item in
        select * from public.cms_bulk_job_items where job_id = v_job.id order by position
      loop
        if v_job.operation = 'add_to_release' then
          v_release_id := (v_job_item.requested_change ->> 'releaseId')::uuid;
          v_revision_id := (v_job_item.requested_change ->> 'revisionId')::uuid;
          select * into v_release from public.cms_release_packages
          where id = v_release_id and status = 'draft'
            and environment = p_environment and site_key = p_site_key
            and lock_version = (v_job_item.requested_change ->> 'expectedReleaseVersion')::bigint
          for update;
          if not found then raise exception 'CMS_BULK_CONFLICT' using errcode = '40001'; end if;
          select encode(extensions.digest(convert_to(jsonb_build_object(
            'itemId', i.id, 'revisionId', r.id, 'contentType', i.content_type,
            'slug', i.slug, 'schemaVersion', r.schema_version, 'payload', r.payload, 'seo', r.seo
          )::text, 'UTF8'), 'sha256'), 'hex'), i.content_type
          into v_frozen_hash, v_target_content_type
          from public.cms_content_items i join public.cms_content_revisions r on r.item_id = i.id
          where i.id = v_job_item.target_id and r.id = v_revision_id and i.workflow_status = 'approved'
            and i.updated_at = (v_job_item.requested_change ->> 'expectedUpdatedAt')::timestamptz
          for update of i;
          if v_frozen_hash is null or not public.cms_actor_authorized(
            p_actor_id,
            public.cms_content_permission(v_target_content_type, 'read'),
            p_aal,
            p_session_id,
            p_issued_at
          ) then
            raise exception 'CMS_BULK_CONFLICT' using errcode = '40001';
          end if;
          select coalesce(max(position), 0) + 1 into v_position
          from public.cms_release_items where release_id = v_release_id;
          if v_position > 500 then raise exception 'CMS_BULK_ITEM_LIMIT' using errcode = '54000'; end if;
          insert into public.cms_release_items (
            release_id, item_id, revision_id, content_type, slug, position, frozen_hash, added_by
          ) select v_release_id, i.id, r.id, i.content_type, i.slug, v_position, v_frozen_hash, p_actor_id
          from public.cms_content_items i join public.cms_content_revisions r on r.item_id = i.id
          where i.id = v_job_item.target_id and r.id = v_revision_id;
          insert into public.cms_release_events (
            release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
          ) values (
            v_release_id, p_actor_id, 'item_added', 'draft', 'draft',
            jsonb_build_object('itemId', v_job_item.target_id, 'revisionId', v_revision_id,
              'position', v_position, 'bulkJobId', v_job.id), p_correlation_id
          );
          update public.cms_bulk_job_items set result = jsonb_build_object(
            'releaseId', v_release_id, 'position', v_position
          ), executed_at = now() where id = v_job_item.id;
        elsif v_job.operation = 'assign_tasks' then
          v_assignee := (v_job_item.requested_change ->> 'assignedTo')::uuid;
          update public.cms_work_tasks set assigned_to = v_assignee,
            status = case when status = 'open' then 'in_progress' else status end,
            lock_version = lock_version + 1, updated_by = p_actor_id
          where id = v_job_item.target_id and lock_version = v_job_item.expected_version;
          if not found then raise exception 'CMS_BULK_CONFLICT' using errcode = '40001'; end if;
          insert into public.cms_work_task_events (
            task_id, actor_id, event_type, event_data, correlation_id
          ) values (
            v_job_item.target_id, p_actor_id, 'assigned',
            jsonb_build_object('assignedTo', v_assignee, 'bulkJobId', v_job.id), p_correlation_id
          );
          if v_assignee <> p_actor_id then
            insert into public.cms_collaboration_outbox (
              task_id, recipient_id, event_type, correlation_id
            ) values (v_job_item.target_id, v_assignee, 'task_assigned', p_correlation_id);
          end if;
          update public.cms_bulk_job_items set result = jsonb_build_object(
            'assignedTo', v_assignee
          ), executed_at = now() where id = v_job_item.id;
        else
          update public.cms_work_tasks set status = 'resolved', resolved_at = now(),
            lock_version = lock_version + 1, updated_by = p_actor_id
          where id = v_job_item.target_id and lock_version = v_job_item.expected_version
            and status <> 'resolved';
          if not found then raise exception 'CMS_BULK_CONFLICT' using errcode = '40001'; end if;
          insert into public.cms_work_task_events (
            task_id, actor_id, event_type, event_data, correlation_id
          ) values (
            v_job_item.target_id, p_actor_id, 'resolved',
            jsonb_build_object('bulkJobId', v_job.id), p_correlation_id
          );
          update public.cms_bulk_job_items set result = jsonb_build_object(
            'status', 'resolved'
          ), executed_at = now() where id = v_job_item.id;
        end if;
      end loop;
      if v_job.operation = 'add_to_release' then
        update public.cms_release_packages set plan_hash = public.cms_release_plan_hash(id),
          lock_version = lock_version + 1, updated_by = p_actor_id
        where id = v_release_id;
      end if;
      update public.cms_bulk_jobs set status = 'completed', completed_at = now(),
        lock_version = lock_version + 1,
        dry_run_report = dry_run_report || jsonb_build_object('writes', target_count)
      where id = v_job.id returning * into v_job;
    end if;
  end if;

  v_response := jsonb_build_object(
    'schemaVersion', 1, 'jobId', v_job.id, 'operation', v_job.operation,
    'status', v_job.status, 'atomic', true, 'targetCount', v_job.target_count,
    'report', v_job.dry_run_report, 'lockVersion', v_job.lock_version,
    'commandId', p_command_id, 'correlationId', p_correlation_id,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'position', i.position, 'targetType', i.target_type, 'targetId', i.target_id,
      'validationStatus', i.validation_status, 'errors', i.validation_errors, 'result', i.result
    ) order by i.position) from public.cms_bulk_job_items i where i.job_id = v_job.id), '[]'::jsonb)
  );
  update public.cms_ev2_command_receipts set response = v_response, completed_at = now()
  where actor_id = p_actor_id and domain = 'bulk'
    and action = p_action and idempotency_key = p_idempotency_key;
  insert into public.cms_audit_log (actor_id, action, target_type, target_id, event_data, correlation_id)
  values (
    p_actor_id, 'cms:bulk.' || p_action, 'bulk_job', v_job.id::text,
    jsonb_build_object('operation', v_job.operation, 'status', v_job.status,
      'targetCount', v_job.target_count, 'atomic', true), p_correlation_id
  );
  return v_response;
end;
$$;

create function public.cms_publish_due_releases(p_limit integer, p_correlation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_release public.cms_release_packages%rowtype;
  v_processed integer := 0;
  v_failed integer := 0;
  v_command_id uuid;
  v_idempotency_key uuid;
  v_payload jsonb;
  v_request_hash text;
begin
  for v_release in
    select * from public.cms_release_packages
    where status = 'scheduled' and scheduled_for <= now()
      and environment in ('local', 'staging')
    order by scheduled_for
    for update skip locked
    limit least(greatest(p_limit, 1), 20)
  loop
    begin
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
        now(),
        v_command_id,
        v_idempotency_key,
        v_request_hash,
        coalesce(p_correlation_id, gen_random_uuid())
      );
      v_processed := v_processed + 1;
    exception when others then
      update public.cms_release_packages
      set status = 'failed', failed_at = now(), last_error_code = 'scheduled_release_failed',
        lock_version = lock_version + 1, scheduled_for = null
      where id = v_release.id;
      insert into public.cms_release_events (
        release_id, actor_id, event_type, from_status, to_status, event_data, correlation_id
      ) values (
        v_release.id, null, 'failed', 'scheduled', 'failed',
        jsonb_build_object('sqlstate', sqlstate, 'partialWrites', 0),
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
    end;
  end loop;
  return jsonb_build_object('processed', v_processed, 'failed', v_failed, 'partialWrites', 0);
end;
$$;

create function public.cms_claim_collaboration_outbox(p_limit integer, p_worker_id uuid)
returns setof public.cms_collaboration_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.cms_collaboration_outbox event
  set status = 'processing', locked_at = now(), attempts = attempts + 1
  where event.id in (
    select candidate.id from public.cms_collaboration_outbox candidate
    where candidate.status in ('pending', 'failed') and candidate.available_at <= now()
      and candidate.attempts < 20
    order by candidate.available_at, candidate.created_at
    for update skip locked limit least(greatest(p_limit, 1), 100)
  ) returning event.*;
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
set search_path = public, pg_temp
as $$
begin
  update public.cms_collaboration_outbox
  set status = case when p_success then 'completed'
      when attempts >= 20 then 'dead_letter' else 'failed' end,
    completed_at = case when p_success then now() else null end,
    available_at = case when p_success then available_at
      else now() + least(interval '30 minutes', interval '30 seconds' * power(2, least(attempts, 6))) end,
    last_error_code = case when p_success then null else p_error_code end
  where id = p_id and status = 'processing';
  if p_success then
    update public.cms_work_mentions mention set delivery_status = 'delivered', delivered_at = now()
    where (mention.comment_id, mention.mentioned_user_id) = (
      select event.comment_id, event.recipient_id
      from public.cms_collaboration_outbox event
      where event.id = p_id and event.event_type = 'mentioned'
    );
  end if;
end;
$$;

alter table public.cms_release_items enable row level security;
alter table public.cms_release_validation_runs enable row level security;
alter table public.cms_release_validations enable row level security;
alter table public.cms_release_approvals enable row level security;
alter table public.cms_release_snapshots enable row level security;
alter table public.cms_work_tasks enable row level security;
alter table public.cms_work_comments enable row level security;
alter table public.cms_work_mentions enable row level security;
alter table public.cms_saved_inbox_views enable row level security;
alter table public.cms_work_task_events enable row level security;
alter table public.cms_collaboration_outbox enable row level security;
alter table public.cms_bulk_jobs enable row level security;
alter table public.cms_bulk_job_items enable row level security;
alter table public.cms_ev2_command_receipts enable row level security;

create policy "cms_release_items_authorized_read" on public.cms_release_items
for select to authenticated using (public.cms_has_permission('cms:releases.read'));
create policy "cms_release_validation_runs_authorized_read" on public.cms_release_validation_runs
for select to authenticated using (public.cms_has_permission('cms:releases.read'));
create policy "cms_release_validations_authorized_read" on public.cms_release_validations
for select to authenticated using (public.cms_has_permission('cms:releases.read'));
create policy "cms_release_approvals_authorized_read" on public.cms_release_approvals
for select to authenticated using (public.cms_has_permission('cms:releases.read'));
create policy "cms_release_snapshots_audit_read" on public.cms_release_snapshots
for select to authenticated using (public.cms_has_permission('cms:audit.read'));
create policy "cms_work_tasks_authorized_read" on public.cms_work_tasks
for select to authenticated using (public.cms_has_permission('cms:collaboration.read'));
create policy "cms_work_comments_authorized_read" on public.cms_work_comments
for select to authenticated using (public.cms_has_permission('cms:collaboration.read'));
create policy "cms_work_mentions_authorized_read" on public.cms_work_mentions
for select to authenticated using (
  mentioned_user_id = auth.uid() or public.cms_has_permission('cms:collaboration.read')
);
create policy "cms_saved_inbox_views_owner_read" on public.cms_saved_inbox_views
for select to authenticated using (owner_id = auth.uid());
create policy "cms_work_task_events_authorized_read" on public.cms_work_task_events
for select to authenticated using (public.cms_has_permission('cms:collaboration.read'));
create policy "cms_collaboration_outbox_recipient_read" on public.cms_collaboration_outbox
for select to authenticated using (
  recipient_id = auth.uid() or public.cms_has_permission('cms:audit.read')
);
create policy "cms_bulk_jobs_owner_or_audit_read" on public.cms_bulk_jobs
for select to authenticated using (
  requested_by = auth.uid() or public.cms_has_permission('cms:audit.read')
);
create policy "cms_bulk_job_items_owner_or_audit_read" on public.cms_bulk_job_items
for select to authenticated using (exists (
  select 1 from public.cms_bulk_jobs job where job.id = job_id
    and (job.requested_by = auth.uid() or public.cms_has_permission('cms:audit.read'))
));
create policy "cms_ev2_receipts_owner_or_audit_read" on public.cms_ev2_command_receipts
for select to authenticated using (
  actor_id = auth.uid() or public.cms_has_permission('cms:audit.read')
);

revoke all on table
  public.cms_release_items,
  public.cms_release_validation_runs,
  public.cms_release_validations,
  public.cms_release_approvals,
  public.cms_release_snapshots,
  public.cms_work_tasks,
  public.cms_work_comments,
  public.cms_work_mentions,
  public.cms_saved_inbox_views,
  public.cms_work_task_events,
  public.cms_collaboration_outbox,
  public.cms_bulk_jobs,
  public.cms_bulk_job_items,
  public.cms_ev2_command_receipts
from public, anon, authenticated;

grant select on table
  public.cms_release_items,
  public.cms_release_validation_runs,
  public.cms_release_validations,
  public.cms_release_approvals,
  public.cms_release_snapshots,
  public.cms_work_tasks,
  public.cms_work_comments,
  public.cms_work_mentions,
  public.cms_saved_inbox_views,
  public.cms_work_task_events,
  public.cms_collaboration_outbox,
  public.cms_bulk_jobs,
  public.cms_bulk_job_items,
  public.cms_ev2_command_receipts
to authenticated;

grant all on table
  public.cms_release_items,
  public.cms_release_validation_runs,
  public.cms_release_validations,
  public.cms_release_approvals,
  public.cms_release_snapshots,
  public.cms_work_tasks,
  public.cms_work_comments,
  public.cms_work_mentions,
  public.cms_saved_inbox_views,
  public.cms_work_task_events,
  public.cms_collaboration_outbox,
  public.cms_bulk_jobs,
  public.cms_bulk_job_items,
  public.cms_ev2_command_receipts
to service_role;

revoke all on function public.cms_ev2_collaboration_enabled(uuid, text, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.cms_release_plan_hash(uuid)
from public, anon, authenticated;
revoke all on function public.cms_get_release_workspace(uuid, uuid, text, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.cms_execute_release_v2_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.cms_get_work_inbox(uuid, text, text, text, text, timestamptz, uuid, text, boolean, integer)
from public, anon, authenticated;
revoke all on function public.cms_execute_collaboration_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.cms_get_bulk_jobs(uuid, text, text, text, text, timestamptz, integer)
from public, anon, authenticated;
revoke all on function public.cms_execute_bulk_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.cms_claim_collaboration_outbox(integer, uuid)
from public, anon, authenticated;
revoke all on function public.cms_finish_collaboration_outbox(uuid, boolean, text)
from public, anon, authenticated;
revoke all on function public.cms_publish_due_releases(integer, uuid)
from public, anon, authenticated;

grant execute on function public.cms_ev2_collaboration_enabled(uuid, text, text, text, text, timestamptz)
to service_role;
grant execute on function public.cms_release_plan_hash(uuid)
to service_role;
grant execute on function public.cms_get_release_workspace(uuid, uuid, text, text, text, text, timestamptz)
to service_role;
grant execute on function public.cms_execute_release_v2_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
to service_role;
grant execute on function public.cms_get_work_inbox(uuid, text, text, text, text, timestamptz, uuid, text, boolean, integer)
to service_role;
grant execute on function public.cms_execute_collaboration_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
to service_role;
grant execute on function public.cms_get_bulk_jobs(uuid, text, text, text, text, timestamptz, integer)
to service_role;
grant execute on function public.cms_execute_bulk_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, uuid)
to service_role;
grant execute on function public.cms_claim_collaboration_outbox(integer, uuid)
to service_role;
grant execute on function public.cms_finish_collaboration_outbox(uuid, boolean, text)
to service_role;
grant execute on function public.cms_publish_due_releases(integer, uuid)
to service_role;
