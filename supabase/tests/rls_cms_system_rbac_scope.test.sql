begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(47);

select has_function('public','cms_rbac_scope_capability',
  array['uuid','text','text','text','text','timestamp with time zone'],
  'RBAC capability resolves through the authoritative boundary');
select has_function('public','cms_resolve_scoped_access',
  array['uuid','text','text','text','text','timestamp with time zone'],
  'scoped access resolves only actor-visible assignments');
select has_function('public','cms_evaluate_scoped_permission',
  array['uuid','text','text','text','text','text','timestamp with time zone','text','text','uuid'],
  'policy decisions validate governed targets');
select has_function('public','cms_get_scoped_assignments',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'assignment listing has a scoped deployed entry point');
select has_function('public','cms_get_policy_decisions',
  array['uuid','text','text','text','text','timestamp with time zone','integer'],
  'policy listing has a scoped deployed entry point');
select has_function('public','cms_execute_scope_command',
  array['uuid','text','jsonb','text','text','text','text','timestamp with time zone','uuid','uuid','text','uuid'],
  'scope mutation has a scoped deployed entry point');
select has_function('public','cms_system_capability',
  array['uuid','text','text','text','text','timestamp with time zone'],
  'system capability validates the actor context');
select has_function('public','cms_get_system_snapshot',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'system snapshot is actor-scoped');
select has_function('public','cms_execute_system_command',
  array['uuid','text','jsonb','text','text','text','text','timestamp with time zone','uuid','uuid','uuid','text'],
  'system mutation is actor-scoped');

select isnt(has_function_privilege('service_role',
  'public.cms_get_scoped_assignments_unscoped_0076(uuid,text,text,text,text,timestamptz,uuid)','EXECUTE'),true,
  'global assignment reader is unreachable to service_role');
select isnt(has_function_privilege('service_role',
  'public.cms_get_policy_decisions_unscoped_0076(uuid,text,text,text,text,timestamptz,integer)','EXECUTE'),true,
  'global policy reader is unreachable to service_role');
select isnt(has_function_privilege('service_role',
  'public.cms_execute_scope_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)','EXECUTE'),true,
  'global scope mutator is unreachable to service_role');
select isnt(has_function_privilege('service_role',
  'public.cms_get_system_snapshot_unscoped_0076(uuid,text,text,text,text,timestamptz,uuid)','EXECUTE'),true,
  'global system snapshot is unreachable to service_role');
select isnt(has_function_privilege('service_role',
  'public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)','EXECUTE'),true,
  'global system mutator is unreachable to service_role');

select is(has_function_privilege('service_role',
  'public.cms_get_scoped_assignments(uuid,text,text,text,text,timestamptz,uuid)','EXECUTE'),true,
  'service_role can call the scoped assignment reader');
select is(has_function_privilege('service_role',
  'public.cms_execute_scope_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)','EXECUTE'),true,
  'service_role can call the scoped role command');
select is(has_function_privilege('service_role',
  'public.cms_get_system_snapshot_limited(uuid,text,text,text,text,timestamptz,uuid,text)','EXECUTE'),true,
  'Edge can call only the limited system snapshot');
select is(has_function_privilege('service_role',
  'public.cms_execute_system_command_limited(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text,text)','EXECUTE'),true,
  'Edge can call only the limited system command');

select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_scoped_role_assignments'
    and policyname='cms_scoped_role_assignments_authoritative_read'),1,
  'assignments have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_policy_decisions'
    and policyname='cms_policy_decisions_authoritative_read'),1,
  'policy decisions have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_scope_command_receipts'
    and policyname='cms_scope_receipts_authoritative_read'),1,
  'scope receipts have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_assurance_runs'
    and policyname='cms_assurance_runs_authoritative_read'),1,
  'assurance runs have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_assurance_events'
    and policyname='cms_assurance_events_authoritative_read'),1,
  'assurance events have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_system_command_receipts'
    and policyname='cms_system_receipts_authoritative_read'),1,
  'system receipts have authoritative defense-in-depth RLS');
select is((select count(*)::integer from pg_policies
  where schemaname='public' and tablename='cms_operational_events'
    and policyname='cms_operational_events_authoritative_read'),1,
  'operational events have authoritative defense-in-depth RLS');

select like(pg_get_functiondef(
  'public.cms_execute_scope_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure
),'%private.cms_system_assignment_scope_allowed%','last-super guard is filtered through the authoritative assignment scope');
select like(pg_get_functiondef(
  'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure
),'%private.cms_lead_scope_allowed%','system aggregate scopes lead rows');
select like(pg_get_functiondef(
  'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure
),'%private.cms_crb_task_scope_allowed%','system aggregate scopes collaboration rows');

select isnt(has_table_privilege(
  'authenticated','public.cms_policy_decisions','SELECT'
),true,'authenticated sessions cannot select the policy session hash column');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('76000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','system-corp@example.test','',now(),'{}','{}',now(),now()),
('76000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','system-qa-operator@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('76000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','system-qa-reviewer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('76000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','system-qa-other@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,display_email,status) values
('76000000-0000-4000-8000-000000000001','System corporate','system-corp@example.test','active'),
('76000000-0000-4000-8000-000000000002','System QA operator','system-qa-operator@example.test','active'),
('76000000-0000-4000-8000-000000000003','System QA reviewer','system-qa-reviewer@example.test','active'),
('76000000-0000-4000-8000-000000000004','System QA other run','system-qa-other@example.test','active');
insert into public.cms_user_roles(user_id,role_key,granted_at) values
('76000000-0000-4000-8000-000000000001','super_admin',statement_timestamp()),
('76000000-0000-4000-8000-000000000002','super_admin',statement_timestamp()),
('76000000-0000-4000-8000-000000000003','editor',statement_timestamp()),
('76000000-0000-4000-8000-000000000004','super_admin',statement_timestamp());

insert into public.cms_scoped_role_assignments(
  id,user_id,role_key,site_key,environment,grant_type,reason,valid_from,granted_by
) values
('76000000-0000-4000-8000-000000000101','76000000-0000-4000-8000-000000000001',
 'super_admin','main','staging','direct','Corporate system scope',now(),
 '76000000-0000-4000-8000-000000000001'),
('76000000-0000-4000-8000-000000000102','76000000-0000-4000-8000-000000000002',
 'super_admin','main','staging','direct','QA system operator scope',now(),
 '76000000-0000-4000-8000-000000000002'),
('76000000-0000-4000-8000-000000000103','76000000-0000-4000-8000-000000000003',
 'editor','main','staging','direct','QA system reviewer scope',now(),
 '76000000-0000-4000-8000-000000000002'),
('76000000-0000-4000-8000-000000000104','76000000-0000-4000-8000-000000000004',
 'super_admin','main','staging','direct','Other QA run system scope',now(),
 '76000000-0000-4000-8000-000000000004');

insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,
  starts_at,expires_at,created_by
) values
('ev2.rbac_scoped','staging','user','76000000-0000-4000-8000-000000000002',true,
 'QA system scope test',now(),now()+interval '30 minutes','76000000-0000-4000-8000-000000000002'),
('ev2.rbac_scoped','staging','user','76000000-0000-4000-8000-000000000003',true,
 'QA reviewer scope test',now(),now()+interval '30 minutes','76000000-0000-4000-8000-000000000003'),
('ev2.rbac_scoped','staging','user','76000000-0000-4000-8000-000000000004',true,
 'Other QA scope test',now(),now()+interval '30 minutes','76000000-0000-4000-8000-000000000004');

select is(private.cms_system_assignment_scope_allowed(
  '76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000103','staging'
),true,'QA operator can read a reviewer assignment from the exact active run');
select is(private.cms_system_assignment_scope_allowed(
  '76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000101','staging'
),false,'QA assignment UUID cannot resolve a corporate assignment');
select is(private.cms_system_assignment_scope_allowed(
  '76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000102','staging'
),false,'corporate assignment directories exclude every ever-QA actor');
select is(private.cms_system_assignment_scope_allowed(
  '76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000104','staging'
),false,'QA assignment UUID cannot cross the run and candidate boundary');

select is(jsonb_array_length(public.cms_get_scoped_assignments(
  '76000000-0000-4000-8000-000000000002','staging','main','aal2',
  'qa-system-session',clock_timestamp(),null
)->'items'),2,'QA assignment list contains only its exact operator/reviewer run');
select throws_ok($call$
  select public.cms_get_scoped_assignments(
    '76000000-0000-4000-8000-000000000002','staging','main','aal2',
    'qa-system-session',clock_timestamp(),'76000000-0000-4000-8000-000000000001'
  )
$call$,'42501','CMS_SCOPE_TARGET_FORBIDDEN',
  'QA cannot enumerate a corporate assignment target by UUID');
select is(jsonb_array_length(public.cms_get_scoped_assignments(
  '76000000-0000-4000-8000-000000000001','staging','main','aal2',
  'corp-system-session',clock_timestamp(),null
)->'items'),1,'corporate assignment list excludes all ever-QA assignments');

insert into public.cms_policy_decisions(
  id,actor_id,permission_key,site_key,environment,decision,reason_code,
  matched_role_key,scope_source,aal,session_id_hash,target_type,target_id,correlation_id
) values
('76000000-0000-4000-8000-000000000201','76000000-0000-4000-8000-000000000001',
 'cms:scopes.read','main','staging','allow','allowed','super_admin','legacy','aal2',repeat('1',64),
 'profile','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000211'),
('76000000-0000-4000-8000-000000000202','76000000-0000-4000-8000-000000000002',
 'cms:scopes.read','main','staging','allow','allowed','super_admin','direct','aal2',repeat('2',64),
 'profile','76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000212'),
('76000000-0000-4000-8000-000000000203','76000000-0000-4000-8000-000000000004',
 'cms:scopes.read','main','staging','allow','allowed','super_admin','direct','aal2',repeat('3',64),
 'profile','76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000213');

select is(jsonb_array_length(public.cms_get_policy_decisions(
  '76000000-0000-4000-8000-000000000002','staging','main','aal2',
  'qa-system-session',clock_timestamp(),50
)->'items'),1,'QA policy list contains only same-run actor and target decisions');
select is(jsonb_array_length(public.cms_get_policy_decisions(
  '76000000-0000-4000-8000-000000000001','staging','main','aal2',
  'corp-system-session',clock_timestamp(),50
)->'items'),3,'corporate policy auditors retain the complete immutable QA trail');

select throws_ok($call$
  select public.cms_execute_scope_command(
    '76000000-0000-4000-8000-000000000002','grant',
    '{"targetUserId":"76000000-0000-4000-8000-000000000001","roleKey":"reviewer","grantType":"direct","reason":"Cross-scope denied"}',
    'staging','main','aal2','qa-system-session',clock_timestamp(),
    gen_random_uuid(),gen_random_uuid(),repeat('a',64),gen_random_uuid()
  )
$call$,'42501','CMS_SCOPE_TARGET_FORBIDDEN',
  'QA scope commands cannot mutate a corporate target UUID');
select throws_ok($call$
  select public.cms_execute_scope_command(
    '76000000-0000-4000-8000-000000000001','grant',
    '{"targetUserId":"76000000-0000-4000-8000-000000000003","roleKey":"reviewer","grantType":"direct","reason":"Cross-scope denied"}',
    'staging','main','aal2','corp-system-session',clock_timestamp(),
    gen_random_uuid(),gen_random_uuid(),repeat('b',64),gen_random_uuid()
  )
$call$,'42501','CMS_SCOPE_TARGET_FORBIDDEN',
  'corporate scope commands cannot mutate an ever-QA target UUID');
select lives_ok($call$
  select public.cms_execute_scope_command(
    '76000000-0000-4000-8000-000000000002','grant',
    '{"targetUserId":"76000000-0000-4000-8000-000000000003","roleKey":"reviewer","grantType":"direct","reason":"Same-run governed review"}',
    'staging','main','aal2','qa-system-session',clock_timestamp(),
    '76000000-0000-4000-8000-000000000301','76000000-0000-4000-8000-000000000302',
    repeat('c',64),'76000000-0000-4000-8000-000000000303'
  )
$call$,'same-run QA role mutation succeeds through the fenced command');
select is((select count(*)::integer from public.cms_scoped_role_assignments
  where user_id='76000000-0000-4000-8000-000000000003'
    and role_key='reviewer' and granted_by='76000000-0000-4000-8000-000000000002'
    and revoked_at is null),1,'same-run command persists only the intended assignment');

insert into public.cms_assurance_runs(
  id,suite_key,environment,site_key,candidate_sha,status,measurement_passed,
  total_checks,passed_checks,p0_count,p1_count,accessibility_critical,
  accessibility_serious,security_status,restore_status,metrics,evidence_hash,
  synthetic_only,real_data_used,requested_by,correlation_id,started_at,finished_at,
  created_at,updated_at
) values(
  '76000000-0000-4000-8000-000000000401','g11-system-scope','staging','main',repeat('a',40),
  'measured',true,10,10,0,0,0,0,'passed','passed','{}',repeat('4',64),true,false,
  '76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000411',
  clock_timestamp()-interval '1 minute',clock_timestamp(),clock_timestamp(),clock_timestamp()
);
select is(private.cms_system_assurance_run_scope_allowed(
  '76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000401','staging'
),true,'same-run independent reviewer can read the operator assurance run');
select is(private.cms_system_assurance_run_scope_allowed(
  '76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000401','staging'
),false,'another QA run cannot read an assurance run by UUID');
select is(private.cms_system_assurance_run_scope_allowed(
  '76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000401','staging'
),false,'corporate operational assurance excludes synthetic QA runs');

insert into public.cms_audit_log(
  actor_id,action,target_type,target_id,event_data,correlation_id
) values
('76000000-0000-4000-8000-000000000001','cms:diagnostics.scope_test','scope_test','corp','{}',
 '76000000-0000-4000-8000-000000000501'),
('76000000-0000-4000-8000-000000000002','cms:diagnostics.scope_test','scope_test','qa','{}',
 '76000000-0000-4000-8000-000000000502'),
('76000000-0000-4000-8000-000000000004','cms:diagnostics.scope_test','scope_test','other','{}',
 '76000000-0000-4000-8000-000000000503');
insert into public.cms_operational_events(
  id,severity,event_type,correlation_id,error_code
) values
('76000000-0000-4000-8000-000000000511','warning','cms.system_scope_test.corp',
 '76000000-0000-4000-8000-000000000501','scope_test'),
('76000000-0000-4000-8000-000000000512','warning','cms.system_scope_test.qa',
 '76000000-0000-4000-8000-000000000502','scope_test'),
('76000000-0000-4000-8000-000000000513','warning','cms.system_scope_test.other',
 '76000000-0000-4000-8000-000000000503','scope_test');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','76000000-0000-4000-8000-000000000002','role','authenticated',
  'session_id','qa-system-direct','aal','aal2','iat',extract(epoch from clock_timestamp())::bigint
)::text,true);
select is((select count(*)::integer from public.cms_operational_events
  where event_type like 'cms.system_scope_test.%'),1,
  'direct QA diagnostics expose only operational events from the exact run');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','76000000-0000-4000-8000-000000000001','role','authenticated',
  'session_id','corp-system-direct','aal','aal2','iat',extract(epoch from clock_timestamp())::bigint
)::text,true);
select is((select count(*)::integer from public.cms_operational_events
  where event_type like 'cms.system_scope_test.%'),1,
  'corporate diagnostics exclude operational events from ever-QA actors');
reset role;

select * from finish();
rollback;
