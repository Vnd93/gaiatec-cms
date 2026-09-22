import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0104_cms_progressive_draft_terminal_cleanup.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_progressive_draft_terminal_cleanup.test.sql", "utf8");
const manifest = readFileSync("scripts/ev2/phase12/migration-manifest-lib.mjs", "utf8");
const compatibility = readFileSync("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs", "utf8");
const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
const stagingVerifier = readFileSync("scripts/ev2/phase12/verify-staging-database.mjs", "utf8");
const productionVerifier = readFileSync("scripts/ev2/phase12/verify-production-database.mjs", "utf8");

describe("progressive draft terminal cleanup", () => {
  it("discards only exact active QA drafts and preserves immutable evidence", () => {
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("from private.cms_qa_actor_leases lease");
    expect(migration).toContain("for update;");
    expect(migration).toContain("draft.created_at not between v_lease.created_at and v_lease.expires_at");
    expect(migration).toContain("draft.promoted_at is not null");
    expect(migration).toContain("update public.cms_content_drafts_v2 draft");
    expect(migration).toContain("insert into public.cms_draft_v2_events");
    expect(migration).toContain("insert into public.cms_audit_log");
    expect(migration).toContain("'cms:qa.progressive_drafts.compensated'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.cms_content_drafts_v2/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.cms_draft_v2_events/i);
  });

  it("keeps both privileged functions owner-only with an empty search path", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("pg_catalog.gen_random_uuid()");
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("revoke all on function private.cms_compensate_qa_progressive_drafts_0104(");
    expect(migration).toContain(
      "revoke all on function private.cms_cleanup_terminal_progressive_drafts_0104()",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("orders the trigger before broad compensation and repairs only terminal residue", () => {
    expect(migration).toContain("cms_01_progressive_draft_terminal_cleanup_0104");
    expect(migration).toContain("before update of status on private.cms_qa_actor_leases");
    expect(migration).toContain("old.status = 'active'");
    expect(migration).toContain("new.status in ('cleaned', 'expired')");
    expect(migration).toContain("where lease.status in ('cleaned', 'expired')");
    expect(migration).toContain("and draft.status = 'active'");
    expect(migration).toContain("CMS_QA_DRAFT_V2_TERMINAL_RESIDUE_PRESENT");
  });

  it("is pinned, compatibility-covered and remotely attested", () => {
    expect(manifest).toContain('version: "0104"');
    expect(manifest).toContain('file: "0104_cms_progressive_draft_terminal_cleanup.sql"');
    expect(manifest).toContain("progressiveDraftTerminalCleanupSemanticSql");
    expect(compatibility).toContain('"0104"');
    expect(compatibility).toContain("supabase/tests/rls_cms_progressive_draft_terminal_cleanup.test.sql");
    expect(compatibility).toContain("tests/contracts/cms-progressive-draft-terminal-cleanup.test.ts");
    for (const verifier of [canary, stagingVerifier, productionVerifier]) {
      expect(verifier).toContain("progressiveDraftTerminalCleanupSemanticSql");
      expect(verifier).toContain("progressive_draft_terminal_cleanup_0104_semantics_exact");
      expect(verifier).toContain("progressive_draft_terminal_cleanup_0104_functions_locked");
    }
  });

  it("proves atomic cleanup, isolation, replay safety and failure closure in pgTAP", () => {
    for (const proof of [
      "all active progressive drafts owned by the terminal actor are discarded",
      "every compensated draft appends one immutable discarded event",
      "a same-run peer actor remains untouched",
      "an ordinary actor remains untouched",
      "terminal replay does not duplicate discarded events",
      "cross-owner progressive state fails closed before terminalization",
      "no exact terminal lease retains active progressive draft residue",
    ]) {
      expect(pgTap).toContain(proof);
    }
  });
});
