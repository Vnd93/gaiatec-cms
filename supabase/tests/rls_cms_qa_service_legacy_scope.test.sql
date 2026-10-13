begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);
-- Preserve the pre-0121 QA-owned-list case; production gets no shared-container exception.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('12200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-legacy-qa@example.test','',now(),'{}','{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261013-cccccccc","candidateSha":"cccccccccccccccccccccccccccccccccccccccc","environment":"production"}',now(),now());
insert into public.cms_profiles(user_id,display_name,display_email,status)
values ('12200000-0000-4000-8000-000000000001','Synthetic legacy service actor','service-legacy-qa@example.test','active');
insert into public.cms_user_roles(user_id,role_key)
values ('12200000-0000-4000-8000-000000000001','super_admin');
insert into public.cms_controlled_lists(id,list_key,entity_type,dimension_key,label,public_visible,created_by,updated_by)
values ('12200000-0000-4000-8000-000000000010','service.category','service','service_category','QA-CMS-FINAL-20261013-cccccccc owned list',false,'12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000001');
insert into public.cms_controlled_options(id,list_id,slug,label,public_visible,created_by,updated_by)
values ('12200000-0000-4000-8000-000000000020','12200000-0000-4000-8000-000000000010','legacy-owned-service','Owned synthetic service',false,'12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000001');
select isnt(private.cms_qa_service_shared_list_allowed_0121('12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000010','production'),true,'new shared-container case never applies to production');
select ok(private.cms_service_controlled_option_scope_allowed_0121('12200000-0000-4000-8000-000000000001','12200000-0000-4000-8000-000000000020','production',false),'legacy owned-list scope remains valid');
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12200000-0000-4000-8000-000000000001','production','service',false,500)),1,'legacy owned term is still listed');
select ok(private.cms_content_payload_controlled_scope_allowed('12200000-0000-4000-8000-000000000001',jsonb_build_object('contentType','service','serviceKindRef',jsonb_build_object('id','12200000-0000-4000-8000-000000000020')),'production'),'legacy owned reference remains valid');
update public.cms_controlled_lists set active=false where id='12200000-0000-4000-8000-000000000010';
select is((select jsonb_array_length(cms_controlled_options) from public.cms_controlled_vocabularies_scoped('12200000-0000-4000-8000-000000000001','production','service',true,500)),1,'legacy include-inactive still lists its owned terms');
select * from finish();
rollback;
