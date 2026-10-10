import { describe, expect, it, vi } from "vitest";
import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";
import {
  observePostReadQuery,
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
  it.each(["entity-detail", "detail"])(
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
  it.each(["entity-detail", "detail"])("retains the original two 900ms attempts for %s", async (lookup) => {
    vi.useFakeTimers();
    try {
      const request = new Request(`https://example.invalid/?type=${lookup}`, {
        headers: { "x-cms-document-trace": trace },
      });
      const log = vi.fn();
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("private-error")), { once: true });
          }),
      );
      const fetcher = boundedFetch(900, postReadTransport(request, "staging", release, transport, log), true);
      const result = expect(fetcher(target)).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
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
  });
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
