import { describe, expect, it, vi } from "vitest";
import { formReadTransport } from "../../supabase/functions/cms-public/form-read-transport";
import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const req = new Request("https://example.invalid/?type=form&key=never-log", {
  headers: { "x-cms-document-trace": trace },
});
const rpc =
  "https://glcqsosxwgmlhzgcsnzv.supabase.co/rest/v1/rpc/cms_public_form_scoped?p_form_key=never-log";

describe("staging form RPC transport correlation", () => {
  it.each(["local", "production", undefined])("leaves %s transport untouched", (environment) => {
    const transport = vi.fn<typeof fetch>();
    expect(formReadTransport(req, environment, release, transport)).toBe(transport);
  });
  it("requires an exact form trace and release", () => {
    const transport = vi.fn<typeof fetch>();
    expect(formReadTransport(req, "staging", "unknown", transport)).toBe(transport);
    expect(
      formReadTransport(new Request("https://example.invalid/?type=form"), "staging", release, transport),
    ).toBe(transport);
  });
  it("preserves response and headers while logging only the closed correlation envelope", async () => {
    const response = new Response("null", { status: 200 });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const log = vi.fn();
    const wrapped = formReadTransport(req, "staging", release, transport, log);
    expect(
      await wrapped(rpc, { headers: { apikey: "credential-never-log", "x-client-info": "sdk/2" } }),
    ).toBe(response);
    const headers = new Headers(transport.mock.calls[0][1]?.headers);
    expect(headers.get("apikey")).toBe("credential-never-log");
    expect(headers.get("x-client-info")).toBe(`sdk/2 cms-staging-form-trace/${trace}.1`);
    expect(log.mock.calls[1][0]).toMatchObject({
      event: "cms.public.form.upstream.finish",
      release,
      trace,
      upstreamTrace: `${trace}.1`,
      attempt: 1,
      outcome: "response",
      status: 200,
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/never-log|supabase\.co|p_form_key|apikey|sdk\/2/);
  });
  it("keeps document and upstream attempts distinct", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("null"));
    const secondDocument = new Request(req, {
      headers: { "x-cms-document-trace": trace.slice(0, -1) + "2" },
    });
    await formReadTransport(req, "staging", release, transport, vi.fn())(rpc);
    await formReadTransport(secondDocument, "staging", release, transport, vi.fn())(rpc);
    const correlations = transport.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("x-client-info"),
    );
    expect(correlations).toEqual([
      `supabase cms-staging-form-trace/${trace}.1`,
      `supabase cms-staging-form-trace/${trace.slice(0, -1)}2.1`,
    ]);
    expect(new Set(correlations).size).toBe(2);
  });
  it("does not instrument other targets or writes", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("null"));
    const log = vi.fn();
    const wrapped = formReadTransport(req, "staging", release, transport, log);
    await wrapped(rpc, { method: "POST" });
    await wrapped("https://example.invalid/rest/v1/rpc/cms_public_form_scoped");
    await wrapped("https://glcqsosxwgmlhzgcsnzv.supabase.co/rest/v1/other");
    expect(log).not.toHaveBeenCalled();
    expect(transport.mock.calls[0][1]).toEqual({ method: "POST" });
  });
  it("correlates the existing two deadline attempts without adding retries or exposing errors", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("private transport value")), {
              once: true,
            });
          }),
      );
      const wrapped = boundedFetch(900, formReadTransport(req, "staging", release, transport, log), true);
      const result = expect(wrapped(rpc)).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:");
      await vi.advanceTimersByTimeAsync(1800);
      await result;
      expect(transport).toHaveBeenCalledTimes(2);
      expect(
        log.mock.calls.filter(([event]) => event.event.endsWith("finish")).map(([event]) => event.outcome),
      ).toEqual(["deadline", "deadline"]);
      expect(new Headers(transport.mock.calls[1][1]?.headers).get("x-client-info")).toContain(`${trace}.2`);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private transport value");
    } finally {
      vi.useRealTimers();
    }
  });
});
