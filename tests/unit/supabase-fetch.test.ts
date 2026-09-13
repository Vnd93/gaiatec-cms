import { describe, expect, it, vi } from "vitest";
import { createDurableSupabaseFetch } from "../../src/lib/supabase-fetch";

const supabaseUrl = "https://example.supabase.co";

describe("durable Supabase fetch", () => {
  it("downloads the exact local logout response before returning it to auth-js", async () => {
    const response = new Response(null, { status: 204 });
    let releaseDrain!: () => void;
    const drainPending = new Promise<ArrayBuffer>((resolve) => {
      releaseDrain = () => resolve(new ArrayBuffer(0));
    });
    const drained = vi.fn(() => drainPending);
    vi.spyOn(response, "clone").mockReturnValue({ arrayBuffer: drained } as unknown as Response);
    const baseFetch = vi.fn(async () => response) as unknown as typeof fetch;
    const durableFetch = createDurableSupabaseFetch(supabaseUrl, baseFetch);

    const pending = durableFetch(`${supabaseUrl}/auth/v1/logout?scope=local`, { method: "POST" });
    await vi.waitFor(() => expect(drained).toHaveBeenCalledTimes(1));
    let returnedBeforeDrain = false;
    void pending.then(() => {
      returnedBeforeDrain = true;
    });
    await Promise.resolve();
    expect(returnedBeforeDrain).toBe(false);
    releaseDrain();
    const returned = await pending;

    expect(returned).toBe(response);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(drained).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["GET", `${supabaseUrl}/auth/v1/logout?scope=local`],
    ["POST", `${supabaseUrl}/auth/v1/logout?scope=global`],
    ["POST", `${supabaseUrl}/auth/v1/logout?scope=local&unexpected=true`],
    ["POST", `${supabaseUrl}/functions/v1/cms-session?scope=local`],
    ["POST", "https://different.supabase.co/auth/v1/logout?scope=local"],
  ])("does not consume a non-matching %s request to %s", async (method, url) => {
    const response = new Response("unchanged", { status: 200 });
    const clone = vi.spyOn(response, "clone");
    const baseFetch = vi.fn(async () => response) as unknown as typeof fetch;
    const durableFetch = createDurableSupabaseFetch(supabaseUrl, baseFetch);

    const returned = await durableFetch(url, { method });

    expect(returned).toBe(response);
    expect(clone).not.toHaveBeenCalled();
    expect(await returned.text()).toBe("unchanged");
  });

  it("preserves Request input and propagates a logout body failure", async () => {
    const request = new Request(`${supabaseUrl}/auth/v1/logout?scope=local`, { method: "POST" });
    const response = new Response(null, { status: 204 });
    vi.spyOn(response, "clone").mockReturnValue({
      arrayBuffer: async () => {
        throw new TypeError("network body interrupted");
      },
    } as unknown as Response);
    const baseFetch = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(createDurableSupabaseFetch(supabaseUrl, baseFetch)(request)).rejects.toThrow(
      "network body interrupted",
    );
    expect(baseFetch).toHaveBeenCalledWith(request, undefined);
  });
});
