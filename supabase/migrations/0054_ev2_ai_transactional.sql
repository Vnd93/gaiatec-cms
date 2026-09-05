-- EV2.14 — IA transacional controlada (F-016).
-- A capacidade permanece default-off, limitada a local/staging, alvos g14x-* e
-- dados sintéticos. Nenhuma ferramenta toca tabelas editoriais, produção ou rede externa.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:ai.plan', 'Criar e revisar planos transacionais sintéticos com dry-run.', true),
  ('cms:ai.approve', 'Aprovar ou rejeitar plano transacional de outro operador.', true),
  ('cms:ai.execute', 'Executar plano sintético previamente aprovado.', true),
  ('cms:ai.compensate', 'Restaurar o estado sintético anterior a uma execução aprovada.', true)
on conflict (permission_key) do update
set description = excluded.description,
    critical = excluded.critical;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, permission_key
from (values ('super_admin'), ('admin')) as roles(role_key)
cross join public.cms_permissions
where permission_key in ('cms:ai.plan', 'cms:ai.approve', 'cms:ai.execute', 'cms:ai.compensate')
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('editor', 'cms:ai.plan'),
  ('editor', 'cms:ai.execute'),
  ('marketing', 'cms:ai.plan'),
  ('marketing', 'cms:ai.execute'),
  ('commercial', 'cms:ai.read'),
  ('commercial', 'cms:ai.plan'),
  ('commercial', 'cms:ai.execute'),
  ('technical', 'cms:ai.read'),
  ('technical', 'cms:ai.plan'),
  ('technical', 'cms:ai.execute'),
  ('reviewer', 'cms:ai.approve')
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from public.cms_feature_flags
    where flag_key = 'ev2.ai_assist' and default_enabled is false
  ) or not exists (
    select 1 from public.cms_feature_flags
    where flag_key = 'ev2.ai_execute' and default_enabled is false
  ) then
    raise exception 'CMS_AI_EXECUTE_FOUNDATION_FLAGS_INVALID' using errcode = '23514';
  end if;
end;
$$;

create table public.cms_ai_execution_tools (
  tool_key text primary key check (tool_key in (
    'draft.apply_patch', 'workflow.submit', 'release.schedule',
    'release.publish', 'release.rollback'
  )),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  risk_class text not null check (risk_class in ('draft', 'workflow', 'critical')),
  permission_key text not null references public.cms_permissions (permission_key) on delete restrict,
  synthetic_only boolean not null default true check (synthetic_only),
  reversible boolean not null default true check (reversible),
  active boolean not null default true,
  input_contract jsonb not null check (jsonb_typeof(input_contract) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cms_ai_execution_tools (
  tool_key, display_name, risk_class, permission_key, input_contract
)
values
  ('draft.apply_patch', 'Aplicar patch sintético', 'draft', 'cms:ai.execute',
    '{"patch":{"summary":"string"},"target":"g14x-*"}'::jsonb),
  ('workflow.submit', 'Submeter alvo sintético', 'workflow', 'cms:ai.execute',
    '{"arguments":{},"from":"draft","to":"review"}'::jsonb),
  ('release.schedule', 'Agendar publicação sintética', 'critical', 'cms:ai.execute',
    '{"scheduledAt":"iso-8601","maxHours":24}'::jsonb),
  ('release.publish', 'Publicar projeção sintética', 'critical', 'cms:ai.execute',
    '{"arguments":{},"from":["review","scheduled"],"to":"published"}'::jsonb),
  ('release.rollback', 'Retirar publicação sintética', 'critical', 'cms:ai.compensate',
    '{"arguments":{},"from":"published","to":"review"}'::jsonb);

create table public.cms_ai_synthetic_targets (
  target_ref text primary key check (target_ref ~ '^g14x-[a-z0-9-]{3,100}$'),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  environment text not null check (environment in ('local', 'staging')),
  site_key text not null check (site_key = 'main'),
  data_class text not null default 'synthetic' check (data_class = 'synthetic'),
  lifecycle text not null default 'draft'
    check (lifecycle in ('draft', 'review', 'scheduled', 'published', 'retired')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cms_ai_synthetic_targets_scope_idx
  on public.cms_ai_synthetic_targets (environment, site_key, updated_at desc);

create table public.cms_ai_execution_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  environment text not null check (environment in ('local', 'staging')),
  site_key text not null check (site_key = 'main'),
  data_class text not null default 'synthetic' check (data_class = 'synthetic'),
  status text not null default 'ready'
    check (status in ('ready', 'approved', 'rejected', 'executing', 'executed', 'compensated', 'canceled')),
  risk_class text not null check (risk_class in ('draft', 'workflow', 'critical')),
  plan_version bigint not null default 1 check (plan_version > 0),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 20),
  dry_run jsonb not null check (jsonb_typeof(dry_run) = 'object' and dry_run @> '{"valid":true,"reversible":true}'::jsonb),
  created_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);

create index cms_ai_execution_plans_scope_idx
  on public.cms_ai_execution_plans (environment, site_key, created_at desc);
create index cms_ai_execution_plans_expiry_idx
  on public.cms_ai_execution_plans (expires_at, id)
  where status in ('ready', 'approved');

create table public.cms_ai_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.cms_ai_execution_plans (id) on delete restrict,
  purpose text not null check (purpose in ('execute', 'compensate')),
  decision text not null check (decision in ('approved', 'rejected')),
  status text not null check (status in ('active', 'consumed', 'expired', 'rejected')),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  plan_version bigint not null check (plan_version > 0),
  risk_class text not null check (risk_class in ('draft', 'workflow', 'critical')),
  approved_by uuid not null references auth.users (id) on delete restrict,
  rationale text not null check (char_length(btrim(rationale)) between 3 and 1000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((decision = 'rejected' and status = 'rejected') or decision = 'approved')
);

create index cms_ai_execution_approvals_expiry_idx
  on public.cms_ai_execution_approvals (expires_at, id) where status = 'active';
create unique index cms_ai_execution_approvals_one_active_idx
  on public.cms_ai_execution_approvals (plan_id, purpose) where status = 'active';

create table public.cms_ai_execution_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.cms_ai_execution_plans (id) on delete restrict,
  approval_id uuid not null references public.cms_ai_execution_approvals (id) on delete restrict,
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('running', 'succeeded', 'compensated')),
  executed_by uuid not null references auth.users (id) on delete restrict,
  step_count integer not null check (step_count between 1 and 20),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  compensated_at timestamptz,
  compensated_by uuid references auth.users (id) on delete restrict
);

create table public.cms_ai_execution_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cms_ai_execution_runs (id) on delete restrict,
  step_order integer not null check (step_order between 1 and 20),
  step_key text not null check (step_key ~ '^step-[a-z0-9-]{3,60}$'),
  tool_key text not null references public.cms_ai_execution_tools (tool_key) on delete restrict,
  target_ref text not null references public.cms_ai_synthetic_targets (target_ref) on delete restrict,
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot jsonb not null check (jsonb_typeof(after_snapshot) = 'object'),
  status text not null default 'succeeded' check (status in ('succeeded', 'compensated')),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  compensated_at timestamptz,
  unique (run_id, step_order),
  unique (run_id, step_key)
);

create index cms_ai_execution_run_steps_target_idx
  on public.cms_ai_execution_run_steps (target_ref, created_at desc);

create table public.cms_ai_execution_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  plan_id uuid references public.cms_ai_execution_plans (id) on delete restrict,
  run_id uuid references public.cms_ai_execution_runs (id) on delete restrict,
  action text not null check (action in (
    'create_target', 'create_plan', 'revise_plan', 'approve_plan',
    'execute_plan', 'approve_compensation', 'compensate_run', 'cancel_plan', 'record_denial'
  )),
  decision text not null check (decision in ('allow', 'deny')),
  reason_code text not null check (reason_code ~ '^CMS_AI_EXECUTE_[A-Z0-9_]+$'),
  plan_hash text check (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$'),
  environment text not null check (environment in ('local', 'staging')),
  site_key text not null check (site_key = 'main'),
  correlation_id uuid not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index cms_ai_execution_policy_scope_idx
  on public.cms_ai_execution_policy_decisions (environment, site_key, created_at desc);

create function private.cms_ai_execute_individual_flag_context(
  p_actor_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_user_count integer := 0;
  v_matching_count integer := 0;
  v_broad_count integer := 0;
  v_enabled boolean := false;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_actor_id is null or p_environment not in ('local', 'staging') then
    return jsonb_build_object('enabled', false, 'source', 'scope_invalid');
  end if;
  select * into v_flag from public.cms_feature_flags
  where flag_key = 'ev2.ai_execute' and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('enabled', false, 'source', 'flag_unavailable'); end if;
  if v_flag.kill_switch then return jsonb_build_object('enabled', false, 'source', 'kill_switch'); end if;
  if v_flag.default_enabled then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;
  select count(*) into v_broad_count
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.ai_execute' and scope_type <> 'user' and enabled
    and starts_at <= now() and expires_at > now();
  if v_broad_count > 0 then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;
  select count(*), count(*) filter (where environment = p_environment),
         bool_or(enabled) filter (where environment = p_environment),
         min(starts_at) filter (where environment = p_environment),
         min(expires_at) filter (where environment = p_environment)
  into v_user_count, v_matching_count, v_enabled, v_starts_at, v_expires_at
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.ai_execute' and scope_type = 'user'
    and scope_key = p_actor_id::text and starts_at <= now() and expires_at > now();
  if v_user_count <> 1 or v_matching_count <> 1 then
    return jsonb_build_object(
      'enabled', false,
      'source', case when v_user_count > 1 then 'ambiguous_user_overrides' else 'individual_override_required' end
    );
  end if;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('enabled', false, 'source', 'user_override_off');
  end if;
  if v_expires_at > v_starts_at + interval '30 minutes'
     or v_expires_at > now() + interval '30 minutes' then
    return jsonb_build_object('enabled', false, 'source', 'override_window_invalid');
  end if;
  return jsonb_build_object(
    'enabled', true, 'source', 'individual_override',
    'startsAt', v_starts_at, 'expiresAt', v_expires_at
  );
end;
$$;

create function public.cms_ai_execute_capability(
  p_actor_id uuid,
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
set search_path = public, private, pg_temp
as $$
declare
  v_assist jsonb;
  v_execute jsonb;
  v_authorized boolean := false;
begin
  v_assist := private.cms_ai_individual_flag_context(p_actor_id, p_environment);
  v_execute := private.cms_ai_execute_individual_flag_context(p_actor_id, p_environment);
  if p_site_key = 'main'
     and coalesce((v_assist ->> 'enabled')::boolean, false)
     and coalesce((v_execute ->> 'enabled')::boolean, false) then
    v_authorized := private.cms_ev2_actor_authorized_for_scope(
      p_actor_id, 'cms:ai.read', p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', v_authorized,
    'source', case
      when v_authorized then 'individual_overrides'
      when coalesce((v_assist ->> 'enabled')::boolean, false) is not true then 'ai_assist_required'
      else coalesce(v_execute ->> 'source', 'forbidden')
    end,
    'environment', p_environment,
    'siteKey', p_site_key,
    'providerMode', 'synthetic',
    'externalProviderEnabled', false,
    'realDataAllowed', false,
    'syntheticOnly', true,
    'requiresAiAssist', true,
    'planHashRequired', true,
    'reviewerSeparationRequired', true,
    'compensationRequired', true,
    'maxPlanSteps', 20,
    'approvalMinutes', 10,
    'manualFallback', true
  );
end;
$$;

create function private.cms_ai_execute_assert_available(
  p_actor_id uuid,
  p_permission text,
  p_environment text,
  p_site_key text,
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
  v_capability jsonb;
begin
  v_capability := public.cms_ai_execute_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_AI_EXECUTE_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if p_permission not in ('cms:ai.read', 'cms:ai.plan', 'cms:ai.approve', 'cms:ai.execute', 'cms:ai.compensate')
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_AI_EXECUTE_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create function private.cms_ai_validate_execution_plan(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_steps jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_step jsonb;
  v_tool public.cms_ai_execution_tools%rowtype;
  v_target public.cms_ai_synthetic_targets%rowtype;
  v_risk_rank integer := 0;
  v_target_count integer;
  v_versions jsonb := '{}'::jsonb;
  v_lifecycles jsonb := '{}'::jsonb;
  v_current_version bigint;
  v_current_lifecycle text;
  v_scheduled_at timestamptz;
begin
  if jsonb_typeof(p_steps) is distinct from 'array'
     or jsonb_array_length(p_steps) not between 1 and 20 then
    raise exception 'CMS_AI_EXECUTE_PLAN_INVALID' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_steps)) <>
     (select count(distinct step ->> 'stepKey') from jsonb_array_elements(p_steps) step) then
    raise exception 'CMS_AI_EXECUTE_STEP_DUPLICATE' using errcode = '22023';
  end if;

  for v_step in select value from jsonb_array_elements(p_steps) with ordinality order by ordinality
  loop
    if jsonb_typeof(v_step) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_step)) <> 5
       or coalesce(v_step ->> 'stepKey', '') !~ '^step-[a-z0-9-]{3,60}$'
       or coalesce(v_step ->> 'targetRef', '') !~ '^g14x-[a-z0-9-]{3,100}$'
       or jsonb_typeof(v_step -> 'expectedVersion') is distinct from 'number'
       or coalesce(v_step ->> 'expectedVersion', '') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(v_step -> 'arguments') is distinct from 'object' then
      raise exception 'CMS_AI_EXECUTE_STEP_INVALID' using errcode = '22023';
    end if;
    select * into v_tool from public.cms_ai_execution_tools
    where tool_key = v_step ->> 'toolKey' and active and synthetic_only and reversible;
    if not found then raise exception 'CMS_AI_EXECUTE_TOOL_DENIED' using errcode = '42501'; end if;
    select * into v_target from public.cms_ai_synthetic_targets
    where target_ref = v_step ->> 'targetRef'
      and environment = p_environment and site_key = p_site_key and data_class = 'synthetic'
      and created_by = p_actor_id;
    if not found then raise exception 'CMS_AI_EXECUTE_TARGET_NOT_FOUND' using errcode = 'PT404'; end if;

    v_current_version := coalesce((v_versions ->> v_target.target_ref)::bigint, v_target.version);
    v_current_lifecycle := coalesce(v_lifecycles ->> v_target.target_ref, v_target.lifecycle);
    if (v_step ->> 'expectedVersion')::bigint <> v_current_version then
      raise exception 'CMS_AI_EXECUTE_TARGET_CONFLICT' using errcode = 'PT409';
    end if;

    if v_tool.tool_key = 'draft.apply_patch' then
      if v_current_lifecycle <> 'draft'
         or jsonb_typeof(v_step #> '{arguments,patch}') is distinct from 'object'
         or (select count(*) from jsonb_object_keys(v_step #> '{arguments,patch}')) <> 1
         or char_length(btrim(coalesce(v_step #>> '{arguments,patch,summary}', ''))) not between 3 and 3000 then
        raise exception 'CMS_AI_EXECUTE_PATCH_INVALID' using errcode = '22023';
      end if;
    elsif v_tool.tool_key = 'workflow.submit' then
      if v_current_lifecycle <> 'draft' or v_step -> 'arguments' <> '{}'::jsonb then
        raise exception 'CMS_AI_EXECUTE_TRANSITION_INVALID' using errcode = 'PT409';
      end if;
      v_current_lifecycle := 'review';
    elsif v_tool.tool_key = 'release.schedule' then
      if v_current_lifecycle <> 'review'
         or (select count(*) from jsonb_object_keys(v_step -> 'arguments')) <> 1
         or coalesce(v_step #>> '{arguments,scheduledAt}', '') !~ '^\d{4}-\d{2}-\d{2}T' then
        raise exception 'CMS_AI_EXECUTE_SCHEDULE_INVALID' using errcode = '22023';
      end if;
      begin
        v_scheduled_at := (v_step #>> '{arguments,scheduledAt}')::timestamptz;
      exception when others then
        raise exception 'CMS_AI_EXECUTE_SCHEDULE_INVALID' using errcode = '22023';
      end;
      if v_scheduled_at <= now() or v_scheduled_at > now() + interval '24 hours' then
        raise exception 'CMS_AI_EXECUTE_SCHEDULE_INVALID' using errcode = '22023';
      end if;
      v_current_lifecycle := 'scheduled';
    elsif v_tool.tool_key = 'release.publish' then
      if v_current_lifecycle not in ('review', 'scheduled') or v_step -> 'arguments' <> '{}'::jsonb then
        raise exception 'CMS_AI_EXECUTE_TRANSITION_INVALID' using errcode = 'PT409';
      end if;
      v_current_lifecycle := 'published';
    else
      if v_current_lifecycle <> 'published' or v_step -> 'arguments' <> '{}'::jsonb then
        raise exception 'CMS_AI_EXECUTE_TRANSITION_INVALID' using errcode = 'PT409';
      end if;
      v_current_lifecycle := 'review';
    end if;

    v_versions := jsonb_set(v_versions, array[v_target.target_ref], to_jsonb(v_current_version + 1), true);
    v_lifecycles := jsonb_set(v_lifecycles, array[v_target.target_ref], to_jsonb(v_current_lifecycle), true);
    v_risk_rank := greatest(v_risk_rank, case v_tool.risk_class when 'critical' then 2 when 'workflow' then 1 else 0 end);
  end loop;

  select count(distinct step ->> 'targetRef') into v_target_count
  from jsonb_array_elements(p_steps) step;
  return jsonb_build_object(
    'valid', true,
    'stepCount', jsonb_array_length(p_steps),
    'targetCount', v_target_count,
    'risk', case v_risk_rank when 2 then 'critical' when 1 then 'workflow' else 'draft' end,
    'reversible', true,
    'projectedVersions', v_versions,
    'projectedLifecycles', v_lifecycles
  );
end;
$$;

create function public.cms_get_ai_execution_workspace(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tools jsonb;
  v_targets jsonb;
  v_plans jsonb;
  v_can_plan boolean;
  v_can_approve boolean;
  v_can_execute boolean;
  v_can_compensate boolean;
begin
  perform private.cms_ai_execute_assert_available(
    p_actor_id, 'cms:ai.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  v_can_plan := private.cms_ev2_actor_authorized_for_scope(
    p_actor_id, 'cms:ai.plan', p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  v_can_approve := private.cms_ev2_actor_authorized_for_scope(
    p_actor_id, 'cms:ai.approve', p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  v_can_execute := private.cms_ev2_actor_authorized_for_scope(
    p_actor_id, 'cms:ai.execute', p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  v_can_compensate := private.cms_ev2_actor_authorized_for_scope(
    p_actor_id, 'cms:ai.compensate', p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', tool_key, 'name', display_name, 'risk', risk_class,
    'permission', permission_key, 'syntheticOnly', synthetic_only,
    'reversible', reversible, 'active', active
  ) order by tool_key), '[]'::jsonb)
  into v_tools from public.cms_ai_execution_tools where active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'reference', target_ref, 'title', title, 'lifecycle', lifecycle,
    'payload', payload, 'version', version, 'owned', created_by = p_actor_id,
    'updatedAt', updated_at
  ) order by updated_at desc), '[]'::jsonb)
  into v_targets
  from (select * from public.cms_ai_synthetic_targets
    where environment = p_environment and site_key = p_site_key
      and (created_by = p_actor_id or v_can_approve)
    order by updated_at desc limit 30) target;

  select coalesce(jsonb_agg(plan_payload order by created_at desc), '[]'::jsonb)
  into v_plans
  from (
    select p.created_at, jsonb_build_object(
      'id', p.id, 'title', p.title,
      'status', case when p.status in ('ready', 'approved') and p.expires_at <= now() then 'expired' else p.status end,
      'risk', p.risk_class, 'planVersion', p.plan_version, 'planHash', p.plan_hash,
      'steps', p.steps, 'dryRun', p.dry_run, 'createdBy', p.created_by,
      'owned', p.created_by = p_actor_id,
      'approvable', v_can_approve and p.created_by <> p_actor_id and p.status = 'ready' and p.expires_at > now(),
      'executable', v_can_execute and p.status = 'approved' and p.expires_at > now()
        and exists(select 1 from public.cms_ai_execution_approvals ea
          where ea.plan_id = p.id and ea.purpose = 'execute' and ea.decision = 'approved'
            and ea.status = 'active' and ea.plan_hash = p.plan_hash
            and ea.plan_version = p.plan_version and ea.expires_at > now()),
      'compensatable', v_can_compensate and p.status = 'executed'
        and exists(select 1 from public.cms_ai_execution_approvals ca
          where ca.plan_id = p.id and ca.purpose = 'compensate' and ca.decision = 'approved'
            and ca.status = 'active' and ca.plan_hash = p.plan_hash and ca.expires_at > now()),
      'expiresAt', p.expires_at, 'createdAt', p.created_at,
      'approvals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'purpose', a.purpose, 'decision', a.decision,
        'status', case when a.status = 'active' and a.expires_at <= now() then 'expired' else a.status end,
        'planHash', a.plan_hash, 'approvedBy', a.approved_by,
        'expiresAt', a.expires_at, 'createdAt', a.created_at
      ) order by a.created_at desc) from public.cms_ai_execution_approvals a where a.plan_id = p.id), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'executedBy', r.executed_by,
        'stepCount', r.step_count, 'result', r.result,
        'compensationApproved', exists(select 1 from public.cms_ai_execution_approvals ca
          where ca.plan_id = p.id and ca.purpose = 'compensate' and ca.decision = 'approved'
            and ca.status = 'active' and ca.expires_at > now()),
        'createdAt', r.created_at, 'completedAt', r.completed_at
      )) from public.cms_ai_execution_runs r where r.plan_id = p.id), '[]'::jsonb)
    ) as plan_payload
    from public.cms_ai_execution_plans p
    where p.environment = p_environment and p.site_key = p_site_key
      and (p.created_by = p_actor_id or v_can_approve or v_can_execute or v_can_compensate)
    order by p.created_at desc limit 30
  ) visible;

  return jsonb_build_object(
    'schemaVersion', 1, 'correlationId', p_correlation_id,
    'policy', jsonb_build_object(
      'gate', 'G14', 'dataClass', 'synthetic', 'productionAllowed', false,
      'externalProviderEnabled', false, 'maxPlanSteps', 20, 'approvalMinutes', 10,
      'reviewerSeparationRequired', true, 'compensationRequired', true
    ),
    'permissions', jsonb_build_object(
      'canPlan', v_can_plan, 'canApprove', v_can_approve,
      'canExecute', v_can_execute, 'canCompensate', v_can_compensate
    ),
    'tools', v_tools, 'targets', v_targets, 'plans', v_plans
  );
end;
$$;

create function public.cms_execute_ai_transaction_command(
  p_actor_id uuid,
  p_action text,
  p_payload jsonb,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_command_id uuid,
  p_correlation_id uuid,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_ai_command_receipts%rowtype;
  v_target public.cms_ai_synthetic_targets%rowtype;
  v_plan public.cms_ai_execution_plans%rowtype;
  v_approval public.cms_ai_execution_approvals%rowtype;
  v_run public.cms_ai_execution_runs%rowtype;
  v_step jsonb;
  v_step_order integer;
  v_dry_run jsonb;
  v_plan_hash text;
  v_response jsonb;
  v_before jsonb;
  v_after jsonb;
  v_payload jsonb;
  v_lifecycle text;
  v_scheduled_at timestamptz;
  v_first_before jsonb;
  v_last_after jsonb;
  v_target_ref text;
  v_published boolean := false;
  v_denial_reason text;
begin
  if p_action not in (
    'create_target', 'create_plan', 'revise_plan', 'approve_plan',
    'execute_plan', 'approve_compensation', 'compensate_run', 'cancel_plan', 'record_denial'
  ) then raise exception 'CMS_AI_EXECUTE_ACTION_INVALID' using errcode = '22023'; end if;
  v_permission := case
    when p_action in ('create_target', 'create_plan', 'revise_plan', 'cancel_plan') then 'cms:ai.plan'
    when p_action in ('approve_plan', 'approve_compensation') then 'cms:ai.approve'
    when p_action = 'execute_plan' then 'cms:ai.execute'
    when p_action = 'compensate_run' then 'cms:ai.compensate'
    else 'cms:ai.read'
  end;
  if p_aal <> 'aal2' then raise exception 'CMS_AI_EXECUTE_MFA_REQUIRED' using errcode = '42501'; end if;
  perform private.cms_ai_execute_assert_available(
    p_actor_id, v_permission, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_AI_EXECUTE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  insert into public.cms_ai_command_receipts (
    actor_id, idempotency_key, command_id, correlation_id, action, request_hash
  ) values (
    p_actor_id, p_idempotency_key, p_command_id, p_correlation_id, p_action, p_request_hash
  ) on conflict do nothing;
  select * into v_receipt from public.cms_ai_command_receipts
  where actor_id = p_actor_id and idempotency_key = p_idempotency_key and command_id = p_command_id
  for update;
  if not found or v_receipt.request_hash <> p_request_hash or v_receipt.action <> p_action then
    raise exception 'CMS_AI_EXECUTE_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  if v_receipt.response is not null then return v_receipt.response; end if;
  if private.cms_ai_contains_sensitive_text(p_payload) then
    raise exception 'CMS_AI_EXECUTE_SYNTHETIC_DATA_REQUIRED' using errcode = '22023';
  end if;

  if p_action = 'record_denial' then
    if jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception 'CMS_AI_EXECUTE_DENIAL_INVALID' using errcode = '22023';
    end if;
    v_denial_reason := coalesce(nullif(p_payload ->> 'reasonCode', ''), 'CMS_AI_EXECUTE_INPUT_DENIED');
    if v_denial_reason !~ '^CMS_AI_EXECUTE_[A-Z0-9_]{3,80}$' then
      raise exception 'CMS_AI_EXECUTE_DENIAL_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, action, decision, reason_code, environment, site_key, correlation_id, details
    ) values (
      p_actor_id, p_action, 'deny', v_denial_reason, p_environment, p_site_key,
      p_correlation_id, p_payload - 'reasonCode'
    );
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', null,
      'runId', null, 'status', 'denied', 'planHash', null, 'applied', false,
      'published', false, 'syntheticOnly', true, 'correlationId', p_correlation_id
    );

  elsif p_action = 'create_target' then
    if coalesce(p_payload ->> 'targetRef', '') !~ '^g14x-[a-z0-9-]{3,100}$'
       or char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 3 and 160
       or jsonb_typeof(p_payload -> 'payload') is distinct from 'object'
       or (select count(*) from jsonb_object_keys(p_payload -> 'payload')) <> 1
       or char_length(btrim(coalesce(p_payload #>> '{payload,summary}', ''))) not between 3 and 3000 then
      raise exception 'CMS_AI_EXECUTE_TARGET_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_ai_synthetic_targets (
      target_ref, title, environment, site_key, payload, created_by, updated_by
    ) values (
      p_payload ->> 'targetRef', p_payload ->> 'title', p_environment, p_site_key,
      p_payload -> 'payload', p_actor_id, p_actor_id
    ) on conflict (target_ref) do nothing
    returning * into v_target;
    if not found then
      raise exception 'CMS_AI_EXECUTE_TARGET_CONFLICT' using errcode = 'PT409';
    end if;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', v_target.target_ref,
      'planId', null, 'runId', null, 'status', v_target.lifecycle, 'planHash', null,
      'applied', false, 'published', false, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, action, decision, reason_code, environment, site_key, correlation_id, details
    ) values (
      p_actor_id, p_action, 'allow', 'CMS_AI_EXECUTE_TARGET_CREATED', p_environment, p_site_key,
      p_correlation_id, jsonb_build_object('targetRef', v_target.target_ref, 'dataClass', 'synthetic')
    );

  elsif p_action in ('create_plan', 'revise_plan') then
    v_dry_run := private.cms_ai_validate_execution_plan(
      p_actor_id, p_environment, p_site_key, p_payload -> 'steps'
    );
    if p_action = 'create_plan' then
      if char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 3 and 160 then
        raise exception 'CMS_AI_EXECUTE_PLAN_INVALID' using errcode = '22023';
      end if;
      v_plan_hash := encode(extensions.digest(convert_to(jsonb_build_object(
        'environment', p_environment, 'siteKey', p_site_key, 'version', 1,
        'title', p_payload ->> 'title', 'steps', p_payload -> 'steps'
      )::text, 'UTF8'), 'sha256'), 'hex');
      insert into public.cms_ai_execution_plans (
        title, environment, site_key, risk_class, plan_hash, steps, dry_run,
        created_by, correlation_id, expires_at
      ) values (
        p_payload ->> 'title', p_environment, p_site_key, v_dry_run ->> 'risk',
        v_plan_hash, p_payload -> 'steps', v_dry_run, p_actor_id, p_correlation_id,
        now() + interval '30 minutes'
      ) returning * into v_plan;
    else
      select * into v_plan from public.cms_ai_execution_plans
      where id = (p_payload ->> 'planId')::uuid and created_by = p_actor_id
        and environment = p_environment and site_key = p_site_key for update;
      if not found then raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode = 'PT404'; end if;
      if v_plan.status not in ('ready', 'approved', 'rejected') or v_plan.expires_at <= now() then
        raise exception 'CMS_AI_EXECUTE_PLAN_UNAVAILABLE' using errcode = 'PT409';
      end if;
      if v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
        raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
      end if;
      v_plan_hash := encode(extensions.digest(convert_to(jsonb_build_object(
        'environment', p_environment, 'siteKey', p_site_key, 'version', v_plan.plan_version + 1,
        'title', coalesce(nullif(btrim(p_payload ->> 'title'), ''), v_plan.title),
        'steps', p_payload -> 'steps'
      )::text, 'UTF8'), 'sha256'), 'hex');
      update public.cms_ai_execution_approvals set status = 'expired'
      where plan_id = v_plan.id and status = 'active';
      update public.cms_ai_execution_plans set
        title = coalesce(nullif(btrim(p_payload ->> 'title'), ''), title), status = 'ready',
        risk_class = v_dry_run ->> 'risk', plan_version = plan_version + 1,
        plan_hash = v_plan_hash, steps = p_payload -> 'steps', dry_run = v_dry_run,
        correlation_id = p_correlation_id, expires_at = now() + interval '30 minutes', updated_at = now()
      where id = v_plan.id returning * into v_plan;
    end if;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', null, 'status', v_plan.status, 'planHash', v_plan.plan_hash,
      'applied', false, 'published', false, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, p_action, 'allow',
      case when p_action = 'create_plan' then 'CMS_AI_EXECUTE_PLAN_CREATED' else 'CMS_AI_EXECUTE_PLAN_REVISED' end,
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id, v_plan.dry_run
    );

  elsif p_action = 'approve_plan' then
    select * into v_plan from public.cms_ai_execution_plans
    where id = (p_payload ->> 'planId')::uuid and environment = p_environment and site_key = p_site_key
    for update;
    if not found then raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_plan.created_by = p_actor_id then
      raise exception 'CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    if v_plan.status <> 'ready' or v_plan.expires_at <= now() then
      raise exception 'CMS_AI_EXECUTE_PLAN_UNAVAILABLE' using errcode = 'PT409';
    end if;
    if v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
      raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
    end if;
    if coalesce(p_payload ->> 'decision', '') not in ('approved', 'rejected')
       or char_length(btrim(coalesce(p_payload ->> 'rationale', ''))) not between 3 and 1000 then
      raise exception 'CMS_AI_EXECUTE_APPROVAL_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_ai_execution_approvals (
      plan_id, purpose, decision, status, plan_hash, plan_version, risk_class,
      approved_by, rationale, expires_at
    ) values (
      v_plan.id, 'execute', p_payload ->> 'decision',
      case when p_payload ->> 'decision' = 'approved' then 'active' else 'rejected' end,
      v_plan.plan_hash, v_plan.plan_version, v_plan.risk_class, p_actor_id,
      p_payload ->> 'rationale', now() + interval '10 minutes'
    ) returning * into v_approval;
    update public.cms_ai_execution_plans
    set status = case when v_approval.decision = 'approved' then 'approved' else 'rejected' end,
        updated_at = now(), correlation_id = p_correlation_id
    where id = v_plan.id returning * into v_plan;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', null, 'status', v_plan.status, 'planHash', v_plan.plan_hash,
      'applied', false, 'published', false, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, p_action,
      case when v_approval.decision = 'approved' then 'allow' else 'deny' end,
      case when v_approval.decision = 'approved' then 'CMS_AI_EXECUTE_PLAN_APPROVED' else 'CMS_AI_EXECUTE_PLAN_REJECTED' end,
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id,
      jsonb_build_object('risk', v_plan.risk_class, 'purpose', 'execute')
    );

  elsif p_action = 'execute_plan' then
    select * into v_plan from public.cms_ai_execution_plans
    where id = (p_payload ->> 'planId')::uuid and environment = p_environment and site_key = p_site_key
    for update;
    if not found then raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_plan.status <> 'approved' or v_plan.expires_at <= now()
       or v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
      raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
    end if;
    select * into v_approval from public.cms_ai_execution_approvals
    where plan_id = v_plan.id and purpose = 'execute' and decision = 'approved'
      and status = 'active' and plan_hash = v_plan.plan_hash and plan_version = v_plan.plan_version
      and expires_at > now() for update;
    if not found then raise exception 'CMS_AI_EXECUTE_APPROVAL_REQUIRED' using errcode = 'PT409'; end if;
    if v_approval.approved_by = p_actor_id then
      raise exception 'CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    perform 1 from public.cms_ai_synthetic_targets target
    where target.target_ref in (select step ->> 'targetRef' from jsonb_array_elements(v_plan.steps) step)
    order by target.target_ref for update;
    perform private.cms_ai_validate_execution_plan(
      v_plan.created_by, p_environment, p_site_key, v_plan.steps
    );
    for v_step in select value from jsonb_array_elements(v_plan.steps)
    loop
      select * into v_target from public.cms_ai_synthetic_targets
      where target_ref = v_step ->> 'targetRef';
      if not private.cms_ev2_actor_authorized_for_scope(
        p_actor_id,
        (select permission_key from public.cms_ai_execution_tools where tool_key = v_step ->> 'toolKey'),
        p_environment, p_site_key, p_aal, p_session_id, p_issued_at
      ) then
        raise exception 'CMS_AI_EXECUTE_TOOL_DENIED' using errcode = '42501';
      end if;
    end loop;
    update public.cms_ai_execution_plans set status = 'executing', updated_at = now()
    where id = v_plan.id;
    insert into public.cms_ai_execution_runs (
      plan_id, approval_id, plan_hash, status, executed_by, step_count, correlation_id
    ) values (
      v_plan.id, v_approval.id, v_plan.plan_hash, 'running', p_actor_id,
      jsonb_array_length(v_plan.steps), p_correlation_id
    ) returning * into v_run;

    for v_step, v_step_order in
      select value, ordinality::integer from jsonb_array_elements(v_plan.steps) with ordinality order by ordinality
    loop
      select * into v_target from public.cms_ai_synthetic_targets
      where target_ref = v_step ->> 'targetRef' for update;
      if v_target.version <> (v_step ->> 'expectedVersion')::bigint then
        raise exception 'CMS_AI_EXECUTE_TARGET_CONFLICT' using errcode = 'PT409';
      end if;
      v_before := jsonb_build_object(
        'payload', v_target.payload, 'lifecycle', v_target.lifecycle, 'version', v_target.version
      );
      v_payload := v_target.payload;
      v_lifecycle := v_target.lifecycle;
      if v_step ->> 'toolKey' = 'draft.apply_patch' then
        v_payload := v_payload || (v_step #> '{arguments,patch}');
      elsif v_step ->> 'toolKey' = 'workflow.submit' then
        v_lifecycle := 'review';
      elsif v_step ->> 'toolKey' = 'release.schedule' then
        v_scheduled_at := (v_step #>> '{arguments,scheduledAt}')::timestamptz;
        if v_scheduled_at <= now() or v_scheduled_at > now() + interval '24 hours' then
          raise exception 'CMS_AI_EXECUTE_SCHEDULE_INVALID' using errcode = '22023';
        end if;
        v_payload := v_payload || jsonb_build_object('scheduledAt', v_scheduled_at);
        v_lifecycle := 'scheduled';
      elsif v_step ->> 'toolKey' = 'release.publish' then
        v_payload := v_payload || jsonb_build_object('publishedAt', now());
        v_lifecycle := 'published';
      else
        v_payload := v_payload - 'publishedAt' - 'scheduledAt';
        v_lifecycle := 'review';
      end if;
      update public.cms_ai_synthetic_targets set
        payload = v_payload, lifecycle = v_lifecycle, version = version + 1,
        updated_by = p_actor_id, updated_at = now()
      where target_ref = v_target.target_ref returning * into v_target;
      v_after := jsonb_build_object(
        'payload', v_target.payload, 'lifecycle', v_target.lifecycle, 'version', v_target.version
      );
      insert into public.cms_ai_execution_run_steps (
        run_id, step_order, step_key, tool_key, target_ref,
        before_snapshot, after_snapshot, correlation_id
      ) values (
        v_run.id, v_step_order, v_step ->> 'stepKey', v_step ->> 'toolKey',
        v_step ->> 'targetRef', v_before, v_after, p_correlation_id
      );
    end loop;

    select exists (
      select 1 from public.cms_ai_synthetic_targets target
      where target.target_ref in (
        select distinct step ->> 'targetRef' from jsonb_array_elements(v_plan.steps) step
      ) and target.lifecycle = 'published'
    ) into v_published;

    update public.cms_ai_execution_runs set
      status = 'succeeded', completed_at = now(),
      result = jsonb_build_object(
        'applied', true, 'published', v_published, 'syntheticOnly', true,
        'stepCount', jsonb_array_length(v_plan.steps)
      )
    where id = v_run.id returning * into v_run;
    update public.cms_ai_execution_approvals set status = 'consumed', consumed_at = now()
    where id = v_approval.id;
    update public.cms_ai_execution_plans set status = 'executed', updated_at = now()
    where id = v_plan.id returning * into v_plan;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', v_run.id, 'status', v_plan.status, 'planHash', v_plan.plan_hash,
      'applied', true, 'published', v_published, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, run_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, v_run.id, p_action, 'allow', 'CMS_AI_EXECUTE_PLAN_EXECUTED',
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id, v_run.result
    );

  elsif p_action = 'approve_compensation' then
    -- Ordem global de locks G14: plan -> run -> approval -> targets.
    select p.* into v_plan from public.cms_ai_execution_plans p
    join public.cms_ai_execution_runs r on r.plan_id = p.id
    where r.id = (p_payload ->> 'runId')::uuid
      and p.environment = p_environment and p.site_key = p_site_key and r.status = 'succeeded'
    for update of p;
    if not found then raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    select * into v_run from public.cms_ai_execution_runs
    where id = (p_payload ->> 'runId')::uuid and plan_id = v_plan.id and status = 'succeeded'
    for update;
    if not found then raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_run.executed_by = p_actor_id then
      raise exception 'CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    if v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
      raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
    end if;
    if char_length(btrim(coalesce(p_payload ->> 'rationale', ''))) not between 3 and 1000 then
      raise exception 'CMS_AI_EXECUTE_APPROVAL_INVALID' using errcode = '22023';
    end if;
    update public.cms_ai_execution_approvals
    set status = 'expired'
    where plan_id = v_plan.id and purpose = 'compensate'
      and status = 'active' and expires_at <= now();
    if exists (
      select 1 from public.cms_ai_execution_approvals
      where plan_id = v_plan.id and purpose = 'compensate'
        and status = 'active' and expires_at > now()
    ) then
      raise exception 'CMS_AI_EXECUTE_APPROVAL_CONFLICT' using errcode = 'PT409';
    end if;
    insert into public.cms_ai_execution_approvals (
      plan_id, purpose, decision, status, plan_hash, plan_version, risk_class,
      approved_by, rationale, expires_at
    ) values (
      v_plan.id, 'compensate', 'approved', 'active', v_plan.plan_hash,
      v_plan.plan_version, v_plan.risk_class, p_actor_id,
      p_payload ->> 'rationale', now() + interval '10 minutes'
    ) returning * into v_approval;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', v_run.id, 'status', 'compensation_approved', 'planHash', v_plan.plan_hash,
      'applied', false, 'published', false, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, run_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, v_run.id, p_action, 'allow', 'CMS_AI_EXECUTE_COMPENSATION_APPROVED',
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id,
      jsonb_build_object('purpose', 'compensate')
    );

  elsif p_action = 'compensate_run' then
    -- Mantém a mesma ordem de locks de approve_compensation para impedir deadlocks.
    select p.* into v_plan from public.cms_ai_execution_plans p
    join public.cms_ai_execution_runs r on r.plan_id = p.id
    where r.id = (p_payload ->> 'runId')::uuid
      and p.environment = p_environment and p.site_key = p_site_key and r.status = 'succeeded'
    for update of p;
    if not found then raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    select * into v_run from public.cms_ai_execution_runs
    where id = (p_payload ->> 'runId')::uuid and plan_id = v_plan.id and status = 'succeeded'
    for update;
    if not found then raise exception 'CMS_AI_EXECUTE_RUN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
      raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
    end if;
    select * into v_approval from public.cms_ai_execution_approvals
    where plan_id = v_plan.id and purpose = 'compensate' and decision = 'approved'
      and status = 'active' and plan_hash = v_plan.plan_hash and expires_at > now() for update;
    if not found then raise exception 'CMS_AI_EXECUTE_APPROVAL_REQUIRED' using errcode = 'PT409'; end if;
    if v_approval.approved_by = p_actor_id then
      raise exception 'CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    perform 1 from public.cms_ai_synthetic_targets target
    where target.target_ref in (
      select distinct step.target_ref from public.cms_ai_execution_run_steps step where step.run_id = v_run.id
    ) order by target.target_ref for update;

    for v_target_ref in
      select distinct step.target_ref from public.cms_ai_execution_run_steps step
      where step.run_id = v_run.id order by step.target_ref
    loop
      select before_snapshot into v_first_before
      from public.cms_ai_execution_run_steps
      where run_id = v_run.id and target_ref = v_target_ref order by step_order asc limit 1;
      select after_snapshot into v_last_after
      from public.cms_ai_execution_run_steps
      where run_id = v_run.id and target_ref = v_target_ref order by step_order desc limit 1;
      select * into v_target from public.cms_ai_synthetic_targets
      where target_ref = v_target_ref for update;
      if v_target.version <> (v_last_after ->> 'version')::bigint then
        raise exception 'CMS_AI_EXECUTE_COMPENSATION_CONFLICT' using errcode = 'PT409';
      end if;
      update public.cms_ai_synthetic_targets set
        payload = v_first_before -> 'payload', lifecycle = v_first_before ->> 'lifecycle',
        version = version + 1, updated_by = p_actor_id, updated_at = now()
      where target_ref = v_target_ref;
    end loop;
    select exists (
      select 1 from public.cms_ai_synthetic_targets target
      where target.target_ref in (
        select distinct step.target_ref from public.cms_ai_execution_run_steps step
        where step.run_id = v_run.id
      ) and target.lifecycle = 'published'
    ) into v_published;
    update public.cms_ai_execution_run_steps
    set status = 'compensated', compensated_at = now() where run_id = v_run.id;
    update public.cms_ai_execution_runs set
      status = 'compensated', compensated_at = now(), compensated_by = p_actor_id,
      result = result || jsonb_build_object('compensated', true, 'compensatedAt', now())
    where id = v_run.id returning * into v_run;
    update public.cms_ai_execution_approvals set status = 'consumed', consumed_at = now()
    where id = v_approval.id;
    update public.cms_ai_execution_plans set status = 'compensated', updated_at = now()
    where id = v_plan.id returning * into v_plan;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', v_run.id, 'status', v_plan.status, 'planHash', v_plan.plan_hash,
      'applied', true, 'published', v_published, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, run_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, v_run.id, p_action, 'allow', 'CMS_AI_EXECUTE_RUN_COMPENSATED',
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id,
      jsonb_build_object('restored', true, 'syntheticOnly', true)
    );

  else
    select * into v_plan from public.cms_ai_execution_plans
    where id = (p_payload ->> 'planId')::uuid and created_by = p_actor_id
      and environment = p_environment and site_key = p_site_key for update;
    if not found then raise exception 'CMS_AI_EXECUTE_PLAN_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_plan.status not in ('ready', 'approved', 'rejected') then
      raise exception 'CMS_AI_EXECUTE_PLAN_UNAVAILABLE' using errcode = 'PT409';
    end if;
    if v_plan.plan_hash <> p_payload ->> 'expectedPlanHash' then
      raise exception 'CMS_AI_EXECUTE_PLAN_CONFLICT' using errcode = 'PT409';
    end if;
    update public.cms_ai_execution_approvals set status = 'expired'
    where plan_id = v_plan.id and status = 'active';
    update public.cms_ai_execution_plans set status = 'canceled', updated_at = now()
    where id = v_plan.id returning * into v_plan;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'action', p_action, 'targetRef', null, 'planId', v_plan.id,
      'runId', null, 'status', v_plan.status, 'planHash', v_plan.plan_hash,
      'applied', false, 'published', false, 'syntheticOnly', true,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_execution_policy_decisions (
      actor_id, plan_id, action, decision, reason_code, plan_hash,
      environment, site_key, correlation_id, details
    ) values (
      p_actor_id, v_plan.id, p_action, 'allow', 'CMS_AI_EXECUTE_PLAN_CANCELED',
      v_plan.plan_hash, p_environment, p_site_key, p_correlation_id, '{}'::jsonb
    );
  end if;

  update public.cms_ai_command_receipts set response = v_response, completed_at = now()
  where id = v_receipt.id;
  return v_response;
end;
$$;

alter table public.cms_ai_execution_tools enable row level security;
alter table public.cms_ai_synthetic_targets enable row level security;
alter table public.cms_ai_execution_plans enable row level security;
alter table public.cms_ai_execution_approvals enable row level security;
alter table public.cms_ai_execution_runs enable row level security;
alter table public.cms_ai_execution_run_steps enable row level security;
alter table public.cms_ai_execution_policy_decisions enable row level security;

revoke all on table
  public.cms_ai_execution_tools,
  public.cms_ai_synthetic_targets,
  public.cms_ai_execution_plans,
  public.cms_ai_execution_approvals,
  public.cms_ai_execution_runs,
  public.cms_ai_execution_run_steps,
  public.cms_ai_execution_policy_decisions
from public, anon, authenticated;

grant all on table
  public.cms_ai_execution_tools,
  public.cms_ai_synthetic_targets,
  public.cms_ai_execution_plans,
  public.cms_ai_execution_approvals,
  public.cms_ai_execution_runs,
  public.cms_ai_execution_run_steps,
  public.cms_ai_execution_policy_decisions
to service_role;

revoke all on function private.cms_ai_execute_individual_flag_context(uuid, text)
from public, anon, authenticated;
revoke all on function private.cms_ai_execute_assert_available(uuid, text, text, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function private.cms_ai_validate_execution_plan(uuid, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.cms_ai_execute_capability(uuid, text, text, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.cms_get_ai_execution_workspace(uuid, text, text, text, text, timestamptz, uuid)
from public, anon, authenticated;
revoke all on function public.cms_execute_ai_transaction_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.cms_ai_execute_capability(uuid, text, text, text, text, timestamptz)
to service_role;
grant execute on function public.cms_get_ai_execution_workspace(uuid, text, text, text, text, timestamptz, uuid)
to service_role;
grant execute on function public.cms_execute_ai_transaction_command(uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, text)
to service_role;
