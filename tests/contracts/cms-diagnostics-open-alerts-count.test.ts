import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync("src/admin/pages/AdminDiagnosticsPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0089_cms_operational_events_read_scale.sql", "utf8");

describe("diagnostics open alerts count", () => {
  it("never asks for a count of the whole open alert backlog", () => {
    // Proved against the authenticated staging session: the same read answers in about 400 ms without
    // a count and fails with HTTP 500 after roughly 8.4 seconds with count exact, because the exact
    // count evaluates the per-row authorisation over every open alert rather than over the page.
    const start = page.indexOf('.from("cms_operational_events")');
    const eventsQuery = page.slice(start, page.indexOf(".limit(", start) + 60);
    expect(start).toBeGreaterThan(0);
    expect(eventsQuery).not.toContain("count:");

    // The publication queue keeps its exact count: it is a HEAD over a small, cheap predicate and it
    // answered in about 250 ms in the same session.
    expect(page).toContain('.from("cms_publication_outbox")');
    expect(page).toContain('count: "exact", head: true');
  });

  it("reads one row beyond the page so the indicator is a fact, not an estimate", () => {
    expect(page).toContain("const EVENT_PAGE_SIZE = 50;");
    expect(page).toContain("limit(EVENT_PAGE_SIZE + 1)");
    expect(page).toContain("openEvents.slice(0, EVENT_PAGE_SIZE)");
    expect(page).toContain("setHasMoreEvents(openEvents.length > EVENT_PAGE_SIZE)");
    // The extra row is never rendered as an alert.
    expect(page).not.toMatch(/setEvents\(\s*openEvents\s*\)/);
  });

  it("states the bound instead of inventing a total", () => {
    expect(page).toContain('{hasMoreEvents ? "+" : ""}');
    expect(page).toContain("há outros alertas abertos além");
    expect(page).not.toContain("eventTotal");
  });

  it("keeps the index that makes the bounded read fast", () => {
    // Without the partial index the bounded read would scan and sort the whole table again.
    expect(migration).toContain("cms_operational_events_unresolved_recent_idx");
    expect(migration).toContain("where resolved_at is null");
  });
});
