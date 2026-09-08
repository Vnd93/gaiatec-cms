import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CmsContentPayloadSchema } from "../../src/shared/contracts/cms-content.ts";
import {
  bindUiCreatedStateToFixture,
  buildRouteDefinitions,
  capabilityManifestReady,
  resolveTarget,
  validateFixtureState,
} from "./cms-browser-fixture.mjs";

const source = readFileSync(new URL("./cms-browser-fixture.mjs", import.meta.url), "utf8");
const finalCoverageSource = readFileSync(
  new URL("../../tests/e2e/cms-final-coverage.spec.ts", import.meta.url),
  "utf8",
);
const watchdogMigration = readFileSync(
  new URL("../../supabase/migrations/0061_cms_qa_actor_lease_watchdog.sql", import.meta.url),
  "utf8",
);
const stagingWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-staging.yml", import.meta.url),
  "utf8",
);
const productionWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);
const sha = "a".repeat(40);
const runTag = "QA-CMS-FINAL-20260907-aaaaaaaa";
const featureKeys = [
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
  "ev2.system_assurance",
];

test("the staging and production targets are exact and production is literally SHA-authorized", () => {
  assert.deepEqual(resolveTarget("staging", sha), {
    environment: "staging",
    ref: "glcqsosxwgmlhzgcsnzv",
    name: "GAIATEC CMS Staging",
    region: "us-east-2",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  });
  assert.throws(() => resolveTarget("production", sha), /QA_CMS_FIXTURE_PRODUCTION_AUTHORIZATION_REQUIRED/);
  assert.throws(
    () => resolveTarget("production", sha, `AUTORIZO-G12-PRODUCAO:${"b".repeat(40)}`),
    /QA_CMS_FIXTURE_PRODUCTION_AUTHORIZATION_REQUIRED/,
  );
  assert.deepEqual(resolveTarget("production", sha, `AUTORIZO-G12-PRODUCAO:${sha}`), {
    environment: "production",
    ref: "chfuhctnhqgyjowkvllv",
    name: "GAIATEC CMS Production",
    origin: "https://gaiatecsistemas.com.br",
  });
  assert.throws(() => resolveTarget("local", sha), /QA_CMS_FIXTURE_ENVIRONMENT_INVALID/);
  assert.throws(() => resolveTarget("staging", "short"), /QA_CMS_FIXTURE_SHA_INVALID/);
});

test("all eight route payloads satisfy the real strict CMS content contract", () => {
  const definitions = buildRouteDefinitions(runTag, "deadbeef");
  assert.equal(definitions.length, 8);
  assert.deepEqual(
    definitions.map(({ contentType }) => contentType),
    ["post", "product", "service", "industry", "application", "solution", "page", "campaign"],
  );
  assert.equal(new Set(definitions.map(({ slug }) => slug)).size, 8);
  for (const definition of definitions) {
    assert.equal(CmsContentPayloadSchema.parse(definition.payload).contentType, definition.contentType);
    assert.equal(definition.payload.seo.indexable, false);
    const keys = Object.keys(definition.payload.blocks[0]).sort();
    if (["page", "campaign"].includes(definition.contentType))
      assert.deepEqual(keys, ["data", "hidden", "id", "tone", "type", "width"]);
    else assert.deepEqual(keys, ["data", "id", "type"]);
  }
});

test("the capability gate requires a complete ready override manifest", () => {
  const evaluatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    status: "ready",
    environment: "production",
    siteKey: "main",
    evaluatedAt,
    capabilities: Object.fromEntries(
      featureKeys.map((key) => [
        key,
        { schemaVersion: 1, key, enabled: true, source: "override", evaluatedAt },
      ]),
    ),
  };
  assert.equal(capabilityManifestReady(manifest, "production"), true);
  assert.equal(capabilityManifestReady({ ...manifest, status: "unavailable" }, "production"), false);
  manifest.capabilities[featureKeys[0]].enabled = false;
  assert.equal(capabilityManifestReady(manifest, "production"), false);
});

test("actor-only fixture state is bound to environment, project, SHA and synthetic lease", () => {
  const state = {
    schemaVersion: 1,
    environment: "staging",
    projectRef: "glcqsosxwgmlhzgcsnzv",
    expectedSha: sha,
    runTag,
    status: "ready",
    setupAudited: true,
    authLifecycleEnabled: false,
    actorId: "10000000-0000-4000-8000-000000000001",
    managedActorId: "10000000-0000-4000-8000-000000000002",
    existingIdentityActorId: "10000000-0000-4000-8000-000000000007",
    recoveryActorId: null,
    invitedActorId: null,
    leadId: null,
    leadOutboxId: null,
    leadFormId: null,
    leadCampaignId: null,
    leadReference: null,
    leadStatus: null,
    leadCampaignPath: null,
    itemIds: [],
    terminalArchivedTombstone: null,
    documentIds: [],
  };
  assert.equal(validateFixtureState(state, "staging", state.projectRef, sha), state);
  assert.throws(
    () => validateFixtureState({ ...state, environment: "production" }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  const uiRegistered = {
    ...state,
    leadFormId: "10000000-0000-4000-8000-000000000005",
    leadCampaignId: "10000000-0000-4000-8000-000000000006",
    leadReference: "LD-QATEST",
    leadStatus: "responded",
    leadCampaignPath: "/campanhas/qa-lead-qa-cms-final-20260907-aaaaaaaa-deadbeef",
    itemIds: Array.from(
      { length: 8 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ),
  };
  assert.equal(validateFixtureState(uiRegistered, "staging", state.projectRef, sha), uiRegistered);
  const uiState = {
    schemaVersion: 1,
    status: "ready",
    environment: "staging",
    candidateSha: sha,
    runTag,
    lease: {
      actorId: state.actorId,
      source: "cms-browser-fixture",
      resourceIdsCaptured: true,
    },
    ids: {
      contentId: "20000000-0000-4000-8000-000000000001",
      productId: "20000000-0000-4000-8000-000000000002",
      serviceId: "20000000-0000-4000-8000-000000000003",
      industryId: "20000000-0000-4000-8000-000000000004",
      applicationId: "20000000-0000-4000-8000-000000000005",
      solutionId: "20000000-0000-4000-8000-000000000006",
      pageId: "20000000-0000-4000-8000-000000000007",
      campaignId: "20000000-0000-4000-8000-000000000008",
    },
    form: {
      id: "10000000-0000-4000-8000-000000000005",
      versionId: "10000000-0000-4000-8000-000000000006",
      key: `qa-ops-${runTag.toLowerCase()}-deadbeef`,
      status: "published",
    },
    lead: {
      reference: "LD-QATEST",
      status: "responded",
      campaignPath: `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`,
    },
  };
  const bound = bindUiCreatedStateToFixture(state, uiState, "staging", sha);
  assert.deepEqual(bound.itemIds, Object.values(uiState.ids));
  assert.equal(bound.leadFormId, uiState.form.id);
  assert.equal(bound.leadCampaignId, uiState.ids.campaignId);
  assert.equal(bound.leadStatus, "responded");
  assert.deepEqual(bound.terminalArchivedTombstone, { itemId: uiState.ids.pageId });
  assert.throws(
    () =>
      validateFixtureState(
        {
          ...bound,
          terminalArchivedTombstone: {
            itemId: uiState.ids.pageId,
            path: "/qa-cms-final-gone-aaaaaaaa",
          },
        },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () =>
      bindUiCreatedStateToFixture(
        state,
        { ...uiState, lease: { ...uiState.lease, actorId: state.managedActorId } },
        "staging",
        sha,
      ),
    /QA_CMS_FIXTURE_UI_STATE_REFUSED/,
  );
  assert.throws(
    () => validateFixtureState({ ...uiRegistered, leadReference: null }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () => validateFixtureState({ ...state, existingIdentityActorId: null }, "staging", state.projectRef, sha),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.throws(
    () =>
      validateFixtureState(
        {
          ...state,
          authLifecycleEnabled: true,
          recoveryActorId: null,
          invitedActorId: null,
        },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
  assert.equal(
    validateFixtureState(
      {
        ...state,
        authLifecycleEnabled: true,
        recoveryActorId: "10000000-0000-4000-8000-000000000008",
        invitedActorId: "10000000-0000-4000-8000-000000000009",
      },
      "staging",
      state.projectRef,
      sha,
    ).authLifecycleEnabled,
    true,
  );
  assert.throws(
    () =>
      validateFixtureState(
        { ...state, itemIds: ["20000000-0000-4000-8000-000000000002", "not-a-uuid"] },
        "staging",
        state.projectRef,
        sha,
      ),
    /QA_CMS_FIXTURE_STATE_REFUSED/,
  );
});

test("the executable stays fail-closed and leaves no active synthetic surface", () => {
  assert.match(source, /validateRuntime\(\);\s*context = await loadContext\(\)/);
  assert.match(source, /project\.name !== target\.name/);
  assert.match(source, /projects", "api-keys", "--project-ref", target\.ref, "--reveal"/);
  assert.match(source, /health\?\.environment !== target\.environment/);
  assert.match(source, /health\?\.release !== expectedSha/);
  assert.match(source, /response\.headers\.get\("x-release"\) !== expectedSha/);
  assert.match(source, /QA_ACTOR_LEASE_TTL_MINUTES \* 60_000/);
  assert.match(source, /environment: target\.environment,\s*scope_type: "user"/);
  assert.match(source, /await assertReadySession\(actor\.token\)/);
  assert.match(source, /await assertReadySession\(managedActor\.token\)/);
  assert.match(source, /auth\.mfa\.enroll/);
  assert.match(source, /auth\.mfa\.challenge/);
  assert.match(source, /auth\.mfa\.verify/);
  assert.match(
    source,
    /createActor\(runTag, \(actorId\) => \{\s*state\.actorId = actorId;\s*writeState\(state\)/,
  );
  assert.match(source, /actorKind: "reviewer", initialRole: "editor"/);
  assert.match(source, /actorKind: "existing_identity"/);
  assert.match(source, /actorKind: "recovery"/);
  assert.match(source, /actorKind: "invitee"/);
  assert.match(source, /initialRole: null/);
  assert.match(source, /provisionCms: false/);
  assert.match(source, /rdoRole: "rdo_member"/);
  assert.match(source, /QA_CMS_FIXTURE_AUTH_ONLY_BOUNDARY_FAILED/);
  assert.match(source, /auth\.admin\.generateLink\(\{\s*type: "recovery"/);
  assert.match(source, /auth\.admin\.generateLink\(\{\s*type: "invite"/);
  assert.match(source, /delivery: "generate_link_no_email"/);
  assert.match(source, /user\.user_metadata\?\.synthetic !== true/);
  assert.match(source, /user\.user_metadata\?\.runTag !== state\.runTag/);
  assert.match(source, /user\.user_metadata\?\.environment !== target\.environment/);
  assert.match(source, /user\.user_metadata\?\.candidateSha !== expectedSha/);
  assert.match(
    source,
    /onCreated\(actorId\);\s*const lease = await assertActorLease\(actorId, runTag, "active"\);\s*if \(provisionCms\)/,
  );
  assert.match(source, /cms_qa_actor_lease_status/);
  assert.match(source, /cms_complete_qa_actor_lease/);
  assert.match(source, /createScopedRoleAssignments/);
  assert.match(source, /roleKey: "super_admin"/);
  assert.match(source, /roleKey: "editor"/);
  assert.match(source, /grant_type: "direct"/);
  assert.match(source, /granted_by: operatorId/);
  const scopedRoleSetup = source.indexOf("const scopedRoleAssignments = await createScopedRoleAssignments(");
  const scopedFlagActivation = source.indexOf("const featureFlags =", scopedRoleSetup);
  assert.ok(scopedRoleSetup >= 0 && scopedRoleSetup < scopedFlagActivation);
  assert.match(
    source,
    /assertActorLease\(operatorId, runTag, "active"\)[\s\S]*assertActorLease\(reviewerId, runTag, "active"\)[\s\S]*from\("cms_scoped_role_assignments"\)/,
  );
  assert.match(source, /automaticExpiryCleanup: true/);
  assert.match(source, /neutralizeSyntheticDocuments/);
  assert.match(source, /cms_fixture_neutralize_synthetic_document/);
  assert.match(source, /p_blob_removed: false/);
  assert.match(source, /p_blob_removed: true/);
  const documentPrepare = source.indexOf("p_blob_removed: false");
  const documentRemoveMatch = /\.remove\(\s*\[document\.storage_path\]\s*\)/.exec(
    source.slice(documentPrepare),
  );
  const documentRemove = documentRemoveMatch ? documentPrepare + documentRemoveMatch.index : -1;
  const documentConfirm = source.indexOf("p_blob_removed: true", documentRemove);
  assert.ok(documentPrepare >= 0 && documentPrepare < documentRemove);
  assert.ok(documentRemove < documentConfirm);
  assert.match(source, /QA_CMS_FIXTURE_DOCUMENT_BLOB_RESIDUE/);
  assert.match(source, /QA_CMS_FIXTURE_DOCUMENT_BLOB_VERIFICATION_FAILED/);
  assert.match(source, /activeDocuments/);
  assert.match(source, /workflow_status: "archived"/);
  assert.match(source, /from\("cms_route_rules"\)\s*\.update\(\{ active: false \}\)/);
  assert.match(
    source,
    /function terminalGonePath\(\)[\s\S]*`\/qa-cms-final-gone-\$\{expectedSha\.slice\(0, 8\)\}`/,
  );
  assert.match(source, /terminalArchivedTombstone: \{ itemId: ids\.pageId \}/);
  assert.doesNotMatch(source, /terminalArchivedTombstone:\s*\{[^}]*path/s);
  assert.match(source, /payload\?\.title !== `\$\{state\.runTag\} gone`/);
  assert.match(source, /payload\?\.summary !== "Página sintética para validar retirada gone\."/);
  assert.match(source, /status_code: 410, destination_path: null/);
  assert.match(source, /QA_CMS_FIXTURE_PUBLICATION_OUTBOX_TERMINALIZATION_FAILED/);
  assert.match(source, /\.in\("status", \["pending", "processing", "failed"\]\)/);
  assert.match(source, /actionablePublicationOutbox/);
  assert.match(source, /terminalArchivedTombstoneEvidence/);
  assert.match(
    source,
    /classification: "terminalNoSyntheticRoute",\s*count: 0,\s*activeRouteRules: 0,\s*identifiersOrPathsPersisted: false/,
  );
  assert.match(
    finalCoverageSource,
    /const slug = `qa-cms-final-gone-\$\{auth\.expectedSha\.slice\(0, 8\)\}`/,
  );
  assert.match(finalCoverageSource, /const revisionOneTitle = `\$\{runTag\} gone`/);
  assert.match(finalCoverageSource, /summary: "Página sintética para validar retirada gone\."/);
  assert.match(source, /from\("cms_publication_outbox"\)\.upsert/);
  assert.match(source, /from\("cms_publications"\)\.delete\(\)/);
  assert.match(source, /from\("cms_published_projection"\)\s*\.delete\(\)/);
  assert.match(source, /from\("cms_scoped_role_assignments"\)/);
  assert.match(
    source,
    /from\("cms_scoped_role_assignments"\)[\s\S]*\.eq\("site_key", "main"\)[\s\S]*\.eq\("environment", state\.environment\)[\s\S]*\.eq\("lock_version", assignment\.lock_version\)/,
  );
  assert.match(source, /from\("cms_user_roles"\)\.delete\(\)/);
  assert.match(source, /from\("rdo_user_access"\)/);
  assert.match(source, /delete from auth\.sessions where user_id/);
  assert.match(source, /sessions_valid_after: now/);
  assert.match(source, /ban_duration: "876000h"/);
  assert.match(source, /from\("cms_lead_outbox"\)/);
  assert.match(source, /from\("cms_ai_execution_approvals"\)/);
  assert.match(source, /status: "retired", active_version_id: null/);
  assert.match(source, /cms:qa\.fixture_setup/);
  assert.match(source, /cms:qa\.fixture_cleanup/);
  assert.match(source, /credentialsInStateOrReport: false/);
  assert.match(source, /\["setup", "cleanup", "residue"\]\.includes\(mode\)/);
  assert.match(source, /state\.status !== "cleaned"/);
  assert.match(
    source,
    /const activeLeases = leases\.filter\(\(lease\) => lease\.status !== "cleaned"\)\.length/,
  );
  assert.match(source, /QA_CMS_FIXTURE_RESIDUE_PRESENT/);
  assert.match(source, /QA_CMS_SUPABASE_ANON_KEY", value: context\.anonKey, secret: true/);
  assert.match(source, /QA_CMS_REVIEWER_PASSWORD", value: managedActor\.password, secret: true/);
  assert.match(source, /QA_CMS_RECOVERY_ACTION_LINK/);
  assert.match(source, /QA_CMS_INVITEE_ACTION_LINK/);
  assert.match(source, /actionLinksPersisted: false/);
  assert.match(source, /externalEmailSentByFixture: false/);
  assert.match(
    source,
    /QA_CMS_EXISTING_IDENTITY_PASSWORD", value: existingIdentityActor\.password, secret: true/,
  );
  assert.match(
    source,
    /QA_CMS_EXISTING_IDENTITY_TOTP_SECRET", value: existingIdentityActor\.secret, secret: true/,
  );
  assert.match(source, /existingIdentityRevokedAndBanned/);
  assert.match(source, /rdoAccessInactive/);
  assert.match(source, /fixtureProvisioning: "actors-and-prerequisites-only"/);
  assert.match(source, /editorialEntitiesCreatedByFixture: 0/);
  const setupSource = source.slice(
    source.indexOf("async function setup()"),
    source.indexOf("async function cleanup()"),
  );
  assert.doesNotMatch(setupSource, /createRouteFixtures|createOperationalFixtures|cms_capture_lead_scoped/);
  assert.doesNotMatch(setupSource, /QA_CMS_SYNTHETIC_IDS|QA_CMS_LEAD_REFERENCE|QA_CMS_LEAD_STATUS/);
  assert.match(setupSource, /QA_CMS_UI_CREATED_STATE_PATH/);
  assert.match(source, /productionMutations: productionMutationSummary/);
  assert.match(source, /path\.resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)/);
});

test("the database watchdog atomically leases and revokes only exact synthetic actors", () => {
  assert.match(watchdogMigration, /after insert on auth\.users/);
  assert.match(watchdogMigration, /before update of raw_user_meta_data on auth\.users/);
  assert.match(watchdogMigration, /'CMS_QA_ACTOR_MARKER_IMMUTABLE'/);
  assert.match(watchdogMigration, /v_created_at \+ interval '119 minutes'/);
  assert.match(watchdogMigration, /expires_at <= created_at \+ interval '120 minutes'/);
  assert.match(watchdogMigration, /cms_qa_override_window_is_valid/);
  assert.match(watchdogMigration, /evaluator_count <> 4/);
  assert.match(watchdogMigration, /CMS_QA_OVERRIDE_EVALUATOR_DRIFT/);
  assert.match(watchdogMigration, /CMS_QA_OVERRIDE_MANIFEST_DRIFT/);
  assert.match(
    watchdogMigration,
    /length\(original_definition\) - length\(replace\([\s\S]*?evaluator_old_fragment[\s\S]*?<> length\(evaluator_old_fragment\)/,
  );
  assert.match(watchdogMigration, /actor\.raw_user_meta_data -> 'synthetic' = 'true'::jsonb/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'purpose' = 'qa-cms-browser'/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'runTag' = p_run_tag/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'candidateSha' = p_candidate_sha/);
  assert.match(watchdogMigration, /actor\.raw_user_meta_data ->> 'environment' = p_environment/);
  assert.match(watchdogMigration, /where created_by = v_lease\.actor_id and workflow_status <> 'archived'/);
  assert.match(watchdogMigration, /delete from public\.cms_feature_flag_overrides/);
  assert.match(watchdogMigration, /processing_status = 'neutralized'/);
  assert.match(watchdogMigration, /blob_disposition = case/);
  assert.match(watchdogMigration, /'neutralizedDocuments', v_documents/);
  assert.match(watchdogMigration, /delete from public\.cms_user_roles/);
  assert.match(watchdogMigration, /form\.form_key like \('qa-ops-' \|\| lower\(v_lease\.run_tag\)/);
  assert.match(watchdogMigration, /update public\.cms_leads lead[\s\S]*status = 'anonymized'/);
  assert.match(watchdogMigration, /update public\.cms_lead_outbox outbox[\s\S]*status = 'completed'/);
  assert.match(watchdogMigration, /update public\.cms_form_definitions form[\s\S]*status = 'retired'/);
  assert.match(watchdogMigration, /update public\.cms_ai_sessions session[\s\S]*status = 'closed'/);
  assert.match(
    watchdogMigration,
    /update public\.cms_ai_synthetic_targets target[\s\S]*lifecycle = 'retired'/,
  );
  assert.match(
    watchdogMigration,
    /update public\.cms_ai_execution_approvals approval[\s\S]*status = 'expired'/,
  );
  assert.match(watchdogMigration, /insert into public\.cms_publication_outbox/);
  assert.match(watchdogMigration, /delete from public\.cms_publications/);
  assert.match(watchdogMigration, /delete from public\.cms_published_projection/);
  assert.match(watchdogMigration, /update public\.cms_scoped_role_assignments/);
  assert.match(watchdogMigration, /delete from auth\.sessions/);
  assert.match(watchdogMigration, /set banned_until = greatest/);
  assert.match(watchdogMigration, /'cms:qa\.fixture_expired_cleanup'/);
  assert.doesNotMatch(watchdogMigration, /delete from public\.cms_audit_log/);
  assert.match(
    watchdogMigration,
    /where lease\.status = 'active' and lease\.expires_at <= clock_timestamp\(\)/,
  );
  assert.match(watchdogMigration, /for update skip locked/);
  assert.match(
    watchdogMigration,
    /if exists \([\s\S]*select 1 from public\.cms_content_items[\s\S]*select 1 from public\.cms_published_projection[\s\S]*raise exception 'CMS_QA_ACTOR_CLEANUP_INCOMPLETE'/,
  );
  assert.match(watchdogMigration, /where jobname = 'cms-qa-actor-lease-sweeper-every-1m'/);
  assert.match(watchdogMigration, /'\* \* \* \* \*'/);
  assert.match(
    watchdogMigration,
    /revoke all on function private\.cms_sweep_expired_qa_actor_leases\(integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    watchdogMigration,
    /(?:@example\.invalid|password_hash|totp_secret|access_token|refresh_token)/i,
  );
});

test("the exact QA lease outlives each single-run authenticated lifecycle budget", () => {
  const leaseMinutes = Number(
    watchdogMigration.match(/v_created_at \+ interval '(\d+) minutes'/)?.[1] ?? "0",
  );
  for (const [name, workflow, setupId, cleanupId] of [
    ["staging", stagingWorkflow, "browser_mutating_fixture", "browser_mutating_cleanup"],
    ["production", productionWorkflow, "production_browser_fixture", "production_browser_cleanup"],
  ]) {
    const setupMarker = workflow.indexOf(`id: ${setupId}`);
    const cleanupMarker = workflow.indexOf(`id: ${cleanupId}`, setupMarker);
    assert.ok(setupMarker >= 0 && cleanupMarker > setupMarker, `${name} lifecycle markers are required`);
    const start = workflow.lastIndexOf("\n      - name:", setupMarker);
    const end = workflow.lastIndexOf("\n      - name:", cleanupMarker);
    const lifecycle = workflow.slice(start, end);
    const steps = [...lifecycle.matchAll(/^\s+- name:/gm)].length;
    const timeouts = [...lifecycle.matchAll(/^\s+timeout-minutes:\s*(\d+)\s*$/gm)].map((match) =>
      Number(match[1]),
    );
    assert.equal(
      timeouts.length,
      steps,
      `${name} every step between fixture setup and cleanup must have an explicit timeout`,
    );
    assert.equal(
      (lifecycle.match(/cms-browser-fixture\.mjs setup/g) ?? []).length,
      1,
      `${name} must use one immutable fixture/runTag`,
    );
    assert.match(lifecycle, /--grep @ui-bootstrap/);
    assert.match(lifecycle, /--grep @semantic/);
    const budget = timeouts.reduce((total, timeout) => total + timeout, 0);
    assert.ok(budget <= 115, `${name} setup-to-cleanup budget must be at most 115 minutes`);
    assert.ok(budget < leaseMinutes, `${name} lease must outlive the complete pre-cleanup budget`);
  }
  assert.doesNotMatch(stagingWorkflow, /id: browser_routes_fixture/);
});
