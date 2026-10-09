import type { Response } from "@playwright/test";

const PUBLIC_JOURNEYS = new Set([
  "/",
  "/contato",
  "/produtos",
  "/solucoes",
  "/blog",
  "/campanhas/campanha-sintetica-inexistente",
]);

type DocumentResponse = Pick<Response, "status" | "fromServiceWorker" | "headerValue">;

function milliseconds(value: number) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

export async function publicDocumentFailureDiagnostic(
  path: string,
  response: DocumentResponse | null,
  elapsedMs: number,
): Promise<string> {
  // Read only explicitly allowlisted response headers. Never collect cookies, request headers,
  // URLs/query strings, bodies, traces or arbitrary backend errors in a release failure report.
  const header = async (name: string) => {
    try {
      return (await response?.headerValue(name)) ?? "";
    } catch {
      return "";
    }
  };
  const [release, timing, ray, contentType, upstream] = await Promise.all(
    ["x-release", "server-timing", "cf-ray", "content-type", "x-cms-upstream"].map(header),
  );
  const edgeMs = /(?:^|,\s*)edge;dur=(\d+(?:\.\d+)?)(?:\s*(?:,|$))/.exec(timing)?.[1];
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const status = response?.status();
  return JSON.stringify({
    event: "public.document.failure",
    route: PUBLIC_JOURNEYS.has(path) ? path : "other",
    status:
      status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    elapsedMs: milliseconds(elapsedMs),
    fromServiceWorker: response ? response.fromServiceWorker() : null,
    release: /^[a-f0-9]{40}$/i.test(release) ? release.toLowerCase() : null,
    edgeMs: edgeMs === undefined ? null : milliseconds(Number(edgeMs)),
    ray: /^[a-f0-9]{16,32}-[A-Z]{3}$/.test(ray) ? ray : null,
    contentType: ["text/html", "application/json", "text/plain"].includes(mime) ? mime : "other",
    upstream:
      /^(?:page-by-path|entity-detail|detail|redirect|other);(?:http|timeout|transport|unconfigured);[0-2];(?:0|[1-5]\d{2});(?:[0-9]{1,4}|[1-5][0-9]{4}|60000)$/.test(
        upstream,
      )
        ? upstream
        : null,
  });
}
