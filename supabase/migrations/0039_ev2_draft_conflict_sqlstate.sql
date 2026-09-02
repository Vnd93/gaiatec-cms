-- EV2.2 — conflitos de versão são erros de domínio, não falhas de serialização retentáveis.
-- Mantém a migration 0038 imutável e substitui somente o SQLSTATE da função já instalada.

do $migration$
declare
  v_signature constant regprocedure := 'public.cms_execute_draft_v2_command(uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure;
  v_definition text;
  v_matches integer;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  select count(*) into v_matches
  from regexp_matches(v_definition, 'ERRCODE\s*=\s*''40001''', 'gi');

  if v_matches <> 3 then
    raise exception 'EV2_DRAFT_CONFLICT_PATCH_REFUSED: expected 3 SQLSTATE occurrences, found %', v_matches;
  end if;

  v_definition := regexp_replace(
    v_definition,
    'ERRCODE\s*=\s*''40001''',
    'ERRCODE = ''P0001''',
    'gi'
  );
  execute v_definition;
end;
$migration$;
