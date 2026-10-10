import type { Locator, Page, Request, Response } from "@playwright/test";

/** A closed page must not mask the gate failure; null means unobserved, not absent. */
export async function publicRenderState(locator: Pick<Locator, "isVisible">) {
  try {
    return await locator.isVisible();
  } catch {
    return null;
  }
}

const ROUTES = new Set([
  "/",
  "/sobre",
  "/politica-de-privacidade",
  "/biodigestor",
  "/deteccao-de-gas",
  "/servicos/instalacao-de-medidores",
  "/industrias/saneamento",
  "/industrias/biogas-biometano",
  "/industrias/protecao-catodica",
  "/industrias/controle-ambiental",
  "/industrias/seguranca-operacional",
  "/industrias/instrumentacao",
  "/industrias/telemetria",
  "/aplicacoes/medicao-estacoes-agua-esgoto",
  "/solucoes/instrumentacao-monitoramento-remoto",
]);
const BACKEND = "https://glcqsosxwgmlhzgcsnzv.supabase.co";
const FRONTEND = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const DISCOVERY_PREFIXES: Record<string, string> = {
  servicos: "service",
  industrias: "industry",
  aplicacoes: "application",
  solucoes: "solution",
};

export function publicRenderErrorCategory(message: string) {
  if (/content security|violates.*directive|\bcsp\b/i.test(message)) return "csp";
  if (/cors|cross.origin/i.test(message)) return "cors";
  if (/import|module/i.test(message)) return "module";
  if (/network|fetch|ERR_/i.test(message)) return "network";
  return "other";
}

/** Read-only metadata, never URLs, selectors, payloads, credentials or raw exceptions. */
export function observePublicPageRender(
  page: Pick<Page, "on" | "off">,
  path: string,
  clock = () => performance.now(),
) {
  const route = ROUTES.has(path) ? path : "other";
  const events: Array<Record<string, string | number | null>> = [];
  const starts = new WeakMap<Request, number>();
  let dropped = 0;
  const pendingReads = new Set<Request>();
  const append = (event: Record<string, string | number | null>) => {
    if (events.length < 12) events.push(event);
    else dropped++;
  };
  const matches = (request: Request) => {
    if (route === "other" || request.method() !== "GET") return false;
    try {
      const url = new URL(request.url());
      const firstPartyRead =
        !url.username &&
        !url.password &&
        url.origin === BACKEND &&
        url.pathname === "/functions/v1/cms-public";
      if (!firstPartyRead) return false;
      if (url.searchParams.get("type") === "page-by-path") return url.searchParams.get("path") === path;
      const [, prefix, slug, extra] = path.split("/");
      return (
        !extra &&
        !!slug &&
        !!DISCOVERY_PREFIXES[prefix] &&
        url.searchParams.get("type") === "entity-detail" &&
        url.searchParams.get("contentType") === DISCOVERY_PREFIXES[prefix] &&
        url.searchParams.get("slug") === slug
      );
    } catch {
      return false;
    }
  };
  const isModule = (request: Request) => {
    if (request.method() !== "GET") return false;
    try {
      const url = new URL(request.url());
      return (
        !url.username &&
        !url.password &&
        url.origin === FRONTEND &&
        /^\/assets\/[^/]+\.js$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  };
  const elapsed = (request: Request) => {
    const start = starts.get(request);
    const value = start === undefined ? Number.NaN : clock() - start;
    return Number.isFinite(value) && value >= 0 ? Math.min(60000, Math.round(value)) : null;
  };
  const request = (value: Request) => {
    if (matches(value) || isModule(value)) starts.set(value, clock());
    if (matches(value)) pendingReads.add(value);
  };
  const response = (value: Response) => {
    const upstream = value.request();
    const pageRead = matches(upstream);
    if (!pageRead && !isModule(upstream)) return;
    const status = value.status();
    append({
      event: pageRead ? "page-read-headers" : "module-read-headers",
      status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
      elapsedMs: elapsed(upstream),
    });
  };
  const failed = (value: Request) => {
    pendingReads.delete(value);
    if (matches(value)) append({ event: "page-read-transport-failed", elapsedMs: elapsed(value) });
    else if (isModule(value)) append({ event: "module-read-transport-failed", elapsedMs: elapsed(value) });
  };
  const finished = (value: Request) => {
    pendingReads.delete(value);
    if (matches(value)) append({ event: "page-read-finished", elapsedMs: elapsed(value) });
  };
  const pageError = (value: Error) =>
    append({ event: "page-error", category: publicRenderErrorCategory(value.message) });
  page.on("request", request);
  page.on("response", response);
  page.on("requestfailed", failed);
  page.on("requestfinished", finished);
  page.on("pageerror", pageError);
  return {
    snapshot: () => ({
      event: "public.render.failure",
      observedAt: new Date().toISOString(),
      route,
      events: [...events],
      dropped,
      pageReadPending: pendingReads.size > 0,
    }),
    dispose: () => {
      page.off("request", request);
      page.off("response", response);
      page.off("requestfailed", failed);
      page.off("requestfinished", finished);
      page.off("pageerror", pageError);
    },
  };
}
