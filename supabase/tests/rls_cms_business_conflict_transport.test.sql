begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

create temporary table expected_conflict_transport(signature text, occurrences integer);
insert into expected_conflict_transport values
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
      ('public.cms_transition_document_asset(uuid,uuid,text,bigint,text,text,timestamp with time zone,uuid,text,uuid)', 1);

select is((select count(*)::integer from expected_conflict_transport
  where to_regprocedure(signature) is not null), 47,
  'every reviewed conflict function exists with the exact signature');
select is((select sum(occurrences)::integer from expected_conflict_transport), 68,
  'the reviewed inventory covers all 68 deliberate business refusals');
select ok(not exists(
  select 1 from expected_conflict_transport expected
  left join pg_catalog.pg_proc procedure_row on procedure_row.oid=to_regprocedure(expected.signature)
  where procedure_row.oid is null
    or (length(procedure_row.prosrc)-length(replace(procedure_row.prosrc,'''PT409''','')))
       /length('''PT409''')<>expected.occurrences
), 'all business refusals are HTTP 409, not engine serialization failures');
select ok(not exists(
  select 1 from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure_row.pronamespace
  where namespace.nspname in ('public','private')
    and procedure_row.proname like 'cms_%' and procedure_row.prokind='f'
    and position('''40001''' in procedure_row.prosrc)>0
), 'no CMS function reintroduces a custom serialization retry storm');
select ok(
  has_function_privilege('service_role',
    'public.cms_confirm_synthetic_document_removal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.cms_confirm_synthetic_document_removal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid)','EXECUTE')
  and not has_function_privilege('anon',
    'public.cms_confirm_synthetic_document_removal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid)','EXECUTE'),
  'a transport fix cannot expose the trusted confirmation RPC');

select * from finish();
rollback;
