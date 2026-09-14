import { describe, expect, it, vi } from "vitest";

import {
  CMS_IDEMPOTENT_RETRY_DELAY_MS,
  isTransientSupabaseOperationError,
  retryIdempotentSupabaseOperation,
} from "../../supabase/functions/_shared/cms-idempotent-retry";

describe("idempotent Supabase operation retry", () => {
  it("retries one transient Storage refusal and returns the successful result", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { name: "StorageApiError", status: 500 } })
      .mockResolvedValueOnce({ data: { token: "sealed" }, error: null });
    const pause = vi.fn(async () => {});

    await expect(retryIdempotentSupabaseOperation(operation, pause)).resolves.toEqual({
      data: { token: "sealed" },
      error: null,
    });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledWith(CMS_IDEMPOTENT_RETRY_DELAY_MS);
  });

  it("uses one bounded default delay and leaves no timer after convergence", async () => {
    vi.useFakeTimers();
    try {
      const operation = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { status: 503 } })
        .mockResolvedValueOnce({ data: { id: "persisted" }, error: null });

      const call = retryIdempotentSupabaseOperation(operation);
      expect(operation).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(CMS_IDEMPOTENT_RETRY_DELAY_MS);
      await expect(call).resolves.toEqual({ data: { id: "persisted" }, error: null });
      expect(operation).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a deterministic refusal", async () => {
    const result = { data: null, error: { name: "StorageApiError", statusCode: "400" } };
    const operation = vi.fn(async () => result);
    const pause = vi.fn(async () => {});

    await expect(retryIdempotentSupabaseOperation(operation, pause)).resolves.toBe(result);
    expect(operation).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });

  it("stops after exactly one retry when a transient refusal persists", async () => {
    const result = { data: null, error: { name: "StorageApiError", status: 429 } };
    const operation = vi.fn(async () => result);
    const pause = vi.fn(async () => {});

    await expect(retryIdempotentSupabaseOperation(operation, pause)).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
  });

  it("uses the top-level PostgREST HTTP status when the database error has no SQLSTATE", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "gateway" }, status: 503 })
      .mockResolvedValueOnce({ data: { id: "persisted" }, error: null, status: 200 });

    await expect(retryIdempotentSupabaseOperation(operation, async () => {})).resolves.toMatchObject({
      data: { id: "persisted" },
      error: null,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries the status-zero envelope PostgREST uses for a transport rejection", async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "TypeError: fetch failed", code: "" },
        status: 0,
      })
      .mockResolvedValueOnce({ data: { id: "persisted" }, error: null, status: 200 });

    await expect(retryIdempotentSupabaseOperation(operation, async () => {})).resolves.toMatchObject({
      data: { id: "persisted" },
      error: null,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("normalizes and retries an unknown Storage transport failure", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ name: "StorageUnknownError" })
      .mockResolvedValueOnce({ data: { signedUrl: "sealed" }, error: null });

    await expect(retryIdempotentSupabaseOperation(operation, async () => {})).resolves.toEqual({
      data: { signedUrl: "sealed" },
      error: null,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("recognizes only bounded transport, HTTP and database transient identities", () => {
    for (const error of [
      { status: 408 },
      { statusCode: "425" },
      { originalError: { status: 503 } },
      { code: "40001" },
      { code: "08006" },
      { message: "Error: CMS_EDGE_FETCH_TIMEOUT:POST:/storage/v1/object/upload/sign/x:30000" },
    ])
      expect(isTransientSupabaseOperationError(error)).toBe(true);

    for (const error of [
      null,
      new Error("boom"),
      { status: 401 },
      { statusCode: "409" },
      { code: "23505" },
      { name: "StorageError" },
      { name: "TimeoutError" },
      { name: "TypeError" },
    ])
      expect(isTransientSupabaseOperationError(error)).toBe(false);
  });
});
