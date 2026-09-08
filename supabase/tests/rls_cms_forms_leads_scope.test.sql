begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(52);

select has_column('public','cms_form_definitions','qa_actor_id',
  'forms persist their authoritative QA actor');
select has_column('public','cms_leads','capture_hash',
  'leads persist an immutable capture binding');
select has_column('public','cms_leads','qa_actor_id',
  'leads persist authoritative QA provenance');
select has_column('public','cms_lead_exports','qa_actor_id',
  'exports persist authoritative QA provenance');
select has_function('public','cms_forms_list_scoped',
  array['uuid','text','text','text','timestamptz','integer'],
  'forms have a scoped administrative reader');
select has_function('public','cms_leads_list_scoped',
  array['uuid','text','text','integer','integer','text','text','timestamptz'],
  'leads have a scoped administrative reader');
select has_function('public','cms_public_form_scoped',
  array['text','text','uuid','uuid'],
  'public form lookup is environment scoped');
select has_function('public','cms_capture_lead_scoped',
  array['text','uuid','uuid','uuid','jsonb','jsonb','jsonb','jsonb','uuid'],
  'lead capture has an authoritative scoped command');
select has_function('public','cms_manage_lead_scoped',
  array['uuid','text','uuid','text','uuid','text','text','text','timestamptz','uuid'],
  'lead mutation has an authoritative scoped command');
select has_function('public','cms_export_leads_scoped',
  array['uuid','text','text','text','text','text','timestamptz','uuid'],
  'lead export has an authoritative scoped command');
select has_function('public','cms_apply_lead_retention_scoped',
  array['integer','uuid','text'],
  'retention is split into explicit corporate and QA cohorts');
select isnt(has_function_privilege(
  'anon','public.cms_forms_list_scoped(uuid,text,text,text,timestamptz,integer)','execute'
),true,'anonymous callers cannot invoke scoped form listing');
select isnt(has_function_privilege(
  'authenticated',
  'public.cms_capture_lead_scoped(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid)',
  'execute'
),true,'authenticated callers cannot bypass the public capture Edge');
select is(has_function_privilege(
  'service_role','public.cms_forms_list_scoped(uuid,text,text,text,timestamptz,integer)',
  'execute'
),true,'the trusted Edge role can invoke scoped form listing');
select isnt(has_function_privilege(
  'service_role',
  'public.cms_capture_lead_unscoped_0072(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid)',
  'execute'
),true,'the trusted Edge role cannot invoke legacy unscoped capture');
select is(has_table_privilege('authenticated','public.cms_form_definitions','select'),true,
  'authenticated form reads remain available only through RLS');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('72000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','scope72-corporate@example.test','',now(),'{}',
   '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
  ('72000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','scope72-qa-one@example.test','',now(),'{}',
   '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-88888888","candidateSha":"8888888888888888888888888888888888888888","environment":"staging"}',
   now(),now()),
  ('72000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','scope72-qa-one-peer@example.test','',now(),'{}',
   '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-88888888","candidateSha":"8888888888888888888888888888888888888888","environment":"staging"}',
   now(),now()),
  ('72000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','scope72-qa-two@example.test','',now(),'{}',
   '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-99999999","candidateSha":"9999999999999999999999999999999999999999","environment":"staging"}',
   now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
  ('72000000-0000-4000-8000-000000000001','Scope 72 corporate','active'),
  ('72000000-0000-4000-8000-000000000002','Scope 72 QA one','active'),
  ('72000000-0000-4000-8000-000000000003','Scope 72 QA one peer','active'),
  ('72000000-0000-4000-8000-000000000004','Scope 72 QA two','active');
insert into public.cms_user_roles(user_id,role_key) values
  ('72000000-0000-4000-8000-000000000001','super_admin'),
  ('72000000-0000-4000-8000-000000000002','super_admin'),
  ('72000000-0000-4000-8000-000000000003','super_admin'),
  ('72000000-0000-4000-8000-000000000004','super_admin');

select set_config('cms.qa_mutation_actor_id','72000000-0000-4000-8000-000000000001',true);
insert into public.cms_form_definitions(
  id,form_key,title,purpose,created_by,updated_by
) values (
  '72000000-0000-4000-8000-000000000101','scope72-corporate-form',
  'Scope 72 Corporate Form','Corporate lead capture for scope test',
  '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001'
);
insert into public.cms_form_versions(
  id,form_id,version,definition,consent_text,consent_version,privacy_path,
  sla_minutes,retention_days,status,reason,created_by,published_at
) values (
  '72000000-0000-4000-8000-000000000111','72000000-0000-4000-8000-000000000101',1,
  '{"fields":[{"id":"72000000-0000-4000-8000-000000000901","key":"email-qa","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'Consentimento corporativo controlado','scope72-corp-v1','/politica-de-privacidade',
  60,30,'published','Scope 72 corporate published version',
  '72000000-0000-4000-8000-000000000001',clock_timestamp()
);
update public.cms_form_definitions set
  status='published',active_version_id='72000000-0000-4000-8000-000000000111',
  updated_by='72000000-0000-4000-8000-000000000001'
where id='72000000-0000-4000-8000-000000000101';

select set_config('cms.qa_mutation_actor_id','72000000-0000-4000-8000-000000000002',true);
insert into public.cms_form_definitions(
  id,form_key,title,purpose,created_by,updated_by
) values (
  '72000000-0000-4000-8000-000000000201','scope72-qa-one-form',
  'QA-CMS-FINAL-20260907-88888888 Form','Same-run QA lead capture',
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002'
);
insert into public.cms_form_versions(
  id,form_id,version,definition,consent_text,consent_version,privacy_path,
  sla_minutes,retention_days,status,reason,created_by,published_at
) values (
  '72000000-0000-4000-8000-000000000211','72000000-0000-4000-8000-000000000201',1,
  '{"fields":[{"id":"72000000-0000-4000-8000-000000000902","key":"email-qa","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'QA-CMS-FINAL-20260907-88888888 consentimento','scope72-qa1-v1','/politica-de-privacidade',
  60,1,'published','Scope 72 QA one published version',
  '72000000-0000-4000-8000-000000000002',clock_timestamp()
);
update public.cms_form_definitions set
  status='published',active_version_id='72000000-0000-4000-8000-000000000211',
  updated_by='72000000-0000-4000-8000-000000000002'
where id='72000000-0000-4000-8000-000000000201';

select set_config('cms.qa_mutation_actor_id','72000000-0000-4000-8000-000000000004',true);
insert into public.cms_form_definitions(
  id,form_key,title,purpose,created_by,updated_by
) values (
  '72000000-0000-4000-8000-000000000301','scope72-qa-two-form',
  'QA-CMS-FINAL-20260907-99999999 Form','Other-run QA lead capture',
  '72000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000004'
);
insert into public.cms_form_versions(
  id,form_id,version,definition,consent_text,consent_version,privacy_path,
  sla_minutes,retention_days,status,reason,created_by,published_at
) values (
  '72000000-0000-4000-8000-000000000311','72000000-0000-4000-8000-000000000301',1,
  '{"fields":[{"id":"72000000-0000-4000-8000-000000000903","key":"email-qa","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'QA-CMS-FINAL-20260907-99999999 consentimento','scope72-qa2-v1','/politica-de-privacidade',
  60,1,'published','Scope 72 QA two published version',
  '72000000-0000-4000-8000-000000000004',clock_timestamp()
);
update public.cms_form_definitions set
  status='published',active_version_id='72000000-0000-4000-8000-000000000311',
  updated_by='72000000-0000-4000-8000-000000000004'
where id='72000000-0000-4000-8000-000000000301';

select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000101','staging'
),true,'corporate can read its corporate form');
select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000201','staging'
),false,'corporate cannot read the QA form by UUID');
select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000201','staging'
),true,'QA can read its exact same-run form');
select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000101','staging'
),false,'QA cannot read a corporate form by UUID');
select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000301','staging'
),false,'QA cannot read another run form by UUID');
select is(private.cms_form_scope_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000201','production'
),false,'a staging QA lease cannot be replayed in production');
select is(private.cms_form_public_allowed(
  '72000000-0000-4000-8000-000000000101','staging'
),true,'a corporate published form remains public');
select is(private.cms_form_public_allowed(
  '72000000-0000-4000-8000-000000000201','staging'
),true,'an active exact-run QA form is available for controlled validation');
select is(private.cms_form_public_allowed(
  '72000000-0000-4000-8000-000000000201','production'
),false,'a staging QA form is never public in production');
select is(private.cms_lead_assignee_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000003','staging'
),true,'QA can assign a peer from the exact same run');
select is(private.cms_lead_assignee_allowed(
  '72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','staging'
),false,'QA cannot assign a corporate operator');
select is(private.cms_lead_assignee_allowed(
  '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002','staging'
),false,'corporate cannot assign an ever-QA operator');
select is(private.cms_lead_assignee_allowed(
  '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','staging'
),true,'corporate can assign an ordinary active operator');

create temporary table scope72_results(key text primary key,response jsonb);
insert into scope72_results values (
  'corporate',public.cms_capture_lead_scoped(
    'staging','72000000-0000-4000-8000-000000000101',
    '72000000-0000-4000-8000-000000000111','72000000-0000-4000-8000-000000000121',
    '{"email-qa":"corporate@example.test"}',
    '{"path":"/contato","source":"website","utm":{}}',
    '{"accepted":true,"text":"Consentimento corporativo controlado","version":"scope72-corp-v1"}',
    '{}','72000000-0000-4000-8000-000000000122'
  )
),(
  'qa-one',public.cms_capture_lead_scoped(
    'staging','72000000-0000-4000-8000-000000000201',
    '72000000-0000-4000-8000-000000000211','72000000-0000-4000-8000-000000000221',
    '{"email-qa":"qa-one@example.invalid"}',
    '{"path":"/qa-cms-final/qa-cms-final-20260907-88888888","source":"qa_fixture","utm":{}}',
    '{"accepted":true,"text":"QA-CMS-FINAL-20260907-88888888 consentimento","version":"scope72-qa1-v1"}',
    '{"ignored":"must-not-persist"}','72000000-0000-4000-8000-000000000222'
  )
),(
  'qa-two',public.cms_capture_lead_scoped(
    'staging','72000000-0000-4000-8000-000000000301',
    '72000000-0000-4000-8000-000000000311','72000000-0000-4000-8000-000000000321',
    '{"email-qa":"qa-two@example.invalid"}',
    '{"path":"/qa-cms-final/qa-cms-final-20260907-99999999","source":"qa_fixture","utm":{}}',
    '{"accepted":true,"text":"QA-CMS-FINAL-20260907-99999999 consentimento","version":"scope72-qa2-v1"}',
    '{}','72000000-0000-4000-8000-000000000322'
  )
);

select is(private.cms_lead_scope_allowed(
  '72000000-0000-4000-8000-000000000001',
  (select (response->>'leadId')::uuid from scope72_results where key='corporate'),'staging'
),true,'corporate can read its ordinary lead');
select is(private.cms_lead_scope_allowed(
  '72000000-0000-4000-8000-000000000001',
  (select (response->>'leadId')::uuid from scope72_results where key='qa-one'),'staging'
),false,'corporate cannot read a QA lead by UUID');
select is(private.cms_lead_scope_allowed(
  '72000000-0000-4000-8000-000000000002',
  (select (response->>'leadId')::uuid from scope72_results where key='qa-one'),'staging'
),true,'QA can read its exact same-run lead');
select is(private.cms_lead_scope_allowed(
  '72000000-0000-4000-8000-000000000002',
  (select (response->>'leadId')::uuid from scope72_results where key='corporate'),'staging'
),false,'QA cannot read a corporate lead by UUID');
select is(private.cms_lead_scope_allowed(
  '72000000-0000-4000-8000-000000000002',
  (select (response->>'leadId')::uuid from scope72_results where key='qa-two'),'staging'
),false,'QA cannot read another run lead by UUID');
select is(private.cms_lead_external_delivery_allowed(
  (select (response->>'leadId')::uuid from scope72_results where key='corporate')
),true,'ordinary corporate outbox remains externally deliverable');
select is(private.cms_lead_external_delivery_allowed(
  (select (response->>'leadId')::uuid from scope72_results where key='qa-one')
),false,'synthetic outbox is never externally deliverable');
select is(private.cms_lead_system_scope(
  (select (response->>'leadId')::uuid from scope72_results where key='corporate')
),'corporate','system jobs classify ordinary leads separately');
select is(private.cms_lead_system_scope(
  (select (response->>'leadId')::uuid from scope72_results where key='qa-one')
),'qa','system jobs classify QA leads separately');
select throws_ok($$
  select public.cms_capture_lead_scoped(
    'staging','72000000-0000-4000-8000-000000000201',
    '72000000-0000-4000-8000-000000000211','72000000-0000-4000-8000-000000000223',
    '{"email-qa":"cross-run@example.invalid"}',
    '{"path":"/qa-cms-final/qa-cms-final-20260907-99999999","source":"qa_fixture","utm":{}}',
    '{"accepted":true,"text":"QA-CMS-FINAL-20260907-88888888 consentimento","version":"scope72-qa1-v1"}',
    '{}','72000000-0000-4000-8000-000000000224'
  )
$$,'42501','CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN',
  'cross-run public origin is rejected before capture');

select is((public.cms_export_leads_scoped(
  '72000000-0000-4000-8000-000000000001','staging',null,'Scope 72 corporate export',
  'aal2','scope72-corporate-session',now(),'72000000-0000-4000-8000-000000000131'
)->>'rowCount')::integer,1,'corporate export contains no QA PII');
select is((public.cms_export_leads_scoped(
  '72000000-0000-4000-8000-000000000002','staging',null,'Scope 72 QA export',
  'aal2','scope72-qa-session',now(),'72000000-0000-4000-8000-000000000231'
)->>'rowCount')::integer,1,'QA export contains exactly its same-run lead');
select throws_ok(format(
  'select public.cms_manage_lead_scoped(%L,%L,%L,%L,null,%L,%L,%L,now(),%L)',
  '72000000-0000-4000-8000-000000000002','staging',
  (select response->>'leadId' from scope72_results where key='corporate'),
  'assigned','Cross-scope IDOR attempt','aal2','scope72-qa-session',
  '72000000-0000-4000-8000-000000000232'
),'P0002','CMS_LEAD_NOT_FOUND','QA cannot mutate a corporate lead by UUID');
select throws_ok(format(
  'select public.cms_manage_lead_scoped(%L,%L,%L,%L,%L,%L,%L,%L,now(),%L)',
  '72000000-0000-4000-8000-000000000002','staging',
  (select response->>'leadId' from scope72_results where key='qa-one'),
  'assigned','72000000-0000-4000-8000-000000000001',
  'Cross-scope assignee attempt','aal2','scope72-qa-session',
  '72000000-0000-4000-8000-000000000233'
),'42501','CMS_LEAD_ASSIGNEE_SCOPE_FORBIDDEN','QA cannot assign a corporate operator');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','72000000-0000-4000-8000-000000000001','role','authenticated',
  'session_id','scope72-corporate-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_form_definitions),
  array['72000000-0000-4000-8000-000000000101'::uuid]::text,
  'direct PostgREST corporate form reads exclude every QA form');
select is((select count(*)::integer from public.cms_leads),1,
  'direct PostgREST corporate lead reads exclude every QA lead');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','72000000-0000-4000-8000-000000000002','role','authenticated',
  'session_id','scope72-qa-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_form_definitions),
  array['72000000-0000-4000-8000-000000000201'::uuid]::text,
  'direct PostgREST QA form reads expose only the exact run');
select is((select count(*)::integer from public.cms_leads),1,
  'direct PostgREST QA lead reads expose only the exact run');
reset role;

update private.cms_qa_actor_leases
set status='cleaned',cleaned_at=clock_timestamp()
where actor_id='72000000-0000-4000-8000-000000000004';

select throws_ok($$
  select public.cms_forms_list_scoped(
    '72000000-0000-4000-8000-000000000004','staging','aal2',
    'scope72-qa-two-session',now(),500
  )
$$,'42501','CMS_FORMS_SCOPE_FORBIDDEN','expired QA cannot list forms');
select is((select status from public.cms_form_definitions
  where id='72000000-0000-4000-8000-000000000301'),'retired',
  'terminal cleanup retires the QA form');
select is((select count(*)::integer from public.cms_leads
  where form_id='72000000-0000-4000-8000-000000000301' and anonymized_at is not null),1,
  'terminal cleanup anonymizes every lead on the QA form');
select is((select count(*)::integer from public.cms_lead_outbox outbox
  join public.cms_leads lead on lead.id=outbox.lead_id
  where lead.form_id='72000000-0000-4000-8000-000000000301'
    and outbox.status='completed'),1,
  'terminal cleanup makes every QA outbox event non-actionable');
select is((select count(*)::integer from public.cms_audit_log audit
  where audit.actor_id='72000000-0000-4000-8000-000000000004'
    and audit.action='cms:qa.forms_leads.cleanup'),1,
  'terminal cleanup preserves an immutable audit record');

select * from finish();
rollback;
