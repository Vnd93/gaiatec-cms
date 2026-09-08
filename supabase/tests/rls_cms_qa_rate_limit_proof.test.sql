begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

select has_table(
  'private', 'cms_qa_rate_limit_proof_buckets',
  'the private disposable QA rate-limit bucket registry exists'
);
select has_function(
  'public', 'cms_qa_rate_limit_proof',
  array['uuid','text','text','text','text','text'],
  'the staging-only QA rate-limit proof RPC exists'
);
select has_trigger(
  'private', 'cms_qa_actor_leases', 'cms_05_qa_rate_limit_proof_cleanup_0080',
  'terminal lease cleanup removes disposable proof buckets'
);
select isnt(
  has_function_privilege(
    'anon', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE'
  ),
  true,
  'anonymous callers cannot invoke the proof RPC'
);
select isnt(
  has_function_privilege(
    'authenticated', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE'
  ),
  true,
  'ordinary authenticated callers cannot invoke the proof RPC directly'
);
select ok(
  has_function_privilege(
    'service_role', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE'
  ),
  'only the trusted Edge service boundary can invoke the proof RPC'
);
select isnt(
  has_table_privilege('service_role', 'private.cms_qa_rate_limit_proof_buckets', 'SELECT'),
  true,
  'the Edge service role cannot inspect raw bucket bindings'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '80000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'qa-rate-proof@example.test', '', now(), '{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
  now(), now()
), (
  '80000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'qa-rate-proof-other@example.test', '', now(), '{}',
  '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260907-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',
  now(), now()
);

select throws_ok(
  $$select public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
    'production', repeat('b', 64), 'consume'
  )$$,
  '22023', 'CMS_QA_RATE_LIMIT_PROOF_INVALID',
  'the database proof primitive refuses production explicitly'
);
select throws_ok(
  $$select public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-bbbbbbbb', repeat('b', 40),
    'staging', repeat('b', 64), 'consume'
  )$$,
  '42501', 'CMS_QA_RATE_LIMIT_PROOF_FORBIDDEN',
  'a valid actor cannot substitute another run tag or candidate SHA'
);
select is(
  public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
    'staging', repeat('b', 64), 'consume'
  ) ->> 'status',
  'allowed',
  'the exact active staging lease consumes its isolated bucket'
);
select is(
  (
    public.cms_qa_rate_limit_proof(
      '80000000-0000-4000-8000-000000000001',
      'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
      'staging', repeat('b', 64), 'consume'
    ) ->> 'requestCount'
  )::integer,
  2,
  'the second request increments only the isolated proof bucket'
);
select is(
  public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
    'staging', repeat('b', 64), 'consume'
  ) ->> 'status',
  'allowed',
  'the fixed third request remains within the proof limit'
);
select is(
  public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
    'staging', repeat('b', 64), 'consume'
  ) ->> 'status',
  'limited',
  'the fourth real transaction is rate limited'
);
select ok(
  (
    public.cms_qa_rate_limit_proof(
      '80000000-0000-4000-8000-000000000001',
      'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
      'staging', repeat('b', 64), 'consume'
    ) ->> 'retryAfterSeconds'
  )::integer between 1 and 3,
  'the limited response reports a bounded recovery window'
);
select is(
  (select count(*)::integer from private.cms_qa_rate_limit_proof_buckets),
  1,
  'one private binding tracks the disposable proof bucket'
);
select ok(
  (
    public.cms_qa_rate_limit_proof(
      '80000000-0000-4000-8000-000000000001',
      'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
      'staging', repeat('b', 64), 'cleanup'
    ) ->> 'removed'
  )::boolean,
  'explicit cleanup removes the exact same-lease bucket'
);
select is(
  (
    select count(*)::integer
    from public.request_rate_limits
    where key_hash = repeat('b', 64) and action = 'cms_public_search_qa_proof'
  ),
  0,
  'explicit cleanup leaves no rate-limit row'
);
select is(
  (select count(*)::integer from private.cms_qa_rate_limit_proof_buckets),
  0,
  'explicit cleanup leaves no private binding'
);
select ok(
  (
    public.cms_qa_rate_limit_proof(
      '80000000-0000-4000-8000-000000000001',
      'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
      'staging', repeat('b', 64), 'cleanup'
    ) ->> 'idempotent'
  )::boolean,
  'cleanup is idempotent when the exact bucket is already absent'
);

do $$
begin
  perform public.cms_qa_rate_limit_proof(
    '80000000-0000-4000-8000-000000000001',
    'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
    'staging', repeat('c', 64), 'consume'
  );
end;
$$;
select isnt(
  (
    public.cms_qa_rate_limit_proof(
      '80000000-0000-4000-8000-000000000002',
      'QA-CMS-FINAL-20260907-aaaaaaaa', repeat('a', 40),
      'staging', repeat('c', 64), 'cleanup'
    ) ->> 'removed'
  )::boolean,
  true,
  'another active QA lease cannot remove the owner lease proof bucket'
);
select is(
  (
    select count(*)::integer from public.request_rate_limits
    where key_hash = repeat('c', 64) and action = 'cms_public_search_qa_proof'
  ),
  1,
  'cross-lease cleanup leaves the owner bucket intact'
);
update private.cms_qa_actor_leases
set status = 'cleaned', cleaned_at = clock_timestamp()
where actor_id = '80000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)::integer from public.request_rate_limits
    where key_hash = repeat('c', 64) and action = 'cms_public_search_qa_proof'
  ) + (select count(*)::integer from private.cms_qa_rate_limit_proof_buckets),
  0,
  'terminal lease cleanup also removes an abandoned proof bucket atomically'
);
select ok(
  (
    select bool_or(event_data ->> 'bucketRemoved' = 'true')
      and bool_and(event_data::text not like '%' || repeat('b', 64) || '%')
    from public.cms_audit_log
    where action = 'cms:qa.rate_limit_proof_cleanup'
      and actor_id = '80000000-0000-4000-8000-000000000001'
  ),
  'cleanup retains immutable evidence without the bucket key or proof UUID'
);

select * from finish();
rollback;
