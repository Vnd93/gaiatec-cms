import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const MIGRATION_FILENAME_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export const G12_PINNED_MIGRATION_TAIL = Object.freeze([
  Object.freeze({
    version: "0082",
    file: "0082_cms_media_upload_abort.sql",
    sha256: "9c9c1466045a90bb3d5f275934a0ebe6c3ebb209fb47d2794f1342be57558458",
  }),
  Object.freeze({
    version: "0083",
    file: "0083_cms_session_refresh_revocation.sql",
    sha256: "6ab91d586ef774d2df426107b3d42c34e97aa371ab71f59563708212f472706b",
  }),
  Object.freeze({
    version: "0084",
    file: "0084_cms_lead_origin_form_binding.sql",
    sha256: "b8112a696e76e50c54ad0ca1880d011ead38f2927a2796e6ae9e00509901a634",
  }),
  Object.freeze({
    version: "0085",
    file: "0085_cms_public_relation_limit.sql",
    sha256: "bd33962343f153b1e079f7ca9913a6db78f9366b03d32380cb4552bab2cd7b50",
  }),
  Object.freeze({
    version: "0086",
    file: "0086_cms_qa_actor_runtime_repairs.sql",
    sha256: "b351e4029074427d7f4f868d14cc3e425d9f7730d247c3318c95efdd3e05283b",
  }),
  Object.freeze({
    version: "0087",
    file: "0087_cms_runtime_integrity_repairs.sql",
    sha256: "84290c14445a39d310ce8c78df7a1b849d8e73b476ec8d5fb827e92cbe8d0be7",
  }),
  Object.freeze({
    version: "0088",
    file: "0088_cms_runtime_integrity_followup.sql",
    sha256: "1c110049b08c7a0177ac5380b23a9950bd6834b815f43938b6af4a3fa0cb9fce",
  }),
  Object.freeze({
    version: "0089",
    file: "0089_cms_operational_events_read_scale.sql",
    sha256: "bd6d418cd7271ed91d7e0d360c0100c7ad10998777ec27672ea4a6659fa22cad",
  }),
  Object.freeze({
    version: "0090",
    file: "0090_cms_qa_lease_document_canonical_fence.sql",
    sha256: "295f8adcfac409de8dd86f6f557da78a5a5a0d6836cf9b3af52f02608f6d18c9",
  }),
  Object.freeze({
    version: "0091",
    file: "0091_cms_qa_actor_lease_window.sql",
    sha256: "2465fadfff8d3e2025ef1c24e49394241df48f1edb1c41f49cfddd435dd8f7f1",
  }),
  Object.freeze({
    version: "0092",
    file: "0092_cms_qa_override_window.sql",
    sha256: "1ea5459fdfb945a9686a8049d1b7727f296d91f8f03c7a80f5d36abf808f12d8",
  }),
  Object.freeze({
    version: "0093",
    file: "0093_cms_ev2_delivery_ledger.sql",
    sha256: "d90ee4f3eadbd2b0a4c89a13f3e7939ee50242b84afd361efe2b80874d8b71bd",
  }),
  Object.freeze({
    version: "0094",
    file: "0094_cms_content_draft_snapshots.sql",
    sha256: "7a9dfb27305e8de81764f276f634dfa493a4a59b4df8457cb959515755db0359",
  }),
  Object.freeze({
    version: "0095",
    file: "0095_cms_system_snapshot_read_scale.sql",
    sha256: "8b3d62eb40d5fc952043b123f8c73497607275946827bf6825929bc82ed91028",
  }),
  Object.freeze({
    version: "0096",
    file: "0096_cms_qa_content_cleanup_scale.sql",
    sha256: "ec97a96158f11dd39469b055b891a459dc31be027cf827d5b0b7f60d76cbf337",
  }),
  Object.freeze({
    version: "0097",
    file: "0097_cms_ai_private_model_transition.sql",
    sha256: "bf1eb4634c25d72ad1041ec9682370bf7d70b3d947be9536299dcf980d39b336",
  }),
  Object.freeze({
    version: "0098",
    file: "0098_cms_audit_log_read_scale.sql",
    sha256: "539613f03cd5e06d2be67dad2a14ce20b793085c437c23e108e1ae7c7a714529",
  }),
  Object.freeze({
    version: "0099",
    file: "0099_cms_system_snapshot_open_critical_scale.sql",
    sha256: "dfb271cf9e9efb2f05fd91ec73afbb2c588d35e151886f61d0f967c6ccde9715",
  }),
  Object.freeze({
    version: "0100",
    file: "0100_cms_system_snapshot_lead_read_scale.sql",
    sha256: "fbb1b318b48c6d63f61a09732728f4c4a89350d635eb77b75c6d2ccd52aa2a72",
  }),
  Object.freeze({
    version: "0101",
    file: "0101_cms_release_stability_followup.sql",
    sha256: "19f38be0b861b50dca33dd97c9e4efd0cd825c7b906e9a6b76a7a5210fbbbe54",
  }),
  Object.freeze({
    version: "0102",
    file: "0102_cms_system_snapshot_subphase_timing.sql",
    sha256: "5f92ae851a090e5e44f4e0dbc9fc7c36b8a2068c24b0795f4455f122c30a47c7",
  }),
]);

export const CMS_MEDIA_UPLOAD_ABORT_0082_RPCS = Object.freeze([
  "public.cms_abort_dam_upload(uuid,text,text,text,text,timestamptz,uuid,text,uuid,uuid,text,uuid)",
  "public.cms_fail_dam_finalization(uuid,uuid,uuid,text,uuid,text,text,timestamptz)",
  "public.cms_list_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])",
  "public.cms_count_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])",
  "public.cms_archive_legacy_media(uuid,text,text,text,text,timestamptz,uuid,uuid)",
  "public.cms_restore_legacy_media(uuid,text,text,text,text,timestamptz,uuid,uuid)",
  "public.cms_claim_incomplete_media_gc(integer,uuid)",
  "public.cms_finish_incomplete_media_gc(uuid,uuid,uuid,boolean,text,jsonb,text,uuid)",
]);

export const CMS_SESSION_REFRESH_REVOCATION_0083_RPCS = Object.freeze([
  "public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)",
  "public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)",
  "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)",
]);

export const CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS = Object.freeze([
  "private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)",
  "private.cms_form_capture_origin_allowed(uuid,uuid,jsonb,text)",
]);

export const CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS = Object.freeze([
  "private.cms_public_relation_ids_0085(jsonb)",
  "private.cms_public_relation_count_0085(jsonb)",
  "private.cms_enforce_public_relation_limit_0085()",
]);

export const CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS = Object.freeze([
  "private.cms_capture_qa_actor_lease()",
  "private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()",
  "private.cms_ai_terminalize_qa_actor_graph()",
  "public.cms_open_draft_after_edit()",
]);

export const CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS = Object.freeze([
  "public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)",
  "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)",
  "public.cms_execute_visual_command(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)",
  "public.cms_execute_site_command(uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)",
]);

export const CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS = Object.freeze([
  "private.cms_resolve_session_core_0087(uuid,text,text,text,text,timestamptz,uuid)",
  "public.cms_resolve_session_unscoped_0070(uuid,text,text,text,timestamptz,uuid)",
  "private.cms_crb_terminalize_qa_graph()",
]);

export const CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256 = Object.freeze({
  baseline: "42cf04573ac27b48140b96b7dd4706b1ceee61838dc44983ebe7089e6d0afc4d",
  transformed: "fbe2c71fb695023b953a871c5f132e2dcf6b65a78265eb27441bda8cf1ef038f",
});

export const CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS = Object.freeze([
  "public.cms_list_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])",
  "public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)",
  "public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid)",
  "public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)",
  "public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text)",
  "public.cms_execute_dam_command(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)",
]);

export const CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS = Object.freeze([
  "public.cms_prepare_dam_gc_core_0088(uuid,text,text,text,text,timestamptz,uuid,uuid)",
  "public.cms_complete_dam_gc_core_0088(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)",
  "public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text)",
  "public.cms_execute_dam_command_core_0088(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)",
  "private.cms_guard_dam_asset_gc_fence()",
  "private.cms_assert_dam_actor_context(uuid,text,text,text,timestamptz)",
]);

export const CMS_RELEASE_STABILITY_FOLLOWUP_0101_OWNER_ONLY_FUNCTIONS = Object.freeze([
  "private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamptz)",
  "private.cms_cleanup_terminal_product_shared_options_0078()",
  "private.cms_system_rbac_terminal_cleanup()",
]);

export const CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS = Object.freeze([
  "public.cms_block_media_delete()",
  "private.cms_watchdog_stale_dam_uploads(integer)",
  "private.cms_validate_dam_crop_aspect()",
  "private.cms_block_dam_gc_relationship_write()",
  "private.cms_classify_media_gc_job()",
]);

const fail = (reason) => {
  throw new Error(`G12_MIGRATION_MANIFEST_INVALID:${reason}`);
};

export function sourceMigrationManifest(sourceRoot) {
  const root = resolve(sourceRoot);
  const migrationsRoot = join(root, "supabase", "migrations");
  try {
    if (!statSync(migrationsRoot).isDirectory()) fail("directory");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("G12_MIGRATION_MANIFEST_INVALID:")) {
      throw error;
    }
    fail("directory");
  }

  const entries = readdirSync(migrationsRoot, { withFileTypes: true });
  const sqlEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith(".sql"));
  if (!sqlEntries.length) fail("empty");
  const invalid = sqlEntries.find((entry) => !entry.isFile() || !MIGRATION_FILENAME_PATTERN.test(entry.name));
  if (invalid) fail(`filename:${invalid.name}`);

  const migrations = sqlEntries
    .map((entry) => {
      const match = MIGRATION_FILENAME_PATTERN.exec(entry.name);
      if (!match) fail(`filename:${entry.name}`);
      const bytes = readFileSync(join(migrationsRoot, entry.name));
      return {
        version: match[1],
        file: entry.name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    })
    .sort((left, right) => left.version.localeCompare(right.version) || left.file.localeCompare(right.file));

  const versions = migrations.map(({ version }) => version);
  if (new Set(versions).size !== versions.length) fail("duplicate-version");
  for (let index = 0; index < versions.length; index += 1) {
    const expected = String(index + 1).padStart(4, "0");
    if (versions[index] !== expected) fail(`sequence:expected-${expected}:received-${versions[index]}`);
  }
  const latestVersion = versions.at(-1);
  const expectedTail = G12_PINNED_MIGRATION_TAIL.filter(
    ({ version }) => Number(version) <= Number(latestVersion),
  );
  if (expectedTail.length) {
    const tail = migrations.slice(-expectedTail.length);
    for (let index = 0; index < expectedTail.length; index += 1) {
      const actual = tail[index];
      const expected = expectedTail[index];
      if (
        actual?.version !== expected.version ||
        actual?.file !== expected.file ||
        actual?.sha256 !== expected.sha256
      )
        fail(`pinned-tail:${expected.version}`);
    }
  }
  return migrations;
}

export function migrationVersionSqlArray(migrations) {
  if (
    !Array.isArray(migrations) ||
    !migrations.length ||
    migrations.some(({ version }) => typeof version !== "string" || !/^\d{4}$/.test(version))
  ) {
    fail("sql-array");
  }
  return `array[${migrations.map(({ version }) => `'${version}'`).join(",")}]::text[]`;
}

export function exactMigrationHistorySql(migrations) {
  const versions = migrationVersionSqlArray(migrations);
  return `(select coalesce(array_agg(version order by version), array[]::text[]) = ${versions} from supabase_migrations.schema_migrations) as migration_history_exact`;
}

export function serviceOnlyRpcContractSql(alias, signatures) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("rpc-alias");
  if (
    !Array.isArray(signatures) ||
    !signatures.length ||
    signatures.some(
      (signature) =>
        typeof signature !== "string" ||
        !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\((?:[a-z0-9_, ]|\[\])*\)$/.test(signature),
    ) ||
    new Set(signatures).size !== signatures.length
  )
    fail("rpc-signatures");
  const rows = signatures.map((signature) => `('${signature.replaceAll("'", "''")}')`).join(",\n        ");
  const required = `(values\n        ${rows}\n      ) as required(signature)`;
  return `not exists (
      select 1 from ${required}
      where to_regprocedure(required.signature) is null
    ) as ${alias}_present,
    not exists (
      select 1 from ${required}
      where to_regprocedure(required.signature) is null
        or not coalesce(
          has_function_privilege('service_role', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or coalesce(
          has_function_privilege('authenticated', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or coalesce(
          has_function_privilege('anon', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or exists (
          select 1
          from pg_catalog.pg_proc procedure_row
          cross join lateral pg_catalog.aclexplode(
            coalesce(
              procedure_row.proacl,
              pg_catalog.acldefault('f', procedure_row.proowner)
            )
          ) privilege_row
          left join pg_catalog.pg_roles grantee
            on grantee.oid = privilege_row.grantee
          where procedure_row.oid = to_regprocedure(required.signature)
            and privilege_row.privilege_type = 'EXECUTE'
            and privilege_row.grantee <> procedure_row.proowner
            and (
              coalesce(grantee.rolname, 'PUBLIC') <> 'service_role'
              or privilege_row.is_grantable
            )
        )
    ) as ${alias}_privileges_exact`;
}

export function ownerOnlyFunctionContractSql(alias, signatures) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("owner-only-alias");
  if (
    !Array.isArray(signatures) ||
    !signatures.length ||
    signatures.some(
      (signature) =>
        typeof signature !== "string" ||
        !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\((?:[a-z0-9_, ]|\[\])*\)$/.test(signature),
    ) ||
    new Set(signatures).size !== signatures.length
  )
    fail("owner-only-signatures");
  const rows = signatures.map((signature) => `('${signature.replaceAll("'", "''")}')`).join(",\n        ");
  return `not exists (
      select 1
      from (values
        ${rows}
      ) as required(signature)
      where to_regprocedure(required.signature) is null
        or coalesce(
          has_function_privilege('service_role', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or coalesce(
          has_function_privilege('authenticated', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or coalesce(
          has_function_privilege('anon', to_regprocedure(required.signature), 'EXECUTE'),
          false
        )
        or exists (
          select 1
          from pg_catalog.pg_proc procedure_row
          cross join lateral pg_catalog.aclexplode(
            coalesce(
              procedure_row.proacl,
              pg_catalog.acldefault('f', procedure_row.proowner)
            )
          ) privilege_row
          where procedure_row.oid = to_regprocedure(required.signature)
            and privilege_row.privilege_type = 'EXECUTE'
            and privilege_row.grantee <> procedure_row.proowner
        )
    ) as ${alias}`;
}

export function mediaUploadAbortSchemaContractSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("media-upload-schema-alias");
  return `(select count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.cms_media_assets'::regclass
        and constraint_row.conname = 'cms_media_operational_pixel_limit'
        and constraint_row.contype = 'c'
        and constraint_row.convalidated
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%width is null%'
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%height is null%'
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%width is not null%'
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%height is not null%'
        and pg_get_constraintdef(constraint_row.oid) like '%20000%'
        and pg_get_constraintdef(constraint_row.oid) like '%32000000%'
    ) as ${alias}_pixel_limit_exact,
    (select count(*) = 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.cms_media_assets'::regclass
        and constraint_row.conname = 'cms_media_upload_token_expiry_valid'
        and constraint_row.contype = 'c'
        and constraint_row.convalidated
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%upload_token_expires_at%'
        and lower(pg_get_constraintdef(constraint_row.oid)) like '%created_at%'
        and (
          lower(pg_get_constraintdef(constraint_row.oid)) like '%02:00:00%'
          or lower(pg_get_constraintdef(constraint_row.oid)) like '%120 min%'
        )
    ) as ${alias}_upload_token_expiry_exact,
    (select count(*) = 1
      from pg_catalog.pg_attribute attribute_row
      join pg_catalog.pg_attrdef default_row
        on default_row.adrelid = attribute_row.attrelid
       and default_row.adnum = attribute_row.attnum
      where attribute_row.attrelid = 'public.cms_media_assets'::regclass
        and attribute_row.attname = 'upload_token_expires_at'
        and not attribute_row.attisdropped
        and attribute_row.attnotnull
        and lower(pg_get_expr(default_row.adbin, default_row.adrelid)) like '%statement_timestamp()%'
        and (
          lower(pg_get_expr(default_row.adbin, default_row.adrelid)) like '%02:15:00%'
          or lower(pg_get_expr(default_row.adbin, default_row.adrelid)) like '%135 min%'
        )
    ) as ${alias}_upload_token_column_exact`;
}

export function sessionRefreshRevocationSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("session-revocation-alias");
  const applyCommand =
    "public.cms_apply_user_command_scoped(uuid,text,uuid,text,text,text[],text,text,text,timestamptz,uuid,uuid)";
  const resolveSession = "public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)";
  const resolveSessionCore =
    "private.cms_resolve_session_core_0087(uuid,text,text,text,text,timestamptz,uuid)";
  const resolveScopedAccess = "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)";
  const normalized = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const applyCommandDefinition = normalized(applyCommand);
  const resolveSessionDefinition = normalized(resolveSession);
  const resolveSessionCoreDefinition = normalized(resolveSessionCore);
  const resolveScopedAccessDefinition = normalized(resolveScopedAccess);
  return `coalesce(
      ${applyCommandDefinition}
      like '%from public.cms_login_events event%'
      and ${applyCommandDefinition}
        like '%from auth.sessions auth_session%'
      and ${applyCommandDefinition}
        like '%extensions.digest(auth_session.id::text,''sha256'')%'
      and ${applyCommandDefinition}
        like '%p_action in (''revoke_sessions'',''suspend'',''reactivate'')%'
      and ${applyCommandDefinition}
        like '%insert into public.cms_session_revocations%'
      and ${applyCommandDefinition}
        like '%''admin_command''%'
      and ${applyCommandDefinition}
        like '%coalesce((v_result->>''duplicate'')::boolean,false) is false%'
      and strpos(
        ${applyCommandDefinition},
        'coalesce((v_result->>''duplicate'')::boolean,false) is false'
      ) < strpos(
        ${applyCommandDefinition},
        'insert into public.cms_session_revocations'
      )
      and ${applyCommandDefinition}
        not like '%insert into auth.%'
      and ${applyCommandDefinition}
        not like '%update auth.%'
      and ${applyCommandDefinition}
        not like '%delete from auth.%'
      and ${applyCommandDefinition}
        not like '%rdo_%'
      and ${resolveSessionDefinition}
        like '%private.cms_resolve_session_core_0087(%'
      and ${resolveSessionCoreDefinition}
        like '%extensions.digest(p_session_id, ''sha256'')%'
      and ${resolveSessionCoreDefinition}
        like '%from public.cms_session_revocations revocation%'
      and ${resolveSessionCoreDefinition}
        like '%''CMS_SESSION_REVOKED''%'
      and ${resolveSessionCoreDefinition}
        like '%permission.critical%'
      and ${resolveSessionDefinition}
        like '%if p_event_type = ''logout'' then%'
      and ${resolveSessionDefinition}
        like '%insert into public.cms_session_revocations%'
      and ${resolveSessionDefinition}
        like '%''self_logout''%'
      and ${resolveScopedAccessDefinition}
        like '%bool_or(permission.critical)%',
      false
    ) as ${alias}`;
}

export function leadOriginBindingSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("lead-origin-binding-alias");
  const projection = "private.cms_projection_binds_exact_form(uuid,text,uuid,uuid,uuid,text,text,text)";
  const origin = "private.cms_form_capture_origin_allowed(uuid,uuid,jsonb,text)";
  return `coalesce(
      pg_get_functiondef(to_regprocedure('${projection}'))
        like '%join public.cms_publications published%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%published.revision_id = projection.revision_id%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%item.workflow_status = ''published''%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%private.cms_content_item_graph_scope_allowed(%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%for share of projection, item, published%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%v_payload #>> ''{form,formId}'' = p_form_id::text%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%v_payload #>> ''{form,versionId}'' = p_form_version_id::text%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%block #>> ''{data,formId}'' = p_form_id::text%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%block #>> ''{data,formVersionId}'' = p_form_version_id::text%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%p_origin_source = ''campaign''%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%p_origin_path = v_route_path%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%v_authoritative_path := ''/produtos/'' || v_slug%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        like '%p_origin_source = ''product'' and p_origin_path = v_authoritative_path%'
      and pg_get_functiondef(to_regprocedure('${projection}'))
        not like '%p_form_key%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%num_nonnulls(v_campaign_id, v_product_id) > 1%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%form.status = ''published''%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%form.active_version_id = p_form_version_id%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%v_source = ''qa_fixture''%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%v_path = ''/qa-cms-final/'' || lower(v_form.qa_run_tag)%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%private.cms_projection_binds_exact_form(%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        like '%v_source in (''site'', ''contact'', ''newsletter'', ''website'')%'
      and pg_get_functiondef(to_regprocedure('${origin}'))
        not like '%p_form_key%'
    , false) as ${alias}`;
}

export function publicRelationLimitSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("public-relation-limit-alias");
  const ids = "private.cms_public_relation_ids_0085(jsonb)";
  const count = "private.cms_public_relation_count_0085(jsonb)";
  const enforce = "private.cms_enforce_public_relation_limit_0085()";
  return `coalesce(
      pg_get_functiondef(to_regprocedure('${ids}'))
        like '%p_payload ? ''relations''%'
      and pg_get_functiondef(to_regprocedure('${ids}'))
        like '%jsonb_each(p_payload -> ''relations'')%'
      and pg_get_functiondef(to_regprocedure('${ids}'))
        like '%v_block #> ''{data,itemIds}''%'
      and pg_get_functiondef(to_regprocedure('${ids}'))
        like '%CMS_PUBLIC_RELATION_INVALID%'
      and pg_get_functiondef(to_regprocedure('${count}'))
        like '%count(distinct relation_id)%'
      and pg_get_functiondef(to_regprocedure('${enforce}'))
        like '%private.cms_public_relation_count_0085(new.payload) > 500%'
      and pg_get_functiondef(to_regprocedure('${enforce}'))
        like '%CMS_PUBLIC_RELATION_LIMIT_EXCEEDED%'
      and (
        select count(*) = 1
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.cms_published_projection'::regclass
          and trigger_row.tgname = 'cms_00_enforce_public_relation_limit_0085'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled = 'O'
          and lower(pg_get_triggerdef(trigger_row.oid))
            like '%before insert or update of payload on public.cms_published_projection%'
      )
    , false) as ${alias}`;
}

export function qaActorRuntimeRepairsSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("qa-actor-runtime-repairs-alias");
  const capture = "private.cms_capture_qa_actor_lease()";
  const formsCleanup = "private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()";
  const aiCleanup = "private.cms_ai_terminalize_qa_actor_graph()";
  const openDraft = "public.cms_open_draft_after_edit()";
  const normalized = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const captureDefinition = normalized(capture);
  const formsCleanupDefinition = normalized(formsCleanup);
  const aiCleanupDefinition = normalized(aiCleanup);
  const openDraftDefinition = normalized(openDraft);
  const narrowRestoreGuard =
    "if current_setting(''cms.qa_compensating'', true) = ''on'' and current_setting(''cms.qa_restore_item'', true) = new.item_id::text then return new; end if;";
  return `coalesce(
      ${captureDefinition}
        like '%v_created_at timestamptz := transaction_timestamp();%'
      and ${captureDefinition}
        not like '%v_created_at timestamptz := statement_timestamp();%'
      and ${captureDefinition}
        like '%if ( new.raw_user_meta_data -> ''synthetic'' = ''true''::jsonb and new.raw_user_meta_data ->> ''purpose'' = ''qa-cms-browser'' ) is not true then%'
      and ${captureDefinition}
        like '%if coalesce(new.raw_user_meta_data -> ''synthetic'' = ''true''::jsonb, false) or coalesce(new.raw_user_meta_data ->> ''purpose'' = ''qa-cms-browser'', false) then raise exception ''CMS_QA_ACTOR_METADATA_INVALID''%'
      and ${formsCleanupDefinition}
        like '%v_correlation_id uuid:=gen_random_uuid();%'
      and ${formsCleanupDefinition}
        like '%''terminalStatus'',new.status ),v_correlation_id );%'
      and ${formsCleanupDefinition}
        not like '%old.correlation_id%'
      and ${aiCleanupDefinition}
        like '%v_correlation_id uuid:=gen_random_uuid();%'
      and ${aiCleanupDefinition}
        like '%old.actor_id,''ai_qa_scope_terminal'',v_correlation_id,%'
      and ${aiCleanupDefinition}
        like '%''targetsRetired'',v_targets,''businessRowsRemoved'',v_business_rows_removed ),v_correlation_id );%'
      and ${aiCleanupDefinition}
        not like '%old.correlation_id%'
      and ${openDraftDefinition}
        like '%${narrowRestoreGuard}%'
      and strpos(${openDraftDefinition}, '${narrowRestoreGuard}') > 0
      and strpos(${openDraftDefinition}, '${narrowRestoreGuard}')
        < strpos(${openDraftDefinition}, 'if exists (')
      and ${openDraftDefinition}
        not like '%if current_setting(''cms.qa_compensating'', true) = ''on'' then return new; end if;%'
      and ${openDraftDefinition}
        not like '%if current_setting(''cms.qa_restore_item'', true) = new.item_id::text then return new; end if;%'
      and not exists (
        select 1
        from (values
          ('auth.users'::regclass, 'cms_capture_qa_actor_lease', '${capture}'),
          ('private.cms_qa_actor_leases'::regclass, 'zzz_cms_forms_leads_terminal_cleanup', '${formsCleanup}'),
          ('private.cms_qa_actor_leases'::regclass, 'zzzz_cms_ai_terminal_cleanup', '${aiCleanup}'),
          ('public.cms_content_drafts'::regclass, 'cms_draft_edit_opens_workflow', '${openDraft}')
        ) required(relation_id, trigger_name, signature)
        where (
          select count(*)
          from pg_catalog.pg_trigger trigger_row
          where trigger_row.tgrelid = required.relation_id
            and trigger_row.tgname = required.trigger_name
            and not trigger_row.tgisinternal
            and trigger_row.tgenabled = 'O'
            and trigger_row.tgfoid = to_regprocedure(required.signature)
        ) <> 1
      )
    , false) as ${alias}`;
}

export function runtimeIntegrityRepairsSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("runtime-integrity-repairs-alias");
  const sessionCore = "private.cms_resolve_session_core_0087(uuid,text,text,text,text,timestamptz,uuid)";
  const sessionScoped = "public.cms_resolve_session_scoped(uuid,text,text,text,text,timestamptz,uuid)";
  const sessionUnscoped = "public.cms_resolve_session_unscoped_0070(uuid,text,text,text,timestamptz,uuid)";
  const scopedAccess = "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)";
  const visual =
    "public.cms_execute_visual_command(uuid,text,uuid,uuid,jsonb,bigint,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)";
  const sites =
    "public.cms_execute_site_command(uuid,text,text,jsonb,bigint,text,text,text,text,timestamptz,uuid,uuid,text,uuid)";
  const crbCleanup = "private.cms_crb_terminalize_qa_graph()";
  const normalized = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const sessionCoreDefinition = normalized(sessionCore);
  const sessionScopedDefinition = normalized(sessionScoped);
  const sessionUnscopedDefinition = normalized(sessionUnscoped);
  const scopedAccessDefinition = normalized(scopedAccess);
  const visualDefinition = normalized(visual);
  const sitesDefinition = normalized(sites);
  const crbDefinition = normalized(crbCleanup);
  const crbRestore =
    "perform set_config( ''cms.qa_mutation_actor_id'', coalesce(v_previous_actor, ''''), true );";
  const crbException = "exception when others then";
  const loginInsert = "insert into public.cms_login_events";
  const coreLeaseLock = "perform private.cms_system_lock_actor_scope(p_user_id, p_environment);";
  const accessLeaseLock = "perform private.cms_system_lock_actor_scope(p_actor_id, p_environment);";
  const advisoryLock = "perform pg_advisory_xact_lock(hashtextextended(";
  return `coalesce(
      ${sessionScopedDefinition}
        like '%private.cms_resolve_session_core_0087(%'
      and ${sessionScopedDefinition}
        not like '%update public.cms_login_events%'
      and ${sessionUnscopedDefinition}
        like '%private.cms_resolve_session_core_0087(%'
      and ${sessionUnscopedDefinition}
        not like '%update public.cms_login_events%'
      and ${sessionCoreDefinition}
        like '%${loginInsert}%'
      and ${sessionCoreDefinition}
        not like '%update public.cms_login_events%'
      and (
        length(${sessionCoreDefinition})
          - length(replace(${sessionCoreDefinition}, '${loginInsert}', ''))
      ) / length('${loginInsert}') = 1
      and ${sessionCoreDefinition}
        like '%permission.critical%'
      and ${sessionCoreDefinition}
        like '%p_event_type is null%'
      and ${sessionCoreDefinition}
        like '%p_aal is null%'
      and ${sessionCoreDefinition}
        like '%cardinality(role_keys) > 0%'
      and ${sessionCoreDefinition}
        like '%scope_capability ->> ''reasonCode'' = ''feature_disabled''%'
      and ${sessionCoreDefinition}
        like '%role_keys := array[]::text[];%'
      and ${sessionCoreDefinition}
        like '%permission_keys := array[]::text[];%'
      and ${sessionCoreDefinition}
        like '%access_granted := false;%'
      and ${sessionCoreDefinition}
        like '%''rbacScoped'', coalesce(%'
      and ${sessionCoreDefinition}
        like '%''rbacScopeReasonCode'', coalesce(%'
      and ${sessionCoreDefinition}
        like '%''scope'', case%'
      and ${sessionCoreDefinition}
        like '%scope_capability ->> ''reasonCode'', ''session_or_scope_invalid''%'
      and strpos(${sessionCoreDefinition}, '${coreLeaseLock}') > 0
      and strpos(${sessionCoreDefinition}, '${advisoryLock}') >
        strpos(${sessionCoreDefinition}, '${coreLeaseLock}')
      and strpos(${sessionCoreDefinition}, 'select profile.status into profile_status') >
        strpos(${sessionCoreDefinition}, '${advisoryLock}')
      and strpos(${sessionCoreDefinition}, 'scope_capability := public.cms_rbac_scope_capability(') > 0
      and strpos(${sessionCoreDefinition}, 'scoped_access := public.cms_resolve_scoped_access(') >
        strpos(${sessionCoreDefinition}, 'scope_capability := public.cms_rbac_scope_capability(')
      and strpos(${sessionCoreDefinition}, '${loginInsert}') >
        strpos(${sessionCoreDefinition}, 'scoped_access := public.cms_resolve_scoped_access(')
      and ${scopedAccessDefinition}
        not like '%insert into public.cms_login_events%'
      and ${scopedAccessDefinition}
        not like '%update public.cms_login_events%'
      and ${scopedAccessDefinition}
        like '%with effective_assignment as materialized (%'
      and ${scopedAccessDefinition}
        like '%bool_or(permission.critical)%'
      and ${scopedAccessDefinition}
        like '%cardinality(v_roles) > 0%'
      and strpos(${scopedAccessDefinition}, '${accessLeaseLock}') > 0
      and strpos(${scopedAccessDefinition}, '${advisoryLock}') >
        strpos(${scopedAccessDefinition}, '${accessLeaseLock}')
      and strpos(${scopedAccessDefinition}, 'with effective_assignment as materialized (') >
        strpos(${scopedAccessDefinition}, '${advisoryLock}')
      and ${visualDefinition}
        like '%or p_action is null%'
      and ${visualDefinition}
        like '%or p_environment is null%'
      and ${visualDefinition}
        like '%or p_site_key is distinct from ''main''%'
      and ${visualDefinition}
        like '%if p_aal is distinct from ''aal2'' then%'
      and strpos(${visualDefinition}, 'CMS_VISUAL_COMMAND_INVALID') > 0
      and strpos(${visualDefinition}, 'CMS_VISUAL_MFA_REQUIRED') >
        strpos(${visualDefinition}, 'CMS_VISUAL_COMMAND_INVALID')
      and strpos(${visualDefinition}, 'perform private.cms_visual_assert_available(') >
        strpos(${visualDefinition}, 'CMS_VISUAL_MFA_REQUIRED')
      and ${sitesDefinition}
        like '%or p_action is null%'
      and ${sitesDefinition}
        like '%or p_environment is null%'
      and ${sitesDefinition}
        like '%or p_site_key is distinct from ''main''%'
      and ${sitesDefinition}
        like '%if p_aal is distinct from ''aal2'' then%'
      and strpos(${sitesDefinition}, 'CMS_SITES_COMMAND_INVALID') > 0
      and strpos(${sitesDefinition}, 'CMS_SITES_MFA_REQUIRED') >
        strpos(${sitesDefinition}, 'CMS_SITES_COMMAND_INVALID')
      and strpos(${sitesDefinition}, 'perform private.cms_sites_assert_available(') >
        strpos(${sitesDefinition}, 'CMS_SITES_MFA_REQUIRED')
      and ${crbDefinition}
        like '%v_previous_actor text := current_setting(''cms.qa_mutation_actor_id'', true);%'
      and strpos(${crbDefinition}, '${crbRestore}') > 0
      and strpos(${crbDefinition}, '${crbRestore}') <
        strpos(${crbDefinition}, '${crbException}')
      and strpos(${crbDefinition}, '${crbException}') > 0
      and strpos(
        substr(${crbDefinition}, strpos(${crbDefinition}, '${crbException}')),
        '${crbRestore}'
      ) > 0
      and exists (
        select 1
        from pg_catalog.pg_proc procedure_row
        join pg_catalog.pg_language language_row
          on language_row.oid = procedure_row.prolang
        where procedure_row.oid = to_regprocedure('${crbCleanup}')
          and procedure_row.prosecdef
          and language_row.lanname = 'plpgsql'
          and coalesce(
            'search_path=pg_catalog, public, private, pg_temp'
              = any(procedure_row.proconfig),
            false
          )
          and encode(extensions.digest(convert_to(replace(replace(
            procedure_row.prosrc, E'\\r\\n', E'\\n'
          ), E'\\r', E'\\n'), 'UTF8'), 'sha256'), 'hex')
            = '${CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256.transformed}'
          and encode(extensions.digest(convert_to(replace(replace(
            procedure_row.prosrc, E'\\r\\n', E'\\n'
          ), E'\\r', E'\\n'), 'UTF8'), 'sha256'), 'hex')
            <> '${CMS_RUNTIME_INTEGRITY_REPAIRS_0087_CRB_PROSRC_SHA256.baseline}'
      )
      and (
        select count(*) = 1
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = 'private.cms_qa_actor_leases'::regclass
          and trigger_row.tgname = 'cms_prepare_qa_actor_terminal_crb_cleanup'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled = 'O'
          and trigger_row.tgfoid = to_regprocedure('${crbCleanup}')
      )
    , false) as ${alias}`;
}

export function runtimeIntegrityFollowupSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("runtime-integrity-followup-alias");
  const media = "public.cms_list_media_usages_scoped(uuid,text,text,text,timestamptz,uuid[])";
  const ai =
    "public.cms_execute_ai_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,text)";
  const prepare = "public.cms_prepare_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid)";
  const complete = "public.cms_complete_dam_gc(uuid,text,text,text,text,timestamptz,uuid,uuid,boolean)";
  const fence = "private.cms_guard_dam_asset_gc_fence()";
  const damAssert = "private.cms_assert_dam_actor_context(uuid,text,text,text,timestamptz)";
  const retry =
    "public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text)";
  const dam =
    "public.cms_execute_dam_command(uuid,text,text,text,text,timestamptz,text,jsonb,uuid,uuid,text,uuid)";
  const normalized = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const mediaDefinition = normalized(media);
  const aiDefinition = normalized(ai);
  const prepareDefinition = normalized(prepare);
  const completeDefinition = normalized(complete);
  const fenceDefinition = normalized(fence);
  const damAssertDefinition = normalized(damAssert);
  const retryDefinition = normalized(retry);
  const damDefinition = normalized(dam);
  return `coalesce(
      ${mediaDefinition} like '%progressive.promoted_item_id = item.id%'
      and ${mediaDefinition} not like '%progressive.item_id = item.id%'
      and ${aiDefinition} like '%if p_aal is distinct from ''aal2'' then%'
      and strpos(${aiDefinition}, 'CMS_AI_MFA_REQUIRED') >
        strpos(${aiDefinition}, 'if p_aal is distinct from ''aal2'' then')
      and ${prepareDefinition} like '%v_previous_operation text := current_setting(''cms.dam_gc_operation'',true)%'
      and ${prepareDefinition} like '%exception when others then%'
      and ${completeDefinition} like '%v_previous_claim text := current_setting(''cms.dam_gc_claim_id'',true)%'
      and ${completeDefinition} like '%exception when others then%'
      and ${fenceDefinition} like '%v_mutation_is_claim_only%'
      and ${fenceDefinition} like '%new.lock_version=old.lock_version+1%'
      and ${fenceDefinition} like '%join public.cms_dam_gc_jobs job%'
      and ${damAssertDefinition} like '%''cms:media.edit''%'
      and ${retryDefinition} like '%cms:lead-delivery-idempotency:%'
      and strpos(${retryDefinition}, 'pg_advisory_xact_lock') <
        strpos(${retryDefinition}, 'from public.cms_lead_outbox_replays replay')
      and strpos(${retryDefinition}, 'from public.cms_lead_outbox_replays replay') <
        strpos(${retryDefinition}, 'cms_retry_lead_delivery_scoped_core_0088')
      and ${damDefinition} like '%private.cms_assert_dam_actor_context(%'
      and ${damDefinition} like '%v_lease_environment is distinct from p_environment%'
      and ${damDefinition} like '%set_config(''cms.qa_mutation_actor_id'', p_actor_id::text, true)%'
      and ${damDefinition} like '%exception when others then%'
      and not has_schema_privilege('anon','public','CREATE')
      and not has_schema_privilege('authenticated','public','CREATE')
      and not has_schema_privilege('service_role','public','CREATE')
    , false) as ${alias}`;
}

// A 0089 separou o predicado da politica de eventos operacionais em uma metade de sessao e uma de
// linha, e adicionou os indices que tornam o limite efetivo. Sem isso a leitura de diagnosticos
// reavalia a linhagem de permissao por linha e estoura o statement_timeout. Esta verificacao roda
// contra o banco real do ambiente e prova, ao mesmo tempo, que a separacao existe e que ela nao
// afrouxou nenhuma das tres condicoes originais.
export function operationalEventsReadScaleSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("operational-events-read-scale-alias");
  const session = "public.cms_system_operational_session_scope_allowed()";
  const row = "public.cms_system_operational_event_row_allowed(uuid)";
  const definition = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const policy = `(select pg_catalog.pg_get_expr(p.polqual, p.polrelid) from pg_catalog.pg_policy p
        where p.polname = 'cms_operational_events_authoritative_read'
          and p.polrelid = 'public.cms_operational_events'::regclass)`;
  const index = (name) => `(select i.indexdef from pg_catalog.pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'cms_operational_events'
          and i.indexname = '${name}')`;
  return `coalesce(
      to_regprocedure('${session}') is not null
      and to_regprocedure('${row}') is not null
      and (select p.prosecdef and p.provolatile = 's'
             and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, private, pg_temp%'
           from pg_catalog.pg_proc p where p.oid = to_regprocedure('${session}'))
      and (select p.prosecdef and p.provolatile = 's'
             and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, private, pg_temp%'
           from pg_catalog.pg_proc p where p.oid = to_regprocedure('${row}'))
      and not has_function_privilege('anon', '${session}', 'EXECUTE')
      and not has_function_privilege('anon', '${row}', 'EXECUTE')
      and has_function_privilege('authenticated', '${session}', 'EXECUTE')
      and has_function_privilege('authenticated', '${row}', 'EXECUTE')
      and ${policy} like '%cms_system_operational_session_scope_allowed%'
      and ${policy} like '%cms_system_operational_event_row_allowed%'
      and ${definition(session)} like '%cms_system_permission_lineage_allowed%'
      and ${definition(session)} like '%cms:diagnostics.read%'
      and ${definition(row)} like '%cms_system_operational_event_scope_allowed%'
      and ${index("cms_operational_events_unresolved_recent_idx")} like '%(created_at DESC)%'
      and ${index("cms_operational_events_unresolved_recent_idx")} like '%WHERE (resolved_at IS NULL)%'
      and ${index("cms_operational_events_recent_idx")} like '%(created_at DESC)%'
    , false) as ${alias}`;
}

// A 0090 aceita, para concluir a lease do ator sintetico, o unico estado que o fence canonico de 0063
// permite dentro de um run: acesso revogado com a escritura canonica ainda agendada. Verificar isso
// contra o banco real importa porque as duas regras vivem em migrations diferentes e so entram em
// conflito quando um documento sintetico existe de fato.
export function qaLeaseDocumentCanonicalFenceSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("qa-lease-document-fence-alias");
  const lease = "public.cms_complete_qa_actor_lease(uuid,text,text,text)";
  const fence = "private.cms_document_canonical_write_fence()";
  const definition = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  return `coalesce(
      to_regprocedure('${lease}') is not null
      and to_regprocedure('${fence}') is not null
      and ${definition(lease)} like '%canonical_cleanup_not_before > v_now%'
      and ${definition(lease)} like '%blob_disposition = ''access_revoked''%'
      and ${definition(lease)} like '%upload_disposition not in%'
      and ${definition(lease)} like '%CMS_QA_ACTOR_CLEANUP_INCOMPLETE%'
      and ${definition(lease)} like '%banned_until > v_now%'
      and ${definition(fence)} like '%CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE%'
      and not has_function_privilege('anon', '${lease}', 'EXECUTE')
      and not has_function_privilege('authenticated', '${lease}', 'EXECUTE')
      and has_function_privilege('service_role', '${lease}', 'EXECUTE')
    , false) as ${alias}`;
}

// A 0091 estendeu o prazo da lease do ator sintetico para 240 minutos, porque a janela autenticada de
// staging passou a conter tambem a prova de compatibilidade do rollback. Verificar isso contra o banco
// real importa porque o watchdog varre leases expiradas de minuto em minuto: um prazo curto demais
// derrubaria um ator ainda em uso no meio do gate.
export function qaActorLeaseWindowSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("qa-actor-lease-window-alias");
  const capture = "private.cms_capture_qa_actor_lease()";
  const sweeper = "private.cms_sweep_expired_qa_actor_leases(integer)";
  const definition = `regexp_replace(pg_get_functiondef(to_regprocedure('${capture}')), '[[:space:]]+', ' ', 'g')`;
  return `coalesce(
      to_regprocedure('${capture}') is not null
      and to_regprocedure('${sweeper}') is not null
      and ${definition} like '%240 minutes%'
      and ${definition} not like '%119 minutes%'
      and ${definition} like '%transaction_timestamp()%'
      and ${definition} like '%CMS_QA_ACTOR_METADATA_INVALID%'
      and exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = 'private.cms_qa_actor_leases'::regclass
          and c.conname = 'cms_qa_actor_leases_check1'
          and pg_catalog.pg_get_constraintdef(c.oid) like '%04:01:00%'
      )
      and not has_function_privilege('anon', '${capture}', 'EXECUTE')
      and not has_function_privilege('authenticated', '${capture}', 'EXECUTE')
      and exists (
        select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'auth.users'::regclass
          and t.tgname = 'cms_capture_qa_actor_lease'
          and not t.tgisinternal
      )
    , false) as ${alias}`;
}

// A janela das sobreposicoes de flag deriva do prazo da lease e tinha teto proprio. Verificar isso
// contra o banco real importa porque os dois vivem em migrations diferentes: com eles em desacordo, o
// manifesto de capacidades marca toda flag como indisponivel e o ator sintetico nao fica pronto.
export function qaOverrideWindowSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("qa-override-window-alias");
  const validator = "private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)";
  const definition = `regexp_replace(pg_get_functiondef(to_regprocedure('${validator}')), '[[:space:]]+', ' ', 'g')`;
  return `coalesce(
      to_regprocedure('${validator}') is not null
      and ${definition} like '%241 minutes%'
      and ${definition} not like '%120 minutes%'
      and ${definition} like '%cms_qa_actor_marker_is_exact%'
      and ${definition} like '%p_expires_at > p_starts_at%'
      and not has_function_privilege('anon', '${validator}', 'EXECUTE')
      and not has_function_privilege('authenticated', '${validator}', 'EXECUTE')
    , false) as ${alias}`;
}

// A 0098 separa as verificacoes invariaveis da sessao da restricao por ator do evento e indexa a
// ordenacao global usada pelo dashboard. O contrato remoto prova que a otimizacao preserva tanto a
// visibilidade corporativa completa quanto o isolamento do ator QA ao run exato.
export function auditLogReadScaleSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("audit-log-read-scale-alias");
  const session = "public.cms_audit_session_scope_allowed()";
  const corporate = "public.cms_audit_corporate_session_allowed()";
  const row = "public.cms_audit_event_row_allowed(uuid)";
  const definition = (signature) =>
    `regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g')`;
  const policy = `(select pg_catalog.pg_get_expr(p.polqual, p.polrelid) from pg_catalog.pg_policy p
        where p.polname = 'cms_audit_authorized_read'
          and p.polrelid = 'public.cms_audit_log'::regclass)`;
  const canonicalPolicy = `replace(replace(replace(replace(
        lower(regexp_replace(${policy}, '[[:space:]]+', '', 'g')),
        'public.', ''),
        'ascms_audit_session_scope_allowed', ''),
        'ascms_audit_corporate_session_allowed', ''),
        'cms_audit_log.actor_id', 'actor_id')`;
  const routineExact = (signature, prosrcSha256) => `exists (
        select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_language language_row on language_row.oid = p.prolang
        where p.oid = to_regprocedure('${signature}')
          and p.prokind = 'f'
          and p.prorettype = 'boolean'::regtype
          and p.prosecdef
          and p.provolatile = 's'
          and not p.proisstrict
          and not p.proleakproof
          and p.proparallel = 'u'
          and p.proowner = 'postgres'::regrole
          and language_row.lanname = 'sql'
          and p.proconfig = array['search_path=pg_catalog, private, auth, pg_temp']::text[]
          and encode(extensions.digest(convert_to(replace(replace(
            p.prosrc, E'\\r\\n', E'\\n'
          ), E'\\r', E'\\n'), 'UTF8'), 'sha256'), 'hex') = '${prosrcSha256}'
      )`;
  const aclExact = (signature) => `not exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral pg_catalog.aclexplode(
          coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) acl
        where p.oid = to_regprocedure('${signature}')
          and not (
            acl.grantee = p.proowner
            or (
              acl.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
              and acl.grantor = p.proowner
              and acl.privilege_type = 'EXECUTE'
              and not acl.is_grantable
            )
          )
      )`;
  const indexExact = `exists (
        select 1
        from pg_catalog.pg_class index_class
        join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
        join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
        join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
        where index_namespace.nspname = 'public'
          and index_class.relname = 'cms_audit_log_recent_idx'
          and index_record.indrelid = 'public.cms_audit_log'::regclass
          and index_record.indisvalid
          and index_record.indisready
          and not index_record.indisunique
          and index_record.indpred is null
          and index_record.indexprs is null
          and index_record.indnkeyatts = 1
          and index_record.indnatts = 1
          and access_method.amname = 'btree'
          and index_record.indkey[0] = (
            select attribute.attnum
            from pg_catalog.pg_attribute attribute
            where attribute.attrelid = 'public.cms_audit_log'::regclass
              and attribute.attname = 'occurred_at'
              and not attribute.attisdropped
          )
          and pg_catalog.pg_index_column_has_property(index_record.indexrelid, 1, 'desc') is true
          and pg_catalog.pg_index_column_has_property(index_record.indexrelid, 1, 'nulls_first') is true
      )`;
  return `coalesce(
      to_regprocedure('${session}') is not null
      and to_regprocedure('${corporate}') is not null
      and to_regprocedure('${row}') is not null
      and ${routineExact(session, "fd3421d2fbf30dc9a3d43553b389b0e6a11f097f2b23767edaddb5815ac87d71")}
      and ${routineExact(corporate, "fede1da9331eca631d0d3a7d57bf32b2333e1a571d7e5cbf23703079a68dd7c2")}
      and ${routineExact(row, "e3aa5ec8c4fa074e3f3df282911b500728c7ee742d8a61dce6db80a848efeb0a")}
      and ${aclExact(session)}
      and ${aclExact(corporate)}
      and ${aclExact(row)}
      and not has_function_privilege('anon', '${session}', 'EXECUTE')
      and not has_function_privilege('anon', '${corporate}', 'EXECUTE')
      and not has_function_privilege('anon', '${row}', 'EXECUTE')
      and not has_function_privilege('service_role', '${session}', 'EXECUTE')
      and not has_function_privilege('service_role', '${corporate}', 'EXECUTE')
      and not has_function_privilege('service_role', '${row}', 'EXECUTE')
      and has_function_privilege('authenticated', '${session}', 'EXECUTE')
      and has_function_privilege('authenticated', '${corporate}', 'EXECUTE')
      and has_function_privilege('authenticated', '${row}', 'EXECUTE')
      and (select count(*) = 1 from pg_catalog.pg_policy p
             where p.polrelid = 'public.cms_audit_log'::regclass and p.polcmd in ('r', '*'))
      and (select p.polpermissive
                    and p.polroles = array[(select r.oid from pg_catalog.pg_roles r
                                             where r.rolname = 'authenticated')]
             from pg_catalog.pg_policy p
             where p.polname = 'cms_audit_authorized_read'
               and p.polrelid = 'public.cms_audit_log'::regclass
               and p.polcmd = 'r')
      and ${canonicalPolicy} =
        '((selectcms_audit_session_scope_allowed())and((selectcms_audit_corporate_session_allowed())orcms_audit_event_row_allowed(actor_id)))'
      and lower(${definition(session)}) like '%auth.uid() is not null%'
      and lower(${definition(session)}) like '%auth.users%'
      and lower(${definition(session)}) like '%cms_has_permission%'
      and lower(${definition(session)}) like '%cms:audit.read%'
      and lower(${definition(corporate)}) like '%auth.uid() is not null%'
      and lower(${definition(corporate)}) like '%cms_qa_actor_leases%'
      and lower(${definition(row)}) like '%p_event_actor_id is not null%'
      and lower(${definition(row)}) like '%cms_user_actor_target_scope_allowed%'
      and lower(${definition(row)}) like '%cms_user_actor_environment%'
      and ${indexExact}
      and not has_table_privilege('anon', 'public.cms_audit_log', 'SELECT')
    , false) as ${alias}`;
}

// A 0099 gives the snapshot's critical-alert aggregate the exact partial index
// its predicate needs.  The remote contract proves both the structural index
// shape and that the authoritative row-scope call remains in the snapshot.
export function systemSnapshotOpenCriticalScaleSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("system-snapshot-open-critical-scale-alias");
  const signature = "public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)";
  const definition = `lower(regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g'))`;
  const predicate = `regexp_replace(
        lower(pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid)),
        '[[:space:]()]', '', 'g'
      )`;
  return `coalesce(
      exists (
        select 1
        from pg_catalog.pg_class index_class
        join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
        join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
        join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
        where index_namespace.nspname = 'public'
          and index_class.relname = 'cms_operational_events_open_critical_id_idx'
          and index_record.indrelid = 'public.cms_operational_events'::regclass
          and index_record.indisvalid
          and index_record.indisready
          and not index_record.indisunique
          and index_record.indpred is not null
          and index_record.indexprs is null
          and index_record.indnkeyatts = 1
          and index_record.indnatts = 1
          and access_method.amname = 'btree'
          and index_record.indkey[0] = (
            select attribute.attnum
            from pg_catalog.pg_attribute attribute
            where attribute.attrelid = 'public.cms_operational_events'::regclass
              and attribute.attname = 'id'
              and not attribute.attisdropped
          )
          and ${predicate} = 'severity=''critical''::textandresolved_atisnull'
      )
      and ${definition} like '%event.severity = ''critical''%'
      and ${definition} like '%event.resolved_at is null%'
      and ${definition} like '%private.cms_system_operational_event_scope_allowed(%'
      and not has_table_privilege('anon', 'public.cms_operational_events', 'SELECT')
    , false) as ${alias}`;
}

// A 0100 bounds the lead child-table lookups that both the authoritative
// lead scope and the snapshot divergence checks execute for every scoped
// lead.  The remote contract requires the four exact indexes while proving
// that neither the predicates nor the anonymous boundary were widened.
export function systemSnapshotLeadReadScaleSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("system-snapshot-lead-read-scale-alias");
  const snapshotSignature =
    "public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)";
  const scopeSignature = "private.cms_lead_scope_allowed(uuid,uuid,text)";
  const definition = (signature) =>
    `lower(regexp_replace(pg_get_functiondef(to_regprocedure('${signature}')), '[[:space:]]+', ' ', 'g'))`;
  return `coalesce(
      (
        with expected(table_name, index_name) as (
          values
            ('cms_lead_consents', 'cms_lead_consents_lead_id_idx'),
            ('cms_lead_status_history', 'cms_lead_status_history_lead_id_idx'),
            ('cms_lead_outbox', 'cms_lead_outbox_lead_id_idx'),
            ('cms_lead_outbox_replays', 'cms_lead_outbox_replays_lead_id_idx')
        )
        select count(*) = 4
        from expected
        join pg_catalog.pg_class index_class on index_class.relname = expected.index_name
        join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
        join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
        join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
        where index_namespace.nspname = 'public'
          and index_record.indrelid = to_regclass('public.' || expected.table_name)
          and index_record.indisvalid
          and index_record.indisready
          and not index_record.indisunique
          and index_record.indpred is null
          and index_record.indexprs is null
          and index_record.indnkeyatts = 1
          and index_record.indnatts = 1
          and access_method.amname = 'btree'
          and index_record.indkey[0] = (
            select attribute.attnum
            from pg_catalog.pg_attribute attribute
            where attribute.attrelid = index_record.indrelid
              and attribute.attname = 'lead_id'
              and not attribute.attisdropped
          )
      )
      and ${definition(snapshotSignature)} like '%private.cms_lead_scope_allowed(%'
      and ${definition(snapshotSignature)} like '%consent.lead_id = lead.id%'
      and ${definition(snapshotSignature)} like '%history.lead_id = lead.id%'
      and ${definition(snapshotSignature)} like '%outbox.lead_id = lead.id%'
      and ${definition(scopeSignature)} like '%history.lead_id = lead.id%'
      and ${definition(scopeSignature)} like '%replay.lead_id = lead.id%'
      and has_function_privilege(
        'authenticated',
        'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        '${snapshotSignature}',
        'EXECUTE'
      )
      and not has_table_privilege('anon', 'public.cms_lead_consents', 'SELECT')
      and not has_table_privilege('anon', 'public.cms_lead_status_history', 'SELECT')
      and not has_table_privilege('anon', 'public.cms_lead_outbox', 'SELECT')
      and not has_table_privilege('anon', 'public.cms_lead_outbox_replays', 'SELECT')
    , false) as ${alias}`;
}

// The 0101 follow-up removes redundant replay mutation locks and bounds two
// terminal cleanup paths. The remote preflight proves that every original
// security gate remains in front of the optimized work and that trigger/ACL
// dependencies still point at the hardened definitions.
export function releaseStabilityFollowupSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("release-stability-followup-alias");
  const retry =
    "public.cms_retry_lead_delivery_scoped(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)";
  const retryCore =
    "public.cms_retry_lead_delivery_scoped_core_0088(uuid,uuid,text,text,text,text,text,timestamp with time zone,uuid,uuid,text)";
  const reference =
    "private.cms_qa_archived_product_reference_exact_0101(uuid,text,text,text,uuid,uuid,timestamp with time zone)";
  const productCleanup = "private.cms_cleanup_terminal_product_shared_options_0078()";
  const rbacCleanup = "private.cms_system_rbac_terminal_cleanup()";
  const definition = (signature) =>
    `regexp_replace(lower(pg_get_functiondef(to_regprocedure('${signature}'))), '[[:space:]]+', '', 'g')`;
  const exactAcl = (signature, serviceOnly = false) => `not exists (
        select 1
        from pg_catalog.pg_proc procedure
        cross join lateral pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) acl
        where procedure.oid=to_regprocedure('${signature}')
          and not (
            acl.grantee=procedure.proowner
            ${
              serviceOnly
                ? `or (
              acl.grantee=(select role.oid from pg_catalog.pg_roles role where role.rolname='service_role')
              and acl.grantor=procedure.proowner
              and acl.privilege_type='EXECUTE'
              and not acl.is_grantable
            )`
                : ""
            }
          )
      )`;
  const retryDefinition = definition(retry);
  const referenceDefinition = definition(reference);
  const productDefinition = definition(productCleanup);
  const rbacDefinition = definition(rbacCleanup);
  return `coalesce(
      to_regprocedure('${retry}') is not null
      and to_regprocedure('${retryCore}') is not null
      and to_regprocedure('${reference}') is not null
      and to_regprocedure('${productCleanup}') is not null
      and to_regprocedure('${rbacCleanup}') is not null
      and position('cms_system_assert_available' in ${retryDefinition}) > 0
      and position('cms_system_assert_available' in ${retryDefinition})
        < position('cms_lock_active_qa_actor_leases' in ${retryDefinition})
      and position('cms_lock_active_qa_actor_leases' in ${retryDefinition})
        < position('pg_advisory_xact_lock' in ${retryDefinition})
      and position('pg_advisory_xact_lock' in ${retryDefinition})
        < position('forupdate' in ${retryDefinition})
      and position('forupdate' in ${retryDefinition})
        < position('cms_lead_scope_allowed' in ${retryDefinition})
      and position('cms_lead_scope_allowed' in ${retryDefinition})
        < position('''duplicate'',true' in ${retryDefinition})
      and position('''duplicate'',true' in ${retryDefinition})
        < position('cms_retry_lead_delivery_scoped_core_0088' in ${retryDefinition})
      and ${retryDefinition} like '%event.id=v_replay.event_id%'
      and ${retryDefinition} like '%event.lead_id=v_replay.lead_id%'
      and ${referenceDefinition} like '%cms_qa_actor_marker_is_exact%'
      and ${referenceDefinition} like '%item.content_type=''product''%'
      and ${referenceDefinition} like '%item.workflow_status=''archived''%'
      and ${referenceDefinition} like '%item.created_by=p_actor_id%'
      and ${referenceDefinition} like '%item.created_atbetweenlease.created_atandlease.expires_at%'
      and ${referenceDefinition} like '%p_reference_actor_id=p_actor_id%'
      and ${referenceDefinition} like '%p_reference_atbetweenlease.created_atandlease.expires_at%'
      and ${referenceDefinition} not like '%lease.status=''active''%'
      and ${referenceDefinition} not like '%lease.expires_at>%'
      and ${productDefinition} like '%strpos(lower(projection.payload::text),option_id::text)>0%'
      and ${productDefinition} like '%strpos(lower(reference.payload::text),option_id::text)>0%'
      and ${productDefinition} like '%cms_qa_archived_product_reference_exact_0101%'
      and ${productDefinition} like '%cms_qa_product_option_reference_active%'
      and ${rbacDefinition} like '%candidate_correlations(correlation_id)asmaterialized%'
      and ${rbacDefinition} like '%candidate_event_ids(id)asmaterialized%'
      and ${rbacDefinition} like '%allowed_event_ids(id)asmaterialized%'
      and ${rbacDefinition} like '%v_previous_cleanup_actor%'
      and ${rbacDefinition} like '%exceptionwhenothersthen%'
      and ${rbacDefinition} like '%coalesce(v_previous_cleanup_actor,'''')%'
      and position('candidate_event_ids' in ${rbacDefinition})
        < position('cms_system_operational_event_scope_allowed' in ${rbacDefinition})
      and ${rbacDefinition} like '%deletefrompublic.cms_operational_eventseventusingallowed_event_ids%'
      and ${exactAcl(retry, true)}
      and ${exactAcl(retryCore)}
      and ${exactAcl(reference)}
      and ${exactAcl(productCleanup)}
      and ${exactAcl(rbacCleanup)}
      and has_function_privilege('service_role','${retry}','EXECUTE')
      and not has_function_privilege('anon','${retry}','EXECUTE')
      and not has_function_privilege('authenticated','${retry}','EXECUTE')
      and not has_function_privilege('service_role','${retryCore}','EXECUTE')
      and not has_function_privilege('service_role','${reference}','EXECUTE')
      and not has_function_privilege('service_role','${productCleanup}','EXECUTE')
      and not has_function_privilege('service_role','${rbacCleanup}','EXECUTE')
      and exists (
        select 1
        from pg_catalog.pg_trigger installed
        where installed.tgrelid='private.cms_qa_actor_leases'::regclass
          and installed.tgname='cms_prepare_qa_actor_terminal_product_shared_vocab_cleanup'
          and installed.tgfoid=to_regprocedure('${productCleanup}')
          and installed.tgenabled='O'
          and not installed.tgisinternal
      )
      and exists (
        select 1
        from pg_catalog.pg_trigger installed
        where installed.tgrelid='private.cms_qa_actor_leases'::regclass
          and installed.tgname='zzzz_cms_system_rbac_terminal_cleanup'
          and installed.tgfoid=to_regprocedure('${rbacCleanup}')
          and installed.tgenabled='O'
          and not installed.tgisinternal
      )
    , false) as ${alias}`;
}

// The 0102 boundary is additive so a previous Edge bundle can keep calling
// the untouched 0095 RPC after a rollback. The remote contract proves the
// new RPC derives identity, preserves rate-limit ordering and exposes only an
// authenticated envelope with coarse non-negative database timings.
export function systemSnapshotSubphaseTimingSemanticSql(alias) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) fail("system-snapshot-subphase-timing-alias");
  const timed = "public.cms_get_system_snapshot_authenticated_timed(text,text,uuid)";
  const authenticated = "public.cms_get_system_snapshot_authenticated(text,text,uuid)";
  const limited =
    "public.cms_get_system_snapshot_limited(uuid,text,text,text,text,timestamp with time zone,uuid,text)";
  const core = "public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)";
  const definition = `regexp_replace(lower(pg_get_functiondef(to_regprocedure('${timed}'))), '[[:space:]]+', '', 'g')`;
  const consumeCall = "public.consume_rate_limit(";
  const snapshotCall = "v_snapshot:=public.cms_get_system_snapshot(";
  return `coalesce(
      to_regprocedure('${timed}') is not null
      and (
        select procedure.prosecdef and procedure.provolatile = 'v'
          and 'search_path=pg_catalog, public, private, extensions, auth, pg_temp'
            = any(coalesce(procedure.proconfig, array[]::text[]))
        from pg_catalog.pg_proc procedure
        where procedure.oid = to_regprocedure('${timed}')
      )
      and pg_get_function_identity_arguments(to_regprocedure('${timed}'))
        = 'p_environment text, p_site_key text, p_correlation_id uuid'
      and ${definition} like '%v_actor_iduuid:=auth.uid()%'
      and ${definition} like '%v_session_idtext:=auth.jwt()->>''session_id''%'
      and ${definition} like '%v_issued_rawtext:=auth.jwt()->>''iat''%'
      and ${definition} like '%extensions.digest(convert_to(v_actor_id::text,''utf8''),''sha256'')%'
      and ${definition} like '%public.consume_rate_limit(v_rate_limit_key_hash,''cms_system_snapshot'',120,900)%'
      and (
        length(${definition}) - length(replace(${definition}, '${consumeCall}', ''))
      ) / length('${consumeCall}') = 1
      and (
        length(${definition}) - length(replace(${definition}, '${snapshotCall}', ''))
      ) / length('${snapshotCall}') = 1
      and position('${consumeCall}' in ${definition})
        < position('${snapshotCall}' in ${definition})
      and ${definition} like '%v_rate_limit_msbigint%'
      and ${definition} like '%v_snapshot_core_msbigint%'
      and ${definition} like '%greatest(0::bigint,round(extract(epochfromclock_timestamp()-%'
      and ${definition} like '%''schemaversion'',1%'
      and ${definition} like '%''snapshot'',v_snapshot%'
      and ${definition} like '%''ratelimitms'',v_rate_limit_ms%'
      and ${definition} like '%''snapshotcorems'',v_snapshot_core_ms%'
      and has_function_privilege('authenticated','${timed}','EXECUTE')
      and not has_function_privilege('anon','${timed}','EXECUTE')
      and not has_function_privilege('service_role','${timed}','EXECUTE')
      and not exists (
        select 1
        from pg_catalog.pg_proc procedure
        cross join lateral pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) acl
        where procedure.oid = to_regprocedure('${timed}')
          and not (
            acl.grantee = procedure.proowner
            or (
              acl.grantee = (
                select role.oid from pg_catalog.pg_roles role where role.rolname = 'authenticated'
              )
              and acl.grantor = procedure.proowner
              and acl.privilege_type = 'EXECUTE'
              and not acl.is_grantable
            )
          )
      )
      and has_function_privilege('authenticated','${authenticated}','EXECUTE')
      and not has_function_privilege('anon','${authenticated}','EXECUTE')
      and not has_function_privilege('service_role','${authenticated}','EXECUTE')
      and has_function_privilege('service_role','${limited}','EXECUTE')
      and not has_function_privilege('authenticated','${limited}','EXECUTE')
      and not has_function_privilege('anon','${limited}','EXECUTE')
      and has_function_privilege('service_role','${core}','EXECUTE')
      and not has_function_privilege('authenticated','${core}','EXECUTE')
      and not has_function_privilege('anon','${core}','EXECUTE')
    , false) as ${alias}`;
}
