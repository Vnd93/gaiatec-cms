begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- User approval 2026-10-06: admin read p95 <= 2000ms in staging only.
-- Install the compatible frontend through the bridge before this migration.
-- Local/production retain 500ms; command budgets and previous evidence do not
-- change. Bind both exact 0115 bodies and preserve every pg_proc attribute.
do $staging_read_budget$
declare
  v_target record;
  v_function regprocedure;
  v_before text;
  v_after text;
  v_source text;
  v_attributes jsonb;
begin
  for v_target in select * from (values
    ('public.cms_system_capability_unscoped_0076(uuid,text,text,text,text,timestamptz)',
     'd756d2f3d45ad9cd84b5597a83ae120b5d20912cb494667deaaf1805c98cc5cf',
     'c7f2b54924d42eee69f1275323f980170d266cc9609d8e8669ae67d4ae3a70c0',
     '''adminReadP95Ms'', 500',
     '''adminReadP95Ms'', case when p_environment = ''staging'' then 2000 else 500 end'),
    ('public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)',
     'e771baa3f64069ac3ca1759ee83a47f95df85d1f1cce3af3310d5655ef43eff0',
     'dee24278b56cacaa1c72febbf12bcc9fb23e381b37a052620f1b8964996942cb',
     '(p_payload #>> ''{metrics,adminReadP95Ms}'')::numeric <= 500, false)',
     '(p_payload #>> ''{metrics,adminReadP95Ms}'')::numeric <= (case when p_environment = ''staging'' then 2000 else 500 end), false)')
  ) as targets(signature, before_sha256, after_sha256, old_text, new_text)
  loop
    v_function := to_regprocedure(v_target.signature);
    if v_function is null then
      raise exception 'CMS_STAGING_READ_BUDGET_FUNCTION_MISSING';
    end if;
    select p.prosrc, to_jsonb(p) - 'prosrc' into v_source, v_attributes
      from pg_catalog.pg_proc p where p.oid = v_function;
    if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_target.before_sha256
       or (length(v_source) - length(replace(v_source, v_target.old_text, '')))
          / length(v_target.old_text) <> 1 then
      raise exception 'CMS_STAGING_READ_BUDGET_SOURCE_DRIFT';
    end if;
    v_before := pg_get_functiondef(v_function);
    v_after := replace(v_before, v_target.old_text, v_target.new_text);
    execute v_after;
    if pg_get_functiondef(v_function) is distinct from v_after
       or (select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_function)
          is distinct from v_attributes
       or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
           from pg_catalog.pg_proc p where p.oid = v_function) <> v_target.after_sha256 then
      raise exception 'CMS_STAGING_READ_BUDGET_POSTCONDITION_DRIFT';
    end if;
  end loop;
end;
$staging_read_budget$;
commit;
