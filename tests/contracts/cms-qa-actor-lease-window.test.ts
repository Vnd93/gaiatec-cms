import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0091_cms_qa_actor_lease_window.sql", "utf8");
const lease = readFileSync("scripts/qa/qa-actor-lease.mjs", "utf8");
const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
const database = readFileSync("supabase/tests/rls_cms_qa_actor_lease_window.test.sql", "utf8");

describe("qa actor lease window", () => {
  it("extends only the deadline, and by the amount the window needs", () => {
    expect(migration).toContain("v_created_at + interval '240 minutes'");
    expect(migration).toContain("'leaseMinutes', 240");
    // A migration ainda cita o prazo antigo, mas apenas na sonda que recusa a instalacao obsoleta.
    expect(migration).not.toContain("v_created_at + interval '119 minutes'");
    expect(migration).toContain("CMS_QA_LEASE_TTL_STALE");
    // The client side constant has to agree, or the lease payload is refused as tampered.
    expect(lease).toContain("QA_ACTOR_LEASE_TTL_MINUTES = 240");
    // O prazo tambem e uma restricao da tabela; sem ela nenhuma lease longa e gravavel.
    expect(migration).toContain("cms_qa_actor_leases_check1");
    expect(migration).toContain("interval '241 minutes'");
    // A sonda compara pela forma canonica, porque o Postgres normaliza o literal do intervalo.
    expect(migration).toContain("04:01:00");
    expect(migration).toContain("expires_at > created_at");
    expect(migration).toContain("CMS_QA_LEASE_WINDOW_CONSTRAINT_NOT_APPLIED");
  });

  it("keeps the lease longer than the window it has to cover", () => {
    const setup = workflow.indexOf("id: browser_mutating_fixture");
    const cleanup = workflow.indexOf("id: browser_mutating_cleanup", setup);
    expect(setup).toBeGreaterThan(0);
    expect(cleanup).toBeGreaterThan(setup);
    const start = workflow.lastIndexOf("\n      - name:", setup);
    const end = workflow.lastIndexOf("\n      - name:", cleanup);
    const window = workflow.slice(start, end);
    const budget = [...window.matchAll(/^\s+timeout-minutes:\s*(\d+)\s*$/gm)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    );
    expect(budget).toBeGreaterThan(115);
    expect(budget).toBeLessThan(240);
    // Exactly one fixture, so the whole window really is covered by a single lease.
    expect(window.match(/cms-browser-fixture\.mjs setup/g)?.length ?? 0).toBe(1);
  });

  it("does not touch privileges, the trigger or the sweeper", () => {
    expect(migration).toContain("CMS_QA_LEASE_TRIGGER_MISSING");
    expect(migration).toContain("CMS_QA_LEASE_TRIGGER_PRIVILEGE_WIDENED");
    expect(migration).toContain("CMS_QA_LEASE_TTL_NOT_APPLIED");
    expect(migration).toContain("CMS_QA_LEASE_TTL_STALE");
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("declares as many pgTAP assertions as it actually runs", () => {
    const planned = Number(/select plan\((\d+)\);/.exec(database)?.[1]);
    const asserted = database.match(/^select (?:ok|is|isnt)\(/gm)?.length ?? 0;
    expect(asserted).toBeGreaterThan(0);
    expect(planned).toBe(asserted);
  });
});
