begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

-- The Node contract binds these expressions to the actual SQL generator.
-- Exercise PostgreSQL name resolution, not a JavaScript approximation.
create temporary table qa_browser_fixture_drafts(case_name text, provenance jsonb);
insert into qa_browser_fixture_drafts values
  ('exact', '[{"authorizationReference":"QA-CMS-FINAL-20260907-aaaaaaaa"}]'),
  ('later-valid', '[{"authorizationReference":"other"},{"authorizationReference":"QA-CMS-FINAL-20260907-aaaaaaaa"}]'),
  ('other-run', '[{"authorizationReference":"QA-CMS-FINAL-20260908-aaaaaaaa"}]'),
  ('other-sha', '[{"authorizationReference":"QA-CMS-FINAL-20260907-bbbbbbbb"}]'),
  ('empty', '[]'),
  ('missing-reference', '[{}]');

create temporary view qa_browser_fixture_provenance_result as
select draft.case_name, exists (
  select 1 from jsonb_array_elements(draft.provenance) as provenance_entry(value)
  where provenance_entry.value->>'authorizationReference'='QA-CMS-FINAL-20260907-aaaaaaaa'
) as accepted
from qa_browser_fixture_drafts draft;

select results_eq(
  $$select case_name from qa_browser_fixture_provenance_result where accepted order by case_name$$,
  $$values ('exact'::text), ('later-valid'::text)$$,
  'accept the exact entry, including one after an unrelated entry'
);
select is(
  (select count(*) from qa_browser_fixture_provenance_result where not accepted),
  4::bigint,
  'reject empty, absent authorization and other run or SHA'
);
select ok(
  not exists (
    select 1 from qa_browser_fixture_drafts draft
    where draft.case_name='exact' and exists (
      select 1 from jsonb_array_elements(draft.provenance) provenance
      where provenance->>'authorizationReference'='QA-CMS-FINAL-20260907-aaaaaaaa'
    )
  ),
  'reproduce the old alias collision against the enclosing provenance column'
);

create temporary table qa_browser_fixture_leases(
  case_name text, created_at timestamptz, expires_at timestamptz,
  original_expires_at timestamptz, content_created_at timestamptz
);
insert into qa_browser_fixture_leases values
  ('active', now()-interval '5 minutes', now()+interval '45 minutes',
   now()+interval '45 minutes', now()-interval '4 minutes'),
  ('already-expired', now()-interval '5 minutes', now()-interval '2 minutes',
   now()-interval '2 minutes', now()-interval '4 minutes');

update qa_browser_fixture_leases lease
set expires_at=least(lease.expires_at, clock_timestamp());
select ok(
  (select bool_and(expires_at <= original_expires_at) from qa_browser_fixture_leases),
  'recovery never extends an expired or active lease'
);
select ok(
  (select bool_and(expires_at <= clock_timestamp()) from qa_browser_fixture_leases),
  'every recovered lease becomes immediately eligible for the installed sweeper'
);
select ok(
  (select bool_and(content_created_at between created_at and expires_at) from qa_browser_fixture_leases),
  'preserve the original creation window required by draft and taxonomy cleanup'
);
select ok(
  (select bool_and(content_created_at > created_at+interval '1 microsecond') from qa_browser_fixture_leases),
  'reproduce why shrinking the expiry to creation invalidated valid owned content'
);

select * from finish();
rollback;
