import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0119_cms_audit_qa_candidate_prefilter.sql", "utf8");

describe("audit QA candidate prefilter", () => {
  it("adds a cached candidate conjunction without replacing any original guard", () => {
    expect(migration).toContain("(select public.cms_audit_session_scope_allowed())");
    expect(migration).toContain("(select public.cms_audit_corporate_session_allowed())");
    expect(migration).toContain("actor_id=any((select public.cms_audit_qa_candidate_actor_ids())::uuid[])");
    expect(migration).toContain("and public.cms_audit_event_row_allowed(actor_id)");
    expect(migration).not.toMatch(/disable row level security|drop policy|update public.cms_audit_log/i);
  });

  it("derives candidates only from authoritative active exact-run leases", () => {
    for (const required of [
      "caller.actor_id=(select auth.uid())",
      "target.run_tag=caller.run_tag",
      "target.candidate_sha=caller.candidate_sha",
      "target.environment=caller.environment",
      "caller.status='active' and target.status='active'",
      "caller.expires_at>statement_timestamp()",
      "target.expires_at>statement_timestamp()",
      "private.cms_user_actor_target_scope_allowed(",
    ])
      expect(migration).toContain(required);
    expect(migration).not.toMatch(/user_metadata|request.jwt.claims|set_config/);
    expect(migration).toContain("from public,anon,authenticated,service_role;");
    expect(migration).toContain("to authenticated;");
  });

  it("seals the reviewed migration and helper body in the remote semantic gate", () => {
    const manifest = readFileSync("scripts/ev2/phase12/migration-manifest-lib.mjs", "utf8");
    const body = migration.split("as $$")[1].split("$$;")[0];
    expect(manifest).toContain(createHash("sha256").update(migration).digest("hex"));
    expect(manifest).toContain(createHash("sha256").update(body).digest("hex"));
    expect(manifest).toContain("auditQaCandidatePrefilterSemanticSql");
    expect(manifest).toContain("p.prorettype='uuid[]'::regtype");
    expect(manifest).toContain("pg_catalog.aclexplode");
  });
});
