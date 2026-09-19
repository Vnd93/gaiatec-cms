begin;

-- Keep the existing limited retry contract unchanged for rollback. The timed
-- boundary consumes the same rate-limit bucket exactly once, executes the same
-- scoped mutation exactly once and returns diagnostics only inside an internal
-- service-role envelope that the Edge function unwraps.
create function public.cms_retry_lead_delivery_limited_timed(
  p_actor_id uuid,
  p_event_id uuid,
  p_justification text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_rate_limit_started_at timestamptz;
  v_command_started_at timestamptz;
  v_rate_limit_ms bigint;
  v_command_core_ms bigint;
  v_result jsonb;
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode = '22023';
  end if;

  v_rate_limit_started_at := clock_timestamp();
  if public.consume_rate_limit(
       p_rate_limit_key_hash,
       'cms_leads_retry_delivery',
       60,
       900
     ) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  v_rate_limit_ms := greatest(
    0::bigint,
    round(extract(epoch from clock_timestamp() - v_rate_limit_started_at) * 1000)::bigint
  );

  v_command_started_at := clock_timestamp();
  v_result := public.cms_retry_lead_delivery_scoped(
    p_actor_id,
    p_event_id,
    p_justification,
    p_environment,
    p_site_key,
    p_aal,
    p_session_id,
    p_issued_at,
    p_correlation_id,
    p_idempotency_key,
    p_request_hash
  );
  v_command_core_ms := greatest(
    0::bigint,
    round(extract(epoch from clock_timestamp() - v_command_started_at) * 1000)::bigint
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'result', v_result,
    'timing', jsonb_build_object(
      'rateLimitMs', v_rate_limit_ms,
      'commandCoreMs', v_command_core_ms
    )
  );
end;
$$;

revoke all on function public.cms_retry_lead_delivery_limited_timed(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.cms_retry_lead_delivery_limited_timed(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text,text
) to service_role;

comment on function public.cms_retry_lead_delivery_limited_timed(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text,text
) is 'Executa um retry limitado uma unica vez e devolve subfases internas de rate limit e core.';

commit;
