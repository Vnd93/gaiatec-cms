import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixture = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const spec = readFileSync("tests/e2e/cms-auth-lifecycle.spec.ts", "utf8");
const adminOpsSpec = readFileSync("tests/e2e/cms-admin-ops-cycles.spec.ts", "utf8");
const staging = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
const production = readFileSync(".github/workflows/deploy-production.yml", "utf8");
const stagingVerifier = readFileSync("scripts/ev2/phase12/verify-staging-artifact.mjs", "utf8");
const productionEvidence = readFileSync("scripts/ev2/phase12/production-release-evidence-lib.mjs", "utf8");

describe("real invite and password-recovery browser lifecycle", () => {
  it("provisions distinct exact synthetic identities without sending fixture email", () => {
    expect(fixture).toMatch(/actorKind: "recovery"/);
    expect(fixture).toMatch(/actorKind: "invitee"/);
    expect(fixture).toMatch(/auth\.admin\.generateLink\(\{\s*type: "recovery"/);
    expect(fixture).toMatch(/auth\.admin\.generateLink\(\{\s*type: "invite"/);
    expect(fixture).toContain('delivery: "generate_link_no_email"');
    expect(fixture).toContain('status: "invited"');
    expect(fixture).toMatch(/async function createInvitedLifecycleActor[\s\S]+role_key: "admin"/);
    expect(fixture).toContain('await assertActorLease(actorId, runTag, "active")');
    expect(fixture).toContain("state.recoveryActorId");
    expect(fixture).toContain("state.invitedActorId");
  });

  it("exports links and credentials only through masked GitHub environment variables", () => {
    for (const name of [
      "QA_CMS_RECOVERY_ACTION_LINK",
      "QA_CMS_RECOVERY_PASSWORD",
      "QA_CMS_RECOVERY_TOTP_SECRET",
      "QA_CMS_INVITEE_ACTION_LINK",
      "QA_CMS_INVITEE_PASSWORD",
    ]) {
      expect(fixture).toContain(name);
    }
    expect(fixture).toContain("::add-mask::");
    expect(fixture).toContain("actionLinksPersisted: false");
    expect(fixture).toContain("credentialsInStateOrReport: false");
    expect(spec).toContain(
      'test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" })',
    );
    expect(spec).toContain("actionLinksPersisted: false");
    expect(spec).toContain("credentialsPersisted: false");
    expect(spec).toContain("noIdentifiersPersisted: true");
    expect(spec).toContain("QA_CMS_AUTH_REPORT_SENSITIVE_VALUE_REFUSED");
  });

  it("drives real action links, password validation, single-use rejection and MFA", () => {
    expect(spec).toContain("openActionSession(recoveryPage, config.recovery.actionLink");
    expect(spec).toContain("openActionSession(invitePage, config.invitee.actionLink");
    expect(spec).toContain("validity.tooShort");
    expect(spec).toContain("As senhas não coincidem.");
    expect(spec).toContain("guaranteedInvalidTotp(validCode)");
    expect(spec).toContain("completeMfaEnrollment(invitePage)");
    expect(spec).toMatch(/loginWithMfa\(\s*invitePage/);
    expect(spec.match(/expectConsumedLinkRejected\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(spec).toContain("cms:auth.recovery_requested");
    expect(spec).toContain("cms:auth.recovery_delivery_failed");
    expect(spec).toContain('id: "silent_session_refresh_real_backend"');
    expect(spec).toContain('id: "effective_cms_session_revocation"');
    expect(spec).toContain('id: "unobserved_auth_session_refresh_rejected_by_cms"');
    expect(spec).toContain('id: "cms_logout_refresh_replay_rejected"');
    expect(spec).toContain('id: "admin_aal1_mfa_aal2_critical_permission"');
    expect(spec).toContain('id: "expired_session_rejected_refresh"');
    expect(spec).toContain('url.searchParams.get("grant_type") === "refresh_token"');
    expect(spec).toContain('row.getByRole("button", { name: "Revogar sessões"');
    expect(spec).toContain('throw new Error("browser-revoked-session-unavailable")');
    expect(spec).toContain("JWT original e JWT renovado da mesma sessão Auth");
    expect(spec).toContain("createUnobservedAuthSession(");
    expect(spec).toContain("resolveThenLogoutCmsSession(");
    expect(spec).toContain("fetch(`${supabaseOrigin}/auth/v1/user`");
    expect(spec).not.toMatch(/page\.request\.(?:get|head)\(/);
    expect(spec).toContain("storedInBrowserOnly: valid");
    expect(spec).toContain('permissions).toContain("cms:audit.read")');
    expect(adminOpsSpec).toContain("expectSuspendedSessionStillDeniedAfterReactivation(");
    expect(adminOpsSpec).toContain(
      "refresh da sessão criada durante suspensão recebeu CMS 403 após reativação",
    );
    expect(spec).toContain("tokensPersistedInEvidence: false");
    expect(spec).toContain("proveIncorrectPassword(");
    expect(spec).toContain('id: "incorrect_password_is_opaque"');
    expect(spec).toContain("validity.valueMissing");
    expect(spec).toContain("validity.typeMismatch");
    expect(spec).toContain('await codeField.fill("12345")');
    expect(spec).toContain('await codeField.fill("1234567")');
  });

  it("runs before all dependent mutating suites in staging and production", () => {
    for (const workflow of [staging, production]) {
      const auth = workflow.indexOf("cms-auth-lifecycle.spec.ts");
      const final = workflow.indexOf("cms-final-coverage.spec.ts", auth);
      const admin = workflow.indexOf("cms-admin-ops-cycles.spec.ts", final);
      const secondary = workflow.indexOf("cms-secondary-ui-cycles.spec.ts", admin);
      expect(auth).toBeGreaterThanOrEqual(0);
      expect(auth).toBeLessThan(final);
      expect(final).toBeLessThan(admin);
      expect(admin).toBeLessThan(secondary);
      expect(workflow).toContain('QA_CMS_PROVISION_AUTH_LIFECYCLE: "true"');
      expect(workflow).toContain("QA_CMS_AUTH_REPORT_PATH:");
    }
    expect(staging.indexOf("cms-secondary-ui-cycles.spec.ts")).toBeLessThan(
      staging.indexOf("cms-security-boundaries.spec.ts"),
    );
  });

  it("records every public auth surface at all mandatory viewports with real actions", () => {
    for (const surfaceId of ["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"]) {
      expect(spec).toContain(`surfaceId: "${surfaceId}"`);
    }
    for (const viewport of ["390x844", "768x1024", "1440x900", "1920x1080"]) {
      expect(spec).toContain(`name: "${viewport}"`);
    }
    expect(spec).toContain("fieldsSeen: fields.length");
    expect(spec).toContain("fieldsExercised: fields.length");
    expect(spec).toContain("actionsSeen: actions.length");
    expect(spec).toContain("actionsExecutionReferenced: actions.length");
    expect(spec).toContain('evidenceKind: "scenario-contract"');
    expect(spec).toContain("cmsSemanticFieldContractKey(");
    expect(spec).toContain("cmsSemanticStructureContractKey(");
    expect(spec).toContain("semanticFields");
    expect(spec).toContain("semanticStructures");
    expect(spec).toContain("semanticExecutions");
    expect(spec).not.toContain("dom-value-roundtrip:");
    expect(spec).not.toContain('evidenceKind: "focus-only"');
    expect(spec).toContain('id: "mfa_cancel_signout"');
    expect(stagingVerifier).toContain("authSurfaceCoveragePassed");
    expect(stagingVerifier).toContain("requiredAuthSurfaces");
    expect(stagingVerifier).toContain("requiredAuthViewports");
  });

  it("makes credential-free auth evidence mandatory for both promotion paths", () => {
    expect(staging).toContain("candidate/outputs/cms-auth-lifecycle.json");
    expect(stagingVerifier).toContain('uniqueFile(root, "cms-auth-lifecycle.json")');
    for (const artifact of [
      "cms-browser-mutating-setup.json",
      "cms-browser-mutating-cleanup.json",
      "cms-browser-mutating-residue.json",
      "g12-cms-coverage-matrix.json",
      "cms-terminal-coverage-matrix.json",
    ]) {
      expect(stagingVerifier).toContain(`uniqueFile(root, "${artifact}")`);
    }
    expect(stagingVerifier).toContain("assertCmsTerminalCoverage(");
    expect(stagingVerifier).toContain('auth?.rawBrowserArtifacts !== "disabled"');
    expect(stagingVerifier).toContain("auth?.noIdentifiersPersisted !== true");
    expect(production).toContain("candidate/outputs/cms-auth-lifecycle-production.json");
    expect(productionEvidence).toContain('"candidate/outputs/cms-auth-lifecycle-production.json"');
    expect(productionEvidence).toContain('"auth_lifecycle_scenarios_incomplete"');
    expect(productionEvidence).toContain('"auth_session_lifecycle_evidence_invalid"');
    for (const scenario of [
      "silent_session_refresh_real_backend",
      "effective_cms_session_revocation",
      "expired_session_rejected_refresh",
    ]) {
      expect(stagingVerifier).toContain(scenario);
      expect(productionEvidence).toContain(scenario);
    }
  });

  it("configures and verifies an exact signup-disabled staging Auth allow-list", () => {
    expect(staging).toContain("configure-staging-auth.mjs");
    expect(staging).toContain("g12-staging-auth.json");
    expect(stagingVerifier).toContain('uniqueFile(root, "g12-staging-auth.json")');
    expect(stagingVerifier).toContain("STAGING_AUTH_REDIRECT_ALLOW_LIST");
  });
});
