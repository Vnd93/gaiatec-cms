begin;

do $repair$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('private.cms_capture_qa_actor_lease()'::regprocedure)
  into v_definition;
  v_original := v_definition;

  if position($old$v_created_at timestamptz := statement_timestamp();$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$v_created_at timestamptz := statement_timestamp();$old$,
      $new$v_created_at timestamptz := transaction_timestamp();$new$
    );
  elsif position($new$v_created_at timestamptz := transaction_timestamp();$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_ACTOR_CAPTURE_TIMESTAMP_DRIFT' using errcode = 'P0001';
  end if;

  if position($old$if not (
    new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
    and new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
  ) then$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$if not (
    new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
    and new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
  ) then$old$,
      $new$if (
    new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb
    and new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'
  ) is not true then
    if coalesce(new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb, false)
       or coalesce(new.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser', false) then
      raise exception 'CMS_QA_ACTOR_METADATA_INVALID' using errcode = '22023';
    end if;$new$
    );
  elsif position($new$if coalesce(new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb, false)$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_ACTOR_CAPTURE_PREDICATE_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;

  select pg_get_functiondef(
    'private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  if position($old$  v_previous_actor text;
begin$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$  v_previous_actor text;
begin$old$,
      $new$  v_previous_actor text;
  v_correlation_id uuid:=gen_random_uuid();
begin$new$
    );
  elsif position($new$  v_correlation_id uuid:=gen_random_uuid();
begin$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_FORMS_CLEANUP_CORRELATION_DECLARATION_DRIFT' using errcode = 'P0001';
  end if;

  if position($old$    ),old.correlation_id
  );$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$    ),old.correlation_id
  );$old$,
      $new$    ),v_correlation_id
  );$new$
    );
  elsif position($new$    ),v_correlation_id
  );$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_FORMS_CLEANUP_CORRELATION_USE_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;

  select pg_get_functiondef(
    'private.cms_ai_terminalize_qa_actor_graph()'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  if position($old$  v_business_rows_removed integer:=0;
begin$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$  v_business_rows_removed integer:=0;
begin$old$,
      $new$  v_business_rows_removed integer:=0;
  v_correlation_id uuid:=gen_random_uuid();
begin$new$
    );
  elsif position($new$  v_correlation_id uuid:=gen_random_uuid();
begin$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_AI_CLEANUP_CORRELATION_DECLARATION_DRIFT' using errcode = 'P0001';
  end if;

  if position($old$old.actor_id,'ai_qa_scope_terminal',old.correlation_id$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$old.actor_id,'ai_qa_scope_terminal',old.correlation_id$old$,
      $new$old.actor_id,'ai_qa_scope_terminal',v_correlation_id$new$
    );
  elsif position($new$old.actor_id,'ai_qa_scope_terminal',v_correlation_id$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_AI_EVENT_CORRELATION_DRIFT' using errcode = 'P0001';
  end if;

  if position($old$    ),old.correlation_id
  );$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$    ),old.correlation_id
  );$old$,
      $new$    ),v_correlation_id
  );$new$
    );
  elsif position($new$    ),v_correlation_id
  );$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_AI_AUDIT_CORRELATION_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$repair$;

create or replace function public.cms_open_draft_after_edit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_setting('cms.qa_compensating', true) = 'on'
     and current_setting('cms.qa_restore_item', true) = new.item_id::text then
    return new;
  end if;

  if exists (
    select 1
    from public.cms_content_items
    where id = new.item_id
      and workflow_status in ('published', 'approved')
  ) then
    update public.cms_content_items
    set workflow_status = 'draft',
        archived_at = null,
        scheduled_for = null,
        updated_by = new.updated_by
    where id = new.item_id;
  end if;
  return new;
end;
$$;

revoke all on function private.cms_capture_qa_actor_lease()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()
  from public, anon, authenticated, service_role;
revoke all on function private.cms_ai_terminalize_qa_actor_graph()
  from public, anon, authenticated, service_role;
revoke all on function public.cms_open_draft_after_edit()
  from public, anon, authenticated, service_role;

commit;
