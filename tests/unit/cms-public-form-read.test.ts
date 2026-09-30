import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boundedFetch } from "../../supabase/functions/_shared/cms-edge-fetch";
import { publicFormReadArguments } from "../../supabase/functions/_shared/cms-public-form-bindings";

const formId = "86000000-0000-4000-8000-000000000001";
const versionId = "87000000-0000-4000-8000-000000000001";
const deadline = 900;
const record = { id: formId, version_id: versionId, form_key: "synthetic-contact", version: 1 };
const response = () => Response.json(record);
const stalled = () => new Promise<Response>(() => {});

function client(transport: typeof fetch) {
  return createClient("https://form-read.invalid", "synthetic-test-key", {
    global: { fetch: boundedFetch(deadline, transport, true) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function read(transport: typeof fetch, filters: Parameters<typeof publicFormReadArguments>[1]) {
  return client(transport)
    .rpc("cms_public_form_scoped", publicFormReadArguments("staging", filters), { get: true })
    .retry(false);
}

afterEach(() => vi.useRealTimers());

describe("authoritative public form read transport", () => {
  it.each([
    [{ key: "synthetic-contact" }, { p_form_key: "synthetic-contact" }],
    [
      { formId, versionId },
      { p_form_id: formId, p_version_id: versionId },
    ],
    [
      { key: "synthetic-contact", formId, versionId },
      { p_form_key: "synthetic-contact", p_form_id: formId, p_version_id: versionId },
    ],
    [{ key: "", formId: null, versionId: undefined }, { p_form_key: "" }],
    [{ key: null, formId: undefined, versionId: null }, {}],
  ])("preserves exact selectors and omits SQL NULL defaults: %j", async (filters, selectors) => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    const result = await read(transport, filters);

    expect(result.error).toBeNull();
    expect(result.data).toEqual(record);
    expect(transport).toHaveBeenCalledTimes(1);
    const [target, init] = transport.mock.calls[0];
    const url = new URL(String(target));
    expect(url.pathname).toBe("/rest/v1/rpc/cms_public_form_scoped");
    expect(Object.fromEntries(url.searchParams)).toEqual({ p_environment: "staging", ...selectors });
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-test-key");
    expect(url.search).not.toContain("synthetic-test-key");
  });

  it("recovers one stalled read inside the existing two-attempt ceiling", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    transport.mockImplementationOnce(stalled);
    const result = Promise.resolve(read(transport, { formId, versionId }));

    await vi.advanceTimersByTimeAsync(deadline);
    await expect(result).resolves.toMatchObject({ data: record, error: null });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][0]).toBe(transport.mock.calls[1][0]);
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed after two stalls without nested SDK retries or selector leakage", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(stalled);
    const result = Promise.resolve(read(transport, { formId, versionId }));
    await vi.advanceTimersByTimeAsync(deadline * 2);

    const failure = await result;
    expect(failure.data).toBeNull();
    expect(failure.error?.message).toContain(
      "CMS_EDGE_FETCH_TIMEOUT:GET:/rest/v1/rpc/cms_public_form_scoped:900",
    );
    expect(failure.error?.message).not.toMatch(/86000000|87000000|p_form_|synthetic-test-key/);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a gateway timeout once with the identical read", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    transport.mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }));
    const result = await read(transport, { key: "synthetic-contact" });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(record);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][0]).toBe(transport.mock.calls[1][0]);
  });

  it.each([400, 401, 403, 500, 520])("does not retry a structured refusal (HTTP %i)", async (status) => {
    const transport = vi.fn(async () =>
      Response.json({ code: "FORM_READ_REFUSED", message: "Synthetic refusal" }, { status }),
    );
    const result = await read(transport, { formId, versionId });

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("FORM_READ_REFUSED");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not retry an explicit caller cancellation", async () => {
    const controller = new AbortController();
    const transport = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
          controller.abort(new DOMException("synthetic cancellation", "AbortError"));
        }),
    );
    const result = await read(transport, { formId, versionId }).abortSignal(controller.signal);

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("synthetic cancellation");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("leaves write RPCs single-attempt even when the transport retry is enabled", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(stalled);
    const result = Promise.resolve(client(transport).rpc("synthetic_write", {}));
    await vi.advanceTimersByTimeAsync(deadline);

    const failure = await result;
    expect(failure.data).toBeNull();
    expect(failure.error?.message).toContain("CMS_EDGE_FETCH_TIMEOUT:POST:");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
