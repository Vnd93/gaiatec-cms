import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

const PAGE_READ_TYPES = new Set(["page-by-path", "entity-detail"]);
const HEDGE_DELAY_MS = 700;
const TOTAL_TIMEOUT_MS = 10_000;

type Outcome = { id: number; response: Response } | { id: number; response: null };

/** Public GETs only: at most one backup for a page read whose transport has not answered. */
export async function fetchPublicPageResponse(params: URLSearchParams): Promise<Response> {
  const target = `${SUPABASE_URL}/functions/v1/cms-public?${params}`;
  const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  const headers = { apikey: SUPABASE_ANON_KEY };
  if (!PAGE_READ_TYPES.has(params.get("type") ?? "")) {
    return fetch(target, { headers, signal: deadline });
  }

  const attempts = new Map<number, { controller: AbortController; result: Promise<Outcome> }>();
  let attemptsStarted = 0;
  const startAttempt = () => {
    const id = ++attemptsStarted;
    const controller = new AbortController();
    const result = Promise.resolve()
      .then(() =>
        fetch(target, {
          headers,
          signal: AbortSignal.any([deadline, controller.signal]),
        }),
      )
      .then(
        (response): Outcome => ({ id, response }),
        (): Outcome => ({ id, response: null }),
      );
    attempts.set(id, { controller, result });
  };

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  let hedgePending = true;
  const hedge = new Promise<"hedge">((resolve) => {
    hedgeTimer = setTimeout(() => resolve("hedge"), HEDGE_DELAY_MS);
  });
  startAttempt();
  try {
    while (attempts.size > 0) {
      const outcome = await Promise.race([
        ...[...attempts.values()].map(({ result }) => result),
        ...(hedgePending ? [hedge] : []),
      ]);
      if (outcome === "hedge") {
        hedgePending = false;
        if (!deadline.aborted && attemptsStarted < 2) startAttempt();
        continue;
      }
      attempts.delete(outcome.id);
      // The FIRST HTTP response wins, including 401/403/429/5xx. Never retry a refusal,
      // pick a later success over an error, cache stale content or skip the caller's wire validation.
      if (outcome.response) return outcome.response;
      if (!deadline.aborted && attemptsStarted < 2) {
        hedgePending = false;
        clearTimeout(hedgeTimer);
        startAttempt();
      }
    }
    throw new Error("Catálogo temporariamente indisponível.");
  } finally {
    clearTimeout(hedgeTimer);
    for (const { controller } of attempts.values()) controller.abort();
    // Do not abort the winning response body; its original ten-second deadline remains active.
  }
}
