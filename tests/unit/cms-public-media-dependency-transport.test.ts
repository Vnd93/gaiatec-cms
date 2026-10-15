import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";
import { mediaDependencyTransport } from "../../supabase/functions/cms-public/media-dependency-transport";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const req = new Request("https://example.invalid/?type=products&q=private-selector", {
  headers: { "x-cms-document-trace": trace, authorization: "private-credential" },
});
const origin = "https://glcqsosxwgmlhzgcsnzv.supabase.co";

describe("staging media dependency correlation", () => {
  it("is wired inside the unchanged bounded transport rather than adding a fetch", () => {
    const source = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
    expect(source).toMatch(/boundedFetch\(PUBLIC_UPSTREAM_TIMEOUT_MS,\s*mediaDependencyTransport\(/);
    expect(source).toContain("const PUBLIC_UPSTREAM_TIMEOUT_MS = 900;");
    expect(source).toContain("db: { retry: false }");
  });
  it.each([
    ["/rest/v1/cms_dam_replacements", "GET", "replacements"],
    ["/rest/v1/cms_media_assets", "GET", "assets"],
    ["/rest/v1/cms_media_variants", "GET", "variants"],
    ["/storage/v1/object/sign/cms-media-private", "POST", "signing"],
  ])("correlates %s without exposing selectors, headers, bodies or errors", async (path, method, stage) => {
    const response = new Response('{"private-payload":true}', { status: 200 });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn();
    const result = await mediaDependencyTransport(
      req,
      "staging",
      release,
      transport,
      log,
    )(`${origin}${path}?id=private-selector`, {
      method,
      headers: { apikey: "private-key", "x-client-info": "sdk/2" },
    });
    expect(result).toBe(response);
    expect(await result.json()).toEqual({ "private-payload": true });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(new Headers(transport.mock.calls[0][1]?.headers).get("apikey")).toBe("private-key");
    expect(new Headers(transport.mock.calls[0][1]?.headers).get("x-client-info")).toBe(
      `sdk/2 cms-staging-media-trace/${trace}.1`,
    );
    expect(log.mock.calls.map(([value]) => value.phase)).toEqual(["start", "headers", "body"]);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({
      trace,
      release,
      stage,
      sequence: 1,
      outcome: "complete",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|apikey|authorization|supabase\.co|sdk\/2/);
  });

  it("keeps two bounded GET attempts and one signing attempt without adding retries", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("private-error")), { once: true });
          }),
      );
      const fetcher = boundedFetch(
        900,
        mediaDependencyTransport(req, "staging", release, transport, log),
        true,
      );
      const read = expect(fetcher(`${origin}/rest/v1/cms_media_assets`)).rejects.toThrow(
        "CMS_EDGE_FETCH_TIMEOUT:",
      );
      await vi.advanceTimersByTimeAsync(1800);
      await read;
      expect(transport).toHaveBeenCalledTimes(2);
      expect(
        log.mock.calls.filter(([value]) => value.phase === "failed").map(([value]) => value.outcome),
      ).toEqual(["deadline", "deadline"]);
      const signing = expect(
        fetcher(`${origin}/storage/v1/object/sign/cms-media-private`, { method: "POST" }),
      ).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
      await vi.advanceTimersByTimeAsync(900);
      await signing;
      expect(transport).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("observes delayed body once, retains errors and never consumes content itself", async () => {
    const response = new Response("private-body");
    const error = new Error("private-body-error");
    const text = vi.fn().mockRejectedValue(error);
    response.text = text;
    const log = vi.fn();
    const fetcher = mediaDependencyTransport(
      req,
      "staging",
      release,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      log,
    );
    const result = await fetcher(`${origin}/rest/v1/cms_media_assets`);
    expect(text).not.toHaveBeenCalled();
    await expect(result.text()).rejects.toBe(error);
    expect(text).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "body", outcome: "read_error" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
  });

  it("records the existing deadline even if the transport ignores abort, without another request", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      let resolve!: (response: Response) => void;
      const transport = vi.fn<typeof fetch>(
        () =>
          new Promise((complete) => {
            resolve = complete;
          }),
      );
      const fetcher = boundedFetch(900, mediaDependencyTransport(req, "staging", release, transport, log));
      const result = expect(
        fetcher(`${origin}/storage/v1/object/sign/cms-media-private`, { method: "POST" }),
      ).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
      await vi.advanceTimersByTimeAsync(900);
      await result;
      expect(log.mock.calls.at(-1)?.[0]).toMatchObject({
        phase: "failed",
        outcome: "deadline",
        durationMs: 900,
      });
      resolve(new Response("{}"));
      await vi.advanceTimersByTimeAsync(1);
      expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "late_headers", status: 200 });
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("separates time to headers and body without changing either", async () => {
    vi.useFakeTimers();
    try {
      const response = new Response("[]");
      response.text = () => new Promise((resolve) => setTimeout(() => resolve("[]"), 250));
      const log = vi.fn();
      const fetcher = mediaDependencyTransport(
        req,
        "staging",
        release,
        vi.fn<typeof fetch>().mockResolvedValue(response),
        log,
      );
      const result = await fetcher(`${origin}/rest/v1/cms_media_assets`);
      const body = result.text();
      await vi.advanceTimersByTimeAsync(250);
      expect(await body).toBe("[]");
      expect(log.mock.calls[1][0]).toMatchObject({ phase: "headers", durationMs: 0 });
      expect(log.mock.calls[2][0]).toMatchObject({ phase: "body", durationMs: 250, bodyDurationMs: 250 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not change HTTP refusal or let a logger failure alter the request", async () => {
    const response = new Response("private-error", { status: 503 });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn(() => {
      throw new Error("private-log-failure");
    });
    expect(
      await mediaDependencyTransport(
        req,
        "staging",
        release,
        transport,
        log,
      )(`${origin}/rest/v1/cms_media_assets`),
    ).toBe(response);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("private-error");
  });

  it.each(["production", "local", undefined])("leaves %s transport untouched", (environment) => {
    const transport = vi.fn<typeof fetch>();
    expect(mediaDependencyTransport(req, environment, release, transport)).toBe(transport);
  });

  it("requires a bound trace and exact SHA", () => {
    const transport = vi.fn<typeof fetch>();
    expect(mediaDependencyTransport(req, "staging", "invalid", transport)).toBe(transport);
    expect(
      mediaDependencyTransport(
        new Request("https://example.invalid/?type=products"),
        "staging",
        release,
        transport,
      ),
    ).toBe(transport);
  });

  it("excludes other hosts, paths, methods and bounds logging per request", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("[]"));
    const log = vi.fn();
    const fetcher = mediaDependencyTransport(req, "staging", release, transport, log);
    await fetcher("https://other.invalid/rest/v1/cms_media_assets");
    await fetcher(`${origin}/rest/v1/cms_profiles`);
    await fetcher(`${origin}/rest/v1/cms_media_assets`, { method: "DELETE" });
    await fetcher(`${origin}/storage/v1/object/sign/cms-media-private/private-object`, { method: "POST" });
    expect(log).not.toHaveBeenCalled();
    for (let index = 0; index < 65; index++) await fetcher(`${origin}/rest/v1/cms_media_assets`);
    expect(log.mock.calls.filter(([value]) => value.phase === "start")).toHaveLength(64);
    expect(transport).toHaveBeenCalledTimes(69);
    expect(transport.mock.calls.at(-1)?.[1]).toBeUndefined();
  });
});
