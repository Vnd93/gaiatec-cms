begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_function(
  'private','cms_public_relation_ids_0085',array['jsonb'],
  'the publication gate exposes an owner-only relation extractor'
);
select has_function(
  'private','cms_public_relation_count_0085',array['jsonb'],
  'the publication gate exposes an owner-only distinct counter'
);
select has_function(
  'private','cms_enforce_public_relation_limit_0085',array[]::text[],
  'the publication gate has a trigger function'
);
select has_trigger(
  'public','cms_published_projection','cms_00_enforce_public_relation_limit_0085',
  'every projection insert and payload update crosses the relation gate'
);
select isnt(has_function_privilege(
  'service_role','private.cms_public_relation_ids_0085(jsonb)','execute'
),true,'the relation extractor remains owner-only');
select isnt(has_function_privilege(
  'authenticated','private.cms_public_relation_count_0085(jsonb)','execute'
),true,'authenticated users cannot invoke the relation counter');
select isnt(has_function_privilege(
  'anon','private.cms_enforce_public_relation_limit_0085()','execute'
),true,'anonymous users cannot invoke the publication trigger helper');

select is(private.cms_public_relation_count_0085('{}'),0,
  'a projection without public relations has zero references');
select is(private.cms_public_relation_count_0085(
  '{"relations":{"productIds":["85000000-0000-4000-8000-000000000001","85000000-0000-4000-8000-000000000002"]},"blocks":[{"type":"related_content","data":{"itemIds":["85000000-0000-4000-8000-000000000002","85000000-0000-4000-8000-000000000003"]}}]}'
),3,'general and block relations are aggregated and deduplicated');
select is(private.cms_public_relation_count_0085(
  '{"relations":{"productIds":["85000000-0000-4000-8000-000000000001"]},"blocks":[{"type":"related_content","data":{"itemIds":["85000000-0000-4000-8000-000000000001"]}}]}'
),1,'the same UUID in different relation sources consumes one slot');

create temporary table cms_relation_limit_fixture(payload jsonb not null);
create trigger cms_relation_limit_fixture_gate
before insert or update of payload on cms_relation_limit_fixture
for each row execute function private.cms_enforce_public_relation_limit_0085();

select lives_ok($test$
  insert into cms_relation_limit_fixture(payload)
  select jsonb_build_object(
    'relations',jsonb_build_object(
      'productIds',(
        select jsonb_agg(
          '85000000-0000-4000-8000-' || lpad(value::text,12,'0') order by value
        ) from generate_series(1,499) value
      )
    ),
    'blocks',jsonb_build_array(jsonb_build_object(
      'type','related_content','data',jsonb_build_object(
        'itemIds',jsonb_build_array(
          '85000000-0000-4000-8000-000000000499',
          '85000000-0000-4000-8000-000000000500'
        )
      )
    ))
  )
$test$,'exactly 500 aggregate distinct relations remain publishable');

select throws_ok($test$
  insert into cms_relation_limit_fixture(payload)
  select jsonb_build_object('relations',jsonb_build_object(
    'productIds',(
      select jsonb_agg(
        '85000000-0000-4000-8000-' || lpad(value::text,12,'0') order by value
      ) from generate_series(1,501) value
    )
  ))
$test$,'23514','CMS_PUBLIC_RELATION_LIMIT_EXCEEDED',
  'the 501st aggregate relation is rejected atomically');
select throws_ok(
  $$select private.cms_public_relation_count_0085('{"relations":{"productIds":["not-a-uuid"]}}')$$,
  '23514','CMS_PUBLIC_RELATION_INVALID',
  'malformed general relation IDs fail closed'
);
select throws_ok(
  $$select private.cms_public_relation_count_0085('{"blocks":[{"type":"related_content","data":{"itemIds":"not-an-array"}}]}')$$,
  '23514','CMS_PUBLIC_RELATION_INVALID',
  'malformed related-content candidates fail closed'
);
select is((select count(*)::integer from cms_relation_limit_fixture),1,
  'rejected projections leave no partial publication residue');

select * from finish();
rollback;
