import { isEdgeFetchTimeout } from "../_shared/cms-edge-fetch.ts";
import { documentTrace } from "./document-trace.ts";

// Closed metadata only: no request URL, form key, definition, error message or identity.
export function formReadDiagnostic(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  error?: unknown,
) {
  const trace = documentTrace(req, environment, release);
  if (!trace || trace.lookup !== "form") return null;
  const candidate = (error as { code?: unknown } | null)?.code;
  const code = typeof candidate === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(candidate)
    ? candidate : undefined;
  return {
    event: "cms.public.form.read_failed",
    ...trace,
    reason: error === undefined ? "invalid_contract"
      : isEdgeFetchTimeout(error) ? "upstream_timeout"
      : code ? "upstream_code" : "upstream_error",
    ...(code ? { code } : {}),
  };
}
