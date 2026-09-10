import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fn = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const worker = readFileSync("cloudflare/_worker.js", "utf8");
const session = readFileSync("supabase/functions/cms-session/index.ts", "utf8");
const adminAuth = readFileSync("src/admin/auth/AdminAuthContext.tsx", "utf8");

describe("public upstream deadline", () => {
  it("gives up well before the caller does", () => {
    // The worker aborts its call to this function at five seconds and synthesises a 503, so a read
    // that takes longer than that is never useful: the request it answers has already been abandoned.
    expect(worker).toContain("setTimeout(() => controller.abort(), 5_000)");
    expect(fn).toContain("const PUBLIC_UPSTREAM_TIMEOUT_MS = 1_800;");
    const budget = Number(/PUBLIC_UPSTREAM_TIMEOUT_MS = ([\d_]+);/.exec(fn)?.[1].replace(/_/g, ""));
    // Two attempts have to fit inside the caller's ceiling with room for the rest of the request.
    expect(budget * 2).toBeLessThan(5000);
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
