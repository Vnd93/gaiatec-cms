-- Fase 8 — processamento periódico da outbox sem expor segredos no SQL.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_outbox_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, vault
as $$
declare
  worker_url text;
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into worker_url
  from vault.decrypted_secrets
  where name = 'cms_outbox_worker_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret
  into worker_secret
  from vault.decrypted_secrets
  where name = 'cms_outbox_worker_secret'
  order by updated_at desc
  limit 1;

  if nullif(btrim(worker_url), '') is null or nullif(btrim(worker_secret), '') is null then
    raise exception 'Outbox worker sem configuração segura no Vault.';
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_outbox_worker() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid
  into existing_job
  from cron.job
  where jobname = 'cms-outbox-worker-every-5m'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'cms-outbox-worker-every-5m',
    '*/5 * * * *',
    'select private.invoke_outbox_worker();'
  );
end;
$$;
