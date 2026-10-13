begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Explicit user requirement 2026-10-13: admin read p95 <= 2147ms in exact
-- staging and production. This is not production deployment authorization.
-- Install the compatible frontend before applying; keep 0116 immutable.
-- Preserve sampling, commands, authorization, audit and every pg_proc attribute.
do $admin_read_budget$
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
     'c7f2b54924d42eee69f1275323f980170d266cc9609d8e8669ae67d4ae3a70c0',
     'f97d18175d4acc1ed9a1a1076ce3546f99c095c643b669cdf8a6fd4a046fb864',
     '''adminReadP95Ms'', case when p_environment = ''staging'' then 2000 else 500 end',
     '''adminReadP95Ms'', case when p_environment in (''staging'',''production'') then 2147 else 500 end'),
    ('public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)',
     'dee24278b56cacaa1c72febbf12bcc9fb23e381b37a052620f1b8964996942cb',
     '4ae46a175ebb0a817bfb833f3b2e1b933cfb2e6497b1c06000623cdc362cb2fc',
     '(p_payload #>> ''{metrics,adminReadP95Ms}'')::numeric <= (case when p_environment = ''staging'' then 2000 else 500 end), false)',
     '(p_payload #>> ''{metrics,adminReadP95Ms}'')::numeric <= (case when p_environment in (''staging'',''production'') then 2147 else 500 end), false)')
  ) as targets(signature, before_sha256, after_sha256, old_text, new_text)
  loop
    v_function := to_regprocedure(v_target.signature);
    if v_function is null then raise exception 'CMS_ADMIN_READ_BUDGET_FUNCTION_MISSING'; end if;
    select p.prosrc, to_jsonb(p) - 'prosrc' into v_source, v_attributes
      from pg_catalog.pg_proc p where p.oid = v_function;
    if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_target.before_sha256
       or (length(v_source) - length(replace(v_source, v_target.old_text, '')))
          / length(v_target.old_text) <> 1 then
      raise exception 'CMS_ADMIN_READ_BUDGET_SOURCE_DRIFT';
    end if;
    v_before := pg_get_functiondef(v_function);
    v_after := replace(v_before, v_target.old_text, v_target.new_text);
    execute v_after;
    if pg_get_functiondef(v_function) is distinct from v_after
       or (select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_function)
          is distinct from v_attributes
       or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
           from pg_catalog.pg_proc p where p.oid = v_function) <> v_target.after_sha256 then
      raise exception 'CMS_ADMIN_READ_BUDGET_POSTCONDITION_DRIFT';
    end if;
  end loop;
end;
$admin_read_budget$;
commit;
