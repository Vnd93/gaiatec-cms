import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fn = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const worker = readFileSync("cloudflare/_worker.js", "utf8");
const session = readFileSync("supabase/functions/cms-session/index.ts", "utf8");
const adminAuth = readFileSync("src/admin/auth/AdminAuthContext.tsx", "utf8");

describe("public upstream deadline", () => {
  it("gives up well before the caller does", () => {
    const callerBudget = Number(
      /CMS_PUBLIC_TOTAL_TIMEOUT_MS = ([\d_]+);/.exec(worker)?.[1].replace(/_/g, ""),
    );
    const callerAttemptBudget = Number(
      /CMS_PUBLIC_ATTEMPT_TIMEOUT_MS = ([\d_]+);/.exec(worker)?.[1].replace(/_/g, ""),
    );
    const callerAttempts = Number(/CMS_PUBLIC_MAX_ATTEMPTS = (\d+);/.exec(worker)?.[1]);
    const callerHedgeDelay = Number(
      /CMS_PUBLIC_HEDGE_DELAY_MS = ([\d_]+);/.exec(worker)?.[1].replace(/_/g, ""),
    );
    // Two transport attempts stay inside the original five-second caller ceiling, including room
    // for the Worker to synthesize and return its fail-closed response.
    expect(callerBudget).toBe(5000);
    expect(callerAttemptBudget * callerAttempts).toBeLessThan(callerBudget);
    expect(callerBudget - callerAttemptBudget * callerAttempts).toBeGreaterThanOrEqual(500);
    // The original timeout is preserved. Only a read-only tail is duplicated early enough for a
    // healthy backup response to arrive inside the unchanged 1.5 second release budget.
    expect(callerHedgeDelay).toBe(700);
    expect(callerHedgeDelay).toBeLessThan(1500);
    expect(worker).toContain('fetchCmsPublic({ type: "page-by-path", path }, { retryTransport: true })');
    expect(worker.match(/\{ retryTransport: true \}/g)).toHaveLength(1);
    expect(worker).toContain(
      "retryTransport ? Math.min(CMS_PUBLIC_ATTEMPT_TIMEOUT_MS, remainingMs) : remainingMs",
    );
    expect(worker).toContain("...(hedgeActive ? [hedge] : [])");
    expect(fn).toContain("const PUBLIC_UPSTREAM_TIMEOUT_MS = 900;");
    const budget = Number(/PUBLIC_UPSTREAM_TIMEOUT_MS = ([\d_]+);/.exec(fn)?.[1].replace(/_/g, ""));
    // Two attempts have to fit inside the caller's ceiling with room for the rest of the request,
    // and the worst case has to stay near the latency budget rather than three times over it.
    expect(budget * 2).toBeLessThan(2000);
    // And the deadline still has to sit far above the healthy latency, measured around 390 ms for the
    // whole route, so a normal read is never cut off.
    expect(budget).toBeGreaterThan(600);
  });

  it("retries the read once instead of being abandoned mid-stall", () => {
    expect(fn).toContain("boundedFetch(PUBLIC_UPSTREAM_TIMEOUT_MS, fetch, true)");
    // Measured on staging: the public routes sit around 450 ms at the median and the budget breaches
    // came from isolated stalls whose maximum was pinned exactly at the worker's ceiling.
    expect(fn).toContain("global: { fetch:");
  });
});

describe("admin session deadline", () => {
  it("answers inside the window the panel actually waits", () => {
    // The panel gives the resolution ten seconds and then shows the unavailable screen. Measured on
    // staging, three identical resolutions fired on mount competed with each other and all three
    // exceeded 10.58 s, leaving the operator without access to the surface.
    expect(adminAuth).toContain("signal: AbortSignal.timeout(10_000)");
    expect(session).toContain("const SESSION_UPSTREAM_TIMEOUT_MS = 6_000;");
    const budget = Number(/SESSION_UPSTREAM_TIMEOUT_MS = ([\d_]+);/.exec(session)?.[1].replace(/_/g, ""));
    // The budget has to leave real room inside the panel's ceiling, and it has to cover the work:
    // the capability manifest evaluates twelve flags and a three second budget answered 200 with
    // access granted but no manifest, failing provisioning with no_capabilities.
    expect(budget).toBeGreaterThan(5000);
    expect(budget).toBeLessThan(8000);
    // A single attempt here: retrying could add two deadlines and exceed the panel's own window.
    expect(session).toContain("boundedFetch(SESSION_UPSTREAM_TIMEOUT_MS)");
    expect(session).not.toContain("boundedFetch(SESSION_UPSTREAM_TIMEOUT_MS, fetch, true)");
  });
});
