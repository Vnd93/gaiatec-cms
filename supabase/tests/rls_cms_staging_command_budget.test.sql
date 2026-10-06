begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Every fixture is synthetic and transaction-scoped; no remote data is loaded.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('11500000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','budget-local@example.test','',now(),'{}','{}',now(),now()),
('11500000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','budget-staging@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261005-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now());
insert into public.cms_profiles(user_id,display_name,display_email,status,mfa_enrolled_at) values
('11500000-0000-4000-8000-000000000001','Budget local','budget-local@example.test','active',now()),
('11500000-0000-4000-8000-000000000002','Budget staging','budget-staging@example.test','active',now());
insert into public.cms_user_roles(user_id,role_key) values
('11500000-0000-4000-8000-000000000001','super_admin'),
('11500000-0000-4000-8000-000000000002','super_admin');
insert into public.cms_feature_flag_overrides(flag_key,environment,scope_type,scope_key,enabled,reason,starts_at,expires_at,created_by) values
('ev2.system_assurance','local','user','11500000-0000-4000-8000-000000000001',true,'Synthetic budget test',now(),now()+interval '29 minutes','11500000-0000-4000-8000-000000000001'),
('ev2.system_assurance','staging','user','11500000-0000-4000-8000-000000000002',true,'Synthetic budget test',now(),now()+interval '29 minutes','11500000-0000-4000-8000-000000000002');

select is((public.cms_system_capability_unscoped_0076(null,environment,'main','aal2','test',now())
  #>> '{baselines,commandP95Ms}')::integer,expected,'exact budget for ' || coalesce(environment,'null'))
from (values ('local',800),('staging',2000),('production',800),('unknown',800),(null,800)) policy(environment,expected);
select is((public.cms_system_capability_limited('11500000-0000-4000-8000-000000000002',
  'staging','main','aal2','budget-session',clock_timestamp(),repeat('f',64))
  #>> '{baselines,commandP95Ms}')::integer,2000,'the real scoped limited capability exposes 2s');

create function pg_temp.record_budget(p_environment text,p_latency numeric,p_override jsonb default '{}')
returns jsonb language sql as $$
  select public.cms_execute_system_command_limited(
    case when p_environment='staging' then '11500000-0000-4000-8000-000000000002'::uuid
         else '11500000-0000-4000-8000-000000000001'::uuid end,
    'record_run',jsonb_build_object(
      'suiteKey','g11-staging-budget','candidateSha',repeat('a',40),
      'startedAt',now()-interval '1 minute','finishedAt',now(),
      'totalChecks',10,'passedChecks',10,'p0Count',0,'p1Count',0,
      'accessibilityCritical',0,'accessibilitySerious',0,
      'securityStatus','passed','restoreStatus','passed',
      'metrics',jsonb_build_object('availabilityPercent',99.9,'adminReadP95Ms',500,
        'commandP95Ms',p_latency,'outboxLagP95Ms',60000,'auditCoveragePercent',100,
        'restoreRpoMinutes',0,'restoreRtoMinutes',15),
      'evidenceHash',repeat('b',64),'syntheticOnly',true,'realDataUsed',false
    ) || p_override,p_environment,'main','aal2','budget-session',clock_timestamp(),
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('c',64),repeat('d',64));
$$;
create temporary table budget_result as select pg_temp.record_budget('staging',2000) as response;
select is((select response->>'status' from budget_result),'measured','2s measurement does not bypass review');
select is((select (response->>'requiresIndependentReview')::boolean from budget_result),true,'independent review remains mandatory');
select is(pg_temp.record_budget('staging',2001)->>'status','failed','2001ms is refused');
select is(pg_temp.record_budget('staging',5241)->>'status','failed','the October 5 outlier still fails');
select is(pg_temp.record_budget('local',800)->>'status','measured','local keeps its legacy boundary');
select is(pg_temp.record_budget('local',801)->>'status','failed','local does not borrow the staging budget');
select is(pg_temp.record_budget('staging',2000,'{"securityStatus":"failed"}')->>'status','failed','security cannot borrow latency approval');
select is(pg_temp.record_budget('staging',2000,'{"restoreStatus":"failed"}')->>'status','failed','restore remains mandatory');
select is(pg_temp.record_budget('staging',2000,'{"p0Count":1}')->>'status','failed','P0 is still blocking');
select is(pg_temp.record_budget('staging',2000,jsonb_build_object('metrics',
  (select metrics from public.cms_assurance_runs where id=(select (response->>'runId')::uuid from budget_result))
  || '{"adminReadP95Ms":2001}'::jsonb))->>'status','failed','read p95 cannot exceed the approved 2s staging boundary');
select is(pg_temp.record_budget('staging',2000,jsonb_build_object('metrics',
  (select metrics from public.cms_assurance_runs where id=(select (response->>'runId')::uuid from budget_result))
  || '{"auditCoveragePercent":99}'::jsonb))->>'status','failed','audit coverage stays 100 percent');
select throws_ok($test$ select public.cms_execute_system_command(
  '11500000-0000-4000-8000-000000000002','review_run',jsonb_build_object(
    'runId',(select response->>'runId' from budget_result),'accept',true,'rationale','Self approval denied'),
  'staging','main','aal2','budget-session',clock_timestamp(),
  gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('e',64)) $test$,
  'PT409','CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED','the operator still cannot approve their measurement');
select throws_ok($test$ select pg_temp.record_budget('staging',2000,
  jsonb_build_object('candidateSha',repeat('b',40))) $test$,
  '42501','CMS_SYSTEM_CANDIDATE_FORBIDDEN','the evidence remains bound to the exact leased SHA');
select is((select count(*)::integer from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) roles(name)
  where p.oid in (
    'public.cms_system_capability_unscoped_0076(uuid,text,text,text,text,timestamptz)'::regprocedure,
    'public.cms_execute_system_command_unscoped_0076(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,uuid,text)'::regprocedure)
  and has_function_privilege(roles.name,p.oid,'EXECUTE')),0,'both legacy cores remain owner-only');
select is((select default_enabled from public.cms_feature_flags where flag_key='ev2.catalog_v1'),false,'catalog remains default-off');
select * from finish();
rollback;
