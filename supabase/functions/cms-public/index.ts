import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { containsInternalProductValue, sanitizePublicPayload, sanitizePublicSeo } from "../_shared/cms-public-projection.ts";
import { resolveMediaAssets } from "../_shared/cms-media-resolution.ts";
import {
  resolveDocumentAssets,
  type DocumentResolutionClient,
} from "../_shared/cms-document-resolution.ts";
import { deterministicSeoDefaults } from "../_shared/cms-seo-defaults.ts";
import { PUBLISHED_PROJECTION_COLUMNS } from "../_shared/published-projection.ts";
import { comparePublicCollectionEntries } from "../_shared/cms-public-order.ts";
import { resolvePublicAssetBatch } from "../_shared/cms-public-asset-batch.ts";
import { flattenPublicSearchValues, publicBlockSearchValues } from "../_shared/cms-public-search.ts";
import { governedSignedMediaIdentity } from "../_shared/cms-public-media-proxy.ts";
import { buildPublicSitemapXml } from "../_shared/cms-public-sitemap.ts";
import { PUBLIC_RELATION_LIMIT, publicRelationIds } from "../_shared/cms-public-relations.ts";
import { resolveGovernedPublicFormBindings } from "../_shared/cms-public-form-bindings.ts";
import { authenticateCms } from "../_shared/cms-auth.ts";
import {
  CMS_QA_RATE_LIMIT_ACTION,
  cmsQaRateLimitProofBindingIsExact,
  cmsQaRateLimitProofPreflightIsExact,
} from "../_shared/cms-qa-rate-limit-proof.ts";
import {
  clientAddress,
  consumeRateLimit,
  isAllowedOrigin,
  rateLimitKeyHash,
  sha256Bytes,
} from "../_shared/security.ts";
import { isConfiguredCmsEnvironment } from "../_shared/ev2-environment.ts";
import {
  governedFormBindingSelector,
  presentNavigation,
  presentPublicForm,
  presentPublicRow,
  presentRelatedRow,
  presentSiteSettings,
  publicMediaSlots,
  publicWireLeak,
} from "../_shared/cms-public-wire.ts";

declare const EdgeRuntime: {
  waitUntil(promise: PromiseLike<unknown>): void;
};

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, if-none-match, x-client-info, x-ev2-search-canary", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store", Vary: "Origin" };
const qaProofCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin");
  const configured = Deno.env.get("CMS_ADMIN_ORIGIN") ?? "";
  const exactStagingOrigin =
    Deno.env.get("CMS_ENVIRONMENT") === "staging" &&
    /^[0-9a-f]{40}$/.test(Deno.env.get("CMS_RELEASE_SHA") ?? "") &&
    Boolean(origin) &&
    origin === configured &&
    isAllowedOrigin(req);
  return {
    ...(exactStagingOrigin ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Headers":
      "apikey, authorization, content-type, x-client-info, x-cms-qa-candidate-sha, x-cms-qa-operation, x-cms-qa-proof, x-cms-qa-run-tag",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};
const PUBLIC_REVALIDATE = "public, max-age=0, must-revalidate";
const rawJson = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", ...extra } });
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => {
  if (status >= 200 && status < 300 && publicWireLeak(body)) {
    console.error(JSON.stringify({ event: "cms.public.contract_rejected" }));
    return rawJson(
      { error: "Conteúdo temporariamente indisponível." },
      503,
      { ...extra, "Cache-Control": "no-store" },
    );
  }
  return rawJson(body, status, extra);
};
const qaProofJson = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...qaProofCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[₂]/g, "2").replace(/[–—]/g, "-").replace(/\bdn\s+(\d+)/g, "dn$1").replace(/4\s*-\s*20\s*ma/g, "4-20ma").replace(/[^a-z0-9%/.-]+/g, " ").trim();
const publicTypes = ["product", "service", "industry", "application", "solution", "post", "campaign", "page", "homepage", "navigation", "site_settings", "placement"];
const searchableTypes = ["product", "service", "industry", "application", "solution", "post", "page", "homepage"];
const routeFor = (row: any) => row.content_type === "product" ? `/produtos/${row.slug}` : row.content_type === "industry" ? `/industrias/${row.slug}` : row.content_type === "application" ? `/aplicacoes/${row.slug}` : row.content_type === "solution" ? `/solucoes/${row.slug}` : row.content_type === "service" ? `/servicos/${row.slug}` : row.content_type === "post" ? `/blog/${row.slug}` : row.payload?.route?.path ?? row.route?.path ?? "/";
const COLLECTION_DEFAULT_LIMIT = 50;
const COLLECTION_MAX_LIMIT = 100;
const SEARCH_SCAN_LIMIT = 500;
const RELATED_QUERY_CHUNK = 100;
const CAMPAIGN_SCAN_LIMIT = 200;
const SITEMAP_LIMIT = 5000;
const SYNONYM_LIMIT = 500;
const CAMPAIGN_PLACEMENT_COLUMNS = "item_id,content_type,slug,title:payload->>title,summary:payload->>summary,route:payload->route,window:payload->window,placements:payload->placements";
const SITEMAP_COLUMNS = "content_type,slug,published_at,route:payload->route,window:payload->window";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const publicFilterKeys = ["productCategory", "segment", "applicationMagnitude", "category", "technology", "installationOperation", "monitoredElement"];
const presentRouteRule = (rule: any) => ({
  destinationPath: rule?.destination_path ?? null,
  status: rule?.status_code,
});
const boundedInteger = (value: string | null, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
};

const handleQaRateLimitProof = async (req: Request) => {
  if (req.method !== "GET") return qaProofJson(req, { error: "Não encontrado." }, 404);
  const preflight = {
    environment: Deno.env.get("CMS_ENVIRONMENT"),
    configuredReleaseSha: Deno.env.get("CMS_RELEASE_SHA"),
    configuredAdminOrigin: Deno.env.get("CMS_ADMIN_ORIGIN"),
    requestOrigin: req.headers.get("Origin"),
    originAllowed: isAllowedOrigin(req),
  };
  if (!cmsQaRateLimitProofPreflightIsExact(preflight))
    return qaProofJson(req, { error: "Não encontrado." }, 404);
  const identity = await authenticateCms(req);
  if (!identity) return qaProofJson(req, { error: "Sessão inválida." }, 401);
  const candidateSha = req.headers.get("X-CMS-QA-Candidate-Sha");
  const runTag = req.headers.get("X-CMS-QA-Run-Tag");
  const proofId = req.headers.get("X-CMS-QA-Proof");
  const operation = req.headers.get("X-CMS-QA-Operation");
  if (
    !cmsQaRateLimitProofBindingIsExact({
      ...preflight,
      actorId: identity.user.id,
      aal: identity.claims.aal,
      userMetadata: identity.user.user_metadata ?? {},
      requestedCandidateSha: candidateSha,
      requestedRunTag: runTag,
      proofId,
      operation,
    })
  )
    return qaProofJson(req, { error: "Não encontrado." }, 404);
  const keyHash = await rateLimitKeyHash(
    CMS_QA_RATE_LIMIT_ACTION,
    `${identity.user.id}:${candidateSha}:${runTag}:${proofId}`,
  );
  const { data, error } = await identity.admin.rpc("cms_qa_rate_limit_proof", {
    p_actor_id: identity.user.id,
    p_run_tag: runTag,
    p_candidate_sha: candidateSha,
    p_environment: "staging",
    p_key_hash: keyHash,
    p_operation: operation,
  });
  if (error) return qaProofJson(req, { error: "Não encontrado." }, 404);
  if (operation === "consume" && data?.allowed !== true)
    return qaProofJson(
      req,
      {
        error: "Muitas buscas. Aguarde antes de tentar novamente.",
        code: "CMS_QA_RATE_LIMIT_PROOF_LIMITED",
      },
      429,
      { "Retry-After": String(data?.retryAfterSeconds ?? 1) },
    );
  return qaProofJson(req, {
    schemaVersion: 1,
    status: data?.status,
    ...(operation === "consume"
      ? {
          allowed: true,
          limit: data?.limit,
          windowSeconds: data?.windowSeconds,
          requestCount: data?.requestCount,
        }
      : { removed: data?.removed === true, idempotent: data?.idempotent === true }),
  });
};

const handleRequest = async (req: Request) => {
  const requestUrl = new URL(req.url);
  const qaRateLimitProof = requestUrl.searchParams.get("type") === "qa-rate-limit-proof";
  if (req.method === "OPTIONS") {
    if (qaRateLimitProof) {
      const exactOrigin =
        Deno.env.get("CMS_ENVIRONMENT") === "staging" &&
        /^[0-9a-f]{40}$/.test(Deno.env.get("CMS_RELEASE_SHA") ?? "") &&
        req.headers.get("Origin") === Deno.env.get("CMS_ADMIN_ORIGIN") &&
        isAllowedOrigin(req);
      return new Response(null, { status: exactOrigin ? 204 : 403, headers: qaProofCorsHeaders(req) });
    }
    return new Response(null, { headers });
  }
  if (qaRateLimitProof) {
    try {
      return await handleQaRateLimitProof(req);
    } catch {
      return qaProofJson(req, { error: "Não encontrado." }, 404);
    }
  }
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anon) return json({ error: "Serviço indisponível." }, 503);
  const environment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(environment)) return json({ error: "Serviço indisponível." }, 503);
  const url = requestUrl, type = url.searchParams.get("type") ?? "detail";
  const client = createClient(supabaseUrl, service ?? anon, { auth: { persistSession: false } });
  const publicEndpoint = `${supabaseUrl}/functions/v1/cms-public`;
  const loadPublicResource = async () => {
    const kind = url.searchParams.get("kind") ?? "";
    const slug = url.searchParams.get("slug") ?? "";
    if (!searchableTypes.concat("campaign").includes(kind) || !slugPattern.test(slug))
      return { data: null, error: null };
    return client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS)
      .eq("content_type", kind)
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
  };
  if (type === "media") {
    if (!service) return json({ error: "Imagem temporariamente indisponível." }, 503);
    const slot = url.searchParams.get("slot") ?? "";
    if (!/^(?:primary|social|media-[1-9][0-9]?|block-[1-9][0-9]?(?:-(?:image|item)-[1-9][0-9]?)?)$/.test(slot))
      return json({ error: "Imagem não encontrada." }, 404);
    const resource = await loadPublicResource();
    if (resource.error)
      return json({ error: "Imagem temporariamente indisponível." }, 503);
    if (!resource.data) return json({ error: "Imagem não encontrada." }, 404);
      const payload = sanitizePublicPayload(resource.data.payload);
      if (!payload.title) return json({ error: "Imagem não encontrada." }, 404);
      const assetId = publicMediaSlots(payload, resource.data.seo).get(slot);
      if (!assetId) return json({ error: "Imagem não encontrada." }, 404);
      const resolveCurrentMediaSource = async () => {
        const resolved = await resolveMediaAssets(client, [assetId], assetId, 60, {
          maxAssets: 1,
          maxVariants: 20,
        });
        return (
          resolved.mediaUrls["large.avif"] ??
          resolved.mediaUrls["large.webp"] ??
          resolved.mediaUrls["medium.webp"] ??
          resolved.mediaUrls["thumbnail.webp"] ??
          Object.values(resolved.mediaUrls)[0]
        );
      };
      try {
        const source = await resolveCurrentMediaSource();
        const sourceIdentity = governedSignedMediaIdentity(source, supabaseUrl);
        if (!source || !sourceIdentity) return json({ error: "Imagem não encontrada." }, 404);
        const upstream = await fetch(source, { redirect: "error" });
      const contentType = upstream.headers.get("Content-Type") ?? "";
      const declaredLength = Number(upstream.headers.get("Content-Length") ?? 0);
      if (
        !upstream.ok ||
        !/^image\/(?:avif|webp|png|jpeg|gif)$/i.test(contentType) ||
        (declaredLength && declaredLength > 20_000_000)
      )
        return json({ error: "Imagem temporariamente indisponível." }, 503);
        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (bytes.byteLength > 20_000_000)
          return json({ error: "Imagem temporariamente indisponível." }, 503);
        const confirmedResource = await loadPublicResource();
        if (confirmedResource.error)
          return json({ error: "Imagem temporariamente indisponível." }, 503);
        if (!confirmedResource.data) return json({ error: "Imagem não encontrada." }, 404);
        const confirmedPayload = sanitizePublicPayload(confirmedResource.data.payload);
        const confirmedAssetId = publicMediaSlots(confirmedPayload, confirmedResource.data.seo).get(slot);
        if (confirmedAssetId !== assetId) return json({ error: "Imagem não encontrada." }, 404);
        const confirmedSource = await resolveCurrentMediaSource();
        if (governedSignedMediaIdentity(confirmedSource, supabaseUrl) !== sourceIdentity)
          return json({ error: "Imagem não encontrada." }, 404);
        return new Response(bytes, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": contentType,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": PUBLIC_REVALIDATE,
          "X-Content-Type-Options": "nosniff",
          // Public wire payloads intentionally point browsers at this Supabase
          // proxy from the GAIATEC site. Those origins are cross-site, so CORP
          // must explicitly permit the governed image response to be embedded.
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      });
    } catch {
      return json({ error: "Imagem temporariamente indisponível." }, 503);
    }
  }
  if (type === "document") {
    if (!service) return json({ error: "Documento temporariamente indisponível." }, 503);
    const position = Number(url.searchParams.get("position"));
    if (!Number.isInteger(position) || position < 1 || position > 30)
      return json({ error: "Documento não encontrado." }, 404);
    try {
      const allowed = await consumeRateLimit(
        client,
        req,
        "cms_public_document_download",
        clientAddress(req),
        60,
        60,
      );
      if (!allowed)
        return json(
          { error: "Muitos downloads. Aguarde um minuto." },
          429,
          { "Retry-After": "60" },
        );
    } catch {
      return json({ error: "Documento temporariamente indisponível." }, 503);
    }
    const resource = await loadPublicResource();
    if (resource.error)
      return json({ error: "Documento temporariamente indisponível." }, 503);
    if (!resource.data) return json({ error: "Documento não encontrado." }, 404);
    const publicPayload = sanitizePublicPayload(resource.data.payload);
    const publicDocument = Array.isArray(publicPayload.documents)
      ? publicPayload.documents[position - 1]
      : null;
    const document =
      publicDocument && Array.isArray(resource.data.payload?.documents)
        ? resource.data.payload.documents.find(
            (candidate: any) =>
              String(candidate?.id).toLowerCase() === String(publicDocument.id).toLowerCase(),
          )
        : null;
    if (
      !document ||
      !uuidPattern.test(document.id ?? "") ||
      !/^[0-9a-f]{64}$/.test(document.sha256 ?? "")
    )
      return json({ error: "Documento não encontrado." }, 404);
    const documentId = String(document.id).toLowerCase();
    const expectedSha256 = String(document.sha256);
    const resolveTarget = () =>
      client.rpc("cms_public_document_download_target", {
        p_document_id: documentId,
        p_expected_sha256: expectedSha256,
      });
    const initial = await resolveTarget();
    const target = initial.data?.[0];
    if (initial.error || !target) return json({ error: "Documento não encontrado." }, 404);
    const stored = await client.storage.from("cms-documents-private").download(target.storage_path);
    if (stored.error || !stored.data)
      return json({ error: "Documento temporariamente indisponível." }, 503);
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    if ((await sha256Bytes(bytes)) !== expectedSha256)
      return json({ error: "Documento temporariamente indisponível." }, 503);
    const confirmed = await resolveTarget();
    const confirmedTarget = confirmed.data?.[0];
    if (
      confirmed.error ||
      !confirmedTarget ||
      confirmedTarget.storage_path !== target.storage_path ||
      confirmedTarget.expected_sha256 !== expectedSha256
    )
      return json({ error: "Documento não encontrado." }, 404);
    const filenameStem = String(publicDocument.title ?? "documento")
      .replace(/\.pdf$/i, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 170) || "documento";
    const unsafeFilename =
      publicWireLeak({ filename: filenameStem }) !== null ||
      /(?:^|[^0-9a-f])[0-9a-f]{40,128}(?:$|[^0-9a-f])/i.test(filenameStem);
    const filename = unsafeFilename ? "documento.pdf" : `${filenameStem}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
  const expensivePublicSearch =
    type === "search" ||
    type === "autocomplete" ||
    (["products", "collection"].includes(type) &&
      (Boolean(url.searchParams.get("q")?.trim()) || publicFilterKeys.some((key) => url.searchParams.has(key))));
  if (expensivePublicSearch) {
    if (!service) return json({ error: "Busca temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    try {
      const allowed = await consumeRateLimit(
        client,
        req,
        "cms_public_search",
        clientAddress(req),
        120,
        60,
      );
      if (!allowed)
        return json(
          { error: "Muitas buscas. Aguarde um minuto." },
          429,
          { "Cache-Control": "no-store", "Retry-After": "60" },
        );
    } catch {
      return json({ error: "Busca temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    }
  }
  const enrichMediaRows = async (rows: any[], mode: "detail" | "card" = "detail") => {
    const prepared = rows.map((row) => {
      const payload = sanitizePublicPayload(row.payload);
      const media = payload.media ?? [];
      const blockAssetIds = (payload.blocks ?? []).flatMap((block: any) =>
        [
          block.data?.assetId,
          ...(block.data?.assetIds ?? []),
          ...(block.data?.items ?? []).map((item: any) => item.assetId),
        ].filter(Boolean),
      );
      const allAssetIds = [
        ...new Set(
          [...media.map((entry: any) => entry.assetId), ...blockAssetIds, row.seo?.ogImageId].filter(
            Boolean,
          ),
        ),
      ];
      const primaryId = media.find((entry: any) => entry.role === "primary")?.assetId;
      const assetIds = mode === "card" ? (primaryId ? [primaryId] : []) : allAssetIds;
      const publicDocumentIds = new Set(
        (payload.documents ?? []).map((document: any) => String(document.id).toLowerCase()),
      );
      const documents = (mode === "detail" ? row.payload?.documents ?? [] : []).filter(
        (document: any) =>
          document.visibility === "public" &&
          publicDocumentIds.has(String(document.id).toLowerCase()) &&
          document.storagePath &&
          !containsInternalProductValue(document.storagePath, row.payload),
      );
      return { row, payload, assetIds, primaryId, documents };
    }).filter(({ row, payload }) =>
      payload.contentType === row.content_type &&
      typeof payload.title === "string" &&
      payload.title.trim().length > 0
    );
    const assets = await resolvePublicAssetBatch(
      prepared.map(({ assetIds, primaryId, documents }) => ({ assetIds, primaryId, documents })),
      {
        resolveMedia: (assetIds, limits) =>
          resolveMediaAssets(client, assetIds, undefined, 3600, limits),
        resolveDocuments: (documents, limits) =>
            resolveDocumentAssets(
              client as unknown as DocumentResolutionClient,
              documents,
              "validated",
              limits,
            ),
      },
    );
    return prepared.map(({ row, payload }, index) => {
      const path = routeFor(row);
      const documentUrls = assets[index].documentUrls;
      return {
        ...row,
        // Keep the sanitized source order until presentPublicPayload filters
        // unavailable documents. Public download selectors are positional, so
        // compacting this array here would make every later valid document point
        // at the wrong source ordinal.
        payload,
        seo: deterministicSeoDefaults(sanitizePublicSeo(row.seo, row.payload), payload, path),
        path,
        media_urls: assets[index].mediaUrls,
        media_alt: assets[index].mediaAlt,
        document_urls: documentUrls,
      };
    });
  };
  const enrichMedia = async (row: any) => (await enrichMediaRows([row]))[0];
  if (type === "search-v2") {
    const canaryToken = Deno.env.get("CMS_PUBLIC_SEARCH_V2_CANARY_TOKEN") ?? "";
    if (
      Deno.env.get("CMS_ENVIRONMENT") !== "staging" ||
      canaryToken.length < 32 ||
      req.headers.get("X-EV2-Search-Canary") !== canaryToken
    )
      return json({ error: "Não encontrado." }, 404, { "Cache-Control": "no-store" });
    if (!service) return json({ error: "Busca técnica indisponível." }, 503, { "Cache-Control": "no-store" });
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 300);
    const contentTypes = (url.searchParams.get("contentTypes") ?? "").split(",").filter((value) => searchableTypes.includes(value));
    const facets: Record<string, string[]> = {};
    const ranges: Record<string, { min?: number; max?: number; unit?: string }> = {};
    for (const [key, value] of url.searchParams) {
      if (key.startsWith("facet.") && /^[a-z][a-zA-Z0-9]{1,63}$/.test(key.slice(6))) facets[key.slice(6)] = value.split("|").filter(Boolean).slice(0, 50);
      if (key.startsWith("range.") && /^[a-z][a-zA-Z0-9_.-]{1,79}$/.test(key.slice(6))) {
        const [minimum, maximum, unit] = value.split(":");
        const min = minimum === "" ? undefined : Number(minimum), max = maximum === "" ? undefined : Number(maximum);
        if ((min === undefined || Number.isFinite(min)) && (max === undefined || Number.isFinite(max)) && (min !== undefined || max !== undefined)) ranges[key.slice(6)] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(unit ? { unit: unit.slice(0, 24) } : {}) };
      }
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 100);
    const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 10_000);
    const normalizedQuery = normalize(query);
    const { data: redirectRule, error: redirectError } = normalizedQuery ? await client.from("cms_search_rules").select("redirect_path").eq("rule_kind", "redirect").eq("normalized_query", normalizedQuery).eq("active", true).lte("starts_at", new Date().toISOString()).gt("expires_at", new Date().toISOString()).maybeSingle() : { data: null, error: null };
    if (redirectError) return json({ error: "Busca técnica temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (redirectRule?.redirect_path) return json({ redirect: redirectRule.redirect_path, items: [], total: 0, facets: {}, groups: {}, query }, 200, { "Cache-Control": "private, no-store" });
    const startedAt = performance.now();
    const { data: matches, error: searchError } = await client.rpc("cms_search_v2", { p_query: normalizedQuery, p_content_types: contentTypes, p_facets: facets, p_ranges: ranges, p_limit: limit, p_offset: offset });
    if (searchError) return json({ error: "Busca técnica temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const ids = (matches ?? []).map((entry: any) => entry.item_id);
    const { data: sourceRows, error: sourceError } = ids.length ? await client.from("cms_published_projection").select(PUBLISHED_PROJECTION_COLUMNS).in("item_id", ids) : { data: [], error: null };
    if (sourceError) return json({ error: "Busca técnica temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const enrichedRows = await enrichMediaRows(sourceRows ?? [], "card");
    const rowById = new Map(enrichedRows.map((row: any) => [row.item_id, row]));
    const items = (matches ?? []).flatMap((match: any) => {
      const row = rowById.get(match.item_id);
      return row
        ? [
            {
              ...row,
              score: match.score,
              matched_by: match.matched_by,
              explanation: {
                matchedBy: match.matched_by,
                missingTechnicalData: Object.keys(ranges).filter(
                  (key) => !(match.technical_ranges ?? {})[key],
                ),
              },
            },
          ]
        : [];
    });
    const groups = searchableTypes.reduce((all, key) => { all[key] = items.filter((item: any) => item.content_type === key).length; return all; }, {} as Record<string, number>);
    const availableFacets: Record<string, string[]> = {};
    for (const match of matches ?? []) for (const [key, values] of Object.entries(match.facets ?? {})) {
      const bucket = new Set(availableFacets[key] ?? []);
      (Array.isArray(values) ? values : [values]).filter((value) => typeof value === "string").forEach((value) => bucket.add(value as string));
      availableFacets[key] = [...bucket].sort();
    }
    if (query && service) {
      const analytics = client.from("cms_search_events").insert({ normalized_query: normalizedQuery, result_count: Number(matches?.[0]?.total_count ?? 0), content_types: [...new Set(items.map((item: any) => item.content_type))], refinements: { contentTypes, facets, ranges, engine: "v2", latencyMs: Math.round(performance.now() - startedAt) }, correlation_id: crypto.randomUUID() }).then(({ error }) => {
        if (error) console.error(JSON.stringify({ event: "cms.search.analytics.failed" }));
      });
      EdgeRuntime.waitUntil(analytics);
    }
    return json({ items: items.map((item: any) => presentPublicRow(item, publicEndpoint)), total: Number(matches?.[0]?.total_count ?? 0), facets: availableFacets, groups, query, engine: "v2" }, 200, { "Cache-Control": "private, no-store", "Server-Timing": `search;dur=${Math.round(performance.now() - startedAt)}` });
  }
  if (type === "redirect") {
    const path = url.searchParams.get("path") ?? "";
    if (!publicPathPattern.test(path) || path.length > 300) return json({ error: "Não encontrado." }, 404);
    const { data: routeRule, error: routeError } = await client.from("cms_route_rules").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    if (routeError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (routeRule) return json(presentRouteRule(routeRule), 200, { "Cache-Control": PUBLIC_REVALIDATE });
    const { data, error: legacyError } = await client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle();
    if (legacyError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    return data ? json(presentRouteRule(data), 200, { "Cache-Control": PUBLIC_REVALIDATE }) : json({ error: "Não encontrado." }, 404);
  }
  const campaignIsActive = (row: any, now = Date.now()) => {
    const window = row.payload?.window ?? row.window;
    return row.content_type === "campaign" && Date.parse(window?.startsAt ?? "") <= now && Date.parse(window?.endsAt ?? "") > now;
  };
  const relationIdsFor = (row: any) => {
    // Expand/contract safety: reject legacy rows before sanitization too. This
    // keeps a temporarily out-of-order Edge deployment from hiding an invalid
    // or oversized stored graph through field-visibility filtering.
    publicRelationIds(row.payload);
    const publicPayload = sanitizePublicPayload(row.payload);
    return publicRelationIds(publicPayload);
  };
  const loadProjectionRowsByIds = async (
    ids: string[],
    maximum = PUBLIC_RELATION_LIMIT,
  ) => {
    if (ids.some((id) => typeof id !== "string" || !uuidPattern.test(id)))
      return { data: null, error: new Error("CMS_PUBLIC_RELATION_INVALID") };
    const uniqueIds = [...new Set(ids.map((id) => id.toLowerCase()))];
    if (uniqueIds.length > maximum)
      return { data: null, error: new Error("CMS_PUBLIC_RELATION_LIMIT_EXCEEDED") };
    const rows: any[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += RELATED_QUERY_CHUNK) {
      const chunk = uniqueIds.slice(offset, offset + RELATED_QUERY_CHUNK);
      const { data, error } = await client
        .from("cms_published_projection")
        .select(PUBLISHED_PROJECTION_COLUMNS)
        .in("item_id", chunk)
        .in("content_type", searchableTypes)
        .limit(RELATED_QUERY_CHUNK);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
    }
    return { data: rows, error: null };
  };
  const summarizeRelated = (row: any) => {
    const payload = sanitizePublicPayload(row.payload);
    return presentRelatedRow({ ...row, payload, path: routeFor(row) });
  };
  const relatedPathsFor = (rows: any[]) =>
    new Map<string, string>(
      rows.flatMap((row) => {
        const path = routeFor(row);
        return typeof row.item_id === "string" && uuidPattern.test(row.item_id) && publicPathPattern.test(path)
          ? [[row.item_id.toLowerCase(), path] as const]
          : [];
      }),
    );
  const resolveRelated = async (row: any) => {
    const { data, error } = await loadProjectionRowsByIds(relationIdsFor(row));
    if (error) throw error;
    return (data ?? []).map(summarizeRelated);
  };
  const formatForm = (form: any, version: any) => ({
    schemaVersion: 1, formId: form.id, versionId: version.id, version: version.version,
    key: form.form_key, title: form.title, purpose: form.purpose,
    fields: version.definition?.fields ?? [],
    consent: { required: true, text: version.consent_text, version: version.consent_version, privacyPath: version.privacy_path },
    slaMinutes: version.sla_minutes, retentionDays: version.retention_days,
    successMessage: version.definition?.successMessage ?? "Recebemos sua solicitação.",
    submitLabel: version.definition?.submitLabel ?? "Enviar", status: "published",
  });
  const loadPublishedForm = async (filters: { key?: string; formId?: string; versionId?: string; version?: number }) => {
    if (!service) return { data: null, error: new Error("CMS_FORM_SERVICE_UNAVAILABLE") };
    const { data: record, error } = await client.rpc("cms_public_form_scoped", {
      p_environment: environment,
      p_form_key: filters.key ?? null,
      p_form_id: filters.formId ?? null,
      p_version_id: filters.versionId ?? null,
    });
    if (error) return { data: null, error };
    if (
      !record ||
      (filters.key !== undefined && record.form_key !== filters.key) ||
      (filters.formId !== undefined &&
        (typeof record.id !== "string" || record.id.toLowerCase() !== filters.formId.toLowerCase())) ||
      (filters.versionId !== undefined &&
        (typeof record.version_id !== "string" ||
          record.version_id.toLowerCase() !== filters.versionId.toLowerCase())) ||
      (filters.version !== undefined && record.version !== filters.version)
    )
      return { data: null, error: null };
    return {
      data: formatForm(
        {
          id: record.id,
          form_key: record.form_key,
          title: record.title,
          purpose: record.purpose,
        },
        {
          id: record.version_id,
          version: record.version,
          definition: record.definition,
          consent_text: record.consent_text,
          consent_version: record.consent_version,
          privacy_path: record.privacy_path,
          sla_minutes: record.sla_minutes,
          retention_days: record.retention_days,
        },
      ),
      error: null,
    };
  };
  const resolveGovernedFormBindings = async (
    row: any,
    cachedForms: ReadonlyMap<string, any | null> = new Map(),
  ) =>
    resolveGovernedPublicFormBindings(row.payload, cachedForms, ({ formId, versionId }) =>
      loadPublishedForm({ formId, versionId }),
    );
  if (type === "site-shell") {
    const shellTypes = ["navigation", "site_settings", "placement"];
    const shellResults = await Promise.all(
      shellTypes.map((contentType) =>
        client
          .from("cms_published_projection")
          .select(PUBLISHED_PROJECTION_COLUMNS)
          .eq("content_type", contentType)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    );
    if (shellResults.some(({ error }) => error))
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const shellRows = new Map(shellTypes.map((contentType, index) => [contentType, shellResults[index].data]));
    const latest = (contentType: string) => {
      const payload = shellRows.get(contentType)?.payload;
      return payload ? sanitizePublicPayload(payload) : null;
    };
    const placements = latest("placement");
    const { data: placementTargets, error: targetError } = await loadProjectionRowsByIds(
      (placements?.placements ?? []).map((item: any) => item.targetId),
    );
    if (targetError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const targetById = new Map((placementTargets ?? []).map((row: any) => [row.item_id, row]));
    const now = Date.now();
    const activePlacements = (placements?.placements ?? [])
      .filter((item: any) => item.enabled && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now)
      .sort((a: any,b: any) => b.priority-a.priority)
      .flatMap((item: any) => {
        const target = targetById.get(item.targetId);
        if (!target) return [];
        const targetPayload = sanitizePublicPayload(target.payload);
        return [{ ...item, target: { itemId: target.item_id, contentType: target.content_type, title: targetPayload.title ?? target.slug, summary: targetPayload.summary, path: routeFor(target) } }];
      });
    return json({
      navigation: presentNavigation(latest("navigation")),
      settings: presentSiteSettings(latest("site_settings")),
      placements: placements
        ? {
            title: placements.title,
            placements: activePlacements.map((item: any) => ({
              slot: item.slot,
              ...(typeof item.label === "string" ? { label: item.label } : {}),
              priority: item.priority,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              target: {
                kind: item.target.contentType,
                title: item.target.title,
                ...(typeof item.target.summary === "string" ? { summary: item.target.summary } : {}),
                path: item.target.path,
              },
            })),
          }
        : null,
    }, 200, { "Cache-Control": PUBLIC_REVALIDATE });
  }
  if (type === "page-by-path") {
    const path = url.searchParams.get("path") ?? "";
    if (!publicPathPattern.test(path) || path.length > 300) return json({ error: "Não encontrado." }, 404);
    // Resolving a public path asked the projection, the managed rules and the legacy redirects in
    // three sequential round trips, so the negative answer that every static public route receives
    // paid all three. The lookups are independent, so they are issued together and the same
    // precedence and fail-closed handling are applied to the settled results.
    const [pageResult, managedRuleResult, legacyRuleResult] = await Promise.all([
      client
        .from("cms_published_projection")
        .select(PUBLISHED_PROJECTION_COLUMNS)
        .in("content_type", ["page", "homepage"])
        .eq("payload->route->>path", path)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from("cms_route_rules").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle(),
      client.from("cms_redirects").select("destination_path,status_code").eq("source_path", path).eq("active", true).maybeSingle(),
    ]);
    const { data: row, error: pageError } = pageResult;
    if (pageError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (!row) {
      const { data: managedRule, error: managedRuleError } = managedRuleResult;
      if (managedRuleError)
        return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      if (managedRule) return json({ kind: "route", rule: presentRouteRule(managedRule) }, 200, { "Cache-Control": PUBLIC_REVALIDATE });
      const { data: legacyRule, error: legacyRuleError } = legacyRuleResult;
      if (legacyRuleError)
        return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      return legacyRule ? json({ kind: "route", rule: presentRouteRule(legacyRule) }, 200, { "Cache-Control": PUBLIC_REVALIDATE }) : json({ kind: "fallback" }, 200, { "Cache-Control": PUBLIC_REVALIDATE });
    }
    // Media, related items and form bindings all derive from the row that was already read, so the
    // managed page paid three sequential round trips for work that has no ordering between its parts.
    // They are resolved together and the same precedence and fail-closed handling are kept below.
    const [page, relatedResult, formBindings] = await Promise.all([
      enrichMedia(row),
      loadProjectionRowsByIds(relationIdsFor(row)),
      resolveGovernedFormBindings(row),
    ]);
    if (!page) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "no-store" });
    const { data: relatedRows, error: relatedError } = relatedResult;
    if (relatedError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const relatedItems = (relatedRows ?? []).map(summarizeRelated);
    if (formBindings.error)
      return json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    return json({
      kind: "page",
      page: {
        ...presentPublicRow(page, publicEndpoint, {
          formBindings: formBindings.data,
          relatedPaths: relatedPathsFor(relatedRows ?? []),
        }),
        relatedItems,
      },
    }, 200, { "Cache-Control": "private, no-store" });
  }
  if (type === "posts") {
    const limit = boundedInteger(url.searchParams.get("limit"), COLLECTION_DEFAULT_LIMIT, 1, COLLECTION_MAX_LIMIT);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10_000);
    const { data: postRows, error: postsError, count } = await client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS, { count: "exact" })
      .eq("content_type", "post")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (postsError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const items = (await enrichMediaRows(postRows ?? [], "card")).map((row: any) =>
      presentPublicRow(row, publicEndpoint)
    );
    return json({ items, total: count ?? items.length, limit, offset }, 200, { "Cache-Control": "private, no-store" });
  }
  if (type === "post-detail") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!slugPattern.test(slug)) return json({ error: "Não encontrado." }, 404);
    const { data: row, error: postError } = await client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS)
      .eq("content_type", "post")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (postError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": PUBLIC_REVALIDATE });
    try {
      const post = await enrichMedia(row);
      if (!post) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "no-store" });
      const relatedItems = await resolveRelated(row);
      return json({ ...presentPublicRow(post, publicEndpoint), relatedItems }, 200, { "Cache-Control": "private, no-store" });
    } catch {
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    }
  }
  if (type === "form") {
    const key = url.searchParams.get("key") ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return json({ error: "Não encontrado." }, 404);
    const requestedVersion = url.searchParams.get("version");
    const version = requestedVersion === null ? undefined : Number(requestedVersion);
    if (version !== undefined && (!Number.isInteger(version) || version < 1))
      return json({ error: "Não encontrado." }, 404, { "Cache-Control": PUBLIC_REVALIDATE });
    if (!service) return json({ error: "Serviço indisponível." }, 503, { "Cache-Control": "no-store" });
    const formResult = await loadPublishedForm({ key, ...(version === undefined ? {} : { version }) });
    if (formResult.error)
      return json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (!formResult.data)
      return new Response(null, { status: 204, headers: { ...headers, "Cache-Control": PUBLIC_REVALIDATE } });
    const publicForm = presentPublicForm(formResult.data);
    return publicForm
      ? json(publicForm, 200, { "Cache-Control": PUBLIC_REVALIDATE })
      : json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  }
  if (type === "campaign-by-path") {
    const path = url.searchParams.get("path") ?? "";
    if (!/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return json({ error: "Não encontrado." }, 404);
    const campaignSlug = path.slice("/campanhas/".length);
    const { data: row, error: campaignError } = await client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS)
      .eq("content_type", "campaign")
      .eq("slug", campaignSlug)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (campaignError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (!row) {
      const { data: routeRule, error: routeRuleError } = await client.from("cms_route_rules")
        .select("destination_path,status_code").eq("source_path",path).eq("active",true).maybeSingle();
      if (routeRuleError)
        return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      return routeRule
        ? json({kind:"route",rule:presentRouteRule(routeRule)},200,{"Cache-Control":PUBLIC_REVALIDATE})
        : json({kind:"fallback"},200,{"Cache-Control":PUBLIC_REVALIDATE});
    }
    if (!campaignIsActive(row)) {
      const mode=row.payload?.expiry?.mode;
      if(mode==="redirect") return json({kind:"route",rule:{destinationPath:row.payload.expiry.destinationPath,status:301}},200,{"Cache-Control":PUBLIC_REVALIDATE});
      if(mode==="fallback" && uuidPattern.test(row.payload?.expiry?.fallbackCampaignId ?? "")) {
        const { data: fallback, error: fallbackError } = await client
          .from("cms_published_projection")
          .select(PUBLISHED_PROJECTION_COLUMNS)
          .eq("content_type", "campaign")
          .eq("item_id", row.payload.expiry.fallbackCampaignId)
          .limit(1)
          .maybeSingle();
        if (fallbackError)
          return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
        if(fallback && campaignIsActive(fallback)) return json({kind:"route",rule:{destinationPath:routeFor(fallback),status:302}},200,{"Cache-Control":PUBLIC_REVALIDATE});
      }
      return json({kind:"route",rule:{destinationPath:null,status:mode==="gone"?410:404}},200,{"Cache-Control":PUBLIC_REVALIDATE});
    }
    try {
      const campaign = await enrichMedia(row);
      if (!campaign) return json({ error: "Não encontrado." }, 404, { "Cache-Control": "no-store" });
      const formResult = row.payload?.form?.versionId
        ? await loadPublishedForm({ formId: row.payload.form.formId, versionId: row.payload.form.versionId })
        : { data: null, error: null };
      if (formResult.error)
        return json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      const publicForm = formResult.data ? presentPublicForm(formResult.data) : undefined;
      if (formResult.data && !publicForm)
        return json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      const cachedForms = new Map<string, any | null>();
      if (
        typeof row.payload?.form?.formId === "string" &&
        typeof row.payload?.form?.versionId === "string"
      )
        cachedForms.set(
          governedFormBindingSelector(row.payload.form.formId, row.payload.form.versionId),
          formResult.data,
        );
      const formBindings = await resolveGovernedFormBindings(row, cachedForms);
      if (formBindings.error)
        return json({ error: "Formulário temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      const { data: relatedRows, error: relatedError } = await loadProjectionRowsByIds(relationIdsFor(row));
      if (relatedError)
        return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      return json({
        ...presentPublicRow(campaign, publicEndpoint, {
          formBindings: formBindings.data,
          relatedPaths: relatedPathsFor(relatedRows ?? []),
        }),
        ...(publicForm ? { form: publicForm } : {}),
        relatedItems: (relatedRows ?? []).map(summarizeRelated),
      },200,{"Cache-Control":"private, no-store"});
    } catch {
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    }
  }
  if (type === "campaign-placements") {
    const contextPath=url.searchParams.get("contextPath")??"/";
    if (!publicPathPattern.test(contextPath) || contextPath.length > 300)
      return json({ error: "Não encontrado." }, 404);
    let contextType = "global", contextId: string | undefined;
    if (contextPath !== "/") {
      const prefixed = contextPath.match(/^\/(produtos|servicos|industrias|aplicacoes|solucoes|blog)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
      const typeByPrefix: Record<string, string> = { produtos: "product", servicos: "service", industrias: "industry", aplicacoes: "application", solucoes: "solution", blog: "post" };
      const contextQuery = prefixed
        ? client
            .from("cms_published_projection")
            .select("item_id,content_type")
            .eq("content_type", typeByPrefix[prefixed[1]])
            .eq("slug", prefixed[2])
        : client
            .from("cms_published_projection")
            .select("item_id,content_type")
            .in("content_type", ["page", "homepage"])
            .eq("payload->route->>path", contextPath);
      const { data: contextRow, error: contextError } = await contextQuery.limit(1).maybeSingle();
      if (contextError)
        return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
      contextType = contextRow?.content_type ?? "page";
      contextId = contextRow?.item_id;
    }
    const now=Date.now(), nowIso=new Date(now).toISOString();
    const { data: campaignRows, error: placementsError } = await client
      .from("cms_published_projection")
      .select(CAMPAIGN_PLACEMENT_COLUMNS)
      .eq("content_type", "campaign")
      .lte("payload->window->>startsAt", nowIso)
      .gt("payload->window->>endsAt", nowIso)
      .order("published_at", { ascending: false })
      .limit(CAMPAIGN_SCAN_LIMIT);
    if (placementsError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const candidates=(campaignRows ?? []).filter((row:any)=>campaignIsActive(row,now)).flatMap((row:any)=>(row.placements??[]).filter((placement:any)=>placement.contextType===contextType&&(contextType==="global"||placement.contextId===contextId)).map((placement:any)=>({ slot:placement.slot,priority:placement.priority,campaign:{title:row.title,summary:row.summary,path:routeFor(row)},startsAt:row.window.startsAt,endsAt:row.window.endsAt }))).sort((a:any,b:any)=>b.priority-a.priority).slice(0, COLLECTION_MAX_LIMIT);
    return json({items:candidates},200,{"Cache-Control":PUBLIC_REVALIDATE});
  }
  if (type === "sitemap") {
    const origin = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://gaiatecsistemas.com.br";
    const requestedTypes = (url.searchParams.get("contentTypes") ?? "")
      .split(",")
      .filter((contentType) => publicTypes.includes(contentType));
    const sitemapTypes = (requestedTypes.length ? requestedTypes : publicTypes).filter(
      (contentType) => !["navigation", "site_settings", "placement"].includes(contentType),
    );
    const { data: sitemapRows, error: sitemapError, count: sitemapCount } = await client
      .from("cms_published_projection")
      .select(SITEMAP_COLUMNS, { count: "exact" })
      .in("content_type", sitemapTypes)
      .eq("seo->>indexable", true)
      .order("published_at", { ascending: false })
      .limit(SITEMAP_LIMIT);
    if (sitemapError || (sitemapCount ?? 0) > SITEMAP_LIMIT)
      return json({ error: "Sitemap temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    const sitemap = buildPublicSitemapXml(
      (sitemapRows ?? []).filter((row:any) => row.content_type!=="campaign"||campaignIsActive(row)),
      origin,
    );
    if (!sitemap)
      return json({ error: "Sitemap temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    return new Response(sitemap, {
      headers: {
        ...headers,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": PUBLIC_REVALIDATE,
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (type === "detail" || type === "entity-detail") {
    const slug = url.searchParams.get("slug") ?? "", domain = url.searchParams.get("contentType") ?? "product";
    if (!slugPattern.test(slug) || !searchableTypes.includes(domain)) return json({ error: "Não encontrado." }, 404);
    const { data: row, error: detailError } = await client
      .from("cms_published_projection")
      .select(PUBLISHED_PROJECTION_COLUMNS)
      .eq("content_type", domain)
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (detailError)
      return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
    if (!row) return json({ error: "Não encontrado." }, 404, { "Cache-Control": PUBLIC_REVALIDATE });
    const detail = await enrichMedia(row);
    return detail
      ? json({ ...presentPublicRow(detail, publicEndpoint), relatedItems: await resolveRelated(row) }, 200, { "Cache-Control": "private, no-store" })
      : json({ error: "Não encontrado." }, 404, { "Cache-Control": "no-store" });
  }
  if (!["products", "collection", "search", "autocomplete"].includes(type))
    return json({ error: "Não encontrado." }, 404);
  const requestedValue = url.searchParams.get("slugs") ?? "";
  if (requestedValue.length > 5000) return json({ error: "Consulta inválida." }, 400);
  const requestedParts = requestedValue.split(",").filter(Boolean);
  if (requestedParts.length > 50 || requestedParts.some((value) => !slugPattern.test(value)))
    return json({ error: "Consulta inválida." }, 400);
  const requested = [...new Set(requestedParts)];
  const rawQuery = (url.searchParams.get("q") ?? "").trim().slice(0, 300);
  const query = normalize(rawQuery);
  const domain = url.searchParams.get("contentType") ?? (type === "products" ? "product" : null);
  if (domain && !searchableTypes.includes(domain)) return json({ error: "Não encontrado." }, 404);
  const hasFacetFilter = publicFilterKeys.some((key) => url.searchParams.has(key));
  const limit = type === "autocomplete"
    ? 8
    : boundedInteger(url.searchParams.get("limit"), COLLECTION_DEFAULT_LIMIT, 1, COLLECTION_MAX_LIMIT);
  const offset = type === "autocomplete"
    ? 0
    : boundedInteger(
        url.searchParams.get("offset"),
        0,
        0,
        query || requested.length || hasFacetFilter ? SEARCH_SCAN_LIMIT - 1 : 10_000,
      );
  let projectionQuery = client
    .from("cms_published_projection")
    .select(PUBLISHED_PROJECTION_COLUMNS, { count: "exact" });
  projectionQuery = domain
    ? projectionQuery.eq("content_type", domain)
    : projectionQuery.in("content_type", searchableTypes);
  if (requested.length) {
    projectionQuery = projectionQuery.in("slug", requested);
  }
  const requiresBoundedScan = Boolean(query || requested.length || hasFacetFilter);
  const scanLimit = requiresBoundedScan ? SEARCH_SCAN_LIMIT : limit;
  const scanOffset = requiresBoundedScan ? 0 : offset;
  const { data: publishedRows, error: collectionError, count: collectionCount } = await projectionQuery
    .order("published_at", { ascending: false })
    .order("item_id", { ascending: true })
    .range(scanOffset, scanOffset + scanLimit - 1);
  if (collectionError)
    return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  const published = publishedRows ?? [];
  const filters = {
    productCategory: url.searchParams.get("productCategory") ?? url.searchParams.get("segment"),
    applicationMagnitude: url.searchParams.get("applicationMagnitude") ?? url.searchParams.get("category"),
    technology: url.searchParams.get("technology"),
    installationOperation: url.searchParams.get("installationOperation"),
    monitoredElement: url.searchParams.get("monitoredElement"),
  };
  const { data: synonymRows, error: synonymError } = query
    ? await client
        .from("cms_search_synonyms")
        .select("canonical_term,aliases,scope")
        .eq("active", true)
        .order("canonical_term", { ascending: true })
        .limit(SYNONYM_LIMIT)
    : { data: [], error: null };
  if (synonymError)
    return json({ error: "Busca temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  const expanded = new Set(query.split(" ").filter(Boolean));
  for (const synonym of synonymRows ?? []) { const aliases = (synonym.aliases ?? []).map(normalize), canonical = normalize(synonym.canonical_term); if (aliases.some((alias: string) => query.includes(alias)) || query.includes(canonical)) { expanded.add(canonical); aliases.forEach((alias: string) => expanded.add(alias)); } }
  const scored = published.filter((row) => searchableTypes.includes(row.content_type)).map((row) => {
    const p = sanitizePublicPayload(row.payload, { includeSearchMetadata: true });
    if (p.contentType !== row.content_type || typeof p.title !== "string" || !p.title.trim()) return null;
    if (domain && row.content_type !== domain) return null;
    if (requested.length && !requested.includes(row.slug)) return null;
    const controlled=p.controlledClassification??{};
    if (filters.productCategory && controlled.productCategory?.label !== filters.productCategory ||
      filters.applicationMagnitude && controlled.applicationMagnitude?.label !== filters.applicationMagnitude ||
      filters.technology && controlled.technology?.label !== filters.technology ||
      filters.installationOperation && controlled.installationOperation?.label !== filters.installationOperation ||
      filters.monitoredElement && controlled.monitoredElement?.label !== filters.monitoredElement) return null;
    const exact = normalize(flattenPublicSearchValues([p.title,p.brand?.name,p.models?.map((m:any)=>[m.model,m.manufacturerReference,m.sku,m.variants?.map((variant:any)=>[variant.name,variant.code,variant.sku])])]).join(" "));
    const searchable = normalize(flattenPublicSearchValues([p.title,p.summary,p.commercial?.shortDescription,p.brand?.name,p.manufacturer?.name,p.productLine?.name,p.models?.map((m:any)=>[m.model,m.manufacturerReference,m.sku,m.variants?.map((variant:any)=>[variant.name,variant.code,variant.sku])]),p.classification,p.controlledClassification,p.function,p.technology,p.serviceKind,p.serviceKindRef,p.marketName,p.process,p.problem,p.approach,p.benefits,p.deliverables,p.challenges,p.points,p.components,publicBlockSearchValues(p.blocks),p.route?.navigationLabel,p.route?.breadcrumbLabel,p.search?.synonyms,p.search?.keywords,p.specifications]).join(" "));
    if (query && !query.split(" ").every((token) => searchable.includes(token) || [...expanded].some((term) => searchable.includes(term)))) return null;
    const score = !query ? 0 : exact.includes(query) ? 100 : [...expanded].reduce((sum,term)=>sum+(exact.includes(term)?20:searchable.includes(term)?5:0),0);
    return { row: { ...row, payload: p }, score, matchedBy: exact.includes(query) ? "nome ou modelo público" : "conteúdo técnico ou sinônimo" };
  }).filter(Boolean).sort((a:any,b:any)=>comparePublicCollectionEntries(a,b,Boolean(query)));
  const resultOffset = requiresBoundedScan ? offset : 0;
  const selected = scored.slice(resultOffset,resultOffset+limit) as any[];
  const selectedById = new Map(selected.map((entry) => [entry.row.item_id, entry]));
  const enriched = (await enrichMediaRows(selected.map((entry) => entry.row), "card")).flatMap((row) => {
    const selectedEntry = selectedById.get(row.item_id);
    return selectedEntry
      ? [{ ...row, score: selectedEntry.score, matched_by: selectedEntry.matchedBy }]
      : [];
  });
  if ((type === "search" || type === "autocomplete") && query && service) await client.from("cms_search_events").insert({ normalized_query:query,result_count:enriched.length,content_types:[...new Set(enriched.map((row)=>row.content_type))],refinements:{domain:domain??null},correlation_id:crypto.randomUUID() });
  const productRows = selected.filter((entry)=>entry.row.content_type === "product").map((entry)=>entry.row);
  const facetKeys=["productCategory","applicationMagnitude","technology","installationOperation","monitoredElement"];
  const facets=facetKeys.reduce((all,key)=>{all[key]=[...new Set(productRows.map((row)=>row.payload?.controlledClassification?.[key]?.label).filter(Boolean))].sort();return all;},{} as Record<string,unknown[]>);
  const groups = searchableTypes.reduce((all,key)=>{all[key]=enriched.filter((row)=>row.content_type===key).length;return all;},{} as Record<string,number>);
  const total = requiresBoundedScan ? scored.length : collectionCount ?? enriched.length;
  const truncated = requiresBoundedScan && (collectionCount ?? 0) > SEARCH_SCAN_LIMIT;
  return json({items:enriched.map((row)=>presentPublicRow(row,publicEndpoint)),total,limit,offset,truncated,facets,groups,query:rawQuery},200,{"Cache-Control":"private, no-store"});
};

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch {
    return json({ error: "Conteúdo temporariamente indisponível." }, 503, { "Cache-Control": "no-store" });
  }
});
