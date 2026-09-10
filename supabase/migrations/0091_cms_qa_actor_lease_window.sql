begin;

-- A janela autenticada de staging precisa conter, alem do ciclo mutante do candidato, a travessia do
-- frontend de rollback, porque a travessia le o handoff das entidades nascidas na UI e essas entidades
-- so existem entre a criacao e a revogacao do ator mutante. Com a travessia dentro da janela, o
-- orcamento de prazos explicitos dessa janela passa de 110 para cerca de 165 minutos, e a lease do
-- ator sintetico tem de sobreviver a ela inteira, senao o watchdog varre um ator ainda em uso.
--
-- O prazo vive em dois lugares: no gatilho que grava a lease e na restricao da tabela, que e a
-- barreira que recusa uma lease longa demais. Os dois sobem juntos, de 119 para 240 minutos, que e o
-- mesmo teto do job. Nada mais muda: o watchdog continua varrendo leases expiradas de minuto em
-- minuto, os privilegios continuam os mesmos, e uma lease abandonada continua sendo recolhida
-- automaticamente, apenas mais tarde.
--
-- O gatilho e reescrito a partir da definicao instalada, e nao a partir do texto de 0061, porque 0086
-- ja o reparou depois disso. Recriar o corpo antigo reverteria aqueles reparos.

do $qa_lease_window$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('private.cms_capture_qa_actor_lease()'::regprocedure) into v_definition;
  v_original := v_definition;

  if position($old$interval '119 minutes'$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$interval '119 minutes'$old$,
      $new$interval '240 minutes'$new$
    );
  elsif position($new$interval '240 minutes'$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_LEASE_TTL_DRIFT' using errcode = 'P0001';
  end if;

  if position($old$'leaseMinutes', 119$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$'leaseMinutes', 119$old$,
      $new$'leaseMinutes', 240$new$
    );
  elsif position($new$'leaseMinutes', 240$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_LEASE_AUDIT_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$qa_lease_window$;

-- A janela dos overrides de feature flag e derivada do prazo da lease, e tem teto proprio. Ele sobe
-- junto, pelo mesmo motivo e com o mesmo cuidado: a definicao instalada e ajustada, nao reescrita.
do $qa_override_window$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  if position($old$interval '120 minutes'$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$interval '120 minutes'$old$,
      $new$interval '241 minutes'$new$
    );
  elsif position($new$interval '241 minutes'$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$qa_override_window$;

alter table private.cms_qa_actor_leases
  drop constraint if exists cms_qa_actor_leases_check1;
alter table private.cms_qa_actor_leases
  add constraint cms_qa_actor_leases_check1
  check (expires_at > created_at and expires_at <= created_at + interval '241 minutes');

do $qa_lease_window_probe$
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
  -- Os reparos de 0086 tem de continuar instalados: reescrever o corpo antigo os apagaria.
  if v_definition !~ 'transaction_timestamp\(\)' or v_definition !~ 'CMS_QA_ACTOR_METADATA_INVALID' then
    raise exception 'CMS_QA_LEASE_CAPTURE_REPAIRS_LOST' using errcode = '55000';
  end if;
  if regexp_replace(
       pg_get_functiondef(
         'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
       ), '[[:space:]]+', ' ', 'g'
     ) !~ 'interval ''241 minutes''' then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_NOT_APPLIED' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'private.cms_qa_actor_leases'::regclass
      and c.conname = 'cms_qa_actor_leases_check1'
      -- O Postgres renderiza o literal normalizado, entao a comparacao e pela forma canonica.
      and pg_get_constraintdef(c.oid) like '%04:01:00%'
  ) then
    raise exception 'CMS_QA_LEASE_WINDOW_CONSTRAINT_NOT_APPLIED' using errcode = '55000';
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
$qa_lease_window_probe$;

commit;
