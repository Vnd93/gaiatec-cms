import { documentTrace } from "./document-trace.ts";

// Instrument only the exact staging form RPC. The caller still owns deadlines and retries.
export function formReadTransport(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  transport: typeof fetch = fetch,
  log: (value: Record<string, unknown>) => void = (value) => console.log(JSON.stringify(value)),
): typeof fetch {
  const binding = documentTrace(req, environment, release);
  if (!binding || binding.lookup !== "form") return transport;
  let attempts = 0;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET"));
    if (url.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co" ||
      url.pathname !== "/rest/v1/rpc/cms_public_form_scoped" || method !== "GET" || attempts >= 2)
      return transport(input, init);
    const attempt = ++attempts;
    const upstreamTrace = `${binding.trace}.${attempt}`;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    // x-client-info is recorded by the existing gateway log schema. No selectors or credentials.
    headers.set("x-client-info", `${headers.get("x-client-info") ?? "supabase"} cms-staging-form-trace/${upstreamTrace}`);
    const started = performance.now();
    const common = { ...binding, upstreamTrace, attempt };
    log({ event: "cms.public.form.upstream.start", ...common, observedAt: new Date().toISOString() });
    try {
      const response = await transport(input, { ...init, headers });
      log({ event: "cms.public.form.upstream.finish", ...common, observedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started), outcome: "response", status: response.status });
      return response;
    } catch (error) {
      const outcome = init?.signal?.aborted
        ? ((init.signal.reason as DOMException | undefined)?.name === "TimeoutError" ? "deadline" : "cancelled")
        : "transport_error";
      log({ event: "cms.public.form.upstream.finish", ...common, observedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started), outcome });
      throw error;
    }
  };
}
