begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,private,extensions;
select plan(39);

select has_table('private','cms_production_operator_provision_receipts',
  'production provisioning has a private immutable receipt');
select has_function('public','cms_provision_production_operator',
  array['text','text','text','integer','uuid','text','text','uuid','text'],
  'production operator provisioning has one SHA-bound RPC');
select has_function('private','cms_rbac_scope_context',array['uuid'],
  'the production RBAC selector is materialized after the historical rollout rewrite');
select is(has_function_privilege('service_role',
  'public.cms_provision_production_operator(text,text,text,integer,uuid,text,text,uuid,text)',
  'EXECUTE'),true,'service_role can execute the provisioning RPC');
select isnt(has_function_privilege('authenticated',
  'public.cms_provision_production_operator(text,text,text,integer,uuid,text,text,uuid,text)',
  'EXECUTE'),true,'authenticated users cannot execute the provisioning RPC');
select isnt(has_table_privilege('service_role',
  'private.cms_production_operator_provision_receipts','SELECT'),true,
  'service_role cannot enumerate private receipts directly');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok(
  $$select public.cms_provision_production_operator(
    repeat('a',64),repeat('b',40),'production',1440,gen_random_uuid(),repeat('c',64),
    repeat('d',64),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_SERVICE_ROLE_REQUIRED',
  'the RPC independently rejects a non-service JWT role');
select set_config('request.jwt.claim.role','service_role',true);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,banned_until,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('77000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','operator-0077@example.test','',now(),null,'{}','{}',now(),now()),
('77000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','no-totp-0077@example.test','',now(),null,'{}','{}',now(),now()),
('77000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','unconfirmed-0077@example.test','',null,null,'{}','{}',now(),now()),
('77000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','banned-0077@example.test','',now(),now()+interval '1 day','{}','{}',now(),now()),
('77000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','broad-0077@example.test','',now(),null,'{}','{}',now(),now());

insert into auth.mfa_factors(
  id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret
) values
('77000000-0000-4000-8000-000000000101','77000000-0000-4000-8000-000000000001',
 'Production operator 0077','totp','verified',now(),now(),'JBSWY3DPEHPK3PXP'),
('77000000-0000-4000-8000-000000000103','77000000-0000-4000-8000-000000000003',
 'Unconfirmed operator 0077','totp','verified',now(),now(),'JBSWY3DPEHPK3PXQ'),
('77000000-0000-4000-8000-000000000104','77000000-0000-4000-8000-000000000004',
 'Banned operator 0077','totp','verified',now(),now(),'JBSWY3DPEHPK3PXR'),
('77000000-0000-4000-8000-000000000105','77000000-0000-4000-8000-000000000005',
 'Broad operator 0077','totp','verified',now(),now(),'JBSWY3DPEHPK3PXS');

update public.cms_feature_flags
set default_enabled=false,kill_switch=false,expires_at=null
where flag_key=any(array[
  'ev2.release_skeleton','ev2.draft_v2','ev2.master_data','ev2.pim_v2',
  'ev2.dam','ev2.search_quality','ev2.collaboration_bulk','ev2.rbac_scoped',
  'ev2.visual_studio','ev2.ai_assist','ev2.system_assurance'
]);

insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,
  starts_at,expires_at,created_by
) values
('ev2.multisite','production','user','77000000-0000-4000-8000-000000000001',true,
 'Adversarial stale multisite override',now()-interval '1 minute',now()+interval '10 minutes',
 '77000000-0000-4000-8000-000000000001'),
('ev2.ai_execute','production','user','77000000-0000-4000-8000-000000000001',true,
 'Adversarial stale AI execute override',now()-interval '1 minute',now()+interval '10 minutes',
 '77000000-0000-4000-8000-000000000001');

select lives_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',525600,'77000000-0000-4000-8000-000000000201',
    repeat('b',64),encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),
    '77000000-0000-4000-8000-000000000301','770077'
  )$$,'a confirmed, unbanned and verified-TOTP identity is provisioned atomically');
select is((select status from public.cms_profiles
  where user_id='77000000-0000-4000-8000-000000000001'),'active',
  'the CMS profile is active');
select is((select display_email from public.cms_profiles
  where user_id='77000000-0000-4000-8000-000000000001'),null,
  'the profile does not persist the operator email');
select ok((select mfa_enrolled_at is not null from public.cms_profiles
  where user_id='77000000-0000-4000-8000-000000000001'),
  'the verified TOTP timestamp is recorded on the profile');
select is((select count(*)::integer from public.cms_user_roles
  where user_id='77000000-0000-4000-8000-000000000001' and role_key='super_admin'),1,
  'the legacy super_admin grant exists for safe rollout');
select is((select count(*)::integer from public.cms_scoped_role_assignments
  where user_id='77000000-0000-4000-8000-000000000001' and role_key='super_admin'
    and site_key='main' and environment='production' and revoked_at is null),1,
  'the effective production-scoped super_admin grant exists');
select is((select count(*)::integer from public.cms_feature_flag_overrides
  where environment='production' and scope_type='user'
    and scope_key='77000000-0000-4000-8000-000000000001' and enabled
    and flag_key=any(array[
      'ev2.release_skeleton','ev2.draft_v2','ev2.master_data','ev2.pim_v2',
      'ev2.dam','ev2.search_quality','ev2.collaboration_bulk','ev2.rbac_scoped',
      'ev2.visual_studio','ev2.ai_assist','ev2.system_assurance'
    ])),11,'only the ADR-022 individual capability set is enabled');
select is((select count(*)::integer from public.cms_feature_flag_overrides
  where environment='production' and scope_type='user'
    and scope_key='77000000-0000-4000-8000-000000000001' and enabled
    and flag_key in('ev2.multisite','ev2.ai_execute')),0,
  'multisite and AI execute remain disabled');
select ok((select bool_and(expires_at<=starts_at+interval '365 days')
    and bool_and(expires_at>starts_at+interval '364 days')
  from public.cms_feature_flag_overrides
  where environment='production' and scope_type='user'
    and scope_key='77000000-0000-4000-8000-000000000001' and enabled),
  'every enabled operator override remains operational for the governed 365-day term');
select is(private.cms_rbac_scope_context('77000000-0000-4000-8000-000000000001')->>'mode',
  'scoped','the explicit selector enables scoped RBAC in production');
select is((public.cms_rbac_scope_capability(
  '77000000-0000-4000-8000-000000000001','production','main','aal2',
  'operator-0077-session',now()
)->>'enabled')::boolean,true,'the effective production capability no longer falls back to legacy');
select is((select count(*)::integer
  from private.cms_production_operator_provision_receipts),1,
  'one immutable receipt is persisted');
select is((select workflow_run_id
  from private.cms_production_operator_provision_receipts),'770077',
  'the receipt binds the GitHub workflow run without storing operator PII');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:production_operator.provision'
    and target_id='77000000-0000-4000-8000-000000000001'),1,
  'one immutable audit event is persisted');
select ok((select event_data->>'containsPii'='false'
  and not (event_data ? 'email') and not (event_data ? 'emailSha256')
  from public.cms_audit_log
  where action='cms:production_operator.provision'
    and target_id='77000000-0000-4000-8000-000000000001'),
  'the audit event contains no email or email hash');
select is((select event_data->>'workflowRunId' from public.cms_audit_log
  where action='cms:production_operator.provision'
    and target_id='77000000-0000-4000-8000-000000000001'),'770077',
  'the immutable audit event binds the exact workflow run');
select is((public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',525600,'77000000-0000-4000-8000-000000000201',
    repeat('b',64),encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),
    '77000000-0000-4000-8000-000000000302','770077'
  )->>'replayed')::boolean,true,'the same idempotency key replays without mutation');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:production_operator.provision'
    and target_id='77000000-0000-4000-8000-000000000001'),1,
  'idempotent replay does not duplicate audit events');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',525600,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),
    gen_random_uuid(),'770078'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_AUTHORIZATION_REPLAY',
  'a reused authorization with a new idempotency key is refused');
select throws_ok(
  $$update private.cms_production_operator_provision_receipts
    set response='{}'::jsonb$$,'42501','CMS_PRODUCTION_OPERATOR_RECEIPT_IMMUTABLE',
  'provisioning receipts cannot be rewritten');

select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('no-totp-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_TOTP_REQUIRED',
  'an identity without a verified TOTP factor is refused');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('unconfirmed-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_IDENTITY_NOT_ELIGIBLE',
  'an unconfirmed identity is refused without identity disclosure');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('banned-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_IDENTITY_NOT_ELIGIBLE',
  'a currently banned identity is refused without identity disclosure');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('missing-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_IDENTITY_NOT_ELIGIBLE',
  'an unknown hash returns the same non-disclosing eligibility error');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),repeat('c',64),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_AUTHORIZATION_INVALID',
  'an authorization hash not bound to the exact candidate is refused');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',525601,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'22023','CMS_PRODUCTION_OPERATOR_INPUT_INVALID',
  'a production override beyond 365 days is refused');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('operator-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1439,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'22023','CMS_PRODUCTION_OPERATOR_INPUT_INVALID',
  'a production override shorter than one day is refused');

insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,
  starts_at,expires_at,created_by
) values('ev2.rbac_scoped','production','global','*',true,
  'Adversarial broad production activation',now()-interval '1 minute',now()+interval '10 minutes',
  '77000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.cms_provision_production_operator(
    encode(digest(convert_to('broad-0077@example.test','UTF8'),'sha256'),'hex'),
    repeat('a',40),'production',1440,gen_random_uuid(),repeat('b',64),
    encode(digest(convert_to('AUTORIZO-G12-PRODUCAO:'||repeat('a',40),'UTF8'),'sha256'),'hex'),gen_random_uuid(),'770077'
  )$$,'42501','CMS_PRODUCTION_OPERATOR_BROAD_OVERRIDE_FORBIDDEN',
  'a broad production override fails closed');
select is((select count(*)::integer from public.cms_profiles
  where user_id='77000000-0000-4000-8000-000000000005'),0,
  'a refused broad override leaves no partial profile mutation');

select throws_ok(
  $$delete from public.cms_user_roles
    where user_id='77000000-0000-4000-8000-000000000001' and role_key='super_admin'$$,
  '42501','CMS_LAST_CORPORATE_SUPER_ADMIN','the last legacy corporate superadmin is protected');
select throws_ok(
  $$delete from public.cms_scoped_role_assignments
    where user_id='77000000-0000-4000-8000-000000000001' and role_key='super_admin'
      and site_key='main' and environment='production'$$,
  '42501','CMS_LAST_CORPORATE_SCOPED_SUPER_ADMIN',
  'the last effective scoped production superadmin is protected');
select throws_ok(
  $$update public.cms_profiles set status='suspended',suspended_at=now()
    where user_id='77000000-0000-4000-8000-000000000001'$$,
  '42501','CMS_LAST_CORPORATE_SUPER_ADMIN',
  'the last corporate superadmin profile cannot be suspended');

select * from finish();
rollback;
