import { describe, expect, it, vi } from "vitest";

import {
  CMS_EDGE_FETCH_TIMEOUT_MS,
  boundedFetch,
  edgeRequestIdentity,
  isEdgeFetchTimeout,
} from "../../supabase/functions/_shared/cms-edge-fetch";

const stalled = () => new Promise<Response>(() => {});

describe("bounded edge fetch", () => {
  it("turns a call that never answers into a coded failure instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      const call = boundedFetch(1_000, stalled as unknown as typeof fetch)(
        "https://project.supabase.co/storage/v1/object/list/cms-documents-private",
        { method: "POST" },
      );
      const settled = expect(call).rejects.toThrow(
        "CMS_EDGE_FETCH_TIMEOUT:POST:/storage/v1/object/list/cms-documents-private:1000",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the underlying request rather than only abandoning the promise", async () => {
    vi.useFakeTimers();
    try {
      let observed: AbortSignal | undefined;
      const transport = ((_input: RequestInfo | URL, init?: RequestInit) => {
        observed = init?.signal ?? undefined;
        return stalled();
      }) as unknown as typeof fetch;
      const call = boundedFetch(500, transport)("https://project.supabase.co/rest/v1/cms_document_assets");
      const settled = expect(call).rejects.toThrow(/^CMS_EDGE_FETCH_TIMEOUT:GET:/);
      await vi.advanceTimersByTimeAsync(500);
      await settled;
      expect(observed?.aborted).toBe(true);
      expect((observed?.reason as DOMException).name).toBe("TimeoutError");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a healthy call untouched and leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const response = new Response("{}", { status: 200 });
      const transport = vi.fn(async () => response) as unknown as typeof fetch;
      await expect(
        boundedFetch(10_000, transport)("https://project.supabase.co/rest/v1/cms_documents"),
      ).resolves.toBe(response);
      // A timer left running keeps the isolate awake after the answer was already given.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a caller's own cancellation authoritative", async () => {
    const controller = new AbortController();
    const transport = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })) as unknown as typeof fetch;
    const call = boundedFetch(10_000, transport)("https://project.supabase.co/rest/v1/cms_documents", {
      signal: controller.signal,
    });
    controller.abort(new DOMException("caller gave up", "AbortError"));
    // A cancellation that came from the caller must not be reported as a deadline of ours.
    await expect(call).rejects.toThrow("caller gave up");
  });

  it("retries a read that timed out, and only a read", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const transport = ((_input: RequestInfo | URL, _init?: RequestInit) => {
        calls += 1;
        if (calls === 1) return stalled();
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as unknown as typeof fetch;

      const read = boundedFetch(500, transport, true)("https://project.supabase.co/rest/v1/cms_pages");
      await vi.advanceTimersByTimeAsync(500);
      await expect(read).resolves.toMatchObject({ status: 200 });
      expect(calls).toBe(2);

      // A write is never retried here: only the caller knows whether it is safe to repeat.
      calls = 0;
      const write = boundedFetch(
        500,
        transport,
        true,
      )("https://project.supabase.co/rest/v1/cms_pages", {
        method: "POST",
      });
      const settled = expect(write).rejects.toThrow(/^CMS_EDGE_FETCH_TIMEOUT:POST:/);
      await vi.advanceTimersByTimeAsync(500);
      await settled;
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry when the caller is the one who gave up", async () => {
    const controller = new AbortController();
    let calls = 0;
    const transport = ((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as unknown as typeof fetch;
    const call = boundedFetch(
      10_000,
      transport,
      true,
    )("https://project.supabase.co/rest/v1/cms_pages", {
      signal: controller.signal,
    });
    controller.abort(new DOMException("caller gave up", "AbortError"));
    await expect(call).rejects.toThrow("caller gave up");
    expect(calls).toBe(1);
  });

  it("never lets a query string reach the failure identity", () => {
    const identity = edgeRequestIdentity(
      "https://project.supabase.co/rest/v1/cms_leads?apikey=sbp_secret&email=eq.pedro@example.com",
      { method: "GET" },
    );
    expect(identity).toBe("GET:/rest/v1/cms_leads");
    expect(identity).not.toMatch(/apikey|sbp_|@/);

    // A hostile verb or an unparseable target degrades to a placeholder, it is not echoed.
    expect(edgeRequestIdentity("not a url", { method: "GET evil\nheader" })).toBe("UNKNOWN:unknown");
  });

  it("recognises its own timeout so callers can map it to a status", () => {
    expect(isEdgeFetchTimeout(new Error("CMS_EDGE_FETCH_TIMEOUT:GET:/rest/v1/x:30000"))).toBe(true);

    // postgrest-js does not surface the thrown error: it returns { error } whose message is
    // "<name>: <message>". A prefix match would miss exactly the path that matters most.
    expect(isEdgeFetchTimeout({ message: "Error: CMS_EDGE_FETCH_TIMEOUT:POST:/rest/v1/rpc/x:30000" })).toBe(
      true,
    );
    expect(
      isEdgeFetchTimeout({ message: "FetchError: CMS_EDGE_FETCH_TIMEOUT:POST:/rest/v1/rpc/x:30000" }),
    ).toBe(true);
    expect(isEdgeFetchTimeout(new Error("boom"))).toBe(false);
    expect(isEdgeFetchTimeout(undefined)).toBe(false);
    expect(CMS_EDGE_FETCH_TIMEOUT_MS).toBe(30_000);
  });
});
