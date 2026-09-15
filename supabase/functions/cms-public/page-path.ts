export type PublicLookupResult<T> = {
  data: T | null;
  error: unknown | null;
};

type PublicLookup<T> = () => PromiseLike<PublicLookupResult<T>>;
type AbortablePublicLookup<T> = (signal: AbortSignal) => PromiseLike<PublicLookupResult<T>>;

export type PublicPagePathLookupResolution<Page, Rule> =
  | { kind: "page"; row: Page }
  | { kind: "page-error"; error: unknown }
  | {
      kind: "miss";
      managedRuleResult: PublicLookupResult<Rule>;
      legacyRuleResult: PublicLookupResult<Rule>;
    };

async function settlePublicLookup<T>(load: PublicLookup<T>): Promise<PublicLookupResult<T>> {
  try {
    return await load();
  } catch (error) {
    // JavaScript permits rejecting with a falsy value. Callers use the error field as their
    // fail-closed discriminant, so normalize those values instead of misclassifying them as a miss.
    return { data: null, error: error || new Error("CMS_PUBLIC_LOOKUP_REJECTED") };
  }
}

export async function resolvePublicPagePathLookups<Page, Rule>(
  loadPage: PublicLookup<Page>,
  loadManagedRule: AbortablePublicLookup<Rule>,
  loadLegacyRule: AbortablePublicLookup<Rule>,
): Promise<PublicPagePathLookupResolution<Page, Rule>> {
  const routingController = new AbortController();
  const pagePromise = settlePublicLookup(loadPage);
  // Start both optional lookups in the same turn as the page lookup so a genuine miss keeps its
  // single parallel network phase. The route aggregate owns its rejection immediately because a
  // page hit deliberately returns without awaiting it.
  const routeResults = Promise.all([
    settlePublicLookup(() => loadManagedRule(routingController.signal)),
    settlePublicLookup(() => loadLegacyRule(routingController.signal)),
  ]);
  void routeResults.catch(() => undefined);
  const pageResult = await pagePromise;

  if (pageResult.error) {
    routingController.abort();
    return { kind: "page-error", error: pageResult.error };
  }
  if (pageResult.data !== null) {
    // Route tables cannot outrank a live page. Do not wait for either optional result, and ask the
    // transport to release that work; returning here does not depend on it honoring cancellation.
    routingController.abort();
    return { kind: "page", row: pageResult.data };
  }

  const [managedRuleResult, legacyRuleResult] = await routeResults;
  return { kind: "miss", managedRuleResult, legacyRuleResult };
}
