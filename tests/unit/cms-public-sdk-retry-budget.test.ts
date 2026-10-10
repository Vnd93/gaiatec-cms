import { PostgrestClient } from "@supabase/postgrest-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";

function publicClient(transport: typeof fetch) {
  // Exercise the PostgREST retry owner directly. The browser's older supabase-js wrapper does
  // not forward db.retry; the sealed Edge 2.112.4 wrapper does. Its pinned bundle is smoke-tested
  // by CI; the source contract also requires the Edge client option rather than a query opt-in.
  return new PostgrestClient("https://example.invalid/rest/v1", {
    retry: false,
    fetch: boundedFetch(900, transport, true),
  });
}

afterEach(() => vi.useRealTimers());

describe("public SDK and transport retry ownership", () => {
  it("reproduces why the SDK default cannot share the transport retry budget", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const client = new PostgrestClient("https://example.invalid/rest/v1", {
      fetch: boundedFetch(900, transport, true),
    });
    const started = Date.now();
    const pending = Promise.resolve(client.from("cms_published_projection").select("id"));
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(Date.now() - started).toBe(14200);
    expect(transport).toHaveBeenCalledTimes(8);
    expect(result.error).not.toBeNull();
  });

  it("does not retry a non-timeout network failure", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("network failure"));
    const started = Date.now();
    const result = await publicClient(transport).from("cms_published_projection").select("id");
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("terminates two stalled reads in 1800 ms without SDK backoff or additional requests", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const started = Date.now();
    const pending = Promise.resolve(
      publicClient(transport).from("cms_published_projection").select("id").limit(1).maybeSingle(),
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(Date.now() - started).toBe(1800);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("CMS_EDGE_FETCH_TIMEOUT:");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 403, 409, 503, 520])(
    "preserves HTTP %s without retrying it to obtain success",
    async (status) => {
      vi.useFakeTimers();
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: "TEST_ERROR", message: "upstream failure" }), { status }),
        );
      const started = Date.now();
      const result = await publicClient(transport).from("cms_published_projection").select("id");
      expect(result.status).toBe(status);
      expect(result.error?.code).toBe("TEST_ERROR");
      expect(result.data).toBeNull();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(Date.now() - started).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not retry an ambiguous write timeout", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const started = Date.now();
    const pending = Promise.resolve(
      publicClient(transport).from("cms_search_events").insert({ kind: "synthetic" }),
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(Date.now() - started).toBe(900);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.method).toBe("POST");
    expect(result.error?.message).toContain("CMS_EDGE_FETCH_TIMEOUT:");
    expect(result.data).toBeNull();
  });

  it("preserves a healthy empty projection without additional requests", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 }));
    const result = await publicClient(transport).from("cms_published_projection").select("id").maybeSingle();
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
