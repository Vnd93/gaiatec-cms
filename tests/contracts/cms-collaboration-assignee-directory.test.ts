import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0081_cms_collaboration_assignee_directory.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-collaboration/index.ts", "utf8");
const workPage = readFileSync("src/admin/pages/AdminWorkPage.tsx", "utf8");

describe("governed collaboration assignee directory", () => {
  it("authorizes assignment and fences the authoritative actor scope", () => {
    expect(migration).toContain("cms_list_collaboration_assignees");
    expect(migration).toContain("'cms:collaboration.assign'");
    expect(migration).toContain("cms_ev2_collaboration_enabled");
    expect(migration).toContain("cms_crb_actor_identity_scope_allowed");
    expect(migration.match(/cms_crb_lock_actor_scope/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("profile.status = 'active'");
  });

  it("keeps the RPC service-only and returns names without contact data", () => {
    expect(migration).toMatch(
      /revoke all on function public\.cms_list_collaboration_assignees[\s\S]*authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cms_list_collaboration_assignees[\s\S]*service_role/,
    );
    expect(migration).toContain("'displayName', profile.display_name");
    expect(migration).not.toContain("display_email");
    expect(migration).not.toContain("auth.users.email");
  });

  it("routes the selector through the guarded Edge Function", () => {
    expect(edge).toContain('"assignees"');
    expect(edge).toContain('rpc("cms_list_collaboration_assignees"');
    expect(workPage).toContain('action: "assignees"');
    expect(workPage).not.toContain('.from("cms_profiles")');
    expect(workPage).not.toContain("display_email");
  });
});
