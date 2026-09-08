import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("staging migration canary is fail-closed on the one authorized project and exact SHA", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /ref: "glcqsosxwgmlhzgcsnzv"/);
  assert.match(source, /name: "GAIATEC CMS Staging"/);
  assert.match(source, /region: "us-east-2"/);
  assert.match(source, /G12_MIGRATION_CANARY_EXPECTED_SHA/);
  assert.match(source, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(source, /G12_STAGING_MIGRATION_CANARY_TARGET_REFUSED/);
  assert.match(source, /sourceMigrationManifest\(process\.cwd\(\)\)/);
  assert.match(source, /exactMigrationHistorySql\(sourceMigrations\)/);
  assert.match(source, /"candidate_migration_history_exact"/);
  assert.match(source, /appliedMigrations: sourceMigrations\.map/);
  assert.match(source, /scenarioCoverage/);
  assert.match(source, /"form_lifecycle_0058_present"/);
  assert.match(source, /"qa_actor_lease_0061_present"/);
  assert.match(source, /"qa_actor_watchdog_cron_0061_active"/);
  assert.match(source, /"documents_qa_attestation_gate_present"/);
  assert.match(source, /"documents_neutralization_prepare_present"/);
  assert.match(source, /"documents_neutralization_confirm_present"/);
  assert.match(source, /"documents_fixture_neutralization_present"/);
  assert.match(source, /"0080"/);
  assert.match(source, /"qa_rate_limit_proof_buckets_0080_present"/);
  assert.match(source, /"qa_rate_limit_proof_rpc_0080_present"/);
  assert.match(source, /"qa_rate_limit_proof_privileges_0080_exact"/);
  assert.match(source, /"qa_rate_limit_proof_cleanup_0080_present"/);
  assert.match(source, /"0081"/);
  assert.match(source, /"collaboration_assignee_directory_0081_present"/);
  assert.match(source, /"collaboration_assignee_directory_0081_privileges_exact"/);
  assert.doesNotMatch(source, /chfuhctnhqgyjowkvllv/);
  assert.doesNotMatch(source, /STAGING_SUPABASE_(?:ANON|SERVICE_ROLE)_KEY/);

  const apiKeys = source.indexOf('"api-keys"');
  assert.ok(apiKeys >= 0, "the canary must resolve project keys with the pinned CLI");
  assert.ok(source.indexOf('"--project-ref"', apiKeys) > apiKeys);
  assert.ok(source.indexOf("TARGET.ref", apiKeys) > apiKeys);
  assert.ok(source.indexOf('"--reveal"', apiKeys) > apiKeys);
  assert.match(source, /SUPABASE_ACCESS_TOKEN: accessToken/);
});

test("canary proves the collaboration assignee directory is scoped and data-minimized", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /async function exerciseCollaborationAssigneeDirectory/);
  assert.match(source, /"cms-collaboration", "assignees"/);
  assert.match(source, /"collaboration_assignee_directory_0081_anonymous_denied"/);
  assert.match(source, /"collaboration_assignee_directory_0081_same_run_only"/);
  assert.match(source, /"collaboration_assignee_directory_0081_environment_forgery_denied"/);
  assert.match(source, /"collaboration_assignee_directory_0081_unprivileged_denied"/);
  assert.match(source, /CMS_COLLABORATION_SCOPE_MISMATCH/);
  assert.match(source, /Object\.keys\(item\)\.sort\(\)\.join\(","\) === "displayName,userId"/);
  assert.match(source, /expectedIds = \[operator\.id, dualScopeActor\.id\]\.sort\(\)/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("async function exerciseCollaborationAssigneeDirectory"),
      source.indexOf("async function exerciseDocuments"),
    ),
    /display_email|auth\.users\.email/,
  );
  assert.match(source, /await exerciseCollaborationAssigneeDirectory\(\)/);
});

test("database deployment preflights require the exact 0081 RPC and service-only grants", async () => {
  const verifiers = await Promise.all([
    read("scripts/ev2/phase12/verify-staging-database.mjs"),
    read("scripts/ev2/phase12/verify-production-database.mjs"),
  ]);

  for (const verifier of verifiers) {
    assert.match(
      verifier,
      /to_regprocedure\('public\.cms_list_collaboration_assignees\(uuid,text,text,text,text,timestamptz,integer\)'\) is not null\s+as collaboration_assignee_directory_present/,
    );
    assert.match(
      verifier,
      /has_function_privilege\(\s*'service_role',\s*'public\.cms_list_collaboration_assignees\(uuid,text,text,text,text,timestamptz,integer\)',\s*'EXECUTE'\s*\)/,
    );
    assert.match(
      verifier,
      /not has_function_privilege\(\s*'authenticated',\s*'public\.cms_list_collaboration_assignees\(uuid,text,text,text,text,timestamptz,integer\)',\s*'EXECUTE'\s*\)/,
    );
    assert.match(
      verifier,
      /not has_function_privilege\(\s*'anon',\s*'public\.cms_list_collaboration_assignees\(uuid,text,text,text,text,timestamptz,integer\)',\s*'EXECUTE'\s*\)/,
    );
    assert.match(verifier, /"collaboration_assignee_directory_present"/);
    assert.match(verifier, /"collaboration_assignee_directory_privileges_exact"/);
  }
});

test("database preflights require every 0082-0088 contract, exact ACL and semantic guards", async () => {
  const [contracts, canary, ...verifiers] = await Promise.all([
    read("scripts/ev2/phase12/migration-manifest-lib.mjs"),
    read("scripts/ev2/phase12/staging-migrations-canary.mjs"),
    read("scripts/ev2/phase12/verify-staging-database.mjs"),
    read("scripts/ev2/phase12/verify-production-database.mjs"),
  ]);
  for (const signature of [
    "public.cms_block_media_delete()",
    "private.cms_watchdog_stale_dam_uploads(integer)",
    "private.cms_validate_dam_crop_aspect()",
    "private.cms_block_dam_gc_relationship_write()",
    "private.cms_classify_media_gc_job()",
    "public.cms_abort_dam_upload(uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid)",
    "public.cms_fail_dam_finalization(uuid,uuid,uuid,text,uuid,text,text,timestamptz)",
    "public.cms_list_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])",
    "public.cms_count_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])",
    "public.cms_archive_legacy_media(uuid,text,text,text,text,timestamptz,uuid,uuid)",
    "public.cms_restore_legacy_media(uuid,text,text,text,text,timestamptz,uuid,uuid)",
    "public.cms_claim_incomplete_media_gc(integer,uuid)",
    "public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)",
    "public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)",
    "public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)",
    "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)",
    "private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)",
    "private.cms_form_capture_origin_allowed(uuid,uuid,jsonb,text)",
    "private.cms_public_relation_ids_0085(jsonb)",
    "private.cms_public_relation_count_0085(jsonb)",
    "private.cms_enforce_public_relation_limit_0085()",
    "private.cms_capture_qa_actor_lease()",
    "private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()",
    "private.cms_ai_terminalize_qa_actor_graph()",
    "public.cms_open_draft_after_edit()",
    "public.cms_resolve_session_unscoped_0070(uuid,text,text,text,timestamptz,uuid)",
    "private.cms_resolve_session_core_0087(uuid,text,text,text,text,timestamptz,uuid)",
    "public.cms_execute_visual_command(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)",
    "public.cms_execute_site_command(uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)",
    "private.cms_crb_terminalize_qa_graph()",
    "public.cms_prepare_dam_gc_core_0088(uuid,text,text,text,text,timestamptz,uuid,uuid)",
    "public.cms_complete_dam_gc_core_0088(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)",
    "public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text)",
    "public.cms_execute_dam_command_core_0088(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)",
    "private.cms_guard_dam_asset_gc_fence()",
    "private.cms_assert_dam_actor_context(uuid,text,text,text,timestamptz)",
  ])
    assert.ok(contracts.includes(signature), `missing exact RPC contract ${signature}`);
  for (const verifier of [canary, ...verifiers]) {
    assert.match(verifier, /serviceOnlyRpcContractSql/);
    assert.match(verifier, /media_upload_abort_0082_rpcs_present/);
    assert.match(verifier, /media_upload_abort_0082_rpcs_privileges_exact/);
    assert.match(verifier, /media_upload_abort_0082_helpers_locked/);
    assert.match(verifier, /media_upload_abort_0082_schema_pixel_limit_exact/);
    assert.match(verifier, /media_upload_abort_0082_schema_upload_token_expiry_exact/);
    assert.match(verifier, /media_upload_abort_0082_schema_upload_token_column_exact/);
    assert.match(verifier, /media_upload_watchdog_0082_exact/);
    assert.match(verifier, /session_refresh_revocation_0083_rpcs_present/);
    assert.match(verifier, /session_refresh_revocation_0083_rpcs_privileges_exact/);
    assert.match(verifier, /session_refresh_revocation_0083_semantics_exact/);
    assert.match(verifier, /sessionRefreshRevocationSemanticSql/);
    assert.match(verifier, /lead_origin_binding_0084_helpers_locked/);
    assert.match(verifier, /lead_origin_binding_0084_semantics_exact/);
    assert.match(verifier, /leadOriginBindingSemanticSql/);
    assert.match(verifier, /public_relation_limit_0085_helpers_locked/);
    assert.match(verifier, /public_relation_limit_0085_semantics_exact/);
    assert.match(verifier, /public_relation_limit_0085_existing_rows_valid/);
    assert.match(verifier, /publicRelationLimitSemanticSql/);
    assert.match(verifier, /qa_actor_runtime_repairs_0086_functions_locked/);
    assert.match(verifier, /qa_actor_runtime_repairs_0086_semantics_exact/);
    assert.match(verifier, /qaActorRuntimeRepairsSemanticSql/);
    assert.match(verifier, /runtime_integrity_repairs_0087_rpcs_present/);
    assert.match(verifier, /runtime_integrity_repairs_0087_rpcs_privileges_exact/);
    assert.match(verifier, /runtime_integrity_repairs_0087_functions_locked/);
    assert.match(verifier, /runtime_integrity_repairs_0087_semantics_exact/);
    assert.match(verifier, /runtimeIntegrityRepairsSemanticSql/);
    assert.match(verifier, /runtime_integrity_followup_0088_rpcs_present/);
    assert.match(verifier, /runtime_integrity_followup_0088_rpcs_privileges_exact/);
    assert.match(verifier, /runtime_integrity_followup_0088_functions_locked/);
    assert.match(verifier, /runtime_integrity_followup_0088_semantics_exact/);
    assert.match(verifier, /runtimeIntegrityFollowupSemanticSql/);
  }
  assert.match(contracts, /has_function_privilege\('service_role'/);
  assert.match(contracts, /has_function_privilege\('authenticated'/);
  assert.match(contracts, /has_function_privilege\('anon'/);
  assert.match(contracts, /aclexplode/);
  assert.match(contracts, /from public\.cms_login_events event/);
  assert.match(contracts, /from auth\.sessions auth_session/);
  assert.match(contracts, /p_action in \(''revoke_sessions'',''suspend'',''reactivate''\)/);
  assert.match(contracts, /insert into public\.cms_session_revocations/);
  assert.match(contracts, /permission\.critical/);
  assert.match(contracts, /p_event_type=''logout''/);
  assert.match(contracts, /''self_logout''/);
  assert.match(contracts, /join public\.cms_publications published/);
  assert.match(contracts, /for share of projection, item, published/);
  assert.match(contracts, /v_authoritative_path := ''\/produtos\/'' \|\| v_slug/);
  assert.match(contracts, /v_source in \(''site'', ''contact'', ''newsletter'', ''website''\)/);
  assert.match(contracts, /count\(distinct relation_id\)/);
  assert.match(contracts, /cms_00_enforce_public_relation_limit_0085/);
  assert.match(contracts, /transaction_timestamp\(\)/);
  assert.match(contracts, /\) is not true then/);
  assert.match(contracts, /CMS_QA_ACTOR_METADATA_INVALID/);
  assert.match(contracts, /v_correlation_id uuid:=gen_random_uuid\(\)/);
  assert.match(contracts, /not like '%old\.correlation_id%'/);
  assert.match(contracts, /cms\.qa_compensating/);
  assert.match(contracts, /cms\.qa_restore_item/);
  assert.match(contracts, /cms_capture_qa_actor_lease/);
  assert.match(contracts, /zzz_cms_forms_leads_terminal_cleanup/);
  assert.match(contracts, /zzzz_cms_ai_terminal_cleanup/);
  assert.match(contracts, /cms_draft_edit_opens_workflow/);
  assert.match(contracts, /trigger_row\.tgenabled = 'O'/);
  assert.match(contracts, /trigger_row\.tgfoid = to_regprocedure\(required\.signature\)/);
  assert.match(contracts, /not like '%update public\.cms_login_events%'/);
  assert.match(contracts, /cardinality\(role_keys\) > 0/);
  assert.match(contracts, /scope_capability ->> ''reasonCode'' = ''feature_disabled''/);
  assert.match(contracts, /with effective_assignment as materialized/);
  assert.match(contracts, /bool_or\(permission\.critical\)/);
  assert.match(contracts, /cardinality\(v_roles\) > 0/);
  assert.match(contracts, /''rbacScoped'', coalesce/);
  assert.match(contracts, /''rbacScopeReasonCode'', coalesce/);
  assert.match(contracts, /''scope'', case/);
  assert.match(contracts, /session_or_scope_invalid/);
  assert.match(contracts, /cms_system_lock_actor_scope\(p_user_id/);
  assert.match(contracts, /cms_system_lock_actor_scope\(p_actor_id/);
  assert.match(contracts, /procedure_row\.prosecdef/);
  assert.match(contracts, /language_row\.lanname = 'plpgsql'/);
  assert.match(contracts, /42cf04573ac27b48140b96b7dd4706b1ceee61838dc44983ebe7089e6d0afc4d/);
  assert.match(contracts, /fbe2c71fb695023b953a871c5f132e2dcf6b65a78265eb27441bda8cf1ef038f/);
  assert.match(contracts, /p_event_type is null/);
  assert.match(contracts, /p_aal is null/);
  assert.match(contracts, /or p_action is null/);
  assert.match(contracts, /or p_environment is null/);
  assert.match(contracts, /or p_site_key is distinct from ''main''/);
  assert.match(contracts, /CMS_VISUAL_COMMAND_INVALID/);
  assert.match(contracts, /CMS_VISUAL_MFA_REQUIRED/);
  assert.match(contracts, /cms_visual_assert_available/);
  assert.match(contracts, /CMS_SITES_COMMAND_INVALID/);
  assert.match(contracts, /CMS_SITES_MFA_REQUIRED/);
  assert.match(contracts, /cms_sites_assert_available/);
  assert.match(contracts, /cms_prepare_qa_actor_terminal_crb_cleanup/);
});

test("canary proves refresh-resistant session revocation without banning Auth", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /async function exerciseSessionRefreshRevocation/);
  assert.match(source, /"session_refresh_revocation_0083_invalid_payload_denied"/);
  assert.match(source, /"session_refresh_revocation_0083_invalid_action_denied"/);
  assert.match(source, /"session_refresh_revocation_0083_unprivileged_actor_denied"/);
  assert.match(source, /refreshClient\.auth\.refreshSession/);
  assert.match(source, /"session_refresh_revocation_0083_refreshed_jwt_denied"/);
  assert.match(source, /"session_refresh_revocation_0083_auth_identity_not_banned"/);
  assert.match(source, /await createFreshMfaSession\(dualScopeActor\)/);
  assert.match(source, /"session_refresh_revocation_0083_new_session_allowed"/);
  assert.match(source, /"session_refresh_revocation_0083_replay_is_duplicate"/);
  assert.match(source, /"session_refresh_revocation_0083_replay_does_not_widen"/);
  assert.match(source, /sessionRevocationLatencyMs < 10_000/);
  assert.match(source, /await exerciseSessionRefreshRevocation\(\)/);
  assert.match(source, /"0082"/);
  assert.match(source, /"0083"/);
  assert.match(source, /"0084"/);
  assert.match(source, /"0085"/);
  assert.match(source, /"0086"/);
  assert.match(source, /"0087"/);
  assert.match(source, /"0088"/);
  assert.match(source, /migrationManifest: sourceMigrations/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:password|refreshToken|totpSecret)/);
});

test("canary proves governed 0082 upload compensation and server-derived cleanup scope", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /async function exerciseMediaUploadAbort/);
  for (const check of [
    "media_upload_abort_0082_anonymous_denied",
    "media_upload_abort_0082_invalid_payload_denied",
    "media_upload_abort_0082_unprivileged_actor_denied",
    "media_upload_abort_0082_reservation_created",
    "media_upload_abort_0082_idor_denied",
    "media_upload_abort_0082_compensated",
    "media_upload_abort_0082_authoritative_state_closed",
    "media_upload_abort_0082_gc_manifest_server_derived",
  ])
    assert.ok(source.includes(check), `missing media canary check ${check}`);
  assert.match(source, /sourceKind: "synthetic_test"/);
  assert.match(source, /reserved\.json\?\.uploads\?\.length === 7/);
  assert.match(source, /status=in\.\(pending,processing,blocked,failed\)/);
  assert.match(source, /expectedPaths = \[/);
  assert.match(source, /job\?\.asset_snapshot\?\.paths/);
  assert.match(source, /Date\.parse\(job\?\.execute_after/);
  assert.match(source, /Date\.parse\(asset\?\.upload_token_expires_at/);
  assert.match(source, /async function closeMediaFixture/);
  assert.match(source, /await exerciseMediaUploadAbort\(\)/);
  assert.match(source, /activeMedia: activeMedia\.json\.length/);
  assert.match(source, /retainedSyntheticMediaAssets/);
  assert.match(source, /scheduledSyntheticMediaGcJobs/);
});

test("canary covers governed private PDFs and terminally removes the synthetic blob", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  for (const contract of [
    '"reserve_upload"',
    '"finalize_upload"',
    '"review_download"',
    '"review_security"',
    '"archive_document"',
    '"restore_document"',
    '"documents_anonymous_edge_denied"',
    '"documents_anonymous_storage_denied"',
    '"documents_pdf_quarantined_after_prefilter"',
    '"documents_uploader_self_approval_denied"',
    '"documents_second_actor_hash_attestation_releases"',
    '"legacy_documents_fail_closed"',
    '"legacy_documents_reattested_for_promotion"',
    '"documents_fixture_closed"',
    '"documents_fixture_neutralized_fenced"',
  ])
    assert.ok(source.includes(contract), `missing document canary contract ${contract}`);
  assert.match(source, /const DOCUMENT_BUCKET = "cms-documents-private"/);
  assert.match(source, /storage\.buckets where id = '\$\{DOCUMENT_BUCKET\}'/);
  assert.match(source, /storage\/v1\/object\/\$\{DOCUMENT_BUCKET\}/);
  assert.match(source, /declaredMime: "application\/pdf"/);
  assert.match(source, /visibility: "private"/);
  assert.match(source, /rightsConfirmed: true/);
  const cleanup = source.slice(
    source.indexOf("async function closeDocumentFixture"),
    source.indexOf("async function closePimFixture"),
  );
  assert.doesNotMatch(cleanup, /method: "PATCH"/);
  assert.doesNotMatch(cleanup, /archive_document/);
  assert.match(cleanup, /CMS_DOCUMENT_BLOB_REMOVAL_PENDING/);
});

test("legacy document backfill preflights malformed data and blocks promotion until exact re-attestation", async () => {
  const [migration, attestation, canary, stagingVerification, productionVerification] = await Promise.all([
    read("supabase/migrations/0057_cms_governed_documents.sql"),
    read("supabase/migrations/0063_cms_document_security_attestation.sql"),
    read("scripts/ev2/phase12/staging-migrations-canary.mjs"),
    read("scripts/ev2/phase12/verify-staging-database.mjs"),
    read("scripts/ev2/phase12/verify-production-database.mjs"),
  ]);

  const preflight = migration.slice(0, migration.indexOf("insert into public.cms_permissions"));
  const transactionStart = migration.indexOf("begin;");
  const inventoryLock = migration.indexOf("lock table public.cms_content_items");
  const transactionCommit = migration.lastIndexOf("commit;");
  assert.ok(transactionStart >= 0 && transactionStart < inventoryLock);
  assert.ok(transactionCommit > inventoryLock);
  assert.match(
    preflight,
    /lock table public\.cms_content_items, public\.cms_content_drafts,\s+public\.cms_content_revisions, public\.cms_published_projection,\s+storage\.objects in share mode/,
  );
  assert.match(preflight, /CMS_LEGACY_DOCUMENT_BACKFILL_PREFLIGHT_FAILED/);
  for (const adversarialClass of [
    "documents_not_array",
    "documents_limit_exceeded",
    "document_unknown_field",
    "document_location_invalid",
    "document_id_invalid",
    "document_external_url_invalid",
    "document_external_reference_ungoverned",
    "manufacturer_official_url_invalid",
    "document_storage_object_missing",
    "document_storage_mime_invalid",
    "document_storage_size_invalid",
    "document_id_conflict",
    "document_storage_identity_conflict",
    "document_duplicate_in_version",
    "document_rights_unconfirmed",
  ])
    assert.ok(preflight.includes(adversarialClass), `missing legacy preflight ${adversarialClass}`);
  assert.match(preflight, /validation_issue_count=%s reason_counts=%s/);
  assert.doesNotMatch(preflight, /target_id|storage_path=%s|document_id=%s/);
  assert.match(
    preflight,
    /jsonb_object_keys\(\s*case when jsonb_typeof\(value\) = 'object' then value else '\{\}'::jsonb end\s*\)/,
  );
  assert.match(
    preflight,
    /jsonb_array_length\(\s*case\s+when jsonb_typeof\(content\.payload -> 'documents'\) = 'array'/s,
  );
  assert.match(preflight, /from public\.cms_published_projection publication/);
  assert.match(preflight, /from public\.cms_content_drafts draft/);
  assert.match(preflight, /from public\.cms_content_revisions revision/);
  assert.match(preflight, /jsonb_typeof\(reference\.value -> 'officialUrl'\) as url_json_type/);
  assert.match(preflight, /jsonb_typeof\(content\.payload #> '\{manufacturer,officialUrl\}'\)/);
  assert.match(preflight, /where url_json_type is distinct from 'string'/);
  assert.match(preflight, /char_length\(official_url\) > 500/);
  assert.match(preflight, /official_url !~\* '\^https:\/\//);
  assert.match(preflight, /position\('@' in url_authority\) > 0/);
  assert.match(preflight, /char_length\(url_host\) > 253/);
  assert.match(preflight, /string_to_array\(url_host, '\.'\)/);
  assert.match(preflight, /octet\.value::integer not between 0 and 255/);
  assert.match(preflight, /url_port::integer > 65535/);
  for (const forbiddenExternalHost of [
    "localhost",
    "%.local",
    "%.internal",
    "^169\\.254\\.",
    "^192\\.168\\.",
  ])
    assert.ok(
      preflight.includes(forbiddenExternalHost),
      `missing external URL refusal ${forbiddenExternalHost}`,
    );

  const canonicalUrlGate = attestation.slice(
    attestation.indexOf("create or replace function private.cms_official_https_url_allowed"),
    attestation.indexOf("create or replace function private.cms_product_document_reference_shape_allowed"),
  );
  assert.match(canonicalUrlGate, /char_length\(p_url\) between 1 and 500/);
  assert.match(canonicalUrlGate, /position\('@' in authority\) = 0/);
  assert.match(canonicalUrlGate, /char_length\(host\) <= 253/);
  assert.match(canonicalUrlGate, /string_to_array\(host, '\.'\).*label/s);
  assert.match(canonicalUrlGate, /octet\.value::integer not between 0 and 255/);
  assert.match(canonicalUrlGate, /port::integer <= 65535/);
  assert.match(canonicalUrlGate, /coalesce\([\s\S]+false\s*\)/);
  for (const forbiddenExternalHost of [
    "localhost",
    "%.local",
    "%.internal",
    "^169\\.254\\.",
    "^192\\.168\\.",
  ])
    assert.ok(
      canonicalUrlGate.includes(forbiddenExternalHost),
      `0063 URL gate diverges for reserved host ${forbiddenExternalHost}`,
    );

  const backfillStart = migration.indexOf(
    "with legacy_content_versions as",
    migration.indexOf("-- Registros legados"),
  );
  const backfill = migration.slice(
    backfillStart,
    migration.indexOf("insert into public.cms_audit_log", backfillStart),
  );
  assert.ok(backfillStart >= 0, "legacy backfill must inventory every restorable source");
  assert.match(backfill, /from public\.cms_published_projection publication/);
  assert.match(backfill, /from public\.cms_content_drafts draft/);
  assert.match(backfill, /from public\.cms_content_revisions revision/);
  assert.match(backfill, /source_priority/);
  assert.match(backfill, /where nullif\(document\.value ->> 'storagePath', ''\) is not null/);
  assert.match(backfill, /when reference\.id_text ~ '[^']+'\s+then reference\.id_text::uuid/s);
  assert.match(
    backfill,
    /when reference\.byte_size_text ~ '\^\[0-9\]\{1,8\}\$'\s+then reference\.byte_size_text::bigint/s,
  );
  assert.doesNotMatch(backfill, /\(document\.value ->> 'id'\)::uuid/);
  assert.doesNotMatch(backfill, /nullif\(object\.metadata ->> 'size', ''\)::bigint/);
  assert.doesNotMatch(backfill, /greatest\(coalesce\(byte_size, 8\), 8\)/);
  assert.doesNotMatch(backfill, /on conflict[^;]+do nothing/is);

  const promotionGate = migration.slice(
    migration.indexOf("create or replace function public.cms_legacy_documents_promotion_ready"),
    migration.indexOf("revoke all on function public.cms_reserve_document_asset"),
  );
  assert.match(promotionGate, /asset\.source_kind = 'legacy_import'/);
  assert.match(promotionGate, /from public\.cms_content_drafts draft/);
  assert.match(promotionGate, /from public\.cms_content_revisions revision/);
  assert.match(promotionGate, /from stored_references reference/);
  assert.match(promotionGate, /asset\.processing_status = 'ready'/);
  assert.match(promotionGate, /asset\.scan_status = 'clean'/);
  assert.match(promotionGate, /'clamav-corporate-v1', 'microsoft-defender-corporate-v1'/);
  assert.doesNotMatch(promotionGate, /qa-synthetic-attestation-v1/);
  assert.match(promotionGate, /asset\.security_reviewed_by is distinct from asset\.created_by/);
  assert.match(promotionGate, /review\.document_sha256 = asset\.sha256/);
  assert.match(promotionGate, /review\.created_at = asset\.security_reviewed_at/);
  assert.match(promotionGate, /review\.evidence_sha256 = asset\.scanner_evidence_sha256/);
  assert.match(promotionGate, /quarantine_audit\.action = 'cms:documents\.legacy_quarantined'/);
  assert.match(promotionGate, /approval_audit\.action = 'cms:documents\.security_approve'/);
  assert.match(promotionGate, /approval_audit\.correlation_id = review\.correlation_id/);

  for (const gateConsumer of [canary, stagingVerification, productionVerification]) {
    assert.match(gateConsumer, /cms_legacy_documents_promotion_ready\(\)/);
    assert.match(gateConsumer, /legacy_documents_reattested_for_promotion/);
  }
  assert.doesNotMatch(
    `${stagingVerification}\n${productionVerification}`,
    /processing_status = 'ready' or scan_status = 'clean'/,
  );
});

test("canary proves legacy PIM is read-only and the product cycle uses cms-content", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /"cms-pim",\n\s+"save_product"/);
  assert.match(source, /"generate_sku"/);
  assert.match(source, /"archive_product"/);
  assert.match(source, /CMS_PIM_LEGACY_READ_ONLY/);
  assert.match(source, /canonicalWriter === "cms-content"/);
  assert.match(source, /async function contentCommand/);
  for (const action of ["create", "save", "submit", "approve", "publish", "archive"])
    assert.match(source, new RegExp(`contentCommand\\([^)]*"${action}"`, "s"));
  assert.match(source, /"canonical_product_projection_persisted"/);
  assert.match(source, /PRODUCT_CONTROLLED_DIMENSIONS/);
  assert.match(source, /"cms-controlled-vocabularies"/);
  assert.match(source, /"cms-master-data"/);
  assert.match(source, /"cms-attributes", "list_catalog"/);
  assert.match(source, /"pim_fixed_corporate_vocabulary_containers_visible"/);
  assert.match(source, /"pim_controlled_category_resolves_same_run_attribute_catalog"/);
  assert.match(source, /"synthetic_pim_business_residue_zero_after_terminal"/);
  assert.match(source, /cms_product_canonical_sku_registry/);
  assert.match(source, /cms_product_canonical_identifier_registry/);
  assert.match(source, /definitionId: attributeDefinition\.id/);
  assert.match(source, /variantSku/);
  assert.match(source, /"pim_reconciliation_events_0078_present"/);
  assert.match(source, /"pim_legacy_mutations_0078_read_only"/);
  assert.match(source, /"0078"/);
  assert.match(source, /"0080"/);
});

test("canary proves RDO dual scope, immediate revocation and transactional last-admin protection", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /"rdo-team", \{\n\s+action: "suspend"/);
  assert.match(source, /"rdo-team", \{ action: "list" \}, \[403\]/);
  assert.match(source, /revocationLatencyMs < 10_000/);
  assert.match(source, /"cms-session", \{ action: "resolve" \}/);
  assert.match(source, /cmsSession\.json\?\.accessGranted === true/);
  assert.match(source, /RDO_TEAM_LAST_ADMIN_PROTECTED/);
  assert.match(source, /rollback;/i);
  assert.match(source, /"rdo_audit_preserved"/);
  assert.match(source, /ban_duration: "876000h"/);
  assert.match(source, /"rdo_legacy_auth_ban_fixture_active"/);
  assert.match(source, /"rdo_legacy_auth_ban_reconciled"/);
  assert.match(source, /"rdo_legacy_reconciliation_preserves_cms_profile"/);
  assert.match(source, /team\.reactivate\.legacy_auth_ban_cleared/);
});

test("synthetic super-admins are SHA-bound to the watchdog before privilege and close their leases", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(
    source,
    /user_metadata:\s*\{\s*synthetic: true,\s*purpose: "qa-cms-browser",\s*runTag: qaTag,\s*candidateSha: expectedSha,\s*environment: "staging",\s*\}/,
  );
  assert.doesNotMatch(source, /\b(?:qa_tag|candidate_sha):/);
  assert.match(source, /\.rpc\("cms_qa_actor_lease_status", \{/);
  assert.match(source, /\.rpc\("cms_complete_qa_actor_lease", \{/);

  const actorRecorded = source.indexOf("actors.push(actor);");
  const leaseValidated = source.indexOf('await assertActorLease(actor.id, "active");', actorRecorded);
  const roleGranted = source.indexOf('await rest("cms_user_roles"', leaseValidated);
  assert.ok(actorRecorded >= 0 && actorRecorded < leaseValidated);
  assert.ok(leaseValidated < roleGranted, "the exact active lease must precede super-admin grant");

  assert.match(source, /await rest\("cms_user_roles", \{\s*method: "DELETE"/);
  assert.match(
    source,
    /await rest\("cms_scoped_role_assignments", \{\s*method: "PATCH",\s*query: `user_id=eq\.\$\{actor\.id\}&revoked_at=is\.null`/,
  );
  assert.match(source, /delete from auth\.sessions where user_id = '\$\{actor\.id\}'::uuid/);
  for (const cleanupContract of [
    "activeLegacyRoles",
    "activeScopedRoles",
    "activePublications",
    "activeProjections",
    "activeRouteRules",
    "activeSessions",
  ])
    assert.ok(source.includes(cleanupContract), `missing actor cleanup contract ${cleanupContract}`);

  const residueVerified = source.indexOf('check("synthetic_active_residue_zero"');
  const leaseCompleted = source.indexOf("await completeActorLease(actor.id);", residueVerified);
  const cleanedVerified = source.indexOf(
    'check("synthetic_actor_leases_cleaned", cleanedActorLeases === actors.length);',
    leaseCompleted,
  );
  assert.ok(residueVerified >= 0 && residueVerified < leaseCompleted);
  assert.ok(
    leaseCompleted < cleanedVerified,
    "completion must be followed by exact cleaned-status validation",
  );
  assert.match(source, /await assertActorLease\(actorId, "cleaned"\)/);
});

test("canary report is sanitized, synthetic-only and verifies zero active residue with retained audit", async () => {
  const source = await read("scripts/ev2/phase12/staging-migrations-canary.mjs");

  assert.match(source, /QA-CMS-FINAL-\$\{qaDate\}-\$\{expectedSha\.slice\(0, 8\)\}/);
  assert.match(source, /"synthetic_active_residue_zero"/);
  assert.match(source, /"immutable_audit_retained"/);
  assert.match(source, /semantics: "zero-active-residue; archived fixtures and immutable audit retained"/);
  assert.match(source, /syntheticOnly: true/);
  assert.match(source, /realDataUsed: false/);
  assert.match(source, /productionMutations: 0/);
  assert.match(source, /secretsPersisted: false/);
  assert.match(source, /writeFileSync\(reportPath/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*(?:accessToken|anonKey|serviceKey)/);
});

test("staging workflow runs the canary only after migrations/functions and uploads its report", async () => {
  const workflow = await read(".github/workflows/deploy-staging.yml");
  const migrations = workflow.indexOf("Apply the exact candidate migrations to staging");
  const functions = workflow.indexOf(
    "Deploy the complete exact-candidate Edge Function inventory to staging",
  );
  const verification = workflow.indexOf("Verify staging migrations, RLS, Storage, Vault and Function modes");
  const canary = workflow.indexOf("staging-migrations-canary.mjs");
  const build = workflow.indexOf("Build the staging shell from the same SHA");

  assert.ok(migrations >= 0 && migrations < functions);
  assert.ok(functions < verification && verification < canary);
  assert.ok(canary < build);
  assert.match(workflow, /Exercise post-baseline migration scenarios with isolated synthetic data/);
  assert.match(workflow, /G12_MIGRATION_CANARY_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
  assert.match(workflow, /G12_MIGRATION_CANARY_REPORT_PATH: \.\.\/g12-staging-migrations-canary\.json/);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /^\s+g12-staging-migrations-canary\.json$/m);
});
