-- Rollout-safe actor binding for command RPCs created by already-applied EV2
-- migrations. Editing 0040/0041/0043 alone would not update existing projects.
-- We preserve each installed definition byte-for-byte and inject one local GUC
-- at the first PL/pgSQL BEGIN when it is not already present.
do $migration$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_begin_at integer;
  v_changed boolean;
begin
  foreach v_signature in array array[
    'public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)',
    'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)',
    'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'CMS_QA_COMMAND_RPC_MISSING:%', v_signature using errcode = '55000';
    end if;

    select pg_get_functiondef(v_function::oid) into v_definition;
    v_changed := false;
    if position('cms.qa_mutation_actor_id' in v_definition) = 0 then
      v_begin_at := strpos(lower(v_definition), E'\nbegin\n');
      if v_begin_at = 0 then
        raise exception 'CMS_QA_COMMAND_RPC_PATCH_POINT_MISSING:%', v_signature
          using errcode = '55000';
      end if;
      v_definition := overlay(
        v_definition
        placing E'  perform set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true);\n'
        from v_begin_at + char_length(E'\nbegin\n')
        for 0
      );
      v_changed := true;
    end if;

    if v_signature like 'public.cms_execute_master_data_command(%' then
      if position('entity.status <> ''merged''' in v_definition) > 0 then
        v_definition := replace(
          v_definition,
          'entity.status <> ''merged''',
          'entity.status = ''active'''
        );
        v_changed := true;
      end if;
    end if;

    if v_changed then
      execute v_definition;
    end if;
  end loop;
end;
$migration$;

-- Estados inativos preservam historico, mas nao podem sequestrar chaves
-- naturais depois do teardown sintetico.
drop index if exists public.cms_master_entities_name_active_uidx;
create unique index cms_master_entities_name_active_uidx
  on public.cms_master_entities (site_key, entity_type, normalized_name)
  where status = 'active';

drop index if exists public.cms_master_entities_domain_active_uidx;
create unique index cms_master_entities_domain_active_uidx
  on public.cms_master_entities (site_key, entity_type, external_domain)
  where external_domain is not null and status = 'active';

alter table public.cms_pim_attribute_definitions
  drop constraint if exists cms_pim_attribute_definitions_site_key_attribute_key_key;
create unique index if not exists cms_pim_attribute_definitions_active_key_uidx
  on public.cms_pim_attribute_definitions (site_key, attribute_key)
  where status = 'active';

alter table public.cms_pim_attribute_sets
  drop constraint if exists cms_pim_attribute_sets_site_key_category_id_name_key;
create unique index if not exists cms_pim_attribute_sets_active_name_uidx
  on public.cms_pim_attribute_sets (site_key, category_id, name)
  where status = 'active';

-- Permite retirar em uma unica transacao um conjunto QA de unidades que se
-- referencia (inclusive canonical_code=self), sem afrouxar a integridade no
-- commit e sem cascata sobre unidades corporativas.
alter table public.cms_pim_units
  drop constraint if exists cms_pim_units_canonical_code_fkey;
alter table public.cms_pim_units
  add constraint cms_pim_units_canonical_code_fkey
  foreign key (canonical_code) references public.cms_pim_units (code)
  on delete no action deferrable initially immediate;

-- Migration probe: abort rather than leave a partially protected deployment.
do $probe$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)',
    'public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)',
    'public.cms_execute_dam_command(uuid,text,text,text,text,timestamp with time zone,text,jsonb,uuid,uuid,text,uuid)'
  ] loop
    v_function := to_regprocedure(v_signature);
    if v_function is null
       or position(
         'cms.qa_mutation_actor_id'
         in pg_get_functiondef(v_function::oid)
       ) = 0 then
      raise exception 'CMS_QA_COMMAND_ACTOR_CONTEXT_NOT_INSTALLED:%', v_signature
        using errcode = '55000';
    end if;
    if v_signature like 'public.cms_execute_master_data_command(%'
       and (
         position(
           'entity.status <> ''merged'''
           in pg_get_functiondef(v_function::oid)
         ) > 0
         or position(
           'entity.status = ''active'''
           in pg_get_functiondef(v_function::oid)
         ) = 0
       ) then
      raise exception 'CMS_MASTER_ACTIVE_KEY_SCOPE_NOT_INSTALLED'
        using errcode = '55000';
    end if;
  end loop;
end;
$probe$;
