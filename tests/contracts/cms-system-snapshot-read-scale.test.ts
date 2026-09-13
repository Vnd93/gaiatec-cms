import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0095_cms_system_snapshot_read_scale.sql");
const migration = readFileSync(migrationPath, "utf8");
const edge = readFileSync(path.join(root, "supabase/functions/cms-system/index.ts"), "utf8");

describe("CMS system snapshot read scale", () => {
  it("prefilters the exact active QA run but retains every deep scope predicate", () => {
    expect(migration).toContain("with candidate_publications as materialized");
    expect(migration).toContain("with candidates as materialized");
    expect(migration).toContain("owner.run_tag = v_run_tag");
    expect(migration).toContain("owner.candidate_sha = v_candidate_sha");
    expect(migration).toContain("owner.environment = v_lease_environment");
    expect(migration).toContain("owner.status = 'active'");
    expect(migration).toContain("item.created_at between owner.created_at and owner.expires_at");
    expect(migration).toContain("private.cms_content_item_graph_scope_allowed(");
    expect(migration).toContain("private.cms_lead_scope_allowed(");
    expect(migration).toContain("private.cms_crb_task_scope_allowed(");
    expect(migration).toContain("private.cms_user_audit_actor_scope_allowed(");
  });

  it("keeps the complete corporate snapshot path unchanged in scope", () => {
    expect(migration).toMatch(/else[\s\S]+audit\.actor_id is null or not private\.cms_system_actor_ever_qa/);
    expect(migration).toContain("item.content_type in ('navigation', 'site_settings')");
    expect(migration).toContain("'gateDecision', 'non_authoritative'");
    expect(migration).not.toMatch(/drop table|truncate|delete from|default_enabled\s*=\s*true/i);
  });

  it("derives the measured read identity from PostgREST's verified JWT", () => {
    expect(migration).toContain("create or replace function public.cms_get_system_snapshot_authenticated(");
    expect(migration).toContain("v_actor_id uuid := auth.uid()");
    expect(migration).toContain("v_session_id text := auth.jwt() ->> 'session_id'");
    expect(migration).toContain("v_issued_raw text := auth.jwt() ->> 'iat'");
    expect(migration).toContain("public.cms_get_system_snapshot_limited(");
    expect(migration).toMatch(
      /revoke all on function public\.cms_get_system_snapshot_authenticated[\s\S]+from public, anon, service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cms_get_system_snapshot_authenticated[\s\S]+to authenticated/,
    );
  });

  it("uses the fused authenticated boundary only for the measured snapshot", () => {
    expect(edge).toContain('rpc("cms_get_system_snapshot_authenticated"');
    expect(edge).toContain('rpc("cms_system_capability_limited"');
    expect(edge).toContain('rpc("cms_execute_system_command_limited"');
    expect(edge).toContain("authenticateCms(req)");
    expect(edge).toContain('databaseMarker === "CMS_SYSTEM_AUTH_INVALID"');
    expect(edge).not.toContain('rpc("cms_get_system_snapshot_limited"');
  });

  it("is registered as the sealed migration tail", () => {
    const files = readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(files.at(-1)).toBe("0095_cms_system_snapshot_read_scale.sql");
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    expect(manifest).toContain("0095_cms_system_snapshot_read_scale.sql");
    expect(manifest).toContain(digest);
    const policy = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(policy).toContain('"0095"');
    expect(policy).toContain("supabase/tests/rls_cms_system_snapshot_read_scale.test.sql");
  });
});
