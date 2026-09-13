import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0096_cms_qa_content_cleanup_scale.sql");
const migration = readFileSync(migrationPath, "utf8");
const pgTapPath = path.join(root, "supabase/tests/rls_cms_qa_content_cleanup_scale.test.sql");
const pgTap = readFileSync(pgTapPath, "utf8");

describe("CMS QA content cleanup scale", () => {
  it("adds the exact covering owner/status index without changing data or access control", () => {
    expect(migration).toMatch(
      /create index if not exists cms_content_items_created_by_workflow_idx\s+on public\.cms_content_items \(created_by, workflow_status\)\s+include \(id\)/,
    );
    expect(migration).not.toMatch(/^\s*(?:delete|insert|update|truncate|alter)\s/im);
    expect(migration).not.toMatch(/\b(?:grant|revoke)\b|row level security/i);
  });

  it("fails the migration if the named index is absent, invalid or has a different shape", () => {
    expect(migration).toContain("CMS_QA_CONTENT_CLEANUP_INDEX_INVALID");
    expect(migration).toContain("index_row.indisvalid");
    expect(migration).toContain("index_row.indisready");
    expect(migration).toContain("index_row.indnkeyatts = 2");
    expect(migration).toContain("index_row.indnatts = 3");
    expect(migration).toContain("pg_catalog.pg_get_indexdef(v_index, 1, false) <> 'created_by'");
    expect(migration).toContain("pg_catalog.pg_get_indexdef(v_index, 2, false) <> 'workflow_status'");
    expect(migration).toContain("pg_catalog.pg_get_indexdef(v_index, 3, false) <> 'id'");
  });

  it("proves the cleanup remains exact, idempotent and closed to browser roles", () => {
    expect(pgTap).toContain("has_table_privilege('anon', 'public.cms_content_items', 'UPDATE')");
    expect(pgTap).toContain("has_table_privilege('authenticated', 'public.cms_content_items', 'UPDATE')");
    expect(pgTap).toContain("has_table_privilege('service_role', 'public.cms_content_items', 'UPDATE')");
    expect(pgTap).toContain("item.created_by = '96000000-0000-4000-8000-000000000001'");
    expect(pgTap).toContain("item.workflow_status <> 'archived'");
    expect(pgTap).toContain("replaying the same cleanup is idempotent");
    expect(pgTap).toContain("cleanup does not archive content owned by another actor");
    expect(pgTap).toContain("cleanup does not rewrite an already archived tombstone");
  });

  it("remains sealed after later append-only migrations", () => {
    const files = readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(files).toContain("0096_cms_qa_content_cleanup_scale.sql");
    expect(files.indexOf("0096_cms_qa_content_cleanup_scale.sql")).toBeLessThan(
      files.indexOf("0097_cms_ai_private_model_transition.sql"),
    );
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    expect(manifest).toContain("0096_cms_qa_content_cleanup_scale.sql");
    expect(manifest).toContain(digest);
    const policy = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(policy).toContain('"0096"');
    expect(policy).toContain("supabase/tests/rls_cms_qa_content_cleanup_scale.test.sql");
    expect(policy).toContain("tests/contracts/cms-qa-content-cleanup-scale.test.ts");
  });
});
