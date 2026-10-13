type Request = { url(): string; method(): string; failure(): { errorText: string } | null };
type Phase = "setup" | "page" | "campaign";
type Observation = {
  endpoint: "cms-public" | "lead-capture";
  method: "GET" | "POST" | "OPTIONS" | "OTHER";
  startedPhase: Phase;
  endedPhase: Phase | null;
  responseStatus: number | null;
  outcome: "pending" | "finished" | "failed";
  failureClass: string | null;
  startedMs: number;
  elapsedMs: number;
};

const FAILURE_CLASSES = new Set([
  "net::ERR_ABORTED",
  "net::ERR_FAILED",
  "net::ERR_TIMED_OUT",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NETWORK_CHANGED",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_NAME_NOT_RESOLVED",
  "net::ERR_HTTP_RESPONSE_CODE_FAILURE",
]);

// Diagnostic only. No URL/query, headers, payloads, cookies, tokens or error messages.
// Preserve the strict requestFailures gate even for ERR_ABORTED across navigation.
export function createPublicBridgeDiagnostics(now = () => Date.now()) {
  const began = now();
  let phase: Phase = "setup";
  let overflow = 0;
  const entries = new Map<Request, Observation>();
  const elapsed = (since: number) => Math.min(180_000, Math.max(0, Math.round(now() - since)));
  return {
    phase(value: Phase) {
      phase = value;
    },
    start(request: Request) {
      let url: URL;
      try {
        url = new URL(request.url());
      } catch {
        return;
      }
      if (url.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co") return;
      const endpoint =
        url.pathname === "/functions/v1/cms-public"
          ? "cms-public"
          : url.pathname === "/functions/v1/lead-capture"
            ? "lead-capture"
            : null;
      if (!endpoint) return;
      if (entries.size >= 64) {
        overflow += 1;
        return;
      }
      const method = request.method();
      entries.set(request, {
        endpoint,
        method: method === "GET" || method === "POST" || method === "OPTIONS" ? method : "OTHER",
        startedPhase: phase,
        endedPhase: null,
        responseStatus: null,
        outcome: "pending",
        failureClass: null,
        startedMs: elapsed(began),
        elapsedMs: 0,
      });
    },
    response(request: Request, status: number) {
      const entry = entries.get(request);
      if (entry && Number.isSafeInteger(status) && status >= 100 && status <= 599)
        entry.responseStatus = status;
    },
    finish(request: Request, failed = false) {
      const entry = entries.get(request);
      if (!entry) return;
      entry.endedPhase = phase;
      entry.outcome = failed ? "failed" : "finished";
      const failure = failed ? request.failure()?.errorText : null;
      entry.failureClass = failed ? (FAILURE_CLASSES.has(failure ?? "") ? failure! : "other") : null;
      entry.elapsedMs = Math.max(0, elapsed(began) - entry.startedMs);
    },
    snapshot() {
      return {
        schemaVersion: 1,
        event: "cms.public_bridge.transport_diagnostic",
        diagnosticOnly: true,
        releaseEligible: false,
        phase,
        overflow,
        observations: [...entries.values()].map((entry) => ({ ...entry })),
      };
    },
  };
}
