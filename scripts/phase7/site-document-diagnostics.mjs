const CONTEXTS = new Set([
  "published-blog",
  "published-campaign",
  "expired-campaign",
  "internal-product",
  "archived-blog",
]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export async function observeSiteDocument({ context, fetchResponse, report, now = () => performance.now() }) {
  if (!CONTEXTS.has(context)) throw new Error("G7_DOCUMENT_DIAGNOSTIC_CONTEXT_REFUSED");
  const startedAt = new Date().toISOString();
  const started = now();
  let response;
  try {
    response = await fetchResponse();
  } catch (error) {
    report({
      event: "g7.site-document",
      context,
      startedAt,
      observedAt: new Date().toISOString(),
      outcome: "transport",
    });
    throw error;
  }
  const duration = now() - started;
  const diagnostic = {
    event: "g7.site-document",
    context,
    startedAt,
    observedAt: new Date().toISOString(),
    status: response.status,
    ttfbMs: Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 60_000) : null,
  };
  const ray = response.headers.get("cf-ray") ?? "";
  if (/^[a-f0-9]{8,32}-[a-z]{3}$/i.test(ray)) diagnostic.cfRay = ray;
  const release = response.headers.get("x-release") ?? "";
  if (/^[a-f0-9]{40}$/.test(release)) diagnostic.release = release;
  const timing = response.headers.get("server-timing") ?? "";
  const edge = /(?:^|,)\s*edge\s*;\s*dur=(\d+(?:\.\d+)?)\s*(?=,|$)/i.exec(timing);
  if (edge && Number(edge[1]) <= 60_000) diagnostic.edgeDurationMs = Number(edge[1]);
  if (response.status >= 500 && response.status <= 599) {
    const upstream = response.headers.get("x-cms-upstream") ?? "";
    const match =
      /^(page-by-path|entity-detail|detail|redirect|other);(http|timeout|transport|unconfigured);([0-2]);(0|[1-5][0-9]{2});([0-9]{1,5})$/.exec(
        upstream,
      );
    if (match && Number(match[5]) <= 60_000) {
      diagnostic.workerUpstream = upstream;
      const trace = response.headers.get("x-cms-document-trace") ?? "";
      if (UUID.test(trace)) diagnostic.documentTrace = trace;
    }
  }
  // Report at headers, before assertions or cleanup can fail. Do not read or clone the body.
  report(diagnostic);
  return response;
}
