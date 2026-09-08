import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
  CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
  CMS_MEDIA_UPLOAD_ABORT_0082_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
  CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  G12_PINNED_MIGRATION_TAIL,
  exactMigrationHistorySql,
  leadOriginBindingSemanticSql,
  mediaUploadAbortSchemaContractSql,
  migrationVersionSqlArray,
  ownerOnlyFunctionContractSql,
  publicRelationLimitSemanticSql,
  sessionRefreshRevocationSemanticSql,
  serviceOnlyRpcContractSql,
  sourceMigrationManifest,
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
  assert.deepEqual(manifest.slice(-G12_PINNED_MIGRATION_TAIL.length), G12_PINNED_MIGRATION_TAIL);
  for (const migration of manifest.slice(-G12_PINNED_MIGRATION_TAIL.length)) {
    const bytes = readFileSync(join(process.cwd(), "supabase", "migrations", migration.file));
    assert.equal(migration.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.match(migration.sha256, /^[a-f0-9]{64}$/);
  }
});

test("the pinned 0082 to 0085 tail fails closed on filename, order or raw-byte digest drift", () => {
  const files = Object.fromEntries(
    Array.from({ length: 85 }, (_, index) => {
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
    "permission.critical",
    "p_event_type=''logout''",
    "''self_logout''",
  ])
    assert.ok(contract.includes(marker), marker);
  assert.match(contract, /strpos\([\s\S]*duplicate[\s\S]*\) < strpos\([\s\S]*cms_session_revocations/);
  assert.match(contract, /as session_refresh_revocation_0083_semantics_exact$/);
  assert.throws(
    () => sessionRefreshRevocationSemanticSql("unsafe-alias"),
    /G12_MIGRATION_MANIFEST_INVALID:session-revocation-alias/,
  );
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
