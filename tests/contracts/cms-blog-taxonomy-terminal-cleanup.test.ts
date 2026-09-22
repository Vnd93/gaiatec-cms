import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0106_cms_blog_taxonomy_terminal_cleanup.sql", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_blog_taxonomy_terminal_cleanup.test.sql", "utf8");
const manifest = readFileSync("scripts/ev2/phase12/migration-manifest-lib.mjs", "utf8");
const compatibility = readFileSync("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs", "utf8");
const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");
const stagingVerifier = readFileSync("scripts/ev2/phase12/verify-staging-database.mjs", "utf8");
const productionVerifier = readFileSync("scripts/ev2/phase12/verify-production-database.mjs", "utf8");

describe("CMS blog taxonomy terminal cleanup", () => {
  it("removes only taxonomy owned by the exact terminal QA group", () => {
    for (const marker of [
      "private.cms_qa_actor_marker_is_exact(",
      "creator.run_tag = p_run_tag",
      "updater.run_tag = p_run_tag",
      "author.created_at between creator.created_at and creator.expires_at",
      "category.created_at between creator.created_at and creator.expires_at",
      "tag.created_at between creator.created_at and creator.expires_at",
      "delete from public.cms_blog_authors",
      "delete from public.cms_blog_categories",
      "delete from public.cms_blog_tags",
      "'cms:qa.blog_taxonomy.compensated'",
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("defers for every active peer regardless of TTL and fails closed on references", () => {
    expect(migration).toContain("peer.status = 'active'");
    expect(migration).not.toMatch(/peer\.status = 'active'[\s\S]{0,160}peer\.expires_at/i);
    expect(migration).toContain("CMS_QA_BLOG_TAXONOMY_REFERENCE_ACTIVE");
    expect(migration).toContain("CMS_QA_BLOG_TAXONOMY_REFERENCE_AMBIGUOUS");
    expect(migration).toContain("CMS_QA_BLOG_TAXONOMY_SCOPE_AMBIGUOUS");
    expect(migration).toContain("CMS_QA_BLOG_TAXONOMY_CLEANUP_INCOMPLETE");
    expect(migration).toContain("CMS_QA_BLOG_TAXONOMY_TERMINAL_RESIDUE_PRESENT");
    expect(migration).toContain("from public.cms_content_draft_snapshots snapshot");
    expect(migration).toContain("snapshot.displaced_by as reference_actor_id");
    expect(migration).toContain("reference.reference_at between reference_actor.created_at");
    expect(migration).toContain("for update;");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(migration).toContain("cms-qa-blog-taxonomy-group:");
    expect(migration).not.toContain("pg_catalog.pg_try_advisory_xact_lock(");
  });

  it("keeps both SECURITY DEFINER functions owner-only with an empty search path", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain("revoke all on function private.cms_cleanup_qa_blog_taxonomy_0106(");
    expect(migration).toContain(
      "revoke all on function private.cms_cleanup_terminal_qa_blog_taxonomy_0106()",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("orders terminal cleanup after content and before the remaining terminal lanes", () => {
    expect(migration).toContain("zzy_cms_cleanup_qa_blog_taxonomy_0106");
    expect(migration).toContain("before update of status on private.cms_qa_actor_leases");
    expect(migration).toContain("old.status = 'active'");
    expect(migration).toContain("new.status in ('cleaned', 'expired')");
    expect(migration).toContain("active_peer.status = 'active'");
    expect(migration).not.toMatch(/active_peer\.status = 'active'[\s\S]{0,160}active_peer\.expires_at/i);
  });

  it("is pinned, compatibility-covered and attested by every remote verifier", () => {
    expect(manifest).toContain('version: "0106"');
    expect(manifest).toContain('file: "0106_cms_blog_taxonomy_terminal_cleanup.sql"');
    expect(manifest).toContain("blogTaxonomyTerminalCleanupSemanticSql");
    expect(compatibility).toContain('"0106": [');
    expect(compatibility).toContain('"supabase/tests/rls_cms_blog_taxonomy_terminal_cleanup.test.sql"');
    expect(compatibility).toContain('"tests/contracts/cms-blog-taxonomy-terminal-cleanup.test.ts"');
    for (const verifier of [canary, stagingVerifier, productionVerifier]) {
      expect(verifier).toContain("blogTaxonomyTerminalCleanupSemanticSql");
      expect(verifier).toContain("blog_taxonomy_terminal_cleanup_0106_functions_locked");
      expect(verifier).toContain("blog_taxonomy_terminal_cleanup_0106_semantics_exact");
    }
  });

  it("proves TTL independence, exact cleanup, reuse, isolation and replay safety in pgTAP", () => {
    expect(pgTap).toContain("select plan(36);");
    for (const proof of [
      "same-run peer remains active even with expired TTL",
      "terminal group leaves zero author category or tag residue",
      "ordinary corporate taxonomy remains untouched",
      "partial cross-scope taxonomy ownership fails closed while the lease remains active",
      "uppercase structural UUID reference blocks taxonomy deletion while content is active",
      "malformed structural taxonomy UUID fails closed without deleting the exact group",
      "active draft snapshot blocks taxonomy deletion",
      "archived cross-scope child reference blocks taxonomy deletion",
      "archived same-run snapshot remains as history without blocking cleanup",
      "consecutive run can reuse the fixed regression slugs without collision",
      "terminal replay does not duplicate taxonomy compensation evidence",
      "mismatched run SHA or environment fails closed",
      "no exact terminal lease group retains author category or tag residue",
    ]) {
      expect(pgTap).toContain(proof);
    }
  });
});
