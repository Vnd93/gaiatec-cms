begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table cms_editorial_test_results (seq integer not null, result text not null);
grant insert, select on cms_editorial_test_results to authenticated;
insert into cms_editorial_test_results values (0, plan(20));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('33000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.editorial.super@example.test', '', now(), '{}', '{}', now(), now()),
  ('33000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.editorial.editor@example.test', '', now(), '{}', '{}', now(), now()),
  ('33000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.editorial.only@example.test', '', now(), '{}', '{}', now(), now());

insert into public.cms_profiles (user_id, display_name, display_email, status)
values
  ('33000000-0000-0000-0000-000000000001', 'Super editorial', 'cms.editorial.super@example.test', 'active'),
  ('33000000-0000-0000-0000-000000000002', 'Editor editorial', 'cms.editorial.editor@example.test', 'active');

insert into public.cms_user_roles (user_id, role_key)
values
  ('33000000-0000-0000-0000-000000000001', 'super_admin'),
  ('33000000-0000-0000-0000-000000000002', 'editor');

insert into cms_editorial_test_results select 1, is(
  (select count(*)::integer from information_schema.tables where table_schema = 'public' and table_name in (
    'cms_taxonomy_terms', 'cms_content_items', 'cms_content_drafts', 'cms_content_revisions',
    'cms_content_taxonomy', 'cms_publications', 'cms_publication_outbox', 'cms_editorial_command_receipts'
  )),
  8,
  'eight empty-by-default editorial tables exist'
);

insert into cms_editorial_test_results select 2, is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_taxonomy_terms'::regclass, 'public.cms_content_items'::regclass,
    'public.cms_content_drafts'::regclass, 'public.cms_content_revisions'::regclass,
    'public.cms_content_taxonomy'::regclass, 'public.cms_publications'::regclass,
    'public.cms_publication_outbox'::regclass, 'public.cms_editorial_command_receipts'::regclass
  ) and relrowsecurity),
  8,
  'all editorial tables enforce RLS'
);

insert into cms_editorial_test_results select 3, isnt(
  has_table_privilege('anon', 'public.cms_content_items', 'SELECT'),
  true,
  'anonymous users cannot read administrative content'
);

insert into cms_editorial_test_results select 4, isnt(
  has_table_privilege('authenticated', 'public.cms_content_items', 'INSERT'),
  true,
  'authenticated frontend cannot insert content directly'
);

insert into cms_editorial_test_results select 5, isnt(
  has_table_privilege('authenticated', 'public.cms_editorial_command_receipts', 'SELECT'),
  true,
  'frontend cannot read editorial idempotency receipts'
);

insert into cms_editorial_test_results select 6, throws_ok(
  $$insert into public.cms_taxonomy_terms (id, taxonomy_type, slug, name, created_by, updated_by)
    values ('33000000-0000-0000-0000-000000000101', 'category', 'categoria-invalida', 'Categoria invalida',
      '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002')$$,
  '23514',
  'CMS_TAXONOMY_PARENT_REQUIRED',
  'category without segment parent is rejected'
);

insert into public.cms_taxonomy_terms (id, taxonomy_type, parent_id, slug, name, created_by, updated_by)
values
  ('33000000-0000-0000-0000-000000000110', 'segment', null, 'segmento-sintetico', 'Segmento sintetico', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000111', 'category', '33000000-0000-0000-0000-000000000110', 'categoria-sintetica', 'Categoria sintetica', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000112', 'family', '33000000-0000-0000-0000-000000000111', 'familia-sintetica', 'Familia sintetica', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002');

insert into cms_editorial_test_results select 7, is(
  (select count(*)::integer from public.cms_taxonomy_terms),
  3,
  'segment category and family form the allowed hierarchy'
);

insert into cms_editorial_test_results select 8, ok(public.cms_editorial_transition_allowed('draft', 'save'), 'draft can be saved');
insert into cms_editorial_test_results select 9, ok(public.cms_editorial_transition_allowed('draft', 'submit'), 'draft can enter review');
insert into cms_editorial_test_results select 10, ok(public.cms_editorial_transition_allowed('in_review', 'approve'), 'reviewed content can be approved');
insert into cms_editorial_test_results select 11, ok(public.cms_editorial_transition_allowed('approved', 'publish'), 'approved content can be published');
insert into cms_editorial_test_results select 12, isnt(public.cms_editorial_transition_allowed('draft', 'publish'), true, 'draft cannot skip directly to publication');

insert into public.cms_content_items (id, content_type, slug, created_by, updated_by)
values
  ('33000000-0000-0000-0000-000000000201', 'product', 'produto-sintetico', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000202', 'post', 'post-sintetico', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000203', 'service', 'servico-sintetico', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000204', 'product', 'produto-sintetico-dois', '33000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000002');

insert into public.cms_content_revisions (id, item_id, revision_number, schema_version, payload, seo, provenance, source_draft_version, reason, created_by)
values ('33000000-0000-0000-0000-000000000301', '33000000-0000-0000-0000-000000000201', 1, 1, '{}', '{}', '{}', 1, 'Revisao sintetica inicial', '33000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '33000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'session_id', 'editor-editorial-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);

insert into cms_editorial_test_results select 13, is(
  (select count(*)::integer from public.cms_content_items),
  4,
  'editor reads only domains granted by explicit CMS permissions'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', '33000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'session_id', 'rdo-editorial-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into cms_editorial_test_results select 14, is(
  (select count(*)::integer from public.cms_content_items),
  0,
  'RDO-only identity reads no CMS editorial data'
);

select set_config('request.jwt.claims', jsonb_build_object('sub', '33000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'session_id', 'editor-editorial-session', 'aal', 'aal1', 'iat', extract(epoch from now())::bigint)::text, true);
insert into cms_editorial_test_results select 15, throws_ok(
  $$update public.cms_content_items set slug = 'mudanca-direta' where id = '33000000-0000-0000-0000-000000000201'$$,
  '42501',
  null,
  'authenticated frontend cannot mutate a draft directly'
);

reset role;
insert into cms_editorial_test_results select 16, throws_ok(
  $$update public.cms_content_revisions set reason = 'Mutacao indevida' where id = '33000000-0000-0000-0000-000000000301'$$,
  '42501',
  'CMS audit records are immutable',
  'content revisions cannot be changed even by privileged database code'
);

insert into cms_editorial_test_results select 17, throws_ok(
  $$insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
    values ('33000000-0000-0000-0000-000000000204', '33000000-0000-0000-0000-000000000301',
      'cms:product:33000000-0000-0000-0000-000000000204', '33000000-0000-0000-0000-000000000001')$$,
  '23503',
  null,
  'publication cannot point to a revision from another item'
);

insert into cms_editorial_test_results select 18, lives_ok(
  $$insert into public.cms_publications (item_id, revision_id, cache_tag, published_by)
    values ('33000000-0000-0000-0000-000000000201', '33000000-0000-0000-0000-000000000301',
      'cms:product:33000000-0000-0000-0000-000000000201', '33000000-0000-0000-0000-000000000001')$$,
  'publication accepts the exact immutable revision for its item'
);

insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
values ('33000000-0000-0000-0000-000000000201', '33000000-0000-0000-0000-000000000301', 'publish', '33000000-0000-0000-0000-000000000401');

insert into cms_editorial_test_results select 19, throws_ok(
  $$insert into public.cms_publication_outbox (item_id, revision_id, event_type, correlation_id)
    values ('33000000-0000-0000-0000-000000000201', '33000000-0000-0000-0000-000000000301', 'publish', gen_random_uuid())$$,
  '23505',
  null,
  'publication outbox deduplicates the same item revision and event'
);

insert into cms_editorial_test_results select 20, is(
  public.cms_content_permission('product', 'publish'),
  'cms:products.publish',
  'content action maps to an exact domain permission'
);

insert into cms_editorial_test_results select 21, result from finish() as result;
select result from cms_editorial_test_results order by seq;
rollback;
