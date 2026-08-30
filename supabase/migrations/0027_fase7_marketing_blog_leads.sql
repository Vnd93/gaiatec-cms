-- Fase 7 — blog, campanhas, formularios e leads governados.
-- Clean-room: esta migration cria apenas estrutura e capacidades tecnicas.
-- Nao insere artigos, campanhas, formularios, contatos, menus, leads ou midia.

alter table public.cms_content_items drop constraint if exists cms_content_items_content_type_check;
alter table public.cms_content_items add constraint cms_content_items_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage','navigation','site_settings','placement','campaign'));
alter table public.cms_capability_registry drop constraint if exists cms_capability_registry_content_type_check;
alter table public.cms_capability_registry add constraint cms_capability_registry_content_type_check
  check (content_type in ('product','service','industry','application','solution','post','page','homepage','navigation','site_settings','placement','campaign'));

insert into public.cms_permissions(permission_key,description,critical) values
  ('cms:campaigns.read','Consultar campanhas e landing pages.',false),
  ('cms:campaigns.edit','Criar e editar campanhas e landing pages.',false),
  ('cms:campaigns.approve','Aprovar campanhas e landing pages.',false),
  ('cms:campaigns.publish','Publicar, expirar e restaurar campanhas.',true),
  ('cms:forms.read','Consultar definicoes e versoes de formularios.',false),
  ('cms:forms.edit','Criar novas versoes de formularios.',false),
  ('cms:forms.publish','Publicar ou retirar versoes de formularios.',true),
  ('lead:read','Consultar leads dentro do escopo autorizado.',false),
  ('lead:assign','Atribuir e alterar atendimento de leads.',false),
  ('lead:export','Exportar leads com trilha de auditoria.',true),
  ('lead:privacy','Anonimizar e aplicar retencao de leads.',true)
on conflict(permission_key) do nothing;

insert into public.cms_role_permissions(role_key,permission_key)
select role_key,permission_key from (
  select 'super_admin'::text role_key,permission_key from public.cms_permissions where permission_key like 'cms:campaigns.%' or permission_key like 'cms:forms.%' or permission_key like 'lead:%'
  union all select 'admin',permission_key from public.cms_permissions where permission_key like 'cms:campaigns.%' or permission_key like 'cms:forms.%' or permission_key like 'lead:%'
  union all select 'marketing',permission_key from public.cms_permissions where permission_key in ('cms:campaigns.read','cms:campaigns.edit','cms:campaigns.publish','cms:forms.read','cms:forms.edit','lead:read')
  union all select 'commercial',permission_key from public.cms_permissions where permission_key in ('cms:campaigns.read','cms:forms.read','lead:read','lead:assign','lead:export')
  union all select 'editor',permission_key from public.cms_permissions where permission_key in ('cms:campaigns.read','cms:campaigns.edit','cms:forms.read')
  union all select 'reviewer',permission_key from public.cms_permissions where permission_key in ('cms:campaigns.read','cms:campaigns.approve','cms:forms.read')
) grants
on conflict do nothing;

create or replace function public.cms_content_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_content_type='product' and p_action in ('read','edit','publish') then 'cms:products.'||p_action
    when p_content_type='service' and p_action in ('read','edit','publish') then 'cms:services.'||p_action
    when p_content_type='industry' and p_action in ('read','edit','publish') then 'cms:industries.'||p_action
    when p_content_type='application' and p_action in ('read','edit','publish') then 'cms:applications.'||p_action
    when p_content_type='solution' and p_action in ('read','edit','publish') then 'cms:solutions.'||p_action
    when p_content_type='post' and p_action in ('read','edit','review','approve','publish') then 'cms:posts.'||p_action
    when p_content_type='page' and p_action in ('read','edit','publish') then 'cms:pages.'||p_action
    when p_content_type='homepage' and p_action in ('read','edit','publish') then 'cms:homepage.'||p_action
    when p_content_type='navigation' and p_action in ('read','edit','publish') then 'cms:navigation.'||p_action
    when p_content_type='site_settings' and p_action in ('read','edit','publish') then 'cms:settings.'||p_action
    when p_content_type='placement' and p_action in ('read','edit','publish') then 'cms:placements.'||p_action
    when p_content_type='campaign' and p_action in ('read','edit','publish') then 'cms:campaigns.'||p_action
    else null end;
$$;

create or replace function public.cms_editorial_required_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_action in ('create','save','submit','trash','preview') then public.cms_content_permission(p_content_type,'edit')
    when p_action='archive' and p_content_type in ('page','homepage','navigation','site_settings','placement','campaign') then public.cms_content_permission(p_content_type,'publish')
    when p_action='archive' then public.cms_content_permission(p_content_type,'edit')
    when p_action='approve' and p_content_type='post' then 'cms:posts.approve'
    when p_action='approve' and p_content_type='campaign' then 'cms:campaigns.approve'
    when p_action='approve' then public.cms_content_permission(p_content_type,'publish')
    when p_action in ('schedule','publish','restore') then public.cms_content_permission(p_content_type,'publish')
    else null end;
$$;

insert into public.cms_capability_registry(
  consumer_id,content_type,schema_name,schema_version,renderer_key,preview_renderer_key,
  route_pattern,permissions,validation_contract,fixture_contract,test_contract
) values
('cms.blog-article.v1','post','CmsPostContentSchema',1,'structured-article','structured-article','/blog/:slug',
 '{"read":"cms:posts.read","edit":"cms:posts.edit","approve":"cms:posts.approve","publish":"cms:posts.publish"}',
 '{"blocks":["rich_text","image","gallery","cta","related_content"],"author":true,"category":true,"tags":true,"relations":true,"articleSchema":true,"sitemap":true,"seo":true,"provenance":true}',
 '{"kind":"synthetic-only","viewports":["mobile","tablet","desktop"]}',
 '{"contract":true,"editor":true,"preview":true,"articleSchema":true,"sitemap":true,"restore":true,"e2e":true}'),
('cms.campaign-landing.v1','campaign','CmsCampaignContentSchema',1,'campaign-landing','campaign-landing','/campanhas/:slug',
 '{"read":"cms:campaigns.read","edit":"cms:campaigns.edit","approve":"cms:campaigns.approve","publish":"cms:campaigns.publish"}',
 '{"blocks":["hero","rich_text","image","gallery","benefit_grid","content_grid","steps","metrics","testimonial","faq","form","cta","related_content"],"templates":true,"placements":true,"formVersion":true,"consentedTracking":true,"expiry":true,"seo":true,"provenance":true}',
 '{"kind":"synthetic-only","viewports":["mobile","tablet","desktop"]}',
 '{"contract":true,"builder":true,"preview":true,"schedule":true,"expiry":true,"leadFlow":true,"a11y":true,"e2e":true}')
on conflict(consumer_id) do update set permissions=excluded.permissions,validation_contract=excluded.validation_contract,
  fixture_contract=excluded.fixture_contract,test_contract=excluded.test_contract,enabled=true,updated_at=now();

create table public.cms_blog_authors(
  id uuid primary key,
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check(char_length(btrim(name)) between 1 and 120),
  role_name text check(role_name is null or char_length(role_name)<=120),
  bio text check(bio is null or char_length(bio)<=800),
  status text not null default 'active' check(status in ('active','archived')),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.cms_blog_categories(
  id uuid primary key,
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check(char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check(status in ('active','archived')),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.cms_blog_tags(
  id uuid primary key,
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check(char_length(btrim(name)) between 1 and 80),
  status text not null default 'active' check(status in ('active','archived')),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table public.cms_form_definitions(
  id uuid primary key default gen_random_uuid(),
  form_key text not null unique check(form_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  purpose text not null check(char_length(btrim(purpose)) between 3 and 500),
  status text not null default 'draft' check(status in ('draft','published','retired')),
  active_version_id uuid,
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.cms_form_versions(
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cms_form_definitions(id) on delete restrict,
  version integer not null check(version>0),
  definition jsonb not null check(jsonb_typeof(definition)='object'),
  consent_text text not null check(char_length(btrim(consent_text)) between 3 and 2000),
  consent_version text not null check(char_length(btrim(consent_version)) between 1 and 80),
  privacy_path text not null check(privacy_path ~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'),
  sla_minutes integer not null check(sla_minutes between 5 and 525600),
  retention_days integer not null check(retention_days between 1 and 3650),
  status text not null default 'draft' check(status in ('draft','published','retired')),
  reason text not null check(char_length(btrim(reason)) between 3 and 500),
  created_by uuid not null references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),published_at timestamptz,
  unique(form_id,version),unique(id,form_id),
  check((status='draft' and published_at is null) or (status in ('published','retired') and published_at is not null))
);
alter table public.cms_form_definitions add constraint cms_form_active_version_fk
  foreign key(active_version_id,id) references public.cms_form_versions(id,form_id) on delete restrict;

create table public.cms_leads(
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  form_id uuid not null references public.cms_form_definitions(id) on delete restrict,
  form_version_id uuid not null,
  idempotency_key uuid not null unique,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  origin_path text not null check(origin_path like '/%'),
  origin_source text not null check(char_length(origin_source) between 1 and 120),
  campaign_id uuid references public.cms_content_items(id) on delete restrict,
  product_id uuid references public.cms_content_items(id) on delete restrict,
  utm jsonb not null default '{}'::jsonb check(jsonb_typeof(utm)='object'),
  status text not null default 'new' check(status in ('new','assigned','in_service','responded','converted','disqualified','archived','anonymized')),
  assigned_to uuid references public.cms_profiles(user_id) on delete restrict,
  sla_due_at timestamptz not null,
  sla_notified_at timestamptz,
  retention_until timestamptz not null,
  last_activity_at timestamptz not null default now(),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(form_version_id,form_id) references public.cms_form_versions(id,form_id) on delete restrict,
  check((status='anonymized')=(anonymized_at is not null))
);
create table public.cms_lead_consents(
  id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.cms_leads(id) on delete restrict,
  accepted boolean not null check(accepted),consent_text text not null,consent_version text not null,
  policy_path text not null,server_recorded_at timestamptz not null default now(),
  evidence_hash text not null check(evidence_hash ~ '^[0-9a-f]{64}$'),technical_evidence jsonb not null default '{}'::jsonb
);
create table public.cms_lead_status_history(
  id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.cms_leads(id) on delete restrict,
  from_status text,to_status text not null,from_assignee uuid,to_assignee uuid,
  reason text not null check(char_length(btrim(reason)) between 3 and 500),actor_id uuid references public.cms_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.cms_lead_outbox(
  id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.cms_leads(id) on delete restrict,
  event_type text not null check(event_type in ('lead_received','lead_assigned','lead_status_changed','sla_breached','retention_due')),
  status text not null default 'pending' check(status in ('pending','processing','completed','failed','dead_letter')),
  idempotency_key uuid not null unique,attempts integer not null default 0 check(attempts between 0 and 20),
  available_at timestamptz not null default now(),locked_at timestamptz,completed_at timestamptz,last_error_code text,
  correlation_id uuid not null,created_at timestamptz not null default now()
);
create table public.cms_lead_exports(
  id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.cms_profiles(user_id) on delete restrict,
  filter_snapshot jsonb not null check(jsonb_typeof(filter_snapshot)='object'),row_count integer not null check(row_count>=0),
  justification text not null check(char_length(btrim(justification)) between 3 and 500),
  correlation_id uuid not null,created_at timestamptz not null default now()
);
create index cms_leads_queue_idx on public.cms_leads(status,sla_due_at,created_at);
create index cms_leads_assignee_idx on public.cms_leads(assigned_to,status,last_activity_at desc);
create index cms_leads_retention_idx on public.cms_leads(retention_until) where anonymized_at is null;
create index cms_lead_outbox_ready_idx on public.cms_lead_outbox(status,available_at) where status in ('pending','failed');

create trigger cms_blog_authors_touch before update on public.cms_blog_authors for each row execute function public.cms_touch_updated_at();
create trigger cms_blog_categories_touch before update on public.cms_blog_categories for each row execute function public.cms_touch_updated_at();
create trigger cms_blog_tags_touch before update on public.cms_blog_tags for each row execute function public.cms_touch_updated_at();
create trigger cms_forms_touch before update on public.cms_form_definitions for each row execute function public.cms_touch_updated_at();
create trigger cms_leads_touch before update on public.cms_leads for each row execute function public.cms_touch_updated_at();
create function public.cms_form_version_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'CMS_IMMUTABLE_RECORD' using errcode='55000'; end if;
  if row(old.id,old.form_id,old.version,old.definition,old.consent_text,old.consent_version,old.privacy_path,old.sla_minutes,old.retention_days,old.reason,old.created_by,old.created_at)
     is distinct from row(new.id,new.form_id,new.version,new.definition,new.consent_text,new.consent_version,new.privacy_path,new.sla_minutes,new.retention_days,new.reason,new.created_by,new.created_at) then
    raise exception 'CMS_IMMUTABLE_RECORD' using errcode='55000';
  end if;
  if old.status='retired' or (old.status='published' and new.status not in ('published','retired')) then raise exception 'CMS_FORM_TRANSITION_INVALID' using errcode='23514'; end if;
  return new;
end $$;
create trigger cms_form_versions_immutable before update or delete on public.cms_form_versions for each row execute function public.cms_form_version_guard();
create trigger cms_lead_consents_immutable before update or delete on public.cms_lead_consents for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_lead_history_immutable before update or delete on public.cms_lead_status_history for each row execute function public.cms_reject_immutable_mutation();
create trigger cms_lead_exports_immutable before update or delete on public.cms_lead_exports for each row execute function public.cms_reject_immutable_mutation();

alter table public.cms_blog_authors enable row level security;
alter table public.cms_blog_categories enable row level security;
alter table public.cms_blog_tags enable row level security;
alter table public.cms_form_definitions enable row level security;
alter table public.cms_form_versions enable row level security;
alter table public.cms_leads enable row level security;
alter table public.cms_lead_consents enable row level security;
alter table public.cms_lead_status_history enable row level security;
alter table public.cms_lead_outbox enable row level security;
alter table public.cms_lead_exports enable row level security;

create policy cms_blog_authors_read on public.cms_blog_authors for select to authenticated using(public.cms_has_permission('cms:posts.read'));
create policy cms_blog_categories_read on public.cms_blog_categories for select to authenticated using(public.cms_has_permission('cms:posts.read'));
create policy cms_blog_tags_read on public.cms_blog_tags for select to authenticated using(public.cms_has_permission('cms:posts.read'));
create policy cms_forms_read on public.cms_form_definitions for select to authenticated using(public.cms_has_permission('cms:forms.read'));
create policy cms_form_versions_read on public.cms_form_versions for select to authenticated using(public.cms_has_permission('cms:forms.read'));
create policy cms_leads_read on public.cms_leads for select to authenticated using(public.cms_has_permission('lead:read'));
create policy cms_lead_consents_read on public.cms_lead_consents for select to authenticated using(public.cms_has_permission('lead:read'));
create policy cms_lead_history_read on public.cms_lead_status_history for select to authenticated using(public.cms_has_permission('lead:read'));
create policy cms_lead_outbox_read on public.cms_lead_outbox for select to authenticated using(public.cms_has_permission('lead:read'));
create policy cms_lead_exports_read on public.cms_lead_exports for select to authenticated using(actor_id=auth.uid() or public.cms_has_permission('cms:audit.read'));

revoke all on table public.cms_blog_authors,public.cms_blog_categories,public.cms_blog_tags,
  public.cms_form_definitions,public.cms_form_versions,public.cms_leads,public.cms_lead_consents,
  public.cms_lead_status_history,public.cms_lead_outbox,public.cms_lead_exports from public,anon,authenticated;
grant select on table public.cms_blog_authors,public.cms_blog_categories,public.cms_blog_tags,
  public.cms_form_definitions,public.cms_form_versions,public.cms_leads,public.cms_lead_consents,
  public.cms_lead_status_history,public.cms_lead_outbox,public.cms_lead_exports to authenticated;
grant all on table public.cms_blog_authors,public.cms_blog_categories,public.cms_blog_tags,
  public.cms_form_definitions,public.cms_form_versions,public.cms_leads,public.cms_lead_consents,
  public.cms_lead_status_history,public.cms_lead_outbox,public.cms_lead_exports to service_role;

create function public.cms_sync_blog_taxonomy(p_actor_id uuid,p_payload jsonb,p_aal text,p_session_id text,p_issued_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tag jsonb;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:posts.edit',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  insert into public.cms_blog_authors(id,slug,name,role_name,bio,created_by,updated_by)
  values((p_payload#>>'{author,id}')::uuid,p_payload#>>'{author,slug}',p_payload#>>'{author,name}',p_payload#>>'{author,role}',p_payload#>>'{author,bio}',p_actor_id,p_actor_id)
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,role_name=excluded.role_name,bio=excluded.bio,updated_by=p_actor_id;
  insert into public.cms_blog_categories(id,slug,name,created_by,updated_by)
  values((p_payload#>>'{category,id}')::uuid,p_payload#>>'{category,slug}',p_payload#>>'{category,name}',p_actor_id,p_actor_id)
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,updated_by=p_actor_id;
  for tag in select value from jsonb_array_elements(coalesce(p_payload->'tags','[]'::jsonb)) loop
    insert into public.cms_blog_tags(id,slug,name,created_by,updated_by)
    values((tag->>'id')::uuid,tag->>'slug',tag->>'name',p_actor_id,p_actor_id)
    on conflict(id) do update set slug=excluded.slug,name=excluded.name,updated_by=p_actor_id;
  end loop;
end $$;

create function public.cms_save_form_version(p_actor_id uuid,p_form_id uuid,p_form_key text,p_title text,p_purpose text,p_definition jsonb,p_consent_text text,p_consent_version text,p_privacy_path text,p_sla_minutes integer,p_retention_days integer,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare form_row public.cms_form_definitions%rowtype; version_row public.cms_form_versions%rowtype; next_version integer;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:forms.edit',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  if jsonb_typeof(p_definition)<>'object' or jsonb_typeof(p_definition->'fields')<>'array' or jsonb_array_length(p_definition->'fields')=0 then raise exception 'CMS_FORM_SCHEMA_INVALID' using errcode='23514'; end if;
  if p_form_id is null then
    insert into public.cms_form_definitions(form_key,title,purpose,created_by,updated_by) values(p_form_key,p_title,p_purpose,p_actor_id,p_actor_id) returning * into form_row;
  else
    select * into form_row from public.cms_form_definitions where id=p_form_id for update;
    if not found then raise exception 'CMS_FORM_NOT_FOUND' using errcode='P0002'; end if;
    update public.cms_form_definitions set form_key=p_form_key,title=p_title,purpose=p_purpose,updated_by=p_actor_id where id=form_row.id returning * into form_row;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.cms_form_versions where form_id=form_row.id;
  insert into public.cms_form_versions(form_id,version,definition,consent_text,consent_version,privacy_path,sla_minutes,retention_days,reason,created_by)
  values(form_row.id,next_version,p_definition,p_consent_text,p_consent_version,p_privacy_path,p_sla_minutes,p_retention_days,p_reason,p_actor_id) returning * into version_row;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'cms:form.version.create','form',form_row.id::text,jsonb_build_object('versionId',version_row.id,'version',next_version),p_correlation_id);
  return jsonb_build_object('formId',form_row.id,'versionId',version_row.id,'version',next_version,'status','draft');
end $$;

create function public.cms_publish_form_version(p_actor_id uuid,p_form_id uuid,p_version_id uuid,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version_row public.cms_form_versions%rowtype;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:forms.publish',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select * into version_row from public.cms_form_versions where id=p_version_id and form_id=p_form_id;
  if not found then raise exception 'CMS_FORM_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  update public.cms_form_versions set status='retired' where form_id=p_form_id and status='published';
  update public.cms_form_versions set status='published',published_at=now() where id=p_version_id;
  update public.cms_form_definitions set status='published',active_version_id=p_version_id,updated_by=p_actor_id where id=p_form_id;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'cms:form.publish','form',p_form_id::text,jsonb_build_object('versionId',p_version_id),p_correlation_id);
  return jsonb_build_object('formId',p_form_id,'versionId',p_version_id,'status','published');
end $$;

create function public.cms_capture_lead(p_form_id uuid,p_form_version_id uuid,p_idempotency_key uuid,p_fields jsonb,p_origin jsonb,p_consent jsonb,p_technical_evidence jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare version_row public.cms_form_versions%rowtype; form_row public.cms_form_definitions%rowtype; lead_row public.cms_leads%rowtype; required_field jsonb; evidence_hash text;
begin
  select * into form_row from public.cms_form_definitions where id=p_form_id and status='published';
  select * into version_row from public.cms_form_versions where id=p_form_version_id and form_id=p_form_id and status='published';
  if form_row.id is null or version_row.id is null or form_row.active_version_id<>version_row.id then raise exception 'CMS_FORM_VERSION_INACTIVE' using errcode='23514'; end if;
  if coalesce((p_consent->>'accepted')::boolean,false) is not true or p_consent->>'text' is distinct from version_row.consent_text or p_consent->>'version' is distinct from version_row.consent_version then raise exception 'CMS_CONSENT_INVALID' using errcode='23514'; end if;
  if jsonb_typeof(p_fields)<>'object' then raise exception 'CMS_LEAD_FIELDS_INVALID' using errcode='23514'; end if;
  if exists(select 1 from jsonb_object_keys(p_fields) submitted(key) where not exists(select 1 from jsonb_array_elements(version_row.definition->'fields') field where field->>'key'=submitted.key and field->>'type'<>'hidden')) then raise exception 'CMS_LEAD_FIELD_UNKNOWN' using errcode='23514'; end if;
  for required_field in select value from jsonb_array_elements(version_row.definition->'fields') where coalesce((value->>'required')::boolean,false) loop
    if not (p_fields ? (required_field->>'key')) or nullif(btrim(p_fields->>(required_field->>'key')),'') is null then raise exception 'CMS_LEAD_REQUIRED_FIELD:%',required_field->>'key' using errcode='23514'; end if;
  end loop;
  select * into lead_row from public.cms_leads where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('leadId',lead_row.id,'reference',lead_row.reference_code,'duplicate',true); end if;
  if p_origin ? 'campaignId' and not exists(select 1 from public.cms_content_items where id=(p_origin->>'campaignId')::uuid and content_type='campaign') then raise exception 'CMS_LEAD_CAMPAIGN_INVALID' using errcode='23514'; end if;
  if p_origin ? 'productId' and not exists(select 1 from public.cms_content_items where id=(p_origin->>'productId')::uuid and content_type='product') then raise exception 'CMS_LEAD_PRODUCT_INVALID' using errcode='23514'; end if;
  insert into public.cms_leads(reference_code,form_id,form_version_id,idempotency_key,payload,origin_path,origin_source,campaign_id,product_id,utm,sla_due_at,retention_until)
  values('LD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),p_form_id,p_form_version_id,p_idempotency_key,p_fields,p_origin->>'path',p_origin->>'source',nullif(p_origin->>'campaignId','')::uuid,nullif(p_origin->>'productId','')::uuid,coalesce(p_origin->'utm','{}'::jsonb),now()+make_interval(mins=>version_row.sla_minutes),now()+make_interval(days=>version_row.retention_days))
  on conflict(idempotency_key) do nothing returning * into lead_row;
  if not found then
    select * into lead_row from public.cms_leads where idempotency_key=p_idempotency_key;
    return jsonb_build_object('leadId',lead_row.id,'reference',lead_row.reference_code,'duplicate',true);
  end if;
  evidence_hash:=encode(digest(convert_to(lead_row.id::text||':'||version_row.consent_version||':'||now()::text,'UTF8'),'sha256'),'hex');
  insert into public.cms_lead_consents(lead_id,accepted,consent_text,consent_version,policy_path,evidence_hash,technical_evidence) values(lead_row.id,true,version_row.consent_text,version_row.consent_version,version_row.privacy_path,evidence_hash,p_technical_evidence);
  insert into public.cms_lead_status_history(lead_id,to_status,reason) values(lead_row.id,'new','Lead persistido antes da notificacao');
  insert into public.cms_lead_outbox(lead_id,event_type,idempotency_key,correlation_id) values(lead_row.id,'lead_received',gen_random_uuid(),p_correlation_id);
  return jsonb_build_object('leadId',lead_row.id,'reference',lead_row.reference_code,'duplicate',false);
end $$;

create function public.cms_manage_lead(p_actor_id uuid,p_lead_id uuid,p_status text,p_assigned_to uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare lead_row public.cms_leads%rowtype; old_status text; old_assignee uuid;
begin
  if not public.cms_actor_authorized(p_actor_id,'lead:assign',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select * into lead_row from public.cms_leads where id=p_lead_id for update;
  if not found or lead_row.status='anonymized' then raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002'; end if;
  if p_status not in ('new','assigned','in_service','responded','converted','disqualified','archived') then raise exception 'CMS_LEAD_STATUS_INVALID' using errcode='23514'; end if;
  old_status:=lead_row.status; old_assignee:=lead_row.assigned_to;
  update public.cms_leads set status=p_status,assigned_to=p_assigned_to,last_activity_at=now() where id=p_lead_id;
  insert into public.cms_lead_status_history(lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id) values(p_lead_id,old_status,p_status,old_assignee,p_assigned_to,p_reason,p_actor_id);
  insert into public.cms_lead_outbox(lead_id,event_type,idempotency_key,correlation_id) values(p_lead_id,case when old_assignee is distinct from p_assigned_to then 'lead_assigned' else 'lead_status_changed' end,gen_random_uuid(),p_correlation_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'lead:update','lead',p_lead_id::text,jsonb_build_object('from',old_status,'to',p_status,'assignedTo',p_assigned_to),p_correlation_id);
  return jsonb_build_object('leadId',p_lead_id,'status',p_status,'assignedTo',p_assigned_to);
end $$;

create function public.cms_export_leads(p_actor_id uuid,p_status text,p_justification text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; rows_count integer;
begin
  if not public.cms_actor_authorized(p_actor_id,'lead:export',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('reference',reference_code,'status',status,'createdAt',created_at,'originPath',origin_path,'originSource',origin_source,'utm',utm,'fields',payload) order by created_at desc),'[]'::jsonb),count(*)
  into result,rows_count
  from (select reference_code,status,created_at,origin_path,origin_source,utm,payload from public.cms_leads where anonymized_at is null and (p_status is null or status=p_status) order by created_at desc limit 5000) exported;
  insert into public.cms_lead_exports(actor_id,filter_snapshot,row_count,justification,correlation_id) values(p_actor_id,jsonb_build_object('status',p_status,'limit',5000),rows_count,p_justification,p_correlation_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'lead:export','lead_export',p_correlation_id::text,jsonb_build_object('rowCount',rows_count,'status',p_status),p_correlation_id);
  return jsonb_build_object('rows',result,'rowCount',rows_count,'correlationId',p_correlation_id);
end $$;

create function public.cms_anonymize_lead(p_actor_id uuid,p_lead_id uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old_status text;
begin
  if not public.cms_actor_authorized(p_actor_id,'lead:privacy',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select status into old_status from public.cms_leads where id=p_lead_id and anonymized_at is null for update;
  if not found then raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002'; end if;
  update public.cms_leads set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',anonymized_at=now(),last_activity_at=now() where id=p_lead_id;
  insert into public.cms_lead_status_history(lead_id,from_status,to_status,reason,actor_id) values(p_lead_id,old_status,'anonymized',p_reason,p_actor_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'lead:anonymize','lead',p_lead_id::text,jsonb_build_object('from',old_status,'reason',p_reason),p_correlation_id);
  return jsonb_build_object('leadId',p_lead_id,'status','anonymized');
end $$;

create function public.cms_apply_lead_retention(p_limit integer,p_correlation_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer:=0; due record;
begin
  for due in select id,status from public.cms_leads where retention_until<=now() and anonymized_at is null order by retention_until for update skip locked limit least(greatest(p_limit,1),500) loop
    update public.cms_leads set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',anonymized_at=now(),last_activity_at=now() where id=due.id;
    insert into public.cms_lead_status_history(lead_id,from_status,to_status,reason) values(due.id,due.status,'anonymized','Retencao automatica aplicada');
    affected:=affected+1;
  end loop;
  insert into public.cms_operational_events(severity,event_type,correlation_id,error_code) values('info','cms.leads.retention_applied',p_correlation_id,'rows_'||affected::text);
  return affected;
end $$;

create function public.cms_claim_lead_outbox(p_limit integer)
returns setof public.cms_lead_outbox language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query with claimed as(
    select id from public.cms_lead_outbox
    where ((status in ('pending','failed') and available_at<=now()) or (status='processing' and locked_at<now()-interval '15 minutes'))
      and attempts<20 order by available_at,created_at for update skip locked limit least(greatest(p_limit,1),50)
  ) update public.cms_lead_outbox o set status='processing',locked_at=now(),attempts=attempts+1 from claimed where o.id=claimed.id returning o.*;
end $$;

create function public.cms_enqueue_lead_sla_breaches(p_limit integer,p_correlation_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer:=0; due record;
begin
  for due in select id from public.cms_leads where status in ('new','assigned','in_service') and sla_due_at<=now() and sla_notified_at is null order by sla_due_at for update skip locked limit least(greatest(p_limit,1),500) loop
    update public.cms_leads set sla_notified_at=now() where id=due.id;
    insert into public.cms_lead_outbox(lead_id,event_type,idempotency_key,correlation_id) values(due.id,'sla_breached',gen_random_uuid(),p_correlation_id);
    affected:=affected+1;
  end loop;
  return affected;
end $$;

create function public.cms_finish_lead_outbox(p_id uuid,p_success boolean,p_error_code text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.cms_lead_outbox set status=case when p_success then 'completed' when attempts>=20 then 'dead_letter' else 'failed' end,locked_at=null,completed_at=case when p_success then now() else null end,last_error_code=case when p_success then null else p_error_code end,available_at=case when p_success then available_at else now()+make_interval(mins=>least(attempts*2,60)) end where id=p_id and status='processing';
  if not found then raise exception 'CMS_LEAD_OUTBOX_NOT_CLAIMED' using errcode='40001'; end if;
end $$;

create function public.cms_validate_phase7_projection()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=new.payload; placement jsonb;
begin
  if new.content_type='post' then
    if new.consumer_id<>'cms.blog-article.v1' or coalesce(p#>>'{author,id}','')='' or coalesce(p#>>'{author,name}','')='' or coalesce(p#>>'{category,id}','')='' or jsonb_typeof(p->'tags') is distinct from 'array' or jsonb_typeof(p->'relations') is distinct from 'object' or coalesce(p->>'excerpt','')='' or coalesce((p->>'readingMinutes')::integer,0)<1 then raise exception 'CMS_BLOG_SCHEMA_INVALID' using errcode='23514'; end if;
    if not exists(select 1 from public.cms_blog_authors where id=(p#>>'{author,id}')::uuid and status='active') or not exists(select 1 from public.cms_blog_categories where id=(p#>>'{category,id}')::uuid and status='active') then raise exception 'CMS_BLOG_TAXONOMY_INVALID' using errcode='23514'; end if;
    if exists(select 1 from jsonb_array_elements(p->'tags') tag where not exists(select 1 from public.cms_blog_tags where id=(tag->>'id')::uuid and status='active')) then raise exception 'CMS_BLOG_TAG_INVALID' using errcode='23514'; end if;
    if new.seo->>'canonicalPath' is distinct from '/blog/'||new.slug then raise exception 'CMS_BLOG_CANONICAL_INVALID' using errcode='23514'; end if;
  elsif new.content_type='campaign' then
    if new.consumer_id<>'cms.campaign-landing.v1' or p#>>'{route,path}' is distinct from '/campanhas/'||new.slug or new.seo->>'canonicalPath' is distinct from p#>>'{route,path}' or coalesce(p->>'templateKey','') not in ('landing_conversion','landing_product','landing_event','landing_download') or (p#>>'{window,startsAt}')::timestamptz >= (p#>>'{window,endsAt}')::timestamptz or coalesce((p#>>'{tracking,requiresConsent}')::boolean,false) is not true then raise exception 'CMS_CAMPAIGN_SCHEMA_INVALID' using errcode='23514'; end if;
    if p->'form' is not null and not exists(select 1 from public.cms_form_versions v join public.cms_form_definitions f on f.id=v.form_id and f.active_version_id=v.id where v.id=(p#>>'{form,versionId}')::uuid and f.id=(p#>>'{form,formId}')::uuid and v.status='published') then raise exception 'CMS_CAMPAIGN_FORM_NOT_PUBLISHED' using errcode='23514'; end if;
    if exists(select 1 from jsonb_array_elements(p->'blocks') block where block->>'type'='form' and (p->'form' is null or block#>>'{data,formId}' is distinct from p#>>'{form,formId}' or block#>>'{data,formVersionId}' is distinct from p#>>'{form,versionId}' or block#>>'{data,formKey}' is distinct from p#>>'{form,key}')) then raise exception 'CMS_CAMPAIGN_FORM_BLOCK_INVALID' using errcode='23514'; end if;
    if p#>>'{expiry,mode}'='redirect' and not public.cms_public_route_exists(p#>>'{expiry,destinationPath}') then raise exception 'CMS_CAMPAIGN_EXPIRY_INVALID' using errcode='23514'; end if;
    if p#>>'{expiry,mode}'='fallback' and not exists(select 1 from public.cms_published_projection where item_id=(p#>>'{expiry,fallbackCampaignId}')::uuid and content_type='campaign') then raise exception 'CMS_CAMPAIGN_FALLBACK_INVALID' using errcode='23514'; end if;
    for placement in select value from jsonb_array_elements(coalesce(p->'placements','[]'::jsonb)) loop
      if placement->>'contextType'<>'global' and not exists(select 1 from public.cms_published_projection where item_id=(placement->>'contextId')::uuid) then raise exception 'CMS_CAMPAIGN_PLACEMENT_ORPHAN' using errcode='23514'; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger cms_phase7_projection_validate before insert or update of payload,seo on public.cms_published_projection for each row execute function public.cms_validate_phase7_projection();

create or replace function public.cms_public_route_exists(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  with normalized as(select case when p_path='/' then '/' else regexp_replace(p_path,'/$','') end path)
  select normalized.path=any(array['/','/sobre','/blog','/busca','/contato','/setores','/servicos','/produtos','/industrias','/aplicacoes','/solucoes','/deteccao-de-gas','/politica-de-privacidade','/termos-de-uso','/produtos/comparador','/biodigestor'])
  or exists(select 1 from public.cms_published_projection projection where case projection.content_type when 'product' then '/produtos/'||projection.slug when 'service' then '/servicos/'||projection.slug when 'industry' then '/industrias/'||projection.slug when 'application' then '/aplicacoes/'||projection.slug when 'solution' then '/solucoes/'||projection.slug when 'post' then '/blog/'||projection.slug when 'campaign' then projection.payload#>>'{route,path}' when 'page' then projection.payload#>>'{route,path}' when 'homepage' then projection.payload#>>'{route,path}' else null end=normalized.path)
  from normalized;
$$;

create function public.cms_expire_campaigns(p_limit integer,p_correlation_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare campaign record; expired integer:=0; destination text; code integer;
begin
  for campaign in select p.*,i.updated_by from public.cms_published_projection p join public.cms_content_items i on i.id=p.item_id where p.content_type='campaign' and (p.payload#>>'{window,endsAt}')::timestamptz<=now() order by p.published_at for update of p skip locked limit least(greatest(p_limit,1),100) loop
    destination:=null; code:=case campaign.payload#>>'{expiry,mode}' when 'redirect' then 301 when 'gone' then 410 when 'not_found' then 404 else 302 end;
    if campaign.payload#>>'{expiry,mode}'='redirect' then destination:=campaign.payload#>>'{expiry,destinationPath}';
    elsif campaign.payload#>>'{expiry,mode}'='fallback' then select payload#>>'{route,path}' into destination from public.cms_published_projection where item_id=(campaign.payload#>>'{expiry,fallbackCampaignId}')::uuid and content_type='campaign'; end if;
    insert into public.cms_route_rules(item_id,source_path,destination_path,status_code,active) values(campaign.item_id,campaign.payload#>>'{route,path}',destination,code,true) on conflict(source_path) do update set destination_path=excluded.destination_path,status_code=excluded.status_code,active=true;
    delete from public.cms_publications where item_id=campaign.item_id;
    delete from public.cms_published_projection where item_id=campaign.item_id;
    update public.cms_content_items set workflow_status='archived',archived_at=now(),updated_by=campaign.updated_by where id=campaign.item_id;
    insert into public.cms_publication_outbox(item_id,revision_id,event_type,correlation_id) values(campaign.item_id,campaign.revision_id,'unpublish',p_correlation_id) on conflict do nothing;
    expired:=expired+1;
  end loop;
  return expired;
end $$;

revoke all on function public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.cms_save_form_version(uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_publish_form_version(uuid,uuid,uuid,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_capture_lead(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.cms_manage_lead(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_export_leads(uuid,text,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_anonymize_lead(uuid,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_apply_lead_retention(integer,uuid) from public,anon,authenticated;
revoke all on function public.cms_claim_lead_outbox(integer) from public,anon,authenticated;
revoke all on function public.cms_enqueue_lead_sla_breaches(integer,uuid) from public,anon,authenticated;
revoke all on function public.cms_finish_lead_outbox(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.cms_expire_campaigns(integer,uuid) from public,anon,authenticated;
grant execute on function public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamptz) to service_role;
grant execute on function public.cms_save_form_version(uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_publish_form_version(uuid,uuid,uuid,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_capture_lead(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.cms_manage_lead(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_export_leads(uuid,text,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_anonymize_lead(uuid,uuid,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_apply_lead_retention(integer,uuid) to service_role;
grant execute on function public.cms_claim_lead_outbox(integer) to service_role;
grant execute on function public.cms_enqueue_lead_sla_breaches(integer,uuid) to service_role;
grant execute on function public.cms_finish_lead_outbox(uuid,boolean,text) to service_role;
grant execute on function public.cms_expire_campaigns(integer,uuid) to service_role;
