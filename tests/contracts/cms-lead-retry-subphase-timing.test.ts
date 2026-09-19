import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0103_cms_lead_retry_subphase_timing.sql");
const migration = readFileSync(migrationPath, "utf8");
const edge = readFileSync(path.join(root, "supabase/functions/cms-leads/index.ts"), "utf8");
const canary = readFileSync(path.join(root, "scripts/ev2/phase11/staging-canary.mjs"), "utf8");

describe("CMS lead retry subphase timing", () => {
  it("keeps rate limiting and the guarded retry fused and single-shot", () => {
    expect(migration).toContain("create function public.cms_retry_lead_delivery_limited_timed(");
    expect(migration.match(/public\.consume_rate_limit\(/g)).toHaveLength(1);
    expect(migration.match(/v_result := public\.cms_retry_lead_delivery_scoped\(/g)).toHaveLength(1);
    expect(migration.indexOf("public.consume_rate_limit(")).toBeLessThan(
      migration.indexOf("v_result := public.cms_retry_lead_delivery_scoped("),
    );
    expect(migration).toMatch(/'cms_leads_retry_delivery',\s+60,\s+900/);
    expect(migration).toContain("CMS_RATE_LIMIT_EXCEEDED");
    expect(migration).toContain("errcode = 'PT429'");
  });

  it("reports only bounded database timings inside an internal envelope", () => {
    expect(migration).toContain("'schemaVersion', 1");
    expect(migration).toContain("'result', v_result");
    expect(migration).toContain("'rateLimitMs', v_rate_limit_ms");
    expect(migration).toContain("'commandCoreMs', v_command_core_ms");
    expect(migration.match(/greatest\(\s+0::bigint,/g)).toHaveLength(2);
    expect(migration).not.toMatch(/email|token|secret|cookie|totp/i);
    expect(migration).not.toMatch(/drop table|truncate|delete from|alter table/i);
  });

  it("keeps an exact service-role-only ACL and the rollback RPC untouched", () => {
    expect(migration).toMatch(
      /revoke all on function public\.cms_retry_lead_delivery_limited_timed\(\s*uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text,text\s*\)[\s\S]+from public, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cms_retry_lead_delivery_limited_timed\(\s*uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text,text\s*\)[\s\S]+to service_role/,
    );
    expect(migration).not.toContain("create or replace function public.cms_retry_lead_delivery_limited(");
  });

  it("unwraps validated timing while preserving the public retry response", () => {
    const retryBranch = edge.slice(
      edge.indexOf('}else if(input.action==="retry_delivery"){'),
      edge.indexOf("return json(req,{...data,correlationId}"),
    );
    expect(retryBranch).toContain('rpc("cms_retry_lead_delivery_limited_timed"');
    expect(retryBranch).toContain("RetryTimingEnvelope.safeParse(data)");
    expect(retryBranch).toContain("...timedRetry.data.result,correlationId");
    expect(retryBranch).toContain("command-auth;dur=");
    expect(retryBranch).toContain("command-rpc;dur=");
    expect(retryBranch).toContain("command-rate-limit;dur=");
    expect(retryBranch).toContain("command-core;dur=");
    expect(retryBranch).not.toMatch(/\.\.\.timedRetry\.data(?:,|\})/);
  });

  it("adds aligned diagnostic vectors without changing the command gate", () => {
    for (const vector of [
      "commandMeasuredAuthMs",
      "commandMeasuredRpcMs",
      "commandMeasuredRateLimitMs",
      "commandMeasuredCoreMs",
    ])
      expect(canary).toContain(vector);
    expect(canary).toContain("commandSamples: 10");
    expect(canary).toContain("commandMutationSamples: 1");
    expect(canary).toContain("commandReplaySamples: 9");
    expect(canary).toContain("commandP95Ms: Math.round(percentile(commandDurations, 95))");
    const timingGate = canary.slice(
      canary.indexOf('check(\n    "backend_server_timing_available"'),
      canary.indexOf('check("database_snapshot_ready"'),
    );
    expect(timingGate).not.toMatch(/command(?:Auth|Rpc|RateLimit|Core)Durations\.every\(Number\.isFinite\)/);
  });

  it("is sealed in migration history and forward-compatibility policy", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    expect(manifest).toContain("0103_cms_lead_retry_subphase_timing.sql");
    expect(manifest).toContain(digest);
    expect(manifest).toContain("leadRetrySubphaseTimingSemanticSql");
    const policy = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(policy).toContain('"0103"');
    expect(policy).toContain("supabase/tests/rls_cms_lead_retry_subphase_timing.test.sql");
  });
});
