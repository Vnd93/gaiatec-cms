begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

select has_function('public','cms_content_read_bundle_scoped',array['uuid','uuid','uuid','text'],
  'content has an authoritative scoped bundle reader');
select has_function('public','cms_search_admin_scoped',array['uuid','text','text','text[]','jsonb','jsonb','integer','integer'],
  'administrative search has an actor-scoped reader');
select has_function('public','cms_quality_list_runs_scoped',array['uuid','text','uuid','integer'],
  'quality runs have an actor-scoped reader');
select has_function('public','cms_search_governance_command_scoped',
  array['uuid','text','text','jsonb','text','text','timestamp with time zone','uuid'],
  'search governance mutations have an actor-scoped command boundary');
select isnt(has_function_privilege('authenticated',
  'public.cms_content_read_bundle_scoped(uuid,uuid,uuid,text)','EXECUTE'),true,
  'authenticated clients cannot bypass the Edge session boundary');
select is(has_function_privilege('service_role',
  'public.cms_content_read_bundle_scoped(uuid,uuid,uuid,text)','EXECUTE'),true,
  'the trusted Edge service role can use the scoped bundle');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('69000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','content-corporate@example.test','',now(),'{}',
 '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('69000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','content-qa-one@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('69000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','content-qa-two@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
('69000000-0000-4000-8000-000000000001','Content corporate','active'),
('69000000-0000-4000-8000-000000000002','Content QA one','active'),
('69000000-0000-4000-8000-000000000003','Content QA two','active');
insert into public.cms_user_roles(user_id,role_key) values
('69000000-0000-4000-8000-000000000001','super_admin'),
('69000000-0000-4000-8000-000000000002','super_admin'),
('69000000-0000-4000-8000-000000000003','super_admin');

insert into public.cms_content_items(
  id,content_type,slug,workflow_status,created_by,updated_by,created_at,updated_at
) values
('69000000-0000-4000-8000-000000000101','page','content-scope-corporate','draft',
 '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()),
('69000000-0000-4000-8000-000000000102','page','content-scope-qa-one','draft',
 '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp()),
('69000000-0000-4000-8000-000000000103','post','content-scope-qa-two','draft',
 '69000000-0000-4000-8000-000000000003','69000000-0000-4000-8000-000000000003',clock_timestamp(),clock_timestamp()),
('69000000-0000-4000-8000-000000000104','navigation','content-scope-navigation','draft',
 '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp());

insert into public.cms_content_drafts(item_id,payload,seo,provenance,updated_by,updated_at) values
('69000000-0000-4000-8000-000000000101','{}','{}','[{"rightsConfirmed":true}]','69000000-0000-4000-8000-000000000001',clock_timestamp()),
('69000000-0000-4000-8000-000000000102','{}','{}','[{"rightsConfirmed":true}]','69000000-0000-4000-8000-000000000002',clock_timestamp()),
('69000000-0000-4000-8000-000000000103','{}','{}','[{"rightsConfirmed":true}]','69000000-0000-4000-8000-000000000003',clock_timestamp()),
('69000000-0000-4000-8000-000000000104','{}','{}','[{"rightsConfirmed":true}]','69000000-0000-4000-8000-000000000001',clock_timestamp());

select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000101','staging'),true,
  'corporate can read a wholly corporate content graph');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000102','staging'),false,
  'corporate excludes every content graph created by an ever-QA actor');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000102','staging'),true,
  'QA can read content from its exact active run');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000101','staging'),false,
  'QA cannot read a corporate page by UUID');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000103','staging'),false,
  'QA cannot read a post from another QA run by UUID');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000102','production'),false,
  'a staging QA lease cannot be replayed in production');
select is(public.cms_content_read_bundle_scoped(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000101',null,'staging'),null,
  'scoped bundle makes a corporate UUID indistinguishable from missing to QA');
select is((select array_agg(id order by id)::text from public.cms_content_list_scoped(
  '69000000-0000-4000-8000-000000000001','staging',array['page'],array['draft'],100,0)),
  array['69000000-0000-4000-8000-000000000101'::uuid]::text,
  'corporate listing excludes QA content');
select is((select array_agg(id order by id)::text from public.cms_content_list_scoped(
  '69000000-0000-4000-8000-000000000002','staging',array['page'],array['draft'],100,0)),
  array['69000000-0000-4000-8000-000000000102'::uuid]::text,
  'QA listing contains only same-run content');
update public.cms_content_drafts set
  payload='{"relations":{"pageIds":["69000000-0000-4000-8000-000000000101"]}}',
  updated_by='69000000-0000-4000-8000-000000000002'
where item_id='69000000-0000-4000-8000-000000000102';
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000102','staging'),false,
  'a QA payload cannot adopt a corporate related-content UUID');
update public.cms_content_drafts set payload='{}',updated_by='69000000-0000-4000-8000-000000000002'
where item_id='69000000-0000-4000-8000-000000000102';

select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000104','staging'),true,
  'QA may access the corporate navigation singleton only through the journaled exception');
select set_config('cms.content_mutation_actor_id','69000000-0000-4000-8000-000000000002',true);
update public.cms_content_drafts set payload='{"qaProbe":true}',
  updated_by='69000000-0000-4000-8000-000000000002'
where item_id='69000000-0000-4000-8000-000000000104';
select is((select actor_id::text from private.cms_qa_global_mutation_journal
  where item_id='69000000-0000-4000-8000-000000000104' and status='active'),
  '69000000-0000-4000-8000-000000000002',
  'a QA singleton change is captured under its exact server-side lease');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000104','staging'),true,
  'the journal holder can continue the singleton flow');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000003','69000000-0000-4000-8000-000000000104','staging'),false,
  'another QA run cannot observe an in-flight singleton mutation');
select is(public.cms_content_item_read_allowed(
  '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000104','staging'),false,
  'corporate readers do not observe a singleton while its QA journal is open');

insert into public.cms_quality_runs(
  id,item_id,ruleset_version,trigger_kind,status,finding_counts,actor_id,correlation_id,checked_at
) values
('69000000-0000-4000-8000-000000000201','69000000-0000-4000-8000-000000000101','v1','manual','passed','{}',
 '69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000211',clock_timestamp()),
('69000000-0000-4000-8000-000000000202','69000000-0000-4000-8000-000000000102','v1','manual','passed','{}',
 '69000000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000212',clock_timestamp());
select is((select count(*)::integer from public.cms_quality_list_runs_scoped(
  '69000000-0000-4000-8000-000000000002','staging',null,30)),1,
  'quality listing contains only same-run content');
select is((select count(*)::integer from public.cms_quality_list_runs_scoped(
  '69000000-0000-4000-8000-000000000001','staging',null,30)),1,
  'corporate quality listing excludes ever-QA runs');
select is(public.cms_search_global_operation_allowed(
  '69000000-0000-4000-8000-000000000002','staging'),false,
  'QA can never start a global reindex that touches corporate content');
select is(public.cms_search_global_operation_allowed(
  '69000000-0000-4000-8000-000000000001','staging'),true,
  'a valid corporate actor may run global search maintenance');

select has_function('public','cms_execute_quality_command_scoped',
  array['uuid','text','uuid','text','uuid','text','jsonb','text','text','timestamp with time zone','uuid'],
  'quality receipt and mutation share one scoped transaction');
select has_function('public','cms_draft_v2_conflict_scoped',
  array['uuid','uuid','text','text','text','text','timestamp with time zone'],
  'draft conflict diagnostics have an actor-scoped reader');
select isnt(has_table_privilege('service_role','public.cms_quality_command_receipts','SELECT'),true,
  'service-role Edge code cannot bypass the scoped quality receipt RPC');
select lives_ok(
  $$select public.cms_execute_quality_command_scoped(
    '69000000-0000-4000-8000-000000000002','run',
    '69000000-0000-4000-8000-000000000102','staging',
    '69000000-0000-4000-8000-000000000220',repeat('e',64),
    '{"trigger":"manual","status":"passed","counts":{"errors":0},"findings":[]}',
    'aal2','content-quality-session',now(),
    '69000000-0000-4000-8000-000000000221'
  )$$,
  'same-run QA quality execution completes atomically with its receipt'
);
select is((select count(*)::integer from public.cms_quality_runs
  where correlation_id='69000000-0000-4000-8000-000000000221'),1,
  'quality execution persists exactly one run');
select is((public.cms_execute_quality_command_scoped(
    '69000000-0000-4000-8000-000000000002','run',
    '69000000-0000-4000-8000-000000000102','staging',
    '69000000-0000-4000-8000-000000000220',repeat('e',64),
    '{"trigger":"manual","status":"passed","counts":{"errors":0},"findings":[]}',
    'aal2','content-quality-session',now(),
    '69000000-0000-4000-8000-000000000221'
  )->>'runId'),
  (select id::text from public.cms_quality_runs
   where correlation_id='69000000-0000-4000-8000-000000000221'),
  'quality retries return the stored scoped response without duplicating work');
select is((select item_id::text from public.cms_quality_command_receipts
  where actor_id='69000000-0000-4000-8000-000000000002'
    and idempotency_key='69000000-0000-4000-8000-000000000220'),
  '69000000-0000-4000-8000-000000000102',
  'quality receipt is authoritatively bound to the scoped item');
select throws_ok(
  $$select public.cms_execute_quality_command_scoped(
    '69000000-0000-4000-8000-000000000002','run',
    '69000000-0000-4000-8000-000000000101','staging',
    '69000000-0000-4000-8000-000000000222',repeat('f',64),
    '{"trigger":"manual","status":"passed","counts":{},"findings":[]}',
    'aal2','content-quality-session',now(),
    '69000000-0000-4000-8000-000000000223'
  )$$,
  '42501','CMS_CONTENT_SCOPE_FORBIDDEN',
  'a QA quality receipt cannot bind or replay against corporate content'
);
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef(
    'public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamp with time zone)'::regprocedure
  )) > 0
  and position('cms-blog-taxonomy:' in pg_get_functiondef(
    'public.cms_sync_blog_taxonomy(uuid,jsonb,text,text,timestamp with time zone)'::regprocedure
  )) > 0,
  'blog taxonomy creation uses a canonical advisory fence before scoped upsert'
);

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','69000000-0000-4000-8000-000000000002','role','authenticated',
  'session_id','content-qa-one-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_content_items),
  array['69000000-0000-4000-8000-000000000102'::uuid,'69000000-0000-4000-8000-000000000104'::uuid]::text,
  'direct PostgREST QA reads expose only same-run content and its owned singleton journal');
reset role;

select * from finish();
rollback;
