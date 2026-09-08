import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixture = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const browserCycle = readFileSync("tests/e2e/cms-admin-ops-cycles.spec.ts", "utf8");
const cmsUsers = readFileSync("supabase/functions/cms-users/index.ts", "utf8");
const identityMigration = readFileSync(
  "supabase/migrations/0062_cms_existing_auth_identity_invites.sql",
  "utf8",
);

describe("existing Auth identity CMS invitation browser homologation", () => {
  it("provisions a leased Auth+MFA/RDO identity without pre-granting CMS access", () => {
    for (const marker of [
      'actorKind: "existing_identity"',
      "provisionCms: false",
      'rdoRole: "rdo_member"',
      "QA_CMS_FIXTURE_AUTH_ONLY_BOUNDARY_FAILED",
      "existingIdentityBaseline: {",
      'cmsProfile: "absent"',
      "cmsRoles: 0",
      'rdoAccess: "active-member"',
      "QA_CMS_EXISTING_IDENTITY_EMAIL",
      "QA_CMS_EXISTING_IDENTITY_PASSWORD",
      "QA_CMS_EXISTING_IDENTITY_TOTP_SECRET",
      "QA_CMS_EXISTING_IDENTITY_USER_ID",
      "existingIdentityRevokedAndBanned",
      "rdoAccessInactive",
    ]) {
      expect(fixture).toContain(marker);
    }
    expect(fixture).toContain("syntheticUsers: fixtureActorIds(state).length");
    expect(fixture).toContain("QA_CMS_PROVISION_AUTH_LIFECYCLE");
    expect(fixture).not.toMatch(/existingIdentity(?:Email|Password|Totp|Secret)\s*:/);
  });

  it("drives the existing-identity invite, AAL2 login, isolation and teardown through real UI", () => {
    for (const marker of [
      "signInWithoutCmsProfile",
      "Acesso administrativo não autorizado",
      "O acesso ao RDO não concede acesso administrativo.",
      'waitForEdgeAction(page, "cms-users", "invite")',
      'invitationDelivery: "existing_identity"',
      "configuration.existingIdentityUserId",
      "await signInWithAal2(",
      "expect(rdoAfterInvite).toEqual(rdoBaseline)",
      "expect(unauthorizedCmsMutation.status).toBe(403)",
      "expect(await ownRdoAccess(existingPage, configuration)).toEqual(rdoBaseline)",
      "expect(await ownRdoAccess(suspendedExistingPage, configuration)).toEqual(rdoBaseline)",
      '"Revogar sessões"',
      '"Suspender"',
      "existing_auth_identity_cms_invite_aal2_rdo_isolation",
      "identificadores e credenciais omitidos",
      'rawBrowserArtifacts: "disabled"',
      "noSecretsPersisted: true",
    ]) {
      expect(browserCycle).toContain(marker);
    }
    expect(browserCycle).toContain("test.setTimeout(15 * 60_000)");
    expect(browserCycle).not.toMatch(/console\.(?:log|error|warn)\s*\(/);
  });

  it("keeps CMS suspension, reactivation and session revocation out of shared Auth bans", () => {
    expect(cmsUsers).not.toMatch(/ban_duration|updateUserById\s*\(/);
    expect(cmsUsers).toContain('admin.rpc("cms_apply_user_command_scoped"');
    expect(identityMigration).toContain("cms_invalidate_sessions_on_reactivation");
    expect(identityMigration).toContain("new.sessions_valid_after := clock_timestamp()");
    expect(browserCycle).toContain("expectCmsAccessDeniedAfterAuthentication");
    expect(browserCycle).toContain("CMS suspenso sem alterar RDO");
  });
});
