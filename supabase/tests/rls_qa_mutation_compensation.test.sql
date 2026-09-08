begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(66);

select has_table(
  'private',
  'cms_qa_global_mutation_journal',
  'the persistent private global-mutation journal exists'
);
select has_table(
  'private',
  'cms_qa_global_mutation_revisions',
  'QA singleton revisions have a private immutable association'
);
select has_trigger(
  'public',
  'cms_content_items',
  'cms_qa_global_item_before_mutation',
  'the content item is captured before its first QA mutation'
);
select has_trigger(
  'public',
  'cms_content_drafts',
  'cms_qa_global_draft_before_mutation',
  'the draft is captured before its first QA mutation'
);
select has_trigger(
  'public',
  'cms_published_projection',
  'cms_qa_global_projection_before_mutation',
  'the public projection is captured before its first QA mutation'
);
select has_trigger(
  'public',
  'cms_publications',
  'cms_qa_global_publication_before_mutation',
  'the live publication pointer is captured before its first QA mutation'
);
select has_trigger(
  'public',
  'cms_content_revisions',
  'cms_qa_global_revision_track',
  'QA revisions are associated with the captured baseline'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'cms_prepare_qa_actor_terminal_compensation',
  'compensation runs before an active lease becomes terminal'
);
select isnt(
  has_table_privilege('anon', 'private.cms_qa_global_mutation_journal', 'SELECT'),
  true,
  'anonymous callers cannot inspect baseline payloads'
);
select isnt(
  has_table_privilege('service_role', 'private.cms_qa_global_mutation_journal', 'SELECT'),
  true,
  'even the API service role cannot read the private payload journal directly'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '64000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-owner@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}', now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-death@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-dddddddd","candidateSha":"dddddddddddddddddddddddddddddddddddddddd","environment":"staging"}',
    now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-restored@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-eeeeeeee","candidateSha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","environment":"staging"}',
    now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-conflict@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-ffffffff","candidateSha":"ffffffffffffffffffffffffffffffffffffffff","environment":"staging"}',
    now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-dam-conflict@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-pim-conflict@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',
    now(), now()
  ),
  (
    '64000000-0000-4000-8000-000000000007',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-0064-master-conflict@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-cccccccc","candidateSha":"cccccccccccccccccccccccccccccccccccccccc","environment":"staging"}',
    now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status)
values
  ('64000000-0000-4000-8000-000000000001', 'QA 0064 baseline owner', 'active'),
  ('64000000-0000-4000-8000-000000000002', 'QA 0064 simulated death', 'active'),
  ('64000000-0000-4000-8000-000000000003', 'QA 0064 manual restore', 'active'),
  ('64000000-0000-4000-8000-000000000004', 'QA 0064 external conflict', 'active'),
  ('64000000-0000-4000-8000-000000000005', 'QA 0064 DAM conflict', 'active'),
  ('64000000-0000-4000-8000-000000000006', 'QA 0064 PIM conflict', 'active'),
  ('64000000-0000-4000-8000-000000000007', 'QA 0064 master-data conflict', 'active');

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by
) values
  (
    '64000000-0000-4000-8000-000000000101', 'navigation', 'site-navigation', 'published',
    '64000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001'
  ),
  (
    '64000000-0000-4000-8000-000000000102', 'site_settings', 'site-settings', 'published',
    '64000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001'
  );

insert into public.cms_content_drafts (
  item_id, schema_version, payload, seo, provenance, lock_version, updated_by
) values
  (
    '64000000-0000-4000-8000-000000000101', 1,
    '{"items":[],"marker":"navigation-baseline"}', '{}',
    '[{"rightsConfirmed":true}]', 1, '64000000-0000-4000-8000-000000000001'
  ),
  (
    '64000000-0000-4000-8000-000000000102', 1,
    '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    '{}', '[{"rightsConfirmed":true}]', 1, '64000000-0000-4000-8000-000000000001'
  );

insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values
  (
    '64000000-0000-4000-8000-000000000201',
    '64000000-0000-4000-8000-000000000101', 1, 1,
    '{"items":[],"marker":"navigation-baseline"}', '{}',
    '[{"rightsConfirmed":true}]', 1, 'Baseline navigation before QA',
    '64000000-0000-4000-8000-000000000001'
  ),
  (
    '64000000-0000-4000-8000-000000000210',
    '64000000-0000-4000-8000-000000000102', 1, 1,
    '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    '{}', '[{"rightsConfirmed":true}]', 1, 'Baseline settings before QA',
    '64000000-0000-4000-8000-000000000001'
  );

insert into public.cms_published_projection (
  item_id, revision_id, content_type, slug, schema_version, consumer_id,
  renderer_key, payload, seo, content_version, cache_tag, etag, published_at
) values
  (
    '64000000-0000-4000-8000-000000000101', '64000000-0000-4000-8000-000000000201',
    'navigation', 'site-navigation', 1, 'cms.site-navigation.v1', 'site-navigation',
    '{"items":[],"marker":"navigation-baseline"}', '{}', 1,
    'cms:navigation:64000000-0000-4000-8000-000000000101',
    '"' || repeat('1', 64) || '"', now()
  ),
  (
    '64000000-0000-4000-8000-000000000102', '64000000-0000-4000-8000-000000000210',
    'site_settings', 'site-settings', 1, 'cms.site-settings.v1', 'site-settings',
    '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    '{}', 1, 'cms:site_settings:64000000-0000-4000-8000-000000000102',
    '"' || repeat('2', 64) || '"', now()
  );

insert into public.cms_publications (
  item_id, revision_id, cache_tag, published_by
) values
  (
    '64000000-0000-4000-8000-000000000101', '64000000-0000-4000-8000-000000000201',
    'cms:navigation:64000000-0000-4000-8000-000000000101',
    '64000000-0000-4000-8000-000000000001'
  ),
  (
    '64000000-0000-4000-8000-000000000102', '64000000-0000-4000-8000-000000000210',
    'cms:site_settings:64000000-0000-4000-8000-000000000102',
    '64000000-0000-4000-8000-000000000001'
  );

-- First scenario: the runner dies after the QA state reached the public projection.
update public.cms_content_drafts
set payload = '{"items":[],"marker":"navigation-qa-published"}',
    lock_version = lock_version + 1,
    updated_by = '64000000-0000-4000-8000-000000000002'
where item_id = '64000000-0000-4000-8000-000000000101';
update public.cms_content_items
set updated_by = '64000000-0000-4000-8000-000000000002'
where id = '64000000-0000-4000-8000-000000000101';
insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values (
  '64000000-0000-4000-8000-000000000202',
  '64000000-0000-4000-8000-000000000101', 2, 1,
  '{"items":[],"marker":"navigation-qa-published"}', '{}',
  '[{"rightsConfirmed":true}]', 2, 'QA publication interrupted after commit',
  '64000000-0000-4000-8000-000000000002'
);
update public.cms_published_projection
set revision_id = '64000000-0000-4000-8000-000000000202',
    payload = '{"items":[],"marker":"navigation-qa-published"}',
    content_version = 2,
    etag = '"' || repeat('3', 64) || '"',
    published_at = now()
where item_id = '64000000-0000-4000-8000-000000000101';
update public.cms_publications
set revision_id = '64000000-0000-4000-8000-000000000202',
    published_by = '64000000-0000-4000-8000-000000000002',
    published_at = now()
where item_id = '64000000-0000-4000-8000-000000000101';

select is(
  (select count(*)::integer from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000002'
     and item_id = '64000000-0000-4000-8000-000000000101'),
  1,
  'the baseline was captured exactly once before the first singleton mutation'
);
select matches(
  (select baseline_state_hash from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000002'),
  '^[0-9a-f]{64}$',
  'the private baseline has a deterministic integrity hash'
);
select is(
  (select count(*)::integer from private.cms_qa_global_mutation_revisions
   where actor_id = '64000000-0000-4000-8000-000000000002'),
  1,
  'the interrupted QA revision is tracked without duplicating its payload'
);

-- Active residues from every mutable synthetic domain are intentionally left
-- behind to prove that the lease transition, rather than browser finally, heals them.
insert into public.cms_media_assets (
  id, storage_path, original_filename, declared_mime, detected_mime, byte_size,
  sha256, width, height, processing_status, scan_status, scan_engine,
  source_kind, source_reference, rights_confirmed, license_name, owner_name,
  alt_text, created_by
) values (
  '64000000-0000-4000-8000-000000000301',
  'cms/64000000-0000-4000-8000-000000000301/original.png',
  'qa-0064.png', 'image/png', 'image/png', 64, repeat('6', 64), 1, 1,
  'ready', 'clean', 'qa-signature-v1', 'synthetic_test',
  'QA-CMS-FINAL-20260907-dddddddd', true, 'Synthetic QA', 'GAIATEC QA',
  'QA compensation fixture', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_dam_collections (
  id, name, normalized_name, description, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000302', 'QA 0064 collection',
  'qa-0064-collection', 'Synthetic compensation fixture',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);

insert into public.cms_media_assets (
  id, storage_path, original_filename, declared_mime, detected_mime, byte_size,
  sha256, width, height, processing_status, scan_status, scan_engine,
  source_kind, source_reference, rights_confirmed, license_name, owner_name,
  alt_text, created_by
) values (
  '64000000-0000-4000-8000-000000000303',
  'cms/64000000-0000-4000-8000-000000000303/original.png',
  'ordinary-owner.png', 'image/png', 'image/png', 64, repeat('7', 64), 1, 1,
  'ready', 'clean', 'ordinary-signature-v1', 'owner_authored',
  'Ordinary external asset', true, 'Owned media', 'GAIATEC',
  'Ordinary external asset', '64000000-0000-4000-8000-000000000001'
);
insert into public.cms_dam_tags (id, name, normalized_name, created_by)
values
  (
    '64000000-0000-4000-8000-000000000304', 'QA orphan tag 0064',
    'qa-orphan-tag-0064', '64000000-0000-4000-8000-000000000002'
  ),
  (
    '64000000-0000-4000-8000-000000000305', 'QA shared tag 0064',
    'qa-shared-tag-0064', '64000000-0000-4000-8000-000000000002'
  );
insert into public.cms_dam_collection_assets (collection_id, asset_id, created_by)
values (
  '64000000-0000-4000-8000-000000000302',
  '64000000-0000-4000-8000-000000000301',
  '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_dam_asset_tags (asset_id, tag_id, created_by)
values
  (
    '64000000-0000-4000-8000-000000000301',
    '64000000-0000-4000-8000-000000000304',
    '64000000-0000-4000-8000-000000000002'
  ),
  (
    '64000000-0000-4000-8000-000000000301',
    '64000000-0000-4000-8000-000000000305',
    '64000000-0000-4000-8000-000000000002'
  );
select throws_ok(
  $$
    insert into public.cms_dam_asset_tags (asset_id, tag_id, created_by)
    values (
      '64000000-0000-4000-8000-000000000303',
      '64000000-0000-4000-8000-000000000305',
      '64000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'CMS_QA_CROSS_SCOPE_MUTATION_FORBIDDEN',
  'an ordinary asset cannot adopt a tag owned by an active QA lease'
);
insert into public.cms_dam_crops (
  id, asset_id, crop_key, label, aspect_width, aspect_height,
  crop_x, crop_y, crop_width, crop_height, focal_x, focal_y,
  created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000306',
  '64000000-0000-4000-8000-000000000301',
  'qa-0064-square', 'QA square crop', 1, 1,
  0, 0, 1, 1, 0.5, 0.5,
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, source_type, source_ref,
  created_by, updated_by
) values
  (
    '64000000-0000-4000-8000-000000000401', 'manufacturer', 'QA Manufacturer 0064',
    'qa manufacturer 0064', 'manual', 'QA-CMS-FINAL-20260907-dddddddd',
    '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
  ),
  (
    '64000000-0000-4000-8000-000000000402', 'category', 'QA Category 0064',
    'qa category 0064', 'manual', 'QA-CMS-FINAL-20260907-dddddddd',
    '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
  ),
  (
    '64000000-0000-4000-8000-000000000403', 'monitored_element', 'QA Element 0064',
    'qa element 0064', 'manual', 'QA-CMS-FINAL-20260907-dddddddd',
    '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
  );
insert into public.cms_master_compatibilities (
  id, relation_type, source_entity_id, target_entity_id, source_type, source_ref,
  created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000404', 'category_monitored_element',
  '64000000-0000-4000-8000-000000000402', '64000000-0000-4000-8000-000000000403',
  'manual', 'QA-CMS-FINAL-20260907-dddddddd',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_master_entity_aliases (
  id, entity_id, site_key, entity_type, alias, normalized_alias,
  created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000405',
  '64000000-0000-4000-8000-000000000401', 'main', 'manufacturer',
  'QA Manufacturer Alias 0064', 'qa manufacturer alias 0064',
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);

-- Test-only fixture mode for the pre-0078 PIM rows exercised by the terminal
-- compensator. The tombstone accepts this value only from the database owner
-- (session_user=current_user), never through a runtime-granted RPC.
select set_config('cms.pim_consolidating', '0078', true);
insert into public.cms_pim_products (
  id, name, normalized_name, slug, manufacturer_id, category_id, status,
  source_type, source_ref, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000501', 'QA PIM 0064', 'qa pim 0064',
  'qa-pim-0064', '64000000-0000-4000-8000-000000000401',
  '64000000-0000-4000-8000-000000000402', 'active', 'manual',
  'QA-CMS-FINAL-20260907-dddddddd',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_product_master_links (
  id, product_id, dimension, entity_id, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000505', '64000000-0000-4000-8000-000000000501',
  'monitored_element', '64000000-0000-4000-8000-000000000403',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_models (
  id, product_id, manufacturer_id, name, normalized_name, mpn, normalized_mpn,
  status, is_primary, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000502', '64000000-0000-4000-8000-000000000501',
  '64000000-0000-4000-8000-000000000401', 'QA Model 0064', 'qa model 0064',
  'QA-MPN-0064', 'qa mpn 0064', 'active', true,
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_variants (
  id, product_id, model_id, name, code, axes, status, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000503', '64000000-0000-4000-8000-000000000501',
  '64000000-0000-4000-8000-000000000502', 'QA Variant 0064', 'QA-0064',
  '[{"axisKey":"range","optionKey":"qa"}]', 'active',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_skus (
  id, product_id, model_id, variant_id, sku, status, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000504', '64000000-0000-4000-8000-000000000501',
  '64000000-0000-4000-8000-000000000502', '64000000-0000-4000-8000-000000000503',
  'GAI-QA-0064', 'active',
  '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_attribute_sets (
  id, category_id, name, status, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000506',
  '64000000-0000-4000-8000-000000000402',
  'QA attribute set 0064', 'active',
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_attribute_set_versions (
  id, attribute_set_id, version, status, created_by
) values (
  '64000000-0000-4000-8000-000000000507',
  '64000000-0000-4000-8000-000000000506',
  1, 'draft', '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_units (
  code, label, symbol, dimension_key, canonical_code,
  factor_to_canonical, created_by, updated_by
) values (
  'QA0064', 'QA unit 0064', 'qa', 'qa_dimension', 'QA0064', 1,
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_attribute_definitions (
  id, attribute_key, label, data_type, canonical_unit_code,
  created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000508', 'qa_attribute_0064',
  'QA attribute 0064', 'decimal', 'QA0064',
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_attribute_set_definitions (
  attribute_set_version_id, definition_id, required, position
) values (
  '64000000-0000-4000-8000-000000000507',
  '64000000-0000-4000-8000-000000000508', true, 0
);
insert into public.cms_pim_attribute_values (
  id, product_id, definition_id, owner_scope, owner_id, value, unit_code,
  canonical_min, canonical_max, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000509',
  '64000000-0000-4000-8000-000000000501',
  '64000000-0000-4000-8000-000000000508', 'product',
  '64000000-0000-4000-8000-000000000501', '{"value":1}', 'QA0064',
  1, 1,
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);
insert into public.cms_pim_external_identifiers (
  id, product_id, owner_type, owner_id, identifier_kind,
  identifier_value, normalized_value, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000510',
  '64000000-0000-4000-8000-000000000501', 'product',
  '64000000-0000-4000-8000-000000000501', 'erp',
  'QA-ERP-0064', 'qa-erp-0064',
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000002'
);
select set_config('cms.pim_consolidating', 'off', true);

update private.cms_qa_actor_leases
set status = 'expired', swept_at = now()
where actor_id = '64000000-0000-4000-8000-000000000002';

select is(
  (select status from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000002'),
  'restored',
  'a simulated runner death restores the exact persistent baseline by CAS'
);
select is(
  private.cms_qa_global_state_hash('64000000-0000-4000-8000-000000000101'),
  (select baseline_state_hash from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000002'),
  'the restored item, draft, projection and publication equal the full snapshot hash'
);
select is(
  (select payload ->> 'marker' from public.cms_content_drafts
   where item_id = '64000000-0000-4000-8000-000000000101'),
  'navigation-baseline',
  'the original global draft payload is restored'
);
select is(
  (select payload ->> 'marker' from public.cms_published_projection
   where item_id = '64000000-0000-4000-8000-000000000101'),
  'navigation-baseline',
  'the original public singleton projection is restored'
);
select is(
  (select revision_id from public.cms_publications
   where item_id = '64000000-0000-4000-8000-000000000101'),
  '64000000-0000-4000-8000-000000000201'::uuid,
  'the original publication pointer is restored'
);
select is(
  (select updated_by from public.cms_content_items
   where id = '64000000-0000-4000-8000-000000000101'),
  '64000000-0000-4000-8000-000000000001'::uuid,
  'the singleton owner metadata returns to the captured baseline'
);
select ok(
  (select archived_at is not null from public.cms_media_assets
   where id = '64000000-0000-4000-8000-000000000301'),
  'an active synthetic DAM asset is archived, not deleted'
);
select ok(
  exists(
    select 1
    from public.cms_dam_gc_jobs job
    join public.cms_media_assets asset on asset.id = job.asset_id
    where job.asset_id = '64000000-0000-4000-8000-000000000301'
      and job.status = 'pending'
      and job.execute_after = asset.archived_at + interval '30 days'
      and job.asset_snapshot ->> 'storagePath' = asset.storage_path
  ),
  'an idempotent retention job makes archived QA storage eligible for eventual GC'
);
select is(
  (select status from public.cms_dam_collections
   where id = '64000000-0000-4000-8000-000000000302'),
  'archived',
  'an active synthetic DAM collection is archived'
);
select is(
  (select count(*)::integer from public.cms_dam_collection_assets
   where asset_id = '64000000-0000-4000-8000-000000000301'),
  0,
  'collection joins for a synthetic asset are removed'
);
select is(
  (select count(*)::integer from public.cms_dam_asset_tags
   where asset_id = '64000000-0000-4000-8000-000000000301'),
  0,
  'tag joins for a synthetic asset are removed'
);
select is(
  (select count(*)::integer from public.cms_dam_crops
   where asset_id = '64000000-0000-4000-8000-000000000301'),
  0,
  'crops for a synthetic asset are removed'
);
select is(
  (select count(*)::integer from public.cms_dam_tags
   where id = '64000000-0000-4000-8000-000000000304'),
  0,
  'a QA-created tag is removed only after becoming orphaned'
);
select is(
  (select count(*)::integer from public.cms_dam_tags
   where id = '64000000-0000-4000-8000-000000000305'),
  0,
  'the second QA-created tag is removed after cross-scope adoption was rejected'
);
select ok(
  (select archived_at is null from public.cms_media_assets
   where id = '64000000-0000-4000-8000-000000000303'),
  'the external asset linked to the shared tag is untouched'
);
select is(
  (select count(*)::integer from public.cms_dam_events
   where actor_id = '64000000-0000-4000-8000-000000000002'
     and event_type in ('qa_relationships_detached', 'qa_orphan_tag_removed')),
  3,
  'relationship and orphan-tag cleanup retains sanitized immutable DAM events'
);
select is(
  (select status from public.cms_pim_products
   where id = '64000000-0000-4000-8000-000000000501'),
  'archived',
  'the synthetic PIM product is archived without deletion'
);
select is(
  (select status from public.cms_pim_models
   where id = '64000000-0000-4000-8000-000000000502'),
  'discontinued',
  'the synthetic PIM model leaves the active graph'
);
select is(
  (select status from public.cms_pim_variants
   where id = '64000000-0000-4000-8000-000000000503'),
  'discontinued',
  'the synthetic PIM variant leaves the active graph'
);
select is(
  (select status from public.cms_pim_skus
   where id = '64000000-0000-4000-8000-000000000504'),
  'retired',
  'the synthetic PIM SKU is retained as retired history'
);
select is(
  (select status from public.cms_pim_product_master_links
   where id = '64000000-0000-4000-8000-000000000505'),
  'inactive',
  'the synthetic PIM master-data link is inactivated'
);
select is(
  (
    (select count(*) from public.cms_pim_external_identifiers
     where created_by = '64000000-0000-4000-8000-000000000002')
    + (select count(*) from public.cms_pim_units where code = 'QA0064')
    + (select count(*) from public.cms_pim_attribute_definitions
       where id = '64000000-0000-4000-8000-000000000508')
    + (select count(*) from public.cms_pim_attribute_sets
       where id = '64000000-0000-4000-8000-000000000506')
    + (select count(*) from public.cms_pim_attribute_set_versions
       where id = '64000000-0000-4000-8000-000000000507')
    + (select count(*) from public.cms_pim_attribute_values
       where id = '64000000-0000-4000-8000-000000000509')
    + (select count(*) from public.cms_master_entity_aliases
       where id = '64000000-0000-4000-8000-000000000405')
  )::integer,
  0,
  'synthetic global natural-key holders are removed without deleting audit history'
);
select is(
  (select count(*)::integer from public.cms_master_entities
   where id in (
     '64000000-0000-4000-8000-000000000401',
     '64000000-0000-4000-8000-000000000402',
     '64000000-0000-4000-8000-000000000403'
   ) and status = 'inactive'),
  3,
  'all active synthetic master-data entities are retained as inactive history'
);
select is(
  (select status from public.cms_master_compatibilities
   where id = '64000000-0000-4000-8000-000000000404'),
  'inactive',
  'synthetic master-data compatibility is inactivated'
);
select is(
  (select count(*)::integer from public.cms_audit_log
   where actor_id = '64000000-0000-4000-8000-000000000002'
     and action = 'cms:qa.global_snapshot_compensated'),
  1,
  'global compensation appends immutable sanitized evidence'
);
select is(
  (select count(*)::integer from public.cms_audit_log
   where actor_id = '64000000-0000-4000-8000-000000000002'
     and action = 'cms:qa.domain_residue_compensated'),
  1,
  'domain residue compensation appends one sanitized summary'
);
select isnt(
  exists(
    select 1 from public.cms_audit_log audit
    where audit.actor_id = '64000000-0000-4000-8000-000000000002'
      and audit.action like 'cms:qa.%'
      and (audit.event_data ? 'payload' or audit.event_data ? 'baseline')
  ),
  true,
  'no baseline payload is copied into the public audit trail'
);

-- Second scenario: a manual UI restore produced a new immutable revision but
-- returned every public logical field to baseline. The trigger recognizes it
-- and does not rewrite the new restore revision.
update public.cms_content_drafts
set payload = '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"qa-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-qa"}',
    lock_version = 2,
    updated_by = '64000000-0000-4000-8000-000000000003'
where item_id = '64000000-0000-4000-8000-000000000102';
insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values
  (
    '64000000-0000-4000-8000-000000000211',
    '64000000-0000-4000-8000-000000000102', 2, 1,
    '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"qa-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-qa"}',
    '{}', '[{"rightsConfirmed":true}]', 2, 'QA settings publication',
    '64000000-0000-4000-8000-000000000003'
  ),
  (
    '64000000-0000-4000-8000-000000000212',
    '64000000-0000-4000-8000-000000000102', 3, 1,
    '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    '{}', '[{"rightsConfirmed":true}]', 3, 'QA manual baseline restore',
    '64000000-0000-4000-8000-000000000003'
  );
update public.cms_content_drafts
set payload = '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    lock_version = 3,
    updated_by = '64000000-0000-4000-8000-000000000003'
where item_id = '64000000-0000-4000-8000-000000000102';
update public.cms_published_projection
set revision_id = '64000000-0000-4000-8000-000000000212',
    payload = '{"company":{"name":"GAIATEC","email":"cms@example.test","phone":"baseline-phone","whatsapp":"","address":""},"defaultCta":{"href":"/contato"},"socialLinks":[],"marker":"settings-baseline"}',
    content_version = 3,
    etag = '"' || repeat('4', 64) || '"',
    published_at = now()
where item_id = '64000000-0000-4000-8000-000000000102';
update public.cms_publications
set revision_id = '64000000-0000-4000-8000-000000000212',
    published_by = '64000000-0000-4000-8000-000000000003',
    published_at = now()
where item_id = '64000000-0000-4000-8000-000000000102';
update public.cms_content_items
set workflow_status = 'published',
    scheduled_for = null,
    archived_at = null,
    updated_by = '64000000-0000-4000-8000-000000000003'
where id = '64000000-0000-4000-8000-000000000102';

select set_config(
  'cms.qa_mutation_actor_id',
  '64000000-0000-4000-8000-000000000001',
  true
);
update private.cms_qa_actor_leases
set status = 'cleaned', cleaned_at = now()
where actor_id = '64000000-0000-4000-8000-000000000003';

select is(
  current_setting('cms.qa_mutation_actor_id', true),
  '64000000-0000-4000-8000-000000000001',
  'terminal collaboration cleanup restores the caller mutation actor context'
);

select is(
  (select status from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000003'),
  'baseline_present',
  'a logical baseline already restored through the UI is recognized'
);
select is(
  (select revision_id from public.cms_publications
   where item_id = '64000000-0000-4000-8000-000000000102'),
  '64000000-0000-4000-8000-000000000212'::uuid,
  'recognition does not replace the immutable manual restore revision'
);
select is(
  (select count(*)::integer from private.cms_qa_global_mutation_revisions
   where actor_id = '64000000-0000-4000-8000-000000000003'),
  2,
  'both the QA publication and manual restore revisions remain tracked'
);
select is(
  (select count(*)::integer from public.cms_publication_outbox
   where item_id = '64000000-0000-4000-8000-000000000102'
     and revision_id = '64000000-0000-4000-8000-000000000212'
     and event_type = 'restore'
     and status = 'pending'),
  1,
  'baseline recognition still requeues deterministic public cache invalidation'
);

-- Third scenario: after QA writes, a real operator changes the same singleton.
-- The terminal transition must fail and preserve the real operator's state.
update public.cms_content_drafts
set payload = '{"items":[],"marker":"navigation-second-qa"}',
    lock_version = lock_version + 1,
    updated_by = '64000000-0000-4000-8000-000000000004'
where item_id = '64000000-0000-4000-8000-000000000101';
update public.cms_content_items
set workflow_status = 'archived',
    archived_at = now(),
    updated_by = '64000000-0000-4000-8000-000000000004'
where id = '64000000-0000-4000-8000-000000000101';
select is(
  (select status from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000004'),
  'active',
  'nested publication and projection deletes inherit the exact QA actor'
);
update public.cms_content_drafts
set payload = '{"items":[],"marker":"external-operator"}',
    lock_version = lock_version + 1,
    updated_by = '64000000-0000-4000-8000-000000000001'
where item_id = '64000000-0000-4000-8000-000000000101';

select is(
  (select status from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000004'),
  'external_conflict',
  'the row trigger persistently marks a concurrent external mutation'
);
select is(
  (select count(*)::integer from public.cms_audit_log
   where actor_id = '64000000-0000-4000-8000-000000000004'
     and action = 'cms:qa.global_external_conflict_detected'),
  1,
  'the conflict has sanitized immutable evidence without the external payload'
);
select throws_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = now()
    where actor_id = '64000000-0000-4000-8000-000000000004'$$,
  '40001',
  'CMS_QA_GLOBAL_EXTERNAL_CONFLICT:64000000-0000-4000-8000-000000000101',
  'CAS compensation fails explicitly instead of overwriting an external operator'
);
select is(
  (select status from private.cms_qa_actor_leases
   where actor_id = '64000000-0000-4000-8000-000000000004'),
  'active',
  'a conflicted lease remains open for explicit operator resolution'
);
select is(
  (select payload ->> 'marker' from public.cms_content_drafts
   where item_id = '64000000-0000-4000-8000-000000000101'),
  'external-operator',
  'the external operator state is left byte-for-byte untouched'
);
select is(
  (select conflict_table from private.cms_qa_global_mutation_journal
   where actor_id = '64000000-0000-4000-8000-000000000004'),
  'cms_content_drafts',
  'the private journal records only the conflicting surface, not its payload'
);
select is(
  (select count(*)::integer from public.cms_media_assets
   where id = '64000000-0000-4000-8000-000000000301'),
  1,
  'DAM cleanup archives and retains its governed record'
);
select is(
  (select count(*)::integer from public.cms_pim_products
   where id = '64000000-0000-4000-8000-000000000501'),
  1,
  'PIM cleanup archives and retains its governed record'
);
select is(
  (select count(*)::integer from public.cms_master_entities
   where id = '64000000-0000-4000-8000-000000000401'),
  1,
  'master-data cleanup inactivates and retains its governed record'
);
select is(
  (select status from private.cms_qa_actor_leases
   where actor_id = '64000000-0000-4000-8000-000000000002'),
  'expired',
  'the simulated-death lease reaches its terminal state only after compensation'
);

-- Domain CAS: ordinary-operator adoption blocks terminal compensation and
-- leaves both the governed row and the lease untouched.
insert into public.cms_media_assets (
  id, storage_path, original_filename, declared_mime, detected_mime, byte_size,
  sha256, width, height, processing_status, scan_status, scan_engine,
  source_kind, source_reference, rights_confirmed, license_name, owner_name,
  alt_text, created_by
) values (
  '64000000-0000-4000-8000-000000000307',
  'cms/64000000-0000-4000-8000-000000000307/original.png',
  'qa-dam-conflict.png', 'image/png', 'image/png', 64, repeat('8', 64), 1, 1,
  'ready', 'clean', 'qa-signature-v1', 'synthetic_test',
  'QA-CMS-FINAL-20260907-aaaaaaaa', true, 'Synthetic QA', 'GAIATEC QA',
  'QA DAM conflict fixture', '64000000-0000-4000-8000-000000000005'
);
insert into public.cms_dam_collections (
  id, name, normalized_name, description, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000308', 'Ordinary collection 0064',
  'ordinary-collection-0064', 'Ordinary operator collection',
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000001'
);
insert into public.cms_dam_collection_assets (collection_id, asset_id, created_by)
values (
  '64000000-0000-4000-8000-000000000308',
  '64000000-0000-4000-8000-000000000307',
  '64000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = now()
    where actor_id = '64000000-0000-4000-8000-000000000005'$$,
  '40001',
  'CMS_QA_DAM_EXTERNAL_CONFLICT',
  'an external DAM relationship aborts cleanup before the synthetic asset is archived'
);
select ok(
  (select archived_at is null from public.cms_media_assets
   where id = '64000000-0000-4000-8000-000000000307'),
  'the externally adopted DAM asset remains untouched'
);
select is(
  (select status from private.cms_qa_actor_leases
   where actor_id = '64000000-0000-4000-8000-000000000005'),
  'active',
  'the DAM-conflicted lease stays active for operator resolution'
);

-- Construct an intentionally cross-owner historical row under the same
-- owner-only fixture fence. The following terminal transition must still
-- reject it as an external conflict and leave both row and lease untouched.
select set_config('cms.pim_consolidating', '0078', true);
select set_config('cms.qa_compensating', 'on', true);
insert into public.cms_pim_products (
  id, name, normalized_name, slug, manufacturer_id, category_id, status,
  source_type, source_ref, created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000508', 'QA PIM conflict 0064',
  'qa pim conflict 0064', 'qa-pim-conflict-0064',
  '64000000-0000-4000-8000-000000000401',
  '64000000-0000-4000-8000-000000000402', 'active', 'manual',
  'QA-CMS-FINAL-20260907-bbbbbbbb',
  '64000000-0000-4000-8000-000000000006',
  '64000000-0000-4000-8000-000000000001'
);
select set_config('cms.qa_compensating', 'off', true);
select set_config('cms.pim_consolidating', 'off', true);
select throws_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = now()
    where actor_id = '64000000-0000-4000-8000-000000000006'$$,
  '40001',
  'CMS_QA_PIM_EXTERNAL_CONFLICT',
  'an externally edited PIM product aborts cleanup without overwriting it'
);
select is(
  (select status from public.cms_pim_products
   where id = '64000000-0000-4000-8000-000000000508'),
  'active',
  'the externally edited PIM product remains active and untouched'
);
select is(
  (select status from private.cms_qa_actor_leases
   where actor_id = '64000000-0000-4000-8000-000000000006'),
  'active',
  'the PIM-conflicted lease stays active for operator resolution'
);

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, source_type, source_ref,
  created_by, updated_by
) values (
  '64000000-0000-4000-8000-000000000405', 'brand', 'QA adopted brand 0064',
  'qa adopted brand 0064', 'manual', 'QA-CMS-FINAL-20260907-cccccccc',
  '64000000-0000-4000-8000-000000000007',
  '64000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = now()
    where actor_id = '64000000-0000-4000-8000-000000000007'$$,
  '40001',
  'CMS_QA_MASTER_EXTERNAL_CONFLICT',
  'an externally edited master-data entity aborts cleanup without overwriting it'
);
select is(
  (select status from public.cms_master_entities
   where id = '64000000-0000-4000-8000-000000000405'),
  'active',
  'the externally edited master-data entity remains active and untouched'
);
select is(
  (select status from private.cms_qa_actor_leases
   where actor_id = '64000000-0000-4000-8000-000000000007'),
  'active',
  'the master-data-conflicted lease stays active for operator resolution'
);

select * from finish();
rollback;
