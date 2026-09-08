import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/cms-recovery/index.ts", "utf8");
const authContext = readFileSync("src/admin/auth/AdminAuthContext.tsx", "utf8");
const backend = readFileSync("scripts/ev2/phase12/production-backend-lib.mjs", "utf8");
const inventory = readFileSync("scripts/qa/cms-coverage-inventory.mjs", "utf8");

describe("CMS-only public recovery boundary", () => {
  it("routes the public form through the dedicated generic Edge Function", () => {
    expect(authContext).toContain("/functions/v1/cms-recovery");
    expect(authContext).not.toContain("supabase.auth.resetPasswordForEmail");
    expect(authContext).toContain("body: JSON.stringify({ email: email.trim().toLowerCase() })");
  });

  it("touches Auth only for one exact invited or active CMS profile", () => {
    expect(edge).toContain('.from("cms_profiles")');
    expect(edge).toContain('.in("status", ["invited", "active"])');
    expect(edge).toContain("profiles.data.length !== 1");
    expect(edge).toContain("admin.auth.admin.getUserById(profile.user_id)");
    expect(edge).toContain("identity.data.user?.email?.toLowerCase() !== email");
    expect(edge).toContain("mailer.auth.resetPasswordForEmail(email");
    expect(edge.indexOf("profiles.data.length !== 1")).toBeLessThan(
      edge.indexOf("mailer.auth.resetPasswordForEmail(email"),
    );
  });

  it("is origin-bound, rate-limited and non-enumerating without sensitive audit payloads", () => {
    expect(edge).toContain("isAllowedOrigin(req)");
    expect(edge).toContain("exactConfiguredOrigin(req)");
    expect(edge).toContain('"cms_recovery_address"');
    expect(edge).toContain('"cms_recovery_identity"');
    expect(edge).toContain("GENERIC_RESPONSE, 202");
    expect(edge.match(/GENERIC_RESPONSE, 202/g)?.length).toBeGreaterThanOrEqual(3);
    expect(edge).toContain("redirectTo: `${adminOrigin}/admin/definir-senha`");
    const requestedAudit = edge.indexOf('action: "cms:auth.recovery_requested"');
    const delivery = edge.indexOf("mailer.auth.resetPasswordForEmail(email");
    expect(requestedAudit).toBeGreaterThanOrEqual(0);
    expect(requestedAudit).toBeLessThan(delivery);
    expect(edge).toContain("if (requestedAudit.error)");
    expect(edge).toContain('action: "cms:auth.recovery_delivery_failed"');
    expect(edge).toContain("if (failureAudit.error)");
    expect(edge).not.toMatch(/event_data:\s*\{[^}]*email/s);
    expect(edge).not.toMatch(/console\.(?:log|error|warn)/);
  });

  it("deploys cms-recovery as a public no-JWT function and classifies its consumer", () => {
    expect(backend).toMatch(/PUBLIC_FUNCTIONS[\s\S]*"cms-recovery"/);
    expect(backend).toMatch(/PRODUCTION_FUNCTIONS[\s\S]*"cms-recovery"/);
    expect(inventory).toMatch(/recovery:[\s\S]*edgeFunctions: \["cms-recovery"\]/);
  });
});
