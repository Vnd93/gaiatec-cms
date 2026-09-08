begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function(
  'public',
  'cms_abort_dam_upload',
  array[
    'uuid','text','text','text','text','timestamp with time zone',
    'uuid','text','uuid','uuid','text','uuid'
  ],
  'governed upload abort is installed'
);
select has_function(
  'public', 'cms_claim_incomplete_media_gc', array['integer','uuid'],
  'service-only incomplete media GC claim is installed'
);
select has_function(
  'public',
  'cms_finish_incomplete_media_gc',
  array['uuid','uuid','uuid','boolean','text','jsonb','text','uuid'],
  'service-only incomplete media GC completion is installed'
);
select ok(
  (
    select constraint_row.convalidated
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.cms_media_assets'::regclass
      and constraint_row.conname = 'cms_media_operational_pixel_limit'
  ),
  'the 32 MP operational constraint is validated, not partial'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_abort_dam_upload(uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'service role may invoke guarded upload abort'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.cms_abort_dam_upload(uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot invoke upload abort directly'
);
select is(
  has_function_privilege(
    'anon', 'public.cms_claim_incomplete_media_gc(integer,uuid)', 'EXECUTE'
  ),
  false,
  'anonymous clients cannot claim incomplete-media GC jobs'
);
select is(
  has_function_privilege(
    'authenticated', 'public.cms_claim_incomplete_media_gc(integer,uuid)', 'EXECUTE'
  ),
  false,
  'authenticated clients cannot claim incomplete-media GC jobs'
);
select is(
  has_function_privilege(
    'service_role', 'public.cms_claim_incomplete_media_gc(integer,uuid)', 'EXECUTE'
  ),
  true,
  'only the service worker may claim incomplete-media GC jobs'
);
select is(
  has_function_privilege(
    'anon',
    'public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot falsify GC completion'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot falsify GC completion'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  true,
  'service worker may complete an incomplete-media GC claim'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.cms_count_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot bypass scoped usage-count mediation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.cms_restore_legacy_media(uuid,text,text,text,text,timestamptz,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot bypass governed legacy restore'
);
select is(
  has_function_privilege(
    'service_role', 'private.cms_watchdog_stale_dam_uploads(integer)', 'EXECUTE'
  ),
  false,
  'the database watchdog is not callable by application service code'
);
select is(
  (select schedule from cron.job where jobname = 'cms-dam-stale-upload-watchdog-v1'),
  '*/15 * * * *',
  'the stale reservation watchdog is scheduled every fifteen minutes'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('82000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','media-abort-owner@example.test','',now(),'{}','{}',now(),now()),
('82000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','media-abort-other@example.test','',now(),'{}','{}',now(),now()),
('82000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','media-only-manager@example.test','',now(),'{}','{}',now(),now());
insert into public.cms_profiles(user_id,display_name,status) values
('82000000-0000-4000-8000-000000000001','Media abort owner','active'),
('82000000-0000-4000-8000-000000000002','Media abort other','active'),
('82000000-0000-4000-8000-000000000003','Media-only manager','active');
insert into public.cms_roles(role_key,name,description,mfa_required,system_role)
values (
  'media_only_manager','Media-only manager test','Test role without content read',true,false
);
insert into public.cms_role_permissions(role_key,permission_key) values
('media_only_manager','cms:media.read'),
('media_only_manager','cms:media.manage');
insert into public.cms_user_roles(user_id,role_key) values
('82000000-0000-4000-8000-000000000001','super_admin'),
('82000000-0000-4000-8000-000000000002','super_admin'),
('82000000-0000-4000-8000-000000000003','media_only_manager');
insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,
  starts_at,expires_at,created_by
) values
('ev2.dam','local','user','82000000-0000-4000-8000-000000000001',false,
 'Abort compensation must work while DAM v2 is disabled',
 now()-interval '1 minute',now()+interval '1 hour',
 '82000000-0000-4000-8000-000000000001');

insert into public.cms_media_assets(
  id,storage_path,original_filename,declared_mime,source_kind,source_reference,
  rights_confirmed,license_name,owner_name,alt_text,processing_status,scan_status,
  width,height,created_by,created_at,upload_token_expires_at,
  finalization_claim_id,finalization_claimed_by,finalization_claimed_at,
  finalization_claim_expires_at
) values
('82000000-0000-4000-8000-000000000010',
 'cms/82000000-0000-4000-8000-000000000010/original.png','partial.png','image/png',
 'owner_authored','Upload abort fixture',true,'Internal test','GAIATEC','Partial image',
 'awaiting_upload','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now()-interval '4 hours',now()+interval '30 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000011',
 'cms/82000000-0000-4000-8000-000000000011/original.jpg','other.jpg','image/jpeg',
 'owner_authored','Upload abort IDOR fixture',true,'Internal test','GAIATEC','Other image',
 'awaiting_upload','pending',null,null,'82000000-0000-4000-8000-000000000002',
 now()-interval '4 hours',now()+interval '30 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000012',
 'cms/82000000-0000-4000-8000-000000000012/original.webp','stale.webp','image/webp',
 'owner_authored','Stale upload fixture',true,'Internal test','GAIATEC','Stale image',
 'awaiting_upload','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now()-interval '4 hours',now()-interval '30 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000013',
 'cms/82000000-0000-4000-8000-000000000013/original.avif','fresh.avif','image/avif',
 'owner_authored','Fresh upload fixture',true,'Internal test','GAIATEC','Fresh image',
 'awaiting_upload','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now(),now()+interval '135 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000014',
 'cms/82000000-0000-4000-8000-000000000014/original.png','ready.png','image/png',
 'owner_authored','Ready upload fixture',true,'Internal test','GAIATEC','Ready image',
 'ready','clean',1200,800,'82000000-0000-4000-8000-000000000001',
 now()-interval '4 hours',now()-interval '30 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000015',
 'cms/82000000-0000-4000-8000-000000000015/original.png','used.png','image/png',
 'owner_authored','Used upload fixture',true,'Internal test','GAIATEC','Used image',
 'ready','clean',1200,800,'82000000-0000-4000-8000-000000000001',
 now()-interval '4 hours',now()-interval '30 minutes',null,null,null,null),
('82000000-0000-4000-8000-000000000021',
 'cms/82000000-0000-4000-8000-000000000021/original.png','duplicate.png','image/png',
 'owner_authored','Duplicate finalization fixture',true,'Internal test','GAIATEC','Duplicate image',
 'processing','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now()-interval '3 hours',now()+interval '30 minutes',
 '82000000-0000-4000-8000-000000000121','82000000-0000-4000-8000-000000000001',
 now(),now()+interval '5 minutes'),
('82000000-0000-4000-8000-000000000022',
 'cms/82000000-0000-4000-8000-000000000022/original.jpg','invalid.jpg','image/jpeg',
 'owner_authored','Invalid finalization fixture',true,'Internal test','GAIATEC','Invalid image',
 'processing','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now()-interval '3 hours',now()+interval '30 minutes',
 '82000000-0000-4000-8000-000000000122','82000000-0000-4000-8000-000000000001',
 now(),now()+interval '5 minutes'),
('82000000-0000-4000-8000-000000000023',
 'cms/82000000-0000-4000-8000-000000000023/original.webp','variant.webp','image/webp',
 'owner_authored','Invalid variant fixture',true,'Internal test','GAIATEC','Invalid variant image',
 'processing','pending',null,null,'82000000-0000-4000-8000-000000000001',
 now()-interval '3 hours',now()+interval '30 minutes',
 '82000000-0000-4000-8000-000000000123','82000000-0000-4000-8000-000000000001',
 now(),now()+interval '5 minutes');

create function pg_temp.abort_upload(
  p_actor_id uuid,
  p_asset_id uuid,
  p_command_id uuid,
  p_idempotency_key uuid,
  p_request_hash text default repeat('a',64)
)
returns jsonb
language sql
as $$
  select public.cms_abort_dam_upload(
    p_actor_id,'local','main','aal2','media-abort-session',now()-interval '1 minute',
    p_asset_id,'client_upload_failed',p_command_id,p_idempotency_key,p_request_hash,
    '82000000-0000-4000-8000-000000000099'
  );
$$;

select is(
  (
    select enabled from public.cms_feature_flag_overrides
    where flag_key = 'ev2.dam'
      and scope_key = '82000000-0000-4000-8000-000000000001'
  ),
  false,
  'the test actor has DAM v2 explicitly disabled'
);
select is(
  pg_temp.abort_upload(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000010',
    '82000000-0000-4000-8000-000000000101',
    '82000000-0000-4000-8000-000000000102'
  ) ->> 'status',
  'failed',
  'abort remains available as compensation while DAM v2 is disabled'
);
select is(
  (
    select processing_status || ':' || (archived_at is not null)::text
    from public.cms_media_assets
    where id = '82000000-0000-4000-8000-000000000010'
  ),
  'failed:true',
  'abort archives and fails the incomplete reservation'
);
select is(
  (
    select jsonb_array_length(asset_snapshot -> 'paths')
    from public.cms_dam_gc_jobs
    where asset_id = '82000000-0000-4000-8000-000000000010'
  ),
  7,
  'abort schedules the original and six exact derivative slots'
);
select ok(
  (
    select execute_after >= asset.upload_token_expires_at
    from public.cms_dam_gc_jobs job
    join public.cms_media_assets asset on asset.id = job.asset_id
    where asset.id = '82000000-0000-4000-8000-000000000010'
  ),
  'abort never exposes a terminal GC claim before signed-upload expiry'
);
select is(
  (
    select event_data
    from public.cms_audit_log
    where action = 'cms:media.upload_aborted'
      and target_id = '82000000-0000-4000-8000-000000000010'
  ),
  '{"gcScheduled":true,"reasonCode":"client_upload_failed"}'::jsonb,
  'abort audit contains no token or storage path'
);
select is(
  pg_temp.abort_upload(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000010',
    '82000000-0000-4000-8000-000000000101',
    '82000000-0000-4000-8000-000000000102'
  ) ->> 'status',
  'failed',
  'identical abort replays its completed receipt'
);
select is(
  (
    select count(*)::integer from public.cms_dam_events
    where asset_id = '82000000-0000-4000-8000-000000000010'
      and event_type = 'abort_upload'
  ),
  1,
  'idempotent replay does not duplicate audit events'
);
select throws_ok(
  $$select pg_temp.abort_upload(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000011',
    '82000000-0000-4000-8000-000000000103',
    '82000000-0000-4000-8000-000000000104'
  )$$,
  'P0001','CMS_DAM_ASSET_NOT_FOUND',
  'a foreign UUID is indistinguishable from a missing asset'
);
select throws_ok(
  $$select pg_temp.abort_upload(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000099',
    '82000000-0000-4000-8000-000000000105',
    '82000000-0000-4000-8000-000000000106'
  )$$,
  'P0001','CMS_DAM_ASSET_NOT_FOUND',
  'a missing UUID returns the same state and message as a foreign UUID'
);
select is(
  jsonb_array_length(public.cms_claim_incomplete_media_gc(
    10,'82000000-0000-4000-8000-000000000201'
  )),
  0,
  'a worker cannot claim an aborted reservation while its upload token may still be valid'
);

select is(
  private.cms_watchdog_stale_dam_uploads(100),
  1,
  'the watchdog terminalizes only a token-expired stale reservation'
);
select is(
  (
    select jsonb_array_length(asset_snapshot -> 'paths')
    from public.cms_dam_gc_jobs
    where asset_id = '82000000-0000-4000-8000-000000000012'
      and execute_after <= statement_timestamp()
  ),
  7,
  'watchdog schedules all exact slots for immediate post-expiry collection'
);
select is(
  (
    select processing_status || ':' || (archived_at is null)::text
    from public.cms_media_assets
    where id = '82000000-0000-4000-8000-000000000013'
  ),
  'awaiting_upload:true',
  'watchdog preserves a fresh reservation'
);

create temporary table media_gc_claim as
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  1,'82000000-0000-4000-8000-000000000201'
)) claim(value);
select is(
  (select count(*)::integer from media_gc_claim),
  1,
  'one worker claims the due stale upload'
);
select is(
  (select jsonb_array_length(value -> 'paths') from media_gc_claim),
  7,
  'claim returns only the exact seven-path manifest'
);
select is(
  jsonb_array_length(public.cms_claim_incomplete_media_gc(
    1,'82000000-0000-4000-8000-000000000202'
  )),
  0,
  'SKIP LOCKED and claim CAS prevent a concurrent double claim'
);
select throws_ok(
  $$select public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000201',true,null,
    (select value -> 'paths' from media_gc_claim),repeat('f',64),
    '82000000-0000-4000-8000-000000000203'
  )$$,
  '42501','CMS_DAM_INCOMPLETE_GC_PROOF_INVALID',
  'the database rejects a fabricated successful verification proof'
);
select throws_ok(
  $$select public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000201',false,'storage_residue',
    '["cms/82000000-0000-4000-8000-000000000999/original.png"]'::jsonb,null,
    '82000000-0000-4000-8000-000000000204'
  )$$,
  '42501','CMS_DAM_INCOMPLETE_GC_PROOF_INVALID',
  'a worker cannot attest a path outside the claimed snapshot'
);

insert into public.cms_content_items(
  id,content_type,slug,workflow_status,created_by,updated_by
) values (
  '82000000-0000-4000-8000-000000000301','page','media-gc-fence-test','draft',
  '82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_drafts(item_id,payload,seo,provenance,updated_by)
values (
  '82000000-0000-4000-8000-000000000301',
  '{"title":"Página segura de uso","blocks":[]}'::jsonb,'{}','{}',
  '82000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$insert into public.cms_media_usages(asset_id,item_id,usage_kind)
    values(
      '82000000-0000-4000-8000-000000000012',
      '82000000-0000-4000-8000-000000000301','content'
    )$$,
  '55006','CMS_DAM_GC_ASSET_FENCED',
  'a new usage cannot appear after physical GC is claimed'
);
select throws_ok(
  $$insert into public.cms_dam_replacements(
      source_asset_id,target_asset_id,status,impact_snapshot,reason,
      created_by,correlation_id
    ) values (
      '82000000-0000-4000-8000-000000000012',
      '82000000-0000-4000-8000-000000000014','active','{}',
      'Concurrent replacement fence test',
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000205'
    )$$,
  '55006','CMS_DAM_GC_ASSET_FENCED',
  'a new replacement cannot appear after physical GC is claimed'
);

select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000201',false,'storage_residue',
    (select jsonb_build_array(value -> 'paths' -> 0) from media_gc_claim),null,
    '82000000-0000-4000-8000-000000000206'
  ) ->> 'status',
  'failed',
  'verified storage residue releases the claim and schedules a retry'
);
select is(
  (
    select (gc_claim_id is null)::text || ':' || job.status
    from public.cms_media_assets asset
    join public.cms_dam_gc_jobs job on job.asset_id = asset.id
    where asset.id = '82000000-0000-4000-8000-000000000012'
  ),
  'true:failed',
  'failed removal clears both claim owners without deleting the asset'
);
select throws_ok(
  $$select public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000201',false,'storage_residue','[]',null,
    '82000000-0000-4000-8000-000000000207'
  )$$,
  '42501','CMS_DAM_INCOMPLETE_GC_CLAIM_INVALID',
  'an expired claim cannot complete after the retry fence changed'
);

update public.cms_dam_gc_jobs
set execute_after = statement_timestamp() - interval '1 minute',
    attempts = 19
where asset_id = '82000000-0000-4000-8000-000000000012';
truncate media_gc_claim;
insert into media_gc_claim(value)
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  1,'82000000-0000-4000-8000-000000000202'
)) claim(value);
create temporary table media_gc_proof as
select encode(extensions.digest(convert_to(
  (value ->> 'verificationNonce') || ':' || (value ->> 'claimId') || ':' ||
  (
    select string_agg(path.value #>> '{}','|' order by path.ordinality)
    from jsonb_array_elements(value -> 'paths') with ordinality path(value,ordinality)
  ) || ':absent','UTF8'
), 'sha256'), 'hex') as proof
from media_gc_claim;
select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000202',true,null,
    (select value -> 'paths' from media_gc_claim),
    (select proof from media_gc_proof),
    '82000000-0000-4000-8000-000000000208'
  ) ->> 'status',
  'pending',
  'the first exact absence proof schedules a fenced second sweep'
);
select is(
  (select count(*)::integer from public.cms_media_assets
   where id = '82000000-0000-4000-8000-000000000012'),
  1,
  'the first sweep does not delete the reservation while a late PUT could race'
);
select is(
  (
    select job.status || ':' || (asset.gc_claim_id is not null)::text || ':' ||
      job.attempts::text
    from public.cms_dam_gc_jobs job
    join public.cms_media_assets asset on asset.id = job.asset_id
    where asset.id = '82000000-0000-4000-8000-000000000012'
  ),
  'pending:true:20',
  'the generation remains fenced and reserves a terminal claim for the required second sweep'
);

-- Advance only the synthetic claim clock. This represents a late PUT landing
-- after the first verified removal; the outbox worker will remove/verify every
-- exact path again under a new claim before terminalization.
select set_config('cms.dam_gc_operation','prepare',true);
select set_config(
  'cms.dam_gc_claim_id',
  (select value ->> 'claimId' from media_gc_claim),
  true
);
update public.cms_media_assets
set gc_claimed_at = statement_timestamp() - interval '20 minutes',
    gc_claim_expires_at = statement_timestamp() - interval '5 minutes',
    lock_version = lock_version + 1
where id = '82000000-0000-4000-8000-000000000012';
update private.cms_dam_gc_fences
set claim_expires_at = statement_timestamp() - interval '5 minutes'
where asset_id = '82000000-0000-4000-8000-000000000012';
update public.cms_dam_gc_jobs
set execute_after = statement_timestamp() - interval '1 minute'
where asset_id = '82000000-0000-4000-8000-000000000012';
select set_config('cms.dam_gc_operation','',true);
select set_config('cms.dam_gc_claim_id','',true);
truncate media_gc_claim;
insert into media_gc_claim(value)
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  1,'82000000-0000-4000-8000-000000000209'
)) claim(value);
select is(
  (select count(*)::integer from media_gc_claim),
  1,
  'the mandatory second sweep remains claimable when the first proof reached the attempt cap'
);
truncate media_gc_proof;
insert into media_gc_proof(proof)
select encode(extensions.digest(convert_to(
  (value ->> 'verificationNonce') || ':' || (value ->> 'claimId') || ':' ||
  (
    select string_agg(path.value #>> '{}','|' order by path.ordinality)
    from jsonb_array_elements(value -> 'paths') with ordinality path(value,ordinality)
  ) || ':absent','UTF8'
), 'sha256'), 'hex')
from media_gc_claim;
select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from media_gc_claim),
    (select (value ->> 'claimId')::uuid from media_gc_claim),
    '82000000-0000-4000-8000-000000000209',true,null,
    (select value -> 'paths' from media_gc_claim),
    (select proof from media_gc_proof),
    '82000000-0000-4000-8000-000000000210'
  ) ->> 'status',
  'done',
  'a second exact sweep removes any object recreated after the first proof'
);
select is(
  (select count(*)::integer from public.cms_media_assets
   where id = '82000000-0000-4000-8000-000000000012'),
  0,
  'only the second verified completion removes the failed reservation row'
);
select ok(
  exists(
    select 1 from private.cms_dam_gc_fences
    where asset_id = '82000000-0000-4000-8000-000000000012'
      and claim_id is null
  ),
  'successful completion preserves an immutable generation tombstone'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:media.incomplete_upload_gc_succeeded'
      and target_id = '82000000-0000-4000-8000-000000000012'
  ),
  1,
  'successful physical cleanup preserves its audit record'
);

insert into public.cms_media_assets(
  id,storage_path,original_filename,declared_mime,detected_mime,source_kind,
  source_reference,rights_confirmed,license_name,owner_name,alt_text,
  processing_status,scan_status,width,height,created_by,created_at,
  upload_token_expires_at,archived_at,archived_by
) values
('82000000-0000-4000-8000-000000000016',
 'cms/82000000-0000-4000-8000-000000000016/original.png','retained-due.png',
 'image/png','image/png','owner_authored','Due retained archive fixture',true,
 'Internal test','GAIATEC','Due retained image','ready','clean',1200,800,
 '82000000-0000-4000-8000-000000000001',now()-interval '40 days',
 now()-interval '37 days',now()-interval '31 days',
 '82000000-0000-4000-8000-000000000001'),
('82000000-0000-4000-8000-000000000017',
 'cms/82000000-0000-4000-8000-000000000017/original.png','retained-future.png',
 'image/png','image/png','owner_authored','Future retained archive fixture',true,
 'Internal test','GAIATEC','Future retained image','ready','clean',1200,800,
 '82000000-0000-4000-8000-000000000001',now()-interval '2 days',
 now()-interval '1 day',now()-interval '1 day',
 '82000000-0000-4000-8000-000000000001');
insert into public.cms_media_variants(
  asset_id,variant_key,format,width,height,transform_path
) values (
  '82000000-0000-4000-8000-000000000016','thumbnail','webp',480,320,
  'cms/82000000-0000-4000-8000-000000000016/thumbnail.webp'
);
insert into public.cms_dam_gc_jobs(
  asset_id,asset_snapshot,execute_after,created_by
) values
('82000000-0000-4000-8000-000000000016',
 jsonb_build_object(
   'assetId','82000000-0000-4000-8000-000000000016',
   'storagePath','cms/82000000-0000-4000-8000-000000000016/original.png',
   'sha256',null,
   'paths',jsonb_build_array(
     'cms/82000000-0000-4000-8000-000000000016/original.png',
     'cms/82000000-0000-4000-8000-000000000016/thumbnail.webp'
   )
 ),statement_timestamp()-interval '1 minute',
 '82000000-0000-4000-8000-000000000001'),
('82000000-0000-4000-8000-000000000017',
 jsonb_build_object(
   'assetId','82000000-0000-4000-8000-000000000017',
   'storagePath','cms/82000000-0000-4000-8000-000000000017/original.png',
   'sha256',null,
   'paths',jsonb_build_array(
     'cms/82000000-0000-4000-8000-000000000017/original.png'
   )
 ),statement_timestamp()+interval '29 days',
 '82000000-0000-4000-8000-000000000001');
select is(
  (
    select asset_snapshot ->> 'disposition'
    from public.cms_dam_gc_jobs
    where asset_id = '82000000-0000-4000-8000-000000000016'
  ),
  'retained_archive',
  'legacy job creation is automatically classified as retained archive'
);
create temporary table retained_gc_claim as
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  10,'82000000-0000-4000-8000-000000000251'
)) claim(value);
select is(
  (select count(*)::integer from retained_gc_claim),
  1,
  'automatic worker claims only the retention-expired archive'
);
select is(
  (
    select (value ->> 'disposition') || ':' ||
      jsonb_array_length(value -> 'paths')::text
    from retained_gc_claim
  ),
  'retained_archive:2',
  'retained claim recomputes the original and existing variant manifest'
);
select throws_ok(
  $$select public.cms_restore_legacy_media(
    '82000000-0000-4000-8000-000000000001','local','main','aal2',
    'media-abort-session',now()-interval '1 minute',
    '82000000-0000-4000-8000-000000000016',
    '82000000-0000-4000-8000-000000000252'
  )$$,
  'P0001','CMS_DAM_RESTORE_BUSY',
  'restore cannot race a physical retained-archive claim'
);
select throws_ok(
  $$insert into public.cms_media_usages(asset_id,item_id,usage_kind)
    values(
      '82000000-0000-4000-8000-000000000016',
      '82000000-0000-4000-8000-000000000301','content'
    )$$,
  '55006','CMS_DAM_GC_ASSET_FENCED',
  'retained-archive claim also blocks a late content usage'
);
select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from retained_gc_claim),
    (select (value ->> 'claimId')::uuid from retained_gc_claim),
    '82000000-0000-4000-8000-000000000251',false,'storage_residue',
    (select jsonb_build_array(value -> 'paths' -> 0) from retained_gc_claim),null,
    '82000000-0000-4000-8000-000000000253'
  ) ->> 'status',
  'failed',
  'retained archive remains fenced and retryable after verified residue'
);
update public.cms_dam_gc_jobs
set execute_after = statement_timestamp() - interval '1 minute'
where asset_id = '82000000-0000-4000-8000-000000000016';
truncate retained_gc_claim;
insert into retained_gc_claim(value)
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  10,'82000000-0000-4000-8000-000000000254'
)) claim(value);
create temporary table retained_gc_proof as
select encode(extensions.digest(convert_to(
  (value ->> 'verificationNonce') || ':' || (value ->> 'claimId') || ':' ||
  (
    select string_agg(path.value #>> '{}','|' order by path.ordinality)
    from jsonb_array_elements(value -> 'paths') with ordinality path(value,ordinality)
  ) || ':absent','UTF8'
), 'sha256'), 'hex') as proof
from retained_gc_claim;
select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from retained_gc_claim),
    (select (value ->> 'claimId')::uuid from retained_gc_claim),
    '82000000-0000-4000-8000-000000000254',true,null,
    (select value -> 'paths' from retained_gc_claim),
    (select proof from retained_gc_proof),
    '82000000-0000-4000-8000-000000000255'
  ) ->> 'status',
  'pending',
  'retained archive also requires a fenced second absence sweep'
);
select set_config('cms.dam_gc_operation','prepare',true);
select set_config(
  'cms.dam_gc_claim_id',
  (select value ->> 'claimId' from retained_gc_claim),
  true
);
update public.cms_media_assets
set gc_claimed_at = statement_timestamp() - interval '20 minutes',
    gc_claim_expires_at = statement_timestamp() - interval '5 minutes',
    lock_version = lock_version + 1
where id = '82000000-0000-4000-8000-000000000016';
update private.cms_dam_gc_fences
set claim_expires_at = statement_timestamp() - interval '5 minutes'
where asset_id = '82000000-0000-4000-8000-000000000016';
update public.cms_dam_gc_jobs
set execute_after = statement_timestamp() - interval '1 minute'
where asset_id = '82000000-0000-4000-8000-000000000016';
select set_config('cms.dam_gc_operation','',true);
select set_config('cms.dam_gc_claim_id','',true);
truncate retained_gc_claim;
insert into retained_gc_claim(value)
select claim.value
from jsonb_array_elements(public.cms_claim_incomplete_media_gc(
  10,'82000000-0000-4000-8000-000000000256'
)) claim(value);
truncate retained_gc_proof;
insert into retained_gc_proof(proof)
select encode(extensions.digest(convert_to(
  (value ->> 'verificationNonce') || ':' || (value ->> 'claimId') || ':' ||
  (
    select string_agg(path.value #>> '{}','|' order by path.ordinality)
    from jsonb_array_elements(value -> 'paths') with ordinality path(value,ordinality)
  ) || ':absent','UTF8'
), 'sha256'), 'hex')
from retained_gc_claim;
select is(
  public.cms_finish_incomplete_media_gc(
    (select (value ->> 'jobId')::uuid from retained_gc_claim),
    (select (value ->> 'claimId')::uuid from retained_gc_claim),
    '82000000-0000-4000-8000-000000000256',true,null,
    (select value -> 'paths' from retained_gc_claim),
    (select proof from retained_gc_proof),
    '82000000-0000-4000-8000-000000000257'
  ) ->> 'status',
  'done',
  'retained archive terminalizes only after the second exact absence proof'
);
select is(
  (select count(*)::integer from public.cms_media_assets
   where id = '82000000-0000-4000-8000-000000000016'),
  0,
  'automatic retained-archive GC deletes the due asset'
);
select is(
  (
    select (asset.archived_at is not null)::text || ':' || job.status
    from public.cms_media_assets asset
    join public.cms_dam_gc_jobs job on job.asset_id = asset.id
    where asset.id = '82000000-0000-4000-8000-000000000017'
  ),
  'true:pending',
  'automatic GC preserves an archive whose retention is not due'
);

select is(
  public.cms_fail_dam_finalization(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000021',
    '82000000-0000-4000-8000-000000000121','duplicate',
    '82000000-0000-4000-8000-000000000221',
    'aal2','media-abort-session',now()-interval '1 minute'
  ) ->> 'status',
  'rejected',
  'duplicate finalization rejects and archives its reservation'
);
select is(
  public.cms_fail_dam_finalization(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000022',
    '82000000-0000-4000-8000-000000000122','invalid_media',
    '82000000-0000-4000-8000-000000000222',
    'aal2','media-abort-session',now()-interval '1 minute'
  ) ->> 'status',
  'rejected',
  'invalid original finalization rejects and archives its reservation'
);
select is(
  public.cms_fail_dam_finalization(
    '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000023',
    '82000000-0000-4000-8000-000000000123','validation_failed',
    '82000000-0000-4000-8000-000000000223',
    'aal2','media-abort-session',now()-interval '1 minute'
  ) ->> 'status',
  'rejected',
  'invalid variant finalization rejects and archives its reservation'
);
select is(
  (
    select min(jsonb_array_length(job.asset_snapshot -> 'paths'))
    from public.cms_dam_gc_jobs job
    where job.asset_id in (
      '82000000-0000-4000-8000-000000000021',
      '82000000-0000-4000-8000-000000000022',
      '82000000-0000-4000-8000-000000000023'
    )
  ),
  7,
  'all finalization rejection paths derive seven slots even before variant rows exist'
);
select ok(
  not exists(
    select 1
    from public.cms_dam_gc_jobs job
    join public.cms_media_assets asset on asset.id = job.asset_id
    where job.asset_id in (
      '82000000-0000-4000-8000-000000000021',
      '82000000-0000-4000-8000-000000000022',
      '82000000-0000-4000-8000-000000000023'
    )
      and job.execute_after < asset.upload_token_expires_at
  ),
  'rejected finalization jobs also wait beyond every signed-upload token'
);

insert into public.cms_dam_crops(
  asset_id,crop_key,label,aspect_width,aspect_height,crop_x,crop_y,
  crop_width,crop_height,focal_x,focal_y,created_by,updated_by
) values (
  '82000000-0000-4000-8000-000000000014','ratio-3-2','Three by two',
  3,2,0,0,1,1,0.5,0.5,
  '82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001'
);
select pass('a visual 3:2 full-frame crop is accepted for a 1200x800 image');
select throws_ok(
  $$insert into public.cms_dam_crops(
      asset_id,crop_key,label,aspect_width,aspect_height,crop_x,crop_y,
      crop_width,crop_height,focal_x,focal_y,created_by,updated_by
    ) values (
      '82000000-0000-4000-8000-000000000014','false-16-9','False ratio',
      16,9,0,0,1,1,0.5,0.5,
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000001'
    )$$,
  '23514','CMS_DAM_CROP_ASPECT_INVALID',
  'database rejects a crop rectangle that lies about its visual aspect ratio'
);

insert into public.cms_media_usages(asset_id,item_id,usage_kind)
values (
  '82000000-0000-4000-8000-000000000015',
  '82000000-0000-4000-8000-000000000301','content'
);
select is(
  (
    select display_title || ':' || admin_path
    from public.cms_list_media_usages_scoped(
      '82000000-0000-4000-8000-000000000001','local','aal2',
      'media-abort-session',now()-interval '1 minute',
      array['82000000-0000-4000-8000-000000000015'::uuid]
    )
  ),
  'Página segura de uso:/admin/paginas/82000000-0000-4000-8000-000000000301',
  'usage map returns an authorized operator-safe title and admin route'
);
select is(
  (
    select total_usage_count::text || ':' || visible_usage_count::text || ':' ||
      hidden_usage_count::text
    from public.cms_count_media_usages_scoped(
      '82000000-0000-4000-8000-000000000003','local','aal2',
      'media-only-session',now()-interval '1 minute',
      array['82000000-0000-4000-8000-000000000015'::uuid]
    )
  ),
  '1:0:1',
  'a media manager sees a non-identifying hidden-use count without content permission'
);
select is(
  (
    select count(*)::integer
    from public.cms_list_media_usages_scoped(
      '82000000-0000-4000-8000-000000000003','local','aal2',
      'media-only-session',now()-interval '1 minute',
      array['82000000-0000-4000-8000-000000000015'::uuid]
    )
  ),
  0,
  'hidden-use details remain undisclosed to the media-only manager'
);
select throws_ok(
  $$select public.cms_archive_legacy_media(
    '82000000-0000-4000-8000-000000000001','local','main','aal2',
    'media-abort-session',now()-interval '1 minute',
    '82000000-0000-4000-8000-000000000015',
    '82000000-0000-4000-8000-000000000224'
  )$$,
  'P0001','CMS_MEDIA_IN_USE',
  'legacy delete cannot archive an asset still in use'
);
select is(
  public.cms_archive_legacy_media(
    '82000000-0000-4000-8000-000000000001','local','main','aal2',
    'media-abort-session',now()-interval '1 minute',
    '82000000-0000-4000-8000-000000000014',
    '82000000-0000-4000-8000-000000000225'
  ) ->> 'deleted',
  'true',
  'legacy delete is preserved as a governed reversible archive'
);
select is(
  public.cms_archive_legacy_media(
    '82000000-0000-4000-8000-000000000001','local','main','aal2',
    'media-abort-session',now()-interval '1 minute',
    '82000000-0000-4000-8000-000000000014',
    '82000000-0000-4000-8000-000000000226'
  ) ->> 'deleted',
  'true',
  'legacy archive retry is idempotent'
);
select is(
  (
    select count(*)::integer from public.cms_dam_events
    where asset_id = '82000000-0000-4000-8000-000000000014'
      and event_type = 'legacy_archive'
  ),
  1,
  'legacy archive retry does not duplicate its immutable event'
);
select is(
  public.cms_restore_legacy_media(
    '82000000-0000-4000-8000-000000000001','local','main','aal2',
    'media-abort-session',now()-interval '1 minute',
    '82000000-0000-4000-8000-000000000014',
    '82000000-0000-4000-8000-000000000227'
  ) ->> 'restored',
  'true',
  'legacy fallback restores an archive while retention is active'
);
select is(
  (
    select (asset.archived_at is null)::text || ':' || job.status
    from public.cms_media_assets asset
    join public.cms_dam_gc_jobs job on job.asset_id = asset.id
    where asset.id = '82000000-0000-4000-8000-000000000014'
  ),
  'true:canceled',
  'restore atomically cancels pending retained-archive collection'
);
select throws_ok(
  $$update public.cms_media_assets
    set width = 8000, height = 5000
    where id = '82000000-0000-4000-8000-000000000015'$$,
  '23514',null,
  'database rejects a historical-style 40 MP surface after validated migration'
);
select throws_ok(
  $$update public.cms_media_assets
    set width = null, height = 800
    where id = '82000000-0000-4000-8000-000000000015'$$,
  '23514',null,
  'database rejects partial dimensions instead of bypassing the pixel invariant'
);

select * from finish();
rollback;
