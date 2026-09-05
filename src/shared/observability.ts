const SENSITIVE_KEY =
  /(authorization|cookie|email|name|phone|token|secret|password|signature|address|content|payload)/i;
const SAFE_STRING_LIMIT = 160;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type SafeContext = Record<string, unknown>;

export interface StructuredEvent {
  timestamp: string;
  level: LogLevel;
  event: string;
  correlationId: string;
  release: string;
  route: string;
  context: SafeContext;
}

function releaseVersion(): string {
  return import.meta.env.VITE_RELEASE ?? "development";
}

export function createCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `corr-${Date.now().toString(36)}`;
}

export function safeRoute(value: string): string {
  const path = value.split(/[?#]/, 1)[0] || "/";
  return path.startsWith("/") ? path.slice(0, SAFE_STRING_LIMIT) : "/";
}

export function sanitizeContext(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, SAFE_STRING_LIMIT);
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeContext(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, SAFE_STRING_LIMIT);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key, sanitizeContext(item, depth + 1)]),
  );
}

export function buildStructuredEvent(
  level: LogLevel,
  event: string,
  context: SafeContext = {},
  correlationId = createCorrelationId(),
): StructuredEvent {
  return {
    timestamp: new Date().toISOString(),
    level,
    event: event.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80),
    correlationId,
    release: releaseVersion(),
    route: safeRoute(globalThis.location?.pathname ?? "/"),
    context: sanitizeContext(context) as SafeContext,
  };
}

export function emitStructuredEvent(event: StructuredEvent): void {
  const serialized = JSON.stringify(event);
  if (event.level === "error") console.error(serialized);
  else if (event.level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export function reportClientError(
  event: string,
  error: unknown,
  context: SafeContext = {},
  correlationId?: string,
): string {
  const structured = buildStructuredEvent(
    "error",
    event,
    { ...context, error: error instanceof Error ? { name: error.name } : { name: "UnknownError" } },
    correlationId,
  );
  emitStructuredEvent(structured);
  return structured.correlationId;
}

export function reportMetric(name: string, value: number, context: SafeContext = {}): void {
  emitStructuredEvent(buildStructuredEvent("info", "metric", { metric: name, value, ...context }));
}
