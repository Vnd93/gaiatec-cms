-- Staging QA recovery is prepared in a COMMITTED transaction before any catalog
-- override or mutation. Private leases, not user-editable metadata, are authority.
-- Recovery retains immutable revisions/audit and retires only exact owned rows.
begin;

create table private.cms_catalog_qa_recovery (
  manifest_id uuid primary key default gen_random_uuid(),
  run_tag text not null,
  candidate_sha text not null check(candidate_sha ~ '^[0-9a-f]{40}$'),
  environment text not null check(environment='staging'),
  artifact_digest text not null check(artifact_digest ~ '^[0-9a-f]{64}$'),
  deployment_id uuid not null,
  backend_snapshot_digest text not null check(backend_snapshot_digest ~ '^[0-9a-f]{64}$'),
  recovery_digest text not null check(recovery_digest ~ '^[0-9a-f]{64}$'),
  prepared_xid xid8 not null default pg_current_xact_id(),
  prepared_at timestamptz not null default clock_timestamp(),
  state text not null default 'prepared' check(state in ('prepared','compensating','cleaned')),
  compensation_pid integer,
  cleaned_at timestamptz,
  unique(run_tag,candidate_sha,environment),
  check(run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
    and right(run_tag,9)='-'||left(candidate_sha,8)),
  check((state='compensating')=(compensation_pid is not null)),
  check((state='cleaned')=(cleaned_at is not null))
);
create table private.cms_catalog_qa_recovery_actors (
  manifest_id uuid not null references private.cms_catalog_qa_recovery(manifest_id) on delete restrict,
  actor_id uuid not null references private.cms_qa_actor_leases(actor_id) on delete restrict,
  lease_created_at timestamptz not null,
  lease_expires_at timestamptz not null,
  primary key(manifest_id,actor_id)
);
create table private.cms_catalog_qa_owned_entities (
  entity_kind text not null check(entity_kind in ('product','term','relation','hierarchy')),
  entity_id uuid not null,
  manifest_id uuid not null,
  creator_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(entity_kind,entity_id),
  foreign key(manifest_id,creator_id)
    references private.cms_catalog_qa_recovery_actors(manifest_id,actor_id) on delete restrict
);
create index cms_catalog_qa_owned_manifest_idx
  on private.cms_catalog_qa_owned_entities(manifest_id,entity_kind,entity_id);
alter table private.cms_catalog_qa_recovery enable row level security;
alter table private.cms_catalog_qa_recovery_actors enable row level security;
alter table private.cms_catalog_qa_owned_entities enable row level security;
revoke all on private.cms_catalog_qa_recovery,private.cms_catalog_qa_recovery_actors,
  private.cms_catalog_qa_owned_entities from public,anon,authenticated,service_role;

-- Owner-only preparation. All members must already have active exact leases;
-- later actors cannot be enrolled implicitly. No global/environment/site override.
create function private.cms_catalog_prepare_qa_recovery(
  p_run_tag text,p_sha text,p_artifact_digest text,p_deployment_id uuid,
  p_backend_snapshot_digest text,p_recovery_digest text,p_actor_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid;
begin
  if p_actor_ids is null or cardinality(p_actor_ids) not between 1 and 8
    or cardinality(p_actor_ids)<>(select count(distinct actor) from unnest(p_actor_ids) actor)
    or array_position(p_actor_ids,null) is not null then
    raise exception 'CMS_CATALOG_RECOVERY_ACTORS_INVALID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));
  foreach v_actor in array p_actor_ids loop
    if not exists(select 1 from private.cms_qa_actor_leases l
      where l.actor_id=v_actor and l.run_tag=p_run_tag and l.candidate_sha=p_sha
        and l.environment='staging' and l.status='active' and l.expires_at>clock_timestamp()
        and private.cms_qa_actor_marker_is_exact(l.actor_id,l.run_tag,l.candidate_sha,l.environment)) then
      raise exception 'CMS_CATALOG_RECOVERY_LEASE_MISMATCH' using errcode='42501';
    end if;
  end loop;
  if exists(select 1 from private.cms_qa_actor_leases l
    where l.run_tag=p_run_tag and l.candidate_sha=p_sha and l.environment='staging'
      and l.status='active' and not(l.actor_id=any(p_actor_ids))) then
    raise exception 'CMS_CATALOG_RECOVERY_GROUP_INCOMPLETE' using errcode='42501';
  end if;
  if exists(select 1 from public.cms_catalog_products where created_by=any(p_actor_ids) or updated_by=any(p_actor_ids))
    or exists(select 1 from public.cms_catalog_taxonomy_terms where created_by=any(p_actor_ids) or updated_by=any(p_actor_ids))
    or exists(select 1 from public.cms_feature_flag_overrides
      where flag_key='ev2.catalog_v1' and environment='staging' and enabled
        and expires_at>clock_timestamp() and created_by=any(p_actor_ids)) then
    raise exception 'CMS_CATALOG_RECOVERY_PREEXISTING_MUTATION' using errcode='55000';
  end if;
  insert into private.cms_catalog_qa_recovery(run_tag,candidate_sha,environment,artifact_digest,
    deployment_id,backend_snapshot_digest,recovery_digest)
  values(p_run_tag,p_sha,'staging',p_artifact_digest,p_deployment_id,p_backend_snapshot_digest,p_recovery_digest)
  returning manifest_id into v_id;
  insert into private.cms_catalog_qa_recovery_actors(manifest_id,actor_id,lease_created_at,lease_expires_at)
    select v_id,l.actor_id,l.created_at,l.expires_at from private.cms_qa_actor_leases l where l.actor_id=any(p_actor_ids);
  return v_id;
end;
$$;
revoke all on function private.cms_catalog_prepare_qa_recovery(text,text,text,uuid,text,text,uuid[])
  from public,anon,authenticated,service_role;

create function private.cms_catalog_qa_manifest_for_actor(p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  select m.manifest_id into v_id from private.cms_catalog_qa_recovery m
    join private.cms_catalog_qa_recovery_actors a using(manifest_id)
    join private.cms_qa_actor_leases l on l.actor_id=a.actor_id
    where a.actor_id=p_actor and m.state='prepared' and m.environment='staging'
      and m.prepared_xid<>pg_catalog.pg_current_xact_id()
      and l.status='active' and l.expires_at>clock_timestamp()
      and l.created_at=a.lease_created_at and l.expires_at=a.lease_expires_at
      and l.run_tag=m.run_tag and l.candidate_sha=m.candidate_sha and l.environment=m.environment
      and private.cms_qa_actor_marker_is_exact(l.actor_id,l.run_tag,l.candidate_sha,l.environment);
  if v_id is null then raise exception 'CMS_CATALOG_COMMITTED_RECOVERY_REQUIRED' using errcode='42501'; end if;
  return v_id;
end;
$$;
revoke all on function private.cms_catalog_qa_manifest_for_actor(uuid) from public,anon,authenticated,service_role;

-- Auth-null attribution is allowed ONLY inside the private, PID-bound compensator.
-- Neither a GUC, JWT, marker nor service-role RPC alone can establish this authority.
create function private.cms_catalog_recovery_actor(p_kind text,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is not null then return v_actor; end if;
  select o.creator_id into v_actor from private.cms_catalog_qa_owned_entities o
    join private.cms_catalog_qa_recovery m using(manifest_id)
    join private.cms_catalog_qa_recovery_actors a on a.manifest_id=o.manifest_id and a.actor_id=o.creator_id
    join private.cms_qa_actor_leases l on l.actor_id=a.actor_id
    where o.entity_kind=p_kind and o.entity_id=p_id and m.state='compensating'
      and m.compensation_pid=pg_catalog.pg_backend_pid() and m.environment='staging'
      and l.run_tag=m.run_tag and l.candidate_sha=m.candidate_sha and l.environment=m.environment
      and l.created_at=a.lease_created_at and l.expires_at=a.lease_expires_at
      and private.cms_qa_actor_marker_is_exact(l.actor_id,l.run_tag,l.candidate_sha,l.environment);
  if v_actor is null then raise exception 'CMS_CATALOG_ACTOR_REQUIRED' using errcode='42501'; end if;
  return v_actor;
end;
$$;
revoke all on function private.cms_catalog_recovery_actor(text,uuid) from public,anon,authenticated,service_role;

-- One additive fence covers every mutable catalog surface and every referenced
-- entity. Corporate actors cannot modify/refer to QA-owned rows, even after cleanup.
create function private.cms_catalog_qa_mutation_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb:=to_jsonb(new); v_actor uuid; v_kind text; v_id uuid;
  v_manifest uuid; v_owned uuid; v_ref uuid; v_ref_kind text; v_refs jsonb:='[]'; v_qa boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));
  if tg_table_name='cms_catalog_products' then
    v_kind:='product'; v_id:=new.id; v_actor:=new.updated_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','term','id',new.primary_term_id));
    select v_refs||coalesce(jsonb_agg(jsonb_build_object('kind','term','id',id)),'[]') into v_refs
      from unnest(new.complementary_term_ids) id;
  elsif tg_table_name='cms_catalog_taxonomy_terms' then
    v_kind:='term'; v_id:=new.id; v_actor:=new.updated_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','term','id',new.parent_id),
      jsonb_build_object('kind','term','id',new.replacement_id));
  elsif tg_table_name='cms_catalog_product_relation_revisions' then
    v_kind:='relation'; v_id:=new.relation_key; v_actor:=new.changed_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','product','id',new.source_product_id),
      jsonb_build_object('kind','product','id',new.target_product_id));
  elsif tg_table_name='cms_catalog_product_hierarchy_revisions' then
    v_kind:='hierarchy'; v_id:=new.hierarchy_key; v_actor:=new.changed_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','product','id',new.child_product_id),
      jsonb_build_object('kind','product','id',new.parent_product_id));
  elsif tg_table_name='cms_catalog_editorial_revisions' then
    v_kind:='term'; v_id:=new.term_id; v_actor:=new.changed_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','term','id',new.redirect_term_id));
  else
    v_kind:='product'; v_id:=new.product_id; v_actor:=new.attached_by;
    v_refs:=jsonb_build_array(jsonb_build_object('kind','term','id',new.term_id));
  end if;
  select manifest_id into v_owned from private.cms_catalog_qa_owned_entities
    where entity_kind=v_kind and entity_id=v_id;
  v_qa:=exists(select 1 from private.cms_qa_actor_leases where actor_id=v_actor);
  if v_qa then
    if auth.uid() is null then
      if private.cms_catalog_recovery_actor(v_kind,v_id) is distinct from v_actor then
        raise exception 'CMS_CATALOG_RECOVERY_ACTOR_MISMATCH' using errcode='42501';
      end if;
      v_manifest:=v_owned;
    else
      if auth.uid() is distinct from v_actor then raise exception 'CMS_CATALOG_QA_ACTOR_MISMATCH' using errcode='42501'; end if;
      v_manifest:=private.cms_catalog_qa_manifest_for_actor(v_actor);
    end if;
    if v_owned is null then
      if tg_op<>'INSERT' or tg_table_name not in ('cms_catalog_products','cms_catalog_taxonomy_terms',
        'cms_catalog_product_relation_revisions','cms_catalog_product_hierarchy_revisions')
        or (v_row ? 'created_by' and (v_row->>'created_by')::uuid is distinct from v_actor)
        or (v_row->>'revision')::bigint<>1 then
        raise exception 'CMS_CATALOG_QA_OWNERSHIP_REQUIRED' using errcode='42501';
      end if;
      insert into private.cms_catalog_qa_owned_entities(entity_kind,entity_id,manifest_id,creator_id)
        values(v_kind,v_id,v_manifest,v_actor);
    elsif v_owned is distinct from v_manifest then
      raise exception 'CMS_CATALOG_QA_FOREIGN_ENTITY' using errcode='42501';
    end if;
  elsif v_owned is not null then
    raise exception 'CMS_CATALOG_QA_FOREIGN_ENTITY' using errcode='42501';
  end if;
  for v_ref_kind,v_ref in select value->>'kind',(value->>'id')::uuid from jsonb_array_elements(v_refs) loop
    if v_ref is null then continue; end if;
    select manifest_id into v_owned from private.cms_catalog_qa_owned_entities
      where entity_kind=v_ref_kind and entity_id=v_ref;
    if (v_qa and v_owned is distinct from v_manifest) or (not v_qa and v_owned is not null) then
      raise exception 'CMS_CATALOG_QA_FOREIGN_REFERENCE' using errcode='42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.cms_catalog_qa_mutation_guard() from public,anon,authenticated,service_role;
do $$ declare v_table text; begin
  foreach v_table in array array['cms_catalog_products','cms_catalog_taxonomy_terms',
    'cms_catalog_product_relation_revisions','cms_catalog_product_hierarchy_revisions',
    'cms_catalog_product_terms','cms_catalog_editorial_revisions'] loop
    execute format('create trigger catalog_qa_recovery_fence before insert or update on public.%I
      for each row execute function private.cms_catalog_qa_mutation_guard()',v_table);
  end loop;
end; $$;

create function private.cms_catalog_qa_override_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_manifest uuid; v_target uuid; v_creator_qa boolean;
begin
  if new.flag_key='ev2.catalog_v1' and new.enabled and new.expires_at>clock_timestamp() then
    v_creator_qa:=exists(select 1 from private.cms_qa_actor_leases where actor_id=new.created_by);
    if new.scope_type='user' and new.scope_key ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      v_target:=new.scope_key::uuid;
    end if;
    if not v_creator_qa and not exists(select 1 from private.cms_qa_actor_leases where actor_id=v_target) then
      return new;
    end if;
    if new.environment<>'staging' or new.scope_type<>'user' or v_target is null then
      raise exception 'CMS_CATALOG_QA_OVERRIDE_SCOPE_INVALID' using errcode='42501';
    end if;
    v_manifest:=private.cms_catalog_qa_manifest_for_actor(v_target);
    if v_creator_qa and private.cms_catalog_qa_manifest_for_actor(new.created_by) is distinct from v_manifest then
      raise exception 'CMS_CATALOG_QA_OVERRIDE_SCOPE_INVALID' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.cms_catalog_qa_override_guard() from public,anon,authenticated,service_role;
create trigger catalog_qa_override_recovery_fence before insert or update on public.cms_feature_flag_overrides
for each row execute function private.cms_catalog_qa_override_guard();

-- Preserve the established trigger bodies byte-for-byte except their actor
-- resolver. Assert the exact old anchors; schema drift aborts this migration.
do $bind_private_recovery_actor$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('private.cms_catalog_record_change()'::regprocedure);
  v_old:='v_actor uuid := auth.uid();';
  v_new:='v_actor uuid := private.cms_catalog_recovery_actor(case tg_table_name
    when ''cms_catalog_products'' then ''product'' when ''cms_catalog_taxonomy_terms'' then ''term''
    when ''cms_catalog_product_relation_revisions'' then ''relation''
    when ''cms_catalog_product_hierarchy_revisions'' then ''hierarchy'' else ''product'' end,
    coalesce((to_jsonb(new)->>''id'')::uuid,(to_jsonb(new)->>''relation_key'')::uuid,
      (to_jsonb(new)->>''hierarchy_key'')::uuid,(to_jsonb(new)->>''product_id'')::uuid));';
  if strpos(v_def,v_old)=0 then raise exception 'CMS_CATALOG_RECOVERY_TRIGGER_DRIFT' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);
  v_def:=pg_get_functiondef('private.cms_catalog_record_publication()'::regprocedure);
  v_old:='if auth.uid() is null then raise exception ''CMS_CATALOG_ACTOR_REQUIRED'' using errcode=''42501''; end if;';
  if strpos(v_def,v_old)=0 then raise exception 'CMS_CATALOG_RECOVERY_TRIGGER_DRIFT' using errcode='55000'; end if;
  v_def:=replace(v_def,v_old,'perform private.cms_catalog_recovery_actor(''product'',new.id);');
  -- No publish operation is permitted by the compensator; attribution remains
  -- bound if an invalidation audit is appended while auth.uid() is null.
  execute replace(v_def,'auth.uid()','private.cms_catalog_recovery_actor(''product'',new.id)');
end;
$bind_private_recovery_actor$;
revoke all on function private.cms_catalog_record_change(),private.cms_catalog_record_publication()
  from public,anon,authenticated,service_role;

create function private.cms_catalog_compensate_qa_recovery(p_manifest uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m private.cms_catalog_qa_recovery%rowtype;
  v_products uuid[]; v_terms uuid[]; v_actors uuid[]; r record; v_actor uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));
  select * into m from private.cms_catalog_qa_recovery where manifest_id=p_manifest for update;
  if not found or m.environment<>'staging' then
    raise exception 'CMS_CATALOG_RECOVERY_MANIFEST_REQUIRED' using errcode='42501';
  end if;
  if m.state='cleaned' then return; end if;
  if auth.uid() is not null or m.state<>'prepared' or m.prepared_xid=pg_current_xact_id() then
    raise exception 'CMS_CATALOG_RECOVERY_COMPENSATION_FORBIDDEN' using errcode='42501';
  end if;
  select coalesce(array_agg(actor_id),'{}') into v_actors
    from private.cms_catalog_qa_recovery_actors where manifest_id=p_manifest;
  if cardinality(v_actors)=0 or exists(select 1 from private.cms_catalog_qa_recovery_actors a
    join private.cms_qa_actor_leases l on l.actor_id=a.actor_id
    where a.manifest_id=p_manifest and (l.run_tag<>m.run_tag or l.candidate_sha<>m.candidate_sha
      or l.environment<>m.environment or l.created_at<>a.lease_created_at or l.expires_at<>a.lease_expires_at
      or not private.cms_qa_actor_marker_is_exact(l.actor_id,l.run_tag,l.candidate_sha,l.environment))) then
    raise exception 'CMS_CATALOG_RECOVERY_LEASE_MISMATCH' using errcode='42501';
  end if;
  -- The terminal trigger sets the exact currently transitioning actor. This GUC
  -- is only a selector: private manifest + last active lease are still required.
  v_actor:=nullif(current_setting('cms.catalog_terminal_actor',true),'')::uuid;
  if v_actor is null or not(v_actor=any(v_actors)) or exists(select 1 from private.cms_qa_actor_leases
    where actor_id=any(v_actors) and status='active' and actor_id<>v_actor) then
    raise exception 'CMS_CATALOG_RECOVERY_GROUP_ACTIVE' using errcode='55000';
  end if;
  select coalesce(array_agg(entity_id order by entity_id),'{}') into v_products
    from private.cms_catalog_qa_owned_entities where manifest_id=p_manifest and entity_kind='product';
  select coalesce(array_agg(entity_id order by entity_id),'{}') into v_terms
    from private.cms_catalog_qa_owned_entities where manifest_id=p_manifest and entity_kind='term';
  -- No corporate/preexisting enrollment, mixed actors, foreign references or
  -- unledgered rows are silently ignored. All assertions precede compensation.
  if exists(select 1 from public.cms_catalog_products p where
      (p.id=any(v_products) and (not(p.created_by=any(v_actors)) or not(p.updated_by=any(v_actors))
        or p.created_at<m.prepared_at))
      or (not(p.id=any(v_products)) and (p.created_by=any(v_actors) or p.updated_by=any(v_actors)
        or p.primary_term_id=any(v_terms) or p.complementary_term_ids&&v_terms)))
    or exists(select 1 from public.cms_catalog_taxonomy_terms t where
      (t.id=any(v_terms) and (not(t.created_by=any(v_actors)) or not(t.updated_by=any(v_actors))
        or t.created_at<m.prepared_at))
      or (not(t.id=any(v_terms)) and (t.created_by=any(v_actors) or t.updated_by=any(v_actors)
        or t.parent_id=any(v_terms) or t.replacement_id=any(v_terms))))
    or exists(select 1 from public.cms_catalog_product_revisions where product_id=any(v_products) and not(changed_by=any(v_actors)))
    or exists(select 1 from public.cms_catalog_taxonomy_revisions where term_id=any(v_terms) and not(changed_by=any(v_actors)))
    or exists(select 1 from public.cms_catalog_product_snapshots where product_id=any(v_products) and not(published_by=any(v_actors)))
    or exists(select 1 from public.cms_catalog_product_snapshots where not(product_id=any(v_products)) and term_ids&&v_terms)
    or exists(select 1 from public.cms_catalog_product_terms where
      (product_id=any(v_products) or term_id=any(v_terms)) and
      (not(product_id=any(v_products)) or not(term_id=any(v_terms)) or not(attached_by=any(v_actors))))
    or exists(select 1 from public.cms_catalog_product_relation_revisions where
      (source_product_id=any(v_products) or target_product_id=any(v_products)) and
      (not(source_product_id=any(v_products)) or not(target_product_id=any(v_products)) or not(changed_by=any(v_actors))))
    or exists(select 1 from public.cms_catalog_product_hierarchy_revisions where
      (child_product_id=any(v_products) or parent_product_id=any(v_products)) and
      (not(child_product_id=any(v_products)) or not(parent_product_id=any(v_products)) or not(changed_by=any(v_actors))))
    or exists(select 1 from public.cms_catalog_editorial_revisions where
      (term_id=any(v_terms) or redirect_term_id=any(v_terms)) and
      (not(term_id=any(v_terms)) or not(changed_by=any(v_actors))
        or (redirect_term_id is not null and not(redirect_term_id=any(v_terms))))) then
    raise exception 'CMS_CATALOG_RECOVERY_FOREIGN_STATE' using errcode='55000';
  end if;
  perform 1 from public.cms_catalog_products where id=any(v_products) order by id for update;
  perform 1 from public.cms_catalog_taxonomy_terms where id=any(v_terms) order by id for update;
  update private.cms_catalog_qa_recovery set state='compensating',compensation_pid=pg_backend_pid()
    where manifest_id=p_manifest;
  -- Retractions are new revisions, never deletion of immutable history.
  for r in select * from public.cms_catalog_current_product_relations
    where source_product_id=any(v_products) and status='active' order by relation_key loop
    insert into public.cms_catalog_product_relation_revisions(relation_key,revision,source_product_id,target_product_id,
      relation_kind,quantity,unit_code,status,changed_by,change_reason)
    values(r.relation_key,r.revision+1,r.source_product_id,r.target_product_id,r.relation_kind,r.quantity,r.unit_code,
      'retracted',private.cms_catalog_recovery_actor('relation',r.relation_key),'Durable staging QA compensation');
  end loop;
  for r in select * from public.cms_catalog_current_product_hierarchy
    where child_product_id=any(v_products) and status='active' order by hierarchy_key loop
    insert into public.cms_catalog_product_hierarchy_revisions(hierarchy_key,revision,child_product_id,parent_product_id,
      hierarchy_kind,status,changed_by,change_reason)
    values(r.hierarchy_key,r.revision+1,r.child_product_id,r.parent_product_id,r.hierarchy_kind,'retracted',
      private.cms_catalog_recovery_actor('hierarchy',r.hierarchy_key),'Durable staging QA compensation');
  end loop;
  for r in select * from public.cms_catalog_current_editorial
    where term_id=any(v_terms) and status<>'unpublished' order by term_id loop
    insert into public.cms_catalog_editorial_revisions(term_id,revision,status,title,summary,blocks,term_kind,slug,
      index_requested,redirect_term_id,changed_by,reason,correlation_id)
    values(r.term_id,r.revision+1,'unpublished',r.title,r.summary,r.blocks,r.term_kind,r.slug,false,null,
      private.cms_catalog_recovery_actor('term',r.term_id),'Durable staging QA compensation',gen_random_uuid());
  end loop;
  -- Record the editorial disposition and active mapping retirement in the same
  -- immutable catalog audit. Original publication/attachment history is retained.
  insert into public.cms_catalog_audit_events(entity_type,entity_id,action,actor_id,before_state,after_state)
    select 'taxonomy_term',term_id::text,'updated',private.cms_catalog_recovery_actor('term',term_id),null,
      jsonb_build_object('disposition','qa_editorial_unpublished','revision',revision)
    from public.cms_catalog_current_editorial where term_id=any(v_terms);
  insert into public.cms_catalog_audit_events(entity_type,entity_id,action,actor_id,before_state,after_state)
    select 'product_term',product_id::text||':'||term_id::text,'updated',private.cms_catalog_recovery_actor('product',product_id),
      to_jsonb(mapping),jsonb_build_object('disposition','qa_mapping_retired')
    from public.cms_catalog_product_terms mapping where product_id=any(v_products);
  delete from public.cms_catalog_product_terms where product_id=any(v_products) and term_id=any(v_terms);
  perform set_config('cms.catalog_reason','Durable staging QA compensation',true);
  perform set_config('cms.catalog_correlation',gen_random_uuid()::text,true);
  -- 'edit' covers ready->draft; snapshots are invalidated separately below with
  -- the original immutable snapshot guard, including already-draft products.
  perform set_config('cms.catalog_publication_action','edit',true);
  update public.cms_catalog_products set catalog_lifecycle_state='archived',publication_state='draft',
    revision=revision+1,updated_by=private.cms_catalog_recovery_actor('product',id),
    primary_term_id=null,complementary_term_ids='{}' where id=any(v_products);
  perform set_config('cms.catalog_snapshot_mutation','on',true);
  update public.cms_catalog_product_snapshots set is_current=false,superseded_at=clock_timestamp()
    where product_id=any(v_products) and is_current;
  perform set_config('cms.catalog_snapshot_mutation','',true);
  update public.cms_catalog_taxonomy_terms set status='inactive',replacement_id=null,parent_id=null,
    revision=revision+1,updated_by=private.cms_catalog_recovery_actor('term',id) where id=any(v_terms);
  update public.cms_catalog_publication_outbox set status='superseded',processed_at=clock_timestamp(),last_error=null
    where product_id=any(v_products) and status in ('pending','processing','failed');
  if exists(select 1 from public.cms_catalog_products where id=any(v_products)
      and (catalog_lifecycle_state<>'archived' or publication_state<>'draft' or primary_term_id is not null
        or cardinality(complementary_term_ids)>0))
    or exists(select 1 from public.cms_catalog_taxonomy_terms where id=any(v_terms) and status<>'inactive')
    or exists(select 1 from public.cms_catalog_product_snapshots where product_id=any(v_products) and is_current)
    or exists(select 1 from public.cms_catalog_product_terms where product_id=any(v_products) or term_id=any(v_terms))
    or exists(select 1 from public.cms_catalog_current_product_relations where source_product_id=any(v_products) and status='active')
    or exists(select 1 from public.cms_catalog_current_product_hierarchy where child_product_id=any(v_products) and status='active')
    or exists(select 1 from public.cms_catalog_current_editorial where term_id=any(v_terms) and status<>'unpublished')
    or exists(select 1 from public.cms_catalog_publication_outbox where product_id=any(v_products) and status in ('pending','processing','failed')) then
    raise exception 'CMS_CATALOG_RECOVERY_ACTIVE_RESIDUE' using errcode='55000';
  end if;
  update private.cms_catalog_qa_recovery set state='cleaned',compensation_pid=null,cleaned_at=clock_timestamp()
    where manifest_id=p_manifest;
  perform set_config('cms.catalog_publication_action','',true);
  perform set_config('cms.catalog_reason','',true);
  perform set_config('cms.catalog_correlation','',true);
end;
$$;
revoke all on function private.cms_catalog_compensate_qa_recovery(uuid) from public,anon,authenticated,service_role;

create function private.cms_catalog_qa_terminal_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_manifest uuid; v_previous text:=current_setting('cms.catalog_terminal_actor',true);
begin
  if old.status='active' and new.status in ('cleaned','expired') and old.environment='staging' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms.catalog.workspace',0));
    select manifest_id into v_manifest from private.cms_catalog_qa_recovery
      where run_tag=old.run_tag and candidate_sha=old.candidate_sha and environment=old.environment;
    if v_manifest is not null and not exists(select 1 from private.cms_qa_actor_leases
      where run_tag=old.run_tag and candidate_sha=old.candidate_sha and environment=old.environment
        and status='active' and actor_id<>old.actor_id) then
      perform set_config('cms.catalog_terminal_actor',old.actor_id::text,true);
      perform private.cms_catalog_compensate_qa_recovery(v_manifest);
      perform set_config('cms.catalog_terminal_actor',coalesce(v_previous,''),true);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.cms_catalog_qa_terminal_recovery() from public,anon,authenticated,service_role;
-- Last-group cleanup precedes other zzz terminal validators. Existing lease
-- machinery still revokes sessions, disables overrides and bans the QA actors.
create trigger zzy_catalog_durable_terminal_recovery before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_catalog_qa_terminal_recovery();

commit;
