begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select is(
  (select count(*)::integer from information_schema.tables where table_schema = 'public' and table_name in (
    'cms_product_manufacturers', 'cms_product_lines', 'cms_attribute_definitions',
    'cms_product_projection', 'cms_product_variant_projection', 'cms_product_attribute_projection',
    'cms_product_document_projection', 'cms_product_relation_projection',
    'cms_product_search_term_projection', 'cms_redirects'
  )),
  10,
  'the product vertical has ten normalized/reference projections'
);

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_product_manufacturers'::regclass, 'public.cms_product_lines'::regclass,
    'public.cms_attribute_definitions'::regclass, 'public.cms_product_projection'::regclass,
    'public.cms_product_variant_projection'::regclass, 'public.cms_product_attribute_projection'::regclass,
    'public.cms_product_document_projection'::regclass, 'public.cms_product_relation_projection'::regclass,
    'public.cms_product_search_term_projection'::regclass, 'public.cms_redirects'::regclass
  ) and relrowsecurity),
  10,
  'all product vertical tables enforce RLS'
);

select isnt(has_table_privilege('anon', 'public.cms_product_manufacturers', 'SELECT'), true,
  'anonymous users cannot read draft manufacturer references');
select isnt(has_table_privilege('authenticated', 'public.cms_product_projection', 'INSERT'), true,
  'authenticated clients cannot forge product projections');
select ok(has_table_privilege('anon', 'public.cms_product_projection', 'SELECT'),
  'anonymous consumers may read only the published product projection');
select ok(has_table_privilege('anon', 'public.cms_product_document_projection', 'SELECT'),
  'anonymous consumers may query the policy-filtered public document projection');

select is(public.cms_editorial_required_permission('product', 'approve'), 'cms:products.approve',
  'product approval has an explicit permission');
select is((select critical from public.cms_permissions where permission_key = 'cms:products.approve'), false,
  'review approval is separated from MFA-required administrative roles');
select ok(exists (
  select 1 from public.cms_role_permissions where role_key = 'reviewer' and permission_key = 'cms:products.approve'
), 'reviewer receives the product approval permission');

select is((select count(*)::integer from public.cms_product_projection), 0,
  'migration seeds no editorial products');
select is((select count(*)::integer from public.cms_product_manufacturers), 0,
  'migration seeds no manufacturer records');
select is((select count(*)::integer from public.cms_redirects), 0,
  'migration seeds no legacy redirects');

select * from finish();
rollback;
