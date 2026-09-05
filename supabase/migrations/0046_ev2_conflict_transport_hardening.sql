-- EV2.7 — preserva conflitos de negócio sem acionar retries de serialização do PostgREST.

do $migration$
declare
  target record;
  definition text;
  rewritten text;
  occurrence_count integer;
begin
  for target in
    select *
    from (values
      (
        'public.cms_execute_release_v2_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
        4
      ),
      (
        'public.cms_execute_collaboration_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
        3
      ),
      (
        'public.cms_execute_bulk_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)'::regprocedure,
        6
      )
    ) as expected(procedure_id, expected_occurrences)
  loop
    select pg_get_functiondef(target.procedure_id) into strict definition;
    occurrence_count := (
      length(definition) - length(replace(definition, '''40001''', ''))
    ) / length('''40001''');
    if occurrence_count <> target.expected_occurrences then
      raise exception 'EV2_CONFLICT_TRANSPORT_DEFINITION_MISMATCH: % expected %, found %',
        target.procedure_id, target.expected_occurrences, occurrence_count;
    end if;
    rewritten := replace(definition, '''40001''', '''PT409''');
    execute rewritten;
  end loop;
end;
$migration$;
