import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
  CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
  CMS_PROGRESSIVE_DRAFT_TERMINAL_CLEANUP_0104_OWNER_ONLY_FUNCTIONS,
  CMS_SESSION_LOGOUT_FAST_PATH_0105_OWNER_ONLY_FUNCTIONS,
  CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS,
  CMS_RELEASE_STABILITY_FOLLOWUP_0101_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256,
  CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS,
  CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
  CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  G12_PINNED_MIGRATION_TAIL,
  auditLogReadScaleSemanticSql,
  exactMigrationHistorySql,
  leadRetrySubphaseTimingSemanticSql,
  leadOriginBindingSemanticSql,
  mediaUploadAbortSchemaContractSql,
  migrationVersionSqlArray,
  ownerOnlyFunctionContractSql,
  progressiveDraftTerminalCleanupSemanticSql,
  publicRelationLimitSemanticSql,
  qaActorRuntimeRepairsSemanticSql,
  releaseStabilityFollowupSemanticSql,
  runtimeIntegrityRepairsSemanticSql,
  operationalEventsReadScaleSemanticSql,
  qaActorLeaseWindowSemanticSql,
  qaOverrideWindowSemanticSql,
  qaLeaseDocumentCanonicalFenceSemanticSql,
  runtimeIntegrityFollowupSemanticSql,
  sessionRefreshRevocationSemanticSql,
  sessionLogoutFastPathSemanticSql,
  serviceOnlyRpcContractSql,
  sourceMigrationManifest,
  systemSnapshotLeadReadScaleSemanticSql,
  systemSnapshotOpenCriticalScaleSemanticSql,
  systemSnapshotSubphaseTimingSemanticSql,
} from "./migration-manifest-lib.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "g12-migrations-"));
  const directory = join(root, "supabase", "migrations");
  mkdirSync(directory, { recursive: true });
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), contents);
  return root;
}

test("migration manifest preserves raw bytes and emits an exact remote-history predicate", () => {
  const root = fixture({ "0001_first.sql": "select 1;\r\n", "0002_second.sql": "select 2;\n" });
  try {
    const manifest = sourceMigrationManifest(root);
    assert.deepEqual(
      manifest.map(({ version, file }) => ({ version, file })),
      [
        { version: "0001", file: "0001_first.sql" },
        { version: "0002", file: "0002_second.sql" },
      ],
    );
    assert.notEqual(manifest[0].sha256, manifest[1].sha256);
    assert.equal(migrationVersionSqlArray(manifest), "array['0001','0002']::text[]");
    assert.match(exactMigrationHistorySql(manifest), /array_agg\(version order by version\)/);
    assert.match(exactMigrationHistorySql(manifest), /array\['0001','0002'\]::text\[\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration manifest refuses gaps, duplicate versions, invalid names and non-files", () => {
  for (const files of [
    { "0001_first.sql": "select 1;", "0003_gap.sql": "select 3;" },
    { "0001_first.sql": "select 1;", "0001_duplicate.sql": "select 2;" },
    { "0001_FIRST.sql": "select 1;" },
  ]) {
    const root = fixture(files);
    try {
      assert.throws(() => sourceMigrationManifest(root), /G12_MIGRATION_MANIFEST_INVALID/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("the repository migration history is contiguous", () => {
  const manifest = sourceMigrationManifest(process.cwd());
  assert.equal(manifest[0].version, "0001");
  assert.equal(manifest.at(-1)?.version, String(manifest.length).padStart(4, "0"));
  // A ultima entrada da cauda fixada e re-selada deliberadamente a cada migration nova, com o
  // digest dos bytes. E o que impede que alguem acrescente migration sem revisao: nao basta criar
  // o arquivo, e preciso declarar o conteudo dele aqui.
  assert.deepEqual(G12_PINNED_MIGRATION_TAIL.at(-1), {
    version: "0105",
    file: "0105_cms_session_logout_fast_path.sql",
    sha256: "d926d3d158ca9f86d5d268607164258749bb8420c04ee90f858d75ce1f6e6c3a",
  });
  assert.deepEqual(manifest.slice(-G12_PINNED_MIGRATION_TAIL.length), G12_PINNED_MIGRATION_TAIL);
  for (const migration of manifest.slice(-G12_PINNED_MIGRATION_TAIL.length)) {
    const bytes = readFileSync(join(process.cwd(), "supabase", "migrations", migration.file));
    assert.equal(migration.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.match(migration.sha256, /^[a-f0-9]{64}$/);
  }
});

test("the pinned 0082 to 0088 tail fails closed on filename, order or raw-byte digest drift", () => {
  const files = Object.fromEntries(
    Array.from({ length: 88 }, (_, index) => {
      const version = String(index + 1).padStart(4, "0");
      const file =
        G12_PINNED_MIGRATION_TAIL.find((migration) => migration.version === version)?.file ??
        `${version}_fixture.sql`;
      return [file, `select ${index + 1};\n`];
    }),
  );
  const root = fixture(files);
  try {
    assert.throws(() => sourceMigrationManifest(root), /G12_MIGRATION_MANIFEST_INVALID:pinned-tail:0082/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a real pinned 0082 to 0087 baseline remains readable by the 0088 candidate verifier", () => {
  const files = Object.fromEntries(
    Array.from({ length: 87 }, (_, index) => {
      const version = String(index + 1).padStart(4, "0");
      const pinned = G12_PINNED_MIGRATION_TAIL.find((migration) => migration.version === version);
      return pinned
        ? [pinned.file, readFileSync(join(process.cwd(), "supabase", "migrations", pinned.file))]
        : [`${version}_fixture.sql`, `select ${index + 1};\n`];
    }),
  );
  const root = fixture(files);
  try {
    const manifest = sourceMigrationManifest(root);
    assert.equal(manifest.at(-1)?.version, "0087");
    assert.deepEqual(
      manifest.slice(-6),
      G12_PINNED_MIGRATION_TAIL.filter(({ version }) => version <= "0087"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("0082 and 0083 RPC contracts require presence and an exact service-only ACL", () => {
  const media = serviceOnlyRpcContractSql("media_upload_abort_0082_rpcs", CMS_MEDIA_UPLOAD_ABORT_0082_RPCS);
  const sessions = serviceOnlyRpcContractSql(
    "session_refresh_revocation_0083_rpcs",
    CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  );

  for (const signature of [
    ...CMS_MEDIA_UPLOAD_ABORT_0082_RPCS,
    ...CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  ]) {
    const contract = CMS_MEDIA_UPLOAD_ABORT_0082_RPCS.includes(signature) ? media : sessions;
    assert.match(contract, new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const contract of [media, sessions]) {
    assert.match(contract, /to_regprocedure\(required\.signature\) is null/);
    assert.match(contract, /has_function_privilege\('service_role'/);
    assert.match(contract, /has_function_privilege\('authenticated'/);
    assert.match(contract, /has_function_privilege\('anon'/);
    assert.match(contract, /aclexplode/);
    assert.match(contract, /coalesce\(grantee\.rolname, 'PUBLIC'\) <> 'service_role'/);
    assert.match(contract, /or privilege_row\.is_grantable/);
    assert.match(contract, /_present/);
    assert.match(contract, /_privileges_exact/);
  }
  assert.throws(
    () => serviceOnlyRpcContractSql("unsafe-alias", CMS_MEDIA_UPLOAD_ABORT_0082_RPCS),
    /G12_MIGRATION_MANIFEST_INVALID:rpc-alias/,
  );
  assert.throws(
    () => serviceOnlyRpcContractSql("safe_alias", ["not a signature"]),
    /G12_MIGRATION_MANIFEST_INVALID:rpc-signatures/,
  );
});

test("0083 semantic preflight covers Auth sessions, administrative actions, logout and critical MFA", () => {
  const contract = sessionRefreshRevocationSemanticSql("session_refresh_revocation_0083_semantics_exact");

  for (const marker of [
    "private.cms_resolve_session_core_0087(uuid,text,text,text,text,timestamptz,uuid)",
    "from public.cms_login_events event",
    "from auth.sessions auth_session",
    "extensions.digest(auth_session.id::text,''sha256'')",
    "p_action in (''revoke_sessions'',''suspend'',''reactivate'')",
    "insert into public.cms_session_revocations",
    "''admin_command''",
    "coalesce((v_result->>''duplicate'')::boolean,false) is false",
    "not like '%insert into auth.%'",
    "not like '%update auth.%'",
    "not like '%delete from auth.%'",
    "not like '%rdo_%'",
    "private.cms_resolve_session_core_0087(%",
    "extensions.digest(p_session_id, ''sha256'')",
    "from public.cms_session_revocations revocation",
    "''CMS_SESSION_REVOKED''",
    "permission.critical",
    "if p_event_type = ''logout'' then",
    "''self_logout''",
    "bool_or(permission.critical)",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /strpos\([\s\S]*duplicate[\s\S]*\) < strpos\([\s\S]*cms_session_revocations/);
  assert.match(contract, /,\s+false\s+\) as session_refresh_revocation_0083_semantics_exact$/);
  assert.doesNotMatch(contract, /p_event_type=''logout''/);
  assert.throws(
    () => sessionRefreshRevocationSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:session-revocation-alias/,
  );
});

test("0083 semantic preflight follows the authoritative 0087 session topology", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0087_cms_runtime_integrity_repairs.sql"),
    "utf8",
  );
  const coreStart = migration.indexOf("create or replace function private.cms_resolve_session_core_0087(");
  const unscopedStart = migration.indexOf(
    "create or replace function public.cms_resolve_session_unscoped_0070(",
    coreStart,
  );
  const scopedStart = migration.indexOf(
    "create or replace function public.cms_resolve_session_scoped(",
    unscopedStart,
  );
  const accessStart = migration.indexOf(
    "create or replace function public.cms_resolve_scoped_access(",
    scopedStart,
  );
  const visualStart = migration.indexOf("-- The authoritative visual wrappers", accessStart);
  for (const boundary of [coreStart, unscopedStart, scopedStart, accessStart, visualStart])
    assert.notEqual(boundary, -1);

  const core = migration.slice(coreStart, unscopedStart);
  const scoped = migration.slice(scopedStart, accessStart);
  const access = migration.slice(accessStart, visualStart);
  assert.match(core, /extensions\.digest\(p_session_id, 'sha256'\)/);
  assert.match(core, /from public\.cms_session_revocations revocation/);
  assert.match(core, /raise exception 'CMS_SESSION_REVOKED'/);
  assert.match(core, /permission\.critical/);
  assert.match(scoped, /private\.cms_resolve_session_core_0087\(/);
  assert.doesNotMatch(scoped, /permission\.critical/);
  assert.match(scoped, /if p_event_type = 'logout' then/);
  assert.match(scoped, /insert into public\.cms_session_revocations/);
  assert.match(scoped, /'self_logout'/);
  assert.match(access, /bool_or\(permission\.critical\)/);

  const contract = sessionRefreshRevocationSemanticSql("session_refresh_revocation_0083_semantics_exact");
  assert.equal(contract.match(/permission\.critical/g)?.length, 2);
});

test("0082 trigger and watchdog helpers remain owner-only", () => {
  const contract = ownerOnlyFunctionContractSql(
    "media_upload_abort_0082_helpers_locked",
    CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
  );
  for (const signature of CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS)
    assert.ok(contract.includes(signature), signature);
  assert.match(contract, /to_regprocedure\(required\.signature\) is null/);
  assert.match(contract, /has_function_privilege\('service_role'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);
  assert.match(contract, /has_function_privilege\('anon'/);
  assert.match(contract, /privilege_row\.grantee <> procedure_row\.proowner/);
  assert.throws(
    () => ownerOnlyFunctionContractSql("unsafe-alias", CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS),
    /G12_MIGRATION_MANIFEST_INVALID:owner-only-alias/,
  );
});

test("0084 lead-origin helpers remain owner-only", () => {
  const contract = ownerOnlyFunctionContractSql(
    "lead_origin_binding_0084_helpers_locked",
    CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
  );
  for (const signature of CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS)
    assert.ok(contract.includes(signature), signature);
  assert.match(contract, /has_function_privilege\('service_role'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);
  assert.match(contract, /has_function_privilege\('anon'/);
  assert.match(contract, /privilege_row\.grantee <> procedure_row\.proowner/);
});

test("0084 semantic preflight proves exact form binding and authoritative provenance", () => {
  const contract = leadOriginBindingSemanticSql("lead_origin_binding_0084_semantics_exact");

  for (const marker of [
    "join public.cms_publications published",
    "published.revision_id = projection.revision_id",
    "item.workflow_status = ''published''",
    "for share of projection, item, published",
    "{form,formId}",
    "{form,versionId}",
    "{data,formId}",
    "{data,formVersionId}",
    "p_origin_source = ''campaign''",
    "p_origin_path = v_route_path",
    "v_authoritative_path := ''/produtos/'' || v_slug",
    "p_origin_source = ''product''",
    "num_nonnulls(v_campaign_id, v_product_id) > 1",
    "v_source = ''qa_fixture''",
    "v_source in (''site'', ''contact'', ''newsletter'', ''website'')",
    "not like '%p_form_key%'",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /as lead_origin_binding_0084_semantics_exact$/);
  assert.throws(
    () => leadOriginBindingSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:lead-origin-binding-alias/,
  );
});

test("0085 public relation helpers remain owner-only", () => {
  const contract = ownerOnlyFunctionContractSql(
    "public_relation_limit_0085_helpers_locked",
    CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
  );
  for (const signature of CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS)
    assert.ok(contract.includes(signature), signature);
  assert.match(contract, /has_function_privilege\('service_role'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);
  assert.match(contract, /has_function_privilege\('anon'/);
  assert.match(contract, /privilege_row\.grantee <> procedure_row\.proowner/);
});

test("0085 semantic preflight proves aggregate counting and the enabled projection trigger", () => {
  const contract = publicRelationLimitSemanticSql("public_relation_limit_0085_semantics_exact");
  for (const marker of [
    "p_payload ? ''relations''",
    "jsonb_each(p_payload -> ''relations'')",
    "v_block #> ''{data,itemIds}''",
    "CMS_PUBLIC_RELATION_INVALID",
    "count(distinct relation_id)",
    "private.cms_public_relation_count_0085(new.payload) > 500",
    "CMS_PUBLIC_RELATION_LIMIT_EXCEEDED",
    "cms_00_enforce_public_relation_limit_0085",
    "trigger_row.tgenabled = 'O'",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /as public_relation_limit_0085_semantics_exact$/);
  assert.throws(
    () => publicRelationLimitSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:public-relation-limit-alias/,
  );
});

test("0086 repaired trigger functions are present and owner-only", () => {
  const contract = ownerOnlyFunctionContractSql(
    "qa_actor_runtime_repairs_0086_functions_locked",
    CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS,
  );
  for (const signature of CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS)
    assert.ok(contract.includes(signature), signature);
  assert.match(contract, /to_regprocedure\(required\.signature\) is null/);
  assert.match(contract, /has_function_privilege\('service_role'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);
  assert.match(contract, /has_function_privilege\('anon'/);
  assert.match(contract, /privilege_row\.grantee <> procedure_row\.proowner/);
});

test("0086 semantic preflight proves fail-closed capture, generated cleanup correlation and narrow restore", () => {
  const contract = qaActorRuntimeRepairsSemanticSql("qa_actor_runtime_repairs_0086_semantics_exact");

  for (const marker of [
    "private.cms_capture_qa_actor_lease()",
    "v_created_at timestamptz := transaction_timestamp();",
    "not like '%v_created_at timestamptz := statement_timestamp();%'",
    ") is not true then",
    "coalesce(new.raw_user_meta_data -> ''synthetic'' = ''true''::jsonb, false)",
    "or coalesce(new.raw_user_meta_data ->> ''purpose'' = ''qa-cms-browser'', false)",
    "CMS_QA_ACTOR_METADATA_INVALID",
    "private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()",
    "private.cms_ai_terminalize_qa_actor_graph()",
    "v_correlation_id uuid:=gen_random_uuid();",
    "old.actor_id,''ai_qa_scope_terminal'',v_correlation_id",
    "not like '%old.correlation_id%'",
    "public.cms_open_draft_after_edit()",
    "current_setting(''cms.qa_compensating'', true) = ''on'' and current_setting(''cms.qa_restore_item'', true) = new.item_id::text",
    "not like '%if current_setting(''cms.qa_compensating'', true) = ''on'' then return new; end if;%'",
    "cms_capture_qa_actor_lease",
    "zzz_cms_forms_leads_terminal_cleanup",
    "zzzz_cms_ai_terminal_cleanup",
    "cms_draft_edit_opens_workflow",
    "trigger_row.tgenabled = 'O'",
    "trigger_row.tgfoid = to_regprocedure(required.signature)",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.doesNotMatch(contract, /cms\.qa\.compensating/);
  assert.match(contract, /strpos\([\s\S]+qa_restore_item[\s\S]+\)\s*< strpos\([\s\S]+if exists/);
  assert.match(contract, /as qa_actor_runtime_repairs_0086_semantics_exact$/);
  assert.throws(
    () => qaActorRuntimeRepairsSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:qa-actor-runtime-repairs-alias/,
  );
});

test("0087 repaired scoped RPCs have exact service-only ACL and helpers remain owner-only", () => {
  const scoped = serviceOnlyRpcContractSql(
    "runtime_integrity_repairs_0087_rpcs",
    CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS,
  );
  const underlying = ownerOnlyFunctionContractSql(
    "runtime_integrity_repairs_0087_functions_locked",
    CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS,
  );
  for (const signature of CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS)
    assert.ok(scoped.includes(signature), signature);
  for (const signature of CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS)
    assert.ok(underlying.includes(signature), signature);
  assert.match(scoped, /has_function_privilege\('service_role'/);
  assert.match(scoped, /coalesce\(grantee\.rolname, 'PUBLIC'\) <> 'service_role'/);
  assert.match(underlying, /privilege_row\.grantee <> procedure_row\.proowner/);
});

test("0087 semantic preflight proves immutable session evidence, command gate order and CRB restoration", () => {
  const contract = runtimeIntegrityRepairsSemanticSql("runtime_integrity_repairs_0087_semantics_exact");
  for (const marker of [
    "private.cms_resolve_session_core_0087(",
    "public.cms_resolve_scoped_access(",
    "insert into public.cms_login_events",
    "not like '%update public.cms_login_events%'",
    "permission.critical",
    "p_event_type is null",
    "p_aal is null",
    "cardinality(role_keys) > 0",
    "scope_capability ->> ''reasonCode'' = ''feature_disabled''",
    "role_keys := array[]::text[];",
    "permission_keys := array[]::text[];",
    "access_granted := false;",
    "''rbacScoped'', coalesce(",
    "''rbacScopeReasonCode'', coalesce(",
    "''scope'', case",
    "scope_capability ->> ''reasonCode'', ''session_or_scope_invalid''",
    "perform private.cms_system_lock_actor_scope(p_user_id, p_environment);",
    "perform private.cms_system_lock_actor_scope(p_actor_id, p_environment);",
    "perform pg_advisory_xact_lock(hashtextextended(",
    "with effective_assignment as materialized (",
    "bool_or(permission.critical)",
    "cardinality(v_roles) > 0",
    "or p_action is null",
    "or p_environment is null",
    "or p_site_key is distinct from ''main''",
    "if p_aal is distinct from ''aal2'' then",
    "CMS_VISUAL_COMMAND_INVALID",
    "CMS_VISUAL_MFA_REQUIRED",
    "perform private.cms_visual_assert_available(",
    "CMS_SITES_COMMAND_INVALID",
    "CMS_SITES_MFA_REQUIRED",
    "perform private.cms_sites_assert_available(",
    "v_previous_actor text := current_setting(''cms.qa_mutation_actor_id'', true);",
    "exception when others then",
    "cms_prepare_qa_actor_terminal_crb_cleanup",
    "trigger_row.tgenabled = 'O'",
    "trigger_row.tgfoid = to_regprocedure",
    "procedure_row.prosecdef",
    "language_row.lanname = 'plpgsql'",
    "procedure_row.proconfig",
    CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256.baseline,
    CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256.transformed,
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(
    contract,
    /CMS_VISUAL_COMMAND_INVALID[\s\S]+CMS_VISUAL_MFA_REQUIRED[\s\S]+cms_visual_assert_available/,
  );
  assert.match(
    contract,
    /CMS_SITES_COMMAND_INVALID[\s\S]+CMS_SITES_MFA_REQUIRED[\s\S]+cms_sites_assert_available/,
  );
  assert.match(
    contract,
    /cms_system_lock_actor_scope\(p_user_id[\s\S]+pg_advisory_xact_lock[\s\S]+select profile\.status/,
  );
  assert.match(
    contract,
    /cms_system_lock_actor_scope\(p_actor_id[\s\S]+pg_advisory_xact_lock[\s\S]+effective_assignment as materialized/,
  );
  assert.match(contract, /as runtime_integrity_repairs_0087_semantics_exact$/);
  assert.throws(
    () => runtimeIntegrityRepairsSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:runtime-integrity-repairs-alias/,
  );
});

test("0088 repaired RPCs remain service-only and their preserved cores remain owner-only", () => {
  const scoped = serviceOnlyRpcContractSql(
    "runtime_integrity_followup_0088_rpcs",
    CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS,
  );
  const underlying = ownerOnlyFunctionContractSql(
    "runtime_integrity_followup_0088_functions_locked",
    CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS,
  );
  for (const signature of CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS)
    assert.ok(scoped.includes(signature), signature);
  for (const signature of CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS)
    assert.ok(underlying.includes(signature), signature);
  assert.match(scoped, /has_function_privilege\('service_role'/);
  assert.match(underlying, /privilege_row\.grantee <> procedure_row\.proowner/);
});

test("0088 semantic preflight proves media, MFA, GC, idempotency and actor-context repairs", () => {
  const contract = runtimeIntegrityFollowupSemanticSql("runtime_integrity_followup_0088_semantics_exact");
  for (const marker of [
    "progressive.promoted_item_id = item.id",
    "not like '%progressive.item_id = item.id%'",
    "CMS_AI_MFA_REQUIRED",
    "v_previous_operation",
    "v_previous_claim",
    "exception when others then",
    "v_mutation_is_claim_only",
    "new.lock_version=old.lock_version+1",
    "join public.cms_dam_gc_jobs job",
    "''cms:media.edit''",
    "cms:lead-delivery-idempotency:",
    "pg_advisory_xact_lock",
    "cms_retry_lead_delivery_scoped_core_0088",
    "private.cms_assert_dam_actor_context(",
    "v_lease_environment is distinct from p_environment",
    "not has_schema_privilege('anon','public','CREATE')",
    "not has_schema_privilege('authenticated','public','CREATE')",
    "not has_schema_privilege('service_role','public','CREATE')",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /as runtime_integrity_followup_0088_semantics_exact$/);
  assert.throws(
    () => runtimeIntegrityFollowupSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:runtime-integrity-followup-alias/,
  );
});

test("0082 schema preflight requires both validated constraints and the hardened upload horizon", () => {
  const contract = mediaUploadAbortSchemaContractSql("media_upload_abort_0082_schema");

  for (const marker of [
    "cms_media_operational_pixel_limit",
    "cms_media_upload_token_expiry_valid",
    "width is null",
    "height is null",
    "width is not null",
    "height is not null",
    "20000",
    "32000000",
    "upload_token_expires_at",
    "attribute_row.attnotnull",
    "statement_timestamp()",
    "02:00:00",
    "02:15:00",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /media_upload_abort_0082_schema_pixel_limit_exact/);
  assert.match(contract, /media_upload_abort_0082_schema_upload_token_expiry_exact/);
  assert.match(contract, /media_upload_abort_0082_schema_upload_token_column_exact/);
  assert.throws(
    () => mediaUploadAbortSchemaContractSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:media-upload-schema-alias/,
  );
});

test("0089 semantic preflight proves the diagnostics predicate was split without being loosened", () => {
  const contract = operationalEventsReadScaleSemanticSql(
    "operational_events_read_scale_0089_semantics_exact",
  );

  // The split is only correct if both halves survive as privileged, stable, search-path locked
  // routines and the policy keeps requiring both of them.
  for (const marker of [
    "cms_system_operational_session_scope_allowed",
    "cms_system_operational_event_row_allowed",
    "p.prosecdef and p.provolatile = 's'",
    "search_path=pg_catalog, private, pg_temp",
    "cms_operational_events_authoritative_read",
    "cms_system_permission_lineage_allowed",
    "cms:diagnostics.read",
    "cms_system_operational_event_scope_allowed",
    "cms_operational_events_unresolved_recent_idx",
    "WHERE (resolved_at IS NULL)",
    "cms_operational_events_recent_idx",
  ])
    assert.ok(contract.includes(marker), marker);

  // A predicate anon can call is a diagnostics leak, so the negative has to be asserted too.
  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);

  // The check has to fail closed: a missing routine makes to_regprocedure null, and coalesce turns
  // the whole expression into false rather than into null.
  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as operational_events_read_scale_0089_semantics_exact$/);
  assert.throws(() => operationalEventsReadScaleSemanticSql("Bad Alias"));
});

test("0098 semantic preflight proves audit recency scale without widening visibility", () => {
  const contract = auditLogReadScaleSemanticSql("audit_log_read_scale_0098_semantics_exact");

  for (const marker of [
    "cms_audit_session_scope_allowed",
    "cms_audit_corporate_session_allowed",
    "cms_audit_event_row_allowed",
    "and p.prosecdef",
    "and p.provolatile = 's'",
    "p.proowner = 'postgres'::regrole",
    "language_row.lanname = 'sql'",
    "search_path=pg_catalog, private, auth, pg_temp",
    "extensions.digest",
    "fd3421d2fbf30dc9a3d43553b389b0e6a11f097f2b23767edaddb5815ac87d71",
    "fede1da9331eca631d0d3a7d57bf32b2333e1a571d7e5cbf23703079a68dd7c2",
    "e3aa5ec8c4fa074e3f3df282911b500728c7ee742d8a61dce6db80a848efeb0a",
    "pg_catalog.aclexplode",
    "cms_audit_authorized_read",
    "p.polroles",
    "p.polcmd in ('r', '*')",
    "selectcms_audit_session_scope_allowed",
    "cms_audit_log.actor_id",
    "auth.users",
    "cms_has_permission",
    "cms:audit.read",
    "cms_qa_actor_leases",
    "cms_user_actor_target_scope_allowed",
    "cms_user_actor_environment",
    "cms_audit_log_recent_idx",
    "index_record.indisvalid",
    "index_record.indkey[0]",
    "attribute.attname = 'occurred_at'",
    "pg_catalog.pg_index_column_has_property",
    "'desc'",
    "'nulls_first'",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /not has_function_privilege\('service_role'/);
  assert.match(contract, /has_function_privilege\('authenticated'/);
  assert.match(contract, /not has_table_privilege\('anon'/);
  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as audit_log_read_scale_0098_semantics_exact$/);
  assert.throws(() => auditLogReadScaleSemanticSql("Bad Alias"));
});

test("0099 semantic preflight proves the exact open-critical index without widening access", () => {
  const contract = systemSnapshotOpenCriticalScaleSemanticSql(
    "system_snapshot_open_critical_scale_0099_semantics_exact",
  );

  for (const marker of [
    "cms_get_system_snapshot",
    "timestamp with time zone",
    "cms_operational_events_open_critical_id_idx",
    "public.cms_operational_events",
    "index_record.indisvalid",
    "index_record.indisready",
    "index_record.indpred is not null",
    "index_record.indnkeyatts = 1",
    "index_record.indkey[0]",
    "attribute.attname = 'id'",
    "severity=''critical''::textandresolved_atisnull",
    "event.severity = ''critical''",
    "event.resolved_at is null",
    "private.cms_system_operational_event_scope_allowed",
    "not has_table_privilege('anon'",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as system_snapshot_open_critical_scale_0099_semantics_exact$/);
  assert.throws(() => systemSnapshotOpenCriticalScaleSemanticSql("Bad Alias"));
});

test("0100 semantic preflight proves exact lead indexes without widening access", () => {
  const contract = systemSnapshotLeadReadScaleSemanticSql(
    "system_snapshot_lead_read_scale_0100_semantics_exact",
  );

  for (const marker of [
    "cms_lead_consents_lead_id_idx",
    "cms_lead_status_history_lead_id_idx",
    "cms_lead_outbox_lead_id_idx",
    "cms_lead_outbox_replays_lead_id_idx",
    "index_record.indisvalid",
    "index_record.indisready",
    "index_record.indnkeyatts = 1",
    "attribute.attname = 'lead_id'",
    "private.cms_lead_scope_allowed",
    "consent.lead_id = lead.id",
    "history.lead_id = lead.id",
    "outbox.lead_id = lead.id",
    "replay.lead_id = lead.id",
    "has_function_privilege",
    "'service_role'",
    "'authenticated'",
    "not has_table_privilege('anon'",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as system_snapshot_lead_read_scale_0100_semantics_exact$/);
  assert.throws(() => systemSnapshotLeadReadScaleSemanticSql("Bad Alias"));
});

test("0101 semantic preflight proves optimized paths without widening access", () => {
  const contract = releaseStabilityFollowupSemanticSql("release_stability_followup_0101_semantics_exact");

  for (const marker of [
    "cms_retry_lead_delivery_scoped",
    "cms_system_assert_available",
    "cms_lock_active_qa_actor_leases",
    "cms_lead_scope_allowed",
    "cms_retry_lead_delivery_scoped_core_0088",
    "cms_qa_archived_product_reference_exact_0101",
    "cms_qa_actor_marker_is_exact",
    "item.workflow_status=''archived''",
    "strpos(lower(projection.payload::text),option_id::text)>0",
    "candidate_correlations(correlation_id)asmaterialized",
    "cms_system_operational_event_scope_allowed",
    "v_previous_cleanup_actor",
    "exceptionwhenothersthen",
    "cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup",
    "zzzz_cms_system_rbac_terminal_cleanup",
    "aclexplode",
    "has_function_privilege",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as release_stability_followup_0101_semantics_exact$/);
  assert.throws(() => releaseStabilityFollowupSemanticSql("Bad Alias"));
  assert.deepEqual(CMS_RELEASE_STABILITY_FOLLOWUP_0101_OWNER_ONLY_FUNCTIONS, [
    "private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamptz)",
    "private.cms_cleanup_terminal_product_shared_options_0078()",
    "private.cms_system_rbac_terminal_cleanup()",
  ]);
});

test("0102 semantic preflight proves additive snapshot timing without widening access", () => {
  const contract = systemSnapshotSubphaseTimingSemanticSql(
    "system_snapshot_subphase_timing_0102_semantics_exact",
  );

  for (const marker of [
    "cms_get_system_snapshot_authenticated_timed",
    "cms_get_system_snapshot_authenticated",
    "cms_get_system_snapshot_limited",
    "v_actor_iduuid:=auth.uid()",
    "auth.jwt()",
    "extensions.digest",
    "public.consume_rate_limit(",
    "''cms_system_snapshot'',120,900",
    "v_snapshot:=public.cms_get_system_snapshot(",
    "v_rate_limit_msbigint",
    "v_snapshot_core_msbigint",
    "'ratelimitms'",
    "'snapshotcorems'",
    "aclexplode",
    "has_function_privilege",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as system_snapshot_subphase_timing_0102_semantics_exact$/);
  assert.throws(() => systemSnapshotSubphaseTimingSemanticSql("Bad Alias"));
});

test("0103 semantic preflight proves additive retry timing without widening access", () => {
  const contract = leadRetrySubphaseTimingSemanticSql("lead_retry_subphase_timing_0103_semantics_exact");

  for (const marker of [
    "cms_retry_lead_delivery_limited_timed",
    "cms_retry_lead_delivery_limited",
    "cms_retry_lead_delivery_scoped",
    "public.consume_rate_limit(",
    "''cms_leads_retry_delivery'',60,900",
    "v_result:=public.cms_retry_lead_delivery_scoped(",
    "v_rate_limit_msbigint",
    "v_command_core_msbigint",
    "'ratelimitms'",
    "'commandcorems'",
    "''timing'',jsonb_build_object(''ratelimitms'',v_rate_limit_ms,''commandcorems'',v_command_core_ms)",
    "aclexplode",
    "has_function_privilege",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as lead_retry_subphase_timing_0103_semantics_exact$/);
  assert.throws(() => leadRetrySubphaseTimingSemanticSql("Bad Alias"));
});

test("0104 semantic preflight proves immutable terminal cleanup without public execution", () => {
  const acl = ownerOnlyFunctionContractSql(
    "progressive_draft_terminal_cleanup_0104_functions_locked",
    CMS_PROGRESSIVE_DRAFT_TERMINAL_CLEANUP_0104_OWNER_ONLY_FUNCTIONS,
  );
  const contract = progressiveDraftTerminalCleanupSemanticSql(
    "progressive_draft_terminal_cleanup_0104_semantics_exact",
  );

  for (const marker of [
    "cms_compensate_qa_progressive_drafts_0104",
    "cms_cleanup_terminal_progressive_drafts_0104",
    'search_path=""',
    "cms_qa_actor_marker_is_exact",
    "cms_content_drafts_v2",
    "cms_draft_v2_events",
    "cms_audit_log",
    "cms_01_progressive_draft_terminal_cleanup_0104",
    "tgtype = 19",
    "lease.status in ('cleaned', 'expired')",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(acl, /has_function_privilege\('service_role'/);
  assert.match(acl, /has_function_privilege\('authenticated'/);
  assert.match(acl, /has_function_privilege\('anon'/);
  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as progressive_draft_terminal_cleanup_0104_semantics_exact$/);
  assert.throws(() => progressiveDraftTerminalCleanupSemanticSql("Bad Alias"));
});

test("0105 semantic preflight proves the logout-only short path and preserves full resolution", () => {
  const acl = ownerOnlyFunctionContractSql(
    "session_logout_fast_path_0105_helper_locked",
    CMS_SESSION_LOGOUT_FAST_PATH_0105_OWNER_ONLY_FUNCTIONS,
  );
  const contract = sessionLogoutFastPathSemanticSql("session_logout_fast_path_0105_semantics_exact");

  for (const marker of [
    "cms_resolve_logout_core_0105",
    "cms_resolve_session_core_0087",
    "cms_system_lock_actor_scope",
    "forupdate",
    "cms_login_events",
    "cms_session_revocations",
    "self_logout",
    "accessgranted",
    "rbacscopereasoncode",
    "cms_user_actor_context_active",
  ])
    assert.ok(contract.includes(marker), marker);

  assert.match(acl, /has_function_privilege\('service_role'/);
  assert.match(acl, /has_function_privilege\('authenticated'/);
  assert.match(acl, /has_function_privilege\('anon'/);
  assert.match(contract, /not like '%cms:scoped-super:%'/);
  assert.match(contract, /not like '%cms_rbac_scope_capability%'/);
  assert.match(contract, /not like '%cms_resolve_scoped_access%'/);
  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as session_logout_fast_path_0105_semantics_exact$/);
  assert.throws(() => sessionLogoutFastPathSemanticSql("Bad Alias"));
});

test("0090 semantic preflight proves the lease accepts only the state the fence imposes", () => {
  const contract = qaLeaseDocumentCanonicalFenceSemanticSql(
    "qa_lease_document_canonical_fence_0090_semantics_exact",
  );

  // The tolerance is bounded by the fence still being in the future; without that clause a document
  // whose reconciliation genuinely failed would count as clean.
  assert.ok(contract.includes("canonical_cleanup_not_before > v_now"));
  assert.ok(contract.includes("blob_disposition = ''access_revoked''"));

  // Everything the lease demanded before has to be verified as still demanded.
  for (const marker of [
    "upload_disposition not in",
    "CMS_QA_ACTOR_CLEANUP_INCOMPLETE",
    "banned_until > v_now",
    "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE",
  ])
    assert.ok(contract.includes(marker), marker);

  // The lease is a service_role surface and must not become reachable from a browser session.
  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /not has_function_privilege\('authenticated'/);
  assert.match(contract, /and has_function_privilege\('service_role'/);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as qa_lease_document_canonical_fence_0090_semantics_exact$/);
  assert.throws(() => qaLeaseDocumentCanonicalFenceSemanticSql("Bad Alias"));
});

test("0090 semantic preflight proves the lease accepts only the state the fence imposes", () => {
  const contract = qaLeaseDocumentCanonicalFenceSemanticSql(
    "qa_lease_document_canonical_fence_0090_semantics_exact",
  );

  // The tolerance is bounded by the fence still being in the future; without that clause a document
  // whose reconciliation genuinely failed would count as clean.
  assert.ok(contract.includes("canonical_cleanup_not_before > v_now"));
  assert.ok(contract.includes("blob_disposition = ''access_revoked''"));

  // Everything the lease demanded before has to be verified as still demanded.
  for (const marker of [
    "upload_disposition not in",
    "CMS_QA_ACTOR_CLEANUP_INCOMPLETE",
    "banned_until > v_now",
    "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE",
  ])
    assert.ok(contract.includes(marker), marker);

  // The lease is a service_role surface and must not become reachable from a browser session.
  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /not has_function_privilege\('authenticated'/);
  assert.match(contract, /and has_function_privilege\('service_role'/);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as qa_lease_document_canonical_fence_0090_semantics_exact$/);
  assert.throws(() => qaLeaseDocumentCanonicalFenceSemanticSql("Bad Alias"));
});

test("0091 semantic preflight proves the lease covers the window without widening anything", () => {
  const contract = qaActorLeaseWindowSemanticSql("qa_actor_lease_window_0091_semantics_exact");

  assert.ok(contract.includes("240 minutes"));
  // A restricao e comparada pela forma canonica, porque o Postgres normaliza o literal.
  assert.ok(contract.includes("04:01:00"));
  // Reescrever o corpo antigo apagaria os reparos de 0086; a verificacao prova que sobreviveram.
  assert.ok(contract.includes("transaction_timestamp()"));
  assert.ok(contract.includes("CMS_QA_ACTOR_METADATA_INVALID"));
  assert.ok(contract.includes("not like '%119 minutes%'"));

  // Estender o prazo nao pode remover a recuperacao automatica nem abrir o gatilho.
  assert.ok(contract.includes("cms_sweep_expired_qa_actor_leases"));
  assert.ok(contract.includes("cms_capture_qa_actor_lease"));
  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /not has_function_privilege\('authenticated'/);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as qa_actor_lease_window_0091_semantics_exact$/);
  assert.throws(() => qaActorLeaseWindowSemanticSql("Bad Alias"));
});

test("0092 semantic preflight proves the override window follows the lease", () => {
  const contract = qaOverrideWindowSemanticSql("qa_override_window_0092_semantics_exact");

  assert.ok(contract.includes("241 minutes"));
  assert.ok(contract.includes("not like '%120 minutes%'"));

  // A excecao continua amarrada a lease sintetica exata e continua fechada.
  assert.ok(contract.includes("cms_qa_actor_marker_is_exact"));
  assert.ok(contract.includes("p_expires_at > p_starts_at"));
  assert.match(contract, /not has_function_privilege\('anon'/);
  assert.match(contract, /not has_function_privilege\('authenticated'/);

  assert.match(contract, /^coalesce\(/);
  assert.match(contract, /, false\) as qa_override_window_0092_semantics_exact$/);
  assert.throws(() => qaOverrideWindowSemanticSql("Bad Alias"));
});
