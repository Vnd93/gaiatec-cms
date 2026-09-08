begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(56);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '57000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'documents.operator@example.test', '', now(), '{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',
  now(), now()
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '57000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'documents.reviewer@example.test', '', now(), '{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',
  now(), now()
);
insert into public.cms_profiles(user_id, display_name, display_email, status)
values('57000000-0000-4000-8000-000000000001', 'Operador de documentos', 'documents.operator@example.test', 'active');
insert into public.cms_profiles(user_id, display_name, display_email, status)
values('57000000-0000-4000-8000-000000000002', 'Revisor de segurança', 'documents.reviewer@example.test', 'active');
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '57000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'documents.corporate@example.test', '', now(), '{}', '{}',
  now(), now()
);
insert into public.cms_profiles(user_id, display_name, display_email, status)
values('57000000-0000-4000-8000-000000000003', 'Operador corporativo', 'documents.corporate@example.test', 'active');
insert into public.cms_user_roles(user_id, role_key)
values('57000000-0000-4000-8000-000000000001', 'super_admin');
insert into public.cms_user_roles(user_id, role_key)
values('57000000-0000-4000-8000-000000000002', 'reviewer');

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_document_assets'::regclass,
    'public.cms_document_command_receipts'::regclass,
    'public.cms_document_security_reviews'::regclass
  ) and relrowsecurity),
  3,
  'document tables enforce RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_document_assets', 'SELECT'), true,
  'anonymous clients cannot list private documents');
select isnt(has_table_privilege('authenticated', 'public.cms_document_assets', 'SELECT'), true,
  'authenticated clients cannot list private documents directly');
select isnt(has_table_privilege('authenticated', 'public.cms_document_assets', 'INSERT'), true,
  'authenticated clients cannot bypass the upload boundary');
select isnt(has_table_privilege('authenticated', 'public.cms_document_assets', 'UPDATE'), true,
  'authenticated clients cannot forge finalized metadata');
select isnt(has_table_privilege('authenticated', 'public.cms_document_command_receipts', 'SELECT'), true,
  'command receipts are never exposed to clients');
select isnt(has_table_privilege('authenticated', 'public.cms_document_security_reviews', 'SELECT'), true,
  'scanner attestations are available only through the governed edge boundary');
select isnt(has_function_privilege('authenticated', 'public.cms_reserve_document_asset(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,uuid,text,uuid)', 'EXECUTE'), true,
  'authenticated clients cannot call the reserve RPC directly');
select isnt(has_function_privilege('authenticated', 'public.cms_transition_document_asset(uuid,uuid,text,bigint,text,text,timestamptz,uuid,text,uuid)', 'EXECUTE'), true,
  'authenticated clients cannot bypass document lifecycle governance');
select isnt(has_function_privilege('authenticated', 'public.cms_review_document_security(uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,uuid)', 'EXECUTE'), true,
  'authenticated clients cannot forge a scanner attestation directly');
select isnt(has_function_privilege('authenticated', 'public.cms_document_qa_attestation_allowed(uuid,uuid,text)', 'EXECUTE'), true,
  'authenticated clients cannot inspect private QA leases directly');
select isnt(has_function_privilege('authenticated', 'public.cms_fixture_neutralize_synthetic_document(uuid,uuid,text,text,text,boolean,uuid)', 'EXECUTE'), true,
  'authenticated clients cannot invoke the trusted fixture teardown RPC');
select is((select critical from public.cms_permissions where permission_key='cms:documents.upload'), true,
  'document upload is a critical MFA permission');
select is((select critical from public.cms_permissions where permission_key='cms:documents.security_review'), true,
  'document security review is a dedicated critical permission');
select ok(exists(
  select 1 from public.cms_role_permissions
  where role_key='technical' and permission_key='cms:documents.upload'
), 'technical operators can upload with an elevated session');
select ok(exists(
  select 1 from public.cms_role_permissions
  where role_key='reviewer' and permission_key='cms:documents.security_review'
), 'reviewers receive the dedicated security-review permission');

select throws_ok(
  $$select public.cms_reserve_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010',
    'cms-documents/57000000-0000-4000-8000-000000000010/manual.pdf',
    'cms-document-uploads/57000000-0000-4000-8000-000000000010/manual.pdf',
    'manual.pdf', 'manual', 'Manual QA', '1', 'pt-BR', 'public', 'synthetic_test',
    'QA-CMS-FINAL-20260907-bbbbbbbb', 'Uso de homologação', 'GAIATEC SISTEMAS', true,
    'aal1', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000011', repeat('a',64),
    '57000000-0000-4000-8000-000000000012'
  )$$,
  '42501', 'CMS_DOCUMENT_MFA_REQUIRED', 'aal1 cannot reserve a document'
);
select lives_ok(
  $$select public.cms_reserve_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010',
    'cms-documents/57000000-0000-4000-8000-000000000010/manual.pdf',
    'cms-document-uploads/57000000-0000-4000-8000-000000000010/manual.pdf',
    'manual.pdf', 'manual', 'Manual QA', '1', 'pt-BR', 'public', 'synthetic_test',
    'QA-CMS-FINAL-20260907-bbbbbbbb', 'Uso de homologação', 'GAIATEC SISTEMAS', true,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000011', repeat('a',64),
    '57000000-0000-4000-8000-000000000012'
  )$$,
  'aal2 reserves a governed path'
);
select is((select processing_status from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'),
  'awaiting_upload', 'reservation is not publishable before server finalization');
select is((select count(*)::integer from public.cms_audit_log where action='cms:documents.reserve' and target_id='57000000-0000-4000-8000-000000000010'),
  1, 'reservation writes an immutable audit event');
select lives_ok(
  $$select public.cms_mark_document_upload_token_issued(
    '57000000-0000-4000-8000-000000000010',
    'cms-document-uploads/57000000-0000-4000-8000-000000000010/manual.pdf',
    now() + interval '120 minutes',
    '57000000-0000-4000-8000-000000000012'
  )$$,
  'the service boundary records the signed upload expiry before exposing it'
);
select lives_ok(
  $$select public.cms_claim_document_finalization(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010',
    '57000000-0000-4000-8000-000000000013',
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000014'
  )$$,
  'finalization acquires a durable bounded claim'
);
select is((select processing_status from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'),
  'finalizing', 'the claimed document remains non-publishable until canonical bytes are recorded');
select lives_ok(
  $$select public.cms_finalize_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 128, repeat('b',64),
    'pdf-passive-prefilter-v2', 'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000013', repeat('c',64),
    '57000000-0000-4000-8000-000000000014'
  )$$,
  'the structural pre-filter records immutable bytes without declaring them malware-free'
);
select is((select processing_status || ':' || scan_status from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'),
  'quarantined:pending', 'a structurally accepted upload remains fail-closed and unpublishable');
select ok((select not (event_data ? 'sourceReference') and not (event_data ? 'ownerName') and not (event_data ? 'licenseName')
  from public.cms_audit_log where action='cms:documents.finalize' and target_id='57000000-0000-4000-8000-000000000010'),
  'audit metadata excludes source, owner and license text');
select is(public.cms_document_qa_attestation_allowed(
  '57000000-0000-4000-8000-000000000002',
  '57000000-0000-4000-8000-000000000010', 'staging'
), true, 'the synthetic scanner option is exposed only to the leased second actor');
select is(public.cms_document_qa_attestation_allowed(
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000010', 'staging'
), false, 'the uploader never receives the synthetic scanner option');

select throws_ok(
  $$select public.cms_review_document_security(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', repeat('b',64),
    'approve', 'qa-synthetic-attestation-v1', 'clean', repeat('d',64), 'SCAN-SEC-001', 'staging',
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000015', repeat('e',64),
    '57000000-0000-4000-8000-000000000016'
  )$$,
  '42501', 'CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED',
  'the uploader cannot approve the same quarantined document'
);
select throws_ok(
  $$select public.cms_review_document_security(
    '57000000-0000-4000-8000-000000000002',
    '57000000-0000-4000-8000-000000000010', repeat('f',64),
    'approve', 'qa-synthetic-attestation-v1', 'clean', repeat('d',64), 'SCAN-SEC-001', 'staging',
    'aal2', 'reviewer-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000017', repeat('1',64),
    '57000000-0000-4000-8000-000000000018'
  )$$,
  '40001', 'CMS_DOCUMENT_REVIEW_SHA_MISMATCH',
  'a reviewer cannot attest a hash different from the quarantined bytes'
);
select lives_ok(
  $$select public.cms_review_document_security(
    '57000000-0000-4000-8000-000000000002',
    '57000000-0000-4000-8000-000000000010', repeat('b',64),
    'approve', 'qa-synthetic-attestation-v1', 'clean', repeat('d',64), 'SCAN-SEC-001', 'staging',
    'aal2', 'reviewer-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000019', repeat('2',64),
    '57000000-0000-4000-8000-000000000023'
  )$$,
  'a distinct AAL2 reviewer can record a permitted corporate scanner attestation'
);
select is((
  select processing_status || ':' || scan_status || ':' || scan_engine
  from public.cms_document_assets
  where id='57000000-0000-4000-8000-000000000010'
), 'ready:clean:qa-synthetic-attestation-v1', 'only the second-actor attestation releases the document');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:documents.security_approve' and target_id='57000000-0000-4000-8000-000000000010'),
  1, 'security approval creates exactly one audit event');
select is((public.cms_review_document_security(
  '57000000-0000-4000-8000-000000000002',
  '57000000-0000-4000-8000-000000000010', repeat('b',64),
  'approve', 'qa-synthetic-attestation-v1', 'clean', repeat('d',64), 'SCAN-SEC-001', 'staging',
  'aal2', 'reviewer-session', now()-interval '1 minute',
  '57000000-0000-4000-8000-000000000019', repeat('2',64),
  '57000000-0000-4000-8000-000000000023'
)->>'replayed')::boolean, true, 'an identical security decision replays its receipt');
select throws_ok(
  $$update public.cms_document_security_reviews set evidence_reference='SCAN-SEC-ALTERED'$$,
  '42501', 'CMS_DOCUMENT_SECURITY_REVIEW_IMMUTABLE',
  'scanner attestations cannot be updated after insertion'
);

select throws_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'archive_document', 2,
    'aal1', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000030', repeat('d',64),
    '57000000-0000-4000-8000-000000000031'
  )$$,
  '42501', 'CMS_DOCUMENT_MFA_REQUIRED', 'aal1 cannot archive a document'
);

insert into public.cms_content_items(id, content_type, slug, created_by, updated_by)
values(
  '57000000-0000-4000-8000-000000000020', 'post', 'document-reference-test',
  '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_revisions(
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values(
  '57000000-0000-4000-8000-000000000021',
  '57000000-0000-4000-8000-000000000020', 1, 1,
  '{"title":"Document reference fixture"}'::jsonb, '{}',
  '[{"rightsConfirmed":true}]', 1,
  'Fixture de referência publicada', '57000000-0000-4000-8000-000000000001'
);

select is(
  private.cms_product_document_collection_allowed(
    (
      select jsonb_agg(jsonb_build_object(
        'id', gen_random_uuid(), 'kind', 'manual', 'title', 'Documento externo',
        'officialUrl', 'https://docs.example.test/manual.pdf', 'sha256', repeat('a',64),
        'revision', '1', 'language', 'pt-BR', 'visibility', 'public',
        'rightsConfirmed', true
      ))
      from generate_series(1, 31)
    )
  ),
  false,
  'the database rejects document collections above the contractual limit'
);

insert into public.cms_content_items(id, content_type, slug, created_by, updated_by)
values(
  '57000000-0000-4000-8000-000000000022', 'product', 'qa-duplicate-documents',
  '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_revisions(
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values(
  '57000000-0000-4000-8000-000000000023',
  '57000000-0000-4000-8000-000000000022', 1, 1,
  jsonb_build_object(
    'title', 'Produto com documentos duplicados',
    'documents', jsonb_build_array(
      jsonb_build_object(
        'id', '57000000-0000-4000-8000-000000000024', 'kind', 'manual',
        'title', 'Manual externo', 'officialUrl', 'https://docs.example.test/manual.pdf',
        'sha256', repeat('a',64), 'revision', '1', 'language', 'pt-BR',
        'visibility', 'public', 'rightsConfirmed', true
      ),
      jsonb_build_object(
        'id', '57000000-0000-4000-8000-000000000024', 'kind', 'manual',
        'title', 'Manual externo', 'officialUrl', 'https://docs.example.test/manual.pdf',
        'sha256', repeat('a',64), 'revision', '1', 'language', 'pt-BR',
        'visibility', 'public', 'rightsConfirmed', true
      )
    )
  ),
  '{}', '[{"rightsConfirmed":true}]', 1,
  'Fixture de cardinalidade documental', '57000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$select public.cms_issue_preview(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000022',
    '57000000-0000-4000-8000-000000000023', repeat('9',64),
    now() + interval '5 minutes', 1, 'aal2', 'documents-session',
    now() - interval '1 minute', '57000000-0000-4000-8000-000000000025'
  )$$,
  '23514', 'CMS_PREVIEW_DOCUMENT_SCOPE_INVALID',
  'preview rejects duplicated document identities before creating an anonymous capability'
);
alter table public.cms_published_projection disable trigger cms_phase7_projection_validate;
select throws_ok(
  $$insert into public.cms_published_projection(
    item_id, revision_id, content_type, slug, schema_version, consumer_id,
    renderer_key, payload, seo, content_version, cache_tag, etag, published_at
  ) select
    item.id, revision.id, 'product', item.slug, 1,
    (select consumer_id from public.cms_capability_registry order by consumer_id limit 1),
    'fixture', revision.payload, '{}', 1,
    'cms:product:' || item.id::text, '"' || repeat('9',64) || '"', now()
  from public.cms_content_items item
  join public.cms_content_revisions revision on revision.item_id = item.id
  where item.id = '57000000-0000-4000-8000-000000000022'$$,
  '23514', 'CMS_PRODUCT_DOCUMENT_SHAPE_INVALID',
  'publication rejects duplicated document identities even when an upstream schema trigger is bypassed'
);
alter table public.cms_published_projection enable trigger cms_phase7_projection_validate;
alter table public.cms_published_projection disable trigger cms_phase7_projection_validate;
insert into public.cms_published_projection(
  item_id, revision_id, content_type, slug, schema_version, consumer_id,
  renderer_key, payload, seo, content_version, cache_tag, etag, published_at
) values(
  '57000000-0000-4000-8000-000000000020',
  '57000000-0000-4000-8000-000000000021', 'post', 'document-reference-test', 1,
  (select consumer_id from public.cms_capability_registry order by consumer_id limit 1),
  'fixture',
  '{"title":"Document reference fixture","documents":[{"id":"57000000-0000-4000-8000-000000000010"}]}'::jsonb,
  '{}', 1, 'cms:post:57000000-0000-4000-8000-000000000020',
  '"' || repeat('d',64) || '"', now()
);
alter table public.cms_published_projection enable trigger cms_phase7_projection_validate;

select throws_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'archive_document', 2,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000032', repeat('e',64),
    '57000000-0000-4000-8000-000000000033'
  )$$,
  '23514', 'CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS',
  'a document referenced by the published projection cannot be archived'
);
delete from public.cms_published_projection
where item_id='57000000-0000-4000-8000-000000000020';

select throws_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'archive_document', 3,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000034', repeat('f',64),
    '57000000-0000-4000-8000-000000000035'
  )$$,
  '40001', 'CMS_DOCUMENT_LOCK_CONFLICT', 'stale document lifecycle writes are rejected'
);
select lives_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'archive_document', 2,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000036', repeat('1',64),
    '57000000-0000-4000-8000-000000000037'
  )$$,
  'an unreferenced document can be archived without deleting bytes'
);
select is((
  select byte_size::text || ':' || sha256 || ':' || (archived_at is not null)::text || ':' || lock_version::text
  from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'
), '128:' || repeat('b',64) || ':true:3', 'archive preserves size and hash while advancing the lock');
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:documents.archive' and target_id='57000000-0000-4000-8000-000000000010'),
  1, 'archive creates one immutable audit event');

insert into public.cms_document_assets (
  id, storage_path, upload_path, upload_disposition,
  original_filename, kind, title, revision, language, visibility,
  detected_mime, byte_size, sha256, processing_status, scan_status, scan_engine,
  prefilter_engine, prefiltered_at, security_reviewed_by, security_reviewed_at,
  scanner_evidence_sha256, scanner_evidence_reference,
  source_kind, source_reference, license_name, owner_name, rights_confirmed,
  created_by, processed_at, blob_disposition
) values (
  '57000000-0000-4000-8000-000000000060',
  'cms-documents/57000000-0000-4000-8000-000000000060/corporate.pdf',
  'cms-document-uploads/57000000-0000-4000-8000-000000000060/corporate.pdf',
  'removed', 'corporate.pdf', 'manual', 'Documento corporativo de mesmo hash',
  '1', 'pt-BR', 'private', 'application/pdf', 128, repeat('b',64),
  'ready', 'clean', 'clamav-corporate-v1', 'pdf-passive-prefilter-v2', now(),
  '57000000-0000-4000-8000-000000000001', now(), repeat('9',64), 'SCAN-CORP-001',
  'owner_authored', 'corporate-document-source', 'Uso corporativo', 'GAIATEC SISTEMAS', true,
  '57000000-0000-4000-8000-000000000003', now(), 'available'
);

select lives_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'restore_document', 3,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000038', repeat('2',64),
    '57000000-0000-4000-8000-000000000039'
  )$$,
  'a QA document can be restored when the same hash exists only in the corporate scope'
);
select is((
  select byte_size::text || ':' || sha256 || ':' || (archived_at is null)::text || ':' || lock_version::text
  from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'
), '128:' || repeat('b',64) || ':true:4', 'restore preserves bytes and advances the lock');
select is((public.cms_transition_document_asset(
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000010', 'restore_document', 3,
  'aal2', 'documents-session', now()-interval '1 minute',
  '57000000-0000-4000-8000-000000000038', repeat('2',64),
  '57000000-0000-4000-8000-000000000039'
)->>'replayed')::boolean, true, 'an identical restore command replays its receipt');
select is((select lock_version::integer from public.cms_document_assets
  where id='57000000-0000-4000-8000-000000000010'), 4,
  'an idempotent replay never advances the lock twice');
select throws_ok(
  $$select public.cms_transition_document_asset(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010', 'restore_document', 4,
    'aal2', 'documents-session', now()-interval '1 minute',
    '57000000-0000-4000-8000-000000000038', repeat('3',64),
    '57000000-0000-4000-8000-000000000040'
  )$$,
  'P0001', 'CMS_DOCUMENT_IDEMPOTENCY_CONFLICT',
  'an idempotency key cannot represent a different lifecycle command'
);
select is((select count(*)::integer from public.cms_audit_log
  where action='cms:documents.restore' and target_id='57000000-0000-4000-8000-000000000010'),
  1, 'restore creates exactly one immutable audit event');

select lives_ok(
  $$select public.cms_fixture_neutralize_synthetic_document(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000010',
    'QA-CMS-FINAL-20260907-bbbbbbbb', repeat('b',40), 'staging', false,
    '57000000-0000-4000-8000-000000000041'
  )$$,
  'trusted teardown first revokes access without claiming physical removal'
);
select ok(
  (select canonical_cleanup_not_before > statement_timestamp()
   from public.cms_document_assets
   where id='57000000-0000-4000-8000-000000000010'),
  'terminal teardown preserves a bounded canonical-write fence for concurrent retries'
);
select is((
  select processing_status || ':' || blob_disposition || ':' || (archived_at is not null)::text
  from public.cms_document_assets where id='57000000-0000-4000-8000-000000000010'
), 'neutralized:access_revoked:true',
  'the synthetic document is inaccessible while physical removal awaits the fixed fence');
select is((select count(*)::integer from public.cms_document_security_reviews
  where document_id='57000000-0000-4000-8000-000000000010'),
  1, 'terminal cleanup preserves the immutable scanner attestation');

insert into public.cms_document_assets (
  id, storage_path, upload_path, upload_disposition,
  original_filename, kind, title, revision, language, visibility,
  processing_status, scan_status, scan_engine, source_kind, source_reference,
  license_name, owner_name, rights_confirmed, created_by, processed_at, blob_disposition
) values (
  '57000000-0000-4000-8000-000000000050',
  'cms-documents/57000000-0000-4000-8000-000000000050/rejected.pdf',
  'cms-document-uploads/57000000-0000-4000-8000-000000000050/rejected.pdf',
  'removed', 'rejected.pdf', 'manual', 'Documento QA previamente removido',
  '1', 'pt-BR', 'private', 'rejected', 'rejected', 'fixture-rejected',
  'synthetic_test', 'QA-CMS-FINAL-20260907-bbbbbbbb',
  'Uso de homologação', 'GAIATEC SISTEMAS', true,
  '57000000-0000-4000-8000-000000000001', now(), 'removed'
);
select lives_ok(
  $$select public.cms_fixture_neutralize_synthetic_document(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000050',
    'QA-CMS-FINAL-20260907-bbbbbbbb', repeat('b',40), 'staging', false,
    '57000000-0000-4000-8000-000000000051'
  )$$,
  'fixture teardown neutralizes metadata even when a rejected blob was already removed'
);
select is((
  select processing_status || ':' || blob_disposition
  from public.cms_document_assets where id='57000000-0000-4000-8000-000000000050'
), 'neutralized:removed', 'pre-removed synthetic bytes do not leave cleanup stuck in rejected state');

select * from finish();
rollback;
