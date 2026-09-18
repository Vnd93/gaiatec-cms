begin;

-- Keep the 0095 authenticated snapshot contract unchanged for rollback. The
-- timed boundary is additive: the new Edge unwraps its internal envelope,
-- while an older Edge can continue calling the original RPC without seeing
-- diagnostic fields in the public payload.
create function public.cms_get_system_snapshot_authenticated_timed(
  p_environment text,
  p_site_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, auth, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_issued_raw text := auth.jwt() ->> 'iat';
  v_aal text := case when auth.jwt() ->> 'aal' = 'aal2' then 'aal2' else 'aal1' end;
  v_rate_limit_key_hash text;
  v_rate_limit_started_at timestamptz;
  v_snapshot_started_at timestamptz;
  v_rate_limit_ms bigint;
  v_snapshot_core_ms bigint;
  v_snapshot jsonb;
begin
  if v_actor_id is null
     or v_session_id is null
     or char_length(v_session_id) not between 1 and 200
     or coalesce(v_issued_raw, '') !~ '^[0-9]+$' then
    raise exception 'CMS_SYSTEM_AUTH_INVALID' using errcode = '42501';
  end if;

  v_rate_limit_key_hash := encode(
    extensions.digest(convert_to(v_actor_id::text, 'UTF8'), 'sha256'), 'hex'
  );

  v_rate_limit_started_at := clock_timestamp();
  if public.consume_rate_limit(
       v_rate_limit_key_hash,
       'cms_system_snapshot',
       120,
       900
     ) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode = 'PT429';
  end if;
  v_rate_limit_ms := greatest(
    0::bigint,
    round(extract(epoch from clock_timestamp() - v_rate_limit_started_at) * 1000)::bigint
  );

  v_snapshot_started_at := clock_timestamp();
  v_snapshot := public.cms_get_system_snapshot(
    v_actor_id,
    p_environment,
    p_site_key,
    v_aal,
    v_session_id,
    to_timestamp(v_issued_raw::double precision),
    p_correlation_id
  );
  v_snapshot_core_ms := greatest(
    0::bigint,
    round(extract(epoch from clock_timestamp() - v_snapshot_started_at) * 1000)::bigint
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'snapshot', v_snapshot,
    'timing', jsonb_build_object(
      'rateLimitMs', v_rate_limit_ms,
      'snapshotCoreMs', v_snapshot_core_ms
    )
  );
end;
$$;

revoke all on function public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)
  from public, anon, service_role;
grant execute on function public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)
  to authenticated;

commit;
