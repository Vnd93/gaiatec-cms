begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(51);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '49000000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g9.operator@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '49000000-0000-4000-8000-000000000101',
  'Operador G9', 'g9.operator@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('49000000-0000-4000-8000-000000000101', 'super_admin');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '49000000-0000-4000-8000-000000000102',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g9.owner-b@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '49000000-0000-4000-8000-000000000102',
  'Proprietário B G9', 'g9.owner-b@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('49000000-0000-4000-8000-000000000102', 'site_pilot_manager');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '49000000-0000-4000-8000-000000000103',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'g9.editor@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values (
  '49000000-0000-4000-8000-000000000103',
  'Editor G9', 'g9.editor@example.test', 'active', now()
);
insert into public.cms_user_roles (user_id, role_key)
values ('49000000-0000-4000-8000-000000000103', 'editor');

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values
  (
    'ev2.visual_studio', 'local', 'user', '49000000-0000-4000-8000-000000000101', true,
    'Canary individual sintético G9 visual', now() - interval '1 minute', now() + interval '29 minutes',
    '49000000-0000-4000-8000-000000000101'
  ),
  (
    'ev2.multisite', 'local', 'user', '49000000-0000-4000-8000-000000000101', true,
    'Canary individual sintético G9 multisite', now() - interval '1 minute', now() + interval '29 minutes',
    '49000000-0000-4000-8000-000000000101'
  ),
  (
    'ev2.multisite', 'local', 'user', '49000000-0000-4000-8000-000000000102', true,
    'Canary individual sintético G9 tenant B', now() - interval '1 minute', now() + interval '29 minutes',
    '49000000-0000-4000-8000-000000000101'
  ),
  (
    'ev2.visual_studio', 'local', 'user', '49000000-0000-4000-8000-000000000103', true,
    'Prova negativa de substituição privilegiada G9', now() - interval '1 minute', now() + interval '29 minutes',
    '49000000-0000-4000-8000-000000000101'
  );

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by
) values (
  '49000000-0000-4000-8000-000000000201', 'page', 'g9-pagina-sintetica', 'draft',
  '49000000-0000-4000-8000-000000000101', '49000000-0000-4000-8000-000000000101'
);
insert into public.cms_content_drafts (
  item_id, payload, seo, provenance, updated_by
) values (
  '49000000-0000-4000-8000-000000000201',
  '{
    "consumerId":"cms.managed-page.v1",
    "contentType":"page",
    "schemaVersion":1,
    "title":"Página sintética G9",
    "pageKind":"institutional",
    "templateKey":"standard",
    "route":{"path":"/g9-pagina-sintetica"},
    "blocks":[{
      "id":"49000000-0000-4000-8000-000000000202",
      "type":"rich_text","hidden":false,"width":"content","tone":"light",
      "data":{"heading":"Teste","text":"Conteúdo sintético."}
    }],
    "seo":{"title":"Página G9","description":"Página sintética do Gate G9.","canonicalPath":"/g9-pagina-sintetica","indexable":false},
    "provenance":[{"sourceKind":"owner_authored","rightsConfirmed":true,"commercialOwner":"OP-G9","technicalOwner":"REV-G9","verifiedAt":"2026-09-03T12:00:00.000Z"}],
    "governanceState":"synthetic_test",
    "relations":{"productIds":[],"serviceIds":[],"industryIds":[],"applicationIds":[],"solutionIds":[]},
    "retirement":{"mode":"not_found"},
    "approval":{"businessOwner":"Owner G9","editorialReviewer":"Revisor G9"}
  }'::jsonb,
  '{"title":"Página G9","description":"Página sintética do Gate G9.","canonicalPath":"/g9-pagina-sintetica","indexable":false}'::jsonb,
  '[{"sourceKind":"owner_authored","rightsConfirmed":true,"commercialOwner":"OP-G9","technicalOwner":"REV-G9","verifiedAt":"2026-09-03T12:00:00.000Z"}]'::jsonb,
  '49000000-0000-4000-8000-000000000101'
);

create function pg_temp.visual_command(
  p_action text,
  p_branch_id uuid default null,
  p_item_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_expected_version bigint default null,
  p_expected_draft_version bigint default null,
  p_aal text default 'aal2',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a', 64),
  p_correlation_id uuid default gen_random_uuid(),
  p_command_actor_id uuid default '49000000-0000-4000-8000-000000000101',
  p_command_session_id text default 'g9-operator-session'
) returns jsonb language sql as $$
  select public.cms_execute_visual_command(
    p_command_actor_id, p_action, p_branch_id, p_item_id,
    p_payload, p_expected_version, p_expected_draft_version, 'local', 'main', p_aal,
    p_command_session_id, now() - interval '1 minute', p_command_id,
    p_idempotency_key, p_request_hash, p_correlation_id
  );
$$;

create function pg_temp.site_command(
  p_action text,
  p_target_site_key text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_version bigint default null,
  p_aal text default 'aal2',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('b', 64),
  p_correlation_id uuid default gen_random_uuid(),
  p_command_actor_id uuid default '49000000-0000-4000-8000-000000000101',
  p_command_session_id text default 'g9-operator-session'
) returns jsonb language sql as $$
  select public.cms_execute_site_command(
    p_command_actor_id, p_action, p_target_site_key,
    p_payload, p_expected_version, 'local', 'main', p_aal, p_command_session_id,
    now() - interval '1 minute', p_command_id, p_idempotency_key,
    p_request_hash, p_correlation_id
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_sites'::regclass,
    'public.cms_site_environments'::regclass,
    'public.cms_site_domains'::regclass,
    'public.cms_themes'::regclass,
    'public.cms_design_tokens'::regclass,
    'public.cms_component_definitions'::regclass,
    'public.cms_component_versions'::regclass,
    'public.cms_page_branches'::regclass,
    'public.cms_visual_documents'::regclass,
    'public.cms_visual_symbols'::regclass,
    'public.cms_visual_snapshots'::regclass,
    'public.cms_visual_events'::regclass,
    'public.cms_visual_command_receipts'::regclass,
    'public.cms_site_events'::regclass,
    'public.cms_site_command_receipts'::regclass
  ) and relrowsecurity),
  15,
  'all EV2.9 tables enable RLS'
);
select isnt(has_table_privilege('anon', 'public.cms_visual_documents', 'SELECT'), true, 'anon cannot read visual documents');
select isnt(has_table_privilege('authenticated', 'public.cms_visual_documents', 'SELECT'), true, 'authenticated cannot read visual documents directly');
select isnt(has_table_privilege('authenticated', 'public.cms_sites', 'SELECT'), true, 'authenticated cannot enumerate tenants directly');
select isnt(has_table_privilege('authenticated', 'public.cms_visual_snapshots', 'INSERT'), true, 'authenticated cannot forge snapshots');
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_visual_command(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated cannot bypass the visual command boundary'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_execute_site_command(uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated cannot bypass the site command boundary'
);
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.visual_studio'), false, 'visual flag remains off by default');
select is((select default_enabled from public.cms_feature_flags where flag_key = 'ev2.multisite'), false, 'multisite flag remains off by default');
select is((select count(*)::integer from public.cms_component_definitions where active), 20, 'registry exposes exactly twenty components');
select is((select count(*)::integer from public.cms_component_versions where version = 1), 20, 'all components have immutable version one');
select is((select count(*)::integer from public.cms_sites where not is_synthetic), 1, 'only the primary structural site is non-synthetic');
select is((select count(*)::integer from public.cms_site_domains), 0, 'the migration creates no domain');
select is((select count(*)::integer from public.cms_sites where production_enabled), 0, 'production is disabled for every site');
select is(
  (public.cms_visual_capability(
    '49000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'one bounded individual override enables only the visual candidate'
);
select is(
  (public.cms_sites_capability(
    '49000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  true,
  'one bounded individual override enables only the multisite candidate'
);
select is(
  (public.cms_visual_capability(
    '49000000-0000-4000-8000-000000000101', 'staging', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'an override cannot cross environments'
);
select is(
  (public.cms_visual_capability(
    '49000000-0000-4000-8000-000000000101', 'production', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'production capability fails closed'
);
select is(
  jsonb_array_length(public.cms_get_visual_catalog(
    '49000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute', gen_random_uuid()
  ) -> 'components'),
  20,
  'catalog returns the complete registry'
);
select ok(
  private.cms_json_contains_unsafe_visual_value('"<script>alert(1)</script>"'::jsonb)
  and private.cms_json_contains_unsafe_visual_value('"imagem onload=alert(1)"'::jsonb),
  'the database regex rejects executable tags and arbitrary event handlers'
);

select is(
  pg_temp.visual_command(
    'create_branch',
    p_item_id => '49000000-0000-4000-8000-000000000201',
    p_payload => '{"branchKey":"g9-visual-a","mode":"designer"}',
    p_command_id => '49000000-0000-4000-8000-000000000301',
    p_idempotency_key => '49000000-0000-4000-8000-000000000302',
    p_request_hash => repeat('c', 64),
    p_correlation_id => '49000000-0000-4000-8000-000000000303'
  ) ->> 'status',
  'draft',
  'a visual branch starts from the current v1 draft without publishing'
);
select is(
  (select document #>> '{grid,desktop}' from public.cms_visual_documents limit 1),
  '12',
  'the generated document fixes the desktop grid at twelve columns'
);
select is(
  (select document #>> '{nodes,0,componentVersion}' from public.cms_visual_documents limit 1),
  '1',
  'legacy blocks receive an explicit registry version'
);
select throws_ok(
  $$select private.cms_validate_visual_document(
    jsonb_set(
      (select document from public.cms_visual_documents limit 1),
      '{nodes}',
      (select document -> 'nodes' from public.cms_visual_documents limit 1) || jsonb_build_array(
        jsonb_build_object(
          'id', '49000000-0000-4000-8000-000000000299',
          'type', 'image',
          'hidden', false,
          'width', 'wide',
          'tone', 'light',
          'componentVersion', 1,
          'layout', jsonb_build_object(
            'desktop', jsonb_build_object('span', 12, 'hidden', false),
            'tablet', jsonb_build_object('span', 8, 'hidden', false),
            'mobile', jsonb_build_object('span', 4, 'hidden', false)
          ),
          'data', jsonb_build_object(
            'assetId', '49000000-0000-4000-8000-000000009999',
            'alt', 'Mídia inexistente',
            'fit', 'cover'
          )
        )
      ),
      true
    ),
    'main', 'local', '49000000-0000-4000-8000-000000000201', 'g9-visual-a'
  )$$,
  '23514', 'CMS_VISUAL_MEDIA_REFERENCE_INVALID',
  'visual documents reject nonexistent media references at the database boundary'
);
select is(
  (pg_temp.visual_command(
    'create_branch',
    p_item_id => '49000000-0000-4000-8000-000000000201',
    p_payload => '{"branchKey":"g9-visual-a","mode":"designer"}',
    p_command_id => '49000000-0000-4000-8000-000000000301',
    p_idempotency_key => '49000000-0000-4000-8000-000000000302',
    p_request_hash => repeat('c', 64),
    p_correlation_id => '49000000-0000-4000-8000-000000000303'
  ) ->> 'replayed')::boolean,
  true,
  'the same branch command replays one receipt'
);

select is(
  (pg_temp.visual_command(
    'save_document',
    p_branch_id => (select branch_id from public.cms_visual_command_receipts where command_id = '49000000-0000-4000-8000-000000000301'),
    p_payload => jsonb_build_object(
      'document',
      jsonb_set(
        (select document from public.cms_visual_documents limit 1),
        '{nodes,0,data,text}',
        '"Conteúdo visual atualizado."'::jsonb
      )
    ),
    p_expected_version => 1,
    p_request_hash => repeat('d', 64)
  ) ->> 'documentVersion')::integer,
  2,
  'optimistic save advances the visual document version'
);
select throws_ok(
  $$select pg_temp.visual_command(
    'save_document',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_payload => jsonb_build_object('document', (select document from public.cms_visual_documents limit 1)),
    p_expected_version => 1,
    p_request_hash => repeat('e', 64)
  )$$,
  'PT409', 'CMS_VISUAL_CONFLICT',
  'a stale visual version is rejected without overwrite'
);
select throws_ok(
  $$select pg_temp.visual_command(
    'save_document',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_payload => jsonb_build_object(
      'document', (select document from public.cms_visual_documents limit 1),
      'conflictResolution', jsonb_build_object(
        'strategy', 'replace_remote', 'staleVersion', 1, 'remoteVersion', 2
      )
    ),
    p_expected_version => 2,
    p_request_hash => repeat('9', 64),
    p_command_actor_id => '49000000-0000-4000-8000-000000000103',
    p_command_session_id => 'g9-editor-session'
  )$$,
  '42501', 'CMS_VISUAL_FORBIDDEN',
  'conflict replacement requires designer permission at the database boundary'
);
select is(
  (pg_temp.visual_command(
    'snapshot',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_expected_version => 2,
    p_request_hash => repeat('f', 64)
  ) ->> 'snapshotCount')::integer,
  3,
  'one command captures desktop, tablet and mobile snapshots'
);
select is((select count(*)::integer from public.cms_visual_snapshots), 3, 'the three snapshots are stored once');
select throws_ok(
  $$update public.cms_visual_snapshots set breakpoint = 'mobile' where breakpoint = 'desktop'$$,
  '42501', 'CMS audit records are immutable',
  'snapshots are immutable'
);
select throws_ok(
  $$select pg_temp.visual_command(
    'create_symbol',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_payload => jsonb_build_object(
      'nodeId', (select document #>> '{nodes,0,id}' from public.cms_visual_documents limit 1),
      'symbolKey', 'simbolo-g9', 'name', 'Símbolo G9'
    ),
    p_expected_version => 2,
    p_aal => 'aal1'
  )$$,
  '42501', 'CMS_VISUAL_MFA_REQUIRED',
  'critical symbol creation requires AAL2'
);
select ok(
  (pg_temp.visual_command(
    'create_symbol',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_payload => jsonb_build_object(
      'nodeId', (select document #>> '{nodes,0,id}' from public.cms_visual_documents limit 1),
      'symbolKey', 'simbolo-g9', 'name', 'Símbolo G9'
    ),
    p_expected_version => 2,
    p_request_hash => repeat('1', 64)
  ) ? 'symbolId'),
  'AAL2 creates a same-site symbol'
);
update public.cms_page_branches
set base_draft_version = 2
where branch_key = 'g9-visual-a';
select throws_ok(
  $$select pg_temp.visual_command(
    'apply_to_draft',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_expected_version => 2,
    p_expected_draft_version => 1,
    p_request_hash => repeat('9', 64)
  )$$,
  'PT409', 'CMS_VISUAL_DRAFT_CONFLICT',
  'apply rejects drift from the branch base draft version'
);
update public.cms_page_branches
set base_draft_version = 1
where branch_key = 'g9-visual-a';
select is(
  (pg_temp.visual_command(
    'apply_to_draft',
    p_branch_id => (select id from public.cms_page_branches where branch_key = 'g9-visual-a'),
    p_expected_version => 2,
    p_expected_draft_version => 1,
    p_request_hash => repeat('2', 64)
  ) ->> 'published')::boolean,
  false,
  'apply changes only the editorial draft'
);
select is((select lock_version::integer from public.cms_content_drafts where item_id = '49000000-0000-4000-8000-000000000201'), 2, 'draft lock version advances atomically');
select is((select status from public.cms_page_branches where branch_key = 'g9-visual-a'), 'submitted', 'applied branch becomes submitted');
select is((select count(*)::integer from public.cms_publications where item_id = '49000000-0000-4000-8000-000000000201'), 0, 'visual commands never publish');

select is(
  pg_temp.site_command(
    'create_candidate', 'g9x-tenant-a',
    '{"name":"Tenant A sintético","purpose":"Teste negativo de isolamento A"}',
    p_request_hash => repeat('3', 64)
  ) ->> 'status',
  'pilot',
  'site command creates only a synthetic pilot'
);
select is(
  pg_temp.site_command(
    'create_candidate', 'g9x-tenant-b',
    '{"name":"Tenant B sintético","purpose":"Teste negativo de isolamento B"}',
    p_command_actor_id => '49000000-0000-4000-8000-000000000102',
    p_command_session_id => 'g9-owner-b-session',
    p_request_hash => repeat('4', 64)
  ) ->> 'status',
  'pilot',
  'a second synthetic tenant is isolated by identity'
);
select is((select count(*)::integer from public.cms_site_environments where site_id = (select id from public.cms_sites where site_key = 'g9x-tenant-a') and status = 'locked'), 2, 'both candidate environments remain locked');
select throws_ok(
  $$select pg_temp.site_command(
    'add_domain', 'g9x-tenant-a',
    '{"environment":"local","hostname":"tenant-a.example.com"}',
    p_expected_version => 1
  )$$,
  '22023', 'CMS_SITES_DOMAIN_INVALID',
  'a real domain is rejected before storage'
);
select ok(
  (pg_temp.site_command(
    'add_domain', 'g9x-tenant-a',
    '{"environment":"local","hostname":"tenant-a.invalid"}',
    p_expected_version => 1,
    p_request_hash => repeat('5', 64)
  ) ->> 'domainId') is not null,
  'a reserved invalid domain is accepted as non-operational evidence'
);
select is((select count(*)::integer from public.cms_site_domains where site_id = (select id from public.cms_sites where site_key = 'g9x-tenant-b')), 0, 'tenant A domain never appears in tenant B');
select is(
  exists (
    select 1
    from jsonb_array_elements(public.cms_get_site_registry(
      '49000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
      'g9-operator-session', now() - interval '1 minute', gen_random_uuid()
    ) -> 'sites') site
    where site ->> 'key' = 'g9x-tenant-b'
  ),
  false,
  'tenant A owner cannot enumerate tenant B through the registry'
);
select is(
  exists (
    select 1
    from jsonb_array_elements(public.cms_get_site_registry(
      '49000000-0000-4000-8000-000000000102', 'local', 'main', 'aal2',
      'g9-owner-b-session', now() - interval '1 minute', gen_random_uuid()
    ) -> 'sites') site
    where site ->> 'key' = 'g9x-tenant-a'
  ),
  false,
  'tenant B owner cannot enumerate tenant A through the registry'
);
select throws_ok(
  $$select pg_temp.site_command(
    'suspend_candidate', 'g9x-tenant-b',
    p_expected_version => 1,
    p_request_hash => repeat('8', 64)
  )$$,
  'P0002', 'CMS_SITES_NOT_FOUND',
  'tenant A owner cannot mutate tenant B even with a guessed key'
);
select throws_ok(
  $$select pg_temp.site_command(
    'suspend_candidate', 'g9x-tenant-b', '{}',
    p_expected_version => 1,
    p_aal => 'aal1'
  )$$,
  '42501', 'CMS_SITES_MFA_REQUIRED',
  'site mutations require AAL2'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.visual_studio', 'local', 'site', 'main', true,
  'Ativação ampla sintética deve falhar fechada', now() - interval '1 minute', now() + interval '10 minutes',
  '49000000-0000-4000-8000-000000000101'
);
select is(
  (public.cms_visual_capability(
    '49000000-0000-4000-8000-000000000101', 'local', 'main', 'aal2',
    'g9-operator-session', now() - interval '1 minute'
  ) ->> 'enabled')::boolean,
  false,
  'any broad visual override fails closed'
);
insert into public.cms_scoped_role_assignments (
  user_id, role_key, site_key, environment, grant_type, reason, granted_by
) values (
  '49000000-0000-4000-8000-000000000101', 'super_admin', 'main', 'staging',
  'direct', 'Prova sintética de escopo G9', '49000000-0000-4000-8000-000000000101'
);
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason,
  starts_at, expires_at, created_by
) values (
  'ev2.rbac_scoped', 'staging', 'user', '49000000-0000-4000-8000-000000000101', true,
  'Prova de incompatibilidade de ambiente G9', now() - interval '1 minute', now() + interval '10 minutes',
  '49000000-0000-4000-8000-000000000101'
);
select is(
  private.cms_ev2_actor_authorized_for_scope(
    '49000000-0000-4000-8000-000000000101', 'cms:visual.read', 'local', 'main',
    'aal2', 'g9-operator-session', now() - interval '1 minute'
  ),
  false,
  'G9 cannot reuse a scoped G8 grant from another environment'
);
select is((select count(*)::integer from public.cms_published_projection where item_id = '49000000-0000-4000-8000-000000000201'), 0, 'the entire G9 test leaves the public projection untouched');

select * from finish();
rollback;
