-- EV2.13 — manifesto agregado de elegibilidade runtime para o frontend administrativo.
-- Somente overrides individuais em local/staging podem habilitar capacidades.
-- Produção, escopos amplos, ausência de função/flag e qualquer erro permanecem fail-closed.

create function public.cms_runtime_capability_manifest(
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
    'ev2.release_skeleton',
    'ev2.draft_v2',
    'ev2.master_data',
    'ev2.pim_v2',
    'ev2.dam',
    'ev2.search_quality',
    'ev2.collaboration_bulk',
    'ev2.rbac_scoped',
    'ev2.visual_studio',
    'ev2.multisite',
    'ev2.ai_assist',
    'ev2.ai_execute',
    'ev2.system_assurance'
  ];
  v_key text;
  v_evaluation jsonb;
  v_capabilities jsonb := '{}'::jsonb;
  v_runtime_allowed boolean := p_environment in ('local', 'staging') and p_site_key = 'main';
  v_individual_override_count integer;
  v_broad_override_count integer;
begin
  if p_actor_id is null
     or p_aal not in ('aal1', 'aal2')
     or p_session_id is null
     or char_length(p_session_id) not between 1 and 200
     or p_issued_at is null then
    v_runtime_allowed := false;
  end if;

  foreach v_key in array v_keys loop
    if v_runtime_allowed then
      v_evaluation := public.cms_evaluate_feature_flag(
        p_actor_id,
        v_key,
        p_environment,
        p_site_key,
        p_aal,
        p_session_id,
        p_issued_at
      );
      select count(*)::integer
      into v_individual_override_count
      from public.cms_feature_flag_overrides override
      where override.flag_key = v_key
        and override.environment = p_environment
        and override.scope_type = 'user'
        and override.scope_key = p_actor_id::text
        and override.enabled
        and override.starts_at <= now()
        and override.expires_at > now()
        and override.expires_at - override.starts_at <= interval '30 minutes';

      select count(*)::integer
      into v_broad_override_count
      from public.cms_feature_flag_overrides override
      where override.flag_key = v_key
        and override.environment = p_environment
        and override.scope_type in ('site', 'environment', 'global')
        and override.starts_at <= now()
        and override.expires_at > now();

      if coalesce((v_evaluation ->> 'enabled')::boolean, false)
         and (
           v_individual_override_count <> 1
           or v_broad_override_count <> 0
         ) then
        v_evaluation := jsonb_build_object(
          'schemaVersion', 1,
          'key', v_key,
          'enabled', false,
          'source', 'unavailable',
          'evaluatedAt', now()
        );
      end if;
    else
      v_evaluation := jsonb_build_object(
        'schemaVersion', 1,
        'key', v_key,
        'enabled', false,
        'source', 'unavailable',
        'evaluatedAt', now()
      );
    end if;
    v_capabilities := v_capabilities || jsonb_build_object(v_key, v_evaluation);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'status', case
      when p_environment = 'production' then 'gated'
      when v_runtime_allowed then 'ready'
      else 'unavailable'
    end,
    'environment', case
      when p_environment in ('local', 'staging', 'production') then p_environment
      else null
    end,
    'siteKey', case when p_site_key = 'main' then p_site_key else null end,
    'evaluatedAt', now(),
    'capabilities', v_capabilities
  );
end;
$$;

comment on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
is 'Returns the fail-closed EV2 frontend capability manifest; exactly one active per-user override of at most 30 minutes and no parallel broad override are required in local/staging.';

revoke all on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)
to service_role;
