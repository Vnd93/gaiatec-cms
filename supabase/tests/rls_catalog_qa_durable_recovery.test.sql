-- Local disposable database only; every synthetic row is rolled back.
-- The owner-only prepared_xid adjustment below exercises compensation inside
-- pgTAP's single transaction. It is NOT evidence of a committed hosted manifest.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_table('private','cms_catalog_qa_recovery','private durable manifest exists');
select has_table('private','cms_catalog_qa_owned_entities','private ownership ledger exists');
select has_trigger('private','cms_qa_actor_leases','zzy_catalog_durable_terminal_recovery','terminal lease integrates catalog recovery');
select ok(not has_table_privilege('authenticated','private.cms_catalog_qa_recovery','INSERT'),'clients cannot prepare arbitrary manifests');
select ok(not has_table_privilege('service_role','private.cms_catalog_qa_owned_entities','INSERT'),'service API cannot enroll arbitrary entities');
select ok(not has_function_privilege('authenticated','private.cms_catalog_recovery_actor(text,uuid)','EXECUTE'),'clients cannot use internal actor attribution');
select ok(not has_function_privilege('service_role','private.cms_catalog_compensate_qa_recovery(uuid)','EXECUTE'),'recovery is not a service-role escape hatch');
select ok(not has_function_privilege('anon','private.cms_catalog_prepare_qa_recovery(text,text,text,uuid,text,text,uuid[])','EXECUTE'),'preparation is owner-only');
select throws_ok($$select private.cms_catalog_recovery_actor('product','a1180000-0000-4000-8000-000000000010')$$,
  '42501','CMS_CATALOG_ACTOR_REQUIRED','auth-null attribution without manifest is denied');
select set_config('cms.qa_compensating','on',true);
select set_config('cms.catalog_terminal_actor','a1180000-0000-4000-8000-000000000001',true);
select throws_ok($$select private.cms_catalog_recovery_actor('product','a1180000-0000-4000-8000-000000000010')$$,
  '42501','CMS_CATALOG_ACTOR_REQUIRED','GUC selectors cannot manufacture recovery authority');

create function pg_temp.cat_uid(n integer) returns uuid language sql immutable as $$
  select ('a1180000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.cat_uid(1),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'qa-catalog-recovery@example.test','',now(),'{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261010-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
  (pg_temp.cat_uid(2),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'corporate-recovery-control@example.test','',now(),'{}','{}',now(),now());
-- Existing Auth registration creates the exact QA lease; metadata alone would
-- never satisfy any recovery guard without that owner-owned lease.
select is((select count(*)::integer from private.cms_qa_actor_leases where actor_id=pg_temp.cat_uid(1)),1,'QA lease registered before preparation');
create temporary table cat_manifest(id uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cat_uid(1),'role','authenticated','aal','aal2')::text,true);
select throws_ok($$insert into public.cms_catalog_taxonomy_terms(id,term_type,slug,title,created_by,updated_by)
  values(pg_temp.cat_uid(10),'category','qa-durable-category','Synthetic category',pg_temp.cat_uid(1),pg_temp.cat_uid(1))$$,
  '42501','CMS_CATALOG_COMMITTED_RECOVERY_REQUIRED','first mutation without durable manifest fails closed');
select set_config('request.jwt.claims','{}',true);
insert into cat_manifest select private.cms_catalog_prepare_qa_recovery('QA-CMS-FINAL-20261010-aaaaaaaa',repeat('a',40),
  repeat('b',64),pg_temp.cat_uid(99),repeat('c',64),repeat('d',64),array[pg_temp.cat_uid(1)]);
select throws_ok($$select private.cms_catalog_qa_manifest_for_actor(pg_temp.cat_uid(1))$$,
  '42501','CMS_CATALOG_COMMITTED_RECOVERY_REQUIRED','same-transaction preparation cannot authorize first mutation');
-- Rollback-only unit fixture: durable commit semantics are tested above as a
-- negative gate; positive multi-transaction proof belongs to real staging UAT.
update private.cms_catalog_qa_recovery set prepared_xid='1'::xid8,prepared_at=now()-interval '1 second'
  where manifest_id=(select id from cat_manifest);
select lives_ok($$select private.cms_catalog_qa_manifest_for_actor(pg_temp.cat_uid(1))$$,'matching prior-transaction fixture is accepted');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cat_uid(1),'role','authenticated','aal','aal2')::text,true);
select lives_ok($$insert into public.cms_catalog_taxonomy_terms(id,term_type,slug,title,created_by,updated_by)
  values(pg_temp.cat_uid(10),'category','qa-durable-category','Synthetic category',pg_temp.cat_uid(1),pg_temp.cat_uid(1))$$,'new QA term captures ownership atomically');
select lives_ok($$insert into public.cms_catalog_products(id,slug,title,primary_term_id,created_by,updated_by)
  values(pg_temp.cat_uid(20),'qa-durable-product','Synthetic product',pg_temp.cat_uid(10),pg_temp.cat_uid(1),pg_temp.cat_uid(1))$$,'new QA product captures ownership atomically');
select lives_ok($$insert into public.cms_catalog_taxonomy_terms(id,term_type,slug,title,status,created_by,updated_by)
  values(pg_temp.cat_uid(11),'technology','qa-durable-technology','Synthetic technology','active',pg_temp.cat_uid(1),pg_temp.cat_uid(1))$$,'editorial term is owned by the same manifest');
select lives_ok($$insert into public.cms_catalog_products(id,slug,title,catalog_entity_kind,created_by,updated_by)
  values(pg_temp.cat_uid(22),'qa-durable-model','Synthetic model','model',pg_temp.cat_uid(1),pg_temp.cat_uid(1))$$,'hierarchy model is owned by the same manifest');
select lives_ok($$insert into public.cms_catalog_product_relation_revisions(relation_key,revision,source_product_id,target_product_id,
  relation_kind,status,changed_by,change_reason) values(pg_temp.cat_uid(30),1,pg_temp.cat_uid(20),pg_temp.cat_uid(22),
  'accessory','active',pg_temp.cat_uid(1),'Synthetic owned relationship')$$,'capture exact relationship ownership');
select lives_ok($$insert into public.cms_catalog_product_hierarchy_revisions(hierarchy_key,revision,child_product_id,parent_product_id,
  hierarchy_kind,status,changed_by,change_reason) values(pg_temp.cat_uid(40),1,pg_temp.cat_uid(22),pg_temp.cat_uid(20),
  'model_product','active',pg_temp.cat_uid(1),'Synthetic owned hierarchy')$$,'capture exact hierarchy ownership');
select set_config('cms.catalog_publication_action','submit',true);
update public.cms_catalog_products set revision=revision+1,publication_state='ready',complementary_term_ids=array[pg_temp.cat_uid(11)]
  where id=pg_temp.cat_uid(20);
select set_config('cms.catalog_publication_action','publish',true);
select lives_ok($$update public.cms_catalog_products set revision=revision+1,publication_state='published',published_revision=revision+1
  where id=pg_temp.cat_uid(20)$$,'publication creates the original immutable snapshot and outbox');
select set_config('cms.catalog_publication_action','',true);
insert into public.cms_catalog_editorial_revisions(term_id,revision,status,title,summary,blocks,term_kind,slug,changed_by,reason,correlation_id)
  values(pg_temp.cat_uid(11),1,'published','Synthetic editorial','Isolated summary',
  '[{"heading":"Synthetic heading","paragraphs":["Isolated paragraph"]}]','technology','qa-durable-technology',
  pg_temp.cat_uid(1),'Synthetic editorial fixture',pg_temp.cat_uid(98));
insert into public.cms_catalog_product_terms(product_id,term_id,relation_kind,attached_by)
  values(pg_temp.cat_uid(20),pg_temp.cat_uid(10),'category',pg_temp.cat_uid(1));
select is((select count(*)::integer from private.cms_catalog_qa_owned_entities where manifest_id=(select id from cat_manifest)),6,'only newly inserted exact entities enrolled');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cat_uid(2),'role','authenticated','aal','aal2')::text,true);
select throws_ok($$insert into public.cms_catalog_products(id,slug,title,primary_term_id,created_by,updated_by)
  values(pg_temp.cat_uid(21),'corporate-mixed-reference','Corporate control',pg_temp.cat_uid(10),pg_temp.cat_uid(2),pg_temp.cat_uid(2))$$,
  '42501','CMS_CATALOG_QA_FOREIGN_REFERENCE','corporate mutation cannot refer to QA taxonomy');
select throws_ok($$update public.cms_catalog_products set revision=revision+1,updated_by=pg_temp.cat_uid(2) where id=pg_temp.cat_uid(20)$$,
  '42501','CMS_CATALOG_QA_FOREIGN_ENTITY','corporate actor cannot edit QA-owned entity');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select private.cms_catalog_recovery_actor('product',pg_temp.cat_uid(20))$$,
  '42501','CMS_CATALOG_ACTOR_REQUIRED','prepared ownership is not compensation authority');
update private.cms_catalog_qa_recovery set state='compensating',compensation_pid=pg_backend_pid()+1
  where manifest_id=(select id from cat_manifest);
select throws_ok($$select private.cms_catalog_recovery_actor('product',pg_temp.cat_uid(20))$$,
  '42501','CMS_CATALOG_ACTOR_REQUIRED','another backend PID cannot use compensation authority');
update private.cms_catalog_qa_recovery set state='prepared',compensation_pid=null
  where manifest_id=(select id from cat_manifest);
select set_config('cms.qa_compensating','off',true);
select set_config('cms.catalog_terminal_actor',pg_temp.cat_uid(1)::text,true);
create function pg_temp.foreign_history() returns void language plpgsql as $$
begin
  insert into public.cms_catalog_product_revisions(product_id,revision,slug,title,lifecycle_status,publication_state,content,changed_by)
    values(pg_temp.cat_uid(20),99,'qa-durable-product','Foreign history','draft','draft','{}',pg_temp.cat_uid(2));
  perform private.cms_catalog_compensate_qa_recovery((select id from cat_manifest));
end;
$$;
select throws_ok($$select pg_temp.foreign_history()$$,'55000','CMS_CATALOG_RECOVERY_FOREIGN_STATE','mixed historical actor aborts compensation atomically');
select is((select state from private.cms_catalog_qa_recovery where manifest_id=(select id from cat_manifest)),'prepared','failed recovery leaves durable intent retriable, not falsely cleaned');
select lives_ok($$select private.cms_catalog_compensate_qa_recovery((select id from cat_manifest))$$,'exact owned catalog can be compensated without fake JWT claims');
select is((select state from private.cms_catalog_qa_recovery where manifest_id=(select id from cat_manifest)),'cleaned','manifest terminal only after residue checks');
select is((select count(*)::integer from public.cms_catalog_products where id=pg_temp.cat_uid(20) and catalog_lifecycle_state='active'),0,'zero active synthetic products');
select is((select count(*)::integer from public.cms_catalog_taxonomy_terms where id=pg_temp.cat_uid(10) and status<>'inactive'),0,'zero active synthetic taxonomy');
select is((select count(*)::integer from public.cms_catalog_product_revisions where product_id=pg_temp.cat_uid(20)),4,'product history retained with retirement revision');
select is((select count(*)::integer from public.cms_catalog_taxonomy_revisions where term_id=pg_temp.cat_uid(10)),2,'taxonomy history retained with retirement revision');
select ok((select count(*)>=6 from public.cms_catalog_audit_events where entity_id in (pg_temp.cat_uid(10)::text,pg_temp.cat_uid(20)::text)),'immutable audit survives compensation');
select is((select count(*)::integer from public.cms_catalog_product_snapshots where product_id=pg_temp.cat_uid(20)),1,'immutable snapshot retained');
select is((select count(*)::integer from public.cms_catalog_product_snapshots where product_id=pg_temp.cat_uid(20) and is_current),0,'no live snapshot survives recovery');
select is((select published_revision from public.cms_catalog_products where id=pg_temp.cat_uid(20)),3::bigint,'original published pointer preserved');
select is((select status from public.cms_catalog_current_product_relations where relation_key=pg_temp.cat_uid(30)),'retracted','relations retired by append-only revision');
select is((select status from public.cms_catalog_current_product_hierarchy where hierarchy_key=pg_temp.cat_uid(40)),'retracted','hierarchy retired by append-only revision');
select is((select status from public.cms_catalog_current_editorial where term_id=pg_temp.cat_uid(11)),'unpublished','editorial disposed before term deactivation');
select is((select count(*)::integer from public.cms_catalog_publication_outbox where product_id=pg_temp.cat_uid(20) and status in ('pending','processing','failed')),0,'no active outbox residue');
select is((select count(*)::integer from public.cms_catalog_product_terms where product_id=pg_temp.cat_uid(20)),0,'current mapping retired with immutable audit retained');
select throws_ok($$delete from public.cms_catalog_audit_events where entity_id=pg_temp.cat_uid(20)::text$$,
  '42501','CMS audit records are immutable','recovery does not weaken immutable audit');
select lives_ok($$select private.cms_catalog_compensate_qa_recovery((select id from cat_manifest))$$,'terminal compensation is idempotent');
select throws_ok($$select private.cms_catalog_recovery_actor('product',pg_temp.cat_uid(20))$$,
  '42501','CMS_CATALOG_ACTOR_REQUIRED','terminal manifest cannot be reused as actor authority');
select is((select default_enabled from public.cms_feature_flags where flag_key='ev2.catalog_v1'),false,'global flag remains off');
select * from finish();
rollback;
