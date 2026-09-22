begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(36);

select has_function(
  'private',
  'cms_cleanup_qa_blog_taxonomy_0106',
  array['uuid', 'text', 'text', 'text', 'text'],
  'the owner-only QA blog taxonomy compensator exists'
);
select has_function(
  'private',
  'cms_cleanup_terminal_qa_blog_taxonomy_0106',
  array[]::text[],
  'the terminal lease trigger function exists'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'zzy_cms_cleanup_qa_blog_taxonomy_0106',
  'the taxonomy cleanup runs after content cleanup in the terminal lane'
);

select isnt(
  has_function_privilege(
    'anon',
    'private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the taxonomy compensator'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot execute the taxonomy compensator'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'the Edge service role cannot execute the internal taxonomy compensator'
);
select isnt(
  has_function_privilege(
    'anon',
    'private.cms_cleanup_terminal_qa_blog_taxonomy_0106()',
    'EXECUTE'
  ),
  true,
  'anonymous callers cannot execute the taxonomy trigger function'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'private.cms_cleanup_terminal_qa_blog_taxonomy_0106()',
    'EXECUTE'
  ),
  true,
  'authenticated callers cannot execute the taxonomy trigger function'
);
select isnt(
  has_function_privilege(
    'service_role',
    'private.cms_cleanup_terminal_qa_blog_taxonomy_0106()',
    'EXECUTE'
  ),
  true,
  'the Edge service role cannot execute the internal taxonomy trigger function'
);
select ok(
  (
    select procedure.prosecdef
      and 'search_path=""' = any(coalesce(procedure.proconfig, array[]::text[]))
    from pg_catalog.pg_proc procedure
    where procedure.oid = to_regprocedure(
      'private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)'
    )
  ),
  'the taxonomy compensator is SECURITY DEFINER with an empty search path'
);
select ok(
  (
    select procedure.prosecdef
      and 'search_path=""' = any(coalesce(procedure.proconfig, array[]::text[]))
    from pg_catalog.pg_proc procedure
    where procedure.oid = to_regprocedure(
      'private.cms_cleanup_terminal_qa_blog_taxonomy_0106()'
    )
  ),
  'the taxonomy trigger function is SECURITY DEFINER with an empty search path'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1060000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-blog-owner@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260922-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    'a1060000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-blog-peer@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260922-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
    now(), now()
  ),
  (
    'a1060000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'qa-blog-retry@example.test', '', now(), '{}',
    '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260922-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',
    now(), now()
  ),
  (
    'a1060000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-blog-owner@example.test', '', now(), '{}',
    '{"synthetic":false,"purpose":"ordinary-operator"}',
    now(), now()
  );

insert into public.cms_profiles (user_id, display_name, status) values
  ('a1060000-0000-4000-8000-000000000001', 'QA blog owner', 'active'),
  ('a1060000-0000-4000-8000-000000000002', 'QA blog peer', 'active'),
  ('a1060000-0000-4000-8000-000000000003', 'QA blog retry', 'active'),
  ('a1060000-0000-4000-8000-000000000004', 'Ordinary blog owner', 'active');

-- Delimita uma janela historica deterministica. O segundo peer permanece
-- explicitamente active apesar do TTL vencido; isso nunca autoriza limpeza.
update private.cms_qa_actor_leases
set created_at = transaction_timestamp() - interval '3 minutes',
    expires_at = case
      when actor_id = 'a1060000-0000-4000-8000-000000000002'
        then transaction_timestamp() - interval '1 minute'
      else transaction_timestamp() + interval '1 minute'
    end
where actor_id in (
  'a1060000-0000-4000-8000-000000000001',
  'a1060000-0000-4000-8000-000000000002'
);

insert into public.cms_blog_authors (
  id, slug, name, created_by, updated_by, created_at, updated_at
) values
  (
    'a1060000-0000-4000-8000-000000000101', 'equipe-qa-gaiatec', 'Equipe QA GAIATEC',
    'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000001',
    transaction_timestamp() - interval '2 minutes', transaction_timestamp() - interval '2 minutes'
  ),
  (
    'a1060000-0000-4000-8000-000000000111', 'autor-corporativo', 'Autor corporativo',
    'a1060000-0000-4000-8000-000000000004', 'a1060000-0000-4000-8000-000000000004',
    transaction_timestamp(), transaction_timestamp()
  );
insert into public.cms_blog_categories (
  id, slug, name, created_by, updated_by, created_at, updated_at
) values
  (
    'a1060000-0000-4000-8000-000000000102', 'homologacao', 'Homologacao',
    'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000001',
    transaction_timestamp() - interval '2 minutes', transaction_timestamp() - interval '2 minutes'
  ),
  (
    'a1060000-0000-4000-8000-000000000112', 'categoria-corporativa', 'Categoria corporativa',
    'a1060000-0000-4000-8000-000000000004', 'a1060000-0000-4000-8000-000000000004',
    transaction_timestamp(), transaction_timestamp()
  );
insert into public.cms_blog_tags (
  id, slug, name, created_by, updated_by, created_at, updated_at
) values
  (
    'a1060000-0000-4000-8000-000000000103', 'qa', 'qa',
    'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000001',
    transaction_timestamp() - interval '2 minutes', transaction_timestamp() - interval '2 minutes'
  ),
  (
    'a1060000-0000-4000-8000-000000000104', 'homologacao', 'homologacao',
    'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000002',
    transaction_timestamp() - interval '2 minutes', transaction_timestamp() - interval '2 minutes'
  ),
  (
    'a1060000-0000-4000-8000-000000000105', 'sintetico', 'sintetico',
    'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000001',
    transaction_timestamp() - interval '2 minutes', transaction_timestamp() - interval '2 minutes'
  ),
  (
    'a1060000-0000-4000-8000-000000000113', 'tag-corporativa', 'tag-corporativa',
    'a1060000-0000-4000-8000-000000000004', 'a1060000-0000-4000-8000-000000000004',
    transaction_timestamp(), transaction_timestamp()
  );

select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where actor_id = 'a1060000-0000-4000-8000-000000000001'$$,
  'the first terminal actor defers taxonomy cleanup while a same-run peer remains active even with expired TTL'
);
select is(
  (
    select count(*)::integer
    from (
      select id from public.cms_blog_authors where created_by = 'a1060000-0000-4000-8000-000000000001'
      union all
      select id from public.cms_blog_categories where created_by = 'a1060000-0000-4000-8000-000000000001'
      union all
      select id from public.cms_blog_tags where created_by = 'a1060000-0000-4000-8000-000000000001'
    ) rows
  ),
  5,
  'same-run taxonomy remains intact until the final active peer terminalizes'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where actor_id = 'a1060000-0000-4000-8000-000000000001'
      and action = 'cms:qa.blog_taxonomy.compensated'
  ),
  0,
  'a deferred cleanup does not claim compensation evidence'
);
select is(
  (select status from private.cms_qa_actor_leases where actor_id = 'a1060000-0000-4000-8000-000000000001'),
  'cleaned',
  'the first actor can complete without taking ownership of the active peer'
);

select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where actor_id = 'a1060000-0000-4000-8000-000000000002'$$,
  'the final same-run actor atomically removes the exact synthetic taxonomy group'
);
select is(
  (
    select count(*)::integer
    from (
      select id from public.cms_blog_authors where created_by in (
        'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000002'
      )
      union all
      select id from public.cms_blog_categories where created_by in (
        'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000002'
      )
      union all
      select id from public.cms_blog_tags where created_by in (
        'a1060000-0000-4000-8000-000000000001', 'a1060000-0000-4000-8000-000000000002'
      )
    ) rows
  ),
  0,
  'the terminal group leaves zero author category or tag residue'
);
select is(
  (
    select count(*)::integer
    from (
      select id from public.cms_blog_authors where created_by = 'a1060000-0000-4000-8000-000000000004'
      union all
      select id from public.cms_blog_categories where created_by = 'a1060000-0000-4000-8000-000000000004'
      union all
      select id from public.cms_blog_tags where created_by = 'a1060000-0000-4000-8000-000000000004'
    ) rows
  ),
  3,
  'ordinary corporate taxonomy remains untouched'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where actor_id = 'a1060000-0000-4000-8000-000000000002'
      and action = 'cms:qa.blog_taxonomy.compensated'
  ),
  1,
  'one immutable receipt records the exact group compensation'
);
select ok(
  (
    select event_data ->> 'authorsRemoved' = '1'
      and event_data ->> 'categoriesRemoved' = '1'
      and event_data ->> 'tagsRemoved' = '3'
      and event_data ->> 'candidateSha' = repeat('a', 40)
      and event_data ->> 'environment' = 'staging'
      and event_data ->> 'terminalStatus' = 'cleaned'
      and event_data ->> 'claimsSha256' ~ '^[0-9a-f]{64}$'
    from public.cms_audit_log
    where actor_id = 'a1060000-0000-4000-8000-000000000002'
      and action = 'cms:qa.blog_taxonomy.compensated'
  ),
  'the receipt binds exact counts SHA environment status and claims digest'
);

insert into public.cms_blog_tags (id, slug, name, created_by, updated_by) values (
  'a1060000-0000-4000-8000-000000000126', 'qa-scope-ambiguous', 'qa-scope-ambiguous',
  'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000004'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-bbbbbbbb',
    repeat('b', 40),
    'staging',
    'cleaned'
  )$$,
  '42501',
  'CMS_QA_BLOG_TAXONOMY_SCOPE_AMBIGUOUS',
  'partial cross-scope taxonomy ownership fails closed while the lease remains active'
);
delete from public.cms_blog_tags where id = 'a1060000-0000-4000-8000-000000000126';

select lives_ok(
  $$do $fixed_slug_reuse$
  begin
    insert into public.cms_blog_authors (
      id, slug, name, created_by, updated_by, created_at, updated_at
    ) values
      ('a1060000-0000-7000-8000-000000000121', 'equipe-qa-gaiatec', 'Equipe QA GAIATEC',
       'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003',
       clock_timestamp(), clock_timestamp());
    insert into public.cms_blog_categories (
      id, slug, name, created_by, updated_by, created_at, updated_at
    ) values
      ('a1060000-0000-4000-8000-000000000122', 'homologacao', 'Homologacao',
       'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003',
       clock_timestamp(), clock_timestamp());
    insert into public.cms_blog_tags (
      id, slug, name, created_by, updated_by, created_at, updated_at
    ) values
      ('a1060000-0000-4000-8000-000000000123', 'qa', 'qa',
       'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003',
       clock_timestamp(), clock_timestamp()),
      ('a1060000-0000-4000-8000-000000000124', 'homologacao', 'homologacao',
       'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003',
       clock_timestamp(), clock_timestamp()),
      ('a1060000-0000-4000-8000-000000000125', 'sintetico', 'sintetico',
       'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003',
       clock_timestamp(), clock_timestamp());
  end
  $fixed_slug_reuse$;$$,
  'a consecutive run can reuse the fixed regression slugs without collision'
);
select is(
  (
    select count(*)::integer
    from (
      select id from public.cms_blog_authors where created_by = 'a1060000-0000-4000-8000-000000000003'
      union all
      select id from public.cms_blog_categories where created_by = 'a1060000-0000-4000-8000-000000000003'
      union all
      select id from public.cms_blog_tags where created_by = 'a1060000-0000-4000-8000-000000000003'
    ) rows
  ),
  5,
  'the retry owns exactly five synthetic taxonomy rows'
);

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by
) values (
  'a1060000-0000-4000-8000-000000000132', 'post', 'qa-taxonomy-malformed-reference', 'draft',
  'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003'
);
insert into public.cms_content_drafts (item_id, payload, provenance, updated_by) values (
  'a1060000-0000-4000-8000-000000000132',
  '{"author":{"id":"not-a-uuid"},"tags":[]}',
  '[{"source":"qa-terminal-taxonomy-0106"}]',
  'a1060000-0000-4000-8000-000000000003'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-bbbbbbbb',
    repeat('b', 40),
    'staging',
    'cleaned'
  )$$,
  '40001',
  'CMS_QA_BLOG_TAXONOMY_REFERENCE_AMBIGUOUS',
  'a malformed structural taxonomy UUID fails closed without deleting the exact group'
);
delete from public.cms_content_drafts where item_id = 'a1060000-0000-4000-8000-000000000132';
delete from public.cms_content_items where id = 'a1060000-0000-4000-8000-000000000132';

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by
) values (
  'a1060000-0000-4000-8000-000000000131', 'post', 'qa-taxonomy-active-reference', 'draft',
  'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003'
);
insert into public.cms_content_drafts (item_id, payload, provenance, updated_by) values (
  'a1060000-0000-4000-8000-000000000131',
  '{"author":{"id":"A1060000-0000-7000-8000-000000000121"},"tags":[]}',
  '[{"source":"qa-terminal-taxonomy-0106"}]',
  'a1060000-0000-4000-8000-000000000003'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-bbbbbbbb',
    repeat('b', 40),
    'staging',
    'cleaned'
  )$$,
  '40001',
  'CMS_QA_BLOG_TAXONOMY_REFERENCE_ACTIVE',
  'an uppercase structural UUID reference blocks taxonomy deletion while content is active'
);
delete from public.cms_content_drafts where item_id = 'a1060000-0000-4000-8000-000000000131';
delete from public.cms_content_items where id = 'a1060000-0000-4000-8000-000000000131';

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, created_by, updated_by
) values (
  'a1060000-0000-4000-8000-000000000133', 'post', 'qa-taxonomy-active-snapshot', 'draft',
  'a1060000-0000-4000-8000-000000000003', 'a1060000-0000-4000-8000-000000000003'
);
insert into public.cms_content_draft_snapshots (
  id, item_id, lock_version, schema_version, payload, provenance, displaced_by
) values (
  'a1060000-0000-4000-8000-000000000134',
  'a1060000-0000-4000-8000-000000000133',
  1,
  1,
  '{"author":{"id":"a1060000-0000-7000-8000-000000000121"},"tags":[]}',
  '[{"source":"qa-terminal-taxonomy-0106"}]',
  'a1060000-0000-4000-8000-000000000003'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-bbbbbbbb',
    repeat('b', 40),
    'staging',
    'cleaned'
  )$$,
  '40001',
  'CMS_QA_BLOG_TAXONOMY_REFERENCE_ACTIVE',
  'an active draft snapshot blocks taxonomy deletion'
);
delete from public.cms_content_items where id = 'a1060000-0000-4000-8000-000000000133';

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, archived_at, created_by, updated_by
) values (
  'a1060000-0000-4000-8000-000000000137',
  'post',
  'qa-taxonomy-archived-cross-scope',
  'archived',
  clock_timestamp(),
  'a1060000-0000-4000-8000-000000000003',
  'a1060000-0000-4000-8000-000000000003'
);
insert into public.cms_content_drafts (item_id, payload, provenance, updated_by) values (
  'a1060000-0000-4000-8000-000000000137',
  '{"author":{"id":"a1060000-0000-7000-8000-000000000121"},"tags":[]}',
  '[{"source":"ordinary-history"}]',
  'a1060000-0000-4000-8000-000000000004'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-bbbbbbbb',
    repeat('b', 40),
    'staging',
    'cleaned'
  )$$,
  '40001',
  'CMS_QA_BLOG_TAXONOMY_REFERENCE_ACTIVE',
  'an archived cross-scope child reference blocks taxonomy deletion'
);
delete from public.cms_content_drafts where item_id = 'a1060000-0000-4000-8000-000000000137';
delete from public.cms_content_items where id = 'a1060000-0000-4000-8000-000000000137';

insert into public.cms_content_items (
  id, content_type, slug, workflow_status, archived_at, created_by, updated_by
) values (
  'a1060000-0000-4000-8000-000000000135',
  'post',
  'qa-taxonomy-archived-snapshot',
  'archived',
  clock_timestamp(),
  'a1060000-0000-4000-8000-000000000003',
  'a1060000-0000-4000-8000-000000000003'
);
insert into public.cms_content_draft_snapshots (
  id, item_id, lock_version, schema_version, payload, provenance, displaced_by
) values (
  'a1060000-0000-4000-8000-000000000136',
  'a1060000-0000-4000-8000-000000000135',
  1,
  1,
  '{"author":{"id":"a1060000-0000-7000-8000-000000000121"},"tags":[]}',
  '[{"source":"qa-terminal-taxonomy-0106"}]',
  'a1060000-0000-4000-8000-000000000003'
);

select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where actor_id = 'a1060000-0000-4000-8000-000000000003'$$,
  'the consecutive run also reaches terminal zero residue'
);
select is(
  (
    select count(*)::integer
    from (
      select id from public.cms_blog_authors where created_by = 'a1060000-0000-4000-8000-000000000003'
      union all
      select id from public.cms_blog_categories where created_by = 'a1060000-0000-4000-8000-000000000003'
      union all
      select id from public.cms_blog_tags where created_by = 'a1060000-0000-4000-8000-000000000003'
    ) rows
  ),
  0,
  'the consecutive terminal run leaves no taxonomy residue'
);
select is(
  (
    select count(*)::integer
    from public.cms_content_draft_snapshots
    where id = 'a1060000-0000-4000-8000-000000000136'
  ),
  1,
  'an archived same-run snapshot remains as history without blocking cleanup'
);
select lives_ok(
  $$update private.cms_qa_actor_leases
    set status = status
    where actor_id = 'a1060000-0000-4000-8000-000000000003'$$,
  'replaying a terminal status update is a no-op'
);
select is(
  (
    select count(*)::integer from public.cms_audit_log
    where actor_id = 'a1060000-0000-4000-8000-000000000003'
      and action = 'cms:qa.blog_taxonomy.compensated'
  ),
  1,
  'terminal replay does not duplicate taxonomy compensation evidence'
);
select throws_ok(
  $$select private.cms_cleanup_qa_blog_taxonomy_0106(
    'a1060000-0000-4000-8000-000000000003',
    'QA-CMS-FINAL-20260922-cccccccc',
    repeat('c', 40),
    'staging',
    'cleaned'
  )$$,
  '42501',
  'CMS_QA_BLOG_TAXONOMY_CLEANUP_LEASE_MISMATCH',
  'a mismatched run SHA or environment fails closed'
);
select is(
  (
    select count(*)::integer
    from public.cms_blog_authors author
    where author.slug = 'autor-corporativo'
  ),
  1,
  'failure closure cannot mutate ordinary taxonomy'
);
select ok(
  not exists (
    select 1
    from (
      select author.created_by, author.updated_by from public.cms_blog_authors author
      union all
      select category.created_by, category.updated_by from public.cms_blog_categories category
      union all
      select tag.created_by, tag.updated_by from public.cms_blog_tags tag
    ) taxonomy
    join private.cms_qa_actor_leases creator on creator.actor_id = taxonomy.created_by
    join private.cms_qa_actor_leases updater on updater.actor_id = taxonomy.updated_by
    where creator.status in ('cleaned', 'expired')
      and updater.status in ('cleaned', 'expired')
      and creator.run_tag = updater.run_tag
      and creator.candidate_sha = updater.candidate_sha
      and creator.environment = updater.environment
      and not exists (
        select 1 from private.cms_qa_actor_leases active_peer
        where active_peer.run_tag = creator.run_tag
          and active_peer.candidate_sha = creator.candidate_sha
          and active_peer.environment = creator.environment
          and active_peer.status = 'active'
      )
  ),
  'no exact terminal lease group retains author category or tag residue'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where action = 'cms:qa.blog_taxonomy.compensated'
  ),
  2,
  'only the two completed synthetic groups emit cleanup receipts'
);

select * from finish();
rollback;
