-- EV2.10 — IA assistiva controlada (F-015).
-- Estritamente aditiva/default-off. Não configura provedor externo, não aceita dados
-- reais e não oferece ferramenta capaz de aplicar, publicar, excluir ou alterar acesso.

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:ai.read', 'Consultar sessões, fontes e propostas assistivas autorizadas.', false),
  ('cms:ai.draft', 'Gerar propostas assistivas sintéticas sem aplicá-las.', true),
  ('cms:ai.review', 'Aceitar, rejeitar ou editar uma proposta sem executá-la.', true),
  ('cms:ai.eval', 'Registrar avaliações sintéticas e adversariais da IA assistiva.', true)
on conflict (permission_key) do update
set description = excluded.description,
    critical = excluded.critical;

insert into public.cms_role_permissions (role_key, permission_key)
select role_key, permission_key
from (values ('super_admin'), ('admin')) as roles(role_key)
cross join public.cms_permissions
where permission_key like 'cms:ai.%'
on conflict do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('editor', 'cms:ai.read'),
  ('editor', 'cms:ai.draft'),
  ('marketing', 'cms:ai.read'),
  ('marketing', 'cms:ai.draft'),
  ('reviewer', 'cms:ai.read'),
  ('reviewer', 'cms:ai.review'),
  ('auditor', 'cms:ai.read'),
  ('auditor', 'cms:ai.eval')
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
    raise exception 'CMS_AI_FOUNDATION_FLAGS_INVALID' using errcode = '23514';
  end if;
end;
$$;

create table public.cms_ai_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  status text not null check (status in ('technical_draft', 'approved', 'retired')),
  decision_key text not null check (decision_key = 'EV2-D04'),
  provider_mode text not null check (provider_mode = 'synthetic'),
  external_provider_enabled boolean not null default false check (external_provider_enabled is false),
  allowed_data_classes text[] not null default array['synthetic']::text[]
    check (allowed_data_classes = array['synthetic']::text[]),
  provider_region text,
  retention_hours integer not null default 24 check (retention_hours between 1 and 24),
  max_session_minutes integer not null default 30 check (max_session_minutes between 1 and 30),
  max_input_tokens integer not null default 2000 check (max_input_tokens between 1 and 2000),
  max_session_tokens integer not null default 8000 check (max_session_tokens between 1 and 8000),
  max_session_cost_micros bigint not null default 0 check (max_session_cost_micros = 0),
  low_confidence_threshold numeric(4,3) not null default 0.800
    check (low_confidence_threshold between 0.500 and 0.990),
  configuration jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  check (provider_region is null),
  check (configuration @> '{"trainingOptOut":true,"realData":false,"aiExecute":false}'::jsonb)
);

create table public.cms_ai_tools (
  tool_key text primary key check (tool_key ~ '^[a-z]+\.[a-z_]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  mode text not null check (mode in ('read', 'draft')),
  permission_key text not null references public.cms_permissions (permission_key) on delete restrict,
  synthetic_only boolean not null default true check (synthetic_only),
  mutates_cms boolean not null default false check (not mutates_cms),
  critical_action boolean not null default false check (not critical_action),
  active boolean not null default true,
  input_contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cms_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  site_key text not null check (site_key = 'main'),
  mode text not null check (mode in ('read', 'draft')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  status text not null default 'active' check (status in ('active', 'closed', 'canceled', 'expired')),
  data_class text not null default 'synthetic' check (data_class = 'synthetic'),
  provider_mode text not null default 'synthetic' check (provider_mode = 'synthetic'),
  policy_version integer not null references public.cms_ai_policy_versions (version) on delete restrict,
  token_budget integer not null check (token_budget between 1 and 8000),
  tokens_used integer not null default 0 check (tokens_used between 0 and token_budget),
  cost_budget_micros bigint not null default 0 check (cost_budget_micros = 0),
  cost_used_micros bigint not null default 0 check (cost_used_micros = 0),
  correlation_id uuid not null,
  expires_at timestamptz not null,
  retention_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  check (retention_until > created_at and retention_until <= created_at + interval '24 hours')
);

create index cms_ai_sessions_actor_idx
  on public.cms_ai_sessions (actor_id, environment, site_key, created_at desc);
create index cms_ai_sessions_retention_idx
  on public.cms_ai_sessions (retention_until, id);

create table public.cms_ai_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cms_ai_sessions (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  source_kind text not null check (source_kind = 'synthetic_document'),
  source_ref text not null check (source_ref ~ '^g10x-[a-z0-9-]{3,100}$'),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  version_label text not null check (char_length(btrim(version_label)) between 1 and 80),
  locator text not null check (char_length(btrim(locator)) between 1 and 240),
  page_number integer check (page_number between 1 and 10000),
  excerpt_redacted text not null check (char_length(btrim(excerpt_redacted)) between 3 and 3000),
  excerpt_hash text not null check (excerpt_hash ~ '^[0-9a-f]{64}$'),
  authorized boolean not null default true check (authorized),
  data_class text not null default 'synthetic' check (data_class = 'synthetic'),
  created_at timestamptz not null default now()
);

create table public.cms_ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cms_ai_sessions (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  content_redacted text not null check (char_length(btrim(content_redacted)) between 1 and 6000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  risk text not null check (risk in ('safe', 'redacted', 'suspicious', 'blocked')),
  redaction_categories text[] not null default '{}'::text[],
  token_count integer not null default 0 check (token_count between 0 and 4000),
  created_at timestamptz not null default now()
);

create table public.cms_ai_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cms_ai_sessions (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  proposal_kind text not null check (proposal_kind in ('locate', 'explain', 'extract', 'draft_patch')),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'edited')),
  summary text not null check (char_length(btrim(summary)) between 3 and 1000),
  target_ref text check (target_ref is null or target_ref ~ '^g10x-[a-z0-9-]{3,100}$'),
  fields jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 50),
  diff jsonb not null check (jsonb_typeof(diff) = 'object'),
  source_ids uuid[] not null check (cardinality(source_ids) between 1 and 20),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  has_pending_fields boolean not null,
  proposal_hash text not null check (proposal_hash ~ '^[0-9a-f]{64}$'),
  lock_version bigint not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete restrict
);

create table public.cms_ai_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.cms_ai_proposals (id) on delete restrict,
  proposal_hash text not null check (proposal_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('accepted', 'rejected', 'edited')),
  decided_by uuid not null references auth.users (id) on delete restrict,
  rationale text not null check (char_length(btrim(rationale)) between 3 and 1000),
  edited_fields jsonb,
  applied boolean not null default false check (not applied),
  created_at timestamptz not null default now(),
  unique (proposal_id)
);

create table public.cms_ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.cms_ai_sessions (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  tool_key text not null references public.cms_ai_tools (tool_key) on delete restrict,
  status text not null check (status in ('planned', 'succeeded', 'denied', 'failed')),
  arguments_redacted jsonb not null default '{}'::jsonb,
  arguments_hash text not null check (arguments_hash ~ '^[0-9a-f]{64}$'),
  output_summary_redacted text,
  output_hash text check (output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  policy_decision text not null check (policy_decision in ('allow', 'deny')),
  permission_key text not null references public.cms_permissions (permission_key) on delete restrict,
  input_tokens integer not null default 0 check (input_tokens between 0 and 4000),
  output_tokens integer not null default 0 check (output_tokens between 0 and 4000),
  cost_micros bigint not null default 0 check (cost_micros = 0),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.cms_ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  environment text not null check (environment in ('local', 'staging')),
  suite_key text not null check (suite_key ~ '^g10x-[a-z0-9-]{3,100}$'),
  provider_mode text not null check (provider_mode = 'synthetic'),
  model_key text not null check (model_key = 'deterministic-v1'),
  prompt_version text not null check (prompt_version = 'f015-v1'),
  tool_catalog_version integer not null check (tool_catalog_version = 1),
  dataset_hash text not null check (dataset_hash ~ '^[0-9a-f]{64}$'),
  metrics jsonb not null,
  bypass_count integer not null check (bypass_count >= 0),
  pii_leak_count integer not null check (pii_leak_count >= 0),
  source_coverage numeric(5,4) not null check (source_coverage between 0 and 1),
  field_precision numeric(5,4) not null check (field_precision between 0 and 1),
  permission_pass_rate numeric(5,4) not null check (permission_pass_rate between 0 and 1),
  passed boolean not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  check (passed = (
    bypass_count = 0 and pii_leak_count = 0 and source_coverage >= 1.0000
    and field_precision >= 0.9500 and permission_pass_rate >= 1.0000
  ))
);

create table public.cms_ai_command_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  command_id uuid not null,
  correlation_id uuid not null,
  action text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_id, idempotency_key),
  unique (actor_id, command_id)
);

create table public.cms_ai_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid references public.cms_ai_sessions (id) on delete restrict,
  proposal_id uuid references public.cms_ai_proposals (id) on delete restrict,
  event_type text not null,
  correlation_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cms_ai_sources_session_idx
  on public.cms_ai_sources (session_id, created_at);
create index cms_ai_messages_session_idx
  on public.cms_ai_messages (session_id, created_at);
create index cms_ai_proposals_session_idx
  on public.cms_ai_proposals (session_id, created_at desc);
create index cms_ai_tool_calls_session_idx
  on public.cms_ai_tool_calls (session_id, created_at);
create index cms_ai_tool_calls_retention_idx
  on public.cms_ai_tool_calls (created_at) where session_id is null;
create index cms_ai_eval_runs_retention_idx
  on public.cms_ai_eval_runs (created_at);
create index cms_ai_receipts_retention_idx
  on public.cms_ai_command_receipts (created_at);
create index cms_ai_events_session_idx
  on public.cms_ai_events (session_id, created_at);
create index cms_ai_events_retention_idx
  on public.cms_ai_events (created_at) where session_id is null;

insert into public.cms_ai_policy_versions (
  version, status, decision_key, provider_mode, allowed_data_classes, configuration
)
values (
  1,
  'technical_draft',
  'EV2-D04',
  'synthetic',
  array['synthetic'],
  '{"trainingOptOut":true,"realData":false,"aiExecute":false,"externalNetwork":false,"serviceRoleDelegated":false}'::jsonb
);

insert into public.cms_ai_tools (
  tool_key, display_name, mode, permission_key, input_contract
)
values
  ('content.search', 'Localizar referência sintética', 'read', 'cms:ai.read', '{"dataClass":"synthetic","result":"reference"}'),
  ('content.read', 'Ler trecho sintético autorizado', 'read', 'cms:ai.read', '{"dataClass":"synthetic","result":"redactedExcerpt"}'),
  ('source.inspect', 'Explicar e extrair com fonte', 'read', 'cms:ai.read', '{"citationRequired":true,"lowConfidence":"pending"}'),
  ('draft.propose_patch', 'Preparar proposta com diff', 'draft', 'cms:ai.draft', '{"apply":false,"publish":false,"approvalRequired":true}')
on conflict (tool_key) do nothing;

create function private.cms_ai_individual_flag_context(
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
  where flag_key = 'ev2.ai_assist' and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('enabled', false, 'source', 'flag_unavailable'); end if;
  if v_flag.kill_switch then return jsonb_build_object('enabled', false, 'source', 'kill_switch'); end if;
  if v_flag.default_enabled then
    return jsonb_build_object('enabled', false, 'source', 'broad_activation_not_supported');
  end if;
  select count(*) into v_broad_count
  from public.cms_feature_flag_overrides
  where flag_key = 'ev2.ai_assist' and scope_type <> 'user' and enabled
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
  where flag_key = 'ev2.ai_assist' and scope_type = 'user'
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
    'environment', p_environment, 'expiresAt', v_expires_at
  );
end;
$$;

create function private.cms_ai_contains_sensitive_text(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_value::text ~* (
    '[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+' ||
    '|\y[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}\y' ||
    '|(?:^|[^a-z0-9])(?:\+?55\s*)?(?:\(?[0-9]{2}\)?\s*)?9?[0-9]{4}[-\s]?[0-9]{4}(?:$|[^a-z0-9])' ||
    '|\y(?:bearer|api[_ -]?key|secret|password|senha)\s*[:=]\s*[^ ,;]{8,}' ||
    '|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}' ||
    '|-----BEGIN [A-Z ]*PRIVATE KEY-----'
  ), false);
$$;

create function public.cms_ai_capability(
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
  v_context jsonb;
  v_authorized boolean := false;
  v_policy public.cms_ai_policy_versions%rowtype;
begin
  select * into v_policy from public.cms_ai_policy_versions where version = 1;
  v_context := private.cms_ai_individual_flag_context(p_actor_id, p_environment);
  if p_site_key = 'main' and coalesce((v_context ->> 'enabled')::boolean, false) then
    v_authorized := private.cms_ev2_actor_authorized_for_scope(
      p_actor_id, 'cms:ai.read', p_environment, p_site_key,
      p_aal, p_session_id, p_issued_at
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', v_authorized,
    'source', case when v_authorized then 'individual_override' else coalesce(v_context ->> 'source', 'forbidden') end,
    'environment', p_environment,
    'siteKey', p_site_key,
    'providerMode', 'synthetic',
    'externalProviderEnabled', false,
    'externalProviderReady', false,
    'aiExecute', false,
    'realDataAllowed', false,
    'decisionKey', 'EV2-D04',
    'decisionStatus', coalesce(v_policy.status, 'technical_draft'),
    'policyVersion', 1,
    'toolCatalogVersion', 1,
    'retentionHours', coalesce(v_policy.retention_hours, 24),
    'maxSessionMinutes', coalesce(v_policy.max_session_minutes, 30),
    'maxSessionTokens', coalesce(v_policy.max_session_tokens, 8000),
    'manualFallback', true
  );
end;
$$;

create function private.cms_ai_assert_available(
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
  v_capability := public.cms_ai_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
  if coalesce((v_capability ->> 'enabled')::boolean, false) is not true then
    raise exception 'CMS_AI_FEATURE_DISABLED' using errcode = '42501';
  end if;
  if p_permission !~ '^cms:ai\.[a-z_]+$'
     or not private.cms_ev2_actor_authorized_for_scope(
       p_actor_id, p_permission, p_environment, p_site_key,
       p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_AI_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create function public.cms_get_ai_workspace(
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
  v_sessions jsonb;
  v_tools jsonb;
  v_can_review boolean := false;
begin
  perform private.cms_ai_assert_available(
    p_actor_id, 'cms:ai.read', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  v_can_review := private.cms_ev2_actor_authorized_for_scope(
    p_actor_id, 'cms:ai.review', p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', tool_key, 'name', display_name, 'mode', mode,
    'permission', permission_key, 'syntheticOnly', synthetic_only,
    'mutatesCms', mutates_cms
  ) order by tool_key), '[]'::jsonb)
  into v_tools from public.cms_ai_tools where active;

  select coalesce(jsonb_agg(session_payload order by created_at desc), '[]'::jsonb)
  into v_sessions
  from (
    select s.created_at, jsonb_build_object(
      'id', s.id, 'title', s.title, 'mode', s.mode, 'status', s.status,
      'actorId', s.actor_id, 'owned', s.actor_id = p_actor_id,
      'reviewable', v_can_review and s.actor_id <> p_actor_id,
      'providerMode', s.provider_mode, 'tokensUsed', s.tokens_used,
      'tokenBudget', s.token_budget, 'costUsedMicros', s.cost_used_micros,
      'expiresAt', s.expires_at,
      'proposals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'kind', p.proposal_kind, 'status', p.status,
          'summary', p.summary, 'targetRef', p.target_ref, 'fields', p.fields,
          'diff', p.diff, 'sourceIds', p.source_ids, 'confidence', p.confidence,
          'hasPendingFields', p.has_pending_fields, 'proposalHash', p.proposal_hash,
          'lockVersion', p.lock_version, 'createdAt', p.created_at
        ) order by p.created_at desc)
        from public.cms_ai_proposals p where p.session_id = s.id
      ), '[]'::jsonb),
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'kind', x.source_kind, 'reference', x.source_ref,
          'title', x.title, 'version', x.version_label, 'locator', x.locator,
          'page', x.page_number, 'excerpt', x.excerpt_redacted, 'authorized', x.authorized
        ) order by x.created_at)
        from public.cms_ai_sources x where x.session_id = s.id
      ), '[]'::jsonb)
    ) as session_payload
    from public.cms_ai_sessions s
    where (s.actor_id = p_actor_id or v_can_review)
      and s.environment = p_environment and s.site_key = p_site_key
      and s.retention_until > now()
    order by s.created_at desc limit 20
  ) visible;

  return jsonb_build_object(
    'schemaVersion', 1, 'correlationId', p_correlation_id,
    'policy', jsonb_build_object(
      'decisionKey', 'EV2-D04', 'status', 'technical_draft',
      'providerMode', 'synthetic', 'externalProviderEnabled', false,
      'allowedDataClasses', jsonb_build_array('synthetic'),
      'retentionHours', 24, 'aiExecute', false
    ),
    'tools', v_tools, 'sessions', v_sessions
  );
end;
$$;

create function public.cms_execute_ai_command(
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
set search_path = public, private, pg_temp
as $$
declare
  v_permission text;
  v_receipt public.cms_ai_command_receipts%rowtype;
  v_session public.cms_ai_sessions%rowtype;
  v_source_id uuid;
  v_proposal_id uuid;
  v_proposal public.cms_ai_proposals%rowtype;
  v_response jsonb;
  v_fields jsonb;
  v_confidence numeric(4,3);
  v_has_pending boolean;
  v_decision text;
  v_passed boolean;
  v_input_tokens integer;
  v_output_tokens integer;
  v_tool_key text;
begin
  if p_action not in (
    'start_session', 'generate_proposal', 'decide_proposal',
    'close_session', 'record_eval', 'record_denial'
  ) then raise exception 'CMS_AI_ACTION_INVALID' using errcode = '22023'; end if;
  v_permission := case
    when p_action = 'start_session' and p_payload ->> 'mode' = 'draft'
      then 'cms:ai.draft'
    when p_action = 'generate_proposal' and p_payload ->> 'proposalKind' = 'draft_patch'
      then 'cms:ai.draft'
    when p_action = 'decide_proposal' then 'cms:ai.review'
    when p_action = 'record_eval' then 'cms:ai.eval'
    else 'cms:ai.read'
  end;
  perform private.cms_ai_assert_available(
    p_actor_id, v_permission, p_environment, p_site_key,
    p_aal, p_session_id, p_issued_at
  );
  if p_aal <> 'aal2' then raise exception 'CMS_AI_MFA_REQUIRED' using errcode = '42501'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_AI_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  insert into public.cms_ai_command_receipts (
    actor_id, idempotency_key, command_id, correlation_id, action, request_hash
  ) values (
    p_actor_id, p_idempotency_key, p_command_id, p_correlation_id, p_action, p_request_hash
  ) on conflict do nothing;
  select * into v_receipt from public.cms_ai_command_receipts
  where actor_id = p_actor_id
    and idempotency_key = p_idempotency_key
    and command_id = p_command_id
  for update;
  if not found or v_receipt.request_hash <> p_request_hash or v_receipt.action <> p_action then
    raise exception 'CMS_AI_IDEMPOTENCY_CONFLICT' using errcode = 'PT409';
  end if;
  if v_receipt.response is not null then return v_receipt.response; end if;

  if private.cms_ai_contains_sensitive_text(p_payload) then
    raise exception 'CMS_AI_UNREDACTED_DATA' using errcode = '22023';
  end if;

  if p_action = 'start_session' then
    if coalesce(p_payload ->> 'mode', '') not in ('read', 'draft')
       or char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 3 and 160
       or coalesce(p_payload ->> 'dataClass', '') <> 'synthetic'
       or case
         when jsonb_typeof(p_payload -> 'tokenBudget') = 'number'
           then (p_payload ->> 'tokenBudget')::integer not between 1 and 8000
         else true
       end then
      raise exception 'CMS_AI_SESSION_INVALID' using errcode = '22023';
    end if;
    insert into public.cms_ai_sessions (
      actor_id, environment, site_key, mode, title, policy_version,
      token_budget, correlation_id, expires_at, retention_until
    ) values (
      p_actor_id, p_environment, p_site_key, p_payload ->> 'mode', p_payload ->> 'title', 1,
      least(coalesce((p_payload ->> 'tokenBudget')::integer, 8000), 8000),
      p_correlation_id, now() + interval '30 minutes', now() + interval '23 hours 55 minutes'
    ) returning * into v_session;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'sessionId', v_session.id, 'status', v_session.status,
      'providerMode', 'synthetic', 'externalProviderEnabled', false,
      'expiresAt', v_session.expires_at, 'correlationId', p_correlation_id
    );
    insert into public.cms_ai_events (actor_id, session_id, event_type, correlation_id, details)
    values (p_actor_id, v_session.id, 'ai_session_started', p_correlation_id,
      jsonb_build_object('mode', v_session.mode, 'dataClass', 'synthetic'));

  elsif p_action = 'record_denial' then
    v_tool_key := case when p_payload ->> 'requestedMode' = 'draft'
      then 'draft.propose_patch' else 'source.inspect' end;
    insert into public.cms_ai_tool_calls (
      actor_id, tool_key, status, arguments_redacted, arguments_hash,
      policy_decision, permission_key, correlation_id, completed_at
    ) values (
      p_actor_id, v_tool_key, 'denied',
      jsonb_build_object('reason', p_payload ->> 'reason', 'categories', p_payload -> 'categories'),
      p_request_hash, 'deny', v_permission, p_correlation_id, now()
    );
    insert into public.cms_ai_events (actor_id, event_type, correlation_id, details)
    values (p_actor_id, 'ai_request_denied', p_correlation_id,
      jsonb_build_object('reason', p_payload ->> 'reason'));
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'denied', true, 'correlationId', p_correlation_id
    );

  elsif p_action = 'generate_proposal' then
    select * into v_session from public.cms_ai_sessions
    where id = (p_payload ->> 'sessionId')::uuid and actor_id = p_actor_id for update;
    if not found then raise exception 'CMS_AI_SESSION_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_session.environment <> p_environment or v_session.site_key <> p_site_key
       or v_session.status <> 'active' or v_session.expires_at <= now() then
      raise exception 'CMS_AI_SESSION_UNAVAILABLE' using errcode = 'PT409';
    end if;
    if coalesce(p_payload ->> 'sourceKind', '') <> 'synthetic_document'
       or coalesce(p_payload ->> 'sourceRef', '') !~ '^g10x-[a-z0-9-]{3,100}$'
       or coalesce(p_payload ->> 'proposalKind', '') not in ('locate', 'explain', 'extract', 'draft_patch') then
      raise exception 'CMS_AI_SYNTHETIC_SCOPE_REQUIRED' using errcode = '22023';
    end if;
    v_tool_key := case when p_payload ->> 'proposalKind' = 'draft_patch'
      then 'draft.propose_patch' else 'source.inspect' end;
    if v_tool_key = 'draft.propose_patch' and v_session.mode <> 'draft' then
      raise exception 'CMS_AI_MODE_MISMATCH' using errcode = '42501';
    end if;
    v_input_tokens := greatest(1, coalesce((p_payload ->> 'inputTokens')::integer, 1));
    v_output_tokens := greatest(1, coalesce((p_payload ->> 'outputTokens')::integer, 1));
    if v_input_tokens > 2000 or v_output_tokens > 4000
       or v_session.tokens_used + v_input_tokens + v_output_tokens > v_session.token_budget then
      raise exception 'CMS_AI_BUDGET_EXCEEDED' using errcode = 'PT409';
    end if;
    insert into public.cms_ai_sources (
      session_id, actor_id, source_kind, source_ref, title, version_label,
      locator, page_number, excerpt_redacted, excerpt_hash
    ) values (
      v_session.id, p_actor_id, 'synthetic_document', p_payload ->> 'sourceRef',
      p_payload ->> 'sourceTitle', p_payload ->> 'sourceVersion', p_payload ->> 'sourceLocator',
      nullif(p_payload ->> 'sourcePage', '')::integer,
      p_payload ->> 'sourceExcerpt', p_payload ->> 'sourceExcerptHash'
    ) returning id into v_source_id;
    if jsonb_typeof(p_payload -> 'fields') is distinct from 'array' then
      raise exception 'CMS_AI_CITATION_REQUIRED' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payload -> 'fields') not between 1 and 50
       or exists (
         select 1 from jsonb_array_elements(p_payload -> 'fields') field
         where jsonb_typeof(field) <> 'object'
            or coalesce(field ->> 'path', '') !~ '^[a-z][a-zA-Z0-9_.-]{0,119}$'
            or char_length(btrim(coalesce(field ->> 'label', ''))) not between 1 and 160
            or char_length(btrim(coalesce(field ->> 'value', ''))) not between 1 and 3000
            or case
              when jsonb_typeof(field -> 'confidence') = 'number'
                then (field ->> 'confidence')::numeric not between 0 and 1
              else true
            end
       ) then raise exception 'CMS_AI_CITATION_REQUIRED' using errcode = '22023';
    end if;
    v_fields := (
      select jsonb_agg(
        field || jsonb_build_object(
          'sourceId', v_source_id,
          'sourceTitle', p_payload ->> 'sourceTitle',
          'sourceVersion', p_payload ->> 'sourceVersion',
          'locator', p_payload ->> 'sourceLocator',
          'page', nullif(p_payload ->> 'sourcePage', '')::integer,
          'excerpt', left(p_payload ->> 'sourceExcerpt', 1000),
          'status', case when (field ->> 'confidence')::numeric < 0.800 then 'pending' else 'supported' end
        )
      ) from jsonb_array_elements(p_payload -> 'fields') field
    );
    select min((field ->> 'confidence')::numeric),
           bool_or(field ->> 'status' = 'pending')
    into v_confidence, v_has_pending
    from jsonb_array_elements(v_fields) field;
    insert into public.cms_ai_messages (
      session_id, actor_id, role, content_redacted, content_hash, risk,
      redaction_categories, token_count
    ) values (
      v_session.id, p_actor_id, 'user', p_payload ->> 'prompt', p_payload ->> 'promptHash',
      p_payload ->> 'risk',
      array(select jsonb_array_elements_text(coalesce(p_payload -> 'redactionCategories', '[]'::jsonb))),
      v_input_tokens
    );
    insert into public.cms_ai_tool_calls (
      session_id, actor_id, tool_key, status, arguments_redacted, arguments_hash,
      output_summary_redacted, output_hash, policy_decision, permission_key,
      input_tokens, output_tokens, correlation_id, completed_at
    ) values (
      v_session.id, p_actor_id, v_tool_key, 'succeeded',
      jsonb_build_object('sourceRef', p_payload ->> 'sourceRef', 'proposalKind', p_payload ->> 'proposalKind'),
      p_request_hash, p_payload ->> 'summary', p_payload ->> 'proposalHash',
      'allow', case when v_tool_key = 'draft.propose_patch' then 'cms:ai.draft' else 'cms:ai.read' end,
      v_input_tokens, v_output_tokens, p_correlation_id, now()
    );
    insert into public.cms_ai_proposals (
      session_id, actor_id, proposal_kind, summary, target_ref, fields,
      diff, source_ids, confidence, has_pending_fields, proposal_hash
    ) values (
      v_session.id, p_actor_id, p_payload ->> 'proposalKind', p_payload ->> 'summary',
      nullif(p_payload ->> 'targetRef', ''), v_fields, p_payload -> 'diff', array[v_source_id],
      v_confidence, v_has_pending,
      p_payload ->> 'proposalHash'
    ) returning id into v_proposal_id;
    insert into public.cms_ai_messages (
      session_id, actor_id, role, content_redacted, content_hash, risk, token_count
    ) values (
      v_session.id, p_actor_id, 'assistant', p_payload ->> 'summary',
      p_payload ->> 'proposalHash', 'safe', v_output_tokens
    );
    update public.cms_ai_sessions
    set tokens_used = tokens_used + v_input_tokens + v_output_tokens, updated_at = now()
    where id = v_session.id;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'sessionId', v_session.id, 'proposalId', v_proposal_id,
      'sourceId', v_source_id, 'proposalHash', p_payload ->> 'proposalHash',
      'confidence', v_confidence, 'hasPendingFields', v_has_pending,
      'applied', false, 'published', false, 'costMicros', 0,
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_events (actor_id, session_id, proposal_id, event_type, correlation_id, details)
    values (p_actor_id, v_session.id, v_proposal_id, 'ai_proposal_created', p_correlation_id,
      jsonb_build_object('kind', p_payload ->> 'proposalKind', 'tool', v_tool_key, 'applied', false));

  elsif p_action = 'decide_proposal' then
    select p.* into v_proposal from public.cms_ai_proposals p
    join public.cms_ai_sessions s on s.id = p.session_id
    where p.id = (p_payload ->> 'proposalId')::uuid
      and s.environment = p_environment and s.site_key = p_site_key
      and s.retention_until > now()
    for update of p, s;
    if not found then raise exception 'CMS_AI_PROPOSAL_NOT_FOUND' using errcode = 'PT404'; end if;
    if v_proposal.status <> 'proposed' then
      raise exception 'CMS_AI_PROPOSAL_ALREADY_DECIDED' using errcode = 'PT409';
    end if;
    if v_proposal.proposal_hash <> p_payload ->> 'expectedProposalHash' then
      raise exception 'CMS_AI_PROPOSAL_CONFLICT' using errcode = 'PT409';
    end if;
    if v_proposal.actor_id = p_actor_id then
      raise exception 'CMS_AI_REVIEWER_SEPARATION_REQUIRED' using errcode = 'PT409';
    end if;
    v_decision := p_payload ->> 'decision';
    if coalesce(v_decision, '') not in ('accepted', 'rejected', 'edited')
       or char_length(btrim(coalesce(p_payload ->> 'rationale', ''))) not between 3 and 1000 then
      raise exception 'CMS_AI_DECISION_INVALID' using errcode = '22023';
    end if;
    if v_decision = 'accepted' and v_proposal.has_pending_fields then
      raise exception 'CMS_AI_LOW_CONFIDENCE_PENDING' using errcode = 'PT409';
    end if;
    if v_decision = 'edited' then
      if jsonb_typeof(p_payload -> 'editedFields') is distinct from 'array' then
        raise exception 'CMS_AI_EDIT_INVALID' using errcode = '22023';
      end if;
      if jsonb_array_length(p_payload -> 'editedFields') <> jsonb_array_length(v_proposal.fields)
         or (
           select count(distinct edited ->> 'path')
           from jsonb_array_elements(p_payload -> 'editedFields') edited
         ) <> jsonb_array_length(v_proposal.fields)
         or exists (
           select 1
           from jsonb_array_elements(p_payload -> 'editedFields') edited
           where coalesce(edited ->> 'path', '') = ''
              or btrim(coalesce(edited ->> 'value', '')) = ''
              or (
                select count(*) from jsonb_array_elements(v_proposal.fields) original
                where original ->> 'path' = edited ->> 'path'
              ) <> 1
         ) then
        raise exception 'CMS_AI_EDIT_INVALID' using errcode = '22023';
      end if;
      select jsonb_agg(
        original || jsonb_build_object(
          'value', edited ->> 'value',
          'status', 'human_verified'
        )
        order by original ->> 'path'
      )
      into v_fields
      from jsonb_array_elements(v_proposal.fields) original
      join jsonb_array_elements(p_payload -> 'editedFields') edited
        on edited ->> 'path' = original ->> 'path';
      if v_fields is null or jsonb_array_length(v_fields) <> jsonb_array_length(v_proposal.fields) then
        raise exception 'CMS_AI_EDIT_INVALID' using errcode = '22023';
      end if;
    end if;
    insert into public.cms_ai_approvals (
      proposal_id, proposal_hash, decision, decided_by, rationale, edited_fields
    ) values (
      v_proposal.id, v_proposal.proposal_hash, v_decision, p_actor_id,
      p_payload ->> 'rationale', case when v_decision = 'edited' then v_fields end
    );
    update public.cms_ai_proposals set
      status = v_decision, decided_at = now(), decided_by = p_actor_id,
      fields = case when v_decision = 'edited' then v_fields else fields end,
      has_pending_fields = case when v_decision = 'edited' then false else has_pending_fields end,
      lock_version = lock_version + 1
    where id = v_proposal.id;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'proposalId', v_proposal.id, 'decision', v_decision,
      'applied', false, 'published', false, 'correlationId', p_correlation_id
    );
    insert into public.cms_ai_events (actor_id, session_id, proposal_id, event_type, correlation_id, details)
    values (p_actor_id, v_proposal.session_id, v_proposal.id, 'ai_proposal_decided', p_correlation_id,
      jsonb_build_object('decision', v_decision, 'applied', false));

  elsif p_action = 'close_session' then
    update public.cms_ai_sessions set status = 'closed', closed_at = now(), updated_at = now()
    where id = (p_payload ->> 'sessionId')::uuid and actor_id = p_actor_id
      and environment = p_environment and site_key = p_site_key and status = 'active'
    returning * into v_session;
    if not found then raise exception 'CMS_AI_SESSION_NOT_FOUND' using errcode = 'PT404'; end if;
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'sessionId', v_session.id, 'status', 'closed',
      'correlationId', p_correlation_id
    );
    insert into public.cms_ai_events (actor_id, session_id, event_type, correlation_id)
    values (p_actor_id, v_session.id, 'ai_session_closed', p_correlation_id);

  else
    v_passed := coalesce((p_payload ->> 'bypassCount')::integer, -1) = 0
      and coalesce((p_payload ->> 'piiLeakCount')::integer, -1) = 0
      and coalesce((p_payload ->> 'sourceCoverage')::numeric, -1) >= 1
      and coalesce((p_payload ->> 'fieldPrecision')::numeric, -1) >= 0.95
      and coalesce((p_payload ->> 'permissionPassRate')::numeric, -1) >= 1;
    insert into public.cms_ai_eval_runs (
      actor_id, environment, suite_key, provider_mode, model_key, prompt_version,
      tool_catalog_version, dataset_hash, metrics, bypass_count, pii_leak_count,
      source_coverage, field_precision, permission_pass_rate, passed, correlation_id
    ) values (
      p_actor_id, p_environment, p_payload ->> 'suiteKey', 'synthetic', 'deterministic-v1',
      'f015-v1', 1, p_payload ->> 'datasetHash', p_payload -> 'metrics',
      (p_payload ->> 'bypassCount')::integer, (p_payload ->> 'piiLeakCount')::integer,
      (p_payload ->> 'sourceCoverage')::numeric, (p_payload ->> 'fieldPrecision')::numeric,
      (p_payload ->> 'permissionPassRate')::numeric, v_passed, p_correlation_id
    );
    v_response := jsonb_build_object(
      'schemaVersion', 1, 'passed', v_passed, 'correlationId', p_correlation_id
    );
    insert into public.cms_ai_events (actor_id, event_type, correlation_id, details)
    values (p_actor_id, 'ai_eval_recorded', p_correlation_id,
      jsonb_build_object('passed', v_passed, 'suiteKey', p_payload ->> 'suiteKey'));
  end if;

  update public.cms_ai_command_receipts
  set response = v_response, completed_at = now()
  where id = v_receipt.id;
  return v_response;
end;
$$;

create function private.cms_purge_expired_ai_data(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session_ids uuid[] := '{}'::uuid[];
  v_affected integer := 0;
  v_deleted integer := 0;
  v_cutoff timestamptz := now() - interval '23 hours 55 minutes';
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'CMS_AI_RETENTION_LIMIT_INVALID' using errcode = '22023';
  end if;

  select coalesce(array_agg(due.id), '{}'::uuid[])
  into v_session_ids
  from (
    select session_row.id
    from public.cms_ai_sessions session_row
    where session_row.retention_until <= now()
    order by session_row.retention_until, session_row.id
    for update skip locked
    limit p_limit
  ) due;

  delete from public.cms_ai_events
  where session_id = any(v_session_ids)
     or (session_id is null and created_at <= v_cutoff);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_command_receipts where created_at <= v_cutoff;
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_tool_calls
  where session_id = any(v_session_ids)
     or (session_id is null and created_at <= v_cutoff);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_eval_runs where created_at <= v_cutoff;
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_approvals approval
  where exists (
    select 1 from public.cms_ai_proposals proposal
    where proposal.id = approval.proposal_id
      and proposal.session_id = any(v_session_ids)
  );
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_proposals where session_id = any(v_session_ids);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_messages where session_id = any(v_session_ids);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_sources where session_id = any(v_session_ids);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  delete from public.cms_ai_sessions where id = any(v_session_ids);
  get diagnostics v_affected = row_count;
  v_deleted := v_deleted + v_affected;

  return jsonb_build_object(
    'schemaVersion', 1,
    'expiredSessionsSelected', cardinality(v_session_ids),
    'deletedRows', v_deleted,
    'providerMode', 'synthetic'
  );
end;
$$;

do $$
declare
  v_job_command text;
begin
  select command into v_job_command
  from cron.job
  where jobname = 'cms-ai-retention-every-5m'
  limit 1;

  if found and v_job_command <> 'select private.cms_purge_expired_ai_data(1000);' then
    raise exception 'CMS_AI_RETENTION_JOB_CONFLICT' using errcode = '23514';
  end if;
  if not found then
    perform cron.schedule(
      'cms-ai-retention-every-5m',
      '*/5 * * * *',
      'select private.cms_purge_expired_ai_data(1000);'
    );
  end if;
end;
$$;

alter table public.cms_ai_policy_versions enable row level security;
alter table public.cms_ai_tools enable row level security;
alter table public.cms_ai_sessions enable row level security;
alter table public.cms_ai_sources enable row level security;
alter table public.cms_ai_messages enable row level security;
alter table public.cms_ai_proposals enable row level security;
alter table public.cms_ai_approvals enable row level security;
alter table public.cms_ai_tool_calls enable row level security;
alter table public.cms_ai_eval_runs enable row level security;
alter table public.cms_ai_command_receipts enable row level security;
alter table public.cms_ai_events enable row level security;

revoke all on table
  public.cms_ai_policy_versions,
  public.cms_ai_tools,
  public.cms_ai_sessions,
  public.cms_ai_sources,
  public.cms_ai_messages,
  public.cms_ai_proposals,
  public.cms_ai_approvals,
  public.cms_ai_tool_calls,
  public.cms_ai_eval_runs,
  public.cms_ai_command_receipts,
  public.cms_ai_events
from public, anon, authenticated;

grant all on table
  public.cms_ai_policy_versions,
  public.cms_ai_tools,
  public.cms_ai_sessions,
  public.cms_ai_sources,
  public.cms_ai_messages,
  public.cms_ai_proposals,
  public.cms_ai_approvals,
  public.cms_ai_tool_calls,
  public.cms_ai_eval_runs,
  public.cms_ai_command_receipts,
  public.cms_ai_events
to service_role;

revoke all on function private.cms_ai_individual_flag_context(uuid, text)
  from public, anon, authenticated;
revoke all on function private.cms_ai_contains_sensitive_text(jsonb)
  from public, anon, authenticated;
revoke all on function private.cms_ai_assert_available(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.cms_purge_expired_ai_data(integer)
  from public, anon, authenticated;
revoke all on function public.cms_ai_capability(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_get_ai_workspace(uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.cms_execute_ai_command(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.cms_ai_capability(uuid, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.cms_get_ai_workspace(uuid, text, text, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.cms_execute_ai_command(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, text, text
) to service_role;
