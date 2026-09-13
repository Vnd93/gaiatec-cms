import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0098_cms_audit_log_read_scale.sql");
const migration = readFileSync(migrationPath, "utf8");
const previous = readFileSync(
  path.join(root, "supabase/migrations/0070_cms_users_auth_authoritative_scope.sql"),
  "utf8",
);

describe("CMS audit-log read scale", () => {
  it("preserves the complete corporate and exact-run QA authorization branches", () => {
    expect(previous).toMatch(
      /public\.cms_has_permission\('cms:audit.read'\)\s+and public\.cms_user_audit_session_read_allowed\(actor_id\)/,
    );
    expect(migration).toContain("public.cms_has_permission('cms:audit.read')");
    expect(migration).toContain("exists(select 1 from auth.users actor where actor.id = auth.uid())");
    expect(migration).toContain("not exists(");
    expect(migration).toContain("private.cms_qa_actor_leases");
    expect(migration).toContain("p_event_actor_id is not null");
    expect(migration).toContain("private.cms_user_actor_target_scope_allowed(");
    expect(migration).toContain("private.cms_user_actor_environment(auth.uid())");

    const policy = migration.slice(migration.indexOf("create policy"));
    expect(policy).toMatch(
      /using\s*\(\s*\(select public\.cms_audit_session_scope_allowed\(\)\)\s*and\s*\(\s*\(select public\.cms_audit_corporate_session_allowed\(\)\)\s*or public\.cms_audit_event_row_allowed\(actor_id\)\s*\)\s*\)/,
    );
    expect(migration).toContain("polcmd in ('r', '*')");
  });

  it("keeps every policy helper stable, privileged and closed to non-browser API roles", () => {
    for (const routine of [
      "public.cms_audit_session_scope_allowed()",
      "public.cms_audit_corporate_session_allowed()",
      "public.cms_audit_event_row_allowed(uuid)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${routine}\n  from public, anon, authenticated, service_role;`,
      );
      expect(migration).toContain(`grant execute on function ${routine} to authenticated;`);
    }
    expect(migration.match(/language sql\nstable\nsecurity definer/g)).toHaveLength(3);
    expect(migration.match(/set search_path = pg_catalog, private, auth, pg_temp/g)).toHaveLength(3);
  });

  it("indexes the exact newest-first query issued by the admin home", () => {
    expect(migration).toMatch(
      /create index if not exists cms_audit_log_recent_idx\s+on public\.cms_audit_log \(occurred_at desc\)/,
    );
    expect(migration).toContain("CMS_AUDIT_LOG_POLICY_NOT_SPLIT");
    expect(migration).toContain("CMS_AUDIT_LOG_RECENT_INDEX_MISSING");
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("keeps structural and behavioral database coverage executable", () => {
    const structural = readFileSync(
      path.join(root, "supabase/tests/rls_cms_audit_log_read_scale.test.sql"),
      "utf8",
    );
    const behavior = readFileSync(
      path.join(root, "supabase/tests/rls_cms_users_auth_scope.test.sql"),
      "utf8",
    );
    const planned = Number(/select plan\((\d+)\);/.exec(structural)?.[1]);
    const asserted = structural.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(planned).toBe(asserted);
    expect(structural).toContain("cmd in ('SELECT','ALL')");
    expect(behavior).toContain("QA auditors see only actors from their exact active run");
    expect(behavior).toContain("corporate auditors retain the complete QA audit trail");
  });

  it("is sealed in the migration manifest and forward-compatibility policy", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    const forwardCompatibility = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(manifest).toContain("0098_cms_audit_log_read_scale.sql");
    expect(manifest).toContain(digest);
    expect(manifest).toContain("p.proowner = 'postgres'::regrole");
    expect(manifest).toContain("language_row.lanname = 'sql'");
    expect(manifest).toContain("extensions.digest");
    for (const routine of [
      "cms_audit_session_scope_allowed",
      "cms_audit_corporate_session_allowed",
      "cms_audit_event_row_allowed",
    ]) {
      const body = new RegExp(
        `create or replace function public\\.${routine}\\([^)]*\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      ).exec(migration)?.[1];
      expect(body).toBeDefined();
      expect(manifest).toContain(
        createHash("sha256")
          .update(body ?? "")
          .digest("hex"),
      );
    }
    expect(forwardCompatibility).toContain('"0098"');
    expect(forwardCompatibility).toContain("supabase/tests/rls_cms_audit_log_read_scale.test.sql");
    expect(forwardCompatibility).toContain("supabase/tests/rls_cms_users_auth_scope.test.sql");
    expect(forwardCompatibility).toContain("tests/contracts/cms-audit-log-read-scale.test.ts");

    for (const verifierPath of [
      "scripts/ev2/phase12/staging-migrations-canary.mjs",
      "scripts/ev2/phase12/verify-staging-database.mjs",
      "scripts/ev2/phase12/verify-production-database.mjs",
    ]) {
      const verifier = readFileSync(path.join(root, verifierPath), "utf8");
      expect(verifier).toContain("auditLogReadScaleSemanticSql");
      expect(verifier).toContain('auditLogReadScaleSemanticSql("audit_log_read_scale_0098_semantics_exact")');
      if (verifierPath.endsWith("staging-migrations-canary.mjs")) {
        expect(verifier).toContain("row?.audit_log_read_scale_0098_semantics_exact === true");
      } else {
        const checks = verifier.slice(verifier.indexOf("const checks = ["));
        expect(checks).toContain('"audit_log_read_scale_0098_semantics_exact"');
      }
    }
  });
});
