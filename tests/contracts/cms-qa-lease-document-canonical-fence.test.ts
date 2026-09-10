import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0090_cms_qa_lease_document_canonical_fence.sql", "utf8");
const lease = readFileSync("supabase/migrations/0061_cms_qa_actor_lease_watchdog.sql", "utf8");
const fence = readFileSync("supabase/migrations/0063_cms_document_security_attestation.sql", "utf8");
const database = readFileSync("supabase/tests/rls_cms_qa_lease_document_canonical_fence.test.sql", "utf8");
const handler = readFileSync("supabase/functions/cms-documents/index.ts", "utf8");
const canary = readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8");

describe("qa lease document canonical fence", () => {
  it("documents the two rules that could not both be satisfied", () => {
    // 0061 demanded the removed disposition to close a synthetic actor's lease.
    expect(lease).toContain("document.blob_disposition <> 'removed'");
    // 0063 refuses that exact transition until the canonical deadline has passed.
    expect(fence).toContain("CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE");
    expect(fence).toContain("interval '30 minutes'");
  });

  it("accepts the fenced state only while the fence is genuinely active", () => {
    expect(migration).toMatch(
      /blob_disposition = 'access_revoked'[\s\S]*?canonical_cleanup_not_before is not null[\s\S]*?canonical_cleanup_not_before > v_now/,
    );
    // A deadline already in the past means the reconciler failed rather than was forbidden, and that
    // is real residue: the lease must keep refusing it.
    expect(migration).not.toContain("canonical_cleanup_not_before <= v_now");
    expect(migration).not.toContain("canonical_cleanup_not_before is null");
  });

  it("loosens nothing else about what a clean actor means", () => {
    for (const requirement of [
      "processing_status <> 'neutralized'",
      "upload_disposition not in ('guarded', 'removed')",
      "CMS_QA_ACTOR_CLEANUP_INCOMPLETE",
      "banned_until > v_now",
      "from auth.sessions session",
    ])
      expect(migration).toContain(requirement);
    expect(migration).toContain(
      "grant execute on function public.cms_complete_qa_actor_lease(uuid,text,text,text) to service_role;",
    );
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("fails closed if the replacement did not land or widened access", () => {
    expect(migration).toContain("CMS_QA_LEASE_DOCUMENT_FENCE_NOT_APPLIED");
    expect(migration).toContain("CMS_QA_LEASE_DOCUMENT_CONTRACT_WEAKENED");
    expect(migration).toContain("CMS_QA_LEASE_PRIVILEGE_WIDENED");
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("stops reporting the fence as a cleanup failure", () => {
    // The handler used to record database_confirm_failed and answer 503 for the one outcome the
    // database is designed to produce, which made a successful neutralization look broken.
    expect(handler).toContain("CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE");
    expect(handler).toContain("canonicalCleanupScheduled");
    const neutralize = handler.slice(handler.indexOf("async function neutralizeSynthetic"));
    // The storage removal keeps its own failure recording; only the confirmation branch changes, so
    // the fence has to be recognised before database_confirm_failed is ever written.
    const confirmFailure = neutralize.indexOf('"database_confirm_failed"');
    expect(confirmFailure).toBeGreaterThan(0);
    expect(neutralize.indexOf("CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE")).toBeLessThan(confirmFailure);
  });

  it("makes the canary assert the outcome instead of accepting any pending state", () => {
    const closer = canary.slice(canary.indexOf("async function closeDocumentFixture()"));
    // Accepting a bare 503 made the check unfalsifiable for the very condition the teardown enforces.
    expect(closer.slice(0, 1600)).not.toContain("CMS_DOCUMENT_BLOB_REMOVAL_PENDING");
    expect(closer.slice(0, 1600)).toContain("canonicalCleanupScheduled");
    expect(closer.slice(0, 1600)).toMatch(/allowed: \[200\]/);
  });

  it("declares as many pgTAP assertions as it actually runs", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(database)?.[1]);
    const asserted = database.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(asserted).toBeGreaterThan(0);
    expect(planned).toBe(asserted);
  });
});
