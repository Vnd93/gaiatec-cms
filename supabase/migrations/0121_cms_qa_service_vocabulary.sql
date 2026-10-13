begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A service canary needs its own term, not a corporate category or another
-- actor's term. Keep the five product exceptions unchanged. This separate
-- staging-only namespace admits only the exact active QA lease; the corporate
-- service.category row remains immutable and no corporate data is seeded.
create function private.cms_qa_service_shared_list_allowed_0121(
  p_actor_id uuid, p_list_id uuid, p_environment text
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select p_environment = 'staging' and exists (
    select 1
    from public.cms_controlled_lists list
    join private.cms_qa_actor_leases caller on caller.actor_id = p_actor_id
    where list.id = p_list_id
      and list.list_key = 'service.category'
      and list.entity_type = 'service' and list.dimension_key = 'service_category'
      and list.active and list.public_visible
      and caller.environment = 'staging' and caller.status = 'active'
      and caller.expires_at > statement_timestamp()
      and private.cms_content_actor_context_active(p_actor_id, p_environment)
      and private.cms_qa_actor_marker_is_exact(
        caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
      )
      and not exists (
        select 1 from private.cms_qa_actor_leases history
        where history.actor_id in (list.created_by, list.updated_by)
      )
  );
$$;

create function private.cms_service_controlled_option_scope_allowed_0121(
  p_actor_id uuid, p_option_id uuid, p_environment text,
  p_include_inactive boolean default false
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_controlled_options option
    join public.cms_controlled_lists list on list.id = option.list_id
    where option.id = p_option_id
      and list.list_key = 'service.category' and list.entity_type = 'service'
      and (p_include_inactive or list.active) and (p_include_inactive or option.active)
      and private.cms_content_actor_context_active(p_actor_id, p_environment)
      and (
        (
          private.cms_qa_service_shared_list_allowed_0121(p_actor_id, list.id, p_environment)
          and not option.public_visible
          and option.created_by = p_actor_id and option.updated_by = p_actor_id
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.created_by, option.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.updated_by, option.updated_at, p_environment
          )
          and exists (
            select 1 from private.cms_qa_actor_leases caller
            where caller.actor_id = p_actor_id
              and option.slug = regexp_replace(lower(caller.run_tag), '[^a-z0-9]+', '-', 'g')
                || '-' || substr(replace(p_actor_id::text, '-', ''), 1, 12) || '-service-category'
              and strpos(option.label, caller.run_tag) > 0
              and strpos(option.label, substr(replace(p_actor_id::text, '-', ''), 1, 12)) > 0
          )
        )
        or (
          private.cms_content_actor_row_scope_allowed(
            p_actor_id, list.created_by, list.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, list.updated_by, list.updated_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.created_by, option.created_at, p_environment
          )
          and private.cms_content_actor_row_scope_allowed(
            p_actor_id, option.updated_by, option.updated_at, p_environment
          )
        )
      )
  );
$$;

revoke all on function private.cms_qa_service_shared_list_allowed_0121(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cms_service_controlled_option_scope_allowed_0121(uuid,uuid,text,boolean)
  from public, anon, authenticated, service_role;

-- Archived service history may retain its own category UUID, but never a live
-- projection or another actor's reference. Preserve the original product case.
create function private.cms_qa_archived_service_reference_exact_0121(
  p_actor_id uuid, p_run_tag text, p_candidate_sha text, p_environment text,
  p_item_id uuid, p_reference_actor_id uuid, p_reference_at timestamptz
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from private.cms_qa_actor_leases lease
    join public.cms_content_items item on item.id = p_item_id
    where lease.actor_id = p_actor_id
      and lease.run_tag = p_run_tag and lease.candidate_sha = p_candidate_sha
      and lease.environment = p_environment and p_environment = 'staging'
      and private.cms_qa_actor_marker_is_exact(
        lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
      )
      and item.content_type = 'service' and item.workflow_status = 'archived'
      and item.archived_at is not null and item.created_by = p_actor_id
      and item.created_at between lease.created_at and lease.expires_at
      and p_reference_actor_id = p_actor_id
      and p_reference_at between lease.created_at and lease.expires_at
  );
$$;
revoke all on function private.cms_qa_archived_service_reference_exact_0121(uuid,text,text,text,uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;

-- Exact source-bound changes to the reader, normalizer, audited CAS writer
-- and durable terminal compensator are installed below. Their signatures,
-- permissions, security attributes and every unrelated branch are preserved.

do $service_source_bindings$
declare
  v_target record;
  v_patch record;
  v_function regprocedure;
  v_definition text;
  v_attributes jsonb;
  v_source text;
begin
  for v_target in
    select * from jsonb_to_recordset($service_bindings$[{"signature":"public.cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)","edits":[{"old_text":"          and (p_include_inactive or option.active)\n","new_text":"          and (p_include_inactive or option.active)\n          and (list.list_key <> 'service.category' or\n            private.cms_service_controlled_option_scope_allowed_0121(\n              p_actor_id, option.id, p_environment, p_include_inactive\n            )\n          )\n"},{"old_text":"      or (\n        list.list_key in (","new_text":"      or private.cms_qa_service_shared_list_allowed_0121(p_actor_id, list.id, p_environment)\n      or (\n        p_environment = 'staging' and list.list_key = 'service.category'\n        and list.entity_type = 'service' and list.dimension_key = 'service_category'\n        and list.active and list.public_visible\n        and not exists (\n          select 1 from private.cms_qa_actor_leases caller_history\n          where caller_history.actor_id = p_actor_id\n        )\n        and private.cms_content_actor_row_scope_allowed(\n          p_actor_id, list.created_by, list.created_at, p_environment\n        )\n        and private.cms_content_actor_row_scope_allowed(\n          p_actor_id, list.updated_by, list.updated_at, p_environment\n        )\n      )\n      or (\n        list.list_key in ("}],"before_sha256":"545d5b1d7df3434e767515977e1f9fdb7fd55790db1ca511ab596700ffaeaa1d","after_sha256":"e91a40129eb038ac72ed33bfeb481bffa4a40241249e50708654c2015dab42bd"},{"signature":"private.cms_content_payload_controlled_scope_allowed(uuid,jsonb,text)","edits":[{"old_text":"               and private.cms_content_actor_row_scope_allowed(\n                 p_actor_id,list.created_by,list.created_at,p_environment\n               )\n               and private.cms_content_actor_row_scope_allowed(\n                 p_actor_id,list.updated_by,list.updated_at,p_environment\n               )\n               and private.cms_content_actor_row_scope_allowed(\n                 p_actor_id,option.created_by,option.created_at,p_environment\n               )\n               and private.cms_content_actor_row_scope_allowed(\n                 p_actor_id,option.updated_by,option.updated_at,p_environment\n               )","new_text":"               and private.cms_service_controlled_option_scope_allowed_0121(\n                 p_actor_id, option.id, p_environment, false\n               )"}],"before_sha256":"c70fff202f8d84cf1ea8a1e9273f0abb1224d0d37398b24584fc75ec7088291e","after_sha256":"fc7963feb47fa2c84b0537f6a8b6e2f29052e96b144e57f1a950b78b74782a0a"},{"signature":"public.cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamp with time zone,uuid)","edits":[{"old_text":"    if found and private.cms_product_shared_controlled_list_allowed_0078(\n      p_actor_id, v_list.id, p_environment\n    ) then","new_text":"    if found and (\n      private.cms_product_shared_controlled_list_allowed_0078(p_actor_id, v_list.id, p_environment)\n      or private.cms_qa_service_shared_list_allowed_0121(p_actor_id, v_list.id, p_environment)\n    ) then"},{"old_text":"      if nullif(p_option ->> 'id', '') is not null then","new_text":"      if v_list.list_key = 'service.category' and (\n        p_environment is distinct from 'staging'\n        or p_option -> 'publicVisible' is distinct from 'false'::jsonb\n        or coalesce(p_option ->> 'id', '') !~*\n          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'\n        or p_option ->> 'slug' is distinct from v_slug_prefix || '-'\n          || substr(replace(p_actor_id::text, '-', ''), 1, 12) || '-service-category'\n        or strpos(coalesce(p_option ->> 'label', ''),\n          substr(replace(p_actor_id::text, '-', ''), 1, 12)) = 0\n      ) then\n        raise exception 'CMS_QA_SERVICE_OPTION_MARKER_INVALID' using errcode = '23514';\n      end if;\n\n      if nullif(p_option ->> 'id', '') is not null then"},{"old_text":"or not private.cms_product_controlled_option_scope_allowed_0078(\n               p_actor_id, v_option.id, p_environment\n             )","new_text":"or not (\n               private.cms_product_controlled_option_scope_allowed_0078(p_actor_id, v_option.id, p_environment)\n               or private.cms_service_controlled_option_scope_allowed_0121(\n                 p_actor_id, v_option.id, p_environment, false\n               )\n             )"},{"old_text":"'cms:qa.product_controlled_option.upserted',","new_text":"case when v_list.list_key = 'service.category' then 'cms:qa.service_controlled_option.upserted'\n             else 'cms:qa.product_controlled_option.upserted' end,"}],"before_sha256":"60a0ea783487db8b89c45e37775147a9d61033bb18b94569bccaebc63462462a","after_sha256":"f3c25c837b53682b7888f6e814d0857f614c32635f896bee8e7b50a01d036189"}]$service_bindings$::jsonb)
      as target(signature text, edits jsonb, before_sha256 text, after_sha256 text)
  loop
    v_function := to_regprocedure(v_target.signature);
    if v_function is null then raise exception 'CMS_QA_SERVICE_FUNCTION_MISSING'; end if;
    select p.prosrc, to_jsonb(p) - 'prosrc' into v_source, v_attributes
      from pg_catalog.pg_proc p where p.oid = v_function;
    if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_target.before_sha256 then
      raise exception 'CMS_QA_SERVICE_SOURCE_DRIFT';
    end if;
    v_definition := pg_get_functiondef(v_function);
    for v_patch in select * from jsonb_to_recordset(v_target.edits)
      as patch(old_text text, new_text text)
    loop
      if length(v_patch.old_text) = 0
         or (length(v_source) - length(replace(v_source, v_patch.old_text, '')))
           / length(v_patch.old_text) <> 1
         or (length(v_definition) - length(replace(v_definition, v_patch.old_text, '')))
           / length(v_patch.old_text) <> 1 then
        raise exception 'CMS_QA_SERVICE_REPLACEMENT_DRIFT';
      end if;
      v_source := replace(v_source, v_patch.old_text, v_patch.new_text);
      v_definition := replace(v_definition, v_patch.old_text, v_patch.new_text);
    end loop;
    if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_target.after_sha256 then
      raise exception 'CMS_QA_SERVICE_PLAN_DRIFT';
    end if;
    execute v_definition;
    if pg_get_functiondef(v_function) is distinct from v_definition
       or (select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p where p.oid = v_function)
          is distinct from v_attributes
       or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
           from pg_catalog.pg_proc p where p.oid = v_function) <> v_target.after_sha256 then
      raise exception 'CMS_QA_SERVICE_POSTCONDITION_DRIFT';
    end if;
  end loop;
end;
$service_source_bindings$;

-- Derive a separate service compensator from the already-proven 0101/0114
-- compensator. The product compensator and its five namespaces do not change.
do $service_compensator$
declare
  v_binding constant jsonb := $cleanup_binding${"signature":"private.cms_cleanup_terminal_product_shared_options_0078()","new_signature":"private.cms_cleanup_terminal_service_shared_options_0121()","edits":[{"old_text":"    and list.list_key in (\n      'product.category',\n      'product.application_magnitude',\n      'product.technology',\n      'product.installation_operation',\n      'product.monitored_element'\n    )\n    and list.entity_type = 'product'","new_text":"    and old.environment = 'staging'\n    and list.list_key = 'service.category' and list.entity_type = 'service'\n    and list.dimension_key = 'service_category' and not option.public_visible\n    and option.slug = regexp_replace(lower(old.run_tag), '[^a-z0-9]+', '-', 'g')\n      || '-' || substr(replace(old.actor_id::text, '-', ''), 1, 12) || '-service-category'\n    and strpos(option.label, old.run_tag) > 0\n    and strpos(option.label, substr(replace(old.actor_id::text, '-', ''), 1, 12)) > 0"},{"old_text":"CMS_QA_PRODUCT_OPTION","new_text":"CMS_QA_SERVICE_OPTION","occurrences":2},{"old_text":"cms:qa.product_controlled_options.compensated","new_text":"cms:qa.service_controlled_options.compensated"},{"old_text":"private.cms_qa_archived_product_reference_exact_0101(","new_text":"private.cms_qa_archived_service_reference_exact_0121("}],"before_sha256":"9962d706ad55c49a5ac6b2daa45a7c6f30fddc8ba5de9da3ac2432aaddde2ef6","after_sha256":"1e321121df7381d2774d3745a5863b35d64346c7d59d5b60284945f2827acf46"}$cleanup_binding$::jsonb;
  v_old regprocedure := to_regprocedure('private.cms_cleanup_terminal_product_shared_options_0078()');
  v_new regprocedure;
  v_source text;
  v_definition text;
  v_attributes jsonb;
  v_patch record;
begin
  if v_old is null or to_regprocedure(v_binding ->> 'new_signature') is not null then
    raise exception 'CMS_QA_SERVICE_COMPENSATOR_STATE_INVALID';
  end if;
  select p.prosrc, to_jsonb(p) - 'oid' - 'proname' - 'prosrc' - 'proacl'
    into v_source, v_attributes from pg_catalog.pg_proc p where p.oid = v_old;
  if encode(extensions.digest(v_source, 'sha256'), 'hex') <> v_binding ->> 'before_sha256' then
    raise exception 'CMS_QA_SERVICE_COMPENSATOR_SOURCE_DRIFT';
  end if;
  v_definition := replace(pg_get_functiondef(v_old),
    v_binding ->> 'signature', v_binding ->> 'new_signature');
  if v_definition = pg_get_functiondef(v_old) then
    raise exception 'CMS_QA_SERVICE_COMPENSATOR_NAME_DRIFT';
  end if;
  for v_patch in select * from jsonb_to_recordset(v_binding -> 'edits')
    as patch(old_text text, new_text text, occurrences integer)
  loop
    if length(v_patch.old_text) = 0
       or (length(v_source) - length(replace(v_source, v_patch.old_text, '')))
          / length(v_patch.old_text) <> coalesce(v_patch.occurrences, 1) then
      raise exception 'CMS_QA_SERVICE_COMPENSATOR_REPLACEMENT_DRIFT';
    end if;
    v_source := replace(v_source, v_patch.old_text, v_patch.new_text);
    v_definition := replace(v_definition, v_patch.old_text, v_patch.new_text);
  end loop;
  execute v_definition;
  v_new := to_regprocedure(v_binding ->> 'new_signature');
  if v_new is null
     or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
         from pg_catalog.pg_proc p where p.oid = v_old) <> v_binding ->> 'before_sha256'
     or (select to_jsonb(p) - 'oid' - 'proname' - 'prosrc' - 'proacl'
         from pg_catalog.pg_proc p where p.oid = v_new) is distinct from v_attributes
     or (select encode(extensions.digest(p.prosrc, 'sha256'), 'hex')
         from pg_catalog.pg_proc p where p.oid = v_new) <> v_binding ->> 'after_sha256' then
    raise exception 'CMS_QA_SERVICE_COMPENSATOR_POSTCONDITION_DRIFT';
  end if;
end;
$service_compensator$;

revoke all on function private.cms_cleanup_terminal_service_shared_options_0121()
  from public, anon, authenticated, service_role;

-- After content compensation and product-option cleanup, before 0071 vocabulary
-- cleanup. Active/foreign references still fail closed; audit remains immutable.
create trigger cms_prepare_qa_actor_terminal_service_shared_vocab_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_service_shared_options_0121();

commit;
