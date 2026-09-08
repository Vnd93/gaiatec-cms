begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(42);

select has_function('public','cms_get_release_workspace',
  array['uuid','uuid','text','text','text','text','timestamp with time zone'],
  'release workspace keeps its deployed actor-aware signature');
select has_function('public','cms_execute_release_v2_command',
  array['uuid','text','jsonb','text','text','text','text','timestamp with time zone','uuid','uuid','text','uuid'],
  'release commands keep their deployed actor-aware signature');
select has_function('public','cms_get_work_inbox',
  array['uuid','text','text','text','text','timestamp with time zone','uuid','text','boolean','integer'],
  'work inbox keeps its deployed actor-aware signature');
select has_function('public','cms_execute_collaboration_command',
  array['uuid','text','jsonb','text','text','text','text','timestamp with time zone','uuid','uuid','text','uuid'],
  'collaboration commands keep their deployed actor-aware signature');
select has_function('public','cms_get_bulk_jobs',
  array['uuid','text','text','text','text','timestamp with time zone','integer'],
  'bulk listing keeps its deployed actor-aware signature');
select has_function('public','cms_execute_bulk_command',
  array['uuid','text','jsonb','text','text','text','text','timestamp with time zone','uuid','uuid','text','uuid'],
  'bulk commands keep their deployed actor-aware signature');
select has_function('public','cms_publish_due_releases',array['integer','uuid'],
  'scheduled release worker is replaced by the fenced implementation');
select has_function('public','cms_claim_collaboration_outbox',array['integer','uuid'],
  'collaboration claim worker is replaced by the scoped implementation');
select has_function('public','cms_finish_collaboration_outbox',array['uuid','boolean','text'],
  'collaboration completion worker is replaced by the scoped implementation');
select is(has_function_privilege('service_role',
  'public.cms_execute_release_v2_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
  'EXECUTE'),true,'service role can call only the guarded release entry point');
select isnt(has_function_privilege('service_role',
  'public.cms_execute_release_v2_command_unscoped_0073(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
  'EXECUTE'),true,'service role cannot call the preserved unscoped release implementation');
select isnt(has_function_privilege('service_role','public.cms_release_plan_hash(uuid)','EXECUTE'),true,
  'release hash helper is not an IDOR-capable service RPC');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('73000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','crb-corporate@example.test','',now(),'{}',
 '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('73000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','crb-qa-operator@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('73000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','crb-qa-reviewer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('73000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','crb-qa-other-run@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now()),
('73000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','crb-qa-expired@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-cccccccc","candidateSha":"cccccccccccccccccccccccccccccccccccccccc","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
('73000000-0000-4000-8000-000000000001','CRB corporate','active'),
('73000000-0000-4000-8000-000000000002','CRB QA operator','active'),
('73000000-0000-4000-8000-000000000003','CRB QA reviewer','active'),
('73000000-0000-4000-8000-000000000004','CRB QA other run','active'),
('73000000-0000-4000-8000-000000000005','CRB QA expired','active');
insert into public.cms_user_roles(user_id,role_key) values
('73000000-0000-4000-8000-000000000001','super_admin'),
('73000000-0000-4000-8000-000000000002','super_admin'),
('73000000-0000-4000-8000-000000000003','super_admin'),
('73000000-0000-4000-8000-000000000004','super_admin'),
('73000000-0000-4000-8000-000000000005','super_admin');

insert into public.cms_content_items(
  id,content_type,slug,workflow_status,created_by,updated_by,created_at,updated_at
) values
('73000000-0000-4000-8000-000000000101','page','crb-corporate','approved',
 '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000102','page','crb-qa-same-run','approved',
 '73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000103','page','crb-qa-other-run','approved',
 '73000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000004',clock_timestamp(),clock_timestamp());
insert into public.cms_content_drafts(item_id,payload,seo,provenance,updated_by,updated_at) values
('73000000-0000-4000-8000-000000000101','{}','{}','[{"rightsConfirmed":true}]','73000000-0000-4000-8000-000000000001',clock_timestamp()),
('73000000-0000-4000-8000-000000000102','{}','{}','[{"rightsConfirmed":true}]','73000000-0000-4000-8000-000000000003',clock_timestamp()),
('73000000-0000-4000-8000-000000000103','{}','{}','[{"rightsConfirmed":true}]','73000000-0000-4000-8000-000000000004',clock_timestamp());
insert into public.cms_content_revisions(
  id,item_id,revision_number,schema_version,payload,seo,provenance,
  source_draft_version,reason,created_by,created_at
) values
('73000000-0000-4000-8000-000000000111','73000000-0000-4000-8000-000000000101',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,
 'Corporate revision','73000000-0000-4000-8000-000000000001',clock_timestamp()),
('73000000-0000-4000-8000-000000000112','73000000-0000-4000-8000-000000000102',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,
 'Same run revision','73000000-0000-4000-8000-000000000002',clock_timestamp()),
('73000000-0000-4000-8000-000000000113','73000000-0000-4000-8000-000000000103',1,1,'{}','{}','[{"rightsConfirmed":true}]',1,
 'Other run revision','73000000-0000-4000-8000-000000000004',clock_timestamp());

insert into public.cms_release_packages(
  id,site_key,environment,status,title,plan_hash,reason,lock_version,
  created_by,updated_by,correlation_id,created_at,updated_at
) values
('73000000-0000-4000-8000-000000000201','main','staging','draft','Corporate release',repeat('1',64),
 'Corporate release reason',1,'73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',
 '73000000-0000-4000-8000-000000000211',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000202','main','staging','draft','Same run release',repeat('2',64),
 'Synthetic same run release',1,'73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',
 '73000000-0000-4000-8000-000000000212',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000203','main','staging','draft','Other run release',repeat('3',64),
 'Synthetic other run release',1,'73000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000004',
 '73000000-0000-4000-8000-000000000213',clock_timestamp(),clock_timestamp());
insert into public.cms_release_items(
  id,release_id,item_id,revision_id,content_type,slug,position,
  frozen_hash,validation_status,added_by,added_at
) values
('73000000-0000-4000-8000-000000000221','73000000-0000-4000-8000-000000000202',
 '73000000-0000-4000-8000-000000000102','73000000-0000-4000-8000-000000000112',
 'page','crb-qa-same-run',1,repeat('a',64),'passed','73000000-0000-4000-8000-000000000002',clock_timestamp());
insert into public.cms_release_validation_runs(
  id,release_id,plan_hash,status,failure_count,warning_count,validated_by,correlation_id,validated_at
) values
('73000000-0000-4000-8000-000000000231','73000000-0000-4000-8000-000000000202',
 repeat('2',64),'passed',0,0,'73000000-0000-4000-8000-000000000003',
 '73000000-0000-4000-8000-000000000232',clock_timestamp());
insert into public.cms_release_approvals(
  id,release_id,validation_run_id,approver_id,decision,reason,plan_hash,
  expires_at,correlation_id,created_at
) values
('73000000-0000-4000-8000-000000000241','73000000-0000-4000-8000-000000000202',
 '73000000-0000-4000-8000-000000000231','73000000-0000-4000-8000-000000000003',
 'approved','Same run peer approval',repeat('2',64),clock_timestamp()+interval '1 hour',
 '73000000-0000-4000-8000-000000000242',clock_timestamp());
insert into public.cms_release_snapshots(
  release_id,release_item_id,item_id,previous_workflow_status,
  previous_projection,previous_publication,previous_route_rules,captured_at
) values
('73000000-0000-4000-8000-000000000202','73000000-0000-4000-8000-000000000221',
 '73000000-0000-4000-8000-000000000102','approved',null,null,'[]',clock_timestamp());

insert into public.cms_work_tasks(
  id,source_kind,source_id,title,description,status,priority,anchor,assigned_to,
  lock_version,created_by,updated_by,created_at,updated_at
) values
('73000000-0000-4000-8000-000000000301','manual',null,'Corporate task','Corporate task','open','normal',
 '{"route":"/admin/trabalho/corporate"}','73000000-0000-4000-8000-000000000001',1,
 '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000302','review','73000000-0000-4000-8000-000000000102',
 'Same run task','Same run task','open','high',
 '{"itemId":"73000000-0000-4000-8000-000000000102","revisionId":"73000000-0000-4000-8000-000000000112"}',
 '73000000-0000-4000-8000-000000000003',1,
 '73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000303','manual',null,'Other run task','Other run task','open','normal',
 '{"route":"/admin/trabalho/other"}','73000000-0000-4000-8000-000000000004',1,
 '73000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000004',clock_timestamp(),clock_timestamp());
insert into public.cms_work_comments(
  id,task_id,author_id,body,anchor,correlation_id,created_at
) values
('73000000-0000-4000-8000-000000000311','73000000-0000-4000-8000-000000000302',
 '73000000-0000-4000-8000-000000000003','Same run comment',
 '{"itemId":"73000000-0000-4000-8000-000000000102"}',
 '73000000-0000-4000-8000-000000000312',clock_timestamp());
insert into public.cms_work_mentions(comment_id,mentioned_user_id) values
('73000000-0000-4000-8000-000000000311','73000000-0000-4000-8000-000000000002');
insert into public.cms_collaboration_outbox(
  id,task_id,comment_id,recipient_id,event_type,status,correlation_id,created_at
) values
('73000000-0000-4000-8000-000000000321','73000000-0000-4000-8000-000000000302',
 '73000000-0000-4000-8000-000000000311','73000000-0000-4000-8000-000000000003',
 'mentioned','pending','73000000-0000-4000-8000-000000000322',clock_timestamp());

insert into public.cms_bulk_jobs(
  id,environment,operation,status,target_count,input_hash,reason,lock_version,
  requested_by,correlation_id,created_at,updated_at
) values
('73000000-0000-4000-8000-000000000401','staging','resolve_tasks','validated',1,repeat('4',64),
 'Corporate bulk job',1,'73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000411',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000402','staging','assign_tasks','validated',1,repeat('5',64),
 'Same run bulk job',1,'73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000412',clock_timestamp(),clock_timestamp()),
('73000000-0000-4000-8000-000000000403','staging','resolve_tasks','validated',1,repeat('6',64),
 'Other run bulk job',1,'73000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000413',clock_timestamp(),clock_timestamp());
insert into public.cms_bulk_job_items(
  id,job_id,position,target_type,target_id,expected_version,requested_change,
  validation_status,validation_errors
) values
('73000000-0000-4000-8000-000000000421','73000000-0000-4000-8000-000000000401',1,
 'work_task','73000000-0000-4000-8000-000000000301',1,'{}','valid','[]'),
('73000000-0000-4000-8000-000000000422','73000000-0000-4000-8000-000000000402',1,
 'work_task','73000000-0000-4000-8000-000000000302',1,
 '{"assignedTo":"73000000-0000-4000-8000-000000000003"}','valid','[]'),
('73000000-0000-4000-8000-000000000423','73000000-0000-4000-8000-000000000403',1,
 'work_task','73000000-0000-4000-8000-000000000303',1,'{}','valid','[]');

select is(private.cms_crb_actor_identity_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','staging'),true,
  'same-run reviewer can inspect the operator release graph');
select is(private.cms_crb_actor_identity_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000004','staging'),false,
  'same-run membership rejects a peer from another candidate');
select is(private.cms_crb_release_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000202','staging'),true,
  'same-run reviewer can read a release with operator content and immutable approval');
select is(private.cms_crb_release_scope_allowed(
  '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000202','staging'),false,
  'corporate scope excludes a release touched by any ever-QA actor');
select is(private.cms_crb_release_scope_allowed(
  '73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000201','staging'),false,
  'QA release UUID IDOR cannot read a corporate release');
select is(private.cms_crb_release_scope_allowed(
  '73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000203','staging'),false,
  'QA release UUID IDOR cannot read another run release');
select is(private.cms_crb_task_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000302','staging'),true,
  'same-run reviewer can read the operator task, anchor, comment and mention graph');
select is(private.cms_crb_bulk_job_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000402','staging'),true,
  'same-run reviewer can read the operator bulk graph');
select lives_ok($call$
  select private.cms_crb_guard_release_command(
    '73000000-0000-4000-8000-000000000003','approve',
    '{"releaseId":"73000000-0000-4000-8000-000000000202","expectedVersion":1}',
    'staging','main'
  )
$call$,'same-run segregated reviewer passes the release graph guard');
select throws_ok($call$
  select private.cms_crb_guard_release_command(
    '73000000-0000-4000-8000-000000000002','cancel',
    '{"releaseId":"73000000-0000-4000-8000-000000000201","expectedVersion":1}',
    'staging','main'
  )
$call$,'42501','CMS_CRB_SCOPE_FORBIDDEN',
  'release mutation rejects a corporate UUID supplied by QA');
select throws_ok($call$
  select private.cms_crb_guard_release_command(
    '73000000-0000-4000-8000-000000000002','add_item',
    '{"releaseId":"73000000-0000-4000-8000-000000000202","itemId":"73000000-0000-4000-8000-000000000101","revisionId":"73000000-0000-4000-8000-000000000111","dependencyIds":[]}',
    'staging','main'
  )
$call$,'42501','CMS_CRB_SCOPE_FORBIDDEN',
  'tampered add-item payload cannot adopt corporate content');
select throws_ok($call$
  select private.cms_crb_guard_collaboration_command(
    '73000000-0000-4000-8000-000000000002','assign_task',
    '{"taskId":"73000000-0000-4000-8000-000000000302","expectedVersion":1,"assignedTo":"73000000-0000-4000-8000-000000000004"}',
    'staging','main'
  )
$call$,'42501','CMS_CRB_SCOPE_FORBIDDEN','cross-run assignee is rejected');
select throws_ok($call$
  select private.cms_crb_guard_bulk_command(
    '73000000-0000-4000-8000-000000000002','dry_run',
    '{"operation":"resolve_tasks","targets":[{"id":"73000000-0000-4000-8000-000000000301","expectedVersion":1}],"changes":{}}',
    'staging','main'
  )
$call$,'42501','CMS_CRB_SCOPE_FORBIDDEN','bulk target UUID cannot select a corporate task');

update private.cms_qa_actor_leases
set created_at=statement_timestamp()-interval '3 hours',
    expires_at=statement_timestamp()-interval '2 hours'
where actor_id='73000000-0000-4000-8000-000000000005';
select is(private.cms_crb_actor_identity_scope_allowed(
  '73000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000005','staging'),false,
  'expired QA lease is fail-closed');
select throws_ok($call$
  select private.cms_crb_lock_actor_scope(
    '73000000-0000-4000-8000-000000000005',
    array['73000000-0000-4000-8000-000000000005'::uuid],'staging'
  )
$call$,'42501','CMS_QA_ACTOR_LEASE_EXPIRED',
  'expired lease cannot reach a mutation resource lock');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000003','role','authenticated',
  'session_id','crb-reviewer-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_release_packages),
  array['73000000-0000-4000-8000-000000000202'::uuid]::text,
  'direct QA release RLS exposes only its same-run graph');
select is((select array_agg(id order by id)::text from public.cms_work_tasks),
  array['73000000-0000-4000-8000-000000000302'::uuid]::text,
  'direct QA collaboration RLS exposes only its same-run graph');
select is((select array_agg(id order by id)::text from public.cms_bulk_jobs),
  array['73000000-0000-4000-8000-000000000402'::uuid]::text,
  'direct QA bulk RLS exposes only its same-run graph');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000001','role','authenticated',
  'session_id','crb-corporate-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_release_packages),
  array['73000000-0000-4000-8000-000000000201'::uuid]::text,
  'corporate direct reads exclude every ever-QA graph');
select is((select array_agg(id order by id)::text from public.cms_work_tasks),
  array['73000000-0000-4000-8000-000000000301'::uuid]::text,
  'corporate collaboration RLS excludes QA tasks and their children');
select cmp_ok((select count(*) from public.cms_audit_log
  where actor_id='73000000-0000-4000-8000-000000000002'),'>',0::bigint,
  'corporate auditors retain QA audit-log visibility');
reset role;

update private.cms_qa_actor_leases
set status='cleaned',cleaned_at=statement_timestamp()
where actor_id='73000000-0000-4000-8000-000000000002';
select is((select status from public.cms_release_packages
  where id='73000000-0000-4000-8000-000000000202'),'canceled',
  'terminal cleanup leaves no actionable QA release');
select is((select status from public.cms_work_tasks
  where id='73000000-0000-4000-8000-000000000302'),'resolved',
  'terminal cleanup resolves every actionable same-run task');
select is((select status from public.cms_bulk_jobs
  where id='73000000-0000-4000-8000-000000000402'),'canceled',
  'terminal cleanup cancels every actionable same-run bulk job');
select is((select status from public.cms_collaboration_outbox
  where id='73000000-0000-4000-8000-000000000321'),'dead_letter',
  'terminal cleanup dead-letters pending QA collaboration delivery');
select is((select count(*)::integer from public.cms_release_approvals
  where id='73000000-0000-4000-8000-000000000241'),1,
  'immutable approval evidence survives terminal cleanup');
select is((select count(*)::integer from public.cms_release_snapshots
  where release_id='73000000-0000-4000-8000-000000000202'),1,
  'immutable release snapshot survives terminal cleanup');
select cmp_ok((select count(*) from public.cms_release_events
  where release_id='73000000-0000-4000-8000-000000000202'),'>',0::bigint,
  'release events remain append-only after terminal cleanup');
select is(private.cms_crb_release_scope_allowed(
  '73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000202','staging'),false,
  'active peer cannot keep using a graph after one same-run lease terminates');
select is((select count(*)::integer from pg_catalog.pg_policies policy
  where policy.schemaname='public' and policy.tablename=any(array[
    'cms_feature_flags','cms_feature_flag_overrides','cms_release_packages',
    'cms_release_command_receipts','cms_release_events','cms_release_items',
    'cms_release_validation_runs','cms_release_validations','cms_release_approvals',
    'cms_release_snapshots','cms_work_tasks','cms_work_comments','cms_work_mentions',
    'cms_saved_inbox_views','cms_work_task_events','cms_collaboration_outbox',
    'cms_bulk_jobs','cms_bulk_job_items','cms_ev2_command_receipts'
  ]) and policy.policyname like '%scoped_read'),19,
  'all 0037 and 0045 direct tables have an authoritative scoped policy');

select * from finish();
rollback;
