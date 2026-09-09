import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error The deployed Cloudflare module intentionally remains plain JavaScript.
import * as workerModule from "../../cloudflare/_worker.js";

const worker = workerModule.default;

const origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const apiEndpoint = "https://project-ref.supabase.co/functions/v1/cms-public";

const index = () =>
  new Response("<!doctype html><html><head><title>GAIATEC</title></head><body></body></html>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

function environment() {
  return {
    CMS_PUBLIC_API: apiEndpoint,
    CMS_PUBLIC_ANON_KEY: "public-anon-test-key",
    CF_PAGES_BRANCH: "main",
    CF_PAGES_COMMIT_SHA: "a".repeat(40),
    ASSETS: { fetch: vi.fn(async () => index()) },
  };
}

// Every cms-public call fails the way an aborted or unavailable upstream does.
function failingUpstream() {
  return vi.fn(async () => new Response(null, { status: 503 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("static public route availability", () => {
  it("keeps serving a static public route when the managed lookup is unavailable", async () => {
    vi.stubGlobal("fetch", failingUpstream());
    const response = await worker.fetch(new Request(`${origin}/produtos`), environment());

    // The managed lookup is discarded for this route anyway, so its failure must not take it down.
    expect(response.status).toBe(200);
  });

  it("still fails closed for a route that genuinely depends on the managed lookup", async () => {
    vi.stubGlobal("fetch", failingUpstream());
    const response = await worker.fetch(new Request(`${origin}/uma-pagina-gerenciada`), environment());

    expect(response.status).toBe(503);
  });

  it("keeps managed resolution winning over the static route when the lookup succeeds", async () => {
    // Precedence is unchanged: the managed lookup still runs first and a resolving answer still wins.
    const network = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.searchParams.get("type") === "page-by-path")
        return new Response(
          JSON.stringify({
            kind: "route",
            rule: { destination_path: "/servicos", status_code: 301 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", network);

    const response = await worker.fetch(new Request(`${origin}/blog`), environment());
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/servicos");
  });
});
