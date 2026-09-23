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
