import { describe, expect, it, vi } from "vitest";
import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";
import {
  observePostReadQuery,
  pagePathFailureDiagnostic,
  postReadTransport,
} from "../../supabase/functions/cms-public/post-read-transport";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const req = new Request("https://example.invalid/?type=post-detail&slug=private-selector", {
  headers: { "x-cms-document-trace": trace },
});
const target =
  "https://glcqsosxwgmlhzgcsnzv.supabase.co/rest/v1/cms_published_projection?slug=private-selector";

describe("staging post projection read correlation", () => {
  it("observes independent resolver reachability without awaiting or replacing fetch", async () => {
    const log = vi.fn();
    const probe = vi.fn().mockResolvedValue(["private-network-address"]);
    let complete!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const fetcher = postReadTransport(req, "staging", release, transport, log, probe);
    const result = fetcher(target, { headers: { apikey: "private-key" } });
    await vi.waitFor(() => expect(log.mock.calls.some(([event]) => event.outcome === "resolved")).toBe(true));
    const response = new Response("private-body", { status: 503 });
    complete(response);
    expect(await result).toBe(response);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0].slice(0, 2)).toEqual(["glcqsosxwgmlhzgcsnzv.supabase.co", "A"]);
    expect(log.mock.calls.find(([event]) => event.event.endsWith("dns.probe.finish"))?.[0]).toMatchObject({
      outcome: "resolved",
      recordCount: 1,
      upstreamTrace: `${trace}.1`,
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|supabase\.co|apikey|slug=/);
  });
  it("cancels a stalled resolver within the existing two-attempt 900ms budget", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const probe = vi.fn(
        (_host, _record, options) =>
          new Promise<string[]>((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("private-dns-error")), {
              once: true,
            });
          }),
      );
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("private-error", "TimeoutError")),
              { once: true },
            );
          }),
      );
      const fetcher = boundedFetch(
        900,
        postReadTransport(req, "staging", release, transport, log, probe),
        true,
      );
      const result = expect(fetcher(target)).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
      await vi.advanceTimersByTimeAsync(1800);
      await result;
      expect(transport).toHaveBeenCalledTimes(2);
      expect(probe).toHaveBeenCalledTimes(1);
      expect(probe.mock.calls[0][2].signal.aborted).toBe(true);
      expect(log.mock.calls.filter(([event]) => event.event.endsWith("dns.probe.finish"))).toHaveLength(1);
      expect(log.mock.calls.find(([event]) => event.event.endsWith("dns.probe.finish"))?.[0].outcome).toBe(
        "fetch_cancelled",
      );
      expect(
        log.mock.calls
          .filter(([event]) => event.event.endsWith("upstream.finish"))
          .map(([event]) => event.outcome),
      ).toEqual(["deadline", "deadline"]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
    } finally {
      vi.useRealTimers();
    }
  });
  it("stops independent observation when fetch settles even if the resolver ignores cancellation", async () => {
    const log = vi.fn();
    const probe = vi.fn(
      (_host: string, _record: "A", _options: { signal: AbortSignal }) => new Promise<string[]>(() => {}),
    );
    const response = new Response("[]");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await postReadTransport(req, "staging", release, transport, log, probe)(target)).toBe(response);
    expect(probe.mock.calls[0][2].signal.aborted).toBe(true);
    expect(log.mock.calls.find(([event]) => event.event.endsWith("dns.probe.finish"))?.[0].outcome).toBe(
      "fetch_settled",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("sanitizes resolver and native transport errors without changing them", async () => {
    const log = vi.fn();
    const probe = vi.fn(() => {
      throw new TypeError("private-host-secret");
    });
    const error = new Error("private-url-cookie");
    error.name = "private-error-name";
    let rejectTransport!: (error: Error) => void;
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((_resolve, reject) => {
          rejectTransport = reject;
        }),
    );
    const result = postReadTransport(req, "staging", release, transport, log, probe)(target);
    const rejection = expect(result).rejects.toBe(error);
    await vi.waitFor(() =>
      expect(log.mock.calls.some(([event]) => event.outcome === "resolver_error")).toBe(true),
    );
    rejectTransport(error);
    await rejection;
    expect(log.mock.calls.find(([event]) => event.outcome === "resolver_error")?.[0].errorKind).toBe(
      "TypeError",
    );
    expect(log.mock.calls.find(([event]) => event.outcome === "transport_error")?.[0].errorKind).toBe(
      "other",
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|stack|cause/);
  });
  it.each(["production", "local", undefined])("does not probe DNS in %s", async (environment) => {
    const probe = vi.fn();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]"));
    expect(postReadTransport(req, environment, release, transport, vi.fn(), probe)).toBe(transport);
    expect(probe).not.toHaveBeenCalled();
  });
  it("observes only the exact primary page path read and preserves HTTP errors", async () => {
    const request = new Request("https://example.invalid/?type=page-by-path&path=/private-selector", {
      headers: { "x-cms-document-trace": trace },
    });
    const pageTarget = target.replace(
      "slug=private-selector",
      "content_type=in.(page,homepage)&payload-%3Eroute-%3E%3Epath=eq.private-selector",
    );
    const response = new Response("private-payload", { status: 503 });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn();
    const fetcher = postReadTransport(request, "staging", release, transport, log);
    for (const other of [
      target,
      pageTarget + "&item_id=eq.private-id",
      pageTarget.replace("in.(page,homepage)", "eq.product"),
    ])
      await fetcher(other);
    expect(log).not.toHaveBeenCalled();
    const value = { data: null, error: { message: "private-error" }, status: 503 };
    expect(
      await observePostReadQuery(
        request,
        "staging",
        release,
        async () => {
          expect(await fetcher(pageTarget)).toBe(response);
          expect(await response.text()).toBe("private-payload");
          return value;
        },
        log,
      ),
    ).toBe(value);
    expect(log.mock.calls.map(([event]) => event.event)).toEqual([
      "cms.public.page.query.start",
      "cms.public.page.upstream.start",
      "cms.public.page.upstream.finish",
      "cms.public.page.body.start",
      "cms.public.page.body.finish",
      "cms.public.page.query.finish",
    ]);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ resultKind: "query_error" });
    expect(new Headers(transport.mock.calls[3][1]?.headers).get("x-client-info")).toContain(
      `cms-staging-page-trace/${trace}.1`,
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|payload-|route-|message|data/);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("reports only closed page failure stages under the exact staging binding", () => {
    const request = new Request("https://example.invalid/?type=page-by-path&path=/private-selector", {
      headers: { "x-cms-document-trace": trace },
    });
    for (const stage of ["primary", "managed-route", "legacy-route", "related", "form"] as const) {
      expect(pagePathFailureDiagnostic(request, "staging", release, stage)).toMatchObject({
        event: "cms.public.page.failure",
        trace,
        release,
        lookup: "page-by-path",
        stage,
      });
      for (const environment of ["production", "local", undefined])
        expect(pagePathFailureDiagnostic(request, environment, release, stage)).toBeNull();
      expect(pagePathFailureDiagnostic(request, "staging", "unknown", stage)).toBeNull();
      expect(pagePathFailureDiagnostic(req, "staging", release, stage)).toBeNull();
    }
    expect(JSON.stringify(pagePathFailureDiagnostic(request, "staging", release, "primary"))).not.toContain(
      "private-selector",
    );
  });
  it.each(["products", "search", "autocomplete"])(
    "observes only the primary %s collection and preserves its 503",
    async (lookup) => {
      const request = new Request(`https://example.invalid/?type=${lookup}`, {
        headers: { "x-cms-document-trace": trace },
      });
      const response = new Response("private-payload", { status: 503 });
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const log = vi.fn();
      const fetcher = postReadTransport(request, "staging", release, transport, log);
      const collectionTarget = target.replace("slug=private-selector", "content_type=eq.product");
      await fetcher(target);
      await fetcher(collectionTarget + "&item_id=in.(private-selector)");
      expect(log).not.toHaveBeenCalled();
      const value = { data: null, error: { message: "private-error" }, status: 503 };
      expect(
        await observePostReadQuery(
          request,
          "staging",
          release,
          async () => {
            expect(await fetcher(collectionTarget)).toBe(response);
            expect(await response.text()).toBe("private-payload");
            return value;
          },
          log,
        ),
      ).toBe(value);
      expect(log.mock.calls.map(([event]) => event.event)).toEqual([
        "cms.public.collection.query.start",
        "cms.public.collection.upstream.start",
        "cms.public.collection.upstream.finish",
        "cms.public.collection.body.start",
        "cms.public.collection.body.finish",
        "cms.public.collection.query.finish",
      ]);
      expect(new Headers(transport.mock.calls[2][1]?.headers).get("x-client-info")).toContain(
        `cms-staging-collection-trace/${trace}.1`,
      );
      expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ resultKind: "query_error" });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|content_type|message|data/);
      expect(transport).toHaveBeenCalledTimes(3);
    },
  );
  it.each(["entity-detail", "detail", "products", "page-by-path"])(
    "leaves %s unobserved outside staging or without an exact binding",
    async (lookup) => {
      const request = new Request(`https://example.invalid/?type=${lookup}`, {
        headers: { "x-cms-document-trace": trace },
      });
      const transport = vi.fn<typeof fetch>();
      for (const environment of ["production", "local", undefined]) {
        const log = vi.fn();
        expect(postReadTransport(request, environment, release, transport, log)).toBe(transport);
        const value = { data: "private-row", error: null };
        expect(await observePostReadQuery(request, environment, release, async () => value, log)).toBe(value);
        expect(log).not.toHaveBeenCalled();
      }
      expect(postReadTransport(request, "staging", "unknown", transport)).toBe(transport);
      expect(
        postReadTransport(
          new Request(`https://example.invalid/?type=${lookup}`),
          "staging",
          release,
          transport,
        ),
      ).toBe(transport);
    },
  );
  it.each(["entity-detail", "detail"])(
    "correlates primary %s headers, body and query without logging content",
    async (lookup) => {
      const request = new Request(`https://example.invalid/?type=${lookup}&slug=private-selector`, {
        headers: { "x-cms-document-trace": trace },
      });
      const response = new Response('{"private-payload":true}', { status: 503 });
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const log = vi.fn();
      const fetcher = postReadTransport(request, "staging", release, transport, log);
      const value = { data: null, error: { message: "private-error", code: "private-code" }, status: 503 };
      expect(
        await observePostReadQuery(
          request,
          "staging",
          release,
          async () => {
            expect(await fetcher(target)).toBe(response);
            expect(await response.text()).toBe('{"private-payload":true}');
            return value;
          },
          log,
        ),
      ).toBe(value);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(new Headers(transport.mock.calls[0][1]?.headers).get("x-client-info")).toContain(
        `cms-staging-entity-trace/${trace}.1`,
      );
      expect(log.mock.calls.map(([event]) => event.event)).toEqual([
        "cms.public.entity.query.start",
        "cms.public.entity.upstream.start",
        "cms.public.entity.upstream.finish",
        "cms.public.entity.body.start",
        "cms.public.entity.body.finish",
        "cms.public.entity.query.finish",
      ]);
      expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ trace, release, lookup, resultKind: "query_error" });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|slug=|message|code|data/);
    },
  );
  it("excludes related projection reads without consuming primary attempts", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("[]"));
    const log = vi.fn();
    const fetcher = postReadTransport(req, "staging", release, transport, log);
    await fetcher(target.replace("slug=private-selector", "item_id=in.(private-selector)"));
    expect(log).not.toHaveBeenCalled();
    await fetcher(target);
    await fetcher(target);
    expect(log.mock.calls.filter(([event]) => event.event.endsWith("upstream.start"))).toHaveLength(2);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it.each([
    [{ data: "private-row", error: null, status: 200 }, "success"],
    [{ data: null, error: { message: "private-error" }, status: 0 }, "transport_error"],
    [{ data: null, error: { message: "private-error" }, status: 503 }, "query_error"],
  ])("classifies only the envelope and preserves the result", async (value, resultKind) => {
    const log = vi.fn();
    expect(await observePostReadQuery(req, "staging", release, async () => value, log)).toBe(value);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ resultKind });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|message|data/);
  });
  it.each(["entity-detail", "detail", "products", "page-by-path"])(
    "retains the original two 900ms attempts for %s",
    async (lookup) => {
      vi.useFakeTimers();
      try {
        const request = new Request(`https://example.invalid/?type=${lookup}`, {
          headers: { "x-cms-document-trace": trace },
        });
        const log = vi.fn();
        const transport = vi.fn<typeof fetch>(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("private-error")), {
                once: true,
              });
            }),
        );
        const fetcher = boundedFetch(
          900,
          postReadTransport(request, "staging", release, transport, log),
          true,
        );
        const primaryTarget =
          lookup === "page-by-path"
            ? target.replace(
                "slug=private-selector",
                "content_type=in.(page,homepage)&payload-%3Eroute-%3E%3Epath=eq.private-selector",
              )
            : lookup === "products"
              ? target.replace("slug=private-selector", "content_type=eq.product")
              : target;
        const result = expect(fetcher(primaryTarget)).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
        await vi.advanceTimersByTimeAsync(1800);
        await result;
        expect(transport).toHaveBeenCalledTimes(2);
        expect(
          log.mock.calls.filter(([event]) => event.event.endsWith("finish")).map(([event]) => event.outcome),
        ).toEqual(["deadline", "deadline"]);
        expect(JSON.stringify(log.mock.calls)).not.toContain("private-error");
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it.each(["local", "production", undefined])("leaves %s transport untouched", (environment) => {
    const transport = vi.fn<typeof fetch>();
    expect(postReadTransport(req, environment, release, transport)).toBe(transport);
  });
  it("requires an exact release, trace and post lookup", () => {
    const transport = vi.fn<typeof fetch>();
    for (const [request, sha] of [
      [req, "unknown"],
      [new Request(target), release],
      [
        new Request("https://example.invalid/?type=form", { headers: { "x-cms-document-trace": trace } }),
        release,
      ],
    ] as const)
      expect(postReadTransport(request, "staging", sha, transport)).toBe(transport);
  });
  it("preserves the response, single body consumption and original headers without logging them", async () => {
    const response = new Response('{"secret":"private-payload"}', {
      status: 200,
      headers: { "x-private": "private-header" },
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn();
    const original = response.text.bind(response);
    const text = vi.fn(original);
    response.text = text;
    const result = await postReadTransport(
      req,
      "staging",
      release,
      transport,
      log,
    )(target, { headers: { apikey: "private-key", "x-client-info": "sdk/2" } });
    expect(result).toBe(response);
    expect(result.headers.get("x-private")).toBe("private-header");
    expect(text).not.toHaveBeenCalled();
    expect(await result.text()).toBe('{"secret":"private-payload"}');
    expect(text).toHaveBeenCalledTimes(1);
    expect(new Headers(transport.mock.calls[0][1]?.headers).get("apikey")).toBe("private-key");
    expect(new Headers(transport.mock.calls[0][1]?.headers).get("x-client-info")).toBe(
      `sdk/2 cms-staging-post-trace/${trace}.1`,
    );
    expect(log.mock.calls.map(([event]) => event.event)).toEqual([
      "cms.public.post.upstream.start",
      "cms.public.post.upstream.finish",
      "cms.public.post.body.start",
      "cms.public.post.body.finish",
    ]);
    expect(log.mock.calls[1][0]).toMatchObject({ trace, release, upstreamTrace: `${trace}.1`, status: 200 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|sdk\/2|supabase\.co|slug=/);
  });
  it("separates headers, delayed body consumption and total query time without an additional request", async () => {
    vi.useFakeTimers();
    try {
      const response = new Response("[]");
      response.text = () => new Promise((resolve) => setTimeout(() => resolve("[]"), 3000));
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const log = vi.fn();
      const fetcher = postReadTransport(req, "staging", release, transport, log);
      const result = observePostReadQuery(
        req,
        "staging",
        release,
        async () => (await fetcher(target)).text(),
        log,
      );
      await vi.advanceTimersByTimeAsync(3000);
      expect(await result).toBe("[]");
      const events = log.mock.calls.map(([event]) => event);
      expect(events.find((event) => event.event === "cms.public.post.upstream.finish")?.durationMs).toBe(0);
      expect(events.find((event) => event.event === "cms.public.post.body.finish")?.durationMs).toBe(3000);
      expect(events.find((event) => event.event === "cms.public.post.query.finish")?.durationMs).toBe(3000);
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not instrument writes, other origins or other tables", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("[]"));
    const log = vi.fn();
    const fetcher = postReadTransport(req, "staging", release, transport, log);
    await fetcher(target, { method: "POST" });
    await fetcher("https://example.invalid/rest/v1/cms_published_projection");
    await fetcher("https://glcqsosxwgmlhzgcsnzv.supabase.co/rest/v1/other");
    expect(log).not.toHaveBeenCalled();
    expect(transport.mock.calls[0][1]).toEqual({ method: "POST" });
  });
  it("retains HTTP failures without retry or accepting them", async () => {
    const response = new Response("private-error", { status: 503 });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn();
    expect(await postReadTransport(req, "staging", release, transport, log)(target)).toBe(response);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[1][0]).toMatchObject({ status: 503, outcome: "response" });
  });
  it("keeps the existing 900ms two-attempt deadline and original error", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("private-error")), { once: true });
          }),
      );
      const fetcher = boundedFetch(900, postReadTransport(req, "staging", release, transport, log), true);
      const result = expect(fetcher(target)).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
      await vi.advanceTimersByTimeAsync(1800);
      await result;
      expect(transport).toHaveBeenCalledTimes(2);
      expect(
        log.mock.calls.filter(([event]) => event.event.endsWith("finish")).map(([event]) => event.outcome),
      ).toEqual(["deadline", "deadline"]);
      expect(new Headers(transport.mock.calls[1][1]?.headers).get("x-client-info")).toContain(`${trace}.2`);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-error");
    } finally {
      vi.useRealTimers();
    }
  });
  it("preserves body errors without exposing or replacing them", async () => {
    const response = new Response("[]");
    const error = new Error("private-body-error");
    response.text = async () => {
      throw error;
    };
    const log = vi.fn();
    const result = await postReadTransport(
      req,
      "staging",
      release,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      log,
    )(target);
    await expect(result.text()).rejects.toBe(error);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ outcome: "read_error" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-body-error");
  });
  it("limits correlation to the original two attempts without adding any", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("[]"));
    const log = vi.fn();
    const fetcher = postReadTransport(req, "staging", release, transport, log);
    await fetcher(target);
    await fetcher(target);
    await fetcher(target);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(4);
    expect(transport.mock.calls[2][1]).toBeUndefined();
  });
  it("preserves query results and rejected errors without logging them", async () => {
    const log = vi.fn();
    const value = { data: null, error: { message: "private-database-error" } };
    expect(await observePostReadQuery(req, "staging", release, async () => value, log)).toBe(value);
    const error = new Error("private-rejection");
    await expect(
      observePostReadQuery(
        req,
        "staging",
        release,
        async () => {
          throw error;
        },
        log,
      ),
    ).rejects.toBe(error);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ outcome: "rejected" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|data|message/);
  });
  it.each(["local", "production", undefined])("does not log query results in %s", async (environment) => {
    const log = vi.fn();
    const read = vi.fn().mockResolvedValue(null);
    expect(await observePostReadQuery(req, environment, release, read, log)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});
