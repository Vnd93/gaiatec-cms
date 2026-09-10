import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0092_cms_qa_override_window.sql", "utf8");
const previous = readFileSync("supabase/migrations/0091_cms_qa_actor_lease_window.sql", "utf8");
const lease = readFileSync("scripts/qa/qa-actor-lease.mjs", "utf8");
const database = readFileSync("supabase/tests/rls_cms_qa_override_window.test.sql", "utf8");

describe("qa override window", () => {
  it("is a migration of its own, because 0091 was already applied", () => {
    // Changing an applied migration does not re-run it: the version stays recorded and the effect
    // never reaches the database. That is exactly what happened, and it cost two staging cycles.
    expect(previous).not.toContain("cms_qa_override_window_is_valid");
    expect(migration).toContain("cms_qa_override_window_is_valid");
    expect(migration).toContain("interval '241 minutes'");
  });

  it("adjusts the installed definition instead of recreating it", () => {
    expect(migration).toContain("pg_get_functiondef(");
    expect(migration).not.toContain("create or replace function private.cms_qa_override_window_is_valid");
    expect(migration).toContain("CMS_QA_OVERRIDE_WINDOW_DRIFT");
  });

  it("keeps the exception bound to the exact synthetic lease", () => {
    expect(migration).toContain("CMS_QA_OVERRIDE_WINDOW_GUARDS_LOST");
    expect(migration).toContain("cms_qa_actor_marker_is_exact");
    expect(migration).toContain("status = ''active''");
    expect(migration).toContain("p_expires_at > p_starts_at");
    expect(migration).toContain("CMS_QA_OVERRIDE_WINDOW_PRIVILEGE_WIDENED");
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("agrees with the client constant the window is derived from", () => {
    expect(lease).toContain("QA_ACTOR_LEASE_TTL_MINUTES = 240");
    expect(lease).toContain("QA_ACTOR_LEASE_MAX_MINUTES = 241");
  });

  it("declares as many pgTAP assertions as it actually runs", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(database)?.[1]);
    const asserted = database.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(asserted).toBeGreaterThan(0);
    expect(planned).toBe(asserted);
  });
});
