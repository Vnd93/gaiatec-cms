-- EV2.4 — conflitos otimistas são erros de domínio, não falhas de serialização retentáveis.
-- Mantém a migration 0041 imutável e substitui somente os dois SQLSTATEs da função instalada.

do $migration$
declare
  v_signature constant regprocedure := 'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure;
  v_definition text;
  v_matches integer;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  select count(*) into v_matches
  from regexp_matches(v_definition, 'ERRCODE\s*=\s*''40001''', 'gi');

  if v_matches <> 2 then
    raise exception 'EV2_PIM_CONFLICT_PATCH_REFUSED: expected 2 SQLSTATE occurrences, found %', v_matches;
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
