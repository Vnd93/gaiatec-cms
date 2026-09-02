begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(47);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '47000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ev2.dam.operator@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles(user_id, display_name, display_email, status)
values('47000000-0000-4000-8000-000000000001', 'Operador DAM EV2', 'ev2.dam.operator@example.test', 'active');
insert into public.cms_user_roles(user_id, role_key)
values('47000000-0000-4000-8000-000000000001', 'super_admin');

create function pg_temp.execute_dam_command(
  p_action text,
  p_payload jsonb,
  p_aal text default 'aal2',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a', 64),
  p_correlation_id uuid default gen_random_uuid()
) returns jsonb language sql as $$
  select public.cms_execute_dam_command(
    '47000000-0000-4000-8000-000000000001', 'local', 'main', p_aal,
    'ev2-dam-session', now() - interval '1 minute', p_action, p_payload,
    p_command_id, p_idempotency_key, p_request_hash, p_correlation_id
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_dam_collections'::regclass, 'public.cms_dam_tags'::regclass,
    'public.cms_dam_collection_assets'::regclass, 'public.cms_dam_asset_tags'::regclass,
    'public.cms_dam_crops'::regclass, 'public.cms_dam_replacements'::regclass,
    'public.cms_dam_gc_jobs'::regclass, 'public.cms_dam_command_receipts'::regclass,
    'public.cms_dam_events'::regclass
  ) and relrowsecurity),
  9,
  'all EV2.5 DAM tables enable RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_media_assets', 'SELECT'), true, 'anonymous clients cannot read private media');
select isnt(has_table_privilege('anon', 'public.cms_dam_collections', 'SELECT'), true, 'anonymous clients cannot read DAM organization');
select isnt(has_function_privilege('authenticated', 'public.cms_execute_dam_command(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)', 'EXECUTE'), true, 'authenticated clients cannot bypass the DAM command boundary');
select isnt(has_function_privilege('authenticated', 'public.cms_prepare_dam_gc(uuid)', 'EXECUTE'), true, 'authenticated clients cannot bypass retained GC');
select is((public.cms_evaluate_feature_flag('47000000-0000-4000-8000-000000000001', 'ev2.dam', 'local', 'main', 'aal2', 'ev2-dam-session', now() - interval '1 minute')->>'enabled')::boolean, false, 'DAM remains disabled by default');
select throws_ok(
  $$select pg_temp.execute_dam_command('upsert_collection', '{"name":"Produtos","description":"Imagens de produto"}'::jsonb)$$,
  '42501', 'CMS_DAM_FEATURE_DISABLED', 'a disabled flag blocks DAM mutations'
);

insert into public.cms_feature_flag_overrides(flag_key, environment, scope_type, scope_key, enabled, reason, expires_at, created_by)
values('ev2.dam', 'local', 'user', '47000000-0000-4000-8000-000000000001', true, 'Teste local transacional do Gate G5', now() + interval '1 hour', '47000000-0000-4000-8000-000000000001');
select is((public.cms_evaluate_feature_flag('47000000-0000-4000-8000-000000000001', 'ev2.dam', 'local', 'main', 'aal2', 'ev2-dam-session', now() - interval '1 minute')->>'enabled')::boolean, true, 'an explicit operator override enables DAM');

insert into public.cms_media_assets(
  id, storage_path, original_filename, declared_mime, detected_mime, byte_size, sha256,
  width, height, processing_status, scan_status, scan_engine, source_kind, source_reference,
  rights_confirmed, rights_expires_at, license_name, owner_name, alt_text, perceptual_hash,
  created_by, created_at, processed_at
) values
('47000000-0000-4000-8000-000000000010', 'cms/47000000-0000-4000-8000-000000000010/original.png', 'origem.png', 'image/png', 'image/png', 100, repeat('1',64), 100, 100, 'ready', 'clean', 'fixture', 'synthetic_test', 'Fixture G5', true, now()+interval '1 year', 'Teste', 'Fixture', 'Imagem de origem', '0000000000000000', '47000000-0000-4000-8000-000000000001', now()-interval '1 day', now()),
('47000000-0000-4000-8000-000000000011', 'cms/47000000-0000-4000-8000-000000000011/original.png', 'destino.png', 'image/png', 'image/png', 101, repeat('2',64), 100, 100, 'ready', 'clean', 'fixture', 'synthetic_test', 'Fixture G5', true, now()+interval '1 year', 'Teste', 'Fixture', 'Imagem de destino', '000000000000000f', '47000000-0000-4000-8000-000000000001', now()-interval '1 day', now()),
('47000000-0000-4000-8000-000000000012', 'cms/47000000-0000-4000-8000-000000000012/original.png', 'expirada.png', 'image/png', 'image/png', 102, repeat('3',64), 100, 100, 'ready', 'clean', 'fixture', 'synthetic_test', 'Fixture G5', true, now()-interval '1 day', 'Teste', 'Fixture', 'Imagem expirada', 'ffffffffffffffff', '47000000-0000-4000-8000-000000000001', now()-interval '1 year', now()-interval '2 days'),
('47000000-0000-4000-8000-000000000013', 'cms/47000000-0000-4000-8000-000000000013/original.png', 'livre.png', 'image/png', 'image/png', 103, repeat('4',64), 100, 100, 'ready', 'clean', 'fixture', 'synthetic_test', 'Fixture G5', true, null, 'Teste', 'Fixture', 'Imagem livre', '1111111111111111', '47000000-0000-4000-8000-000000000001', now()-interval '1 day', now());

select is(public.cms_dam_hamming_distance('0000000000000000','0000000000000000'), 0, 'equal dHash values have zero distance');
select is(public.cms_dam_hamming_distance('0000000000000000','ffffffffffffffff'), 64, 'opposite dHash values have maximum distance');
select is(public.cms_normalize_dam_term('  Medição & Vazão  '), 'medicao-vazao', 'DAM terms normalize accents and separators');
select is(public.cms_dam_asset_publishable('47000000-0000-4000-8000-000000000010'), true, 'a clean ready asset with valid rights is publishable');
select is(public.cms_dam_asset_publishable('47000000-0000-4000-8000-000000000012'), false, 'expired rights make an asset non-publishable');

insert into public.cms_dam_collections(id, name, normalized_name, description, created_by, updated_by)
values('47000000-0000-4000-8000-000000000020', 'Produtos', 'produtos', 'Imagens de produtos', '47000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select pg_temp.execute_dam_command(
    'set_organization',
    '{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":1,"collectionIds":["47000000-0000-4000-8000-000000000020"],"tags":["Produto","Destaque"],"reason":"Organizar ativo livre"}'::jsonb,
    p_command_id=>'47000000-0000-4000-8000-000000000101',
    p_idempotency_key=>'47000000-0000-4000-8000-000000000102', p_request_hash=>repeat('b',64)
  )$$,
  'an authorized operator organizes an asset'
);
select is((select count(*)::integer from public.cms_dam_collection_assets where asset_id='47000000-0000-4000-8000-000000000013'), 1, 'collection membership is recorded once');
select is((select count(*)::integer from public.cms_dam_asset_tags where asset_id='47000000-0000-4000-8000-000000000013'), 2, 'normalized tags are attached');
select is((select lock_version::integer from public.cms_media_assets where id='47000000-0000-4000-8000-000000000013'), 2, 'organization advances optimistic version');
select is((pg_temp.execute_dam_command('set_organization','{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":1,"collectionIds":["47000000-0000-4000-8000-000000000020"],"tags":["Produto","Destaque"],"reason":"Organizar ativo livre"}'::jsonb,p_command_id=>'47000000-0000-4000-8000-000000000101',p_idempotency_key=>'47000000-0000-4000-8000-000000000102',p_request_hash=>repeat('b',64))->>'lockVersion')::integer, 2, 'an identical organization command replays its receipt');
select is((select count(*)::integer from public.cms_dam_asset_tags where asset_id='47000000-0000-4000-8000-000000000013'), 2, 'replay never duplicates tag links');
select throws_ok(
  $$select pg_temp.execute_dam_command('set_organization','{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":2,"collectionIds":[],"tags":[],"reason":"Outro comando"}'::jsonb,p_idempotency_key=>'47000000-0000-4000-8000-000000000102',p_request_hash=>repeat('c',64))$$,
  'P0001','CMS_DAM_IDEMPOTENCY_CONFLICT','an idempotency key cannot represent a different command'
);

select lives_ok(
  $$select pg_temp.execute_dam_command(
    'save_crop',
    '{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":2,"crop":{"cropKey":"quadrado","label":"Quadrado","aspectWidth":1,"aspectHeight":1,"x":0,"y":0,"width":1,"height":1,"focalX":0.5,"focalY":0.5},"reason":"Crop de teste"}'::jsonb
  )$$,
  'a normalized crop is saved without replacing the original'
);
select is((select count(*)::integer from public.cms_dam_crops where asset_id='47000000-0000-4000-8000-000000000013'), 1, 'the crop is stored once');
select throws_ok(
  $$insert into public.cms_dam_crops(asset_id,crop_key,label,aspect_width,aspect_height,crop_x,crop_y,crop_width,crop_height,focal_x,focal_y,created_by,updated_by) values('47000000-0000-4000-8000-000000000013','invalido','Inválido',1,1,0.5,0,0.6,1,0.5,0.5,'47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a crop cannot escape normalized image bounds'
);

insert into public.cms_content_items(id, content_type, slug, created_by, updated_by)
values('47000000-0000-4000-8000-000000000030','post','dam-g5','47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001');
insert into public.cms_content_revisions(id,item_id,revision_number,schema_version,payload,seo,provenance,source_draft_version,reason,created_by)
values('47000000-0000-4000-8000-000000000031','47000000-0000-4000-8000-000000000030',1,1,'{"title":"DAM G5","media":[]}'::jsonb,'{}','[{"rightsConfirmed":true}]',1,'Revisão DAM G5','47000000-0000-4000-8000-000000000001');
insert into public.cms_media_usages(asset_id,item_id,revision_id,usage_kind)
values('47000000-0000-4000-8000-000000000010','47000000-0000-4000-8000-000000000030','47000000-0000-4000-8000-000000000031','content');
select throws_ok(
  $$select pg_temp.execute_dam_command('archive_asset','{"assetId":"47000000-0000-4000-8000-000000000010","expectedVersion":1,"reason":"Tentar arquivar em uso"}'::jsonb)$$,
  'P0001','CMS_MEDIA_IN_USE','an asset in use cannot be archived'
);
select lives_ok(
  $$select pg_temp.execute_dam_command('activate_replacement','{"sourceAssetId":"47000000-0000-4000-8000-000000000010","targetAssetId":"47000000-0000-4000-8000-000000000011","expectedVersion":1,"reason":"Substituição revisada"}'::jsonb)$$,
  'replacement activates after impact validation'
);
select is((select processing_status from public.cms_media_assets where id='47000000-0000-4000-8000-000000000010'),'ready','physical source stays ready for v1 validator compatibility');
select is(public.cms_resolve_dam_asset('47000000-0000-4000-8000-000000000010'),'47000000-0000-4000-8000-000000000011'::uuid,'active replacement resolves the target without rewriting content');
select is(public.cms_dam_asset_publishable('47000000-0000-4000-8000-000000000010'),true,'a replaced source remains publishable through its valid target');
select throws_ok($$delete from public.cms_media_assets where id='47000000-0000-4000-8000-000000000011'$$,'23503','CMS_MEDIA_IN_USE','an active replacement target cannot be deleted');
select lives_ok(
  $$select pg_temp.execute_dam_command('rollback_replacement',jsonb_build_object('replacementId',(select id from public.cms_dam_replacements where source_asset_id='47000000-0000-4000-8000-000000000010' and status='active'),'expectedVersion',1,'reason','Reverter substituição'))$$,
  'replacement rollback is explicit and reversible'
);
select is(public.cms_resolve_dam_asset('47000000-0000-4000-8000-000000000010'),'47000000-0000-4000-8000-000000000010'::uuid,'rollback resolves the original identity again');
select is((select processing_status from public.cms_media_assets where id='47000000-0000-4000-8000-000000000010'),'ready','rollback restores the source readiness');
select lives_ok(
  $$select pg_temp.execute_dam_command('archive_asset','{"assetId":"47000000-0000-4000-8000-000000000011","expectedVersion":1,"reason":"Arquivar destino após rollback"}'::jsonb)$$,
  'a rolled-back replacement target can enter retention'
);
update public.cms_media_assets
set archived_at=now()-interval '31 days'
where id='47000000-0000-4000-8000-000000000011';
update public.cms_dam_gc_jobs
set execute_after=now()-interval '1 minute'
where asset_id='47000000-0000-4000-8000-000000000011';
select lives_ok(
  $$select public.cms_prepare_dam_gc((select id from public.cms_dam_gc_jobs where asset_id='47000000-0000-4000-8000-000000000011'))$$,
  'GC can collect a target retained only by rolled-back history'
);
select is((select count(*)::integer from public.cms_media_assets where id='47000000-0000-4000-8000-000000000011'),0,'collected replacement target leaves no live asset row');
select is((select count(*)::integer from public.cms_dam_replacements where target_asset_id='47000000-0000-4000-8000-000000000011' and status='rolled_back'),1,'replacement history survives target collection');

select lives_ok(
  $$insert into public.cms_published_projection(item_id,revision_id,content_type,slug,schema_version,consumer_id,renderer_key,payload,seo,content_version,cache_tag,etag,published_at)
    values('47000000-0000-4000-8000-000000000030','47000000-0000-4000-8000-000000000031','post','dam-g5',1,(select consumer_id from public.cms_capability_registry order by consumer_id limit 1),'fixture','{"title":"DAM G5","media":[{"assetId":"47000000-0000-4000-8000-000000000010"}]}'::jsonb,'{}',1,'cms:post:47000000-0000-4000-8000-000000000030','"'||repeat('a',64)||'"',now())$$,
  'valid rights allow a new public projection'
);
select throws_ok(
  $$update public.cms_published_projection set payload='{"title":"DAM G5","media":[{"assetId":"47000000-0000-4000-8000-000000000012"}]}'::jsonb where item_id='47000000-0000-4000-8000-000000000030'$$,
  '23514','CMS_DAM_RIGHTS_OR_ASSET_INVALID:47000000-0000-4000-8000-000000000012','expired rights block publication'
);

select lives_ok(
  $$select pg_temp.execute_dam_command('archive_asset','{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":3,"reason":"Arquivar com retenção"}'::jsonb)$$,
  'an unused asset can be archived'
);
select ok((select execute_after > now()+interval '29 days' from public.cms_dam_gc_jobs where asset_id='47000000-0000-4000-8000-000000000013' and status='pending'),'archival schedules GC only after retained recovery');
select throws_ok($$delete from public.cms_media_assets where id='47000000-0000-4000-8000-000000000013'$$,'23503','CMS_DAM_RETENTION_ACTIVE','physical deletion is blocked during retention');
select lives_ok(
  $$select pg_temp.execute_dam_command('restore_asset','{"assetId":"47000000-0000-4000-8000-000000000013","expectedVersion":4,"reason":"Restaurar na retenção"}'::jsonb)$$,
  'an archived asset can be restored during retention'
);
select is((select status from public.cms_dam_gc_jobs where asset_id='47000000-0000-4000-8000-000000000013'),'canceled','restore cancels pending GC');
select throws_ok($$delete from public.cms_dam_events where asset_id='47000000-0000-4000-8000-000000000013'$$,'42501','CMS audit records are immutable','DAM audit events are immutable');
select is((select count(*)::integer from public.cms_dam_collection_assets link left join public.cms_media_assets asset on asset.id=link.asset_id where asset.id is null),0,'collection links have no orphan asset');
select is((select count(*)::integer from public.cms_dam_asset_tags link left join public.cms_media_assets asset on asset.id=link.asset_id left join public.cms_dam_tags tag on tag.id=link.tag_id where asset.id is null or tag.id is null),0,'tag links have no orphan reference');
select is((select count(*)::integer from public.cms_dam_crops crop left join public.cms_media_assets asset on asset.id=crop.asset_id where asset.id is null),0,'crops have no orphan asset');

select * from finish();
rollback;
