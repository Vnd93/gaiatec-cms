begin;

-- A janela autenticada de staging precisa conter, alem do ciclo mutante do candidato, a travessia do
-- frontend de rollback, porque a travessia le o handoff das entidades nascidas na UI e essas entidades
-- so existem entre a criacao e a revogacao do ator mutante. Com a travessia dentro da janela, o
-- orcamento de prazos explicitos dessa janela passa de 110 para cerca de 165 minutos, e a lease do
-- ator sintetico tem de sobreviver a ela inteira, senao o watchdog varre um ator ainda em uso.
--
-- A lease sobe de 119 para 240 minutos, que e o mesmo teto do job. Nada mais muda: o watchdog continua
-- varrendo leases expiradas de minuto em minuto, os privilegios continuam os mesmos, e uma lease
-- abandonada continua sendo recolhida automaticamente, apenas mais tarde.

create or replace function private.cms_capture_qa_actor_lease()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_run_tag text;
  v_candidate_sha text;
  v_environment text;
  v_created_at timestamptz := statement_timestamp();
begin
  if not (
    new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
    and new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
  ) then
    return new;
  end if;

  v_run_tag := new.raw_user_meta_data ->> 'runTag';
  v_candidate_sha := new.raw_user_meta_data ->> 'candidateSha';
  v_environment := new.raw_user_meta_data ->> 'environment';

  if v_run_tag is null
     or v_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or v_candidate_sha is null
     or v_candidate_sha !~ '^[0-9a-f]{40}$'
     or right(v_run_tag, 9) <> ('-' || left(v_candidate_sha, 8))
     or v_environment is null
     or v_environment not in ('staging', 'production') then
    raise exception 'CMS_QA_ACTOR_METADATA_INVALID' using errcode = '22023';
  end if;

  insert into private.cms_qa_actor_leases (
    actor_id,
    run_tag,
    candidate_sha,
    environment,
    created_at,
    expires_at
  ) values (
    new.id,
    v_run_tag,
    v_candidate_sha,
    v_environment,
    v_created_at,
    v_created_at + interval '240 minutes'
  );

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    new.id,
    'cms:qa.fixture_lease_created',
    'qa_fixture',
    v_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'environment', v_environment,
      'candidateSha', v_candidate_sha,
      'leaseMinutes', 240
    ),
    gen_random_uuid()
  );

  return new;
end;
$$;

do $qa_lease_ttl_probe$
declare
  v_definition text;
begin
  v_definition := regexp_replace(
    pg_get_functiondef('private.cms_capture_qa_actor_lease()'::regprocedure),
    '[[:space:]]+', ' ', 'g'
  );
  if v_definition !~ 'interval ''240 minutes''' then
    raise exception 'CMS_QA_LEASE_TTL_NOT_APPLIED' using errcode = '55000';
  end if;
  if v_definition ~ 'interval ''119 minutes''' then
    raise exception 'CMS_QA_LEASE_TTL_STALE' using errcode = '55000';
  end if;
  if has_function_privilege('authenticated', 'private.cms_capture_qa_actor_lease()', 'EXECUTE') then
    raise exception 'CMS_QA_LEASE_TRIGGER_PRIVILEGE_WIDENED' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'cms_capture_qa_actor_lease'
      and not t.tgisinternal
  ) then
    raise exception 'CMS_QA_LEASE_TRIGGER_MISSING' using errcode = '55000';
  end if;
end;
$qa_lease_ttl_probe$;

commit;
