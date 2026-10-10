import { documentTrace } from "./document-trace.ts";

type Log = (value: Record<string, unknown>) => void;
const defaultLog: Log = (value) => console.log(JSON.stringify(value));
const duration = (started: number) => Math.min(60000, Math.max(0, Math.round(performance.now() - started)));
const projectionCategory = (lookup: string) => lookup === "post-detail" ? "post"
  : lookup === "entity-detail" || lookup === "detail" ? "entity"
  : lookup === "products" ? "collection"
  : lookup === "page-by-path" ? "page" : null;

export function pagePathFailureDiagnostic(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  stage: "primary" | "managed-route" | "legacy-route" | "related" | "form",
) {
  const binding = documentTrace(req, environment, release);
  if (!binding || binding.lookup !== "page-by-path") return null;
  return { event: "cms.public.page.failure", ...binding, stage, observedAt: new Date().toISOString() };
}

// Classify only the SDK envelope; never read error messages, selectors or returned rows.
function queryResultKind(result: unknown): string {
  if (!result || typeof result !== "object" || !("error" in result)) return "unclassified";
  if (!result.error) return "success";
  return "status" in result && result.status === 0 ? "transport_error" : "query_error";
}

// Only staging's traced primary projection read is observed, not related or routing reads.
export function postReadTransport(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  transport: typeof fetch = fetch,
  log: Log = defaultLog,
): typeof fetch {
  const binding = documentTrace(req, environment, release);
  const category = binding && projectionCategory(binding.lookup);
  if (!binding || !category) return transport;
  let attempts = 0;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET"));
    const primarySelector = category === "page"
      ? url.searchParams.has("payload->route->>path") &&
        url.searchParams.get("content_type") === "in.(page,homepage)" &&
        !url.searchParams.has("item_id") && !url.searchParams.has("slug")
      : category === "collection"
      ? !url.searchParams.has("slug") && !url.searchParams.has("item_id")
      : url.searchParams.has("slug");
    if (url.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co" ||
      url.pathname !== "/rest/v1/cms_published_projection" || !primarySelector ||
      method !== "GET" || attempts >= 2)
      return transport(input, init);
    const attempt = ++attempts;
    const upstreamTrace = `${binding.trace}.${attempt}`;
    const common = { ...binding, upstreamTrace, attempt };
    const emit = (stage: string, fields: Record<string, unknown> = {}) =>
      log({ event: `cms.public.${category}.${stage}`, ...common, observedAt: new Date().toISOString(), ...fields });
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-client-info", `${headers.get("x-client-info") ?? "supabase"} cms-staging-${category}-trace/${upstreamTrace}`);
    const started = performance.now();
    emit("upstream.start");
    try {
      const response = await transport(input, { ...init, headers });
      emit("upstream.finish", { durationMs: duration(started), outcome: "response", status: response.status });
      // PostgREST consumes text after fetch resolves. Keep the original Response and single body
      // consumption: measuring headers alone cannot locate a slow response body or JSON parsing.
      const text = response.text.bind(response);
      response.text = async () => {
        const bodyStarted = performance.now();
        emit("body.start");
        try {
          const body = await text();
          emit("body.finish", { durationMs: duration(bodyStarted), outcome: "complete" });
          return body;
        } catch (error) {
          emit("body.finish", { durationMs: duration(bodyStarted), outcome: "read_error" });
          throw error;
        }
      };
      return response;
    } catch (error) {
      const outcome = init?.signal?.aborted
        ? ((init.signal.reason as DOMException | undefined)?.name === "TimeoutError" ? "deadline" : "cancelled")
        : "transport_error";
      emit("upstream.finish", { durationMs: duration(started), outcome });
      throw error;
    }
  };
}

export async function observePostReadQuery<T>(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  read: () => PromiseLike<T>,
  log: Log = defaultLog,
): Promise<T> {
  const binding = documentTrace(req, environment, release);
  const category = binding && projectionCategory(binding.lookup);
  if (!binding || !category) return await read();
  const started = performance.now();
  const emit = (stage: string, fields: Record<string, unknown> = {}) =>
    log({ event: `cms.public.${category}.query.${stage}`, ...binding, observedAt: new Date().toISOString(), ...fields });
  emit("start");
  try {
    const result = await read();
    emit("finish", { durationMs: duration(started), outcome: "settled", resultKind: queryResultKind(result) });
    return result;
  } catch (error) {
    emit("finish", { durationMs: duration(started), outcome: "rejected" });
    throw error;
  }
}
