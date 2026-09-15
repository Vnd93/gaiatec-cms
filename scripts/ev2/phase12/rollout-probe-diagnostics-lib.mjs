import { createHash } from "node:crypto";

const DIAGNOSTIC_ROUTES = new Set([
  "/healthz",
  "/release-manifest.json",
  "/",
  "/produtos",
  "/contato",
  "/admin/login",
]);
const DIAGNOSTIC_CATEGORIES = new Set(["contract", "route"]);
const CACHE_STATUSES = new Set([
  "BYPASS",
  "DYNAMIC",
  "EXPIRED",
  "HIT",
  "MISS",
  "NONE",
  "REVALIDATED",
  "STALE",
  "UPDATING",
]);
const ERROR_CLASSES = new Set(["none", "abort", "timeout", "network", "body-read"]);
const CF_RAY_PATTERN = /^[a-f0-9]{8,32}-[a-z0-9]{3}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const MAX_PROBE_DIAGNOSTICS = 100;

function boundedNumber(value, maximum = 120_000) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(value, maximum) : null;
}

function classifiedRequestError(error) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") return "timeout";
  if (name === "AbortError") return "abort";
  return "network";
}

function parsedEdgeDuration(headers) {
  const timing = headers.get("server-timing") ?? "";
  const match = timing.match(/(?:^|,)\s*edge\s*;\s*dur=(\d+(?:\.\d+)?)\s*(?=,|$)/i);
  return boundedNumber(match ? Number(match[1]) : null);
}

function diagnosticHeaders(headers) {
  const ray = headers.get("cf-ray") ?? "";
  const cfRay = CF_RAY_PATTERN.test(ray) ? ray : null;
  const cache = (headers.get("cf-cache-status") ?? "").toUpperCase();
  return {
    cfRay,
    colo: cfRay ? cfRay.slice(cfRay.lastIndexOf("-") + 1).toUpperCase() : null,
    edgeDurationMs: parsedEdgeDuration(headers),
    cfCacheStatus: CACHE_STATUSES.has(cache) ? cache : null,
  };
}

function baseDiagnostic({ route, category, ordinal, expectedStatus, ttfbMs }) {
  if (
    !DIAGNOSTIC_ROUTES.has(route) ||
    !DIAGNOSTIC_CATEGORIES.has(category) ||
    !Number.isSafeInteger(ordinal) ||
    ordinal < 1 ||
    !Number.isSafeInteger(expectedStatus) ||
    expectedStatus < 100 ||
    expectedStatus > 599
  )
    throw new Error("G12_PROBE_DIAGNOSTIC_INPUT_REFUSED");
  return {
    route,
    category,
    ordinal,
    expectedStatus,
    ttfbMs: boundedNumber(ttfbMs),
  };
}

export async function observeProbeRequest({
  route,
  category,
  ordinal,
  expectedStatus,
  fetchResponse,
  now = () => performance.now(),
}) {
  const startedAt = now();
  try {
    const response = await fetchResponse();
    // The release budget is TTFB. Freeze it as soon as headers arrive, before the body is drained.
    const ttfbMs = now() - startedAt;
    const diagnosticBase = {
      ...baseDiagnostic({ route, category, ordinal, expectedStatus, ttfbMs }),
      status: response.status,
      ...diagnosticHeaders(response.headers),
    };
    try {
      const body = new Uint8Array(await response.arrayBuffer());
      return {
        response,
        body,
        durationMs: ttfbMs,
        diagnostic: {
          ...diagnosticBase,
          bodyBytes: body.byteLength,
          bodySha256: createHash("sha256").update(body).digest("hex"),
          bodyComplete: true,
          errorClass: "none",
        },
      };
    } catch {
      return {
        response,
        body: null,
        durationMs: ttfbMs,
        diagnostic: {
          ...diagnosticBase,
          bodyBytes: 0,
          bodySha256: null,
          bodyComplete: false,
          errorClass: "body-read",
        },
      };
    }
  } catch (error) {
    const ttfbMs = now() - startedAt;
    return {
      response: null,
      body: null,
      durationMs: ttfbMs,
      diagnostic: {
        ...baseDiagnostic({ route, category, ordinal, expectedStatus, ttfbMs }),
        status: 0,
        cfRay: null,
        colo: null,
        edgeDurationMs: null,
        cfCacheStatus: null,
        bodyBytes: 0,
        bodySha256: null,
        bodyComplete: false,
        errorClass: classifiedRequestError(error),
      },
    };
  }
}

function sanitizedDiagnostic(value) {
  if (!value || !DIAGNOSTIC_ROUTES.has(value.route) || !DIAGNOSTIC_CATEGORIES.has(value.category))
    return null;
  const errorClass = ERROR_CLASSES.has(value.errorClass) ? value.errorClass : "network";
  return {
    route: value.route,
    category: value.category,
    ordinal: Number.isSafeInteger(value.ordinal) && value.ordinal > 0 ? value.ordinal : 1,
    status: Number.isSafeInteger(value.status) && value.status >= 0 && value.status <= 599 ? value.status : 0,
    expectedStatus:
      Number.isSafeInteger(value.expectedStatus) && value.expectedStatus >= 100 && value.expectedStatus <= 599
        ? value.expectedStatus
        : 500,
    ttfbMs: boundedNumber(value.ttfbMs),
    cfRay: typeof value.cfRay === "string" && CF_RAY_PATTERN.test(value.cfRay) ? value.cfRay : null,
    colo: typeof value.colo === "string" && /^[A-Z0-9]{3}$/.test(value.colo) ? value.colo : null,
    edgeDurationMs: boundedNumber(value.edgeDurationMs),
    cfCacheStatus: CACHE_STATUSES.has(value.cfCacheStatus) ? value.cfCacheStatus : null,
    bodyBytes: Number.isSafeInteger(value.bodyBytes) && value.bodyBytes >= 0 ? value.bodyBytes : 0,
    bodySha256:
      typeof value.bodySha256 === "string" && SHA256_PATTERN.test(value.bodySha256) ? value.bodySha256 : null,
    bodyComplete: value.bodyComplete === true,
    errorClass,
  };
}

export function buildFailureProbeDiagnostics({
  violations,
  candidateSha,
  environment,
  probeProfile,
  diagnostics,
}) {
  if (!Array.isArray(violations) || violations.length === 0) return null;
  const safe = Array.isArray(diagnostics)
    ? diagnostics.flatMap((item) => {
        const sanitized = sanitizedDiagnostic(item);
        return sanitized ? [sanitized] : [];
      })
    : [];
  const observations = safe.slice(0, MAX_PROBE_DIAGNOSTICS);
  return {
    schemaVersion: 1,
    event: "g12.rollout.probe.diagnostics",
    candidateSha,
    environment,
    probeProfile,
    observationCount: safe.length,
    capturedCount: observations.length,
    truncated: safe.length > observations.length,
    observations,
  };
}
