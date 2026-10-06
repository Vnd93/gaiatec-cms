import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";
import { signMediaDownloadUrls } from "../../supabase/functions/_shared/cms-media-signing";

const deadline = 900;
const paths = ["governed/card.webp", "governed/card.avif"];
const ttl = 3600;
const response = () =>
  Response.json(
    paths.map((path) => ({
      path,
      error: null,
      signedURL: `/object/sign/cms-media-private/${path}?token=synthetic-signature`,
    })),
  );
const stalled = () => new Promise<Response>(() => {});

function bucket(transport: typeof fetch) {
  return createClient("https://project.supabase.co", "synthetic-test-key", {
    global: { fetch: boundedFetch(deadline, transport, true) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from("cms-media-private");
}

afterEach(() => vi.useRealTimers());

describe("governed media download signing", () => {
  it("keeps a healthy signing call single and preserves the SDK result", async () => {
    const transport = vi.fn(async () => response());
    const result = await signMediaDownloadUrls(bucket(transport), paths, ttl, true);
    expect(result.error).toBeNull();
    expect(result.data?.map((entry) => entry.path)).toEqual(paths);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("recovers one stalled POST with identical paths, expiry and authorization", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    transport.mockImplementationOnce(stalled);
    const result = signMediaDownloadUrls(bucket(transport), paths, ttl, true);
    await vi.advanceTimersByTimeAsync(deadline);
    await expect(result).resolves.toMatchObject({ error: null });
    expect(transport).toHaveBeenCalledTimes(2);
    const [[firstTarget, first], [secondTarget, second]] = transport.mock.calls;
    expect(String(firstTarget)).toBe("https://project.supabase.co/storage/v1/object/sign/cms-media-private");
    expect(secondTarget).toBe(firstTarget);
    expect(first?.method).toBe("POST");
    expect(second?.method).toBe("POST");
    expect(JSON.parse(first?.body as string)).toEqual({ expiresIn: ttl, paths });
    expect(second?.body).toBe(first?.body);
    expect(new Headers(second?.headers)).toEqual(new Headers(first?.headers));
    expect(new Headers(second?.headers).get("Authorization")).toBe("Bearer synthetic-test-key");
    expect(first?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed after exactly two deadlines, without granting extra time or returning partial URLs", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(stalled);
    const result = signMediaDownloadUrls(bucket(transport), paths, ttl, true);
    await vi.advanceTimersByTimeAsync(deadline * 2);
    const failed = await result;
    expect(failed.data).toBeNull();
    expect(failed.error?.message).toContain(
      "CMS_EDGE_FETCH_TIMEOUT:POST:/storage/v1/object/sign/cms-media-private:900",
    );
    expect(failed.error?.message).not.toMatch(/governed|synthetic-test-key|synthetic-signature/);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry signing in callers that did not explicitly opt in", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(stalled);
    const result = signMediaDownloadUrls(bucket(transport), paths, ttl);
    await vi.advanceTimersByTimeAsync(deadline);
    expect((await result).error?.message).toContain("CMS_EDGE_FETCH_TIMEOUT:");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("recovers a normalized transport 504 once", async () => {
    const transport = vi.fn(async () => response());
    transport.mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }));
    const result = await signMediaDownloadUrls(bucket(transport), paths, ttl, true);
    expect(result.error).toBeNull();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 429, 500, 503])(
    "does not retry a structured refusal (HTTP %i), even with a timeout-looking message",
    async (status) => {
      const transport = vi.fn(async () =>
        Response.json(
          { message: "CMS_EDGE_FETCH_TIMEOUT:synthetic-refusal", statusCode: String(status) },
          { status },
        ),
      );
      const result = await signMediaDownloadUrls(bucket(transport), paths, ttl, true);
      expect(result.data).toBeNull();
      expect(result.error?.status).toBe(status);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry a cancellation or an unknown network failure", async () => {
    for (const error of [
      new DOMException("synthetic cancellation", "AbortError"),
      new TypeError("synthetic network failure"),
    ]) {
      const transport = vi.fn(async () => {
        throw error;
      });
      const result = await signMediaDownloadUrls(bucket(transport), paths, ttl, true);
      expect(result.data).toBeNull();
      expect(result.error?.message).not.toContain("CMS_EDGE_FETCH_TIMEOUT:");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry object-level denials or replace a refused URL with a fallback", async () => {
    const transport = vi.fn(async () =>
      Response.json(paths.map((path) => ({ path, error: "Access denied", signedURL: null }))),
    );
    const result = await signMediaDownloadUrls(bucket(transport), paths, ttl, true);
    expect(result.error).toBeNull();
    expect(result.data?.every((entry) => entry.error === "Access denied" && !entry.signedUrl)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("leaves generic POST mutations outside the signing retry", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(stalled);
    const request = boundedFetch(
      deadline,
      transport,
      true,
    )("https://project.supabase.co/rest/v1/rpc/cms_execute_command", { method: "POST", body: "{}" });
    const failure = expect(request).rejects.toThrow("CMS_EDGE_FETCH_TIMEOUT:POST:");
    await vi.advanceTimersByTimeAsync(deadline);
    await failure;
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
