import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const publicApi = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const publicRelations = readFileSync("supabase/functions/_shared/cms-public-relations.ts", "utf8");
const publicAssetBatch = readFileSync("supabase/functions/_shared/cms-public-asset-batch.ts", "utf8");
const publicFormBindings = readFileSync("supabase/functions/_shared/cms-public-form-bindings.ts", "utf8");
const mediaResolution = readFileSync("supabase/functions/_shared/cms-media-resolution.ts", "utf8");
const documentResolution = readFileSync("supabase/functions/_shared/cms-document-resolution.ts", "utf8");

describe("cms-public bounded query contract", () => {
  it("never loads the complete published projection for a public request", () => {
    expect(publicApi).not.toContain("loadPublishedProjection");
    expect(publicApi).toContain("const SEARCH_SCAN_LIMIT = 500;");
    expect(publicRelations).toContain("PUBLIC_RELATION_LIMIT = 500;");
    expect(publicApi).toContain("uniqueIds.length > maximum");
    expect(publicApi).toContain("const RELATED_QUERY_CHUNK = 100;");
    expect(publicApi).toContain("const CAMPAIGN_SCAN_LIMIT = 200;");
    expect(publicApi).toContain("const SITEMAP_LIMIT = 5000;");
    expect(publicApi).toContain("const SYNONYM_LIMIT = 500;");
    expect(publicApi).toContain(".range(scanOffset, scanOffset + scanLimit - 1)");
  });

  it("uses selective server-side queries for detail, page, form and shell endpoints", () => {
    expect(publicApi).toContain('.eq("content_type", domain)');
    expect(publicApi).toContain('.eq("slug", slug)');
    expect(publicApi).toContain('.eq("payload->route->>path", path)');
    expect(publicApi).toContain('const shellTypes = ["navigation", "site_settings", "placement"];');
    expect(publicApi).toContain('.eq("content_type", contentType)');
    expect(publicApi).toContain(".limit(1)");

    const formStart = publicApi.indexOf('if (type === "form")');
    const formEnd = publicApi.indexOf('if (type === "campaign-by-path")');
    const formHandler = publicApi.slice(formStart, formEnd);
    expect(formStart).toBeGreaterThan(0);
    expect(publicApi).toContain('client.rpc("cms_public_form_scoped"');
    expect(publicApi).not.toContain('client.from("cms_form_definitions")');
    expect(publicApi).not.toContain('client.from("cms_form_versions")');
    expect(formHandler).toContain("loadPublishedForm");
    expect(formHandler).not.toContain('client.from("cms_published_projection")');
  });

  it("rate limits only expensive anonymous search surfaces before their bounded scan", () => {
    const rateLimitStart = publicApi.indexOf("if (expensivePublicSearch)");
    const collectionScanStart = publicApi.indexOf("let projectionQuery = client");
    expect(rateLimitStart).toBeGreaterThan(0);
    expect(rateLimitStart).toBeLessThan(collectionScanStart);
    expect(publicApi).toContain('["products", "collection"].includes(type)');
    expect(publicApi).toContain('Boolean(url.searchParams.get("q")?.trim())');
    expect(publicApi).toContain("publicFilterKeys.some");
    expect(publicApi).toContain('"cms_public_search"');
    expect(publicApi).toContain("clientAddress(req)");
    expect(publicApi).toContain('"Retry-After": "60"');
    expect(publicApi).toContain(
      'if (!service) return json({ error: "Busca temporariamente indisponível." }, 503',
    );
    expect(publicApi).not.toMatch(
      /if \(type === "(?:detail|entity-detail|page-by-path|site-shell|form)"\)[\s\S]{0,160}consumeRateLimit/,
    );
  });

  it("caps caller-controlled pagination and identifier fan-out", () => {
    expect(publicApi).toContain("requestedParts.length > 50");
    expect(publicApi).toContain('boundedInteger(url.searchParams.get("limit")');
    expect(publicApi).toContain('boundedInteger(url.searchParams.get("offset")');
    expect(publicApi).toContain("Math.min(Math.max(parsed, minimum), maximum)");
    expect(publicApi).toContain("uniqueIds.length > maximum");
    expect(publicApi).toContain('new Error("CMS_PUBLIC_RELATION_LIMIT_EXCEEDED")');
    const postsHandler = publicApi.slice(
      publicApi.indexOf('if (type === "posts")'),
      publicApi.indexOf('if (type === "post-detail")'),
    );
    expect(postsHandler).toContain('enrichMediaRows(postRows ?? [], "card")');
    expect(postsHandler).not.toContain("loadProjectionRowsByIds");
    expect(postsHandler).not.toContain("relationIdsFor");
    expect(publicApi).not.toContain(".slice(0, RELATED_ITEMS_LIMIT)");
    expect(publicApi).toContain(".slice(0, COLLECTION_MAX_LIMIT)");
    expect(publicApi).toContain(".limit(SYNONYM_LIMIT)");
  });

  it("caps distinct governed forms and resolves them with bounded parallelism", () => {
    expect(publicFormBindings).toContain("PUBLIC_FORM_BINDING_LIMIT = 80");
    expect(publicFormBindings).toContain("PUBLIC_FORM_BINDING_CONCURRENCY = 4");
    expect(publicFormBindings).toContain("CMS_PUBLIC_FORM_BINDING_LIMIT_EXCEEDED");
    expect(publicFormBindings).toContain(
      "mapWithConcurrency(missing, PUBLIC_FORM_BINDING_CONCURRENCY, load)",
    );
    expect(publicApi).toContain("resolveGovernedPublicFormBindings(row.payload, cachedForms");
  });

  it("batches asset resolution once for filtered and unfiltered collection pages", () => {
    const mediaHandler = publicApi.slice(
      publicApi.indexOf('if (type === "media")'),
      publicApi.indexOf('if (type === "document")'),
    );
    const batchHandler = publicApi.slice(
      publicApi.indexOf("const enrichMediaRows = async"),
      publicApi.indexOf("const enrichMedia = async"),
    );
    expect(mediaHandler.match(/resolveMediaAssets\(/g)).toHaveLength(1);
    expect(mediaHandler).toContain("maxAssets: 1");
    expect(mediaHandler).toContain("maxVariants: 20");
    expect(batchHandler.match(/resolveMediaAssets\(/g)).toHaveLength(1);
    expect(publicApi.match(/resolveDocumentAssets\(/g)).toHaveLength(1);
    expect(publicApi).toContain(
      'const enrichMediaRows = async (rows: any[], mode: "detail" | "card" = "detail") =>',
    );
    expect(publicApi).toContain('await enrichMediaRows(postRows ?? [], "card")');
    expect(publicApi).toContain('await enrichMediaRows(selected.map((entry) => entry.row), "card")');
    expect(publicApi).toContain('await enrichMediaRows(sourceRows ?? [], "card")');
    expect(batchHandler).toContain('mode: "detail" | "card" = "detail"');
    expect(batchHandler).toContain('mode === "card" ? (primaryId ? [primaryId] : []) : allAssetIds');
    expect(batchHandler).toContain('mode === "detail" ? row.payload?.documents ?? [] : []');
    expect(publicApi).not.toContain("selected.map(async");
    expect(publicApi).not.toContain("(postRows ?? []).map(async");
  });

  it("enforces response-wide reference and signed-variant ceilings before resolution", () => {
    expect(publicAssetBatch).toContain("PUBLIC_MEDIA_REFERENCE_LIMIT = 2_431");
    expect(publicAssetBatch).toContain("PUBLIC_MEDIA_RESOLUTION_CHUNK_LIMIT = 300");
    expect(publicAssetBatch).toContain("PUBLIC_DOCUMENT_REFERENCE_LIMIT = 200");
    expect(publicAssetBatch).toContain("PUBLIC_MEDIA_VARIANT_LIMIT = 2_000");
    expect(publicAssetBatch).toContain('throw new Error("CMS_PUBLIC_MEDIA_REFERENCE_LIMIT_EXCEEDED")');
    expect(publicAssetBatch).toContain('throw new Error("CMS_PUBLIC_DOCUMENT_REFERENCE_LIMIT_EXCEEDED")');
    expect(publicAssetBatch.indexOf("assetIds.length > PUBLIC_MEDIA_REFERENCE_LIMIT")).toBeLessThan(
      publicAssetBatch.indexOf("const chunks: AssetResolutionChunk[]"),
    );
    expect(mediaResolution).toContain(".limit(maxVariants + 1)");
    expect(mediaResolution).toContain('throw new Error("CMS_MEDIA_VARIANT_LIMIT_EXCEEDED")');
    expect(documentResolution).toContain(".limit(maxDocuments + 1)");
    expect(documentResolution).toContain('throw new Error("CMS_DOCUMENT_RESULT_LIMIT_EXCEEDED")');
  });
});
