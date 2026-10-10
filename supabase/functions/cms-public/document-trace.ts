// Staging-only, ephemeral request correlation. Never capture visitor identities, URLs or payloads.
export function documentTrace(req: Request, environment: string | undefined, release: string | undefined) {
  if (environment !== "staging" || !/^[a-f0-9]{40}$/.test(release ?? "") || req.method !== "GET") return null;
  const lookup = new URL(req.url).searchParams.get("type") ?? "";
  if (!["page-by-path", "entity-detail", "detail", "redirect", "form", "post-detail", "campaign-by-path"].includes(lookup)) return null;
  const trace = req.headers.get("x-cms-document-trace") ?? "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[12]$/.test(trace)) return null;
  return { trace, release, lookup };
}
