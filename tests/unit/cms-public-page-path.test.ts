import { describe, expect, it, vi } from "vitest";

import { resolvePublicPagePathLookups } from "../../supabase/functions/cms-public/page-path";

type Page = { id: string };
type Rule = { destination: string };

const pendingLookup = (_signal: AbortSignal) =>
  new Promise<{ data: Rule | null; error: unknown | null }>(() => undefined);

describe("public page-path lookup orchestration", () => {
  it("returns a page hit even when optional transports ignore cancellation", async () => {
    const signals: AbortSignal[] = [];
    const ignoringCancellation = (signal: AbortSignal) => {
      signals.push(signal);
      return pendingLookup(signal);
    };
    const loadManagedRule = vi.fn(ignoringCancellation);
    const loadLegacyRule = vi.fn(ignoringCancellation);

    await expect(
      resolvePublicPagePathLookups<Page, Rule>(
        async () => ({ data: { id: "contact" }, error: null }),
        loadManagedRule,
        loadLegacyRule,
      ),
    ).resolves.toEqual({ kind: "page", row: { id: "contact" } });

    expect(loadManagedRule).toHaveBeenCalledOnce();
    expect(loadLegacyRule).toHaveBeenCalledOnce();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("starts page and route reads together and waits for both routing tables only on a miss", async () => {
    const started: string[] = [];
    let finishPage!: (result: { data: Page | null; error: unknown | null }) => void;
    let finishManaged!: (result: { data: Rule | null; error: unknown | null }) => void;
    let finishLegacy!: (result: { data: Rule | null; error: unknown | null }) => void;
    const page = new Promise<{ data: Page | null; error: unknown | null }>((resolve) => {
      finishPage = resolve;
    });
    const managed = new Promise<{ data: Rule | null; error: unknown | null }>((resolve) => {
      finishManaged = resolve;
    });
    const legacy = new Promise<{ data: Rule | null; error: unknown | null }>((resolve) => {
      finishLegacy = resolve;
    });

    const resolution = resolvePublicPagePathLookups<Page, Rule>(
      () => {
        started.push("page");
        return page;
      },
      () => {
        started.push("managed");
        return managed;
      },
      () => {
        started.push("legacy");
        return legacy;
      },
    );
    expect(started).toEqual(["page", "managed", "legacy"]);

    finishPage({ data: null, error: null });
    finishManaged({ data: { destination: "/managed" }, error: null });
    finishLegacy({ data: { destination: "/legacy" }, error: null });

    await expect(resolution).resolves.toEqual({
      kind: "miss",
      managedRuleResult: { data: { destination: "/managed" }, error: null },
      legacyRuleResult: { data: { destination: "/legacy" }, error: null },
    });
  });

  it("keeps page and routing failures explicit so the handler cannot turn them into fallback", async () => {
    const pageError = new Error("projection unavailable");
    let cancellations = 0;
    const rejectOnCancellation = (signal: AbortSignal) =>
      new Promise<{ data: Rule | null; error: unknown | null }>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancellations += 1;
            reject(signal.reason);
          },
          { once: true },
        );
      });
    await expect(
      resolvePublicPagePathLookups<Page, Rule>(
        async () => {
          throw pageError;
        },
        rejectOnCancellation,
        rejectOnCancellation,
      ),
    ).resolves.toEqual({ kind: "page-error", error: pageError });
    expect(cancellations).toBe(2);

    const managedError = new Error("managed routes unavailable");
    const legacyError = new Error("legacy routes unavailable");
    const miss = await resolvePublicPagePathLookups<Page, Rule>(
      async () => ({ data: null, error: null }),
      async (_signal) => {
        throw managedError;
      },
      async (_signal) => ({ data: null, error: legacyError }),
    );
    expect(miss).toEqual({
      kind: "miss",
      managedRuleResult: { data: null, error: managedError },
      legacyRuleResult: { data: null, error: legacyError },
    });
  });

  it("normalizes falsy rejection reasons into a truthy fail-closed sentinel", async () => {
    const rejectedPage = await resolvePublicPagePathLookups<Page, Rule>(
      async () => Promise.reject(undefined),
      pendingLookup,
      pendingLookup,
    );
    expect(rejectedPage.kind).toBe("page-error");
    if (rejectedPage.kind === "page-error") {
      expect(rejectedPage.error).toBeInstanceOf(Error);
      expect((rejectedPage.error as Error).message).toBe("CMS_PUBLIC_LOOKUP_REJECTED");
    }

    const rejectedRoute = await resolvePublicPagePathLookups<Page, Rule>(
      async () => ({ data: null, error: null }),
      async (_signal) => Promise.reject(null),
      async (_signal) => ({ data: null, error: null }),
    );
    expect(rejectedRoute.kind).toBe("miss");
    if (rejectedRoute.kind === "miss") {
      expect(rejectedRoute.managedRuleResult.error).toBeInstanceOf(Error);
      expect((rejectedRoute.managedRuleResult.error as Error).message).toBe("CMS_PUBLIC_LOOKUP_REJECTED");
    }
  });
});
