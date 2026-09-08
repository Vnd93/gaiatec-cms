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
  const resolveScopedAccess = "public.cms_resolve_scoped_access(uuid,text,text,text,text,timestamptz)";
  return `pg_get_functiondef(to_regprocedure('${applyCommand}'))
      like '%from public.cms_login_events event%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%from auth.sessions auth_session%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%extensions.digest(auth_session.id::text,''sha256'')%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%p_action in (''revoke_sessions'',''suspend'',''reactivate'')%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%insert into public.cms_session_revocations%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%''admin_command''%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        like '%coalesce((v_result->>''duplicate'')::boolean,false) is false%'
      and strpos(
        pg_get_functiondef(to_regprocedure('${applyCommand}')),
        'coalesce((v_result->>''duplicate'')::boolean,false) is false'
      ) < strpos(
        pg_get_functiondef(to_regprocedure('${applyCommand}')),
        'insert into public.cms_session_revocations'
      )
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        not like '%insert into auth.%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        not like '%update auth.%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        not like '%delete from auth.%'
      and pg_get_functiondef(to_regprocedure('${applyCommand}'))
        not like '%rdo_%'
      and pg_get_functiondef(to_regprocedure('${resolveSession}'))
        like '%permission.critical%'
      and pg_get_functiondef(to_regprocedure('${resolveSession}'))
        like '%p_event_type=''logout''%'
      and pg_get_functiondef(to_regprocedure('${resolveSession}'))
        like '%''self_logout''%'
      and pg_get_functiondef(to_regprocedure('${resolveScopedAccess}'))
        like '%permission.critical%'
      as ${alias}`;
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
