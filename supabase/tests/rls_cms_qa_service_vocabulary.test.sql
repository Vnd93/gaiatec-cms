begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

select has_function('private','cms_qa_service_shared_list_allowed_0121',array['uuid','uuid','text']);
select has_function('private','cms_service_controlled_option_scope_allowed_0121',array['uuid','uuid','text','boolean']);
select has_trigger('private','cms_qa_actor_leases','cms_prepare_qa_actor_terminal_service_shared_vocab_cleanup');
select has_function('private','cms_qa_archived_service_reference_exact_0121',array['uuid','text','text','text','uuid','uuid','timestamp with time zone']);
select isnt(has_function_privilege('authenticated','private.cms_qa_archived_service_reference_exact_0121(uuid,text,text,text,uuid,uuid,timestamptz)','EXECUTE'),true,'clients cannot grant archived-reference exceptions');
select isnt(has_function_privilege('anon','private.cms_qa_service_shared_list_allowed_0121(uuid,uuid,text)','EXECUTE'),true,'anon cannot bypass service scope');
select isnt(has_function_privilege('authenticated','private.cms_service_controlled_option_scope_allowed_0121(uuid,uuid,text,boolean)','EXECUTE'),true,'clients cannot bypass service scope');
select isnt(has_function_privilege('service_role','private.cms_cleanup_terminal_service_shared_options_0121()','EXECUTE'),true,'compensation is trigger-only');
select is((select count(*)::integer from public.cms_controlled_options),0,'migration seeds no category');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('12100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-corporate@example.test','',now(),'{}','{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('12100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-qa-a@example.test','',now(),'{}','{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261013-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('12100000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-qa-b@example.test','',now(),'{}','{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261013-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());
insert into public.cms_profiles(user_id,display_name,display_email,status)
select id,'Synthetic service actor',email,'active' from auth.users where id::text like '12100000-%';
insert into public.cms_user_roles(user_id,role_key)
select id,'super_admin' from auth.users where id::text like '12100000-%';
insert into public.cms_controlled_lists(id,list_key,entity_type,dimension_key,label,created_by,updated_by)
values ('12100000-0000-4000-8000-000000000010','service.category','service','service_category','Synthetic corporate container','12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000001');
insert into public.cms_controlled_options(id,list_id,slug,label,created_by,updated_by)
values ('12100000-0000-4000-8000-000000000011','12100000-0000-4000-8000-000000000010','corporate-service','Corporate service','12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000001');
create temporary table service_list_before as select to_jsonb(list) as snapshot from public.cms_controlled_lists list where list_key='service.category';

create function pg_temp.service_option_0121(p_id uuid default '12100000-0000-4000-8000-000000000020') returns jsonb language sql as $$
select jsonb_build_object('id',p_id,'listId','12100000-0000-4000-8000-000000000010',
'slug','qa-cms-final-20261013-aaaaaaaa-121000000000-service-category',
'label','QA-CMS-FINAL-20261013-aaaaaaaa 121000000000 categoria-servico',
'publicVisible',false,'active',true,'sortOrder',9999);
$$;
create function pg_temp.service_write_0121(p_option jsonb,p_aal text default 'aal2',p_environment text default 'staging') returns jsonb language sql as $$
select public.cms_manage_controlled_vocabulary_scoped('12100000-0000-4000-8000-000000000002',p_environment,'upsert_option',null,p_option,p_aal,'qa-service-session',now()-interval '1 minute',gen_random_uuid());
$$;

select ok(private.cms_qa_service_shared_list_allowed_0121('12100000-0000-4000-8000-000000000002','12100000-0000-4000-8000-000000000010','staging'),'active exact lease can see immutable container');
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12100000-0000-4000-8000-000000000002','staging','service',false,500)),0,'QA cannot see corporate options');
select throws_ok($$select pg_temp.service_write_0121(pg_temp.service_option_0121(),'aal1')$$,'42501',null,'MFA is still mandatory');
select throws_ok($$select pg_temp.service_write_0121(pg_temp.service_option_0121(),'aal2','production')$$,'42501',null,'no production exception');
select throws_ok($$select pg_temp.service_write_0121(jsonb_set(pg_temp.service_option_0121(),'{publicVisible}','true'))$$,'23514',null,'QA term cannot become public');
select throws_ok($$select pg_temp.service_write_0121(jsonb_set(pg_temp.service_option_0121(),'{slug}','"foreign-marker"'))$$,'23514',null,'unknown marker is refused');
select lives_ok($$select pg_temp.service_write_0121(pg_temp.service_option_0121())$$,'own exact private term is created via audited writer');
select is((select count(*)::integer from public.cms_audit_log where actor_id='12100000-0000-4000-8000-000000000002' and action='cms:qa.service_controlled_option.upserted'),1,'creation has immutable audit');
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12100000-0000-4000-8000-000000000002','staging','service',false,500)),1,'QA sees exactly its own option');
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12100000-0000-4000-8000-000000000003','staging','service',false,500)),0,'another run cannot see the option');
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12100000-0000-4000-8000-000000000001','staging','service',false,500)),1,'corporate actor sees only corporate option');
select ok(private.cms_content_payload_controlled_scope_allowed('12100000-0000-4000-8000-000000000002',jsonb_build_object('contentType','service','serviceKindRef',jsonb_build_object('id','12100000-0000-4000-8000-000000000020')),'staging'),'own service reference is allowed');
select isnt(private.cms_content_payload_controlled_scope_allowed('12100000-0000-4000-8000-000000000003',jsonb_build_object('contentType','service','serviceKindRef',jsonb_build_object('id','12100000-0000-4000-8000-000000000020')),'staging'),true,'foreign reference remains forbidden');
select isnt(private.cms_content_payload_controlled_scope_allowed('12100000-0000-4000-8000-000000000002',jsonb_build_object('contentType','service','serviceKindRef',jsonb_build_object('id','12100000-0000-4000-8000-000000000011')),'staging'),true,'corporate reference remains forbidden to QA');
select throws_ok($$select pg_temp.service_write_0121(jsonb_set(pg_temp.service_option_0121(),'{lockVersion}','0'))$$,'PT409',null,'stale CAS is not retried');
select throws_ok($$select pg_temp.service_write_0121(pg_temp.service_option_0121('12100000-0000-4000-8000-000000000011'))$$,'42501',null,'QA cannot overwrite corporate option');
select ok((select to_jsonb(list)=snapshot from public.cms_controlled_lists list cross join service_list_before where list_key='service.category'),'container row is unchanged');

-- The browser archives a service while its immutable draft/revision retains the
-- category UUID. Only that exact lease-owned history can survive compensation.
insert into public.cms_content_items(id,content_type,slug,workflow_status,created_by,updated_by,created_at,updated_at)
select '12100000-0000-4000-8000-000000000030','service','qa-0121-service-history','draft',actor_id,actor_id,created_at+interval '1 second',created_at+interval '1 second'
from private.cms_qa_actor_leases where actor_id='12100000-0000-4000-8000-000000000002';
insert into public.cms_content_drafts(item_id,payload,provenance,updated_by,updated_at)
select '12100000-0000-4000-8000-000000000030',jsonb_build_object('serviceKindRef',jsonb_build_object('id','12100000-0000-4000-8000-000000000020')),'[{"rightsConfirmed":true}]'::jsonb,actor_id,created_at+interval '2 seconds'
from private.cms_qa_actor_leases where actor_id='12100000-0000-4000-8000-000000000002';
select isnt(private.cms_qa_archived_service_reference_exact_0121(actor_id,run_tag,candidate_sha,environment,'12100000-0000-4000-8000-000000000030',actor_id,created_at+interval '2 seconds'),true,'live service history never permits category removal') from private.cms_qa_actor_leases where actor_id='12100000-0000-4000-8000-000000000002';
update public.cms_content_items set workflow_status='archived',archived_at=clock_timestamp() where id='12100000-0000-4000-8000-000000000030';
select ok(private.cms_qa_archived_service_reference_exact_0121(actor_id,run_tag,candidate_sha,environment,'12100000-0000-4000-8000-000000000030',actor_id,created_at+interval '2 seconds'),'exact own archived history permits compensation') from private.cms_qa_actor_leases where actor_id='12100000-0000-4000-8000-000000000002';
select isnt(private.cms_qa_archived_service_reference_exact_0121(actor_id,run_tag,candidate_sha,environment,'12100000-0000-4000-8000-000000000030','12100000-0000-4000-8000-000000000003',created_at+interval '2 seconds'),true,'foreign archived reference remains forbidden') from private.cms_qa_actor_leases where actor_id='12100000-0000-4000-8000-000000000002';
update private.cms_qa_actor_leases set status='cleaned',cleaned_at=now() where actor_id='12100000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.cms_controlled_options where created_by='12100000-0000-4000-8000-000000000002'),0,'terminal compensation removes own term');
select is((select count(*)::integer from public.cms_controlled_options where id='12100000-0000-4000-8000-000000000011'),1,'corporate term is preserved');
select is((select count(*)::integer from public.cms_audit_log where actor_id='12100000-0000-4000-8000-000000000002' and action='cms:qa.service_controlled_options.compensated'),1,'cleanup is audited');
select isnt(private.cms_qa_service_shared_list_allowed_0121('12100000-0000-4000-8000-000000000002','12100000-0000-4000-8000-000000000010','staging'),true,'closed lease never reopens');
select ok((select to_jsonb(list)=snapshot from public.cms_controlled_lists list cross join service_list_before where list_key='service.category'),'cleanup leaves container unchanged');
select isnt(has_table_privilege('authenticated','public.cms_controlled_options','INSERT'),true,'no direct client writes were granted');
select * from finish();
rollback;
