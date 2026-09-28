begin;

select plan(48);

select has_table('public', 'cms_catalog_composition_units', 'controlled composition units table exists');
select has_table('public', 'cms_catalog_product_hierarchy_revisions', 'hierarchy revision table exists');
select has_table('public', 'cms_catalog_product_relation_revisions', 'relation revision table exists');
select has_view('public', 'cms_catalog_current_product_hierarchy', 'current hierarchy projection exists');
select has_view('public', 'cms_catalog_current_product_relations', 'current relation projection exists');
select has_view('public', 'cms_catalog_effective_relations', 'effective relation projection exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_composition_units'::regclass),
  'composition units have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_product_hierarchy_revisions'::regclass),
  'hierarchy revisions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_catalog_product_relation_revisions'::regclass),
  'relation revisions have RLS enabled'
);
select is(
  (select default_enabled from public.cms_feature_flags where flag_key = 'ev2.catalog_v1'),
  false,
  'relations remain disabled by default'
);
select is(
  (select count(*)::integer from public.cms_catalog_products),
  0,
  'fatia 3 migration does not load products'
);
select is(
  (select count(*)::integer from public.cms_catalog_product_hierarchy_revisions),
  0,
  'fatia 3 migration does not load hierarchy links'
);
select is(
  (select count(*)::integer from public.cms_catalog_product_relation_revisions),
  0,
  'fatia 3 migration does not load relations'
);
select is(
  (select count(*)::integer from public.cms_catalog_composition_units),
  9,
  'controlled unit vocabulary is explicit and bounded'
);

select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_products_entity_kind_check'),
  'product entity kind constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_relation_revisions_relation_kind_check'),
  'relation kind constraint exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_relation_revisions_source_product_id_check'),
  'self relation check exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_hierarchy_revisions_child_product_id_check'),
  'self hierarchy check exists'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_relation_revisions_relation_kind_check'),
  'typed relation constraint remains present'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'cms_catalog_product_relation_revisions_unit_code_fkey'),
  'composition unit foreign key exists'
);

select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_relation_revision_guard'),
  'relation validation trigger exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_hierarchy_revision_guard'),
  'hierarchy validation trigger exists'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_relation_revision_immutable'),
  'relation history is immutable'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_hierarchy_revision_immutable'),
  'hierarchy history is immutable'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_relation_revision_audit'),
  'relation revisions are audited'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'cms_catalog_hierarchy_revision_audit'),
  'hierarchy revisions are audited'
);

select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_record_relation_revision'),
  'relation revision command exists'
);
select ok(
  exists (select 1 from pg_proc where proname = 'cms_catalog_record_hierarchy_revision'),
  'hierarchy revision command exists'
);
select ok(
  (select prosecdef = false from pg_proc where proname = 'cms_catalog_record_relation_revision'),
  'relation revision command is security invoker'
);
select ok(
  (select prosecdef = false from pg_proc where proname = 'cms_catalog_record_hierarchy_revision'),
  'hierarchy revision command is security invoker'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cms_catalog_record_relation_revision(uuid,uuid,uuid,text,numeric,text,bigint,text)',
    'EXECUTE'
  ),
  'authenticated can call the guarded relation command'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cms_catalog_record_relation_revision(uuid,uuid,uuid,text,numeric,text,bigint,text)',
    'EXECUTE'
  ),
  'anonymous cannot write relations'
);
select ok(
  (select position('CMS_CATALOG_FEATURE_DISABLED' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_record_relation_revision'),
  'relation command is fail-closed while the feature flag is off'
);
select ok(
  (select position('CMS_CATALOG_RELATION_CYCLE' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_validate_product_relation_revision'),
  'relation validation rejects applicable cycles'
);
select ok(
  (select position('CMS_CATALOG_NESTED_KIT' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_validate_product_relation_revision'),
  'relation validation rejects nested kits'
);
select ok(
  (select position('CMS_CATALOG_HIERARCHY_CYCLE' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_validate_hierarchy_revision'),
  'hierarchy validation rejects cycles'
);
select ok(
  (select position('CMS_CATALOG_SYMMETRIC_RELATION_CANONICAL_ORDER' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_validate_product_relation_revision'),
  'symmetric relations have one canonical order'
);
select ok(
  (select position('local_exclusion' in pg_get_viewdef('public.cms_catalog_effective_relations'::regclass)) > 0),
  'effective projection exposes local exclusion precedence'
);
select ok(
  (select position('relation_origin_product_id' in pg_get_viewdef('public.cms_catalog_effective_relations'::regclass)) > 0),
  'effective projection exposes relation origin'
);
select ok(
  (select position('relation_origin_level' in pg_get_viewdef('public.cms_catalog_effective_relations'::regclass)) > 0),
  'effective projection exposes inheritance level'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('cms_catalog_product_hierarchy_revisions', 'cms_catalog_product_relation_revisions')
      and cmd = 'DELETE'
  ),
  'relation histories expose no delete policy'
);
select ok(
  not has_table_privilege('anon', 'public.cms_catalog_product_relation_revisions', 'SELECT'),
  'anonymous cannot read relation revisions'
);
select ok(
  not has_table_privilege('anon', 'public.cms_catalog_effective_relations', 'SELECT'),
  'anonymous cannot read effective relation projection'
);
select ok(
  (select position('catalog_entity_kind' in pg_get_functiondef(oid)) > 0
   from pg_proc where proname = 'cms_catalog_record_change'),
  'product revisions retain entity kind in audit history'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'cms_catalog_audit_events_entity_type_check'
      and pg_get_constraintdef(oid) like '%product_relation%'
  ),
  'audit entity types include relations'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'cms_catalog_audit_events_action_check'
      and pg_get_constraintdef(oid) like '%relation_changed%'
  ),
  'audit actions include relation changes'
);
select ok(
  (select position('origin_level' in pg_get_viewdef('public.cms_catalog_effective_relations'::regclass)) > 0),
  'effective projection keeps deterministic origin level'
);
select ok(
  (select position('precedence_rank = 1' in pg_get_viewdef('public.cms_catalog_effective_relations'::regclass)) > 0),
  'effective projection selects one winning rule per target'
);
select * from finish();
rollback;
