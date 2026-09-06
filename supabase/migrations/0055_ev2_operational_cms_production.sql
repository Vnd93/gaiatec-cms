-- EV2.17 — operacionalização controlada do CMS em produção.
-- Mantém default-off, exige MFA, override individual, ausência de override amplo
-- e um segundo interruptor no ambiente das Edge Functions.

do $$
declare
  constraint_record record;
  definition text;
begin
  for constraint_record in
    select c.oid, n.nspname as schema_name, t.relname as table_name, c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c'
      and n.nspname = 'public'
      and pg_get_constraintdef(c.oid) like '%environment%local%staging%'
      and pg_get_constraintdef(c.oid) not like '%production%'
  loop
    definition := replace(
      pg_get_constraintdef(constraint_record.oid),
      '''local''::text, ''staging''::text',
      '''local''::text, ''staging''::text, ''production''::text'
    );
    definition := replace(
      definition,
      '''local'', ''staging''',
      '''local'', ''staging'', ''production'''
    );
    execute format(
      'alter table %I.%I drop constraint %I, add constraint %I %s not valid',
      constraint_record.schema_name,
      constraint_record.table_name,
      constraint_record.conname,
      constraint_record.conname,
      definition
    );
    execute format(
      'alter table %I.%I validate constraint %I',
      constraint_record.schema_name,
      constraint_record.table_name,
      constraint_record.conname
    );
  end loop;
end;
$$;

-- As funções continuam protegidas por RBAC, MFA, escopo, flag individual e
-- idempotência. Esta transformação remove apenas o bloqueio histórico de ambiente.
do $$
declare
  function_record record;
  original_definition text;
  operational_definition text;
begin
  for function_record in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname like 'cms\_%' escape '\'
      and p.proname <> 'cms_runtime_capability_manifest'
  loop
    original_definition := pg_get_functiondef(function_record.oid);
    operational_definition := replace(
      original_definition,
      'not in (''local'', ''staging'')',
      'not in (''local'', ''staging'', ''production'')'
    );
    operational_definition := replace(
      operational_definition,
      'in (''local'', ''staging'')',
      'in (''local'', ''staging'', ''production'')'
    );
    operational_definition := regexp_replace(
      operational_definition,
      'if p_environment = ''production'' then\s+raise exception ''CMS_DAM_PRODUCTION_GATED'' using errcode = ''42501'';\s+end if;',
      '',
      'gi'
    );
    operational_definition := regexp_replace(
      operational_definition,
      'if v_user_count = 1 and v_user_enabled and v_user_environment = ''production'' then\s+return jsonb_build_object\(''mode'', ''deny'', ''source'', ''production_not_available''\);\s+end if;',
      '',
      'gi'
    );
    if operational_definition is distinct from original_definition then
      execute operational_definition;
    end if;
  end loop;
end;
$$;

create or replace function public.cms_runtime_capability_manifest(
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
set search_path = public, pg_temp
as $$
declare
  v_keys constant text[] := array[
    'ev2.release_skeleton', 'ev2.draft_v2', 'ev2.master_data', 'ev2.pim_v2',
    'ev2.dam', 'ev2.search_quality', 'ev2.collaboration_bulk', 'ev2.rbac_scoped',
    'ev2.visual_studio', 'ev2.multisite', 'ev2.ai_assist', 'ev2.ai_execute',
    'ev2.system_assurance'
  ];
  v_key text;
  v_evaluation jsonb;
  v_capabilities jsonb := '{}'::jsonb;
  v_runtime_allowed boolean := p_environment in ('local', 'staging', 'production') and p_site_key = 'main';
  v_individual_override_count integer;
  v_broad_override_count integer;
  v_max_override_duration interval := case
    when p_environment = 'production' then interval '365 days'
    else interval '30 minutes'
  end;
begin
  if p_actor_id is null
     or p_aal not in ('aal1', 'aal2')
     or (p_environment = 'production' and p_aal <> 'aal2')
     or p_session_id is null
     or char_length(p_session_id) not between 1 and 200
     or p_issued_at is null then
    v_runtime_allowed := false;
  end if;

  foreach v_key in array v_keys loop
    if v_runtime_allowed then
      v_evaluation := public.cms_evaluate_feature_flag(
        p_actor_id, v_key, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
      );
      select count(*)::integer into v_individual_override_count
      from public.cms_feature_flag_overrides override
      where override.flag_key = v_key
        and override.environment = p_environment
        and override.scope_type = 'user'
        and override.scope_key = p_actor_id::text
        and override.enabled
        and override.starts_at <= now()
        and override.expires_at > now()
        and override.expires_at - override.starts_at <= v_max_override_duration;

      select count(*)::integer into v_broad_override_count
      from public.cms_feature_flag_overrides override
      where override.flag_key = v_key
        and override.environment = p_environment
        and override.scope_type in ('site', 'environment', 'global')
        and override.starts_at <= now()
        and override.expires_at > now();

      if coalesce((v_evaluation ->> 'enabled')::boolean, false)
         and (v_individual_override_count <> 1 or v_broad_override_count <> 0) then
        v_evaluation := jsonb_build_object(
          'schemaVersion', 1, 'key', v_key, 'enabled', false,
          'source', 'unavailable', 'evaluatedAt', now()
        );
      end if;
    else
      v_evaluation := jsonb_build_object(
        'schemaVersion', 1, 'key', v_key, 'enabled', false,
        'source', 'unavailable', 'evaluatedAt', now()
      );
    end if;
    v_capabilities := v_capabilities || jsonb_build_object(v_key, v_evaluation);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', case when v_runtime_allowed then 'ready' else 'unavailable' end,
    'environment', case when p_environment in ('local', 'staging', 'production') then p_environment else null end,
    'siteKey', case when p_site_key = 'main' then p_site_key else null end,
    'evaluatedAt', now(),
    'capabilities', v_capabilities
  );
end;
$$;

comment on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
is 'Manifesto EV2 fail-closed. Produção exige AAL2, exatamente um override individual por capacidade e nenhum override amplo.';

create table public.cms_ai_provider_calls (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  session_id uuid not null references public.cms_ai_sessions (id) on delete restrict,
  provider text not null check (provider = 'openrouter'),
  model_key text not null check (model_key = 'nvidia/nemotron-3.5-lightning:free'),
  input_tokens integer not null check (input_tokens > 0 and input_tokens <= 4000),
  output_tokens integer not null check (output_tokens > 0 and output_tokens <= 1000),
  status text not null check (status in ('succeeded', 'failed')),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create index cms_ai_provider_calls_actor_idx
  on public.cms_ai_provider_calls (actor_id, created_at desc);

alter table public.cms_ai_provider_calls enable row level security;
revoke all on table public.cms_ai_provider_calls from public, anon, authenticated;
grant all on table public.cms_ai_provider_calls to service_role;

-- No modo OpenRouter, o proponente é o modelo e o usuário autenticado é o
-- revisor humano. Isso preserva separação entre geração e decisão mesmo na
-- operação individual declarada pelo responsável do projeto.
do $$
declare
  original_definition text;
  operational_definition text;
begin
  select pg_get_functiondef(p.oid) into original_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cms_execute_ai_command'
  order by p.oid desc
  limit 1;

  operational_definition := regexp_replace(
    original_definition,
    'if v_proposal\.actor_id = p_actor_id then\s+raise exception ''CMS_AI_REVIEWER_SEPARATION_REQUIRED'' using errcode = ''PT409'';\s+end if;',
    'if v_proposal.actor_id = p_actor_id and not exists (select 1 from public.cms_ai_provider_calls provider_call where provider_call.session_id = v_proposal.session_id and provider_call.actor_id = p_actor_id and provider_call.provider = ''openrouter'' and provider_call.status = ''succeeded'') then raise exception ''CMS_AI_REVIEWER_SEPARATION_REQUIRED'' using errcode = ''PT409''; end if;',
    'gi'
  );
  if operational_definition is not distinct from original_definition then
    raise exception 'CMS_AI_SINGLE_OPERATOR_PATCH_NOT_APPLIED' using errcode = 'P0001';
  end if;
  execute operational_definition;
end;
$$;

revoke all on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
to service_role;
