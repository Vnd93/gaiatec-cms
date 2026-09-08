begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(40);

select has_function('public','cms_user_target_read_allowed',array['uuid','uuid','text'],
  'identity scope has an authoritative server-side predicate');
select has_function('public','cms_users_list_scoped',
  array['uuid','text','text','text','timestamp with time zone'],
  'the CMS user directory has a scoped reader');
select has_function('public','cms_apply_user_command_scoped',
  array['uuid','text','uuid','text','text','text[]','text','text','text','timestamp with time zone','uuid','uuid'],
  'user mutations have a scoped command boundary');
select has_function('public','cms_resolve_session_scoped',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'CMS session resolution has a scoped boundary');
select isnt(has_function_privilege('service_role',
  'public.cms_apply_user_command_unscoped_0070(uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid)','EXECUTE'),true,
  'the globally-scoped implementation is unreachable to service_role');
select isnt(has_function_privilege('service_role',
  'public.cms_apply_user_command(uuid,text,uuid,text,text,text[],text,text,timestamptz,uuid,uuid)','EXECUTE'),true,
  'the owner-only compatibility function is unreachable to service_role');
select is(has_function_privilege('service_role',
  'public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)','EXECUTE'),true,
  'the trusted Edge service role can call only the scoped command');

insert into public.cms_roles(role_key,name,description,mfa_required,system_role)
values('scope_manager_test','Scope manager test','Transaction-local actor-scope test role.',true,false);
insert into public.cms_role_permissions(role_key,permission_key)
select 'scope_manager_test',permission_key
from public.cms_permissions
where permission_key in(
  'cms:users.read','cms:users.manage','cms:users.invite','cms:users.suspend',
  'cms:sessions.revoke','cms:audit.read'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('70000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','users-corp-manager@example.test','',now(),'{}','{}',now(),now()),
('70000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','users-corp-super@example.test','',now(),'{}','{}',now(),now()),
('70000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','users-qa-operator@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-cccccccc","candidateSha":"cccccccccccccccccccccccccccccccccccccccc","environment":"staging"}',now(),now()),
('70000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','users-qa-reviewer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-cccccccc","candidateSha":"cccccccccccccccccccccccccccccccccccccccc","environment":"staging"}',now(),now()),
('70000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','users-qa-other@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-dddddddd","candidateSha":"dddddddddddddddddddddddddddddddddddddddd","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,display_email,status) values
('70000000-0000-4000-8000-000000000001','Corporate manager','users-corp-manager@example.test','active'),
('70000000-0000-4000-8000-000000000002','Corporate super','users-corp-super@example.test','active'),
('70000000-0000-4000-8000-000000000003','QA operator','users-qa-operator@example.test','active'),
('70000000-0000-4000-8000-000000000004','QA reviewer','users-qa-reviewer@example.test','active'),
('70000000-0000-4000-8000-000000000005','QA other run','users-qa-other@example.test','active');
insert into public.cms_user_roles(user_id,role_key) values
('70000000-0000-4000-8000-000000000001','scope_manager_test'),
('70000000-0000-4000-8000-000000000002','super_admin'),
('70000000-0000-4000-8000-000000000003','scope_manager_test'),
('70000000-0000-4000-8000-000000000004','super_admin'),
('70000000-0000-4000-8000-000000000005','super_admin');

select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','staging'),true,
  'corporate operators can see corporate identities');
select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','staging'),false,
  'corporate business directories exclude every ever-QA identity');
select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004','staging'),true,
  'QA operator and reviewer from the exact active run can collaborate');
select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000005','staging'),false,
  'QA cannot see an identity from another run');
select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','staging'),false,
  'QA cannot see a corporate identity by UUID');
select is(public.cms_user_target_read_allowed(
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004','production'),false,
  'a staging QA lease cannot be replayed against production');

select is(jsonb_array_length(public.cms_users_list_scoped(
  '70000000-0000-4000-8000-000000000001','staging','aal2','corp-session',now()
)->'users'),2,'corporate list excludes ever-QA identities');
select is(jsonb_array_length(public.cms_users_list_scoped(
  '70000000-0000-4000-8000-000000000003','staging','aal2','qa-session',now()
)->'users'),2,'QA list includes only operator and reviewer from the exact run');

select throws_ok(
  $$select public.cms_resolve_session_scoped(
    '70000000-0000-4000-8000-000000000003','login_success','production','aal2',
    'qa-session',now(),gen_random_uuid()
  )$$,
  '42501','CMS_SESSION_SCOPE_FORBIDDEN',
  'a staging QA identity cannot resolve a production CMS session'
);

select throws_ok(
  $$select public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000001','set_roles',
    '70000000-0000-4000-8000-000000000004',null,null,array['reviewer'],
    'staging','aal2','corp-session',now(),gen_random_uuid(),gen_random_uuid()
  )$$,
  '42501','CMS_USER_TARGET_FORBIDDEN',
  'corporate user mutations cannot target an ever-QA UUID'
);
select throws_ok(
  $$select public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000003','set_roles',
    '70000000-0000-4000-8000-000000000002',null,null,array['editor'],
    'staging','aal2','qa-session',now(),gen_random_uuid(),gen_random_uuid()
  )$$,
  '42501','CMS_USER_TARGET_FORBIDDEN',
  'QA user mutations cannot target a corporate UUID'
);
select lives_ok(
  $$select public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000003','set_roles',
    '70000000-0000-4000-8000-000000000004',null,null,array['reviewer','super_admin'],
    'staging','aal2','qa-session',now(),
    '70000000-0000-4000-8000-000000000101','70000000-0000-4000-8000-000000000201'
  )$$,
  'QA can manage the reviewer identity from its exact active run'
);
select results_eq(
  $$select role_key from public.cms_user_roles
    where user_id='70000000-0000-4000-8000-000000000004' order by role_key$$,
  array['reviewer'::text,'super_admin'::text],
  'same-run role updates persist only on the intended QA identity'
);
select throws_ok(
  $$select public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000001','set_roles',
    '70000000-0000-4000-8000-000000000002',null,null,array['editor'],
    'staging','aal2','corp-session',now(),gen_random_uuid(),gen_random_uuid()
  )$$,
  '42501','CMS_LAST_SUPER_ADMIN',
  'QA super users from another run cannot satisfy the corporate last-super guard'
);
select throws_ok(
  $$select public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000003','set_roles',
    '70000000-0000-4000-8000-000000000004',null,null,array['reviewer'],
    'staging','aal2','qa-session',now(),gen_random_uuid(),gen_random_uuid()
  )$$,
  '42501','CMS_LAST_SUPER_ADMIN',
  'corporate and other-run supers cannot satisfy the QA last-super guard'
);

insert into public.cms_session_revocations(session_id_hash,user_id,reason_code,expires_at) values
(repeat('1',64),'70000000-0000-4000-8000-000000000001','scope_test',now()+interval '1 hour'),
(repeat('2',64),'70000000-0000-4000-8000-000000000002','scope_test',now()+interval '1 hour'),
(repeat('3',64),'70000000-0000-4000-8000-000000000003','scope_test',now()+interval '1 hour'),
(repeat('4',64),'70000000-0000-4000-8000-000000000004','scope_test',now()+interval '1 hour'),
(repeat('5',64),'70000000-0000-4000-8000-000000000005','scope_test',now()+interval '1 hour');
insert into public.cms_login_events(user_id,event_type,success,reason_code,correlation_id) values
('70000000-0000-4000-8000-000000000001','login_success',true,'scope_test',gen_random_uuid()),
('70000000-0000-4000-8000-000000000002','login_success',true,'scope_test',gen_random_uuid()),
('70000000-0000-4000-8000-000000000003','login_success',true,'scope_test',gen_random_uuid()),
('70000000-0000-4000-8000-000000000004','login_success',true,'scope_test',gen_random_uuid()),
('70000000-0000-4000-8000-000000000005','login_success',true,'scope_test',gen_random_uuid()),
(null,'login_failure',false,'scope_test',gen_random_uuid());
insert into public.cms_audit_log(actor_id,action,target_type,target_id,correlation_id) values
('70000000-0000-4000-8000-000000000001','cms:audit.scope_test','scope_test','corp-manager',gen_random_uuid()),
('70000000-0000-4000-8000-000000000002','cms:audit.scope_test','scope_test','corp-super',gen_random_uuid()),
('70000000-0000-4000-8000-000000000003','cms:audit.scope_test','scope_test','qa-operator',gen_random_uuid()),
('70000000-0000-4000-8000-000000000004','cms:audit.scope_test','scope_test','qa-reviewer',gen_random_uuid()),
('70000000-0000-4000-8000-000000000005','cms:audit.scope_test','scope_test','qa-other',gen_random_uuid()),
(null,'cms:audit.scope_test','scope_test','system',gen_random_uuid());

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','70000000-0000-4000-8000-000000000003','role','authenticated',
  'session_id','qa-direct-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select count(distinct user_id)::integer from public.cms_profiles),2,
  'direct QA profile reads contain only identities from the exact run');
select is((select count(distinct user_id)::integer from public.cms_user_roles),2,
  'direct QA role reads contain only identities from the exact run');
select is((select count(*)::integer from public.cms_session_revocations),2,
  'direct QA revocation reads contain only identities from the exact run');
select is((select count(*)::integer from public.cms_login_events where reason_code='scope_test'),2,
  'QA login-event readers see only actors from their exact active run');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:audit.scope_test'),2,
  'QA auditors see only actors from their exact active run');

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','70000000-0000-4000-8000-000000000001','role','authenticated',
  'session_id','corp-direct-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select count(distinct user_id)::integer from public.cms_profiles),2,
  'corporate profile directories exclude ever-QA identities');
select is((select count(distinct user_id)::integer from public.cms_user_roles),2,
  'corporate role directories exclude ever-QA identities');
select is((select count(*)::integer from public.cms_session_revocations),2,
  'corporate revocation directories exclude ever-QA identities');
select is((select count(*)::integer from public.cms_login_events where reason_code='scope_test'),6,
  'corporate auditors retain all login events including QA and system events');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:audit.scope_test'),6,
  'corporate auditors retain the complete QA audit trail');
reset role;

select is(
  (public.cms_resolve_session_scoped(
    '70000000-0000-4000-8000-000000000002','login_success','staging','aal2',
    'refresh-replay-session',clock_timestamp(),gen_random_uuid()
  )->>'accessGranted')::boolean,
  true,
  'the target CMS session is active before administrative revocation'
);
select is(
  public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000001','revoke_sessions',
    '70000000-0000-4000-8000-000000000002',null,null,array[]::text[],
    'staging','aal2','corp-session',clock_timestamp(),
    '70000000-0000-4000-8000-000000000102','70000000-0000-4000-8000-000000000202'
  )->>'status',
  'sessions_revoked',
  'the scoped administrative command revokes the target CMS sessions'
);
select is(
  (select count(*)::integer
   from public.cms_session_revocations revocation
   where revocation.user_id='70000000-0000-4000-8000-000000000002'
     and revocation.session_id_hash=encode(
       extensions.digest('refresh-replay-session','sha256'),'hex'
     )
     and revocation.revoked_by='70000000-0000-4000-8000-000000000001'
     and revocation.reason_code='admin_command'
     and revocation.expires_at>clock_timestamp()+interval '99 years'),
  1,
  'revocation atomically records every previously observed CMS session id'
);
select throws_ok(
  $$select public.cms_resolve_session_scoped(
    '70000000-0000-4000-8000-000000000002','mfa_challenge','staging','aal2',
    'refresh-replay-session',clock_timestamp()+interval '1 second',gen_random_uuid()
  )$$,
  '42501','CMS_SESSION_REVOKED',
  'a refreshed JWT cannot replay the same revoked CMS session id'
);
select is(
  (public.cms_resolve_session_scoped(
    '70000000-0000-4000-8000-000000000002','login_success','staging','aal2',
    'new-session-after-revocation',clock_timestamp()+interval '1 second',gen_random_uuid()
  )->>'accessGranted')::boolean,
  true,
  'a genuinely new Auth session can authenticate again after revocation'
);
select is(
  (public.cms_apply_user_command_scoped(
    '70000000-0000-4000-8000-000000000001','revoke_sessions',
    '70000000-0000-4000-8000-000000000002',null,null,array[]::text[],
    'staging','aal2','corp-session',clock_timestamp(),
    '70000000-0000-4000-8000-000000000102','70000000-0000-4000-8000-000000000202'
  )->>'duplicate')::boolean,
  true,
  'an idempotent replay returns the original revocation receipt'
);
select is(
  (public.cms_resolve_session_scoped(
    '70000000-0000-4000-8000-000000000002','mfa_challenge','staging','aal2',
    'new-session-after-revocation',clock_timestamp()+interval '2 seconds',gen_random_uuid()
  )->>'accessGranted')::boolean,
  true,
  'an idempotent replay does not revoke a genuinely new Auth session'
);
select ok(
  (select identity.banned_until is null or identity.banned_until<=clock_timestamp()
   from auth.users identity
   where identity.id='70000000-0000-4000-8000-000000000002'),
  'CMS-only revocation does not ban the shared Auth identity used by RDO'
);

select * from finish();
rollback;
