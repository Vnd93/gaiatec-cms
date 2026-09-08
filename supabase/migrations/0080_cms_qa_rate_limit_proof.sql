-- Homologacao final: bucket de rate limit descartavel e isolado para a prova
-- autenticada de staging. A RPC nunca amplia o endpoint publico normal: somente
-- service_role pode chama-la, e toda operacao exige a lease QA exata e ativa.

create table private.cms_qa_rate_limit_proof_buckets (
  actor_id uuid not null references private.cms_qa_actor_leases (actor_id) on delete restrict,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  run_tag text not null check (run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  created_at timestamptz not null default statement_timestamp(),
  last_used_at timestamptz not null default statement_timestamp(),
  primary key (actor_id, key_hash),
  check (right(run_tag, 9) = ('-' || left(candidate_sha, 8)))
);

revoke all on table private.cms_qa_rate_limit_proof_buckets
  from public, anon, authenticated, service_role;

create or replace function private.cms_cleanup_terminal_qa_rate_limit_proofs_0080()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if old.status = 'active'
     and new.status in ('cleaned', 'expired')
     and new.status <> old.status then
    delete from public.request_rate_limits rate
    using private.cms_qa_rate_limit_proof_buckets bucket
    where bucket.actor_id = old.actor_id
      and rate.key_hash = bucket.key_hash
      and rate.action = 'cms_public_search_qa_proof';
    delete from private.cms_qa_rate_limit_proof_buckets bucket
    where bucket.actor_id = old.actor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cms_05_qa_rate_limit_proof_cleanup_0080
  on private.cms_qa_actor_leases;
create trigger cms_05_qa_rate_limit_proof_cleanup_0080
after update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_qa_rate_limit_proofs_0080();

create or replace function public.cms_qa_rate_limit_proof(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text,
  p_key_hash text,
  p_operation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_action constant text := 'cms_public_search_qa_proof';
  v_limit constant integer := 3;
  v_window_seconds constant integer := 3;
  v_allowed boolean;
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry_after integer := 0;
  v_removed integer := 0;
begin
  if p_environment <> 'staging'
     or p_run_tag is null
     or p_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or p_candidate_sha is null
     or p_candidate_sha !~ '^[0-9a-f]{40}$'
     or right(p_run_tag, 9) <> ('-' || left(p_candidate_sha, 8))
     or p_key_hash is null
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_operation not in ('consume', 'cleanup') then
    raise exception 'CMS_QA_RATE_LIMIT_PROOF_INVALID' using errcode = '22023';
  end if;

  select lease.* into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
    and lease.run_tag = p_run_tag
    and lease.candidate_sha = p_candidate_sha
    and lease.environment = 'staging'
  for share;

  if not found
     or v_lease.status <> 'active'
     or v_lease.expires_at <= clock_timestamp()
     or not private.cms_qa_actor_marker_is_exact(
       p_actor_id, p_run_tag, p_candidate_sha, 'staging'
     ) then
    raise exception 'CMS_QA_RATE_LIMIT_PROOF_FORBIDDEN' using errcode = '42501';
  end if;

  if p_operation = 'cleanup' then
    perform 1
    from private.cms_qa_rate_limit_proof_buckets bucket
    where bucket.actor_id = p_actor_id
      and bucket.key_hash = p_key_hash
      and bucket.run_tag = p_run_tag
      and bucket.candidate_sha = p_candidate_sha
    for update;
    if found then
      delete from public.request_rate_limits
      where key_hash = p_key_hash and action = v_action;
      get diagnostics v_removed = row_count;
      delete from private.cms_qa_rate_limit_proof_buckets bucket
      where bucket.actor_id = p_actor_id and bucket.key_hash = p_key_hash;
    end if;
    insert into public.cms_audit_log (
      actor_id, action, target_type, target_id, event_data, correlation_id
    ) values (
      p_actor_id,
      'cms:qa.rate_limit_proof_cleanup',
      'qa_fixture',
      p_run_tag,
      jsonb_build_object(
        'schemaVersion', 1,
        'syntheticOnly', true,
        'environment', 'staging',
        'candidateSha', p_candidate_sha,
        'bucketRemoved', v_removed = 1
      ),
      gen_random_uuid()
    );
    return jsonb_build_object(
      'schemaVersion', 1,
      'status', 'cleaned',
      'removed', v_removed = 1,
      'idempotent', true
    );
  end if;

  insert into private.cms_qa_rate_limit_proof_buckets (
    actor_id, key_hash, run_tag, candidate_sha
  ) values (
    p_actor_id, p_key_hash, p_run_tag, p_candidate_sha
  )
  on conflict (actor_id, key_hash) do update
    set last_used_at = statement_timestamp()
    where private.cms_qa_rate_limit_proof_buckets.run_tag = excluded.run_tag
      and private.cms_qa_rate_limit_proof_buckets.candidate_sha = excluded.candidate_sha;
  if not found then
    raise exception 'CMS_QA_RATE_LIMIT_PROOF_BINDING_CONFLICT' using errcode = '42501';
  end if;

  v_allowed := public.consume_rate_limit(
    p_key_hash, v_action, v_limit, v_window_seconds
  );
  select rate.window_started_at, rate.request_count
  into v_window_started_at, v_request_count
  from public.request_rate_limits rate
  where rate.key_hash = p_key_hash and rate.action = v_action;
  if not found then
    raise exception 'CMS_QA_RATE_LIMIT_PROOF_STATE_MISSING' using errcode = '55000';
  end if;
  if not v_allowed then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => v_window_seconds) - clock_timestamp()
      )))::integer
    );
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'status', case when v_allowed then 'allowed' else 'limited' end,
    'allowed', v_allowed,
    'limit', v_limit,
    'windowSeconds', v_window_seconds,
    'requestCount', v_request_count,
    'retryAfterSeconds', v_retry_after
  );
end;
$$;

revoke all on function public.cms_qa_rate_limit_proof(
  uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.cms_qa_rate_limit_proof(
  uuid, text, text, text, text, text
) to service_role;

revoke all on function private.cms_cleanup_terminal_qa_rate_limit_proofs_0080()
  from public, anon, authenticated, service_role;

comment on function public.cms_qa_rate_limit_proof(
  uuid, text, text, text, text, text
) is 'Staging-only QA rate-limit proof bound to an active exact actor lease; service_role only.';
