begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '44000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ev2.pim.operator@example.test', '', now(), '{}', '{}', now(), now()
);
insert into public.cms_profiles(user_id,display_name,display_email,status)
values('44000000-0000-4000-8000-000000000001','Operador PIM EV2','ev2.pim.operator@example.test','active');
insert into public.cms_user_roles(user_id,role_key)
values('44000000-0000-4000-8000-000000000001','super_admin');

create function pg_temp.execute_pim_command(
  p_action text,
  p_payload jsonb,
  p_aal text default 'aal2',
  p_command_id uuid default gen_random_uuid(),
  p_idempotency_key uuid default gen_random_uuid(),
  p_request_hash text default repeat('a',64),
  p_correlation_id uuid default gen_random_uuid()
) returns jsonb language sql as $$
  select public.cms_execute_pim_command(
    '44000000-0000-4000-8000-000000000001',p_action,p_payload,
    'local','main',p_aal,'ev2-pim-session',now()-interval '1 minute',
    p_command_id,p_idempotency_key,p_request_hash,p_correlation_id
  );
$$;

create function pg_temp.product_payload(
  p_product_id uuid,
  p_model_id uuid,
  p_variant_id uuid,
  p_slug text,
  p_mpn text,
  p_technology_id uuid default '44000000-0000-4000-8000-000000000104'
) returns jsonb language sql as $$
  select jsonb_build_object(
    'mode','create',
    'reason','Cadastro PIM de teste',
    'product',jsonb_build_object(
      'id',p_product_id,'name','Medidor UFX '||right(p_slug,1),'slug',p_slug,
      'summary','Medição sem contato','valueProposition','Instalação sem parada','status','draft',
      'sourceType','manual','sourceRef','pgTAP G4',
      'masterData',jsonb_build_object(
        'manufacturerId','44000000-0000-4000-8000-000000000101','categoryId','44000000-0000-4000-8000-000000000102',
        'magnitudeIds',jsonb_build_array('44000000-0000-4000-8000-000000000103'),
        'technologyIds',jsonb_build_array(p_technology_id),
        'installationIds',jsonb_build_array('44000000-0000-4000-8000-000000000105'),
        'monitoredElementIds',jsonb_build_array('44000000-0000-4000-8000-000000000106')
      ),
      'models',jsonb_build_array(jsonb_build_object(
        'id',p_model_id,'name','UFX-100','mpn',p_mpn,'status','active','primary',true,'position',0,
        'variants',jsonb_build_array(jsonb_build_object(
          'id',p_variant_id,'name','DN50 Modbus','code','DN50-MODBUS','status','active','position',0,
          'axes',jsonb_build_array(
            jsonb_build_object('axisKey','diametro','axisLabel','Diâmetro','optionKey','dn50','optionLabel','DN50'),
            jsonb_build_object('axisKey','protocolo','axisLabel','Protocolo','optionKey','modbus','optionLabel','Modbus')
          )
        ))
      )),
      'attributes',jsonb_build_array(jsonb_build_object(
        'id','44000000-0000-4000-8000-000000000301','definitionId','44000000-0000-4000-8000-000000000201',
        'scope','model','ownerId',p_model_id,'value',jsonb_build_object('min',0,'max',10),'unitCode','L/s',
        'sourceType','manual','sourceRef','Datasheet A','confidence',1,'homologated',true
      )),
      'externalIdentifiers',jsonb_build_array(jsonb_build_object(
        'id',gen_random_uuid(),'ownerType','model','ownerId',p_model_id,'kind','erp','value','ERP-'||p_slug,
        'sourceType','manual','sourceRef','ERP de teste'
      )),
      'provenance',jsonb_build_array(jsonb_build_object(
        'id',gen_random_uuid(),'sourceKind','official_manufacturer','sourceRef','Datasheet A','sourceSha256',repeat('d',64),
        'confidence',1,'rightsConfirmed',true,'verifiedAt',now()
      ))
    )
  );
$$;

select is(
  (select count(*)::integer from pg_class where oid in (
    'public.cms_pim_products'::regclass,'public.cms_pim_product_master_links'::regclass,
    'public.cms_pim_models'::regclass,'public.cms_pim_variants'::regclass,'public.cms_pim_skus'::regclass,
    'public.cms_pim_external_identifiers'::regclass,'public.cms_pim_units'::regclass,
    'public.cms_pim_attribute_definitions'::regclass,'public.cms_pim_attribute_sets'::regclass,
    'public.cms_pim_attribute_set_versions'::regclass,'public.cms_pim_attribute_set_definitions'::regclass,
    'public.cms_pim_attribute_values'::regclass,'public.cms_pim_provenance'::regclass,
    'public.cms_pim_command_receipts'::regclass,'public.cms_pim_events'::regclass
  ) and relrowsecurity),
  15,
  'all EV2.4 PIM tables enable RLS'
);
select isnt(has_table_privilege('anon','public.cms_pim_products','SELECT'),true,'anonymous users cannot read PIM shadow tables');
select isnt(has_table_privilege('authenticated','public.cms_pim_products','SELECT'),true,'authenticated users cannot bypass the Edge query boundary');
select isnt(has_function_privilege('authenticated','public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)','EXECUTE'),true,'authenticated users cannot bypass the PIM command boundary');
select is((select critical from public.cms_permissions where permission_key='cms:pim.archive'),true,'PIM archival is a critical operation');
select is((public.cms_evaluate_feature_flag('44000000-0000-4000-8000-000000000001','ev2.pim_v2','local','main','aal2','ev2-pim-session',now()-interval '1 minute')->>'enabled')::boolean,false,'PIM v2 remains disabled by default');
select throws_ok(
  $$select pg_temp.execute_pim_command('save_product',pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000011',
    '44000000-0000-4000-8000-000000000012','medidor-ufx-a','MPN-A'))$$,
  '42501','CMS_PIM_FEATURE_DISABLED','a disabled flag blocks PIM writes'
);

insert into public.cms_feature_flag_overrides(flag_key,environment,scope_type,scope_key,enabled,reason,expires_at,created_by)
values('ev2.pim_v2','local','user','44000000-0000-4000-8000-000000000001',true,'Teste local transacional do Gate G4',now()+interval '1 hour','44000000-0000-4000-8000-000000000001');
select is((public.cms_evaluate_feature_flag('44000000-0000-4000-8000-000000000001','ev2.pim_v2','local','main','aal2','ev2-pim-session',now()-interval '1 minute')->>'enabled')::boolean,true,'an explicit operator override enables PIM v2');

insert into public.cms_master_entities(id,entity_type,canonical_name,normalized_name,status,created_by,updated_by)
values
('44000000-0000-4000-8000-000000000101','manufacturer','Fabricante G4','fabricante g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000102','category','Vazão G4','vazao g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000103','magnitude','Vazão volumétrica G4','vazao volumetrica g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000104','technology','Ultrassônica G4','ultrassonica g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000105','installation','Clamp-on G4','clamp on g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000106','monitored_element','Água G4','agua g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000107','technology','Laser sem vínculo G4','laser sem vinculo g4','active','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001');
insert into public.cms_master_compatibilities(relation_type,source_entity_id,target_entity_id,created_by,updated_by)
values
('category_magnitude','44000000-0000-4000-8000-000000000102','44000000-0000-4000-8000-000000000103','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('category_technology','44000000-0000-4000-8000-000000000102','44000000-0000-4000-8000-000000000104','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('category_installation','44000000-0000-4000-8000-000000000102','44000000-0000-4000-8000-000000000105','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('category_monitored_element','44000000-0000-4000-8000-000000000102','44000000-0000-4000-8000-000000000106','44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001');
insert into public.cms_pim_units(code,label,symbol,dimension_key,canonical_code,factor_to_canonical,created_by,updated_by)
values
('m3/h','Metro cúbico por hora','m³/h','volumetric_flow','m3/h',1,'44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001'),
('L/s','Litro por segundo','L/s','volumetric_flow','m3/h',3.6,'44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001');
insert into public.cms_pim_attribute_definitions(id,attribute_key,label,data_type,canonical_unit_code,filterable,comparable,searchable,created_by,updated_by)
values('44000000-0000-4000-8000-000000000201','flow_range','Faixa de vazão','range','m3/h',true,true,true,'44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001');

select lives_ok(
  $$select pg_temp.execute_pim_command('save_product',pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000011',
    '44000000-0000-4000-8000-000000000012','medidor-ufx-a','MPN-A'),
    p_command_id=>'44000000-0000-4000-8000-000000000401',
    p_idempotency_key=>'44000000-0000-4000-8000-000000000402',p_request_hash=>repeat('b',64))$$,
  'an authorized operator saves a normalized product graph'
);
select is((select normalized_name from public.cms_pim_products where id='44000000-0000-4000-8000-000000000010'),'medidor ufx a','the product name is normalized');
select is((select count(*)::integer from public.cms_pim_models where product_id='44000000-0000-4000-8000-000000000010'),1,'the model is normalized into its own identity');
select is((select count(*)::integer from public.cms_pim_variants where product_id='44000000-0000-4000-8000-000000000010'),1,'the variant is normalized into its own identity');
select is((select count(*)::integer from public.cms_pim_product_master_links where product_id='44000000-0000-4000-8000-000000000010' and status='active'),4,'all compatible multi-value classifications are linked');
select is((select count(*)::integer from public.cms_pim_provenance where product_id='44000000-0000-4000-8000-000000000010' and active),1,'provenance is stored with the product');
select is((select canonical_max from public.cms_pim_attribute_values where product_id='44000000-0000-4000-8000-000000000010'),36::numeric,'L/s ranges are materialized in the canonical m3/h unit');

select lives_ok(
  $$select pg_temp.execute_pim_command('generate_sku',jsonb_build_object(
    'productId','44000000-0000-4000-8000-000000000010','modelId','44000000-0000-4000-8000-000000000011',
    'variantId','44000000-0000-4000-8000-000000000012','reason','Canal comercial de teste'),
    p_command_id=>'44000000-0000-4000-8000-000000000403',
    p_idempotency_key=>'44000000-0000-4000-8000-000000000404',p_request_hash=>repeat('c',64))$$,
  'the governed service generates a SKU'
);
select matches((select sku from public.cms_pim_skus where product_id='44000000-0000-4000-8000-000000000010'),'^GAI-[A-Z0-9]+-[0-9]{6}$','the SKU uses the governed immutable format');
select is((pg_temp.execute_pim_command('generate_sku','{"productId":"44000000-0000-4000-8000-000000000010","modelId":"44000000-0000-4000-8000-000000000011","variantId":"44000000-0000-4000-8000-000000000012","reason":"Canal comercial de teste"}'::jsonb,p_command_id=>'44000000-0000-4000-8000-000000000403',p_idempotency_key=>'44000000-0000-4000-8000-000000000404',p_request_hash=>repeat('c',64))->>'replayed')::boolean,true,'an identical SKU request replays its receipt');
select is((select count(*)::integer from public.cms_pim_skus where product_id='44000000-0000-4000-8000-000000000010'),1,'an idempotent retry never creates a second SKU');
select throws_ok(
  $$select pg_temp.execute_pim_command('generate_sku','{"productId":"44000000-0000-4000-8000-000000000010","modelId":"44000000-0000-4000-8000-000000000011","reason":"Outra operação"}'::jsonb,p_idempotency_key=>'44000000-0000-4000-8000-000000000404',p_request_hash=>repeat('e',64))$$,
  '23505','CMS_PIM_IDEMPOTENCY_CONFLICT','an idempotency key cannot represent another SKU request'
);
select throws_ok($$update public.cms_pim_skus set sku='GAI-ALTERADO-999999'$$,'42501','CMS_PIM_SKU_IMMUTABLE','a SKU code cannot be changed');
select throws_ok($$delete from public.cms_pim_skus$$,'42501','CMS_PIM_DELETE_FORBIDDEN','a SKU identity cannot be deleted');
select throws_ok(
  $$select pg_temp.execute_pim_command('save_product',jsonb_set(jsonb_set(pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000010','44000000-0000-4000-8000-000000000011',
    '44000000-0000-4000-8000-000000000012','medidor-ufx-a','MPN-A'),'{mode}','"update"'),'{expectedVersion}','99'))$$,
  'P0001','CMS_PIM_CONFLICT','optimistic concurrency rejects a stale graph without infrastructure retry'
);
select throws_ok(
  $$select pg_temp.execute_pim_command('save_product',pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000020','44000000-0000-4000-8000-000000000021',
    '44000000-0000-4000-8000-000000000022','medidor-ufx-a','MPN-B'))$$,
  '23505',null,'active product slugs remain unique'
);
select throws_ok(
  $$select pg_temp.execute_pim_command('save_product',pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000030','44000000-0000-4000-8000-000000000031',
    '44000000-0000-4000-8000-000000000032','medidor-ufx-b','MPN-A'))$$,
  '23505',null,'MPN is unique for an active manufacturer'
);
select throws_ok(
  $$select pg_temp.execute_pim_command('save_product',pg_temp.product_payload(
    '44000000-0000-4000-8000-000000000040','44000000-0000-4000-8000-000000000041',
    '44000000-0000-4000-8000-000000000042','medidor-ufx-c','MPN-C','44000000-0000-4000-8000-000000000107'))$$,
  '23514','CMS_PIM_COMPATIBILITY_INVALID','an unlinked classification cannot enter the graph'
);
select throws_ok(
  $$select pg_temp.execute_pim_command('archive_product','{"productId":"44000000-0000-4000-8000-000000000010","expectedVersion":1,"reason":"Fim do piloto"}'::jsonb,p_aal=>'aal1')$$,
  '42501','CMS_PIM_FORBIDDEN','archival requires an AAL2 session'
);
select lives_ok(
  $$select pg_temp.execute_pim_command('archive_product','{"productId":"44000000-0000-4000-8000-000000000010","expectedVersion":1,"reason":"Fim do piloto"}'::jsonb)$$,
  'an AAL2 operator archives the product graph'
);
select is((select status from public.cms_pim_products where id='44000000-0000-4000-8000-000000000010'),'archived','the product identity remains as archived history');
select is((select status from public.cms_pim_skus where product_id='44000000-0000-4000-8000-000000000010'),'retired','archival retires rather than deletes the SKU');
select is((select count(*)::integer from public.cms_pim_events),3,'successful mutations append immutable PIM events');
select is((select count(*)::integer from public.cms_audit_log where action like 'cms:pim.%'),3,'successful mutations append central audit records');
select throws_ok($$delete from public.cms_pim_events$$,'42501','CMS audit records are immutable','PIM events cannot be deleted');
select throws_ok($$delete from public.cms_pim_products$$,'42501','CMS_PIM_DELETE_FORBIDDEN','product identities cannot be hard-deleted');

update public.cms_feature_flags set kill_switch=true,updated_by='44000000-0000-4000-8000-000000000001' where flag_key='ev2.pim_v2';
select throws_ok(
  $$select pg_temp.execute_pim_command('generate_sku','{"productId":"44000000-0000-4000-8000-000000000010","modelId":"44000000-0000-4000-8000-000000000011","reason":"Bloqueada"}'::jsonb)$$,
  '42501','CMS_PIM_FEATURE_DISABLED','the kill switch blocks further mutations'
);

select * from finish();
rollback;
