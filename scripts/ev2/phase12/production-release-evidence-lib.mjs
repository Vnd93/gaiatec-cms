import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { assertCmsTerminalCoverage } from "../../qa/materialize-cms-terminal-coverage.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const REQUIRED_AUTH_LIFECYCLE_SCENARIOS = [
  "real_recovery_link_password_and_mfa",
  "recovery_account_enumeration_resistance",
  "new_auth_identity_invite_activation_and_mfa",
  "silent_session_refresh_real_backend",
  "single_use_action_links",
  "auth_profile_and_immutable_audit_persistence",
  "effective_cms_session_revocation",
  "expired_session_rejected_refresh",
  "mfa_cancel_signout",
];
const REQUIRED_AUTH_SURFACES = ["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"];
const REQUIRED_AUTH_VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const REQUIRED_AUTH_SEMANTIC_EXECUTIONS = [
  "auth-login.sign-in",
  "auth-login.forgot-password",
  "auth-recovery.request-link",
  "auth-recovery.back-to-login",
  "auth-set-password.save-password",
  "auth-mfa.verify",
  "auth-mfa.configure-authenticator",
  "auth-mfa.cancel-and-sign-out",
];

export const PRODUCTION_RELEASE_EVIDENCE_PATHS = [
  "candidate/dist/release-manifest.json",
  "candidate/outputs/cms-browser-production-setup.json",
  "candidate/outputs/cms-browser-production-cleanup.json",
  "candidate/outputs/cms-auth-lifecycle-production.json",
  "candidate/outputs/cms-coverage-production.json",
  "candidate/outputs/cms-production-operator-provisioning.json",
  "candidate/outputs/cms-production-postdeploy-smoke.json",
  "candidate/outputs/cms-production-readonly-preflight.json",
  "candidate/outputs/cms-final-coverage-production.json",
  "candidate/outputs/cms-admin-ops-cycles-production.json",
  "candidate/outputs/cms-secondary-ui-cycles-production.json",
  "candidate/outputs/cms-security-boundaries-production.json",
  "candidate/outputs/cms-terminal-coverage-matrix-production.json",
  "candidate/outputs/g12-backend-compatibility.json",
  "candidate/outputs/g12-production-dist-seal.json",
  "candidate/outputs/g12-production-function-deployment.json",
  "candidate/outputs/production-backend-evidence/manifest.json",
  "candidate/outputs/production-backend-evidence/functions.json",
  "candidate/outputs/production-backend-evidence/database.json",
  "g12-preflight-technical.json",
  "g12-preflight-probe.json",
  "g12-production-auth.json",
  "g12-production-backend.json",
  "g12-production-backup-verification.json",
  "g12-production-baseline-forward-backend.json",
  "g12-production-boundary.json",
  "g12-production-edge-secrets.json",
  "g12-production-functions.json",
  "g12-production-outbox-canary.json",
  "g12-production-probe.json",
  "g12-production-residue.json",
  "g12-production-vault.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const SENSITIVE_KEY_SUFFIX =
  /(?:email|password|token|secret|cookie|apikey|privatekey|authorization|actionlink)$/;
const SAFE_SENSITIVE_KEY_SUFFIX =
  /(?:sha256|digest|hash|kind|status|count|persisted|exposed|disclosed|verified|required|enabled|disabled|attempted|only|mode|policy|scope|reference|text)$/;
const EMAIL_VALUE =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i;
const JWT_VALUE = /(?:^|\s|["'=])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:$|\s|["'])/;
const SECRET_PREFIX_VALUE = /(?:^|\s|["'=])(?:sk-(?:or-v1-)?|sb_secret_|sbp_)[A-Za-z0-9_-]{12,}/i;
const BEARER_VALUE = /\bbearer\s+[A-Za-z0-9._~-]{12,}/i;
const SENSITIVE_URL_QUERY =
  /[?&](?:access_token|refresh_token|token|token_hash|code|password|secret|email)=/i;

function normalizedEvidenceKey(key) {
  return String(key)
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function sensitiveEvidenceViolations(payload) {
  const violations = new Set();
  const visit = (value, key = "", depth = 0) => {
    if (depth > 100) {
      violations.add("evidence_depth_invalid");
      return;
    }
    const normalizedKey = normalizedEvidenceKey(key);
    if (
      typeof value === "string" &&
      value.length > 0 &&
      SENSITIVE_KEY_SUFFIX.test(normalizedKey) &&
      !SAFE_SENSITIVE_KEY_SUFFIX.test(normalizedKey)
    ) {
      violations.add("sensitive_key_present");
    }
    if (typeof value === "string") {
      if (EMAIL_VALUE.test(value)) violations.add("email_value_present");
      if (JWT_VALUE.test(value)) violations.add("jwt_value_present");
      if (SECRET_PREFIX_VALUE.test(value)) violations.add("secret_prefix_present");
      if (BEARER_VALUE.test(value)) violations.add("bearer_value_present");
      if (SENSITIVE_URL_QUERY.test(value)) violations.add("sensitive_url_query_present");
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey, depth + 1));
    }
  };
  visit(payload);
  return [...violations];
}

function semanticViolations(path, payload, binding) {
  if (!binding) return [];
  const violations = [];
  const candidateSha = binding.candidateSha;
  const expect = (condition, label) => {
    if (!condition) violations.push(label);
  };
  const expectBoundRunTag = (value, label) => {
    expect(
      typeof value === "string" &&
        /^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(value) &&
        value.endsWith(`-${candidateSha.slice(0, 8)}`),
      `${label}_run_tag_invalid`,
    );
  };
  const expectSealedPreviewRouting = (label) => {
    const routing = payload?.sealedPreviewRouting;
    expect(routing?.enabled === true, `${label}_sealed_preview_not_enabled`);
    expect(
      routing?.canonicalOrigin === "https://gaiatecsistemas.com.br",
      `${label}_canonical_origin_invalid`,
    );
    expect(
      /^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(routing?.previewOrigin ?? ""),
      `${label}_preview_origin_invalid`,
    );
    expect(routing?.candidateSha === candidateSha, `${label}_sealed_preview_candidate_mismatch`);
    expect(
      Number.isInteger(routing?.installedContexts) && routing.installedContexts > 0,
      `${label}_contexts_missing`,
    );
    expect(
      Number.isInteger(routing?.mappedRequests) && routing.mappedRequests > 0,
      `${label}_requests_missing`,
    );
    expect(
      Number.isInteger(routing?.mappedGetRequests) &&
        routing.mappedGetRequests >= 0 &&
        Number.isInteger(routing?.mappedHeadRequests) &&
        routing.mappedHeadRequests >= 0 &&
        routing.mappedGetRequests + routing.mappedHeadRequests === routing.mappedRequests,
      `${label}_request_accounting_invalid`,
    );
    expect(
      routing?.releaseVerifiedResponses === routing?.mappedRequests,
      `${label}_release_responses_incomplete`,
    );
    expect(routing?.rejectedRedirects === 0, `${label}_redirect_refused`);
    expect(routing?.mappingFailures === 0, `${label}_mapping_failed`);
    expect(
      routing?.cachePolicy === "routing-disabled-http-cache-and-no-store" &&
        routing?.serviceWorkers === "blocked-by-context-contract",
      `${label}_cache_or_worker_policy_invalid`,
    );
  };
  const expectTerminalArchivedTombstone = (value, label) => {
    const expectedKeys = [
      "actionableOutboxCount",
      "classification",
      "count",
      "destinationAbsent",
      "itemArchived",
      "piiExposed",
      "projectionCount",
      "publicationCount",
      "statusCode",
    ];
    expect(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expectedKeys) &&
        value?.classification === "terminalArchivedTombstone" &&
        value?.count === 1 &&
        value?.statusCode === 410 &&
        value?.destinationAbsent === true &&
        value?.itemArchived === true &&
        value?.publicationCount === 0 &&
        value?.projectionCount === 0 &&
        value?.actionableOutboxCount === 0 &&
        value?.piiExposed === false,
      `${label}_terminal_archived_tombstone_invalid`,
    );
  };

  if (path === "candidate/dist/release-manifest.json") {
    expect(payload?.schemaVersion === 1, "release_manifest_schema_invalid");
    expect(payload?.release === candidateSha, "release_manifest_candidate_mismatch");
  } else if (path.endsWith("cms-browser-production-setup.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "ready", "browser_setup_not_ready");
    expect(payload?.environment === "production", "browser_setup_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "browser_setup_candidate_mismatch");
    expect(payload?.credentialsInStateOrReport === false, "browser_setup_credentials_persisted");
  } else if (path.endsWith("cms-browser-production-cleanup.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "cleaned", "browser_cleanup_incomplete");
    expect(payload?.environment === "production", "browser_cleanup_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "browser_cleanup_candidate_mismatch");
    expectBoundRunTag(payload?.runTag, "browser_cleanup");
    expect(payload?.activeResidue === 0, "browser_cleanup_residue_present");
    expect(payload?.auditRetained === true, "browser_cleanup_audit_missing");
    expectTerminalArchivedTombstone(payload?.terminalArchivedTombstone, "browser_cleanup");
  } else if (path.endsWith("cms-auth-lifecycle-production.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "passed", "auth_lifecycle_not_passed");
    expect(payload?.environment === "production", "auth_lifecycle_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "auth_lifecycle_candidate_mismatch");
    expect(payload?.credentialsPersisted === false, "auth_lifecycle_credentials_persisted");
    expect(payload?.actionLinksPersisted === false, "auth_lifecycle_links_persisted");
    expect(payload?.rawBrowserArtifacts === "disabled", "auth_lifecycle_raw_artifacts_enabled");
    expect(
      Array.isArray(payload?.scenarios) &&
        payload.scenarios.every((scenario) => scenario?.status === "passed") &&
        REQUIRED_AUTH_LIFECYCLE_SCENARIOS.every((scenarioId) =>
          payload.scenarios.some((scenario) => scenario?.id === scenarioId),
        ),
      "auth_lifecycle_scenarios_incomplete",
    );
    expect(
      payload?.sessionLifecycle?.silentRefresh === "real-auth-refresh-and-aal2-session-resolution" &&
        payload?.sessionLifecycle?.expiration === "expired-local-session-with-server-rejected-refresh" &&
        payload?.sessionLifecycle?.revocation === "cms-session-403-and-ui-access-denied" &&
        payload?.sessionLifecycle?.tokensPersistedInEvidence === false,
      "auth_session_lifecycle_evidence_invalid",
    );
    const authCoverage = payload?.authSurfaceCoverage;
    const coverageEntries = Array.isArray(authCoverage?.entries) ? authCoverage.entries : [];
    const semanticExecutions = Array.isArray(authCoverage?.semanticExecutions)
      ? authCoverage.semanticExecutions
      : [];
    expect(
      authCoverage?.status === "passed" &&
        Array.isArray(authCoverage?.unsupported) &&
        authCoverage.unsupported.length === 0 &&
        Array.isArray(authCoverage?.failures) &&
        authCoverage.failures.length === 0,
      "auth_surface_coverage_not_passed",
    );
    expect(
      Array.isArray(authCoverage?.viewports) &&
        authCoverage.viewports.length === REQUIRED_AUTH_VIEWPORTS.length &&
        REQUIRED_AUTH_VIEWPORTS.every((expectedViewport) =>
          authCoverage.viewports.some(
            (viewport) =>
              viewport?.name === expectedViewport.name &&
              viewport?.width === expectedViewport.width &&
              viewport?.height === expectedViewport.height,
          ),
        ),
      "auth_surface_viewports_incomplete",
    );
    expect(
      REQUIRED_AUTH_SURFACES.every((surfaceId) =>
        REQUIRED_AUTH_VIEWPORTS.every((expectedViewport) =>
          coverageEntries.some(
            (entry) =>
              entry?.surfaceId === surfaceId &&
              entry?.viewport?.name === expectedViewport.name &&
              entry?.viewport?.width === expectedViewport.width &&
              entry?.viewport?.height === expectedViewport.height &&
              entry?.status === "passed" &&
              entry?.horizontalOverflow === false &&
              Number.isInteger(entry?.fieldsSeen) &&
              entry.fieldsSeen === entry.fieldsExercised &&
              Number.isInteger(entry?.actionsSeen) &&
              entry.actionsSeen === entry.actionsActivationChecked &&
              Array.isArray(entry?.unsupported) &&
              entry.unsupported.length === 0 &&
              Array.isArray(entry?.failures) &&
              entry.failures.length === 0,
          ),
        ),
      ),
      "auth_surface_matrix_incomplete",
    );
    expect(
      REQUIRED_AUTH_SEMANTIC_EXECUTIONS.every((requiredId) =>
        semanticExecutions.some(
          (execution) =>
            execution?.id === requiredId &&
            execution?.result === "passed" &&
            (execution?.proof === "real-browser-real-backend" ||
              execution?.proof === "real-browser-navigation") &&
            REQUIRED_AUTH_SURFACES.includes(execution?.surfaceId) &&
            typeof execution?.controlId === "string" &&
            execution.controlId.length > 0 &&
            typeof execution?.scenarioId === "string" &&
            execution.scenarioId.length > 0,
        ),
      ) &&
        coverageEntries.every(
          (entry) =>
            Array.isArray(entry?.actions) &&
            entry.actions.every(
              (action) =>
                action?.activationChecked === true &&
                typeof action?.semanticExecutionRef === "string" &&
                semanticExecutions.some(
                  (execution) =>
                    execution?.id === action.semanticExecutionRef &&
                    execution?.surfaceId === entry.surfaceId &&
                    execution?.controlId === action.controlId &&
                    execution?.result === "passed",
                ),
            ),
        ),
      "auth_semantic_execution_incomplete",
    );
    expect(payload?.cleanup === "awaiting-fixture-teardown-verification", "auth_lifecycle_cleanup_invalid");
    expectSealedPreviewRouting("auth_lifecycle");
  } else if (path.endsWith("cms-coverage-production.json")) {
    expect(payload?.schemaVersion === 1, "coverage_inventory_schema_invalid");
    expect(payload?.sourceSha === candidateSha, "coverage_inventory_candidate_mismatch");
    expect(payload?.sourceDirty === false, "coverage_inventory_source_dirty");
    expect(Array.isArray(payload?.matrix) && payload.matrix.length > 0, "coverage_inventory_matrix_empty");
  } else if (path.endsWith("cms-production-operator-provisioning.json")) {
    expect(
      payload?.schemaVersion === 1 && payload?.event === "cms.production_operator.provisioned",
      "production_operator_schema_invalid",
    );
    expect(payload?.status === "provisioned", "production_operator_not_provisioned");
    expect(payload?.candidateSha === candidateSha, "production_operator_candidate_mismatch");
    expect(payload?.environment === "production", "production_operator_environment_invalid");
    expect(payload?.authorizationKind === "release", "production_operator_authorization_invalid");
    expect(payload?.validityDays === 365, "production_operator_validity_invalid");
    expect(payload?.totpVerified === true, "production_operator_totp_unverified");
    expect(
      payload?.legacySuperAdmin === true && payload?.scopedSuperAdmin === true,
      "production_operator_role_incomplete",
    );
    expect(
      Array.isArray(payload?.enabledFlags) &&
        payload.enabledFlags.length > 0 &&
        !payload.enabledFlags.includes("ev2.multisite") &&
        !payload.enabledFlags.includes("ev2.ai_execute"),
      "production_operator_flag_scope_invalid",
    );
    expect(payload?.containsPii === false, "production_operator_pii_boundary_invalid");
  } else if (path.endsWith("cms-production-readonly-preflight.json")) {
    expect(
      payload?.schemaVersion === 1 && payload?.event === "g12.production.authenticated_readonly_preflight",
      "authenticated_preflight_schema_invalid",
    );
    expect(payload?.candidateSha === candidateSha, "authenticated_preflight_candidate_mismatch");
    expect(
      payload?.sealedFrontendCandidateSha === candidateSha &&
        payload?.preparedBackendCandidateSha === candidateSha &&
        payload?.canonicalFrontendDuringPreflightSha === binding.baselineRelease &&
        payload?.canonicalFrontendDuringPreflightSha !== candidateSha,
      "authenticated_preflight_release_roles_invalid",
    );
    expect(
      payload?.shell === "exact-sealed-cloudflare-preview-mapped-under-production-origin" &&
        payload?.backend === "supabase-production-real",
      "authenticated_preflight_target_invalid",
    );
    expect(
      payload?.credentialsPersisted === false &&
        payload?.tokensPersisted === false &&
        payload?.rawBrowserArtifacts === "disabled",
      "authenticated_preflight_secret_boundary_invalid",
    );
    expect(payload?.cmsMutations === 0, "authenticated_preflight_mutation_detected");
    expect(payload?.policyRequired === true, "authenticated_preflight_policy_bypassed");
    expect(payload?.status === "passed", "authenticated_preflight_not_passed");
    expect(payload?.authAuditWritesOnly === true, "authenticated_preflight_write_scope_invalid");
    expect(payload?.unexpectedMutationCount === 0, "authenticated_preflight_mutation_detected");
    expect(payload?.unexpectedNetworkFailureCount === 0, "authenticated_preflight_network_failure");
    expect(payload?.consoleErrorCount === 0, "authenticated_preflight_console_failure");
    expect(
      Array.isArray(payload?.scenarios) &&
        payload.scenarios.some(
          (scenario) =>
            scenario?.id === "corporate_login_mfa_readonly_exact_sealed_preview" &&
            scenario?.status === "passed" &&
            scenario?.exactReleaseHeader === true &&
            scenario?.activeMfaProfileRead === true &&
            Array.isArray(scenario?.roles) &&
            scenario.roles.length > 0 &&
            scenario.roles.every((role) => /^[a-z][a-z0-9_]{1,63}$/.test(role)) &&
            scenario?.sessionClosed === true,
        ),
      "authenticated_preflight_scenario_incomplete",
    );
  } else if (path.endsWith("cms-production-postdeploy-smoke.json")) {
    expect(
      payload?.schemaVersion === 1 && payload?.event === "g12.production.postdeploy_authenticated_smoke",
      "postdeploy_smoke_schema_invalid",
    );
    expect(payload?.status === "passed", "postdeploy_smoke_not_passed");
    expect(payload?.environment === "production", "postdeploy_smoke_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "postdeploy_smoke_candidate_mismatch");
    expect(payload?.origin === "https://gaiatecsistemas.com.br", "postdeploy_smoke_origin_invalid");
    expect(
      payload?.shell === "canonical-promoted-exact-sealed-artifact" &&
        payload?.backend === "supabase-production-real",
      "postdeploy_smoke_target_invalid",
    );
    expect(payload?.corporateMfaAuthenticated === true, "postdeploy_smoke_mfa_missing");
    expect(
      payload?.authenticatedRoutes >= 3 &&
        payload?.seoChecks >= 13 &&
        payload?.structuredDataVerified === true &&
        payload?.canonicalHttpProbes === 7 &&
        payload?.releaseVerifiedProbes === 7 &&
        payload?.cachePolicyChecks >= 5 &&
        payload?.statusCounts?.ok200 === 4 &&
        payload?.statusCounts?.permanentRedirect301 === 1 &&
        payload?.statusCounts?.archivedGone410 === 1 &&
        payload?.statusCounts?.notFound404 === 1,
      "postdeploy_smoke_scope_incomplete",
    );
    expectTerminalArchivedTombstone(payload?.terminalArchivedTombstone, "postdeploy_smoke");
    expect(payload?.sessionClosed === true, "postdeploy_smoke_session_open");
    expect(
      payload?.unexpectedCmsMutationCount === 0 &&
        payload?.releaseMismatchCount === 0 &&
        payload?.networkFailureCount === 0 &&
        payload?.consoleErrorCount === 0,
      "postdeploy_smoke_runtime_failure",
    );
    expect(
      payload?.credentialsPersisted === false &&
        payload?.tokensPersisted === false &&
        payload?.rawBrowserArtifacts === "disabled" &&
        payload?.identifiersOrPathsPersisted === false,
      "postdeploy_smoke_sensitive_evidence_invalid",
    );
  } else if (path.endsWith("cms-final-coverage-production.json")) {
    expect(payload?.schemaVersion === 1, "browser_coverage_schema_invalid");
    expect(payload?.sourceSha === candidateSha, "browser_coverage_candidate_mismatch");
    expect(payload?.credentialsPersisted === false, "browser_coverage_credentials_persisted");
    expect(payload?.mutatingEditorialLifecycle?.status === "passed", "editorial_cycle_not_passed");
    expect(
      payload?.mutatingEditorialLifecycle?.finalSyntheticState === "published-for-downstream",
      "editorial_cycle_handoff_incomplete",
    );
    expectSealedPreviewRouting("final_coverage");
  } else if (path.endsWith("cms-admin-ops-cycles-production.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "passed", "admin_ops_not_passed");
    expect(payload?.environment === "production", "admin_ops_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "admin_ops_candidate_mismatch");
    expect(payload?.noSecretsPersisted === true, "admin_ops_secrets_persisted");
    expect(payload?.rawBrowserArtifacts === "disabled", "admin_ops_raw_artifacts_enabled");
    expect(payload?.positivePublicLead?.status === "passed", "production_public_lead_not_passed");
    expect(
      payload?.positivePublicLead?.turnstile === "official-production-widget-token",
      "production_turnstile_not_exercised",
    );
    expect(payload?.positivePublicLead?.backendStatus === 201, "production_public_lead_status_invalid");
    expect(payload?.positivePublicLead?.persistedReference === true, "production_public_lead_not_persisted");
    expect(
      payload?.positivePublicLead?.externalDelivery === "suppressed-only-for-exact-controlled-origin",
      "production_public_lead_delivery_not_isolated",
    );
    expect(
      Array.isArray(payload?.scenarios) &&
        payload.scenarios.length > 0 &&
        payload.scenarios.every((scenario) => scenario?.status === "passed"),
      "admin_ops_scenarios_incomplete",
    );
    expect(
      payload?.cleanup?.status === "awaiting-fixture-teardown-verification",
      "admin_ops_cleanup_invalid",
    );
    expectSealedPreviewRouting("admin_ops");
  } else if (path.endsWith("cms-secondary-ui-cycles-production.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "passed", "secondary_ui_not_passed");
    expect(payload?.environment === "production", "secondary_ui_environment_invalid");
    expect(payload?.sourceSha === candidateSha, "secondary_ui_candidate_mismatch");
    expect(payload?.noSecretsPersisted === true, "secondary_ui_secrets_persisted");
    expect(payload?.rawBrowserArtifacts === "disabled", "secondary_ui_raw_artifacts_enabled");
    expect(
      Array.isArray(payload?.scenarios) &&
        payload.scenarios.length > 0 &&
        payload.scenarios.every((scenario) => scenario?.status === "passed"),
      "secondary_ui_scenarios_incomplete",
    );
    expect(
      Array.isArray(payload?.cleanup) &&
        payload.cleanup.length > 0 &&
        payload.cleanup.every((item) => item?.status !== "failed"),
      "secondary_ui_cleanup_incomplete",
    );
    expectSealedPreviewRouting("secondary_ui");
  } else if (path.endsWith("cms-security-boundaries-production.json")) {
    expect(payload?.schemaVersion === 1 && payload?.status === "passed", "security_browser_not_passed");
    expect(payload?.environment === "production", "security_browser_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "security_browser_candidate_mismatch");
    expect(payload?.securityProfile === "production-without-qa-rate-limit-proof", "security_profile_invalid");
    expect(payload?.syntheticPage?.finalState === "archived", "security_synthetic_page_not_archived");
    expect(payload?.syntheticPage?.activeResidue === 0, "security_active_residue_present");
    expect(payload?.rateLimitProofInvoked === false, "security_production_rate_proof_invoked");
    expect(payload?.credentialsPersisted === false, "security_credentials_persisted");
    expect(payload?.rawBrowserArtifacts === "disabled", "security_raw_artifacts_enabled");
    expect(
      Array.isArray(payload?.scenarios) &&
        payload.scenarios.length > 0 &&
        payload.scenarios.every((scenario) => scenario?.status === "passed"),
      "security_scenarios_incomplete",
    );
    expectSealedPreviewRouting("security_browser");
  } else if (path.endsWith("cms-terminal-coverage-matrix-production.json")) {
    try {
      assertCmsTerminalCoverage(payload);
    } catch {
      violations.push("terminal_coverage_matrix_invalid");
    }
    expect(payload?.candidateSha === candidateSha, "terminal_coverage_candidate_mismatch");
    expect(payload?.environment === "production", "terminal_coverage_environment_invalid");
  } else if (path.endsWith("g12-backend-compatibility.json")) {
    expect(payload?.schemaVersion === 1, "backend_compatibility_schema_invalid");
    expect(payload?.event === "g12.backend.forward-compatibility", "backend_compatibility_event_invalid");
    expect(payload?.outcome === "pass", "backend_compatibility_not_passed");
    expect(
      Array.isArray(payload?.violations) && payload.violations.length === 0,
      "backend_compatibility_violations",
    );
  } else if (path.endsWith("g12-production-dist-seal.json")) {
    expect(payload?.schemaVersion === 2, "dist_seal_schema_invalid");
    expect(payload?.event === "g12.production.dist.sealed", "dist_seal_event_invalid");
    expect(payload?.candidateSha === candidateSha, "dist_seal_candidate_mismatch");
    expect(/^[a-f0-9]{64}$/.test(payload?.archiveSha256 ?? ""), "dist_archive_digest_invalid");
  } else if (path.endsWith("g12-production-function-deployment.json")) {
    expect(payload?.schemaVersion === 1, "function_deployment_schema_invalid");
    expect(
      payload?.event === "g12.production.functions.deployment_verified",
      "function_deployment_event_invalid",
    );
    expect(payload?.candidateSha === candidateSha, "function_deployment_candidate_mismatch");
    expect(payload?.target === "candidate", "function_deployment_target_invalid");
    expect(
      Array.isArray(payload?.deployments) && payload.deployments.length > 0,
      "function_deployment_empty",
    );
  } else if (path.endsWith("production-backend-evidence/manifest.json")) {
    expect(payload?.schemaVersion === 1 && payload?.outcome === "active", "backend_manifest_invalid");
    expect(payload?.release === candidateSha, "backend_manifest_candidate_mismatch");
    expect(String(payload?.github?.runId ?? "") === String(binding.runId), "backend_manifest_run_mismatch");
    expect(
      Number(payload?.github?.runAttempt) === Number(binding.runAttempt),
      "backend_manifest_attempt_mismatch",
    );
    expect(payload?.github?.controlSha === binding.controlSha, "backend_manifest_control_sha_mismatch");
  } else if (
    path.endsWith("production-backend-evidence/functions.json") ||
    path.endsWith("g12-production-functions.json")
  ) {
    expect(Array.isArray(payload) && payload.length > 0, "function_inventory_invalid");
  } else if (
    path.endsWith("production-backend-evidence/database.json") ||
    path.endsWith("g12-production-backend.json")
  ) {
    expect(payload?.event === "g12.production.database.verified", "database_evidence_event_invalid");
    expect(Number(payload?.checks) > 0, "database_evidence_checks_invalid");
  } else if (path.endsWith("g12-production-auth.json")) {
    expect(payload?.event === "g12.production.auth_config.verified", "auth_evidence_invalid");
    expect(payload?.publicSignupDisabled === true, "auth_signup_not_disabled");
  } else if (path.endsWith("g12-production-vault.json")) {
    expect(payload?.event === "g12.production.vault.verified", "vault_evidence_invalid");
    expect(payload?.configuredSecrets === 2, "vault_binding_incomplete");
  } else if (path.endsWith("g12-production-edge-secrets.json")) {
    expect(payload?.event === "g12.production.function_secrets.verified", "function_secret_evidence_invalid");
    expect(payload?.exactDigestBindingsVerified > 0, "function_secret_digest_binding_missing");
    expect(payload?.valuesDisclosed === 0, "function_secret_values_disclosed");
    expect(payload?.cachePurgeCredentialVerified === true, "cache_purge_credential_not_verified");
  } else if (path.endsWith("g12-production-outbox-canary.json")) {
    expect(payload?.event === "g12.production.outbox_cache_canary.verified", "outbox_canary_invalid");
    expect(payload?.candidateSha === candidateSha, "outbox_canary_candidate_mismatch");
    expect(
      Number.isInteger(payload?.eventCount) &&
        payload.eventCount > 0 &&
        payload?.completedCount === payload.eventCount &&
        payload?.failedCount === 0,
      "outbox_canary_failed",
    );
    expect(payload?.cacheInvalidationProvenByWorkerCompletion === true, "outbox_cache_invalidation_unproven");
  } else if (path.endsWith("g12-production-residue.json")) {
    expect(payload?.event === "g12.production.synthetic_residue.verified", "residue_evidence_invalid");
    expect(payload?.status === "passed", "residue_status_invalid");
    expect(payload?.environment === "production", "residue_environment_invalid");
    expect(payload?.candidateSha === candidateSha, "residue_candidate_mismatch");
    expectBoundRunTag(payload?.runTag, "residue");
    expect(
      payload?.activeResidue === 0 &&
        payload?.activeLeases === 0 &&
        payload?.activeSessions === 0 &&
        payload?.actionableRouteRules === 0 &&
        payload?.actionablePublicationOutbox === 0 &&
        payload?.auditRetained === true &&
        payload?.identifiersOrPathsPersisted === false,
      "residue_not_clean",
    );
    expectTerminalArchivedTombstone(payload?.terminalArchivedTombstone, "residue");
  } else if (path.endsWith("g12-production-boundary.json")) {
    expect(payload?.event === "g12.supabase.boundary.probe", "boundary_evidence_invalid");
    expect(payload?.environment === "production" && payload?.outcome === "pass", "boundary_not_passed");
  } else if (path.endsWith("g12-production-backup-verification.json")) {
    expect(payload?.sourceSha === candidateSha, "backup_gate_candidate_mismatch");
    expect(/^\d+$/.test(String(payload?.runId ?? "")), "backup_gate_run_invalid");
    expect(/^[a-f0-9]{64}$/.test(payload?.manifestSha256 ?? ""), "backup_manifest_digest_invalid");
    expect(/^[a-f0-9]{64}$/.test(payload?.encryptedArchiveSha256 ?? ""), "backup_archive_digest_invalid");
    expect(payload?.secretsExposed === false, "backup_gate_secret_boundary_invalid");
  } else if (
    path.endsWith("g12-preflight-technical.json") ||
    path.endsWith("g12-preflight-probe.json") ||
    path.endsWith("g12-production-baseline-forward-backend.json") ||
    path.endsWith("g12-production-probe.json")
  ) {
    expect(payload?.schemaVersion === 1 && payload?.event === "g12.rollout.probe", "probe_evidence_invalid");
    expect(payload?.outcome === "pass", "probe_not_passed");
    const expected = path.endsWith("g12-production-baseline-forward-backend.json")
      ? binding.baselineRelease
      : candidateSha;
    expect(payload?.candidateSha === expected, "probe_release_mismatch");
  }
  return violations;
}

async function securelyReadEvidence(rootRealPath, configuredPath) {
  const configuredAbsolute = resolve(rootRealPath, configuredPath);
  const configuredMetadata = await lstat(configuredAbsolute);
  if (!configuredMetadata.isFile() || configuredMetadata.isSymbolicLink())
    throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:not_regular:${configuredPath}`);
  const realPath = await realpath(configuredAbsolute);
  const realRelative = relative(rootRealPath, realPath);
  if (realRelative.startsWith(`..${sep}`) || realRelative === ".." || isAbsolute(realRelative))
    throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:path_escape:${configuredPath}`);
  const handle = await open(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile())
      throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:not_regular:${configuredPath}`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    )
      throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:changed_while_reading:${configuredPath}`);
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function buildProductionReleaseEvidenceIndex(rootDirectory, candidateSha, paths, binding) {
  if (!FULL_SHA.test(String(candidateSha ?? "")))
    throw new Error("G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:candidate_sha_invalid");
  const root = resolve(rootDirectory);
  const rootRealPath = await realpath(root);
  const selectedPaths = paths ?? PRODUCTION_RELEASE_EVIDENCE_PATHS;
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0)
    throw new Error("G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:path_inventory_empty");
  if (
    binding &&
    (!/^\d+$/.test(String(binding.runId ?? "")) ||
      !/^\d+$/.test(String(binding.runAttempt ?? "")) ||
      !FULL_SHA.test(String(binding.controlSha ?? "")) ||
      !FULL_SHA.test(String(binding.baselineRelease ?? "")))
  )
    throw new Error("G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:binding_invalid");

  const files = [];
  for (const configuredPath of selectedPaths) {
    if (
      typeof configuredPath !== "string" ||
      !configuredPath ||
      isAbsolute(configuredPath) ||
      configuredPath.split(/[\\/]/).includes("..")
    )
      throw new Error("G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:path_invalid");
    const relativePath = configuredPath.split("\\").join("/");
    let bytes;
    try {
      bytes = await securelyReadEvidence(rootRealPath, configuredPath);
    } catch (error) {
      if (String(error instanceof Error ? error.message : error).startsWith("G12_")) throw error;
      throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:missing:${relativePath}`, { cause: error });
    }
    if (bytes.length === 0) throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:empty:${relativePath}`);
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error(`G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:json_invalid:${relativePath}`);
    }
    const sensitiveViolations = sensitiveEvidenceViolations(payload);
    if (sensitiveViolations.length > 0)
      throw new Error(
        `G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:sensitive:${relativePath}:${sensitiveViolations.join(",")}`,
      );
    const violations = semanticViolations(relativePath, payload, binding);
    if (violations.length > 0)
      throw new Error(
        `G12_PRODUCTION_RELEASE_EVIDENCE_REFUSED:semantic:${relativePath}:${violations.join(",")}`,
      );
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }

  return {
    schemaVersion: 2,
    event: "g12.production.release_evidence.indexed",
    candidateSha,
    ...(binding
      ? {
          github: {
            runId: String(binding.runId),
            runAttempt: Number(binding.runAttempt),
            controlSha: binding.controlSha,
          },
          baselineRelease: binding.baselineRelease,
        }
      : {}),
    fileCount: files.length,
    files,
  };
}
