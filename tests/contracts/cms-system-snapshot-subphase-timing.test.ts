import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0102_cms_system_snapshot_subphase_timing.sql");
const migration = readFileSync(migrationPath, "utf8");
const edge = readFileSync(path.join(root, "supabase/functions/cms-system/index.ts"), "utf8");
const canary = readFileSync(path.join(root, "scripts/ev2/phase11/staging-canary.mjs"), "utf8");

describe("CMS system snapshot subphase timing", () => {
  it("adds a rollback-compatible authenticated boundary without replacing the old RPC", () => {
    expect(migration).toContain("create function public.cms_get_system_snapshot_authenticated_timed(");
    expect(migration).not.toContain(
      "create or replace function public.cms_get_system_snapshot_authenticated(",
    );
    expect(migration).toContain("v_actor_id uuid := auth.uid()");
    expect(migration).toContain("v_session_id text := auth.jwt() ->> 'session_id'");
    expect(migration).toContain("extensions.digest(");
    expect(migration.match(/public\.consume_rate_limit\(/g)).toHaveLength(1);
    expect(migration.match(/v_snapshot := public\.cms_get_system_snapshot\(/g)).toHaveLength(1);
    expect(migration.indexOf("public.consume_rate_limit(")).toBeLessThan(
      migration.indexOf("v_snapshot := public.cms_get_system_snapshot("),
    );
    expect(migration).toContain("'cms_system_snapshot'");
    expect(migration).toMatch(/'cms_system_snapshot',\s+120,\s+900/);
  });

  it("exposes only bounded numeric subphase timings through an internal envelope", () => {
    expect(migration).toContain("'schemaVersion', 1");
    expect(migration).toContain("'snapshot', v_snapshot");
    expect(migration).toContain("'rateLimitMs', v_rate_limit_ms");
    expect(migration).toContain("'snapshotCoreMs', v_snapshot_core_ms");
    expect(migration).toMatch(/greatest\(\s+0::bigint,/g);
    expect(migration).not.toMatch(/sessionId|session_id_hash|actorId|email|token|secret/i);
    expect(migration).not.toMatch(/drop table|truncate|delete from|alter table/i);
  });

  it("keeps an exact authenticated-only ACL", () => {
    expect(migration).toMatch(
      /revoke all on function public\.cms_get_system_snapshot_authenticated_timed\(text,text,uuid\)[\s\S]+from public, anon, service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cms_get_system_snapshot_authenticated_timed\(text,text,uuid\)[\s\S]+to authenticated/,
    );
  });

  it("unwraps and validates timing before returning the unchanged snapshot payload", () => {
    const snapshotBranch = edge.slice(
      edge.indexOf('if (command.action === "snapshot")'),
      edge.indexOf("const identity = await authenticateCms(req)"),
    );
    expect(snapshotBranch).toContain('rpc("cms_get_system_snapshot_authenticated_timed"');
    expect(snapshotBranch).toContain("SnapshotTimingEnvelope.safeParse(data)");
    expect(edge).toContain("snapshot: z.record(z.string(), z.unknown())");
    expect(snapshotBranch).toContain("return json(req, timedSnapshot.data.snapshot, 200");
    expect(snapshotBranch).toContain("admin-rate-limit;dur=");
    expect(snapshotBranch).toContain("admin-snapshot-db;dur=");
    expect(snapshotBranch).not.toMatch(/return json\(req,\s*data,\s*200/);
  });

  it("adds diagnostic vectors without changing the normative gate or sampling protocol", () => {
    expect(canary).toContain("const adminReadSamples = 20;");
    expect(canary).toContain("const adminReadWarmups = adminReadSamples;");
    expect(canary).toContain('serverTimingDuration(response.headers, "admin-rate-limit")');
    expect(canary).toContain('serverTimingDuration(response.headers, "admin-snapshot-db")');
    expect(canary).toContain("adminReadWarmupRateLimitMs");
    expect(canary).toContain("adminReadWarmupSnapshotDbMs");
    expect(canary).toContain("adminReadMeasuredRateLimitMs");
    expect(canary).toContain("adminReadMeasuredSnapshotDbMs");
    expect(canary).toContain("adminReadP95Ms: Math.round(percentile(snapshotDurations, 95))");
    expect(canary).not.toMatch(/adminReadP95Ms:.*(?:RateLimit|SnapshotDb|snapshotRpc)/);
  });

  it("is sealed in migration history and forward-compatibility policy", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    expect(manifest).toContain("0102_cms_system_snapshot_subphase_timing.sql");
    expect(manifest).toContain(digest);
    expect(manifest).toContain("systemSnapshotSubphaseTimingSemanticSql");
    const policy = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(policy).toContain('"0102"');
    expect(policy).toContain("supabase/tests/rls_cms_system_snapshot_subphase_timing.test.sql");
  });
});
