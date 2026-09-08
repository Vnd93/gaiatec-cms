begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select has_function(
  'private','cms_projection_binds_exact_form',
  array['uuid','text','uuid','uuid','uuid','text','text','text'],
  'published lead origins have an exact form-binding verifier'
);
select isnt(has_function_privilege(
  'service_role',
  'private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)',
  'execute'
),true,'the projection-binding helper remains owner-only');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '84000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','lead-binding-owner@example.test','',now(),
  '{}','{"synthetic":false,"purpose":"lead-origin-binding"}',now(),now()
);
insert into public.cms_profiles(user_id,display_name,status) values(
  '84000000-0000-4000-8000-000000000001','Lead binding owner','active'
);
select set_config('cms.qa_mutation_actor_id','84000000-0000-4000-8000-000000000001',true);

insert into public.cms_form_definitions(
  id,form_key,title,purpose,created_by,updated_by
) values
(
  '84000000-0000-4000-8000-000000000101','lead-form-a','Lead form A',
  'Primary governed lead form',
  '84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'
),(
  '84000000-0000-4000-8000-000000000102','lead-form-b','Lead form B',
  'Secondary governed lead form',
  '84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'
);
insert into public.cms_form_versions(
  id,form_id,version,definition,consent_text,consent_version,privacy_path,
  sla_minutes,retention_days,status,reason,created_by,published_at
) values
(
  '84000000-0000-4000-8000-000000000111','84000000-0000-4000-8000-000000000101',1,
  '{"fields":[{"id":"84000000-0000-4000-8000-000000000901","key":"email","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'Consentimento do formulário A','lead-form-a-v1','/politica-de-privacidade',
  60,30,'retired','Superseded form A version',
  '84000000-0000-4000-8000-000000000001',now()-interval '1 day'
),(
  '84000000-0000-4000-8000-000000000112','84000000-0000-4000-8000-000000000101',2,
  '{"fields":[{"id":"84000000-0000-4000-8000-000000000902","key":"email","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'Consentimento do formulário A','lead-form-a-v2','/politica-de-privacidade',
  60,30,'published','Active form A version',
  '84000000-0000-4000-8000-000000000001',now()
),(
  '84000000-0000-4000-8000-000000000121','84000000-0000-4000-8000-000000000102',1,
  '{"fields":[{"id":"84000000-0000-4000-8000-000000000903","key":"email","label":"Email","type":"email","required":true,"options":[],"personalData":true,"order":0}],"successMessage":"Recebido","submitLabel":"Enviar"}',
  'Consentimento do formulário B','lead-form-b-v1','/politica-de-privacidade',
  60,30,'published','Active form B version',
  '84000000-0000-4000-8000-000000000001',now()
);
update public.cms_form_definitions
set status = 'published', active_version_id = case id
  when '84000000-0000-4000-8000-000000000101'::uuid then '84000000-0000-4000-8000-000000000112'::uuid
  else '84000000-0000-4000-8000-000000000121'::uuid
end
where id in (
  '84000000-0000-4000-8000-000000000101',
  '84000000-0000-4000-8000-000000000102'
);

insert into public.cms_content_items(
  id,content_type,slug,workflow_status,created_by,updated_by
) values
('84000000-0000-4000-8000-000000000201','campaign','binding-campaign-exact','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000202','campaign','binding-campaign-block','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000203','campaign','binding-campaign-form-b','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000204','campaign','binding-campaign-old-version','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000205','campaign','binding-campaign-stale-key','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000206','product','binding-product-exact','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000207','product','binding-product-unbound','published','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001');

insert into public.cms_content_revisions(
  id,item_id,revision_number,schema_version,payload,seo,provenance,
  source_draft_version,reason,created_by
) values
('84000000-0000-4000-8000-000000000301','84000000-0000-4000-8000-000000000201',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Exact campaign binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000302','84000000-0000-4000-8000-000000000202',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Block campaign binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000303','84000000-0000-4000-8000-000000000203',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Other form campaign binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000304','84000000-0000-4000-8000-000000000204',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Old version campaign binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000305','84000000-0000-4000-8000-000000000205',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Stale key campaign binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000306','84000000-0000-4000-8000-000000000206',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Exact product binding','84000000-0000-4000-8000-000000000001'),
('84000000-0000-4000-8000-000000000307','84000000-0000-4000-8000-000000000207',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,'Unbound product projection','84000000-0000-4000-8000-000000000001');

alter table public.cms_published_projection disable trigger user;
insert into public.cms_published_projection(
  item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,
  payload,seo,content_version,cache_tag,etag,published_at
) values
('84000000-0000-4000-8000-000000000201','84000000-0000-4000-8000-000000000301','campaign','binding-campaign-exact',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/campanhas/binding-campaign-exact"},"form":{"formId":"84000000-0000-4000-8000-000000000101","versionId":"84000000-0000-4000-8000-000000000112","key":"lead-form-a"},"blocks":[]}','{}',1,'cms:campaign:84000000-0000-4000-8000-000000000201','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',now()),
('84000000-0000-4000-8000-000000000202','84000000-0000-4000-8000-000000000302','campaign','binding-campaign-block',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/campanhas/binding-campaign-block"},"blocks":[{"type":"form","data":{"formId":"84000000-0000-4000-8000-000000000101","formVersionId":"84000000-0000-4000-8000-000000000112","formKey":"lead-form-a"}}]}','{}',1,'cms:campaign:84000000-0000-4000-8000-000000000202','"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',now()),
('84000000-0000-4000-8000-000000000203','84000000-0000-4000-8000-000000000303','campaign','binding-campaign-form-b',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/campanhas/binding-campaign-form-b"},"form":{"formId":"84000000-0000-4000-8000-000000000102","versionId":"84000000-0000-4000-8000-000000000121","key":"lead-form-b"},"blocks":[]}','{}',1,'cms:campaign:84000000-0000-4000-8000-000000000203','"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',now()),
('84000000-0000-4000-8000-000000000204','84000000-0000-4000-8000-000000000304','campaign','binding-campaign-old-version',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/campanhas/binding-campaign-old-version"},"form":{"formId":"84000000-0000-4000-8000-000000000101","versionId":"84000000-0000-4000-8000-000000000111","key":"lead-form-a"},"blocks":[]}','{}',1,'cms:campaign:84000000-0000-4000-8000-000000000204','"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"',now()),
('84000000-0000-4000-8000-000000000205','84000000-0000-4000-8000-000000000305','campaign','binding-campaign-stale-key',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/campanhas/binding-campaign-stale-key"},"form":{"formId":"84000000-0000-4000-8000-000000000101","versionId":"84000000-0000-4000-8000-000000000112","key":"lead-form-a-before-rename"},"blocks":[]}','{}',1,'cms:campaign:84000000-0000-4000-8000-000000000205','"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"',now()),
('84000000-0000-4000-8000-000000000206','84000000-0000-4000-8000-000000000306','product','binding-product-exact',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"route":{"path":"/adulterated-product-route"},"form":{"formId":"84000000-0000-4000-8000-000000000101","versionId":"84000000-0000-4000-8000-000000000112","key":"lead-form-a"}}','{}',1,'cms:product:84000000-0000-4000-8000-000000000206','"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"',now()),
('84000000-0000-4000-8000-000000000207','84000000-0000-4000-8000-000000000307','product','binding-product-unbound',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"commercial":{"shortDescription":"No governed form binding"}}','{}',1,'cms:product:84000000-0000-4000-8000-000000000207','"9999999999999999999999999999999999999999999999999999999999999999"',now());
alter table public.cms_published_projection enable trigger user;

insert into public.cms_publications(item_id,revision_id,cache_tag,published_by)
select item.id,revision.id,'cms:' || item.content_type || ':' || item.id::text,
  '84000000-0000-4000-8000-000000000001'
from public.cms_content_items item
join public.cms_content_revisions revision on revision.item_id=item.id
where item.id between '84000000-0000-4000-8000-000000000201'::uuid
  and '84000000-0000-4000-8000-000000000207'::uuid;

select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/contato","source":"site"}','staging'
),true,'a corporate lead without campaign or product context remains allowed');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/newsletter","source":"newsletter"}','staging'
),true,'the public newsletter source remains allowed without content context');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000201','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/binding-campaign-exact','campaign'
),true,'a top-level campaign binding must match the exact active form tuple');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000202','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/binding-campaign-block','campaign'
),true,'an embedded form block may prove the same exact form tuple');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000203','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/binding-campaign-form-b','campaign'
),false,'a campaign bound to a second form cannot authorize form A');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000204','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/binding-campaign-old-version','campaign'
),false,'a campaign bound to a superseded version cannot authorize the active version');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000205','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/binding-campaign-stale-key','campaign'
),true,'a renamed display key remains valid when the immutable form pair is exact');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000206','product',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/produtos/binding-product-exact','product'
),true,'a product context uses the canonical slug route and ignores an adulterated payload route');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000207','product',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/produtos/binding-product-unbound','product'
),false,'a published product without a form binding is rejected');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/campanhas/binding-campaign-exact","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000201"}',
  'staging'
),true,'the complete origin policy accepts a campaign bound to the exact form pair and route');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/produtos/binding-product-exact","source":"product","productId":"84000000-0000-4000-8000-000000000206"}',
  'staging'
),true,'the complete origin policy accepts a product bound to the exact form pair and canonical slug route');
select is(private.cms_projection_binds_exact_form(
  '84000000-0000-4000-8000-000000000299','campaign',
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '84000000-0000-4000-8000-000000000001','staging',
  '/campanhas/missing','campaign'
),false,'an absent campaign projection is rejected');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/campanhas/binding-campaign-exact","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000201","productId":"84000000-0000-4000-8000-000000000206"}',
  'staging'
),false,'campaign and product identifiers are rejected because provenance has exactly one context');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/campanhas/binding-campaign-exact","source":"site","campaignId":"84000000-0000-4000-8000-000000000201"}',
  'staging'
),false,'a campaign identifier with an adulterated source is rejected');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/campanhas/outra-rota","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000201"}',
  'staging'
),false,'a campaign identifier with an adulterated path is rejected');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/qa-cms-final/qa-cms-final-spoof","source":"qa_fixture"}','staging'
),false,'a corporate form cannot use the synthetic fixture bypass');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000112',
  '{"path":"/campanhas/binding-campaign-form-b","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000203"}',
  'staging'
),false,'the origin policy rejects a published campaign bound to a different form');
select is(private.cms_form_capture_origin_allowed(
  '84000000-0000-4000-8000-000000000101','84000000-0000-4000-8000-000000000111',
  '{"path":"/campanhas/binding-campaign-old-version","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000204"}',
  'staging'
),false,'the origin policy rejects a retired version even when the projection still names its UUID pair');
select throws_ok(
  $$select public.cms_capture_lead_scoped(
    'staging','84000000-0000-4000-8000-000000000102',
    '84000000-0000-4000-8000-000000000121','84000000-0000-4000-8000-000000000403',
    '{"email":"manipulated@example.test"}',
    '{"path":"/campanhas/binding-campaign-exact","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000201"}',
    '{"accepted":true,"text":"Consentimento do formulário B","version":"lead-form-b-v1"}',
    '{}','84000000-0000-4000-8000-000000000404'
  )$$,
  '42501','CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN',
  'manipulated legacy form UUIDs cannot capture against a campaign bound to form A'
);
select is((select count(*)::integer from public.cms_leads where idempotency_key=
  '84000000-0000-4000-8000-000000000403'),0,
  'a manipulated legacy form tuple leaves no lead residue');
select throws_ok(
  $$select public.cms_capture_lead_scoped(
    'staging','84000000-0000-4000-8000-000000000101',
    '84000000-0000-4000-8000-000000000112','84000000-0000-4000-8000-000000000401',
    '{"email":"lead@example.test"}',
    '{"path":"/campanhas/binding-campaign-form-b","source":"campaign","campaignId":"84000000-0000-4000-8000-000000000203"}',
    '{"accepted":true,"text":"Consentimento do formulário A","version":"lead-form-a-v2"}',
    '{}','84000000-0000-4000-8000-000000000402'
  )$$,
  '42501','CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN',
  'the authoritative capture RPC rejects the cross-form campaign before insert'
);
select is((select count(*)::integer from public.cms_leads where idempotency_key=
  '84000000-0000-4000-8000-000000000401'),0,
  'a rejected cross-form origin leaves no lead residue');

select * from finish();
rollback;
