import { documentTrace } from "./document-trace.ts";

type Log = (value: Record<string, unknown>) => void;
const dependencies = new Map([
  ["GET:/rest/v1/cms_dam_replacements", "replacements"],
  ["GET:/rest/v1/cms_media_assets", "assets"],
  ["GET:/rest/v1/cms_media_variants", "variants"],
  ["POST:/storage/v1/object/sign/cms-media-private", "signing"],
]);

// Only fixed dependency labels of explicitly traced staging documents are emitted.
// No selectors, object paths, request/response bodies, credentials or error messages.
// This observer does not own retries, cancellation or deadlines and adds no I/O.
export function mediaDependencyTransport(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  transport: typeof fetch = fetch,
  log: Log = (value) => console.info(JSON.stringify(value)),
): typeof fetch {
  const binding = documentTrace(req, environment, release);
  if (!binding) return transport;
  let sequence = 0;
  return async (input, init) => {
    let url: URL;
    try { url = new URL(input instanceof Request ? input.url : String(input)); }
    catch { return transport(input, init); }
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const stage = dependencies.get(`${method}:${url.pathname}`);
    if (url.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co" || !stage || sequence >= 64)
      return transport(input, init);
    const current = ++sequence;
    const upstreamTrace = `${binding.trace}.${current}`;
    const started = performance.now();
    const emit = (phase: string, fields: Record<string, unknown> = {}) => {
      try {
        log({ event: "cms.public.media.dependency", ...binding, upstreamTrace,
          sequence: current, stage, phase, observedAt: new Date().toISOString(),
          durationMs: Math.min(60000, Math.max(0, Math.round(performance.now() - started))), ...fields });
      } catch { /* Diagnostics must never change the original operation. */ }
    };
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-client-info", `${headers.get("x-client-info") ?? "supabase"} cms-staging-media-trace/${upstreamTrace}`);
    emit("start");
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    let cancelled = false;
    const cancellationOutcome = () =>
      (signal?.reason as DOMException | undefined)?.name === "TimeoutError" ? "deadline" : "cancelled";
    const onAbort = () => {
      cancelled = true;
      emit("failed", { outcome: cancellationOutcome() });
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await transport(input, { ...init, headers });
      emit(cancelled ? "late_headers" : "headers", { outcome: "response", status: response.status });
      const observeBody = <T>(read: () => Promise<T>) => async () => {
        const bodyStarted = performance.now();
        try {
          const body = await read();
          emit("body", { outcome: "complete", bodyDurationMs: Math.min(60000, Math.max(0, Math.round(performance.now() - bodyStarted))) });
          return body;
        } catch (error) {
          emit("body", { outcome: "read_error" });
          throw error;
        }
      };
      response.text = observeBody(response.text.bind(response));
      response.json = observeBody(response.json.bind(response));
      return response;
    } catch (error) {
      if (!cancelled) emit("failed", { outcome: signal?.aborted ? cancellationOutcome() : "transport_error" });
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  };
}
