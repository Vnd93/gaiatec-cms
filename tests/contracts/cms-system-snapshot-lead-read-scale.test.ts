import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0100_cms_system_snapshot_lead_read_scale.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("CMS system snapshot lead read scale", () => {
  it("adds only the four exact lead foreign-key indexes used by G11", () => {
    for (const [table, index] of [
      ["cms_lead_consents", "cms_lead_consents_lead_id_idx"],
      ["cms_lead_status_history", "cms_lead_status_history_lead_id_idx"],
      ["cms_lead_outbox", "cms_lead_outbox_lead_id_idx"],
      ["cms_lead_outbox_replays", "cms_lead_outbox_replays_lead_id_idx"],
    ])
      expect(migration).toMatch(
        new RegExp(`create index if not exists ${index}\\s+on public\\.${table} \\(lead_id\\);`),
      );
    expect(migration.match(/\bcreate index\b/gi)).toHaveLength(4);
    expect(migration).not.toMatch(
      /\b(?:create or replace|drop|truncate|alter|insert|update|delete|grant|revoke)\b/i,
    );
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("keeps the index shape, snapshot predicates and access boundary executable", () => {
    const databaseTest = readFileSync(
      path.join(root, "supabase/tests/rls_cms_system_snapshot_lead_read_scale.test.sql"),
      "utf8",
    );
    const planned = Number(/select plan\((\d+)\);/.exec(databaseTest)?.[1]);
    const asserted = databaseTest.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(databaseTest).toContain("index_record.indisvalid");
    expect(databaseTest).toContain("index_record.indisready");
    expect(databaseTest).toContain("attribute.attname = 'lead_id'");
    expect(databaseTest).toContain("private.cms_lead_scope_allowed");
    expect(databaseTest).toContain("replay.lead_id = lead.id");
    expect(databaseTest).toContain("has_table_privilege('anon'");
  });

  it("is sealed and required with the complete G11 behavior suite", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    const forwardCompatibility = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(manifest).toContain("0100_cms_system_snapshot_lead_read_scale.sql");
    expect(manifest).toContain(digest);
    expect(forwardCompatibility).toContain('"0100"');
    expect(forwardCompatibility).toContain("supabase/tests/rls_cms_system_snapshot_lead_read_scale.test.sql");
    expect(forwardCompatibility).toContain("supabase/tests/rls_ev2_phase11_system.test.sql");
    expect(forwardCompatibility).toContain("tests/contracts/cms-system-snapshot-lead-read-scale.test.ts");
  });

  it("requires the exact index semantics in every remote database verifier", () => {
    for (const verifierPath of [
      "scripts/ev2/phase12/staging-migrations-canary.mjs",
      "scripts/ev2/phase12/verify-staging-database.mjs",
      "scripts/ev2/phase12/verify-production-database.mjs",
    ]) {
      const verifier = readFileSync(path.join(root, verifierPath), "utf8");
      expect(verifier).toContain("systemSnapshotLeadReadScaleSemanticSql");
      expect(verifier).toContain(
        'systemSnapshotLeadReadScaleSemanticSql("system_snapshot_lead_read_scale_0100_semantics_exact")',
      );
      if (verifierPath.endsWith("staging-migrations-canary.mjs")) {
        expect(verifier).toContain("row?.system_snapshot_lead_read_scale_0100_semantics_exact === true");
      } else {
        const checks = verifier.slice(verifier.indexOf("const checks = ["));
        expect(checks).toContain('"system_snapshot_lead_read_scale_0100_semantics_exact"');
      }
    }
  });
});
