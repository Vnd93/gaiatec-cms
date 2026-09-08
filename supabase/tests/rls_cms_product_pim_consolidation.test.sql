begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(55);

select has_table(
  'public',
  'cms_product_canonical_sku_registry',
  'canonical product SKUs have a durable publication-time registry'
);
select has_table(
  'public',
  'cms_product_canonical_identifier_registry',
  'canonical external identifiers have a durable publication-time registry'
);
select has_table(
  'public',
  'cms_product_canonical_registry_cleanup_events',
  'terminal QA registry cleanup has immutable evidence'
);
select has_trigger(
  'public',
  'cms_published_projection',
  'cms_claim_product_identifiers_0078',
  'publication atomically claims canonical product identities'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'cms_00_product_registry_terminal_cleanup_0078',
  'terminal QA transition cleans product identity claims before compensation'
);
select has_trigger(
  'private',
  'cms_qa_actor_leases',
  'cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup',
  'terminal QA transition cleans shared-container product options'
);

select isnt(
  has_table_privilege('anon', 'public.cms_product_canonical_sku_registry', 'SELECT'),
  true,
  'anonymous users cannot inspect the canonical SKU registry'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_product_canonical_sku_registry', 'SELECT'),
  true,
  'authenticated users cannot inspect the canonical SKU registry directly'
);
select is(
  has_table_privilege('service_role', 'public.cms_product_canonical_sku_registry', 'SELECT'),
  true,
  'the service role can inspect canonical SKU claims'
);
select isnt(
  has_table_privilege('anon', 'public.cms_product_canonical_identifier_registry', 'SELECT'),
  true,
  'anonymous users cannot inspect the canonical identifier registry'
);
select isnt(
  has_table_privilege('authenticated', 'public.cms_product_canonical_identifier_registry', 'SELECT'),
  true,
  'authenticated users cannot inspect the canonical identifier registry directly'
);
select is(
  has_table_privilege('service_role', 'public.cms_product_canonical_identifier_registry', 'SELECT'),
  true,
  'the service role can inspect canonical identifier claims'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.cms_get_pim_reconciliation_plan(uuid,uuid,uuid,text,text,text,text,timestamptz,uuid)',
    'EXECUTE'
  ),
  true,
  'anonymous users cannot request a PIM reconciliation plan'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_get_pim_reconciliation_plan(uuid,uuid,uuid,text,text,text,text,timestamptz,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the reconciliation-plan Edge boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_get_pim_reconciliation_plan(uuid,uuid,uuid,text,text,text,text,timestamptz,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can request a server-derived reconciliation plan'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'anonymous users cannot reconcile legacy PIM data'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the reconciliation Edge boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can execute the governed reconciliation command'
);
with reconciliation_source as (
  select pg_get_functiondef(
    'public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'::regprocedure
  ) as body
)
select ok(
  position('v_matched_by := case' in body) > 0
    and position('v_matched_by := case' in body)
      < position('update public.cms_pim_products' in body)
    and position('v_product.id, v_item.id, v_matched_by,' in body)
      > position('update public.cms_pim_products' in body)
    and position('''matchedBy'', v_matched_by' in body) > 0,
  'manual reconciliation freezes original slug or content-item match evidence before mutation'
)
from reconciliation_source;
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_product_attributes_catalog_scoped(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  true,
  'anonymous users cannot resolve the controlled product attribute catalog'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_product_attributes_catalog_scoped(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the product attribute Edge boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_product_attributes_catalog_scoped(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can resolve controlled product attributes'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.cms_pim_master_controlled_options_scoped(uuid,text,text,uuid[])',
    'EXECUTE'
  ),
  true,
  'anonymous users cannot resolve legacy master-data mappings'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_pim_master_controlled_options_scoped(uuid,text,text,uuid[])',
    'EXECUTE'
  ),
  true,
  'authenticated users cannot bypass the controlled-option mapping Edge boundary'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_pim_master_controlled_options_scoped(uuid,text,text,uuid[])',
    'EXECUTE'
  ),
  true,
  'the service role can resolve unambiguous master-data mappings'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
(
  '78000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'pim-consolidation-corporate@example.test',
  '',
  now(),
  '{}',
  '{"synthetic":false,"purpose":"ordinary-operator"}',
  now(),
  now()
);

insert into public.cms_profiles (user_id, display_name, display_email, status)
values (
  '78000000-0000-4000-8000-000000000001',
  'PIM consolidation corporate operator',
  'pim-consolidation-corporate@example.test',
  'active'
);
insert into public.cms_user_roles (user_id, role_key)
values ('78000000-0000-4000-8000-000000000001', 'super_admin');

insert into public.cms_controlled_lists (
  id,
  list_key,
  entity_type,
  dimension_key,
  label,
  created_by,
  updated_by
) values
  (
    '78000000-0000-4000-8000-000000000201',
    'product.category',
    'product',
    'category',
    'QA 0078 product category',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000202',
    'product.application_magnitude',
    'product',
    'application_magnitude',
    'QA 0078 application magnitude',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000203',
    'product.technology',
    'product',
    'technology',
    'QA 0078 product technology',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000204',
    'product.installation_operation',
    'product',
    'installation_operation',
    'QA 0078 installation operation',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000205',
    'product.monitored_element',
    'product',
    'monitored_element',
    'QA 0078 monitored element',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

insert into public.cms_controlled_options (
  id,
  list_id,
  slug,
  label,
  created_by,
  updated_by
) values
  (
    '78000000-0000-4000-8000-000000000301',
    '78000000-0000-4000-8000-000000000201',
    'qa-0078-category',
    'QA 0078 Category',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000302',
    '78000000-0000-4000-8000-000000000202',
    'qa-0078-magnitude',
    'QA 0078 Magnitude',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000303',
    '78000000-0000-4000-8000-000000000203',
    'qa-0078-technology',
    'QA 0078 Technology',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000304',
    '78000000-0000-4000-8000-000000000204',
    'qa-0078-installation',
    'QA 0078 Installation',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000305',
    '78000000-0000-4000-8000-000000000205',
    'qa-0078-element',
    'QA 0078 Element',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

insert into public.cms_master_entities (
  id,
  entity_type,
  canonical_name,
  normalized_name,
  status,
  created_by,
  updated_by
) values
  (
    '78000000-0000-4000-8000-000000000401',
    'category',
    'QA 0078 Category',
    'qa 0078 category',
    'active',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000402',
    'magnitude',
    'QA 0078 Magnitude',
    'qa 0078 magnitude',
    'active',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000403',
    'technology',
    'QA 0078 Technology',
    'qa 0078 technology',
    'active',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000404',
    'installation',
    'QA 0078 Installation',
    'qa 0078 installation',
    'active',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000405',
    'monitored_element',
    'QA 0078 Element',
    'qa 0078 element',
    'active',
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

insert into public.cms_pim_units (
  code,
  label,
  symbol,
  dimension_key,
  canonical_code,
  factor_to_canonical,
  created_by,
  updated_by
) values (
  'qa78u',
  'QA 0078 canonical unit',
  'Q78',
  'qa0078_dimension',
  'qa78u',
  1,
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);

insert into public.cms_pim_attribute_definitions (
  id,
  attribute_key,
  label,
  data_type,
  canonical_unit_code,
  enum_options,
  filterable,
  comparable,
  searchable,
  created_by,
  updated_by
) values
  (
    '78000000-0000-4000-8000-000000000411',
    'qa78_number',
    'QA 0078 Number',
    'decimal',
    'qa78u',
    '[]',
    true,
    true,
    true,
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000412',
    'qa78_enum',
    'QA 0078 Enum',
    'enum',
    null,
    '["red","blue"]',
    true,
    false,
    true,
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  ),
  (
    '78000000-0000-4000-8000-000000000413',
    'qa78_range',
    'QA 0078 Range',
    'range',
    'qa78u',
    '[]',
    false,
    true,
    false,
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

insert into public.cms_pim_attribute_sets (
  id,
  category_id,
  name,
  status,
  created_by,
  updated_by
) values (
  '78000000-0000-4000-8000-000000000421',
  '78000000-0000-4000-8000-000000000401',
  'QA 0078 governed attributes',
  'active',
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);
insert into public.cms_pim_attribute_set_versions (
  id,
  attribute_set_id,
  version,
  status,
  effective_from,
  created_by
) values (
  '78000000-0000-4000-8000-000000000422',
  '78000000-0000-4000-8000-000000000421',
  1,
  'active',
  now(),
  '78000000-0000-4000-8000-000000000001'
);
insert into public.cms_pim_attribute_set_definitions (
  attribute_set_version_id,
  definition_id,
  required,
  inherited,
  position
) values
  (
    '78000000-0000-4000-8000-000000000422',
    '78000000-0000-4000-8000-000000000411',
    true,
    true,
    0
  ),
  (
    '78000000-0000-4000-8000-000000000422',
    '78000000-0000-4000-8000-000000000412',
    false,
    true,
    1
  ),
  (
    '78000000-0000-4000-8000-000000000422',
    '78000000-0000-4000-8000-000000000413',
    false,
    true,
    2
  );

create function pg_temp.product_payload_0078()
returns jsonb
language sql
immutable
as $function$
  select $json$
  {
    "schemaVersion": 1,
    "consumerId": "cms.catalog-product.v1",
    "contentType": "product",
    "pilotState": "homologated",
    "title": "QA 0078 canonical product",
    "summary": "Synthetic canonical product for migration 0078.",
    "brand": {"name": "QA 0078 Brand", "slug": "qa-0078-brand"},
    "manufacturer": {"name": "QA 0078 Manufacturer", "slug": "qa-0078-manufacturer"},
    "productLine": {"name": "QA 0078 Line", "slug": "qa-0078-line"},
    "classification": {
      "segment": "QA 0078 Segment",
      "category": "QA 0078 Category",
      "subcategory": "QA 0078 Subcategory",
      "family": "QA 0078 Family"
    },
    "controlledClassification": {
      "productCategory": {
        "id": "78000000-0000-4000-8000-000000000301",
        "slug": "qa-0078-category",
        "label": "QA 0078 Category"
      },
      "applicationMagnitude": {
        "id": "78000000-0000-4000-8000-000000000302",
        "slug": "qa-0078-magnitude",
        "label": "QA 0078 Magnitude"
      },
      "technology": {
        "id": "78000000-0000-4000-8000-000000000303",
        "slug": "qa-0078-technology",
        "label": "QA 0078 Technology"
      },
      "installationOperation": {
        "id": "78000000-0000-4000-8000-000000000304",
        "slug": "qa-0078-installation",
        "label": "QA 0078 Installation"
      },
      "monitoredElement": {
        "id": "78000000-0000-4000-8000-000000000305",
        "slug": "qa-0078-element",
        "label": "QA 0078 Element"
      }
    },
    "commercial": {
      "shortDescription": "QA 0078 short description.",
      "valueProposition": "QA 0078 value proposition.",
      "benefits": ["Deterministic validation"],
      "differentiators": ["Canonical ownership"]
    },
    "function": "Validate canonical PIM consolidation",
    "technology": "QA 0078 Technology",
    "models": [
      {
        "id": "78000000-0000-4000-8000-000000000701",
        "model": "QA78-MODEL-A",
        "manufacturerReference": "QA78-REF-A",
        "sku": "QA78-MODEL-A-UNIQUE",
        "status": "active",
        "variants": [
          {
            "id": "78000000-0000-4000-8000-000000000711",
            "name": "QA78 Variant A",
            "code": "SHARED-CODE",
            "sku": "QA78-VARIANT-A-UNIQUE",
            "status": "active",
            "order": 0
          }
        ]
      },
      {
        "id": "78000000-0000-4000-8000-000000000702",
        "model": "QA78-MODEL-B",
        "manufacturerReference": "QA78-REF-B",
        "sku": "QA78-MODEL-B-UNIQUE",
        "status": "active",
        "variants": [
          {
            "id": "78000000-0000-4000-8000-000000000712",
            "name": "QA78 Variant B",
            "code": "SHARED-CODE",
            "sku": "QA78-VARIANT-B-UNIQUE",
            "status": "active",
            "order": 1
          }
        ]
      }
    ],
    "specifications": [
      {
        "id": "78000000-0000-4000-8000-000000000721",
        "definitionId": "78000000-0000-4000-8000-000000000411",
        "key": "qa78_number",
        "label": "QA 0078 Number",
        "type": "number",
        "value": 7,
        "unit": "qa78u",
        "required": true,
        "filterable": true,
        "comparable": true,
        "searchable": true,
        "scope": "product",
        "sourceType": "manual",
        "sourceRef": "QA 0078 controlled fixture",
        "confidence": 1,
        "homologated": true
      },
      {
        "id": "78000000-0000-4000-8000-000000000722",
        "definitionId": "78000000-0000-4000-8000-000000000412",
        "key": "qa78_enum",
        "label": "QA 0078 Enum",
        "type": "enum",
        "value": ["red"],
        "required": false,
        "filterable": true,
        "comparable": false,
        "searchable": true,
        "scope": "model",
        "ownerId": "78000000-0000-4000-8000-000000000701",
        "sourceType": "manual",
        "sourceRef": "QA 0078 controlled fixture",
        "confidence": 1,
        "homologated": true
      },
      {
        "id": "78000000-0000-4000-8000-000000000723",
        "definitionId": "78000000-0000-4000-8000-000000000413",
        "key": "qa78_range",
        "label": "QA 0078 Range",
        "type": "range",
        "value": {"min": 1, "max": 9},
        "unit": "qa78u",
        "required": false,
        "filterable": false,
        "comparable": true,
        "searchable": false,
        "scope": "variant",
        "ownerId": "78000000-0000-4000-8000-000000000711",
        "sourceType": "manual",
        "sourceRef": "QA 0078 controlled fixture",
        "confidence": 1,
        "homologated": true
      }
    ],
    "externalIdentifiers": [
      {
        "id": "78000000-0000-4000-8000-000000000731",
        "owner": {"type": "product"},
        "kind": "erp",
        "value": "QA78-ERP-UNIQUE",
        "visibility": "internal",
        "sourceType": "manual",
        "sourceRef": "QA 0078 controlled fixture"
      }
    ],
    "media": [],
    "documents": [],
    "relations": {
      "productIds": [],
      "applicationIds": [],
      "sectorIds": [],
      "serviceIds": []
    },
    "search": {"synonyms": [], "keywords": []},
    "redirects": [],
    "blocks": [],
    "seo": {
      "title": "QA 0078 canonical product",
      "description": "Canonical product consolidation database fixture.",
      "canonicalPath": "/produtos/qa-pim-0078-one",
      "indexable": false
    },
    "provenance": [
      {
        "sourceKind": "owner_authored",
        "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "rightsConfirmed": true,
        "commercialOwner": "QA 0078",
        "technicalOwner": "QA 0078",
        "verifiedAt": "2026-09-07T12:00:00.000Z"
      }
    ],
    "approval": {
      "portfolioOwner": "QA 0078",
      "technicalReviewer": "QA 0078",
      "commercialReviewer": "QA 0078",
      "editorialReviewer": "QA 0078",
      "homologatedAt": "2026-09-07T12:00:00.000Z"
    }
  }
  $json$::jsonb;
$function$;

insert into public.cms_content_items (
  id,
  content_type,
  slug,
  workflow_status,
  created_by,
  updated_by
) values (
  '78000000-0000-4000-8000-000000000501',
  'product',
  'qa-pim-0078-one',
  'approved',
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_drafts (
  item_id,
  schema_version,
  payload,
  seo,
  provenance,
  lock_version,
  updated_by
) values (
  '78000000-0000-4000-8000-000000000501',
  1,
  pg_temp.product_payload_0078(),
  '{"title":"QA 0078","description":"QA 0078 draft","indexable":false}',
  '[{"rightsConfirmed":true}]',
  1,
  '78000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)::integer
    from public.cms_product_canonical_sku_registry
    where normalized_sku = 'qa78-model-a-unique'
  ),
  0,
  'a draft does not reserve a global SKU'
);

select is(
  private.cms_pim_canonical_attributes_valid_0078(
    '78000000-0000-4000-8000-000000000501',
    pg_temp.product_payload_0078()
  ),
  true,
  'the complete governed attribute fixture is valid before publication'
);

select is(
  private.cms_pim_canonical_attributes_valid_0078(
    '78000000-0000-4000-8000-000000000501',
    jsonb_set(
      pg_temp.product_payload_0078(),
      '{specifications,0,value}',
      '"seven"'::jsonb
    )
  ),
  false,
  'a number definition rejects a string value'
);
select is(
  private.cms_pim_canonical_attributes_valid_0078(
    '78000000-0000-4000-8000-000000000501',
    jsonb_set(
      pg_temp.product_payload_0078(),
      '{specifications,1,value}',
      '["green"]'::jsonb
    )
  ),
  false,
  'an enum definition rejects a value outside enum_options'
);
select is(
  private.cms_pim_canonical_attributes_valid_0078(
    '78000000-0000-4000-8000-000000000501',
    jsonb_set(
      pg_temp.product_payload_0078(),
      '{specifications,2,value}',
      '{"min":10,"max":1}'::jsonb
    )
  ),
  false,
  'a range definition rejects min greater than max'
);
select is(
  private.cms_pim_canonical_attributes_valid_0078(
    '78000000-0000-4000-8000-000000000501',
    jsonb_set(
      pg_temp.product_payload_0078(),
      '{specifications,0,required}',
      'false'::jsonb
    )
  ),
  false,
  'required metadata cannot be forged false'
);

insert into public.cms_content_revisions (
  id,
  item_id,
  revision_number,
  schema_version,
  payload,
  seo,
  provenance,
  source_draft_version,
  reason,
  created_by
) values (
  '78000000-0000-4000-8000-000000000601',
  '78000000-0000-4000-8000-000000000501',
  1,
  1,
  pg_temp.product_payload_0078(),
  '{"title":"QA 0078","description":"QA 0078 publication","indexable":false}',
  '[{"rightsConfirmed":true}]',
  1,
  'QA 0078 canonical publication',
  '78000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$
    insert into public.cms_published_projection (
      item_id,
      revision_id,
      content_type,
      slug,
      schema_version,
      consumer_id,
      renderer_key,
      payload,
      seo,
      content_version,
      cache_tag,
      etag,
      published_at
    ) values (
      '78000000-0000-4000-8000-000000000501',
      '78000000-0000-4000-8000-000000000601',
      'product',
      'qa-pim-0078-one',
      1,
      'cms.catalog-product.v1',
      'catalog-product',
      pg_temp.product_payload_0078(),
      '{"title":"QA 0078","description":"QA 0078 publication","indexable":false}',
      1,
      'cms:product:78000000-0000-4000-8000-000000000501',
      '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      now()
    )
  $$,
  'same variant code is allowed in two different models'
);
select is(
  (
    select count(*)::integer
    from public.cms_product_variant_projection
    where item_id = '78000000-0000-4000-8000-000000000501'
      and lower(variant_code) = 'shared-code'
      and model_id in (
        '78000000-0000-4000-8000-000000000701',
        '78000000-0000-4000-8000-000000000702'
      )
  ),
  2,
  'both same-code variants are materialized under their distinct model identities'
);
select is(
  (
    select array_agg(owner_scope order by owner_scope)::text
    from public.cms_product_attribute_projection
    where item_id = '78000000-0000-4000-8000-000000000501'
  ),
  array['model', 'product', 'variant']::text,
  'scoped attributes materialize for product, model and variant owners'
);
select throws_ok(
  $$
    update public.cms_published_projection
    set payload = jsonb_set(
      payload,
      '{externalIdentifiers,0,owner}',
      '{"type":"model","id":"78000000-0000-4000-8000-000000000799"}'::jsonb
    )
    where item_id = '78000000-0000-4000-8000-000000000501'
  $$,
  '23514',
  'CMS_PIM_CANONICAL_IDENTITY_CONFLICT',
  'an external identifier cannot name an orphan model UUID'
);
select is(
  (
    (
      select count(*)
      from public.cms_product_canonical_sku_registry
      where item_id = '78000000-0000-4000-8000-000000000501'
    ) + (
      select count(*)
      from public.cms_product_canonical_identifier_registry
      where item_id = '78000000-0000-4000-8000-000000000501'
    )
  )::integer,
  5,
  'the successful publication claims all four SKUs and its external identifier'
);

insert into public.cms_content_items (
  id,
  content_type,
  slug,
  workflow_status,
  created_by,
  updated_by
) values (
  '78000000-0000-4000-8000-000000000502',
  'product',
  'qa-pim-0078-two',
  'approved',
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_drafts (
  item_id,
  schema_version,
  payload,
  seo,
  provenance,
  lock_version,
  updated_by
) values (
  '78000000-0000-4000-8000-000000000502',
  1,
  pg_temp.product_payload_0078(),
  '{"title":"QA 0078 duplicate","description":"QA 0078 duplicate draft","indexable":false}',
  '[{"rightsConfirmed":true}]',
  1,
  '78000000-0000-4000-8000-000000000001'
);
insert into public.cms_content_revisions (
  id,
  item_id,
  revision_number,
  schema_version,
  payload,
  seo,
  provenance,
  source_draft_version,
  reason,
  created_by
) values (
  '78000000-0000-4000-8000-000000000602',
  '78000000-0000-4000-8000-000000000502',
  1,
  1,
  pg_temp.product_payload_0078(),
  '{"title":"QA 0078 duplicate","description":"QA 0078 duplicate publication","indexable":false}',
  '[{"rightsConfirmed":true}]',
  1,
  'QA 0078 duplicate publication',
  '78000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$
    insert into public.cms_published_projection (
      item_id,
      revision_id,
      content_type,
      slug,
      schema_version,
      consumer_id,
      renderer_key,
      payload,
      seo,
      content_version,
      cache_tag,
      etag,
      published_at
    ) values (
      '78000000-0000-4000-8000-000000000502',
      '78000000-0000-4000-8000-000000000602',
      'product',
      'qa-pim-0078-two',
      1,
      'cms.catalog-product.v1',
      'catalog-product',
      pg_temp.product_payload_0078(),
      '{"title":"QA 0078 duplicate","description":"QA 0078 duplicate publication","indexable":false}',
      1,
      'cms:product:78000000-0000-4000-8000-000000000502',
      '"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',
      now()
    )
  $$,
  '23505',
  'CMS_PIM_CANONICAL_SKU_CONFLICT',
  'a second product cannot publish the same normalized SKU'
);

select throws_ok(
  $$
    select public.cms_reconcile_legacy_pim_product(
      '78000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000801',
      '78000000-0000-4000-8000-000000000501',
      1,
      1,
      'retire_acknowledged_gap',
      null,
      'Explicitly reviewed legacy divergence',
      'local',
      'main',
      'aal2',
      'qa78-session',
      now() - interval '1 minute',
      '78000000-0000-4000-8000-000000000802',
      '78000000-0000-4000-8000-000000000803',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      '78000000-0000-4000-8000-000000000804'
    )
  $$,
  '42501',
  'CMS_PIM_RECONCILIATION_ACK_REQUIRED',
  'a NULL acknowledged hash cannot retire divergent legacy data'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '78000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'pim-consolidation-qa@example.test',
  '',
  now(),
  '{}',
  '{
    "synthetic": true,
    "purpose": "qa-cms-browser",
    "runTag": "QA-CMS-FINAL-20260907-bbbbbbbb",
    "candidateSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "environment": "staging"
  }',
  now(),
  now()
),
(
  '78000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'pim-consolidation-qa-cross-run@example.test',
  '',
  now(),
  '{}',
  '{
    "synthetic": true,
    "purpose": "qa-cms-browser",
    "runTag": "QA-CMS-FINAL-20260907-cccccccc",
    "candidateSha": "cccccccccccccccccccccccccccccccccccccccc",
    "environment": "staging"
  }',
  now(),
  now()
);
insert into public.cms_profiles (user_id, display_name, display_email, status)
values
(
  '78000000-0000-4000-8000-000000000002',
  'PIM consolidation QA actor',
  'pim-consolidation-qa@example.test',
  'active'
),
(
  '78000000-0000-4000-8000-000000000003',
  'PIM consolidation cross-run QA actor',
  'pim-consolidation-qa-cross-run@example.test',
  'active'
);
insert into public.cms_user_roles (user_id, role_key)
values
  ('78000000-0000-4000-8000-000000000002', 'super_admin'),
  ('78000000-0000-4000-8000-000000000003', 'super_admin');

insert into public.cms_controlled_lists (
  id, list_key, entity_type, dimension_key, label, created_by, updated_by
) values (
  '78000000-0000-4000-8000-000000000920',
  'product.qa78_sixth',
  'product',
  'qa78_sixth',
  'QA 0078 non-shared sixth container',
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);

insert into public.cms_master_entities (
  id, entity_type, canonical_name, normalized_name, source_ref,
  status, created_by, updated_by
) values (
  '78000000-0000-4000-8000-000000000910',
  'category',
  'QA-CMS-FINAL-20260907-bbbbbbbb Category',
  'qa cms final 20260907 bbbbbbbb category',
  'QA-CMS-FINAL-20260907-bbbbbbbb',
  'active',
  '78000000-0000-4000-8000-000000000002',
  '78000000-0000-4000-8000-000000000002'
);

create function pg_temp.upsert_shared_option_0078(
  p_actor_id uuid,
  p_list_id uuid,
  p_option_id uuid,
  p_slug text,
  p_label text,
  p_correlation_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.cms_manage_controlled_vocabulary_scoped(
    p_actor_id,
    'staging',
    'upsert_option',
    null,
    jsonb_build_object(
      'id', p_option_id,
      'listId', p_list_id,
      'slug', p_slug,
      'label', p_label,
      'description', 'Synthetic option for the exact QA run',
      'publicVisible', false,
      'active', true,
      'sortOrder', 0
    ),
    'aal2',
    'qa78-option-session',
    now() - interval '1 minute',
    p_correlation_id
  );
end;
$$;

select lives_ok(
  $$
    select pg_temp.upsert_shared_option_0078(
      '78000000-0000-4000-8000-000000000002',
      '78000000-0000-4000-8000-000000000201',
      '78000000-0000-4000-8000-000000000901',
      'qa-cms-final-20260907-bbbbbbbb-category',
      'QA-CMS-FINAL-20260907-bbbbbbbb Category',
      '78000000-0000-4000-8000-000000000931'
    )
  $$,
  'an exact-run QA option can use the immutable product.category container'
);

do $$
begin
  perform pg_temp.upsert_shared_option_0078(
    '78000000-0000-4000-8000-000000000002',
    '78000000-0000-4000-8000-000000000202',
    '78000000-0000-4000-8000-000000000902',
    'qa-cms-final-20260907-bbbbbbbb-magnitude',
    'QA-CMS-FINAL-20260907-bbbbbbbb Magnitude',
    '78000000-0000-4000-8000-000000000932'
  );
  perform pg_temp.upsert_shared_option_0078(
    '78000000-0000-4000-8000-000000000002',
    '78000000-0000-4000-8000-000000000203',
    '78000000-0000-4000-8000-000000000903',
    'qa-cms-final-20260907-bbbbbbbb-technology',
    'QA-CMS-FINAL-20260907-bbbbbbbb Technology',
    '78000000-0000-4000-8000-000000000933'
  );
  perform pg_temp.upsert_shared_option_0078(
    '78000000-0000-4000-8000-000000000002',
    '78000000-0000-4000-8000-000000000204',
    '78000000-0000-4000-8000-000000000904',
    'qa-cms-final-20260907-bbbbbbbb-installation',
    'QA-CMS-FINAL-20260907-bbbbbbbb Installation',
    '78000000-0000-4000-8000-000000000934'
  );
  perform pg_temp.upsert_shared_option_0078(
    '78000000-0000-4000-8000-000000000002',
    '78000000-0000-4000-8000-000000000205',
    '78000000-0000-4000-8000-000000000905',
    'qa-cms-final-20260907-bbbbbbbb-element',
    'QA-CMS-FINAL-20260907-bbbbbbbb Element',
    '78000000-0000-4000-8000-000000000935'
  );
  perform pg_temp.upsert_shared_option_0078(
    '78000000-0000-4000-8000-000000000003',
    '78000000-0000-4000-8000-000000000201',
    '78000000-0000-4000-8000-000000000906',
    'qa-cms-final-20260907-cccccccc-category',
    'QA-CMS-FINAL-20260907-cccccccc Category',
    '78000000-0000-4000-8000-000000000936'
  );

  perform public.cms_manage_controlled_vocabulary_scoped(
    '78000000-0000-4000-8000-000000000002',
    'staging',
    'upsert_list',
    jsonb_build_object(
      'id', '78000000-0000-4000-8000-000000000921',
      'listKey', 'qa78.owned',
      'entityType', 'product',
      'dimensionKey', 'qa78_owned',
      'label', 'QA-CMS-FINAL-20260907-bbbbbbbb owned container',
      'description', '',
      'publicVisible', false,
      'active', true,
      'sortOrder', 0
    ),
    null,
    'aal2',
    'qa78-option-session',
    now() - interval '1 minute',
    '78000000-0000-4000-8000-000000000937'
  );
  perform public.cms_manage_controlled_vocabulary_scoped(
    '78000000-0000-4000-8000-000000000002',
    'staging',
    'upsert_option',
    null,
    jsonb_build_object(
      'id', '78000000-0000-4000-8000-000000000922',
      'listId', '78000000-0000-4000-8000-000000000921',
      'slug', 'qa-owned-category',
      'label', 'QA owned category',
      'description', '',
      'publicVisible', false,
      'active', true,
      'sortOrder', 0
    ),
    'aal2',
    'qa78-option-session',
    now() - interval '1 minute',
    '78000000-0000-4000-8000-000000000938'
  );
end;
$$;

create function pg_temp.qa_controlled_payload_0078(p_category_id uuid)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'contentType', 'product',
    'controlledClassification', jsonb_build_object(
      'productCategory', jsonb_build_object('id', p_category_id),
      'applicationMagnitude', jsonb_build_object('id', '78000000-0000-4000-8000-000000000902'),
      'technology', jsonb_build_object('id', '78000000-0000-4000-8000-000000000903'),
      'installationOperation', jsonb_build_object('id', '78000000-0000-4000-8000-000000000904'),
      'monitoredElement', jsonb_build_object('id', '78000000-0000-4000-8000-000000000905')
    )
  );
$$;

select is(
  public.cms_product_attributes_catalog_scoped(
    '78000000-0000-4000-8000-000000000002',
    'staging',
    'main',
    '78000000-0000-4000-8000-000000000901'
  ) #>> '{master_category,id}',
  '78000000-0000-4000-8000-000000000910',
  'controlled product category resolves to the exact scoped master category'
);
select ok(
  private.cms_content_payload_controlled_scope_allowed(
    '78000000-0000-4000-8000-000000000002',
    pg_temp.qa_controlled_payload_0078('78000000-0000-4000-8000-000000000901'),
    'staging'
  ),
  'all five same-run options in strict corporate containers form an allowed product graph'
);
select is(
  (
    select jsonb_array_length(vocabulary.cms_controlled_options)
    from public.cms_controlled_vocabularies_scoped(
      '78000000-0000-4000-8000-000000000002', 'staging', 'product', false, 500
    ) vocabulary
    where vocabulary.list_key = 'product.category'
  ),
  1,
  'QA reads only its exact-run option from a shared product container'
);
select is(
  (
    select jsonb_array_length(vocabulary.cms_controlled_options)
    from public.cms_controlled_vocabularies_scoped(
      '78000000-0000-4000-8000-000000000001', 'staging', 'product', false, 500
    ) vocabulary
    where vocabulary.list_key = 'product.category'
  ),
  1,
  'corporate vocabulary reads exclude every ever-QA option'
);
select is(
  (
    select vocabulary.cms_controlled_options #>> '{0,id}'
    from public.cms_controlled_vocabularies_scoped(
      '78000000-0000-4000-8000-000000000003', 'staging', 'product', false, 500
    ) vocabulary
    where vocabulary.list_key = 'product.category'
  ),
  '78000000-0000-4000-8000-000000000906',
  'a different QA run reads only its own option'
);
select isnt(
  private.cms_content_payload_controlled_scope_allowed(
    '78000000-0000-4000-8000-000000000002',
    pg_temp.qa_controlled_payload_0078('78000000-0000-4000-8000-000000000301'),
    'staging'
  ),
  true,
  'a QA product cannot adopt a corporate option from the shared container'
);
select isnt(
  private.cms_content_payload_controlled_scope_allowed(
    '78000000-0000-4000-8000-000000000002',
    pg_temp.qa_controlled_payload_0078('78000000-0000-4000-8000-000000000906'),
    'staging'
  ),
  true,
  'a QA product cannot adopt an option from another run'
);
select throws_ok(
  $$
    select pg_temp.upsert_shared_option_0078(
      '78000000-0000-4000-8000-000000000002',
      '78000000-0000-4000-8000-000000000920',
      '78000000-0000-4000-8000-000000000923',
      'qa-cms-final-20260907-bbbbbbbb-sixth',
      'QA-CMS-FINAL-20260907-bbbbbbbb Sixth',
      '78000000-0000-4000-8000-000000000939'
    )
  $$,
  '42501',
  'CMS_CONTROLLED_SCOPE_FORBIDDEN',
  'a sixth corporate list key is never a shared QA container'
);
select isnt(
  private.cms_product_shared_controlled_list_allowed_0078(
    '78000000-0000-4000-8000-000000000002',
    '78000000-0000-4000-8000-000000000921',
    'staging'
  ),
  true,
  'a QA-owned container never qualifies as immutable shared catalog metadata'
);
select isnt(
  private.cms_content_payload_controlled_scope_allowed(
    '78000000-0000-4000-8000-000000000002',
    pg_temp.qa_controlled_payload_0078('78000000-0000-4000-8000-000000000922'),
    'staging'
  ),
  true,
  'an option in a QA-owned container cannot impersonate product.category'
);

insert into public.cms_product_canonical_sku_registry (
  scope_key,
  normalized_sku,
  display_sku,
  item_id,
  first_owner_type,
  first_owner_id,
  claimed_by
) values
  (
    'qa:staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:QA-CMS-FINAL-20260907-bbbbbbbb',
    'qa78-cleanup-model',
    'QA78-CLEANUP-MODEL',
    '78000000-0000-4000-8000-000000000501',
    'model',
    '78000000-0000-4000-8000-000000000701',
    '78000000-0000-4000-8000-000000000002'
  ),
  (
    'qa:staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:QA-CMS-FINAL-20260907-bbbbbbbb',
    'qa78-cleanup-variant',
    'QA78-CLEANUP-VARIANT',
    '78000000-0000-4000-8000-000000000501',
    'variant',
    '78000000-0000-4000-8000-000000000711',
    '78000000-0000-4000-8000-000000000002'
  );
insert into public.cms_product_canonical_identifier_registry (
  scope_key,
  identifier_kind,
  normalized_value,
  display_value,
  item_id,
  first_owner_type,
  first_owner_id,
  claimed_by
) values (
  'qa:staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:QA-CMS-FINAL-20260907-bbbbbbbb',
  'erp',
  'qa78-cleanup-erp',
  'QA78-CLEANUP-ERP',
  '78000000-0000-4000-8000-000000000501',
  'product',
  null,
  '78000000-0000-4000-8000-000000000002'
);

update private.cms_qa_actor_leases
set status = 'cleaned', cleaned_at = now()
where actor_id = '78000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)::integer
    from public.cms_controlled_options option
    where option.created_by = '78000000-0000-4000-8000-000000000002'
       or option.updated_by = '78000000-0000-4000-8000-000000000002'
  ),
  0,
  'terminal cleanup leaves zero QA controlled-option residue'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log audit
    where audit.actor_id = '78000000-0000-4000-8000-000000000002'
      and audit.action = 'cms:qa.product_controlled_options.compensated'
      and audit.event_data ->> 'claimsSha256' ~ '^[0-9a-f]{64}$'
  ),
  1,
  'shared-option cleanup preserves hash-only immutable audit evidence'
);

update private.cms_qa_actor_leases
set status = 'cleaned', cleaned_at = now()
where actor_id = '78000000-0000-4000-8000-000000000003';

select is(
  (
    select count(*)::integer
    from public.cms_controlled_options option
    where option.created_by = '78000000-0000-4000-8000-000000000003'
       or option.updated_by = '78000000-0000-4000-8000-000000000003'
  ),
  0,
  'terminal cleanup also removes the cross-run option without leaking it'
);

select is(
  (
    (
      select count(*)
      from public.cms_product_canonical_sku_registry
      where scope_key =
        'qa:staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:QA-CMS-FINAL-20260907-bbbbbbbb'
    ) + (
      select count(*)
      from public.cms_product_canonical_identifier_registry
      where scope_key =
        'qa:staging:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:QA-CMS-FINAL-20260907-bbbbbbbb'
    )
  )::integer,
  0,
  'terminal QA cleanup removes every canonical identity claim'
);
select is(
  (
    select sku_claim_count + identifier_claim_count
    from public.cms_product_canonical_registry_cleanup_events
    where actor_id = '78000000-0000-4000-8000-000000000002'
      and terminal_status = 'cleaned'
      and claims_sha256 ~ '^[0-9a-f]{64}$'
  ),
  3,
  'terminal cleanup records claim counts and hash-only evidence'
);
select is(
  (
    select count(*)::integer
    from public.cms_audit_log
    where actor_id = '78000000-0000-4000-8000-000000000002'
      and action = 'cms:qa.product_registry_cleaned'
      and event_data ->> 'containsPii' = 'false'
  ),
  1,
  'terminal cleanup appends one sanitized audit event'
);

select * from finish();
rollback;
