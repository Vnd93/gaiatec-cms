begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(41);

select has_function('public','cms_get_visual_catalog',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'visual catalog keeps its deployed signature');
select has_function('public','cms_list_visual_branches',
  array['uuid','uuid','text','text','text','text','timestamp with time zone','uuid'],
  'visual branch listing keeps its deployed signature');
select has_function('public','cms_get_visual_document',
  array['uuid','uuid','text','text','text','text','timestamp with time zone','uuid'],
  'visual document read keeps its deployed signature');
select has_function('public','cms_execute_visual_command',array[
  'uuid','text','uuid','uuid','jsonb','bigint','bigint','text','text','text','text',
  'timestamp with time zone','uuid','uuid','text','uuid'
],'visual mutation keeps its deployed signature');
select has_function('public','cms_get_site_registry',
  array['uuid','text','text','text','text','timestamp with time zone','uuid'],
  'site registry keeps its deployed signature');
select has_function('public','cms_execute_site_command',array[
  'uuid','text','text','jsonb','bigint','text','text','text','text',
  'timestamp with time zone','uuid','uuid','text','uuid'
],'site mutation keeps its deployed signature');
select isnt(has_function_privilege('service_role',
  'public.cms_execute_visual_command_unscoped_0074(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
  'EXECUTE'),true,'service role cannot bypass the visual wrapper');
select isnt(has_function_privilege('service_role',
  'public.cms_execute_site_command_unscoped_0074(uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
  'EXECUTE'),true,'service role cannot bypass the site wrapper');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('74000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','visual-corporate@example.test','',now(),'{}',
 '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('74000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','visual-qa-owner@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-dddddddd","candidateSha":"dddddddddddddddddddddddddddddddddddddddd","environment":"staging"}',now(),now()),
('74000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','visual-qa-peer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-dddddddd","candidateSha":"dddddddddddddddddddddddddddddddddddddddd","environment":"staging"}',now(),now()),
('74000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','visual-qa-other@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-eeeeeeee","candidateSha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","environment":"staging"}',now(),now()),
('74000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','visual-qa-expired@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-ffffffff","candidateSha":"ffffffffffffffffffffffffffffffffffffffff","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
('74000000-0000-4000-8000-000000000001','Visual corporate','active'),
('74000000-0000-4000-8000-000000000002','Visual QA owner','active'),
('74000000-0000-4000-8000-000000000003','Visual QA peer','active'),
('74000000-0000-4000-8000-000000000004','Visual QA other','active'),
('74000000-0000-4000-8000-000000000005','Visual QA expired','active');
insert into public.cms_user_roles(user_id,role_key) values
('74000000-0000-4000-8000-000000000001','super_admin'),
('74000000-0000-4000-8000-000000000002','super_admin'),
('74000000-0000-4000-8000-000000000003','super_admin'),
('74000000-0000-4000-8000-000000000004','super_admin'),
('74000000-0000-4000-8000-000000000005','super_admin');

insert into public.cms_content_items(
  id,content_type,slug,workflow_status,created_by,updated_by,created_at,updated_at
) values
('74000000-0000-4000-8000-000000000101','page','visual-corporate','draft',
 '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()),
('74000000-0000-4000-8000-000000000102','page','visual-qa-same-run','draft',
 '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003',clock_timestamp(),clock_timestamp()),
('74000000-0000-4000-8000-000000000103','page','visual-qa-other-run','draft',
 '74000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000004',clock_timestamp(),clock_timestamp());
insert into public.cms_content_drafts(item_id,payload,seo,provenance,updated_by,updated_at)
values
('74000000-0000-4000-8000-000000000101','{"blocks":[]}','{}','[{"rightsConfirmed":true}]','74000000-0000-4000-8000-000000000001',clock_timestamp()),
('74000000-0000-4000-8000-000000000102','{"blocks":[]}','{}','[{"rightsConfirmed":true}]','74000000-0000-4000-8000-000000000003',clock_timestamp()),
('74000000-0000-4000-8000-000000000103','{"blocks":[]}','{}','[{"rightsConfirmed":true}]','74000000-0000-4000-8000-000000000004',clock_timestamp());

select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000002',true);
select throws_ok($call$
  insert into public.cms_sites(
    id,site_key,display_name,purpose,status,is_primary,is_synthetic,
    created_by,updated_by,qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment
  ) values (
    '74000000-0000-4000-8000-000000000201','g9x-forged-marker','Forged marker',
    'Synthetic forged candidate','pilot',false,true,
    '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000004','QA-CMS-FINAL-20260907-eeeeeeee',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','staging'
  )
$call$,'42501','CMS_SITES_QA_MARKER_SPOOFED','forged candidate marker is rejected');

insert into public.cms_sites(
  id,site_key,display_name,purpose,status,is_primary,is_synthetic,created_by,updated_by
) values (
  '74000000-0000-4000-8000-000000000202','g9x-qa-dddddddd','QA candidate',
  'Synthetic QA candidate','pilot',false,true,
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000002'
);
select is((select qa_actor_id from public.cms_sites where id='74000000-0000-4000-8000-000000000202'),
  '74000000-0000-4000-8000-000000000002'::uuid,
  'candidate owner is derived from the locked lease');
select is((select qa_run_tag from public.cms_sites where id='74000000-0000-4000-8000-000000000202'),
  'QA-CMS-FINAL-20260907-dddddddd','candidate run tag is derived server-side');
select is((select qa_candidate_sha from public.cms_sites where id='74000000-0000-4000-8000-000000000202'),
  'dddddddddddddddddddddddddddddddddddddddd','candidate SHA is derived server-side');

insert into public.cms_site_environments(
  id,site_id,environment,status,created_by
) values (
  '74000000-0000-4000-8000-000000000211','74000000-0000-4000-8000-000000000202',
  'staging','locked','74000000-0000-4000-8000-000000000002'
);
insert into public.cms_site_domains(
  id,site_id,environment,hostname,status,verified,created_by
) values (
  '74000000-0000-4000-8000-000000000212','74000000-0000-4000-8000-000000000202',
  'staging','qa-dddddddd.invalid','pending',false,'74000000-0000-4000-8000-000000000002'
);
insert into public.cms_themes(
  id,site_id,theme_key,name,status,created_by,updated_by
) values (
  '74000000-0000-4000-8000-000000000213','74000000-0000-4000-8000-000000000202',
  'qa-theme','QA theme','active','74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000002'
);
insert into public.cms_design_tokens(
  id,theme_id,version,tokens,tokens_hash,created_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000214','74000000-0000-4000-8000-000000000213',1,
  '[{"key":"color.qa","kind":"color","value":"#123456"}]',repeat('a',64),
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000215'
);
insert into public.cms_site_command_receipts(
  actor_id,action,idempotency_key,command_id,request_hash,site_id,correlation_id
) values (
  '74000000-0000-4000-8000-000000000002','update_tokens',
  '74000000-0000-4000-8000-000000000216','74000000-0000-4000-8000-000000000217',
  repeat('b',64),'74000000-0000-4000-8000-000000000202',
  '74000000-0000-4000-8000-000000000218'
);
insert into public.cms_site_command_receipts(
  actor_id,action,idempotency_key,command_id,request_hash,correlation_id
) values (
  '74000000-0000-4000-8000-000000000002','create_candidate',
  '74000000-0000-4000-8000-000000000219','74000000-0000-4000-8000-000000000220',
  repeat('2',64),'74000000-0000-4000-8000-000000000221'
);

select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000001',true);
insert into public.cms_sites(
  id,site_key,display_name,purpose,status,is_primary,is_synthetic,created_by,updated_by
) values (
  '74000000-0000-4000-8000-000000000203','g9x-corporate','Corporate candidate',
  'Corporate isolated candidate','pilot',false,true,
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001'
);

select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000002',true);
insert into public.cms_page_branches(
  id,site_id,environment,item_id,branch_key,status,base_draft_version,
  created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000301','49000000-0000-4000-8000-000000000001',
  'staging','74000000-0000-4000-8000-000000000102','qa-branch','draft',1,
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000311'
);
insert into public.cms_visual_documents(
  id,branch_id,site_id,environment,document,document_hash,created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000302','74000000-0000-4000-8000-000000000301',
  '49000000-0000-4000-8000-000000000001','staging',
  '{"schemaVersion":1,"registryVersion":1,"nodes":[],"bindings":[]}',repeat('c',64),
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000312'
);
select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000003',true);
update public.cms_page_branches set updated_by='74000000-0000-4000-8000-000000000003',
  lock_version=lock_version+1 where id='74000000-0000-4000-8000-000000000301';
insert into public.cms_visual_symbols(
  id,site_id,environment,symbol_key,name,component_key,component_version,props,
  source_branch_id,source_node_id,created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000303','49000000-0000-4000-8000-000000000001',
  'staging','qa-symbol','QA symbol','rich_text',1,'{}',
  '74000000-0000-4000-8000-000000000301','74000000-0000-4000-8000-000000000304',
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000313'
);
insert into public.cms_visual_events(
  id,branch_id,document_id,actor_id,event_type,to_version,event_data,correlation_id
) values (
  '74000000-0000-4000-8000-000000000305','74000000-0000-4000-8000-000000000301',
  '74000000-0000-4000-8000-000000000302','74000000-0000-4000-8000-000000000003',
  'document_saved',1,'{}','74000000-0000-4000-8000-000000000314'
);
select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000002',true);
insert into public.cms_visual_snapshots(
  id,snapshot_group_id,branch_id,document_id,site_id,environment,breakpoint,
  source_version,snapshot,snapshot_hash,created_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000306','74000000-0000-4000-8000-000000000307',
  '74000000-0000-4000-8000-000000000301','74000000-0000-4000-8000-000000000302',
  '49000000-0000-4000-8000-000000000001','staging','desktop',1,'{}',repeat('d',64),
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000315'
);
insert into public.cms_visual_command_receipts(
  actor_id,action,idempotency_key,command_id,request_hash,branch_id,correlation_id
) values (
  '74000000-0000-4000-8000-000000000002','save_document',
  '74000000-0000-4000-8000-000000000308','74000000-0000-4000-8000-000000000309',
  repeat('e',64),'74000000-0000-4000-8000-000000000301',
  '74000000-0000-4000-8000-000000000316'
);
insert into public.cms_visual_command_receipts(
  actor_id,action,idempotency_key,command_id,request_hash,correlation_id
) values (
  '74000000-0000-4000-8000-000000000002','create_branch',
  '74000000-0000-4000-8000-000000000317','74000000-0000-4000-8000-000000000318',
  repeat('3',64),'74000000-0000-4000-8000-000000000319'
);

select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000004',true);
insert into public.cms_page_branches(
  id,site_id,environment,item_id,branch_key,status,base_draft_version,
  created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000321','49000000-0000-4000-8000-000000000001',
  'staging','74000000-0000-4000-8000-000000000103','other-branch','draft',1,
  '74000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000322'
);
insert into public.cms_visual_documents(
  id,branch_id,site_id,environment,document,document_hash,created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000323','74000000-0000-4000-8000-000000000321',
  '49000000-0000-4000-8000-000000000001','staging',
  '{"schemaVersion":1,"registryVersion":1,"nodes":[],"bindings":[]}',repeat('f',64),
  '74000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000324'
);
insert into public.cms_visual_symbols(
  id,site_id,environment,symbol_key,name,component_key,component_version,props,
  source_branch_id,source_node_id,created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000325','49000000-0000-4000-8000-000000000001',
  'staging','other-symbol','Other symbol','rich_text',1,'{}',
  '74000000-0000-4000-8000-000000000321','74000000-0000-4000-8000-000000000326',
  '74000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000327'
);

select set_config('cms.qa_mutation_actor_id','74000000-0000-4000-8000-000000000001',true);
insert into public.cms_page_branches(
  id,site_id,environment,item_id,branch_key,status,base_draft_version,
  created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000331','49000000-0000-4000-8000-000000000001',
  'staging','74000000-0000-4000-8000-000000000101','corporate-branch','draft',1,
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000332'
);
insert into public.cms_visual_documents(
  id,branch_id,site_id,environment,document,document_hash,created_by,updated_by,correlation_id
) values (
  '74000000-0000-4000-8000-000000000333','74000000-0000-4000-8000-000000000331',
  '49000000-0000-4000-8000-000000000001','staging',
  '{"schemaVersion":1,"registryVersion":1,"nodes":[],"bindings":[]}',repeat('1',64),
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000334'
);

select is(private.cms_visual_branch_scope_allowed(
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000301','staging'),true,
  'same-run peer can read the complete visual branch graph');
select is(private.cms_visual_branch_scope_allowed(
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000321','staging'),false,
  'cross-run branch UUID is rejected');
select is(private.cms_visual_branch_scope_allowed(
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000331','staging'),false,
  'QA cannot adopt a corporate content item');
select is(private.cms_visual_branch_scope_allowed(
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000301','staging'),false,
  'corporate scope rejects an ever-QA visual branch');
select is(private.cms_visual_site_scope_allowed(
  '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000202','staging',false),true,
  'QA owner can read its server-marked candidate');
select is(private.cms_visual_site_scope_allowed(
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000202','staging',false),false,
  'candidate ownership is not broadened to a same-run peer');
select is(private.cms_visual_site_scope_allowed(
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000202','staging',false),false,
  'corporate site registry excludes a QA candidate');
select is(private.cms_visual_document_references_scope_allowed(
  '74000000-0000-4000-8000-000000000002',
  '{"nodes":[{"symbolId":"74000000-0000-4000-8000-000000000325"}],"bindings":[]}',
  'staging'),false,'tampered document cannot bind a cross-run symbol UUID');

update private.cms_qa_actor_leases
set created_at=statement_timestamp()-interval '3 hours',
    expires_at=statement_timestamp()-interval '2 hours'
where actor_id='74000000-0000-4000-8000-000000000005';
select is(private.cms_content_actor_context_active(
  '74000000-0000-4000-8000-000000000005','staging'),false,
  'expired visual actor lease is fail-closed');
select throws_ok($call$
  select private.cms_visual_lock_actor_scope(
    '74000000-0000-4000-8000-000000000005',
    array['74000000-0000-4000-8000-000000000005'::uuid],'staging'
  )
$call$,'42501','CMS_QA_ACTOR_LEASE_EXPIRED',
  'expired visual actor cannot acquire a resource lock');

grant select on public.cms_sites,public.cms_component_definitions,
  public.cms_page_branches,public.cms_visual_documents,public.cms_visual_symbols,
  public.cms_visual_snapshots to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','74000000-0000-4000-8000-000000000003','role','authenticated',
  'session_id','visual-peer-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_page_branches
  where id::text like '74000000-%'),
  array['74000000-0000-4000-8000-000000000301'::uuid]::text,
  'QA RLS exposes only the same-run visual branch');
select is((select count(*)::integer from public.cms_component_definitions),20,
  'canonical component catalog remains visible to active QA');
select is((select count(*)::integer from public.cms_sites
  where id in ('74000000-0000-4000-8000-000000000202','74000000-0000-4000-8000-000000000203')),0,
  'QA peer cannot enumerate either owner-only or corporate candidates');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','74000000-0000-4000-8000-000000000001','role','authenticated',
  'session_id','visual-corporate-session','aal','aal2','iat',extract(epoch from now())::bigint
)::text,true);
select is((select array_agg(id order by id)::text from public.cms_page_branches
  where id::text like '74000000-%'),
  array['74000000-0000-4000-8000-000000000331'::uuid]::text,
  'corporate RLS excludes every ever-QA visual graph');
select is((select array_agg(id order by id)::text from public.cms_sites
  where id in ('74000000-0000-4000-8000-000000000202','74000000-0000-4000-8000-000000000203')),
  array['74000000-0000-4000-8000-000000000203'::uuid]::text,
  'corporate RLS sees only its candidate and never the QA candidate');
reset role;

update private.cms_qa_actor_leases
set status='cleaned',cleaned_at=statement_timestamp()
where actor_id='74000000-0000-4000-8000-000000000002';
select is((select status from public.cms_page_branches
  where id='74000000-0000-4000-8000-000000000301'),'abandoned',
  'terminal cleanup abandons the QA visual branch');
select is((select status from public.cms_visual_symbols
  where id='74000000-0000-4000-8000-000000000303'),'archived',
  'terminal cleanup archives the QA visual symbol');
select is((select status from public.cms_sites
  where id='74000000-0000-4000-8000-000000000202'),'suspended',
  'terminal cleanup suspends the QA site candidate');
select is((select status from public.cms_site_domains
  where id='74000000-0000-4000-8000-000000000212'),'blocked',
  'terminal cleanup blocks the candidate domain');
select is((select status from public.cms_themes
  where id='74000000-0000-4000-8000-000000000213'),'archived',
  'terminal cleanup archives the candidate theme and leaves tokens inert');
select isnt((select response from public.cms_visual_command_receipts
  where idempotency_key='74000000-0000-4000-8000-000000000308'),null::jsonb,
  'terminal cleanup resolves the pending visual receipt');
select isnt((select response from public.cms_site_command_receipts
  where idempotency_key='74000000-0000-4000-8000-000000000216'),null::jsonb,
  'terminal cleanup resolves the pending site receipt');
select isnt((select response from public.cms_visual_command_receipts
  where idempotency_key='74000000-0000-4000-8000-000000000317'),null::jsonb,
  'terminal cleanup cancels an orphan visual reservation');
select isnt((select response from public.cms_site_command_receipts
  where idempotency_key='74000000-0000-4000-8000-000000000219'),null::jsonb,
  'terminal cleanup cancels an orphan site reservation');
select is((select count(*)::integer from public.cms_visual_snapshots
  where id='74000000-0000-4000-8000-000000000306'),1,
  'immutable snapshots survive as inert evidence');
select cmp_ok((select count(*) from public.cms_visual_events
  where branch_id='74000000-0000-4000-8000-000000000301'),'>',0::bigint,
  'sanitized immutable visual events survive cleanup');
select is(private.cms_visual_branch_scope_allowed(
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000301','staging'),false,
  'same-run peer cannot reopen a graph after its owner lease terminates');
select is((select count(*)::integer from pg_catalog.pg_policies policy
  where policy.schemaname='public' and policy.tablename=any(array[
    'cms_sites','cms_site_environments','cms_site_domains','cms_themes',
    'cms_design_tokens','cms_component_definitions','cms_component_versions',
    'cms_page_branches','cms_visual_documents','cms_visual_symbols',
    'cms_visual_snapshots','cms_visual_events','cms_visual_command_receipts',
    'cms_site_events','cms_site_command_receipts'
  ]) and policy.policyname like '%visual_scoped_read'),15,
  'all Visual Studio and multisite tables have scoped RLS');
select cmp_ok((select count(*) from public.cms_audit_log
  where actor_id='74000000-0000-4000-8000-000000000002'),'>',0::bigint,
  'terminal cleanup retains an immutable audit record');

select * from finish();
rollback;
