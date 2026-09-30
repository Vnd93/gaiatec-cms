-- Synthetic transaction only. No hosted load, flag activation or persistent publication.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('c0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'catalog-fixture-'||n||'@example.test','',now(),'{}','{}',now(),now() from generate_series(1,3) n;
insert into public.cms_profiles(user_id,display_name,display_email,status,sessions_valid_after)
select pg_temp.uid(n),'Synthetic catalog fixture','catalog-fixture-'||n||'@example.test','active',now()-interval '1 hour' from generate_series(1,3) n;
insert into public.cms_user_roles(user_id,role_key) values(pg_temp.uid(1),'super_admin'),(pg_temp.uid(2),'editor'),(pg_temp.uid(3),'super_admin');
create function pg_temp.actor(n integer,aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(n),'role','authenticated','aal',aal,
    'session_id','catalog-isolated-session','iat',extract(epoch from now())::bigint)::text,true)::void;
$$;
create function pg_temp.command(body jsonb) returns jsonb language sql as $$
  select public.cms_catalog_workspace_command('local',body,gen_random_uuid());
$$;
create function pg_temp.term(n integer,kind text default 'category') returns jsonb language sql as $$
  select jsonb_build_object('action','create_term','id',pg_temp.uid(n),'slug','term-'||n,'title','Term '||n,'termType',kind,'parentId',null);
$$;
create function pg_temp.product(n integer,kind text default 'product') returns jsonb language sql as $$
  select jsonb_build_object('action','create_product','id',pg_temp.uid(n),'slug','product-'||n,'title','Product '||n,
    'content',jsonb_build_object('summary','Summary','description','Description'),'entityKind',kind,
    'primaryTermId',pg_temp.uid(10),'complementaryTermIds',jsonb_build_array(pg_temp.uid(12)));
$$;
create function pg_temp.action(action text,n integer,version bigint) returns jsonb language sql as $$
  select jsonb_build_object('action',action,'id',pg_temp.uid(n),'expectedVersion',version,'reason','Isolated regression test');
$$;
create function pg_temp.current_product(n integer) returns jsonb language sql as $$
  select value from jsonb_array_elements(public.cms_catalog_workspace('local')->'products') where value->>'id'=pg_temp.uid(n)::text;
$$;
create function pg_temp.relation(n integer,source integer,target integer,kind text) returns jsonb language sql as $$
  select jsonb_build_object('action','save_relation','id',pg_temp.uid(n),'expectedVersion',0,'sourceProductId',pg_temp.uid(source),
    'targetProductId',pg_temp.uid(target),'relationKind',kind,'quantity',case when kind in ('contains','required_component','optional_component') then 1 else null end,
    'unitCode',case when kind in ('contains','required_component','optional_component') then 'un' else null end,'status','active','reason','Isolated regression test');
$$;
select pg_temp.actor(1);
set local role authenticated;
select is(public.cms_catalog_workspace('local')->>'enabled','false','default-off returns closed workspace');
select throws_ok($$select pg_temp.command(pg_temp.product(20))$$,'42501','CMS_CATALOG_FEATURE_DISABLED','default-off forbids command');
select is(public.cms_catalog_workspace('production')->>'enabled','false','production is outside this workspace authority');
reset role;
insert into public.cms_feature_flag_overrides(flag_key,environment,scope_type,scope_key,enabled,reason,expires_at,created_by)
values('ev2.catalog_v1','local','environment','local',true,'Isolated transactional test',now()+interval '10 minutes',pg_temp.uid(1));
set local role authenticated;
select is(public.cms_catalog_workspace('local')->>'enabled','true','explicit local override enables authenticated fixture');
select lives_ok($$select pg_temp.command(pg_temp.term(10))$$,'propose principal category');
select lives_ok($$select pg_temp.command(pg_temp.action('activate_term',10,1))$$,'admin activates category with CAS');
select lives_ok($$select pg_temp.command(pg_temp.term(11,'family')||jsonb_build_object('parentId',pg_temp.uid(10)))$$,'category/family share hierarchy');
select throws_ok($$select pg_temp.command(pg_temp.term(10)||jsonb_build_object('action','update_term','expectedVersion',2,'reason','Cycle test','parentId',pg_temp.uid(11)))$$,
  '23514','CMS_CATALOG_TAXONOMY_CYCLE','taxonomy cycle fails atomically');
select lives_ok($$select pg_temp.command(pg_temp.term(12,'technology'))$$,'propose complementary technology');
select lives_ok($$select pg_temp.command(pg_temp.action('activate_term',12,1))$$,'activate technology');
select pg_temp.actor(2);
select lives_ok($$select pg_temp.command(pg_temp.product(20))$$,'operator creates draft');
select throws_ok($$select pg_temp.command(pg_temp.action('activate_term',11,1))$$,'42501','CMS_CATALOG_ADMIN_REQUIRED','operator cannot administer taxonomy');
select throws_ok($$select pg_temp.command(pg_temp.action('publish_product',20,1))$$,'42501','CMS_CATALOG_ADMIN_REQUIRED','operator cannot publish');
select throws_ok($$insert into public.cms_catalog_products(slug,title,created_by,updated_by) values('bypass','Bypass',auth.uid(),auth.uid())$$,
  '42501',null,'direct table insertion cannot bypass command fence');
select lives_ok($$select pg_temp.command((pg_temp.product(20)-'action')||jsonb_build_object('action','update_product','expectedVersion',1,'title','Updated draft'))$$,'operator saves expected revision');
select throws_ok($$select pg_temp.command((pg_temp.product(20)-'action')||jsonb_build_object('action','update_product','expectedVersion',1,'title','Stale write'))$$,
  'PT409','CMS_CATALOG_REVISION_CONFLICT','stale revision is rejected');
select is(pg_temp.current_product(20)->>'title','Updated draft','stale write has no partial effect');
select is(jsonb_array_length(public.cms_catalog_product_history('local',pg_temp.uid(20))),2,'history has exactly successful revisions');
select throws_ok($$select pg_temp.command(pg_temp.product(21)||jsonb_build_object('content',jsonb_build_object('summary','x','description','y','price',1)))$$,
  '22023','CMS_CATALOG_CONTENT_INVALID','commerce payload rejected in database');
select lives_ok($$select pg_temp.command(pg_temp.action('submit_product',20,2))$$,'operator marks draft ready');
select pg_temp.actor(1,'aal1');
select throws_ok($$select pg_temp.command(pg_temp.action('publish_product',20,3))$$,'42501',null,'AAL1 cannot publish');
select pg_temp.actor(1);
select lives_ok($$select pg_temp.command(pg_temp.action('publish_product',20,3))$$,'admin publishes exact ready revision');
select is(pg_temp.current_product(20)->>'published_revision','4','snapshot bound to publication revision');
select lives_ok($$select pg_temp.command((pg_temp.product(20)-'action')||jsonb_build_object('action','update_product','expectedVersion',4,'title','New private draft'))$$,'published edit opens private draft');
select lives_ok($$select pg_temp.command(pg_temp.action('submit_product',20,5))$$,'a later draft can be marked ready again');
reset role;
select is((select title from public.cms_catalog_product_snapshots where product_id=pg_temp.uid(20) and is_current),'Updated draft','public snapshot unchanged by later draft');
select is((select publication_state from public.cms_catalog_product_revisions where product_id=pg_temp.uid(20) and revision=4),'published','publication state preserved in revision history');
select throws_ok($$update public.cms_catalog_product_snapshots set content='{}' where product_id=pg_temp.uid(20)$$,
  '55000','CMS_CATALOG_SNAPSHOT_IMMUTABLE','snapshot bytes cannot be rewritten');
set local role authenticated;
select lives_ok($$select pg_temp.command(pg_temp.action('publish_product',20,6))$$,'republish new ready revision');
select lives_ok($$select pg_temp.command((pg_temp.product(20)-'action')||jsonb_build_object('action','update_product','expectedVersion',7))$$,'create another private draft');
select lives_ok($$select pg_temp.command(pg_temp.action('unpublish_product',20,8))$$,'unpublish invalidates current snapshot while draft exists');
reset role;
select is((select count(*)::integer from public.cms_catalog_product_snapshots where product_id=pg_temp.uid(20) and is_current),0,'no current snapshot survives explicit withdrawal');
select throws_ok($$select public.cms_catalog_ack_publication(id,snapshot_id,revision) from public.cms_catalog_publication_outbox where product_id=pg_temp.uid(20) and revision=4$$,
  'PT409','CMS_CATALOG_OUTBOX_STALE','outbox cannot revive superseded snapshot');
select lives_ok($$select public.cms_catalog_ack_publication(id,snapshot_id,revision) from public.cms_catalog_publication_outbox where product_id=pg_temp.uid(20) and event_type='invalidated'$$,'invalidation receipt succeeds');
select lives_ok($$select public.cms_catalog_ack_publication(id,snapshot_id,revision) from public.cms_catalog_publication_outbox where product_id=pg_temp.uid(20) and event_type='invalidated'$$,'same outbox receipt is idempotent');
set local role authenticated;
select lives_ok($$select pg_temp.command(pg_temp.action('restore_product',20,9)||jsonb_build_object('sourceRevision',2))$$,'restoration creates fresh draft');
select is(pg_temp.current_product(20)->>'publication_state','draft','restoration never auto-publishes');
select is(pg_temp.current_product(20)->>'revision','10','restoration is append-only');
select lives_ok($$select pg_temp.command(pg_temp.product(21,'model'))$$,'create model');
select lives_ok($$select pg_temp.command(pg_temp.product(22,'variant'))$$,'create variant');
select lives_ok($$select pg_temp.command(pg_temp.product(23))$$,'create related product');
select lives_ok($$select pg_temp.command(jsonb_build_object('action','save_hierarchy','id',pg_temp.uid(50),'expectedVersion',0,
  'childProductId',pg_temp.uid(21),'parentProductId',pg_temp.uid(20),'hierarchyKind','model_product','status','active','reason','Fixture hierarchy'))$$,'model inherits product');
select lives_ok($$select pg_temp.command(jsonb_build_object('action','save_hierarchy','id',pg_temp.uid(51),'expectedVersion',0,
  'childProductId',pg_temp.uid(22),'parentProductId',pg_temp.uid(21),'hierarchyKind','variant_model','status','active','reason','Fixture hierarchy'))$$,'variant inherits model');
select lives_ok($$select pg_temp.command(pg_temp.relation(60,20,23,'accessory'))$$,'canonical symmetric relation');
select is((select value->>'relation_origin_level' from jsonb_array_elements(public.cms_catalog_workspace('local')->'effectiveRelations')
  where value->>'subject_product_id'=pg_temp.uid(22)::text and value->>'target_product_id'=pg_temp.uid(23)::text),'2','variant inherits product relation with provenance');
select ok(exists(select 1 from jsonb_array_elements(public.cms_catalog_workspace('local')->'effectiveRelations') where value->>'subject_product_id'=pg_temp.uid(23)::text
  and value->>'target_product_id'=pg_temp.uid(20)::text),'symmetric relation visible in reverse');
select lives_ok($$select pg_temp.command(pg_temp.relation(61,22,23,'local_exclusion'))$$,'local exclusion overrides inherited relation');
select is((select value->>'is_local_exclusion' from jsonb_array_elements(public.cms_catalog_workspace('local')->'effectiveRelations')
  where value->>'subject_product_id'=pg_temp.uid(22)::text and value->>'target_product_id'=pg_temp.uid(23)::text),'true','exclusion takes precedence');
select lives_ok($$select pg_temp.command(pg_temp.relation(62,20,23,'required_component'))$$,'required component relation');
select throws_ok($$select pg_temp.command(pg_temp.relation(63,23,20,'required_component'))$$,'23514','CMS_CATALOG_RELATION_CYCLE','directed cycle rejected');
select lives_ok($$select pg_temp.command(pg_temp.action('submit_product',20,10))$$,'prepare product with dependency');
select throws_ok($$select pg_temp.command(pg_temp.action('publish_product',20,11))$$,'23514','CMS_CATALOG_REQUIRED_RELATION_UNPUBLISHED','required component must have live snapshot');
select lives_ok($$select pg_temp.command(pg_temp.action('submit_product',23,1))$$,'prepare component');
select lives_ok($$select pg_temp.command(pg_temp.action('publish_product',23,2))$$,'publish component fixture');
select lives_ok($$select pg_temp.command(pg_temp.action('publish_product',20,11))$$,'dependency gate passes with exact published component');

select lives_ok($$select public.cms_catalog_editorial_command('local',jsonb_build_object('action','save','termId',pg_temp.uid(12),'expectedVersion',0,
  'title','Editorial fixture','summary','Editorial summary','blocks',jsonb_build_array(jsonb_build_object('heading','Technical heading','paragraphs',jsonb_build_array('Technical text'))),
  'reason','Isolated editorial draft'),gen_random_uuid())$$,'editorial is opt-in draft');
select lives_ok($$select public.cms_catalog_editorial_command('local',jsonb_build_object('action','publish','termId',pg_temp.uid(12),'expectedVersion',1,
  'indexRequested',true,'reason','Isolated editorial publication'),gen_random_uuid())$$,'admin publishes editorial fixture');
select throws_ok($$select pg_temp.command(pg_temp.action('deactivate_term',12,2)||jsonb_build_object('replacementId',null,'replacementVersion',null))$$,
  '23514',null,'cannot inactivate referenced editorial term without disposition/replacement');
reset role;
select is(public.cms_catalog_public_read('local',repeat('a',40),'technology','term-12')#>>'{payload,seo,indexable}','false','requesting indexing is not approval');
select is(jsonb_array_length(public.cms_catalog_public_read('local',repeat('a',40),'technology','term-12')#>'{payload,products}'),2,'editorial list uses only current snapshots');
select is(public.cms_catalog_public_sitemap('local',repeat('a',40)),'[]'::jsonb,'noindex page excluded from sitemap');
insert into public.cms_catalog_editorial_index_approvals(term_id,revision,environment,release_sha,evidence_id,evidence_digest,valid_until)
values(pg_temp.uid(12),2,'local',repeat('a',40),'CAT-UAT-SYNTHETIC-ISOLATED',repeat('b',64),now()+interval '10 minutes');
select is(public.cms_catalog_public_read('local',repeat('a',40),'technology','term-12')#>>'{payload,seo,indexable}','true','exact revision and SHA evidence allows indexing');
select is(public.cms_catalog_public_read('local',repeat('c',40),'technology','term-12')#>>'{payload,seo,indexable}','false','different SHA invalidates index approval');
select is(jsonb_array_length(public.cms_catalog_public_sitemap('local',repeat('a',40))),1,'sitemap contains only evidence-backed page');
select is(public.cms_catalog_reconcile_publication_outbox('production',20)->>'enabled','false','outbox reconciler never enters production');
select is(public.cms_catalog_reconcile_publication_outbox('local',20)->>'processed','2','worker acknowledges the two exact live snapshots');
select is((select count(*)::integer from public.cms_catalog_publication_outbox where status='superseded'),2,'old publication events terminate without reviving snapshots');
select is(public.cms_catalog_reconcile_publication_outbox('local',20)->>'processed','0','outbox replay is idempotent');
select ok(not has_function_privilege('authenticated','public.cms_catalog_reconcile_publication_outbox(text,integer)','EXECUTE'),'authenticated authors cannot acknowledge worker receipts');
select ok(public.cms_catalog_public_read('production',repeat('a',40),'product','product-20') is null,'production reader is closed');
select ok(not has_function_privilege('anon','public.cms_catalog_public_read(text,text,text,text)','EXECUTE'),'public service projection cannot be called by anonymous RPC');
set local role anon;
select is((select count(*)::integer from public.cms_catalog_product_snapshots),0,'anonymous clients cannot bypass live flag via tables');
reset role;
set local role authenticated;
select throws_ok($$insert into public.cms_catalog_editorial_index_approvals(term_id,revision,environment,release_sha,evidence_id,evidence_digest,valid_until)
values(pg_temp.uid(12),2,'local',repeat('c',40),'CAT-UAT-SELF-ATTEST',repeat('b',64),now()+interval '10 minutes')$$,
  '42501',null,'even admin cannot self-attest indexing evidence');
select throws_ok($$select pg_temp.command(pg_temp.action('unpublish_product',23,3))$$,'23514','CMS_CATALOG_PUBLISHED_DEPENDENCY_IN_USE','cannot withdraw an in-use required component');
select pg_temp.actor(3);
select lives_ok($$select pg_temp.command(pg_temp.product(30))$$,'isolated actor creates fixture before durable classification');
select lives_ok($$select pg_temp.command(pg_temp.action('submit_product',30,1))$$,'prepare isolated fixture');
select lives_ok($$select pg_temp.command(pg_temp.action('publish_product',30,2))$$,'publish isolated transactional fixture');
reset role;
insert into private.cms_qa_actor_leases(actor_id,run_tag,candidate_sha,environment,status,expires_at,cleaned_at)
values(pg_temp.uid(3),'QA-CMS-FINAL-20260929-aaaaaaaa',repeat('a',40),'staging','cleaned',statement_timestamp()+interval '10 minutes',statement_timestamp());
select ok(public.cms_catalog_public_read('local',repeat('a',40),'product','product-30') is null,'durable QA classification excludes snapshot even after lease cleanup');
set local role authenticated;
select is(public.cms_catalog_workspace('local')->>'enabled','false','expired/cleaned QA actor cannot fall back to corporate');
select pg_temp.actor(1);
select ok(pg_temp.current_product(30) is null,'corporate workspace excludes QA actor data');
reset role;
update public.cms_profiles set sessions_valid_after=now()+interval '1 minute' where user_id=pg_temp.uid(1);
set local role authenticated;
select is(public.cms_catalog_workspace('local')->>'enabled','false','revoked session loses capability immediately');
reset role;
update public.cms_profiles set sessions_valid_after=now()-interval '1 hour' where user_id=pg_temp.uid(1);
update public.cms_feature_flags set kill_switch=true where flag_key='ev2.catalog_v1';
select is(public.cms_catalog_public_capability('local')->>'source','kill_switch','kill switch is authoritative');
select is(public.cms_catalog_reconcile_publication_outbox('local',20)->>'enabled','false','kill switch also stops catalog worker');
select ok(public.cms_catalog_public_read('local',repeat('a',40),'product','product-20') is null,'rollback immediately closes snapshot reader');
set local role authenticated;
select is(public.cms_catalog_workspace('local')->>'enabled','false','kill switch closes administrative capability');
reset role;
select ok((select count(*)>0 from public.cms_catalog_audit_events where action='published' and request_id is not null),'publication audit records correlation');
select * from finish();
rollback;
