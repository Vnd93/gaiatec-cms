-- Fase 10: listas mestras genéricas, auditadas e sem hardcode editorial.

insert into public.cms_permissions(permission_key, description, critical) values
  ('cms:vocabularies.read','Consultar listas mestras controladas',false),
  ('cms:vocabularies.manage','Administrar listas mestras controladas',true)
on conflict (permission_key) do update set description=excluded.description, critical=excluded.critical;

insert into public.cms_role_permissions(role_key, permission_key)
select role_key, permission_key
from (values
  ('super_admin','cms:vocabularies.read'),('super_admin','cms:vocabularies.manage'),
  ('admin','cms:vocabularies.read'),('admin','cms:vocabularies.manage'),
  ('technical','cms:vocabularies.read'),('editor','cms:vocabularies.read'),
  ('reviewer','cms:vocabularies.read'),('commercial','cms:vocabularies.read')
) as grants(role_key,permission_key)
where exists(select 1 from public.cms_roles role where role.role_key=grants.role_key)
on conflict do nothing;

create table public.cms_controlled_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null unique check(list_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  entity_type text not null check(entity_type ~ '^[a-z][a-z0-9_-]{1,79}$'),
  dimension_key text not null check(dimension_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  label text not null check(char_length(btrim(label)) between 1 and 120),
  description text not null default '' check(char_length(description)<=500),
  public_visible boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0 check(sort_order between 0 and 9999),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type,dimension_key)
);

create table public.cms_controlled_options (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.cms_controlled_lists(id) on delete restrict,
  slug text not null check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug)<=120),
  label text not null check(char_length(btrim(label)) between 1 and 160),
  description text not null default '' check(char_length(description)<=500),
  public_visible boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0 check(sort_order between 0 and 9999),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(list_id,slug)
);
create unique index cms_controlled_options_label_unique
  on public.cms_controlled_options(list_id,lower(label));
create index cms_controlled_options_list_order
  on public.cms_controlled_options(list_id,active desc,sort_order,label);

alter table public.cms_controlled_lists enable row level security;
alter table public.cms_controlled_options enable row level security;
revoke all on public.cms_controlled_lists, public.cms_controlled_options from public,anon,authenticated;
grant select on public.cms_controlled_lists, public.cms_controlled_options to authenticated;
grant all on public.cms_controlled_lists, public.cms_controlled_options to service_role;
create policy cms_controlled_lists_read on public.cms_controlled_lists for select to authenticated
using(public.cms_has_permission('cms:vocabularies.read'));
create policy cms_controlled_options_read on public.cms_controlled_options for select to authenticated
using(public.cms_has_permission('cms:vocabularies.read'));

create function public.cms_controlled_option_usage_count(p_option_id uuid)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select (
    (select count(*) from public.cms_content_drafts draft where draft.payload::text like '%'||p_option_id::text||'%')+
    (select count(*) from public.cms_published_projection projection where projection.payload::text like '%'||p_option_id::text||'%')
  )::integer;
$$;

create function public.cms_no_controlled_vocabulary_delete()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'CMS_CONTROLLED_DELETE_FORBIDDEN' using errcode='42501';
end;
$$;
create trigger cms_controlled_lists_no_delete before delete on public.cms_controlled_lists
for each row execute function public.cms_no_controlled_vocabulary_delete();
create trigger cms_controlled_options_no_delete before delete on public.cms_controlled_options
for each row execute function public.cms_no_controlled_vocabulary_delete();

create function public.cms_controlled_ref(p_list_key text,p_ref jsonb,p_require_active boolean default true)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_option public.cms_controlled_options%rowtype; v_list public.cms_controlled_lists%rowtype;
begin
  if jsonb_typeof(p_ref)<>'object' or coalesce(p_ref->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'CMS_CONTROLLED_TERM_INVALID:%',p_list_key using errcode='22023';
  end if;
  select list.* into v_list from public.cms_controlled_lists list where list.list_key=p_list_key and list.active;
  if not found then raise exception 'CMS_CONTROLLED_LIST_INVALID:%',p_list_key using errcode='22023'; end if;
  select option.* into v_option from public.cms_controlled_options option
  where option.id=(p_ref->>'id')::uuid and option.list_id=v_list.id
    and (not p_require_active or option.active);
  if not found then raise exception 'CMS_CONTROLLED_TERM_INVALID:%',p_list_key using errcode='22023'; end if;
  return jsonb_build_object('id',v_option.id,'slug',v_option.slug,'label',v_option.label,
    'publicVisible',v_list.public_visible and v_option.public_visible);
end;
$$;

create function public.cms_normalize_controlled_payload(p_content_type text,p_payload jsonb,p_require_active boolean default true)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb:=p_payload; category_ref jsonb; application_ref jsonb; technology_ref jsonb;
  installation_ref jsonb; element_ref jsonb; service_ref jsonb;
begin
  if p_content_type='product' then
    category_ref:=public.cms_controlled_ref('product.category',p#>'{controlledClassification,productCategory}',p_require_active);
    application_ref:=public.cms_controlled_ref('product.application_magnitude',p#>'{controlledClassification,applicationMagnitude}',p_require_active);
    technology_ref:=public.cms_controlled_ref('product.technology',p#>'{controlledClassification,technology}',p_require_active);
    installation_ref:=public.cms_controlled_ref('product.installation_operation',p#>'{controlledClassification,installationOperation}',p_require_active);
    element_ref:=public.cms_controlled_ref('product.monitored_element',p#>'{controlledClassification,monitoredElement}',p_require_active);
    p:=jsonb_set(p,'{controlledClassification}',jsonb_build_object(
      'productCategory',category_ref,'applicationMagnitude',application_ref,'technology',technology_ref,
      'installationOperation',installation_ref,'monitoredElement',element_ref),true);
    p:=jsonb_set(p,'{classification,segment}',to_jsonb(category_ref->>'label'),true);
    p:=jsonb_set(p,'{classification,category}',to_jsonb(application_ref->>'label'),true);
    p:=jsonb_set(p,'{technology}',to_jsonb(technology_ref->>'label'),true);
  elsif p_content_type='service' then
    service_ref:=public.cms_controlled_ref('service.category',p->'serviceKindRef',p_require_active);
    p:=jsonb_set(p,'{serviceKindRef}',service_ref,true);
    p:=jsonb_set(p,'{serviceKind}',to_jsonb(service_ref->>'label'),true);
  end if;
  return p;
end;
$$;

create function public.cms_manage_controlled_vocabulary(
  p_actor_id uuid,p_action text,p_list jsonb,p_option jsonb,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_list public.cms_controlled_lists%rowtype; v_option public.cms_controlled_options%rowtype; v_usage integer:=0;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:vocabularies.manage',p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  if p_action='upsert_list' then
    insert into public.cms_controlled_lists(id,list_key,entity_type,dimension_key,label,description,public_visible,active,sort_order,created_by,updated_by)
    values(coalesce(nullif(p_list->>'id','')::uuid,gen_random_uuid()),p_list->>'listKey',p_list->>'entityType',p_list->>'dimensionKey',
      p_list->>'label',coalesce(p_list->>'description',''),coalesce((p_list->>'publicVisible')::boolean,true),
      coalesce((p_list->>'active')::boolean,true),coalesce((p_list->>'sortOrder')::integer,0),p_actor_id,p_actor_id)
    on conflict(list_key) do update set label=excluded.label,description=excluded.description,
      public_visible=excluded.public_visible,active=excluded.active,sort_order=excluded.sort_order,updated_by=p_actor_id,updated_at=now()
    returning * into v_list;
  elsif p_action='upsert_option' then
    select * into v_list from public.cms_controlled_lists where id=(p_option->>'listId')::uuid;
    if not found then raise exception 'CMS_CONTROLLED_LIST_INVALID' using errcode='22023'; end if;
    insert into public.cms_controlled_options(id,list_id,slug,label,description,public_visible,active,sort_order,created_by,updated_by)
    values(coalesce(nullif(p_option->>'id','')::uuid,gen_random_uuid()),v_list.id,p_option->>'slug',p_option->>'label',
      coalesce(p_option->>'description',''),coalesce((p_option->>'publicVisible')::boolean,true),
      coalesce((p_option->>'active')::boolean,true),coalesce((p_option->>'sortOrder')::integer,0),p_actor_id,p_actor_id)
    on conflict(list_id,slug) do update set label=excluded.label,description=excluded.description,
      public_visible=excluded.public_visible,active=excluded.active,sort_order=excluded.sort_order,updated_by=p_actor_id,updated_at=now()
    returning * into v_option;
    v_usage:=public.cms_controlled_option_usage_count(v_option.id);
  elsif p_action='set_option_active' then
    update public.cms_controlled_options set active=(p_option->>'active')::boolean,updated_by=p_actor_id,updated_at=now()
    where id=(p_option->>'id')::uuid returning * into v_option;
    if not found then raise exception 'CMS_CONTROLLED_TERM_INVALID' using errcode='22023'; end if;
    select * into v_list from public.cms_controlled_lists where id=v_option.list_id;
    v_usage:=public.cms_controlled_option_usage_count(v_option.id);
  else raise exception 'CMS_CONTROLLED_ACTION_INVALID' using errcode='22023';
  end if;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:vocabularies.'||p_action,'controlled_vocabulary',
    coalesce(v_option.id::text,v_list.id::text),jsonb_build_object('listKey',v_list.list_key,'usageCount',v_usage),p_correlation_id);
  return jsonb_build_object('status','ok','listId',v_list.id,'optionId',v_option.id,'usageCount',v_usage);
end;
$$;

revoke all on function public.cms_controlled_option_usage_count(uuid),
  public.cms_controlled_ref(text,jsonb,boolean),public.cms_normalize_controlled_payload(text,jsonb,boolean),
  public.cms_manage_controlled_vocabulary(uuid,text,jsonb,jsonb,text,text,timestamptz,uuid),
  public.cms_no_controlled_vocabulary_delete() from public,anon,authenticated;
grant execute on function public.cms_controlled_option_usage_count(uuid),
  public.cms_controlled_ref(text,jsonb,boolean),public.cms_normalize_controlled_payload(text,jsonb,boolean),
  public.cms_manage_controlled_vocabulary(uuid,text,jsonb,jsonb,text,text,timestamptz,uuid) to service_role;

update public.cms_capability_registry set
  validation_contract=validation_contract||'{"controlledVocabulary":true,"stableIds":true,"requiredDimensions":true}'::jsonb,
  test_contract=test_contract||'{"controlledVocabularyRls":true,"unknownBulkTermsRejected":true,"usageGuard":true}'::jsonb
where consumer_id in('cms.catalog-product.v1','cms.service.v1');
