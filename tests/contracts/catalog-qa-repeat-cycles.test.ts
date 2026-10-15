import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0122_cms_catalog_qa_repeat_cycles.sql", "utf8");
const sqlTests = readFileSync("supabase/tests/rls_catalog_qa_repeat_cycles.test.sql", "utf8");

describe("successive isolated catalog QA cycles", () => {
  it("keeps one open manifest, historical evidence and lifetime actor uniqueness", () => {
    expect(migration).toContain("where state<>'cleaned'");
    expect(migration).toContain("on private.cms_catalog_qa_recovery_actors(actor_id)");
    expect(migration).not.toMatch(/delete from|truncate|disable trigger|grant .* to/i);
    expect(migration).toContain("cms.catalog.workspace");
  });
  it("terminalizes only the actor-bound manifest with exact private lease", () => {
    for (const guard of [
      "a.actor_id=old.actor_id",
      "a.lease_created_at=old.created_at",
      "a.lease_expires_at=old.expires_at",
      "m.candidate_sha=old.candidate_sha",
      "m.environment=old.environment",
      "m.state='prepared'",
      "CMS_CATALOG_RECOVERY_TERMINAL_BINDING_MISMATCH",
    ])
      expect(migration).toContain(guard);
    expect(migration).toContain("from public,anon,authenticated,service_role");
  });
  it("tests repeat cycles without substituting rollback fixtures for hosted UAT", () => {
    for (const proof of [
      "one nonterminal manifest",
      "closed actor cannot be enrolled again",
      "repeat cycle still requires a prior committed manifest",
      "second terminal trigger selects the new manifest",
      "global catalog flag remains disabled",
    ])
      expect(sqlTests).toContain(proof);
    expect(sqlTests).toMatch(/rollback;\s*$/);
  });
});
