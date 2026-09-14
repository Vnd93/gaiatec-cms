import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0099_cms_system_snapshot_open_critical_scale.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("CMS system snapshot open-critical scale", () => {
  it("adds only the exact partial index used by the snapshot", () => {
    expect(migration).toMatch(
      /create index if not exists cms_operational_events_open_critical_id_idx\s+on public\.cms_operational_events \(id\)\s+where severity = 'critical' and resolved_at is null;/,
    );
    expect(migration.match(/\bcreate index\b/gi)).toHaveLength(1);
    expect(migration).not.toMatch(
      /\b(?:create or replace|drop|truncate|alter|insert|update|delete|grant|revoke)\b/i,
    );
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("keeps structural, snapshot-scope and anonymous-boundary coverage executable", () => {
    const databaseTest = readFileSync(
      path.join(root, "supabase/tests/rls_cms_system_snapshot_open_critical_scale.test.sql"),
      "utf8",
    );
    const planned = Number(/select plan\((\d+)\);/.exec(databaseTest)?.[1]);
    const asserted = databaseTest.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(databaseTest).toContain("create extension if not exists pgtap with schema extensions;");
    expect(databaseTest).toContain("set local search_path = public, extensions;");
    expect(databaseTest).toContain("cms_operational_events_open_critical_id_idx");
    expect(databaseTest).toContain("severity=''critical''::textandresolved_atisnull");
    expect(databaseTest).toContain("private.cms_system_operational_event_scope_allowed");
    expect(databaseTest).toContain("has_table_privilege('anon'");
  });

  it("is sealed and required with the complete G11 behavior suite", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    const forwardCompatibility = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(manifest).toContain("0099_cms_system_snapshot_open_critical_scale.sql");
    expect(manifest).toContain(digest);
    expect(forwardCompatibility).toContain('"0099"');
    expect(forwardCompatibility).toContain(
      "supabase/tests/rls_cms_system_snapshot_open_critical_scale.test.sql",
    );
    expect(forwardCompatibility).toContain("supabase/tests/rls_ev2_phase11_system.test.sql");
    expect(forwardCompatibility).toContain("tests/contracts/cms-system-snapshot-open-critical-scale.test.ts");
  });

  it("requires the exact index semantics in every remote database verifier", () => {
    for (const verifierPath of [
      "scripts/ev2/phase12/staging-migrations-canary.mjs",
      "scripts/ev2/phase12/verify-staging-database.mjs",
      "scripts/ev2/phase12/verify-production-database.mjs",
    ]) {
      const verifier = readFileSync(path.join(root, verifierPath), "utf8");
      expect(verifier).toContain("systemSnapshotOpenCriticalScaleSemanticSql");
      expect(verifier).toContain(
        'systemSnapshotOpenCriticalScaleSemanticSql("system_snapshot_open_critical_scale_0099_semantics_exact")',
      );
      if (verifierPath.endsWith("staging-migrations-canary.mjs")) {
        expect(verifier).toContain("row?.system_snapshot_open_critical_scale_0099_semantics_exact === true");
      } else {
        const checks = verifier.slice(verifier.indexOf("const checks = ["));
        expect(checks).toContain('"system_snapshot_open_critical_scale_0099_semantics_exact"');
      }
    }
  });
});
