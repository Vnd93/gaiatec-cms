import { isEdgeFetchTimeout } from "../_shared/cms-edge-fetch.ts";
import { documentTrace } from "./document-trace.ts";

type Stage = "rate-limit" | "synonyms";
type Log = (value: Record<string, unknown>) => void;

// Observe only explicitly bound staging searches. Never emit query text, actor/IP,
// rate-limit keys, error messages, returned rows or headers. No retries or extra I/O.
export async function observeSearchDependency<T>(
  req: Request,
  environment: string | undefined,
  release: string | undefined,
  stage: Stage,
  operation: () => PromiseLike<T>,
  log: Log = (value) => console.info(JSON.stringify(value)),
): Promise<T> {
  const binding = documentTrace(req, environment, release);
  if (!binding || !["search", "autocomplete"].includes(binding.lookup)) return await operation();
  const started = performance.now();
  const emit = (phase: string, fields: Record<string, unknown> = {}) =>
    log({ event: `cms.public.search.dependency.${phase}`, ...binding, stage, ...fields });
  emit("start");
  try {
    const result = await operation();
    const envelope = result && typeof result === "object" && "error" in result ? result : null;
    emit("finish", {
      durationMs: Math.min(60000, Math.max(0, Math.round(performance.now() - started))),
      outcome: "settled",
      resultKind: envelope?.error ? ("status" in envelope && envelope.status === 0 ? "transport_error" : "query_error") : "success",
    });
    return result;
  } catch (error) {
    emit("finish", {
      durationMs: Math.min(60000, Math.max(0, Math.round(performance.now() - started))),
      outcome: "rejected",
      resultKind: isEdgeFetchTimeout(error) ? "upstream_timeout" : "operation_error",
    });
    throw error;
  }
}
