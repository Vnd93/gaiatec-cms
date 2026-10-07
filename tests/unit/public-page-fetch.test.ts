import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicPageResponse } from "../../src/public/public-page-fetch";
import { getPublishedPageByPath } from "../../src/public/catalog-api";

const pageParams = () => new URLSearchParams({ type: "page-by-path", path: "/sobre" });

function pendingUntilAborted(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
    else
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
        once: true,
      });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom/Node's native timeout uses real timers; make only that clock deterministic.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), ms);
    return controller.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded public page transport recovery", () => {
  it("keeps healthy reads single and leaves the winning response body readable", async () => {
    const network = vi.fn(async () => Response.json({ kind: "page" }));
    vi.stubGlobal("fetch", network);
    const result = await fetchPublicPageResponse(pageParams());
    await vi.advanceTimersByTimeAsync(701);
    expect(network).toHaveBeenCalledTimes(1);
    await expect(result.json()).resolves.toEqual({ kind: "page" });
  });

  it.each(["page-by-path", "entity-detail"])(
    "recovers one unanswered %s transport without waiting ten seconds",
    async (type) => {
      let firstSignal: AbortSignal | null | undefined;
      const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        if (network.mock.calls.length === 1) {
          firstSignal = init?.signal;
          return pendingUntilAborted(init?.signal);
        }
        return Promise.resolve(Response.json({ kind: "page" }));
      });
      vi.stubGlobal("fetch", network);
      const pending = fetchPublicPageResponse(new URLSearchParams({ type, path: "/sobre" }));
      await vi.advanceTimersByTimeAsync(699);
      expect(network).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).status).toBe(200);
      expect(network).toHaveBeenCalledTimes(2);
      expect(network.mock.calls[1][0]).toBe(network.mock.calls[0][0]);
      expect(network.mock.calls[1][1]?.headers).toEqual(network.mock.calls[0][1]?.headers);
      expect(Object.keys(network.mock.calls[1][1]?.headers ?? {})).toEqual(["apikey"]);
      expect(network.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
      expect(firstSignal?.aborted).toBe(true);
    },
  );

  it.each(["form", "site-shell", "campaign-placements", "catalog-product", "media", "document", "unknown"])(
    "does not hedge non-page type %s",
    async (type) => {
      const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
        pendingUntilAborted(init?.signal),
      );
      vi.stubGlobal("fetch", network);
      const pending = fetchPublicPageResponse(new URLSearchParams({ type }));
      const assertion = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(network).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 403, 429, 503])("never retries a received HTTP %i", async (status) => {
    const network = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", network);
    expect((await fetchPublicPageResponse(pageParams())).status).toBe(status);
    await vi.advanceTimersByTimeAsync(701);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("keeps a backup HTTP failure fail-closed and cancels the unresolved primary", async () => {
    let primarySignal: AbortSignal | null | undefined;
    const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (network.mock.calls.length === 1) {
        primarySignal = init?.signal;
        return pendingUntilAborted(init?.signal);
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    });
    vi.stubGlobal("fetch", network);
    const pending = fetchPublicPageResponse(pageParams());
    await vi.advanceTimersByTimeAsync(700);
    expect((await pending).status).toBe(503);
    expect(primarySignal?.aborted).toBe(true);
  });

  it("allows the primary to win after the backup has started", async () => {
    let resolvePrimary!: (response: Response) => void;
    let backupSignal: AbortSignal | null | undefined;
    const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (network.mock.calls.length === 1)
        return new Promise<Response>((resolve) => {
          resolvePrimary = resolve;
        });
      backupSignal = init?.signal;
      return pendingUntilAborted(init?.signal);
    });
    vi.stubGlobal("fetch", network);
    const pending = fetchPublicPageResponse(pageParams());
    await vi.advanceTimersByTimeAsync(700);
    resolvePrimary(new Response(null, { status: 403 }));
    expect((await pending).status).toBe(403);
    expect(backupSignal?.aborted).toBe(true);
  });

  it("starts only one backup immediately after a transport rejection", async () => {
    const network = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response());
    vi.stubGlobal("fetch", network);
    const response = await fetchPublicPageResponse(pageParams());
    expect(response.status).toBe(200);
    await vi.advanceTimersByTimeAsync(701);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("shares the original deadline and aborts both unanswered attempts without a third", async () => {
    const signals: AbortSignal[] = [];
    const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      return pendingUntilAborted(init?.signal);
    });
    vi.stubGlobal("fetch", network);
    const pending = fetchPublicPageResponse(pageParams());
    const assertion = expect(pending).rejects.toThrow("Catálogo temporariamente indisponível.");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(network).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("does not bypass public wire validation when the recovered response contains private metadata", async () => {
    const network = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      network.mock.calls.length === 1
        ? pendingUntilAborted(init?.signal)
        : Promise.resolve(Response.json({ kind: "page", page: { owner_id: "private" } })),
    );
    vi.stubGlobal("fetch", network);
    const assertion = expect(getPublishedPageByPath("/sobre")).rejects.toThrow("incompatível");
    await vi.advanceTimersByTimeAsync(700);
    await assertion;
    expect(network).toHaveBeenCalledTimes(2);
  });
});
