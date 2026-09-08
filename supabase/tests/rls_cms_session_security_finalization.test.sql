begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(39);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('83000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','session-finalizer-super@example.test','',now(),'{}','{}',now(),now()),
('83000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','session-finalizer-admin@example.test','',now(),'{}','{}',now(),now()),
('83000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','session-finalizer-revoke@example.test','',now(),'{}','{}',now(),now()),
('83000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','session-finalizer-lifecycle@example.test','',now(),'{}','{}',now(),now());

insert into public.cms_profiles(user_id,display_name,display_email,status) values
('83000000-0000-4000-8000-000000000001','Session finalizer super','session-finalizer-super@example.test','active'),
('83000000-0000-4000-8000-000000000002','Session finalizer admin','session-finalizer-admin@example.test','active'),
('83000000-0000-4000-8000-000000000003','Session finalizer revoke target','session-finalizer-revoke@example.test','active'),
('83000000-0000-4000-8000-000000000004','Session finalizer lifecycle target','session-finalizer-lifecycle@example.test','active');

insert into public.cms_user_roles(user_id,role_key) values
('83000000-0000-4000-8000-000000000001','super_admin'),
('83000000-0000-4000-8000-000000000002','admin'),
('83000000-0000-4000-8000-000000000003','editor'),
('83000000-0000-4000-8000-000000000004','editor');

insert into public.rdo_user_access(user_id,role,active) values
('83000000-0000-4000-8000-000000000002','rdo_admin',true),
('83000000-0000-4000-8000-000000000003','rdo_member',true),
('83000000-0000-4000-8000-000000000004','rdo_member',true);

insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
('83000000-0000-4000-8000-000000000102','83000000-0000-4000-8000-000000000002',now(),now(),'aal1'),
('83000000-0000-4000-8000-000000000103','83000000-0000-4000-8000-000000000003',now(),now(),'aal1'),
('83000000-0000-4000-8000-000000000104','83000000-0000-4000-8000-000000000004',now(),now(),'aal1');

select is(
  (public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000002','login_success','local','aal1',
    '83000000-0000-4000-8000-000000000102',clock_timestamp(),gen_random_uuid()
  )->>'mfaRequired')::boolean,
  true,
  'an admin with a critical permission is directed to MFA while still at AAL1'
);
select is(
  (public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000002','login_success','local','aal1',
    '83000000-0000-4000-8000-000000000102',clock_timestamp(),gen_random_uuid()
  )->>'accessGranted')::boolean,
  false,
  'an admin with critical permissions cannot enter the CMS at AAL1'
);
select ok(
  (select reason_code='mfa_required' and not mfa_verified
   from public.cms_login_events
   where user_id='83000000-0000-4000-8000-000000000002'
     and event_type='login_success'
     and session_id_hash=encode(extensions.digest(
       '83000000-0000-4000-8000-000000000102','sha256'
     ),'hex')),
  'the AAL1 admin login records the server-derived MFA requirement'
);
select is(public.cms_actor_authorized(
  '83000000-0000-4000-8000-000000000002','cms:products.publish','aal1',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
),false,'a critical admin action is denied before MFA elevation');
select is(
  (public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000002','mfa_challenge','local','aal2',
    '83000000-0000-4000-8000-000000000102',clock_timestamp(),gen_random_uuid()
  )->>'accessGranted')::boolean,
  true,
  'the same admin session enters the CMS after AAL2 elevation'
);
select is(public.cms_actor_authorized(
  '83000000-0000-4000-8000-000000000002','cms:products.publish','aal2',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
),true,'the critical admin action is authorized after AAL2 elevation');

insert into public.cms_scoped_role_assignments(
  user_id,role_key,site_key,environment,grant_type,reason,valid_from,granted_by
) values(
  '83000000-0000-4000-8000-000000000002','admin','main','local','direct',
  'Scoped admin MFA regression',now()-interval '1 minute',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,starts_at,expires_at,created_by
) values(
  'ev2.rbac_scoped','local','user','83000000-0000-4000-8000-000000000002',true,
  'Scoped admin MFA regression',now()-interval '1 minute',now()+interval '1 hour',
  '83000000-0000-4000-8000-000000000001'
);

select is((public.cms_resolve_scoped_access(
  '83000000-0000-4000-8000-000000000002','local','main','aal1',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
)->>'mfaRequired')::boolean,true,
  'scoped admin access also derives MFA from its effective critical permissions');
select is((public.cms_resolve_scoped_access(
  '83000000-0000-4000-8000-000000000002','local','main','aal1',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
)->>'accessGranted')::boolean,false,
  'scoped admin access remains closed at AAL1');
select is(public.cms_actor_authorized(
  '83000000-0000-4000-8000-000000000002','cms:products.publish','aal1',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
),false,'the scoped critical permission is denied at AAL1');
select is((public.cms_resolve_scoped_access(
  '83000000-0000-4000-8000-000000000002','local','main','aal2',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
)->>'accessGranted')::boolean,true,
  'scoped admin access opens after AAL2 elevation');
select is(public.cms_actor_authorized(
  '83000000-0000-4000-8000-000000000002','cms:products.publish','aal2',
  '83000000-0000-4000-8000-000000000102',clock_timestamp()
),true,'the scoped critical permission is authorized at AAL2');

select is((select count(*)::integer from public.cms_login_events
  where user_id='83000000-0000-4000-8000-000000000003'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000103','sha256'
    ),'hex')),0,
  'the target Auth session has never been observed by the CMS before revocation');
select is(public.cms_apply_user_command_scoped(
  '83000000-0000-4000-8000-000000000001','revoke_sessions',
  '83000000-0000-4000-8000-000000000003',null,null,array[]::text[],
  'local','aal2','session-finalizer-super',clock_timestamp(),
  '83000000-0000-4000-8000-000000000201','83000000-0000-4000-8000-000000000301'
)->>'status','sessions_revoked',
  'the administrative session revocation completes');
select is((select count(*)::integer from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000003'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000103','sha256'
    ),'hex')
    and reason_code='admin_command'),1,
  'revoke_sessions captures an unobserved current session directly from auth.sessions');
select throws_ok(
  $$select public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000003','login_success','local','aal1',
    '83000000-0000-4000-8000-000000000103',clock_timestamp()+interval '1 second',gen_random_uuid()
  )$$,
  '42501','CMS_SESSION_REVOKED',
  'a refreshed JWT cannot replay the unobserved session after CMS revocation'
);
select is((select count(*)::integer from auth.sessions
  where id='83000000-0000-4000-8000-000000000103'),1,
  'CMS revocation preserves the underlying Auth session for the RDO boundary');
select ok((select banned_until is null or banned_until<=clock_timestamp()
  from auth.users where id='83000000-0000-4000-8000-000000000003'),
  'CMS revocation does not ban the shared Auth identity');
select ok((select active from public.rdo_user_access
  where user_id='83000000-0000-4000-8000-000000000003'),
  'CMS revocation preserves active RDO access');

insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(
  '83000000-0000-4000-8000-000000000105','83000000-0000-4000-8000-000000000003',now(),now(),'aal1'
);
select is((public.cms_resolve_session_scoped(
  '83000000-0000-4000-8000-000000000003','login_success','local','aal1',
  '83000000-0000-4000-8000-000000000105',clock_timestamp()+interval '1 second',gen_random_uuid()
)->>'accessGranted')::boolean,true,
  'a genuinely new Auth session may enter the CMS after revocation');
select is((public.cms_apply_user_command_scoped(
  '83000000-0000-4000-8000-000000000001','revoke_sessions',
  '83000000-0000-4000-8000-000000000003',null,null,array[]::text[],
  'local','aal2','session-finalizer-super',clock_timestamp(),
  '83000000-0000-4000-8000-000000000201','83000000-0000-4000-8000-000000000301'
)->>'duplicate')::boolean,true,
  'replaying the revocation command returns its durable idempotent receipt');
select is((select count(*)::integer from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000003'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000105','sha256'
    ),'hex')),0,
  'an idempotent replay does not broaden capture to a later Auth session');
select is((public.cms_resolve_session_scoped(
  '83000000-0000-4000-8000-000000000003','login_success','local','aal1',
  '83000000-0000-4000-8000-000000000105',clock_timestamp()+interval '2 seconds',gen_random_uuid()
)->>'accessGranted')::boolean,true,
  'the later Auth session remains eligible after the idempotent replay');

select is(public.cms_apply_user_command_scoped(
  '83000000-0000-4000-8000-000000000001','suspend',
  '83000000-0000-4000-8000-000000000004',null,null,array[]::text[],
  'local','aal2','session-finalizer-super',clock_timestamp(),
  '83000000-0000-4000-8000-000000000202','83000000-0000-4000-8000-000000000302'
)->>'status','suspended',
  'suspending a CMS identity completes');
select is((select count(*)::integer from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000004'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000104','sha256'
    ),'hex')),1,
  'suspend atomically captures every then-current Auth session');

insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(
  '83000000-0000-4000-8000-000000000106','83000000-0000-4000-8000-000000000004',now(),now(),'aal1'
);
select is(public.cms_apply_user_command_scoped(
  '83000000-0000-4000-8000-000000000001','reactivate',
  '83000000-0000-4000-8000-000000000004',null,null,array[]::text[],
  'local','aal2','session-finalizer-super',clock_timestamp(),
  '83000000-0000-4000-8000-000000000203','83000000-0000-4000-8000-000000000303'
)->>'status','active',
  'reactivating a CMS identity completes without a separate revocation command');
select is((select count(*)::integer from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000004'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000106','sha256'
    ),'hex')),1,
  'reactivate captures a session created while the CMS identity was suspended');
select throws_ok(
  $$select public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000004','login_success','local','aal1',
    '83000000-0000-4000-8000-000000000106',clock_timestamp()+interval '1 second',gen_random_uuid()
  )$$,
  '42501','CMS_SESSION_REVOKED',
  'the suspended-era refresh session cannot enter the CMS after reactivation'
);
select ok((select active from public.rdo_user_access
  where user_id='83000000-0000-4000-8000-000000000004'),
  'suspend and reactivate do not mutate RDO access');

insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(
  '83000000-0000-4000-8000-000000000107','83000000-0000-4000-8000-000000000004',now(),now(),'aal1'
);
select is((public.cms_apply_user_command_scoped(
  '83000000-0000-4000-8000-000000000001','reactivate',
  '83000000-0000-4000-8000-000000000004',null,null,array[]::text[],
  'local','aal2','session-finalizer-super',clock_timestamp(),
  '83000000-0000-4000-8000-000000000203','83000000-0000-4000-8000-000000000303'
)->>'duplicate')::boolean,true,
  'replaying reactivate returns the original receipt');
select is((select count(*)::integer from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000004'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000107','sha256'
    ),'hex')),0,
  'an idempotent reactivate replay does not revoke a post-reactivation session');
select is((public.cms_resolve_session_scoped(
  '83000000-0000-4000-8000-000000000004','login_success','local','aal1',
  '83000000-0000-4000-8000-000000000107',clock_timestamp()+interval '2 seconds',gen_random_uuid()
)->>'accessGranted')::boolean,true,
  'the post-reactivation session can enter the CMS');

select is(public.cms_resolve_session_scoped(
  '83000000-0000-4000-8000-000000000002','logout','local','aal1',
  '83000000-0000-4000-8000-000000000102',clock_timestamp(),gen_random_uuid()
)->>'userId','83000000-0000-4000-8000-000000000002',
  'CMS logout resolves while the browser session is still authenticated');
select ok(exists(select 1 from public.cms_session_revocations
  where user_id='83000000-0000-4000-8000-000000000002'
    and session_id_hash=encode(extensions.digest(
      '83000000-0000-4000-8000-000000000102','sha256'
    ),'hex')
    and revoked_by='83000000-0000-4000-8000-000000000002'
    and reason_code='self_logout'),
  'logout atomically revokes the current CMS session id');
select is((select count(*)::integer from auth.sessions
  where id='83000000-0000-4000-8000-000000000102'),1,
  'CMS logout does not depend on deleting the Auth session');
select throws_ok(
  $$select public.cms_resolve_session_scoped(
    '83000000-0000-4000-8000-000000000002','login_success','local','aal2',
    '83000000-0000-4000-8000-000000000102',clock_timestamp()+interval '1 second',gen_random_uuid()
  )$$,
  '42501','CMS_SESSION_REVOKED',
  'refresh replay after CMS logout remains forbidden even if Auth sign-out failed'
);
select ok((select active from public.rdo_user_access
  where user_id='83000000-0000-4000-8000-000000000002'),
  'CMS logout preserves the independent RDO grant');

select isnt(has_function_privilege('anon',
  'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)','EXECUTE'),true,
  'anonymous callers cannot forge session resolution or logout');
select isnt(has_function_privilege('authenticated',
  'public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)','EXECUTE'),true,
  'authenticated clients cannot bypass the trusted Edge session boundary');
select isnt(has_function_privilege('authenticated',
  'public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)','EXECUTE'),true,
  'authenticated clients cannot forge administrative revocation commands');

select * from finish();
rollback;
