export const CMS_IDEMPOTENT_RETRY_DELAY_MS = 200;

export type SupabaseOperationResult<T> = {
  data: T | null;
  error: unknown;
  status?: number;
};

type Wait = (milliseconds: number) => Promise<void>;

const wait: Wait = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

function errorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? (error as Record<string, unknown>) : {};
}

function httpStatus(error: unknown): number | null {
  const record = errorRecord(error);
  const nested = [record, errorRecord(record.originalError), errorRecord(record.cause)];
  for (const candidate of nested) {
    for (const raw of [candidate.status, candidate.statusCode]) {
      const status = typeof raw === "number" ? raw : /^\d{3}$/.test(String(raw ?? "")) ? Number(raw) : NaN;
      if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
    }
  }
  return null;
}

// Only failures that are expected to converge without changing the request are retried. A caller
// may use this helper only when replaying the exact operation has no additional business effect.
export function isTransientSupabaseOperationError(error: unknown): boolean {
  const status = httpStatus(error);
  if (status !== null) return status === 408 || status === 425 || status === 429 || status >= 500;

  const record = errorRecord(error);
  const code = typeof record.code === "string" ? record.code : "";
  if (/^08[0-9A-Z]{3}$/.test(code)) return true;
  if (["40001", "40P01", "53300", "53400", "55P03", "57014", "57P01", "57P02", "57P03"].includes(code))
    return true;

  const name = typeof record.name === "string" ? record.name : "";
  if (name === "StorageUnknownError") return true;
  return String(record.message ?? "").includes("CMS_EDGE_FETCH_TIMEOUT:");
}

function isTransientHttpStatus(status: number | undefined): boolean {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  );
}

// Exactly one retry keeps the Edge invocation bounded while covering a transient Storage or
// PostgREST refusal. Thrown transport failures are normalized into the same closed result shape.
export async function retryIdempotentSupabaseOperation<T>(
  operation: () => PromiseLike<SupabaseOperationResult<T>>,
  pause: Wait = wait,
): Promise<SupabaseOperationResult<T>> {
  let result: SupabaseOperationResult<T> = { data: null, error: new Error("CMS_OPERATION_NOT_RUN") };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await operation();
    } catch (error) {
      result = { data: null, error };
    }
    if (
      !result.error ||
      attempt === 1 ||
      (!isTransientHttpStatus(result.status) && !isTransientSupabaseOperationError(result.error))
    )
      return result;
    await pause(CMS_IDEMPOTENT_RETRY_DELAY_MS);
  }
  return result;
}
