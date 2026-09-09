import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PRODUCTION_RELEASE_EVIDENCE_PATHS,
  buildProductionReleaseEvidenceIndex,
} from "./production-release-evidence-lib.mjs";

const SHA = "c".repeat(40);
const terminalArchivedTombstone = () => ({
  classification: "terminalArchivedTombstone",
  count: 1,
  statusCode: 410,
  destinationAbsent: true,
  itemArchived: true,
  publicationCount: 0,
  projectionCount: 0,
  actionableOutboxCount: 0,
  piiExposed: false,
});
const sealedPreviewRouting = () => ({
  enabled: true,
  canonicalOrigin: "https://gaiatecsistemas.com.br",
  previewOrigin: "https://candidate.gaiatec-website.pages.dev",
  candidateSha: SHA,
  installedContexts: 1,
  mappedRequests: 12,
  mappedGetRequests: 11,
  mappedHeadRequests: 1,
  releaseVerifiedResponses: 12,
  rewrittenRedirects: 0,
  rejectedRedirects: 0,
  mappingFailures: 0,
  cachePolicy: "routing-disabled-http-cache-and-no-store",
  serviceWorkers: "blocked-by-context-contract",
});
const browserAttestationSummary = () => ({
  status: "passed",
  channel: "iab-workflow-dispatch-hmac",
  canonicalFrontendReleaseBound: true,
  backendAccepted: true,
  persistedReference: true,
  successLocator: '[data-form-submission-status="success"]',
  successLocatorObserved: true,
  officialWidgetObserved: true,
  cDataBound: true,
  tokenCaptured: false,
  variableCleared: true,
  screenshotSha256: "a".repeat(64),
  screenshotBytes: 1024,
  observedAt: "2026-09-08T15:00:00.000Z",
});
const authoritativeLeadPersistence = () => ({
  scopedLeadCount: 1,
  referenceMatched: true,
  campaignPathMatched: true,
  consentCount: 1,
  consentVersionMatched: true,
  initialHistoryPresent: true,
  leadReceivedOutboxCount: 1,
  attestationAuditCount: 1,
  auditCorrelationPresent: true,
});

test("mandatory release evidence indexes every exact non-empty JSON file", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-release-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "one.json"), '{"one":1}\n');
  await writeFile(join(root, "nested", "two.json"), '{"two":2}\n');

  const index = await buildProductionReleaseEvidenceIndex(root, SHA, ["one.json", "nested/two.json"]);
  assert.equal(index.candidateSha, SHA);
  assert.equal(index.fileCount, 2);
  assert.deepEqual(
    index.files.map((file) => file.path),
    ["one.json", "nested/two.json"],
  );
  assert.ok(index.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test("mandatory production inventory includes security, terminal matrix and canonical smoke", () => {
  for (const path of [
    "candidate/outputs/cms-coverage-production.json",
    "candidate/outputs/cms-security-boundaries-production.json",
    "candidate/outputs/cms-terminal-coverage-matrix-production.json",
    "candidate/outputs/cms-production-postdeploy-smoke.json",
    "candidate/outputs/cms-real-browser-attestation-production.json",
    "candidate/outputs/cms-real-browser-attestation-production.png",
  ]) {
    assert.ok(PRODUCTION_RELEASE_EVIDENCE_PATHS.includes(path));
  }
});

test("mandatory release evidence rejects each missing, empty, malformed or escaping path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-release-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "empty.json"), "");
  await writeFile(join(root, "invalid.json"), "not-json");

  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, ["missing.json"]),
    /missing:missing\.json/,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, ["empty.json"]),
    /empty:empty\.json/,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, ["invalid.json"]),
    /json_invalid:invalid\.json/,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, ["../outside.json"]),
    /path_invalid/,
  );
});

test("release evidence rejects nested PII, credentials and action links without echoing values", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-release-sensitive-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    { payload: { nested: { operatorEmail: "operator@example.com" } }, violation: "email_value_present" },
    {
      payload: { nested: [{ refresh_token: "opaque-confidential-value" }] },
      violation: "sensitive_key_present",
    },
    {
      payload: { value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYS11c2VyIn0.signature123" },
      violation: "jwt_value_present",
    },
    {
      payload: { url: "https://example.invalid/callback?token_hash=never-persist-this" },
      violation: "sensitive_url_query_present",
    },
  ];
  for (const [index, entry] of cases.entries()) {
    const file = `sensitive-${index}.json`;
    await writeFile(join(root, file), `${JSON.stringify(entry.payload)}\n`);
    await assert.rejects(
      () => buildProductionReleaseEvidenceIndex(root, SHA, [file]),
      (error) => {
        assert.match(String(error), new RegExp(entry.violation));
        assert.doesNotMatch(
          String(error),
          /operator@example\.com|opaque-confidential|signature123|never-persist/,
        );
        return true;
      },
    );
  }
});

test("production browser evidence is semantically bound to the exact candidate and clean teardown", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-release-browser-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const authPath = "cms-auth-lifecycle-production.json";
  const adminPath = "cms-admin-ops-cycles-production.json";
  const secondaryPath = "cms-secondary-ui-cycles-production.json";
  await writeFile(
    join(root, adminPath),
    `${JSON.stringify({
      schemaVersion: 1,
      status: "passed",
      environment: "production",
      candidateSha: SHA,
      noSecretsPersisted: true,
      rawBrowserArtifacts: "disabled",
      positivePublicLead: {
        status: "passed",
        interface: "iab-public-campaign-form-and-admin-ui",
        attestation: browserAttestationSummary(),
        authoritativePersistence: authoritativeLeadPersistence(),
        persistedReference: true,
        externalDelivery: "suppressed-only-for-exact-controlled-origin",
      },
      scenarios: [{ status: "passed" }],
      cleanup: { status: "awaiting-fixture-teardown-verification" },
      sealedPreviewRouting: sealedPreviewRouting(),
    })}\n`,
  );
  const secondary = {
    schemaVersion: 1,
    status: "passed",
    environment: "production",
    sourceSha: SHA,
    noSecretsPersisted: true,
    rawBrowserArtifacts: "disabled",
    scenarios: [{ status: "passed" }],
    cleanup: [{ status: "archived" }],
    sealedPreviewRouting: sealedPreviewRouting(),
  };
  await writeFile(join(root, secondaryPath), `${JSON.stringify(secondary)}\n`);
  const auth = {
    schemaVersion: 1,
    status: "passed",
    environment: "production",
    candidateSha: SHA,
    credentialsPersisted: false,
    actionLinksPersisted: false,
    rawBrowserArtifacts: "disabled",
    scenarios: [
      "real_recovery_link_password_and_mfa",
      "recovery_account_enumeration_resistance",
      "new_auth_identity_invite_activation_and_mfa",
      "silent_session_refresh_real_backend",
      "single_use_action_links",
      "auth_profile_and_immutable_audit_persistence",
      "effective_cms_session_revocation",
      "expired_session_rejected_refresh",
      "mfa_cancel_signout",
    ].map((id) => ({ id, status: "passed" })),
    authSurfaceCoverage: {
      status: "passed",
      viewports: [
        { name: "390x844", width: 390, height: 844 },
        { name: "768x1024", width: 768, height: 1024 },
        { name: "1440x900", width: 1440, height: 900 },
        { name: "1920x1080", width: 1920, height: 1080 },
      ],
      entries: ["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"].flatMap((surfaceId) =>
        [
          { name: "390x844", width: 390, height: 844 },
          { name: "768x1024", width: 768, height: 1024 },
          { name: "1440x900", width: 1440, height: 900 },
          { name: "1920x1080", width: 1920, height: 1080 },
        ].map((viewport) => ({
          surfaceId,
          viewport,
          status: "passed",
          horizontalOverflow: false,
          fieldsSeen: 1,
          fieldsExercised: 1,
          actionsSeen:
            surfaceId === "auth-login" || surfaceId === "auth-recovery" || surfaceId === "auth-mfa" ? 2 : 1,
          actionsActivationChecked:
            surfaceId === "auth-login" || surfaceId === "auth-recovery" || surfaceId === "auth-mfa" ? 2 : 1,
          unsupported: [],
          failures: [],
          actions: {
            "auth-login": [
              ["sign-in", "auth-login.sign-in"],
              ["forgot-password", "auth-login.forgot-password"],
            ],
            "auth-recovery": [
              ["request-link", "auth-recovery.request-link"],
              ["back-to-login", "auth-recovery.back-to-login"],
            ],
            "auth-set-password": [["save-password", "auth-set-password.save-password"]],
            "auth-mfa": [
              ["verify", "auth-mfa.verify"],
              ["cancel-and-sign-out", "auth-mfa.cancel-and-sign-out"],
            ],
          }[surfaceId].map(([controlId, semanticExecutionRef]) => ({
            controlId,
            activationChecked: true,
            semanticExecutionRef,
          })),
        })),
      ),
      semanticExecutions: [
        ["auth-login.sign-in", "auth-login", "sign-in", "real-browser-real-backend"],
        ["auth-login.forgot-password", "auth-login", "forgot-password", "real-browser-navigation"],
        ["auth-recovery.request-link", "auth-recovery", "request-link", "real-browser-real-backend"],
        ["auth-recovery.back-to-login", "auth-recovery", "back-to-login", "real-browser-navigation"],
        [
          "auth-set-password.save-password",
          "auth-set-password",
          "save-password",
          "real-browser-real-backend",
        ],
        ["auth-mfa.verify", "auth-mfa", "verify", "real-browser-real-backend"],
        [
          "auth-mfa.configure-authenticator",
          "auth-mfa",
          "configure-authenticator",
          "real-browser-real-backend",
        ],
        ["auth-mfa.cancel-and-sign-out", "auth-mfa", "cancel-and-sign-out", "real-browser-real-backend"],
      ].map(([id, surfaceId, controlId, proof]) => ({
        id,
        surfaceId,
        controlId,
        scenarioId: "bound-scenario",
        result: "passed",
        proof,
      })),
      unsupported: [],
      failures: [],
    },
    sessionLifecycle: {
      silentRefresh: "real-auth-refresh-and-aal2-session-resolution",
      expiration: "expired-local-session-with-server-rejected-refresh",
      revocation: "cms-session-403-and-ui-access-denied",
      tokensPersistedInEvidence: false,
    },
    cleanup: "awaiting-fixture-teardown-verification",
    sealedPreviewRouting: sealedPreviewRouting(),
  };
  await writeFile(join(root, authPath), `${JSON.stringify(auth)}\n`);
  const binding = {
    candidateSha: SHA,
    runId: "123",
    runAttempt: "1",
    controlSha: "d".repeat(40),
    baselineRelease: SHA,
  };

  const paths = [authPath, adminPath, secondaryPath];
  const index = await buildProductionReleaseEvidenceIndex(root, SHA, paths, binding);
  assert.equal(index.fileCount, 3);

  await writeFile(
    join(root, authPath),
    `${JSON.stringify({
      ...auth,
      sealedPreviewRouting: { ...sealedPreviewRouting(), mappingFailures: 1 },
    })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /auth_lifecycle_mapping_failed/,
  );
  await writeFile(join(root, authPath), `${JSON.stringify(auth)}\n`);

  await writeFile(
    join(root, authPath),
    `${JSON.stringify({
      ...auth,
      sealedPreviewRouting: { ...sealedPreviewRouting(), mappedHeadRequests: 0 },
    })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /auth_lifecycle_request_accounting_invalid/,
  );
  await writeFile(join(root, authPath), `${JSON.stringify(auth)}\n`);

  await writeFile(join(root, authPath), `${JSON.stringify({ ...auth, actionLinksPersisted: true })}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /auth_lifecycle_links_persisted/,
  );
  await writeFile(join(root, authPath), `${JSON.stringify(auth)}\n`);

  const authWithoutSemanticExecution = structuredClone(auth);
  authWithoutSemanticExecution.authSurfaceCoverage.semanticExecutions =
    authWithoutSemanticExecution.authSurfaceCoverage.semanticExecutions.filter(
      (entry) => entry.id !== "auth-mfa.cancel-and-sign-out",
    );
  await writeFile(join(root, authPath), `${JSON.stringify(authWithoutSemanticExecution)}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /auth_semantic_execution_incomplete/,
  );
  await writeFile(join(root, authPath), `${JSON.stringify(auth)}\n`);

  const adminWithoutProductionTurnstile = {
    schemaVersion: 1,
    status: "passed",
    environment: "production",
    candidateSha: SHA,
    noSecretsPersisted: true,
    rawBrowserArtifacts: "disabled",
    positivePublicLead: {
      status: "passed",
      interface: "iab-public-campaign-form-and-admin-ui",
      attestation: { ...browserAttestationSummary(), cDataBound: false },
      authoritativePersistence: authoritativeLeadPersistence(),
      persistedReference: true,
      externalDelivery: "suppressed-only-for-exact-controlled-origin",
    },
    scenarios: [{ status: "passed" }],
    cleanup: { status: "awaiting-fixture-teardown-verification" },
    sealedPreviewRouting: sealedPreviewRouting(),
  };
  await writeFile(join(root, adminPath), `${JSON.stringify(adminWithoutProductionTurnstile)}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /production_turnstile_not_exercised/,
  );

  adminWithoutProductionTurnstile.positivePublicLead.attestation.cDataBound = true;
  await writeFile(join(root, adminPath), `${JSON.stringify(adminWithoutProductionTurnstile)}\n`);

  await writeFile(join(root, secondaryPath), `${JSON.stringify({ ...secondary, status: "failed" })}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, paths, binding),
    /secondary_ui_not_passed/,
  );
});

test("canonical postdeploy evidence requires MFA, SEO, exact SHA and zero runtime failures", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-postdeploy-smoke-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = "cms-production-postdeploy-smoke.json";
  const binding = {
    candidateSha: SHA,
    runId: "123",
    runAttempt: "1",
    controlSha: "d".repeat(40),
    baselineRelease: "e".repeat(40),
  };
  const passed = {
    schemaVersion: 1,
    event: "g12.production.postdeploy_authenticated_smoke",
    status: "passed",
    environment: "production",
    candidateSha: SHA,
    origin: "https://gaiatecsistemas.com.br",
    shell: "canonical-promoted-exact-sealed-artifact",
    backend: "supabase-production-real",
    corporateMfaAuthenticated: true,
    authenticatedRoutes: 3,
    seoChecks: 13,
    structuredDataVerified: true,
    canonicalHttpProbes: 7,
    releaseVerifiedProbes: 7,
    cachePolicyChecks: 5,
    statusCounts: {
      ok200: 4,
      permanentRedirect301: 1,
      archivedGone410: 1,
      notFound404: 1,
    },
    terminalArchivedTombstone: terminalArchivedTombstone(),
    sessionClosed: true,
    unexpectedCmsMutationCount: 0,
    releaseMismatchCount: 0,
    networkFailureCount: 0,
    consoleErrorCount: 0,
    credentialsPersisted: false,
    tokensPersisted: false,
    rawBrowserArtifacts: "disabled",
    identifiersOrPathsPersisted: false,
  };
  await writeFile(join(root, path), `${JSON.stringify(passed)}\n`);
  assert.equal((await buildProductionReleaseEvidenceIndex(root, SHA, [path], binding)).fileCount, 1);
  await writeFile(join(root, path), `${JSON.stringify({ ...passed, seoChecks: 12 })}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [path], binding),
    /postdeploy_smoke_scope_incomplete/,
  );
  await writeFile(join(root, path), `${JSON.stringify({ ...passed, structuredDataVerified: false })}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [path], binding),
    /postdeploy_smoke_scope_incomplete/,
  );
  await writeFile(
    join(root, path),
    `${JSON.stringify({
      ...passed,
      terminalArchivedTombstone: {
        ...terminalArchivedTombstone(),
        actionableOutboxCount: 1,
      },
    })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [path], binding),
    /postdeploy_smoke_terminal_archived_tombstone_invalid/,
  );
});

test("cleanup and remote residue evidence allow exactly one sanitized terminal 410", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-terminal-residue-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const binding = {
    candidateSha: SHA,
    runId: "123",
    runAttempt: "1",
    controlSha: "d".repeat(40),
    baselineRelease: "e".repeat(40),
  };
  const cleanupPath = "cms-browser-production-cleanup.json";
  const residuePath = "g12-production-residue.json";
  const cleanup = {
    schemaVersion: 1,
    status: "cleaned",
    environment: "production",
    candidateSha: SHA,
    runTag: "QA-CMS-FINAL-20260907-cccccccc",
    activeResidue: 0,
    auditRetained: true,
    terminalArchivedTombstone: terminalArchivedTombstone(),
  };
  const residue = {
    schemaVersion: 1,
    event: "g12.production.synthetic_residue.verified",
    status: "passed",
    environment: "production",
    candidateSha: SHA,
    runTag: "QA-CMS-FINAL-20260907-cccccccc",
    activeResidue: 0,
    activeLeases: 0,
    activeSessions: 0,
    actionableRouteRules: 0,
    actionablePublicationOutbox: 0,
    auditRetained: true,
    identifiersOrPathsPersisted: false,
    terminalArchivedTombstone: terminalArchivedTombstone(),
  };
  await Promise.all([
    writeFile(join(root, cleanupPath), `${JSON.stringify(cleanup)}\n`),
    writeFile(join(root, residuePath), `${JSON.stringify(residue)}\n`),
  ]);
  assert.equal(
    (await buildProductionReleaseEvidenceIndex(root, SHA, [cleanupPath, residuePath], binding)).fileCount,
    2,
  );

  await writeFile(
    join(root, residuePath),
    `${JSON.stringify({
      ...residue,
      terminalArchivedTombstone: { ...terminalArchivedTombstone(), path: "/hidden" },
    })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [cleanupPath, residuePath], binding),
    /residue_terminal_archived_tombstone_invalid/,
  );
  await writeFile(
    join(root, residuePath),
    `${JSON.stringify({ ...residue, runTag: "QA-CMS-FINAL-20260907-dddddddd" })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [cleanupPath, residuePath], binding),
    /residue_run_tag_invalid/,
  );
});

test("corporate authenticated preflight is always fail-closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-authenticated-preflight-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const preflightPath = "cms-production-readonly-preflight.json";
  const binding = {
    candidateSha: SHA,
    runId: "123",
    runAttempt: "1",
    controlSha: "d".repeat(40),
    baselineRelease: SHA,
  };
  const base = {
    schemaVersion: 1,
    event: "g12.production.authenticated_readonly_preflight",
    candidateSha: SHA,
    sealedFrontendCandidateSha: SHA,
    preparedBackendCandidateSha: SHA,
    canonicalFrontendDuringPreflightSha: SHA,
    shell: "exact-sealed-cloudflare-preview-mapped-under-production-origin",
    backend: "supabase-production-real",
    cmsMutations: 0,
    credentialsPersisted: false,
    tokensPersisted: false,
    rawBrowserArtifacts: "disabled",
  };

  await writeFile(
    join(root, preflightPath),
    `${JSON.stringify({ ...base, policyRequired: false, status: "not_required" })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [preflightPath], binding),
    /authenticated_preflight_policy_bypassed/,
  );

  const passed = {
    ...base,
    policyRequired: true,
    status: "passed",
    authAuditWritesOnly: true,
    unexpectedMutationCount: 0,
    unexpectedNetworkFailureCount: 0,
    consoleErrorCount: 0,
    scenarios: [
      {
        id: "corporate_login_mfa_readonly_exact_sealed_preview",
        status: "passed",
        exactReleaseHeader: true,
        activeMfaProfileRead: true,
        roles: ["auditor"],
        sessionClosed: true,
      },
    ],
  };
  await writeFile(join(root, preflightPath), `${JSON.stringify(passed)}\n`);
  assert.equal((await buildProductionReleaseEvidenceIndex(root, SHA, [preflightPath], binding)).fileCount, 1);

  await writeFile(
    join(root, preflightPath),
    `${JSON.stringify({ ...passed, canonicalFrontendDuringPreflightSha: "e".repeat(40) })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [preflightPath], binding),
    /authenticated_preflight_release_roles_invalid/,
  );

  await writeFile(
    join(root, preflightPath),
    `${JSON.stringify({ ...passed, unexpectedMutationCount: 1 })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [preflightPath], binding),
    /authenticated_preflight_mutation_detected/,
  );
  await writeFile(
    join(root, preflightPath),
    `${JSON.stringify({ ...base, policyRequired: true, status: "pending" })}\n`,
  );
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [preflightPath], binding),
    /authenticated_preflight_not_passed/,
  );
});

test("production operator evidence is exact-candidate, MFA-backed and PII-free", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-production-operator-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const operatorPath = "cms-production-operator-provisioning.json";
  const binding = {
    candidateSha: SHA,
    runId: "123",
    runAttempt: "1",
    controlSha: "d".repeat(40),
    baselineRelease: "e".repeat(40),
  };
  const evidence = {
    schemaVersion: 1,
    event: "cms.production_operator.provisioned",
    status: "provisioned",
    candidateSha: SHA,
    environment: "production",
    authorizationKind: "release",
    validityDays: 365,
    enabledFlags: ["ev2.release_skeleton", "ev2.rbac_scoped"],
    disabledFlags: [],
    totpVerified: true,
    legacySuperAdmin: true,
    scopedSuperAdmin: true,
    containsPii: false,
  };
  await writeFile(join(root, operatorPath), `${JSON.stringify(evidence)}\n`);
  assert.equal((await buildProductionReleaseEvidenceIndex(root, SHA, [operatorPath], binding)).fileCount, 1);

  await writeFile(join(root, operatorPath), `${JSON.stringify({ ...evidence, containsPii: true })}\n`);
  await assert.rejects(
    () => buildProductionReleaseEvidenceIndex(root, SHA, [operatorPath], binding),
    /production_operator_pii_boundary_invalid/,
  );
});
