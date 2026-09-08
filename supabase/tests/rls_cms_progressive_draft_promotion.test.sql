begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '79000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'draft.promotion.owner@example.test', '', now(), '{}', '{}', now(), now()
  ),
  (
    '79000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'draft.promotion.denied@example.test', '', now(), '{}', '{}', now(), now()
  );

insert into public.cms_profiles (user_id, display_name, display_email, status)
values
  ('79000000-0000-4000-8000-000000000001', 'Owner da promoção', 'draft.promotion.owner@example.test', 'active'),
  ('79000000-0000-4000-8000-000000000002', 'Operador sem papel', 'draft.promotion.denied@example.test', 'active');

insert into public.cms_user_roles (user_id, role_key)
values ('79000000-0000-4000-8000-000000000001', 'super_admin');

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, starts_at, expires_at, created_by
) values (
  'ev2.draft_v2', 'local', 'user', '79000000-0000-4000-8000-000000000001', true,
  'Homologação local da promoção atômica', now() - interval '1 minute', now() + interval '29 minutes',
  '79000000-0000-4000-8000-000000000001'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_promote_draft_v2_to_content(uuid,uuid,bigint,text,jsonb,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'an authenticated client cannot call the promotion RPC directly'
);

select is(
  has_function_privilege(
    'service_role',
    'public.cms_promote_draft_v2_to_content(uuid,uuid,bigint,text,jsonb,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'the Edge service role can call the promotion RPC'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '79000000-0000-4000-8000-000000000001', 'create', null, 'post', 'Artigo progressivo',
    null, null, null, 'local', 'main', 'aal2', 'promotion-owner-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000010', '79000000-0000-4000-8000-000000000011',
    repeat('a', 64), '79000000-0000-4000-8000-000000000012'
  )$$,
  'an authorized operator creates the progressive source draft'
);

select lives_ok(
  $$select public.cms_promote_draft_v2_to_content(
    '79000000-0000-4000-8000-000000000001',
    (select id from public.cms_content_drafts_v2 where working_title='Artigo progressivo'),
    1, 'qa-cms-final-promocao-atomica',
    '{"schemaVersion":1,"consumerId":"cms.synthetic-article.v1","contentType":"post","title":"QA promoção atômica","blocks":[],"provenance":[{"rightsConfirmed":true}]}'::jsonb,
    'Concluir cadastro sintético homologado', 'local', 'main', 'aal2',
    'promotion-owner-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000020', '79000000-0000-4000-8000-000000000021',
    repeat('b', 64), '79000000-0000-4000-8000-000000000022'
  )$$,
  'promotion creates the canonical item and closes the shadow draft atomically'
);

select is(
  (select status from public.cms_content_drafts_v2 where working_title='Artigo progressivo'),
  'promoted',
  'the promoted draft is no longer resumable as active'
);

select ok(
  (select promoted_at is not null and promoted_item_id is not null
   from public.cms_content_drafts_v2 where working_title='Artigo progressivo'),
  'promotion records its timestamp and canonical item reference'
);

select is(
  (select count(*)::integer from public.cms_content_items
   where content_type='post' and slug='qa-cms-final-promocao-atomica'),
  1,
  'promotion creates exactly one canonical content item'
);

select is(
  (select count(*)::integer
   from public.cms_content_drafts canonical
   join public.cms_content_drafts_v2 progressive on progressive.promoted_item_id=canonical.item_id
   where progressive.working_title='Artigo progressivo'),
  1,
  'the canonical item contains its editable editorial draft'
);

select is(
  (select count(*)::integer from public.cms_published_projection projection
   join public.cms_content_drafts_v2 draft on draft.promoted_item_id=projection.item_id
   where draft.working_title='Artigo progressivo'),
  0,
  'promotion never publishes content implicitly'
);

select is(
  (select count(*)::integer from public.cms_draft_v2_events event
   join public.cms_content_drafts_v2 draft on draft.id=event.draft_id
   where draft.working_title='Artigo progressivo' and event.event_type='promoted'),
  1,
  'promotion appends one immutable progressive event'
);

select is(
  (select count(*)::integer from public.cms_audit_log
   where action='cms:drafts_v2.promote'
     and target_id=(select id::text from public.cms_content_drafts_v2 where working_title='Artigo progressivo')),
  1,
  'promotion writes a dedicated audit event'
);

select is(
  (
    public.cms_promote_draft_v2_to_content(
      '79000000-0000-4000-8000-000000000001',
      (select id from public.cms_content_drafts_v2 where working_title='Artigo progressivo'),
      1, 'qa-cms-final-promocao-atomica',
      '{"schemaVersion":1,"consumerId":"cms.synthetic-article.v1","contentType":"post","title":"QA promoção atômica","blocks":[],"provenance":[{"rightsConfirmed":true}]}'::jsonb,
      'Concluir cadastro sintético homologado', 'local', 'main', 'aal2',
      'promotion-owner-session', now() - interval '1 minute',
      '79000000-0000-4000-8000-000000000020', '79000000-0000-4000-8000-000000000021',
      repeat('b', 64), '79000000-0000-4000-8000-000000000022'
    ) ->> 'replayed'
  )::boolean,
  true,
  'an identical retry replays the original promotion receipt'
);

select is(
  (select count(*)::integer from public.cms_content_items
   where content_type='post' and slug='qa-cms-final-promocao-atomica'),
  1,
  'idempotent replay never duplicates canonical content'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '79000000-0000-4000-8000-000000000001', 'create', null, 'post', 'Promoção inválida',
    null, null, null, 'local', 'main', 'aal2', 'promotion-owner-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000030', '79000000-0000-4000-8000-000000000031',
    repeat('c', 64), '79000000-0000-4000-8000-000000000032'
  )$$,
  'a second progressive draft is available for rollback validation'
);

select throws_ok(
  $$select public.cms_promote_draft_v2_to_content(
    '79000000-0000-4000-8000-000000000001',
    (select id from public.cms_content_drafts_v2 where working_title='Promoção inválida'),
    1, 'qa-cms-final-promocao-invalida',
    '{"schemaVersion":1,"consumerId":"cms.catalog-product.v1","contentType":"product","blocks":[],"provenance":[{"rightsConfirmed":true}]}'::jsonb,
    'Validar rollback integral da promoção', 'local', 'main', 'aal2',
    'promotion-owner-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000040', '79000000-0000-4000-8000-000000000041',
    repeat('d', 64), '79000000-0000-4000-8000-000000000042'
  )$$,
  '23514',
  'CMS_DRAFT_V2_PROMOTION_INVALID',
  'a mismatched payload aborts the promotion transaction'
);

select is(
  (select status from public.cms_content_drafts_v2 where working_title='Promoção inválida'),
  'active',
  'a failed promotion leaves the progressive draft active'
);

select is(
  (select count(*)::integer from public.cms_content_items
   where slug='qa-cms-final-promocao-invalida'),
  0,
  'a failed promotion leaves no canonical item behind'
);

select throws_ok(
  $$select public.cms_promote_draft_v2_to_content(
    '79000000-0000-4000-8000-000000000002',
    (select id from public.cms_content_drafts_v2 where working_title='Promoção inválida'),
    1, 'qa-cms-final-promocao-negada',
    '{"schemaVersion":1,"consumerId":"cms.synthetic-article.v1","contentType":"post","blocks":[],"provenance":[{"rightsConfirmed":true}]}'::jsonb,
    'Tentativa negativa sem permissão', 'local', 'main', 'aal2',
    'promotion-denied-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000050', '79000000-0000-4000-8000-000000000051',
    repeat('e', 64), '79000000-0000-4000-8000-000000000052'
  )$$,
  '42501',
  'CMS_DRAFT_V2_FORBIDDEN',
  'an unauthorized actor cannot promote a progressive draft'
);

insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, starts_at, expires_at, created_by
) values (
  'ev2.draft_v2', 'production', 'site', 'main', true,
  'Tentativa negativa de ativação ampla', now() - interval '1 minute', now() + interval '29 minutes',
  '79000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$select public.cms_draft_v2_assert_available(
    '79000000-0000-4000-8000-000000000001', 'production', 'main', 'aal1',
    'promotion-production-session', now() - interval '1 minute'
  )$$,
  '22023',
  'CMS_DRAFT_V2_COMMAND_INVALID',
  'production progressive drafts reject an AAL1 session'
);

select throws_ok(
  $$select public.cms_draft_v2_assert_available(
    '79000000-0000-4000-8000-000000000001', 'production', 'main', 'aal2',
    'promotion-production-session', now() - interval '1 minute'
  )$$,
  '42501',
  'CMS_DRAFT_V2_FEATURE_DISABLED',
  'a broad production override fails closed'
);

delete from public.cms_feature_flag_overrides
where flag_key='ev2.draft_v2' and environment='production' and scope_type='site' and scope_key='main';
insert into public.cms_feature_flag_overrides (
  flag_key, environment, scope_type, scope_key, enabled, reason, starts_at, expires_at, created_by
) values (
  'ev2.draft_v2', 'production', 'user', '79000000-0000-4000-8000-000000000001', true,
  'Janela individual de homologação em produção', now() - interval '1 minute', now() + interval '29 minutes',
  '79000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$select public.cms_draft_v2_assert_available(
    '79000000-0000-4000-8000-000000000001', 'production', 'main', 'aal2',
    'promotion-production-session', now() - interval '1 minute'
  )$$,
  'one short individual production override enables the AAL2 operator'
);

select lives_ok(
  $$select public.cms_execute_draft_v2_command(
    '79000000-0000-4000-8000-000000000001', 'create', null, 'post', 'Rascunho de produção',
    null, null, null, 'production', 'main', 'aal2', 'promotion-production-session', now() - interval '1 minute',
    '79000000-0000-4000-8000-000000000060', '79000000-0000-4000-8000-000000000061',
    repeat('f', 64), '79000000-0000-4000-8000-000000000062'
  )$$,
  'the authorized production operator can persist a recoverable progressive draft'
);

select is(
  (select environment from public.cms_content_drafts_v2 where working_title='Rascunho de produção'),
  'production',
  'the production scope is stored explicitly on the shadow record'
);

select * from finish();
rollback;
