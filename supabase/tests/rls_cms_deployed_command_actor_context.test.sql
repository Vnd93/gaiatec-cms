begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select isnt(
  to_regprocedure('public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'),
  null,
  'master-data command is installed'
);
select isnt(
  to_regprocedure('public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'),
  null,
  'PIM command is installed'
);
select isnt(
  to_regprocedure('public.cms_execute_dam_command(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)'),
  null,
  'DAM command is installed'
);

select like(
  pg_get_functiondef('public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure),
  '%set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true)%',
  'master-data command binds the mutation actor transaction-locally'
);
select like(
  pg_get_functiondef('public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure),
  '%set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true)%',
  'PIM command binds the mutation actor transaction-locally'
);
select like(
  pg_get_functiondef('public.cms_execute_dam_command(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)'::regprocedure),
  '%set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true)%',
  'DAM command binds the mutation actor transaction-locally'
);

select unlike(
  pg_get_functiondef('public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure),
  '%entity.status <> ''merged''%',
  'retired master-data keys cannot remain eligible for active-key collision checks'
);
select like(
  pg_get_functiondef('public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure),
  '%entity.status = ''active''%',
  'master-data collision checks use active rows only'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'cms_master_entities_name_active_uidx'
      and indexdef like '%WHERE (status = ''active''::text)%'
  ),
  'master-data normalized names are unique only while active'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'cms_pim_attribute_definitions_active_key_uidx'
      and indexdef like '%WHERE (status = ''active''::text)%'
  ),
  'attribute keys can be safely reused after governed retirement'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cms_pim_units'::regclass
      and conname = 'cms_pim_units_canonical_code_fkey'
      and condeferrable
  ),
  'unit self references can be deferred during one governed QA teardown'
);
select is(
  has_function_privilege(
    'authenticated',
    'private.cms_lock_active_qa_actor_leases(uuid[])',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot invoke the private lease lock directly'
);

select * from finish();
rollback;
