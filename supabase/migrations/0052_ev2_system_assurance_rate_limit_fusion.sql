-- EV2.11 / G11: consume the request budget in the same database transaction as the operation.
-- The wrappers are additive and service-role only; the original contracts remain available for rollback.

create function public.cms_system_capability_limited(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode = '22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash, 'cms_system_capability', 120, 900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  return public.cms_system_capability(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
  );
end;
$$;

create function public.cms_get_system_snapshot_limited(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode = '22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash, 'cms_system_snapshot', 120, 900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  return public.cms_get_system_snapshot(
    p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at, p_correlation_id
  );
end;
$$;

create function public.cms_retry_lead_delivery_limited(
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
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode = '22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash, 'cms_leads_retry_delivery', 60, 900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  return public.cms_retry_lead_delivery(
    p_actor_id, p_event_id, p_justification, p_environment, p_site_key, p_aal,
    p_session_id, p_issued_at, p_correlation_id, p_idempotency_key, p_request_hash
  );
end;
$$;

create function public.cms_execute_system_command_limited(
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
  p_idempotency_key uuid,
  p_request_hash text,
  p_rate_limit_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_action is null or p_action not in ('record_run', 'review_run') then
    raise exception 'CMS_SYSTEM_COMMAND_INVALID' using errcode = '22023';
  end if;
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode = '22023';
  end if;
  if public.consume_rate_limit(p_rate_limit_key_hash, 'cms_system_' || p_action, 20, 900) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  return public.cms_execute_system_command(
    p_actor_id, p_action, p_payload, p_environment, p_site_key, p_aal, p_session_id,
    p_issued_at, p_command_id, p_correlation_id, p_idempotency_key, p_request_hash
  );
end;
$$;

revoke all on function public.cms_system_capability_limited(
  uuid, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.cms_get_system_snapshot_limited(
  uuid, text, text, text, text, timestamptz, uuid, text
) from public, anon, authenticated;
revoke all on function public.cms_retry_lead_delivery_limited(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.cms_execute_system_command_limited(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.cms_system_capability_limited(
  uuid, text, text, text, text, timestamptz, text
) to service_role;
grant execute on function public.cms_get_system_snapshot_limited(
  uuid, text, text, text, text, timestamptz, uuid, text
) to service_role;
grant execute on function public.cms_retry_lead_delivery_limited(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, uuid, text, text
) to service_role;
grant execute on function public.cms_execute_system_command_limited(
  uuid, text, jsonb, text, text, text, text, timestamptz, uuid, uuid, uuid, text, text
) to service_role;
