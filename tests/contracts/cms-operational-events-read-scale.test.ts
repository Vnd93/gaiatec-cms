import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0089_cms_operational_events_read_scale.sql", "utf8");
const previous = readFileSync("supabase/migrations/0076_cms_system_rbac_authoritative_scope.sql", "utf8");

describe("operational events read scale", () => {
  it("keeps the authorising conjunction identical while splitting where it is evaluated", () => {
    // The policy installed in 0076 evaluated all three conditions inside one row-scoped predicate,
    // so the two that do not depend on a row were re-evaluated for every row.
    expect(previous).toContain("cms_system_operational_session_read_allowed(id)");

    // The same three conditions must still be required, only distributed so the session half can be
    // hoisted. Dropping any of them would turn a performance fix into a privilege escalation.
    expect(migration).toContain("cms_system_permission_lineage_allowed");
    expect(migration).toContain("cms_has_permission('cms:diagnostics.read')");
    expect(migration).toContain("cms_system_operational_event_scope_allowed");

    const policy = migration.slice(migration.indexOf("create policy"));
    expect(policy).toMatch(
      /using\s*\(\s*public\.cms_system_operational_session_scope_allowed\(\)\s*and\s*public\.cms_system_operational_event_row_allowed\(id\)\s*\)/,
    );
  });

  it("keeps both predicates privileged and unreachable from anonymous callers", () => {
    for (const routine of [
      "public.cms_system_operational_session_scope_allowed()",
      "public.cms_system_operational_event_row_allowed(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${routine}\n  from public,anon,authenticated;`);
      expect(migration).toContain(`grant execute on function ${routine} to authenticated;`);
    }
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, private, pg_temp");
  });

  it("indexes the shape the diagnostics surface actually reads", () => {
    // Unresolved events, newest first. Without this the limit cannot be applied during the scan and
    // the per-row predicate runs against the whole table.
    expect(migration).toMatch(
      /create index if not exists cms_operational_events_unresolved_recent_idx[\s\S]*?on public\.cms_operational_events \(created_at desc\)[\s\S]*?where resolved_at is null/,
    );
    expect(migration).toContain("cms_operational_events_recent_idx");
  });

  it("declares as many pgTAP assertions as it actually runs", () => {
    // pgTAP exits non-zero when the plan and the assertions disagree, and a plan that is one short
    // hides the last assertion instead of running it. CI caught exactly that.
    const database = readFileSync("supabase/tests/rls_cms_operational_events_read_scale.test.sql", "utf8");
    const planned = Number(/select plan\((\d+)\);/.exec(database)?.[1]);
    const asserted = database.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(asserted).toBeGreaterThan(0);
    expect(planned).toBe(asserted);
  });

  it("fails closed if the policy or the index did not land", () => {
    expect(migration).toContain("CMS_OPERATIONAL_EVENTS_POLICY_NOT_SPLIT");
    expect(migration).toContain("CMS_OPERATIONAL_EVENTS_INDEX_MISSING");
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });
});
