-- Campos internos na projeção pública e cadastro em massa transacional de produtos novos.

update public.cms_capability_registry
set validation_contract = validation_contract || '{"fieldVisibility":true,"publicProjectionSanitized":true,"bulkDraftImport":true}'::jsonb,
    test_contract = test_contract || '{"internalFieldsNotLeaked":true,"bulkDryRun":true,"bulkAtomic":true}'::jsonb
where consumer_id = 'cms.catalog-product.v1';

-- A projeção editorial completa contém dados internos. O acesso público passa
-- exclusivamente pela Edge Function cms-public, que usa a service role e sanitiza o payload.
revoke select on table public.cms_published_projection from anon;
drop policy if exists cms_projection_public_read on public.cms_published_projection;
create policy cms_projection_authorized_read on public.cms_published_projection
for select to authenticated using (public.cms_can_read_content(content_type));

revoke select on table public.cms_product_projection, public.cms_product_variant_projection,
  public.cms_product_attribute_projection, public.cms_product_document_projection,
  public.cms_product_relation_projection, public.cms_product_search_term_projection,
  public.cms_redirects from anon;

drop policy if exists cms_product_projection_public on public.cms_product_projection;
drop policy if exists cms_product_variants_public on public.cms_product_variant_projection;
drop policy if exists cms_product_attributes_public on public.cms_product_attribute_projection;
drop policy if exists cms_product_documents_public on public.cms_product_document_projection;
drop policy if exists cms_product_relations_public on public.cms_product_relation_projection;
drop policy if exists cms_product_search_terms_public on public.cms_product_search_term_projection;
drop policy if exists cms_redirects_public on public.cms_redirects;

create policy cms_product_projection_authorized on public.cms_product_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_variants_authorized on public.cms_product_variant_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_attributes_authorized on public.cms_product_attribute_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_documents_authorized on public.cms_product_document_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_relations_authorized on public.cms_product_relation_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_product_search_terms_authorized on public.cms_product_search_term_projection
for select to authenticated using (public.cms_has_permission('cms:products.read'));
create policy cms_redirects_authorized on public.cms_redirects
for select to authenticated using (public.cms_has_permission('cms:products.read'));

create table public.cms_bulk_import_receipts (
  idempotency_key uuid primary key,
  actor_id uuid not null references auth.users(id),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.cms_bulk_import_receipts enable row level security;
revoke all on table public.cms_bulk_import_receipts from public, anon, authenticated;
grant all on table public.cms_bulk_import_receipts to service_role;

create function public.cms_validate_bulk_product_import(
  p_actor_id uuid,
  p_rows jsonb,
  p_reason text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_row jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_valid jsonb := '[]'::jsonb;
  v_row_number integer;
  v_slug text;
  v_payload jsonb;
  v_visibility jsonb;
  v_message text;
begin
  if p_actor_id is null or p_idempotency_key is null or p_correlation_id is null
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'CMS_BULK_INVALID' using errcode = '22023';
  end if;
  if not public.cms_actor_authorized(p_actor_id, 'cms:products.edit', p_aal, p_session_id, p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) row
    group by row ->> 'slug' having count(*) > 1
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'sheet','Produtos','row',1,'field','slug','message','Há slugs duplicados no lote.'
    ));
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_number := coalesce((v_row ->> 'sourceRow')::integer, 1);
    v_slug := v_row ->> 'slug';
    v_payload := v_row -> 'payload';
    begin
      if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or jsonb_typeof(v_payload) <> 'object'
         or v_payload ->> 'contentType' <> 'product'
         or v_payload ->> 'consumerId' <> 'cms.catalog-product.v1'
         or jsonb_typeof(v_payload -> 'fieldVisibility') <> 'object'
         or jsonb_typeof(v_payload -> 'models') <> 'array' or jsonb_array_length(v_payload -> 'models') = 0
         or jsonb_typeof(v_payload -> 'specifications') <> 'array' or jsonb_array_length(v_payload -> 'specifications') = 0 then
        raise exception 'CMS_BULK_PRODUCT_INVALID' using errcode = '23514';
      end if;
      v_visibility := v_payload -> 'fieldVisibility';
      if exists (
        select 1 from jsonb_each_text(v_visibility) setting
        where setting.value not in ('public','internal')
      ) then raise exception 'CMS_BULK_VISIBILITY_INVALID' using errcode = '23514'; end if;
      perform public.cms_validate_registered_content('product', 1, v_payload);
      if exists(select 1 from public.cms_content_items where content_type='product' and slug=v_slug) then
        raise exception 'CMS_BULK_SLUG_CONFLICT' using errcode = '23505';
      end if;
      v_valid := v_valid || jsonb_build_array(jsonb_build_object('sourceRow',v_row_number,'slug',v_slug));
    exception when others then
      v_message := case
        when sqlerrm like '%SLUG_CONFLICT%' then 'O slug já existe no CMS.'
        when sqlerrm like '%VISIBILITY%' then 'Visibilidade deve ser público ou interno.'
        else 'O conteúdo não atende ao contrato de produto.' end;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'sheet','Produtos','row',v_row_number,'field','payload','message',v_message
      ));
    end;
  end loop;

  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:bulk_import.validate','bulk_product_import',p_idempotency_key::text,
    jsonb_build_object('total',jsonb_array_length(p_rows),'errors',jsonb_array_length(v_errors)),p_correlation_id);
  return jsonb_build_object(
    'status','valid','total',jsonb_array_length(p_rows),'rows',v_valid,'errors',v_errors
  );
end;
$$;

create function public.cms_execute_bulk_product_import(
  p_actor_id uuid,
  p_rows jsonb,
  p_reason text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_receipt public.cms_bulk_import_receipts%rowtype;
  v_hash text;
  v_validation jsonb;
  v_results jsonb := '[]'::jsonb;
  v_row jsonb;
  v_index integer := 0;
  v_response jsonb;
  v_row_key uuid;
  v_row_correlation uuid;
begin
  v_hash := encode(extensions.digest(convert_to(coalesce(p_rows::text,'null'),'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.cms_bulk_import_receipts
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_receipt.actor_id<>p_actor_id or v_receipt.input_hash<>v_hash then
      raise exception 'CMS_BULK_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    if v_receipt.response is not null then return v_receipt.response; end if;
  else
    insert into public.cms_bulk_import_receipts(idempotency_key,actor_id,input_hash,correlation_id)
    values(p_idempotency_key,p_actor_id,v_hash,p_correlation_id);
  end if;

  v_validation := public.cms_validate_bulk_product_import(
    p_actor_id,p_rows,p_reason,p_aal,p_session_id,p_issued_at,gen_random_uuid(),p_correlation_id
  );
  if jsonb_array_length(v_validation -> 'errors') > 0 then
    raise exception 'CMS_BULK_INVALID' using errcode='23514';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_row_key := (
      substr(md5(p_idempotency_key::text||':row:'||v_index),1,8)||'-'||
      substr(md5(p_idempotency_key::text||':row:'||v_index),9,4)||'-4'||
      substr(md5(p_idempotency_key::text||':row:'||v_index),14,3)||'-a'||
      substr(md5(p_idempotency_key::text||':row:'||v_index),18,3)||'-'||
      substr(md5(p_idempotency_key::text||':row:'||v_index),21,12)
    )::uuid;
    v_row_correlation := (
      substr(md5(p_correlation_id::text||':row:'||v_index),1,8)||'-'||
      substr(md5(p_correlation_id::text||':row:'||v_index),9,4)||'-4'||
      substr(md5(p_correlation_id::text||':row:'||v_index),14,3)||'-b'||
      substr(md5(p_correlation_id::text||':row:'||v_index),18,3)||'-'||
      substr(md5(p_correlation_id::text||':row:'||v_index),21,12)
    )::uuid;
    v_response := public.cms_execute_editorial_command(
      p_actor_id,'create',null,'product',v_row->>'slug',v_row->'payload',null,null,
      p_reason,null,p_aal,p_session_id,p_issued_at,v_row_key,v_row_correlation
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'sourceRow',(v_row->>'sourceRow')::integer,'slug',v_row->>'slug',
      'itemId',v_response->>'itemId','status',v_response->>'status'
    ));
  end loop;

  v_response := jsonb_build_object('status','created','total',jsonb_array_length(p_rows),'rows',v_results,'errors','[]'::jsonb);
  update public.cms_bulk_import_receipts set response=v_response,completed_at=now()
  where idempotency_key=p_idempotency_key;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:bulk_import.create','bulk_product_import',p_idempotency_key::text,
    jsonb_build_object('total',jsonb_array_length(p_rows),'itemIds',
      (select jsonb_agg(value->>'itemId') from jsonb_array_elements(v_results))),p_correlation_id);
  return v_response;
end;
$$;

revoke all on function public.cms_validate_bulk_product_import(uuid,jsonb,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated;
revoke all on function public.cms_execute_bulk_product_import(uuid,jsonb,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cms_validate_bulk_product_import(uuid,jsonb,text,text,text,timestamptz,uuid,uuid) to service_role;
grant execute on function public.cms_execute_bulk_product_import(uuid,jsonb,text,text,text,timestamptz,uuid,uuid) to service_role;
