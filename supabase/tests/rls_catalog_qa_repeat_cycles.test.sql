-- Disposable local database only; rollback is NOT committed staging UAT.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.repeat_uid(n integer) returns uuid language sql immutable as $$
  select ('a1220000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.repeat_actor(n integer) returns void language sql as $$
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(pg_temp.repeat_uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'qa-repeat-'||n||'@example.test','',now(),'{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20261015-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());
$$;
create function pg_temp.repeat_prepare(n integer) returns uuid language sql as $$
  select private.cms_catalog_prepare_qa_recovery('QA-CMS-FINAL-20261015-bbbbbbbb',repeat('b',40),
    repeat('c',64),pg_temp.repeat_uid(99),repeat('d',64),repeat('e',64),array[pg_temp.repeat_uid(n)]);
$$;
create temporary table repeat_manifests(cycle integer primary key,id uuid);
select pg_temp.repeat_actor(1);
insert into repeat_manifests select 1,pg_temp.repeat_prepare(1);
select throws_ok($$select pg_temp.repeat_prepare(1)$$,'23505',null,
  'one nonterminal manifest per exact release group');
update private.cms_catalog_qa_recovery set state='compensating',compensation_pid=pg_backend_pid()
  where manifest_id=(select id from repeat_manifests where cycle=1);
select throws_ok($$select pg_temp.repeat_prepare(1)$$,'23505',null,
  'compensating cycle also excludes concurrent preparation');
update private.cms_catalog_qa_recovery set state='prepared',compensation_pid=null
  where manifest_id=(select id from repeat_manifests where cycle=1);
-- Local rollback-only stand-in for a prior committed transaction.
update private.cms_catalog_qa_recovery set prepared_xid='1'::xid8
  where manifest_id=(select id from repeat_manifests where cycle=1);
select lives_ok($$update private.cms_qa_actor_leases set status='expired',swept_at=clock_timestamp()
  where actor_id=pg_temp.repeat_uid(1)$$,'first cycle completes ordinary terminal compensation');
select is((select state from private.cms_catalog_qa_recovery where manifest_id=(select id from repeat_manifests where cycle=1)),
  'cleaned','first manifest remains as terminal history');

select pg_temp.repeat_actor(2);
select lives_ok($$insert into repeat_manifests select 2,pg_temp.repeat_prepare(2)$$,
  'fresh actor may prepare another cycle for identical SHA and UTC run tag');
select is((select count(*)::integer from private.cms_catalog_qa_recovery
  where run_tag='QA-CMS-FINAL-20261015-bbbbbbbb'),2,'neither historical manifest nor binding is deleted');
select throws_ok($$insert into private.cms_catalog_qa_recovery_actors
  select (select id from repeat_manifests where cycle=2),actor_id,lease_created_at,lease_expires_at
  from private.cms_catalog_qa_recovery_actors where actor_id=pg_temp.repeat_uid(1)$$,
  '23505',null,'closed actor cannot be enrolled again even by the owner');
select throws_ok($$select pg_temp.repeat_prepare(1)$$,'42501','CMS_CATALOG_RECOVERY_LEASE_MISMATCH',
  'terminal lease is not reopened by preparing another cycle');
select throws_ok($$select private.cms_catalog_qa_manifest_for_actor(pg_temp.repeat_uid(2))$$,
  '42501','CMS_CATALOG_COMMITTED_RECOVERY_REQUIRED','repeat cycle still requires a prior committed manifest');
select pg_temp.repeat_actor(3);
select throws_ok($$select pg_temp.repeat_prepare(2)$$,'42501','CMS_CATALOG_RECOVERY_GROUP_INCOMPLETE',
  'a later unbound active actor cannot be omitted from group validation');
select lives_ok($$update private.cms_qa_actor_leases set status='expired',swept_at=clock_timestamp()
  where actor_id=pg_temp.repeat_uid(3)$$,'unenrolled actor retires without touching another manifest');
select is((select state from private.cms_catalog_qa_recovery where manifest_id=(select id from repeat_manifests where cycle=2)),
  'prepared','unenrolled cleanup cannot compensate the bound cycle');
update private.cms_catalog_qa_recovery set prepared_xid='1'::xid8
  where manifest_id=(select id from repeat_manifests where cycle=2);
select lives_ok($$select private.cms_catalog_qa_manifest_for_actor(pg_temp.repeat_uid(2))$$,
  'fresh actor resolves only its own prepared manifest');
-- Deliberate owner-only mismatch must refuse cleanup, not select cycle 1.
update private.cms_catalog_qa_recovery_actors set lease_expires_at=lease_expires_at+interval '1 second'
  where actor_id=pg_temp.repeat_uid(2);
select throws_ok($$update private.cms_qa_actor_leases set status='expired',swept_at=clock_timestamp()
  where actor_id=pg_temp.repeat_uid(2)$$,'55000','CMS_CATALOG_RECOVERY_TERMINAL_BINDING_MISMATCH',
  'wrong exact lease binding cannot silently pass terminal cleanup');
update private.cms_catalog_qa_recovery_actors a set lease_expires_at=l.expires_at
  from private.cms_qa_actor_leases l where a.actor_id=l.actor_id and a.actor_id=pg_temp.repeat_uid(2);
select lives_ok($$update private.cms_qa_actor_leases set status='expired',swept_at=clock_timestamp()
  where actor_id=pg_temp.repeat_uid(2)$$,'second terminal trigger selects the new manifest, not cleaned history');
select is((select count(*)::integer from private.cms_catalog_qa_recovery
  where run_tag='QA-CMS-FINAL-20261015-bbbbbbbb' and state='cleaned'),2,
  'both cycles retain independent verified terminal manifests');
select lives_ok($$select private.cms_catalog_compensate_qa_recovery((select id from repeat_manifests where cycle=2))$$,
  'terminal recovery remains idempotent');
select is((select count(*)::integer from private.cms_qa_actor_leases
  where actor_id in (pg_temp.repeat_uid(1),pg_temp.repeat_uid(2)) and status='active'),0,
  'neither actor remains active');
select is((select default_enabled from public.cms_feature_flags where flag_key='ev2.catalog_v1'),false,
  'global catalog flag remains disabled');
select * from finish();
rollback;
