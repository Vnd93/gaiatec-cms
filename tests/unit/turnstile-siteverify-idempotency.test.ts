import { describe, expect, it, vi } from "vitest";

import {
  deriveTurnstileSiteverifyIdempotencyKey,
  expandCompactCanonicalUuid,
  TURNSTILE_SITEVERIFY_OPERATIONS,
  TURNSTILE_SITEVERIFY_TIMEOUT_MS,
  verifyTurnstileSiteverify,
} from "../../supabase/functions/_shared/turnstile-siteverify-idempotency.ts";

const COMMERCIAL_KEY = "65ce5231-ee71-41ba-aaf8-b8c77f4cd42d";
const TOKEN = "turnstile-token-never-persisted";

function siteverifyInput() {
  return {
    operation: "cms-lead-capture" as const,
    commercialKey: COMMERCIAL_KEY,
    token: TOKEN,
    secret: "turnstile-secret-never-persisted",
    remoteIp: "203.0.113.10",
    isAccepted: (result: { success?: boolean; cdata?: string }) =>
      result.success === true && result.cdata === COMMERCIAL_KEY,
  };
}

describe("Turnstile Siteverify idempotency", () => {
  it("reconstructs only a canonical commercial UUID from the public compact token", () => {
    expect(expandCompactCanonicalUuid(COMMERCIAL_KEY.replaceAll("-", ""))).toBe(COMMERCIAL_KEY);
    expect(expandCompactCanonicalUuid("65ce5231ee7101baaaf8b8c77f4cd42d")).toBeNull();
    expect(expandCompactCanonicalUuid("65ce5231ee7141ba0af8b8c77f4cd42d")).toBeNull();
  });

  it("is deterministic for the same commercial key and token", async () => {
    const first = await deriveTurnstileSiteverifyIdempotencyKey("cms-lead-capture", COMMERCIAL_KEY, TOKEN);
    const second = await deriveTurnstileSiteverifyIdempotencyKey("cms-lead-capture", COMMERCIAL_KEY, TOKEN);

    expect(second).toBe(first);
    expect(first).toBe("a5d756af-9f8e-44b1-b9e1-d84107ed50d2");
    expect(first).not.toBe(COMMERCIAL_KEY);
    expect(first).not.toContain(TOKEN);
  });

  it("changes when the challenge token changes", async () => {
    const first = await deriveTurnstileSiteverifyIdempotencyKey("cms-lead-capture", COMMERCIAL_KEY, TOKEN);
    const refreshed = await deriveTurnstileSiteverifyIdempotencyKey(
      "cms-lead-capture",
      COMMERCIAL_KEY,
      `${TOKEN}-refreshed`,
    );

    expect(refreshed).not.toBe(first);
  });

  it("changes when the commercial key changes", async () => {
    const first = await deriveTurnstileSiteverifyIdempotencyKey("cms-lead-capture", COMMERCIAL_KEY, TOKEN);
    const secondLead = await deriveTurnstileSiteverifyIdempotencyKey(
      "cms-lead-capture",
      "9cc939db-d4a1-4e56-b69b-b897d30f1e9c",
      TOKEN,
    );

    expect(secondLead).not.toBe(first);
  });

  it("returns a canonical UUID with version-4 and RFC variant bits", async () => {
    const value = await deriveTurnstileSiteverifyIdempotencyKey("cms-lead-capture", COMMERCIAL_KEY, TOKEN);

    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(value).toBe(value.toLowerCase());
  });

  it("isolates retries by operation and rejects an operation substitution", async () => {
    expect(TURNSTILE_SITEVERIFY_OPERATIONS).toEqual(["cms-lead-capture", "submit-contact"]);

    const cmsLeadCapture = await deriveTurnstileSiteverifyIdempotencyKey(
      "cms-lead-capture",
      COMMERCIAL_KEY,
      TOKEN,
    );
    const submitContact = await deriveTurnstileSiteverifyIdempotencyKey(
      "submit-contact",
      COMMERCIAL_KEY,
      TOKEN,
    );
    expect(submitContact).not.toBe(cmsLeadCapture);

    await expect(
      deriveTurnstileSiteverifyIdempotencyKey(
        "cms-lead-capture:submit-contact" as "cms-lead-capture",
        COMMERCIAL_KEY,
        TOKEN,
      ),
    ).rejects.toThrow("Unsupported Turnstile Siteverify operation.");
  });

  it("uses a bounded request and accepts only the policy-approved response", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: true, cdata: COMMERCIAL_KEY }));

    await expect(verifyTurnstileSiteverify(siteverifyInput(), fetchImplementation)).resolves.toBe("accepted");
    expect(TURNSTILE_SITEVERIFY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TURNSTILE_SITEVERIFY_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [, init] = fetchImplementation.mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = init?.body as URLSearchParams;
    expect(body.get("response")).toBe(TOKEN);
    expect(body.get("remoteip")).toBe("203.0.113.10");
    expect(body.get("idempotency_key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.get("idempotency_key")).not.toBe(COMMERCIAL_KEY);
  });

  it("rejects a cData mismatch before a downstream mutation", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        success: true,
        cdata: "9cc939db-d4a1-4e56-b69b-b897d30f1e9c",
      }),
    );
    const mutate = vi.fn();

    const decision = await verifyTurnstileSiteverify(siteverifyInput(), fetchImplementation);
    if (decision === "accepted") mutate();

    expect(decision).toBe("rejected");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps a valid negative Siteverify response distinct from upstream unavailability", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: false }));
    const mutate = vi.fn();

    const decision = await verifyTurnstileSiteverify(siteverifyInput(), fetchImplementation);
    if (decision === "accepted") mutate();

    expect(decision).toBe("rejected");
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "network abort",
      response: () => vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError")),
    },
    {
      name: "invalid JSON",
      response: () =>
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("{not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
          ),
    },
    {
      name: "non-success HTTP",
      response: () => vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    },
  ])("returns unavailable without mutation for $name", async ({ response }) => {
    const mutate = vi.fn();
    const decision = await verifyTurnstileSiteverify(siteverifyInput(), response());
    if (decision === "accepted") mutate();

    expect(decision).toBe("unavailable");
    expect(mutate).not.toHaveBeenCalled();
  });
});
