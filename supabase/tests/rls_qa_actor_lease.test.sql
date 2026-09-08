begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(66);

select has_table('private', 'cms_qa_actor_leases', 'the private QA actor lease registry exists');
select has_trigger(
  'auth',
  'users',
  'cms_capture_qa_actor_lease',
  'Auth identity creation atomically captures an exact synthetic lease'
);
select isnt(
  has_table_privilege('anon', 'private.cms_qa_actor_leases', 'SELECT'),
  true,
  'anonymous callers cannot inspect QA leases'
);
select isnt(
  has_table_privilege('authenticated', 'private.cms_qa_actor_leases', 'SELECT'),
  true,
  'authenticated callers cannot inspect QA leases'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_qa_actor_lease_status(uuid,text,text,text)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot inspect a lease through the RPC'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_qa_actor_lease_status(uuid,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot inspect a lease through the RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cms_qa_actor_lease_status(uuid,text,text,text)',
    'EXECUTE'
  ),
  'only the trusted fixture boundary can inspect an exact lease'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'cms_revoke_qa_preview_tokens_on_terminal',
  'terminal QA leases immediately revoke anonymous preview capabilities'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_complete_qa_actor_lease(uuid,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot complete a lease'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cms_complete_qa_actor_lease(uuid,text,text,text)',
    'EXECUTE'
  ),
  'the trusted fixture boundary can complete an exact lease'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_sweep_expired_qa_actor_leases(integer)',
    'EXECUTE'
  ),
  true,
  'the sweeper remains private to the database scheduler'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_qa_terminal_archived_tombstone_is_exact(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  true,
  'the exact terminal tombstone classifier remains private to the database boundary'
);

select throws_ok(
  $$insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '61000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-malformed@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"invalid","environment":"staging"}',
    now(), now()
  )$$,
  '22023',
  'CMS_QA_ACTOR_METADATA_INVALID',
  'a marked QA actor cannot be created without an exact SHA-bound lease identity'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '61000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-expired@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-future@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-operator@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa"}',
    now(), now()
  );

select is(
  (select count(*)::integer from private.cms_qa_actor_leases where status = 'active'),
  2,
  'the Auth trigger creates leases only for exactly marked QA actors'
);
select is(
  (select count(*)::integer from private.cms_qa_actor_leases where actor_id = '61000000-0000-4000-8000-000000000003'),
  0,
  'an ordinary actor never receives a synthetic cleanup lease'
);
select is(
  (
    select min(extract(epoch from (expires_at - created_at)))::integer
    from private.cms_qa_actor_leases
  ),
  7140,
  'every automatically captured lease expires after 119 minutes'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:qa.fixture_lease_created'
      and target_id = 'QA-CMS-FINAL-20260907-aaaaaaaa'
  ),
  2,
  'lease capture immediately appends immutable non-PII evidence'
);
select is(
  public.cms_qa_actor_lease_status(
    '61000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'staging'
  ) ->> 'status',
  'active',
  'the exact service RPC observes the active lease'
);
select throws_ok(
  $$update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'runTag'
    where id = '61000000-0000-4000-8000-000000000001'$$,
  '42501',
  'CMS_QA_ACTOR_MARKER_IMMUTABLE',
  'an active leased actor cannot remove or alter its exact synthetic marker'
);

insert into public.cms_profiles (user_id, display_name, status)
values
  ('61000000-0000-4000-8000-000000000001', 'Expired synthetic actor', 'active'),
  ('61000000-0000-4000-8000-000000000002', 'Future synthetic actor', 'active'),
  ('61000000-0000-4000-8000-000000000003', 'Ordinary actor', 'active');

insert into public.cms_user_roles (user_id, role_key)
values
  ('61000000-0000-4000-8000-000000000001', 'super_admin'),
  ('61000000-0000-4000-8000-000000000002', 'super_admin'),
  ('61000000-0000-4000-8000-000000000003', 'super_admin');

insert into public.cms_scoped_role_assignments (
  user_id, role_key, environment, grant_type, reason, granted_by
) values
  (
    '61000000-0000-4000-8000-000000000001', 'super_admin', 'staging', 'direct',
    'Synthetic lease expiry test', '61000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000002', 'super_admin', 'staging', 'direct',
    'Synthetic future lease test', '61000000-0000-4000-8000-000000000002'
  );

insert into public.rdo_user_access (user_id, role, active)
values ('61000000-0000-4000-8000-000000000001', 'rdo_member', true);

insert into public.cms_content_items (id, content_type, slug, created_by, updated_by)
values
  (
    '61000000-0000-4000-8000-000000000101', 'post', 'qa-expired-content',
    '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000104', 'product', 'qa-expired-product',
    '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000102', 'post', 'qa-future-content',
    '61000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002'
  ),
  (
    '61000000-0000-4000-8000-000000000103', 'post', 'ordinary-content',
    '61000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003'
  );

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by, archived_at
) values (
  '61000000-0000-4000-8000-000000000105',
  'page',
  'qa-cms-final-gone-aaaaaaaa',
  'archived',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  now()
);

insert into public.cms_content_drafts (
  item_id, schema_version, payload, seo, provenance, lock_version, updated_by
) values
  (
    '61000000-0000-4000-8000-000000000102', 1,
    '{"title":"QA future draft"}', '{}', '[{"rightsConfirmed":true}]', 1,
    '61000000-0000-4000-8000-000000000002'
  ),
  (
    '61000000-0000-4000-8000-000000000103', 1,
    '{"title":"Ordinary draft"}', '{}', '[{"rightsConfirmed":true}]', 1,
    '61000000-0000-4000-8000-000000000003'
  ),
  (
    '61000000-0000-4000-8000-000000000105', 1,
    '{"contentType":"page","consumerId":"cms.managed-page.v1","pageKind":"institutional","title":"QA-CMS-FINAL-20260907-aaaaaaaa gone","summary":"Página sintética para validar retirada gone.","route":{"path":"/qa-cms-final-gone-aaaaaaaa"},"retirement":{"mode":"gone"}}',
    '{"indexable":false}', '[{"rightsConfirmed":true,"source":"controlled-qa"}]', 1,
    '61000000-0000-4000-8000-000000000001'
  );

update public.cms_content_items
set workflow_status = 'published'
where id in (
  '61000000-0000-4000-8000-000000000101',
  '61000000-0000-4000-8000-000000000104'
);

insert into public.cms_content_revisions (
  id, item_id, revision_number, schema_version, payload, seo, provenance,
  source_draft_version, reason, created_by
) values
  (
    '61000000-0000-4000-8000-000000000201',
    '61000000-0000-4000-8000-000000000101',
    1, 1, '{"title":"Synthetic post"}', '{}', '[{"rightsConfirmed":true}]', 1,
    'Synthetic published post for lease cleanup',
    '61000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000204',
    '61000000-0000-4000-8000-000000000104',
    1, 1, '{"title":"Synthetic product"}', '{}', '[{"rightsConfirmed":true}]', 1,
    'Synthetic published product for lease cleanup',
    '61000000-0000-4000-8000-000000000001'
  );

alter table public.cms_published_projection disable trigger user;
insert into public.cms_published_projection (
  item_id, revision_id, content_type, slug, schema_version, consumer_id,
  renderer_key, payload, seo, content_version, cache_tag, etag, published_at
) values
  (
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000201',
    'post', 'qa-expired-content', 1,
    (select consumer_id from public.cms_capability_registry order by consumer_id limit 1),
    'fixture', '{"title":"Synthetic post"}', '{}', 1,
    'cms:post:61000000-0000-4000-8000-000000000101',
    '"' || repeat('a', 64) || '"', now()
  ),
  (
    '61000000-0000-4000-8000-000000000104',
    '61000000-0000-4000-8000-000000000204',
    'product', 'qa-expired-product', 1,
    (select consumer_id from public.cms_capability_registry order by consumer_id limit 1),
    'fixture', '{"title":"Synthetic product"}', '{}', 1,
    'cms:product:61000000-0000-4000-8000-000000000104',
    '"' || repeat('b', 64) || '"', now()
  );
alter table public.cms_published_projection enable trigger user;

insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
values
  (
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000201',
    'cms:post:61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000104',
    '61000000-0000-4000-8000-000000000204',
    'cms:product:61000000-0000-4000-8000-000000000104',
    '61000000-0000-4000-8000-000000000001'
  );

update private.cms_qa_actor_leases
set expires_at = now() + interval '20 minutes'
where actor_id = '61000000-0000-4000-8000-000000000002';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '61000000-0000-4000-8000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'qa-other-run@example.test', '', now(), '{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',
  now(), now()
);
insert into public.cms_profiles (user_id, display_name, status)
values ('61000000-0000-4000-8000-000000000005', 'Other-run synthetic actor', 'active');
insert into public.cms_user_roles (user_id, role_key)
values ('61000000-0000-4000-8000-000000000005', 'super_admin');
insert into public.cms_scoped_role_assignments (
  user_id, role_key, environment, grant_type, reason, granted_by
) values (
  '61000000-0000-4000-8000-000000000005', 'super_admin', 'staging', 'direct',
  'Synthetic cross-run preview denial', '61000000-0000-4000-8000-000000000005'
);

select throws_ok(
  $$select public.cms_issue_preview(
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000103', null,
    repeat('f', 64), now() + interval '10 minutes', 1,
    'aal2', 'qa-to-corporate-preview', now(),
    '61000000-0000-4000-8000-000000000206'
  )$$,
  '42501',
  'CMS_PREVIEW_ACTOR_SCOPE_INVALID',
  'a QA actor cannot issue an anonymous preview for corporate content'
);
select throws_ok(
  $$select public.cms_issue_preview(
    '61000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000102', null,
    repeat('1', 64), now() + interval '10 minutes', 1,
    'aal2', 'corporate-to-qa-preview', now(),
    '61000000-0000-4000-8000-000000000207'
  )$$,
  '42501',
  'CMS_PREVIEW_ACTOR_SCOPE_INVALID',
  'an ordinary actor cannot issue an anonymous preview for QA content'
);
select throws_ok(
  $$select public.cms_issue_preview(
    '61000000-0000-4000-8000-000000000005',
    '61000000-0000-4000-8000-000000000102', null,
    repeat('2', 64), now() + interval '10 minutes', 1,
    'aal2', 'cross-run-preview', now(),
    '61000000-0000-4000-8000-000000000208'
  )$$,
  '42501',
  'CMS_PREVIEW_ACTOR_SCOPE_INVALID',
  'a QA actor cannot preview fixtures belonging to another run and SHA'
);

select throws_ok(
  $$select public.cms_issue_preview(
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000201',
    repeat('e', 64), now() + interval '25 minutes', 1,
    'aal2', 'qa-lease-bound-preview', now(),
    '61000000-0000-4000-8000-000000000205'
  )$$,
  '22023',
  'CMS_PREVIEW_TOKEN_INVALID',
  'a QA preview capability cannot outlive its exact server-side lease'
);

select lives_ok(
  $$select public.cms_issue_preview(
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000101',
    '61000000-0000-4000-8000-000000000201',
    repeat('c', 64), now() + interval '10 minutes', 1,
    'aal2', 'same-run-owner-preview', now(),
    '61000000-0000-4000-8000-000000000209'
  )$$,
  'a same-run reviewer may issue a preview bounded by every participating lease'
);

insert into public.cms_preview_tokens (
  token_hash, item_id, revision_id, snapshot_payload, snapshot_seo,
  created_by, expires_at, max_uses
) values
  (
    repeat('d', 64),
    '61000000-0000-4000-8000-000000000102', null,
    '{"title":"Synthetic future preview"}', '{}',
    '61000000-0000-4000-8000-000000000002', now() + interval '10 minutes', 1
  );

insert into public.cms_route_rules (item_id, source_path, status_code, active)
values
  ('61000000-0000-4000-8000-000000000101', '/qa-expired-content', 410, true),
  ('61000000-0000-4000-8000-000000000102', '/qa-future-content', 410, true),
  ('61000000-0000-4000-8000-000000000105', '/qa-cms-final-gone-aaaaaaaa', 410, true);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, expires_at, created_by
) values
  (
    'ev2.release_skeleton', 'staging', 'user', '61000000-0000-4000-8000-000000000001',
    true, 'Synthetic expired lease test', now() + interval '10 minutes',
    '61000000-0000-4000-8000-000000000001'
  ),
  (
    'ev2.release_skeleton', 'staging', 'user', '61000000-0000-4000-8000-000000000002',
    true, 'Synthetic future lease test', now() + interval '10 minutes',
    '61000000-0000-4000-8000-000000000002'
  );

insert into public.cms_document_assets (
  id, storage_path, upload_path, upload_token_expires_at, upload_disposition,
  original_filename, kind, title, revision, language, visibility,
  processing_status, scan_status, scan_engine, source_kind, source_reference,
  license_name, owner_name, rights_confirmed, created_by, processed_at, blob_disposition
) values (
  '61000000-0000-4000-8000-000000000301',
  'cms-documents/61000000-0000-4000-8000-000000000301/rejected.pdf',
  'cms-document-uploads/61000000-0000-4000-8000-000000000301/rejected.pdf',
  now() + interval '10 minutes', 'accepting',
  'rejected.pdf', 'manual', 'Documento QA rejeitado', '1', 'pt-BR', 'private',
  'rejected', 'rejected', 'fixture-rejected', 'synthetic_test',
  'QA-CMS-FINAL-20260907-aaaaaaaa', 'Uso de homologação', 'GAIATEC SISTEMAS', true,
  '61000000-0000-4000-8000-000000000001', now(), 'access_revoked'
);

update private.cms_qa_actor_leases
set created_at = now() - interval '30 minutes',
    expires_at = now() - interval '1 minute'
where actor_id = '61000000-0000-4000-8000-000000000001';

-- Force the watchdog fallback path: the ordinary archive trigger is not allowed
-- to remove either projection for this one transacted test.
alter table public.cms_content_items disable trigger cms_site_builder_unpublish;
create temporary table qa_lease_sweep_result as
select private.cms_sweep_expired_qa_actor_leases(25) as payload;
alter table public.cms_content_items enable trigger cms_site_builder_unpublish;

select is(
  (select (payload ->> 'processed')::integer from qa_lease_sweep_result),
  1,
  'the database sweeper revokes one expired exact synthetic actor'
);
select is(
  (select (payload ->> 'failed')::integer from qa_lease_sweep_result),
  0,
  'the transactional cleanup reports no failed actor'
);
select is(
  (
    select count(*)::integer from public.cms_content_items
    where id in (
      '61000000-0000-4000-8000-000000000101',
      '61000000-0000-4000-8000-000000000104'
    ) and workflow_status = 'archived'
  ),
  2,
  'expired synthetic post and product are archived'
);
select is(
  (
    select count(*)::integer from public.cms_published_projection
    where item_id in (
      '61000000-0000-4000-8000-000000000101',
      '61000000-0000-4000-8000-000000000104'
    )
  ),
  0,
  'the fallback explicitly removes post and product public projections'
);
select is(
  (
    select count(*)::integer from public.cms_publications
    where item_id in (
      '61000000-0000-4000-8000-000000000101',
      '61000000-0000-4000-8000-000000000104'
    )
  ),
  0,
  'the fallback removes live publication pointers for every actor content type'
);
select is(
  (
    select count(*)::integer from public.cms_publication_outbox
    where item_id in (
      '61000000-0000-4000-8000-000000000101',
      '61000000-0000-4000-8000-000000000104'
    ) and event_type = 'unpublish'
  ),
  2,
  'the fallback records an unpublish event for both published entities'
);
select isnt(
  (select active from public.cms_route_rules where item_id = '61000000-0000-4000-8000-000000000101'),
  true,
  'expired synthetic public routes are disabled'
);
select is(
  (select active from public.cms_route_rules where item_id = '61000000-0000-4000-8000-000000000105'),
  true,
  'the one exact archived institutional tombstone remains active after watchdog cleanup'
);
select is(
  private.cms_qa_terminal_archived_tombstone_is_exact(
    (select id from public.cms_route_rules where item_id = '61000000-0000-4000-8000-000000000105'),
    '61000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'staging'
  ),
  true,
  'the preserved route satisfies every runTag, SHA, archive, noindex and terminal data invariant'
);
select is(
  (
    select count(*)::integer
    from public.cms_publication_outbox outbox
    where outbox.item_id = '61000000-0000-4000-8000-000000000105'
      and outbox.status <> 'completed'
  ),
  0,
  'the terminal tombstone retains no actionable publication outbox work'
);
select is(
  (select count(*)::integer from public.cms_feature_flag_overrides where scope_key = '61000000-0000-4000-8000-000000000001'),
  0,
  'expired synthetic feature overrides are removed'
);
select is((
  select processing_status || ':' || blob_disposition || ':' || upload_disposition
  from public.cms_document_assets where id = '61000000-0000-4000-8000-000000000301'
), 'neutralized:access_revoked:guarded', 'the watchdog terminally revokes blob and upload access for a residual synthetic document');
select is((
  select (event_data ->> 'neutralizedDocuments')::integer
  from public.cms_audit_log
  where action = 'cms:qa.fixture_expired_cleanup'
    and actor_id = '61000000-0000-4000-8000-000000000001'
), 1, 'watchdog evidence records the neutralized document without deleting its audit history');
select is(
  (select count(*)::integer from public.cms_user_roles where user_id = '61000000-0000-4000-8000-000000000001'),
  0,
  'expired synthetic legacy roles are removed'
);
select is(
  (
    select count(*)::integer from public.cms_scoped_role_assignments
    where user_id = '61000000-0000-4000-8000-000000000001' and revoked_at is null
  ),
  0,
  'expired synthetic scoped roles are revoked'
);
select isnt(
  (select active from public.rdo_user_access where user_id = '61000000-0000-4000-8000-000000000001'),
  true,
  'any accidental RDO access held by the synthetic actor is disabled'
);
select is(
  (select status from public.cms_profiles where user_id = '61000000-0000-4000-8000-000000000001'),
  'suspended',
  'the expired synthetic CMS profile is suspended'
);
select ok(
  (
    select sessions_valid_after >= now() - interval '1 minute'
    from public.cms_profiles where user_id = '61000000-0000-4000-8000-000000000001'
  ),
  'existing synthetic JWTs are invalidated at the profile boundary'
);
select ok(
  (select banned_until > now() + interval '99 years' from auth.users where id = '61000000-0000-4000-8000-000000000001'),
  'the expired synthetic Auth identity is blocked server-side'
);
select ok(
  (
    select status = 'expired' and swept_at is not null
    from private.cms_qa_actor_leases where actor_id = '61000000-0000-4000-8000-000000000001'
  ),
  'the successfully revoked lease records its terminal watchdog state'
);
select ok(
  (select revoked_at is not null from public.cms_preview_tokens where token_hash = repeat('c', 64)),
  'the owner lease terminal transition revokes a preview emitted by its same-run reviewer'
);
select throws_ok(
  $$select public.cms_consume_preview(repeat('c', 64))$$,
  '42501',
  'CMS_PREVIEW_EXPIRED',
  'the cross-actor preview snapshot becomes unusable immediately when its owner lease ends'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:qa.fixture_expired_cleanup'
      and actor_id = '61000000-0000-4000-8000-000000000001'
  ),
  1,
  'watchdog cleanup appends one immutable sanitized audit event'
);
select throws_ok(
  $$delete from public.cms_audit_log
    where action = 'cms:qa.fixture_expired_cleanup'
      and actor_id = '61000000-0000-4000-8000-000000000001'$$,
  '42501',
  'CMS audit records are immutable',
  'watchdog evidence cannot be deleted'
);
select is(
  (select workflow_status from public.cms_content_items where id = '61000000-0000-4000-8000-000000000102'),
  'draft',
  'a non-expired exact synthetic lease remains untouched'
);
select is(
  (select count(*)::integer from public.cms_user_roles where user_id = '61000000-0000-4000-8000-000000000002'),
  1,
  'a non-expired synthetic actor keeps its role'
);
select is(
  (select count(*)::integer from public.cms_feature_flag_overrides where scope_key = '61000000-0000-4000-8000-000000000002'),
  1,
  'a non-expired synthetic actor keeps its override'
);
select is(
  (select workflow_status from public.cms_content_items where id = '61000000-0000-4000-8000-000000000103'),
  'draft',
  'ordinary content is never selected by the QA watchdog'
);
select is(
  (select status from public.cms_profiles where user_id = '61000000-0000-4000-8000-000000000003'),
  'active',
  'an ordinary actor remains active'
);
select ok(
  (select banned_until is null from auth.users where id = '61000000-0000-4000-8000-000000000003'),
  'an ordinary Auth identity is never blocked'
);
select is(
  (private.cms_sweep_expired_qa_actor_leases(25) ->> 'processed')::integer,
  0,
  'watchdog replay is idempotent'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:qa.fixture_expired_cleanup'
      and actor_id = '61000000-0000-4000-8000-000000000001'
  ),
  1,
  'watchdog replay does not duplicate cleanup evidence'
);
select throws_ok(
  $$select public.cms_complete_qa_actor_lease(
    '61000000-0000-4000-8000-000000000002',
    'QA-CMS-FINAL-20260907-aaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'staging'
  )$$,
  '55000',
  'CMS_QA_ACTOR_CLEANUP_INCOMPLETE',
  'normal cleanup cannot close a lease while active access remains'
);

update public.cms_content_items
set workflow_status = 'archived',
    archived_at = now(),
    updated_by = '61000000-0000-4000-8000-000000000002'
where created_by = '61000000-0000-4000-8000-000000000002';
update public.cms_route_rules set active = false
where item_id = '61000000-0000-4000-8000-000000000102';
delete from public.cms_feature_flag_overrides
where scope_type = 'user' and scope_key = '61000000-0000-4000-8000-000000000002';
update public.cms_scoped_role_assignments
set revoked_at = now(),
    revoked_by = '61000000-0000-4000-8000-000000000002',
    revocation_reason = 'Normal synthetic cleanup test'
where user_id = '61000000-0000-4000-8000-000000000002' and revoked_at is null;
delete from public.cms_user_roles where user_id = '61000000-0000-4000-8000-000000000002';
update public.cms_profiles
set status = 'suspended',
    suspended_at = now(),
    suspended_by = '61000000-0000-4000-8000-000000000002',
    sessions_valid_after = now()
where user_id = '61000000-0000-4000-8000-000000000002';
update auth.users
set banned_until = now() + interval '100 years', updated_at = now()
where id = '61000000-0000-4000-8000-000000000002';

select is(
  public.cms_complete_qa_actor_lease(
    '61000000-0000-4000-8000-000000000002',
    'QA-CMS-FINAL-20260907-aaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'staging'
  ) ->> 'status',
  'cleaned',
  'normal cleanup closes a fully revoked synthetic lease'
);
select is(
  (select status from private.cms_qa_actor_leases where actor_id = '61000000-0000-4000-8000-000000000002'),
  'cleaned',
  'the normal terminal lease state is persisted'
);
select ok(
  (select revoked_at is not null from public.cms_preview_tokens where token_hash = repeat('d', 64)),
  'normal lease completion immediately revokes an outstanding QA preview'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:qa.fixture_lease_cleaned'
      and actor_id = '61000000-0000-4000-8000-000000000002'
  ),
  1,
  'normal cleanup appends sanitized immutable lease evidence'
);
select is(
  (
    public.cms_complete_qa_actor_lease(
      '61000000-0000-4000-8000-000000000002',
      'QA-CMS-FINAL-20260907-aaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'staging'
    ) ->> 'replayed'
  )::boolean,
  true,
  'normal lease completion is idempotent'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where action = 'cms:qa.fixture_lease_cleaned'
      and actor_id = '61000000-0000-4000-8000-000000000002'
  ),
  1,
  'normal completion replay does not duplicate audit evidence'
);
select is(
  (select count(*)::integer from private.cms_qa_actor_leases where actor_id = '61000000-0000-4000-8000-000000000003'),
  0,
  'the ordinary actor still has no watchdog lease after every cleanup path'
);
select is(
  private.cms_qa_lease_sweeper_job_is_exact(),
  true,
  'pg_cron runs the exact active watchdog every minute in the current database and identity'
);
update cron.job
set schedule = '*/5 * * * *'
where jobname = 'cms-qa-actor-lease-sweeper-every-1m';
select is(
  private.cms_qa_lease_sweeper_job_is_exact(),
  false,
  'a homonymous job with the right command but schedule drift fails closed'
);
update cron.job
set schedule = '* * * * *'
where jobname = 'cms-qa-actor-lease-sweeper-every-1m';

select * from finish();
rollback;
