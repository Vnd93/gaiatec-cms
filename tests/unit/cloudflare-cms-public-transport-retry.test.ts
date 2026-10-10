import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error The deployed Cloudflare module intentionally remains plain JavaScript.
import * as workerModule from "../../cloudflare/_worker.js";

const worker = workerModule.default;
const origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";

const index = () =>
  new Response("<!doctype html><html><head><title>GAIATEC</title></head><body></body></html>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

function environment() {
  return {
    CMS_PUBLIC_API: "https://project-ref.supabase.co/functions/v1/cms-public",
    CMS_PUBLIC_ANON_KEY: "public-anon-test-key",
    CF_PAGES_BRANCH: "main",
    CF_PAGES_COMMIT_SHA: "a".repeat(40),
    ASSETS: { fetch: vi.fn(async () => index()) },
  };
}

function managedPage() {
  return Response.json({
    kind: "page",
    page: {
      kind: "page",
      payload: { title: "Contato", route: { path: "/contato" } },
      seo: {
        title: "Contato | GAIATEC",
        description: "Fale com a GAIATEC.",
        canonicalPath: "/contato",
        indexable: true,
      },
    },
  });
}

function candidateProduct() {
  return Response.json({
    kind: "product",
    slug: "produto-publico",
    path: "/produtos/produto-publico",
    payload: { title: "Produto" },
    seo: {
      title: "Produto | GAIATEC",
      description: "Produto público.",
      canonicalPath: "/produtos/produto-publico",
      indexable: true,
    },
  });
}

function assetRequest(type: "media" | "document") {
  const selector = type === "media" ? "slot=primary" : "position=1";
  return new Request(
    `${origin}/__cms-public-asset?type=${type}&kind=product&slug=produto-publico&path=%2Fprodutos%2Fproduto-publico&${selector}`,
  );
}

function rejectWhenAborted(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cms-public transport retry", () => {
  it.each([
    ["/blog/artigo-arquivado", "post-detail"],
    ["/campanhas/campanha", "campaign-by-path"],
  ])("correlates %s without changing its single-request failure policy", async (path, lookup) => {
    const network = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(
      new Request(`${origin}${path}`, {
        headers: { "x-cms-document-trace": "visitor-private-value" },
      }),
      environment(),
    );
    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    const call = network.mock.calls[0] as unknown as [URL, RequestInit];
    expect(call[0].searchParams.get("type")).toBe(lookup);
    const trace = response.headers.get("X-CMS-Document-Trace");
    expect(trace).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(new Headers(call[1].headers).get("x-cms-document-trace")).toBe(`${trace}.1`);
    expect(response.headers.get("X-CMS-Upstream")).toMatch(/^other;http;1;503;\d+$/);
    expect([...response.headers].join()).not.toContain("visitor-private-value");
  });

  it("binds both staging attempts to a fresh trace and ignores visitor-supplied markers", async () => {
    const network = vi.fn(async () => {
      throw new TypeError("not-recorded");
    });
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(
      new Request(`${origin}/managed-page`, {
        headers: { "x-cms-document-trace": "visitor-private-value" },
      }),
      environment(),
    );
    const trace = response.headers.get("X-CMS-Document-Trace");
    expect(trace).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(network).toHaveBeenCalledTimes(2);
    for (const [position, call] of network.mock.calls.entries()) {
      const init = (call as unknown as [unknown, RequestInit])[1];
      expect(new Headers(init.headers).get("x-cms-document-trace")).toBe(`${trace}.${position + 1}`);
    }
    expect([...response.headers].join()).not.toContain("visitor-private-value");
  });

  it.each(["/managed-page", "/blog/artigo-arquivado", "/campanhas/campanha"])(
    "never sends document correlation headers to the production backend for %s",
    async (path) => {
      const network = vi.fn(async () => new Response(null, { status: 503 }));
      vi.stubGlobal("fetch", network);
      const response = await worker.fetch(new Request(`https://www.gaiatec.com.br${path}`), environment());
      expect(response.headers.has("X-CMS-Document-Trace")).toBe(false);
      for (const call of network.mock.calls) {
        const init = (call as unknown as [unknown, RequestInit])[1];
        expect(new Headers(init.headers).has("x-cms-document-trace")).toBe(false);
      }
    },
  );

  it("isolates diagnostics between concurrent requests", async () => {
    const network = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.searchParams.get("type") === "entity-detail") throw new TypeError("not-recorded");
      return new Response(null, { status: 502 });
    });
    vi.stubGlobal("fetch", network);
    const [entity, managed] = await Promise.all([
      worker.fetch(new Request(`${origin}/industrias/instrumentacao`), environment()),
      worker.fetch(new Request(`${origin}/managed-page`), environment()),
    ]);
    expect(entity.headers.get("X-CMS-Upstream")).toMatch(/^entity-detail;transport;1;503;\d+$/);
    expect(managed.headers.get("X-CMS-Upstream")).toMatch(/^page-by-path;http;1;502;\d+$/);
  });

  it("omits diagnostics on successful documents and private routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => managedPage()),
    );
    const success = await worker.fetch(new Request(`${origin}/contato`), environment());
    const privatePage = await worker.fetch(new Request(`${origin}/admin/login`), environment());
    expect(success.status).toBe(200);
    expect(success.headers.has("X-CMS-Upstream")).toBe(false);
    expect(privatePage.headers.has("X-CMS-Upstream")).toBe(false);
  });

  it("labels a discovery transport rejection without exposing its error or credentials", async () => {
    const network = vi.fn(async () => {
      throw new TypeError("secret-payload-never-record");
    });
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(
      new Request(`${origin}/industrias/instrumentacao?private=value`),
      environment(),
    );
    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-CMS-Upstream")).toMatch(/^entity-detail;transport;1;503;\d+$/);
    expect([...response.headers].join()).not.toContain("secret-payload");
    expect([...response.headers].join()).not.toContain("private=value");
  });

  it("distinguishes an upstream HTTP 503 and keeps its original single attempt", async () => {
    const network = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", network);
    const response = await worker.fetch(new Request(`${origin}/industrias/instrumentacao`), environment());
    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-CMS-Upstream")).toMatch(/^entity-detail;http;1;503;\d+$/);
  });

  it("keeps the discovery deadline unchanged and distinguishes its timeout", async () => {
    vi.useFakeTimers();
    const network = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => rejectWhenAborted(init?.signal));
    vi.stubGlobal("fetch", network);
    const pending = worker.fetch(new Request(`${origin}/industrias/instrumentacao`), environment());
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-CMS-Upstream")).toBe("entity-detail;timeout;1;503;5000");
  });

  it("does not expose upstream diagnostics in production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const response = await worker.fetch(
      new Request("https://www.gaiatec.com.br/industrias/instrumentacao"),
      environment(),
    );
    expect(response.status).toBe(503);
    expect(response.headers.has("X-CMS-Upstream")).toBe(false);
  });

  it("does not hedge a managed page that answers before the tail window", async () => {
    vi.useFakeTimers();
    const network = vi.fn(async () => managedPage());
    vi.stubGlobal("fetch", network);

    const response = await worker.fetch(new Request(`${origin}/contato`), environment());

    expect(response.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(701);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("hedges a stalled managed page before the release latency budget", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    let primarySignal: AbortSignal | null | undefined;
    const network = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;
      if (attempt === 1) {
        primarySignal = init?.signal;
        return rejectWhenAborted(init?.signal);
      }
      return Promise.resolve(managedPage());
    });
    vi.stubGlobal("fetch", network);

    const startedAt = Date.now();
    const pending = worker.fetch(new Request(`${origin}/contato`), environment());
    await vi.advanceTimersByTimeAsync(700);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(primarySignal?.aborted).toBe(true);
  });

  it("fails closed inside five seconds when both transport attempts stall", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const network = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => rejectWhenAborted(init?.signal));
    vi.stubGlobal("fetch", network);

    const pending = worker.fetch(new Request(`${origin}/contato`), environment());
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(2_200);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("does not retry an HTTP failure received from the backend", async () => {
    const network = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", network);

    const response = await worker.fetch(new Request(`${origin}/contato`), environment());

    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("keeps an HTTP failure fail-closed when the hedge answers first", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const network = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;
      return attempt === 1
        ? rejectWhenAborted(init?.signal)
        : Promise.resolve(new Response(null, { status: 503 }));
    });
    vi.stubGlobal("fetch", network);

    const pending = worker.fetch(new Request(`${origin}/contato`), environment());
    await vi.advanceTimersByTimeAsync(700);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("starts the backup immediately after an early transport rejection", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const network = vi.fn(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new TypeError("network")) : Promise.resolve(managedPage());
    });
    vi.stubGlobal("fetch", network);

    const startedAt = Date.now();
    const pending = worker.fetch(new Request(`${origin}/contato`), environment());
    await vi.advanceTimersByTimeAsync(0);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBe(0);
  });

  it("waits for the primary when the hedged transport fails first", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    let resolvePrimary!: (response: Response) => void;
    const primary = new Promise<Response>((resolve) => {
      resolvePrimary = resolve;
    });
    const network = vi.fn(() => {
      attempt += 1;
      return attempt === 1 ? primary : Promise.reject(new TypeError("network"));
    });
    vi.stubGlobal("fetch", network);

    let settled = false;
    const pending = worker
      .fetch(new Request(`${origin}/contato`), environment())
      .then((response: Response) => {
        settled = true;
        return response;
      });
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(0);

    expect(network).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);

    resolvePrimary(managedPage());
    const response = await pending;
    expect(response.status).toBe(200);
  });

  it.each(["media", "document"] as const)(
    "keeps one five-second attempt for a stalled %s response",
    async (type) => {
      vi.useFakeTimers();
      const network = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        return url.searchParams.get("type") === "detail"
          ? Promise.resolve(candidateProduct())
          : rejectWhenAborted(init?.signal);
      });
      vi.stubGlobal("fetch", network);

      let settled = false;
      const pending = worker.fetch(assetRequest(type), environment()).then((response: Response) => {
        settled = true;
        return response;
      });
      await vi.advanceTimersByTimeAsync(2_200);
      expect(settled).toBe(false);
      expect(network).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2_800);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(network).toHaveBeenCalledTimes(2);
    },
  );
});
