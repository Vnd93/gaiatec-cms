begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Synthetic, transaction-scoped fixtures; nothing persists after rollback.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('11600000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','read-budget-local@example.test','',now(),'{}','{}',now(),now()),
('11600000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','read-budget-staging@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261006-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now());
insert into public.cms_profiles(user_id,display_name,display_email,status,mfa_enrolled_at) values
('11600000-0000-4000-8000-000000000001','Read budget local','read-budget-local@example.test','active',now()),
('11600000-0000-4000-8000-000000000002','Read budget staging','read-budget-staging@example.test','active',now());
insert into public.cms_user_roles(user_id,role_key) values
('11600000-0000-4000-8000-000000000001','super_admin'),
('11600000-0000-4000-8000-000000000002','super_admin');
insert into public.cms_feature_flag_overrides(flag_key,environment,scope_type,scope_key,enabled,reason,starts_at,expires_at,created_by) values
('ev2.system_assurance','local','user','11600000-0000-4000-8000-000000000001',true,'Synthetic read budget test',now(),now()+interval '29 minutes','11600000-0000-4000-8000-000000000001'),
('ev2.system_assurance','staging','user','11600000-0000-4000-8000-000000000002',true,'Synthetic read budget test',now(),now()+interval '29 minutes','11600000-0000-4000-8000-000000000002');

select is((public.cms_system_capability_unscoped_0076(null,environment,'main','aal2','test',now())
  #>> '{baselines,adminReadP95Ms}')::integer,expected,'exact read budget for ' || coalesce(environment,'null'))
from (values ('local',500),('staging',2000),('production',500),('production-preview',500),('STAGING',500),(' staging ',500),('unknown',500),(null,500)) policy(environment,expected);
select is((public.cms_system_capability_limited('11600000-0000-4000-8000-000000000002',
  'staging','main','aal2','read-budget-session',clock_timestamp(),repeat('f',64))
  #>> '{baselines,adminReadP95Ms}')::integer,2000,'the real scoped limited capability exposes the approved read budget');
select is((public.cms_system_capability_unscoped_0076(null,environment,'main','aal2','test',now())
  #>> '{baselines,commandP95Ms}')::integer,expected,'command budget remains unchanged for ' || coalesce(environment,'null'))
from (values ('local',800),('staging',2000),('production',800),('unknown',800),(null,800)) policy(environment,expected);

create function pg_temp.record_read_budget(p_environment text,p_latency numeric,p_command numeric default 800,p_override jsonb default '{}')
returns jsonb language sql as $$
  select public.cms_execute_system_command_limited(
    case when p_environment='staging' then '11600000-0000-4000-8000-000000000002'::uuid
         else '11600000-0000-4000-8000-000000000001'::uuid end,
    'record_run',jsonb_build_object(
      'suiteKey','g11-staging-read-budget','candidateSha',repeat('a',40),
      'startedAt',now()-interval '1 minute','finishedAt',now(),
      'totalChecks',10,'passedChecks',10,'p0Count',0,'p1Count',0,
      'accessibilityCritical',0,'accessibilitySerious',0,
      'securityStatus','passed','restoreStatus','passed',
      'metrics',jsonb_build_object('availabilityPercent',99.9,'adminReadP95Ms',p_latency,
        'commandP95Ms',p_command,'outboxLagP95Ms',60000,'auditCoveragePercent',100,
        'restoreRpoMinutes',0,'restoreRtoMinutes',15),
      'evidenceHash',repeat('b',64),'syntheticOnly',true,'realDataUsed',false
    ) || p_override,p_environment,'main','aal2','read-budget-session',clock_timestamp(),
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('c',64),repeat('d',64));
$$;
create temporary table read_budget_result as select pg_temp.record_read_budget('staging',2000,2000) as response;
select is((select response->>'status' from read_budget_result),'measured','two 2s ceilings yield measured, never accepted');
select is((select (response->>'requiresIndependentReview')::boolean from read_budget_result),true,'independent review remains mandatory');
select is(pg_temp.record_read_budget('staging',2001)->>'status','failed','read 2001ms is refused');
select is(pg_temp.record_read_budget('staging',2406)->>'status','failed','the previous canonical 2406ms outlier still fails');
select is(pg_temp.record_read_budget('staging',737)->>'status','measured','737ms requires a new bound measurement and review');
select is(pg_temp.record_read_budget('staging',500,2001)->>'status','failed','the command ceiling stays independent');
select is(pg_temp.record_read_budget('local',500)->>'status','measured','local keeps its 500ms boundary');
select is(pg_temp.record_read_budget('local',501)->>'status','failed','local cannot borrow the read approval');
select is(pg_temp.record_read_budget('staging',2000,2000,'{"securityStatus":"failed"}')->>'status','failed','security remains mandatory');
select is(pg_temp.record_read_budget('staging',2000,2000,'{"restoreStatus":"failed"}')->>'status','failed','restore remains mandatory');
select is(pg_temp.record_read_budget('staging',2000,2000,'{"p0Count":1}')->>'status','failed','P0 remains blocking');
select is(pg_temp.record_read_budget('staging',2000,2000,'{"p1Count":1}')->>'status','failed','P1 remains blocking');
select is(pg_temp.record_read_budget('staging',2000,2000,'{"accessibilityCritical":1}')->>'status','failed','critical accessibility remains blocking');
select is(pg_temp.record_read_budget('staging',2000,2000,jsonb_build_object('metrics',
  (select metrics from public.cms_assurance_runs where id=(select (response->>'runId')::uuid from read_budget_result))
  || '{"auditCoveragePercent":99}'::jsonb))->>'status','failed','audit coverage stays 100 percent');
select throws_ok($test$ select public.cms_execute_system_command(
  '11600000-0000-4000-8000-000000000002','review_run',jsonb_build_object(
    'runId',(select response->>'runId' from read_budget_result),'accept',true,'rationale','Self approval denied'),
  'staging','main','aal2','read-budget-session',clock_timestamp(),
  gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('e',64)) $test$,
  'PT409','CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED','the operator cannot approve their own measurement');
select throws_ok($test$ select pg_temp.record_read_budget('staging',2000,2000,
  jsonb_build_object('candidateSha',repeat('b',40))) $test$,
  '42501','CMS_SYSTEM_CANDIDATE_FORBIDDEN','new measurements remain bound to the leased SHA');
select is((select count(*)::integer from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) roles(name)
  where p.oid in (
    'public.cms_system_capability_unscoped_0076(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)'::regprocedure)
  and has_function_privilege(roles.name,p.oid,'EXECUTE')),0,'both cores stay owner-only');
select is((select default_enabled from public.cms_feature_flags where flag_key='ev2.catalog_v1'),false,'catalog stays default-off');
select * from finish();
rollback;
