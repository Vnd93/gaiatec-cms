-- Functional integration of CAT-001..CAT-009. Additive; no data load, flag override or deploy.
begin;

insert into public.cms_permissions(permission_key, description, critical)
values ('cms:catalog.administer', 'Administrar estrutura, ciclo de vida e conflitos do catálogo.', true)
on conflict (permission_key) do nothing;
insert into public.cms_role_permissions(role_key, permission_key)
values ('super_admin', 'cms:catalog.administer'), ('admin', 'cms:catalog.administer')
on conflict do nothing;

alter table public.cms_catalog_products add column primary_term_id uuid
  references public.cms_catalog_taxonomy_terms(id) on delete restrict;
alter table public.cms_catalog_products add column complementary_term_ids uuid[] not null default '{}';
alter table public.cms_catalog_product_revisions add column workspace_state jsonb;
alter table public.cms_catalog_taxonomy_terms add column replacement_id uuid
  references public.cms_catalog_taxonomy_terms(id) on delete restrict;
alter table public.cms_catalog_taxonomy_revisions add column replacement_id uuid;
alter table public.cms_catalog_taxonomy_terms drop constraint cms_catalog_taxonomy_terms_term_type_check;
alter table public.cms_catalog_taxonomy_terms add constraint cms_catalog_taxonomy_terms_term_type_check
  check (term_type in ('category','family','technology','industry','application'));
alter table public.cms_catalog_taxonomy_revisions drop constraint cms_catalog_taxonomy_revisions_term_type_check;
alter table public.cms_catalog_taxonomy_revisions add constraint cms_catalog_taxonomy_revisions_term_type_check
  check (term_type in ('category','family','technology','industry','application'));
alter table public.cms_catalog_taxonomy_terms drop constraint cms_catalog_taxonomy_terms_status_check;
alter table public.cms_catalog_taxonomy_terms add constraint cms_catalog_taxonomy_terms_status_check
  check (status in ('draft','active','inactive','merged'));
alter table public.cms_catalog_taxonomy_revisions drop constraint cms_catalog_taxonomy_revisions_status_check;
alter table public.cms_catalog_taxonomy_revisions add constraint cms_catalog_taxonomy_revisions_status_check
  check (status in ('draft','active','inactive','merged'));
create index cms_catalog_products_primary_term_idx on public.cms_catalog_products(primary_term_id);
create index cms_catalog_terms_replacement_idx on public.cms_catalog_taxonomy_terms(replacement_id);

-- A private, identity-bound lookup is needed because flag evaluation is service-only.
-- No actor, session or AAL claim is accepted from the command payload.
create function private.cms_catalog_capability(p_environment text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare v_scope jsonb; v_flag jsonb;
begin
  if auth.uid() is null or p_environment is null or p_environment not in ('local','staging')
     or not public.cms_has_permission('cms:catalog.read') then
    return jsonb_build_object('enabled',false,'source','unavailable');
  end if;
  v_scope := private.cms_rbac_scope_context(auth.uid());
  if v_scope->>'mode' = 'deny' or
     (v_scope->>'mode' = 'scoped' and v_scope->>'environment' is distinct from p_environment) or
     not coalesce((public.cms_actor_scope_context(auth.uid(),p_environment)->>'active')::boolean,false) then
    return jsonb_build_object('enabled',false,'source','unavailable');
  end if;
  v_flag := public.cms_evaluate_feature_flag(auth.uid(), 'ev2.catalog_v1', p_environment, 'main',
    auth.jwt()->>'aal', auth.jwt()->>'session_id', to_timestamp((auth.jwt()->>'iat')::double precision));
  return jsonb_build_object('enabled', coalesce((v_flag->>'enabled')::boolean,false) and v_flag->>'source' = 'override',
    'source',coalesce(v_flag->>'source','unavailable'));
end;
$$;
revoke all on function private.cms_catalog_capability(text) from public, anon;
grant execute on function private.cms_catalog_capability(text) to authenticated;

create function private.cms_catalog_access()
returns boolean language sql stable security invoker set search_path = pg_catalog, private, pg_temp as $$
  select coalesce((private.cms_catalog_capability(current_setting('cms.catalog_environment',true))->>'enabled')::boolean,false);
$$;
revoke all on function private.cms_catalog_access() from public, anon;
grant execute on function private.cms_catalog_access() to authenticated;

create function private.cms_catalog_row_allowed(p_row_actor uuid,p_row_at timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,private,pg_temp as $$
  select auth.uid() is not null and private.cms_actor_row_scope_allowed(auth.uid(),p_row_actor,p_row_at,current_setting('cms.catalog_environment',true));
$$;
revoke all on function private.cms_catalog_row_allowed(uuid,timestamptz) from public,anon;
grant execute on function private.cms_catalog_row_allowed(uuid,timestamptz) to authenticated;

-- Every existing RLS policy remains in force, with an additional capability/scope fence.
create policy cms_catalog_products_scope on public.cms_catalog_products as restrictive for all to authenticated
using (private.cms_catalog_access()
  and private.cms_catalog_row_allowed(created_by,created_at)
  and private.cms_catalog_row_allowed(updated_by,updated_at))
with check (private.cms_catalog_access()
  and private.cms_catalog_row_allowed(created_by,created_at)
  and updated_by = auth.uid());
create policy cms_catalog_taxonomy_scope on public.cms_catalog_taxonomy_terms as restrictive for all to authenticated
using (private.cms_catalog_access()
  and private.cms_catalog_row_allowed(created_by,created_at)
  and private.cms_catalog_row_allowed(updated_by,updated_at))
with check (private.cms_catalog_access()
  and private.cms_catalog_row_allowed(created_by,created_at)
  and updated_by = auth.uid());

do $$
declare v_table text;
begin
  foreach v_table in array array['cms_catalog_products','cms_catalog_taxonomy_terms','cms_catalog_product_terms',
    'cms_catalog_product_relation_revisions','cms_catalog_product_hierarchy_revisions'] loop
    execute format('create policy catalog_command_insert on public.%I as restrictive for insert to authenticated
      with check (private.cms_catalog_access() and current_setting(''cms.catalog_workspace_command'',true) = auth.uid()::text)',v_table);
    execute format('create policy catalog_command_update on public.%I as restrictive for update to authenticated
      using (private.cms_catalog_access() and current_setting(''cms.catalog_workspace_command'',true) = auth.uid()::text)
      with check (private.cms_catalog_access() and current_setting(''cms.catalog_workspace_command'',true) = auth.uid()::text)',v_table);
  end loop;
  foreach v_table in array array['cms_catalog_product_revisions','cms_catalog_taxonomy_revisions',
    'cms_catalog_product_relation_revisions','cms_catalog_product_hierarchy_revisions'] loop
    execute format('create policy catalog_revision_scope on public.%I as restrictive for select to authenticated
      using (private.cms_catalog_access() and private.cms_catalog_row_allowed(changed_by,changed_at))',v_table);
  end loop;
end;
$$;
create policy catalog_product_terms_scope on public.cms_catalog_product_terms as restrictive for select to authenticated
using (private.cms_catalog_access() and exists(select 1 from public.cms_catalog_products p where p.id = product_id)
  and exists(select 1 from public.cms_catalog_taxonomy_terms t where t.id = term_id));
create policy catalog_audit_scope on public.cms_catalog_audit_events as restrictive for select to authenticated
using (private.cms_catalog_access() and private.cms_catalog_row_allowed(actor_id,occurred_at));
create policy catalog_snapshot_scope on public.cms_catalog_product_snapshots as restrictive for select to authenticated
using (private.cms_catalog_access() and exists(select 1 from public.cms_catalog_products p where p.id = product_id));
create policy catalog_outbox_scope on public.cms_catalog_publication_outbox as restrictive for select to authenticated
using (private.cms_catalog_access() and exists(select 1 from public.cms_catalog_products p where p.id = product_id));

drop policy cms_catalog_taxonomy_terms_insert on public.cms_catalog_taxonomy_terms;
create policy cms_catalog_taxonomy_terms_insert on public.cms_catalog_taxonomy_terms for insert to authenticated
with check (public.cms_has_permission('cms:catalog.edit') and status = 'draft' and created_by = auth.uid() and updated_by = auth.uid());
drop policy cms_catalog_taxonomy_terms_update on public.cms_catalog_taxonomy_terms;
create policy cms_catalog_taxonomy_terms_update on public.cms_catalog_taxonomy_terms for update to authenticated
using (public.cms_has_permission('cms:catalog.administer'))
with check (public.cms_has_permission('cms:catalog.administer') and updated_by = auth.uid());

create function private.cms_catalog_product_wire(p public.cms_catalog_products)
returns jsonb language sql immutable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object('id',p.id,'revision',p.revision,'slug',p.slug,'title',p.title,
    'content',jsonb_build_object('summary',coalesce(p.content->>'summary',''),'description',coalesce(p.content->>'description','')),
    'catalog_entity_kind',p.catalog_entity_kind,'catalog_lifecycle_state',p.catalog_lifecycle_state,
    'publication_state',p.publication_state,'published_revision',p.published_revision,'primary_term_id',p.primary_term_id,
    'complementary_term_ids',p.complementary_term_ids);
$$;
revoke all on function private.cms_catalog_product_wire(public.cms_catalog_products) from public, anon;
grant execute on function private.cms_catalog_product_wire(public.cms_catalog_products) to authenticated;

-- Preserve both publication and entity/lifecycle state in every new revision (0109 lost publication_state).
create or replace function private.cms_catalog_record_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private, pg_temp as $$
declare v_actor uuid := auth.uid(); v_type text; v_id text; v_action text;
begin
  if v_actor is null then raise exception 'CMS_CATALOG_ACTOR_REQUIRED' using errcode='42501'; end if;
  if tg_table_name = 'cms_catalog_products' then
    insert into public.cms_catalog_product_revisions(product_id,revision,slug,title,lifecycle_status,publication_state,
      content,changed_by,catalog_entity_kind,workspace_state)
    values(new.id,new.revision,new.slug,new.title,new.lifecycle_status,new.publication_state,new.content,v_actor,
      new.catalog_entity_kind,private.cms_catalog_product_wire(new));
    v_type := 'product'; v_id := new.id::text;
  elsif tg_table_name = 'cms_catalog_taxonomy_terms' then
    insert into public.cms_catalog_taxonomy_revisions(term_id,revision,term_type,slug,title,parent_id,status,changed_by,replacement_id)
    values(new.id,new.revision,new.term_type,new.slug,new.title,new.parent_id,new.status,v_actor,new.replacement_id);
    v_type := 'taxonomy_term'; v_id := new.id::text;
  elsif tg_table_name = 'cms_catalog_product_relation_revisions' then
    v_type := 'product_relation'; v_id := new.relation_key::text; v_action := 'relation_changed';
  elsif tg_table_name = 'cms_catalog_product_hierarchy_revisions' then
    v_type := 'product_hierarchy'; v_id := new.hierarchy_key::text; v_action := 'hierarchy_changed';
  else
    v_type := 'product_term'; v_id := new.product_id::text || ':' || new.term_id::text; v_action := 'attached';
  end if;
  insert into public.cms_catalog_audit_events(entity_type,entity_id,action,actor_id,request_id,before_state,after_state)
  values(v_type,v_id,coalesce(v_action,case when tg_op='INSERT' then 'created' else 'updated' end),v_actor,
    coalesce(nullif(current_setting('cms.catalog_correlation',true),''),nullif(auth.jwt()->>'request_id','')),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new) || jsonb_build_object('changeReason',nullif(current_setting('cms.catalog_reason',true),'')));
  return new;
end;
$$;

create or replace function private.cms_catalog_validate_publication_transition()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v_action text := current_setting('cms.catalog_publication_action',true);
begin
  if tg_op='INSERT' then
    if new.publication_state <> 'draft' or new.published_revision is not null then
      raise exception 'CMS_CATALOG_INITIAL_STATE_INVALID' using errcode='23514';
    end if;
    return new;
  end if;
  if new.publication_state is distinct from old.publication_state and not coalesce(
    (v_action='submit' and old.publication_state='draft' and new.publication_state='ready') or
    (v_action='publish' and old.publication_state='ready' and new.publication_state='published') or
    (v_action in ('edit','unpublish') and new.publication_state='draft'),false) then
    raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode='22023';
  end if;
  if new.publication_state='published' and (v_action is distinct from 'publish' or new.published_revision is distinct from new.revision) then
    raise exception 'CMS_CATALOG_PUBLISHED_REVISION_REQUIRED' using errcode='23514';
  end if;
  -- A new draft/ready revision retains the previously published snapshot pointer.
  if new.publication_state <> 'published' and new.published_revision is distinct from old.published_revision then
    raise exception 'CMS_CATALOG_PUBLISHED_REVISION_INVALID' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_reject_taxonomy_cycle()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.parent_id is null then return new; end if;
  if not exists(select 1 from public.cms_catalog_taxonomy_terms t where t.id=new.parent_id and
    (t.term_type=new.term_type or (t.term_type in ('category','family') and new.term_type in ('category','family')))) then
    raise exception 'CMS_CATALOG_TAXONOMY_PARENT_TYPE_MISMATCH' using errcode='23514';
  end if;
  if exists(with recursive a(id,parent_id,path) as (
    select id,parent_id,array[id] from public.cms_catalog_taxonomy_terms where id=new.parent_id
    union all select t.id,t.parent_id,a.path||t.id from a join public.cms_catalog_taxonomy_terms t on t.id=a.parent_id
      where not t.id=any(a.path) and cardinality(a.path)<256)
    select 1 from a where id=new.id or new.id=any(path) or cardinality(path)>=256) then
    raise exception 'CMS_CATALOG_TAXONOMY_CYCLE' using errcode='23514';
  end if;
  return new;
end;
$$;

-- Symmetric edges are projected both ways; self/excluded rows never become public dependencies.
-- UNION deduplicates visited nodes: no depth cutoff can hide a long directed cycle.
create function private.cms_catalog_reject_full_relation_cycle() returns trigger language plpgsql
security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.status='active' and new.relation_kind in ('contains','required_component','optional_component','substitutes','successor')
    and exists(with recursive reachable(product_id) as (
      select new.target_product_id
      union
      select r.target_product_id from reachable a join public.cms_catalog_current_product_relations r
        on r.source_product_id=a.product_id where r.status='active'
          and r.relation_kind in ('contains','required_component','optional_component','substitutes','successor')
    ) select 1 from reachable where product_id=new.source_product_id) then
    raise exception 'CMS_CATALOG_RELATION_CYCLE' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger catalog_full_relation_cycle before insert on public.cms_catalog_product_relation_revisions
for each row execute function private.cms_catalog_reject_full_relation_cycle();
revoke all on function private.cms_catalog_reject_full_relation_cycle() from public,anon,authenticated;

create or replace view public.cms_catalog_effective_relations with (security_invoker=true) as
with recursive ancestors(subject,origin,level) as (
  select id,id,0 from public.cms_catalog_products
  union all select a.subject,h.parent_product_id,a.level+1 from ancestors a
    join public.cms_catalog_current_product_hierarchy h on h.child_product_id=a.origin and h.status='active'
    where a.level<2
), edges as (
  select source_product_id,target_product_id,relation_kind,quantity,unit_code,revision,relation_key
    from public.cms_catalog_current_product_relations where status='active'
  union all
  select target_product_id,source_product_id,relation_kind,quantity,unit_code,revision,relation_key
    from public.cms_catalog_current_product_relations where status='active' and relation_kind in ('accessory','compatible','alternative')
), ranked as (
  select a.subject subject_product_id,e.target_product_id,e.relation_kind,e.quantity,e.unit_code,
    a.origin relation_origin_product_id,a.level relation_origin_level,
    dense_rank() over(partition by a.subject,e.target_product_id order by a.level,
      case when e.relation_kind='local_exclusion' then 0 else 1 end) precedence_rank
    from ancestors a join edges e on e.source_product_id=a.origin where a.subject<>e.target_product_id
)
select subject_product_id,target_product_id,relation_kind,quantity,unit_code,relation_origin_product_id,
  relation_origin_level,(relation_kind='local_exclusion') is_local_exclusion from ranked where precedence_rank=1;

create function public.cms_catalog_workspace(p_environment text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_cap jsonb; v_result jsonb;
begin
  v_cap := private.cms_catalog_capability(p_environment);
  v_result := jsonb_build_object('schemaVersion',1,'enabled',false,'source',v_cap->>'source',
    'permissions',jsonb_build_object('edit',false,'administer',false),'products','[]'::jsonb,'terms','[]'::jsonb,
    'relations','[]'::jsonb,'hierarchy','[]'::jsonb,'effectiveRelations','[]'::jsonb);
  if not coalesce((v_cap->>'enabled')::boolean,false) then return v_result; end if;
  perform set_config('cms.catalog_environment',p_environment,true);
  if (select count(*)>200 from public.cms_catalog_products) or (select count(*)>200 from public.cms_catalog_taxonomy_terms)
    or (select count(*)>500 from public.cms_catalog_current_product_relations)
    or (select count(*)>500 from public.cms_catalog_current_product_hierarchy)
    or (select count(*)>2000 from public.cms_catalog_effective_relations) then
    raise exception 'CMS_CATALOG_WORKSPACE_LIMIT' using errcode='54000';
  end if;
  v_result := v_result || jsonb_build_object('enabled',true,'source','override',
    'permissions',jsonb_build_object('edit',public.cms_has_permission('cms:catalog.edit'),
      'administer',public.cms_has_permission('cms:catalog.administer')),
    'products',(select coalesce(jsonb_agg(private.cms_catalog_product_wire(p) order by p.title,p.id),'[]') from public.cms_catalog_products p),
    'terms',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'revision',t.revision,'slug',t.slug,'title',t.title,
      'term_type',t.term_type,'status',t.status,'parent_id',t.parent_id,'replacement_id',t.replacement_id) order by t.title,t.id),'[]') from public.cms_catalog_taxonomy_terms t),
    'relations',(select coalesce(jsonb_agg(to_jsonb(r)-'changed_by'-'changed_at'-'change_reason' order by r.relation_key),'[]') from public.cms_catalog_current_product_relations r),
    'hierarchy',(select coalesce(jsonb_agg(to_jsonb(h)-'changed_by'-'changed_at'-'change_reason' order by h.hierarchy_key),'[]') from public.cms_catalog_current_product_hierarchy h),
    'effectiveRelations',(select coalesce(jsonb_agg(to_jsonb(e) order by e.subject_product_id,e.target_product_id),'[]') from public.cms_catalog_effective_relations e));
  perform set_config('cms.catalog_environment','',true);
  return v_result;
end;
$$;

-- Safe conflict provenance: no user UUID, name, e-mail or other personal identifier.
create function private.cms_catalog_conflict_detail(p_actor uuid,p_at timestamptz,p_correlation text)
returns text language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('author',case when p_actor=auth.uid() then 'self' else 'other' end,
    'changedAt',p_at,'correlationId',case when p_correlation ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then p_correlation else null end)::text;
$$;
revoke all on function private.cms_catalog_conflict_detail(uuid,timestamptz,text) from public,anon;
grant execute on function private.cms_catalog_conflict_detail(uuid,timestamptz,text) to authenticated;

create function public.cms_catalog_workspace_command(p_environment text,p_command jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare
  v_action text := p_command->>'action'; v_id uuid := (p_command->>'id')::uuid;
  v_expected bigint := (p_command->>'expectedVersion')::bigint;
  v_product public.cms_catalog_products; v_term public.cms_catalog_taxonomy_terms;
  v_previous public.cms_catalog_product_revisions; v_relation public.cms_catalog_product_relation_revisions;
  v_hierarchy public.cms_catalog_product_hierarchy_revisions; v_replacement public.cms_catalog_taxonomy_terms;
  v_content jsonb := p_command->'content'; v_admin boolean; v_allowed text[];
  v_primary uuid := (p_command->>'primaryTermId')::uuid; v_source uuid; v_target uuid; v_complementary uuid[];
begin
  if not coalesce((private.cms_catalog_capability(p_environment)->>'enabled')::boolean,false) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode='42501';
  end if;
  if not public.cms_has_permission('cms:catalog.edit') or v_id is null or p_correlation_id is null
    or jsonb_typeof(p_command) is distinct from 'object' then
    raise exception 'CMS_CATALOG_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  v_admin := public.cms_has_permission('cms:catalog.administer');
  if v_action in ('override_product','publish_product','unpublish_product','archive_product','restore_product',
    'update_term','activate_term','deactivate_term','merge_term') and not v_admin then
    raise exception 'CMS_CATALOG_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if v_action not in ('create_product','update_product','override_product','submit_product','publish_product',
    'unpublish_product','archive_product','restore_product','create_term','update_term','activate_term',
    'deactivate_term','merge_term','save_relation','save_hierarchy') or v_action is null then
    raise exception 'CMS_CATALOG_COMMAND_INVALID' using errcode='22023';
  end if;
  v_allowed := array['action','id','expectedVersion','reason'];
  if v_action in ('create_product','update_product','override_product') then
    v_allowed := v_allowed || array['slug','title','content','entityKind','primaryTermId','complementaryTermIds'];
    if jsonb_typeof(p_command->'complementaryTermIds') is distinct from 'array' then
      raise exception 'CMS_CATALOG_TERM_LIST_INVALID' using errcode='22023';
    end if;
    select coalesce(array_agg(value::uuid),'{}') into v_complementary from jsonb_array_elements_text(p_command->'complementaryTermIds');
    if jsonb_typeof(v_content) is distinct from 'object' or
      (v_content - array['summary','description']) <> '{}'::jsonb or
      jsonb_typeof(v_content->'summary') is distinct from 'string' or
      jsonb_typeof(v_content->'description') is distinct from 'string' or
      char_length(v_content->>'summary')>600 or char_length(v_content->>'description')>20000 then
      raise exception 'CMS_CATALOG_CONTENT_INVALID' using errcode='22023';
    end if;
  elsif v_action in ('create_term','update_term') then
    v_allowed := v_allowed || array['slug','title','termType','parentId'];
  elsif v_action in ('deactivate_term','merge_term') then
    v_allowed := v_allowed || array['replacementId','replacementVersion'];
  elsif v_action='restore_product' then v_allowed := v_allowed || array['sourceRevision'];
  elsif v_action='save_relation' then
    v_allowed := v_allowed || array['sourceProductId','targetProductId','relationKind','quantity','unitCode','status'];
  elsif v_action='save_hierarchy' then
    v_allowed := v_allowed || array['childProductId','parentProductId','hierarchyKind','status'];
  end if;
  if (p_command-v_allowed) <> '{}'::jsonb then raise exception 'CMS_CATALOG_COMMAND_INVALID' using errcode='22023'; end if;
  if v_action not in ('create_product','create_term') and (v_expected is null or v_expected<0) then
    raise exception 'CMS_CATALOG_EXPECTED_REVISION_REQUIRED' using errcode='22023';
  end if;
  if v_action not in ('create_product','update_product','create_term') and
    coalesce(char_length(btrim(p_command->>'reason')),0) not between 3 and 240 then
    raise exception 'CMS_CATALOG_REASON_REQUIRED' using errcode='22023';
  end if;
  -- Serializes graph invariants as well as optimistic entity revisions. No blind retries.
  perform pg_advisory_xact_lock(hashtextextended('cms.catalog.workspace',0));
  perform set_config('cms.catalog_environment',p_environment,true);
  perform set_config('cms.catalog_workspace_command',auth.uid()::text,true);
  perform set_config('cms.catalog_product_command','on',true);
  perform set_config('cms.catalog_relation_command','on',true);
  perform set_config('cms.catalog_correlation',p_correlation_id::text,true);
  perform set_config('cms.catalog_reason',coalesce(p_command->>'reason',''),true);
  perform set_config('cms.catalog_publication_action','edit',true);

  if v_action in ('create_product','update_product','override_product') and v_primary is not null and not exists(
    select 1 from public.cms_catalog_taxonomy_terms where id=v_primary and term_type in ('category','family') and status='active') then
    raise exception 'CMS_CATALOG_PRIMARY_TERM_REQUIRED' using errcode='23514';
  end if;
  if v_complementary is not null and (cardinality(v_complementary)>20 or
    cardinality(v_complementary)<>(select count(distinct id) from unnest(v_complementary) id) or
    exists(select 1 from unnest(v_complementary) q(term_id) where not exists(select 1 from public.cms_catalog_taxonomy_terms t
      where t.id=q.term_id and t.status='active' and t.term_type in ('technology','industry','application')))) then
    raise exception 'CMS_CATALOG_TERM_LIST_INVALID' using errcode='23514';
  end if;
  if v_action='create_product' then
    insert into public.cms_catalog_products(id,slug,title,content,catalog_entity_kind,primary_term_id,complementary_term_ids,created_by,updated_by)
    values(v_id,p_command->>'slug',p_command->>'title',v_content,p_command->>'entityKind',v_primary,v_complementary,auth.uid(),auth.uid());
  elsif v_action like '%product' then
    select * into v_product from public.cms_catalog_products where id=v_id for update;
    if not found then raise exception 'CMS_CATALOG_PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
    if v_product.revision is distinct from v_expected then
      raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode='40001',
        detail=private.cms_catalog_conflict_detail(v_product.updated_by,v_product.updated_at,
          (select request_id from public.cms_catalog_audit_events where entity_type='product' and entity_id=v_id::text
            and after_state->>'revision'=v_product.revision::text order by occurred_at desc limit 1));
    end if;
    if v_product.catalog_lifecycle_state='archived' and v_action<>'restore_product' then
      raise exception 'CMS_CATALOG_ARCHIVED' using errcode='23514';
    end if;
    if v_action in ('update_product','override_product') then
      if p_command->>'entityKind' is distinct from v_product.catalog_entity_kind and (
        exists(select 1 from public.cms_catalog_current_product_hierarchy where status='active' and (child_product_id=v_id or parent_product_id=v_id)) or
        exists(select 1 from public.cms_catalog_current_product_relations where status='active' and (source_product_id=v_id or target_product_id=v_id))) then
        raise exception 'CMS_CATALOG_ENTITY_KIND_IN_USE' using errcode='23514';
      end if;
      update public.cms_catalog_products set slug=p_command->>'slug',title=p_command->>'title',content=v_content,
        catalog_entity_kind=p_command->>'entityKind',primary_term_id=v_primary,complementary_term_ids=v_complementary,publication_state='draft',
        revision=revision+1,updated_by=auth.uid() where id=v_id;
    elsif v_action='submit_product' then
      if v_product.publication_state<>'draft' then raise exception 'CMS_CATALOG_PUBLICATION_TRANSITION_INVALID' using errcode='23514'; end if;
      perform set_config('cms.catalog_publication_action','submit',true);
      update public.cms_catalog_products set publication_state='ready',revision=revision+1,updated_by=auth.uid() where id=v_id;
    elsif v_action='publish_product' then
      if not public.cms_has_permission('cms:catalog.publish') then raise exception 'CMS_CATALOG_PUBLISH_FORBIDDEN' using errcode='42501'; end if;
      if v_product.publication_state<>'ready' or not exists(select 1 from public.cms_catalog_taxonomy_terms
        where id=v_product.primary_term_id and status='active' and term_type in ('category','family')) or
        coalesce(char_length(btrim(v_product.content->>'summary')),0)=0 or
        coalesce(char_length(btrim(v_product.content->>'description')),0)=0 then
        raise exception 'CMS_CATALOG_PRIMARY_TERM_REQUIRED' using errcode='23514';
      end if;
      if exists(select 1 from unnest(v_product.complementary_term_ids) q(term_id) where not exists(
        select 1 from public.cms_catalog_taxonomy_terms t where t.id=q.term_id and t.status='active'
          and t.term_type in ('technology','industry','application'))) then
        raise exception 'CMS_CATALOG_TERM_LIST_INVALID' using errcode='23514';
      end if;
      if exists(select 1 from public.cms_catalog_effective_relations r
        where r.subject_product_id=v_id and r.relation_kind in ('contains','required_component') and not exists(
          select 1 from public.cms_catalog_product_snapshots s where s.product_id=r.target_product_id and s.is_current)) then
        raise exception 'CMS_CATALOG_REQUIRED_RELATION_UNPUBLISHED' using errcode='23514';
      end if;
      perform set_config('cms.catalog_publication_action','publish',true);
      update public.cms_catalog_products set publication_state='published',published_revision=revision+1,
        revision=revision+1,updated_by=auth.uid() where id=v_id;
    elsif v_action in ('unpublish_product','archive_product') then
      if exists(select 1 from public.cms_catalog_product_snapshots s,
        lateral jsonb_array_elements(s.relation_snapshot) r where s.is_current and s.product_id<>v_id
          and r->>'target_product_id'=v_id::text and r->>'relation_kind' in ('contains','required_component')) then
        raise exception 'CMS_CATALOG_PUBLISHED_DEPENDENCY_IN_USE' using errcode='23514';
      end if;
      -- Invalidate a live snapshot even if a newer draft is being edited.
      perform set_config('cms.catalog_publication_action','unpublish',true);
      update public.cms_catalog_products set publication_state='draft',
        catalog_lifecycle_state=case when v_action='archive_product' then 'archived' else 'active' end,
        revision=revision+1,updated_by=auth.uid() where id=v_id;
    elsif v_action='restore_product' then
      select * into v_previous from public.cms_catalog_product_revisions
        where product_id=v_id and revision=(p_command->>'sourceRevision')::bigint;
      if not found or v_previous.workspace_state is null then raise exception 'CMS_CATALOG_REVISION_NOT_RESTORABLE' using errcode='23514'; end if;
      if v_previous.catalog_entity_kind is distinct from v_product.catalog_entity_kind and (
        exists(select 1 from public.cms_catalog_current_product_hierarchy where status='active' and (child_product_id=v_id or parent_product_id=v_id)) or
        exists(select 1 from public.cms_catalog_current_product_relations where status='active' and (source_product_id=v_id or target_product_id=v_id))) then
        raise exception 'CMS_CATALOG_ENTITY_KIND_IN_USE' using errcode='23514';
      end if;
      update public.cms_catalog_products set title=v_previous.title,slug=v_previous.slug,content=v_previous.content,
        catalog_entity_kind=v_previous.catalog_entity_kind,
        primary_term_id=(v_previous.workspace_state->>'primary_term_id')::uuid,
        complementary_term_ids=array(select value::uuid from jsonb_array_elements_text(v_previous.workspace_state->'complementary_term_ids')),
        catalog_lifecycle_state='active',publication_state='draft',revision=revision+1,updated_by=auth.uid() where id=v_id;
    end if;
  elsif v_action='create_term' then
    insert into public.cms_catalog_taxonomy_terms(id,slug,title,term_type,parent_id,created_by,updated_by)
    values(v_id,p_command->>'slug',p_command->>'title',p_command->>'termType',(p_command->>'parentId')::uuid,auth.uid(),auth.uid());
  elsif v_action like '%term' then
    select * into v_term from public.cms_catalog_taxonomy_terms where id=v_id for update;
    if not found then raise exception 'CMS_CATALOG_TERM_NOT_FOUND' using errcode='P0002'; end if;
    if v_term.revision is distinct from v_expected then
      raise exception 'CMS_CATALOG_REVISION_CONFLICT' using errcode='40001',
        detail=private.cms_catalog_conflict_detail(v_term.updated_by,v_term.updated_at,
          (select request_id from public.cms_catalog_audit_events where entity_type='taxonomy_term' and entity_id=v_id::text
            and after_state->>'revision'=v_term.revision::text order by occurred_at desc limit 1));
    end if;
    if v_term.status='merged' then raise exception 'CMS_CATALOG_TERM_MERGED' using errcode='23514'; end if;
    if v_action='update_term' then
      if p_command->>'termType' is distinct from v_term.term_type then raise exception 'CMS_CATALOG_TERM_TYPE_IMMUTABLE' using errcode='23514'; end if;
      update public.cms_catalog_taxonomy_terms set slug=p_command->>'slug',title=p_command->>'title',
        parent_id=(p_command->>'parentId')::uuid,revision=revision+1,updated_by=auth.uid() where id=v_id;
    elsif v_action='activate_term' then
      update public.cms_catalog_taxonomy_terms set status='active',replacement_id=null,revision=revision+1,updated_by=auth.uid() where id=v_id;
    else
      if p_command->>'replacementId' is not null then
        select * into v_replacement from public.cms_catalog_taxonomy_terms where id=(p_command->>'replacementId')::uuid for update;
        if not found or v_replacement.id=v_id or v_replacement.status<>'active'
          or v_replacement.term_type<>v_term.term_type or v_replacement.revision is distinct from (p_command->>'replacementVersion')::bigint then
          raise exception 'CMS_CATALOG_REPLACEMENT_INVALID' using errcode='23514';
        end if;
      elsif v_action='merge_term' or exists(select 1 from public.cms_catalog_products where primary_term_id=v_id)
        or exists(select 1 from public.cms_catalog_products where v_id=any(complementary_term_ids))
        or exists(select 1 from public.cms_catalog_taxonomy_terms where parent_id=v_id) then
        raise exception 'CMS_CATALOG_REPLACEMENT_REQUIRED' using errcode='23514';
      end if;
      -- Affected drafts receive new revisions. Existing public snapshots are untouched.
      update public.cms_catalog_products set primary_term_id=v_replacement.id,publication_state='draft',
        revision=revision+1,updated_by=auth.uid() where primary_term_id=v_id;
      update public.cms_catalog_products set complementary_term_ids=array(select distinct q.term_id from
        unnest(array_replace(complementary_term_ids,v_id,v_replacement.id)) q(term_id) order by q.term_id),
        publication_state='draft',revision=revision+1,updated_by=auth.uid() where v_id=any(complementary_term_ids);
      update public.cms_catalog_taxonomy_terms set parent_id=v_replacement.id,revision=revision+1,updated_by=auth.uid() where parent_id=v_id;
      update public.cms_catalog_taxonomy_terms set status=case when v_action='merge_term' then 'merged' else 'inactive' end,
        replacement_id=v_replacement.id,revision=revision+1,updated_by=auth.uid() where id=v_id;
    end if;
  elsif v_action='save_relation' then
    v_source := (p_command->>'sourceProductId')::uuid; v_target := (p_command->>'targetProductId')::uuid;
    if not exists(select 1 from public.cms_catalog_products where id=v_source and catalog_lifecycle_state='active') or
      not exists(select 1 from public.cms_catalog_products where id=v_target and catalog_lifecycle_state='active') then
      raise exception 'CMS_CATALOG_PRODUCT_NOT_FOUND' using errcode='P0002';
    end if;
    select * into v_relation from public.cms_catalog_current_product_relations where relation_key=v_id;
    if v_relation.revision is null and p_command->>'status' is distinct from 'active' then
      raise exception 'CMS_CATALOG_INITIAL_STATE_INVALID' using errcode='23514';
    end if;
    if coalesce(v_relation.revision,0)<>v_expected or (v_relation.revision is not null and
      (v_relation.source_product_id<>v_source or v_relation.target_product_id<>v_target or v_relation.relation_kind<>p_command->>'relationKind')) then
      raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode='40001',
        detail=private.cms_catalog_conflict_detail(v_relation.changed_by,v_relation.changed_at,
          (select request_id from public.cms_catalog_audit_events where entity_type='product_relation' and entity_id=v_id::text
            and after_state->>'revision'=v_relation.revision::text order by occurred_at desc limit 1));
    end if;
    insert into public.cms_catalog_product_relation_revisions(relation_key,revision,source_product_id,target_product_id,
      relation_kind,quantity,unit_code,status,changed_by,change_reason)
    values(v_id,v_expected+1,v_source,v_target,p_command->>'relationKind',(p_command->>'quantity')::numeric,
      p_command->>'unitCode',p_command->>'status',auth.uid(),p_command->>'reason');
  elsif v_action='save_hierarchy' then
    v_source := (p_command->>'childProductId')::uuid; v_target := (p_command->>'parentProductId')::uuid;
    if not exists(select 1 from public.cms_catalog_products where id=v_source and catalog_lifecycle_state='active') or
      not exists(select 1 from public.cms_catalog_products where id=v_target and catalog_lifecycle_state='active') then
      raise exception 'CMS_CATALOG_PRODUCT_NOT_FOUND' using errcode='P0002';
    end if;
    select * into v_hierarchy from public.cms_catalog_current_product_hierarchy where hierarchy_key=v_id;
    if v_hierarchy.revision is null and p_command->>'status' is distinct from 'active' then
      raise exception 'CMS_CATALOG_INITIAL_STATE_INVALID' using errcode='23514';
    end if;
    if coalesce(v_hierarchy.revision,0)<>v_expected or (v_hierarchy.revision is not null and v_hierarchy.child_product_id<>v_source) then
      raise exception 'CMS_CATALOG_RELATION_REVISION_CONFLICT' using errcode='40001',
        detail=private.cms_catalog_conflict_detail(v_hierarchy.changed_by,v_hierarchy.changed_at,
          (select request_id from public.cms_catalog_audit_events where entity_type='product_hierarchy' and entity_id=v_id::text
            and after_state->>'revision'=v_hierarchy.revision::text order by occurred_at desc limit 1));
    end if;
    insert into public.cms_catalog_product_hierarchy_revisions(hierarchy_key,revision,child_product_id,parent_product_id,
      hierarchy_kind,status,changed_by,change_reason)
    values(v_id,v_expected+1,v_source,v_target,p_command->>'hierarchyKind',p_command->>'status',auth.uid(),p_command->>'reason');
  end if;
  perform set_config('cms.catalog_environment','',true);
  perform set_config('cms.catalog_workspace_command','',true);
  perform set_config('cms.catalog_product_command','',true);
  perform set_config('cms.catalog_relation_command','',true);
  perform set_config('cms.catalog_publication_action','',true);
  perform set_config('cms.catalog_correlation','',true);
  perform set_config('cms.catalog_reason','',true);
  return jsonb_build_object('id',v_id,'correlationId',p_correlation_id);
end;
$$;

revoke all on function public.cms_catalog_workspace(text) from public,anon;
revoke all on function public.cms_catalog_workspace_command(text,jsonb,uuid) from public,anon;
grant execute on function public.cms_catalog_workspace(text) to authenticated;
grant execute on function public.cms_catalog_workspace_command(text,jsonb,uuid) to authenticated;

-- Freeze the classification and effective relationship graph in the same publication transaction.
alter table public.cms_catalog_product_snapshots add column term_ids uuid[] not null default '{}';
alter table public.cms_catalog_product_snapshots add column relation_snapshot jsonb not null default '[]';
create unique index cms_catalog_snapshot_live_slug_idx on public.cms_catalog_product_snapshots(slug) where is_current;

create or replace function private.cms_catalog_snapshot_internal_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'CMS_CATALOG_SNAPSHOT_IMMUTABLE' using errcode='55000'; end if;
  if current_setting('cms.catalog_snapshot_mutation',true) is distinct from 'on' or
    (to_jsonb(new)-array['is_current','superseded_at']) is distinct from (to_jsonb(old)-array['is_current','superseded_at']) or
    new.is_current is not false or new.superseded_at is null then
    raise exception 'CMS_CATALOG_SNAPSHOT_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function private.cms_catalog_record_publication()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_snapshot uuid; v_action text := current_setting('cms.catalog_publication_action',true);
begin
  if auth.uid() is null then raise exception 'CMS_CATALOG_ACTOR_REQUIRED' using errcode='42501'; end if;
  if v_action='publish' and new.publication_state='published' then
    perform set_config('cms.catalog_snapshot_mutation','on',true);
    update public.cms_catalog_product_snapshots set is_current=false,superseded_at=now() where product_id=new.id and is_current;
    insert into public.cms_catalog_product_snapshots(product_id,revision,slug,title,content,published_by,term_ids,relation_snapshot)
    values(new.id,new.revision,new.slug,new.title,new.content,auth.uid(),array_remove(array[new.primary_term_id]||new.complementary_term_ids,null),
      (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('target_snapshot_id',s.snapshot_id,'target_revision',s.revision)),'[]')
        from public.cms_catalog_effective_relations r left join public.cms_catalog_product_snapshots s on s.product_id=r.target_product_id and s.is_current
        where subject_product_id=new.id and not is_local_exclusion))
    returning snapshot_id into v_snapshot;
    insert into public.cms_catalog_publication_outbox(product_id,revision,snapshot_id,event_type)
    values(new.id,new.revision,v_snapshot,'published');
  elsif v_action='unpublish' then
    perform set_config('cms.catalog_snapshot_mutation','on',true);
    update public.cms_catalog_product_snapshots set is_current=false,superseded_at=now() where product_id=new.id and is_current
      returning snapshot_id into v_snapshot;
    if v_snapshot is not null then
      insert into public.cms_catalog_publication_outbox(product_id,revision,snapshot_id,event_type)
      values(new.id,new.revision,v_snapshot,'invalidated');
    end if;
  end if;
  if v_snapshot is not null then
    insert into public.cms_catalog_audit_events(entity_type,entity_id,action,actor_id,request_id,before_state,after_state)
    values('product',new.id::text,case when v_action='publish' then 'published' else 'unpublished' end,
      auth.uid(),nullif(current_setting('cms.catalog_correlation',true),''),null,
      jsonb_build_object('revision',new.revision,'snapshotId',v_snapshot,'reason',nullif(current_setting('cms.catalog_reason',true),'')));
  end if;
  perform set_config('cms.catalog_snapshot_mutation','',true);
  return new;
end;
$$;

create function public.cms_catalog_product_history(p_environment text,p_product_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_result jsonb;
begin
  if not coalesce((private.cms_catalog_capability(p_environment)->>'enabled')::boolean,false) then
    raise exception 'CMS_CATALOG_FEATURE_DISABLED' using errcode='42501';
  end if;
  perform set_config('cms.catalog_environment',p_environment,true);
  select coalesce(jsonb_agg(jsonb_build_object('revision',r.revision,'state',r.workspace_state,'changedAt',r.changed_at) order by r.revision desc),'[]')
    into v_result from (select revision,workspace_state,changed_at from public.cms_catalog_product_revisions
      where product_id=p_product_id order by revision desc limit 100) r;
  perform set_config('cms.catalog_environment','',true);
  return v_result;
end;
$$;
revoke all on function public.cms_catalog_product_history(text,uuid) from public,anon;
grant execute on function public.cms_catalog_product_history(text,uuid) to authenticated;

-- Outbox receipts are service-owned and bound to an exact immutable snapshot.
create function public.cms_catalog_ack_publication(p_event_id uuid,p_snapshot_id uuid,p_revision bigint)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v_event public.cms_catalog_publication_outbox;
begin
  select * into v_event from public.cms_catalog_publication_outbox where id=p_event_id for update;
  if not found or v_event.snapshot_id is distinct from p_snapshot_id or v_event.revision is distinct from p_revision then
    raise exception 'CMS_CATALOG_OUTBOX_MISMATCH' using errcode='40001';
  end if;
  if v_event.status='processed' then return true; end if;
  if v_event.event_type='published' and not exists(select 1 from public.cms_catalog_product_snapshots
    where snapshot_id=p_snapshot_id and revision=p_revision and is_current) then
    raise exception 'CMS_CATALOG_OUTBOX_STALE' using errcode='40001';
  end if;
  update public.cms_catalog_publication_outbox set status='processed',processed_at=now(),attempt_count=attempt_count+1,last_error=null where id=p_event_id;
  return true;
end;
$$;
revoke all on function public.cms_catalog_ack_publication(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.cms_catalog_ack_publication(uuid,uuid,bigint) to service_role;
commit;
