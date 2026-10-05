begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- User approval 2026-10-05: command p95 <= 2000ms in staging only.
-- Install the compatible frontend through the bridge before this migration.
-- Local/production stay at 800ms. Old evidence and every security attribute
-- remain unchanged. Exact source digests prevent patching an unknown function.
do $staging_command_budget$
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
     'f20104ea66fd142eb027d73357e2b6d6a8c92535e2efc4d6413db4da2889f9d5',
     'd756d2f3d45ad9cd84b5597a83ae120b5d20912cb494667deaaf1805c98cc5cf',
     '''commandP95Ms'', 800',
     '''commandP95Ms'', case when p_environment = ''staging'' then 2000 else 800 end'),
    ('public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)',
     '841833dd83ec068f85c6b42490a7ea764074049bc66de62fe795d22b08f3631c',
     'e771baa3f64069ac3ca1759ee83a47f95df85d1f1cce3af3310d5655ef43eff0',
     '::numeric <= 800, false)',
     '::numeric <= (case when p_environment = ''staging'' then 2000 else 800 end), false)')
  ) as targets(signature, before_sha256, after_sha256, old_text, new_text)
  loop
    v_function := to_regprocedure(v_target.signature);
    if v_function is null then
      raise exception 'CMS_STAGING_COMMAND_BUDGET_FUNCTION_MISSING';
    end if;
    select p.prosrc, to_jsonb(p) - 'prosrc' into v_source, v_attributes
      from pg_catalog.pg_proc p where p.oid = v_function;
    if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_target.before_sha256
       or (length(v_source) - length(replace(v_source, v_target.old_text, '')))
          / length(v_target.old_text) <> 1 then
      raise exception 'CMS_STAGING_COMMAND_BUDGET_SOURCE_DRIFT';
    end if;
    v_before := pg_get_functiondef(v_function);
    v_after := replace(v_before, v_target.old_text, v_target.new_text);
    execute v_after;
    if pg_get_functiondef(v_function) is distinct from v_after
       or (select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_function)
          is distinct from v_attributes
       or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
           from pg_catalog.pg_proc p where p.oid = v_function) <> v_target.after_sha256 then
      raise exception 'CMS_STAGING_COMMAND_BUDGET_POSTCONDITION_DRIFT';
    end if;
  end loop;
end;
$staging_command_budget$;
commit;
