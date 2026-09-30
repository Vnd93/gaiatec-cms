begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 0046 fixed this transport mistake for three older RPCs. Later migrations
-- reintroduced 68 deliberate refusals using the engine-only serialization code.
-- PostgREST 14 retries a custom 40001 in a fresh transaction indefinitely:
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Change only those explicit business SQLSTATEs to HTTP 409. Keep every guard,
-- lock, fence deadline, privilege, audit write and return value byte-for-byte.
-- Actual engine serialization failures are NOT caught or translated.
do $cms_business_conflict_transport$
declare
  v_target record;
  v_function regprocedure;
  v_before text;
  v_after text;
  v_old constant text := '''40001''';
  v_new constant text := '''PT409''';
  v_raise_count integer;
  v_security_before jsonb;
  v_security_after jsonb;
begin
  for v_target in
    select * from (values
      ('private.cms_catalog_validate_hierarchy_revision()', 1),
      ('private.cms_catalog_validate_product_relation_revision()', 1),
      ('private.cms_catalog_validate_product_revision()', 1),
      ('private.cms_catalog_validate_taxonomy_revision()', 1),
      ('private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)', 2),
      ('private.cms_cleanup_terminal_product_shared_options_0078()', 1),
      ('private.cms_compensate_qa_domain_residue(uuid,text)', 3),
      ('private.cms_document_canonical_write_fence()', 1),
      ('private.cms_lock_content_item_for_actor(uuid,uuid,text)', 1),
      ('private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()', 1),
      ('private.cms_prepare_qa_actor_terminal_vocab_cleanup()', 2),
      ('private.cms_restore_qa_global_snapshots(uuid)', 2),
      ('private.cms_visual_lock_branch_for_actor(uuid,uuid,text,uuid[])', 1),
      ('private.cms_visual_lock_site_for_actor(uuid,uuid,text)', 1),
      ('public.cms_abandon_qa_invite_scoped(uuid,uuid,text,text,text,timestamp with time zone,uuid)', 1),
      ('public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamp with time zone,uuid,uuid)', 2),
      ('public.cms_apply_user_command_unscoped_0070(uuid,text,uuid,text,text,text[],text,text,timestamp with time zone,uuid,uuid)', 1),
      ('public.cms_catalog_ack_publication(uuid,uuid,bigint)', 2),
      ('public.cms_catalog_editorial_command(text,jsonb,uuid)', 1),
      ('public.cms_catalog_publish_product(uuid,bigint)', 1),
      ('public.cms_catalog_reconcile_publication_outbox(text,integer)', 1),
      ('public.cms_catalog_record_hierarchy_revision(uuid,uuid,uuid,text,bigint,text)', 1),
      ('public.cms_catalog_record_relation_revision(uuid,uuid,uuid,text,numeric,text,bigint,text)', 1),
      ('public.cms_catalog_submit_product(uuid,bigint)', 1),
      ('public.cms_catalog_unpublish_product(uuid,bigint)', 1),
      ('public.cms_catalog_update_product(uuid,bigint,text,text,jsonb)', 1),
      ('public.cms_catalog_workspace_command(text,jsonb,uuid)', 4),
      ('public.cms_claim_document_finalization(uuid,uuid,uuid,text,text,timestamp with time zone,uuid)', 1),
      ('public.cms_confirm_document_blob_removal(uuid,text,uuid)', 1),
      ('public.cms_draft_v2_conflict_scoped(uuid,uuid,text,text,text,text,timestamp with time zone)', 1),
      ('public.cms_execute_draft_v2_command(uuid,text,uuid,text,text,jsonb,text,bigint,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)', 1),
      ('public.cms_execute_editorial_command_unscoped_0069(uuid,text,uuid,text,text,jsonb,bigint,uuid,text,timestamp with time zone,text,text,timestamp with time zone,uuid,uuid)', 2),
      ('public.cms_execute_form_lifecycle_command_scoped(uuid,text,text,uuid,uuid,bigint,text,text,text,timestamp with time zone,uuid,text,uuid)', 1),
      ('public.cms_execute_form_lifecycle_command_unscoped_0072(uuid,text,uuid,uuid,bigint,text,text,text,timestamp with time zone,uuid,text,uuid)', 1),
      ('public.cms_execute_master_data_command(uuid,text,jsonb,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)', 1),
      ('public.cms_execute_quality_command_scoped(uuid,text,uuid,text,uuid,text,jsonb,text,text,timestamp with time zone,uuid)', 1),
      ('public.cms_execute_release_command_unscoped_0073(uuid,text,uuid,text,text,bigint,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)', 2),
      ('public.cms_finish_lead_outbox(uuid,boolean,text)', 1),
      ('public.cms_finish_outbox(uuid,boolean,text,uuid)', 1),
      ('public.cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamp with time zone,uuid)', 2),
      ('public.cms_manage_controlled_vocabulary_scoped_pre_0078(uuid,text,text,jsonb,jsonb,text,text,timestamp with time zone,uuid)', 3),
      ('public.cms_promote_draft_v2_to_content(uuid,uuid,bigint,text,jsonb,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)', 3),
      ('public.cms_reconcile_legacy_pim_product(uuid,uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,timestamp with time zone,uuid,uuid,text,uuid)', 4),
      ('public.cms_retire_managed_page_unscoped_0069(uuid,uuid,text,jsonb,bigint,text,text,text,timestamp with time zone,uuid,uuid)', 1),
      ('public.cms_review_document_security(uuid,uuid,text,text,text,text,text,text,text,text,text,timestamp with time zone,uuid,text,uuid)', 1),
      ('public.cms_search_governance_command_scoped(uuid,text,text,jsonb,text,text,timestamp with time zone,uuid)', 2),
      ('public.cms_transition_document_asset(uuid,uuid,text,bigint,text,text,timestamp with time zone,uuid,text,uuid)', 1)
    ) as expected(signature, occurrences)
  loop
    v_function := to_regprocedure(v_target.signature);
    if v_function is null then
      raise exception 'CMS_CONFLICT_TRANSPORT_FUNCTION_MISSING:%', v_target.signature
        using errcode = '55000';
    end if;
    v_before := pg_get_functiondef(v_function::oid);
    select count(*) into v_raise_count
    from regexp_matches(v_before, 'errcode[[:space:]]*=[[:space:]]*''40001''', 'g');
    if v_raise_count <> v_target.occurrences
       or (length(v_before) - length(replace(v_before, v_old, ''))) / length(v_old)
          <> v_target.occurrences
       or position(v_new in v_before) > 0 then
      raise exception 'CMS_CONFLICT_TRANSPORT_SOURCE_DRIFT:%', v_target.signature
        using errcode = '55000';
    end if;
    select to_jsonb(procedure_row) - 'prosrc'
    into v_security_before from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = v_function::oid;
    v_after := replace(v_before, v_old, v_new);
    execute v_after;
    select to_jsonb(procedure_row) - 'prosrc'
    into v_security_after from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = to_regprocedure(v_target.signature)::oid;
    if v_security_after is distinct from v_security_before
       or pg_get_functiondef(v_function::oid) is distinct from v_after then
      raise exception 'CMS_CONFLICT_TRANSPORT_POSTCONDITION_DRIFT:%', v_target.signature
        using errcode = '55000';
    end if;
  end loop;

  -- Fail closed if a business refusal outside the reviewed inventory was missed.
  if exists (
    select 1 from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure_row.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure_row.proname like 'cms_%'
      and procedure_row.prokind = 'f'
      and position(v_old in procedure_row.prosrc) > 0
  ) then
    raise exception 'CMS_CONFLICT_TRANSPORT_INCOMPLETE' using errcode = '55000';
  end if;
end;
$cms_business_conflict_transport$;
commit;
